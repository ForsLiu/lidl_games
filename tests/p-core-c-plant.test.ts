/**
 * p-core-c — SPEC-FINAL §5.5's Carnivorous Plant, in full (gate G21). `p-core-a`
 * shipped selection/hashing/loader validation only; `p-core-b` gave Stone
 * Heart, Vampire Heart and Time's steps 1-2 real numbers. This is the first
 * item to give Carnivorous Plant's own TD devour and VS poison volley real
 * gameplay, plus the shared "Core attack" rules §5.5 states once: not scaled
 * by character stats, no lifesteal, but still feeds on-map damage effects
 * (`damageByWeapon`/`damageTotal`). Q113 records the three judgment calls the
 * owner prose left open: "10 normal + poison" as two effects off one hit
 * rather than a split, a non-elite "instant kill" as damage-equal-to-current-
 * HP through the normal pipeline (armor/traits bypassed) rather than a bare
 * `killEnemy`, and the VS volley's unbounded targeting range.
 */

import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';
import { computeCoreState, updateCarnivorousPlant, upgradeCore } from '../src/sim/cores';
import { spawnEnemy } from '../src/sim/enemies';
import { CORE_X, CORE_Y } from '../src/sim/grid';
import { hashWorld } from '../src/sim/run';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const DT = 1 / 60;
const content = loadContent();

/** One tile off the Core's own 2x2 footprint edge — well within the base r2 devour range. */
const NEAR_X = CORE_X - 1;
/** Three tiles off the footprint edge — outside the base r2 devour range, inside r4 (post 2 steps). */
const FAR_X = CORE_X - 3;

function plantWorld(): World {
  return new World(cfg({ core: 'carnivorous_plant' }), content);
}

/** Ticks `updateCarnivorousPlant` for `seconds` of sim time, `w.rebuildBuckets()` refreshed every tick like `Run.step` does. */
function tickPlant(w: World, seconds: number): void {
  const ticks = Math.round(seconds / DT);
  for (let i = 0; i < ticks; i++) {
    w.rebuildBuckets();
    updateCarnivorousPlant(w, DT);
  }
}

describe('p-core-c — Carnivorous Plant base effects and upgrade steps', () => {
  it('base effects load exactly as authored', () => {
    const w = plantWorld();
    expect(w.core.devourRadius).toBe(2);
    expect(w.core.devourCooldown).toBe(8);
    expect(w.core.devourEliteDamage).toBe(200);
    expect(w.core.devourCoreHeal).toBe(5);
    expect(w.core.poisonVolleyInterval).toBeCloseTo(1.5, 9);
    expect(w.core.poisonStacksPerBullet).toBe(5);
    expect(w.core.poisonVolleyCap).toBe(10);
    expect(w.core.poisonBulletDamage).toBe(10);
  });

  it('each of the 4 steps adds +1 devour range and -1s cooldown, folded fresh each time (no double-counting)', () => {
    expect(computeCoreState(content, 'carnivorous_plant', 0).devourRadius).toBe(2);
    expect(computeCoreState(content, 'carnivorous_plant', 0).devourCooldown).toBe(8);
    expect(computeCoreState(content, 'carnivorous_plant', 1).devourRadius).toBe(3);
    expect(computeCoreState(content, 'carnivorous_plant', 1).devourCooldown).toBe(7);
    expect(computeCoreState(content, 'carnivorous_plant', 4).devourRadius).toBe(6);
    expect(computeCoreState(content, 'carnivorous_plant', 4).devourCooldown).toBe(4);
  });

  it('a bought step is live immediately through the shared upgradeCore rule', () => {
    const w = plantWorld();
    w.gold = 1e6;
    expect(upgradeCore(w)).toBe(true);
    expect(w.core.devourRadius).toBe(3);
    expect(w.core.devourCooldown).toBe(7);
  });
});

describe('p-core-c — TD devour', () => {
  it('devours a non-elite outright: instant kill, +5 Core HP, +1 Digestion, credits real damage', () => {
    const w = plantWorld();
    w.coreHp = 100; // well under max (200) so the heal has room
    const e = spawnEnemy(w, 'husk', NEAR_X, CORE_Y)!;
    expect(e.hp).toBe(28); // fb020: husk hp 20 -> 28 (x1.4)
    tickPlant(w, 8);
    expect(e.dead).toBe(true);
    expect(w.coreHp).toBe(105);
    expect(w.digestionStacks).toBe(1);
    // "feeds on-map damage effects": the kill lands through damageEnemy, so it
    // counts as real damage dealt, not a bare killEnemy with no attribution.
    expect(w.damageByWeapon['carnivorous_plant']).toBe(28); // fb020: husk hp 20 -> 28
    expect(w.damageTotal).toBe(28); // fb020: husk hp 20 -> 28
  });

  it('instant kill ignores armor: a heavily armored non-elite still dies to the exact one hit', () => {
    const w = plantWorld();
    const e = spawnEnemy(w, 'husk', NEAR_X, CORE_Y)!;
    e.armor = 90; // would reduce a normal hit to a fraction of itself
    tickPlant(w, 8);
    expect(e.dead).toBe(true);
    expect(w.damageByWeapon['carnivorous_plant']).toBe(28); // full pre-armor HP, not shredded by mitigation (fb020: 20 -> 28)
  });

  it('devours an elite for flat 200, not a kill, and still grants the Digestion stack and Core heal', () => {
    const w = plantWorld();
    w.coreHp = 100;
    const e = spawnEnemy(w, 'colossus', NEAR_X, CORE_Y)!; // 560 hp (fb020: 400 -> 560), elite trait
    expect(e.elite).toBe(true);
    tickPlant(w, 8);
    expect(e.dead).toBe(false);
    expect(e.hp).toBe(360); // exactly 560 - 200, no armor (colossus has none) (fb020: was 400 - 200 = 200)
    expect(w.coreHp).toBe(105);
    expect(w.digestionStacks).toBe(1);
  });

  it('does not scale with character stats: boosting power leaves the elite hit at exactly 200 off', () => {
    const w = plantWorld();
    w.stats.add('test', 'power', 5); // +500% power, would matter if this scaled
    w.recomputeDerived();
    const e = spawnEnemy(w, 'colossus', NEAR_X, CORE_Y)!;
    tickPlant(w, 8);
    expect(e.hp).toBe(360); // fb020: colossus hp 400 -> 560, so 560 - 200 = 360
  });

  // Q113 addendum: unlike the non-elite kill (which explicitly bypasses armor
  // via `pure`/`dot`), the elite branch's "flat 200" is an ordinary `normal`
  // hit — mitigated by armor like any other flat number in the game (see
  // `triggerBurningExplode`'s own "flat means not stat-scaled" convention).
  // Inert today (no shipped elite carries armor), but pinned so a future
  // armored elite doesn't silently change this behavior.
  it('the elite flat-200 hit is still armor-mitigated, unlike the non-elite instant kill', () => {
    const w = plantWorld();
    const e = spawnEnemy(w, 'colossus', NEAR_X, CORE_Y)!;
    e.armor = 50; // damageTakenMul(50) < 1, so a mitigated 200 lands for less than 200
    tickPlant(w, 8);
    expect(e.hp).toBeGreaterThan(200);
  });

  it('an enemy past devourRadius is left alone; buying range steps reaches it', () => {
    const w = plantWorld();
    const e = spawnEnemy(w, 'husk', FAR_X, CORE_Y)!;
    tickPlant(w, 8);
    expect(e.dead).toBe(false);
    expect(w.digestionStacks).toBe(0);

    w.gold = 1e6;
    expect(upgradeCore(w)).toBe(true); // devourRadius 2 -> 3, still short of FAR_X's distance of 3...
    expect(upgradeCore(w)).toBe(true); // devourRadius 3 -> 4, now covers it
    tickPlant(w, w.core.devourCooldown);
    expect(e.dead).toBe(true);
    expect(w.digestionStacks).toBe(1);
  });

  it('devours the nearest of several targets, one per cooldown', () => {
    const w = plantWorld();
    const near = spawnEnemy(w, 'husk', NEAR_X, CORE_Y)!;
    const farther = spawnEnemy(w, 'husk', NEAR_X - 0.5, CORE_Y)!;
    tickPlant(w, 8);
    expect(near.dead).toBe(true);
    expect(farther.dead).toBe(false);
    expect(w.digestionStacks).toBe(1);
  });

  it('is TD-only: no devour fires once VS begins, even with a target in range', () => {
    const w = plantWorld();
    w.phase = 'act2';
    const e = spawnEnemy(w, 'husk', NEAR_X, CORE_Y)!;
    tickPlant(w, 16);
    expect(e.dead).toBe(false);
    expect(w.digestionStacks).toBe(0);
  });

  it('Digestion persists across the TD/VS boundary, uncapped by anything that resets other run state', () => {
    const w = plantWorld();
    for (let i = 0; i < 3; i++) {
      spawnEnemy(w, 'husk', NEAR_X, CORE_Y);
      tickPlant(w, 8);
    }
    expect(w.digestionStacks).toBe(3);
    w.phase = 'act2';
    tickPlant(w, 1);
    expect(w.digestionStacks).toBe(3); // unchanged by entering VS
  });
});

describe('p-core-c — VS poison volley', () => {
  // Act II's own §5.1 HP overlay (`makeEnemy`, enemies.ts) rescales every spawn
  // once `w.huntsWarden` is true, so a husk's live `hp` is not the roster's
  // bare 20 in VS — every assertion below reads the enemy's own post-spawn HP
  // as its baseline instead of hardcoding 20.

  it('fires no bullet below 5 Digestion stacks', () => {
    const w = plantWorld();
    w.phase = 'act2';
    w.digestionStacks = 4;
    const e = spawnEnemy(w, 'husk', NEAR_X, CORE_Y)!;
    const baseHp = e.hp;
    tickPlant(w, 1.5);
    expect(e.hp).toBe(baseHp);
    expect(e.dots.length).toBe(0);
  });

  it('one bullet per 5 stacks: exactly 1 bullet at 5-9 stacks, each 10 normal + a poison DoT off that same 10', () => {
    const w = plantWorld();
    w.phase = 'act2';
    w.digestionStacks = 7;
    const e = spawnEnemy(w, 'husk', NEAR_X, CORE_Y)!;
    const baseHp = e.hp;
    tickPlant(w, 1.5);
    expect(e.hp).toBe(baseHp - 10); // 10 normal, poison hasn't ticked yet
    expect(e.dots.length).toBe(1);
    expect(e.dots[0].type).toBe('poison');
    // poison.json: ratio 1.2, duration 3 -> dps = 1.2*10/3 = 4 (the bullet's
    // own flat 10 is the trigger, independent of the target's own HP/overlay)
    expect(e.dots[0].dps).toBeCloseTo(4, 9);
    expect(e.dots[0].remaining).toBeCloseTo(3, 1);
  });

  it('is perf-capped at poisonVolleyCap bullets even with far more Digestion than that needs', () => {
    const w = plantWorld();
    w.phase = 'act2';
    w.digestionStacks = 1000; // floor(1000/5) = 200, far past the cap of 10
    const enemies = Array.from({ length: 15 }, (_, i) => spawnEnemy(w, 'husk', NEAR_X - i * 0.1, CORE_Y + i * 0.1)!);
    const baseHp = enemies.map((e) => e.hp);
    tickPlant(w, 1.5);
    const hitCount = enemies.filter((e, i) => e.hp < baseHp[i]).length;
    expect(hitCount).toBe(10);
  });

  it('targets the nearest enemies to the Core first', () => {
    const w = plantWorld();
    w.phase = 'act2';
    w.digestionStacks = 5; // exactly 1 bullet
    const near = spawnEnemy(w, 'husk', NEAR_X, CORE_Y)!;
    const far = spawnEnemy(w, 'husk', CORE_X - 20, CORE_Y)!;
    const nearBase = near.hp;
    const farBase = far.hp;
    tickPlant(w, 1.5);
    expect(near.hp).toBe(nearBase - 10);
    expect(far.hp).toBe(farBase);
  });

  it('does not scale with character stats and grants no lifesteal even while huntsWarden leech is live', () => {
    const w = plantWorld();
    w.phase = 'act2';
    w.digestionStacks = 5;
    w.stats.add('test', 'power', 5); // would matter if bullet damage scaled
    w.stats.add('test', 'leech', 0.5); // would matter if the hit leeched
    w.recomputeDerived();
    expect(w.derived.leech).toBeGreaterThan(0);
    const e = spawnEnemy(w, 'husk', NEAR_X, CORE_Y)!;
    const baseHp = e.hp;
    tickPlant(w, 1.5);
    expect(e.hp).toBe(baseHp - 10); // flat 10, not power-scaled
    expect(w.warden.leechAccumulator).toBe(0);
  });

  it('feeds on-map damage totals: the normal component is credited to damageByWeapon/damageTotal', () => {
    const w = plantWorld();
    w.phase = 'act2';
    w.digestionStacks = 5;
    spawnEnemy(w, 'husk', NEAR_X, CORE_Y);
    tickPlant(w, 1.5);
    expect(w.damageByWeapon['carnivorous_plant']).toBe(10);
    expect(w.damageTotal).toBe(10);
  });

  it('is VS-only: no volley fires during a TD block regardless of Digestion', () => {
    const w = plantWorld();
    w.digestionStacks = 50; // would be a full 10-bullet volley in VS
    // Well past devour range even after every range step (max radius 6), so
    // any damage this enemy takes can only have come from the volley branch —
    // proving that branch truly never runs while `huntsWarden` is false.
    const e = spawnEnemy(w, 'husk', CORE_X - 20, CORE_Y)!;
    tickPlant(w, 8);
    expect(e.hp).toBe(28); // fb020: husk hp 20 -> 28
  });
});

describe('p-core-c — replay-hash determinism', () => {
  it('two identical scripted runs (devour + volley) hash identically', () => {
    function run(): World {
      const w = plantWorld();
      spawnEnemy(w, 'husk', NEAR_X, CORE_Y);
      tickPlant(w, 8); // one devour
      w.phase = 'act2';
      w.digestionStacks = 5;
      spawnEnemy(w, 'husk', NEAR_X, CORE_Y + 0.2);
      tickPlant(w, 1.5); // one volley
      return w;
    }
    expect(hashWorld(run())).toBe(hashWorld(run()));
  });

  it('a run differing only in Digestion stacks hashes differently', () => {
    const a = plantWorld();
    const b = plantWorld();
    b.digestionStacks = 5;
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});
