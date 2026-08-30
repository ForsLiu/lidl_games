/**
 * @vitest-environment jsdom
 *
 * p7h — SPEC-FINAL §5.5, §8.4: the four non-default Cores' unlock lines
 * become real quests through the §8.4 quest engine p7e built, plus a Codex
 * page for all five Cores (`p9b`'s "a field added to a schema appears with
 * no change to the page" rule).
 *
 * Mirrors `tests/p7e-quests.test.ts`'s shape for the class side: a static
 * sweep that every non-default Core's `unlockQuest` names a real quest whose
 * `reward` actually unlocks that Core (the same silent-dead-end bug class
 * p7e/Q147 closed for classes), then an end-to-end test per quest family.
 *
 * Q148 logs the one real design call: adding 4 Core quests to the existing
 * 10 class quests would push `data/quests.json` to 14 entries, over §8.4's
 * "8-12" — resolved by scoping that gate to non-Core rewards (see the updated
 * assertion in `tests/p7e-quests.test.ts`) rather than skipping content §5.5
 * explicitly specs.
 */

import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';
import { applyRunResult, defaultMeta, metricsFor } from '../src/meta/meta';
import type { RunReport } from '../src/sim/types';
import { World } from '../src/sim/world';
import { damageEnemy, spawnEnemy } from '../src/sim/enemies';
import { buildCodexCollections } from '../src/ui/codex-collections';
import { renderCodexTable } from '../src/ui/codex';
import { cfg } from './helpers';

const content = loadContent();

function reportWith(over: Partial<RunReport> = {}): RunReport {
  return {
    seed: 1,
    policy: 'none',
    classKey: 'engineer',
    core: 'stone_heart',
    tier: 1,
    modifiers: [],
    outcome: 'victory',
    ticks: 0,
    totalSeconds: 0,
    act1Seconds: 0,
    act2Seconds: 0,
    wavesCleared: 0,
    vsWavesCleared: 0,
    coreHp: 500,
    coreMaxHp: 500,
    goldEarned: 0,
    goldSpent: 0,
    goldLeft: 0,
    towersBuilt: 0,
    towersByKey: {},
    survivalSeconds: 0,
    level: 1,
    kills: 0,
    leaks: 0,
    damageByWeapon: {},
    damageByType: {},
    damageTotal: 0,
    damageThroughMinute8: null,
    spawnedByWave: [],
    leaksByWave: [],
    goldEarnedByWave: [],
    topWeaponShareMinute8: 0,
    topWeaponMinute8: '',
    boons: {},
    typeMastery: {},
    skillCards: {},
    equipmentFound: 0,
    bossKilled: false,
    bossKillSeconds: 0,
    endHash: '',
    practiceUsed: false,
    sealed: false,
    ...over,
  };
}

describe('p7h: every non-default Core has exactly one unlock quest that actually unlocks it', () => {
  const nonDefault = content.cores.cores.filter((c) => !c.unlockedByDefault);

  it('§5.5 names exactly 5 Cores, 1 default + 4 unlockable', () => {
    expect(content.cores.cores.length).toBe(5);
    expect(nonDefault.length).toBe(4);
  });

  it('the default Core has no unlockQuest; every non-default Core names one', () => {
    for (const c of content.cores.cores) {
      if (c.unlockedByDefault) expect(c.unlockQuest, c.key).toBeNull();
      else expect(c.unlockQuest, c.key).not.toBeNull();
    }
  });

  it("each non-default Core's named quest exists and its reward is that exact core", () => {
    for (const c of nonDefault) {
      const quest = content.quests.quests.find((q) => q.key === c.unlockQuest);
      expect(quest, `${c.key}'s unlockQuest '${c.unlockQuest}' has no matching quest`).toBeDefined();
      expect(quest!.reward, `${c.key} via quest '${c.unlockQuest}'`).toEqual({ kind: 'core', value: c.key });
    }
  });

  it('the 4 Core quests exist on top of the class roster (Q148: not double-counted against the 8-12 class-quest gate)', () => {
    const coreQuests = content.quests.quests.filter((q) => q.reward.kind === 'core');
    expect(coreQuests.length).toBe(4);
  });
});

describe('p7h: World.poisonKills counts the killing blow, not any prior damage the enemy took', () => {
  it('a lethal poison-typed hit increments it', () => {
    const w = new World(cfg());
    const e = spawnEnemy(w, 'husk', 10, 10)!;
    e.hp = 10;
    expect(w.poisonKills).toBe(0);
    damageEnemy(w, e, 100, 'test', { type: 'poison', dot: true });
    expect(e.dead).toBe(true);
    expect(w.poisonKills).toBe(1);
  });

  it('a lethal normal-typed hit does not, even after the enemy survived an earlier poison tick', () => {
    const w = new World(cfg());
    const e = spawnEnemy(w, 'husk', 10, 10)!;
    e.hp = 100;
    damageEnemy(w, e, 10, 'test', { type: 'poison', dot: true });
    expect(e.dead).toBe(false);
    damageEnemy(w, e, 1000, 'test');
    expect(e.dead).toBe(true);
    expect(w.poisonKills).toBe(0);
  });

  it('a non-lethal poison hit does not increment it', () => {
    const w = new World(cfg());
    const e = spawnEnemy(w, 'husk', 10, 10)!;
    e.hp = 1000;
    damageEnemy(w, e, 10, 'test', { type: 'poison', dot: true });
    expect(e.dead).toBe(false);
    expect(w.poisonKills).toBe(0);
  });
});

describe('p7h: metricsFor derives the four Core-unlock metrics', () => {
  it('poison_kills reads World.poisonKills', () => {
    const w = new World(cfg());
    w.poisonKills = 42;
    expect(metricsFor(reportWith(), w).poison_kills).toBe(42);
  });

  it('core_finish_low_hp is 1 at or below 25% of max, win or lose; 0 above it', () => {
    const w = new World(cfg());
    expect(metricsFor(reportWith({ coreHp: 125, coreMaxHp: 500 }), w).core_finish_low_hp).toBe(1);
    expect(metricsFor(reportWith({ coreHp: 0, coreMaxHp: 500, outcome: 'defeat_core' }), w).core_finish_low_hp).toBe(
      1,
    );
    expect(metricsFor(reportWith({ coreHp: 126, coreMaxHp: 500 }), w).core_finish_low_hp).toBe(0);
  });

  it('lifetime_damage passes report.damageTotal through', () => {
    const w = new World(cfg());
    expect(metricsFor(reportWith({ damageTotal: 12345 }), w).lifetime_damage).toBe(12345);
  });

  it('fastest_win_seconds is the run length on a win, +Infinity on a loss', () => {
    const w = new World(cfg());
    expect(metricsFor(reportWith({ outcome: 'victory', totalSeconds: 1500 }), w).fastest_win_seconds).toBe(1500);
    expect(metricsFor(reportWith({ outcome: 'defeat_core', totalSeconds: 100 }), w).fastest_win_seconds).toBe(
      Number.POSITIVE_INFINITY,
    );
  });
});

describe('p7h: each Core-unlock quest drives unlockedCores end to end via applyRunResult, banking no currency', () => {
  it('cumulative lifetime counter (poison_purge, poisonKills summed to 300) unlocks carnivorous_plant', () => {
    let meta = defaultMeta();
    const w1 = new World(cfg());
    w1.poisonKills = 299;
    meta = applyRunResult(meta, reportWith(), w1);
    expect(meta.unlockedCores).not.toContain('carnivorous_plant');
    const w2 = new World(cfg());
    w2.poisonKills = 1;
    meta = applyRunResult(meta, reportWith(), w2);
    expect(meta.unlockedCores).toContain('carnivorous_plant');
    expect(meta.completedQuests).toContain('poison_purge');
  });

  it('per-run boolean (scrape_by, finish at or below 25% Core HP) unlocks vampire_heart, win or lose', () => {
    let meta = defaultMeta();
    const w = new World(cfg());
    meta = applyRunResult(meta, reportWith({ outcome: 'victory', coreHp: 400, coreMaxHp: 500 }), w);
    expect(meta.unlockedCores).not.toContain('vampire_heart');
    meta = applyRunResult(meta, reportWith({ outcome: 'defeat_core', coreHp: 0, coreMaxHp: 500 }), w);
    expect(meta.unlockedCores).toContain('vampire_heart');
    expect(meta.completedQuests).toContain('scrape_by');
  });

  it('cumulative lifetime sum (hundred_grand, damageTotal summed to 100000) unlocks corpse', () => {
    let meta = defaultMeta();
    const w = new World(cfg());
    meta = applyRunResult(meta, reportWith({ damageTotal: 99999 }), w);
    expect(meta.unlockedCores).not.toContain('corpse');
    meta = applyRunResult(meta, reportWith({ damageTotal: 1 }), w);
    expect(meta.unlockedCores).toContain('corpse');
  });

  it('running-best (speedrunner, fastest winning totalSeconds <=1920) unlocks time and keeps the best time seen', () => {
    let meta = defaultMeta();
    const w = new World(cfg());
    meta = applyRunResult(meta, reportWith({ outcome: 'victory', totalSeconds: 2000 }), w);
    expect(meta.unlockedCores).not.toContain('time');
    meta = applyRunResult(meta, reportWith({ outcome: 'victory', totalSeconds: 1920 }), w);
    expect(meta.unlockedCores).toContain('time');
  });

  it('completing a Core quest banks no currency', () => {
    let meta = defaultMeta();
    const w = new World(cfg());
    meta = applyRunResult(meta, reportWith({ damageTotal: 100000, vsWavesCleared: 0 }), w);
    expect(meta.completedQuests).toContain('hundred_grand');
    expect(meta.skillPoints).toBe(0);
  });

  it("does not mutate the caller's meta.unlockedCores array in place", () => {
    const meta = defaultMeta();
    const before = meta.unlockedCores;
    const w = new World(cfg());
    w.poisonKills = 300;
    const next = applyRunResult(meta, reportWith(), w);
    expect(next).not.toBe(meta);
    expect(next.unlockedCores).not.toBe(before);
    expect(before).not.toContain('carnivorous_plant');
    expect(meta.unlockedCores).toBe(before);
  });
});

describe('p7h regression: a min-tracked metric keeps the true best across a worse subsequent run', () => {
  // Pre-fix, the generic loop's Math.max ran on fastest_* metrics too (before
  // the dedicated Math.min pass "fixed" it back), so a run slower than the
  // standing best silently overwrote it. See meta.ts's MIN_TRACKED comment.
  it('fastest_boss_kill does not regress when a later run kills the boss slower than the best on record', () => {
    let meta = defaultMeta();
    const w = new World(cfg());
    meta = applyRunResult(meta, reportWith({ bossKilled: true, bossKillSeconds: 80 }), w);
    expect(meta.questProgress.fastest_boss_kill).toBe(80);
    meta = applyRunResult(meta, reportWith({ bossKilled: true, bossKillSeconds: 200 }), w);
    expect(meta.questProgress.fastest_boss_kill).toBe(80);
  });

  it('fastest_win_seconds does not regress when a later win is slower than the best on record', () => {
    let meta = defaultMeta();
    const w = new World(cfg());
    meta = applyRunResult(meta, reportWith({ outcome: 'victory', totalSeconds: 1000 }), w);
    expect(meta.questProgress.fastest_win_seconds).toBe(1000);
    meta = applyRunResult(meta, reportWith({ outcome: 'victory', totalSeconds: 3000 }), w);
    expect(meta.questProgress.fastest_win_seconds).toBe(1000);
  });
});

describe('p7h: the Codex lists all five Cores with live numbers off data/cores.json', () => {
  it("buildCodexCollections carries a 'cores' collection with exactly the 5 real rows", () => {
    const collections = buildCodexCollections(content);
    const cores = collections.find((c) => c.key === 'cores');
    expect(cores).toBeDefined();
    expect(cores!.rows.length).toBe(content.cores.cores.length);
  });

  it("a field added to CoreSchema needs no change here (p9b's rule): a synthetic extra field on a real Core row still renders its own column", () => {
    const rows = content.cores.cores.map((c) => ({ ...c }));
    (rows[0] as Record<string, unknown>).futureCoreField = 'prismatic';
    const table = renderCodexTable(rows);
    const headers = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent);
    expect(headers).toContain('futureCoreField');
    expect(headers).toContain('unlockCondition');
  });
});
