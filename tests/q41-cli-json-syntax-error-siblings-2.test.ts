/**
 * Second sibling sweep of `tests/q33-cli-json-syntax-error.test.ts` /
 * `tests/q37-cli-json-syntax-error-siblings.test.ts` (BACKLOG-QUALITY q41).
 *
 * q37's own log named the caveat explicitly: QA "did not exhaustively check
 * the remaining `tools/*.ts` files that also transitively import
 * `src/sim/content.ts`... more siblings may exist beyond these three". This
 * item runs that check for real, live, against every remaining CLI-invokable
 * tool (one with a direct-invocation entry point, not just a library module)
 * q33/q37/q38 never covered: `perf-ratio.ts`, `a4probe.ts`, `a5probe.ts`,
 * `mutation-probe.ts`, `fuzz-input.ts`, `fuzz-save.ts`,
 * `fuzz-weapon-boundary.ts`, `fuzz-command-domain.ts`.
 *
 * Verified live before writing this test (throwaway scratch copies, torn
 * down after, per this lane's own convention): wrote `{ not valid json` to a
 * scratch copy's `data/towers.json` and ran all eight directly.
 *
 *   - Seven crash identically to q33/q37's tools: `perf-ratio.ts`,
 *     `a4probe.ts`, `a5probe.ts`, `fuzz-input.ts`, `fuzz-save.ts`,
 *     `fuzz-weapon-boundary.ts` and `fuzz-command-domain.ts` each transitively
 *     import `src/sim/content.ts` — via `src/sim/run` (`Run`/`applyCommand`),
 *     `src/sim/world`, or `loadContent` directly — so the same static
 *     ES-module `import` of every `/data/*.json` file fails at
 *     `tsx`'s esbuild *transform* time, before any of these files' own code
 *     (including `main()`) ever runs. `fuzz-command-domain.ts` is a worker-
 *     threads tool; its *parent* process crashes at import before it ever
 *     spawns a worker, so the worker script's own imports are moot here.
 *     All seven: exit non-zero, empty stdout, the identical multi-frame
 *     `Error: Transform failed with 1 error: ...data/towers.json:1:2: ERROR:
 *     Expected string in JSON but found "not"` stack on stderr.
 *   - `mutation-probe.ts` is a **third exception**, the same shape as
 *     `gate-audit.ts`'s q33 carve-out: reading its imports shows it has none
 *     of `src/sim/content.ts`, `Run`, `World` or `loadContent` anywhere — it
 *     only imports `node:child_process`/`node:fs`/`node:path`/`node:url` at
 *     module scope and does all of its sim-touching work by spawning nested
 *     `npx vitest run` subprocesses against its own scratch copies. A
 *     corrupted `data/towers.json` in the outer scratch this test builds
 *     (deliberately built with q37's minimal `COPY_DIRS`/`COPY_FILES`, no
 *     `tests/` directory) does not stop `mutation-probe.ts` from loading and
 *     running its own `main()` at all — it gets all the way into
 *     `probeControl`'s own `populateScratch` and fails there, on an unrelated
 *     `ENOENT` (this scratch has no `tests/` dir for it to copy), never on an
 *     esbuild `TransformError`. Running `mutation-probe.ts`'s `main()` to a
 *     real, full completion is deliberately not attempted here — its own doc
 *     comment records ~23 nested `npx vitest run` invocations at 15-30s each,
 *     which would make this file's own runtime a multi-minute outlier for a
 *     question ("does the JSON-syntax bug crash it at import time") that a
 *     fast, deterministic `ENOENT` already answers definitively: no.
 *
 * The fix for the seven affected tools is the same out-of-Scope
 * `src/sim/content.ts` change q33/q37 already filed for main lane (dynamic
 * `import()` of a pre-validated string read via `readFileSync`/`JSON.parse`
 * inside `loadContent()`) — filed once, covers every affected CLI at once.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRATCH_ROOT = path.join(ROOT, 'bench', '.tmp', 'q41-cli-json-syntax-error-siblings-2-scratch');
const COPY_DIRS = ['src', 'tools', 'data'];
const COPY_FILES = ['tsconfig.json', 'SPEC-FINAL.md', 'BACKLOG-QUALITY.md'];
const NESTED_TSX_TIMEOUT_MS = 60_000;

// Windows can hold a just-exited nested process's file handle open for a few
// ms after execFileSync returns (q25/q28/q33/q37/mutation-probe hit the same
// EBUSY/EPERM shape under load) — retry rather than fail cleanup.
const RM_RETRY = { recursive: true, force: true, maxRetries: 5, retryDelay: 200 } as const;

function scratchPath(name: string): string {
  return path.join(SCRATCH_ROOT, `${name}-${process.pid}-${Math.random().toString(36).slice(2)}`);
}

/**
 * Files a specific tool needs in the scratch beyond `COPY_DIRS`, because its
 * own import graph reaches outside them.
 *
 * `tools/perf-ratio.ts` statically imports `../tests/helpers` (it reuses
 * `cfg()` rather than re-deriving a RunConfig). The scratch deliberately has no
 * `tests/` directory — that minimality is what makes the `mutation-probe`
 * carve-out in this file's header true — so Node failed to *resolve* that
 * import and exited with `ERR_MODULE_NOT_FOUND` **before** esbuild ever
 * transformed the broken JSON. The assertion below then read a
 * module-not-found stack where it expected a TransformError, which is a broken
 * fixture reporting a false negative, not a finding about the tool. Copying the
 * one module the tool imports restores the question this file is actually
 * asking: does a `/data` syntax error crash it at import time?
 *
 * Deliberately per-tool rather than added to `COPY_DIRS`: a scratch that
 * carries all of `tests/` would change what `mutation-probe.ts` does here, and
 * this file's header documents that behaviour by name.
 */
const EXTRA_FILES: Record<string, string[]> = {
  'perf-ratio.ts': [path.join('tests', 'helpers.ts')],
};

function populateScratch(dir: string, tool?: string): void {
  rmSync(dir, RM_RETRY);
  mkdirSync(dir, { recursive: true });
  for (const d of COPY_DIRS) cpSync(path.join(ROOT, d), path.join(dir, d), { recursive: true });
  for (const f of COPY_FILES) cpSync(path.join(ROOT, f), path.join(dir, f));
  for (const f of (tool && EXTRA_FILES[tool]) ?? []) {
    mkdirSync(path.join(dir, path.dirname(f)), { recursive: true });
    cpSync(path.join(ROOT, f), path.join(dir, f));
  }
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
  ['perf-ratio.ts', ['--calib-iters', '1000', '--tick-samples', '2']],
  ['a4probe.ts', [] as string[]],
  ['a5probe.ts', [] as string[]],
  ['fuzz-input.ts', ['--n', '10']],
  ['fuzz-save.ts', ['--n', '10']],
  ['fuzz-weapon-boundary.ts', [] as string[]],
  ['fuzz-command-domain.ts', [] as string[]],
])('%s crashes uncaught on a /data JSON syntax error (q41)', (tool, args) => {
  it('exits non-zero with a raw esbuild TransformError stack trace, not a one-line message', () => {
    const dir = scratchPath(tool.replace('.ts', ''));
    try {
      populateScratch(dir, tool);
      breakTowersJsonSyntax(dir);
      const { exitCode, stdout, stderr } = runCli(dir, tool, args);
      // Today's actual (broken) behaviour, pinned so a future fix to
      // src/sim/content.ts shows up as this test going red rather than
      // silently rotting as an unnoticed improvement — the same idiom
      // q33/q37 pin for their own CLIs.
      expect(exitCode).not.toBe(0);
      expect(stdout).toBe('');
      expect(stderr).toMatch(ESBUILD_TRANSFORM_ERROR);
      expect(stderr).toMatch(RAW_STACK_FRAME);
      expect(stderr).toContain('towers.json');
    } finally {
      rmSync(dir, RM_RETRY);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);
});

describe('mutation-probe.ts is unaffected by a /data JSON syntax error at import time (q41)', () => {
  it('never imports src/sim/content.ts (or Run/World/loadContent), so it reaches its own logic instead of crashing at the transform step', () => {
    const dir = scratchPath('mutation-probe');
    try {
      populateScratch(dir);
      breakTowersJsonSyntax(dir);
      // No tests/ dir in this minimal scratch (matching q33/q37's own
      // COPY_DIRS) — mutation-probe.ts's own populateScratch() tries to copy
      // one and fails with ENOENT. That failure, not an esbuild
      // TransformError, is the point: it proves main() started running its
      // own logic well past module load, unlike the seven tools above which
      // never get past `import`. A real (non-corrupted, full-fixture) run of
      // mutation-probe.ts is exercised elsewhere by tests/q14-mutation-smoke
      // .test.ts; re-deriving that here would add ~23 nested `npx vitest run`
      // invocations to this file for a question a fast ENOENT already answers.
      const { exitCode, stdout, stderr } = runCli(dir, 'mutation-probe.ts', []);
      expect(exitCode).not.toBe(0);
      expect(stdout).toBe('');
      expect(stderr).not.toMatch(ESBUILD_TRANSFORM_ERROR);
      expect(stderr).toContain('ENOENT');
      expect(stderr).toContain('mutation-probe.ts');
    } finally {
      rmSync(dir, RM_RETRY);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);
});
