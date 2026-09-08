/**
 * fb156 — the 4-gate/5-gate generation sweep. **A script, not a suite.**
 *
 * Run it: `npx tsx tests/terrain-four-gates-sweep.ts [seeds]`
 *   e.g.  `npx tsx tests/terrain-four-gates-sweep.ts 12000`
 *
 * `tests/terrain-four-gates.test.ts` is the committed, fast-tier property
 * suite (1200 seeds per fixture, ~0.4s of test time) that fb156's acceptance
 * actually needs. This script is the wider cross-check behind the numbers
 * quoted in that file's header and in BACKLOG-TERRAIN.md's closing note for
 * fb156 — large enough to be worth keeping runnable on demand rather than
 * only trusting the one reading, but too slow (~65s at 12000 seeds x 3
 * fixtures) for the fast tier and not a `vitest.fast.config.ts` exclude-list
 * candidate either, since it asserts nothing — it only prints.
 *
 * ## The reading, 2026-09-07, seeds 1..12000, this build's `data/terrain.json`
 *
 * | fixture    | gates | fallbacks | min walkable | min buildableNormal | min coreLegal | max gateDetour | min gateDetour |
 * |------------|-------|-----------|---------------|----------------------|----------------|-----------------|-----------------|
 * | baseline-3 |     3 | 0/12000   | 0.632813 (>=0.6) | 0.478795 (>=0.45) | 0.432008 (>=0.15) | 1.492063 (<=1.5) | 1.000000 |
 * | four-gate  |     4 | 0/12000   | 0.621094 (>=0.6) | 0.486607 (>=0.45) | 0.460993 (>=0.15) | 1.444444 (<=1.5) | 1.000000 |
 * | five-gate  |     5 | 0/12000   | 0.618862 (>=0.6) | 0.489397 (>=0.45) | 0.460168 (>=0.15) | 1.493976 (<=1.5) | 1.030612 |
 *
 * `gateReachFrac`, `corridorsOk`, `gatesOpen` and `gatesConnected` are not
 * columns above because they never moved: every one of 36000 generated maps
 * (3 fixtures x 12000 seeds) measured `gateReachFrac: 1.0` and passed all
 * three flags, matching `measureTerrain`'s own documented behaviour that once
 * `sealPockets` has run, a non-fallback map's per-gate reach is 1.0
 * everywhere. `terrainLegal` (re-derived from the measure, independent of
 * `map.fallback`) agreed with the generator's own accept test on all 36000.
 *
 * **Reading the table**: no band came close to failing at 4 or 5 gates, and
 * the *closest* margin anywhere in the table (five-gate's 1.493976 against a
 * 1.5 ceiling) is not a new fragility fb156 introduces — the 3-gate baseline
 * is equally tight (1.492063) on the same 12000-seed sweep, so it is a
 * property of the shipped density/corridor config at 56x32, unrelated to gate
 * count. `src/sim/terrain/**` needed no code change to produce this table:
 * every function already threads an explicit `gates` parameter (fb077).
 *
 * The two fixtures below are `tests/terrain-four-gates.test.ts`'s own
 * `FOUR_GATES`/`FIVE_GATES` — see that file's header for why they use their
 * own border-corrected coordinates rather than reusing the shipped `GATES`
 * (whose `east`, and `MODIFIER_GATES`' `south`, no longer sit on the 56x32
 * border — a known fb166 finding logged for main-lane's `fb153b`).
 */
import { GATES, GRID_H, GRID_W, type GateDef } from '../src/sim/grid';
import { generateTerrain, loadTerrain, measureTerrain, terrainLegal } from '../src/sim/terrain';

const cfg = loadTerrain();

const FOUR_GATES: readonly GateDef[] = [
  { key: 'west', tx: 0, ty: 12 },
  { key: 'north', tx: 22, ty: 0 },
  { key: 'east', tx: GRID_W - 1, ty: 20 },
  { key: 'south', tx: 34, ty: GRID_H - 1 },
];
const FIVE_GATES: readonly GateDef[] = [...FOUR_GATES, { key: 'north2', tx: 40, ty: 0 }];

function sweep(name: string, gates: readonly GateDef[], seeds: number): void {
  let fallbacks = 0;
  let minWalkable = Infinity;
  let minBuildable = Infinity;
  let minGateReach = Infinity;
  let minCoreLegal = Infinity;
  let maxDetourSeen = 0;
  let minDetourSeen = Infinity;
  let corridorFail = 0;
  let openFail = 0;
  let connectedFail = 0;
  let legalFail = 0;
  let sumAttempts = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const map = generateTerrain(seed, cfg, gates);
    sumAttempts += map.attempts;
    if (map.fallback) fallbacks++;
    const m = measureTerrain(map, cfg, gates);
    minWalkable = Math.min(minWalkable, m.walkableFrac);
    minBuildable = Math.min(minBuildable, m.buildableNormalFrac);
    minGateReach = Math.min(minGateReach, m.gateReachFrac);
    minCoreLegal = Math.min(minCoreLegal, m.coreLegalFrac);
    maxDetourSeen = Math.max(maxDetourSeen, m.maxGateDetour);
    if (m.maxGateDetour >= 1) minDetourSeen = Math.min(minDetourSeen, m.maxGateDetour);
    if (!m.corridorsOk) corridorFail++;
    if (!m.gatesOpen) openFail++;
    if (!m.gatesConnected) connectedFail++;
    if (!terrainLegal(m, cfg)) legalFail++;
  }
  console.log(`\n=== ${name} (${gates.length} gates, seeds 1..${seeds}) ===`);
  console.log(`fallbacks: ${fallbacks}/${seeds} (${((100 * fallbacks) / seeds).toFixed(3)}%)`);
  console.log(`avg attempts: ${(sumAttempts / seeds).toFixed(4)}`);
  console.log(`min walkableFrac: ${minWalkable.toFixed(6)} (band >= ${cfg.constraints.minWalkableFrac})`);
  console.log(
    `min buildableNormalFrac: ${minBuildable.toFixed(6)} (band >= ${cfg.constraints.minBuildableNormalFrac})`,
  );
  console.log(`min gateReachFrac: ${minGateReach.toFixed(6)} (band >= ${cfg.constraints.minGateReachFrac})`);
  console.log(`min coreLegalFrac: ${minCoreLegal.toFixed(6)} (band >= ${cfg.constraints.minCoreLegalFrac})`);
  console.log(`max gateDetour: ${maxDetourSeen.toFixed(6)} (band <= ${cfg.constraints.maxGateDetour})`);
  console.log(`min gateDetour: ${minDetourSeen.toFixed(6)} (must be >= 1)`);
  console.log(
    `corridorFail: ${corridorFail}, openFail: ${openFail}, connectedFail: ${connectedFail}, ` +
      `terrainLegalFail (should be 0): ${legalFail}`,
  );
}

const SEEDS = Number(process.argv[2] ?? 1000);
sweep('baseline-3', GATES, SEEDS);
sweep('four-gate', FOUR_GATES, SEEDS);
sweep('five-gate', FIVE_GATES, SEEDS);
