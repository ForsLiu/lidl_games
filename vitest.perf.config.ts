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
    ],
    testTimeout: 240000,
    fileParallelism: false,
    poolOptions: { threads: { singleThread: true, minThreads: 1, maxThreads: 1 } },
  },
});
