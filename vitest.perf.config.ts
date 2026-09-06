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
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/a10-performance.test.ts', 'tests/p10e-perf-budget.test.ts'],
    testTimeout: 240000,
    fileParallelism: false,
    poolOptions: { threads: { singleThread: true, minThreads: 1, maxThreads: 1 } },
  },
});
