/**
 * SPEC-V3 §10 T4: "Practice-run toggle: character and Core take no damage.
 * Ordinary Command, replay-flagged like other practice tools."
 *
 * God mode is deliberately wider than the existing `invuln` op, which covers
 * the Warden alone. It suppresses the Core's HP loss but *not* the leak
 * accounting: the Day HUD's "Loose in the dark" counter keeps showing what is
 * being banked against the next VS wave, so an immortal Core is not a
 * consequence-free one. QA measured a god Day and a mortal Day producing
 * identical Nights (same budget, same leaks, same spawns) under bot play.
 */

import { describe, expect, it } from 'vitest';

import { Run, applyCommand, damageWarden } from '../src/sim/run';
import { World } from '../src/sim/world';
import { spawnEnemy, updateEnemies } from '../src/sim/enemies';
import { CORE_X, CORE_Y } from '../src/sim/grid';
import { PRACTICE_BUTTONS } from '../src/ui/hud';
import type { TickInput } from '../src/sim/types';
import { cfg } from './helpers';

function practiceWorld(): World {
  return new World({ ...cfg(), practice: true });
}

function god(w: World): void {
  applyCommand(w, { k: 'dev', op: 'god', amount: 0 });
}

function input(cmds: TickInput['cmds'] = []): TickInput {
  return { mx: 0, my: 0, dash: false, attack: false, aimX: 0, aimY: 0, active1Held: false, cmds };
}

/**
 * A leak fires when an enemy is standing on a Core tile during updateEnemies
 * (`enemies.ts`: tile type 3). Placing it there and running one tick is the
 * same path the sim takes, without reaching into a module-private function.
 */
function leakOneEnemy(w: World): void {
  const e = spawnEnemy(w, 'husk', CORE_X + 0.5, CORE_Y + 0.5);
  if (!e) throw new Error('husk failed to spawn');
  e.x = CORE_X + 0.5;
  e.y = CORE_Y + 0.5;
  updateEnemies(w, 1 / 60);
}

describe('T4 god mode', () => {
  it('is off until asked for', () => {
    expect(practiceWorld().godMode).toBe(false);
  });

  it('toggles, and marks the run as having used the practice tool', () => {
    const w = practiceWorld();
    god(w);
    expect(w.godMode).toBe(true);
    expect(w.practiceUsed).toBe(true);
    god(w);
    expect(w.godMode).toBe(false);
  });

  it('is ignored entirely in a run that did not opt into practice', () => {
    const w = new World(cfg());
    god(w);
    expect(w.godMode).toBe(false);
    expect(w.practiceUsed).toBe(false);
  });

  it('the Warden takes no damage', () => {
    const w = practiceWorld();
    w.warden.hp = 50;
    w.warden.dashIFrames = 0;
    god(w);
    damageWarden(w, 999);
    expect(w.warden.hp).toBe(50);
  });

  it('the Core takes no damage from a leak', () => {
    const w = practiceWorld();
    w.phase = 'act1_wave';
    god(w);
    const before = w.coreHp;
    leakOneEnemy(w);
    expect(w.coreHp).toBe(before);
  });

  it('but the leak is still counted, so leak coupling stays testable', () => {
    const w = practiceWorld();
    w.phase = 'act1_wave';
    god(w);
    const leaksBefore = w.leaks;
    const bonusBefore = w.nightBudgetBonus;
    leakOneEnemy(w);
    expect(w.leaks).toBe(leaksBefore + 1);
    expect(w.nightBudgetBonus).toBeGreaterThan(bonusBefore);
  });

  it('without god mode the same leak does cost Core HP', () => {
    const w = practiceWorld();
    w.phase = 'act1_wave';
    const before = w.coreHp;
    leakOneEnemy(w);
    expect(w.coreHp).toBeLessThan(before);
  });

  it('is wider than invuln: invuln alone leaves the Core mortal', () => {
    const w = practiceWorld();
    w.phase = 'act1_wave';
    applyCommand(w, { k: 'dev', op: 'invuln', amount: 0 });
    const before = w.coreHp;
    leakOneEnemy(w);
    expect(w.coreHp).toBeLessThan(before);
  });

  it('is part of the sim hash, so a divergence cannot hide', () => {
    const a = new Run({ ...cfg(), practice: true, policy: 'none' });
    const b = new Run({ ...cfg(), practice: true, policy: 'none' });
    a.step(input());
    b.step(input([{ k: 'dev', op: 'god', amount: 0 }]));
    expect(a.hash()).not.toBe(b.hash());
  });

  it('a god-mode run replays to an identical hash', () => {
    const hashes = [0, 1].map(() => {
      const run = new Run({ ...cfg(), practice: true, policy: 'none' });
      for (let t = 0; t < 180; t++) {
        run.step(input(t === 20 ? [{ k: 'dev', op: 'god', amount: 0 }] : []));
      }
      return run.hash();
    });
    expect(hashes[0]).toBe(hashes[1]);
  });

  it('does not rescue a defeat that has already begun', () => {
    // The panic-press during the slow-mo beat. `resolveDefeat` runs its timer
    // down without re-consulting damageWarden's guard, which matches `heal`,
    // but it is the first thing a tester tries — pinned so a future change to
    // resolveDefeat cannot flip it silently.
    const run = new Run({ ...cfg(), practice: true, policy: 'none' });
    const w = run.world;
    w.phase = 'act2';
    w.sundered = true;
    w.warden.hp = 1;
    w.warden.dashIFrames = 0;
    damageWarden(w, 999);
    expect(w.dying).toBeTruthy();
    god(w);
    for (let t = 0; t < 300; t++) run.step(input());
    expect(w.outcome).toBe('defeat_warden');
  });

  it('the practice panel offers it', () => {
    const button = PRACTICE_BUTTONS.find((b) => b.op === 'god');
    expect(button, 'god mode should be reachable from the practice panel').toBeDefined();
    expect(button!.label.length).toBeGreaterThan(0);
    expect(button!.title).toMatch(/core/i);
  });
});
