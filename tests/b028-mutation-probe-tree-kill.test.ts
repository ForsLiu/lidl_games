/**
 * b028 — a nested `npx vitest run` killed on timeout by
 * `tools/mutation-probe.ts` previously left its descendant processes running
 * (191+ orphaned `vitest` processes observed on Windows under host load,
 * PROGRESS.md's fb004 session): the old `execFileSync(..., { timeout })`
 * signals only the immediate child — `cmd.exe`/`sh -c`, since the call uses
 * `shell: true` — never the `npx` -> `node` -> vitest worker/fork processes
 * underneath it.
 *
 * Two things are pinned here:
 *  1. `killProcessTree` actually kills a whole tree, not just the pid it's
 *     given — proven with a real spawned parent + detached grandchild, where
 *     only the grandchild's survival is observable (a marker file it writes
 *     after a delay chosen to outlive the kill).
 *  2. The real timeout path (`probeControl` -> `runVitest`) rejects instead
 *     of hanging when a nested run overruns its budget, and does so quickly
 *     — proving the timeout/kill wiring is reachable in the actual code path
 *     mutation-probe.ts uses, not just in isolation.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { killProcessTree, probeControl } from '../tools/mutation-probe';

describe('b028 — mutation-probe kills the whole nested process tree on timeout', () => {
  it('killProcessTree kills a spawned grandchild, not just its direct argument', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'b028-tree-kill-'));
    const marker = path.join(dir, 'grandchild-woke.txt');
    let parent: ReturnType<typeof spawn> | undefined;
    try {
      // Parent: spawns a detached grandchild that writes `marker` after a
      // delay, then itself just idles — mirrors npx -> node -> vitest-worker.
      const script = `const { spawn } = require('child_process');
const gc = spawn(process.execPath, ['-e', 'setTimeout(() => require("fs").writeFileSync(process.argv[1], "woke"), 2500)', ${JSON.stringify(marker)}], { detached: true, stdio: 'ignore' });
gc.unref();
setInterval(() => {}, 1000);`;
      parent = spawn(process.execPath, ['-e', script], {
        detached: process.platform !== 'win32',
        stdio: 'ignore',
      });
      // Give the parent a moment to actually spawn the grandchild before we
      // kill the tree.
      await new Promise((r) => setTimeout(r, 400));
      expect(parent.pid, 'parent must have a real pid for killProcessTree to target').toBeDefined();
      killProcessTree(parent.pid!);
      // Wait past the grandchild's own marker-write delay.
      await new Promise((r) => setTimeout(r, 3000));
      expect(
        existsSync(marker),
        'the grandchild survived killProcessTree and wrote its marker — orphaned, the exact b028 bug',
      ).toBe(false);
    } finally {
      if (parent && !parent.killed) {
        try {
          killProcessTree(parent.pid!);
        } catch {
          // best-effort cleanup
        }
      }
      rmSync(dir, { recursive: true, force: true });
    }
  }, 15_000);

  it('a nested vitest run that blows its timeout rejects instead of hanging the harness', async () => {
    const start = Date.now();
    // 200ms is far shorter than `npx vitest run` can possibly start and
    // finish in, so this deterministically exercises the timeout/kill path
    // without waiting on the real ~150s ceiling.
    await expect(probeControl('tests/q8-save-roundtrip.test.ts', 200)).rejects.toThrow(/killed/i);
    expect(Date.now() - start).toBeLessThan(20_000);
  }, 30_000);
});
