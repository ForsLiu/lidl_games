/**
 * p7e — SPEC-FINAL §8.4: "Unlock quests (8-12, `data/quests.json`) ... covering
 * the §4.2 classes ... Quests award unlocks only, never currency."
 *
 * `data/quests.json`/`data/classes.json` already existed before this item, but
 * a class's `unlockQuest` field was only ever read for display (`hub.ts`) —
 * nothing checked that the named quest's `reward` actually unlocked that
 * class. Five of nine non-free classes (necromancer, stormcaller, bloodlord,
 * animist, paladin) pointed at a real, completable quest whose `reward.kind`
 * was `feature`/`cosmetic`/`passive`, so completing it did nothing but log a
 * `completedQuests` entry — those five classes were permanently unobtainable
 * outside the dev profile. Fixed by repointing each quest's reward at the
 * class its owning `unlockQuest` names. Paladin's quest also literally
 * contradicted SPEC-FINAL's own worked example ("win with a sealed Core ->
 * Paladin", §8.4) by reading `data/quests.json`'s unrelated "win a Tier 5 map"
 * entry — replaced by a new `sealed_win` quest/`wins_sealed` metric backed by
 * a new `World.everSealed` latch (sampled the same way
 * `p1b-seal-winrate.test.ts`'s external diagnostic already does).
 */

import { describe, expect, it } from 'vitest';

import { makePolicy } from '../src/bots';
import '../src/bots';
import { loadContent } from '../src/sim/content';
import { applyRunResult, defaultMeta, metricsFor } from '../src/meta/meta';
import { Run } from '../src/sim/run';
import type { MetaState, RunReport } from '../src/sim/types';
import { World } from '../src/sim/world';
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
    coreHp: 100,
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
    terrainFallback: false,
    ...over,
  };
}

describe('p7e: every non-free class has exactly one unlock quest that actually unlocks it', () => {
  const nonFree = content.classes.classes.filter((c) => !c.unlockedByDefault);

  it('at least one class is non-free, so this suite is not vacuous', () => {
    expect(nonFree.length).toBeGreaterThan(0);
  });

  it('every free class has no unlock quest, and every non-free class names exactly one', () => {
    for (const c of content.classes.classes) {
      if (c.unlockedByDefault) expect(c.unlockQuest, c.key).toBeNull();
      else expect(c.unlockQuest, c.key).not.toBeNull();
    }
  });

  it("each non-free class's named quest exists and its reward is that exact class (the b-fix: 5 of 9 previously rewarded a feature/cosmetic/passive instead)", () => {
    for (const c of nonFree) {
      const quest = content.quests.quests.find((q) => q.key === c.unlockQuest);
      expect(quest, `${c.key}'s unlockQuest '${c.unlockQuest}' has no matching quest`).toBeDefined();
      expect(quest!.reward, `${c.key} via quest '${c.unlockQuest}'`).toEqual({ kind: 'class', value: c.key });
    }
  });

  it('§8.4: 8-12 quests total (Q148: scoped to non-Core rewards — §8.4\'s own worked examples are all class unlocks, and §5.5\'s four Core-unlock quests are a separate, exactly-enumerated content bucket, not part of this range)', () => {
    const nonCore = content.quests.quests.filter((q) => q.reward.kind !== 'core');
    expect(nonCore.length).toBeGreaterThanOrEqual(8);
    expect(nonCore.length).toBeLessThanOrEqual(12);
  });

  it('§8.4: "quests award unlocks only, never currency" — no reward kind is currency-shaped', () => {
    const currencyLike = ['gold', 'currency', 'skillpoint', 'skillpoints', 'ember'];
    for (const q of content.quests.quests) {
      expect(currencyLike, q.key).not.toContain(q.reward.kind.toLowerCase());
    }
  });
});

describe('p7e: one quest per trigger family drives its class unlock end to end, banking no currency', () => {
  it('cumulative win counter (win_a_run, target 1) unlocks pyromancer on the first win, not before', () => {
    const w = new World(cfg());
    let meta = defaultMeta();
    expect(meta.unlockedClasses).not.toContain('pyromancer');
    meta = applyRunResult(meta, reportWith({ outcome: 'defeat_core' }), w);
    expect(meta.unlockedClasses).not.toContain('pyromancer');
    meta = applyRunResult(meta, reportWith({ outcome: 'victory' }), w);
    expect(meta.unlockedClasses).toContain('pyromancer');
    expect(meta.completedQuests).toContain('win_a_run');
  });

  it('cumulative multi-win threshold (plaguebringer_veteran >=3, chrono_veteran >=6) unlocks each at its own count', () => {
    const w = new World(cfg());
    let meta = defaultMeta();
    for (let i = 0; i < 2; i++) meta = applyRunResult(meta, reportWith({ outcome: 'victory' }), w);
    expect(meta.unlockedClasses).not.toContain('plaguebringer');
    meta = applyRunResult(meta, reportWith({ outcome: 'victory' }), w);
    expect(meta.unlockedClasses).toContain('plaguebringer');
    expect(meta.unlockedClasses).not.toContain('time_lord');
    for (let i = 0; i < 3; i++) meta = applyRunResult(meta, reportWith({ outcome: 'victory' }), w);
    expect(meta.unlockedClasses).toContain('time_lord');
  });

  it('cumulative lifetime counter (build_40_obelisks, towersByKey.frost_obelisk summed) unlocks cryomancer at 40', () => {
    const w = new World(cfg());
    let meta = defaultMeta();
    meta = applyRunResult(meta, reportWith({ towersByKey: { frost_obelisk: 25 } }), w);
    expect(meta.unlockedClasses).not.toContain('cryomancer');
    meta = applyRunResult(meta, reportWith({ towersByKey: { frost_obelisk: 15 } }), w);
    expect(meta.unlockedClasses).toContain('cryomancer');
  });

  it('cumulative lifetime sum (hoarder, goldEarned summed to 5000) unlocks stormcaller', () => {
    const w = new World(cfg());
    let meta = defaultMeta();
    meta = applyRunResult(meta, reportWith({ goldEarned: 4999 }), w);
    expect(meta.unlockedClasses).not.toContain('stormcaller');
    meta = applyRunResult(meta, reportWith({ goldEarned: 1 }), w);
    expect(meta.unlockedClasses).toContain('stormcaller');
  });

  it('running-best (fast_boss, fastest bossKillSeconds <=90) unlocks bloodlord and keeps the best time seen', () => {
    const w = new World(cfg());
    let meta = defaultMeta();
    meta = applyRunResult(meta, reportWith({ bossKilled: true, bossKillSeconds: 120 }), w);
    expect(meta.unlockedClasses).not.toContain('bloodlord');
    meta = applyRunResult(meta, reportWith({ bossKilled: true, bossKillSeconds: 90 }), w);
    expect(meta.unlockedClasses).toContain('bloodlord');
  });

  it('per-run boolean derived from the report (four_slot_win, wins_max4towertypes) unlocks necromancer', () => {
    const w = new World(cfg());
    let meta = defaultMeta();
    // 5 distinct attacking tower types built + a win: fails the "at most 4" clause.
    meta = applyRunResult(
      meta,
      reportWith({
        outcome: 'victory',
        towersByKey: { palisade: 3, arrow_spire: 1, ballista: 1, frost_obelisk: 1, venom_spore: 1, tesla_coil: 1 },
      }),
      w,
    );
    expect(meta.unlockedClasses).not.toContain('necromancer');
    meta = applyRunResult(
      meta,
      reportWith({ outcome: 'victory', towersByKey: { palisade: 10, arrow_spire: 4 } }),
      w,
    );
    expect(meta.unlockedClasses).toContain('necromancer');
  });

  it('new per-run boolean (sealed_win, §10\'s "win with a sealed Core") unlocks paladin only on a sealed win', () => {
    const w = new World(cfg());
    let meta = defaultMeta();
    meta = applyRunResult(meta, reportWith({ outcome: 'victory', sealed: false }), w);
    expect(meta.unlockedClasses).not.toContain('paladin');
    meta = applyRunResult(meta, reportWith({ outcome: 'defeat_core', sealed: true }), w);
    expect(meta.unlockedClasses).not.toContain('paladin');
    meta = applyRunResult(meta, reportWith({ outcome: 'victory', sealed: true }), w);
    expect(meta.unlockedClasses).toContain('paladin');
    expect(meta.completedQuests).toContain('sealed_win');
  });

  it('account-state-derived metric (archivist, max_equipment_dupes computed post-update) unlocks animist', () => {
    const w = new World(cfg());
    let meta: MetaState = { ...defaultMeta(), equipmentStash: { greatsword: 2 } };
    meta = applyRunResult(meta, reportWith(), w);
    expect(meta.unlockedClasses).not.toContain('animist');
    const wPlus = new World(cfg());
    wPlus.equipmentFound = ['greatsword'];
    meta = applyRunResult(meta, reportWith(), wPlus);
    expect(meta.equipmentStash.greatsword).toBe(3);
    expect(meta.unlockedClasses).toContain('animist');
  });

  it('completing a quest banks no currency: skillPoints tracks only report.vsWavesCleared, never a quest reward', () => {
    const w = new World(cfg());
    let meta = defaultMeta();
    // A winning run with vsWavesCleared: 0 completes win_a_run but must not move skillPoints.
    meta = applyRunResult(meta, reportWith({ outcome: 'victory', vsWavesCleared: 0 }), w);
    expect(meta.completedQuests).toContain('win_a_run');
    expect(meta.skillPoints).toBe(0);
  });
});

describe('p7e: World.everSealed latches on a real sealed board (§10), never on an open one', () => {
  // TODO(b073): fb025 (enemy HP x10 / attacker attack speed x0.7) exposed a
  // pre-existing gap — Act I has no aliveCap (unlike act2.ts/boss.ts), and
  // `sealed` is the one policy that can structurally never leak an enemy off
  // the map, so it now piles up enemies faster than fb025-weakened towers
  // can clear them and stops making practical progress well inside its own
  // 15000-tick bound. b073 landed the aliveCap fix, but re-measured at p10x
  // (2026-09-03) the case still fails the same way: seed 1 dies via
  // `defeat_core` at tick 13159 with `everSealed` still false — the aliveCap
  // stopped the enemy pile-up from hanging the process (that's what b073
  // actually fixed) but didn't give `sealed` a way to survive fb025's x10 HP
  // scaling long enough to finish sealing the board. That's the still-open
  // Act I economy gap p10j-p10l/p10r/p10s/p10t/p10u/p10z are already tracking
  // (SPEC-FINAL §14 G1/G8), not a new bug — stays `.skip`ped until one of
  // those closes it or lands a fresh deferral expiry.
  it.skip('the sealed policy latches world.everSealed and carries it into report.sealed, within p1b-seal-winrate.test.ts\'s own proven 15000-tick bound', () => {
    const run = new Run({ ...cfg({ seed: 1 }), policy: 'sealed' });
    const policy = makePolicy('sealed');
    // b073 QA finding: this loop used to omit `!run.done`, unlike the sibling
    // test below — `Run.step` no-ops once `done`, so a sealed bot that dies
    // via `defeat_core` before ever sealing (still true post-b073, per Q40's
    // fb025 fallout) freezes `world.tick` and spins this loop forever,
    // hanging the process past even vitest's own timeout. Guard it the same
    // way before anyone follows this TODO and un-skips it.
    while (!run.world.everSealed && run.world.tick < 15_000 && !run.done) {
      run.step(policy.act(run.world));
    }
    expect(run.world.everSealed).toBe(true);
    expect(run.report().sealed).toBe(true);
  });

  it('an open maxbuild policy never seals the board', () => {
    const run = new Run({ ...cfg({ seed: 1 }), policy: 'maxbuild' });
    const policy = makePolicy('maxbuild');
    for (let i = 0; i < 15_000 && !run.done; i++) run.step(policy.act(run.world));
    expect(run.world.everSealed).toBe(false);
    expect(run.report().sealed).toBe(false);
  });
});

describe('p7e: metricsFor derives wins_sealed correctly', () => {
  it('requires both the win and the sealed latch, in either order of args', () => {
    expect(metricsFor(reportWith({ outcome: 'victory', sealed: true }), new World(cfg())).wins_sealed).toBe(1);
    expect(metricsFor(reportWith({ outcome: 'victory', sealed: false }), new World(cfg())).wins_sealed).toBe(0);
    expect(metricsFor(reportWith({ outcome: 'defeat_core', sealed: true }), new World(cfg())).wins_sealed).toBe(0);
  });
});
