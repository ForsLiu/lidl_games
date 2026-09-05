/**
 * c022 (BACKLOG-CONTENT, lane `content`) — **the behavioural half of §7's
 * Effect column.**
 *
 * `c012` built `tests/equip-spec-numbers.test.ts`, a ledger holding every
 * SPEC-FINAL §7 figure to `data/equipment.json`. QA then measured the hole
 * c022 was filed on: moving `normal_necklace`'s `"towerCost": -0.2` to
 * `"goldFind": -0.2` **and the ledger row's `stat` with it** leaves that file
 * fully green — §7's "tower upgrade cost −20%" would be authored on gold find
 * and the ledger would audit gold find, in agreement with itself. A numeric
 * row's `stat` was only ever pinned by `NUMERIC_STAT`, which covers the five
 * numeric columns; the 13 Effect rows choose their key freely.
 *
 * c022 closes it by giving every Effect row a **behavioural pointer**: a
 * `describe`/`it` whose body reads that row's own stat and observes it moving
 * something. Six of the thirteen already had one in
 * `tests/fb015-equipment.test.ts` and point there. The other seven had no
 * block anywhere that named their stat — `hpRegen`, `xpGain`, `towerCost`,
 * `leech`'s magnitude, `bleedLifesteal` as a stat rather than as an equipped
 * item, `towerAtkFlat` as a key rather than as a damage delta, and Swordsman
 * Armor's `classFallback` (which had no dedicated block at all, only the
 * generic three-item fallback loop). Those seven live here, in this lane's
 * own `tests/equip-*` file, because `tests/fb015-equipment.test.ts` is outside
 * the content lane's Scope.
 *
 * **Every block below names its stat key in its own body on purpose.** That is
 * what the ledger anchors against, and it is what makes the `towerCost` ->
 * `goldFind` mutation red: the covering block reads `towerCost`, so a row that
 * claims to audit `goldFind` can no longer point at it.
 *
 * Each block is a control pair — item equipped versus not — so it measures the
 * item's own contribution rather than "a world with equipment does more".
 *
 * **The §7 figures below are literals on purpose**, which is the one place
 * this file looks like the `EXPECTED_ITEM_MODS` table `c012`'s header objects
 * to. It is the opposite case: a behaviour test that reads its expectation out
 * of `/data` asserts only that the engine multiplied by whatever is authored,
 * which is true of any number. The figure's tie to `/data` and to §7 is the
 * ledger's job, and it holds it independently; these blocks exist to prove the
 * authored key does what §7's sentence says, and a literal is what makes that
 * a claim.
 *
 * refs: SPEC-FINAL §7, c012, c022, QA on c012.
 */

import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';
import { applyDot, spawnEnemy, updateEnemies } from '../src/sim/enemies';
import { addXp } from '../src/sim/progression';
import { updateWarden } from '../src/sim/run';
import { buildTower, towerCost, towerDamage } from '../src/sim/towers';
import { upgradeCost } from '../src/sim/upgrades';
import type { TickInput } from '../src/sim/types';
import { World } from '../src/sim/world';
import { cfg } from './helpers';
import { BUILD_TX, BUILD_TY, WX, WY } from './class-board';

const content = loadContent();

/** fb015's own convention: gold for building, basic attack suppressed. */
function worldWith(over: Record<string, unknown> = {}): World {
  const w = new World(cfg({ classKey: 'swordsman', ...over }));
  w.gold = 1e6;
  w.warden.attackCooldown = 1e9;
  return w;
}

function idle(): TickInput {
  return { mx: 0, my: 0, dash: false, attack: false, aimX: 0, aimY: 0, active1Held: false, cmds: [] };
}

describe('c022 (§7) Swordsman Armor classFallback: a non-Swordsman gets attackSpeed ×1.5 instead', () => {
  it('the fallback contributes to the attackSpeed stat for a non-Swordsman, and to nothing for the Swordsman', () => {
    const wOther = new World(cfg({ classKey: 'engineer', equipment: ['swordsman_armor'] }));
    expect(wOther.stats.contributions('attackSpeed')).toContainEqual([
      'equipment:swordsman_armor:fallback',
      0.5,
    ]);

    const wOwner = worldWith({ equipment: ['swordsman_armor'] });
    expect(wOwner.stats.contributions('attackSpeed').map((c) => c[0])).not.toContain(
      'equipment:swordsman_armor:fallback',
    );
  });

  it('the fallback raises attackSpeedMul above the same class without the item', () => {
    const wWith = new World(cfg({ classKey: 'engineer', equipment: ['swordsman_armor'] }));
    const wNone = new World(cfg({ classKey: 'engineer' }));
    // §7's own composition: the item's own ×1.1 column times the ×1.5 fallback.
    expect(wWith.derived.attackSpeedMul).toBeCloseTo(wNone.derived.attackSpeedMul * 1.1 * 1.5, 6);
  });
});

describe('c022 (§7) Normal Ring: life regen +1', () => {
  it('raises the hpRegen stat by exactly 1 over the same world without the ring', () => {
    const wWith = worldWith({ equipment: ['normal_ring'] });
    const wNone = worldWith();
    expect(wWith.derived.hpRegen).toBeCloseTo(wNone.derived.hpRegen + 1, 9);
  });

  it('a wounded Warden heals faster per second with the ring than without it', () => {
    function healedOverASecond(equipment: string[]): number {
      const w = worldWith({ equipment });
      w.warden.hp = 1; // well below maxHp, so the regen is not clipped by the cap
      w.warden.outOfCombat = 1e6; // Act I regens out of combat only (run.ts)
      const before = w.warden.hp;
      for (let t = 0; t < 60; t++) updateWarden(w, idle(), 1 / 60);
      return w.warden.hp - before;
    }
    const gained = healedOverASecond(['normal_ring']);
    const control = healedOverASecond([]);
    expect(gained).toBeGreaterThan(control);
    // The whole gap is the ring's hpRegen point, spread over one second.
    expect(gained - control).toBeCloseTo(1, 3);
  });
});

describe('c022 (§7) Bleeding Ring: +0.01% lifesteal', () => {
  it('authors the leech stat at 0.0001, not 0.01', () => {
    const wWith = worldWith({ equipment: ['bleeding_ring'] });
    const wNone = worldWith();
    expect(wWith.derived.leech - wNone.derived.leech).toBeCloseTo(0.0001, 12);
  });

  it('the healed amount is the damage dealt times the leech stat', () => {
    const w = worldWith({ equipment: ['bleeding_ring'] });
    w.phase = 'act2'; // huntsWarden, so the Warden is the leech beneficiary
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
    e.hp = 1e6;
    e.maxHp = 1e6;
    w.rebuildBuckets();
    const hpBefore = e.hp;
    applyDot(w, e, 'bleeding', 6000, 5); // 6000 dps, so one tick is a round 100
    updateEnemies(w, 1 / 60);
    const dealt = hpBefore - e.hp;
    expect(dealt).toBeGreaterThan(0);
    // Both sides positive **first**. QA deleted `"leech": 0.0001` from the
    // ring and this block stayed green on `0 ≈ 0 * 0` — a cover that survives
    // its own stat being removed is not a cover, and it was the one block of
    // the seven that did.
    expect(w.derived.leech, 'the ring authors no leech at all').toBeGreaterThan(0);
    expect(w.warden.leechAccumulator, 'the Bleeding tick healed nothing').toBeGreaterThan(0);
    expect(w.warden.leechAccumulator).toBeCloseTo(dealt * w.derived.leech, 9);
  });
});

describe('c022 (§7) Bleeding Ring: the bleedLifesteal flag is what routes Bleeding damage into leech', () => {
  it('the ring sets bleedLifesteal and nothing else does', () => {
    expect(worldWith({ equipment: ['bleeding_ring'] }).derived.bleedLifesteal).toBe(true);
    expect(worldWith().derived.bleedLifesteal).toBe(false);
  });

  it('with the same leech but bleedLifesteal cleared, a Bleeding tick heals nothing', () => {
    function bledInto(flag: boolean): number {
      const w = worldWith();
      w.phase = 'act2';
      w.stats.add('test', 'leech', 0.5);
      if (flag) w.stats.add('test', 'bleedLifesteal', 1);
      w.recomputeDerived();
      expect(w.derived.bleedLifesteal).toBe(flag);
      const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
      e.hp = 1e6;
      e.maxHp = 1e6;
      w.rebuildBuckets();
      applyDot(w, e, 'bleeding', 6000, 5);
      updateEnemies(w, 1 / 60);
      return w.warden.leechAccumulator;
    }
    expect(bledInto(true)).toBeGreaterThan(0);
    expect(bledInto(false)).toBe(0);
  });
});

describe('c022 (§7) Normal Necklace: EXP +20%', () => {
  it('raises the xpGain stat into xpMul', () => {
    const wWith = worldWith({ equipment: ['normal_necklace'] });
    const wNone = worldWith();
    expect(wWith.stats.contributions('xpGain')).toContainEqual(['equipment:normal_necklace', 0.2]);
    expect(wWith.derived.xpMul).toBeCloseTo(wNone.derived.xpMul + 0.2, 9);
  });

  it('the same awarded xp banks 20% more with the necklace equipped', () => {
    function banked(equipment: string[]): number {
      const w = worldWith({ equipment });
      const before = w.xp;
      // Small enough that neither world crosses xpToReach(2) and levels up,
      // which would subtract the threshold back out of `w.xp`.
      addXp(w, 5);
      return w.xp - before;
    }
    expect(banked(['normal_necklace'])).toBeCloseTo(banked([]) * 1.2, 6);
  });
});

describe('c022 (§7) Normal Necklace: tower upgrade cost −20%', () => {
  it('discounts the towerCost stat, which prices both the build and the upgrade step', () => {
    // A tower whose upgrade step is priced above the `Math.max(1, ...)` floor,
    // so a 20% discount is visible at all: the first row's stepCost is 0.
    const def = content.towers.towers.find((t) => t.upgrades.stepCost >= 20)!;
    const wWith = worldWith({ equipment: ['normal_necklace'] });
    const wNone = worldWith();
    expect(wWith.stats.contributions('towerCost')).toContainEqual(['equipment:normal_necklace', -0.2]);
    expect(wWith.derived.towerCostMul).toBeCloseTo(wNone.derived.towerCostMul * 0.8, 9);
    // Q136(1), owner-approved: `towerCost` is the engine's existing stat and
    // discounts both the build price (`towers.ts`) and the upgrade step
    // (`upgrades.ts`). §7's own sentence names the upgrade one.
    expect(upgradeCost(wWith, def)).toBeLessThan(upgradeCost(wNone, def));
    expect(towerCost(wWith, def)).toBeLessThan(towerCost(wNone, def));
  });
});

describe("c022 (§7) Builder's Necklace: all towers +1 flat attack", () => {
  it('the +1 is authored on the towerAtkFlat stat', () => {
    const wWith = worldWith({ classKey: 'engineer', equipment: ['builders_necklace'] });
    const wNone = worldWith({ classKey: 'engineer' });
    expect(wWith.derived.towerAtkFlat - wNone.derived.towerAtkFlat).toBeCloseTo(1, 9);
  });

  it('a built tower deals more damage for it', () => {
    function built(equipment: string[]): number {
      const w = worldWith({ classKey: 'engineer', equipment });
      w.warden.x = WX;
      w.warden.y = WY;
      const def = content.towers.towers.find((t) => t.attack)!;
      expect(buildTower(w, def.id, BUILD_TX, BUILD_TY).ok).toBe(true);
      return towerDamage(w, w.structures[0], def.attack!.damage);
    }
    expect(built(['builders_necklace'])).toBeGreaterThan(built([]));
  });
});
