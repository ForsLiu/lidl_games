/**
 * p-core-a — SPEC-FINAL §5.5's Cores, plumbing half: `data/cores.json` with
 * the five rows, Core choice in `RunConfig` and the end-state hash, and gate
 * **G21**'s plumbing clauses: two runs differing only in Core hash
 * differently, a replay carrying a mismatched Core is rejected, and the
 * loader refuses a Core row whose effects it cannot pay. The gameplay half of
 * G21 (each Core's real TD/VS numbers) is `p-core-b` through `p-core-f`'s job
 * — nothing here asserts a Core's in-run effect, only that it is selectable,
 * hashed and loader-validated.
 */

import { describe, expect, it } from 'vitest';

import {
  contentHash,
  defaultCoreKey,
  loadContent,
  validateCoreUpgrade,
  validateDefaultCore,
} from '../src/sim/content';
import { defaultMeta, deserializeMeta, serializeMeta } from '../src/meta/meta';
import { replayRecorded } from '../src/sim/run';
import type { RunConfig } from '../src/sim/types';
import { cfg, makeInputLog, replay } from './helpers';

const content = loadContent();

// b039: `replayRecorded` now requires `recorded.config.contentHash` to be
// stamped (a real RecordedRun always has one — `World`'s constructor stamps
// it on first use). These Core-mismatch tests build synthetic RecordedRuns
// by hand, so they need the same stamp a genuine recording would carry.
function recordedCfg(over: Partial<RunConfig> = {}): RunConfig {
  return { ...cfg(over), contentHash: contentHash(content) };
}

describe('data/cores.json (§5.5)', () => {
  it('authors exactly the five owner rows', () => {
    const keys = content.cores.cores.map((c) => c.key).sort();
    expect(keys).toEqual(
      ['carnivorous_plant', 'corpse', 'stone_heart', 'time', 'vampire_heart'].sort(),
    );
  });

  it('defaults to Stone Heart, and only Stone Heart', () => {
    const defaults = content.cores.cores.filter((c) => c.unlockedByDefault);
    expect(defaults.map((c) => c.key)).toEqual(['stone_heart']);
    expect(defaultCoreKey(content)).toBe('stone_heart');
  });

  it('every non-default core carries an unlock condition', () => {
    for (const c of content.cores.cores) {
      if (c.key === 'stone_heart') {
        expect(c.unlockCondition).toBeNull();
      } else {
        expect(c.unlockCondition && c.unlockCondition.length > 0).toBe(true);
      }
    }
  });
});

describe('the loader refuses a core row whose effects it cannot pay', () => {
  it('rejects upgrade steps priced at zero or less', () => {
    expect(() =>
      validateCoreUpgrade({ key: 'test_core', upgrade: { count: 3, stepCost: 0 } }),
    ).toThrow(/no price/);
    expect(() =>
      validateCoreUpgrade({ key: 'test_core', upgrade: { count: 3, stepCost: -10 } }),
    ).toThrow(/no price/);
  });

  it('rejects a price with no steps to spend it on', () => {
    expect(() =>
      validateCoreUpgrade({ key: 'test_core', upgrade: { count: 0, stepCost: 50 } }),
    ).toThrow(/no steps/);
  });

  it('accepts a well-formed row (no steps and no price; priced steps)', () => {
    expect(() =>
      validateCoreUpgrade({ key: 'test_core', upgrade: { count: 0, stepCost: 0 } }),
    ).not.toThrow();
    expect(() =>
      validateCoreUpgrade({ key: 'test_core', upgrade: { count: 3, stepCost: 50 } }),
    ).not.toThrow();
  });

  it('every shipped core row passes its own loader rule', () => {
    for (const c of content.cores.cores) expect(() => validateCoreUpgrade(c)).not.toThrow();
  });

  it('rejects zero or more than one default core', () => {
    expect(() => validateDefaultCore([{ key: 'a', unlockedByDefault: false }])).toThrow(
      /exactly one/,
    );
    expect(() =>
      validateDefaultCore([
        { key: 'a', unlockedByDefault: true },
        { key: 'b', unlockedByDefault: true },
      ]),
    ).toThrow(/exactly one/);
    expect(() =>
      validateDefaultCore([
        { key: 'a', unlockedByDefault: true },
        { key: 'b', unlockedByDefault: false },
      ]),
    ).not.toThrow();
  });
});

describe('Core choice in RunConfig and the end-state hash (G21)', () => {
  it('two runs differing only in Core hash differently', () => {
    const log = makeInputLog(3, 600);
    const stone = replay(cfg({ core: 'stone_heart' }), log);
    const time = replay(cfg({ core: 'time' }), log);
    expect(time.endHash).not.toBe(stone.endHash);
  });

  it('an omitted core and an explicit default core hash identically', () => {
    const log = makeInputLog(5, 600);
    const omitted = replay(cfg({ core: undefined }), log);
    const explicitDefault = replay(cfg({ core: 'stone_heart' }), log);
    expect(omitted.endHash).toBe(explicitDefault.endHash);
  });

  it('the same Core reproduces the same hash across independent replays', () => {
    const log = makeInputLog(9, 900);
    const a = replay(cfg({ core: 'vampire_heart' }), log);
    const b = replay(cfg({ core: 'vampire_heart' }), log);
    expect(b.endHash).toBe(a.endHash);
  });

  it('the RunReport carries the resolved core, default included', () => {
    const log = makeInputLog(2, 60);
    expect(replay(cfg({ core: 'corpse' }), log).core).toBe('corpse');
    expect(replay(cfg({}), log).core).toBe('stone_heart');
  });
});

describe('a replay carrying a mismatched core is rejected', () => {
  // Below, only the two cases that reach past the Core checks (agreeing or
  // omitted-on-both-sides cores) use `recordedCfg()` — the mismatch/unknown-
  // core cases throw at the Core checks in `replayRecorded`, before ever
  // reaching the b039 content-hash check, so a plain `cfg()` is enough for
  // them and stays that way unless the check order in `replayRecorded` ever
  // changes (which would make these regexes fail loudly, not silently pass).
  it('throws when the replay config names a different core than recorded', () => {
    const log = makeInputLog(4, 300);
    const recorded = { config: cfg({ core: 'stone_heart' }), inputLog: log };
    expect(() => replayRecorded(recorded, cfg({ core: 'time' }))).toThrow(/core mismatch/);
  });

  it('does not throw, and matches a direct replay, when the core agrees', () => {
    const log = makeInputLog(4, 300);
    const recorded = { config: recordedCfg({ core: 'carnivorous_plant' }), inputLog: log };
    const viaRecorded = replayRecorded(recorded, cfg({ core: 'carnivorous_plant' }));
    const direct = replay(cfg({ core: 'carnivorous_plant' }), log);
    expect(viaRecorded.endHash).toBe(direct.endHash);
  });

  it('treats an omitted core as the default on both sides, not a mismatch', () => {
    const log = makeInputLog(4, 300);
    const recorded = { config: recordedCfg({ core: undefined }), inputLog: log };
    expect(() => replayRecorded(recorded, cfg({ core: 'stone_heart' }))).not.toThrow();
  });

  // QA found the mismatch check hollow on its own: a recorded and replayed
  // config sharing the same nonexistent core key "matched" and sailed
  // through, since equality was checked before existence. Both keys must
  // resolve to a real `cores.json` row before they are ever compared.
  it('throws on a replay config naming a core that does not exist, even unopposed', () => {
    const log = makeInputLog(4, 300);
    const recorded = { config: cfg({ core: 'stone_heart' }), inputLog: log };
    expect(() => replayRecorded(recorded, cfg({ core: 'not_a_real_core' }))).toThrow(/unknown core/);
  });

  it('throws on a recorded config naming a core that does not exist', () => {
    const log = makeInputLog(4, 300);
    const recorded = { config: cfg({ core: 'not_a_real_core' }), inputLog: log };
    expect(() => replayRecorded(recorded, cfg({ core: 'stone_heart' }))).toThrow(/unknown core/);
  });

  it('throws even when both sides share the identical nonexistent core key', () => {
    const log = makeInputLog(4, 300);
    const recorded = { config: cfg({ core: 'totally_bogus_core_xyz' }), inputLog: log };
    expect(() => replayRecorded(recorded, cfg({ core: 'totally_bogus_core_xyz' }))).toThrow(
      /unknown core/,
    );
  });
});

describe('unlockedCores in MetaState and save migration', () => {
  it('defaults a fresh account to Stone Heart only', () => {
    expect(defaultMeta().unlockedCores).toEqual(['stone_heart']);
  });

  it('migrates a save with no unlockedCores key to the default', () => {
    const oldSave = JSON.stringify({
      version: 1,
      meta: { ...defaultMeta(), unlockedCores: undefined },
    });
    const out = deserializeMeta(oldSave);
    expect(out.unlockedCores).toEqual(['stone_heart']);
  });

  it('round-trips an account that has unlocked more than one core', () => {
    const meta = { ...defaultMeta(), unlockedCores: ['stone_heart', 'time'] };
    const back = deserializeMeta(serializeMeta(meta));
    expect(back.unlockedCores).toEqual(['stone_heart', 'time']);
  });

  it('a corrupt (non-array) unlockedCores falls back to the default rather than character-spreading', () => {
    const corrupt = JSON.stringify({
      version: 2,
      meta: { ...defaultMeta(), unlockedCores: 'not-an-array' },
    });
    expect(deserializeMeta(corrupt).unlockedCores).toEqual(['stone_heart']);
  });

  // QA found this reachable and un-repaired: an explicitly-empty array passes
  // the `Array.isArray` guard (it *is* an array), so without this it would
  // migrate to `[]` — the Hub would then render Stone Heart, the spec's
  // guaranteed default, as simultaneously "selected" and "locked".
  it('an explicitly-empty unlockedCores still guarantees the default core is present', () => {
    const emptied = JSON.stringify({
      version: 2,
      meta: { ...defaultMeta(), unlockedCores: [] },
    });
    expect(deserializeMeta(emptied).unlockedCores).toContain('stone_heart');
  });

  it('preserves other unlocked cores alongside the guaranteed default', () => {
    const meta = JSON.stringify({
      version: 2,
      meta: { ...defaultMeta(), unlockedCores: ['time'] },
    });
    const out = deserializeMeta(meta).unlockedCores;
    expect(out).toContain('stone_heart');
    expect(out).toContain('time');
  });
});
