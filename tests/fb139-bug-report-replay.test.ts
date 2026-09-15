/**
 * fb139's acceptance: "a test replays a saved bundle to the recorded tick
 * with matching hash," reusing architecture rule 2's content-hash/replay
 * machinery (`src/sim/run.ts`) rather than inventing a new one. Runs a real
 * `Run` partway, saves it through `saveBugReport` exactly as the F8 endpoint
 * would, reads the replay file back off disk, and confirms `replayRecorded`
 * reproduces the identical end-state hash captured at report time.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { saveBugReport } from '../src/devserver/bugReportSave';
import { Run, hashWorld, replayRecorded, type RecordedRun } from '../src/sim/run';
import { emptyInput } from '../src/sim/types';
import { cfg, makeInputLog } from './helpers';

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('fb139: a saved bug-report bundle replays to the same tick with a matching hash', () => {
  it('replayRecorded on the saved replay file reproduces the report-time end-state hash', () => {
    const config = cfg({ seed: 11 });
    const log = makeInputLog(11, 900);

    // Play the run "live", the way F8 would catch it mid-run: step through
    // the log, then stop at an arbitrary tick — not run to completion — and
    // snapshot the hash right there, exactly what a bug report taken at that
    // moment would record.
    const run = new Run(config);
    for (const input of log) {
      if (run.done) break;
      run.step(input ?? emptyInput());
    }
    const reportTick = run.world.tick;
    const endHashAtReport = hashWorld(run.world);
    // World's constructor stamps contentHash on first use (architecture rule
    // 2); the saved RecordedRun must carry that stamped config, not the bare
    // input `config`, or replayRecorded's own "never stamped" guard throws.
    const recorded: RecordedRun = { config: run.world.cfg, inputLog: log.slice(0, reportTick) };

    const dir = mkdtempSync(join(tmpdir(), 'stonewake-bugreport-replay-'));
    const result = saveBugReport(
      {
        note: 'the Warden fell through the floor at the Fourth Gate',
        classKey: run.world.cfg.classKey,
        core: run.world.cfg.core ?? 'stone_heart',
        tier: run.world.cfg.tier,
        wave: run.world.wavesCleared,
        phase: run.world.phase,
        tick: reportTick,
        seed: run.world.cfg.seed,
        contentHash: run.world.cfg.contentHash,
        endHash: endHashAtReport,
        recorded,
        screenshotPng: TINY_PNG_BASE64,
      },
      join(dir, 'inbox'),
      join(dir, 'replays'),
    );
    expect(result.ok).toBe(true);
    if (!result.ok || !result.replayPath) throw new Error('expected a successful save');

    // Read the replay bundle back off disk exactly as a QA/dev agent would,
    // with no in-memory shortcut back to `recorded`.
    const loaded = JSON.parse(readFileSync(result.replayPath, 'utf8')) as RecordedRun;
    const replayed = replayRecorded(loaded, loaded.config);

    expect(replayed.endHash).toBe(endHashAtReport);
    // And the replay actually reached the recorded tick, not merely a
    // shorter or longer run that happened to hash the same on this fixture.
    expect(loaded.inputLog.length).toBe(reportTick);
  });
});
