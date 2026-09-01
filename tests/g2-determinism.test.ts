/**
 * SPEC-FINAL §14 G2: "Determinism: 100/100 replay hash match, incl. actives,
 * tuner-edited content (per content hash), fast-forward." Formerly named for
 * SPEC-V2's A11; renamed at p9f to match SPEC-FINAL's gate numbering and
 * widened to cover G2's other two named additions directly (fast-forward's
 * bit-identity is covered separately in `pacer.test.ts`, which predates this
 * file and needs no duplication here — see `tools/gate-audit.ts`'s G2 entry).
 */

import { describe, expect, it } from 'vitest';

import { cfg, makeInputLog, replay, runWithPolicy } from './helpers';
import { Rng, RngSet, fnv1a } from '../src/sim/rng';
import { dcos, dsin, datan2 } from '../src/sim/math';
import { contentHash, loadContent } from '../src/sim/content';
import { Run } from '../src/sim/run';
import { finishSundering } from '../src/sim/sundering';
import { addXp, xpToReach } from '../src/sim/progression';
import { makePolicy } from '../src/bots';
import '../src/bots';
import type { Command, TickInput } from '../src/sim/types';

/**
 * Layers `class_active` (periodically) and one `equip_item` command onto a
 * movement-noise log from `makeInputLog`. `equip_item` (fb023, SPEC-FINAL §7)
 * replaced the never-wired `{k:'equip', relic}` this test used to fire as a
 * documented no-op — it now has a real handler (`equipItemCommand`,
 * `src/sim/run.ts`) that mutates `Stats` mid-run, so this is the one place
 * A11 actually exercises a mid-run equipment swap rather than only the
 * construction-time `RunConfig.equipment` path every other determinism test
 * covers.
 */
function withSkillCommands(log: TickInput[], slot: string, itemKey: string): TickInput[] {
  return log.map((input, t) => {
    const cmds: Command[] = input.cmds.slice();
    if (t > 0 && t % 300 === 0) cmds.push({ k: 'class_active' });
    if (t === 50) cmds.push({ k: 'equip_item', slot, item: itemKey });
    return { ...input, cmds };
  });
}

describe('G2 determinism', () => {
  it('reproduces the end-state hash for 100 seeds', () => {
    const TICKS = 2400; // 40 s of play: covers build phases, waves and leaks
    for (let seed = 1; seed <= 100; seed++) {
      const log = makeInputLog(seed, TICKS);
      const a = replay(cfg({ seed }), log);
      const b = replay(cfg({ seed }), log);
      expect(b.endHash, `seed ${seed}`).toBe(a.endHash);
      expect(b.ticks).toBe(a.ticks);
      expect(b.kills).toBe(a.kills);
      expect(b.damageTotal).toBe(a.damageTotal);
    }
  });

  it('produces different hashes for different seeds', () => {
    const log = makeInputLog(7, 1800);
    const hashes = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      hashes.add(replay(cfg({ seed }), log).endHash);
    }
    expect(hashes.size).toBeGreaterThan(1);
  });

  // QUALITY.md ALPHA's determinism line reads "100/100 replay hash match,
  // including class actives and uniques" — the 100-seed test above never
  // fires a class_active or equip_item Command. This widens the same
  // record-twice-compare-hash property to an input log that fires both,
  // across several seeds, so ALPHA's literal claim is actually exercised.
  it('reproduces the end-state hash across seeds with class_active and equip_item in the input log', () => {
    const TICKS = 2400;
    const content = loadContent();
    const item = content.equipment.items[0];
    for (const seed of [1, 5, 13, 42, 87]) {
      const log = withSkillCommands(makeInputLog(seed, TICKS), item.slot, item.key);
      const config = cfg({ seed, ownedEquipment: { [item.key]: 1 } });
      const a = replay(config, log);
      const b = replay(config, log);
      expect(b.endHash, `seed ${seed}`).toBe(a.endHash);
      expect(b.ticks).toBe(a.ticks);
      expect(b.kills).toBe(a.kills);
      expect(b.damageTotal).toBe(a.damageTotal);
    }
  });
  /**
   * fb003 (owner feedback `feature-auto-pick-boons`): auto-pick's choices are
   * ordinary Commands, not a side-channel, so a run that used it replays
   * exactly like any other. Driven by a real bot policy through real Act II
   * play (not a hand-built log) so real level-ups actually fire.
   */
  it('reproduces the end-state hash with auto-pick level-ups on', () => {
    for (const seed of [1, 2, 3]) {
      const config = cfg({ seed, cycles: 2, autoPickLevelUps: true });
      const a = runWithPolicy(config, 'hybrid');
      const b = runWithPolicy(config, 'hybrid');
      expect(b.report.endHash, `seed ${seed}`).toBe(a.report.endHash);
      expect(b.report.wavesCleared).toBe(a.report.wavesCleared);
    }
  });

  it('never leaves the world sitting in the levelup phase when auto-pick is on', () => {
    const config = cfg({ seed: 4, cycles: 2, autoPickLevelUps: true });
    const run = new Run({ ...config, policy: 'hybrid' });
    const policy = makePolicy('hybrid');
    // fb025 (enemy HP x10 + attacker attack speed x0.7): the natural Act I
    // wave-clear this test used to reach no longer happens for `hybrid`
    // (BALANCE.md/PROGRESS.md), so it can no longer rely on organic Act II
    // XP gain to prove a level-up fires. Level-ups only ever resolve in Act
    // II (`openLevelUpIfPending`, `phase === 'act2'`), so force the
    // Sundering directly (same jump `src/ui/audit-hook.ts`'s dev shortcut
    // uses) and grant real XP through the real `addXp`/`queueLevelUp` path —
    // this still exercises the actual phase-machine-liveness question the
    // test is about (does a queued level-up ever leave `phase` stuck on
    // `'levelup'`?), just without requiring a full Act I clear to get there.
    while (!run.done && run.world.tick < 2400) {
      run.step(policy.act(run.world));
    }
    expect(run.done, 'setup died before Act II could be forced').toBe(false);
    finishSundering(run.world);
    addXp(run.world, xpToReach(run.world.level + 1) + 1);
    for (let i = 0; i < 60 && !run.done; i++) {
      run.step(policy.act(run.world));
    }
    // A run that got through real Act II play (boonRanks non-empty means at
    // least one level-up actually fired and resolved itself) never left the
    // phase machine parked waiting for input.
    expect(Object.keys(run.world.boonRanks).length).toBeGreaterThan(0);
    expect(run.world.phase).not.toBe('levelup');
  });

  /**
   * G2's "tuner-edited content (per content hash)" clause, end to end: a
   * Tuner save is, from the sim's perspective, exactly `loadContent()` fed a
   * substitute document (`saveTunerFile`'s own dry-run does this same
   * substitution before ever touching disk, see `src/devserver/tunerSave.ts`
   * and `tests/p9c-tuner-save.test.ts`) — so building `Content` this way
   * exercises the real substitution path rather than a hand-rolled stand-in.
   * A record/replay pair against the *edited* content must match each other
   * exactly, and CLAUDE.md architecture rule 2's "replay against edited data
   * fails loudly" must hold at the boundary between them (p9a).
   */
  it('replays correctly against Tuner-edited content when the recorded hash matches, and rejects a stale one', () => {
    const base = loadContent();
    const editedTowersDoc = {
      ...base.towers,
      towers: base.towers.towers.map((t, i) => (i === 0 ? { ...t, cost: t.cost + 5 } : t)),
    };
    const edited = loadContent({ towers: editedTowersDoc });
    const editedHash = contentHash(edited);
    expect(editedHash).not.toBe(contentHash(base));

    const log = makeInputLog(3, 900);
    const config = cfg({ seed: 3 });

    // Recording a run against the edited content stamps its hash onto the
    // shared RunConfig, exactly as a real Tuner-edited session would.
    const recorded = new Run(config, edited);
    for (const input of log) recorded.step(input);
    expect(config.contentHash).toBe(editedHash);

    // Replaying the same config + log against the same edited content is a
    // real replay hash match, not just an identity check on the same object.
    const replayed = new Run({ ...config }, edited);
    for (const input of log) replayed.step(input);
    expect(replayed.hash()).toBe(recorded.hash());

    // Replaying that config against unedited /data — the content it was
    // *not* recorded against — fails loudly rather than silently diverging.
    expect(() => new Run({ ...config }, base)).toThrow(/content hash mismatch/);
  });

  /**
   * b044: §12 rule 2's contract is "a replay against *edited* /data fails
   * loudly" — not "a replay against a code/schema change with byte-identical
   * /data fails loudly." Before this fix, `contentHash()` hashed the
   * schema-*parsed* `Content` fields, so a loader change that starts keeping
   * (or stops silently stripping) a field on unchanged /data — exactly what
   * b013's `TreeNodeSchema` did by naming `angle`/`ring` and turning
   * `.strict()` — moved the hash with zero /data edit, indistinguishable from
   * a real edit to any save/replay recorded before the change. Reproduced
   * here without touching a real schema: two `Content` objects share the
   * identical pre-parse `raw` document (so a byte-for-byte /data read is
   * unchanged) but differ in how a field is *parsed* out of it, standing in
   * for "yesterday's schema stripped a field, today's declares it."
   */
  it("contentHash is a function of /data's authored bytes, not of which fields the current schema parses out of them", () => {
    const base = loadContent();

    // Same raw tree.json bytes as `base` (the spread below never touches
    // `raw`), but a parsed `tree` field standing in for "today's schema
    // declares a field yesterday's silently stripped" (b013's own shape).
    // If `contentHash` reads `raw` (the fix), this hashes the same as
    // `base`; if it reads the parsed `tree` field (the bug), it diverges
    // with zero /data edit.
    const keepingParse = {
      ...base,
      tree: { ...base.tree, nodes: base.tree.nodes.map((n) => ({ ...n, mysteryField: 42 })) },
    };
    expect(contentHash(keepingParse)).toBe(contentHash(base));

    // contentHash must still be sensitive to a *real* /data edit — the raw
    // bundle, not just the parsed shape, has to move for that to hold.
    const editedTowersDoc = {
      ...base.towers,
      towers: base.towers.towers.map((t, i) => (i === 0 ? { ...t, cost: t.cost + 1 } : t)),
    };
    const edited = loadContent({ towers: editedTowersDoc });
    expect(contentHash(edited)).not.toBe(contentHash(base));
  });
});

describe('rng streams', () => {
  it('is stable for a given seed', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
  });

  it('gives each named stream an independent sequence', () => {
    const s = new RngSet(99);
    const first = [s.waves.next(), s.spawns.next(), s.drops.next(), s.offers.next(), s.ai.next()];
    expect(new Set(first).size).toBe(5);
    const t = new RngSet(99);
    expect([t.waves.next(), t.spawns.next(), t.drops.next(), t.offers.next(), t.ai.next()]).toEqual(
      first,
    );
  });

  it('draws uniformly enough for weighted picks', () => {
    const rng = new Rng(4);
    const counts = [0, 0, 0];
    for (let i = 0; i < 30000; i++) counts[rng.weightedIndex([1, 2, 3])]++;
    expect(counts[0] / 30000).toBeGreaterThan(0.13);
    expect(counts[0] / 30000).toBeLessThan(0.2);
    expect(counts[2] / 30000).toBeGreaterThan(0.45);
    expect(counts[2] / 30000).toBeLessThan(0.55);
  });

  it('hashes strings stably', () => {
    expect(fnv1a('waves')).toBe(fnv1a('waves'));
    expect(fnv1a('waves')).not.toBe(fnv1a('spawns'));
  });
});

describe('deterministic math', () => {
  it('approximates sin/cos closely', () => {
    for (let i = -40; i <= 40; i++) {
      const a = i * 0.15;
      expect(Math.abs(dsin(a) - Math.sin(a))).toBeLessThan(1e-6);
      expect(Math.abs(dcos(a) - Math.cos(a))).toBeLessThan(1e-6);
    }
  });

  it('approximates atan2 closely', () => {
    for (let i = -8; i <= 8; i++) {
      for (let j = -8; j <= 8; j++) {
        if (i === 0 && j === 0) continue;
        expect(Math.abs(datan2(j, i) - Math.atan2(j, i))).toBeLessThan(1e-4);
      }
    }
  });
});
