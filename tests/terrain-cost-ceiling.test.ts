/**
 * The `paint()` cost-ratio guard, split out of `tests/terrain-generation.test.ts`
 * (2026-09-22, fb056 session) into the perf tier: it is a wall-clock *ratio*,
 * and the fast tier runs it beside a dozen heavy suites — on a healthy tree it
 * read **179** against its 160 ceiling while three suites shared the host.
 * `vitest.perf.config.ts`'s own header states the rule this follows (timing
 * comparisons run where the number means something; the bound is not
 * loosened). The deterministic half of the same guard —
 * `paintIterationCount` pinned exactly (fb088) — stays in the fast tier in
 * `terrain-generation.test.ts`.
 *
 * In its old home this test ran after that file's 1000-seed sweep, which
 * warmed the generator; here a 120-seed shipped-config warm stands in for it
 * (the minimum-over-rounds estimator already discards a cold round — see the
 * calibration history below, moved verbatim).
 */

import { describe, expect, it } from 'vitest';

import { generateTerrain, loadTerrain, parseTerrain, type TerrainConfig, type TerrainMap } from '../src/sim/terrain';

const cfg = loadTerrain();

/**
 * The `paint()` cost guard's ceiling — a **ratio**, not a millisecond budget
 * (fb065d).
 *
 * What it measures: the hostile fixture's cost *per generation attempt*,
 * divided by the cost of one ordinary shipped-config generation taken in the
 * same process, moments apart. Both halves are the generator doing generator
 * work, so ambient load scales them together and what survives is a statement
 * about `paint()`: how much more one maxed-radius attempt costs than an
 * ordinary one.
 *
 * **Why the wall-clock bound it replaces had to go.** `COST_BOUND_MS = 5000`
 * was a raw `Date.now()` budget inside the fast tier, and it failed whenever
 * another suite shared the runner — measured this session at 5174, 5565, 6936,
 * 10612 and 13055 ms on a healthy tree, and QA measured the *control* (the same
 * group with the newest terrain suites removed) failing at 13055 and 17645 ms,
 * so it was not any one neighbour's fault. A guard that goes red for reasons
 * unrelated to its subject trains its readers to ignore it, and this one is the
 * only thing standing between `paint()` and an ~8.7x cost regression.
 *
 * **Why this ratio, when fb064g rejected a ratio.** That attempt compared a
 * wide-radius against a narrow-radius call of the *same* fixture back to back,
 * and its healthy and reverted populations overlapped (23.8/26.0/25.6 against
 * 23.5/55.7/94.9), so it could miss the regression outright. This one compares
 * against a *shipped-config* generation, which is ~2000x cheaper per call
 * (~35x per attempt) and touches `paint()` only through the small authored
 * radii — so the regression lands almost entirely in the numerator. Measured:
 * reverting the clamp leaves the denominator at 0.95x and multiplies the
 * numerator 4.24x, so 100% of the signal is where it should be. Measured, healthy against the
 * clamp reverted by hand:
 *   - healthy: **36.3-38.7** idle, **34.3-38.3** under QA's bursty repro
 *     (24 busy loops at 4 s on / 1 s off), 0 red in 10;
 *   - clamp reverted: **146.4** idle, **148.7-160.8** under the same burst.
 * Earlier revisions of this test, with a 4x longer hostile window, read
 * 34.2-37.3 idle but **51.3** under steady contention and **85.9** under the
 * burst — one false red in ten. The window length is why; see below.
 * Worst healthy 38.7 against best reverted 146.4 is a 3.8x gap with no
 * overlap, where the old bound's healthy readings ran into its failure region
 * on load alone. The ceiling sits at 80: 2.1x above the worst healthy reading
 * and 1.8x below the best reverted one.
 *
 * **That headroom was bought, not found.** QA reproduced a false red at 85.9
 * under bursty oversubscription on a healthy tree, and the cause was window
 * length: the denominator is 64 shipped generations (~77 ms) while the
 * numerator was one 16-attempt hostile call (~710 ms), so a 4-second burst
 * could inflate every hostile round while the denominator's minimum stayed at
 * its idle value. The fix is to shorten the *numerator* — `ATTEMPTS` is 4, not
 * 16, which is still every attempt the fixture runs and still the same
 * per-attempt quantity — with five rounds instead of three and a
 * confirm-before-red retry behind them. Re-run against QA's exact repro: 0 red
 * in 10, and the reverted clamp still fails 3/3 under it. The test also got
 * faster, 3.3 s to 1.5 s.
 *
 * The two halves are each a minimum over three rounds and both are warmed
 * first, for the reasons fb064z's cost ledger records at length: an unwarmed
 * first call with a `parseTerrain`-built config reads ~9x its steady-state
 * cost, and a minimum is the estimator that gets *better* under load rather
 * than worse.
 *
 * **What this guard is not**, with the numbers QA measured by adding a repeat
 * knob to `paint()` rather than by arithmetic:
 *  - It is a ratio, so a regression that slows *both* halves proportionally
 *    makes it *fall*, not rise. `paint()` is ~**97%** of a hostile attempt
 *    (with paint a no-op the fixture reads 1.28 ms/attempt against 44.9) and
 *    only ~5% of a shipped-config generation, so a 2x slowdown in shared code
 *    would read about **19**, not 36. An earlier draft of this comment said
 *    42% and ~27; it was wrong in the direction that flatters the guard.
 *  - Its detection floor is ~**2.3x** paint work, interpolated from the same
 *    knob: 1x reads 36.7, 2x reads 70.5 and passes, 3x reads 104.0 and fails.
 *    It exists for an 8.7x regression and catches that with room; it is not a
 *    sharp instrument and should not be read as one.
 *  - The uniform direction belongs to `tests/terrain-cost.test.ts`'s
 *    `MEAN_CEILING`, in the same tier, which catches above ~5x. Between them
 *    the band from ~1.8x to ~5x uniform is uncovered. The wall-clock bound
 *    nominally covered it — 1.8x headroom over its own idle reading — but it
 *    went red 4/4 under load with no regression present, so that coverage was
 *    indistinguishable from its flake. A gap on paper, no loss in practice.
 *
 * Two calibration caveats, recorded because the number is a constant:
 *  - it is calibrated against shipped `data/terrain.json`. Ordinary tunes
 *    barely move it (jitter 0.22 -> 0.5 reads 34.9; every radius +1 reads
 *    34.4), but a tune that adds retries moves it a lot — rock .11 -> .16 with
 *    rough .17 -> .22 reads 20.9, which would put the reverted clamp near the
 *    ceiling. Re-measure if `density` or `constraints` move. (Such a tune
 *    reddens the 1000-seed sweep above first, so the risk is self-limiting.)
 *  - it is calibrated for the vitest runner. The same code reads ~11.6 under
 *    `npx tsx` and ~35 under vitest on one host, which is a larger effect than
 *    the headroom. Only vitest runs it.
 *
 * **A rejected fix, recorded so it is not tried again.** The obvious answer to
 * the window-length mismatch that makes bursty load readable at all is to
 * lengthen the denominator until both halves span the same wall clock. QA
 * built it (`BASE_SEEDS = 560`): it does remove the false reds, 6/6 green under
 * the bursty load — and with the clamp reverted under that same load it read
 * **74.5, a pass, in 1 of 3 runs**. A long denominator window eats bursts too,
 * and deflating the ratio is the one direction a cost guard cannot afford. The
 * short denominator biases toward a false *red*, which is the safe side, and
 * the confirm-before-red retry in the test is what pays for that bias.
 *
 * A deterministic count of `paint()` iterations would remove the timing
 * dependence entirely; that needs instrumentation inside `/src/sim` and is
 * still logged for the main lane.
 */
// fb166: re-measured at 56x32. The hostile fixture's blob grew from 612 to
// 1620 tiles (the new interior), which alone moves the healthy reading from
// ~35-39 to ~85-97 idle (five back-to-back runs on this host: 88.1, 89.3,
// 84.5, 84.9, 97.3) — the scatter-blob growth cost, not `paint()`, now
// dominates the numerator. 160 keeps roughly the same ~1.6-1.9x headroom over
// the worst observed reading that the old 80/38.7 pair had (~2.1x).
//
// fb180 (2026-09-15): the reverted-clamp arm above was re-derived at this grid
// size, via a temporary source patch to `paint()` in `src/sim/terrain/
// generate.ts` (reverted immediately after measuring, per this lane's
// test-only Scope — not shipped). Same harness as the test below (`measure()`,
// 5 interleaved rounds, minimum of each half, under vitest — the calibration
// caveat above about tsx-vs-vitest applies). On this host: healthy (shipped,
// clamped `paint()`) read **119.5-119.7** idle across three repeated readings
// (a different host than the 88-97 range recorded just above, consistent with
// this file's own "calibrated for the vitest runner... a larger effect than
// the headroom" caveat); clamp reverted read **293.2-301.7** across three
// readings — a clean **~2.45x gap with zero overlap** against the worst
// healthy reading, comfortably above `COST_RATIO_CEILING = 160`. The paired
// comparison is proven load-bearing again at 56x32: a real `paint()`
// regression of this shape is still caught, not merely a claim carried
// forward from the 36x20-era measurement. Bursty-load contention was not
// re-derived (QA's own bespoke busy-loop repro, not reproduced here); the
// idle-only re-derivation is what this item's acceptance asks for.
const COST_RATIO_CEILING = 160;
/** Ordinary generations timed as the denominator, and the seeds they use. */
const BASE_SEEDS = 64;
const BASE_SEED_START = 2000;

function withConfig(patch: (raw: Record<string, unknown>) => void): TerrainConfig {
  const raw = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>;
  patch(raw);
  return parseTerrain(raw);
}

describe('fb064a — the paint() cost guard (perf tier)', () => {
  for (let s = 1; s <= 120; s++) generateTerrain(s, cfg);

  it('stays bounded under the most expensive schema-legal config', () => {
    // The guard on fb064a's Major fix #1: `paint()` clamps its loop bounds
    // instead of walking the full (2r+1)^2 square. Reverting that clamp is a
    // cost regression on this path (5329 iterations per paint at r=36 against
    // the interior's 1620 on the 56x32 grid — fb166 resized this from 612,
    // which shrinks the theoretical regression from ~8.7x to ~3.3x since the
    // clamped cost's own denominator grew) that no other test here notices,
    // because every other assertion is about tiles rather than work.
    const ATTEMPTS = 4;
    const hostile = withConfig((raw) => {
      const r = raw as Record<string, unknown>;
      r.corridorRadius = 36;
      r.gateClearRadius = 36;
      r.plazaRadius = 36;
      r.corridorJitter = 1;
      r.maxAttempts = ATTEMPTS;
      (raw.blob as Record<string, number>).minSize = 1620;
      (raw.blob as Record<string, number>).maxSize = 1620;
      // Unreachable by anything the generator builds here — with every radius
      // at its cap `paint()` protects the whole interior, so the attempt *is*
      // the flat map at 0.8098 — which is what makes every attempt run rather
      // than the first succeeding.
      //
      // fb064g rebuilt this line. It was `1`, which the loader now refuses, and
      // that refusal was the reason fb064a could not close the hole: a fixture
      // reaching the retry path through a band the loader rejects is a fixture
      // holding the band's own ceiling open. 0.9 loads because the ceiling is
      // `a / (a + 1)` rather than the flat map's share, and forces every one of
      // the `ATTEMPTS` attempts to run.
      (raw.constraints as Record<string, number>).minCoreLegalFrac = 0.9;
    });
    // The hostile *shape* is what needs warming — fb064z measured a first call
    // with a freshly parsed config at ~9x its steady-state cost, all of it V8
    // specialising for a second config shape. A 120-seed warm of the shipped
    // shape was also here and is gone: review measured the ratio unchanged
    // without it (35.8 against 34.2-37.3), because `Math.min` over three rounds
    // already discards the cold round and the file's own 1000-seed sweep runs
    // before this test. QA confirmed it: first-round deviation from the minimum
    // is <= 2.8% on the base half and <= 2.0% on the hostile half even with the
    // sweep filtered out.
    generateTerrain(7, hostile);

    /** One reading: three interleaved rounds, a minimum from each half. */
    const measure = (): { ratio: number; map: TerrainMap; baseAttempts: number } => {
      let baseMs = Infinity;
      let hostileMsPerAttempt = Infinity;
      let baseAttempts = 0;
      let map: TerrainMap | null = null;
      for (let round = 0; round < 5; round++) {
        // Interleaved, not one block each: a contention burst that lands on one
        // half and not the other is exactly what fb064g's rejected ratio could
        // not survive, and alternating them keeps the two minima drawn from the
        // same stretch of wall clock.
        const t0 = performance.now();
        for (let i = 0; i < BASE_SEEDS; i++) {
          const b = generateTerrain(BASE_SEED_START + i, cfg);
          if (round === 0) baseAttempts += b.attempts;
        }
        baseMs = Math.min(baseMs, (performance.now() - t0) / BASE_SEEDS);

        const t1 = performance.now();
        map = generateTerrain(7, hostile);
        hostileMsPerAttempt = Math.min(hostileMsPerAttempt, (performance.now() - t1) / ATTEMPTS);
      }
      return { ratio: hostileMsPerAttempt / baseMs, map: map!, baseAttempts };
    };

    // Confirm before red (QA). The two halves' windows differ ~9x in length —
    // 64 shipped generations is ~77 ms against one 16-attempt hostile call at
    // ~710 ms — so *bursty* oversubscription (QA's repro: 24 busy loops at 4 s
    // on, 1 s off) can leave the denominator's minimum at its idle value while
    // every hostile round eats a burst. Measured on a healthy tree that way:
    // one reading of 85.9 in ten, with 65-74 in the noise band. Steady load of
    // any depth is harmless and reads *lower* than idle at 48-way.
    //
    // A second reading costs 0.7 s and only on the path that was about to fail,
    // and it separates the two cases cleanly: under the same bursty load the
    // reverted clamp never read below 337. Equalising the windows instead is
    // the obvious fix and is **wrong** — see the header.
    let reading = measure();
    if (reading.ratio >= COST_RATIO_CEILING) {
      const again = measure();
      if (again.ratio < reading.ratio) reading = again;
    }

    expect(reading.map.attempts).toBe(ATTEMPTS); // every attempt really ran
    expect(reading.map.fallback).toBe(true);
    // The denominator is a fixture too, and an unpinned one is a ceiling that
    // moves without anyone editing it: if a legal `/data` tune pushes a base
    // seed onto the retry path, an ordinary generation gets more expensive and
    // the ratio falls for a reason that has nothing to do with `paint()`. QA
    // measured it — `corridorJitter: 1`, which the loader accepts and fb064l
    // documents, makes seed 2060 retry and drags the healthy reading from ~36
    // to ~27. Free to check, so it is checked rather than warned about.
    expect(reading.baseAttempts, 'every base seed must generate in one attempt').toBe(BASE_SEEDS);
    expect(
      reading.ratio,
      'one maxed-radius attempt against one ordinary generation ' +
        '(healthy ~85-120 idle on the 56x32 grid, fb166/fb180 — see the ceiling comment above; ' +
        'reverted-clamp re-measured at 56x32 by fb180, ~293-302, ~2.45x clear; ' +
        'bursty-load was not re-taken at this grid size)',
    ).toBeLessThan(COST_RATIO_CEILING);
  });

});
