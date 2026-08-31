/**
 * p2b — SPEC-FINAL §6.1's last clause: wielded attacks are character attacks.
 * `wieldedAttacks` (p2a) is the formula; `updateWieldedAttacks` (this item)
 * is the live fire loop that scales the result by the character's own Power,
 * attack speed and Area, fires through the same `combat.ts` primitives every
 * tower and weapon shares, and so gets lifesteal (§2) and per-volley
 * attack-counting (§4.1's "counts as 1 attack") for free rather than as a
 * special case.
 */

import { describe, expect, it } from 'vitest';

import { loadContent, type TowerDef } from '../src/sim/content';
import { spawnEnemy } from '../src/sim/enemies';
import { Run, damageWarden, hashWorld, updateWarden } from '../src/sim/run';
import { buildTower, upgradeTower } from '../src/sim/towers';
import { emptyInput } from '../src/sim/types';
import type { Enemy } from '../src/sim/types';
import { updateProjectiles } from '../src/sim/combat';
import { attackProfile, upgradeStatMul } from '../src/sim/upgrades';
import { updateWieldedAttacks } from '../src/sim/vswield';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const content = loadContent();
const ARROW = content.towerByKey.get('arrow_spire')!;
const FROST = content.towerByKey.get('frost_obelisk')!;
const BALLISTA = content.towerByKey.get('ballista')!;
const BRAZIER = content.towerByKey.get('ember_brazier')!;
const TESLA = content.towerByKey.get('tesla_coil')!;
const MORTAR = content.towerByKey.get('mortar')!;
const VENOM = content.towerByKey.get('venom_spore')!;

const DT = 1 / 60;

/** Free, buildable tiles that never collide with each other (p2a's helper). */
function tiles(w: World, n: number): { tx: number; ty: number }[] {
  const out: { tx: number; ty: number }[] = [];
  for (let ty = 4; ty < 20 && out.length < n; ty++) {
    for (let tx = 4; tx < 20 && out.length < n; tx++) {
      if (w.grid.buildable(tx, ty) && !w.grid.wouldBlockPath([[tx, ty]])) out.push({ tx, ty });
    }
  }
  if (out.length < n) throw new Error('not enough buildable tiles');
  return out;
}

function build(w: World, def: TowerDef, tx: number, ty: number): void {
  w.warden.x = tx + 0.5;
  w.warden.y = ty + 0.5;
  w.gold = 1e6;
  expect(buildTower(w, def.id, tx, ty).ok).toBe(true);
}

/** Rooted and effectively unkillable, so damage totals stay readable. */
function dummy(w: World, x: number, y: number): Enemy {
  const e = spawnEnemy(w, 'husk', x, y)!;
  e.hp = 1e6;
  e.maxHp = 1e6;
  e.speed = 0;
  return e;
}

describe('p2b — wielded attacks fire as character attacks (§6.1 last clause)', () => {
  it('a wielded single-kind attack scales by Power and damages the nearest enemy', () => {
    const w = new World(cfg(), content);
    const [t1] = tiles(w, 1);
    build(w, ARROW, t1.tx, t1.ty);
    w.phase = 'act2';
    w.warden.x = t1.tx + 0.5;
    w.warden.y = t1.ty + 0.5;
    const e = dummy(w, w.warden.x + 1, w.warden.y);
    w.rebuildBuckets();

    updateWieldedAttacks(w, DT);

    // One arrow_spire, §6.1's +10%*count on top of its own damage; character
    // Power is the default class's untouched 1x.
    const expected = ARROW.attack!.damage * 1.1;
    expect(e.hp).toBeCloseTo(1e6 - expected, 6);
    expect(w.damageByWeapon['arrow_spire']).toBeCloseTo(expected, 6);
  });

  it('Power multiplies a wielded attack on top of §6.1\'s own formula', () => {
    const w = new World(cfg(), content);
    const [t1] = tiles(w, 1);
    build(w, ARROW, t1.tx, t1.ty);
    w.phase = 'act2';
    w.stats.add('boon:power', 'power', 1); // +100% Power, a real second source
    w.recomputeDerived();
    w.warden.x = t1.tx + 0.5;
    w.warden.y = t1.ty + 0.5;
    const e = dummy(w, w.warden.x + 1, w.warden.y);
    w.rebuildBuckets();

    updateWieldedAttacks(w, DT);

    const expected = ARROW.attack!.damage * 1.1 * 2;
    expect(e.hp).toBeCloseTo(1e6 - expected, 6);
  });

  it('Area widens a wielded attack\'s reach: unreachable at 1x, hit once Area doubles it', () => {
    const w = new World(cfg(), content);
    const [t1] = tiles(w, 1);
    build(w, ARROW, t1.tx, t1.ty);
    w.phase = 'act2';
    w.warden.x = t1.tx + 0.5;
    w.warden.y = t1.ty + 0.5;
    const far = ARROW.attack!.range + 2; // outside the base 5-tile range
    const e = dummy(w, w.warden.x + far, w.warden.y);
    w.rebuildBuckets();

    updateWieldedAttacks(w, DT);
    expect(e.hp).toBe(1e6); // out of reach at 1x Area

    w.stats.add('boon:area', 'area', 1); // +100% Area
    w.recomputeDerived();
    w.wieldedCooldown.set(ARROW.id, 0); // force it ready again this tick
    updateWieldedAttacks(w, DT);
    expect(e.hp).toBeLessThan(1e6);
  });

  it('attack speed shortens the interval between wielded volleys', () => {
    const w = new World(cfg(), content);
    const [t1] = tiles(w, 1);
    build(w, ARROW, t1.tx, t1.ty);
    w.phase = 'act2';
    w.stats.add('boon:haste', 'attackSpeed', 1); // +100% attack speed
    w.recomputeDerived();
    w.warden.x = t1.tx + 0.5;
    w.warden.y = t1.ty + 0.5;
    dummy(w, w.warden.x + 1, w.warden.y);
    w.rebuildBuckets();

    updateWieldedAttacks(w, DT); // first shot, arms the cooldown
    const cd = w.wieldedCooldown.get(ARROW.id)!;
    // Mirrors `updateTowers`'s decay model: decrement by `dt * attackSpeedMul`
    // every tick, add back the raw interval on reset — so attack speed speeds
    // up the in-flight countdown, not just the next one.
    expect(cd).toBeCloseTo(ARROW.attack!.interval - 2 * DT, 6);
  });

  it("Beacon Totem's shrineHaste multiplies the wielded cooldown, not adds (Q102 ORDER)", () => {
    // Q102: `intervalFor` (weapons.ts) was the one and only reader of
    // `w.shrineHaste` before p2e deleted the soul-weapon fire loop it
    // belonged to, leaving the effect computed every tick but silently
    // inert. The owner verdict says wire it into the wielded-attack cooldown
    // (this is what "character attack speed" now means post-p2b) and
    // multiply per §2/Q64 — the same rule `towers.ts`'s `attackSpeedFor`
    // already gives its own `auraBonus`, not `attackSpeedMul + shrineHaste`.
    const w = new World(cfg(), content);
    const [t1] = tiles(w, 1);
    build(w, ARROW, t1.tx, t1.ty);
    w.phase = 'act2';
    w.stats.add('boon:haste', 'attackSpeed', 0.4); // a real second source, like c4-stacking's own QA-bug-3 case
    w.recomputeDerived();
    w.warden.x = t1.tx + 0.5;
    w.warden.y = t1.ty + 0.5;
    dummy(w, w.warden.x + 1, w.warden.y);
    w.rebuildBuckets();
    w.shrineHaste = 0.15;

    updateWieldedAttacks(w, DT); // first shot, arms the cooldown
    const cd = w.wieldedCooldown.get(ARROW.id)!;
    const speedMul = 1.4 * 1.15; // multiplicative: 1.61, not the additive 1.55
    expect(speedMul).toBeCloseTo(1.61, 12);
    expect(cd).toBeCloseTo(ARROW.attack!.interval - DT * speedMul, 6);
    expect(cd).not.toBeCloseTo(ARROW.attack!.interval - DT * 1.55, 6);
  });

  it('lifesteal heals the character from a wielded tower attack', () => {
    const w = new World(cfg(), content);
    const [t1] = tiles(w, 1);
    build(w, ARROW, t1.tx, t1.ty);
    w.phase = 'act2';
    w.stats.add('boon:leech', 'leech', 0.5); // large, so the heal is unmissable
    w.recomputeDerived();
    w.warden.x = t1.tx + 0.5;
    w.warden.y = t1.ty + 0.5;
    w.warden.hp = 1;
    dummy(w, w.warden.x + 1, w.warden.y);
    w.rebuildBuckets();

    updateWieldedAttacks(w, DT);
    expect(w.warden.leechAccumulator).toBeGreaterThan(0);

    // The accumulator is a one-tick hand-off drained at the top of the next
    // `updateWarden` (x002) — same timing a soul weapon's own lifesteal uses.
    updateWarden(w, emptyInput(), DT);
    expect(w.warden.hp).toBeGreaterThan(1);
  });

  it('a wielded volley that hits several enemies at once counts as exactly 1 attack', () => {
    const w = new World(cfg(), content);
    const [t1] = tiles(w, 1);
    build(w, FROST, t1.tx, t1.ty); // aura kind: every enemy in range in one pass
    w.phase = 'act2';
    w.warden.x = t1.tx + 0.5;
    w.warden.y = t1.ty + 0.5;
    const enemies = [
      dummy(w, w.warden.x + 0.5, w.warden.y),
      dummy(w, w.warden.x, w.warden.y + 0.5),
      dummy(w, w.warden.x - 0.5, w.warden.y),
    ];
    w.rebuildBuckets();

    let onAttackCalls = 0;
    w.onAttack = () => {
      onAttackCalls++;
    };
    updateWieldedAttacks(w, DT);

    for (const e of enemies) expect(e.hp).toBeLessThan(1e6);
    expect(w.attacksFired['frost_obelisk']).toBe(1);
    expect(onAttackCalls).toBe(1);
  });

  it('a wielded type with no target in range does not fire, and retries every tick', () => {
    const w = new World(cfg(), content);
    const [t1] = tiles(w, 1);
    build(w, ARROW, t1.tx, t1.ty);
    w.phase = 'act2';
    w.warden.x = 0.5;
    w.warden.y = 0.5; // far from the built tower and from any enemy

    updateWieldedAttacks(w, DT);
    expect(w.attacksFired['arrow_spire']).toBeUndefined();

    const e = dummy(w, w.warden.x + 1, w.warden.y);
    w.rebuildBuckets();
    updateWieldedAttacks(w, DT);
    expect(w.attacksFired['arrow_spire']).toBe(1);
    expect(e.hp).toBeLessThan(1e6);
  });

  it('a run with no built towers wields nothing and stays free of side effects', () => {
    const w = new World(cfg(), content);
    w.phase = 'act2';
    dummy(w, w.warden.x + 1, w.warden.y);
    w.rebuildBuckets();
    expect(() => updateWieldedAttacks(w, DT)).not.toThrow();
    expect(w.attacksFired).toEqual({});
  });

  it('a cone-kind wielded burn scales with the group\'s upgrade tier, not with Power', () => {
    const w = new World(cfg(), content);
    const [t1] = tiles(w, 1);
    build(w, BRAZIER, t1.tx, t1.ty);
    w.warden.x = t1.tx + 0.5;
    w.warden.y = t1.ty + 0.5;
    w.gold = 1e6;
    expect(upgradeTower(w, t1.tx, t1.ty)).toBe(true);
    // tier 3: 1 stat step (step 1) plus p5c's `burnStacks` milestone (step 2,
    // "+1 Burning per hit" — a dps multiplier, see `AttackProfile.burnStacks`'s
    // doc comment in upgrades.ts), which is live by tier 3 and folded into
    // `expectedBurnDps` below rather than assumed away.
    expect(upgradeTower(w, t1.tx, t1.ty)).toBe(true);
    w.stats.add('boon:power', 'power', 3); // +300% Power — must not touch the burn rider
    w.recomputeDerived();
    w.phase = 'act2';
    const e = dummy(w, w.warden.x + 1, w.warden.y);
    w.rebuildBuckets();

    updateWieldedAttacks(w, DT);

    const burn = e.dots.find((d) => d.type === 'burning');
    expect(burn).toBeDefined();
    const expectedBurnDps =
      BRAZIER.attack!.burn!.dps * attackProfile(BRAZIER, 3).burnStacks * upgradeStatMul(w, BRAZIER, 3);
    expect(burn!.dps).toBeCloseTo(expectedBurnDps, 6);
  });

  it('a wielded pierce-kind attack fires a bolt that damages the target', () => {
    const w = new World(cfg(), content);
    const [t1] = tiles(w, 1);
    build(w, BALLISTA, t1.tx, t1.ty);
    w.phase = 'act2';
    w.warden.x = t1.tx + 0.5;
    w.warden.y = t1.ty + 0.5;
    dummy(w, w.warden.x + 1, w.warden.y);
    w.rebuildBuckets();

    updateWieldedAttacks(w, DT);
    // The bolt is a projectile (`spawnProjectile`), not an instant hit; it
    // needs `updateProjectiles` ticks to travel and land.
    for (let i = 0; i < 60 && (w.damageByWeapon['ballista'] ?? 0) === 0; i++) {
      w.rebuildBuckets();
      updateProjectiles(w, DT);
    }

    expect(w.damageByWeapon['ballista']).toBeGreaterThan(0);
  });

  it('a wielded chain-kind attack damages the target', () => {
    const w = new World(cfg(), content);
    const [t1] = tiles(w, 1);
    build(w, TESLA, t1.tx, t1.ty);
    w.phase = 'act2';
    w.warden.x = t1.tx + 0.5;
    w.warden.y = t1.ty + 0.5;
    dummy(w, w.warden.x + 1, w.warden.y);
    w.rebuildBuckets();

    updateWieldedAttacks(w, DT);

    expect(w.damageByWeapon['tesla_coil']).toBeGreaterThan(0);
  });

  it('a wielded lob-kind attack fires a shell that damages the target on landing', () => {
    const w = new World(cfg(), content);
    const [t1] = tiles(w, 1);
    build(w, MORTAR, t1.tx, t1.ty);
    w.phase = 'act2';
    w.warden.x = t1.tx + 0.5;
    w.warden.y = t1.ty + 0.5;
    dummy(w, w.warden.x + MORTAR.attack!.minRange! + 1, w.warden.y);
    w.rebuildBuckets();

    updateWieldedAttacks(w, DT);
    // The shell travels; step `updateProjectiles` until it lands.
    for (let i = 0; i < 300 && (w.damageByWeapon['mortar'] ?? 0) === 0; i++) {
      w.rebuildBuckets();
      updateProjectiles(w, DT);
    }

    expect(w.damageByWeapon['mortar']).toBeGreaterThan(0);
  });

  it('a wielded poison-kind attack damages the target', () => {
    const w = new World(cfg(), content);
    const [t1] = tiles(w, 1);
    build(w, VENOM, t1.tx, t1.ty);
    w.phase = 'act2';
    w.warden.x = t1.tx + 0.5;
    w.warden.y = t1.ty + 0.5;
    dummy(w, w.warden.x + 1, w.warden.y);
    w.rebuildBuckets();

    updateWieldedAttacks(w, DT);

    expect(w.damageByWeapon['venom_spore']).toBeGreaterThan(0);
  });

  it('the cached wielded-attack set is invalidated when the tower roster changes', () => {
    const w = new World(cfg(), content);
    const [t1, t2] = tiles(w, 2);
    build(w, ARROW, t1.tx, t1.ty);
    w.phase = 'act2';
    w.warden.x = t1.tx + 0.5;
    w.warden.y = t1.ty + 0.5;
    dummy(w, w.warden.x + 1, w.warden.y);
    w.rebuildBuckets();

    updateWieldedAttacks(w, DT); // primes the cache at count 1
    const solo = w.damageByWeapon['arrow_spire'];
    expect(solo).toBeCloseTo(ARROW.attack!.damage * 1.1, 6);

    // A second arrow_spire built after the cache was primed — `buildTower`'s
    // `markAuraDirty` must invalidate it, or the next volley keeps paying
    // count 1's smaller +10% bonus instead of count 2's.
    w.phase = 'act1_build';
    build(w, ARROW, t2.tx, t2.ty); // moves the Warden to t2 to satisfy build range
    w.phase = 'act2';
    w.warden.x = t1.tx + 0.5; // back within range of the dummy near t1
    w.warden.y = t1.ty + 0.5;
    w.wieldedCooldown.set(ARROW.id, 0); // force it ready again this tick
    w.rebuildBuckets();
    updateWieldedAttacks(w, DT);

    const pair = w.damageByWeapon['arrow_spire'] - solo;
    expect(pair).toBeCloseTo(ARROW.attack!.damage * 1.2, 6);
  });

  it('the cached wielded-attack set is invalidated when a tower dies in combat, not only on sell', () => {
    // Regression: World.removeStructure is the one choke point every death
    // path shares (sell, breach/siege kill via enemies.ts's damageStructure,
    // sundering pocket-clear) but only sellTower's own explicit
    // markAuraDirty(w) call ever invalidated the cache — a tower killed by an
    // enemy left the pre-death count baked in for the rest of the VS wave
    // (code review + QA finding, both independently reproduced).
    const w = new World(cfg(), content);
    const [t1, t2] = tiles(w, 2);
    build(w, ARROW, t1.tx, t1.ty);
    w.phase = 'act1_build';
    build(w, ARROW, t2.tx, t2.ty);
    w.phase = 'act2';
    w.warden.x = t1.tx + 0.5;
    w.warden.y = t1.ty + 0.5;
    dummy(w, w.warden.x + 1, w.warden.y);
    w.rebuildBuckets();

    updateWieldedAttacks(w, DT); // primes the cache at count 2
    const pair = w.damageByWeapon['arrow_spire'];
    expect(pair).toBeCloseTo(ARROW.attack!.damage * 1.2, 6);

    // Kill the second tower the way enemy siege does (enemies.ts's
    // damageStructure calls exactly this), not via sellTower.
    const dead = w.structureAt(t2.tx, t2.ty)!;
    w.removeStructure(dead);
    w.wieldedCooldown.set(ARROW.id, 0); // force it ready again this tick
    w.rebuildBuckets();
    updateWieldedAttacks(w, DT);

    const solo = w.damageByWeapon['arrow_spire'] - pair;
    expect(solo).toBeCloseTo(ARROW.attack!.damage * 1.1, 6);
  });

  it('b020: updateWieldedAttacks is a no-op once w.dying is set, mirroring useClassActive/useClassActive2\'s guard', () => {
    // QA-filed: unlike a Command-driven Active, a wielded attack fires every
    // tick straight from `updateAct2` with no Command gate to catch it at —
    // it kept firing for the whole DEFEAT_SLOWMO window after the Warden
    // died, since `w.outcome` (what a naive guard might check) only flips at
    // the end of that window, not at its start.
    const w = new World(cfg(), content);
    const [t1] = tiles(w, 1);
    build(w, ARROW, t1.tx, t1.ty);
    w.phase = 'act2';
    w.warden.x = t1.tx + 0.5;
    w.warden.y = t1.ty + 0.5;
    dummy(w, w.warden.x + 1, w.warden.y);
    w.rebuildBuckets();
    w.dying = 'defeat_warden';
    w.dyingTimer = 1.5;

    updateWieldedAttacks(w, DT);

    expect(w.attacksFired['arrow_spire']).toBeUndefined();
    expect(w.damageByWeapon['arrow_spire']).toBeUndefined();
  });

  it('b020: shrineHaste cannot speed up a wielded attack while dying either, since both live in the same guarded function', () => {
    const w = new World(cfg(), content);
    const [t1] = tiles(w, 1);
    build(w, ARROW, t1.tx, t1.ty);
    w.phase = 'act2';
    w.warden.x = t1.tx + 0.5;
    w.warden.y = t1.ty + 0.5;
    dummy(w, w.warden.x + 1, w.warden.y);
    w.rebuildBuckets();
    w.shrineHaste = 0.5;
    w.dying = 'defeat_warden';
    w.dyingTimer = 1.5;

    updateWieldedAttacks(w, DT);

    expect(w.wieldedCooldown.get(ARROW.id)).toBeUndefined();
    expect(w.attacksFired['arrow_spire']).toBeUndefined();
  });

  it('b020: a real defeat through Run.step fires no wielded volley during the slow-mo window', () => {
    const run = new Run(cfg());
    const w = run.world;
    const [t1] = tiles(w, 1);
    build(w, ARROW, t1.tx, t1.ty);
    w.phase = 'act2';
    w.sundered = true;
    w.warden.x = t1.tx + 0.5;
    w.warden.y = t1.ty + 0.5;
    w.updateNav(true);
    dummy(w, w.warden.x + 1, w.warden.y);
    w.rebuildBuckets();
    // Arm the cooldown at 0 so the very next act2 tick would fire if the
    // dying guard were missing.
    w.wieldedCooldown.set(ARROW.id, 0);

    damageWarden(w, 999999);
    expect(w.dying).toBe('defeat_warden');

    for (let i = 0; i < 95 && !run.done; i++) run.step(emptyInput());

    expect(run.done).toBe(true);
    expect(run.world.outcome).toBe('defeat_warden');
    expect(w.attacksFired['arrow_spire']).toBeUndefined();
  });

  it('two identical runs of the fire loop replay to the same end-state hash', () => {
    function run(): string {
      const w = new World(cfg(), content);
      const [t1] = tiles(w, 1);
      build(w, ARROW, t1.tx, t1.ty);
      w.phase = 'act2';
      w.warden.x = t1.tx + 0.5;
      w.warden.y = t1.ty + 0.5;
      dummy(w, w.warden.x + 1, w.warden.y);
      w.rebuildBuckets();
      for (let i = 0; i < 90; i++) {
        updateWieldedAttacks(w, DT);
        updateWarden(w, emptyInput(), DT);
      }
      return hashWorld(w);
    }
    expect(run()).toBe(run());
  });
});
