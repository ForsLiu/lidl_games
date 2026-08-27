/**
 * p-core-e — SPEC-FINAL §5.5's Time, steps 3-5 (gate G21). `p-core-b` gave
 * Time steps 1-2 (gold/s, tower regen + healing received) real numbers,
 * folded through the existing TD/VS speed effects Time already had. This
 * item is the first to give Time's decay aura real gameplay: a TD-only,
 * armor-ignoring HP/s drain around the Core, `1 × mult^(5 - ring)` per ring,
 * ring 1 = the band touching the Core's own footprint. Step 3 buys the aura
 * at r5/mult 1.2 (§5.5's own worked example: r5→r4 1/s, r4→r3 1.2/s, r3→r2
 * 1.44/s, continuing r2→r1 1.728/s, r1→r0 2.0736/s); step 4 extends the
 * cutoff to r10 with the same fixed formula (Q115: read as "same formula,
 * wider reach," not "re-derive around a new base of 10," since the latter
 * would double every already-covered ring's rate the moment step 4 is
 * bought); step 5 raises the multiplier 1.2 → 1.5.
 */

import { describe, expect, it } from 'vitest';

import { CORE_H, CORE_W, CORE_X, CORE_Y } from '../src/sim/grid';
import { loadContent } from '../src/sim/content';
import { computeCoreState, updateTimeDecay, upgradeCore } from '../src/sim/cores';
import { spawnEnemy } from '../src/sim/enemies';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const DT = 1 / 60;
const content = loadContent();

function timeWorld(): World {
  return new World(cfg({ core: 'time' }), content);
}

/** Ticks `updateTimeDecay` for `seconds` of sim time, buckets refreshed every tick like `Run.step` does. */
function tickDecay(w: World, seconds: number): void {
  const ticks = Math.round(seconds / DT);
  for (let i = 0; i < ticks; i++) {
    w.rebuildBuckets();
    updateTimeDecay(w, DT);
  }
}

/** Spawns an enemy `edgeDist` tiles from the Core footprint's nearest edge, due south, with ample HP/armor. */
function spawnAtEdgeDist(w: World, edgeDist: number, hp = 100000, armor = 50): ReturnType<typeof spawnEnemy> {
  const e = spawnEnemy(w, 'husk', CORE_X + CORE_W / 2, CORE_Y + CORE_H + edgeDist)!;
  e.hp = hp;
  e.maxHp = hp;
  e.armor = armor;
  return e;
}

describe('p-core-e — Time decay steps fold correctly (no double-counting)', () => {
  it('not bought (steps 1-2 only): decayRadius is 0', () => {
    expect(computeCoreState(content, 'time', 0).decayRadius).toBe(0);
    expect(computeCoreState(content, 'time', 1).decayRadius).toBe(0);
    expect(computeCoreState(content, 'time', 2).decayRadius).toBe(0);
  });

  it('step 3 buys the aura at r5, mult 1.2', () => {
    const st = computeCoreState(content, 'time', 3);
    expect(st.decayRadius).toBe(5);
    expect(st.decayMult).toBeCloseTo(1.2, 9);
  });

  it('step 4 extends the cutoff to r10, mult unchanged at 1.2', () => {
    const st = computeCoreState(content, 'time', 4);
    expect(st.decayRadius).toBe(10);
    expect(st.decayMult).toBeCloseTo(1.2, 9);
  });

  it('step 5 raises the multiplier to 1.5, radius unchanged at 10', () => {
    const st = computeCoreState(content, 'time', 5);
    expect(st.decayRadius).toBe(10);
    expect(st.decayMult).toBeCloseTo(1.5, 9);
  });

  it('re-querying an earlier step after a later one must not leak state', () => {
    expect(computeCoreState(content, 'time', 5).decayRadius).toBe(10);
    expect(computeCoreState(content, 'time', 3).decayRadius).toBe(5);
    expect(computeCoreState(content, 'time', 2).decayRadius).toBe(0);
  });

  it('a bought step is live immediately through the shared upgradeCore rule', () => {
    const w = timeWorld();
    w.gold = 1e6;
    expect(upgradeCore(w)).toBe(true); // step 1
    expect(upgradeCore(w)).toBe(true); // step 2
    expect(upgradeCore(w)).toBe(true); // step 3
    expect(w.core.decayRadius).toBe(5);
    expect(w.core.decayMult).toBeCloseTo(1.2, 9);
  });
});

describe('p-core-e — the r5 ring table, verbatim (G21 worked example)', () => {
  it('r5->r4: 1/s, r4->r3: 1.2/s, r3->r2: 1.44/s, r2->r1: 1.728/s, r1->r0: 2.0736/s', () => {
    const w = timeWorld();
    w.gold = 1e6;
    upgradeCore(w); // step 1
    upgradeCore(w); // step 2
    upgradeCore(w); // step 3: r5, mult 1.2
    expect(w.core.decayRadius).toBe(5);

    const ring5 = spawnAtEdgeDist(w, 4.5); // (4,5] band
    const ring4 = spawnAtEdgeDist(w, 3.5); // (3,4] band
    const ring3 = spawnAtEdgeDist(w, 2.5); // (2,3] band
    const ring2 = spawnAtEdgeDist(w, 1.5); // (1,2] band
    const ring1 = spawnAtEdgeDist(w, 0.5); // (0,1] band

    tickDecay(w, 1);

    expect(100000 - ring5!.hp).toBeCloseTo(1, 2);
    expect(100000 - ring4!.hp).toBeCloseTo(1.2, 2);
    expect(100000 - ring3!.hp).toBeCloseTo(1.44, 2);
    expect(100000 - ring2!.hp).toBeCloseTo(1.728, 2);
    expect(100000 - ring1!.hp).toBeCloseTo(2.0736, 2);
  });

  it('standing exactly on the Core footprint (edge distance 0) is still ring 1, not an undefined ring 0', () => {
    const w = timeWorld();
    w.gold = 1e6;
    upgradeCore(w);
    upgradeCore(w);
    upgradeCore(w);
    const onEdge = spawnAtEdgeDist(w, 0);
    tickDecay(w, 1);
    expect(100000 - onEdge!.hp).toBeCloseTo(2.0736, 2);
  });

  it('beyond decayRadius (5 pre-step4) takes nothing', () => {
    const w = timeWorld();
    w.gold = 1e6;
    upgradeCore(w);
    upgradeCore(w);
    upgradeCore(w);
    const outside = spawnAtEdgeDist(w, 5.5);
    tickDecay(w, 1);
    expect(outside!.hp).toBe(100000);
  });
});

describe('p-core-e — step 4 extends the fixed formula to rings 6-10, not a re-derived one', () => {
  it('rings 1-5 stay byte-identical to the step-3-only rates once step 4 is bought', () => {
    const w = timeWorld();
    w.gold = 1e6;
    upgradeCore(w);
    upgradeCore(w);
    upgradeCore(w);
    upgradeCore(w); // step 4: r10
    expect(w.core.decayRadius).toBe(10);

    const ring5 = spawnAtEdgeDist(w, 4.5);
    const ring1 = spawnAtEdgeDist(w, 0.5);
    tickDecay(w, 1);
    expect(100000 - ring5!.hp).toBeCloseTo(1, 2); // unchanged from the r5-only case
    expect(100000 - ring1!.hp).toBeCloseTo(2.0736, 2); // unchanged from the r5-only case
  });

  it('rings 6-10 (newly reached) get a fractional, sub-1/s rate via the negative exponent', () => {
    const w = timeWorld();
    w.gold = 1e6;
    upgradeCore(w);
    upgradeCore(w);
    upgradeCore(w);
    upgradeCore(w); // step 4: r10
    const ring6 = spawnAtEdgeDist(w, 5.5); // (5,6] -> 1.2^(5-6)
    const ring10 = spawnAtEdgeDist(w, 9.5); // (9,10] -> 1.2^(5-10)
    tickDecay(w, 1);
    expect(100000 - ring6!.hp).toBeCloseTo(Math.pow(1.2, -1), 2);
    expect(100000 - ring10!.hp).toBeCloseTo(Math.pow(1.2, -5), 2);
  });

  it('beyond decayRadius (10 post-step4) takes nothing', () => {
    const w = timeWorld();
    w.gold = 1e6;
    upgradeCore(w);
    upgradeCore(w);
    upgradeCore(w);
    upgradeCore(w);
    const outside = spawnAtEdgeDist(w, 10.5);
    tickDecay(w, 1);
    expect(outside!.hp).toBe(100000);
  });
});

describe('p-core-e — step 5 raises the multiplier, radius unaffected', () => {
  it('ring 1 rate rises from 1.2^4 to 1.5^4 once step 5 is bought', () => {
    const w = timeWorld();
    w.gold = 1e6;
    for (let i = 0; i < 5; i++) upgradeCore(w);
    expect(w.core.decayMult).toBeCloseTo(1.5, 9);
    const ring1 = spawnAtEdgeDist(w, 0.5);
    tickDecay(w, 1);
    expect(100000 - ring1!.hp).toBeCloseTo(Math.pow(1.5, 4), 2);
  });
});

describe('p-core-e — the shared §5.5 Core-attack rule and TD-only gating', () => {
  it('ignores armor entirely (dot semantics), unlike an ordinary hit on the same enemy', () => {
    const w = timeWorld();
    w.gold = 1e6;
    upgradeCore(w);
    upgradeCore(w);
    upgradeCore(w);
    const armored = spawnAtEdgeDist(w, 0.5, 100000, 90); // heavy armor
    tickDecay(w, 1);
    // If armor were applied, damageTakenMul(90) would shrink this well below
    // the raw 2.0736 rate; it must land exactly the un-mitigated amount.
    expect(100000 - armored!.hp).toBeCloseTo(2.0736, 2);
  });

  it('not bought at all (decayRadius 0): no damage regardless of proximity', () => {
    const w = timeWorld();
    const onEdge = spawnAtEdgeDist(w, 0);
    tickDecay(w, 1);
    expect(onEdge!.hp).toBe(100000);
  });

  it('a different Core selected (stone_heart) leaves decayRadius/decayMult at their neutral defaults and does nothing', () => {
    const w = new World(cfg({ core: 'stone_heart' }), content);
    expect(w.core.decayRadius).toBe(0);
    const onEdge = spawnAtEdgeDist(w, 0);
    tickDecay(w, 1);
    expect(onEdge!.hp).toBe(100000);
  });

  it('shuts off during VS (huntsWarden) even with the aura fully bought', () => {
    const w = timeWorld();
    w.gold = 1e6;
    for (let i = 0; i < 5; i++) upgradeCore(w);
    w.phase = 'act2';
    const onEdge = spawnAtEdgeDist(w, 0);
    tickDecay(w, 1);
    expect(onEdge!.hp).toBe(100000);
  });

  it('a zero-enemy tick no-ops cleanly with no throw', () => {
    const w = timeWorld();
    w.gold = 1e6;
    upgradeCore(w);
    upgradeCore(w);
    upgradeCore(w);
    expect(() => tickDecay(w, 1)).not.toThrow();
  });
});
