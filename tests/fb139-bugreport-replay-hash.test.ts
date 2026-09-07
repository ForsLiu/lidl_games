/**
 * fb139's actual point: a bug report is reproducible, not just a note. The
 * `{ config, inputLog }` bundle `saveBugReport` writes under `/replays` is
 * the same `RecordedRun` shape architecture rule 2's replay/hash machinery
 * already uses (`src/sim/run.ts`) — this pins that a bundle captured
 * mid-run, saved to disk and read back replays to a world that hashes
 * identically to the live one at the moment the report was taken, and that
 * a tampered bundle is caught (the hash check has teeth, not just plumbing).
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { saveBugReport } from '../src/devserver/bugReportSave';
import { Run, hashWorld } from '../src/sim/run';
import { makePolicy } from '../src/bots';
import '../src/bots';
import { cfg } from './helpers';

function playToTick(seed: number, targetTick: number): { run: Run; inputLog: object[] } {
  const config = cfg({ seed, allocated: [] });
  const run = new Run({ ...config, policy: 'hybrid' });
  const policy = makePolicy('hybrid');
  const inputLog: object[] = [];
  while (run.world.tick < targetTick && !run.done) {
    const input = policy.act(run.world);
    inputLog.push(input);
    run.step(input);
  }
  return { run, inputLog };
}

describe('fb139: the saved replay bundle reproduces the recorded world exactly', () => {
  it('replaying a saved bug-report bundle hashes identically to the live world it was captured from', () => {
    const { run, inputLog } = playToTick(3, 400);
    const liveHash = hashWorld(run.world);
    const w = run.world;

    const inbox = mkdtempSync(join(tmpdir(), 'stonewake-bugreport-hash-inbox-'));
    const replays = mkdtempSync(join(tmpdir(), 'stonewake-bugreport-hash-replays-'));
    try {
      const result = saveBugReport(
        {
          note: 'test repro',
          meta: {
            classKey: w.cfg.classKey,
            core: w.coreKey,
            tier: w.cfg.tier,
            phase: w.phase,
            wavesCleared: w.wavesCleared,
            tick: w.tick,
            seed: w.cfg.seed,
            contentHash: w.cfg.contentHash,
          },
          config: w.cfg,
          inputLog,
        },
        inbox,
        replays,
      );
      expect(result.ok).toBe(true);
      expect(existsSync(result.replayPath!)).toBe(true);

      // Read the bundle back off disk exactly as the qa/dev loop would, and
      // replay it from scratch through a fresh Run.
      const bundle = JSON.parse(readFileSync(result.replayPath!, 'utf8')) as {
        config: typeof w.cfg;
        inputLog: object[];
      };
      const replayedRun = new Run({ ...bundle.config });
      for (const input of bundle.inputLog) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        replayedRun.step(input as any);
      }
      expect(replayedRun.world.tick).toBe(w.tick);
      expect(hashWorld(replayedRun.world)).toBe(liveHash);
    } finally {
      rmSync(inbox, { recursive: true, force: true });
      rmSync(replays, { recursive: true, force: true });
    }
  });

  it('a tampered bundle (one dropped input) does NOT reproduce the same hash — the check has teeth', () => {
    const { run, inputLog } = playToTick(4, 400);
    const liveHash = hashWorld(run.world);
    const w = run.world;
    const tamperedLog = inputLog.slice(0, -1); // drop the last recorded input

    const replayedRun = new Run({ ...w.cfg });
    for (const input of tamperedLog) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      replayedRun.step(input as any);
    }
    // One fewer step means one fewer tick, which alone can already diverge
    // the hash (position/RNG-stream advancement) — the point is that dropping
    // data from the bundle is visible, not silently accepted.
    expect(replayedRun.world.tick).not.toBe(w.tick);
    expect(hashWorld(replayedRun.world)).not.toBe(liveHash);
  });
});
