/**
 * fb150 (qa-playtester, fb112 verification): Dash Slash's sentence
 * ("the charge's own range and damage merge into this one hit instead of
 * firing separately") read as "you keep the nova's coverage too" — but
 * `fireDashSlash` (`src/sim/classes.ts`) spends the charge into
 * `hitRange = dashRange + mergedRadius`, extra LINE length, not an area,
 * and the nova itself never fires on this path. A player relying on the old
 * wording could hold a full charge, aim Dash Slash forward, and whiff
 * completely against something behind or beside them — a real cost (a full
 * Active1 cooldown for nothing) the old text hid.
 *
 * This file drives the real sim (not just the sentence string) as its own
 * mechanism, the same posture `tests/ui-fb112-dash-slash-width.test.ts`
 * already takes for the same sentence: a fresh release of the charge (the
 * nova) demonstrably reaches behind/beside the Warden, and the merged
 * Dash Slash release from the *same* full charge demonstrably does not.
 */
import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';
import { applyCommand, updateWarden } from '../src/sim/run';
import { spawnEnemy } from '../src/sim/enemies';
import { World } from '../src/sim/world';
import type { Enemy, TickInput } from '../src/sim/types';
import { activeSkillMarkup } from '../src/ui/class-info';
import { cfg } from './helpers';

const content = loadContent();
const swordsman = content.classByKey.get('swordsman')!;
// 40x the biggest single kit number, same margin convention
// `tests/p6b-swordsman.test.ts` uses, so neither probe enemy dies mid-test.
const DUMMY_HP = 40 * Math.max(swordsman.active1.damage, swordsman.active2.damage, swordsman.basicAttack.dps);

function held(active1Held: boolean): TickInput {
  return { mx: 0, my: 0, dash: false, attack: false, aimX: 0, aimY: 0, active1Held, cmds: [] };
}

function worldWith(): World {
  const w = new World(cfg({ classKey: 'swordsman' }));
  w.gold = 1e6;
  w.warden.attackCooldown = 1e9; // suppress the basic attack contaminating the probe
  return w;
}

/** One husk 3 tiles behind (-X) the Warden, one 3 tiles to the side (+Y) — both stationary, both survive any single hit. */
function placeBehindAndSide(w: World): { behind: Enemy; side: Enemy } {
  const behind = spawnEnemy(w, 'husk', w.warden.x - 3, w.warden.y)!;
  const side = spawnEnemy(w, 'husk', w.warden.x, w.warden.y + 3)!;
  for (const e of [behind, side]) {
    e.hp = DUMMY_HP;
    e.maxHp = DUMMY_HP;
    e.speed = 0;
  }
  w.rebuildBuckets();
  return { behind, side };
}

describe("fb150: Dash Slash's rewritten merge wording matches what actually fires", () => {
  it('a normal (unmerged) Circle Slash release at full charge hits both behind AND to the side — real nova coverage', () => {
    const w = worldWith();
    const { behind, side } = placeBehindAndSide(w);

    for (let t = 0; t < 250; t++) updateWarden(w, held(true), 1 / 60); // past chargeCapSeconds (3s)
    updateWarden(w, held(false), 1 / 60); // release normally: fires the nova

    expect(behind.hp, 'nova reaches behind the Warden').toBeLessThan(DUMMY_HP);
    expect(side.hp, 'nova reaches beside the Warden').toBeLessThan(DUMMY_HP);
  });

  it('merging that SAME full charge into a forward Dash Slash hits NEITHER — the nova does not also fire', () => {
    const w = worldWith();
    const { behind, side } = placeBehindAndSide(w);

    for (let t = 0; t < 250; t++) updateWarden(w, held(true), 1 / 60);
    expect(w.warden.active1Charging).toBe(true);
    applyCommand(w, { k: 'class_active2', aimX: w.warden.x + 5, aimY: w.warden.y }); // aimed forward (+X), merges the charge

    expect(w.warden.active1Charging, 'the charge was consumed by the merge').toBe(false);
    expect(w.warden.active1Cooldown, 'Active1 goes to full cooldown, same as a normal release').toBeGreaterThan(0);
    expect(behind.hp, 'the merged hit never reaches behind the Warden').toBe(DUMMY_HP);
    expect(side.hp, 'the merged hit never reaches beside the Warden').toBe(DUMMY_HP);
  });

  it("the sentence says the charge's radius extends the line's reach and its damage is added, and that the nova itself does not fire", () => {
    const html = activeSkillMarkup(swordsman, 'active2');
    expect(html).toContain("the charge's radius extends this line's reach and its damage is added to this hit");
    expect(html).toContain('the nova itself does not fire');
    // The old, misleading wording must be gone, not just supplemented.
    expect(html).not.toContain("the charge's own range and damage merge into this one hit instead of firing separately");
  });
});
