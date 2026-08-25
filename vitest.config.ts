import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // A10 timing runs on its own; see vitest.perf.config.ts.
    exclude: ['tests/a10-performance.test.ts'],
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
