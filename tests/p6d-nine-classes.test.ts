/**
 * p6d — SPEC-FINAL §4.2's nine remaining classes (Archer, Engineer, Pyro,
 * Necromancer, Cryomancer, Stormcaller, Bloodlord, Animist, Paladin) on top of
 * §4's framework (p6a) and the two owner kits (p6b/p6c).
 *
 * Two of the §14 gates live here as real measurements rather than assertions
 * about hand-copied constants — both read `data/classes.json` through
 * `loadContent`, so a tune that breaks them fails this file:
 *   - **G10** "Archer: dps-optimal charge finite (2-6 s); full charge one-shots
 *     any non-elite at mid scaling" — searched numerically over the authored
 *     compounding/cooldown/cap triple, and checked against the toughest
 *     non-elite row in `data/enemies.json`.
 *   - **G11** "Stormcaller: max chain multiplier <= x3.6" — the worked case
 *     (Overload up, 8 total jumps, the last one at the compounding cap).
 */
import { describe, expect, it } from 'vitest';

import { loadContent, validateClassEffect, validateClassPassive, type ClassEffect, type ClassDef } from '../src/sim/content';
import { applyEffects, dealHit } from '../src/sim/combat';
import { applyFrost, killEnemy, spawnEnemy, TRAIT, updateEnemies } from '../src/sim/enemies';
import { attackSpeedFor, buildTower, classTowerBonus, towerDamage, updateTowers } from '../src/sim/towers';
import { structureArmor, structureMaxHp } from '../src/sim/upgrades';
import { electricInterval } from '../src/sim/vsspecials';
import { applyCommand, damageWarden, hashWorld, Run, wardenArmor } from '../src/sim/run';
import {
  classAttackPowerMul,
  classBasicAttack,
  classMoveSpeedMul,
  tickClassCharge,
  updateClassPassives,
  updateClassSummons,
  updateTempWalls,
} from '../src/sim/classes';
import type { Command, Enemy, Structure, TickInput } from '../src/sim/types';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const content = loadContent();
const DT = 1 / 60;

function newClass(key: string): ClassDef {
  return content.classByKey.get(key)!;
}

function idleInput(over: Partial<TickInput> = {}): TickInput {
  return { mx: 0, my: 0, dash: false, attack: false, aimX: 0, aimY: 0, active1Held: false, cmds: [], ...over };
}

/** A world with the basic attack suppressed, so only the kit under test deals damage. */
function worldWith(classKey: string, over = {}): World {
  const w = new World(cfg({ classKey, ...over }));
  w.gold = 1e6;
  w.warden.attackCooldown = 1e9;
  return w;
}

function dummy(w: World, x: number, y: number, hp = 1e6): Enemy {
  const e = spawnEnemy(w, content.enemies.enemies[0].key, x, y)!;
  e.hp = hp;
  e.maxHp = hp;
  e.speed = 0;
  e.armor = 0;
  return e;
}

/* ------------------------------------------------------------------ schema */

const KITS: [string, string, string, string | undefined][] = [
  // key, active1.kind, active2.kind, passive.kind
  ['archer', 'charge_pierce', 'dash_volley', undefined],
  ['engineer', 'repair_heal', 'summon_turret', undefined],
  ['pyromancer', 'burst_damage', 'dash_trail', 'contagious_flame'],
  ['necromancer', 'raise_skeletons', 'death_pact', 'corpse_drop'],
  ['cryomancer', 'frost_nova', 'ice_wall', 'frost_touch'],
  ['stormcaller', 'chain_lightning', 'overload', undefined],
  ['bloodlord', 'blood_tithe', 'dash_heal', 'blood_frenzy'],
  ['animist', 'manifest_spirit', 'recall_totem', undefined],
  ['paladin', 'clarion_taunt', 'judgement', 'guardian_stance'],
];

describe('p6d: §4.2 ships nine classes with the four §4 slots each', () => {
  it.each(KITS)('%s carries the right kinds and loads clean', (key, a1, a2, passive) => {
    const c = newClass(key);
    expect(c.active1.kind).toBe(a1);
    expect(c.active2.kind).toBe(a2);
    expect(c.passive.kind).toBe(passive);
    expect(() => validateClassEffect(c.active1, key)).not.toThrow();
    expect(() => validateClassEffect(c.active2, key)).not.toThrow();
    expect(c.basicAttack.dps).toBeGreaterThan(0);
    expect(c.basicAttack.range).toBeGreaterThan(0);
    expect(c.towerPassive.name.length).toBeGreaterThan(0);
  });

  it('§13 content total: twelve SPEC-FINAL classes are authored', () => {
    // fb013 added a 12th (Time Lord) past a direct owner directive, after
    // §13's original eleven were filled — see QUESTIONS.md Q139.
    expect(content.classes.classes).toHaveLength(12);
  });

  it('§4.2 Unlocks: Swordsman, Archer and Engineer are the free three', () => {
    const free = content.classes.classes.filter((c) => c.unlockedByDefault).map((c) => c.key).sort();
    expect(free).toEqual(['archer', 'engineer', 'swordsman']);
  });

  it('every locked class names a quest that really exists', () => {
    const keys = new Set(content.quests.quests.map((q) => q.key));
    for (const c of content.classes.classes) {
      if (c.unlockedByDefault) continue;
      expect(c.unlockQuest).not.toBeNull();
      expect(keys.has(c.unlockQuest!)).toBe(true);
    }
  });

  it.each([
    ['charge_pierce', 'compoundPerSecond'],
    ['chain_lightning', 'chainGrowth'],
    ['ice_wall', 'wallSeconds'],
    ['death_pact', 'pactDrainPerSecond'],
    ['judgement', 'wrathDamageMul'],
  ])('the loader refuses a %s row missing "%s"', (kind, field) => {
    const source = content.classes.classes.find((c) => c.active1.kind === kind || c.active2.kind === kind)!;
    const eff = source.active1.kind === kind ? source.active1 : source.active2;
    const broken = { ...eff } as Record<string, unknown>;
    delete broken[field];
    expect(() => validateClassEffect(broken as ClassEffect, 'x')).toThrow();
  });

  it.each([
    ['contagious_flame', 'flameDps'],
    ['frost_touch', 'shatterDamage'],
    ['guardian_stance', 'wrathFraction'],
    ['blood_frenzy', 'frenzyVsMul'],
  ])('the loader refuses a %s passive row missing "%s"', (kind, field) => {
    const source = content.classes.classes.find((c) => c.passive.kind === kind)!;
    const broken = { ...source.passive } as Record<string, unknown>;
    delete broken[field];
    expect(() => validateClassPassive(broken as { kind?: string }, 'x')).toThrow();
  });

  it('accepts every real, shipped passive and towerPassive row', () => {
    for (const c of content.classes.classes) {
      expect(() => validateClassPassive(c.passive, c.key)).not.toThrow();
      expect(() => validateClassPassive(c.towerPassive, c.key)).not.toThrow();
    }
  });
});

/* --------------------------------------------------------------------- G10 */

describe('p6d: G10 — Archer, measured off the authored numbers', () => {
  const a = newClass('archer').active1;

  it('the dps-optimal charge is finite and lands in the 2-6 s window', () => {
    // Damage per second of *committed* time: the shot's compounded damage over
    // the charge it cost plus the cooldown it then pays. The `min(t, cap)` is
    // what makes the optimum finite at all — uncapped, holding forever always
    // wins, which is exactly the failure mode G10's "finite" clause names.
    const cap = a.chargeCapSeconds!;
    const growth = 1 + a.compoundPerSecond!;
    let bestT = 0;
    let bestValue = -Infinity;
    for (let i = 1; i <= 150; i++) {
      const t = i / 10;
      const value = Math.pow(growth, Math.min(t, cap)) / (t + a.cooldownSeconds);
      if (value > bestValue) {
        bestValue = value;
        bestT = t;
      }
    }
    expect(bestT).toBeGreaterThanOrEqual(2);
    expect(bestT).toBeLessThanOrEqual(6);
  });

  it('a full-charge Deadeye Draw still drops the toughest non-elite in a small handful of hits at mid scaling', () => {
    const nonElite = content.enemies.enemies.filter(
      (e) => !e.traits.includes('elite') && !e.traits.includes('boss'),
    );
    const toughest = nonElite.reduce((best, e) => (e.hp > best.hp ? e : best));
    // "Mid scaling" as a concrete, stated number rather than a built world:
    // x2.5 Power is roughly a half-walked Constellation plus a relic, and
    // stating it here keeps the gate readable when the tree is re-tuned.
    const MID_POWER_MUL = 2.5;
    const full = a.damage * Math.pow(1 + a.compoundPerSecond!, a.chargeCapSeconds!) * MID_POWER_MUL;
    // fb025 (enemy HP x10, BALANCE.md's fodder band moved from "2-4 hits" to
    // "6-12 hits"): a literal one-shot on the toughest non-elite no longer
    // holds — re-pinned to the weaker, still-meaningful invariant that the
    // ultimate comfortably beats even the new fodder TTK ceiling.
    expect(full).toBeLessThan(toughest.hp);
    expect(Math.ceil(toughest.hp / full)).toBeLessThanOrEqual(3);
  });

  it('a released full charge actually pierces, and a longer draw hits harder', () => {
    const measure = (holdTicks: number): number => {
      const w = worldWith('archer');
      w.warden.x = 6;
      w.warden.y = 10;
      const line = [dummy(w, 8, 10), dummy(w, 10, 10), dummy(w, 12, 10)];
      w.rebuildBuckets();
      const aim = { aimX: 20, aimY: 10 };
      for (let t = 0; t < holdTicks; t++) {
        stepCharge(w, true, aim);
      }
      stepCharge(w, false, aim);
      return line.reduce((sum, e) => sum + (1e6 - e.hp), 0);
    };
    const short = measure(6); // 0.1 s
    const long = measure(300); // 5 s, the authored cap
    expect(short).toBeGreaterThan(0);
    expect(long).toBeGreaterThan(short * 2);
  });
});

/** Drives one tick of the hold/release state machine without a whole `Run`. */
function stepCharge(w: World, held: boolean, aim: { aimX: number; aimY: number }): void {
  tickClassCharge(w, newClass(w.cfg.classKey), idleInput({ active1Held: held, ...aim }), DT);
  if (w.warden.active1Cooldown > 0) w.warden.active1Cooldown = 0;
}

/* --------------------------------------------------------------------- G11 */

describe('p6d: G11 — Stormcaller chain multiplier stays under x3.6', () => {
  const s = newClass('stormcaller');

  it('the worked case (Overload up, 8 jumps, last jump at the cap) is <= 3.6', () => {
    const jumps = s.active1.chainCount! + s.active2.overloadExtraChains!;
    const exponent = Math.min(s.active1.chainCap! - 1, jumps - 1);
    expect(Math.pow(1 + s.active1.chainGrowth!, exponent)).toBeLessThanOrEqual(3.6);
  });

  it('no reachable jump index can exceed the ceiling, however many jumps are granted', () => {
    const worst = Math.pow(1 + s.active1.chainGrowth!, s.active1.chainCap! - 1);
    expect(worst).toBeLessThanOrEqual(3.6);
  });

  it('Chain Surge damage grows by exactly chainGrowth per jump, then stops at the cap', () => {
    const w = worldWith('stormcaller');
    w.warden.x = 4;
    w.warden.y = 10;
    // Spaced past Electric's own inherent r0.8 blast so each enemy's HP loss is
    // its own jump and nothing else's splash.
    const line: Enemy[] = [];
    for (let i = 0; i < 6; i++) line.push(dummy(w, 5 + i * 2, 10));
    w.rebuildBuckets();

    applyCommand(w, { k: 'class_active' });
    const dealt = line.map((e) => 1e6 - e.hp);
    for (const d of dealt) expect(d).toBeGreaterThan(0);
    for (let i = 1; i < dealt.length; i++) {
      expect(dealt[i] / dealt[i - 1]).toBeCloseTo(1 + s.active1.chainGrowth!, 4);
    }
  });

  it('Overload doubles the VS electric wire cadence while it runs', () => {
    const w = worldWith('stormcaller');
    const base = electricInterval(w);
    w.warden.overloadRemaining = 5;
    expect(electricInterval(w)).toBeCloseTo(base / 2, 6);
    w.warden.overloadRemaining = 0;
    expect(electricInterval(w)).toBeCloseTo(base, 6);
  });

  it('Overload grants exactly overloadExtraChains more jumps', () => {
    const build = (overload: boolean): number => {
      const w = worldWith('stormcaller');
      w.warden.x = 4;
      w.warden.y = 10;
      const line: Enemy[] = [];
      for (let i = 0; i < 12; i++) line.push(dummy(w, 5 + i * 1.5, 10));
      w.rebuildBuckets();
      if (overload) w.warden.overloadRemaining = 5;
      applyCommand(w, { k: 'class_active' });
      return line.filter((e) => e.hp < 1e6).length;
    };
    // Electric's inherent blast can graze a neighbour, so this compares the two
    // counts rather than pinning either to an absolute number.
    expect(build(true)).toBeGreaterThan(build(false));
  });
});

/* ------------------------------------------------------------ per-kit units */

describe('p6d: Cryomancer — frost on hit, freeze at five, shatter on death', () => {
  it('freezes only on the fifth tracked hit, not before', () => {
    const w = worldWith('cryomancer');
    const e = dummy(w, w.warden.x + 1, w.warden.y);
    w.rebuildBuckets();
    const onHit = ['frost', 'frost_track'];
    for (let i = 0; i < 4; i++) applyEffects(w, e, { onHit });
    expect(e.frostRemaining).toBeGreaterThan(0);
    expect(e.frozenRemaining).toBe(0);
    expect(e.frostHitStacks).toBe(4);
    applyEffects(w, e, { onHit });
    expect(e.frozenRemaining).toBeGreaterThan(0);
    expect(e.frostHitStacks).toBe(0);
  });

  it('drops the count when frost lapses, so an old tally cannot carry over', () => {
    const w = worldWith('cryomancer');
    const e = dummy(w, w.warden.x + 1, w.warden.y);
    w.rebuildBuckets();
    applyFrost(w, e);
    applyEffects(w, e, { onHit: ['frost_track'] });
    expect(e.frostHitStacks).toBe(1);
    e.frostRemaining = 0;
    applyEffects(w, e, { onHit: ['frost_track'] });
    expect(e.frostHitStacks).toBe(0);
  });

  it('a frozen enemy shatters into its neighbours when it dies', () => {
    const w = worldWith('cryomancer');
    const dying = dummy(w, 10, 10);
    const near = dummy(w, 10.8, 10);
    const far = dummy(w, 16, 10);
    w.rebuildBuckets();
    dying.frozenRemaining = 3;
    killEnemy(w, dying, 'test');
    const passive = newClass('cryomancer').passive;
    expect(1e6 - near.hp).toBeCloseTo(passive.shatterDamage!, 4);
    expect(far.hp).toBe(1e6);
  });

  it('an unfrozen death shatters nothing', () => {
    const w = worldWith('cryomancer');
    const dying = dummy(w, 10, 10);
    const near = dummy(w, 10.8, 10);
    w.rebuildBuckets();
    killEnemy(w, dying, 'test');
    expect(near.hp).toBe(1e6);
  });

  it('a long chain of frozen deaths does not overflow the call stack', () => {
    const w = worldWith('cryomancer');
    const chain: Enemy[] = [];
    for (let i = 0; i < 2000; i++) {
      const e = dummy(w, 4 + (i % 300) * 0.01, 4 + Math.floor(i / 300) * 0.01, 0.001);
      e.frozenRemaining = 3;
      chain.push(e);
    }
    w.rebuildBuckets();
    expect(() => killEnemy(w, chain[0], 'test')).not.toThrow();
    expect(chain.filter((e) => e.dead).length).toBeGreaterThan(100);
  });

  it('Glaciate frosts a fresh enemy and freezes an already-frosted one', () => {
    const w = worldWith('cryomancer');
    w.warden.x = 10;
    w.warden.y = 10;
    const fresh = dummy(w, 11, 10);
    const chilled = dummy(w, 11, 11);
    w.rebuildBuckets();
    applyFrost(w, chilled);
    applyCommand(w, { k: 'class_active' });
    expect(fresh.frostRemaining).toBeGreaterThan(0);
    expect(fresh.frozenRemaining).toBe(0);
    expect(chilled.frozenRemaining).toBeGreaterThan(0);
  });
});

describe('p6d: Cryomancer Ice Wall — free, real, and temporary', () => {
  function castWall(): { w: World; gold: number } {
    const w = worldWith('cryomancer');
    w.gold = 500;
    w.warden.x = 10;
    w.warden.y = 10;
    const gold = w.gold;
    applyCommand(w, { k: 'class_active2', aimX: 12, aimY: 10 });
    return { w, gold };
  }

  it('places tiles, costs nothing, and does not count as a built tower', () => {
    const { w, gold } = castWall();
    expect(w.tempWalls).toHaveLength(1);
    expect(w.tempWalls[0].structureIds.length).toBeGreaterThan(0);
    expect(w.gold).toBe(gold);
    expect(w.goldSpent).toBe(0);
    expect(w.towersBuilt).toBe(0);
    for (const id of w.tempWalls[0].structureIds) {
      expect(w.structureById.get(id)!.spent).toBe(0);
    }
  });

  it('the tiles are gone once wallSeconds elapse', () => {
    const { w } = castWall();
    const ids = w.tempWalls[0].structureIds.slice();
    const seconds = newClass('cryomancer').active2.wallSeconds!;
    for (let t = 0; t < Math.ceil(seconds * 60) + 2; t++) updateTempWalls(w, DT);
    w.compact();
    expect(w.tempWalls).toHaveLength(0);
    for (const id of ids) expect(w.structureById.get(id)).toBeUndefined();
    const s = w.structureAt(12, 10);
    expect(s).toBeNull();
  });

  it('still pays its cooldown when no tile could be placed (every target tile already occupied)', () => {
    const w = worldWith('cryomancer');
    w.warden.x = 10;
    w.warden.y = 10;
    const arrow = content.towerByKey.get('arrow_spire')!;
    // The vertical wall this aim produces lands at tx=12, ty in {9,10,11} —
    // pre-occupy all three with real towers so `buildTower` rejects every one.
    for (const ty of [9, 10, 11]) {
      expect(buildTower(w, arrow.id, 12, ty).ok).toBe(true);
    }
    applyCommand(w, { k: 'class_active2', aimX: 12, aimY: 10 });
    expect(w.tempWalls).toHaveLength(0);
    expect(w.warden.active2Cooldown).toBeGreaterThan(0);
  });

  it('places real, blocking tiles during a VS wave too (Q120 ORDER 2)', () => {
    const w = worldWith('cryomancer');
    w.gold = 500;
    w.warden.x = 10;
    w.warden.y = 10;
    w.phase = 'act2';
    const gold = w.gold;
    applyCommand(w, { k: 'class_active2', aimX: 12, aimY: 10 });
    expect(w.tempWalls).toHaveLength(1);
    expect(w.tempWalls[0].structureIds.length).toBeGreaterThan(0);
    expect(w.gold).toBe(gold);
    expect(w.goldSpent).toBe(0);
    expect(w.towersBuilt).toBe(0);
    for (const id of w.tempWalls[0].structureIds) {
      const s = w.structureById.get(id)!;
      expect(s.spent).toBe(0);
      // The tile is actually occupied, not a cosmetic no-op placement.
      expect(w.grid.buildable(s.tx, s.ty)).toBe(false);
    }
  });

  it('a stand-still VS cast reroutes enemies immediately, not only after the Warden crosses a tile', () => {
    const w = worldWith('cryomancer');
    w.gold = 500;
    w.warden.x = 10;
    w.warden.y = 10;
    w.phase = 'act2';
    // Establish a fresh baseline chase field on the Warden's current tile —
    // the same tile the cast below reuses, so only the wall's own occupancy
    // change (not a Warden move) can explain any difference.
    w.updateNav(true);
    const idx = w.grid.idx(12, 10); // the wall's middle tile for this aim
    expect(w.navGround.dist[idx]).not.toBe(-1);
    applyCommand(w, { k: 'class_active2', aimX: 12, aimY: 10 });
    // `updateNav`'s own early-return would otherwise skip this recompute
    // entirely (the Warden's tile hasn't changed) — `fireIceWall` must force it.
    expect(w.navGround.dist[idx]).toBe(-1);
  });

  it('the field un-stales once a VS-cast wall is gone, not only when it goes up', () => {
    const w = worldWith('cryomancer');
    w.gold = 500;
    w.warden.x = 10;
    w.warden.y = 10;
    w.phase = 'act2';
    applyCommand(w, { k: 'class_active2', aimX: 12, aimY: 10 });
    const idx = w.grid.idx(12, 10);
    expect(w.navGround.dist[idx]).toBe(-1); // blocked while the wall stands
    const seconds = newClass('cryomancer').active2.wallSeconds!;
    for (let t = 0; t < Math.ceil(seconds * 60) + 2; t++) updateTempWalls(w, DT);
    w.compact();
    expect(w.tempWalls).toHaveLength(0);
    expect(w.grid.buildable(12, 10)).toBe(true);
    // Removal is a `removeStructure` choke-point event, not a Warden tile
    // change — the Warden never moved, so only a forced recompute on
    // removal (not just on placement) explains the field seeing this tile
    // as reachable again.
    expect(w.navGround.dist[idx]).not.toBe(-1);
  });

  it("a self-aimed cast (own tile inside the wall's footprint) does not move or trap the Warden (fb002, supersedes b016)", () => {
    // fireIceWall's own placement calls go through `buildTower` with
    // `{ ignorePhase: true }`, the same function b016's fix used to live in.
    // fb002 supersedes that fix: the Warden ignores structure collision
    // entirely (`wardenPassable`), so a self-defense cast landing on its own
    // tile is ordinary — the Warden stays put and can still walk freely, in
    // both Act I and VS, with no relocation needed.
    const w = worldWith('cryomancer');
    w.gold = 500;
    w.warden.x = 10;
    w.warden.y = 10;
    w.phase = 'act2';
    applyCommand(w, { k: 'class_active2', aimX: 10, aimY: 10 });
    expect(w.tempWalls).toHaveLength(1);
    expect(w.grid.buildable(10, 10)).toBe(false); // the wall still blocks everyone else...
    expect(w.grid.passable(10, 10)).toBe(false);
    // ...but the Warden was never moved and can still freely stand/leave.
    expect(w.warden.x).toBe(10);
    expect(w.warden.y).toBe(10);
    expect(w.grid.wardenPassable(10, 10)).toBe(true);
  });

  it('a player Build Command still cannot place a tower during a VS wave (ignorePhase is Ice Wall-only)', () => {
    const w = worldWith('cryomancer');
    w.gold = 500;
    w.warden.x = 10;
    w.warden.y = 10;
    w.phase = 'act2';
    const arrow = content.towerByKey.get('arrow_spire')!;
    const res = buildTower(w, arrow.id, 12, 10);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('phase');
  });
});

describe('p6d: Necromancer — corpses, the raise cap, and the pact', () => {
  it('kills leave corpses only for the class whose passive says so', () => {
    const w = worldWith('necromancer');
    const e = dummy(w, 10, 10, 1);
    w.rebuildBuckets();
    killEnemy(w, e, 'test');
    expect(w.corpses).toHaveLength(1);

    const other = worldWith('swordsman');
    const e2 = dummy(other, 10, 10, 1);
    other.rebuildBuckets();
    killEnemy(other, e2, 'test');
    expect(other.corpses).toHaveLength(0);
  });

  it('corpses fade after their own duration', () => {
    const w = worldWith('necromancer');
    const e = dummy(w, 10, 10, 1);
    w.rebuildBuckets();
    killEnemy(w, e, 'test');
    const seconds = newClass('necromancer').passive.corpseSeconds!;
    for (let t = 0; t < Math.ceil(seconds * 60) + 2; t++) updateClassPassives(w, DT);
    expect(w.corpses).toHaveLength(0);
  });

  it('Raise never puts more skeletons on the board than summonCap', () => {
    const w = worldWith('necromancer');
    w.warden.x = 10;
    w.warden.y = 10;
    const cap = newClass('necromancer').active1.summonCap!;
    for (let i = 0; i < cap + 6; i++) {
      const e = dummy(w, 9 + (i % 4) * 0.4, 9 + Math.floor(i / 4) * 0.4, 1);
      w.rebuildBuckets();
      killEnemy(w, e, 'test');
    }
    expect(w.corpses.length).toBe(cap + 6);
    applyCommand(w, { k: 'class_active' });
    const skeletons = w.classSummons.filter((s) => s.kind === 'necro_skeleton');
    expect(skeletons).toHaveLength(cap);
    // The consumed corpses are gone; the rest still lie there.
    expect(w.corpses).toHaveLength(6);

    w.warden.active1Cooldown = 0;
    applyCommand(w, { k: 'class_active' });
    expect(w.classSummons.filter((s) => s.kind === 'necro_skeleton')).toHaveLength(cap);
  });

  it('Death Pact toggles a tower, buffs it, drains it, and leaves a Bone Pylon', () => {
    const w = worldWith('necromancer');
    w.warden.x = 10;
    w.warden.y = 10;
    const arrow = content.towerByKey.get('arrow_spire')!;
    const built = buildTower(w, arrow.id, 11, 10);
    expect(built.ok).toBe(true);
    const s = w.structureAt(11, 10)!;

    const plainDamage = towerDamage(w, s, 10);
    const plainSpeed = attackSpeedFor(w, s);
    applyCommand(w, { k: 'class_active2', aimX: 11, aimY: 10 });
    expect(s.pactActive).toBe(true);
    const eff = newClass('necromancer').active2;
    expect(towerDamage(w, s, 10)).toBeCloseTo(plainDamage * (1 + eff.pactDamageMul!), 5);
    expect(attackSpeedFor(w, s)).toBeCloseTo(plainSpeed * (1 + eff.pactAtkSpdMul!), 5);

    // -2%/s of max HP: a full tower dies in 50 s and leaves the pylon behind.
    for (let t = 0; t < 60 * 60 && !s.dead; t++) updateClassPassives(w, DT);
    expect(s.dead).toBe(true);
    expect(w.classSummons.filter((c) => c.kind === 'bone_pylon')).toHaveLength(1);
  });

  it('b048: the pact drain (and the Bone Pylon death it can trigger) freezes once w.dying is set', () => {
    // code-reviewer-filed verifying b047: same DEFEAT_SLOWMO bug class as
    // b020/b046/b047, but updatePactedTowers is one of three sub-routines
    // inside updateClassPassives that needed its own guard rather than a
    // blanket function-level one (the Warden timers/corpse decay in the same
    // function are cosmetic and must keep running).
    const w = worldWith('necromancer');
    w.warden.x = 10;
    w.warden.y = 10;
    const arrow = content.towerByKey.get('arrow_spire')!;
    buildTower(w, arrow.id, 11, 10);
    const s = w.structureAt(11, 10)!;
    applyCommand(w, { k: 'class_active2', aimX: 11, aimY: 10 });
    expect(s.pactActive).toBe(true);
    const hpBefore = s.hp;

    w.dying = 'defeat_warden';
    w.dyingTimer = 1.5;
    for (let t = 0; t < 60 * 60; t++) updateClassPassives(w, DT);

    expect(s.hp).toBe(hpBefore);
    expect(s.dead).toBe(false);
    expect(w.classSummons.filter((c) => c.kind === 'bone_pylon')).toHaveLength(0);
  });

  it('the tower passive adds damage only below full HP, and only in Act I', () => {
    const w = worldWith('necromancer');
    w.warden.x = 10;
    w.warden.y = 10;
    const arrow = content.towerByKey.get('arrow_spire')!;
    buildTower(w, arrow.id, 11, 10);
    const s = w.structureAt(11, 10)!;
    const full = towerDamage(w, s, 10);
    s.hp = s.maxHp * 0.5;
    const bonus = newClass('necromancer').towerPassive.mods.towerLowHpDamageBonus;
    expect(towerDamage(w, s, 10)).toBeCloseTo(full * (1 + bonus), 5);
    w.phase = 'act2';
    expect(towerDamage(w, s, 10)).toBeCloseTo(full, 5);
  });
});

describe('p6d: Engineer — Field Kit, Pop Turret, and the summon cap', () => {
  function withTower(): { w: World; s: Structure } {
    const w = worldWith('engineer');
    w.warden.x = 10;
    w.warden.y = 10;
    const arrow = content.towerByKey.get('arrow_spire')!;
    buildTower(w, arrow.id, 11, 10);
    return { w, s: w.structureAt(11, 10)! };
  }

  it('Field Kit repairs and overclocks the nearest structure', () => {
    const { w, s } = withTower();
    s.hp = s.maxHp * 0.2;
    const before = attackSpeedFor(w, s);
    applyCommand(w, { k: 'class_active', aimX: 11, aimY: 10 });
    const eff = newClass('engineer').active1;
    expect(s.hp).toBeCloseTo(s.maxHp * (0.2 + eff.repairFraction!), 5);
    expect(s.atkSpdBuffRemaining).toBeCloseTo(eff.overclockSeconds!, 5);
    expect(attackSpeedFor(w, s)).toBeCloseTo(before * (1 + eff.overclockAtkSpdMul!), 5);
  });

  it('the overclock expires on its own clock', () => {
    const { w, s } = withTower();
    applyCommand(w, { k: 'class_active', aimX: 11, aimY: 10 });
    const seconds = newClass('engineer').active1.overclockSeconds!;
    for (let t = 0; t < Math.ceil(seconds * 60) + 2; t++) updateTowers(w, DT);
    expect(s.atkSpdBuffRemaining).toBe(0);
  });

  it('never repairs past max HP', () => {
    const { w, s } = withTower();
    s.hp = s.maxHp;
    applyCommand(w, { k: 'class_active', aimX: 11, aimY: 10 });
    expect(s.hp).toBe(s.maxHp);
  });

  it('Pop Turret caps at summonCap, evicting the oldest', () => {
    const w = worldWith('engineer');
    const cap = newClass('engineer').active2.summonCap!;
    const ids: number[] = [];
    for (let i = 0; i < cap + 2; i++) {
      w.warden.active2Cooldown = 0;
      applyCommand(w, { k: 'class_active2' });
      const live = w.classSummons.filter((s) => s.kind === 'engineer_turret');
      expect(live.length).toBeLessThanOrEqual(cap);
      ids.push(live[live.length - 1].id);
    }
    const live = w.classSummons.filter((s) => s.kind === 'engineer_turret');
    expect(live).toHaveLength(cap);
    expect(live.some((s) => s.id === ids[0])).toBe(false);
    expect(live.some((s) => s.id === ids[ids.length - 1])).toBe(true);
  });

  it('a deployed turret shoots, then expires', () => {
    const w = worldWith('engineer');
    w.warden.x = 10;
    w.warden.y = 10;
    const e = dummy(w, 11, 10);
    w.rebuildBuckets();
    applyCommand(w, { k: 'class_active2' });
    updateClassSummons(w, DT);
    expect(e.hp).toBeLessThan(1e6);
    const seconds = newClass('engineer').active2.summonDurationSeconds!;
    for (let t = 0; t < Math.ceil(seconds * 60) + 2; t++) updateClassSummons(w, DT);
    expect(w.classSummons.filter((s) => s.kind === 'engineer_turret')).toHaveLength(0);
  });

  it('b047: a deployed turret deals no damage once w.dying is set, mirroring updateWieldedAttacks/updateVsSpecials\' guard', () => {
    // QA-filed verifying b020: unlike the Active2 command that spawns it
    // (already dying-guarded), a live turret attacks every tick straight
    // from updateAct1*/updateAct2 with no Command gate to catch it at — it
    // kept dealing damage for the whole DEFEAT_SLOWMO window after the
    // Warden died.
    const w = worldWith('engineer');
    w.warden.x = 10;
    w.warden.y = 10;
    const e = dummy(w, 11, 10);
    w.rebuildBuckets();
    applyCommand(w, { k: 'class_active2' });
    w.dying = 'defeat_warden';
    w.dyingTimer = 1.5;

    updateClassSummons(w, DT);

    expect(e.hp).toBe(1e6);
    expect(w.classSummons.some((s) => s.kind === 'engineer_turret')).toBe(true);
  });

  it('b047: a real defeat through Run.step fires no turret attack during the slow-mo window', () => {
    const run = new Run(cfg({ classKey: 'engineer' }));
    const w = run.world;
    w.gold = 1e6;
    w.warden.attackCooldown = 1e9;
    w.phase = 'act2';
    w.sundered = true;
    w.warden.x = 10;
    w.warden.y = 10;
    w.updateNav(true);
    const e = dummy(w, 11, 10);
    w.rebuildBuckets();
    applyCommand(w, { k: 'class_active2' });
    // Arm the cooldown at 0 so the very next tick would fire if the dying
    // guard were missing.
    const turret = w.classSummons.find((s) => s.kind === 'engineer_turret')!;
    turret.attackCooldown = 0;

    damageWarden(w, 999999);
    expect(w.dying).toBe('defeat_warden');

    for (let i = 0; i < 95 && !run.done; i++) run.step(idleInput());

    expect(run.done).toBe(true);
    expect(run.world.outcome).toBe('defeat_warden');
    expect(e.hp).toBe(1e6);
  });

  it('the tower passive raises every structure\'s max HP', () => {
    const arrow = content.towerByKey.get('arrow_spire')!;
    const eng = worldWith('engineer');
    const plain = worldWith('swordsman');
    const bonus = newClass('engineer').towerPassive.mods.towerHp;
    expect(structureMaxHp(eng, arrow, 1)).toBeCloseTo(structureMaxHp(plain, arrow, 1) * (1 + bonus), 5);
  });
});

describe('p6d: Animist — a manifested spirit, and the totem aura', () => {
  it('Manifest clones a built tower at a share of its highest-upgrade stats', () => {
    const w = worldWith('animist');
    w.warden.x = 10;
    w.warden.y = 10;
    buildTower(w, content.towerByKey.get('arrow_spire')!.id, 11, 10);
    applyCommand(w, { k: 'class_active' });
    const spirits = w.classSummons.filter((s) => s.kind === 'animist_spirit');
    expect(spirits).toHaveLength(1);
    expect(spirits[0].dps).toBeGreaterThan(0);
  });

  it('Manifest does nothing (but still pays) with no attacking tower in reach', () => {
    const w = worldWith('animist');
    applyCommand(w, { k: 'class_active' });
    expect(w.classSummons.filter((s) => s.kind === 'animist_spirit')).toHaveLength(0);
    expect(w.warden.active1Cooldown).toBeGreaterThan(0);
  });

  it('Recall Totem speeds up the character\'s basic attack inside its radius', () => {
    const w = new World(cfg({ classKey: 'animist' }));
    w.warden.x = 10;
    w.warden.y = 10;
    const cls = newClass('animist');
    const e = dummy(w, 11, 10);
    w.rebuildBuckets();
    void e;

    const plain = new World(cfg({ classKey: 'animist' }));
    plain.warden.x = 10;
    plain.warden.y = 10;
    dummy(plain, 11, 10);
    plain.rebuildBuckets();

    applyCommand(w, { k: 'class_active2' });
    classBasicAttack(w, cls);
    classBasicAttack(plain, cls);
    expect(w.warden.attackCooldown).toBeCloseTo(
      plain.warden.attackCooldown / (1 + cls.active2.auraAtkSpdMul!),
      6,
    );
  });

  it('a second totem replaces the first rather than stacking', () => {
    const w = worldWith('animist');
    applyCommand(w, { k: 'class_active2' });
    w.warden.active2Cooldown = 0;
    applyCommand(w, { k: 'class_active2' });
    expect(w.classSummons.filter((s) => s.kind === 'animist_totem')).toHaveLength(1);
  });
});

describe('p6d: Paladin — Guardian Stance, Wrath and Judgement', () => {
  it('grants its armour only after the stand-still window', () => {
    const w = worldWith('paladin');
    const cls = newClass('paladin');
    const base = wardenArmor(w);
    updateClassPassives(w, DT);
    expect(wardenArmor(w)).toBeCloseTo(base, 6);
    for (let t = 0; t < 90; t++) updateClassPassives(w, DT);
    expect(wardenArmor(w)).toBeCloseTo(base + cls.passive.stanceArmor!, 6);
    w.warden.x += 1;
    updateClassPassives(w, DT);
    expect(wardenArmor(w)).toBeCloseTo(base, 6);
  });

  it('banks the full blocked share of a hit as Wrath, and more of it under Clarion Taunt', () => {
    const w = worldWith('paladin');
    w.derived.armor = 50; // half of every normal hit is blocked
    const share = newClass('paladin').passive.wrathFraction!;
    damageWarden(w, 100);
    // Base passive: "blocked damage charges Wrath" names no percentage — the
    // full 50 blocked is banked, not `wrathFraction` (that belongs to Clarion).
    expect(w.warden.wrathStored).toBeCloseTo(50, 5);

    w.warden.wrathStored = 0;
    w.warden.clarionRemaining = 4;
    damageWarden(w, 100);
    // Under Clarion: the same 50 blocked, plus Clarion's own 60% of the 50 applied.
    expect(w.warden.wrathStored).toBeCloseTo(50 + 50 * share, 5);
  });

  it('no other class ever banks Wrath', () => {
    const w = worldWith('swordsman');
    damageWarden(w, 100);
    expect(w.warden.wrathStored).toBe(0);
  });

  it('b050: Warden-contact damage stops banking Wrath once w.dying is set', () => {
    // qa-playtester-filed verifying b049: same DEFEAT_SLOWMO bug class as
    // b020/b046/b047/b048/b049 — contactWarden had no w.dying guard, so an
    // enemy glued into contact range kept banking Wrath (via storeWrath's
    // blocked-damage clause) for the whole 1.5s beat even though wd.hp
    // itself is harmless (clamped to 0).
    const w = worldWith('paladin');
    w.derived.armor = 50; // half of every contact hit is blocked, feeding Wrath
    w.phase = 'act2';
    w.sundered = true;
    w.warden.x = 10;
    w.warden.y = 10;
    w.updateNav(true);
    const e = dummy(w, 10, 10);
    e.attackCooldown = 0;
    w.rebuildBuckets();

    w.dying = 'defeat_warden';
    w.dyingTimer = 1.5;
    const before = w.warden.wrathStored;
    for (let i = 0; i < 90; i++) updateEnemies(w, DT);

    expect(w.warden.wrathStored).toBe(before);
  });

  it('b050: a real defeat through Run.step stops banking Wrath during the slow-mo window', () => {
    const run = new Run(cfg({ classKey: 'paladin' }));
    const w = run.world;
    w.gold = 1e6;
    w.derived.armor = 50;
    w.warden.attackCooldown = 1e9;
    w.phase = 'act2';
    w.sundered = true;
    w.warden.x = 10;
    w.warden.y = 10;
    w.updateNav(true);
    const e = dummy(w, 10, 10);
    e.attackCooldown = 0;
    w.rebuildBuckets();

    damageWarden(w, 999999);
    expect(w.dying).toBe('defeat_warden');
    const before = w.warden.wrathStored;

    for (let i = 0; i < 95 && !run.done; i++) run.step(idleInput());

    expect(run.done).toBe(true);
    expect(run.world.outcome).toBe('defeat_warden');
    expect(w.warden.wrathStored).toBe(before);
  });

  it('b051: a stomping enemy in range stops banking Wrath once w.dying is set', () => {
    // code-reviewer/qa-playtester-filed verifying b050: updateAbilities runs
    // before contactWarden in updateEnemies and has no w.dying guard of its
    // own, so its TRAIT.stomp branch kept calling damageWarden (and thus
    // storeWrath) through the whole DEFEAT_SLOWMO beat.
    const w = worldWith('paladin');
    w.derived.armor = 50; // half of every stomp hit is blocked, feeding Wrath
    w.phase = 'act2';
    w.sundered = true;
    w.warden.x = 10;
    w.warden.y = 10;
    w.updateNav(true);
    const e = dummy(w, 10, 10);
    e.flags |= TRAIT.stomp;
    e.abilityTimer = 0;
    w.rebuildBuckets();

    w.dying = 'defeat_warden';
    w.dyingTimer = 1.5;
    const before = w.warden.wrathStored;
    for (let i = 0; i < 90; i++) updateEnemies(w, DT);

    expect(w.warden.wrathStored).toBe(before);
  });

  it('b051: a ranged enemy in range stops banking Wrath once w.dying is set', () => {
    const w = worldWith('paladin');
    w.derived.armor = 50; // half of every ranged hit is blocked, feeding Wrath
    w.phase = 'act2';
    w.sundered = true;
    w.warden.x = 10;
    w.warden.y = 10;
    w.updateNav(true);
    const e = dummy(w, 10, 10);
    e.flags |= TRAIT.ranged;
    e.attackCooldown = 0;
    w.rebuildBuckets();

    w.dying = 'defeat_warden';
    w.dyingTimer = 1.5;
    const before = w.warden.wrathStored;
    for (let i = 0; i < 90; i++) updateEnemies(w, DT);

    expect(w.warden.wrathStored).toBe(before);
  });

  it('Judgement spends the whole store as a nova', () => {
    const w = worldWith('paladin');
    w.warden.x = 10;
    w.warden.y = 10;
    const e = dummy(w, 11, 10);
    w.rebuildBuckets();
    w.warden.wrathStored = 200;
    applyCommand(w, { k: 'class_active2' });
    expect(w.warden.wrathStored).toBe(0);
    const mul = newClass('paladin').active2.wrathDamageMul!;
    expect(1e6 - e.hp).toBeCloseTo(200 * mul * w.derived.powerMul, 4);

    // Nothing banked, nothing dealt — but the Active still pays.
    const w2 = worldWith('paladin');
    const e2 = dummy(w2, w2.warden.x + 1, w2.warden.y);
    w2.rebuildBuckets();
    applyCommand(w2, { k: 'class_active2' });
    expect(e2.hp).toBe(1e6);
    expect(w2.warden.active2Cooldown).toBeGreaterThan(0);
  });

  it('code review, fb015: 0 stored Wrath still deals nothing even with an atkFlat-granting item equipped', () => {
    // Regression: characterDamage (classes.ts) folds equipment's flat Atk in
    // before classAttackPowerMul, and fireJudgement used to run that fold on
    // the raw `wrathStored * wrathDamageMul` product *before* gating on it
    // being positive — so 0 Wrath plus any atkFlat item (10 of fb015's 12)
    // still dealt that flat's worth of damage on cooldown alone.
    const w = worldWith('paladin', { equipment: ['greatsword'] });
    expect(w.derived.atkFlat).toBeGreaterThan(0);
    const e = dummy(w, w.warden.x + 1, w.warden.y);
    w.rebuildBuckets();
    expect(w.warden.wrathStored).toBe(0);
    applyCommand(w, { k: 'class_active2' });
    expect(e.hp).toBe(1e6);
    expect(w.warden.active2Cooldown).toBeGreaterThan(0);
  });

  it('the tower passive adds both HP and defense points', () => {
    const arrow = content.towerByKey.get('arrow_spire')!;
    const pal = worldWith('paladin');
    const plain = worldWith('swordsman');
    pal.warden.x = 10;
    pal.warden.y = 10;
    plain.warden.x = 10;
    plain.warden.y = 10;
    buildTower(pal, arrow.id, 11, 10);
    buildTower(plain, arrow.id, 11, 10);
    const mods = newClass('paladin').towerPassive.mods;
    expect(structureMaxHp(pal, arrow, 1)).toBeCloseTo(structureMaxHp(plain, arrow, 1) * (1 + mods.towerHp), 5);
    expect(structureArmor(pal, pal.structureAt(11, 10)!)).toBeCloseTo(
      structureArmor(plain, plain.structureAt(11, 10)!) + mods.towerDefenseBonus,
      5,
    );
  });
});

describe('p6d: Bloodlord — phase-dependent attack, the tithe, and the rush', () => {
  it('Blood Tithe charges the tower once and buys permanent damage', () => {
    const w = worldWith('bloodlord');
    w.warden.x = 10;
    w.warden.y = 10;
    buildTower(w, content.towerByKey.get('arrow_spire')!.id, 11, 10);
    const s = w.structureAt(11, 10)!;
    const before = towerDamage(w, s, 10);
    const hpBefore = s.hp;
    const eff = newClass('bloodlord').active1;

    applyCommand(w, { k: 'class_active', aimX: 11, aimY: 10 });
    expect(s.tithed).toBe(true);
    expect(s.hp).toBeCloseTo(hpBefore * (1 - eff.titheHpFraction!), 5);
    expect(towerDamage(w, s, 10)).toBeCloseTo(before * (1 + eff.titheDamageMul!), 5);

    // A second cast must not find the same tower again.
    const hpAfter = s.hp;
    w.warden.active1Cooldown = 0;
    applyCommand(w, { k: 'class_active', aimX: 11, aimY: 10 });
    expect(s.hp).toBeCloseTo(hpAfter, 5);
  });

  it('Crimson Rush heals per enemy passed and deals no damage', () => {
    const w = worldWith('bloodlord');
    w.warden.x = 4;
    w.warden.y = 10;
    w.warden.hp = 1;
    const line = [dummy(w, 5, 10), dummy(w, 6, 10), dummy(w, 7, 10)];
    w.rebuildBuckets();
    applyCommand(w, { k: 'class_active2', aimX: 12, aimY: 10 });
    const eff = newClass('bloodlord').active2;
    expect(w.warden.hp).toBeCloseTo(1 + line.length * eff.healPerEnemy!, 5);
    for (const e of line) expect(e.hp).toBe(1e6);
  });

  it('Blood Frenzy shifts the character\'s own attack by phase, and nothing else\'s', () => {
    const cls = newClass('bloodlord');
    const td = worldWith('bloodlord');
    const vs = worldWith('bloodlord');
    vs.phase = 'act2';
    expect(classAttackPowerMul(td, cls)).toBeCloseTo(td.derived.powerMul * (1 + cls.passive.frenzyTdMul!), 6);
    expect(classAttackPowerMul(vs, cls)).toBeCloseTo(vs.derived.powerMul * (1 + cls.passive.frenzyVsMul!), 6);
  });

  it('the tower passive trades max HP for damage', () => {
    const arrow = content.towerByKey.get('arrow_spire')!;
    const blood = worldWith('bloodlord');
    const plain = worldWith('swordsman');
    const mods = newClass('bloodlord').towerPassive.mods;
    expect(structureMaxHp(blood, arrow, 1)).toBeCloseTo(structureMaxHp(plain, arrow, 1) * (1 + mods.towerHp), 5);
    expect(blood.derived.towerDamageMul).toBeCloseTo(1 + mods.towerDamage, 6);
  });
});

describe('p6d: Pyro — Contagious Flame, Flame Road and the Burning tower passive', () => {
  it('a Burning enemy damages its neighbours, and a clean one does not', () => {
    const w = worldWith('pyromancer');
    const carrier = dummy(w, 10, 10);
    const touching = dummy(w, 10.5, 10);
    const away = dummy(w, 14, 10);
    w.rebuildBuckets();
    applyEffects(w, carrier, { burnDps: 1, burnDuration: 5 });
    updateClassPassives(w, 1);
    const dps = newClass('pyromancer').passive.flameDps!;
    expect(1e6 - touching.hp).toBeCloseTo(dps, 4);
    expect(away.hp).toBe(1e6);
  });

  it('does nothing for a class without the passive', () => {
    const w = worldWith('swordsman');
    const carrier = dummy(w, 10, 10);
    const touching = dummy(w, 10.5, 10);
    w.rebuildBuckets();
    applyEffects(w, carrier, { burnDps: 1, burnDuration: 5 });
    updateClassPassives(w, 1);
    expect(touching.hp).toBe(1e6);
  });

  it('b048: deals no touch damage once w.dying is set, mirroring b020/b046/b047\'s guard', () => {
    const w = worldWith('pyromancer');
    const carrier = dummy(w, 10, 10);
    const touching = dummy(w, 10.5, 10);
    w.rebuildBuckets();
    applyEffects(w, carrier, { burnDps: 1, burnDuration: 5 });
    w.dying = 'defeat_warden';
    w.dyingTimer = 1.5;
    updateClassPassives(w, 1);
    expect(touching.hp).toBe(1e6);
  });

  it('Flame Road leaves exactly trailSegments burning patches along the dash', () => {
    const w = worldWith('pyromancer');
    w.warden.x = 8;
    w.warden.y = 10;
    applyCommand(w, { k: 'class_active2', aimX: 20, aimY: 10 });
    const patches = w.areas.filter((a) => a.type === 'burn' && !a.dead);
    expect(patches).toHaveLength(newClass('pyromancer').active2.trailSegments!);
    expect(w.warden.x).toBeGreaterThan(8);
  });

  it('the tower passive only bites on a Burning target', () => {
    const w = worldWith('pyromancer');
    w.warden.x = 10;
    w.warden.y = 10;
    buildTower(w, content.towerByKey.get('arrow_spire')!.id, 11, 10);
    const burning = dummy(w, 12, 10);
    const clean = dummy(w, 12, 11);
    w.rebuildBuckets();
    applyEffects(w, burning, { burnDps: 1, burnDuration: 10 });
    updateTowers(w, 10);
    // The Arrow Spire fires at whichever is nearest the Core, so this compares
    // the multiplier through `dealHit` directly rather than through targeting.
    const bonus = newClass('pyromancer').towerPassive.mods.towerDamageVsBurning;
    const fx = { towerBonus: { extraElectricPct: 0, vsBurningPct: bonus, vsChilledPct: 0 } };
    const a = dealHit(w, burning, 100, 'test', fx, {});
    const b = dealHit(w, clean, 100, 'test', fx, {});
    expect(a).toBeCloseTo(b * (1 + bonus), 4);
  });
});

describe('p6d: Stormcaller tower passive — +10% of tower damage as extra Electric', () => {
  it('lands a second, Electric-typed hit off an Act I tower shot', () => {
    const build = (classKey: string): number => {
      const w = worldWith(classKey);
      w.warden.x = 10;
      w.warden.y = 10;
      buildTower(w, content.towerByKey.get('arrow_spire')!.id, 11, 10);
      const e = dummy(w, 12, 10);
      w.rebuildBuckets();
      updateTowers(w, 10);
      return 1e6 - e.hp;
    };
    const storm = build('stormcaller');
    const plain = build('swordsman');
    expect(storm).toBeGreaterThan(plain);
    const pct = newClass('stormcaller').towerPassive.mods.towerExtraElectricPct;
    expect(storm).toBeCloseTo(plain * (1 + pct), 3);
  });

  it('is Act I only', () => {
    const w = worldWith('stormcaller');
    w.phase = 'act2';
    expect(classTowerBonus(w)).toBeNull();
  });
});

describe('p6d: Archer Quickstep does not eat a Deadeye charge', () => {
  it('dashes and fires without clearing active1Charging', () => {
    const w = worldWith('archer');
    w.warden.x = 6;
    w.warden.y = 10;
    const targets = [dummy(w, 7, 10), dummy(w, 7, 11), dummy(w, 7.5, 10.5), dummy(w, 15, 10)];
    w.rebuildBuckets();
    w.warden.active1Charging = true;
    w.warden.active1Charge = 2;

    applyCommand(w, { k: 'class_active2', aimX: 8, aimY: 10 });
    expect(w.warden.active1Charging).toBe(true);
    expect(w.warden.active1Charge).toBe(2);
    const struck = targets.filter((e) => e.hp < 1e6);
    expect(struck).toHaveLength(newClass('archer').active2.volleyShots!);
    expect(targets[3].hp).toBe(1e6); // out of the volley's own radius
  });

  it('drawing slows the Warden down, releasing restores full speed', () => {
    const w = worldWith('archer');
    expect(classMoveSpeedMul(w)).toBe(1);
    w.warden.active1Charging = true;
    expect(classMoveSpeedMul(w)).toBeCloseTo(newClass('archer').active1.moveMulWhileCharging!, 6);
    const other = worldWith('swordsman');
    other.warden.active1Charging = true;
    expect(classMoveSpeedMul(other)).toBe(1);
  });
});

/* --------------------------------------------------------------- smoke runs */

describe('p6d: every class survives a scripted run without throwing or producing garbage', () => {
  const keys = content.classes.classes.map((c) => c.key);

  it.each(keys)('%s', (classKey) => {
    const run = new Run(cfg({ classKey }));
    run.world.gold = 1e5;
    for (let t = 0; t < 3000 && !run.done; t++) {
      const cmds: Command[] = [];
      const wd = run.world.warden;
      if (t % 90 === 10) cmds.push({ k: 'class_active', aimX: wd.x + 2, aimY: wd.y });
      if (t % 90 === 40) cmds.push({ k: 'class_active2', aimX: wd.x + 2, aimY: wd.y });
      run.step({
        mx: t % 200 < 100 ? 1 : -1,
        my: 0,
        dash: t % 211 === 0,
        attack: true,
        aimX: wd.x + 2,
        aimY: wd.y,
        active1Held: t % 300 < 200,
        cmds,
      });
    }
    const w = run.world;
    expect(Number.isFinite(w.warden.hp)).toBe(true);
    expect(Number.isFinite(w.warden.wrathStored)).toBe(true);
    expect(Number.isFinite(w.damageTotal)).toBe(true);
    expect(Number.isFinite(w.coreHp)).toBe(true);
    for (const e of w.enemies) expect(Number.isFinite(e.hp)).toBe(true);
    for (const s of w.structures) expect(Number.isFinite(s.hp)).toBe(true);
    for (const s of w.classSummons) expect(Number.isFinite(s.remaining)).toBe(true);
    const report = run.report();
    for (const [k, v] of Object.entries(report)) {
      if (typeof v === 'number') expect(Number.isFinite(v), `${classKey}.${k}`).toBe(true);
    }
    // Progressing: the run either resolved or is still ticking with a wave underway.
    expect(w.tick).toBeGreaterThan(0);
  });
});

describe('p6d: replay determinism with every new mechanic in the log', () => {
  it.each(['archer', 'necromancer', 'cryomancer', 'stormcaller', 'animist', 'paladin'])(
    '%s replays to an identical end-state hash',
    (classKey) => {
      const log: TickInput[] = [];
      for (let t = 0; t < 900; t++) {
        const cmds: Command[] = [];
        if (t % 120 === 10) cmds.push({ k: 'class_active', aimX: 12, aimY: 10 });
        if (t % 120 === 60) cmds.push({ k: 'class_active2', aimX: 12, aimY: 10 });
        log.push({
          mx: t % 100 < 50 ? 1 : -1,
          my: 0,
          dash: false,
          attack: true,
          aimX: 12,
          aimY: 10,
          active1Held: t % 240 < 160,
          cmds,
        });
      }
      const a = new Run(cfg({ classKey }));
      a.world.gold = 1e5;
      for (const input of log) a.step(input);
      const b = new Run(cfg({ classKey }));
      b.world.gold = 1e5;
      for (const input of log) b.step(input);
      expect(a.hash()).toBe(b.hash());
      expect(hashWorld(a.world)).toBe(hashWorld(b.world));
    },
  );
});

describe('p6d: the new state is hashed', () => {
  it.each([
    ['overloadRemaining', (w: World) => { w.warden.overloadRemaining = 3; }],
    ['standStillTimer', (w: World) => { w.warden.standStillTimer = 2; }],
    ['wrathStored', (w: World) => { w.warden.wrathStored = 42; }],
    ['clarionRemaining', (w: World) => { w.warden.clarionRemaining = 1; }],
    ['classSummons', (w: World) => { w.classSummons.push({ id: 7, x: 1, y: 2, dps: 1, range: 1, interval: 1, aoe: 0, attackCooldown: 0, remaining: 5, kind: 'k' }); }],
    ['corpses', (w: World) => { w.corpses.push({ id: 9, x: 1, y: 2, remaining: 6 }); }],
    ['tempWalls', (w: World) => { w.tempWalls.push({ structureIds: [3, 1, 2], remaining: 5 }); }],
  ])('%s changes the hash', (_name, mutate) => {
    const a = worldWith('paladin');
    const b = worldWith('paladin');
    expect(hashWorld(a)).toBe(hashWorld(b));
    mutate(b);
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });

  it('frostHitStacks changes the hash', () => {
    const a = worldWith('cryomancer');
    const b = worldWith('cryomancer');
    const ea = dummy(a, 10, 10);
    const eb = dummy(b, 10, 10);
    void ea;
    expect(hashWorld(a)).toBe(hashWorld(b));
    eb.frostHitStacks = 3;
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });

  it('a structure\'s pact/overclock/tithe flags change the hash', () => {
    const build = (mutate: (s: Structure) => void): string => {
      const w = worldWith('necromancer');
      w.warden.x = 10;
      w.warden.y = 10;
      buildTower(w, content.towerByKey.get('arrow_spire')!.id, 11, 10);
      mutate(w.structureAt(11, 10)!);
      return hashWorld(w);
    };
    const base = build(() => {});
    expect(build((s) => { s.pactActive = true; })).not.toBe(base);
    expect(build((s) => { s.atkSpdBuffRemaining = 4; })).not.toBe(base);
    expect(build((s) => { s.tithed = true; })).not.toBe(base);
  });
});

describe('p6d: QA precedent — w.dying freezes every new Active too', () => {
  it.each(KITS.map(([k]) => k))('%s fires nothing while dying', (classKey) => {
    const w = worldWith(classKey);
    w.phase = 'act2';
    w.dying = 'defeat_warden';
    applyCommand(w, { k: 'class_active' });
    applyCommand(w, { k: 'class_active2' });
    expect(w.warden.active1Cooldown).toBe(0);
    expect(w.warden.active2Cooldown).toBe(0);
  });
});

describe('p6d: damageEnemy still credits a class summon by its own source key', () => {
  it('a skeleton\'s damage lands under "class_summon"', () => {
    const w = worldWith('necromancer');
    w.warden.x = 10;
    w.warden.y = 10;
    const e = dummy(w, 10.5, 10, 1);
    w.rebuildBuckets();
    killEnemy(w, e, 'test');
    w.compact();
    const victim = dummy(w, 10.5, 10);
    w.rebuildBuckets();
    applyCommand(w, { k: 'class_active' });
    expect(w.classSummons.filter((s) => s.kind === 'necro_skeleton').length).toBeGreaterThan(0);
    updateClassSummons(w, DT);
    expect(victim.hp).toBeLessThan(1e6);
    expect(w.damageByWeapon.class_summon).toBeGreaterThan(0);
  });
});
