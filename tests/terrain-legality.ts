/**
 * fb064v — the one re-derivation of `terrainLegal` the terrain tests share.
 *
 * **Why a re-derivation at all, rather than calling `terrainLegal`?** The
 * generator returns a non-fallback map only when `terrainLegal` passed under
 * the same config a test would hand it, so `terrainLegal(measureTerrain(map))`
 * is *implied* by `map.fallback === false` and can never fail independently.
 * Dropping a term from `terrainLegal` — say `gatesConnected` — would then be
 * invisible to every assertion built on it. Three suites worked that out
 * separately and each wrote its own copy.
 *
 * **Why one copy instead of three.** The drift those copies exist to prevent
 * had already happened: the copies in `terrain-generation.test.ts` and
 * `terrain-seed-domain.test.ts` both stopped at `coreLegalFrac` and were
 * missing fb064o's two `maxGateDetour` terms from the moment fb064o shipped,
 * so every assertion built on them was strictly weaker than the generator's
 * own accept test — the exact failure their own comments warned about. fb064r
 * corrected them in place; this file removes the structural cause.
 *
 * **What keeps this copy honest.** `tests/terrain-legality.test.ts` sweeps
 * every field of a `TerrainMeasure` across a wide value spread and fails if
 * this function and `terrainLegal` ever disagree, so a band added to
 * `terrainLegal` and not to this mirror cannot land green.
 */

import {
  measureTerrain,
  type TerrainConfig,
  type TerrainMap,
  type TerrainMeasure,
} from '../src/sim/terrain';

/**
 * The numeric bands `terrainLegal` reads, in its own order.
 *
 * Shared so the ledger's per-band statistics and the mirror's own table walk
 * the same list: a band added to one and not the other is the drift fb064v is
 * about.
 */
export const LEGALITY_BANDS = [
  'walkableFrac',
  'buildableNormalFrac',
  'gateReachFrac',
  'coreLegalFrac',
  'maxGateDetour',
] as const;
export type LegalityBand = (typeof LEGALITY_BANDS)[number];

/** The unconditional flags `terrainLegal` checks outside any tunable band. */
export const LEGALITY_FLAGS = ['gatesOpen', 'gatesConnected', 'corridorsOk'] as const;
export type LegalityFlag = (typeof LEGALITY_FLAGS)[number];

/**
 * Mirrors `terrainLegal` term for term, from the measurements alone.
 *
 * Takes the measure rather than the map because callers in the ledger already
 * hold one: measuring twice per seed cost about a third of that file's runtime
 * (0.31 ms of measure against 0.44 ms of generation, 12,000 times). `legalUnder`
 * is the wrapper for callers that only have a map.
 */
export function legalMeasure(q: TerrainMeasure, c: TerrainConfig): boolean {
  return (
    q.gatesOpen &&
    q.gatesConnected &&
    q.corridorsOk &&
    q.walkableFrac >= c.constraints.minWalkableFrac &&
    q.buildableNormalFrac >= c.constraints.minBuildableNormalFrac &&
    q.gateReachFrac >= c.constraints.minGateReachFrac &&
    q.coreLegalFrac >= c.constraints.minCoreLegalFrac &&
    // fb064o's approach band, from both sides. The lower bound is not
    // decoration: a detour below 1 is arithmetically impossible, so `>= 1` is
    // a self-check on the measurement and it is what turns the `-1` "not
    // measurable" sentinel into a refusal instead of a pass.
    q.maxGateDetour >= 1 &&
    q.maxGateDetour <= c.constraints.maxGateDetour
  );
}

/** `legalMeasure` for a caller holding a map rather than a measure. */
export function legalUnder(m: TerrainMap, c: TerrainConfig): boolean {
  return legalMeasure(measureTerrain(m, c), c);
}

/**
 * Which terms a measure fails, named — `legalMeasure`'s verdict, itemised.
 *
 * The band ledger reports *why* the generator retried, which needs the terms
 * separately rather than their conjunction. That made it a fourth enumeration
 * of the same nine terms, one the fb064v guard did not cover; it lives here
 * now, and `tests/terrain-legality.test.ts` pins `failedBands(q, c).length === 0`
 * against `legalMeasure(q, c)` over the same sweep, so the two cannot drift
 * apart either.
 *
 * `maxGateDetour` contributes two distinct names because its two sides mean
 * different things: below `1` is an unmeasurable approach (the `-1` sentinel),
 * above the cap is a real detour the band refuses.
 */
export function failedBands(q: TerrainMeasure, c: TerrainConfig): string[] {
  const k = c.constraints;
  const out: string[] = [];
  if (!q.gatesOpen) out.push('gatesOpen');
  if (!q.gatesConnected) out.push('gatesConnected');
  if (!q.corridorsOk) out.push('corridorsOk');
  // Negated `>=`/`<=` rather than `<`/`>`, so this is the exact complement of
  // `legalMeasure` and not merely its opposite in spirit. The two forms differ
  // on `NaN`, which fails every comparison: `q.walkableFrac < min` is false for
  // `NaN`, so the plain form would report a `NaN` measure as failing *nothing*
  // while `legalMeasure` refused it. The fb064v guard caught that on the day
  // this enumeration moved here — no measurement produces `NaN` today, so it
  // was latent, and it is exactly the "opposite in spirit" drift these copies
  // keep producing.
  if (!(q.walkableFrac >= k.minWalkableFrac)) out.push('walkableFrac');
  if (!(q.buildableNormalFrac >= k.minBuildableNormalFrac)) out.push('buildableNormalFrac');
  if (!(q.gateReachFrac >= k.minGateReachFrac)) out.push('gateReachFrac');
  if (!(q.coreLegalFrac >= k.minCoreLegalFrac)) out.push('coreLegalFrac');
  if (!(q.maxGateDetour >= 1)) out.push('maxGateDetour<1');
  if (!(q.maxGateDetour <= k.maxGateDetour)) out.push('maxGateDetour');
  return out;
}
