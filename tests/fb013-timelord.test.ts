/**
 * fb013 — SPEC-FINAL §4.2 addition, owner feedback `feature-class-timelord`:
 * class #12 Time Lord. Passive *Time Flow* (damage taken becomes a 4 s DoT
 * after one armor mitigation, with a dormant "100% faster" flag reserved for
 * future equipment); Active1 *Time* (3 charges/6 s recharge, a per-enemy
 * 4-stage mark advanced one stage per hit — unmarked->past rewinds to a 3 s-
 * ago position, past->present stun-locks + DoTs, present->future slows
 * [deferred while stunned/frozen] + DoTs for the target's remaining HP,
 * future->executed kills outright or, for an elite/boss, deals 50% of
 * current HP); Active2 *Time Lock* (2 charges/10 s recharge, a 5 s no-exit
 * zone that DoTs anyone trapped and, on recast, teleports and detonates
 * them); tower passive *Chronal Surge* (a free uncapped +10% range/AoE bump
 * every 2 TD waves cleared).
 *
 * Q139 (this item) logs the judgment calls a genuinely open reading needed:
 * every mark/zone DoT is authored as Bleeding (the sim's six damage types
 * are already at §13's stated total — a 7th type for one class's flavor
 * would contradict that content-totals gate); "stun-locks" reuses the
 * existing `frozen` status (the sim has no separate generic stun, and
 * frozen's own authored duration is already 3 s). Active1 is a Warden-
 * centered AoE pulse — "every enemy within r7 advances one time-mark stage"
 * is unbracketed owner text, not a [designer note], so every enemy in range
 * is hit per cast, each test below simply keeps one enemy in range to
 * observe one controllable stage transition at a time.
 */
import { describe, expect, it } from 'vitest';

import {
  loadContent,
  validateClassEffect,
  validateClassPassive,
  type ClassEffect,
  type ClassDef,
} from '../src/sim/content';
import { applyDot, dotOutstanding, dotStacks, spawnEnemy } from '../src/sim/enemies';
import { applyCommand, damageWarden, hashWorld, Run } from '../src/sim/run';
import { emptyInput, type Command, type Enemy, type TickInput } from '../src/sim/types';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const DT = 1 / 60;
const content = loadContent();
const timeLord = content.classByKey.get('time_lord')! as ClassDef;

function idleInput(over: Partial<TickInput> = {}): TickInput {
  return { mx: 0, my: 0, dash: false, attack: false, aimX: 0, aimY: 0, active1Held: false, cmds: [], ...over };
}

/** A fresh Time Lord run, basic attack suppressed so only the ability under test can deal damage. */
function makeRun(over = {}): Run {
  const run = new Run(cfg({ classKey: 'time_lord', ...over }));
  run.world.gold = 1e6;
  run.world.warden.attackCooldown = 1e9;
  run.world.phase = 'act1_wave'; // updateEnemies (and so tickDots/tickTimers) runs here, not in act1_build
  return run;
}

function makeTarget(run: Run, dx = 1): Enemy {
  const w = run.world;
  const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + dx, w.warden.y)!;
  e.hp = 1e6;
  e.maxHp = 1e6;
  e.speed = 0; // stays put unless the test itself moves it
  w.rebuildBuckets();
  return e;
}

describe('fb013: Time Lord loads with the §4.2 kit', () => {
  it('is authored with the right slot kinds, and is the twelfth real class', () => {
    expect(timeLord.passive.kind).toBe('time_flow');
    expect(timeLord.active1.kind).toBe('time_mark');
    expect(timeLord.active2.kind).toBe('time_lock');
    expect(timeLord.towerPassive.kind).toBe('chronal_surge');
    expect(content.classes.classes.length).toBe(12);
  });

  it('the dormant charDotSpeedMul flag ships present and off (1 = normal speed)', () => {
    expect(timeLord.passive.charDotSpeedMul).toBe(1);
  });

  it('accepts the real, shipped rows', () => {
    expect(() => validateClassEffect(timeLord.active1, 'x')).not.toThrow();
    expect(() => validateClassEffect(timeLord.active2, 'x')).not.toThrow();
    expect(() => validateClassPassive(timeLord.passive, 'x')).not.toThrow();
    expect(() => validateClassPassive(timeLord.towerPassive, 'x')).not.toThrow();
  });

  it('rejects a time_mark row missing a required field', () => {
    const broken = { ...timeLord.active1 } as Record<string, unknown>;
    delete broken.markEliteExecuteFraction;
    expect(() => validateClassEffect(broken as ClassEffect, 'x')).toThrow();
  });

  it('rejects a time_lock row missing a required field', () => {
    const broken = { ...timeLord.active2 } as Record<string, unknown>;
    delete broken.zoneDotSeconds;
    expect(() => validateClassEffect(broken as ClassEffect, 'x')).toThrow();
  });

  it('rejects a chronal_surge towerPassive missing a required field', () => {
    const broken = { ...timeLord.towerPassive } as Record<string, unknown>;
    delete broken.bonusRangeMul;
    expect(() => validateClassPassive(broken as { kind?: string }, 'x')).toThrow();
  });
});

describe('fb013: Active1 *Time* — 3-charge ammo gate', () => {
  it('fires 3 times back to back, then blocks a 4th until a charge recharges (6 s)', () => {
    const run = makeRun();
    const w = run.world;
    makeTarget(run);
    expect(w.warden.active1Ammo).toBe(3);

    for (let i = 0; i < 3; i++) applyCommand(w, { k: 'class_active' });
    expect(w.warden.active1Ammo).toBe(0);

    const before = w.warden.active1Ammo;
    applyCommand(w, { k: 'class_active' });
    expect(w.warden.active1Ammo).toBe(before); // no charge, no-op

    for (let t = 0; t < Math.round(6 / DT) + 1; t++) run.step(idleInput());
    expect(w.warden.active1Ammo).toBeGreaterThanOrEqual(1);
  });
});

describe('fb013: Active1 *Time* stage 0->1 (unmarked -> past)', () => {
  it('rewinds the target to a recorded position and applies a Bleeding DoT', () => {
    const run = makeRun();
    const w = run.world;
    const e = makeTarget(run);

    for (let t = 0; t < 20; t++) run.step(idleInput()); // let posHistory sample the still target
    const recordedX = e.x;
    const recordedY = e.y;
    e.x += 5; // simulate having moved since the last sample
    w.rebuildBuckets();

    run.step(idleInput({ cmds: [{ k: 'class_active', aimX: e.x, aimY: e.y }] }));
    expect(e.timeMarkStage).toBe(1);
    expect(e.x).toBeCloseTo(recordedX, 5);
    expect(e.y).toBeCloseTo(recordedY, 5);
    expect(dotStacks(e, 'bleeding')).toBeGreaterThan(0);
  });

  it('markRewindSeconds actually gates how far back the rewind reaches (previously an unread, dead data field)', () => {
    const run = makeRun();
    const w = run.world;
    const e = makeTarget(run);
    const original = timeLord.active1.markRewindSeconds;
    timeLord.active1.markRewindSeconds = 1; // vs. the shipped default of 3
    try {
      const baseX = w.warden.x;
      let elapsed = 0;
      for (let t = 0; t < Math.round(2 / DT); t++) {
        elapsed += DT;
        e.x = baseX + elapsed; // a distinguishable, timestamped trajectory
        run.step(idleInput());
      }
      w.rebuildBuckets();
      const beforeMark = e.x;
      applyCommand(w, { k: 'class_active' });
      const rewoundBy = beforeMark - e.x;
      expect(rewoundBy).toBeCloseTo(1, 0);
      expect(rewoundBy).toBeLessThan(2); // distinguishes from the old hardcoded-~3s-regardless-of-data bug
    } finally {
      timeLord.active1.markRewindSeconds = original;
    }
  });

  it('does nothing to the far enemy when no target is within r7 (but still pays its charge, matching every other whiff-capable Active)', () => {
    const run = makeRun();
    const w = run.world;
    const far = makeTarget(run, 10);
    expect(() => applyCommand(w, { k: 'class_active' })).not.toThrow();
    expect(far.timeMarkStage).toBe(0);
    expect(w.warden.active1Ammo).toBe(2);
  });

  it('is an AoE pulse: every enemy within r7 advances one stage on a single cast, not just the nearest one', () => {
    // Owner feedback text (unbracketed, not a [designer note]): "every enemy
    // within r7 advances one time-mark stage."
    const run = makeRun();
    const w = run.world;
    const near = makeTarget(run, 1);
    const mid = makeTarget(run, 3);
    const far = makeTarget(run, 10); // outside r7, must not be touched
    applyCommand(w, { k: 'class_active' });
    expect(near.timeMarkStage).toBe(1);
    expect(mid.timeMarkStage).toBe(1);
    expect(far.timeMarkStage).toBe(0);
  });
});

describe('fb013: Active1 *Time* stage 1->2 (past -> present)', () => {
  it('stun-locks the target (reuses `frozen`) and applies a second Bleeding DoT', () => {
    const run = makeRun();
    const w = run.world;
    const e = makeTarget(run);

    applyCommand(w, { k: 'class_active' }); // -> past
    applyCommand(w, { k: 'class_active' }); // -> present
    expect(e.timeMarkStage).toBe(2);
    expect(e.frozenRemaining).toBeGreaterThan(0);
    expect(dotStacks(e, 'bleeding')).toBe(2);
  });
});

describe('fb013: Active1 *Time* stage 2->3 (present -> future)', () => {
  it('applies -20% atk/move speed immediately when the target is not stunned, plus a DoT for its remaining HP', () => {
    const run = makeRun();
    const w = run.world;
    const e = makeTarget(run);

    applyCommand(w, { k: 'class_active' }); // -> past
    applyCommand(w, { k: 'class_active' }); // -> present (frozen 3s)
    for (let t = 0; t < Math.round(3.2 / DT); t++) run.step(idleInput()); // let the stun clear
    expect(e.frozenRemaining).toBeLessThanOrEqual(0); // tickTimers doesn't floor at exactly 0

    const hpBefore = e.hp;
    const owedBefore = dotOutstanding(e); // the still-live past/present stacks' leftover
    applyCommand(w, { k: 'class_active' }); // -> future
    expect(e.timeMarkStage).toBe(3);
    expect(e.timeMarkPendingSlow).toBe(false);
    expect(e.slowAmount).toBeCloseTo(0.2, 5);
    expect(e.atkSlowAmount).toBeCloseTo(0.2, 5);
    // "DoT equal to remaining HP": isolate this stage's own newly-installed
    // stack from the older ones' decaying leftover by comparing the delta.
    const owedAfter = dotOutstanding(e);
    expect(owedAfter - owedBefore).toBeCloseTo(hpBefore, 0);
  });

  it('defers the slow while the target is still stunned/frozen, applying it once the stun clears', () => {
    const run = makeRun();
    const w = run.world;
    const e = makeTarget(run);

    // Stretched for the same reason the executed-stage tests stretch it: the
    // future stage's own lethal "DoT equal to remaining HP" would otherwise
    // kill the target mid-wait (its own separate, real interaction), ending
    // the wave and freezing every timer this test still needs to observe.
    const originalFutureDot = timeLord.active1.markFutureDotSeconds;
    timeLord.active1.markFutureDotSeconds = 1000;
    try {
      applyCommand(w, { k: 'class_active' }); // -> past
      applyCommand(w, { k: 'class_active' }); // -> present (frozen 3s)
      applyCommand(w, { k: 'class_active' }); // -> future, while still frozen: deferred
      expect(e.timeMarkStage).toBe(3);
      expect(e.timeMarkPendingSlow).toBe(true);
      expect(e.slowAmount).toBe(0);
      expect(e.atkSlowAmount).toBe(0);

      for (let t = 0; t < Math.round(3.2 / DT); t++) run.step(idleInput());
      expect(e.frozenRemaining).toBeLessThanOrEqual(0); // tickTimers doesn't floor at exactly 0
      expect(e.timeMarkPendingSlow).toBe(false);
      expect(e.slowAmount).toBeCloseTo(0.2, 5);
      expect(e.atkSlowAmount).toBeCloseTo(0.2, 5);
    } finally {
      timeLord.active1.markFutureDotSeconds = originalFutureDot;
    }
  });
});

describe('fb013: Active1 *Time* stage 3->executed (future)', () => {
  it('kills a non-elite target outright with the larger "execute" event, resetting its mark', () => {
    const run = makeRun();
    const w = run.world;
    const e = makeTarget(run);

    // Stretch the present->future "DoT equal to remaining HP" out far past
    // the 6 s this test needs to wait for a 4th charge — otherwise that DoT
    // (by design, lethal on its own) kills the target before the literal
    // executed-stage hit is ever reached, which is a real, order-dependent
    // gameplay interaction, not something this unit test is about.
    const originalFutureDot = timeLord.active1.markFutureDotSeconds;
    timeLord.active1.markFutureDotSeconds = 1000;
    try {
      applyCommand(w, { k: 'class_active' }); // -> past
      applyCommand(w, { k: 'class_active' }); // -> present (frozen 3s)
      for (let t = 0; t < Math.round(3.2 / DT); t++) run.step(idleInput());
      applyCommand(w, { k: 'class_active' }); // -> future (not stunned this time)
      for (let t = 0; t < Math.round(6 / DT); t++) run.step(idleInput()); // refill a 4th charge

      const before = w.fx.length;
      applyCommand(w, { k: 'class_active' }); // -> executed
      expect(e.dead).toBe(true);
      expect(e.timeMarkStage).toBe(0);
      expect(w.fx.some((f, i) => i >= before && f.k === 'execute')).toBe(true);
    } finally {
      timeLord.active1.markFutureDotSeconds = originalFutureDot;
    }
  });

  it('deals 50% of current HP (an ordinary, armor-mitigated hit) to an elite/boss instead of an outright kill', () => {
    const run = makeRun();
    const w = run.world;
    const e = makeTarget(run);
    e.elite = true;
    e.armor = 0; // isolate the 50%-of-current-HP fraction from armor mitigation

    const originalFutureDot = timeLord.active1.markFutureDotSeconds;
    timeLord.active1.markFutureDotSeconds = 1000; // see the note above
    try {
      applyCommand(w, { k: 'class_active' });
      applyCommand(w, { k: 'class_active' });
      for (let t = 0; t < Math.round(3.2 / DT); t++) run.step(idleInput());
      applyCommand(w, { k: 'class_active' });
      for (let t = 0; t < Math.round(6 / DT); t++) run.step(idleInput());

      const hpBefore = e.hp;
      applyCommand(w, { k: 'class_active' });
      expect(e.dead).toBe(false);
      expect(e.hp).toBeCloseTo(hpBefore * 0.5, 0);
      expect(e.timeMarkStage).toBe(0);
    } finally {
      timeLord.active1.markFutureDotSeconds = originalFutureDot;
    }
  });

  it('the elite/boss 50% execute ignores armor — it is a guaranteed fraction, not an ordinary mitigated hit', () => {
    // QA repro: the elite branch used to call `damageEnemy` with no options,
    // so `dmg *= damageTakenMul(enemyArmor(e))` (enemies.ts) silently ate
    // most of the intended 50% once an enemy actually carried armor — no
    // authored enemy does today, which is exactly why it went unnoticed.
    const run = makeRun();
    const w = run.world;
    const e = makeTarget(run);
    e.elite = true;
    e.armor = 200; // deliberately nonzero, unlike the sibling test above

    const originalFutureDot = timeLord.active1.markFutureDotSeconds;
    timeLord.active1.markFutureDotSeconds = 1000;
    try {
      applyCommand(w, { k: 'class_active' });
      applyCommand(w, { k: 'class_active' });
      for (let t = 0; t < Math.round(3.2 / DT); t++) run.step(idleInput());
      applyCommand(w, { k: 'class_active' });
      for (let t = 0; t < Math.round(6 / DT); t++) run.step(idleInput());

      const hpBefore = e.hp;
      applyCommand(w, { k: 'class_active' });
      expect(e.hp).toBeCloseTo(hpBefore * 0.5, 0);
    } finally {
      timeLord.active1.markFutureDotSeconds = originalFutureDot;
    }
  });
});

describe('fb013: Active2 *Time Lock* — 2-charge ammo gate, no-exit zone, rewind immunity, recast detonation', () => {
  it('traps a nearby enemy on entry (one DoT application) and clamps it back inside on every subsequent tick', () => {
    const run = makeRun();
    const w = run.world;
    const e = makeTarget(run);
    const cx = e.x;
    const cy = e.y;

    applyCommand(w, { k: 'class_active2', aimX: cx, aimY: cy });
    run.step(idleInput());
    expect(e.timeLockZoneId).toBeGreaterThan(0);
    expect(dotStacks(e, 'bleeding')).toBe(1);

    // Try to shove it outside the zone radius (but still on-grid); the next
    // tick must snap it back.
    e.x = cx + 8;
    e.y = cy;
    run.step(idleInput());
    const dx = e.x - cx;
    const dy = e.y - cy;
    expect(Math.sqrt(dx * dx + dy * dy)).toBeLessThanOrEqual(timeLord.active2.radius + 1e-6);
  });

  it('b048: stops clamping escapees and applying entry DoT once w.dying is set', () => {
    // code-reviewer-filed verifying b047: same DEFEAT_SLOWMO bug class as
    // b020/b046/b047. updateTimeLockZone is one of three sub-routines inside
    // updateClassPassives that needed its own guard (not a blanket
    // function-level one — the Warden timers/corpse decay in the same
    // function are cosmetic and must keep running through the beat).
    const run = makeRun();
    const w = run.world;
    const e = makeTarget(run);
    const cx = e.x;
    const cy = e.y;

    applyCommand(w, { k: 'class_active2', aimX: cx, aimY: cy });
    run.step(idleInput());
    expect(e.timeLockZoneId).toBeGreaterThan(0);
    const stacksBefore = dotStacks(e, 'bleeding');
    expect(stacksBefore).toBe(1);

    // Set directly rather than through damageWarden: Time Lord's own Time
    // Flow passive converts incoming Warden damage into a DoT rather than an
    // instant kill, which would not land w.dying on this same tick.
    w.dying = 'defeat_warden';
    w.dyingTimer = 1.5;

    // Shove it outside the zone radius; a live zone would snap it back.
    e.x = cx + 8;
    e.y = cy;
    run.step(idleInput());

    expect(e.x).toBeCloseTo(cx + 8, 5);
    expect(e.y).toBeCloseTo(cy, 5);
    expect(dotStacks(e, 'bleeding')).toBe(stacksBefore);
  });

  it('a trapped enemy is immune to Time\'s rewind-pull (the teleport half is skipped, the mark still advances)', () => {
    const run = makeRun();
    const w = run.world;
    const e = makeTarget(run);
    applyCommand(w, { k: 'class_active2', aimX: e.x, aimY: e.y });
    run.step(idleInput());
    expect(e.timeLockZoneId).toBeGreaterThan(0);

    for (let t = 0; t < 20; t++) run.step(idleInput());
    const trappedX = e.x;
    const trappedY = e.y;

    applyCommand(w, { k: 'class_active', aimX: e.x, aimY: e.y });
    expect(e.timeMarkStage).toBe(1); // the mark still advanced
    expect(e.x).toBeCloseTo(trappedX, 5); // but it was not rewound
    expect(e.y).toBeCloseTo(trappedY, 5);
  });

  it('re-casting while a zone exists teleports its trapped enemies to the new zone and detonates all their remaining DoT', () => {
    const run = makeRun();
    const w = run.world;
    const e = makeTarget(run);
    applyCommand(w, { k: 'class_active2', aimX: e.x, aimY: e.y });
    run.step(idleInput());
    expect(e.timeLockZoneId).toBeGreaterThan(0);

    applyDot(w, e, 'poison', 5, 4, 'test'); // extra DoT the zone itself didn't apply
    const owed = dotOutstanding(e);
    expect(owed).toBeGreaterThan(0);
    const hpBefore = e.hp;

    const newX = e.x + 6;
    const newY = e.y;
    applyCommand(w, { k: 'class_active2', aimX: newX, aimY: newY });
    expect(e.x).toBeCloseTo(newX, 5);
    expect(e.y).toBeCloseTo(newY, 5);
    // The burst landed for (at least) everything that was owed at cast time —
    // a fresh entry DoT on the new zone may already be installed by the same
    // tick's per-tick pass, but it has not ticked yet, so hp loss this tick is
    // exactly the detonated burst.
    expect(hpBefore - e.hp).toBeCloseTo(owed, 0);
  });

  it('blocks a 3rd cast until a charge recharges (10 s)', () => {
    const run = makeRun();
    const w = run.world;
    makeTarget(run);
    expect(w.warden.active2Ammo).toBe(2);
    applyCommand(w, { k: 'class_active2' });
    applyCommand(w, { k: 'class_active2' });
    expect(w.warden.active2Ammo).toBe(0);
    applyCommand(w, { k: 'class_active2' });
    expect(w.warden.active2Ammo).toBe(0); // still blocked

    for (let t = 0; t < Math.round(10 / DT) + 1; t++) run.step(idleInput());
    expect(w.warden.active2Ammo).toBeGreaterThanOrEqual(1);
  });
});

describe('fb013: Passive *Time Flow* — damage taken becomes a 4 s DoT after one armor mitigation', () => {
  it('a hit does not reduce hp immediately; it resolves as a 4 s DoT for the same mitigated total', () => {
    const run = makeRun();
    const w = run.world;
    w.warden.hp = 1000;

    const hpBefore = w.warden.hp;
    damageWarden(w, 100);
    expect(w.warden.hp).toBe(hpBefore); // not reduced yet
    expect(w.warden.dots.length).toBe(1);
    const installed = w.warden.dots[0];
    expect(installed.remaining).toBeCloseTo(4, 5);

    for (let t = 0; t < Math.round(4.1 / DT); t++) run.step(idleInput());
    expect(w.warden.dots.length).toBe(0);
    expect(w.warden.hp).toBeLessThan(hpBefore);
  });

  it('a second hit within 4 s stacks an independent DoT rather than refreshing the first', () => {
    const run = makeRun();
    const w = run.world;
    damageWarden(w, 100);
    damageWarden(w, 50);
    expect(w.warden.dots.length).toBe(2);
  });

  it('does not convert an already-DoT hit (no infinite recursion)', () => {
    const w = new World(cfg({ classKey: 'time_lord' }));
    const hpBefore = w.warden.hp;
    expect(() => damageWarden(w, 10, { dot: true })).not.toThrow();
    expect(w.warden.hp).toBeLessThan(hpBefore);
    expect(w.warden.dots.length).toBe(0);
  });

  it('a VS-horde burst of simultaneous hits does not grow wd.dots unboundedly — it caps at maxStacksPerEnemy and folds the rest in, losing no damage', () => {
    const run = makeRun();
    const w = run.world;
    const cap = w.content.damageTypes.maxStacksPerEnemy;
    for (let i = 0; i < cap + 25; i++) damageWarden(w, 10);
    expect(w.warden.dots.length).toBe(cap);
    const owed = w.warden.dots.reduce((s, d) => s + d.dps * d.remaining, 0);
    expect(owed).toBeCloseTo(10 * (cap + 25), 5);
  });
});

describe('fb013: tower passive *Chronal Surge* — a free +10% range/AoE bump every 2 TD waves', () => {
  it('does nothing after 1 wave, and folds in both bonuses after 2', () => {
    const run = makeRun();
    const w = run.world;
    w.phase = 'act1_build'; // start from a clean build phase, like the real run does
    w.invulnerable = true;
    w.godMode = true;
    const rangeBefore = w.derived.towerRangeMul;
    const areaBefore = w.derived.areaMul;

    applyCommand(w, { k: 'call' });
    run.step(emptyInput());
    expect(w.phase).toBe('act1_wave');
    w.spawnQueue = [];
    w.enemies = [];
    run.step(emptyInput());
    expect(w.wavesCleared).toBe(1);
    expect(w.derived.towerRangeMul).toBeCloseTo(rangeBefore, 10);

    expect(w.phase).toBe('act1_build');
    applyCommand(w, { k: 'call' });
    run.step(emptyInput());
    expect(w.phase).toBe('act1_wave');
    w.spawnQueue = [];
    w.enemies = [];
    run.step(emptyInput());
    expect(w.wavesCleared).toBe(2);
    expect(w.derived.towerRangeMul).toBeCloseTo(rangeBefore * 1.1, 5);
    expect(w.derived.areaMul).toBeCloseTo(areaBefore * 1.1, 5);
  });

  it('does not fire for a class other than Time Lord', () => {
    const run = new Run(cfg({ classKey: 'swordsman' }));
    const w = run.world;
    w.invulnerable = true;
    w.godMode = true;
    const rangeBefore = w.derived.towerRangeMul;
    applyCommand(w, { k: 'call' });
    run.step(emptyInput());
    w.spawnQueue = [];
    w.enemies = [];
    run.step(emptyInput());
    applyCommand(w, { k: 'call' });
    run.step(emptyInput());
    w.spawnQueue = [];
    w.enemies = [];
    run.step(emptyInput());
    expect(w.wavesCleared).toBe(2);
    expect(w.derived.towerRangeMul).toBeCloseTo(rangeBefore, 10);
  });
});

describe('fb013: replay-hash determinism with Time, Time Lock and Time Flow all in the log', () => {
  it('two independent runs from the same input log reach an identical end-state hash', () => {
    const log: TickInput[] = [];
    for (let t = 0; t < 500; t++) {
      const cmds: Command[] = [];
      if (t === 10) cmds.push({ k: 'class_active', aimX: 999, aimY: 999 });
      if (t === 20) cmds.push({ k: 'class_active2', aimX: 5, aimY: 5 });
      if (t === 400) cmds.push({ k: 'class_active2', aimX: 6, aimY: 6 });
      log.push({ mx: 0, my: 0, dash: false, attack: false, aimX: 0, aimY: 0, active1Held: false, cmds });
    }

    const a = new Run(cfg({ classKey: 'time_lord' }));
    a.world.gold = 1e6;
    a.world.phase = 'act1_wave';
    const eA = spawnEnemy(a.world, a.world.content.enemies.enemies[0].key, 5, 5)!;
    eA.hp = 1e6;
    eA.maxHp = 1e6;
    for (const input of log) a.step(input);

    const b = new Run(cfg({ classKey: 'time_lord' }));
    b.world.gold = 1e6;
    b.world.phase = 'act1_wave';
    const eB = spawnEnemy(b.world, b.world.content.enemies.enemies[0].key, 5, 5)!;
    eB.hp = 1e6;
    eB.maxHp = 1e6;
    for (const input of log) b.step(input);

    expect(a.hash()).toBe(b.hash());
    expect(hashWorld(a.world)).toBe(hashWorld(b.world));
  });
});

describe('fb013: QA-precedent guard — w.dying freezes Time/Time Lock too', () => {
  it('useClassActive (Time) is a no-op while dying', () => {
    const run = makeRun();
    const w = run.world;
    makeTarget(run);
    w.dying = 'defeat_warden';
    applyCommand(w, { k: 'class_active' });
    expect(w.warden.active1Ammo).toBe(3);
  });

  it('useClassActive2 (Time Lock) is a no-op while dying', () => {
    const run = makeRun();
    const w = run.world;
    makeTarget(run);
    w.dying = 'defeat_warden';
    applyCommand(w, { k: 'class_active2' });
    expect(w.warden.active2Ammo).toBe(2);
    expect(w.timeLockZone).toBeNull();
  });
});
