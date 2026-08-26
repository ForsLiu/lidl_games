/**
 * p2c — SPEC-FINAL §6.2: towers stand inert but present during a VS wave.
 * They deal no attack damage of their own, they can still be damaged, and
 * each contributes exactly the §5 VS special named in its data row:
 * electric wire grid, poison trail, brazier death-explosion, ice aura,
 * beacon attack speed, sprout XP gem.
 */

import { describe, expect, it } from 'vitest';

import { loadContent, type TowerDef } from '../src/sim/content';
import { applyBurn, damageEnemy, damageStructure, spawnEnemy } from '../src/sim/enemies';
import { linkSpires } from '../src/sim/sundering';
import { buildTower } from '../src/sim/towers';
import type { Enemy } from '../src/sim/types';
import { buildTerrainEffects, updateTerrainEffects } from '../src/sim/weapons';
import { updateVsSpecials } from '../src/sim/vsspecials';
import { wieldedAttacks } from '../src/sim/vswield';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const content = loadContent();
const ARROW = content.towerByKey.get('arrow_spire')!;
const TESLA = content.towerByKey.get('tesla_coil')!;
const VENOM = content.towerByKey.get('venom_spore')!;
const BRAZIER = content.towerByKey.get('ember_brazier')!;
const FROST = content.towerByKey.get('frost_obelisk')!;
const BEACON = content.towerByKey.get('beacon_totem')!;
const SPROUT = content.towerByKey.get('harvest_sprout')!;

const DT = 1 / 60;

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
  const r = buildTower(w, def.id, tx, ty);
  if (!r.ok) throw new Error(`could not place ${def.key}: ${r.reason}`);
  r.structure.petrified = true;
}

function dummy(w: World, x: number, y: number): Enemy {
  const e = spawnEnemy(w, 'husk', x, y)!;
  e.hp = 1e6;
  e.maxHp = 1e6;
  e.speed = 0;
  return e;
}

describe('p2c — towers inert but present in VS waves (§6.2)', () => {
  it('a tower with no VS special deals zero damage across a whole wave, even to an enemy standing on it', () => {
    const w = new World(cfg(), content);
    const [t1] = tiles(w, 1);
    build(w, ARROW, t1.tx, t1.ty);
    w.phase = 'act2';
    // The Warden stands far outside both the tower's own attack range and its
    // wielded range, so any damage the enemy takes can only have come from
    // the tower firing on its own — the thing §6.2 forbids.
    w.warden.x = 1.5;
    w.warden.y = 1.5;
    const e = dummy(w, t1.tx + 0.5, t1.ty + 0.5);
    w.rebuildBuckets();

    // A full §1.1 VS wave (75s = 4500 ticks at 60Hz), not a short stand-in:
    // `updateTowers` (the only thing that could fire an Act I attack) is
    // structurally never called from `updateAct2` (run.ts), but this test
    // pins the acceptance criterion literally rather than leaning on that.
    for (let i = 0; i < 4500; i++) {
      updateTerrainEffects(w, DT);
      updateVsSpecials(w, DT);
    }

    expect(e.hp).toBe(1e6);
    expect(w.damageByWeapon['arrow_spire']).toBeUndefined();
  });

  it('an enemy can damage a tower', () => {
    const w = new World(cfg(), content);
    const [t1] = tiles(w, 1);
    build(w, ARROW, t1.tx, t1.ty);
    w.phase = 'act2';
    const s = w.structureAt(t1.tx, t1.ty)!;
    const before = s.hp;
    damageStructure(w, s, 10);
    // Defense mitigates some of it (structureArmor), so this is a bound, not
    // an exact subtraction — the point is only that it is not zero.
    expect(s.hp).toBeLessThan(before);
    expect(s.hp).toBeGreaterThan(before - 10);
    expect(s.dead).toBe(false);
  });

  it('electric wire grid: linked Tesla Coils zap enemies on the wire every 0.5s', () => {
    const w = new World(cfg(), content);
    const [t1, t2] = tiles(w, 2);
    build(w, TESLA, t1.tx, t1.ty);
    build(w, TESLA, t2.tx, t2.ty);
    linkSpires(w);
    const spires = w.structures.filter((s) => s.towerId === TESLA.id);
    expect(spires.some((s) => s.links.length > 0)).toBe(true);
    w.phase = 'act2';

    const midX = (t1.tx + 0.5 + t2.tx + 0.5) / 2;
    const midY = (t1.ty + 0.5 + t2.ty + 0.5) / 2;
    const e = dummy(w, midX, midY);
    w.warden.x = 1.5;
    w.warden.y = 1.5;
    w.rebuildBuckets();

    let ticks = 0;
    while (w.damageByWeapon['tesla_coil'] === undefined && ticks < 60) {
      updateVsSpecials(w, DT);
      ticks++;
    }
    expect(w.damageByWeapon['tesla_coil']).toBeGreaterThan(0);
    expect(e.hp).toBeLessThan(1e6);
  });

  it("poison trail: the character leaves a poison-dealing trail every second, 0.1x the tower's attack", () => {
    const w = new World(cfg(), content);
    const [t1] = tiles(w, 1);
    build(w, VENOM, t1.tx, t1.ty);
    w.phase = 'act2';
    w.warden.x = 10.5;
    w.warden.y = 10.5;

    const before = w.areas.length;
    updateVsSpecials(w, VENOM.vsSpecial.kind === 'poisonTrail' ? VENOM.vsSpecial.interval : 1);
    expect(w.areas.length).toBe(before + 1);

    const trail = w.areas[w.areas.length - 1];
    expect(trail.type).toBe('poison');
    expect(trail.x).toBeCloseTo(w.warden.x, 6);
    expect(trail.y).toBeCloseTo(w.warden.y, 6);

    const wielded = wieldedAttacks(w).find((a) => a.towerKey === 'venom_spore')!;
    expect(trail.dps).toBeCloseTo(wielded.damage * 0.1, 6);
  });

  it('brazier death-explosion: a Burning enemy dying deals 5 normal, r1, to nearby enemies', () => {
    const w = new World(cfg(), content);
    const [t1] = tiles(w, 1);
    build(w, BRAZIER, t1.tx, t1.ty);
    w.phase = 'act2';

    const victim = dummy(w, 12, 12);
    victim.hp = 1;
    applyBurn(w, victim, 1, 3, 'test');
    const bystander = dummy(w, 12.5, 12);
    w.rebuildBuckets();

    damageEnemy(w, victim, 100, 'test');
    expect(victim.dead).toBe(true);
    expect(bystander.hp).toBeCloseTo(1e6 - 5, 6);
  });

  it('no brazier built: a Burning enemy dying triggers no explosion', () => {
    const w = new World(cfg(), content);
    w.phase = 'act2';
    const victim = dummy(w, 12, 12);
    victim.hp = 1;
    applyBurn(w, victim, 1, 3, 'test');
    const bystander = dummy(w, 12.5, 12);
    w.rebuildBuckets();

    damageEnemy(w, victim, 100, 'test');
    expect(victim.dead).toBe(true);
    expect(bystander.hp).toBe(1e6);
  });

  it('p2f: a large tightly-clustered Burning chain does not overflow the call stack', () => {
    const w = new World(cfg(), content);
    const [t1] = tiles(w, 1);
    build(w, BRAZIER, t1.tx, t1.ty);
    w.phase = 'act2';

    // A 45x45 grid spaced 0.4 tiles apart (well under the r1 explosion radius),
    // so every husk's death-explosion reaches its neighbours and the chain
    // propagates through the whole cluster — QA's repro (~2000 husks, hp 1,
    // radius-1 spacing). 0.4 spacing keeps the whole cluster inside the real
    // 36x20 playfield (max coord 1 + 44*0.4 = 18.6) rather than leaning on
    // `rebuildBuckets`' edge-cell clamping to still be correct. The old code
    // recursed one JS call per chained death and overflowed the stack around
    // 1500-1600 links; this only regresses if `killEnemy` goes back to
    // calling `triggerBurningExplode` inline.
    const SIDE = 45;
    const enemies: Enemy[] = [];
    for (let row = 0; row < SIDE; row++) {
      for (let col = 0; col < SIDE; col++) {
        const e = spawnEnemy(w, 'husk', 1 + col * 0.4, 1 + row * 0.4)!;
        e.hp = 1;
        e.maxHp = 1;
        e.speed = 0;
        applyBurn(w, e, 1, 3, 'test');
        enemies.push(e);
      }
    }
    w.rebuildBuckets();

    expect(() => damageEnemy(w, enemies[0], 100, 'test')).not.toThrow();
    expect(enemies[0].dead).toBe(true);
    // The chain must have actually cascaded, not fizzled after one hop, or the
    // test would pass vacuously without ever exercising the deep chain.
    expect(enemies.filter((e) => e.dead).length).toBeGreaterThan(enemies.length / 2);
  });

  it('ice aura: an r2 aura around the character applies Frost every second', () => {
    const w = new World(cfg(), content);
    const [t1] = tiles(w, 1);
    build(w, FROST, t1.tx, t1.ty);
    w.phase = 'act2';
    w.warden.x = 12.5;
    w.warden.y = 12.5;
    const near = dummy(w, w.warden.x + 1, w.warden.y);
    const far = dummy(w, w.warden.x + 10, w.warden.y);
    w.rebuildBuckets();

    updateVsSpecials(w, 1);

    expect(near.frostRemaining).toBeGreaterThan(0);
    expect(far.frostRemaining).toBe(0);
  });

  it('beacon attack speed: standing within r2.5 of a Beacon Totem grants +15% character attack speed', () => {
    const w = new World(cfg(), content);
    const [t1] = tiles(w, 1);
    build(w, BEACON, t1.tx, t1.ty);
    w.rebuildBuckets();

    w.warden.x = t1.tx + 0.5;
    w.warden.y = t1.ty + 0.5;
    updateTerrainEffects(w, DT);
    expect(w.shrineHaste).toBeCloseTo(0.15, 6);

    w.warden.x = t1.tx + 0.5 + 20;
    w.terrainEffects = buildTerrainEffects(w);
    updateTerrainEffects(w, DT);
    expect(w.shrineHaste).toBe(0);
  });

  it('sprout XP gem: a Harvest Sprout emits one gem (value 3) every 8s during a VS wave', () => {
    const w = new World(cfg(), content);
    const [t1] = tiles(w, 1);
    build(w, SPROUT, t1.tx, t1.ty);
    w.phase = 'act2';
    w.warden.x = 1.5;
    w.warden.y = 1.5;

    const before = w.gems.length;
    for (let i = 0; i < 8 * 60; i++) updateTerrainEffects(w, DT);
    expect(w.gems.length).toBe(before + 1);
    expect(w.gems[w.gems.length - 1].value).toBe(3);
  });
});
