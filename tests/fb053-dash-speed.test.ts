/**
 * fb053 (SPEC-FINAL §10 amendment, amends fb030): "dash is too slow" — dash
 * speed is now `dashSpeedMul` (k=5, `data/warden.json`) x the Warden's
 * *current* movement speed, so distance falls out of speed x duration and
 * scales with movement-speed gear/boons rather than being a fixed
 * `dashDistance` data value. Covers the base dodge-dash directly; the four
 * class-active dashes (Dash Slash, Quickstep, Flame Road, Crimson Rush)
 * inherit the same `dashDistance`/`classDashDuration` formula
 * (`src/sim/wardenmove.ts`) and are exercised by their own existing kit
 * tests in `p6b-swordsman.test.ts`/`p6d-nine-classes.test.ts`, which still
 * pass unchanged (`classDashDuration` calibrates each dash's duration so its
 * distance at base move speed reproduces its originally-tuned `dashRange`).
 */
import { describe, expect, it } from 'vitest';

import { loadContent, type ClassDef } from '../src/sim/content';
import { applyCommand, updateWarden } from '../src/sim/run';
import { BASE } from '../src/sim/stats';
import { emptyInput } from '../src/sim/types';
import { World } from '../src/sim/world';
import { cfg, makeInputLog, replay } from './helpers';

function dashInput(mx: number, my: number) {
  return { ...emptyInput(), mx, my, dash: true };
}

/** Advances a world until an in-progress dash lands (or `maxTicks` is exhausted). */
function runOutDash(w: World, maxTicks = 60): void {
  for (let i = 0; i < maxTicks && w.warden.dashTravel; i++) updateWarden(w, emptyInput(), 1 / 60);
}

describe('fb053: base dash speed = dashSpeedMul x current movement speed', () => {
  it('covers dashSpeedMul (5x) times the current move speed over dashDuration', () => {
    const w = new World(cfg());
    const startX = w.warden.x;
    const expectedDist = BASE.dashSpeedMul * w.derived.moveSpeed * BASE.dashDuration;
    updateWarden(w, dashInput(1, 0), 1 / 60);
    expect(w.warden.dashTravel).not.toBeNull();
    runOutDash(w);
    expect(w.warden.dashTravel).toBeNull();
    expect(w.warden.x - startX).toBeCloseTo(expectedDist, 5);
  });

  it('a move-speed-boosting item grows dash distance proportionally', () => {
    const content = loadContent();
    const shoes = content.equipment.items.find((i) => i.key === 'normal_shoes')!;
    const w = new World(cfg({ ownedEquipment: { [shoes.key]: 1 } }));
    applyCommand(w, { k: 'equip_item', slot: shoes.slot, item: shoes.key });
    expect(w.derived.moveSpeed).toBeGreaterThan(BASE.moveSpeed); // sanity: the item actually buffed move speed

    const plain = new World(cfg());
    const plainStart = plain.warden.x;
    updateWarden(plain, dashInput(1, 0), 1 / 60);
    runOutDash(plain);
    const plainDist = plain.warden.x - plainStart;

    const startX = w.warden.x;
    const expectedDist = BASE.dashSpeedMul * w.derived.moveSpeed * BASE.dashDuration;
    updateWarden(w, dashInput(1, 0), 1 / 60);
    runOutDash(w);
    const buffedDist = w.warden.x - startX;

    expect(buffedDist).toBeCloseTo(expectedDist, 5);
    // Dash distance grows by the exact same factor ordinary movement speed does.
    expect(buffedDist / plainDist).toBeCloseTo(w.derived.moveSpeed / plain.derived.moveSpeed, 5);
    expect(buffedDist).toBeGreaterThan(plainDist);
  });

  it('full-log replay determinism holds with dash-heavy input and a move-speed item equipped', () => {
    const content = loadContent();
    const shoes = content.equipment.items.find((i) => i.key === 'normal_shoes')!;
    const config = cfg({ seed: 9, ownedEquipment: { [shoes.key]: 1 } });
    // makeInputLog already fires `dash: true` every 211 ticks; layer the
    // equip on tick 0 so every one of those dashes runs at the buffed speed.
    const log = makeInputLog(9, 1200).map((input, t) =>
      t === 0 ? { ...input, cmds: [...input.cmds, { k: 'equip_item' as const, slot: shoes.slot, item: shoes.key }] } : input,
    );
    const a = replay(config, log);
    const b = replay(config, log);
    expect(b.endHash).toBe(a.endHash);
    expect(b.ticks).toBe(a.ticks);
  });
});

describe('fb053: class-active dashes reproduce their originally-tuned dashRange at baseline', () => {
  it("Swordsman Dash Slash covers exactly its authored dashRange with no gear/boons equipped", () => {
    // Swordsman has a permanent +30% moveSpeedBonus (data/classes.json) baked
    // into w.derived.moveSpeed even with nothing equipped — classDashDuration
    // must calibrate against that class-own baseline, not the unmodified
    // BASE.moveSpeed, or Dash Slash silently overshoots its tuned 5-tile
    // dashRange by 30% for every Swordsman player (code review, fb053).
    const content = loadContent();
    const swordsman = content.classByKey.get('swordsman')! as ClassDef;
    const dashRange = swordsman.active2.dashRange!;
    const w = new World(cfg({ classKey: 'swordsman' }));
    expect(w.derived.moveSpeed).toBeCloseTo(BASE.moveSpeed * 1.3, 5); // sanity: the class bonus is live

    const startX = w.warden.x;
    applyCommand(w, { k: 'class_active2', aimX: startX + dashRange, aimY: w.warden.y });
    expect(w.warden.dashTravel).not.toBeNull();
    runOutDash(w);
    expect(w.warden.dashTravel).toBeNull();
    expect(w.warden.x - startX).toBeCloseTo(dashRange, 5);
  });
});
