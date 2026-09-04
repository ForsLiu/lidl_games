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
 * `fallback: true` is the caller's signal that the bands, not the seed, are
 * what failed.
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

/** The base map: rock border, walkable gate tiles, normal interior. */
function blankKinds(): Uint8Array {
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
  const kind = blankKinds();
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
  return toMap(requested, key, blankKinds(), cfg.maxAttempts, true);
}
