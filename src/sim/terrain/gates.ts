/**
 * SPEC-FINAL §10 (fb156, owner feedback `terrain-four-gates`): the seed-jittered
 * 4-gate default — "maps generate with 4 spawn gates (N, S, E, W edges,
 * jittered along the edge) instead of 3... jittered along the edge" means each
 * gate's position along its own edge varies per seed, not a 4th fixed
 * coordinate bolted onto the static 3-gate `GATES` array.
 *
 * This is deliberately a *function of a seed*, not a new static export next to
 * `GATES`: `GATES` is consumed as a compile-time constant all over
 * `src/sim/terrain/**` and by `Grid`'s constructor (which bakes its Gate tiles
 * in at construction, with no seed input at all), and every one of those call
 * sites already accepts an explicit `gates: readonly GateDef[]` parameter
 * (`gates = GATES` is the *default*, never the only option — confirmed by
 * reading `analyze.ts`, `config.ts`, `core-placement.ts`, `path.ts`,
 * `describe.ts` and `generate.ts` before writing this). So the pipeline needs
 * no change to accept a 4-gate list; what it was missing was a function that
 * *produces* one, deterministically, from a seed. `generateTerrain`'s own
 * default stays `GATES` (unchanged, 3, legacy) — flipping that default would
 * touch every one of the ~150 existing `generateTerrain(seed, cfg)` call sites
 * across `tests/terrain*` (hash goldens, exact-tile-coordinate assertions
 * against the static list, seed-domain/config edge cases that have nothing to
 * do with gate count) for zero gameplay benefit: nothing in `src/` calls
 * `generateTerrain` without an explicit gate list today (`world.ts:145`
 * always passes `this.gates`), so a live run never reads that default at all.
 * The consumer this item hands a tool to — main-lane's `fb154` — will call
 * `jitterGates(seed)` explicitly and pass the result on, exactly as `world.ts`
 * already passes its own explicit list.
 */
import { GRID_H, GRID_W, type GateDef } from '../grid';
import { fnv1a, Rng, TERRAIN_STREAM } from '../rng';

/**
 * The 4 base gate keys, in the order `jitterGates` draws them — `west, north,
 * east` first (matching `GATES`' own order, so a diff between the legacy
 * 3-gate list and this one reads as "one gate added", not "everything
 * reordered"), then the new `south`.
 */
export const BASE_GATE_KEYS = ['west', 'north', 'east', 'south'] as const;
export type BaseGateKey = (typeof BASE_GATE_KEYS)[number];

/**
 * Tiles of clearance from each corner that a jittered gate's position may not
 * enter, on the edge it jitters along.
 *
 * Sized against two things, both checked rather than assumed:
 *   - `openGate`'s own corner refusal (`grid.ts`): a gate at literally a
 *     corner has no reachable interior neighbour at all. `MARGIN >= 1` is the
 *     bare minimum; 8 leaves an enormous buffer.
 *   - `MODIFIER_GATES`' fixed `'south2'` position (`grid.ts`, `{ tx: 3, ty:
 *     GRID_H - 1 }`): it sits inside this margin band on purpose, so it can
 *     never coincide with a jittered south gate on any seed — `tx: 3 < 8` for
 *     every draw this margin allows. `tests/terrain-four-gates.test.ts` checks
 *     this by construction over a 1000-seed sweep of a real combined 5-gate
 *     list, rather than trusting the arithmetic alone.
 *
 * The remaining band (`[MARGIN, span - 1 - MARGIN]`) is also comfortably clear
 * of `data/terrain.json`'s own clearance radii (`gateClearRadius: 2`,
 * `coreGateClearance: 3` as shipped) so two *jittered* gates on adjacent edges
 * — say west's `ty` near 8 and north's `tx` near 8, both near the NW corner —
 * never crowd each other's protected corridor into the corner pocket a 4-gate
 * arena did not have to solve for at 3 gates. Verified empirically over the
 * 1000-seed sweep (see the test file), not asserted from the arithmetic alone,
 * per this lane's own "verify, don't guess" standing instruction.
 */
export const GATE_JITTER_MARGIN = 8;

/**
 * The seed-jittered 4-gate default: one gate per edge (west, north, east,
 * south), each drawn uniformly along its edge within `[GATE_JITTER_MARGIN,
 * span - 1 - GATE_JITTER_MARGIN]`, deterministic in `seed` alone.
 *
 * **RNG stream.** A dedicated stream, not `attempt()`'s own per-attempt `rng`
 * (`generate.ts`): `${TERRAIN_STREAM}:gates`, following the exact pattern
 * `tiers.ts` already uses for a *named-stream sub-key* (`` `${DRAFT_STREAM}:${tier}` ``)
 * rather than adding a new top-level entry to `rng.ts`'s `ONE_SHOT_STREAM_NAMES`
 * — that list is outside this lane's Scope (`src/sim/rng.ts`), and the
 * sub-key pattern is exactly what it exists for. Keying off `TERRAIN_STREAM`
 * (not a bare literal) means gate placement draws from a namespace already
 * reserved for terrain, so it can never collide with `waves`/`spawns`/`drops`/
 * `offers`/`ai` or the draft streams. It is also **independent of** the
 * `rng` `attempt()` seeds per generation attempt: gate positions are decided
 * once, before any attempt runs, so they do not perturb (and are not
 * perturbed by) the density/blob/corridor draws a retry consumes — a call
 * that ends up retrying at `seed + 1` still opens the *same* gates it started
 * with, which is what lets a caller compute the gate list once per run rather
 * than per attempt.
 *
 * **Determinism**: same `seed` (folded through `>>> 0`, matching every other
 * seed-keyed draw in this module) always produces the same 4 positions —
 * pinned by test. Not reproducible from `generateTerrain`'s own retry walk:
 * this function takes the *caller's* seed once, not the per-attempt `trySeed`,
 * so a degenerate map's flat fallback and every retried attempt within one
 * `generateTerrain` call still protect and measure against one stable gate
 * list — matching how a real run is expected to call this once (per
 * `RunConfig.seed`) and hand the result to both `generateTerrain` and whatever
 * opens the tiles on `Grid`.
 *
 * **Order**: `BASE_GATE_KEYS`' order (west, north, east, south) — every draw
 * happens in that fixed order regardless of which edges end up close together,
 * for the same reason `generate.ts`'s `budget()` draws all three densities
 * before placing any of them: the RNG's position must not depend on anything
 * downstream of it, or a seed's map (or here, gate layout) would move whenever
 * an unrelated earlier step's luck changed.
 */
export function jitterGates(seed: number): GateDef[] {
  const rng = new Rng(fnv1a(`${TERRAIN_STREAM}:gates`, seed >>> 0));
  const vLo = GATE_JITTER_MARGIN;
  const vHi = GRID_H - 1 - GATE_JITTER_MARGIN;
  const hLo = GATE_JITTER_MARGIN;
  const hHi = GRID_W - 1 - GATE_JITTER_MARGIN;
  return [
    { key: 'west', tx: 0, ty: rng.intRange(vLo, vHi) },
    { key: 'north', tx: rng.intRange(hLo, hHi), ty: 0 },
    { key: 'east', tx: GRID_W - 1, ty: rng.intRange(vLo, vHi) },
    { key: 'south', tx: rng.intRange(hLo, hHi), ty: GRID_H - 1 },
  ];
}
