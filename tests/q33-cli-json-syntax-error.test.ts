/**
 * Pins a gap q25/q28 do not close (BACKLOG-QUALITY q33): a JSON *syntax*
 * error in a `/data` file — as opposed to the *schema* violations q25/q28
 * already cover (a value of the wrong type, caught by `loadContent()`'s zod
 * parse at runtime) — crashes with a raw, uncaught esbuild `TransformError`
 * stack trace that no `main()`-level try/catch can intercept.
 *
 * Why no try/catch can help: `src/sim/content.ts` imports every `/data/*.json`
 * file via a static ES module `import` (`import towersRaw from
 * '../../data/towers.json'`). `tsx`'s esbuild transform parses that JSON at
 * *module-load* time, before `main()`'s own code — including every try/catch
 * q25/q28 added — ever runs. A schema violation (retyped field, still valid
 * JSON) surfaces *inside* `loadContent()`'s zod parse, which is why q25/q28's
 * fix works for that case; a syntax error (unclosed brace) never reaches
 * `loadContent()` at all.
 *
 * Verified live before writing this test (throwaway scratch copy, not part of
 * the suite, per this lane's own convention — see q25/q28's doc comments):
 * wrote `{ not valid json` to a scratch copy's `data/towers.json` and ran all
 * four lane CLIs.
 *
 *   - `content-census.ts`, `phase-coverage.ts`, `soak.ts` — all import
 *     `src/sim/content.ts` transitively (`Run` → `loadContent()`) and all
 *     three crash identically: exit 1, empty stdout, a multi-frame
 *     `node:internal/modules/run_main` + `Error: Transform failed with 1
 *     error: ...data/towers.json:1:2: ERROR: Expected string in JSON but
 *     found "not"` stack on stderr. `--json` mode is unaffected by the flag —
 *     the crash happens before `main()` ever inspects `argv`.
 *   - `gate-audit.ts` is the one exception, not a fourth instance of the
 *     bug: reading its imports shows it has none of `src/sim/content.ts`,
 *     `Run` or `loadContent` anywhere — it works by `readFileSync`-ing
 *     `SPEC-FINAL.md` and grepping test files by name, never touching
 *     `/data` at all. A corrupted `data/towers.json` leaves it at a clean
 *     exit 0, table intact. Worth pinning by name too, since "all four CLIs"
 *     was the assumption this item's own acceptance text carried in from
 *     QA's session-23 finding, and it is one CLI too many.
 *
 * The fix (dynamic `import()` of a pre-validated string read via
 * `readFileSync`/`JSON.parse` inside `loadContent()`) touches
 * `src/sim/content.ts`, outside this lane's Scope (`/src/**`) — filed as
 * main-lane work in BACKLOG-QUALITY.md's Log, per q18's precedent for an
 * unfixable-from-here gap.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRATCH_ROOT = path.join(ROOT, 'bench', '.tmp', 'q33-cli-json-syntax-error-scratch');
const COPY_DIRS = ['src', 'tools', 'data'];
const COPY_FILES = ['tsconfig.json', 'SPEC-FINAL.md', 'BACKLOG-QUALITY.md'];
const NESTED_TSX_TIMEOUT_MS = 60_000;

// Windows can hold a just-exited nested process's file handle open for a few
// ms after execFileSync returns (q25/q28/mutation-probe hit the same
// EBUSY/EPERM shape under load) — retry rather than fail cleanup.
const RM_RETRY = { recursive: true, force: true, maxRetries: 5, retryDelay: 200 } as const;

function scratchPath(name: string): string {
  return path.join(SCRATCH_ROOT, `${name}-${process.pid}-${Math.random().toString(36).slice(2)}`);
}

function populateScratch(dir: string): void {
  rmSync(dir, RM_RETRY);
  mkdirSync(dir, { recursive: true });
  for (const d of COPY_DIRS) cpSync(path.join(ROOT, d), path.join(dir, d), { recursive: true });
  for (const f of COPY_FILES) cpSync(path.join(ROOT, f), path.join(dir, f));
}

/** A genuine syntax error, not a schema violation — never valid JSON at all, so it fails at the `import` transform, not inside `loadContent()`. */
function breakTowersJsonSyntax(dir: string): void {
  writeFileSync(path.join(dir, 'data', 'towers.json'), '{ not valid json');
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
  ['content-census.ts', [] as string[]],
  ['phase-coverage.ts', ['--seeds', '1']],
  ['soak.ts', ['--seeds', '1']],
])('%s crashes uncaught on a /data JSON syntax error (q33)', (tool, args) => {
  it('exits 1 with a raw esbuild TransformError stack trace, not a one-line message', () => {
    const dir = scratchPath(tool.replace('.ts', ''));
    try {
      populateScratch(dir);
      breakTowersJsonSyntax(dir);
      const { exitCode, stdout, stderr } = runCli(dir, tool, args);
      // Today's actual (broken) behaviour, pinned so a future fix to
      // src/sim/content.ts shows up as this test going red rather than
      // silently rotting as an unnoticed improvement.
      expect(exitCode).not.toBe(0);
      expect(stdout).toBe('');
      expect(stderr).toMatch(ESBUILD_TRANSFORM_ERROR);
      expect(stderr).toMatch(RAW_STACK_FRAME);
      expect(stderr).toContain('towers.json');
      // None of the three CLIs' own `main()`-level error prefixes ever get a
      // chance to print — the crash precedes their try/catch entirely.
      expect(stderr).not.toContain(`${tool.replace('.ts', '')}:`);
    } finally {
      rmSync(dir, RM_RETRY);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);

  it('the same corruption under --json still crashes uncaught (the flag is never reached)', () => {
    const dir = scratchPath(`${tool.replace('.ts', '')}-json`);
    try {
      populateScratch(dir);
      breakTowersJsonSyntax(dir);
      const { exitCode, stdout, stderr } = runCli(dir, tool, [...args, '--json']);
      expect(exitCode).not.toBe(0);
      // A fixed CLI would emit one parseable `{error}` line under --json
      // (q25/q28's own bar); today it emits nothing on stdout at all.
      expect(stdout).toBe('');
      expect(stderr).toMatch(ESBUILD_TRANSFORM_ERROR);
    } finally {
      rmSync(dir, RM_RETRY);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);
});

describe('gate-audit.ts is unaffected by a /data JSON syntax error (q33)', () => {
  it('never touches /data at all, so a corrupted towers.json does not stop it', () => {
    const dir = scratchPath('gate-audit');
    try {
      populateScratch(dir);
      breakTowersJsonSyntax(dir);
      const { exitCode, stdout, stderr } = runCli(dir, 'gate-audit.ts', []);
      expect(stderr, stderr).toBe('');
      expect(exitCode).toBe(0);
      expect(stdout).toContain('gate audit');
    } finally {
      rmSync(dir, RM_RETRY);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);
});
