/**
 * A second, distinct CLI-crash mechanism from q33/q37/q41/q42/q46
 * (BACKLOG-QUALITY q45): those all corrupt `/data` with a JSON *syntax*
 * error, which fails at ES-module *transform* time — before any of a file's
 * own code, try/catch included, ever runs (the reason those fixes all live
 * outside this lane's Scope, in `src/sim/content.ts`). A *schema* violation
 * — valid JSON, wrong shape — is different: `loadContent()`'s zod `.parse()`
 * throws its `ZodError` at **runtime**, inside `loadContent()`'s own call,
 * which a caller's try/catch *would* catch if one existed. q25/q28 already
 * proved this for `content-census.ts`/`gate-audit.ts`/`phase-coverage.ts`/
 * `soak.ts` (all four already wrap `loadContent()`); this file covers the
 * ten CLI-invocable tools that never got that wrap: q41's seven
 * content-importing siblings (`perf-ratio.ts`, `a4probe.ts`, `a5probe.ts`,
 * `fuzz-input.ts`, `fuzz-save.ts`, `fuzz-weapon-boundary.ts`,
 * `fuzz-command-domain.ts` — q41's eighth tool, `mutation-probe.ts`, never
 * imports content at all and is exempt, confirmed by its own describe block
 * in `tests/q41-cli-json-syntax-error-siblings-2.test.ts`) and q46's three
 * (`m20d-run-a4.ts`, `m20d-swarm.ts`, `probe-boss.ts`).
 *
 * Verified live before writing this file (throwaway scratch copies, torn
 * down after, per this lane's own convention): with the old code (no
 * try/catch), all ten crashed with an uncaught multi-line `ZodError` dump
 * and a raw `at ZodObject.parse (...zod/v3/types.js...)` / `at loadContent
 * (...src/sim/content.ts...)` stack on stderr — `a4probe.ts` and
 * `m20d-run-a4.ts` (which imports `a4probe.ts`) crashed even earlier than
 * the other eight, at module-evaluation time (`a4probe.ts` used to call
 * `loadContent()` at module scope, the same "module-top-level load" shape
 * q37/q48 name for `handoff-metrics.ts`), not from inside a `main()` call.
 *
 * The fix landed alongside this test, entirely inside this lane's Scope
 * (`tools/**`, unlike q33/q37/q41/q42/q46's out-of-Scope class): each of
 * the seven `main()`/`invokedDirectly`-shaped tools gets a try/catch around
 * its `main()` call site; `fuzz-command-domain.ts`'s `main()` fires an
 * unawaited async IIFE, so it gets a `.catch()` on that IIFE instead (a
 * plain call-site try/catch cannot see a promise rejection); the three
 * top-level-script tools (`m20d-run-a4.ts`, `m20d-swarm.ts`,
 * `probe-boss.ts`) get their executable body wrapped in a top-level
 * try/catch; and `a4probe.ts`'s module-scope `loadContent()` call is
 * guarded by its own try/catch that `process.exit(1)`s on failure (TS
 * narrows `content`'s definite assignment across the catch because
 * `process.exit` is typed `never`), which is also what fixes
 * `m20d-run-a4.ts`'s crash since it imports `a4probe.ts`. Every fix follows
 * q28/q38's established shape: `<tool>: <message>` on stderr (whitespace
 * collapsed to one line), `process.exitCode = 1` (or `process.exit(1)` at
 * module scope), no raw stack frame, no literal `ZodError` in the message
 * (zod's `Error#message` is just the JSON issues array; the word only
 * appears in the constructor-name stack frame the fix removes).
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRATCH_ROOT = path.join(ROOT, 'bench', '.tmp', 'q45-cli-schema-violation-scratch');
const COPY_DIRS = ['src', 'tools', 'data', 'tests'];
const COPY_FILES = ['tsconfig.json', 'SPEC-FINAL.md', 'BACKLOG-QUALITY.md'];
const NESTED_TSX_TIMEOUT_MS = 60_000;

// Windows can hold a just-exited nested process's file handle open for a few
// ms after execFileSync returns (q25/q28/q33/q37/q41 hit the same
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

/**
 * A genuine schema violation, not a syntax error — still valid JSON, so it
 * fails inside `loadContent()`'s zod parse at runtime, not at the esbuild
 * transform step (q25's own `corruptTowersData` convention, reused here).
 */
function corruptTowersSchema(dir: string): void {
  const p = path.join(dir, 'data', 'towers.json');
  const j = JSON.parse(readFileSync(p, 'utf8'));
  j.upgradeStepMul = 'broken';
  writeFileSync(p, JSON.stringify(j, null, 2));
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

describe.each([
  ['perf-ratio.ts', ['--calib-iters', '1000', '--tick-samples', '2'], 'perf-ratio'],
  ['a4probe.ts', [] as string[], 'a4probe'],
  ['a5probe.ts', [] as string[], 'a5probe'],
  ['fuzz-input.ts', ['--n', '10'], 'fuzz-input'],
  ['fuzz-save.ts', ['--n', '10'], 'fuzz-save'],
  ['fuzz-weapon-boundary.ts', [] as string[], 'fuzz-weapon-boundary'],
  ['fuzz-command-domain.ts', [] as string[], 'fuzz-command-domain'],
  ['m20d-run-a4.ts', [] as string[], 'a4probe'],
  ['m20d-swarm.ts', ['1', '30'], 'm20d-swarm'],
  ['probe-boss.ts', [] as string[], 'probe-boss'],
])('%s handles a /data JSON schema violation cleanly (q45)', (tool, args, prefix) => {
  it('exits nonzero with a one-line prefixed message, not a raw ZodError dump', () => {
    const dir = scratchPath(tool.replace('.ts', ''));
    try {
      populateScratch(dir);
      corruptTowersSchema(dir);
      const { exitCode, stdout, stderr } = runCli(dir, tool, args);
      expect(exitCode).not.toBe(0);
      expect(stdout).toBe('');
      expect(stderr).toContain(`${prefix}:`);
      expect(stderr).toContain('upgradeStepMul');
      expect(stderr.trim().split('\n')).toHaveLength(1);
      // The pre-fix shape (confirmed live, see file doc comment): a raw
      // multi-frame Node stack plus the ZodError constructor name inline
      // with the thrown value. A clean handled failure has neither.
      expect(stderr).not.toMatch(RAW_STACK_FRAME);
      expect(stderr).not.toContain('ZodError');
    } finally {
      rmSync(dir, RM_RETRY);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);
});

describe('control: an unmodified /data snapshot still runs cleanly (q45)', () => {
  it('a4probe.ts exits 0 with its normal table against clean data', () => {
    const dir = scratchPath('a4probe-control');
    try {
      populateScratch(dir);
      // Single-tower filter (2026-08-28 merge): the full roster table runs
      // multi-minute against p8a's 18-wave data and blew this case's 60 s
      // nested-process budget — the control only needs "clean data exits 0
      // with the table", which one tower proves.
      const { exitCode, stdout, stderr } = runCli(dir, 'a4probe.ts', ['venom_spore']);
      expect(stderr, stderr).toBe('');
      expect(exitCode).toBe(0);
      expect(stdout).toContain('tower');
    } finally {
      rmSync(dir, RM_RETRY);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);
});
