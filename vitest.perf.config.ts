import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

/**
 * The A10 performance pass runs on its own, single-threaded: measured against
 * eighteen other test files competing for cores, the numbers say more about the
 * harness than about the sim.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/a10-performance.test.ts'],
    testTimeout: 240000,
    fileParallelism: false,
    poolOptions: { threads: { singleThread: true, minThreads: 1, maxThreads: 1 } },
  },
});
