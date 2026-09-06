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
import { cfg, scaled } from './helpers';

const DT = 1 / 60;
const content = loadContent();

/**
 * An enemy's spawned HP, derived rather than pinned (p12c). These cases used
 * fb025-era literals (husk 200, colossus 4000 — the authored 20/400 times
 * fb025's global x10), which a roster-wide re-anchor necessarily reddens.
 * Reading it from content keeps the case about the Core effect it is named
 * for, not about the current tuning of enemy HP.
 */
function spawnedHp(key: string): number {
  return content.enemyByKey.get(key)!.hp * content.enemies.baseHpMul;
}
const PLANT = content.coreByKey.get('carnivorous_plant')!;
const PLANT_EFFECTS = PLANT.effects!;
/** Sum of `carnivorous_plant`'s first `n` step `devourRangeBonus` deltas, straight off `/data/cores.json`. */
const devourRangeAfter = (n: number): number =>
  PLANT_EFFECTS.devourRadius + PLANT.upgrade.steps!.slice(0, n).reduce((s, st) => s + (st.devourRangeBonus ?? 0), 0);
/** `carnivorous_plant`'s devourCooldown after `n` steps, floored at 1s the same way `computeCoreState` folds it. */
const devourCooldownAfter = (n: number): number =>
  PLANT.upgrade.steps!.slice(0, n).reduce(
    (cd, st) => (st.devourCooldownReduction ? Math.max(1, cd - st.devourCooldownReduction) : cd),
    PLANT_EFFECTS.devourCooldown,
  );

/** One tile off the Core's own 2x2 footprint edge — well within the base devour range. */
const NEAR_X = CORE_X - 1;
/** Three tiles off the footprint edge — outside the base devour range, inside range after 2 steps. */
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
    expect(w.core.devourRadius).toBe(PLANT_EFFECTS.devourRadius);
    expect(w.core.devourCooldown).toBe(PLANT_EFFECTS.devourCooldown);
    expect(w.core.devourEliteDamage).toBe(PLANT_EFFECTS.devourEliteDamage);
    expect(w.core.devourCoreHeal).toBe(PLANT_EFFECTS.devourCoreHeal);
    expect(w.core.poisonVolleyInterval).toBeCloseTo(PLANT_EFFECTS.poisonVolleyInterval, 9);
    expect(w.core.poisonStacksPerBullet).toBe(PLANT_EFFECTS.poisonStacksPerBullet);
    expect(w.core.poisonVolleyCap).toBe(PLANT_EFFECTS.poisonVolleyCap);
    expect(w.core.poisonBulletDamage).toBe(PLANT_EFFECTS.poisonBulletDamage);
  });

  it('each of the 4 steps adds its devour range/cooldown deltas, folded fresh each time (no double-counting)', () => {
    expect(computeCoreState(content, 'carnivorous_plant', 0).devourRadius).toBe(devourRangeAfter(0));
    expect(computeCoreState(content, 'carnivorous_plant', 0).devourCooldown).toBe(devourCooldownAfter(0));
    expect(computeCoreState(content, 'carnivorous_plant', 1).devourRadius).toBe(devourRangeAfter(1));
    expect(computeCoreState(content, 'carnivorous_plant', 1).devourCooldown).toBe(devourCooldownAfter(1));
    expect(computeCoreState(content, 'carnivorous_plant', 4).devourRadius).toBe(devourRangeAfter(4));
    expect(computeCoreState(content, 'carnivorous_plant', 4).devourCooldown).toBe(devourCooldownAfter(4));
  });

  it('a bought step is live immediately through the shared upgradeCore rule', () => {
    const w = plantWorld();
    w.gold = 1e6;
    expect(upgradeCore(w)).toBe(true);
    expect(w.core.devourRadius).toBe(devourRangeAfter(1));
    expect(w.core.devourCooldown).toBe(devourCooldownAfter(1));
  });
});

describe('p-core-c — TD devour', () => {
  it('devours a non-elite outright: instant kill, +5 Core HP, +1 Digestion, credits real damage', () => {
    const w = plantWorld();
    w.coreHp = scaled(100); // well under max so the heal has room
    const e = spawnEnemy(w, 'husk', NEAR_X, CORE_Y)!;
    expect(e.hp).toBeCloseTo(spawnedHp('husk'), 6);
    tickPlant(w, 8);
    expect(e.dead).toBe(true);
    expect(w.coreHp).toBeCloseTo(scaled(100) + PLANT_EFFECTS.devourCoreHeal, 10);
    expect(w.digestionStacks).toBe(1);
    // "feeds on-map damage effects": the kill lands through damageEnemy, so it
    // counts as real damage dealt, not a bare killEnemy with no attribution.
    expect(w.damageByWeapon['carnivorous_plant']).toBeCloseTo(spawnedHp('husk'), 6);
    expect(w.damageTotal).toBeCloseTo(spawnedHp('husk'), 6);
  });

  it('instant kill ignores armor: a heavily armored non-elite still dies to the exact one hit', () => {
    const w = plantWorld();
    const e = spawnEnemy(w, 'husk', NEAR_X, CORE_Y)!;
    e.armor = 90; // would reduce a normal hit to a fraction of itself
    tickPlant(w, 8);
    expect(e.dead).toBe(true);
    expect(w.damageByWeapon['carnivorous_plant']).toBeCloseTo(spawnedHp('husk'), 6); // full pre-armor HP, not shredded by mitigation
  });

  it('devours an elite for flat 200, not a kill, and still grants the Digestion stack and Core heal', () => {
    const w = plantWorld();
    w.coreHp = scaled(100);
    const e = spawnEnemy(w, 'colossus', NEAR_X, CORE_Y)!; // elite trait
    expect(e.elite).toBe(true);
    tickPlant(w, 8);
    expect(e.dead).toBe(false);
    expect(e.hp).toBeCloseTo(spawnedHp('colossus') - PLANT_EFFECTS.devourEliteDamage, 6); // no armor (colossus has none)
    expect(w.coreHp).toBeCloseTo(scaled(100) + PLANT_EFFECTS.devourCoreHeal, 10);
    expect(w.digestionStacks).toBe(1);
  });

  it('does not scale with character stats: boosting power leaves the elite hit off by exactly devourEliteDamage', () => {
    const w = plantWorld();
    w.stats.add('test', 'power', 5); // +500% power, would matter if this scaled
    w.recomputeDerived();
    const e = spawnEnemy(w, 'colossus', NEAR_X, CORE_Y)!;
    tickPlant(w, 8);
    expect(e.hp).toBeCloseTo(spawnedHp('colossus') - PLANT_EFFECTS.devourEliteDamage, 6);
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
    expect(e.hp).toBeGreaterThan(spawnedHp('colossus') - PLANT_EFFECTS.devourEliteDamage);
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

  it('fires no bullet below poisonStacksPerBullet Digestion stacks', () => {
    const w = plantWorld();
    w.phase = 'act2';
    w.digestionStacks = PLANT_EFFECTS.poisonStacksPerBullet - 1;
    const e = spawnEnemy(w, 'husk', NEAR_X, CORE_Y)!;
    const baseHp = e.hp;
    tickPlant(w, 1.5);
    expect(e.hp).toBe(baseHp);
    expect(e.dots.length).toBe(0);
  });

  it('one bullet per poisonStacksPerBullet stacks: exactly 1 bullet, each poisonBulletDamage normal + a poison DoT off that same amount', () => {
    const w = plantWorld();
    w.phase = 'act2';
    w.digestionStacks = PLANT_EFFECTS.poisonStacksPerBullet + 2;
    const e = spawnEnemy(w, 'husk', NEAR_X, CORE_Y)!;
    const baseHp = e.hp;
    const bulletDmg = PLANT_EFFECTS.poisonBulletDamage;
    tickPlant(w, 1.5);
    expect(e.hp).toBe(baseHp - bulletDmg); // normal component; poison hasn't ticked yet
    expect(e.dots.length).toBe(1);
    expect(e.dots[0].type).toBe('poison');
    // poison.json's own ratio/duration (out of cores.json's scope) trigger off
    // the bullet's own flat damage, independent of the target's own HP/overlay.
    expect(e.dots[0].dps).toBeCloseTo((1.2 * bulletDmg) / 3, 9);
    expect(e.dots[0].remaining).toBeCloseTo(3, 1);
  });

  it('is perf-capped at poisonVolleyCap bullets even with far more Digestion than that needs', () => {
    const w = plantWorld();
    w.phase = 'act2';
    w.digestionStacks = 1000; // far past the cap regardless of poisonStacksPerBullet
    const enemies = Array.from({ length: 15 }, (_, i) => spawnEnemy(w, 'husk', NEAR_X - i * 0.1, CORE_Y + i * 0.1)!);
    const baseHp = enemies.map((e) => e.hp);
    tickPlant(w, 1.5);
    const hitCount = enemies.filter((e, i) => e.hp < baseHp[i]).length;
    expect(hitCount).toBe(PLANT_EFFECTS.poisonVolleyCap);
  });

  it('targets the nearest enemies to the Core first', () => {
    const w = plantWorld();
    w.phase = 'act2';
    w.digestionStacks = PLANT_EFFECTS.poisonStacksPerBullet; // exactly 1 bullet
    const near = spawnEnemy(w, 'husk', NEAR_X, CORE_Y)!;
    const far = spawnEnemy(w, 'husk', CORE_X - 20, CORE_Y)!;
    const nearBase = near.hp;
    const farBase = far.hp;
    tickPlant(w, 1.5);
    expect(near.hp).toBe(nearBase - PLANT_EFFECTS.poisonBulletDamage);
    expect(far.hp).toBe(farBase);
  });

  it('does not scale with character stats and grants no lifesteal even while huntsWarden leech is live', () => {
    const w = plantWorld();
    w.phase = 'act2';
    w.digestionStacks = PLANT_EFFECTS.poisonStacksPerBullet;
    w.stats.add('test', 'power', 5); // would matter if bullet damage scaled
    w.stats.add('test', 'leech', 0.5); // would matter if the hit leeched
    w.recomputeDerived();
    expect(w.derived.leech).toBeGreaterThan(0);
    const e = spawnEnemy(w, 'husk', NEAR_X, CORE_Y)!;
    const baseHp = e.hp;
    tickPlant(w, 1.5);
    expect(e.hp).toBe(baseHp - PLANT_EFFECTS.poisonBulletDamage); // flat, not power-scaled
    expect(w.warden.leechAccumulator).toBe(0);
  });

  it('feeds on-map damage totals: the normal component is credited to damageByWeapon/damageTotal', () => {
    const w = plantWorld();
    w.phase = 'act2';
    w.digestionStacks = PLANT_EFFECTS.poisonStacksPerBullet;
    spawnEnemy(w, 'husk', NEAR_X, CORE_Y);
    tickPlant(w, 1.5);
    expect(w.damageByWeapon['carnivorous_plant']).toBe(PLANT_EFFECTS.poisonBulletDamage);
    expect(w.damageTotal).toBe(PLANT_EFFECTS.poisonBulletDamage);
  });

  it('is VS-only: no volley fires during a TD block regardless of Digestion', () => {
    const w = plantWorld();
    w.digestionStacks = 50; // would be a full 10-bullet volley in VS
    // Well past devour range even after every range step (max radius 6), so
    // any damage this enemy takes can only have come from the volley branch —
    // proving that branch truly never runs while `huntsWarden` is false.
    const e = spawnEnemy(w, 'husk', CORE_X - 20, CORE_Y)!;
    tickPlant(w, 8);
    expect(e.hp).toBeCloseTo(spawnedHp('husk'), 6);
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
