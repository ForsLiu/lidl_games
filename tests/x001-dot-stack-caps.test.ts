/**
 * x001 — SPEC-FINAL §3's per-type DoT stack caps.
 *
 * §3, verbatim:
 *
 *   Poison | DoT totalling 120% of the triggering damage over 3 s; cap 3
 *           stacks, refresh shortest ⚖.
 *   Toxic  | DoT totalling 180% over 9 s; cap 3 stacks ⚖.
 *
 * SPEC-V3 §3 gave neither row a cap and defaulted to "independent stacks", so
 * raising Poison to the shared 50-stack budget was a legal reading then and is
 * not one now (MIGRATION §8.4.1, Q87). Nothing on `master` reads 50 — this file
 * is a **pin**, not a fix: it states the caps where a reader will find them so
 * the next attempt to raise one argues with §3 instead of with nobody.
 *
 * Three things are pinned, because there are three ways to lose the cap:
 *  1. the authored row (`/data`),
 *  2. the behaviour the row is supposed to produce (a fourth application inside
 *     the window refreshes rather than adds, and the output is bounded), and
 *  3. the `maxStacks` **override** a call site may pass, which until this item
 *     could exceed the row's own cap and reach the shared 50 budget. Every
 *     shipped call site passes exactly 3, so clamping it is a no-op today —
 *     which is the point: the hole is closed while it is still empty.
 *
 * Numbers are read from `/data` and then checked against §3's literal, rather
 * than re-typed into the assertion alone (the m19c rule).
 */

import { describe, expect, it } from 'vitest';

import {
  applyDot,
  applyPoison,
  dotOutstanding,
  dotRemaining,
  dotStacks,
  spawnEnemy,
  updateEnemies,
} from '../src/sim/enemies';
import { applyDamageType } from '../src/sim/damagetypes';
import { World } from '../src/sim/world';
import type { Enemy } from '../src/sim/types';
import { cfg } from './helpers';

const DT = 1 / 60;

function world(): World {
  const w = new World(cfg());
  w.gold = 100000;
  return w;
}

/** Rooted so a totals assertion cannot turn into a movement assertion. */
function dummy(w: World, x = 10, y = 10): Enemy {
  const e = spawnEnemy(w, 'husk', x, y)!;
  e.hp = 1e6;
  e.maxHp = 1e6;
  e.speed = 0;
  w.rebuildBuckets();
  return e;
}

function run(w: World, seconds: number): void {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) {
    w.rebuildBuckets();
    updateEnemies(w, DT);
  }
}

/** Damage a DoT actually pays over `seconds`, read off the enemy's HP. */
function paid(w: World, e: Enemy, seconds: number): number {
  return paidBoth(w, [e], seconds)[0];
}

/** The same for several enemies sharing one world, over a single run. */
function paidBoth(w: World, es: Enemy[], seconds: number): number[] {
  const before = es.map((e) => e.hp);
  run(w, seconds);
  return es.map((e, i) => before[i] - e.hp);
}

function row(w: World, key: string) {
  const def = w.content.damageTypeByKey.get(key);
  if (!def) throw new Error(`no damage type ${key}`);
  return def;
}

describe('x001 §3: Poison and Toxic cap at 3 stacks', () => {
  it('is authored as 3 on both rows, and Poison refreshes shortest', () => {
    const w = world();
    expect(row(w, 'poison').maxStacks).toBe(3);
    expect(row(w, 'poison').refresh).toBe('shortest');
    expect(row(w, 'toxic').maxStacks).toBe(3);
    // §3's magnitudes, pinned here so a /data drift is named rather than
    // surfacing as a damage delta in the bounding tests below.
    expect(row(w, 'poison').ratio).toBe(1.2);
    expect(row(w, 'poison').duration).toBe(3);
    expect(row(w, 'toxic').ratio).toBe(1.8);
    expect(row(w, 'toxic').duration).toBe(9);
  });

  it('a fourth Poison application inside the window refreshes, it does not add', () => {
    const w = world();
    const e = dummy(w);
    for (let i = 0; i < 4; i++) applyDamageType(w, e, 'poison', 50, 'test');
    expect(dotStacks(e, 'poison')).toBe(3);
  });

  it('refreshing the shortest stack is what happens, not overwriting the longest', () => {
    const w = world();
    const e = dummy(w);
    applyDamageType(w, e, 'poison', 50, 'test');
    run(w, 1); // this stack now has 2 s left; the next two arrive at full 3 s
    applyDamageType(w, e, 'poison', 50, 'test');
    applyDamageType(w, e, 'poison', 50, 'test');
    expect(dotStacks(e, 'poison')).toBe(3);

    // The fourth lands on the 2 s stack — the shortest — and resets it to 3 s.
    // If the code took the longest instead, the shortest would still be the
    // 2 s one and `dotRemaining` would be unchanged at 3.
    applyDamageType(w, e, 'poison', 50, 'test');
    expect(dotStacks(e, 'poison')).toBe(3);
    const remainings = e.dots.filter((d) => d.type === 'poison').map((d) => d.remaining);
    expect(Math.min(...remainings)).toBeCloseTo(3, 6);
    expect(dotRemaining(e, 'poison')).toBeCloseTo(3, 6);
  });

  it('bounds the damage: ten applications pay what three do, not what ten would', () => {
    const w = world();
    const three = dummy(w, 10, 10);
    const ten = dummy(w, 20, 10);
    for (let i = 0; i < 3; i++) applyDamageType(w, three, 'poison', 50, 'test');
    for (let i = 0; i < 10; i++) applyDamageType(w, ten, 'poison', 50, 'test');
    // Both live in the same world, so they are measured across *one* run —
    // ticking for the first enemy would expire the second's stacks before it
    // was read, and the assertion would pass on an empty enemy.
    const [a, b] = paidBoth(w, [three, ten], 3);
    // 3 stacks x 120% of 50 = 180 over 3 s, and the cap is the whole reason the
    // second enemy does not take 600.
    expect(a).toBeCloseTo(180, 4);
    expect(b).toBeCloseTo(180, 4);
  });

  it('Toxic caps at 3 too, over its own 9 s window', () => {
    const w = world();
    const e = dummy(w);
    for (let i = 0; i < 8; i++) applyDamageType(w, e, 'toxic', 50, 'test');
    expect(dotStacks(e, 'toxic')).toBe(3);
    // 3 x 180% of 50 = 270 over 9 s.
    expect(paid(w, e, 9)).toBeCloseTo(270, 3);
  });

  it('a caller cannot raise a type past its own §3 cap by passing maxStacks', () => {
    // The third way to lose the cap, and the one `/data` does not guard: until
    // x001, `applyDot` clamped an override only to the shared 50-stack budget,
    // so a call site could hold 50 Poison stacks on one enemy while `/data`
    // said 3. Every shipped caller passes exactly 3 (combat.ts twice,
    // weapons.ts once), so this is a no-op on today's content by construction.
    const w = world();
    const e = dummy(w);
    for (let i = 0; i < 12; i++) applyDot(w, e, 'poison', 20, 3, 'test', { maxStacks: 50 });
    expect(dotStacks(e, 'poison')).toBe(3);
    expect(dotOutstanding(e)).toBeCloseTo(3 * 20 * 3, 4);
  });

  it('an override *below* the cap still binds — clamping is one-way', () => {
    const w = world();
    const e = dummy(w);
    for (let i = 0; i < 5; i++) applyPoison(w, e, 20, 3, 1, 'test');
    expect(dotStacks(e, 'poison')).toBe(1);
  });
});
