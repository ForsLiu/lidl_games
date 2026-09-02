/**
 * b076 (SPEC-FINAL §7): a mid-run `equip_item` swap of Sleeve Sword/Swordsman
 * Armor/Swordsman Shoes correctly flips their generic `Stats` mods live
 * (`equipItemCommand`, `src/sim/run.ts`), but before this fix their three
 * `effectKey` mechanics (`circleSlashChargeRate`, `tickClassCharge`'s Sleeve
 * Sword branch, `fireDashSlash`'s doubled `dashRange`, all `src/sim/classes.ts`)
 * stayed gated on `hasEquipment` (`src/sim/equipment.ts`), which read the
 * frozen starting loadout `w.cfg.equipment` instead of the live, swappable
 * `w.equippedEquipment` — so equipping (or unequipping) one of these three
 * items mid-run silently left its special mechanic stuck at whatever was true
 * at run start. `hasEquipment` now reads `w.equippedEquipment`.
 */
import { describe, expect, it } from 'vitest';

import { applyCommand } from '../src/sim/run';
import { spawnEnemy } from '../src/sim/enemies';
import { updateWarden } from '../src/sim/run';
import { World } from '../src/sim/world';
import type { TickInput } from '../src/sim/types';
import { cfg } from './helpers';

function held(active1Held: boolean, over: Partial<TickInput> = {}): TickInput {
  return { mx: 0, my: 0, dash: false, attack: false, aimX: 0, aimY: 0, active1Held, cmds: [], ...over };
}

/** Swordsman with no starting equipment, so every effectKey mechanic starts inert. */
function swordsmanWorld(ownedEquipment: Record<string, number>): World {
  const w = new World(cfg({ classKey: 'swordsman', ownedEquipment }));
  w.gold = 1e6;
  w.warden.attackCooldown = 1e9; // suppress the basic attack contaminating the measurements below
  return w;
}

describe('b076: circleSlashChargeRate reads the live loadout, not the frozen starting one', () => {
  it('equipping Swordsman Armor mid-run (before holding) speeds up charge accumulation vs. never equipping it', () => {
    const wBase = swordsmanWorld({ swordsman_armor: 1 });
    updateWarden(wBase, held(true), 1 / 60);
    expect(wBase.warden.active1Charge).toBeCloseTo(1 / 60, 6); // base rate: attackSpeedMul 1

    const wEquipped = swordsmanWorld({ swordsman_armor: 1 });
    applyCommand(wEquipped, { k: 'equip_item', slot: 'armor', item: 'swordsman_armor' });
    expect(wEquipped.derived.attackSpeedMul).toBeGreaterThan(1); // the item's own Stats mod is already live
    updateWarden(wEquipped, held(true), 1 / 60);
    // Post-fix: the charge-rate effectKey mechanic is live too, so this tick's
    // increment is scaled by attackSpeedMul, not stuck at the pre-equip rate.
    expect(wEquipped.warden.active1Charge).toBeCloseTo((1 / 60) * wEquipped.derived.attackSpeedMul, 6);
    expect(wEquipped.warden.active1Charge).toBeGreaterThan(wBase.warden.active1Charge);
  });
});

describe('b076: tickClassCharge\'s Sleeve Sword branch reads the live loadout', () => {
  it('a mid-run equip makes the very next Active1 press fire instantly at max charge, no charging state', () => {
    const w = swordsmanWorld({ sleeve_sword: 1 });
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1.2, w.warden.y)!;
    e.hp = 1e6;
    e.maxHp = 1e6;
    w.rebuildBuckets();

    applyCommand(w, { k: 'equip_item', slot: 'weapon', item: 'sleeve_sword' });

    const hpBefore = e.hp;
    updateWarden(w, held(true), 1 / 60);
    // Instant max-charge fire: never enters the charging state, damage lands
    // on the very first held tick, and the cooldown starts immediately.
    expect(w.warden.active1Charging).toBe(false);
    expect(w.warden.active1Cooldown).toBeGreaterThan(0);
    expect(e.hp).toBeLessThan(hpBefore);
  });

  it('without the mid-run equip, the same press instead starts a normal charge (control)', () => {
    const w = swordsmanWorld({ sleeve_sword: 1 });
    updateWarden(w, held(true), 1 / 60);
    expect(w.warden.active1Charging).toBe(true);
    expect(w.warden.active1Cooldown).toBe(0);
  });
});

describe("b076: fireDashSlash's dashRange doubling reads the live loadout", () => {
  it('equipping Swordsman Shoes mid-run reaches a target beyond the base dashRange on the next press', () => {
    const w = swordsmanWorld({ swordsman_shoes: 1 });
    // Base dashRange is 5 (see tests/p6b-swordsman.test.ts); doubled is 10.
    // Place the target at 7: unreachable un-doubled, reachable doubled.
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 7, w.warden.y)!;
    e.hp = 1e6;
    e.maxHp = 1e6;
    w.rebuildBuckets();

    applyCommand(w, { k: 'equip_item', slot: 'shoes', item: 'swordsman_shoes' });

    const hpBefore = e.hp;
    applyCommand(w, { k: 'class_active2', aimX: e.x, aimY: e.y });
    expect(e.hp).toBeLessThan(hpBefore);
  });

  it('without the mid-run equip, the same press falls short of a target at that distance (control)', () => {
    const w = swordsmanWorld({ swordsman_shoes: 1 });
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 7, w.warden.y)!;
    e.hp = 1e6;
    e.maxHp = 1e6;
    w.rebuildBuckets();

    const hpBefore = e.hp;
    applyCommand(w, { k: 'class_active2', aimX: e.x, aimY: e.y });
    expect(e.hp).toBe(hpBefore);
  });
});
