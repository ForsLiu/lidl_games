/**
 * fb057 (BACKLOG-CONTENT; owner feedback
 * `feedback/processed/20260903-121255-feature-class-madness-king.md`,
 * SPEC-FINAL §4.2 *Madness King*) — **the owner's "Done when" list, clause by
 * clause.**
 *
 *   "full kit per above; tests for the passive cap (5 then wait), conversion
 *   (fights, dies when wave clears, keeps madness bonus), elite branch (3
 *   ticks + 90% slow), Active2 madness (teammate targeting in r3, self-attack
 *   + random walk otherwise, stacking bonus reset at expiry, elite movement
 *   exception), tower passive scaling; VFX registry entries for teammate/self
 *   attacks with ramp; determinism holds."
 *
 * Conventions, kept from the lane's liveness files (c005/c006/c009):
 *
 *   - **Every clause is a with-vs-without comparison**, never a bare "the
 *     number is set": the same scenario under the kit and without it (another
 *     class, an unmad twin, an enemy one step outside the radius), so the kit
 *     is shown to be the cause.
 *   - **Every magnitude is read out of `data/classes.json`** (or the enemy's
 *     own row / `data/spawns.json`), never restated, so a ⚖ retune moves the
 *     expectation with the content instead of reddening this file.
 *     `tests/class-spec-numbers.test.ts` (c008) is the one place that pins
 *     §4.2's own figures against the data.
 *   - Punching bags are the roster's first enemy (a trait-less walker), parked
 *     (`speed 0`) unless a clause is about movement, unarmoured, with hp deep
 *     enough that nothing dies by accident.
 *
 * Two figures the Madness status needs are fb085 engine constants rather than
 * `/data` fields (the r3 search and the r1 wander, `enemies.ts`); this file
 * reads them back off the engine's own behaviour (`madnessMoveTarget`) where a
 * clause needs them, and c008 records both as `in_code` rule-4 debt.
 */
import { describe, expect, it } from 'vitest';

import { applyRunResult, defaultMeta, metricsFor } from '../src/meta/meta';
import { CLASS_VFX, MADNESS_VFX, madnessRampColor } from '../src/render/vfx-registry';
import {
  characterDamage,
  classBasicAttack,
  updateClassPassives,
  updateClassSummons,
  useClassActive,
  useClassActive2,
} from '../src/sim/classes';
import { loadContent, type ClassDef, type EnemyDef } from '../src/sim/content';
import {
  applyMadness,
  applySlow,
  damageEnemy,
  effectiveSpeed,
  enemyAttackSpeedMul,
  enemyCoreDamage,
  MADNESS_SOURCE,
  madnessAttackSpeedMul,
  madnessMoveTarget,
  spawnEnemy,
  updateEnemies,
} from '../src/sim/enemies';
import { dist } from '../src/sim/math';
import { hashWorld, Run, updateWarden } from '../src/sim/run';
import { attackSpeedFor, buildTower, effectiveTowerRange, frenziedAimMul } from '../src/sim/towers';
import { emptyInput, type ClassSummon, type Command, type Enemy, type Structure, type TickInput } from '../src/sim/types';
import { World } from '../src/sim/world';
import { BUILD_TX, BUILD_TY, WX, WY } from './class-board';
import { cfg, makeInputLog, replay } from './helpers';

const content = loadContent();
const DT = 1 / 60;
const KEY = 'madness_king';
const MK: ClassDef = content.classByKey.get(KEY)!;
const PASSIVE = MK.passive;
const A1 = MK.active1;
const A2 = MK.active2;
const SP = content.spawns;

/** The roster's first enemy — the lane's punching-bag convention. */
const BAG = content.enemies.enemies[0]!;

/** A Madness King world (or `classKey`'s), basic attack parked, Warden on the shared probed board. */
function world(classKey = KEY): World {
  const w = new World(cfg({ classKey }), content);
  w.gold = 1e6;
  w.warden.attackCooldown = 1e9;
  w.warden.x = WX;
  w.warden.y = WY;
  return w;
}

interface BagOpts {
  hp?: number;
  /** Tiles/s. Defaults to 0 (parked); `true` keeps the enemy's own authored speed. */
  speed?: number | true;
  elite?: boolean;
}

function bag(w: World, x: number, y: number, o: BagOpts = {}): Enemy {
  const e = spawnEnemy(w, BAG.key, x, y, o.elite ? { elite: true } : {})!;
  e.hp = o.hp ?? 1e6;
  e.maxHp = Math.max(e.hp, e.maxHp);
  if (o.speed !== true) e.speed = o.speed ?? 0;
  e.armor = 0;
  w.rebuildBuckets();
  return e;
}

/**
 * One real character basic attack on `e`: `e` steps onto the parked Warden's
 * own spot (distance 0, so the nearest-enemy pick is `e` and nothing else)
 * and back. The Warden itself never leaves the shared spot (c014's rule,
 * `tests/class-board.test.ts`).
 */
function basicHit(w: World, e: Enemy): void {
  const [x, y] = [e.x, e.y];
  e.x = w.warden.x;
  e.y = w.warden.y;
  w.rebuildBuckets();
  w.warden.attackCooldown = 0;
  classBasicAttack(w, w.content.classByKey.get(w.cfg.classKey)!);
  e.x = x;
  e.y = y;
  w.rebuildBuckets();
}

/** `updateEnemies` at the real 60 Hz, buckets rebuilt the way `Run.step` does. */
function tickEnemies(w: World, seconds: number, each?: (t: number) => void): void {
  for (let t = 0; t < Math.round(seconds * 60); t++) {
    updateEnemies(w, DT);
    w.rebuildBuckets();
    each?.(t);
  }
}

/** The enemy's own contact hit — what a mad enemy lands on another enemy (or itself). */
function ownHit(w: World, e: Enemy): number {
  // Economy A (fb057 code review): an enemy's hit on another enemy scales by numberScale.
  return enemyCoreDamage(w, e.def as EnemyDef) * (1 + e.buffPower) * w.content.modifiers.numberScale;
}

function converted(w: World): ClassSummon[] {
  return w.classSummons.filter((s) => s.kind === 'converted');
}

describe('fb057: the kit is authored and dispatched', () => {
  it('Madness King carries the four §4.2 slot kinds', () => {
    expect(PASSIVE.kind).toBe('whispers');
    expect(A1.kind).toBe('mind_manipulation');
    expect(A2.kind).toBe('spreading_madness');
    expect(MK.towerPassive.kind).toBe('frenzied_aim');
  });

  it('the punching bag is a plain walker, so madness can take on it (slow-immune enemies refuse the status)', () => {
    expect(BAG.traits ?? []).toEqual([]);
  });
});

/* ------------------------------------------------------------ Whispers */

describe('fb057 Whispers — every basic-attack hit puts its target into madness', () => {
  it('a Madness King hit leaves passive.madnessDurationSeconds of madness; the same hit from another class leaves none', () => {
    const w = world();
    const e = bag(w, WX + 1, WY);
    basicHit(w, e);
    expect(e.hp, 'the basic attack never landed').toBeLessThan(e.maxHp);
    expect(e.madnessRemaining).toBeCloseTo(PASSIVE.madnessDurationSeconds!, 10);
    expect(e.madnessFromPassive, 'Whispers madness must hold a cap slot').toBe(true);

    const ctl = world('engineer');
    const c = bag(ctl, WX + 1, WY);
    basicHit(ctl, c);
    expect(c.hp).toBeLessThan(c.maxHp);
    expect(c.madnessRemaining).toBe(0);
  });
});

describe('fb057 Whispers cap — madnessCap enemies at once, then nothing until one lapses or dies', () => {
  const CAP = Math.round(PASSIVE.madnessCap!);

  /** `n` bags one tile apart along +x — out of each other's way for the Warden-stands-on-it pick. */
  function crowd(w: World, n: number, y = WY): Enemy[] {
    return Array.from({ length: n }, (_, i) => bag(w, WX + 1 + i, y));
  }

  it('the first madnessCap hits each apply madness; a hit on one more enemy applies nothing', () => {
    expect(CAP, 'harness: the cap must be a positive count').toBeGreaterThan(0);
    const w = world();
    const c = crowd(w, CAP + 1);
    for (const e of c.slice(0, CAP)) basicHit(w, e);
    for (const e of c.slice(0, CAP)) {
      expect(e.madnessRemaining).toBeGreaterThan(0);
      expect(e.madnessFromPassive).toBe(true);
    }
    const extra = c[CAP]!;
    basicHit(w, extra);
    expect(extra.hp, 'the over-cap hit itself must still land').toBeLessThan(extra.maxHp);
    expect(extra.madnessRemaining, 'Whispers applied past its cap').toBe(0);
    expect(extra.madnessFromPassive).toBe(false);
  });

  it('...until one of the held enemies dies — the same hit then applies', () => {
    const w = world();
    const c = crowd(w, CAP + 1);
    for (const e of c.slice(0, CAP)) basicHit(w, e);
    const extra = c[CAP]!;
    basicHit(w, extra);
    expect(extra.madnessRemaining).toBe(0);
    damageEnemy(w, c[0]!, 1e9, 'test');
    expect(c[0]!.dead).toBe(true);
    basicHit(w, extra);
    expect(extra.madnessRemaining).toBeCloseTo(PASSIVE.madnessDurationSeconds!, 10);
    expect(extra.madnessFromPassive).toBe(true);
  });

  it('...or until an old madness expires — the same hit then applies', () => {
    const w = world();
    const c = crowd(w, CAP + 1);
    for (const e of c.slice(0, CAP)) basicHit(w, e);
    const extra = c[CAP]!;
    basicHit(w, extra);
    expect(extra.madnessRemaining).toBe(0);
    tickEnemies(w, PASSIVE.madnessDurationSeconds! + 2 * DT);
    for (const e of c.slice(0, CAP)) expect(e.madnessRemaining, 'harness: the held madness never lapsed').toBe(0);
    basicHit(w, extra);
    expect(extra.madnessRemaining).toBeCloseTo(PASSIVE.madnessDurationSeconds!, 10);
  });

  it("Spreading Madness's madness takes no Whispers slot: madnessCap more enemies still go mad from hits", () => {
    const w = world();
    // Group A, maddened by Active2 around a cursor six tiles south — clear of
    // group B's line by more than the Active's own radius.
    const cx = WX + 3;
    const cy = WY + 6;
    const a = Array.from({ length: CAP }, (_, i) => bag(w, cx - 1 + (i % 3), cy - 0.5 + Math.floor(i / 3)));
    expect(useClassActive2(w, cx, cy)).toBe(true);
    for (const e of a) {
      expect(e.madnessRemaining).toBeCloseTo(A2.madnessDurationSeconds!, 10);
      expect(e.madnessFromPassive, 'Active2 madness claimed a Whispers slot').toBe(false);
    }
    const b = crowd(w, CAP + 1);
    for (const e of b) expect(e.madnessRemaining, 'harness: Spreading Madness reached group B').toBe(0);
    for (const e of b.slice(0, CAP)) basicHit(w, e);
    for (const e of b.slice(0, CAP)) {
      expect(e.madnessRemaining, 'an Active2-mad enemy took a Whispers slot').toBeCloseTo(
        PASSIVE.madnessDurationSeconds!,
        10,
      );
    }
    // ...and the cap still binds on the passive's own count.
    basicHit(w, b[CAP]!);
    expect(b[CAP]!.madnessRemaining).toBe(0);
    // A Whispers hit on an Active2-mad enemy neither claims a slot nor shortens it.
    basicHit(w, a[0]!);
    expect(a[0]!.madnessFromPassive).toBe(false);
    expect(a[0]!.madnessRemaining).toBeCloseTo(A2.madnessDurationSeconds!, 10);
  });
});

/* ------------------------------------------------------ the Madness status */

describe('fb057 QA regressions', () => {
  it('Spreading Madness on an enemy Whispers already holds keeps its passive slot (fb202 code-review correction)', () => {
    // fb202: the old behaviour here (Active2 releasing an already-Whispers-
    // held enemy's slot) was itself the bug — it let Spreading Madness
    // silently free a cap slot for an enemy still mad the whole time,
    // undercounting the passive's live cap. Active2 only ever extends the
    // clock; an enemy the passive already holds keeps its slot.
    const CAP = Math.round(PASSIVE.madnessCap!);
    const w = world();
    const held = Array.from({ length: CAP }, (_, i) => bag(w, WX + 1 + i, WY));
    for (const e of held) basicHit(w, e);
    const first = held[0]!;
    expect(first.madnessFromPassive).toBe(true);
    expect(useClassActive2(w, first.x, first.y)).toBe(true);
    expect(first.madnessFromPassive, 'Active2 must not evict an already-passive-held enemy from its slot').toBe(true);
    const fresh = bag(w, WX + 1, WY + 6);
    basicHit(w, fresh);
    expect(fresh.madnessRemaining, 'the cap is still fully held — no slot was freed').toBe(0);
  });

  it("Mind Manipulation's elite slow lasts its own window even under a longer, weaker slow (a frost aura)", () => {
    const TICKS = Math.round(A1.eliteConvertTicks!);
    const window = TICKS * A1.eliteConvertTickSeconds!;
    const w = world();
    const e = bag(w, WX + 2, WY, { speed: true, elite: true });
    applySlow(w, e, 0.35, 10); // a long, weaker slow already on it
    expect(useClassActive(w, e.x, e.y)).toBe(true);
    const base = e.speed;
    expect(effectiveSpeed(w, e)).toBeCloseTo(base * (1 - (A1.eliteConvertSlowAmount ?? 0)), 6);
    tickEnemies(w, window + 0.2);
    // Past the 90% window the enemy is back to the weaker slow, not held at 90%.
    expect(effectiveSpeed(w, e)).toBeGreaterThan(base * (1 - (A1.eliteConvertSlowAmount ?? 0)) * 1.5);
  });
});

describe('fb057 Madness — a mad enemy attacks the nearest other enemy within r3, else itself', () => {
  it('walks to the nearest other enemy within r3 and strikes it for its own attack (source madness), one stack per strike', () => {
    const w = world();
    const a = bag(w, WX + 1, WY, { speed: true });
    const b = bag(w, WX + 3, WY); // two tiles: inside r3, outside contact reach
    const far = bag(w, WX + 1, WY + 5); // outside r3 of `a`
    applyMadness(a, A2.madnessDurationSeconds!);
    const hit = ownHit(w, a);
    let strikes = 0;
    let prev = b.hp;
    tickEnemies(w, 3, () => {
      if (b.hp < prev) strikes++;
      prev = b.hp;
    });
    expect(strikes, 'the mad enemy never struck its neighbour').toBeGreaterThan(0);
    expect(b.maxHp - b.hp).toBeCloseTo(strikes * hit, 6);
    expect(w.damageByWeapon[MADNESS_SOURCE] ?? 0, 'the strikes were not booked to the madness source').toBeCloseTo(
      strikes * hit,
      6,
    );
    expect(a.hp, 'with a neighbour in r3 it must not strike itself').toBe(a.maxHp);
    expect(far.hp, 'an enemy outside r3 was struck').toBe(far.maxHp);
    expect(a.madnessStacks, 'one stack per madness attack').toBe(strikes);
    expect(dist(a.x, a.y, b.x, b.y), 'it struck from outside its own reach').toBeLessThanOrEqual(
      a.radius + b.radius + SP.contactPadding + 1e-9,
    );

    // Without madness the same enemy walks its normal path and touches nobody.
    const ctl = world();
    const ca = bag(ctl, WX + 1, WY, { speed: true });
    const cb = bag(ctl, WX + 3, WY);
    tickEnemies(ctl, 3);
    expect(cb.hp).toBe(cb.maxHp);
    expect(ca.hp).toBe(ca.maxHp);
    expect(ctl.damageByWeapon[MADNESS_SOURCE] ?? 0).toBe(0);
  });

  it('with no other enemy within r3 it strikes itself, stacking just the same', () => {
    const w = world();
    const a = bag(w, WX + 1, WY);
    const far = bag(w, WX + 1, WY + 5);
    applyMadness(a, PASSIVE.madnessDurationSeconds!);
    const hit = ownHit(w, a);
    tickEnemies(w, 1);
    const lost = a.maxHp - a.hp;
    expect(lost, 'a lone mad enemy did not strike itself').toBeGreaterThan(0);
    expect(lost / hit, 'self-strikes are its own whole attack').toBeCloseTo(Math.round(lost / hit), 9);
    expect(a.madnessStacks).toBe(Math.round(lost / hit));
    expect(far.hp).toBe(far.maxHp);

    const ctl = world();
    const c = bag(ctl, WX + 1, WY);
    tickEnemies(ctl, 1);
    expect(c.hp, 'an unmad enemy struck itself').toBe(c.maxHp);
  });

  it('madnessStacks caps at madnessMaxStacks instead of growing without bound (fb202, QA: 2,509 stacks over 60 s)', () => {
    // Each stack's own +attack-speed shortens the next attack's cooldown,
    // which lets the next stack land sooner — an uncapped positive-feedback
    // loop with no natural ceiling. Refreshing the madness clock every tick
    // (self-strikes alone, no other enemy nearby) isolates the loop from the
    // status simply lapsing.
    const w = world();
    const a = bag(w, WX + 1, WY);
    const cap = Math.round(PASSIVE.madnessMaxStacks!);
    expect(cap, 'harness: this class must author a real cap for the test to mean anything').toBeGreaterThan(0);
    tickEnemies(w, 30, () => applyMadness(a, PASSIVE.madnessDurationSeconds!));
    expect(a.madnessStacks).toBe(cap);
  });

  it('each madness attack speeds the next: the cooldown after strike k is contactInterval / (1 + (k-1) x madnessAtkSpdPerStack)', () => {
    const w = world();
    const a = bag(w, WX + 1, WY);
    applyMadness(a, A2.madnessDurationSeconds!);
    const per = PASSIVE.madnessAtkSpdPerStack!;
    expect(per, 'harness: a zero per-stack bonus cannot be told apart from no bonus').toBeGreaterThan(0);
    const cooldowns: number[] = [];
    let stacks = 0;
    tickEnemies(w, 4, () => {
      if (a.madnessStacks > stacks) {
        stacks = a.madnessStacks;
        cooldowns.push(a.madnessAttackCooldown);
      }
    });
    expect(cooldowns.length, 'harness: too few strikes to see the ramp').toBeGreaterThanOrEqual(4);
    cooldowns.slice(0, 4).forEach((cd, k) => {
      expect(cd, `strike ${k + 1}`).toBeCloseTo(SP.contactInterval / (1 + k * per), 9);
    });
    // Faster, strictly — the "visibly ramping" the owner asks for.
    for (let k = 1; k < 4; k++) expect(cooldowns[k]!).toBeLessThan(cooldowns[k - 1]!);
  });

  it('its stacks raise a non-elite\'s move speed by madnessMoveSpdPerStack each', () => {
    const w = world();
    const a = bag(w, WX + 1, WY, { speed: true });
    const base = effectiveSpeed(w, a);
    applyMadness(a, A2.madnessDurationSeconds!);
    a.madnessStacks = 3;
    expect(effectiveSpeed(w, a)).toBeCloseTo(base * (1 + 3 * PASSIVE.madnessMoveSpdPerStack!), 9);
  });

  it('the stacks — and both bonuses — are lost when the madness ends', () => {
    const w = world();
    const a = bag(w, WX + 1, WY, { speed: true });
    const baseSpeed = effectiveSpeed(w, a);
    const baseAtk = enemyAttackSpeedMul(w, a);
    applyMadness(a, PASSIVE.madnessDurationSeconds!);
    let peak = 0;
    let peakAtk = 0;
    let peakSpeed = 0;
    tickEnemies(w, PASSIVE.madnessDurationSeconds! - 0.1, () => {
      if (a.madnessStacks > peak) {
        peak = a.madnessStacks;
        peakAtk = madnessAttackSpeedMul(w, a);
        peakSpeed = effectiveSpeed(w, a);
      }
    });
    expect(peak, 'harness: no stacks built before expiry').toBeGreaterThan(0);
    expect(peakAtk).toBeGreaterThan(baseAtk);
    expect(peakSpeed).toBeGreaterThan(baseSpeed);
    tickEnemies(w, 0.2);
    expect(a.madnessRemaining).toBe(0);
    expect(a.madnessStacks, 'stacks outlived the madness').toBe(0);
    expect(madnessAttackSpeedMul(w, a)).toBeCloseTo(baseAtk, 12);
    expect(effectiveSpeed(w, a)).toBeCloseTo(baseSpeed, 12);
  });

  it('random-walks within r1 of where it went mad while alone (owner text: "random-walks within r1 of where it went mad")', () => {
    const w = world();
    const a = bag(w, WX + 1, WY, { speed: true });
    const ox = a.x;
    const oy = a.y;
    applyMadness(a, A2.madnessDurationSeconds!);
    // r1, read off the engine's own wander target rather than restated.
    const wander = madnessMoveTarget(w, a)!;
    expect(wander, 'a lone mad non-elite must wander').not.toBeNull();
    const r1 = dist(a.x, a.y, wander.x, wander.y);
    expect(r1).toBeGreaterThan(0);
    let farthest = 0;
    let moved = 0;
    tickEnemies(w, A2.madnessDurationSeconds! - DT, () => {
      if (a.madnessRemaining <= 0) return;
      const d = dist(a.x, a.y, ox, oy);
      farthest = Math.max(farthest, d);
      moved = Math.max(moved, d);
    });
    expect(moved, 'the mad enemy never moved at all').toBeGreaterThan(0);
    // One tick's step of slack past r1, no more.
    const step = effectiveSpeed(w, a) * DT;
    expect(farthest, `wandered ${farthest.toFixed(3)} tiles from where it went mad, past r1 = ${r1}`).toBeLessThanOrEqual(
      r1 + step,
    );
  });

  it("the stacked bonus never speeds its attacks on the character: contact cadence and enemyAttackSpeedMul are the unmad twin's", () => {
    const contacts = (mad: boolean) => {
      const w = world();
      w.phase = 'act2'; // the Warden hunt: contact attacks on the character are live
      w.warden.hp = 1e7;
      const e = bag(w, WX + 0.2, WY);
      if (mad) {
        applyMadness(e, 100);
        e.madnessStacks = 5;
      }
      const atkMul = enemyAttackSpeedMul(w, e);
      let resets = 0;
      let prev = e.attackCooldown;
      tickEnemies(w, 4, () => {
        if (e.attackCooldown > prev) resets++;
        prev = e.attackCooldown;
      });
      return { resets, atkMul, stacks: e.madnessStacks, hpLost: 1e7 - w.warden.hp };
    };
    const mad = contacts(true);
    const sane = contacts(false);
    expect(sane.resets, 'harness: the control never touched the Warden').toBeGreaterThan(2);
    expect(mad.stacks, 'harness: the mad enemy built no stacks').toBeGreaterThan(5);
    expect(mad.resets, 'madness stacks sped up attacks on the character').toBe(sane.resets);
    expect(mad.atkMul).toBeCloseTo(sane.atkMul, 12);
    expect(mad.hpLost).toBeCloseTo(sane.hpLost, 9);
  });
});

describe('fb057 Madness on an elite — keeps its pathing, never gains the move bonus, strikes a teammate in r3 or itself', () => {
  it('its movement is the unmad elite\'s, tick for tick, and madnessMoveTarget is null', () => {
    const walk = (mad: boolean) => {
      const w = world();
      const e = bag(w, WX + 1, WY, { speed: true, elite: true });
      if (mad) applyMadness(e, A2.madnessDurationSeconds!);
      expect(madnessMoveTarget(w, e)).toBeNull();
      const path: number[] = [];
      tickEnemies(w, 2, () => path.push(e.x, e.y));
      return { path, hp: e.hp, maxHp: e.maxHp, stacks: e.madnessStacks };
    };
    const mad = walk(true);
    const sane = walk(false);
    expect(sane.path.at(-2)).not.toBe(sane.path[0]); // harness: it actually walks
    expect(mad.path.length).toBe(sane.path.length);
    mad.path.forEach((v, i) => expect(v, `path coordinate ${i}`).toBeCloseTo(sane.path[i]!, 9));
    // ...while striking itself as it walks ("self-damage while walking").
    expect(mad.hp, 'a lone mad elite did not strike itself').toBeLessThan(mad.maxHp);
    expect(mad.stacks).toBeGreaterThan(0);
    expect(sane.hp).toBe(sane.maxHp);
  });

  it('its stacks never raise its move speed — but do speed its madness attacks', () => {
    const w = world();
    const e = bag(w, WX + 1, WY, { speed: true, elite: true });
    const base = effectiveSpeed(w, e);
    applyMadness(e, A2.madnessDurationSeconds!);
    e.madnessStacks = 4;
    expect(effectiveSpeed(w, e)).toBeCloseTo(base, 12);
    expect(madnessAttackSpeedMul(w, e)).toBeCloseTo(enemyAttackSpeedMul(w, e) * (1 + 4 * PASSIVE.madnessAtkSpdPerStack!), 9);
  });

  it('with a teammate within r3 it strikes the teammate at once, without closing in', () => {
    const w = world();
    const e = bag(w, WX + 1, WY, { elite: true });
    const mate = bag(w, WX + 3.5, WY); // 2.5 tiles: inside r3, well outside contact reach
    applyMadness(e, A2.madnessDurationSeconds!);
    tickEnemies(w, DT);
    expect(mate.maxHp - mate.hp).toBeCloseTo(ownHit(w, e), 9);
    expect(e.hp).toBe(e.maxHp);
    expect(e.x).toBe(WX + 1);
  });
});

/* -------------------------------------------------- Mind Manipulation */

describe('fb057 Mind Manipulation — converts the non-elite nearest the cursor', () => {
  it('recruits: the enemy leaves the roster with no kill, bounty or corpse, and a converted teammate stands where it stood', () => {
    const w = world();
    const e = bag(w, WX + 2, WY, { speed: true });
    const def = e.def as EnemyDef;
    const before = { kills: w.kills, gold: w.gold, corpses: w.corpses.length };
    const hit = ownHit(w, e);
    const speed = e.speed;
    expect(useClassActive(w, e.x, e.y)).toBe(true);
    expect(e.dead).toBe(true);
    w.compact();
    expect(w.enemies).not.toContain(e);
    expect(w.kills, 'a conversion is not a kill').toBe(before.kills);
    expect(w.gold, 'a conversion pays no bounty').toBe(before.gold);
    expect(w.corpses.length, 'a conversion leaves no corpse').toBe(before.corpses);
    const [s, ...rest] = converted(w);
    expect(rest).toEqual([]);
    expect(s, 'no converted teammate appeared').toBeDefined();
    expect([s!.x, s!.y]).toEqual([e.x, e.y]);
    expect(s!.hitDamage).toBeCloseTo(hit, 12);
    // Its own attack, unbuffed here, in economy A (an enemy's hit on enemies scales by numberScale).
    expect(s!.hitDamage).toBeCloseTo(enemyCoreDamage(w, def) * w.content.modifiers.numberScale, 12);
    expect(w.content.modifiers.numberScale).toBeLessThan(1); // the shipped scale, so the two economies really differ
    expect(s!.speed).toBeCloseTo(speed, 12);
    expect(s!.interval).toBeCloseTo(SP.contactInterval, 12);
  });

  it('picks only within active1.radius of the cursor — one step outside and the cast recruits nobody', () => {
    const R = A1.radius;
    const pick = (offset: number) => {
      const w = world();
      const e = bag(w, WX + 2 + offset, WY);
      useClassActive(w, WX + 2, WY);
      return { dead: e.dead, converts: converted(w).length };
    };
    expect(pick(R - 0.05)).toEqual({ dead: true, converts: 1 });
    expect(pick(R + 0.05)).toEqual({ dead: false, converts: 0 });
  });

  it('the teammate walks to the nearest enemy and strikes it for its own attack, booked to madness', () => {
    const w = world();
    const e = bag(w, WX + 1, WY, { speed: true });
    const hit = ownHit(w, e);
    useClassActive(w, e.x, e.y);
    w.compact();
    const foe = bag(w, WX + 5, WY);
    const s = converted(w)[0]!;
    const start = dist(s.x, s.y, foe.x, foe.y);
    let t = 0;
    while (foe.hp === foe.maxHp && t++ < 600) updateClassSummons(w, DT);
    expect(foe.hp, 'the teammate never struck').toBeLessThan(foe.maxHp);
    expect(dist(s.x, s.y, foe.x, foe.y), 'it struck without walking in').toBeLessThan(start);
    expect(foe.maxHp - foe.hp).toBeCloseTo(hit, 9);
    expect(w.damageByWeapon[MADNESS_SOURCE] ?? 0).toBeCloseTo(hit, 9);
  });

  it('dies once no enemy is left and nothing is queued to spawn — and not while a spawn is still queued', () => {
    const lastsWith = (queued: boolean) => {
      const w = world();
      const e = bag(w, WX + 1, WY, { speed: true });
      useClassActive(w, e.x, e.y);
      w.compact();
      expect(converted(w)).toHaveLength(1);
      if (queued) w.spawnQueue.push([BAG.id, 0, 1]);
      for (let t = 0; t < 30; t++) updateClassSummons(w, DT);
      return converted(w).length;
    };
    expect(lastsWith(false), 'the teammate outlived the cleared wave').toBe(0);
    expect(lastsWith(true), 'the teammate died with enemies still to come').toBe(1);
  });

  it('dies when only submerged enemies remain, not just when none do at all (fb202 code-review correction)', () => {
    // A submerged enemy (a diving Burrower) is unreachable — before this fix,
    // `nearestEnemy` found it anyway, so the teammate walked at an unreachable
    // target forever and never triggered the "wave cleared" death check.
    const w = world();
    const e = bag(w, WX + 1, WY, { speed: true });
    useClassActive(w, e.x, e.y);
    w.compact();
    expect(converted(w)).toHaveLength(1);
    const foe = bag(w, WX + 5, WY);
    foe.submerged = true;
    for (let t = 0; t < 30; t++) updateClassSummons(w, DT);
    expect(converted(w), 'a submerged-only remainder must count as none left').toHaveLength(0);
  });

  /**
   * Sets a converted teammate right at a tile-corner boundary, aimed
   * up-right at a far target so the very next step crosses both axes at
   * once, and clears the four tiles around the corner (anchored on the
   * Warden's own known-clear tile rather than an absolute coordinate, since
   * the "probed board" may wall off arbitrary tiles elsewhere). Returns the
   * summon and the corner's own (cx, cy).
   */
  function cornerSetup(w: World): { s: ClassSummon; cx: number; cy: number } {
    const e = bag(w, WX + 1, WY, { speed: true });
    useClassActive(w, e.x, e.y);
    w.compact();
    const s = converted(w)[0]!;
    const cx = Math.floor(w.warden.x);
    const cy = Math.floor(w.warden.y);
    s.x = cx + 0.999;
    s.y = cy + 0.999;
    bag(w, cx + 20, cy + 20); // far up-right — keeps the approach direction diagonal
    for (const [tx, ty] of [
      [cx, cy],
      [cx + 1, cy],
      [cx, cy + 1],
      [cx + 1, cy + 1],
    ]) {
      w.grid.blocked[w.grid.idx(tx!, ty!)] = 0;
    }
    return { s, cx, cy };
  }

  it('slides along an open axis instead of stalling completely against a blocked diagonal tile (fb202 code-review correction)', () => {
    // The old passability check tested one combined destination tile
    // (floor(nx), floor(ny)) and rejected the whole step — both axes — the
    // instant that single tile was blocked, even when sliding along one open
    // axis (a maze corner's corridor) was perfectly legal.
    const w = world();
    const { s, cx, cy } = cornerSetup(w);
    // A wall corner: the diagonal tile and the "north" tile are blocked; the
    // "east" tile stays open, like a corridor bending east.
    w.grid.blocked[w.grid.idx(cx + 1, cy + 1)] = 1;
    w.grid.blocked[w.grid.idx(cx, cy + 1)] = 1;
    updateClassSummons(w, DT);
    expect(s.x, 'must still slide east through the open tile').toBeGreaterThan(cx + 1);
    expect(s.y, 'north stays blocked, unlike the old all-or-nothing stall').toBeCloseTo(cy + 0.999, 6);
  });

  it("checks each axis against the pre-move position, not a value the other axis's own branch already wrote (fb202 code-review Major)", () => {
    // A first-draft fix checked passability for X/Y independently but let the
    // Y branch read `s.x` *after* the X branch may have already written it —
    // so whichever axis happened to be checked first could flip the other's
    // outcome. Here only the diagonal tile is blocked; both the "east" tile
    // (the candidate X move) and the "north" tile, read against the
    // ORIGINAL x, are open — a real diagonal-adjacent corner where both axes
    // should independently pass. The coupled draft instead evaluates the Y
    // branch against the already-updated (east) x, which lands on the
    // blocked diagonal tile, and wrongly refuses the Y move.
    const w = world();
    const { s, cx, cy } = cornerSetup(w);
    w.grid.blocked[w.grid.idx(cx + 1, cy + 1)] = 1; // only the diagonal tile
    updateClassSummons(w, DT);
    expect(s.x, 'the east tile was open').toBeGreaterThan(cx + 1);
    expect(s.y, "the north tile, read against the ORIGINAL x, was open too").toBeGreaterThan(cy + 1);
  });

  it("a convert that was mad keeps its stacked bonus: interval / (1 + n x atk) and speed x (1 + n x move)", () => {
    const n = 3;
    const convert = (mad: boolean) => {
      const w = world();
      const e = bag(w, WX + 2, WY, { speed: true });
      if (mad) {
        applyMadness(e, A2.madnessDurationSeconds!);
        e.madnessStacks = n;
      }
      useClassActive(w, e.x, e.y);
      return converted(w)[0]!;
    };
    const mad = convert(true);
    const sane = convert(false);
    expect(mad.interval).toBeCloseTo(sane.interval / (1 + n * PASSIVE.madnessAtkSpdPerStack!), 12);
    expect(mad.speed!).toBeCloseTo(sane.speed! * (1 + n * PASSIVE.madnessMoveSpdPerStack!), 12);
    expect(mad.interval).toBeLessThan(sane.interval);
    expect(mad.speed!).toBeGreaterThan(sane.speed!);
  });

  it('maxCharges casts back to back with no cast cooldown, then waits rechargeSeconds for the next', () => {
    const w = world();
    const max = Math.round(A1.maxCharges!);
    const foes = Array.from({ length: max + 1 }, (_, i) => bag(w, WX + 2 + i * 3, WY));
    for (let i = 0; i < max; i++) expect(useClassActive(w, foes[i]!.x, foes[i]!.y), `charge ${i + 1}`).toBe(true);
    expect(w.warden.active1Cooldown, 'Mind Manipulation has no cast cooldown').toBe(0);
    const last = foes[max]!;
    expect(useClassActive(w, last.x, last.y), 'a charge past maxCharges landed').toBe(false);
    expect(last.dead).toBe(false);
    const input: TickInput = emptyInput();
    let t = 0;
    while (!useClassActive(w, last.x, last.y) && t++ < 60 * 60) updateWarden(w, input, DT);
    expect(t / 60, 'the first charge came back at the wrong time').toBeCloseTo(A1.rechargeSeconds!, 1);
    expect(last.dead).toBe(true);
  });
});

describe('fb057 Mind Manipulation on an elite or boss — no conversion; eliteConvertTicks ticks of (its attack + the basic hit), slowed', () => {
  const TICKS = Math.round(A1.eliteConvertTicks!);
  const TICK_S = A1.eliteConvertTickSeconds!;

  function cast(flag: 'elite' | 'boss') {
    const w = world();
    const e = bag(w, WX + 2, WY, { speed: true, elite: flag === 'elite' });
    if (flag === 'boss') e.boss = true;
    const expected = ownHit(w, e) + characterDamage(w, MK, MK.basicAttack.dps * MK.basicAttack.interval);
    expect(useClassActive(w, e.x, e.y)).toBe(true);
    return { w, e, expected };
  }

  for (const flag of ['elite', 'boss'] as const) {
    it(`${flag}: exactly eliteConvertTicks ticks over eliteConvertTicks x eliteConvertTickSeconds, each (its attack + the basic hit)`, () => {
      const { w, e, expected } = cast(flag);
      expect(e.dead, `the ${flag} was converted`).toBe(false);
      expect(converted(w)).toHaveLength(0);
      const hits: { t: number; dmg: number }[] = [];
      let prev = e.hp;
      for (let t = 1; t <= Math.ceil((TICKS * TICK_S + 1) * 60); t++) {
        updateClassPassives(w, DT);
        if (e.hp < prev) hits.push({ t: t * DT, dmg: prev - e.hp });
        prev = e.hp;
      }
      expect(hits.map((h) => h.dmg).length, 'tick count').toBe(TICKS);
      for (const h of hits) expect(h.dmg).toBeCloseTo(expected, 9);
      // The train spans the authored window: the last tick lands at
      // ticks x tickSeconds (to the frame), none after.
      expect(hits.at(-1)!.t).toBeCloseTo(TICKS * TICK_S, 1);
      hits.forEach((h, i) => expect(h.t, `tick ${i + 1}`).toBeCloseTo((i + 1) * TICK_S, 1));
    });
  }

  it('is slowed by eliteConvertSlowAmount for the whole window, and an unstruck elite is not', () => {
    const { w, e } = cast('elite');
    // `applySlow` caps every slow at 90%, which is exactly §4.2's figure.
    const slow = Math.min(0.9, A1.eliteConvertSlowAmount!);
    expect(e.mindSlowAmount).toBeCloseTo(slow, 12);
    expect(e.mindSlowRemaining).toBeCloseTo(TICKS * TICK_S, 12);
    const ctl = world();
    const c = bag(ctl, WX + 2, WY, { speed: true, elite: true });
    expect(c.mindSlowAmount).toBe(0);
    expect(effectiveSpeed(w, e)).toBeCloseTo(effectiveSpeed(ctl, c) * (1 - slow), 9);
  });

  it('each tick is a damage instance from an Active, so Whispers maddens the elite', () => {
    const { w, e } = cast('elite');
    expect(e.madnessRemaining, 'mad before any tick landed').toBe(0);
    for (let t = 0; t < Math.ceil(TICK_S * 60) + 1; t++) updateClassPassives(w, DT);
    expect(e.madnessRemaining).toBeGreaterThan(0);
    expect(e.madnessFromPassive).toBe(true);
  });
});

/* -------------------------------------------------- Spreading Madness */

describe('fb057 Spreading Madness — every enemy within r4 of the cursor goes mad for 10 s', () => {
  it('an enemy just inside the radius goes mad for madnessDurationSeconds; one just outside, and one by the Warden, are untouched', () => {
    const w = world();
    const R = A2.radius * w.derived.areaMul;
    expect(w.derived.areaMul, 'harness: no Area source in a fresh world').toBe(1);
    const cx = WX + 5;
    const cy = WY;
    const inside = bag(w, cx + R - 0.05, cy);
    const outside = bag(w, cx - R - 0.05, cy);
    const byWarden = bag(w, WX, WY + 0.5);
    expect(dist(byWarden.x, byWarden.y, cx, cy), 'harness: the Warden-side bag must sit outside the circle').toBeGreaterThan(R);
    expect(useClassActive2(w, cx, cy)).toBe(true);
    expect(inside.madnessRemaining).toBeCloseTo(A2.madnessDurationSeconds!, 12);
    expect(outside.madnessRemaining).toBe(0);
    expect(byWarden.madnessRemaining, 'the circle was centred on the Warden, not the cursor').toBe(0);
    expect(w.warden.active2Cooldown).toBeCloseTo(A2.cooldownSeconds, 12);
  });
});

/* ------------------------------------------------------- Frenzied Aim */

describe("fb057 Frenzied Aim — a tower's attack speed rises linearly as its nearest enemy closes in", () => {
  const SPIRE = content.towerByKey.get('arrow_spire')!;

  function towerAt(classKey: string, atkBonus = 0): { w: World; s: Structure } {
    const w = world(classKey);
    if (atkBonus !== 0) {
      w.stats.addAll('test:attackSpeed', { attackSpeed: atkBonus });
      w.recomputeDerived();
    }
    const r = buildTower(w, SPIRE.id, BUILD_TX, BUILD_TY);
    expect(r.ok, 'harness could not build the spire').toBe(true);
    return { w, s: (r as { ok: true; structure: Structure }).structure };
  }

  /** frenziedAimMul with one enemy `d` tiles east of the spire's centre (null: no enemy at all). */
  function mulAt(classKey: string, d: number | null, atkBonus = 0): number {
    const { w, s } = towerAt(classKey, atkBonus);
    if (d !== null) bag(w, s.tx + 0.5 + d, s.ty + 0.5);
    return frenziedAimMul(w, s);
  }

  const range = (() => {
    const { w } = towerAt(KEY);
    return effectiveTowerRange(w, SPIRE);
  })();

  it('1 at the edge of range, (charBonus + frenziedAimFlatBonus) at point-blank, linear in between', () => {
    const { w } = towerAt(KEY);
    expect(w.derived.attackSpeedMul, 'harness: a fresh Madness King carries no attack-speed bonus').toBe(1);
    const flat = MK.towerPassive.frenziedAimFlatBonus!;
    expect(mulAt(KEY, 0)).toBeCloseTo(1 + flat, 12);
    expect(mulAt(KEY, range / 2)).toBeCloseTo(1 + flat / 2, 9);
    expect(mulAt(KEY, range / 4)).toBeCloseTo(1 + flat * 0.75, 9);
    expect(mulAt(KEY, range * (1 - 1e-9))).toBeCloseTo(1, 6);
    expect(mulAt(KEY, range + 0.05), 'an enemy past max range still sped the tower').toBe(1);
    expect(mulAt(KEY, null)).toBe(1);
  });

  it("the point-blank bonus is the character's total attack-speed bonus + frenziedAimFlatBonus: +32% gives x1.42 (the owner's example)", () => {
    const flat = MK.towerPassive.frenziedAimFlatBonus!;
    expect(mulAt(KEY, 0, 0.32)).toBeCloseTo(1 + 0.32 + flat, 9);
    expect(mulAt(KEY, range / 2, 0.32)).toBeCloseTo(1 + (0.32 + flat) / 2, 9);
  });

  it('reaches the real cadence: attackSpeedFor carries exactly this factor', () => {
    const near = towerAt(KEY);
    bag(near.w, near.s.tx + 0.5, near.s.ty + 0.5);
    const bare = towerAt(KEY);
    expect(attackSpeedFor(near.w, near.s) / attackSpeedFor(bare.w, bare.s)).toBeCloseTo(frenziedAimMul(near.w, near.s), 12);
    expect(frenziedAimMul(near.w, near.s)).toBeGreaterThan(1);
  });

  it('is 1 for every other class, whatever the distance', () => {
    for (const c of content.classes.classes) {
      if (c.key === KEY) continue;
      expect(mulAt(c.key, 0, 0.32), c.key).toBe(1);
    }
  });
});

/* ------------------------------------------- kills by enemies, and the quest */

describe('fb057 enemies killed by other enemies — w.enemyOnEnemyKills and the mob_mentality quest', () => {
  it("a mad enemy's kill counts; the same kill by the character does not", () => {
    const w = world();
    const a = bag(w, WX + 1, WY);
    // Half of one (economy-A) madness strike: dies to the first one.
    const b = bag(w, WX + 2, WY, { hp: 0.5 * ownHit(w, a) }); // inside contact reach: struck on the first tick
    applyMadness(a, A2.madnessDurationSeconds!);
    const kills = w.kills;
    tickEnemies(w, DT);
    expect(b.dead).toBe(true);
    expect(w.kills, 'a madness kill is still a character-caused kill').toBe(kills + 1);
    expect(w.enemyOnEnemyKills).toBe(1);

    const ctl = world();
    const c = bag(ctl, WX + 1, WY, { hp: 1 });
    basicHit(ctl, c);
    expect(c.dead).toBe(true);
    expect(ctl.enemyOnEnemyKills, 'a character kill counted as enemy-on-enemy').toBe(0);
  });

  it("a converted teammate's kill counts", () => {
    const w = world();
    const e = bag(w, WX + 1, WY, { speed: true });
    useClassActive(w, e.x, e.y);
    w.compact();
    const foe = bag(w, WX + 1.5, WY, { hp: 0.5 * ownHit(w, e) }); // dies to the teammate's first strike
    for (let t = 0; t < 120 && !foe.dead; t++) updateClassSummons(w, DT);
    expect(foe.dead).toBe(true);
    expect(w.enemyOnEnemyKills).toBe(1);
  });

  it("the metric banks into mob_mentality's progress and unlocks Madness King at the authored target", () => {
    const quest = content.quests.quests.find((q) => q.key === 'mob_mentality')!;
    expect(quest.metric).toBe('enemy_on_enemy_kills');
    expect(quest.reward).toEqual({ kind: 'class', value: KEY });
    expect(MK.unlockQuest).toBe(quest.key);

    const finish = (killsThisRun: number) => {
      const run = new Run(cfg({ classKey: 'engineer' }));
      run.world.enemyOnEnemyKills = killsThisRun;
      const report = run.report();
      expect(metricsFor(report, run.world).enemy_on_enemy_kills).toBe(killsThisRun);
      const meta = { ...defaultMeta(), questProgress: { enemy_on_enemy_kills: quest.target - 1 } };
      return applyRunResult(meta, report, run.world);
    };
    const done = finish(1);
    expect(done.questProgress.enemy_on_enemy_kills).toBe(quest.target);
    expect(done.completedQuests).toContain(quest.key);
    expect(done.unlockedClasses).toContain(KEY);
    const short = finish(0);
    expect(short.completedQuests).not.toContain(quest.key);
    expect(short.unlockedClasses).not.toContain(KEY);
  });
});

/* -------------------------------------------------------------- VFX */

describe('fb057 VFX — the registry names the teammate and self strikes, and the ramp brightens', () => {
  it('Madness King has a CLASS_VFX row (crown impact) and the Madness status its two distinct strikes', () => {
    const row = CLASS_VFX[KEY];
    expect(row, 'no CLASS_VFX row').toBeDefined();
    expect(row!.basic.impact).toBe('crown');
    expect(MADNESS_VFX.teammate.fire.length).toBeGreaterThan(0);
    expect(MADNESS_VFX.self.fire.length).toBeGreaterThan(0);
    expect(MADNESS_VFX.teammate.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(MADNESS_VFX.self.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(MADNESS_VFX.teammate.color, 'teammate and self strikes must look different').not.toBe(MADNESS_VFX.self.color);
  });

  it('madnessRampColor gets strictly brighter with each stack up to its cap, and clamps past it', () => {
    const lightness = (n: number) => Number(/hsl\(\s*[\d.]+\s*,\s*[\d.]+%\s*,\s*([\d.]+)%\s*\)/.exec(madnessRampColor(n))![1]);
    for (let n = 2; n <= 10; n++) expect(lightness(n), `stack ${n}`).toBeGreaterThan(lightness(n - 1));
    expect(lightness(25)).toBe(lightness(10));
    expect(lightness(0)).toBe(lightness(1));
  });

  it('the sim emits the teammate strike with its ramp, and a self strike carrying the stack count', () => {
    const w = world();
    const a = bag(w, WX + 1, WY);
    const b = bag(w, WX + 2, WY);
    applyMadness(a, A2.madnessDurationSeconds!);
    w.fx.length = 0;
    tickEnemies(w, DT);
    const kinds = w.fx.map((f) => f.k);
    expect(kinds).toContain('madness_hit');
    expect(kinds).toContain('madness_ramp');
    expect(kinds).not.toContain('madness_self');
    void b;

    const lone = world();
    const e = bag(lone, WX + 1, WY);
    applyMadness(e, A2.madnessDurationSeconds!);
    lone.fx.length = 0;
    tickEnemies(lone, 2);
    const selfs = lone.fx.filter((f) => f.k === 'madness_self');
    expect(selfs.length, 'no self strike emitted').toBeGreaterThan(1);
    // `a` carries the stack count after that strike, so the ring can ramp.
    selfs.forEach((f, i) => expect(f.a, `self strike ${i + 1}`).toBe(i + 1));
  });
});

/* --------------------------------------------------------- determinism */

describe('fb057 determinism — Madness King actives in the input log replay to the same end hash', () => {
  function fight(): { run: Run; sawConvert: boolean } {
    const run = new Run(cfg({ classKey: KEY }));
    const w = run.world;
    w.gold = 1e6;
    const wx = w.warden.x;
    const wy = w.warden.y;
    const recruit = bag(w, wx + 2, wy, { speed: true, hp: 400 });
    const elite = bag(w, wx - 2, wy, { speed: true, elite: true, hp: 5000 });
    const pack = [0, 1, 2, 3].map((i) => bag(w, wx + 1 + (i % 2), wy + 3 + Math.floor(i / 2), { speed: true, hp: 300 }));
    const log: TickInput[] = [];
    for (let t = 0; t < 900; t++) {
      const cmds: Command[] = [];
      if (t === 5) cmds.push({ k: 'class_active', aimX: recruit.x, aimY: recruit.y });
      if (t === 12) cmds.push({ k: 'class_active', aimX: elite.x, aimY: elite.y });
      if (t === 30) cmds.push({ k: 'class_active2', aimX: pack[0]!.x, aimY: pack[0]!.y });
      log.push({ ...emptyInput(), cmds });
    }
    let sawConvert = false;
    for (const input of log) {
      run.step(input);
      if (converted(w).length > 0) sawConvert = true;
    }
    return { run, sawConvert };
  }

  it('a constructed fight — a conversion, an elite tick train, Spreading Madness and Whispers — reaches one hash twice', () => {
    const a = fight();
    const b = fight();
    expect(a.run.hash()).toBe(b.run.hash());
    expect(hashWorld(a.run.world)).toBe(hashWorld(b.run.world));
    // Not vacuous: every new mechanism actually ran.
    const w = a.run.world;
    expect(a.sawConvert, 'no conversion happened').toBe(true);
    expect(w.damageByWeapon[MADNESS_SOURCE] ?? 0, 'no madness damage happened').toBeGreaterThan(0);
    expect(w.damageByWeapon['class_active'] ?? 0, 'the elite tick train never landed').toBeGreaterThan(0);
    expect(w.damageByWeapon['class_basic'] ?? 0, 'Whispers never had a basic hit to ride').toBeGreaterThan(0);
  });

  it('G2-style: several seeds of movement noise with Madness King actives in the log', () => {
    for (const seed of [1, 7, 42]) {
      const log = makeInputLog(seed, 2400).map((input, t) => {
        const cmds: Command[] = input.cmds.slice();
        if (t > 0 && t % 150 === 0) cmds.push({ k: 'class_active' });
        if (t > 0 && t % 400 === 0) cmds.push({ k: 'class_active2' });
        return { ...input, cmds };
      });
      const config = cfg({ seed, classKey: KEY });
      const x = replay(config, log);
      const y = replay(config, log);
      expect(y.endHash, `seed ${seed}`).toBe(x.endHash);
      expect(y.kills).toBe(x.kills);
      expect(y.damageTotal).toBe(x.damageTotal);
    }
  });

  it('the hash sees the new state: the Whispers flag, the madness-attack clock, a tick train, the kill tally and a convert', () => {
    const base = () => {
      const w = world();
      const e = bag(w, WX + 1, WY);
      applyMadness(e, 3);
      return { w, e };
    };
    const ref = hashWorld(base().w);
    const variants: [string, (w: World, e: Enemy) => void][] = [
      ['madnessFromPassive', (_w, e) => void (e.madnessFromPassive = true)],
      ['madnessAttackCooldown', (_w, e) => void (e.madnessAttackCooldown = 0.25)],
      ['mindTicks', (w, e) => void w.mindTicks.push({ enemyId: e.id, ticksLeft: 3, timer: 0.33, tickSeconds: 0.33, damage: 10 })],
      ['enemyOnEnemyKills', (w) => void (w.enemyOnEnemyKills = 1)],
    ];
    for (const [name, mutate] of variants) {
      const { w, e } = base();
      mutate(w, e);
      expect(hashWorld(w), `${name} is not hashed`).not.toBe(ref);
    }
    // Two converts differing only in their frozen madness bonus hash apart.
    const convertHash = (stacks: number) => {
      const w = world();
      const e = bag(w, WX + 2, WY, { speed: true });
      applyMadness(e, 3);
      e.madnessStacks = stacks;
      useClassActive(w, e.x, e.y);
      w.compact();
      return hashWorld(w);
    };
    expect(convertHash(2)).not.toBe(convertHash(0));
  });
});
