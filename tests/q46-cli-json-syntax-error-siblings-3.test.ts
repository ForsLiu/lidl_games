/**
 * Third sibling sweep of `tests/q33-cli-json-syntax-error.test.ts` /
 * `tests/q37-cli-json-syntax-error-siblings.test.ts` /
 * `tests/q41-cli-json-syntax-error-siblings-2.test.ts` (BACKLOG-QUALITY q46).
 *
 * q41's own grep covered every `tools/*.ts` file that reads like a CLI
 * (a `main`/argv-driven tool). It missed three more, because none of them
 * matches that naming pattern: `tools/m20d-run-a4.ts` and
 * `tools/m20d-swarm.ts` (module-scope calls into `src/sim`, no `main()`
 * wrapper) and `tools/probe-boss.ts` (imports `../tests/helpers`, which
 * imports `../src/sim/run` -> `./world` -> `./content`, a *value* import
 * rather than the more obvious `loadContent` call the other tools make
 * directly).
 *
 * Verified live before writing this test (throwaway scratch copies, torn
 * down after, per this lane's own convention): wrote `{ not valid json` to a
 * scratch copy's `data/towers.json` and ran all three directly.
 *
 *   - All three crashed identically to q33/q37/q41's tools, and for the same
 *     reason: `m20d-run-a4.ts` imports `./a4probe`, which itself has a
 *     `try`/`catch` around its own `loadContent()` *call* — but that catch
 *     cannot help here, because the crash happens one step earlier, while
 *     `tsx`'s esbuild is still *transforming* the static `import` of
 *     `content.ts` (which statically imports every `/data/*.json` file).
 *     A transform-time failure happens before any of these files' own code
 *     runs, so it is invisible to a `try`/`catch` that only wraps a function
 *     *call* inside the file — the same distinction q45 draws between a
 *     syntax error (uncatchable here) and a schema violation (catchable,
 *     because that failure happens at runtime inside `loadContent()`, which
 *     a wrapping `try` reaches). `m20d-swarm.ts` imports `loadContent`
 *     directly and has the identical shape.
 *   - `probe-boss.ts` needed a `tests/` directory alongside `src`/`tools`/
 *     `data` in the scratch copy to even reach that crash — its own import
 *     chain resolved `../tests/helpers` before Node got far enough to
 *     transform `content.ts`. Without a `tests/` copy it failed earlier, on
 *     an unrelated `ERR_MODULE_NOT_FOUND` for the missing `tests/helpers`
 *     module — still uncaught, but a different failure than the one this
 *     item pinned. Fixed at BACKLOG-QUALITY q48: `probe-boss.ts` has exactly
 *     one import (`../tests/helpers`) used only inside its own top-level
 *     `try`, with no external caller of its own — the same one-file,
 *     one-caller shape q38 fixed for `content-census.ts`. Both the
 *     with-`tests/` and without-`tests/` cases are caught cleanly; see the
 *     fixed-behaviour describe block below.
 *
 * **`m20d-run-a4.ts`/`m20d-swarm.ts` fixed at BACKLOG b045**: q48's own log
 * originally judged the dynamic-import workaround inapplicable to these two
 * because — unlike `probe-boss.ts` — they reach `content.ts` through
 * `Run`/`World`/etc., functions several *other* files also import directly
 * (the `sim.ts`/`sweep.ts`/`a4probe.ts` shape q48's table calls unfixable).
 * Re-reading q48's own table entry for these two specifically shows that
 * reasoning doesn't hold for *them*: `m20d-run-a4.ts`'s only import is
 * `./a4probe`'s named exports (zero external callers of `m20d-run-a4.ts`
 * itself), and `m20d-swarm.ts`'s only content-reaching imports (`loadContent`,
 * `World`, `spawnEnemy`/`updateEnemies`, `buildTower`/`maxLevel`/
 * `updateTowers`/`upgradeTower`, `updateProjectiles`) are each also used only
 * inside its own top-level `try`, with zero external callers of its own — the
 * same one-file, one-caller shape q38/q48 already fixed for
 * `content-census.ts`/`probe-boss.ts`. Deferring every one of each file's
 * former static value imports behind a dynamic `import()` (the type-only
 * `World` import `m20d-swarm.ts` keeps for `freeTile`'s parameter type is
 * erased by the compiler regardless, so it carries no such risk) closes both
 * for the same reason `probe-boss.ts` closed: the entire problematic static
 * chain — including whatever *that* imported module's own static imports
 * are — is deferred to the dynamic `import()` call itself, which already
 * runs inside this file's own `try`. Verified live for both, in both the
 * `towers.json`-broken and `warden.json`-broken cases (the latter per b045's
 * own acceptance bar); see the fixed-behaviour describe block below.
 *
 * The remaining nine q41/q46 CLIs (`perf-ratio.ts`, `a4probe.ts`,
 * `a5probe.ts`, `fuzz-input.ts`, `fuzz-save.ts`, `fuzz-weapon-boundary.ts`,
 * `fuzz-command-domain.ts`, plus `sweep.ts`/`handoff-metrics.ts`/
 * `p10k-sweep.ts` from q37) stay out of Scope for this drop-in fix — each has
 * multiple *other* files that import its own functions synchronously
 * (q48's table), so deferring those imports behind a dynamic `import()` would
 * change those functions' call signature for every external caller too, not
 * just the CLI entry point. They still want the same out-of-Scope
 * `src/sim/content.ts` change q33/q37/q41 already filed for main lane
 * (dynamic `import()` of a pre-validated string read via
 * `readFileSync`/`JSON.parse` inside `loadContent()`) — filed once, covers
 * every remaining affected CLI at once.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRATCH_ROOT = path.join(ROOT, 'bench', '.tmp', 'q46-cli-json-syntax-error-siblings-3-scratch');
const COPY_DIRS = ['src', 'tools', 'data'];
const COPY_FILES = ['tsconfig.json', 'SPEC-FINAL.md', 'BACKLOG-QUALITY.md'];
const NESTED_TSX_TIMEOUT_MS = 60_000;

// Windows can hold a just-exited nested process's file handle open for a few
// ms after execFileSync returns (q25/q28/q33/q37/q41 hit the same
// EBUSY/EPERM shape under load) — retry rather than fail cleanup.
const RM_RETRY = { recursive: true, force: true, maxRetries: 5, retryDelay: 200 } as const;

function scratchPath(name: string): string {
  return path.join(SCRATCH_ROOT, `${name}-${process.pid}-${Math.random().toString(36).slice(2)}`);
}

function populateScratch(dir: string, extraDirs: string[] = []): void {
  rmSync(dir, RM_RETRY);
  mkdirSync(dir, { recursive: true });
  for (const d of [...COPY_DIRS, ...extraDirs]) cpSync(path.join(ROOT, d), path.join(dir, d), { recursive: true });
  for (const f of COPY_FILES) cpSync(path.join(ROOT, f), path.join(dir, f));
}

/** A genuine syntax error, not a schema violation — never valid JSON at all, so it fails at the `import` transform, not inside `loadContent()`. */
function breakTowersJsonSyntax(dir: string): void {
  writeFileSync(path.join(dir, 'data', 'towers.json'), '{ not valid json');
}

/** Same shape as `breakTowersJsonSyntax`, on the file `content.ts` parses eagerly and separately (`wardenBase`) — b045's own acceptance bar wants both recorded. */
function breakWardenJsonSyntax(dir: string): void {
  writeFileSync(path.join(dir, 'data', 'warden.json'), '{ not valid json');
}

function runCli(dir: string, tool: string, args: string[]): { exitCode: number; stdout: string; stderr: string } {
  try {
    const out = execFileSync('npx', ['tsx', `tools/${tool}`, ...args], {
      cwd: dir,
      shell: true,
      stdio: 'pipe',
      timeout: NESTED_TSX_TIMEOUT_MS,
      env: { ...process.env },
    });
    return { exitCode: 0, stdout: out.toString(), stderr: '' };
  } catch (err) {
    const e = err as { status?: number | null; stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      exitCode: typeof e.status === 'number' ? e.status : 1,
      stdout: e.stdout?.toString() ?? '',
      stderr: e.stderr?.toString() ?? '',
    };
  }
}

const RAW_STACK_FRAME = /\bat \S+ \(/;
const ESBUILD_TRANSFORM_ERROR = /Transform failed with \d+ error/;

describe.each([
  ['m20d-run-a4.ts', ['venom_spore']],
  ['m20d-swarm.ts', [] as string[]],
])('%s no longer crashes uncaught on a /data JSON syntax error (BACKLOG b045)', (tool, args) => {
  // b045: each file's former static value imports that reached
  // `src/sim/content.ts` (directly or via `./a4probe`/`../src/sim/world`/
  // `../src/sim/combat`) are now dynamic `import()`s made from inside the
  // file's own top-level `try` — the same workaround q38/q48 applied to
  // `content-census.ts`/`probe-boss.ts`. A transform failure anywhere in
  // that dynamically imported subgraph now surfaces as an ordinary rejected
  // promise the file's own `catch` sees, instead of failing before the
  // `try` ever starts.
  it('a towers.json syntax error exits non-zero with a clean one-line message, not a raw stack trace', () => {
    const dir = scratchPath(tool.replace('.ts', ''));
    try {
      populateScratch(dir);
      breakTowersJsonSyntax(dir);
      const { exitCode, stdout, stderr } = runCli(dir, tool, args);
      expect(exitCode).not.toBe(0);
      expect(stdout).toBe('');
      expect(stderr).toContain(`${tool.replace('.ts', '')}:`);
      expect(stderr.trim().split('\n')).toHaveLength(1);
      expect(stderr).not.toMatch(RAW_STACK_FRAME);
      // Still the same underlying esbuild transform failure — the fix only
      // moves *when* it runs, not what it is (q38/q48's fixes did the same).
      expect(stderr).toMatch(ESBUILD_TRANSFORM_ERROR);
      expect(stderr).toContain('towers.json');
    } finally {
      rmSync(dir, RM_RETRY);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);

  it('a warden.json syntax error (content.ts\'s other eagerly-parsed file, b045\'s own acceptance bar) is caught just as cleanly', () => {
    const dir = scratchPath(`${tool.replace('.ts', '')}-warden`);
    try {
      populateScratch(dir);
      breakWardenJsonSyntax(dir);
      const { exitCode, stdout, stderr } = runCli(dir, tool, args);
      expect(exitCode).not.toBe(0);
      expect(stdout).toBe('');
      expect(stderr).toContain(`${tool.replace('.ts', '')}:`);
      expect(stderr.trim().split('\n')).toHaveLength(1);
      expect(stderr).not.toMatch(RAW_STACK_FRAME);
      expect(stderr).toMatch(ESBUILD_TRANSFORM_ERROR);
      expect(stderr).toContain('warden.json');
    } finally {
      rmSync(dir, RM_RETRY);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);
});

describe('probe-boss.ts no longer crashes uncaught on a /data JSON syntax error (q48)', () => {
  // BACKLOG-QUALITY q48: probe-boss.ts's static `import { cfg, runWithPolicy }
  // from '../tests/helpers'` (the thing that pulled in content.ts's own
  // static, transform-time-vulnerable import of every /data/*.json file) is
  // now a dynamic `await import('../tests/helpers')` made from *inside* the
  // file's own top-level `try`, the same workaround q38 applied to
  // content-census.ts. A transform failure anywhere in that dynamically
  // imported subgraph now surfaces as an ordinary rejected promise this
  // file's own `catch` sees, instead of failing before the `try` ever starts.
  it('with tests/ present, exits non-zero with a clean one-line message, not a raw stack trace', () => {
    const dir = scratchPath('probe-boss-fixed');
    try {
      populateScratch(dir, ['tests']);
      breakTowersJsonSyntax(dir);
      const { exitCode, stdout, stderr } = runCli(dir, 'probe-boss.ts', []);
      expect(exitCode).not.toBe(0);
      expect(stdout).toBe('');
      expect(stderr).toContain('probe-boss:');
      expect(stderr.trim().split('\n')).toHaveLength(1);
      expect(stderr).not.toMatch(RAW_STACK_FRAME);
      // Still the same underlying esbuild transform failure — q48's fix only
      // moves *when* it runs, not what it is (q38's fix did the same).
      expect(stderr).toMatch(ESBUILD_TRANSFORM_ERROR);
      expect(stderr).toContain('towers.json');
    } finally {
      rmSync(dir, RM_RETRY);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);

  it('without tests/ present, the missing-helpers-module failure is now also caught cleanly', () => {
    // Before q48 this failed even earlier, on an uncaught ERR_MODULE_NOT_FOUND
    // for the missing tests/helpers module (the control case q46 recorded).
    // Deferring the import to inside the try catches *that* failure too, not
    // just the JSON-syntax one — both are just rejected promises now.
    const dir = scratchPath('probe-boss-fixed-no-tests');
    try {
      populateScratch(dir);
      breakTowersJsonSyntax(dir);
      const { exitCode, stdout, stderr } = runCli(dir, 'probe-boss.ts', []);
      expect(exitCode).not.toBe(0);
      expect(stdout).toBe('');
      expect(stderr).toContain('probe-boss:');
      expect(stderr.trim().split('\n')).toHaveLength(1);
      expect(stderr).not.toMatch(RAW_STACK_FRAME);
      // The caught error's `.message` text, not its `.code` — the pre-fix
      // control (q46, above) matched on the raw stack dump containing the
      // error code; this file's own catch only ever prints `err.message`.
      expect(stderr).toContain('Cannot find module');
      expect(stderr).toContain('helpers');
    } finally {
      rmSync(dir, RM_RETRY);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);
});
