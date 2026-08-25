/** The Sundering (SPEC 4): conversion table, Heartstone, slot picker, Dusk. */

import { describe, expect, it } from 'vitest';

import { Run } from '../src/sim/run';
import { World } from '../src/sim/world';
import { buildTower, sellTower, towerCost, upgradeCost } from '../src/sim/towers';
import { finishSundering, linkSpires, openApproachLanes, petrify } from '../src/sim/sundering';
import { deriveSouls } from '../src/sim/progression';
import { updateTerrainEffects } from '../src/sim/weapons';
import { spawnEnemy } from '../src/sim/enemies';
import { coreCenter, GRID_H, GRID_W } from '../src/sim/grid';
import { BASE } from '../src/sim/stats';
import { emptyInput } from '../src/sim/types';
import { cfg } from './helpers';

function place(w: World, towerKey: string, tx: number, ty: number): void {
  const def = w.content.towerByKey.get(towerKey)!;
  w.gold = 100000;
  w.warden.x = tx + 0.5;
  w.warden.y = ty + 0.5;
  const r = buildTower(w, def.id, tx, ty);
  if (!r.ok) throw new Error(`could not place ${towerKey} at ${tx},${ty}: ${r.reason}`);
}

function tryPlace(w: World, towerKey: string, tx: number, ty: number): boolean {
  const def = w.content.towerByKey.get(towerKey)!;
  w.gold = 100000;
  w.warden.x = tx + 0.5;
  w.warden.y = ty + 0.5;
  return buildTower(w, def.id, tx, ty).ok;
}

/** Bypasses the placement rules, for testing post-Sundering geometry directly. */
function forcePlace(w: World, towerKey: string, tx: number, ty: number): void {
  const def = w.content.towerByKey.get(towerKey)!;
  w.addStructure({
    id: w.newId(),
    towerId: def.id,
    tier: 1,
    tx,
    ty,
    hp: def.hp,
    maxHp: def.hp,
    cooldown: 0,
    dead: false,
    petrified: false,
    soulSuppressed: false,
    gemTimer: 0,
    gemsWaiting: 0,
    links: [],
    damageDealt: 0,
  });
}

describe('conversion table (SPEC 4.2)', () => {
  it('every tower has a terrain form, and exactly three grant no weapon', () => {
    const w = new World(cfg());
    const noSoul = w.content.towers.towers.filter((t) => t.soul === null).map((t) => t.key);
    expect(noSoul.sort()).toEqual(['beacon_totem', 'harvest_sprout', 'palisade']);
    for (const t of w.content.towers.towers) {
      expect(t.terrain.kind, t.key).toBeTruthy();
    }
  });

  it('petrifies every standing tower in place', () => {
    const w = new World(cfg());
    place(w, 'arrow_spire', 8, 8);
    place(w, 'venom_spore', 9, 8);
    petrify(w);
    for (const s of w.structures) {
      expect(s.petrified).toBe(true);
    }
    expect(w.structureAt(8, 8)).not.toBeNull();
  });

  it('force-clears the Core pocket into an open arena', () => {
    const w = new World(cfg());
    const c = coreCenter();
    // Crowd the Core. The path guarantee forbids a full ring during Act I, so
    // whatever legally lands here is what the detonation has to clear.
    let built = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const tx = Math.floor(c.x) + dx;
        const ty = Math.floor(c.y) + dy;
        if (!w.grid.buildable(tx, ty)) continue;
        if (tryPlace(w, 'palisade', tx, ty)) built++;
      }
    }
    expect(built).toBeGreaterThan(4);
    petrify(w);
    for (const s of w.structures) {
      const d = Math.sqrt((s.tx + 0.5 - c.x) ** 2 + (s.ty + 0.5 - c.y) ** 2);
      expect(d).toBeGreaterThan(2);
    }
  });

  it('always leaves a walkable lane from the rim to the Heartstone', () => {
    const w = new World(cfg());
    // A solid curtain across the map. Act I would never allow this (the path
    // guarantee refuses it), so drop it straight in to test the lane blaster.
    for (let y = 1; y < GRID_H - 1; y++) {
      if (w.grid.buildable(20, y)) forcePlace(w, 'palisade', 20, y);
    }
    w.grid.refresh();
    expect(w.grid.allGatesReachable()).toBe(false);

    petrify(w);
    w.grid.refresh();
    const c = coreCenter();
    const sources = [w.grid.idx(Math.floor(c.x), Math.floor(c.y))];
    const field = { dist: new Int32Array(GRID_W * GRID_H), next: new Int32Array(GRID_W * GRID_H) };
    w.grid.computeField(field, sources, false);
    // The far side of the curtain must still reach the Heartstone.
    expect(field.dist[w.grid.idx(2, 10)]).toBeGreaterThan(0);
    void openApproachLanes;
  });

  it('links conductive spires within range, capped at two links each', () => {
    const w = new World(cfg({ classKey: 'engineer' }));
    for (const [x, y] of [
      [6, 6],
      [9, 6],
      [12, 6],
      [15, 6],
    ] as [number, number][]) {
      place(w, 'tesla_coil', x, y);
    }
    petrify(w);
    linkSpires(w);
    const spires = w.structures.filter(
      (s) => w.content.towerById.get(s.towerId)!.key === 'tesla_coil',
    );
    expect(spires.length).toBe(4);
    for (const s of spires) expect(s.links.length).toBeLessThanOrEqual(2);
    expect(spires.some((s) => s.links.length > 0)).toBe(true);
  });

  it('Palisades grant armour, capped at +15', () => {
    const w = new World(cfg());
    let placed = 0;
    for (let y = 3; y < 18 && placed < 20; y++) {
      for (let x = 3; x < 16 && placed < 20; x++) {
        if (!w.grid.buildable(x, y)) continue;
        place(w, 'palisade', x, y);
        placed++;
      }
    }
    const before = w.derived.armor;
    finishSundering(w, []);
    expect(w.derived.armor).toBe(before + 15);
  });

  it('Beacon Totems grant permanent attack speed, capped at +12%', () => {
    const w = new World(cfg());
    for (const [x, y] of [
      [4, 4],
      [6, 4],
      [8, 4],
      [10, 4],
      [12, 4],
    ] as [number, number][]) {
      place(w, 'beacon_totem', x, y);
    }
    const before = w.derived.attackSpeedMul;
    finishSundering(w, []);
    expect(w.derived.attackSpeedMul).toBeCloseTo(before + 0.12, 6);
  });

  it('Gem Blooms emit XP gems on a timer', () => {
    const w = new World(cfg());
    place(w, 'harvest_sprout', 10, 10);
    finishSundering(w, []);
    const before = w.gems.length;
    for (let i = 0; i < 60 * 12; i++) {
      w.rebuildBuckets();
      updateTerrainEffects(w, 1 / 60);
    }
    expect(w.gems.length).toBeGreaterThan(before);
  });

  it('spore clouds and ice monoliths keep working as terrain', () => {
    const w = new World(cfg({ classKey: 'frost_warden' }));
    place(w, 'venom_spore', 10, 10);
    place(w, 'frost_obelisk', 14, 10);
    finishSundering(w, []);
    const poisoned = spawnEnemy(w, 'bulwark', 10.5, 11.2, { overlay: true })!;
    const chilled = spawnEnemy(w, 'bulwark', 14.5, 11.0, { overlay: true })!;
    for (let i = 0; i < 60; i++) {
      w.rebuildBuckets();
      updateTerrainEffects(w, 1 / 60);
    }
    expect(poisoned.poison.length).toBeGreaterThan(0);
    expect(chilled.slowAmount).toBeGreaterThan(0);
  });
});

describe('Heartstone', () => {
  it('heals the Warden inside its radius and not outside', () => {
    const w = new World(cfg());
    finishSundering(w, []);
    const c = coreCenter();
    w.warden.hp = 10;
    for (let i = 0; i < 60; i++) updateTerrainEffects(w, 1 / 60);
    const healed = w.warden.hp;
    expect(healed).toBeGreaterThan(10);

    w.warden.x = c.x + BASE.heartstoneRadius + 3;
    w.warden.hp = 10;
    for (let i = 0; i < 60; i++) updateTerrainEffects(w, 1 / 60);
    expect(w.warden.hp).toBe(10);
  });
});

describe('slot picker (SPEC 4.1)', () => {
  it('auto-binds when the candidates fit the slots', () => {
    const w = new World(cfg());
    place(w, 'arrow_spire', 8, 8);
    place(w, 'ballista', 9, 8);
    const run = new Run(cfg());
    void run;
    const souls = deriveSouls(w);
    expect(souls.map((s) => s.key).sort()).toEqual(['arrow_volley', 'piercing_bolt']);
  });

  it('binds straight through when an Engineer build fits the slots', () => {
    const run = new Run(cfg());
    const w = run.world;
    // Class locks cap any one class at five soul-granting tower types
    // (see QUESTIONS.md), so a normal build always fits six slots.
    const keys = ['arrow_spire', 'ballista', 'tesla_coil', 'mortar', 'venom_spore'];
    keys.forEach((k, i) => place(w, k, 6 + i * 2, 6));
    w.phase = 'dusk';
    w.duskTimer = 0;
    run.step(emptyInput());
    expect(w.phase).toBe('act2');
    const slotted = w.weapons.filter((x) => !w.content.weaponByKey.get(x.key)?.slotless);
    expect(slotted.length).toBe(keys.length);
  });

  it('pauses for a choice when the candidates outnumber the slots', () => {
    const run = new Run(cfg());
    const w = run.world;
    const keys = ['arrow_spire', 'ballista', 'tesla_coil', 'mortar', 'venom_spore'];
    keys.forEach((k, i) => place(w, k, 6 + i * 2, 6));
    // Deep Roots trades a weapon slot for stronger residuals, which is the
    // configuration where the picker actually bites.
    w.stats.weaponSlots -= 3;
    w.recomputeDerived();
    w.phase = 'dusk';
    w.duskTimer = 0;
    run.step(emptyInput());
    expect(w.phase).toBe('soulpick');
    expect(w.soulCandidates.length).toBeGreaterThan(w.derived.weaponSlots);

    run.step({ ...emptyInput(), cmds: [{ k: 'souls', keys: w.soulCandidates.slice(0, 2) }] });
    expect(w.phase).toBe('act2');
    const slotted = w.weapons.filter((x) => !w.content.weaponByKey.get(x.key)?.slotless);
    expect(slotted.length).toBe(2);
    expect(w.weapons.some((x) => x.key === 'wardens_arrow')).toBe(true);
  });
});

describe('Dusk (SPEC 4 step 1)', () => {
  it('still allows building, but refunds only half', () => {
    const w = new World(cfg());
    const def = w.content.towerByKey.get('arrow_spire')!;
    place(w, 'arrow_spire', 8, 8);
    w.phase = 'dusk';
    const before = w.gold;
    expect(sellTower(w, 8, 8)).toBe(true);
    expect(w.gold - before).toBe(Math.round(towerCost(w, def) * w.content.towers.duskSellRefund));
    expect(upgradeCost(w, def, 2)).toBeGreaterThan(0);
  });

  it('runs for 15 seconds after the last wave, then sunders', () => {
    const run = new Run(cfg());
    const w = run.world;
    w.phase = 'dusk';
    w.duskTimer = 15;
    for (let i = 0; i < 60 * 15 + 2; i++) {
      if (w.phase !== 'dusk') break;
      run.step(emptyInput());
    }
    const phase: string = w.phase;
    expect(['act2', 'soulpick']).toContain(phase);
    expect(w.sundered || phase === 'soulpick').toBe(true);
  });
});
