/**
 * SPEC-FINAL §10.5 (fb064a): per-run terrain generation.
 *
 * Shape of an attempt:
 *   1. border → rock, gate tiles → normal, interior → normal;
 *   2. *protect* a 2r+1-wide main from every gate to the centre plaza. Nothing
 *      may scatter onto a protected tile, which is what makes "gates never
 *      enclosed", "gates all connect", and "no sub-2-tile forced corridor on a
 *      gate main" structural rather than lucky;
 *   3. scatter rock/rough/high as organic blobs (random-walk growth) over the
 *      unprotected interior, to a per-seed budget drawn around each authored
 *      density (fb064l — the density is the centre of a band, not a quota, so
 *      two seeds differ in how much rock they carry and not only in where it
 *      sits);
 *   4. repair: any walkable tile the gates cannot reach becomes rock, so a
 *      sealed pocket can never be mistaken for playable ground, and any `high`
 *      tile with no walkable tile inside `highContestRadius` becomes rock too
 *      (fb064m — building is a click rather than a walk, so a stranded high
 *      plot is a buildable tower site no wave can ever damage);
 *   5. measure against every authored band. A failing attempt is *degenerate*
 *      and the whole generation re-runs at `seed + 1` — deterministic, never
 *      a partially-patched illegal map.
 *
 * After `maxAttempts` degenerate seeds the flat interior ships with
 * `fallback: true`, so a hostile `/data` edit downgrades the map instead of
 * throwing mid-run. The flat map is the most permissive layout the arena
 * admits — it clears every band the authored `/data` can reach — but it is not
 * legal *unconditionally*: the border is 105 permanently non-walkable tiles of
 * 720, so a band above ~0.854 walkable is unsatisfiable by any map at all.
 * `fallback: true` *with `attempts >= 1`* is the caller's signal that the
 * bands, not the seed, are what failed. `flatTerrain()` below sets the same
 * flag with `attempts: 0` and nothing failed at all, so read the pair rather
 * than the flag — `isDegradedMap` does.
 */
import { GATES, GRID_H, GRID_W } from '../grid';
import { Hasher } from '../hash';
import { fnv1a, Rng } from '../rng';
import {
  gateIndices,
  measureTerrain,
  terrainLegal,
  uncontestedHigh,
  walkableFlood,
} from './analyze';
import { loadTerrain, TerrainKind, type TerrainConfig } from './config';
import type { TerrainGrid, TerrainMap } from './types';

const ORTHO: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * The flat arena's tiles: rock border, walkable gate tiles, normal interior.
 *
 * The one builder for a concept this module used to spell out three times
 * (fb064n) — the base every attempt scatters over, the map `generateTerrain`
 * ships when every attempt is degenerate, and now `flatTerrain()`. A fresh
 * buffer every call: a `TerrainMap`'s hash is computed once at construction,
 * so two maps sharing one `kind` would let a write through either invalidate
 * both (`types.ts`, architecture rule 2).
 */
function flatKinds(): Uint8Array {
  const kind = new Uint8Array(GRID_W * GRID_H).fill(TerrainKind.Normal);
  for (let x = 0; x < GRID_W; x++) {
    kind[x] = TerrainKind.Rock;
    kind[(GRID_H - 1) * GRID_W + x] = TerrainKind.Rock;
  }
  for (let y = 0; y < GRID_H; y++) {
    kind[y * GRID_W] = TerrainKind.Rock;
    kind[y * GRID_W + GRID_W - 1] = TerrainKind.Rock;
  }
  for (const g of GATES) kind[g.ty * GRID_W + g.tx] = TerrainKind.Normal;
  return kind;
}

/** One generation attempt at an exact seed. Never fails; may be degenerate. */
function attempt(seed: number, cfg: TerrainConfig): Uint8Array {
  const rng = new Rng(fnv1a('terrain', seed >>> 0));
  const kind = flatKinds();
  const protectedTile = new Uint8Array(GRID_W * GRID_H);

  // Interior only: the border stays rock so the arena never leaks. The bounds
  // are clamped *before* looping rather than tested per tile, so cost is the
  // area actually painted (at most the interior) and never the (2r+1)^2 square
  // the caller asked for. The radii come from `/data` — which fb064f exposes to
  // live Tuner edits — so an unclamped loop would let one authored number spin
  // `/src/sim` for ~1e8 iterations per call. The schema caps the radii too;
  // this is the second line of defence, and the cheap one.
  const paint = (cx: number, cy: number, radius: number): void => {
    const x0 = Math.max(1, cx - radius);
    const x1 = Math.min(GRID_W - 2, cx + radius);
    const y0 = Math.max(1, cy - radius);
    const y1 = Math.min(GRID_H - 2, cy + radius);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * GRID_W + x;
        kind[i] = TerrainKind.Normal;
        protectedTile[i] = 1;
      }
    }
  };

  const midX = (GRID_W / 2) | 0;
  const midY = (GRID_H / 2) | 0;
  paint(midX, midY, cfg.plazaRadius);

  for (const g of GATES) {
    let x = clamp(g.tx, 1, GRID_W - 2);
    let y = clamp(g.ty, 1, GRID_H - 2);
    paint(x, y, Math.max(cfg.corridorRadius, cfg.gateClearRadius));
    for (let step = 0; step < GRID_W * GRID_H && (x !== midX || y !== midY); step++) {
      const dx = Math.sign(midX - x);
      const dy = Math.sign(midY - y);
      if (dx !== 0 && dy !== 0) {
        if (rng.chance(0.5)) x += dx;
        else y += dy;
      } else if (dx !== 0) {
        // A straight run gets an occasional perpendicular kink so mains read
        // as carved ground rather than as a ruler-drawn cross. The kink never
        // moves along the approach axis, so the walk still terminates.
        if (rng.chance(cfg.corridorJitter)) y = clamp(y + (rng.chance(0.5) ? 1 : -1), 1, GRID_H - 2);
        else x += dx;
      } else {
        if (rng.chance(cfg.corridorJitter)) x = clamp(x + (rng.chance(0.5) ? 1 : -1), 1, GRID_W - 2);
        else y += dy;
      }
      paint(x, y, cfg.corridorRadius);
    }
  }

  const free = (x: number, y: number): boolean => {
    if (x < 1 || y < 1 || x >= GRID_W - 1 || y >= GRID_H - 1) return false;
    const i = y * GRID_W + x;
    return protectedTile[i] === 0 && kind[i] === TerrainKind.Normal;
  };

  const interior = (GRID_W - 2) * (GRID_H - 2);
  const scatter = (value: TerrainKind, density: number, budget: number): void => {
    const target = Math.round(density * budget * interior);
    let placed = 0;
    // Bounded retries: a map with no free tiles left must not spin forever.
    for (let tries = 0; tries < target * 20 + 64 && placed < target; tries++) {
      const sx = rng.intRange(1, GRID_W - 2);
      const sy = rng.intRange(1, GRID_H - 2);
      if (!free(sx, sy)) continue;
      const size = rng.intRange(cfg.blob.minSize, cfg.blob.maxSize);
      const frontier: Array<[number, number]> = [[sx, sy]];
      let grown = 0;
      while (frontier.length > 0 && grown < size && placed < target) {
        const pick = rng.int(frontier.length);
        const [x, y] = frontier[pick];
        frontier[pick] = frontier[frontier.length - 1];
        frontier.pop();
        if (!free(x, y)) continue;
        kind[y * GRID_W + x] = value;
        grown++;
        placed++;
        for (const [dx, dy] of ORTHO) {
          if (free(x + dx, y + dy) && rng.chance(cfg.blob.spread)) frontier.push([x + dx, y + dy]);
        }
      }
    }
  };

  // fb064l: each seed gets its own budget per kind, uniform on
  // `1 +- density.jitter`. Without this the scatter targets are a constant of
  // the config rather than of the seed, and they are met exactly whenever
  // there is room — measured over seeds 1..500, every single map carried
  // exactly 43 `high` tiles and 92% carried exactly the authored 104 `rough`.
  // Maps differed in where the obstacles were and not in how many, which is
  // half of the owner's "seeds produce varied legal maps".
  //
  // All three draws happen here, before any placing, so the RNG order does not
  // depend on how much room a kind found — a budget drawn inside `scatter()`
  // would make each kind's stream position a function of the previous kind's
  // luck, and `high`'s map would move whenever `rock`'s blob walk changed
  // length. Same reason the calls below stay in a fixed order.
  //
  // At `jitter: 0` the draws are skipped rather than made and multiplied by
  // zero. Consuming the stream conditionally is worth one sentence of
  // explanation: it makes the field a true no-op, so `jitter: 0` reproduces
  // fb064a's generator tile for tile instead of merely reproducing its
  // *densities* on a shifted stream. That is what let this change be measured
  // against a control (the stranded-Core count in `tests/terrain-grid.test.ts`
  // was read at both settings on otherwise identical config), and it is what
  // fb064f's Tuner needs for "turn the variety off" to mean something. The
  // config is part of the map's provenance either way — it selects the map, and
  // a seed alone was never enough to reproduce one.
  //
  // The cost, stated because it is invisible otherwise: `cfg -> map` is
  // *discontinuous* at 0. `jitter: 0` and `jitter: 1e-9` give completely
  // different arenas for the same seed, since three draws either are or are
  // not in the stream. Determinism is untouched (same cfg + seed, same map),
  // but a Tuner slider nudged off 0 regenerates the world rather than nudging
  // it. Kept anyway: the historical witness it buys — fb064a's goldens still
  // verifiable from this build, in `tests/terrain-seed-domain.test.ts` — is
  // worth more than smoothness on a field whose whole point is 0-or-not.
  const budget = (): number =>
    cfg.density.jitter === 0 ? 1 : 1 + cfg.density.jitter * (rng.float() * 2 - 1);
  const rockBudget = budget();
  const roughBudget = budget();
  const highBudget = budget();

  scatter(TerrainKind.Rock, cfg.density.rock, rockBudget);
  scatter(TerrainKind.Rough, cfg.density.rough, roughBudget);
  scatter(TerrainKind.High, cfg.density.high, highBudget);

  sealPockets(kind, cfg);
  demoteUncontestedHigh(kind, cfg);
  return kind;
}

/**
 * fb064m: any `high` tile no enemy can shoot a tower off becomes rock.
 *
 * `sealPockets` above is the same repair for walkable ground and records the
 * hole it leaves: building is a click rather than a walk, so a high plot walled
 * off from every walker is still *usable* — and, once fb064i's rules deny ground
 * melee the cliff edge, it is a tower site nothing in an ordinary wave can
 * damage. Rock is the honest kind for a plateau buried inside a mountain.
 *
 * This runs *after* sealing, not before: sealing turns walkable ground into
 * rock, which can leave a high tile newly uncontested. It needs no second pass
 * of its own — demoting high to rock changes no tile's walkability, so it can
 * never create a new uncontested plot.
 *
 * It costs no band, which is what makes it affordable at all: `high` and `rock`
 * are both non-walkable and both non-`Normal`, so every term `measureTerrain`
 * computes — all of them functions of the walkable set and the normal set — is
 * identical either way, and no seed takes an extra retry because of it. Pinned
 * over 500 seeds in `tests/terrain-high-contest.test.ts`.
 */
function demoteUncontestedHigh(kind: Uint8Array, cfg: TerrainConfig): void {
  // No `highContestRadius <= 0` fast path here on purpose: `uncontestedHigh`
  // already answers nothing at radius 0, and a second copy of that rule would
  // be a branch no test could ever kill — whichever guard a mutation removed,
  // the other would keep the suite green.
  const view: TerrainGrid = { w: GRID_W, h: GRID_H, kind };
  for (const i of uncontestedHigh(view, cfg)) kind[i] = TerrainKind.Rock;
}

/**
 * Any walkable tile *no* gate can reach becomes rock. A pocket the walkers can
 * never enter is not playable ground, and counting it as walkable would let a
 * map pass the walkable band on area nobody can use.
 *
 * This deliberately floods from all gates at once (the union): it is a cleanup
 * of dead ground, not a connectivity check. Whether the gates reach *each
 * other* is `gatesConnected`'s job, and sealing cannot answer it — a pocket
 * holding a gate is reachable, from that gate.
 */
function sealPockets(kind: Uint8Array, cfg: TerrainConfig): void {
  // Shares the analyzer's flood rather than repeating it: two copies of a
  // connectivity rule is exactly where the seal and the measurement drift.
  const view: TerrainGrid = { w: GRID_W, h: GRID_H, kind };
  const seen = walkableFlood(view, cfg, gateIndices(view));
  for (let i = 0; i < kind.length; i++) {
    if (!seen[i] && cfg.tiles[kind[i]].walkable) kind[i] = TerrainKind.Rock;
  }
}

/** FNV-1a over the seed and every tile — the G2 handle for a generated map. */
export function terrainHash(seed: number, kind: Uint8Array): string {
  const h = new Hasher();
  h.int(seed | 0);
  h.int(GRID_W).int(GRID_H);
  for (let i = 0; i < kind.length; i++) h.int(kind[i]);
  return h.hex();
}

/**
 * Why `verifyTerrainMap` refused a map, in the order the checks run.
 *
 * Ordered so the reported fault is the *cause* rather than a downstream
 * symptom: a map whose buffer is the wrong length would also fail the hash
 * check, and "these tiles no longer hash to their handle" is the wrong bug
 * report for a buffer that was never the arena's size.
 */
export type TerrainVerifyFault =
  /** `w`/`h` are not the arena's, so `map.hash` describes a different shape. */
  | 'dimensions'
  /** `kind` is not `w * h` long — a truncated or overlong tile buffer. */
  | 'kind-length'
  /**
   * `seed` is not a uint32, so it is not a key any generation could have used
   * — and `terrainHash` would fold it to one that looks honest.
   */
  | 'seed-range'
  /** The tiles (or `seed`) no longer hash to `map.hash`. */
  | 'hash';

export type TerrainVerifyResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly fault: TerrainVerifyFault;
      /**
       * The invariant or handle that should have held — the arena's `WxH`, the
       * expected tile count, `a uint32`, or the hash the map advertises.
       */
      readonly expected: string;
      /**
       * What this map's fields or bytes actually say, in the same units, so the
       * pair reads as a paste-in diff. Note which side the map's own claim
       * lands on: for `hash` it is `expected` (the stale handle it still
       * carries); for the other three it is `actual`.
       */
      readonly actual: string;
    };

/**
 * fb064p: does this map still hash to the handle it was built with?
 *
 * `TerrainMap.hash` is computed once at construction over a `Uint8Array` the
 * caller holds a live reference to. `readonly kind` freezes the binding and not
 * the buffer, so `map.kind[i] = k` type-checks, runs, and leaves the map
 * carrying a hash of tiles it no longer has — and that hash is the G2
 * determinism handle every replay guard downstream compares. `types.ts` asks
 * callers to treat a generated map as immutable; before this function nothing
 * enforced or even *detected* the ask, so a consumer that patched a tile in
 * place broke determinism silently and at a distance.
 *
 * This is the detector, not an enforcer: it cannot stop the write (a
 * `Uint8Array` cannot be frozen and stay a typed array worth using, and copying
 * the buffer on every read would cost 720 bytes per query in the sim's hot
 * path). It makes the corruption *findable* — cheap enough to assert at a run
 * boundary, in a replay guard, or in a test.
 *
 * Pure and non-mutating: it reads `map`, allocates a `Hasher`, and returns.
 *
 * The three guards before the hash all exist for one reason: `terrainHash`
 * folds values the map also stores *separately*, so a field can be corrupted
 * into a lie that still hashes clean. Each guard closes one such hole, and each
 * was a measured miss rather than a hypothetical:
 *   - **dimensions.** The hash folds `GRID_W`/`GRID_H`, not the map's own
 *     `w`/`h` (`describe.ts` documents the same hole from the parser's side).
 *     A map claiming a different shape — a *transposed* one especially, since
 *     it even keeps the tile count — recomputes to its stored hash while
 *     describing an arena that is not this one.
 *   - **`kind` length.** A truncated buffer whose hash was recomputed over the
 *     truncation is self-consistent and still not a map.
 *   - **`seed` range.** The hash folds `seed | 0`, so every value congruent
 *     modulo `2 ** 32`, and every non-finite or fractional value truncating to
 *     the stored int32, hashes identically: `seed + 2 ** 32`, `7.9`, `NaN` and
 *     `Infinity` all passed before this guard. `generateTerrain` refuses every
 *     one of them as a seed (fb064j), and `Hasher.int`'s own non-finite tagging
 *     — added so a corrupted run cannot hash clean — is pre-empted by the
 *     `| 0`. Guarded here rather than by dropping the `| 0`, which would move
 *     every recorded hash golden in the suite.
 * Ordered cause-first, so the reported fault is the malformed field and not the
 * hash mismatch it would go on to produce.
 *
 * What it deliberately does **not** check, so a green result is not read as
 * more than it is:
 *   - **`requestedSeed`.** It is provenance and is outside the hash on purpose
 *     (`types.ts`): `-1` and `4294967295` produce byte-identical tiles and one
 *     hash. A guard that must compare a seed compares *that* field itself.
 *   - **`attempts` and `fallback`.** Also outside the hash, and forgeable
 *     without moving it — a relabelled map verifies clean and then
 *     `isDegradedMap` reports it wrongly. This function is about the *tiles*;
 *     whether the provenance pair is coherent is a separate question nobody
 *     should read a green result as having answered.
 *   - **Tile kinds against `/data`.** Verification takes no config, so an
 *     out-of-range kind byte is caught here only because it moves the hash, not
 *     because it is unknown. `terrainOverlay` is the config-aware gate.
 *   - **Legality.** A hand-built map can verify and still fail every band;
 *     `terrainLegal(measureTerrain(map, cfg), cfg)` is that question.
 */
export function verifyTerrainMap(map: TerrainMap): TerrainVerifyResult {
  if (map.w !== GRID_W || map.h !== GRID_H) {
    return {
      ok: false,
      fault: 'dimensions',
      expected: `${GRID_W}x${GRID_H}`,
      actual: `${map.w}x${map.h}`,
    };
  }
  if (map.kind.length !== map.w * map.h) {
    return {
      ok: false,
      fault: 'kind-length',
      expected: String(map.w * map.h),
      actual: String(map.kind.length),
    };
  }
  // Before hashing, not after: `terrainHash` would fold this to a uint32 and
  // report a clean hash for a key no generation could have produced.
  if (!Number.isInteger(map.seed) || map.seed < 0 || map.seed > 0xffffffff) {
    return { ok: false, fault: 'seed-range', expected: 'a uint32', actual: String(map.seed) };
  }
  const actual = terrainHash(map.seed, map.kind);
  if (actual !== map.hash) return { ok: false, fault: 'hash', expected: map.hash, actual };
  return { ok: true };
}

function toMap(
  requestedSeed: number,
  seed: number,
  kind: Uint8Array,
  attempts: number,
  fallback: boolean,
): TerrainMap {
  return {
    w: GRID_W,
    h: GRID_H,
    kind,
    requestedSeed,
    seed,
    attempts,
    fallback,
    hash: terrainHash(seed, kind),
  };
}

/** The flat arena under a caller's provenance. Always `fallback: true`. */
function flatMap(requestedSeed: number, seed: number, attempts: number): TerrainMap {
  return toMap(requestedSeed, seed, flatKinds(), attempts, true);
}

/**
 * The flat arena as a `TerrainMap`, built by the one builder above (fb064n).
 *
 * Two call sites need it and used to construct it separately: `generateTerrain`
 * ships it when every attempt is degenerate, and fb064f's Training Grounds
 * override wants it as a map rather than as a fallback nobody asked for.
 *
 * **Provenance: no seed produced these tiles**, and the map says so in the two
 * fields that can say it. `fallback: true` is `types.ts`'s marker for exactly
 * that, and `attempts: 0` is the honest count — zero generation
 * attempts ran — which is also what distinguishes this map from the one
 * `generateTerrain` returns after exhausting `maxAttempts`. `requestedSeed`
 * and `seed` are `0` because `TerrainMap` has nowhere to write "none": read
 * them only after checking `fallback`, and prefer `attempts` to tell the two
 * flat maps apart. A run's map is never this one — `generateTerrain(0)`
 * produces a scattered map with `attempts: 1`.
 *
 * Takes no config, deliberately, though fb064n's acceptance wrote it as
 * `flatTerrain(cfg)`. The flat arena is a function of the arena's geometry
 * (`GRID_W`, `GRID_H`, `GATES`) and of `TERRAIN_KEYS`' load-bearing order
 * alone; nothing in `data/terrain.json` selects a tile of it, and the loader
 * makes that structural rather than incidental — the schema pins each tile's
 * flags and its `key` per index, so no `/data` edit can change which index is
 * rock or what a rock tile means. A parameter that changed nothing would tell a
 * Tuner caller the opposite, and every other function here that takes a `cfg`
 * genuinely reads it. Pinned by a test that compares its bytes against an
 * independent rebuild while the *measurements* of it move under a wild config.
 *
 * Note what a `cfg` *would* be needed for and is not: this map is not
 * unconditionally legal. `terrainLegal` is a question about a config, and a
 * band above ~0.854 walkable is unsatisfiable by any map at all. Ask
 * `terrainLegal(measureTerrain(flatTerrain(), cfg), cfg)` rather than assuming.
 */
export function flatTerrain(): TerrainMap {
  return flatMap(0, 0, 0);
}

/**
 * True when this map is a *downgrade*: the generator gave up and shipped the
 * flat arena because no seed cleared the bands.
 *
 * The predicate `fallback` looks like but is not (fb064n). `flatTerrain()`
 * carries `fallback: true` too — it is the same tiles, and the flag describes
 * the map — so a caller that alarms on the boolean alone would report fb064f's
 * Training Grounds arena as a failed generation. Exported so that the two-field
 * rule is written once here rather than re-derived at each consumer.
 */
export function isDegradedMap(map: TerrainMap): boolean {
  return map.fallback && map.attempts > 0;
}

/**
 * The accepted seed domain (fb064j), inclusive.
 *
 * The upper end is `0xffffffff` because that is the domain a *run* seed
 * actually draws from — `src/ui/main.ts` starts a run with
 * `(Math.random() * 0xffffffff) >>> 0`, so roughly half of all real seeds are
 * at or above `2 ** 31`. The lower end keeps the int32 negatives, which tools
 * and tests use freely and which the RNG has always accepted.
 *
 * Anything outside is refused rather than folded in: `2 ** 32`, `2 ** 40` and
 * `Number.MAX_SAFE_INTEGER` are all integers, so the `Number.isInteger` guard
 * waves them through, and they used to land on seeds 0, 0 and -1 respectively
 * — the identical aliasing hole that guard exists to close, still open one
 * bit further out.
 */
export const MIN_TERRAIN_SEED = -0x80000000;
export const MAX_TERRAIN_SEED = 0xffffffff;

/**
 * The run's terrain. Pure in `(seed, cfg)`: the same pair always returns the
 * same tiles and the same hash.
 *
 * A non-integer seed is refused rather than coerced. `seed | 0` silently maps
 * `NaN`, `Infinity` and `0.4` all onto seed 0 — a legitimate seed — and then
 * writes that 0 into `requestedSeed`, destroying the provenance the replay
 * guard (architecture rule 2) needs. There is no caller yet, so this is the
 * cheap moment to make it loud instead of at fb064b/fb064c.
 *
 * An out-of-domain integer is refused for the same reason (fb064j), and
 * `requestedSeed` now records what the caller *passed*, not `seed | 0`. Under
 * `| 0` a run seed of `3000000000` reported `requestedSeed: -1294967296`, so
 * the field could not be compared against `RunConfig.seed` at all on half the
 * seed space — provenance destroyed exactly as above, in the normal case
 * rather than the corrupt one.
 *
 * `seed` (the effective one) is the uint32 RNG key, which is what `attempt`
 * has always reduced to. The retry walk therefore wraps modulo `2 ** 32`
 * rather than escaping the domain: the successor of `0xffffffff` is `0`.
 * Tiles and `hash` are unchanged by this — `attempt` already keyed on
 * `seed >>> 0`, and `Hasher.int` folds the same four bytes for the signed and
 * unsigned views of one key.
 */
export function generateTerrain(seed: number, cfg: TerrainConfig = loadTerrain()): TerrainMap {
  if (!Number.isInteger(seed)) {
    throw new Error(`generateTerrain: seed must be an integer, got ${String(seed)}`);
  }
  if (seed < MIN_TERRAIN_SEED || seed > MAX_TERRAIN_SEED) {
    throw new Error(
      `generateTerrain: seed must be in [${MIN_TERRAIN_SEED}, ${MAX_TERRAIN_SEED}], got ${String(seed)}`,
    );
  }
  // `-0` passes both guards (`Number.isInteger(-0)` is true, `-0 < MIN` is
  // false) and would be stored verbatim as `-0`. It compares equal to `0`
  // under `===` but not under `Object.is`, which is what vitest's `toBe`, a
  // deep-equal on the map, and a JSON round-trip of a saved run all use — so
  // the one value where "compare `requestedSeed` to `RunConfig.seed`" breaks
  // would be the one that looks most like a legitimate seed. Normalise it.
  const requested = seed === 0 ? 0 : seed;
  const key = seed >>> 0;
  for (let n = 0; n < cfg.maxAttempts; n++) {
    const trySeed = (key + n) >>> 0;
    const kind = attempt(trySeed, cfg);
    const map = toMap(requested, trySeed, kind, n + 1, false);
    if (terrainLegal(measureTerrain(map, cfg), cfg)) return map;
  }
  // The fallback map came from no RNG key at all, so `seed` stays the
  // unadvanced key rather than `key + maxAttempts - 1`: reporting an advanced
  // seed would name a key that did not produce these tiles.
  //
  // Routed through `flatMap` rather than building its own (fb064n): the flat
  // arena fb064f hands the Training Grounds and the flat arena a hostile
  // `/data` edit downgrades a run to are the same map, and a second
  // construction site is where they would stop being.
  return flatMap(requested, key, cfg.maxAttempts);
}
