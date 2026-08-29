/**
 * `tools/m20d-price-probe.ts`'s `measure()` (BACKLOG-QUALITY q53) reads
 * `data/towers.json` with a bare `JSON.parse(raw)` that used to sit outside
 * the function's only `try` (which wrapped just the nested `execFileSync`
 * call). A JSON syntax error in the file crashed the tool with an uncaught
 * raw `SyntaxError` stack trace instead of a clean CLI message — a distinct
 * crash mechanism from the `loadContent()`/zod class q45/q46/q47 track,
 * since this tool never imports `src/sim/content.ts` and so reads as safe
 * to `tools/cli-crash-coverage.ts` today (q54 generalizes the census to
 * catch this shape).
 *
 * Runs against a scratch copy — this lane's established idiom, see
 * tests/q49-price-probe-restore.test.ts — with `cwd` set to the scratch dir
 * so the tool's relative `data/towers.json` path never touches the real
 * repo file.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRATCH_ROOT = path.join(ROOT, 'bench', '.tmp', 'q53-price-probe-json-crash-scratch');
const COPY_DIRS = ['src', 'tools', 'data', 'tests'];
const COPY_FILES = ['tsconfig.json'];
const NESTED_TSX_TIMEOUT_MS = 60_000;

// Windows can hold a just-exited nested process's file handle open for a few
// ms after execFileSync returns (q25/q28/q33/q37/q41/q45/q49 hit the same
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

function towersPath(dir: string): string {
  return path.join(dir, 'data', 'towers.json');
}

function breakTowersJson(dir: string): void {
  // Confirmed empirically (q53's filing): appending garbage after a
  // complete JSON document makes JSON.parse throw
  // "Unexpected non-whitespace character after JSON..." with no handler
  // above it in the pre-fix tool.
  appendFileSync(towersPath(dir), '}}}not json garbage{{{');
}

function runPriceProbe(dir: string, spec: string): { exitCode: number; stdout: string; stderr: string } {
  try {
    const out = execFileSync('npx', ['tsx', 'tools/m20d-price-probe.ts', spec], {
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

describe('m20d-price-probe.ts fails cleanly on an unparseable data/towers.json (q53)', () => {
  it(
    'exits nonzero with a one-line message, not an uncaught SyntaxError stack trace',
    () => {
      const dir = scratchPath('bad-json');
      try {
        populateScratch(dir);
        breakTowersJson(dir);
        const before = readFileSync(towersPath(dir), 'utf8');
        const { exitCode, stdout, stderr } = runPriceProbe(dir, 'u2');
        expect(exitCode).not.toBe(0);
        // The fixed tool prints its own clean, single-line message...
        expect(stderr).toContain('m20d-price-probe:');
        // ...never the raw multi-line uncaught-exception dump Node prints
        // for an unhandled throw, whose hallmark is one or more "    at "
        // stack-frame lines.
        expect(stderr.split('\n').filter((l) => l.trim().startsWith('at ')).length).toBe(0);
        expect(stdout).not.toContain('u2');
        // A parse failure happens before any mutation, so the file must be
        // left exactly as broken-but-untouched-further — same guarantee
        // q49 pins for the nested-execFileSync-failure path.
        const after = readFileSync(towersPath(dir), 'utf8');
        expect(after).toBe(before);
      } finally {
        rmSync(dir, RM_RETRY);
      }
    },
    NESTED_TSX_TIMEOUT_MS + 10_000,
  );
});
