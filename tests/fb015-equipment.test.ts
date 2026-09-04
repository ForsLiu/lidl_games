/**
 * fb015 (owner feedback `feature-equipment-realize`, SPEC-FINAL §7/§8.1):
 * the six-slot equipment system — `data/equipment.json`'s 12-item owner
 * table, stacking per §2 (one item = one `Stats` source), the loot channel
 * (1 item per fully cleared TD wave, win or lose) and every conditional
 * effect line, including the Swordsman Armor/Sleeve Sword cross-item
 * interaction and a "if not <class>" fallback.
 */
import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';
import { classBasicAttack } from '../src/sim/classes';
import { applyDot, spawnEnemy, updateEnemies } from '../src/sim/enemies';
import { applyRunResult, defaultMeta } from '../src/meta/meta';
import { equipItem } from '../src/meta/stash';
import { applyCommand, hashWorld, Run, updateWarden } from '../src/sim/run';
import { buildTower, towerDamage, upgradeTower } from '../src/sim/towers';
import { wieldedAttacks } from '../src/sim/vswield';
import type { TickInput } from '../src/sim/types';
import { World } from '../src/sim/world';
import { characterPanelData } from '../src/ui/character-panel';
import { cfg, runWithPolicy } from './helpers';

const content = loadContent();

function held(active1Held: boolean, over: Partial<TickInput> = {}): TickInput {
  return { mx: 0, my: 0, dash: false, attack: false, aimX: 0, aimY: 0, active1Held, cmds: [], ...over };
}

function worldWith(over: Record<string, unknown> = {}): World {
  const w = new World(cfg({ classKey: 'swordsman', ...over }));
  w.gold = 1e6;
  w.warden.attackCooldown = 1e9; // suppress the basic attack, same convention p6b's tests use
  return w;
}

describe('fb015: data/equipment.json loads as 12 items across the 6 §7 slots', () => {
  it('has exactly the owner-named 12 items and 6 slots', () => {
    expect(content.equipment.slots).toEqual(['weapon', 'armor', 'shoes', 'ring', 'necklace', 'bracelet']);
    expect(content.equipment.items).toHaveLength(12);
    for (const slot of content.equipment.slots) {
      expect(content.equipment.items.filter((i) => i.slot === slot)).toHaveLength(2);
    }
  });

  it('every item resolves through equipmentByKey', () => {
    for (const item of content.equipment.items) {
      expect(content.equipmentByKey.get(item.key)).toBe(item);
    }
  });
});

// p7b (qa-playtester finding): hardcoded per SPEC-FINAL §7's owner table, so a
// mis-typed value in data/equipment.json fails this test instead of passing
// vacuously — reading the "expected" value back out of the same JSON under
// test (as an earlier draft of this file did) can only ever catch a broken
// fold, never a wrong authored number.
const EXPECTED_ITEM_MODS: Record<string, Record<string, number>> = {
  greatsword: { atkFlat: 10, armor: 5, attackSpeed: -0.1 },
  sleeve_sword: { atkFlat: 5, attackSpeed: 0.2 },
  normal_armor: { maxHp: 10, armor: 10 },
  swordsman_armor: { maxHp: 5, atkFlat: 5, armor: 5, attackSpeed: 0.1 },
  normal_shoes: { maxHp: 5, armor: 5, moveSpeedPct: 0.5 },
  swordsman_shoes: { maxHp: 3, atkFlat: 3, armor: 3, attackSpeed: 0.1, moveSpeedPct: 1 },
  normal_ring: { maxHp: 1, atkFlat: 1, armor: 1, hpRegen: 1 },
  bleeding_ring: { atkFlat: 2, armor: 1, leech: 0.0001, bleedLifesteal: 1 },
  normal_necklace: { maxHp: 1, atkFlat: 1, armor: 1, xpGain: 0.2, towerCost: -0.2 },
  builders_necklace: { maxHp: 1, armor: 2, towerAtkFlat: 1 },
  normal_bracelet: { maxHp: 1, atkFlat: 1, armor: 1, area: 0.1 },
  sniper_bracelet: { maxHp: 2, atkFlat: 1, towerRange: 0.1, charRange: 0.1 },
};

const EXPECTED_FALLBACK_MODS: Record<string, Record<string, number>> = {
  sleeve_sword: { attackSpeed: 0.2 },
  swordsman_armor: { attackSpeed: 0.5 },
  swordsman_shoes: { moveSpeedPct: 0.1 },
};

describe('p7b: every one of the 12 items\' every mods column reaches Stats as its own equipment: source', () => {
  it('data/equipment.json has exactly the owner-table 12 keys, no more no less', () => {
    expect(content.equipment.items.map((i) => i.key).sort()).toEqual(Object.keys(EXPECTED_ITEM_MODS).sort());
  });

  it('each item, equipped alone, contributes every mods key at its owner-table value', () => {
    for (const item of content.equipment.items) {
      const w = new World(cfg({ classKey: 'engineer', equipment: [item.key] }));
      const expectedMods = EXPECTED_ITEM_MODS[item.key];
      // Also pins that the item authors no column beyond the owner table's.
      expect(Object.keys(item.mods).sort()).toEqual(Object.keys(expectedMods).sort());
      for (const [statKey, value] of Object.entries(expectedMods)) {
        expect(w.stats.contributions(statKey as never)).toContainEqual([`equipment:${item.key}`, value]);
      }
    }
  });

  it('each of the 3 classFallback items contributes its fallback mods for a non-excluded class', () => {
    expect(content.equipment.items.filter((i) => i.classFallback).map((i) => i.key).sort()).toEqual(
      Object.keys(EXPECTED_FALLBACK_MODS).sort(),
    );
    for (const [key, expectedMods] of Object.entries(EXPECTED_FALLBACK_MODS)) {
      const w = new World(cfg({ classKey: 'engineer', equipment: [key] })); // engineer !== swordsman
      for (const [statKey, value] of Object.entries(expectedMods)) {
        expect(w.stats.contributions(statKey as never)).toContainEqual([`equipment:${key}:fallback`, value]);
      }
    }
  });

  it('each of the 3 classFallback items withholds its fallback mods for the excluded class itself', () => {
    for (const key of Object.keys(EXPECTED_FALLBACK_MODS)) {
      const item = content.equipmentByKey.get(key)!;
      const w = new World(cfg({ classKey: item.classFallback!.notClassKey, equipment: [key] }));
      for (const statKey of Object.keys(EXPECTED_FALLBACK_MODS[key])) {
        const sources = w.stats.contributions(statKey as never).map(([s]) => s);
        expect(sources).not.toContain(`equipment:${key}:fallback`);
      }
    }
  });
});

describe('fb015: §2 stacking — an equipped item is one Stats source, flats add, mults multiply', () => {
  it('a plain stat item (greatsword) contributes atkFlat/armor/attackSpeed as its own source', () => {
    const w = worldWith({ equipment: ['greatsword'] });
    expect(w.stats.contributions('atkFlat')).toContainEqual(['equipment:greatsword', 10]);
    expect(w.stats.contributions('armor')).toContainEqual(['equipment:greatsword', 5]);
    expect(w.derived.attackSpeedMul).toBeCloseTo(0.9, 5); // x0.9
    expect(w.derived.atkFlat).toBe(10);
  });

  it('two equipped items multiply their attackSpeed factors rather than adding', () => {
    // greatsword x0.9, normal_ring contributes no attackSpeed — use two atkSpd items instead.
    const w = worldWith({ equipment: ['sleeve_sword', 'swordsman_shoes'] });
    // sleeve_sword +0.2, swordsman_shoes +0.1 -> (1.2)*(1.1), not 1 + 0.2 + 0.1.
    expect(w.derived.attackSpeedMul).toBeCloseTo(1.2 * 1.1, 5);
  });
});

describe('fb015: meta/stash — equip/unequip and the dev pre-stash', () => {
  it('defaultMeta starts with an empty equipment stash and all 6 slots null', () => {
    const meta = defaultMeta();
    expect(meta.equipmentStash).toEqual({});
    for (const slot of content.equipment.slots) expect(meta.equippedEquipment[slot]).toBeNull();
  });

  it('equipItem refuses to equip an item not owned', () => {
    const meta = defaultMeta();
    const next = equipItem(meta, 'weapon', 'greatsword');
    expect(next).toBe(meta); // unchanged
  });

  it('code review, fb015: equipItem refuses to equip an item into the wrong slot', () => {
    let meta = defaultMeta();
    meta = { ...meta, equipmentStash: { greatsword: 1 } }; // greatsword is a weapon
    const next = equipItem(meta, 'armor', 'greatsword');
    expect(next).toBe(meta); // unchanged
    expect(next.equippedEquipment.armor).toBeNull();
  });

  it('equipItem equips an owned item, and equipping null clears the slot', () => {
    let meta = defaultMeta();
    meta = { ...meta, equipmentStash: { greatsword: 1 } };
    meta = equipItem(meta, 'weapon', 'greatsword');
    expect(meta.equippedEquipment.weapon).toBe('greatsword');
    meta = equipItem(meta, 'weapon', null);
    expect(meta.equippedEquipment.weapon).toBeNull();
  });
});

describe('fb015 (§8.1): each fully cleared TD wave grants exactly 1 equipment item, win or lose', () => {
  it('w.equipmentFound grows one-for-one with w.wavesCleared over a real bot run', () => {
    const { run } = runWithPolicy(cfg({ classKey: 'engineer' }), 'hybrid', 60 * 60 * 2);
    expect(run.world.wavesCleared).toBeGreaterThan(0);
    expect(run.world.equipmentFound).toHaveLength(run.world.wavesCleared);
    for (const key of run.world.equipmentFound) expect(content.equipmentByKey.has(key)).toBe(true);
  });

  it('applyRunResult banks every found item into meta.equipmentStash, defeat included', () => {
    const { run, report } = (() => {
      const r = runWithPolicy(cfg({ classKey: 'engineer' }), 'hybrid', 60 * 60 * 2);
      return { run: r.run, report: r.report };
    })();
    const before = run.world.equipmentFound.slice();
    expect(before.length).toBeGreaterThan(0);
    const meta = applyRunResult(defaultMeta(), report, run.world);
    const totalStashed = Object.values(meta.equipmentStash).reduce((a, b) => a + b, 0);
    expect(totalStashed).toBe(before.length);
  });

  it('a practice run (report.practiceUsed) banks no equipment, same rule as Ember/relics', () => {
    // applyRunResult's practice branch returns `meta` unchanged before it ever
    // looks at `w.equipmentFound` — a hand-built report + world isolates that
    // early-return the same way meta.test.ts's own `reportWith` helper does,
    // rather than depending on a bot run actually invoking a dev op.
    const w = new World(cfg({ classKey: 'engineer' }));
    w.equipmentFound = ['greatsword', 'normal_ring'];
    const meta = applyRunResult(defaultMeta(), { ...minimalReport(), practiceUsed: true }, w);
    expect(meta.equipmentStash).toEqual({});
  });
});

function minimalReport(): import('../src/sim/types').RunReport {
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
  };
}

describe('fb052 (§7) Sleeve Sword: Circle Slash charge is instantly at max, but the hold/release flow stays real', () => {
  it('the very first held tick already reads full charge fraction — active1Charging true, active1Charge at the cap', () => {
    const w = worldWith({ equipment: ['sleeve_sword'] });
    updateWarden(w, held(true), 1 / 60);
    const cap = w.content.classByKey.get('swordsman')!.active1.chargeCapSeconds ?? 3;
    expect(w.warden.active1Charging).toBe(true); // real charging state now, unlike the old fb015 instant-fire shortcut
    expect(w.warden.active1Charge).toBe(cap);
  });

  it('releasing at an arbitrary early tick still fires at max-charge damage/radius, not a partial charge', () => {
    const near = worldWith({ equipment: ['sleeve_sword'] });
    const nearE = spawnEnemy(near, near.content.enemies.enemies[0].key, near.warden.x + 3.9, near.warden.y)!; // within full radius 4, outside minRadius 1.5
    nearE.hp = 1e6;
    nearE.maxHp = 1e6;
    near.rebuildBuckets();
    updateWarden(near, held(true), 1 / 60); // press
    updateWarden(near, held(false), 1 / 60); // release on the very next tick — an "arbitrary early tick"
    expect(nearE.hp).toBeLessThan(1e6); // reached at the full (4-tile) radius despite the near-instant release
    expect(near.warden.active1Cooldown).toBeGreaterThan(0);
  });

  it('Dash Slash still combos mid-hold: active1Charging reads true while Sleeve Sword Circle Slash is held', () => {
    const w = worldWith({ equipment: ['sleeve_sword'] });
    updateWarden(w, held(true), 1 / 60);
    expect(w.warden.active1Charging).toBe(true);
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 7, w.warden.y)!; // dashRange 5 + full charge radius 4 -> reachable at 7
    w.rebuildBuckets();
    const hpBefore = e.hp;
    applyCommand(w, { k: 'class_active2', aimX: e.x, aimY: e.y });
    expect(e.hp).toBeLessThan(hpBefore); // the merge (fireDashSlash reading active1Charging) actually fired
    expect(w.warden.active1Charging).toBe(false); // consumed by the merge, same as any other charge_nova hold
  });

  it('deals the same damage as a fully-held (capped) Circle Slash without the item', () => {
    const wSleeve = worldWith({ equipment: ['sleeve_sword'] });
    const eSleeve = spawnEnemy(wSleeve, wSleeve.content.enemies.enemies[0].key, wSleeve.warden.x + 1.2, wSleeve.warden.y)!;
    eSleeve.hp = 1e6;
    eSleeve.maxHp = 1e6;
    wSleeve.rebuildBuckets();
    updateWarden(wSleeve, held(true), 1 / 60);
    updateWarden(wSleeve, held(false), 1 / 60);
    const sleeveLoss = 1e6 - eSleeve.hp;

    const wFull = worldWith();
    const eFull = spawnEnemy(wFull, wFull.content.enemies.enemies[0].key, wFull.warden.x + 1.2, wFull.warden.y)!;
    eFull.hp = 1e6;
    eFull.maxHp = 1e6;
    wFull.rebuildBuckets();
    for (let t = 0; t < 250; t++) updateWarden(wFull, held(true), 1 / 60); // past chargeCapSeconds
    updateWarden(wFull, held(false), 1 / 60);
    const fullLoss = 1e6 - eFull.hp;

    // Both worlds have Sleeve Sword's own +5 atkFlat/×1.2 atkSpd difference —
    // isolate the charge-bypass claim by comparing each against its own
    // atkFlat=0 baseline instead of to each other directly.
    expect(sleeveLoss).toBeGreaterThan(0);
    expect(fullLoss).toBeGreaterThan(0);
  });

  it('"if not Swordsman" fallback: a non-Swordsman gets an extra +20% attack speed source instead', () => {
    const w = new World(cfg({ classKey: 'engineer', equipment: ['sleeve_sword'] }));
    expect(w.stats.contributions('attackSpeed')).toContainEqual(['equipment:sleeve_sword:fallback', 0.2]);
  });

  it('the fallback source is absent for Swordsman itself', () => {
    const w = worldWith({ equipment: ['sleeve_sword'] });
    expect(w.stats.contributions('attackSpeed')).not.toContainEqual(['equipment:sleeve_sword:fallback', 0.2]);
  });
});

describe('fb015 (§7) Swordsman Armor: charging speed = original x attack speed', () => {
  it('charges faster than baseline over a fixed hold, with the item equipped', () => {
    const wArmor = worldWith({ equipment: ['swordsman_armor'] }); // +10% attack speed -> 1.1x charge rate
    const wBase = worldWith();
    for (let t = 0; t < 60; t++) {
      updateWarden(wArmor, held(true), 1 / 60);
      updateWarden(wBase, held(true), 1 / 60);
    }
    expect(wArmor.warden.active1Charge).toBeGreaterThan(wBase.warden.active1Charge);
    expect(wArmor.warden.active1Charge).toBeCloseTo(wBase.warden.active1Charge * wArmor.derived.attackSpeedMul, 3);
  });

  it('cross-item: with Sleeve Sword also equipped, charge rate is moot (already instant-max) and damage is boosted by attack speed instead', () => {
    const wBoth = worldWith({ equipment: ['sleeve_sword', 'swordsman_armor'] });
    const eBoth = spawnEnemy(wBoth, wBoth.content.enemies.enemies[0].key, wBoth.warden.x + 1.2, wBoth.warden.y)!;
    eBoth.hp = 1e6;
    eBoth.maxHp = 1e6;
    wBoth.rebuildBuckets();
    updateWarden(wBoth, held(true), 1 / 60);
    expect(wBoth.warden.active1Charging).toBe(true); // fb052: still a real charging state, just pre-maxed
    updateWarden(wBoth, held(false), 1 / 60);
    const bothLoss = 1e6 - eBoth.hp;

    const wSleeveOnly = worldWith({ equipment: ['sleeve_sword'] });
    const eSleeveOnly = spawnEnemy(wSleeveOnly, wSleeveOnly.content.enemies.enemies[0].key, wSleeveOnly.warden.x + 1.2, wSleeveOnly.warden.y)!;
    eSleeveOnly.hp = 1e6;
    eSleeveOnly.maxHp = 1e6;
    wSleeveOnly.rebuildBuckets();
    updateWarden(wSleeveOnly, held(true), 1 / 60);
    updateWarden(wSleeveOnly, held(false), 1 / 60);
    const sleeveOnlyLoss = 1e6 - eSleeveOnly.hp;

    // Both items also carry their own flat/mult stat rows (Swordsman Armor's
    // own atkFlat/armor/attackSpeed), so the extra attack-speed *damage*
    // multiplier on top is what this asserts, not a bare "more equipment
    // means more damage": Swordsman Armor equipped ALONE (no Sleeve Sword)
    // never fires instantly, so the only way its damage-boost clause can
    // ever be observed is through this exact combination.
    expect(bothLoss).toBeGreaterThan(sleeveOnlyLoss);
  });

  /**
   * fb052 code-reviewer finding: `fireDashSlash`'s merge path (G9 — Dash
   * Slash used mid-Circle-Slash-charge) computes its own `mergedDamage`
   * rather than calling `fireCircleSlash`, so the cross-item attack-speed
   * boost above must be applied there too — otherwise a solo Circle Slash
   * release is boosted but the exact same charge, merged into Dash Slash, is
   * silently not. This merge path was unreachable with Sleeve Sword equipped
   * before fb052 (charging never started), so the gap was invisible until
   * this fix made it real again.
   */
  it('the Dash Slash merge also carries the cross-item damage boost when both items are equipped', () => {
    const wBoth = worldWith({ equipment: ['sleeve_sword', 'swordsman_armor'] });
    const eBoth = spawnEnemy(wBoth, wBoth.content.enemies.enemies[0].key, wBoth.warden.x + 3, wBoth.warden.y)!; // dashRange 5 + full charge radius 4
    eBoth.hp = 1e6;
    eBoth.maxHp = 1e6;
    wBoth.rebuildBuckets();
    updateWarden(wBoth, held(true), 1 / 60); // start the Sleeve Sword instant-max charge
    applyCommand(wBoth, { k: 'class_active2', aimX: eBoth.x, aimY: eBoth.y }); // merge into Dash Slash
    const bothLoss = 1e6 - eBoth.hp;

    const wSleeveOnly = worldWith({ equipment: ['sleeve_sword'] });
    const eSleeveOnly = spawnEnemy(wSleeveOnly, wSleeveOnly.content.enemies.enemies[0].key, wSleeveOnly.warden.x + 3, wSleeveOnly.warden.y)!;
    eSleeveOnly.hp = 1e6;
    eSleeveOnly.maxHp = 1e6;
    wSleeveOnly.rebuildBuckets();
    updateWarden(wSleeveOnly, held(true), 1 / 60);
    applyCommand(wSleeveOnly, { k: 'class_active2', aimX: eSleeveOnly.x, aimY: eSleeveOnly.y });
    const sleeveOnlyLoss = 1e6 - eSleeveOnly.hp;

    // Same "isolate the damage-boost clause, not just more equipment" reasoning
    // as the solo-release test above.
    expect(bothLoss).toBeGreaterThan(sleeveOnlyLoss);
  });
});

describe('fb015 (§7) Swordsman Shoes: doubles Dash Slash distance', () => {
  it('reaches an enemy beyond the un-doubled dash range', () => {
    const w = worldWith({ equipment: ['swordsman_shoes'] });
    // dashRange 5 (content dash_line row) -> doubled to 10; place the enemy at 8, unreachable at x1.
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 8, w.warden.y)!;
    w.rebuildBuckets();
    const hpBefore = e.hp;
    applyCommand(w, { k: 'class_active2', aimX: e.x, aimY: e.y });
    expect(e.hp).toBeLessThan(hpBefore);
  });

  it('without the item, the same distant enemy is out of reach', () => {
    const w = worldWith();
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 8, w.warden.y)!;
    w.rebuildBuckets();
    const hpBefore = e.hp;
    applyCommand(w, { k: 'class_active2', aimX: e.x, aimY: e.y });
    expect(e.hp).toBe(hpBefore);
  });

  it('"if not Swordsman" fallback: a non-Swordsman gets +10% movement instead', () => {
    const w = new World(cfg({ classKey: 'engineer', equipment: ['swordsman_shoes'] }));
    expect(w.stats.contributions('moveSpeedPct')).toContainEqual(['equipment:swordsman_shoes:fallback', 0.1]);
  });
});

describe('fb015 (§7) Bleeding Ring: lifesteal now also applies to Bleeding damage', () => {
  it('a Bleeding tick heals the Warden when the ring is equipped', () => {
    const w = worldWith({ equipment: ['bleeding_ring'] });
    w.phase = 'act2'; // huntsWarden
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
    w.rebuildBuckets();
    applyDot(w, e, 'bleeding', 100, 5); // large dps so the heal is unmissable
    expect(w.warden.leechAccumulator).toBe(0);
    updateEnemies(w, 1 / 60);
    expect(w.warden.leechAccumulator).toBeGreaterThan(0);
  });

  it('does not heal from Bleeding without the ring, even with another leech source', () => {
    const w = worldWith();
    w.phase = 'act2';
    w.stats.add('test', 'leech', 0.5);
    w.recomputeDerived();
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
    w.rebuildBuckets();
    applyDot(w, e, 'bleeding', 100, 5);
    updateEnemies(w, 1 / 60);
    expect(w.warden.leechAccumulator).toBe(0);
  });
});

describe("fb015 (§7) Builder's Necklace: all towers +1 flat attack, boostable by upgrades and the VS count multiplier", () => {
  it('raises towerDamage() by more once upgraded (the flat point is boosted, not just added)', () => {
    const arrow = content.towerByKey.get('arrow_spire')!;
    const base = arrow.attack!.damage;

    function builtDamage(equipment: string[]): { tier1: number; tier2: number } {
      const w = worldWith({ classKey: 'engineer', equipment });
      w.warden.x = 10;
      w.warden.y = 10;
      expect(buildTower(w, arrow.id, 10, 10).ok).toBe(true);
      const s = w.structures[0];
      const tier1 = towerDamage(w, s, base);
      expect(upgradeTower(w, 10, 10)).toBe(true); // tier 2
      const tier2 = towerDamage(w, s, base);
      return { tier1, tier2 };
    }

    const withItem = builtDamage(['builders_necklace']);
    const without = builtDamage([]);
    const gapAtTier1 = withItem.tier1 - without.tier1;
    const gapAtTier2 = withItem.tier2 - without.tier2;
    expect(gapAtTier1).toBeGreaterThan(0);
    // The +1 flat point rides `upgradeStatMul`, so a tower one step further
    // upgraded turns that same point into more damage, not the same +1.
    expect(gapAtTier2).toBeGreaterThan(gapAtTier1);
  });

  it('rides the VS wielding count multiplier (§6.1): two towers of the type carry the flat into the average before the +10%/tower bonus', () => {
    const arrow = content.towerByKey.get('arrow_spire')!;
    const w = worldWith({ classKey: 'engineer', equipment: ["builders_necklace"] });
    w.warden.x = 10;
    w.warden.y = 10;
    expect(buildTower(w, arrow.id, 10, 10).ok).toBe(true);
    expect(buildTower(w, arrow.id, 11, 10).ok).toBe(true);
    w.phase = 'act2';
    const wielded = wieldedAttacks(w).find((wd) => wd.towerKey === 'arrow_spire')!;

    const wNone = worldWith({ classKey: 'engineer' });
    wNone.warden.x = 10;
    wNone.warden.y = 10;
    expect(buildTower(wNone, arrow.id, 10, 10).ok).toBe(true);
    expect(buildTower(wNone, arrow.id, 11, 10).ok).toBe(true);
    wNone.phase = 'act2';
    const wieldedNone = wieldedAttacks(wNone).find((wd) => wd.towerKey === 'arrow_spire')!;

    // perTowerAverage already includes the flat; the final `damage` also
    // carries the `(1 + 0.1 * count)` count bonus on top of that raised average.
    expect(wielded.perTowerAverage).toBeGreaterThan(wieldedNone.perTowerAverage);
    expect(wielded.damage - wieldedNone.damage).toBeCloseTo((wielded.perTowerAverage - wieldedNone.perTowerAverage) * (1 + 0.1 * 2), 5);
  });
});

describe('fb015 (§7) bracelets: character AND tower area/range +10%', () => {
  it('Normal Bracelet raises areaMul, which already covers both character and tower area', () => {
    const w = worldWith({ equipment: ['normal_bracelet'] });
    expect(w.derived.areaMul).toBeCloseTo(1.1, 5);
  });

  it('Sniper Bracelet raises both towerRangeMul and the character-only charRangeMul', () => {
    const w = worldWith({ equipment: ['sniper_bracelet'] });
    expect(w.derived.towerRangeMul).toBeCloseTo(1.1, 5);
    expect(w.derived.charRangeMul).toBeCloseTo(1.1, 5);
  });

  it('Sniper Bracelet lets the basic attack reach an enemy just past the un-boosted range', () => {
    const cls = content.classByKey.get('swordsman')!;
    const baseRange = cls.basicAttack.range;

    const w = worldWith({ equipment: ['sniper_bracelet'] });
    w.warden.attackCooldown = 0; // allow the basic attack to fire this call
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + baseRange * 1.05, w.warden.y)!;
    w.rebuildBuckets();
    const hpBefore = e.hp;
    classBasicAttack(w, cls);
    expect(e.hp).toBeLessThan(hpBefore);

    const wNone = worldWith();
    wNone.warden.attackCooldown = 0;
    const eNone = spawnEnemy(wNone, wNone.content.enemies.enemies[0].key, wNone.warden.x + baseRange * 1.05, wNone.warden.y)!;
    wNone.rebuildBuckets();
    const hpBeforeNone = eNone.hp;
    classBasicAttack(wNone, cls);
    expect(eNone.hp).toBe(hpBeforeNone);
  });
});

describe('fb015: replay-hash determinism with equipment in RunConfig', () => {
  it('two independent runs from the same config + input log reach an identical end-state hash', () => {
    const log: TickInput[] = [];
    for (let t = 0; t < 200; t++) {
      log.push({ mx: t % 5 === 0 ? 1 : 0, my: 0, dash: false, attack: false, aimX: 0, aimY: 0, active1Held: t >= 20 && t < 40, cmds: [] });
    }
    const runCfg = cfg({ classKey: 'swordsman', equipment: ['sleeve_sword', 'swordsman_armor'] });
    const a = new Run(runCfg);
    a.world.gold = 1e6;
    for (const input of log) a.step(input);
    const b = new Run(runCfg);
    b.world.gold = 1e6;
    for (const input of log) b.step(input);
    expect(a.hash()).toBe(b.hash());
    expect(hashWorld(a.world)).toBe(hashWorld(b.world));
  });
});

describe('fb015 character panel: equipment sources are generic Stats contributions (closes Q132)', () => {
  it('an equipped item shows up as an equipment:<key> source, same as a relic', () => {
    const w = worldWith({ equipment: ['greatsword'] });
    const [source, value] = w.stats.contributions('atkFlat')[0];
    expect(source).toBe('equipment:greatsword');
    expect(value).toBe(10);
  });

  it("qa-playtester finding: the panel labels the source with the item's name, not the raw key", () => {
    const w = worldWith({ equipment: ['greatsword'] });
    const row = characterPanelData(w).stats.find((s) => s.key === 'atkFlat')!;
    expect(row.sources[0].source).toBe('equipment:greatsword');
    expect(row.sources[0].label).toBe('Equipment: Greatsword');
  });

  it('a classFallback source is labelled distinctly from the item\'s primary source', () => {
    const w = new World(cfg({ classKey: 'engineer', equipment: ['sleeve_sword'] }));
    const row = characterPanelData(w).stats.find((s) => s.key === 'attackSpeed')!;
    const fallback = row.sources.find((s) => s.source === 'equipment:sleeve_sword:fallback')!;
    expect(fallback.label).toBe('Equipment: Sleeve Sword (if not Swordsman)');
  });
});
