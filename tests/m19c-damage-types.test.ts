/**
 * m19c — SPEC-V3 §3's damage-type taxonomy.
 *
 * §3 is a six-row table plus two statuses, so this file is one describe per row
 * asserting the numbers that row states verbatim, and a describe per status.
 *
 * Two rules govern what counts as a passing test here, both learned the hard way
 * at m19a and m19b: a clause is not covered until something drives the *real*
 * path (deleting the wiring must turn something red), and a number the table
 * states must be read from `/data`, not re-typed into an assertion — so each row
 * checks the authored value and then checks the behaviour that value produces.
 */

import { describe, expect, it } from 'vitest';

import {
  applyDot,
  applyFrost,
  applyFrozen,
  applyOnHit,
  dotOutstanding,
  dotRemaining,
  dotStacks,
  damageEnemy,
  effectiveSpeed,
  enemyArmor,
  isChilled,
  makeEnemy,
  spawnEnemy,
  updateEnemies,
} from '../src/sim/enemies';
import { applyDamageSplit, applyDamageType, DAMAGE_TYPES, dotDpsFor } from '../src/sim/damagetypes';
import { updateProjectiles } from '../src/sim/combat';
import '../src/sim/boss';
import { loadContent, validateOnHit } from '../src/sim/content';
import { hashWorld } from '../src/sim/run';
import { buildTower, updateTowers } from '../src/sim/towers';
import { World } from '../src/sim/world';
import type { Enemy } from '../src/sim/types';
import { cfg } from './helpers';

const DT = 1 / 60;

function world(): World {
  const w = new World(cfg());
  w.gold = 100000;
  return w;
}

/**
 * An enemy with enough HP to outlive any DoT in the table, and — unless the
 * test is about movement — rooted. `tick` advances the whole world, so a husk
 * left to walk would reach the Core and be despawned partway through a 9 s
 * Toxic, quietly turning a totals assertion into a movement assertion.
 */
function dummy(w: World, x = 10, y = 10, armor = 0, mobile = false): Enemy {
  const e = spawnEnemy(w, 'husk', x, y)!;
  e.hp = 1e6;
  e.maxHp = 1e6;
  e.armor = armor;
  if (!mobile) e.speed = 0;
  w.rebuildBuckets();
  return e;
}

/**
 * A husk with a trait the roster does not author on it. `traitFlags` caches the
 * folded bitmask by `def.id`, so a variant needs an id of its own or it comes
 * back with the real husk's flags.
 */
let variantId = 9000;
function variant(w: World, trait: string, x = 10, y = 10): Enemy {
  const base = w.content.enemyByKey.get('husk')!;
  const e = makeEnemy(w, { ...base, id: variantId++, traits: [...base.traits, trait] }, x, y);
  w.addEnemy(e);
  e.hp = 1e6;
  e.maxHp = 1e6;
  e.speed = 0;
  w.rebuildBuckets();
  return e;
}

/** Runs the real enemy update for `seconds`. */
function run(w: World, seconds: number): void {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) {
    w.rebuildBuckets();
    updateEnemies(w, DT);
  }
}

/** Runs the world for `seconds`, returning the HP it cost `e`. */
function tick(w: World, e: Enemy, seconds: number): number {
  const before = e.hp;
  run(w, seconds);
  return before - e.hp;
}

/** Same, for several enemies at once: one world clock, one measurement. */
function tickAll(w: World, es: readonly Enemy[], seconds: number): number[] {
  const before = es.map((e) => e.hp);
  run(w, seconds);
  return es.map((e, i) => before[i] - e.hp);
}

const content = loadContent();
const row = (key: string) => content.damageTypeByKey.get(key)!;

/* --------------------------------------------------------------- the table */

describe('§3 — the table is authored in data, not in code', () => {
  it('has exactly the six rows §3 lists, in order', () => {
    expect(content.damageTypes.types.map((t) => t.key)).toEqual([...DAMAGE_TYPES]);
  });

  it('names both statuses §3 defines', () => {
    expect(Object.keys(content.damageTypes.statuses).sort()).toEqual(['frost', 'frozen']);
  });

  it('every row is reachable through the front door', () => {
    const w = world();
    for (const key of DAMAGE_TYPES) {
      const e = dummy(w, 10, 10);
      expect(() => applyDamageType(w, e, key, 10, 'test')).not.toThrow();
    }
  });

  it('an unknown type is a loud error, never a free hit', () => {
    // The failure this prevents: a typo'd key silently dealing full damage as
    // if it were Normal, which is how a taxonomy quietly stops being one.
    const w = world();
    const e = dummy(w);
    expect(() => applyDamageType(w, e, 'fire', 10, 'test')).toThrow(/unknown damage type/);
  });
});

/* ------------------------------------------------------------------ Normal */

describe('§3 Normal — basic damage; reduced by armor', () => {
  it('is authored as a hit that armor applies to', () => {
    expect(row('normal').effect).toBe('hit');
    expect(row('normal').ignoresArmor).toBe(false);
  });

  it('deals its full damage at zero armor', () => {
    const w = world();
    expect(applyDamageType(w, dummy(w), 'normal', 100, 'test')).toBeCloseTo(100, 6);
  });

  it('is reduced by armor, which is what makes it Normal rather than an ailment', () => {
    const w = world();
    expect(applyDamageType(w, dummy(w, 10, 10, 40), 'normal', 100, 'test')).toBeCloseTo(60, 6);
  });
});

/* ---------------------------------------------------------------- Bleeding */

describe('§3 Bleeding — 1 dmg/s for 5 s per application, stacking independently', () => {
  it('is authored as 1 dps over 5 s', () => {
    expect(row('bleeding').dps).toBe(1);
    expect(row('bleeding').duration).toBe(5);
  });

  it('one application totals 5 damage over 5 seconds', () => {
    const w = world();
    const e = dummy(w);
    applyDamageType(w, e, 'bleeding', 999, 'test');
    // Flat dps: the damage that triggered it is deliberately irrelevant.
    expect(dotStacks(e, 'bleeding')).toBe(1);
    expect(tick(w, e, 5)).toBeCloseTo(5, 6);
  });

  it('expires after 5 s and deals nothing more', () => {
    const w = world();
    const e = dummy(w);
    applyDamageType(w, e, 'bleeding', 1, 'test');
    expect(tick(w, e, 5.1)).toBeCloseTo(5, 6);
    expect(dotStacks(e, 'bleeding')).toBe(0);
    expect(tick(w, e, 3)).toBeCloseTo(0, 9);
  });

  it('applications stack independently — 4 stacks deal 4x, not 1x', () => {
    const w = world();
    const e = dummy(w);
    for (let i = 0; i < 4; i++) applyDamageType(w, e, 'bleeding', 1, 'test');
    expect(dotStacks(e, 'bleeding')).toBe(4);
    // The refresh model this replaced would deal 5 here, not 20.
    expect(tick(w, e, 5)).toBeCloseTo(20, 6);
  });

  it('stacks to the 50/enemy perf cap and no further', () => {
    const w = world();
    const e = dummy(w);
    for (let i = 0; i < 200; i++) applyDamageType(w, e, 'bleeding', 1, 'test');
    expect(content.damageTypes.maxStacksPerEnemy).toBe(50);
    expect(row('bleeding').maxStacks).toBe(50);
    expect(dotStacks(e, 'bleeding')).toBe(50);
    expect(e.dots.length).toBe(50);
    expect(tick(w, e, 5)).toBeCloseTo(250, 4);
  });

  it('at the cap an application refreshes the shortest stack rather than being lost', () => {
    const w = world();
    const e = dummy(w);
    for (let i = 0; i < 50; i++) applyDot(w, e, 'bleeding', 1, 5, 'old');
    tick(w, e, 4); // every stack now has ~1 s left
    expect(dotStacks(e, 'bleeding')).toBe(50);
    applyDot(w, e, 'bleeding', 1, 5, 'new');
    expect(dotRemaining(e, 'bleeding')).toBeCloseTo(5, 6);
    expect(dotStacks(e, 'bleeding')).toBe(50);
  });
});

/* ------------------------------------------------------------------ Poison */

describe('§3 Poison — 120% of the triggering damage over 3 s', () => {
  it('is authored as ratio 1.2 over 3 s', () => {
    expect(row('poison').ratio).toBe(1.2);
    expect(row('poison').duration).toBe(3);
  });

  it('a 50-damage trigger deals exactly 60 over 3 s', () => {
    const w = world();
    const e = dummy(w);
    applyDamageType(w, e, 'poison', 50, 'test');
    expect(dotDpsFor(row('poison'), 50)).toBeCloseTo(20, 9);
    expect(tick(w, e, 3)).toBeCloseTo(60, 6);
  });

  it('scales with the trigger, unlike Bleeding', () => {
    const w = world();
    const a = dummy(w, 10, 10);
    const b = dummy(w, 20, 10);
    applyDamageType(w, a, 'poison', 10, 'test');
    applyDamageType(w, b, 'poison', 100, 'test');
    expect(tickAll(w, [a, b], 3)).toEqual([expect.closeTo(12, 5), expect.closeTo(120, 5)]);
  });

  it('ignores armor, in both directions', () => {
    const w = world();
    const armoured = dummy(w, 10, 10, 90);
    const shredded = dummy(w, 20, 10, -90);
    applyDamageType(w, armoured, 'poison', 50, 'test');
    applyDamageType(w, shredded, 'poison', 50, 'test');
    expect(tickAll(w, [armoured, shredded], 3)).toEqual([
      expect.closeTo(60, 5),
      expect.closeTo(60, 5),
    ]);
  });
});

/* ------------------------------------------------------------------- Toxic */

describe('§3 Toxic — 180% of the triggering damage over 9 s', () => {
  it('is authored as ratio 1.8 over 9 s', () => {
    expect(row('toxic').ratio).toBe(1.8);
    expect(row('toxic').duration).toBe(9);
  });

  it('a 50-damage trigger deals exactly 90 over 9 s', () => {
    const w = world();
    const e = dummy(w);
    applyDamageType(w, e, 'toxic', 50, 'test');
    expect(dotDpsFor(row('toxic'), 50)).toBeCloseTo(10, 9);
    expect(tick(w, e, 9)).toBeCloseTo(90, 6);
  });

  it('is the slower, larger sibling of Poison on the same trigger', () => {
    // Toxic pays 1.5x Poison's total but takes 3x as long, which is the whole
    // reason both rows exist. A test that only checked totals would pass with
    // the two durations swapped.
    const w = world();
    const p = dummy(w, 10, 10);
    const t = dummy(w, 20, 10);
    applyDamageType(w, p, 'poison', 100, 'test');
    applyDamageType(w, t, 'toxic', 100, 'test');
    expect(tickAll(w, [p, t], 3)).toEqual([expect.closeTo(120, 4), expect.closeTo(60, 4)]);
    expect(tick(w, t, 6)).toBeCloseTo(120, 4);
  });
});

/* ----------------------------------------------------------------- Burning */

describe('§3 Burning — 1 dmg and −1 armor per second for 3 s, both AoE (r1)', () => {
  it('is authored as 1 dps, 1 armor/s, 3 s, radius 1', () => {
    const b = row('burning');
    expect(b.dps).toBe(1);
    expect(b.armorShredPerSecond).toBe(1);
    expect(b.duration).toBe(3);
    expect(b.radius).toBe(1);
  });

  it('one application deals 3 damage over 3 s', () => {
    const w = world();
    const e = dummy(w);
    applyDamageType(w, e, 'burning', 999, 'test');
    expect(tick(w, e, 3)).toBeCloseTo(3, 5);
  });

  it('strips exactly 3 armor over its 3 s — gate C3s carried clause', () => {
    // m19a shipped `shredArmor` with no production caller. This is the caller:
    // delete the shred from `tickDot` and this turns red.
    const w = world();
    const e = dummy(w, 10, 10, 10);
    applyDamageType(w, e, 'burning', 1, 'test');
    tick(w, e, 3);
    expect(e.armorShred).toBeCloseTo(3, 5);
    expect(enemyArmor(e)).toBeCloseTo(7, 5);
  });

  it('stacked applications drive armor negative and past ×1 damage taken (Q44)', () => {
    const w = world();
    const e = dummy(w, 10, 10, 0);
    // 30 applications' worth of burn time: §3 says the shred is uncapped below
    // zero and Q44 measures 30 applications as −90 armor.
    for (let i = 0; i < 30; i++) {
      applyDot(w, e, 'burning', 1, 3, 'test');
      tick(w, e, 3);
    }
    expect(e.armorShred).toBeCloseTo(90, 3);
    expect(enemyArmor(e)).toBeCloseTo(-90, 3);
    expect(damageEnemy(w, e, 100, 'test')).toBeCloseTo(190, 2);
  });

  it('both effects land on neighbours inside r1, and nothing outside it', () => {
    const w = world();
    const victim = dummy(w, 10, 10);
    const near = dummy(w, 10.5, 10);
    const far = dummy(w, 12.5, 10);
    applyDamageType(w, victim, 'burning', 1, 'test');
    const dealtNear = tick(w, near, 3);
    expect(dealtNear).toBeCloseTo(3, 4);
    expect(near.armorShred).toBeCloseTo(3, 4);
    expect(far.armorShred).toBe(0);
  });

  it('the spread carries the effects, not the Burning itself', () => {
    // A stack that re-applied itself to its neighbours would cascade across the
    // horde and never stop; the neighbour burns for this tick only.
    const w = world();
    const victim = dummy(w, 10, 10);
    const near = dummy(w, 10.5, 10);
    applyDamageType(w, victim, 'burning', 1, 'test');
    tick(w, victim, 1);
    expect(dotStacks(near, 'burning')).toBe(0);
  });

  it('`burnSpread` widens the radius — the stat`s first reader', () => {
    const w = world();
    w.stats.add('pyromancer', 'burnSpread', 1);
    w.recomputeDerived();
    const victim = dummy(w, 10, 10);
    const outside = dummy(w, 11.8, 10);
    applyDamageType(w, victim, 'burning', 1, 'test');
    tick(w, victim, 1);
    // 1.8 tiles away: outside the authored r1, inside r1 + 1 point of spread.
    expect(outside.armorShred).toBeGreaterThan(0);
  });

  it('a burn-immune enemy takes neither the damage nor the shred', () => {
    const w = world();
    const e = variant(w, 'burnImmune');
    applyDamageType(w, e, 'burning', 1, 'test');
    expect(dotStacks(e, 'burning')).toBe(0);
    expect(tick(w, e, 3)).toBeCloseTo(0, 9);
    expect(e.armorShred).toBe(0);
  });

  it('stacks per application like Bleeding rather than refreshing (p10a)', () => {
    // Owner intent (SPEC-FINAL §3, Q65 confirmed): Burning stacks per
    // application, replacing the old maxStacks 1 / refresh-strongest rule —
    // two applications tick twice and shred twice.
    const w = world();
    const e = dummy(w, 10, 10, 0);
    applyDot(w, e, 'burning', 1, 3, 'first');
    applyDot(w, e, 'burning', 1, 3, 'second');
    expect(dotStacks(e, 'burning')).toBe(2);
    expect(tick(w, e, 3)).toBeCloseTo(6, 4);
    expect(e.armorShred).toBeCloseTo(6, 4);
  });

  it('is authored to share the 50-stack perf cap, same as Bleeding', () => {
    expect(row('burning').maxStacks).toBe(content.damageTypes.maxStacksPerEnemy);
    expect(row('burning').refresh).toBe('shortest');
  });
});

/* ---------------------------------------------------------------- Electric */

describe('§3 Electric — deals its damage in a small AoE (r0.8) inherently', () => {
  it('is authored as a hit with radius 0.8', () => {
    expect(row('electric').effect).toBe('hit');
    expect(row('electric').radius).toBe(0.8);
  });

  it('hits the target for its full damage', () => {
    const w = world();
    const e = dummy(w);
    const before = e.hp;
    applyDamageType(w, e, 'electric', 40, 'test');
    expect(before - e.hp).toBeCloseTo(40, 6);
  });

  it('splashes everything within r0.8 and nothing beyond it', () => {
    const w = world();
    const target = dummy(w, 10, 10);
    const near = dummy(w, 10.5, 10);
    const far = dummy(w, 11.2, 10);
    const nearBefore = near.hp;
    const farBefore = far.hp;
    applyDamageType(w, target, 'electric', 40, 'test');
    expect(nearBefore - near.hp).toBeCloseTo(40, 6);
    expect(far.hp).toBe(farBefore);
  });

  it('is armored damage, not an ailment', () => {
    const w = world();
    const e = dummy(w, 10, 10, 50);
    const before = e.hp;
    applyDamageType(w, e, 'electric', 100, 'test');
    expect(before - e.hp).toBeCloseTo(50, 6);
  });
});

/* -------------------------------------------------------- composite splits */

describe('§3 composite attacks — normal:electric = 1:1', () => {
  it('splits one attacks damage across the named shares', () => {
    // §3s own example. 1:1 on a 20-damage attack is 10 and 10, not 20 and 20.
    const w = world();
    const e = dummy(w);
    const before = e.hp;
    applyDamageSplit(w, e, { normal: 1, electric: 1 }, 20, 'test');
    expect(before - e.hp).toBeCloseTo(20, 6);
  });

  it('a 1:1.5 poison split pays 60% of the attack as Poison over 3 s', () => {
    // The Venom Spores upgraded ratio from §4, expressed in §3s terms:
    // 1.5/2.5 of 100 damage is 60, and Poison pays 120% of that.
    const w = world();
    const e = dummy(w);
    const before = e.hp;
    applyDamageSplit(w, e, { normal: 1, poison: 1.5 }, 100, 'test');
    expect(before - e.hp).toBeCloseTo(40, 6);
    expect(tick(w, e, 3)).toBeCloseTo(72, 5);
  });

  it('is deterministic regardless of how the ratio object was authored', () => {
    const w = world();
    const a = dummy(w, 10, 10);
    const b = dummy(w, 20, 10);
    const beforeA = a.hp;
    const beforeB = b.hp;
    applyDamageSplit(w, a, { normal: 1, electric: 1 }, 20, 'test');
    applyDamageSplit(w, b, { electric: 1, normal: 1 }, 20, 'test');
    expect(beforeA - a.hp).toBeCloseTo(beforeB - b.hp, 9);
  });
});

/* ---------------------------------------------------------------- statuses */

describe('§3 frost — −30% attack speed and move speed for 3 s', () => {
  it('is authored as −30% / −30% over 3 s', () => {
    const f = content.damageTypes.statuses.frost;
    expect(f.moveSpeed).toBeCloseTo(-0.3, 10);
    expect(f.attackSpeed).toBeCloseTo(-0.3, 10);
    expect(f.duration).toBe(3);
  });

  it('cuts move speed by exactly 30%', () => {
    const w = world();
    const e = dummy(w);
    const base = effectiveSpeed(w, e);
    applyFrost(w, e);
    expect(effectiveSpeed(w, e)).toBeCloseTo(base * 0.7, 9);
  });

  it('cuts attack speed by exactly 30% through the real update loop', () => {
    const w = world();
    const e = dummy(w);
    e.attackCooldown = 1;
    applyFrost(w, e);
    tick(w, e, 1);
    // One second of cooldown drained at 70% speed leaves 0.3 s.
    expect(e.attackCooldown).toBeCloseTo(0.3, 4);
  });

  it('wears off after 3 s', () => {
    const w = world();
    const e = dummy(w);
    const base = effectiveSpeed(w, e);
    applyFrost(w, e);
    tick(w, e, 3.1);
    expect(e.frostRemaining).toBeLessThanOrEqual(0);
    expect(effectiveSpeed(w, e)).toBeCloseTo(base, 9);
  });

  it('refreshes rather than shortening an existing frost', () => {
    const w = world();
    const e = dummy(w);
    applyFrost(w, e);
    tick(w, e, 1);
    applyFrost(w, e);
    expect(e.frostRemaining).toBeCloseTo(3, 6);
  });
});

describe('§3 frozen — cannot move for 3 s, +30% damage taken', () => {
  it('is authored as +30% damage taken over 3 s', () => {
    const f = content.damageTypes.statuses.frozen;
    expect(f.damageTaken).toBeCloseTo(0.3, 10);
    expect(f.duration).toBe(3);
  });

  it('stops the enemy dead', () => {
    const w = world();
    const e = dummy(w, 10, 10, 0, true);
    expect(effectiveSpeed(w, e)).toBeGreaterThan(0);
    applyFrozen(w, e);
    expect(effectiveSpeed(w, e)).toBe(0);
  });

  it('actually holds it in place through the real update loop', () => {
    const w = world();
    const e = dummy(w, 10, 10, 0, true);
    applyFrozen(w, e);
    tick(w, e, 2);
    expect(e.x).toBeCloseTo(10, 6);
    expect(e.y).toBeCloseTo(10, 6);
  });

  it('and lets go after 3 s', () => {
    const w = world();
    const e = dummy(w, 10, 10, 0, true);
    applyFrozen(w, e);
    tick(w, e, 3.5);
    expect(e.frozenRemaining).toBeLessThanOrEqual(0);
    expect(effectiveSpeed(w, e)).toBeGreaterThan(0);
  });

  it('adds exactly 30% to the damage it takes', () => {
    const w = world();
    const e = dummy(w);
    applyFrozen(w, e);
    expect(damageEnemy(w, e, 100, 'test')).toBeCloseTo(130, 6);
  });

  it('the +30% applies to ailment damage too — it is a status, not armor', () => {
    const w = world();
    const e = dummy(w);
    applyFrozen(w, e);
    applyDamageType(w, e, 'bleeding', 1, 'test');
    expect(tick(w, e, 3)).toBeCloseTo(3 * 1.3, 4);
  });

  it('stacks with negative armor rather than replacing it', () => {
    const w = world();
    const e = dummy(w, 10, 10, -50);
    applyFrozen(w, e);
    expect(damageEnemy(w, e, 100, 'test')).toBeCloseTo(100 * 1.5 * 1.3, 6);
  });
});

describe('§3 statuses — the rest of the contract', () => {
  it('both count as "chilled", which V2s chill stacks used to mean', () => {
    const w = world();
    const frosted = dummy(w, 10, 10);
    const frozen = dummy(w, 20, 10);
    const plain = dummy(w, 30, 10);
    applyFrost(w, frosted);
    applyFrozen(w, frozen);
    expect(isChilled(frosted)).toBe(true);
    expect(isChilled(frozen)).toBe(true);
    expect(isChilled(plain)).toBe(false);
  });

  it('a slow-immune enemy resists both (Q65)', () => {
    const w = world();
    const e = variant(w, 'slowImmune');
    applyFrost(w, e);
    applyFrozen(w, e);
    expect(e.frostRemaining).toBe(0);
    expect(e.frozenRemaining).toBe(0);
  });
});

/* ------------------------------------------------------- authored in /data */

describe('§3 types are addressable from /data, not only from code', () => {
  it('a tower attack can apply a type on hit, through the real fire loop', () => {
    // The route the M20 towers will use (arrow Bleeding @4, §4). Proven here on
    // the real path so the mechanism cannot ship unobservable the way m19a`s
    // `shredArmor` did.
    const w = world();
    const def = w.content.towerByKey.get('arrow_spire')!;
    const authored = { ...def, attack: { ...def.attack!, onHit: ['bleeding'] } };
    w.content.towerById.set(def.id, authored);
    w.content.towerByKey.set(def.key, authored);
    try {
      w.warden.x = 10;
      w.warden.y = 12;
      expect(buildTower(w, def.id, 10, 12).ok).toBe(true);
      const e = dummy(w, 10, 10);
      for (let i = 0; i < 120; i++) {
        w.rebuildBuckets();
        updateTowers(w, DT);
        if (dotStacks(e, 'bleeding') > 0) break;
      }
      expect(dotStacks(e, 'bleeding')).toBeGreaterThan(0);
    } finally {
      w.content.towerById.set(def.id, def);
      w.content.towerByKey.set(def.key, def);
    }
  });

  it('applies a status on hit by the same route', () => {
    const w = world();
    const e = dummy(w);
    applyOnHit(w, e, 'frost', 'test');
    expect(e.frostRemaining).toBeCloseTo(3, 6);
  });

  it('refuses a ratio row on hit — it has no magnitude without a trigger', () => {
    const w = world();
    const e = dummy(w);
    applyOnHit(w, e, 'poison', 'test');
    expect(dotStacks(e, 'poison')).toBe(0);
  });

  it('rejects an unknown onHit key at load', () => {
    // The real loader predicate, not a copy of it: no shipped tower authors an
    // `onHit` yet, so `loadContent`'s loop never runs against /data and a test
    // that reimplements the rule would stay green with both throws deleted.
    const dt = content.damageTypes;
    expect(() => validateOnHit(dt, 'nonsense', 'test')).toThrow(/unknown damage type/);
    // A ratio row has no magnitude without a triggering damage...
    expect(() => validateOnHit(dt, 'poison', 'test')).toThrow(/no flat dps/);
    expect(() => validateOnHit(dt, 'toxic', 'test')).toThrow(/no flat dps/);
    // ...and a hit row lands its own damage rather than riding along.
    expect(() => validateOnHit(dt, 'normal', 'test')).toThrow(/no flat dps/);
    expect(() => validateOnHit(dt, 'electric', 'test')).toThrow(/no flat dps/);
    // What §3 does allow on hit: the two flat-dps rows and both statuses.
    for (const k of ['bleeding', 'burning', 'frost', 'frozen']) {
      expect(() => validateOnHit(dt, k, 'test')).not.toThrow();
    }
  });
});

/* ------------------------------------------------- bookkeeping and the hash */

describe('§3 state is sim state (gate A11)', () => {
  it('a DoT stack changes the end-state hash', () => {
    const w = world();
    const e = dummy(w);
    const before = hashWorld(w);
    applyDamageType(w, e, 'bleeding', 1, 'test');
    expect(hashWorld(w)).not.toBe(before);
  });

  it('frost and frozen change the end-state hash', () => {
    const w = world();
    const e = dummy(w);
    const before = hashWorld(w);
    applyFrost(w, e);
    const frosted = hashWorld(w);
    expect(frosted).not.toBe(before);
    applyFrozen(w, e);
    expect(hashWorld(w)).not.toBe(frosted);
  });

  it('two stacks of the same type differ from one', () => {
    // `dots.length` alone would not catch a dropped refresh, so the hash walks
    // each stack.
    const w = world();
    const a = dummy(w, 10, 10);
    const one = (() => {
      applyDot(w, a, 'bleeding', 1, 5, 'x');
      return hashWorld(w);
    })();
    applyDot(w, a, 'bleeding', 1, 5, 'x');
    expect(hashWorld(w)).not.toBe(one);
  });

  it('reports outstanding DoT damage, which C10 will read', () => {
    const w = world();
    const e = dummy(w);
    applyDamageType(w, e, 'poison', 50, 'test');
    expect(dotOutstanding(e)).toBeCloseTo(60, 6);
    tick(w, e, 1);
    expect(dotOutstanding(e)).toBeCloseTo(40, 4);
  });
});

/* ------------------------------------------------------- degenerate inputs */

describe('§3 — degenerate inputs', () => {
  it('zero and negative damage install nothing', () => {
    const w = world();
    const e = dummy(w);
    applyDamageType(w, e, 'poison', 0, 'test');
    applyDamageType(w, e, 'toxic', -5, 'test');
    expect(e.dots.length).toBe(0);
  });

  it('a dead enemy takes no further ailment', () => {
    const w = world();
    const e = dummy(w);
    e.dead = true;
    applyDamageType(w, e, 'bleeding', 1, 'test');
    expect(tick(w, e, 5)).toBe(0);
  });

  it('an all-zero ratio deals nothing rather than dividing by zero', () => {
    const w = world();
    const e = dummy(w);
    const before = e.hp;
    expect(applyDamageSplit(w, e, { normal: 0, electric: 0 }, 100, 'test')).toBe(0);
    expect(e.hp).toBe(before);
  });

  it('a DoT can kill, and stops ticking when it does', () => {
    const w = world();
    const e = dummy(w);
    e.hp = 2;
    applyDamageType(w, e, 'bleeding', 1, 'test');
    tick(w, e, 5);
    expect(e.dead).toBe(true);
    expect(e.hp).toBeLessThanOrEqual(0);
  });
});

/**
 * The Pyromancer authors two stats. `burnSpread` got its first reader above;
 * `burnDamage` had one before m19c — V2's `applyBurn` multiplied by
 * `burnDamageMul` — and routing every DoT through one `applyDot` dropped it,
 * silently, because no test in 561 covered it. Regression test, not a feature.
 */
describe('§3 Burning — the Pyromancer`s `burnDamage` still scales it', () => {
  it('+15% burnDamage makes Burning deal 15% more over its 3 s', () => {
    const plain = world();
    const a = dummy(plain, 10, 10);
    applyDamageType(plain, a, 'burning', 1, 'test');
    tick(plain, a, 3);
    const base = 1e6 - a.hp;

    const pyro = world();
    pyro.stats.add('pyromancer', 'burnDamage', 0.15);
    pyro.recomputeDerived();
    const b = dummy(pyro, 10, 10);
    applyDamageType(pyro, b, 'burning', 1, 'test');
    tick(pyro, b, 3);

    expect(base).toBeCloseTo(3, 6);
    expect(1e6 - b.hp).toBeCloseTo(base * 1.15, 6);
  });

  it('scales Burning only, not the other DoT rows', () => {
    const w = world();
    w.stats.add('pyromancer', 'burnDamage', 0.15);
    w.recomputeDerived();
    const e = dummy(w, 10, 10);
    applyDamageType(w, e, 'bleeding', 1, 'test');
    tick(w, e, 5);
    expect(1e6 - e.hp).toBeCloseTo(5, 6);
  });

  it('does not scale the armor shred, which §3 states as a flat 1/s', () => {
    const w = world();
    w.stats.add('pyromancer', 'burnDamage', 0.15);
    w.recomputeDerived();
    const e = dummy(w, 10, 10);
    applyDamageType(w, e, 'burning', 1, 'test');
    tick(w, e, 3);
    expect(e.armorShred).toBeCloseTo(3, 6);
  });
});

/**
 * Two defects code review found in the first cut of m19c, both of the same
 * family as the `burnDamage` one above: a rule that is honoured on one path of
 * a mechanic and not on the other, with nothing in the suite driving the second
 * path. Regression tests, so neither can come back quietly.
 */
describe('§3 Burning — the spread honours the same rules the application does', () => {
  it('a burn-immune neighbour inside r1 takes neither the damage nor the shred', () => {
    const w = world();
    const victim = dummy(w, 10, 10);
    const immune = variant(w, 'burnImmune', 10.5, 10);
    const normal = dummy(w, 9.5, 10);
    applyDamageType(w, victim, 'burning', 1, 'test');
    tick(w, victim, 3);
    // The non-immune neighbour proves the spread reached that distance at all.
    expect(normal.armorShred).toBeCloseTo(3, 6);
    expect(1e6 - normal.hp).toBeCloseTo(3, 6);
    expect(immune.armorShred).toBe(0);
    expect(immune.hp).toBe(1e6);
  });
});

describe('§3 the shared 50-stack budget cannot starve a type out of existence', () => {
  it('Burning still lands on an enemy already carrying 50 Bleeding stacks', () => {
    const w = world();
    const e = dummy(w, 10, 10);
    for (let i = 0; i < 50; i++) applyDamageType(w, e, 'bleeding', 1, 'bleed');
    expect(dotStacks(e, 'bleeding')).toBe(50);

    applyDamageType(w, e, 'burning', 1, 'burn');
    expect(dotStacks(e, 'burning')).toBe(1);
    // And it is a real Burning: the shred gate C3 asks for actually accrues.
    tick(w, e, 1);
    expect(e.armorShred).toBeGreaterThan(0);
  });

  it('Poison too, and the enemy never holds more than the perf cap', () => {
    const w = world();
    const e = dummy(w, 10, 10);
    for (let i = 0; i < 50; i++) applyDamageType(w, e, 'bleeding', 1, 'bleed');
    applyDamageType(w, e, 'poison', 50, 'venom');
    expect(dotStacks(e, 'poison')).toBe(1);
    expect(e.dots.length).toBe(content.damageTypes.maxStacksPerEnemy);
  });

  it('the evicted stack is one of the saturating type, not the arriving one', () => {
    const w = world();
    const e = dummy(w, 10, 10);
    for (let i = 0; i < 50; i++) applyDamageType(w, e, 'bleeding', 1, 'bleed');
    applyDamageType(w, e, 'burning', 1, 'burn');
    expect(dotStacks(e, 'bleeding')).toBe(49);
    expect(dotStacks(e, 'burning')).toBe(1);
  });

  it('Bleeding still lands on an enemy already carrying 50 Burning stacks (p10a symmetry)', () => {
    // p10a made Burning the second row, after Bleeding, whose own cap equals
    // the shared budget — the mirror of the first test in this block, with
    // the saturating and arriving types swapped.
    const w = world();
    const e = dummy(w, 10, 10);
    for (let i = 0; i < 50; i++) applyDamageType(w, e, 'burning', 1, 'burn');
    expect(dotStacks(e, 'burning')).toBe(50);

    applyDamageType(w, e, 'bleeding', 1, 'bleed');
    expect(dotStacks(e, 'bleeding')).toBe(1);
    expect(dotStacks(e, 'burning')).toBe(49);
    expect(e.dots.length).toBe(content.damageTypes.maxStacksPerEnemy);
  });

  it('a type at its own cap still refreshes rather than evicting a bystander', () => {
    const w = world();
    const e = dummy(w, 10, 10);
    applyDamageType(w, e, 'poison', 10, 'venom');
    applyDamageType(w, e, 'poison', 10, 'venom');
    applyDamageType(w, e, 'poison', 10, 'venom');
    applyDamageType(w, e, 'bleeding', 1, 'bleed');
    // Poison's own maxStacks is 3, so a fourth application refreshes an
    // existing stack rather than reaching for the Bleeding stack next to it.
    applyDamageType(w, e, 'poison', 10, 'venom');
    expect(dotStacks(e, 'poison')).toBe(3);
    expect(dotStacks(e, 'bleeding')).toBe(1);
  });
});

/* --------------------------------------------- regressions from the review */

/**
 * Every test below is a defect the m19c review or QA pass found in the code
 * above, reproduced first and fixed after. They are grouped rather than filed
 * under their §3 row because what they have in common is the failure mode:
 * each one is invisible until a later milestone authors the content that
 * reaches it, which is exactly how m19a's `shredArmor` shipped dead.
 */
describe('§3 — regressions from the m19c review', () => {
  it('the saturating type does not take its slot back off the minority (Q69)', () => {
    // Found by review. Bleeding is the one row whose own cap *is* the shared
    // per-enemy cap, so it is always the type holding the budget open. Letting
    // it evict meant a bleeding enemy shed its Burning stack on the next arrow
    // — i.e. lost the armour shred — inside one attack interval, silently.
    const w = world();
    const e = dummy(w, 10, 10);
    for (let i = 0; i < 50; i++) applyDamageType(w, e, 'bleeding', 1, 'bleed');
    applyDamageType(w, e, 'burning', 1, 'burn');
    expect([dotStacks(e, 'bleeding'), dotStacks(e, 'burning')]).toEqual([49, 1]);

    applyDamageType(w, e, 'bleeding', 1, 'bleed');
    expect(dotStacks(e, 'burning')).toBe(1);
    expect(dotStacks(e, 'bleeding')).toBe(49);
    expect(e.dots.length).toBe(50);

    // And it stays true under sustained fire from both, which is what m20b's
    // arrow-@4 alongside a brazier actually looks like.
    for (let i = 0; i < 200; i++) applyDamageType(w, e, 'bleeding', 1, 'bleed');
    expect(dotStacks(e, 'burning')).toBe(1);
  });

  it('Electric pays its named target in full, however crowded the tile (QA)', () => {
    // Found by QA. The branch handed the whole job to applyAoE, which applies
    // the crowd falloff in bucket order — so the enemy the shot was aimed at
    // could be the 20th name on the list and take a fifth of its damage.
    const w = world();
    const crowd: Enemy[] = [];
    for (let i = 0; i < 20; i++) crowd.push(dummy(w, 10, 10));
    const target = crowd[crowd.length - 1];
    const before = target.hp;
    applyDamageType(w, target, 'electric', 100, 'test');
    expect(before - target.hp).toBeCloseTo(100, 6);
  });

  it('Electric pays a target the spatial index has never seen (QA)', () => {
    // Same cause, worse symptom: a burrower is skipped by rebuildBuckets
    // outright, and anything spawned after this tick's rebuild is absent too,
    // so the row dealt exactly zero and returned it.
    const w = world();
    dummy(w, 10, 10);
    const fresh = spawnEnemy(w, 'husk', 30, 10)!;
    fresh.hp = 1e6;
    fresh.speed = 0;
    // Deliberately no rebuildBuckets() — this is the stale-bucket case.
    const dealt = applyDamageType(w, fresh, 'electric', 100, 'test');
    expect(dealt).toBeCloseTo(100, 6);
  });

  it('Electric forwards the damage options it was given (QA)', () => {
    // pure and the two trait mitigations are orthogonal (Q60), but the radius
    // path built its options object and then dropped it on the floor.
    const w = world();
    // Far enough apart that neither is caught in the other's blast, or the
    // returned total would be the sum of both.
    const mk = (x: number): Enemy => {
      const e = spawnEnemy(w, 'bulwark', x, 10)!;
      e.hp = 1e6;
      e.speed = 0;
      w.rebuildBuckets();
      return e;
    };
    const shielded = mk(10);
    const bypassed = mk(25);
    expect(applyDamageType(w, shielded, 'electric', 100, 'test')).toBeCloseTo(70, 6);
    expect(applyDamageType(w, bypassed, 'electric', 100, 'test', { pure: true })).toBeCloseTo(100, 6);
  });

  it('a composite ratio is bit-identical however the object was authored (QA)', () => {
    // Found by QA. The dispatch loop was sorted but the weight sum was not, and
    // 0.1+0.2+0.3 !== 0.3+0.2+0.1 in floats — so two authorings of one ratio
    // produced different damage, different DoT dps, and different A11 hashes.
    // Strict equality, not toBeCloseTo: the old code passed toBeCloseTo.
    const w = world();
    const a = dummy(w, 10, 10);
    const b = dummy(w, 25, 10);
    const beforeA = a.hp;
    const beforeB = b.hp;
    applyDamageSplit(w, a, { normal: 0.1, electric: 0.2, toxic: 0.3 }, 100, 'test');
    applyDamageSplit(w, b, { toxic: 0.3, electric: 0.2, normal: 0.1 }, 100, 'test');
    expect(beforeA - a.hp).toBe(beforeB - b.hp);
    expect(a.dots.map((d) => [d.type, d.dps])).toEqual(b.dots.map((d) => [d.type, d.dps]));
  });

  it('a stretched duration still pays a ratio row its stated total (review)', () => {
    // §3 states Poison as a total, so a caller that doubles the duration must
    // halve the dps rather than pay 240% of the trigger.
    const w = world();
    const e = dummy(w);
    applyDamageType(w, e, 'poison', 50, 'test', { duration: 6 });
    expect(dotRemaining(e, 'poison')).toBeCloseTo(6, 6);
    expect(tick(w, e, 6)).toBeCloseTo(60, 5);
  });

  it('an onHit rider survives every attack shape a tower can fire (QA)', () => {
    // Found by QA by mutation: dropping the rider from fireTower's cone case
    // failed zero tests, because the only coverage built an arrow_spire.
    // One shipped tower per kind, each driven through the real fire loop.
    const byKind = new Map<string, string>();
    for (const t of content.towers.towers) {
      if (t.attack && !byKind.has(t.attack.kind)) byKind.set(t.attack.kind, t.key);
    }
    expect([...byKind.keys()].sort()).toEqual(['aura', 'chain', 'cone', 'lob', 'pierce', 'poison', 'single']);

    for (const [kind, key] of byKind) {
      const w = world();
      const def = w.content.towerByKey.get(key)!;
      const authored = { ...def, attack: { ...def.attack!, onHit: ['bleeding'] } };
      w.content.towerById.set(def.id, authored);
      w.content.towerByKey.set(def.key, authored);
      try {
        w.warden.x = 10;
        w.warden.y = 12;
        expect(buildTower(w, def.id, 10, 12).ok).toBe(true);
        // Outside the mortar's 4-tile dead zone and inside every tower's range.
        const gap = Math.max((def.attack!.minRange ?? 0) + 1, 2);
        const e = dummy(w, 10, 12 - gap);
        for (let i = 0; i < 600 && dotStacks(e, 'bleeding') === 0; i++) {
          w.rebuildBuckets();
          updateTowers(w, DT);
          updateProjectiles(w, DT);
        }
        expect(kind + ':' + (dotStacks(e, 'bleeding') > 0)).toBe(kind + ':true');
      } finally {
        w.content.towerById.set(def.id, def);
        w.content.towerByKey.set(def.key, def);
      }
    }
  });

  it('frozen roots the final boss, which moves itself (review)', () => {
    // Found by review. The Warden-Eater's charge writes its own position and
    // never reaches moveEnemy, so §3's "cannot move" was false for the one
    // enemy it matters most against. warden_eater is not slowImmune.
    const w = world();
    const boss = spawnEnemy(w, 'warden_eater', 20, 10)!;
    boss.bossAction = 2; // CHARGING
    boss.bossTimer = 1;
    boss.chargeVx = -1;
    boss.chargeVy = 0;
    w.rebuildBuckets();

    applyFrozen(w, boss);
    expect(boss.frozenRemaining).toBeGreaterThan(0);
    const x = boss.x;
    const y = boss.y;
    run(w, 0.5);
    expect(boss.x).toBe(x);
    expect(boss.y).toBe(y);

    // ...and it charges again the moment the ice lets go.
    boss.frozenRemaining = 0;
    boss.bossAction = 2;
    boss.bossTimer = 1;
    run(w, 0.5);
    expect(boss.x).toBeLessThan(x);
  });

  it('overlapping Burning stacks compound on the enemies between them (review)', () => {
    // Not a defect — §3 says both effects are AoE around *the victim*, so three
    // adjacent victims each pay their own tick plus their two neighbours'. It
    // is pinned here because it makes Burning superlinear in crowd density
    // (QUESTIONS Q71) and the M27 pass has to see the number, not discover it.
    const w = world();
    const es = [dummy(w, 10, 10), dummy(w, 10.4, 10), dummy(w, 10.8, 10)];
    for (const e of es) applyDot(w, e, 'burning', 1, 3, 'brazier');
    const dealt = tickAll(w, es, 1);
    for (const d of dealt) expect(d).toBeCloseTo(3, 4);
    for (const e of es) expect(e.armorShred).toBeCloseTo(3, 4);
  });

  it('splash to a neighbour sums every same-type stack once per tick, not once per stack (code review on p10a)', () => {
    // p10a let one enemy carry dozens of concurrent Burning stacks. Querying
    // and splashing once *per stack* would have multiplied the neighbour
    // query and neighbour damage by stack count; the aggregated magnitude
    // must still equal the plain sum of every live stack's dps/shred.
    const w = world();
    const e = dummy(w, 10, 10);
    const near = dummy(w, 10.5, 10);
    applyDot(w, e, 'burning', 1, 3, 'first');
    applyDot(w, e, 'burning', 2, 3, 'second');
    expect(dotStacks(e, 'burning')).toBe(2);
    const dealt = tick(w, near, 1);
    expect(dealt).toBeCloseTo(3, 4);
    expect(near.armorShred).toBeCloseTo(2, 4);
  });

  it('a strongest-refresh takes the higher dps and the longer timer (QA)', () => {
    // V2's original burn rule. No shipped row uses `refresh: 'strongest'`
    // after p10a flipped Burning to per-application stacking, but the engine
    // branch stays generic (CLAUDE.md's "content is data" rule) for a future
    // row that wants refresh-over-stack — driven here against a content doc
    // with Burning's own `refresh` authored back to 'strongest', not against
    // shipped content, so the branch keeps real coverage rather than going dark.
    const strongestBurn = {
      ...content.damageTypes,
      types: content.damageTypes.types.map((t) =>
        t.key === 'burning' ? { ...t, maxStacks: 1, refresh: 'strongest' as const } : t,
      ),
    };
    const w = new World(cfg(), loadContent({ damageTypes: strongestBurn }));
    w.gold = 100000;
    const e = dummy(w);
    applyDot(w, e, 'burning', 1, 30, 'weak-long');
    applyDot(w, e, 'burning', 50, 0.1, 'strong-short');
    expect(dotStacks(e, 'burning')).toBe(1);
    expect(e.dots[0].dps).toBe(50);
    expect(e.dots[0].remaining).toBeCloseTo(30, 6);
  });

  it('ailment ticks do not spend the frame fx budget (review)', () => {
    // World.emit keeps 512 events a frame and drops the rest. A burning horde
    // bills every carrier *and* its neighbours every tick, which starved the
    // buffer of the shots, impacts and deaths the renderer needs.
    const w = world();
    const es = [dummy(w, 10, 10), dummy(w, 10.4, 10), dummy(w, 10.8, 10)];
    for (const e of es) applyDot(w, e, 'burning', 1, 3, 'brazier');
    w.fx.length = 0;
    run(w, 1);
    // fb005: a non-dot hit's fx kind now carries its §3 type (`hit:normal`,
    // `hit:electric`, …) rather than a bare 'hit' — match on the prefix.
    expect(w.fx.filter((f) => f.k.startsWith('hit:')).length).toBe(0);
    // A normal hit still sparks — this is about dots, not about the buffer.
    damageEnemy(w, es[0], 5, 'test');
    expect(w.fx.filter((f) => f.k === 'hit:normal').length).toBe(1);
  });
});
