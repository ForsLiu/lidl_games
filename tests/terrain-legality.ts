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

/**
 * How far a measure is from failing one band, in the band's own units, signed
 * so that larger is safer (fb065a).
 *
 * Lives here rather than beside its caller because it is the *fifth* statement
 * of the same thresholds — the four fb064v consolidated plus this one — and the
 * exhaustive `switch` only catches a band that is *added*, never a direction
 * that is flipped or a constraint key that is renamed. The guard that catches
 * those is in `terrain-legality.test.ts`, where `slackOf(q, band, c) >= 0` is
 * pinned as the exact complement of `failedBands(q, c).includes(band)` over the
 * same config matrix the mirror is swept on.
 *
 * That guard pins the **sign**, not the scale: a `slackOf` returning twice the
 * real distance would pass it unchanged. The scale is held by the recorded
 * `SLACK` strings in `tests/terrain-headroom.test.ts`, and the split is stated
 * here so the next reader knows which file holds which half.
 *
 * Zero is *inside* the band, matching `legalMeasure`'s `>=`/`<=`: a map exactly
 * on a floor is legal, so `slackOf(q, band, c) >= 0` is the exact complement of
 * `failedBands` reporting that band. Callers measuring headroom therefore have
 * to distinguish "on the edge" (0) from "over it" (negative) themselves, which
 * is the distinction fb065a exists to measure.
 *
 * **`maxGateDetour` gets the cap side as its scale and the sentinel as a flat
 * refusal.** `legalMeasure` bounds it from both sides, and the lower bound is a
 * self-check on the measurement rather than a band a map drifts across: the
 * only value below 1 is the `-1` "no measurable approach" sentinel, which on
 * the cap arithmetic would score 2.5 — the safest number in the file — for a
 * map that is in fact illegal. It is reported as `-1` instead, so the sign
 * still says "failed"; the *name* `maxGateDetour<1` stays `failedBands`' alone.
 */
export function slackOf(q: TerrainMeasure, band: LegalityBand, c: TerrainConfig): number {
  const k = c.constraints;
  switch (band) {
    case 'walkableFrac':
      return q.walkableFrac - k.minWalkableFrac;
    case 'buildableNormalFrac':
      return q.buildableNormalFrac - k.minBuildableNormalFrac;
    case 'gateReachFrac':
      return q.gateReachFrac - k.minGateReachFrac;
    case 'coreLegalFrac':
      return q.coreLegalFrac - k.minCoreLegalFrac;
    case 'maxGateDetour':
      return q.maxGateDetour < 1 ? -1 : k.maxGateDetour - q.maxGateDetour;
  }
}
