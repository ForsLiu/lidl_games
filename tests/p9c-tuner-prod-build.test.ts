/**
 * P9 p9c, gate G15: "a production build containing no endpoint," proven the
 * same way gate C8's fb018 test proves `audit-hook.ts`'s dev surface is
 * gone from a real bundle (tests/c8-dev-profile.test.ts) — build the real
 * client entry in production mode and inspect the emitted JS, rather than
 * trust that the source's own guards *should* work.
 *
 * The strong guarantee this test leans on: `src/devserver/**` (where the
 * actual `fs.writeFileSync`/schema-validation save logic lives) is imported
 * only by `vite.config.ts`, which is never bundled into client output at
 * all — so `saveTunerFile`'s own error strings cannot appear in the client
 * bundle regardless of how well a bundler's dead-code elimination performs.
 * `tunerPlugin`'s `apply: 'serve'` (asserted directly in
 * p9c-tuner-plugin.test.ts) is what keeps the actual HTTP endpoint out of
 * `vite build`/`vite preview` in the first place.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

const outDir = join(process.cwd(), '.p9c-tuner-probe-out');

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true });
});

describe('G15: production build has no Tuner write surface', () => {
  it('the real client bundle contains none of the save endpoint\'s server-only code', () => {
    execFileSync('npx', ['vite', 'build', '--mode', 'production', '--outDir', outDir, '--logLevel', 'error'], {
      cwd: process.cwd(),
      shell: true,
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'production' },
    });
    const bundle = readdirSync(join(outDir, 'assets'))
      .filter((f) => f.endsWith('.js'))
      .map((f) => readFileSync(join(outDir, 'assets', f), 'utf8'))
      .join('\n');

    // `saveTunerFile`'s own error message — only reachable from
    // `src/devserver/**`, which no client-side file imports.
    expect(bundle.includes('unknown tuner file')).toBe(false);
    // Export/Import are allowed in every build (§11: "prod = read-only +
    // Export/Import"), so their marker is expected to survive.
    expect(bundle.includes('sw-tuner-export')).toBe(true);
  }, 120_000);
});
