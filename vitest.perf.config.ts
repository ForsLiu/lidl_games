import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

/**
 * The performance passes run on their own, single-threaded: measured against
 * eighteen other test files competing for cores, the numbers say more about the
 * harness than about the sim.
 *
 * `p10e-perf-budget` joined `a10-performance` here after fb140's first CI run
 * (2026-09-06). Its granularity-stability case compares two calibration
 * granularities and asserts they agree within 25%; on a quiet host this file's
 * own header records 0.6%/14.0%/11.5%/1.5%, but on a shared GitHub runner with
 * two vitest workers driving heavy sim files it measured **25.6%** and went
 * red. That is the exact reading the comment above describes — a timing
 * comparison run under contention — so the file moves to the conditions where
 * the number means something rather than having its bound loosened. It stays
 * live: `npm test` runs both configs, so the nightly still measures it.
 *
 * `q13-perf-sensitivity` joined them the same way (2026-09-06). It is the
 * anti-vacuity half of `tests/q13-perf-ratio.test.ts`, split out of that file
 * so the rest of q13 can stay in the fast tier: it divides the worst-case
 * world's ratio by a near-empty world's and asserts at least 4x, and on the
 * shared runner the near-empty tick — already close to timer resolution —
 * inflated proportionally more than the worst case's, measuring **3.58x**.
 * Same reading, same remedy: measure it where the number means something.
 *
 * `terrain-cost-retry-ratio` is the fourth, and the one that shows the rule is
 * not about which side is noisier (2026-09-06). fb064z's "a seed that generates
 * twice costs about twice" divides the raw cost of the two retry-taking seeds
 * by the median of the other 1498, with a one-sided `> 1.5` floor chosen
 * because contention was reasoned to only ever *inflate* the two-seed
 * numerator. On the runner it read **1.2x**: contention inflates the
 * 1498-seed denominator as well, and a ratio of two independent wall-clock
 * populations has no side that noise divides out of. Split out of
 * `tests/terrain-cost.test.ts`, whose remaining bounds are either
 * deterministic or taken against the same run's own mean.
 *
 * `terrain-cost-ceiling` is the fifth (2026-09-22). fb064a's `paint()` cost
 * guard divides one maxed-radius generation attempt by one ordinary
 * generation and asserts < 160; on a healthy tree under a fast-tier run
 * sharing the host with two other suites it read **179**. Same reading, same
 * remedy — split out of `tests/terrain-generation.test.ts` (whose exact,
 * load-independent `paintIterationCount` pin stays in the fast tier) and
 * measured here, single-threaded, with its ceiling unchanged.
 *
 * `render-fb060-dot-tick-perf` is the sixth (same day): fb060's "300 DoT
 * carriers render inside 16.7 ms/frame" read over budget in a fast-tier run
 * on a 4-core host at load ~13, on a change that never touches the render
 * path. Split out of `tests/render-fb060-dot-tick-numbers.test.ts` (whose
 * behavioural cases stay fast), budget unchanged.
 *
 * `q13-perf-stability` is the seventh (2026-09-23): q13's granularity-
 * stability case read **43.1%** against its 40% bound in CI run 800's fast
 * tier, on a commit that never touches the sim tick. Split out of
 * `tests/q13-perf-ratio.test.ts` with the recorded-ceiling case (the same
 * wall-clock measurement); both bounds unchanged.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/a10-performance.test.ts',
      'tests/p10e-perf-budget.test.ts',
      'tests/q13-perf-sensitivity.test.ts',
      'tests/terrain-cost-retry-ratio.test.ts',
      'tests/terrain-cost-ceiling.test.ts',
      'tests/render-fb060-dot-tick-perf.test.ts',
      'tests/q13-perf-stability.test.ts',
    ],
    testTimeout: 240000,
    fileParallelism: false,
    poolOptions: { threads: { singleThread: true, minThreads: 1, maxThreads: 1 } },
  },
});
