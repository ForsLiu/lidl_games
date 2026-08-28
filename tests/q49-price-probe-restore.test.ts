/**
 * `tools/m20d-price-probe.ts` (BACKLOG-QUALITY q49) is the one tool in this
 * lane's purview that mutates a real, version-controlled `/data` file in
 * place as its documented mechanism: `measure()` reads `data/towers.json`,
 * edits `cost`/`attack.damage`/`upgradeTotalCostMul`/every tower's
 * `stepCost`, writes it back, shells out to `tools/m20d-run-a4.ts`, then
 * restores the original bytes in a `finally`. That restore had never been
 * tested — not even the plain happy path — and the `finally` is untested
 * specifically against a *nested-process failure* (the shelled-out
 * `m20d-run-a4.ts` throwing, which makes `measure()`'s own `execFileSync`
 * call throw before its return value is used).
 *
 * Both cases run against a scratch copy (this lane's established idiom —
 * see tests/q45-cli-schema-violation.test.ts et al.), `cwd` set to the
 * scratch dir so the tool's relative `data/towers.json` path can never touch
 * the real repo file even if the restore were broken.
 *
 * The nested-failure case forces `m20d-run-a4.ts` to throw its existing
 * `not a soul tower: ...` error (tools/m20d-run-a4.ts:6) without touching
 * argv, which `tools/m20d-price-probe.ts` hardcodes to `venom_spore`:
 * instead, `venom_spore.soul` is nulled in the scratch `data/towers.json`
 * before running the probe, which drops it out of `a4probe.ts`'s
 * `SOUL_TOWERS` (filtered on `t.soul !== null`) — the same effect as an
 * unknown key, reached through the one lever this test actually controls.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRATCH_ROOT = path.join(ROOT, 'bench', '.tmp', 'q49-price-probe-restore-scratch');
const COPY_DIRS = ['src', 'tools', 'data', 'tests'];
const COPY_FILES = ['tsconfig.json'];
const NESTED_TSX_TIMEOUT_MS = 60_000;

// Windows can hold a just-exited nested process's file handle open for a few
// ms after execFileSync returns (q25/q28/q33/q37/q41/q45 hit the same
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

/**
 * Drops `venom_spore` out of a4probe.ts's `SOUL_TOWERS` so m20d-run-a4.ts's
 * hardcoded call throws `not a soul tower: venom_spore`. Edited with a
 * targeted string replace, not a JSON.parse/JSON.stringify round-trip: the
 * file ships CRLF and `measure()`'s own writes are LF-only, so a
 * round-trip here would silently pre-normalize line endings to the same
 * shape `measure()` produces — the exact thing that would need the
 * `finally` restore to detect, making the "before" snapshot the test reads
 * next indistinguishable from a broken restore's "after" (found by
 * qa-playtester, session 48: the round-trip version of this function made
 * the nested-failure test pass even with the `finally` write deleted).
 */
function breakVenomSporeSoul(dir: string): void {
  const p = towersPath(dir);
  const before = readFileSync(p, 'utf8');
  const anchor = '"soul": "toxic_trail"';
  const count = before.split(anchor).length - 1;
  if (count !== 1) {
    throw new Error(`breakVenomSporeSoul: expected exactly one occurrence of ${JSON.stringify(anchor)}, found ${count}`);
  }
  writeFileSync(p, before.replace(anchor, '"soul": null'));
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

describe('m20d-price-probe.ts restores data/towers.json (q49)', () => {
  it(
    'happy path: a successful run leaves the file byte-identical before and after',
    () => {
      const dir = scratchPath('happy');
      try {
        populateScratch(dir);
        const before = readFileSync(towersPath(dir), 'utf8');
        const { exitCode, stdout, stderr } = runPriceProbe(dir, 'u2');
        expect(stderr, stderr).toBe('');
        expect(exitCode).toBe(0);
        expect(stdout).toContain('u2');
        const after = readFileSync(towersPath(dir), 'utf8');
        expect(after).toBe(before);
      } finally {
        rmSync(dir, RM_RETRY);
      }
    },
    NESTED_TSX_TIMEOUT_MS + 10_000,
  );

  it(
    'nested-process failure: the finally still restores the file byte-identical, even though the CLI itself exits nonzero',
    () => {
      const dir = scratchPath('nested-failure');
      try {
        populateScratch(dir);
        breakVenomSporeSoul(dir);
        const before = readFileSync(towersPath(dir), 'utf8');
        const { exitCode, stderr } = runPriceProbe(dir, 'u2');
        // The nested `m20d-run-a4.ts venom_spore` call throws `not a soul
        // tower: venom_spore` and exits 1; price-probe.ts has no top-level
        // try/catch of its own, so that propagates uncaught and the whole
        // CLI exits nonzero too — this test only asserts the restore, not
        // the crash presentation (a separate, already-filed concern, q53).
        expect(exitCode).not.toBe(0);
        expect(stderr).toContain('not a soul tower: venom_spore');
        const after = readFileSync(towersPath(dir), 'utf8');
        expect(after).toBe(before);
      } finally {
        rmSync(dir, RM_RETRY);
      }
    },
    NESTED_TSX_TIMEOUT_MS + 10_000,
  );
});
