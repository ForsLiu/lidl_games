/**
 * Gate C3 (SPEC-V3 §12): armour math.
 *
 *   +99 → 99% reduction; +150 input clamps to 99; −90 → ×1.9 damage taken;
 *   DoTs ignore armour except Burning's shred lowers it.
 *
 * The v0.2 curve was `armor / (armor + 50)`: it saturated instead of capping,
 * had no negative branch at all, and every consumer read it through
 * `derived.damageReduction`. So this file pins the pure function, both damage
 * entry points (Warden and enemy), and the shred that §3's Burning will use —
 * a mutation in any one of the three must turn something red here.
 */

import { describe, expect, it } from 'vitest';

import { BASE, armorReduction, damageTakenMul, effectiveArmor } from '../src/sim/stats';
import { damageWarden, wardenArmor } from '../src/sim/run';
import {
  damageWarden as handlerDamageWarden,
  damageEnemy,
  enemyArmor,
  makeEnemy,
  shredArmor,
  spawnEnemy,
  updateEnemies,
} from '../src/sim/enemies';
import { hashWorld } from '../src/sim/run';
import { EnemySchema } from '../src/sim/content';
import enemiesRaw from '../data/enemies.json';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

/** A world with the Warden parked out of harm's way and no i-frames pending. */
function world(armor = 0): World {
  const w = new World(cfg());
  w.stats.add('test', 'armor', armor);
  w.recomputeDerived();
  w.warden.hp = w.derived.maxHp;
  w.warden.dashIFrames = 0;
  return w;
}

function hit(w: World, amount: number, opts: { dot?: boolean } = {}): number {
  const before = w.warden.hp;
  damageWarden(w, amount, opts);
  return before - w.warden.hp;
}

describe('C3 — armour is flat points as percent', () => {
  it('authors the spec cap and Q44 floor in data', () => {
    // The gate names +99 and Q44 names −100; if either constant is re-authored
    // the rule below still holds but the gate no longer measures what it says.
    expect(BASE.armorCap).toBe(99);
    expect(BASE.armorFloor).toBe(-100);
  });

  it('maps points to reduction one-for-one, and clamps only at the cap', () => {
    for (const points of [0, 1, 17, 50, 98, BASE.armorCap]) {
      expect(armorReduction(points)).toBeCloseTo(points / 100, 10);
      expect(damageTakenMul(points)).toBeCloseTo(1 - points / 100, 10);
    }
  });

  it('+99 armour is 99% reduction', () => {
    expect(armorReduction(99)).toBeCloseTo(0.99, 10);
    expect(damageTakenMul(99)).toBeCloseTo(0.01, 10);
  });

  it('+150 clamps to 99 and never reaches immunity', () => {
    expect(effectiveArmor(150)).toBe(BASE.armorCap);
    expect(armorReduction(150)).toBeCloseTo(0.99, 10);
    expect(armorReduction(1e9)).toBeCloseTo(0.99, 10);
    // The point of a cap rather than a saturating curve: 100 damage still lands.
    expect(damageTakenMul(1e9)).toBeGreaterThan(0);
  });

  it('−90 armour is ×1.9 damage taken, and negatives scale linearly', () => {
    expect(damageTakenMul(-90)).toBeCloseTo(1.9, 10);
    expect(damageTakenMul(-25)).toBeCloseTo(1.25, 10);
    expect(damageTakenMul(-1)).toBeCloseTo(1.01, 10);
  });

  it('floors at −100 (Q44) so stacked Burning cannot pass ×2', () => {
    expect(effectiveArmor(-100)).toBe(BASE.armorFloor);
    expect(effectiveArmor(-4000)).toBe(BASE.armorFloor);
    expect(damageTakenMul(-4000)).toBeCloseTo(2, 10);
  });
});

describe('C3 — the Warden defends with it', () => {
  it('takes reduced damage at positive armour', () => {
    const w = world(60);
    expect(wardenArmor(w)).toBe(60);
    expect(hit(w, 50)).toBeCloseTo(50 * 0.4, 6);
  });

  it('takes extra damage at negative armour', () => {
    const w = world(-90);
    expect(hit(w, 50)).toBeCloseTo(50 * 1.9, 6);
  });

  it('takes exactly the dealt amount at zero armour', () => {
    const w = world(0);
    expect(hit(w, 37)).toBeCloseTo(37, 6);
  });

  it('never divides by the old armorK curve', () => {
    // 20 armour is 20% off now and 28.6% off under the old `armor/(armor+50)`
    // curve. Picked because the two formulas disagree there — at 0 and at 50
    // they agree, so a reverted implementation would pass those inputs.
    const w = world(20);
    expect(hit(w, 100)).toBeCloseTo(80, 6);
    expect(hit(w, 100)).not.toBeCloseTo(100 * (1 - 20 / 70), 2);
  });

  it('ignores armour for ailment damage, in both directions', () => {
    const armoured = world(75);
    expect(hit(armoured, 40, { dot: true })).toBeCloseTo(40, 6);
    const shredded = world(-50);
    expect(hit(shredded, 40, { dot: true })).toBeCloseTo(40, 6);
  });

  it('subtracts shred from the sheet value', () => {
    const w = world(30);
    w.warden.armorShred = 120;
    expect(wardenArmor(w)).toBe(-90);
    expect(hit(w, 10)).toBeCloseTo(19, 6);
  });
});

describe('C3 — enemies defend with it', () => {
  function husk(w: World, armor: number) {
    const e = spawnEnemy(w, 'husk', 10, 10);
    expect(e).not.toBeNull();
    e!.hp = 1e6;
    e!.maxHp = 1e6;
    e!.armor = armor;
    return e!;
  }

  it('reduces normal damage by the enemy armour', () => {
    const w = world();
    const e = husk(w, 40);
    expect(damageEnemy(w, e, 100, 'test')).toBeCloseTo(60, 6);
  });

  it('amplifies normal damage at negative armour', () => {
    const w = world();
    const e = husk(w, -50);
    expect(damageEnemy(w, e, 100, 'test')).toBeCloseTo(150, 6);
  });

  it('leaves ailment damage alone', () => {
    const w = world();
    const e = husk(w, 80);
    expect(damageEnemy(w, e, 100, 'test', { dot: true })).toBeCloseTo(100, 6);
  });

  it('Burning-style shred lowers armour cumulatively and is uncapped below zero', () => {
    const w = world();
    const e = husk(w, 10);
    for (let i = 0; i < 3; i++) shredArmor(e, 1);
    expect(enemyArmor(e)).toBe(7);
    expect(damageEnemy(w, e, 100, 'test')).toBeCloseTo(93, 6);

    shredArmor(e, 60);
    expect(enemyArmor(e)).toBe(-53);
    expect(damageEnemy(w, e, 100, 'test')).toBeCloseTo(153, 6);
  });

  it('spawns with zero armour until the roster authors it', () => {
    const w = world();
    const e = spawnEnemy(w, 'husk', 10, 10)!;
    expect(e.armor).toBe(0);
    expect(e.armorShred).toBe(0);
    expect(damageEnemy(w, e, 5, 'test')).toBeCloseTo(5, 6);
  });

  it('`pure` bypasses trait mitigation but NOT armour', () => {
    // The two flags are orthogonal on purpose: if `pure` also skipped armour,
    // `dot` would be unobservable, because every DoT caller passes both.
    const w = world();
    const e = husk(w, 90);
    expect(damageEnemy(w, e, 100, 'test', { pure: true })).toBeCloseTo(10, 6);
  });
});

/**
 * The clauses above are all reachable by calling a function directly. These are
 * the ones that were shipped as unobservable the first time round — code review
 * and QA each independently found that deleting the wiring left the whole suite
 * green — so each test here drives the real path rather than the primitive.
 */
describe('C3 — the wiring, not just the arithmetic', () => {
  function armouredHusk(w: World, armor: number) {
    const e = spawnEnemy(w, 'husk', 10, 10)!;
    e.hp = 1e6;
    e.maxHp = 1e6;
    e.armor = armor;
    return e;
  }

  it('the burn tick ignores armour through the real update loop', () => {
    // Fails if `dot: true` is dropped from the burn tick: at −90 armour the
    // same burn would deal ×1.9. `pure` alone no longer covers this.
    const w = world();
    const e = armouredHusk(w, -90);
    e.dots.push({ type: 'burning', remaining: 5, dps: 10, source: 'test' });
    const before = e.hp;
    updateEnemies(w, 1 / 60);
    expect(before - e.hp).toBeCloseTo(10 / 60, 9);
  });

  it('the poison tick ignores armour through the real update loop', () => {
    const w = world();
    const e = armouredHusk(w, 80);
    e.dots.push({ type: 'poison', remaining: 5, dps: 12, source: 'test' });
    const before = e.hp;
    updateEnemies(w, 1 / 60);
    expect(before - e.hp).toBeCloseTo(12 / 60, 9);
  });

  it('an ordinary hit on the same enemy does NOT ignore armour', () => {
    // The control for the two above: if armour were skipped everywhere they
    // would pass for the wrong reason.
    const w = world();
    const e = armouredHusk(w, 80);
    expect(damageEnemy(w, e, 100, 'test')).toBeCloseTo(20, 6);
  });

  it('reads armour off the enemy def, so the roster can author it', () => {
    // The only route from EnemySchema.armor into the sim. Deleting `def.armor ??`
    // from makeEnemy left every other test green.
    const w = world();
    const base = w.content.enemyByKey.get('husk')!;
    const e = makeEnemy(w, { ...base, armor: 40 }, 10, 10);
    expect(e.armor).toBe(40);
    w.addEnemy(e);
    e.hp = 1e6;
    expect(damageEnemy(w, e, 100, 'test')).toBeCloseTo(60, 6);
  });

  it('keeps `armor` through schema parsing', () => {
    const raw = enemiesRaw.enemies.find((e) => e.key === 'husk')!;
    const parsed = EnemySchema.parse({ ...raw, armor: 40 });
    expect(parsed.armor).toBe(40);
    expect(EnemySchema.parse(raw).armor).toBeUndefined();
  });

  it('forwards `dot` through the late-bound Warden damage handler', () => {
    // Enemies, the boss and ground areas can only reach the Warden through this
    // indirection. Before the fix its signature had no `opts`, so every §3 DoT
    // would have silently arrived armoured.
    const w = world(75);
    const before = w.warden.hp;
    handlerDamageWarden(w, 40, { dot: true });
    expect(before - w.warden.hp).toBeCloseTo(40, 6);

    w.warden.hp = w.derived.maxHp;
    handlerDamageWarden(w, 40);
    expect(w.derived.maxHp - w.warden.hp).toBeCloseTo(10, 6);
  });
});

describe('C3 — the new state is hashed (gate A11)', () => {
  // A11 compares two replays in the same build, so a field can be dropped from
  // `hashWorld` without any test noticing. These pin the two new ones.
  it('Warden shred changes the end-state hash', () => {
    const w = world();
    const before = hashWorld(w);
    w.warden.armorShred = 7;
    expect(hashWorld(w)).not.toBe(before);
  });

  it('enemy shred changes the end-state hash', () => {
    const w = world();
    const e = spawnEnemy(w, 'husk', 10, 10)!;
    const before = hashWorld(w);
    shredArmor(e, 5);
    expect(hashWorld(w)).not.toBe(before);
  });

  it('enemy armour itself changes the end-state hash', () => {
    // `Enemy.armor` is writable sim state, not just a cached def value.
    const w = world();
    const e = spawnEnemy(w, 'husk', 10, 10)!;
    const before = hashWorld(w);
    e.armor = 40;
    expect(hashWorld(w)).not.toBe(before);
  });
});

describe('C3 — degenerate inputs', () => {
  it('NaN armour clamps to zero rather than poisoning HP', () => {
    // `Math.min(cap, Math.max(floor, NaN))` is NaN, and an enemy whose hp is NaN
    // never satisfies `hp <= 0` — an unkillable enemy.
    expect(effectiveArmor(NaN)).toBe(0);
    const w = world();
    const e = spawnEnemy(w, 'husk', 10, 10)!;
    e.armor = NaN;
    damageEnemy(w, e, 100, 'test');
    expect(Number.isFinite(e.hp)).toBe(true);
  });

  it('infinite armour clamps to the cap and floor', () => {
    expect(effectiveArmor(Infinity)).toBe(BASE.armorCap);
    expect(effectiveArmor(-Infinity)).toBe(BASE.armorFloor);
  });

  it('shred on a dead enemy is inert', () => {
    const w = world();
    const e = spawnEnemy(w, 'husk', 10, 10)!;
    e.dead = true;
    shredArmor(e, 50);
    expect(damageEnemy(w, e, 100, 'test')).toBe(0);
  });

  it('zero and negative damage stay zero at every armour value', () => {
    const w = world();
    const e = spawnEnemy(w, 'husk', 10, 10)!;
    e.armor = -90;
    expect(damageEnemy(w, e, 0, 'test')).toBe(0);
    expect(damageEnemy(w, e, -5, 'test')).toBe(0);
  });

  it('BACKLOG b008: non-finite amount (NaN, +Infinity, -Infinity) is dropped, not applied — hp, damageTotal and damageByWeapon stay untouched', () => {
    // Before b008, `e.dead || amount <= 0` did not catch NaN (`NaN <= 0` is
    // false) or +Infinity (`Infinity <= 0` is false): a NaN hit set `e.hp` to
    // NaN forever (permanently unkillable, since `hp <= 0` is then also
    // always false) and poisoned `w.damageTotal`; +Infinity killed cleanly
    // but left `w.damageTotal` at Infinity. One case per sign, per BACKLOG b008.
    for (const amount of [NaN, Infinity, -Infinity]) {
      const w = world();
      const e = spawnEnemy(w, 'husk', 10, 10)!;
      const hpBefore = e.hp;
      expect(damageEnemy(w, e, amount, 'test'), `amount=${amount}`).toBe(0);
      expect(e.hp, `amount=${amount}`).toBe(hpBefore);
      expect(e.dead, `amount=${amount}`).toBe(false);
      expect(w.damageTotal, `amount=${amount}`).toBe(0);
      expect(w.damageByWeapon.test, `amount=${amount}`).toBeUndefined();
    }
  });

  it('BACKLOG b043: non-finite amount (NaN, +Infinity, -Infinity) into damageWarden is dropped, not applied — hp stays untouched', () => {
    // Mirrors b008's damageEnemy guard: damageWarden had no `Number.isFinite`
    // check at all, so a NaN amount pinned `wd.hp` at NaN forever (`hp <= 0`
    // then always false) and fed NaN into `storeWrath` unguarded.
    for (const amount of [NaN, Infinity, -Infinity]) {
      const w = world();
      const hpBefore = w.warden.hp;
      damageWarden(w, amount);
      expect(w.warden.hp, `amount=${amount}`).toBe(hpBefore);
    }
  });
});

describe('C3 — shred does not outlive the body', () => {
  // Q60. Nothing writes Warden shred until m19c, so this pins the intent now
  // rather than discovering it as an invisible −60 armour after a free respawn.
  it('clears on the Act I reform', () => {
    const w = world();
    w.warden.armorShred = 60;
    damageWarden(w, 1e9);
    expect(w.warden.hp).toBeGreaterThan(0);
    expect(w.warden.armorShred).toBe(0);
  });

  it('clears on Second Wind', () => {
    const w = new World(cfg());
    w.stats.add('test', 'secondWind', 1);
    w.recomputeDerived();
    w.warden.hp = w.derived.maxHp;
    w.warden.dashIFrames = 0;
    w.phase = 'act2';
    w.warden.armorShred = 60;
    damageWarden(w, 1e9);
    expect(w.warden.secondWindUsed).toBe(true);
    expect(w.warden.hp).toBeGreaterThan(0);
    expect(w.warden.armorShred).toBe(0);
  });
});
