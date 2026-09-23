/**
 * fb059 (BACKLOG-CONTENT; owner feedback
 * `feedback/processed/20260903-121255-feature-class-voltbolt.md`, SPEC-FINAL
 * §4.2 *Voltbolt*) — **the owner's "Done when" list, clause by clause.**
 *
 *   "full kit per above; tests for chain targeting (nearest unhit within r3,
 *   fallback to original), 0.1 s chain delay, Lightning Ball firing at total
 *   attack speed with 25%-efficiency move bonus, Overdrive's three-chain
 *   pattern, additive stacking and reset, burst damage/radius scaling, tower
 *   projectile speed and conversion; replay determinism; hitscan basic has no
 *   travel time."
 *
 * Conventions kept from `class-madness-king.test.ts` (fb057) and the lane's
 * liveness files: every magnitude is read out of `data/classes.json`, never
 * restated (c008 pins §4.2's own figures against the data); punching bags are
 * the roster's first enemy, parked and unarmoured, deep enough not to die by
 * accident; and a clause is shown against its own control where one exists.
 */
import { describe, expect, it } from 'vitest';

import { applyRunResult, defaultMeta, metricsFor } from '../src/meta/meta';
import { CLASS_VFX, overdriveAuraStyle, VOLT_VFX } from '../src/render/vfx-registry';
import {
  characterAttackSpeedBonus,
  characterAttackSpeedMul,
  characterMoveSpeedBonus,
  classMoveSpeedMul,
  overdriveAttackSpeedMul,
  overdriveMoveSpeedMul,
} from '../src/sim/charspeed';
import {
  characterBasicRange,
  characterDamage,
  classBasicAttack,
  lightningBallDamageMul,
  overdriveBurst,
  updateClassPassives,
  useClassActive,
  useClassActive2,
  voltChainMuls,
} from '../src/sim/classes';
import { loadContent, type ClassDef } from '../src/sim/content';
import { spawnEnemy } from '../src/sim/enemies';
import { dist } from '../src/sim/math';
import { hashWorld, Run } from '../src/sim/run';
import { BASE } from '../src/sim/stats';
import { attackSpeedFor, buildTower, towerDamage, towerProjectileSpeedMul, updateTowers, upgradeTower } from '../src/sim/towers';
import { NORMAL_PROFILE_CLASS_KEYS } from '../src/ui/class-select';
import { emptyInput, type Command, type Enemy, type Structure, type TickInput } from '../src/sim/types';
import { World } from '../src/sim/world';
import { BUILD_TX, BUILD_TY, WX, WY } from './class-board';
import { cfg, makeInputLog, replay } from './helpers';

const content = loadContent();
const DT = 1 / 60;
const KEY = 'voltbolt';
const VB: ClassDef = content.classByKey.get(KEY)!;
const ARC = VB.passive;
const A1 = VB.active1;
const A2 = VB.active2;
const TP = VB.towerPassive;
const BAG = content.enemies.enemies[0]!;

/** A Voltbolt world (or `classKey`'s), basic attack parked, Warden on the shared probed board. */
function world(classKey = KEY): World {
  const w = new World(cfg({ classKey }), content);
  w.gold = 1e6;
  w.warden.attackCooldown = 1e9;
  w.warden.x = WX;
  w.warden.y = WY;
  w.phase = 'act1_wave';
  return w;
}

function bag(w: World, x: number, y: number, hp = 1e6): Enemy {
  const e = spawnEnemy(w, BAG.key, x, y)!;
  e.hp = hp;
  e.maxHp = Math.max(hp, e.maxHp);
  e.speed = 0;
  e.armor = 0;
  w.rebuildBuckets();
  return e;
}

/** One real character basic attack — the nearest enemy in range is its target. */
function attack(w: World): void {
  w.warden.attackCooldown = 0;
  classBasicAttack(w, w.content.classByKey.get(w.cfg.classKey)!);
}

function tick(w: World, seconds: number): void {
  for (let t = 0; t < Math.round(seconds / DT); t++) updateClassPassives(w, DT);
}

const lost = (e: Enemy): number => e.maxHp - e.hp;

/** The damage one basic hit deals a bare bag in `w` — the unit every chain/ball share is stated in. */
function basicHitDamage(w: World): number {
  return characterDamage(w, VB, VB.basicAttack.dps * VB.basicAttack.interval);
}

/* ---------------------------------------------------------------- hitscan */

describe('fb059 hitscan — the basic attack lands the instant it fires', () => {
  it('the target loses hp inside the same call, and nothing is left in flight', () => {
    const w = world();
    const e = bag(w, WX + VB.basicAttack.range - 0.5, WY);
    attack(w);
    expect(lost(e), 'no damage on the firing tick — something travelled').toBeCloseTo(basicHitDamage(w), 9);
    expect(w.projectiles, 'a hitscan attack spawned a projectile').toHaveLength(0);
    const fire = w.fx.find((f) => f.k === 'class_basic');
    expect(fire, 'no fire event for the renderer').toBeDefined();
    expect([fire!.a, fire!.b]).toEqual([e.x, e.y]);
  });

  it('is registered as a hitscan line in the VFX registry, not a projectile', () => {
    expect(CLASS_VFX[KEY]!.basic.shape).toBe('hitscan');
    // And the basic attack is Normal damage (no Electric splash, the designer note).
    expect(VB.basicAttack.aoe).toBe(0);
  });
});

/* ------------------------------------------------------------- Arc (passive) */

describe('fb059 Arc — one chain link per basic attack, 0.1 s late, nearest unhit within r3', () => {
  it('chains to the nearest not-yet-hit enemy within r3, at the authored share of the hit', () => {
    const w = world();
    const primary = bag(w, WX + 1, WY);
    const near = bag(w, WX + 2, WY); // 1 tile from the primary
    const far = bag(w, WX + 1, WY + 2); // 2 tiles from the primary
    attack(w);
    const hit = lost(primary);
    tick(w, (ARC.arcChainDelaySeconds ?? 0) + 0.05);
    expect(lost(near) / hit).toBeCloseTo(ARC.arcChainDamageMul!, 9);
    expect(lost(far), 'the chain struck the farther enemy').toBe(0);
    expect(lost(primary), 'the primary was struck again though an unhit enemy was in reach').toBeCloseTo(hit, 9);
    expect(w.chainHits).toBe(1);
  });

  it('with no unhit enemy inside r3 it strikes the original target again', () => {
    const w = world();
    const primary = bag(w, WX + 1, WY);
    const outside = bag(w, WX + 1 + ARC.arcChainRadius! + 0.2, WY);
    attack(w);
    const hit = lost(primary);
    tick(w, (ARC.arcChainDelaySeconds ?? 0) + 0.05);
    expect(lost(outside), 'the chain reached past r3').toBe(0);
    expect(lost(primary) / hit).toBeCloseTo(1 + ARC.arcChainDamageMul!, 9);
  });

  it('lands 0.1 s after the hit — not before', () => {
    const w = world();
    bag(w, WX + 1, WY);
    const near = bag(w, WX + 2, WY);
    attack(w);
    const delayTicks = Math.round((ARC.arcChainDelaySeconds ?? 0) / DT);
    for (let t = 0; t < delayTicks - 1; t++) updateClassPassives(w, DT);
    expect(lost(near), 'the chain landed before its delay').toBe(0);
    expect(w.voltChains).toHaveLength(1);
    for (let t = 0; t < 3; t++) updateClassPassives(w, DT);
    expect(lost(near), 'the chain never landed').toBeGreaterThan(0);
    expect(w.voltChains).toHaveLength(0);
    expect(w.fx.some((f) => f.k === 'volt_chain'), 'no chain arc for the renderer').toBe(true);
  });

  it('a chain with no live candidate at all (the original died too) fizzles', () => {
    const w = world();
    const primary = bag(w, WX + 1, WY, 1e-6);
    attack(w);
    expect(primary.dead).toBe(true);
    tick(w, 0.5);
    expect(w.voltChains).toHaveLength(0);
    expect(w.chainHits).toBe(0);
  });

  it('applies on-hit effects on the link, like the basic attack (the owner\'s "Plague Flask poison rides every chain")', () => {
    // Plague Flask is Plaguebringer's own item — on Voltbolt its effect is gated
    // off by `classFallback` (fb056). Lifting that gate in a content copy is
    // the cleanest real on-hit rider there is: the link must carry it exactly
    // as the basic hit does, through the one shared hit function.
    const doc = JSON.parse(JSON.stringify(content.raw.equipment)) as { items: { key: string; classFallback?: unknown }[] };
    delete doc.items.find((i) => i.key === 'plague_flask')!.classFallback;
    const c = loadContent({ equipment: doc });
    const w = new World(cfg({ classKey: KEY, equipment: ['plague_flask'] }), c);
    w.warden.attackCooldown = 1e9;
    w.warden.x = WX;
    w.warden.y = WY;
    w.phase = 'act1_wave';
    const primary = bag(w, WX + 1, WY);
    const near = bag(w, WX + 2, WY);
    attack(w);
    expect(primary.dots.some((d) => d.type === 'poison'), 'the basic hit carried no poison — the harness is wrong').toBe(true);
    expect(near.dots, 'poison before the link landed').toHaveLength(0);
    tick(w, (ARC.arcChainDelaySeconds ?? 0) + 0.05);
    const dot = near.dots.find((d) => d.type === 'poison');
    expect(dot, "the chain link dropped the basic attack's on-hit poison").toBeDefined();
    // Priced off the link's own (25%) hit, not the whole basic hit.
    const primaryDot = primary.dots.find((d) => d.type === 'poison')!;
    expect(dot!.dps / primaryDot.dps).toBeCloseTo(ARC.arcChainDamageMul!, 9);
  });

  it('is Voltbolt-only: another class throws no chain', () => {
    const w = world('archer');
    bag(w, WX + 1, WY);
    const near = bag(w, WX + 2, WY);
    attack(w);
    tick(w, 0.5);
    expect(lost(near)).toBe(0);
    expect(voltChainMuls(w, content.classByKey.get('archer')!)).toEqual([]);
  });
});

/* ---------------------------------------------------- review regressions */

describe('fb059 review — the defeat beat freezes the kit, and a link lands exactly one delay late', () => {
  it('a chain link queued before the defeat beat deals nothing during it (b048 rule)', () => {
    const w = world();
    bag(w, WX + 1, WY);
    const near = bag(w, WX + 2, WY);
    attack(w);
    expect(w.voltChains).toHaveLength(1);
    w.dying = 'defeat_warden';
    tick(w, 0.5);
    expect(lost(near), 'a chain link struck during the defeat slow-mo').toBe(0);
    expect(w.chainHits, 'a frozen link still fed the unlock metric').toBe(0);
  });

  it('a live Lightning Ball fires nothing during the defeat beat', () => {
    const w = world();
    const e = bag(w, WX + 2, WY);
    useClassActive(w, WX + 2, WY);
    w.dying = 'defeat_core';
    tick(w, 0.5);
    expect(lost(e)).toBe(0);
  });

  it('through Run.step, a basic attack\'s link and a ball shot\'s link both land exactly the delay after their hit', () => {
    const delayTicks = Math.round((ARC.arcChainDelaySeconds ?? 0) / DT);
    const landingDelay = (castBall: boolean): number => {
      const run = new Run(cfg({ classKey: KEY }));
      const w = run.world;
      w.phase = 'act1_wave';
      const wx = w.warden.x;
      const wy = w.warden.y;
      // West of the Warden: it spawns just west of the Core, and a bag on the
      // Core's own tiles breaches it and dies.
      const primary = spawnEnemy(w, BAG.key, wx - 1, wy)!;
      const near = spawnEnemy(w, BAG.key, wx - 2, wy)!;
      for (const e of [primary, near]) {
        e.hp = 1e6;
        e.maxHp = 1e6;
        e.speed = 0;
        e.armor = 0;
      }
      w.rebuildBuckets();
      if (castBall) {
        w.warden.attackCooldown = 1e9;
        run.step({ ...emptyInput(), cmds: [{ k: 'class_active', aimX: wx - 1, aimY: wy }] });
      } else {
        run.step(emptyInput());
      }
      const hitTick = w.tick;
      expect(primary.hp, 'the harness hit nothing').toBeLessThan(1e6);
      for (let t = 0; t < 30 && near.hp === 1e6; t++) {
        if (!castBall) w.warden.attackCooldown = 1e9;
        run.step(emptyInput());
      }
      expect(near.hp, 'the link never landed').toBeLessThan(1e6);
      return w.tick - hitTick;
    };
    expect(landingDelay(false), 'basic attack link').toBe(delayTicks);
    expect(landingDelay(true), 'ball shot link').toBe(delayTicks);
  });

  it('a zero delay is an instant link — it lands on the hit\'s own tick', () => {
    const doc = JSON.parse(JSON.stringify(content.raw.classes)) as { classes: { key: string; passive: Record<string, unknown> }[] };
    doc.classes.find((c) => c.key === KEY)!.passive.arcChainDelaySeconds = 0;
    const w = new World(cfg({ classKey: KEY }), loadContent({ classes: doc }));
    w.warden.attackCooldown = 1e9;
    w.warden.x = WX;
    w.warden.y = WY;
    w.phase = 'act1_wave';
    bag(w, WX + 1, WY);
    const near = bag(w, WX + 2, WY);
    attack(w);
    updateClassPassives(w, DT);
    expect(lost(near), 'an instant link waited a tick').toBeGreaterThan(0);
  });

  it('in VS the ball still fires, at the character\'s VS cadence including a Beacon shrine\'s haste', () => {
    const w = world();
    w.phase = 'act2';
    expect(w.huntsWarden).toBe(true);
    const e = bag(w, WX + 2, WY);
    w.shrineHaste = 0.5;
    const withHaste = characterAttackSpeedMul(w);
    w.shrineHaste = 0;
    expect(withHaste / characterAttackSpeedMul(w)).toBeCloseTo(1.5, 12);
    expect(useClassActive(w, WX + 2, WY)).toBe(true);
    tick(w, 0.1);
    expect(lost(e), 'the ball fired nothing in VS').toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------ Lightning Ball */

describe('fb059 Lightning Ball — thrown to the cursor, hovers, fires the basic attack at total attack speed', () => {
  it('travels toward the cursor at its authored speed and hovers at the point', () => {
    const w = world();
    expect(useClassActive(w, WX + 3, WY)).toBe(true);
    const b = w.lightningBalls[0]!;
    expect([b.tx, b.ty]).toEqual([WX + 3, WY]);
    updateClassPassives(w, DT);
    expect(b.x - WX).toBeCloseTo(A1.ballSpeed! * DT, 9);
    tick(w, 1);
    expect([b.x, b.y]).toEqual([WX + 3, WY]);
  });

  it('a cursor beyond basic range clamps to range', () => {
    const w = world();
    // Past basic range (6) but on the probed board (c014's EAST_REACH).
    useClassActive(w, WX + 12, WY);
    const b = w.lightningBalls[0]!;
    expect(dist(WX, WY, b.tx, b.ty)).toBeCloseTo(characterBasicRange(w), 9);
  });

  it('lives 2.5 s in all, then is gone', () => {
    const w = world();
    useClassActive(w, WX + 2, WY);
    tick(w, A1.ballLifetimeSeconds! - 0.1);
    expect(w.lightningBalls).toHaveLength(1);
    tick(w, 0.2);
    expect(w.lightningBalls).toHaveLength(0);
  });

  it("fires at the character's total attack speed — its cadence divides by the live attack-speed multiplier", () => {
    const shotsIn = (bonus: number): { cooldown: number; mul: number; shots: number } => {
      const w = world();
      if (bonus !== 0) {
        w.stats.addAll('test:atk-speed', { attackSpeed: bonus });
        w.recomputeDerived();
      }
      bag(w, WX + 2, WY);
      useClassActive(w, WX + 2, WY);
      updateClassPassives(w, DT);
      const cooldown = w.lightningBalls[0]!.attackCooldown;
      const mul = characterAttackSpeedMul(w);
      tick(w, A1.ballLifetimeSeconds!);
      return { cooldown, mul, shots: w.fx.filter((f) => f.k === 'volt_ball_shot').length };
    };
    const plain = shotsIn(0);
    const fast = shotsIn(1);
    // The first shot fires on the ball's first tick and re-arms at exactly interval / multiplier.
    expect(plain.cooldown).toBeCloseTo(VB.basicAttack.interval / plain.mul, 9);
    expect(fast.cooldown).toBeCloseTo(VB.basicAttack.interval / fast.mul, 9);
    expect(fast.mul).toBeGreaterThan(plain.mul);
    expect(fast.shots, 'more attack speed did not fire more shots').toBeGreaterThan(plain.shots);
  });

  it('damage x (1 + 25% of the total movement-speed bonus) — the owner\'s "+40% move -> +10% damage"', () => {
    const w = world();
    w.derived.moveSpeed = BASE.moveSpeed * 1.4;
    expect(characterMoveSpeedBonus(w)).toBeCloseTo(0.4, 12);
    expect(lightningBallDamageMul(w, VB)).toBeCloseTo(1 + A1.moveSpeedDamageEfficiency! * 0.4, 12);
    expect(lightningBallDamageMul(w, VB)).toBeCloseTo(1.1, 12);
  });

  it("a ball shot deals one basic hit times that boost, measured on a bag", () => {
    const w = world();
    const e = bag(w, WX + 2, WY);
    useClassActive(w, WX + 2, WY);
    updateClassPassives(w, DT);
    expect(lost(e) / basicHitDamage(w)).toBeCloseTo(lightningBallDamageMul(w, VB), 9);
    // Voltbolt's own +30% movement band alone is a real boost at baseline.
    expect(lightningBallDamageMul(w, VB)).toBeGreaterThan(1);
  });

  it('a negative movement bonus is no malus', () => {
    const w = world();
    w.derived.moveSpeed = BASE.moveSpeed * 0.5;
    expect(characterMoveSpeedBonus(w)).toBeLessThan(0);
    expect(lightningBallDamageMul(w, VB)).toBe(1);
  });

  it("its shots chain too — the passive's link, off the ball's own target", () => {
    const w = world();
    bag(w, WX + 3, WY);
    const near = bag(w, WX + 4, WY);
    useClassActive(w, WX + 3, WY);
    tick(w, 0.3);
    expect(lost(near), 'the ball shot threw no chain').toBeGreaterThan(0);
    expect(w.damageByWeapon['class_active'] ?? 0).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ Overdrive */

describe('fb059 Overdrive — three chains, additive stacks, reset, and the end burst', () => {
  it('opens a window of the authored length', () => {
    const w = world();
    expect(useClassActive2(w)).toBe(true);
    expect(w.warden.overdriveRemaining).toBe(A2.overdriveSeconds);
    expect(w.warden.overdriveStacks).toBe(0);
  });

  it("chains three times (25%/12.5%/12.5%), each to the nearest unhit enemy, falling back to the original", () => {
    const w = world();
    const primary = bag(w, WX + 1, WY);
    const second = bag(w, WX + 2, WY);
    const third = bag(w, WX + 3, WY);
    useClassActive2(w);
    expect(voltChainMuls(w, VB)).toEqual([A2.overdriveChain1Mul, A2.overdriveChain2Mul, A2.overdriveChain3Mul]);
    attack(w);
    const hit = lost(primary);
    tick(w, 3 * (ARC.arcChainDelaySeconds ?? 0) + 0.1);
    // Link 1 from the primary -> second (nearest unhit); link 2 from second ->
    // third; link 3 from third finds no unhit enemy in r3 -> the original.
    expect(lost(second) / hit).toBeCloseTo(A2.overdriveChain1Mul!, 9);
    expect(lost(third) / hit).toBeCloseTo(A2.overdriveChain2Mul!, 9);
    expect(lost(primary) / hit).toBeCloseTo(1 + A2.overdriveChain3Mul!, 9);
    expect(w.chainHits).toBe(3);
  });

  it('each link lands one delay after the one before it', () => {
    const w = world();
    bag(w, WX + 1, WY);
    const second = bag(w, WX + 2, WY);
    const third = bag(w, WX + 3, WY);
    useClassActive2(w);
    attack(w);
    tick(w, (ARC.arcChainDelaySeconds ?? 0) + 0.03);
    expect(lost(second)).toBeGreaterThan(0);
    expect(lost(third), 'link 2 landed with link 1').toBe(0);
    tick(w, ARC.arcChainDelaySeconds ?? 0);
    expect(lost(third)).toBeGreaterThan(0);
  });

  it('every basic attack in the window adds one stack — additive within the source, not compounding', () => {
    const w = world();
    bag(w, WX + 1, WY);
    useClassActive2(w);
    const base = characterAttackSpeedMul(w);
    for (let i = 0; i < 4; i++) attack(w);
    expect(w.warden.overdriveStacks).toBe(4);
    expect(overdriveAttackSpeedMul(w)).toBeCloseTo(1 + 4 * A2.overdriveAtkSpdPerHit!, 12);
    expect(overdriveMoveSpeedMul(w)).toBeCloseTo(1 + 4 * A2.overdriveMoveSpdPerHit!, 12);
    expect(overdriveAttackSpeedMul(w)).not.toBeCloseTo(Math.pow(1 + A2.overdriveAtkSpdPerHit!, 4), 12);
    // One source multiplied against the rest (§2): the live multiplier grows by exactly that factor.
    expect(characterAttackSpeedMul(w) / base).toBeCloseTo(1 + 4 * A2.overdriveAtkSpdPerHit!, 12);
    expect(classMoveSpeedMul(w)).toBeCloseTo(1 + 4 * A2.overdriveMoveSpdPerHit!, 12);
    // ...and the basic attack's own cadence reads it: the next attack re-arms
    // at the interval over the multiplier its four stacks give.
    const mul = characterAttackSpeedMul(w);
    attack(w);
    expect(w.warden.attackCooldown).toBeCloseTo(VB.basicAttack.interval / mul, 12);
    expect(mul).toBeGreaterThan(base);
  });

  it('a basic attack outside the window adds nothing', () => {
    const w = world();
    bag(w, WX + 1, WY);
    attack(w);
    expect(w.warden.overdriveStacks).toBe(0);
    expect(overdriveAttackSpeedMul(w)).toBe(1);
  });

  it('stacks reset, and the chain pattern reverts, when the window ends', () => {
    const w = world();
    bag(w, WX + 1, WY);
    useClassActive2(w);
    for (let i = 0; i < 3; i++) attack(w);
    tick(w, A2.overdriveSeconds! + 0.1);
    expect(w.warden.overdriveRemaining).toBe(0);
    expect(w.warden.overdriveStacks).toBe(0);
    expect(overdriveAttackSpeedMul(w)).toBe(1);
    expect(classMoveSpeedMul(w)).toBe(1);
    expect(voltChainMuls(w, VB)).toEqual([ARC.arcChainDamageMul]);
  });

  it('the end burst: damage x (1 + total move bonus), radius x (1 + total attack bonus), read with the stacks on', () => {
    const w = world();
    bag(w, WX + 1, WY);
    useClassActive2(w);
    for (let i = 0; i < 6; i++) attack(w);
    // Let the attacks' own chain links land first, so the edge bag below feels only the burst.
    tick(w, 0.5);
    expect(w.voltChains).toHaveLength(0);
    const expected = overdriveBurst(w, VB);
    expect(expected.damage).toBeCloseTo(
      characterDamage(w, VB, A2.damage) * (1 + characterMoveSpeedBonus(w)),
      9,
    );
    expect(expected.radius).toBeCloseTo(A2.radius * w.derived.areaMul * (1 + characterAttackSpeedBonus(w)), 9);
    expect(characterAttackSpeedBonus(w), 'the stacks should have raised the attack bonus').toBeGreaterThan(0);
    // A bag inside the grown radius but outside the bare one is struck.
    const edge = bag(w, WX + A2.radius * w.derived.areaMul + 0.05, WY + 0.01);
    expect(dist(WX, WY, edge.x, edge.y)).toBeLessThan(expected.radius);
    tick(w, A2.overdriveSeconds! + 0.1);
    const burst = w.fx.find((f) => f.k === 'overdrive_burst');
    expect(burst, 'no burst fired').toBeDefined();
    expect(burst!.a).toBeCloseTo(expected.radius, 9);
    expect(lost(edge)).toBeCloseTo(expected.damage, 6);
  });

  it('without stacks or bonuses the burst is the plain authored nova (Voltbolt\'s own move band still scales its damage)', () => {
    const w = world();
    const e = bag(w, WX + 1, WY);
    useClassActive2(w);
    const expected = overdriveBurst(w, VB);
    expect(expected.radius).toBeCloseTo(A2.radius * w.derived.areaMul, 12);
    tick(w, A2.overdriveSeconds! + 0.1);
    expect(lost(e)).toBeCloseTo(expected.damage, 6);
    expect(expected.damage).toBeGreaterThan(characterDamage(w, VB, A2.damage));
  });

});

/* ------------------------------------------------------- Lightning Accelerate */

describe('fb059 Lightning Accelerate — projectile speed and the two 50% conversions', () => {
  function tower(w: World, key: string): Structure {
    const r = buildTower(w, w.content.towerByKey.get(key)!.id, BUILD_TX, BUILD_TY);
    expect(r.ok).toBe(true);
    return (r as { ok: true; structure: Structure }).structure;
  }

  it('tower projectiles fly x(1 + projectileSpeedBonus)', () => {
    const w = world();
    expect(towerProjectileSpeedMul(w)).toBe(1 + TP.projectileSpeedBonus!);
    expect(towerProjectileSpeedMul(world('archer'))).toBe(1);
    const s = tower(w, 'ballista');
    bag(w, s.tx + 3.5, s.ty + 0.5);
    s.cooldown = 0;
    updateTowers(w, DT);
    const p = w.projectiles[0]!;
    const authored = w.content.towerByKey.get('ballista')!.attack!.projectileSpeed ?? 14;
    expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(authored * (1 + TP.projectileSpeedBonus!), 9);
  });

  it("towers gain 50% of the character's total attack-speed bonus as attack speed", () => {
    const w = world();
    const other = world('archer');
    const speedOf = (x: World) => attackSpeedFor(x, tower(x, 'arrow_spire'));
    // Archer's towers: exactly the stat sheet (attackSpeed 1, no tower passive on cadence).
    const ratio = speedOf(w) / speedOf(other);
    expect(ratio).toBeCloseTo(1 + TP.towerStatConversionEfficiency! * Math.max(0, characterAttackSpeedBonus(w)), 12);
    // With Overdrive stacks the bonus — and the towers' share — grows live.
    bag(w, WX + 1, WY);
    useClassActive2(w);
    for (let i = 0; i < 4; i++) attack(w);
    const s = w.structures[0]!;
    expect(attackSpeedFor(w, s) / (w.derived.attackSpeedMul * w.derived.towerAttackSpeedMul)).toBeCloseTo(
      1 + TP.towerStatConversionEfficiency! * characterAttackSpeedBonus(w),
      12,
    );
  });

  it("and 50% of its total movement-speed bonus as damage", () => {
    const w = world();
    const other = world('archer');
    const dmgOf = (x: World) => towerDamage(x, tower(x, 'arrow_spire'), 10);
    expect(dmgOf(w) / dmgOf(other)).toBeCloseTo(
      1 + TP.towerStatConversionEfficiency! * Math.max(0, characterMoveSpeedBonus(w)),
      12,
    );
    // Voltbolt's own +30% movement band is already a bonus at baseline.
    expect(characterMoveSpeedBonus(w)).toBeCloseTo(VB.moveSpeedBonus, 12);
  });
});

/* ------------------------------------------------------ unlock, loader, VFX */

describe('fb059 unlock quest — live_wire: 300 character chain hits in one run', () => {
  it('chain hits count Arc links and Chain Surge jumps, and bank as a per-run best, not a sum', () => {
    const quest = content.quests.quests.find((q) => q.key === 'live_wire')!;
    expect(quest.metric).toBe('max_chain_hits');
    expect(quest.reward).toEqual({ kind: 'class', value: KEY });
    expect(VB.unlockQuest).toBe(quest.key);

    // Stormcaller's Chain Surge: every jump past the first counts.
    const s = world('stormcaller');
    for (let i = 0; i < 3; i++) bag(s, WX + 1 + i, WY);
    useClassActive(s, WX + 1, WY);
    expect(s.chainHits).toBeGreaterThanOrEqual(2);

    const finish = (hits: number, progress: number) => {
      const run = new Run(cfg({ classKey: 'engineer' }));
      run.world.chainHits = hits;
      const report = run.report();
      expect(metricsFor(report, run.world).max_chain_hits).toBe(hits);
      return applyRunResult({ ...defaultMeta(), questProgress: { max_chain_hits: progress } }, report, run.world);
    };
    // Two short runs do not add up to one long one.
    const partial = finish(quest.target - 1, quest.target - 1);
    expect(partial.completedQuests).not.toContain(quest.key);
    const done = finish(quest.target, 0);
    expect(done.completedQuests).toContain(quest.key);
    expect(done.unlockedClasses).toContain(KEY);
  });
});

describe('fb059 QA — live_wire is reachable from the normal-profile roster', () => {
  it('Voltbolt is a visible class, so its unlock must be progressable without a hidden class', () => {
    expect(NORMAL_PROFILE_CLASS_KEYS).toContain(KEY);
    expect(NORMAL_PROFILE_CLASS_KEYS).not.toContain('stormcaller');
  });

  it('a Swordsman (visible) advances chainHits through a Tesla Coil\'s step-3 electric chain', () => {
    const w = world('swordsman');
    const def = w.content.towerByKey.get('tesla_coil')!;
    const r = buildTower(w, def.id, BUILD_TX, BUILD_TY);
    expect(r.ok).toBe(true);
    const s = (r as { ok: true; structure: Structure }).structure;
    for (let i = 0; i < 3; i++) {
      w.gold = 1e6;
      expect(upgradeTower(w, s.tx, s.ty), 'harness could not upgrade the coil').toBe(true);
    }
    bag(w, s.tx + 1.5, s.ty + 0.5);
    bag(w, s.tx + 2.5, s.ty + 0.5);
    s.cooldown = 0;
    updateTowers(w, DT);
    expect(w.chainHits, 'a tower chain jump did not count toward live_wire').toBeGreaterThan(0);
  });
});

describe('fb059 QA — Overdrive recast and a non-finite aim', () => {
  it("E while the window is open declines (bills nothing) — Voltbolt's own cards make the cooldown shorter than the window", () => {
    const w = world();
    bag(w, WX + 1, WY);
    w.skillCardRanks = { voltbolt_active2_cdr: 2, voltbolt_overdrive_duration: 2 };
    expect(useClassActive2(w)).toBe(true);
    const window0 = w.warden.overdriveRemaining;
    attack(w);
    tick(w, 1);
    w.warden.active2Cooldown = 0; // the cooldown is up before the window closes
    expect(useClassActive2(w), 'a recast inside the open window fired').toBe(false);
    expect(w.warden.active2Cooldown, 'the declined recast was billed').toBe(0);
    expect(w.fx.filter((f) => f.k === 'overdrive_burst'), 'the recast cut the window short').toHaveLength(0);
    expect(w.warden.overdriveStacks).toBe(1);
    expect(w.warden.overdriveRemaining).toBeCloseTo(window0 - 1, 6);
  });

  it.each([
    [Number.NaN, Number.NaN],
    [Number.POSITIVE_INFINITY, WY],
    [WX, Number.NEGATIVE_INFINITY],
  ])('an aim of (%s, %s) is treated as unaimed — the ball stays finite', (ax, ay) => {
    const w = world();
    bag(w, WX + 2, WY);
    expect(useClassActive(w, ax, ay)).toBe(true);
    const b = w.lightningBalls[0]!;
    for (const v of [b.x, b.y, b.tx, b.ty]) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('fb059 loader — unpayable Voltbolt numbers are refused', () => {
  function withRow(mutate: (row: Record<string, Record<string, unknown>>) => void): () => void {
    const doc = JSON.parse(JSON.stringify(content.raw.classes)) as { classes: Record<string, Record<string, unknown>>[] };
    mutate(doc.classes.find((c) => (c as unknown as { key: string }).key === KEY)!);
    return () => loadContent({ classes: doc });
  }
  it.each([
    ['a ball that cannot move', (r: Record<string, Record<string, unknown>>) => void (r.active1!.ballSpeed = 0)],
    ['a ball with no life', (r: Record<string, Record<string, unknown>>) => void (r.active1!.ballLifetimeSeconds = 0)],
    ['a negative move-speed efficiency', (r: Record<string, Record<string, unknown>>) => void (r.active1!.moveSpeedDamageEfficiency = -0.1)],
    ['a missing ballSpeed', (r: Record<string, Record<string, unknown>>) => void delete r.active1!.ballSpeed],
    ['an Overdrive window that never opens', (r: Record<string, Record<string, unknown>>) => void (r.active2!.overdriveSeconds = 0)],
    ['a negative chain share', (r: Record<string, Record<string, unknown>>) => void (r.active2!.overdriveChain2Mul = -0.1)],
    ['a zero middle chain share (it would close up the three-link pattern)', (r: Record<string, Record<string, unknown>>) => void (r.active2!.overdriveChain2Mul = 0)],
    ['a negative stack', (r: Record<string, Record<string, unknown>>) => void (r.active2!.overdriveAtkSpdPerHit = -0.01)],
    ['a chain that searches nowhere', (r: Record<string, Record<string, unknown>>) => void (r.passive!.arcChainRadius = 0)],
    ['a chain that lands before its hit', (r: Record<string, Record<string, unknown>>) => void (r.passive!.arcChainDelaySeconds = -0.1)],
    ['a tower conversion that slows', (r: Record<string, Record<string, unknown>>) => void (r.towerPassive!.towerStatConversionEfficiency = -0.5)],
    ['projectiles that fly backwards', (r: Record<string, Record<string, unknown>>) => void (r.towerPassive!.projectileSpeedBonus = -2)],
  ])('refuses %s', (_name, mutate) => {
    expect(withRow(mutate)).toThrow();
  });

  it('accepts the shipped row', () => {
    expect(withRow(() => {})).not.toThrow();
  });
});

describe('fb059 VFX — chain arcs, the ball, the aura ramp and the burst ring', () => {
  it('registers every named effect with a color', () => {
    for (const k of ['chain', 'ball', 'aura', 'burst'] as const) {
      expect(VOLT_VFX[k].fire.length, k).toBeGreaterThan(0);
      expect(VOLT_VFX[k].color, k).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('the Overdrive aura intensifies with stacks, clamped past its cap', () => {
    for (let n = 1; n <= 20; n++) {
      expect(overdriveAuraStyle(n).alpha, `stack ${n}`).toBeGreaterThan(overdriveAuraStyle(n - 1).alpha);
      expect(overdriveAuraStyle(n).radiusPx, `stack ${n}`).toBeGreaterThan(overdriveAuraStyle(n - 1).radiusPx);
    }
    expect(overdriveAuraStyle(50)).toEqual(overdriveAuraStyle(20));
  });
});

/* ---------------------------------------------------------------- determinism */

describe('fb059 determinism — Voltbolt actives in the input log replay to the same end hash', () => {
  function fight(): Run {
    const run = new Run(cfg({ classKey: KEY }));
    const w = run.world;
    w.gold = 1e6;
    const wx = w.warden.x;
    const wy = w.warden.y;
    for (let i = 0; i < 5; i++) {
      const e = spawnEnemy(w, BAG.key, wx + 1 + (i % 3), wy + 1 + Math.floor(i / 3))!;
      e.hp = 400;
      e.maxHp = 400;
    }
    w.rebuildBuckets();
    const log: TickInput[] = [];
    for (let t = 0; t < 900; t++) {
      const cmds: Command[] = [];
      if (t === 5) cmds.push({ k: 'class_active2' });
      if (t === 10) cmds.push({ k: 'class_active', aimX: wx + 2, aimY: wy + 1 });
      log.push({ ...emptyInput(), cmds });
    }
    for (const input of log) run.step(input);
    return run;
  }

  it('a constructed fight — Arc, Overdrive chains and burst, a Lightning Ball — reaches one hash twice', () => {
    const a = fight();
    const b = fight();
    expect(a.hash()).toBe(b.hash());
    const w = a.world;
    expect(w.chainHits, 'no chain ever landed').toBeGreaterThan(0);
    expect(w.damageByWeapon['class_active'] ?? 0, 'the ball never landed a shot').toBeGreaterThan(0);
    expect(w.damageByWeapon['class_active2'] ?? 0, 'the burst never landed').toBeGreaterThan(0);
    expect(w.damageByWeapon['class_basic'] ?? 0, 'no basic hit').toBeGreaterThan(0);
  });

  it('G2-style: several seeds of movement noise with Voltbolt actives in the log', () => {
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
      expect(y.damageTotal).toBe(x.damageTotal);
    }
  });

  it('the hash sees the new state: a pending link, a live ball, the Overdrive window and stacks, the tally', () => {
    const ref = hashWorld(world());
    const variants: [string, (w: World) => void][] = [
      [
        'voltChains',
        (w) =>
          void w.voltChains.push({
            timer: 0.1,
            fresh: true,
            fromId: 1,
            fromX: 1,
            fromY: 1,
            originalId: 1,
            hitIds: [1],
            baseDamage: 5,
            muls: [0.25],
            source: 'class_basic',
          }),
      ],
      [
        'lightningBalls',
        (w) => void w.lightningBalls.push({ id: 99, x: 1, y: 1, tx: 2, ty: 2, speed: 12, remaining: 2, attackCooldown: 0 }),
      ],
      ['overdriveRemaining', (w) => void (w.warden.overdriveRemaining = 3)],
      ['overdriveStacks', (w) => void (w.warden.overdriveStacks = 2)],
      ['chainHits', (w) => void (w.chainHits = 1)],
    ];
    for (const [name, mutate] of variants) {
      const w = world();
      mutate(w);
      expect(hashWorld(w), `${name} is not hashed`).not.toBe(ref);
    }
  });
});
