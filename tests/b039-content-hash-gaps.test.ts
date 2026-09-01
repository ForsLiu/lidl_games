/**
 * b039 — two dormant gaps in the content-hash replay guard p9a built
 * (architecture rule 2: "a replay against edited `/data` fails loudly"),
 * found by qa-playtester verifying p9a:
 *
 * 1. `replayRecorded` forwarded `recorded.config.contentHash` straight into
 *    `new Run(...)`, so a `RecordedRun` whose config never actually passed
 *    through `World` (no hash stamped) was treated as a *fresh* run —
 *    `World`'s constructor stamps the live hash and checks nothing, silently
 *    skipping the whole guard instead of failing loudly.
 * 2. `tests/helpers.ts`'s `runWithPolicy` built its `Run` from a spread copy
 *    of the caller's config (`new Run({ ...config, policy })`), unlike
 *    `replay()`, so the hash `World`'s constructor stamps landed on the
 *    throwaway spread object and never made it back onto the caller's own
 *    `config` — any `RecordedRun` built from a bot-driven run inherited gap 1.
 */

import { describe, expect, it } from 'vitest';

import { contentHash, loadContent } from '../src/sim/content';
import { replayRecorded } from '../src/sim/run';
import { cfg, makeInputLog, runWithPolicy } from './helpers';

const content = loadContent();

describe('b039 — replayRecorded requires a stamped content hash', () => {
  it('throws when recorded.config.contentHash was never stamped, even with unedited /data', () => {
    const log = makeInputLog(5, 300);
    // A hand-built RecordedRun — never passed through World/Run, so it never
    // got a hash stamped onto it, exactly like a hand-authored replay file.
    const recorded = { config: cfg({ seed: 5 }), inputLog: log };
    expect(recorded.config.contentHash).toBeUndefined();
    expect(() => replayRecorded(recorded, cfg({ seed: 5 }))).toThrow(/contentHash is missing/);
  });

  it('does not throw on a genuinely recorded config (hash stamped, /data unedited)', () => {
    const log = makeInputLog(6, 300);
    const config = cfg({ seed: 6 });
    config.contentHash = contentHash(content);
    const recorded = { config, inputLog: log };
    expect(() => replayRecorded(recorded, cfg({ seed: 6 }))).not.toThrow();
  });
});

describe('b039 — runWithPolicy stamps the content hash back onto the caller\'s config', () => {
  it('leaves config.contentHash set after the run, the same way replay() does', () => {
    const config = cfg({ seed: 7, policy: 'none' });
    expect(config.contentHash).toBeUndefined();
    runWithPolicy(config, 'hybrid', 60 * 5);
    expect(config.contentHash).toBe(contentHash(content));
  });

  it('produces a config usable as a real RecordedRun.config with replayRecorded', () => {
    const config = cfg({ seed: 8, policy: 'none' });
    runWithPolicy(config, 'hybrid', 60 * 5);
    const log = makeInputLog(8, 300);
    const recorded = { config, inputLog: log };
    expect(() => replayRecorded(recorded, cfg({ seed: 8 }))).not.toThrow();
  });
});
