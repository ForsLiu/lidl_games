/**
 * x002 — SPEC-FINAL §2's lifesteal row, verbatim:
 *
 *   Lifesteal | Heals from **normal damage** dealt, no per-second cap. VS tower
 *              attacks count as character attacks, so they lifesteal.
 *
 * Two shipped behaviours asserted the opposite (MIGRATION §8.4.2, Q88):
 *
 *  1. `data/warden.json` carried `leechCapPerSecond: 3`, a V1/V2 safety rail
 *     §2 removes on purpose — and the clause is not marked ⚖, so the cap is a
 *     contradiction, not a tuning knob.
 *  2. `damageEnemy` accrued `leechAccumulator` from every `dmg` it applied —
 *     DoT ticks and the electric share of a split included — where §2 names
 *     normal damage only.
 *
 * The Bleeding Ring's "lifesteal now also applies to Bleeding damage" (§7) is
 * the *exception* that proves the rule reads type-by-type; the ring itself is
 * p7b's work, not this item's.
 *
 * Untyped direct damage — V2's weapons, the manual attack, class actives — is
 * normal damage (it is armor-reduced, which is §3's definition of normal), so
 * it leeches. p2a's wielded attacks arrive already typed through
 * `applyDamageSplit`, so the gate they meet here is the one §6.1 needs.
 */

import { describe, expect, it } from 'vitest';

import wardenRaw from '../data/warden.json';
import boonsRaw from '../data/boons.json';
import { damageEnemy, spawnEnemy, updateEnemies } from '../src/sim/enemies';
import { applyDamageSplit, applyDamageType } from '../src/sim/damagetypes';
import { hashWorld, updateWarden } from '../src/sim/run';
import { emptyInput } from '../src/sim/types';
import type { Enemy } from '../src/sim/types';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const DT = 1 / 60;
const LEECH = 0.01;

/** An Act II world whose Warden holds one leech source. */
function world(): World {
  const w = new World(cfg());
  w.phase = 'act2';
  w.stats.add('boon:leech', 'leech', LEECH);
  w.recomputeDerived();
  return w;
}

/** Rooted and effectively unkillable, so damage totals stay readable. */
function dummy(w: World, x = 10, y = 10): Enemy {
  const e = spawnEnemy(w, 'husk', x, y)!;
  e.hp = 1e6;
  e.maxHp = 1e6;
  e.speed = 0;
  w.rebuildBuckets();
  return e;
}

function tickEnemies(w: World, seconds: number): void {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) {
    w.rebuildBuckets();
    updateEnemies(w, DT);
  }
}

describe('x002 §2: lifesteal has no per-second cap', () => {
  it('the cap is gone from /data', () => {
    expect('leechCapPerSecond' in wardenRaw).toBe(false);
  });

  it('the leech boon no longer advertises a cap', () => {
    const boon = boonsRaw.boons.find((b: { key: string }) => b.key === 'leech')!;
    expect(boon.desc).not.toMatch(/cap/i);
  });

  it('one tick heals the whole accumulator, not 3 HP/s worth of it', () => {
    const w = world();
    const e = dummy(w);
    const wd = w.warden;
    const d = w.derived;
    wd.hp = Math.max(1, d.maxHp - 50);

    // 1% of 3000 normal damage = 30 HP owed, 600× what the old cap paid per
    // tick (3/60 = 0.05). One tick must pay all of it.
    applyDamageType(w, e, 'normal', 3000, 'test');
    expect(wd.leechAccumulator).toBeCloseTo(3000 * LEECH, 6);

    const before = wd.hp;
    updateWarden(w, emptyInput(), DT);
    // updateWarden also regens (always, in Act II) — account for it exactly.
    const afterRegen = Math.min(d.maxHp, before + d.hpRegen * DT);
    expect(wd.hp).toBeCloseTo(Math.min(d.maxHp, afterRegen + 3000 * LEECH), 6);
    expect(wd.leechAccumulator).toBe(0);
  });
});

describe('x002 §2: lifesteal heals from normal damage only', () => {
  it('a normal hit accrues leech', () => {
    const w = world();
    const e = dummy(w);
    applyDamageType(w, e, 'normal', 100, 'test');
    expect(w.warden.leechAccumulator).toBeCloseTo(100 * LEECH, 6);
  });

  it('untyped direct damage is normal damage, and leeches', () => {
    // Every V2 weapon, the manual attack and the class actives hit through
    // bare `damageEnemy` with no type; those are the character's normal hits.
    const w = world();
    const e = dummy(w);
    damageEnemy(w, e, 100, 'test');
    expect(w.warden.leechAccumulator).toBeCloseTo(100 * LEECH, 6);
  });

  it('Bleeding ticks do not leech', () => {
    const w = world();
    const e = dummy(w);
    applyDamageType(w, e, 'bleeding', 100, 'test');
    expect(w.warden.leechAccumulator).toBe(0); // the application deals nothing now
    tickEnemies(w, 2);
    expect(e.hp).toBeLessThan(1e6); // the DoT is really ticking…
    expect(w.warden.leechAccumulator).toBe(0); // …and none of it heals
  });

  it('Poison ticks do not leech', () => {
    const w = world();
    const e = dummy(w);
    applyDamageType(w, e, 'poison', 100, 'test');
    tickEnemies(w, 2);
    expect(e.hp).toBeLessThan(1e6);
    expect(w.warden.leechAccumulator).toBe(0);
  });

  it('an electric hit does not leech — §2 says normal, not direct', () => {
    const w = world();
    const e = dummy(w);
    applyDamageType(w, e, 'electric', 100, 'test');
    expect(e.hp).toBeLessThan(1e6); // the hit itself landed
    expect(w.warden.leechAccumulator).toBe(0);
  });

  it('a 1:1 normal:electric split leeches exactly the normal half', () => {
    const w = world();
    const e = dummy(w);
    applyDamageSplit(w, e, { normal: 1, electric: 1 }, 100, 'test');
    expect(w.warden.leechAccumulator).toBeCloseTo(50 * LEECH, 6);
  });

  it('an untyped dot-flagged hit does not leech — the ground-area/terrain-aura shape', () => {
    // combat.ts's ground fields and weapons.ts's terrain auras pass
    // `{ pure: true, dot: true }` with no type; the `!dot` leg alone must
    // exclude them, or 'normal'-by-default would leak them back in.
    const w = world();
    const e = dummy(w);
    damageEnemy(w, e, 100, 'test', { dot: true });
    expect(w.warden.leechAccumulator).toBe(0);
  });
});

describe('x002: the accumulator is hashed warden state', () => {
  it('two worlds differing only in leechAccumulator hash differently', () => {
    // `updateWarden` drains the accumulator *before* the damage systems refill
    // it each tick, so it is generically nonzero at hash time; a hash that
    // skipped it would let two replays disagree on a pending heal (the m19a
    // `enemyArmor` gap class).
    const a = new World(cfg());
    const b = new World(cfg());
    expect(hashWorld(a)).toBe(hashWorld(b));
    b.warden.leechAccumulator = 1;
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});
