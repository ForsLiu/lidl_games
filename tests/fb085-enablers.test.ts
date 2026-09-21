/**
 * fb085 — the enabling infrastructure BACKLOG-CONTENT.md's session-1 Log
 * found missing for fb056/fb057/fb059/fb061/fb062 (all needed a
 * `src/sim/content.ts`/shared-file change outside the content lane's Scope).
 * This file tests each enabler on its own, not the downstream owner items
 * themselves — those still need their own class/equipment rows authored in
 * `data/classes.json`/`data/equipment.json` (content lane) before they do
 * anything in a real run.
 *
 * (a) `EquipmentItem.effectKey`: closed 4-member enum -> validated open
 *     string registry, plus a new `effectNums` field.
 * (b) `passive.kind`/`active.kind` enum members + `REQUIRED_*_FIELDS` rows
 *     for Madness King/Voltbolt, plus the generic `madness` Enemy status and
 *     its targeting/movement logic.
 * (c) a zero-charge duration floor beside `groundDurationSeconds`.
 * (d) hooks for Ring of Contagion / Chronomail / Bracer of Overlap.
 */
import { describe, expect, it } from 'vitest';

import {
  loadContent,
  validateClassEffect,
  validateClassPassive,
  validateEquipmentEffectKey,
  type ClassEffect,
  type Content,
} from '../src/sim/content';
import { equipmentEffectNum, hasEquipment } from '../src/sim/equipment';
import {
  applyMadness,
  damageEnemy,
  dotOutstanding,
  enemyAttackSpeedMul,
  applyDot,
  effectiveSpeed,
  madnessMoveTarget,
  madnessPerStackBonus,
  registerMadnessAttack,
  spawnEnemy,
  TAUNT_WARDEN,
  updateEnemies,
} from '../src/sim/enemies';
import { damageWarden } from '../src/sim/run';
import { dist } from '../src/sim/math';
import { timeLockZoneCap, World } from '../src/sim/world';
import { cfg } from './helpers';

const content = loadContent();
const DT = 1 / 60;

/* ------------------------------------------------------------------------ */
/* (a) effectKey: closed enum -> validated open string registry             */
/* ------------------------------------------------------------------------ */

type RawEquipmentDoc = { slots: string[]; items: Record<string, unknown>[] };

function cloneEquipmentDoc(): RawEquipmentDoc {
  return JSON.parse(JSON.stringify(content.raw.equipment)) as RawEquipmentDoc;
}

describe('fb085(a): EquipmentItem.effectKey is a validated open string registry, not a closed enum', () => {
  it('loadContent refuses an item authoring an unregistered effectKey (typo/unpayable data)', () => {
    const doc = cloneEquipmentDoc();
    doc.items.push({
      key: 'fb085_test_bad_key',
      slot: 'ring',
      name: 'Test Bad Key',
      mods: {},
      effectKey: 'not_a_real_effect_key',
      desc: 'test',
    });
    expect(() => loadContent({ equipment: doc })).toThrow(/unknown effectKey/);
  });

  it('validateEquipmentEffectKey accepts every registered key (matching its own item key), and rejects an unregistered one', () => {
    expect(() => validateEquipmentEffectKey({ key: 'x', effectKey: 'none' }, 'x')).not.toThrow();
    expect(() => validateEquipmentEffectKey({ key: 'sleeve_sword', effectKey: 'sleeve_sword' }, 'x')).not.toThrow();
    expect(() => validateEquipmentEffectKey({ key: 'ring_of_contagion', effectKey: 'ring_of_contagion' }, 'x')).not.toThrow();
    expect(() => validateEquipmentEffectKey({ key: 'chronomail', effectKey: 'chronomail' }, 'x')).not.toThrow();
    expect(() => validateEquipmentEffectKey({ key: 'bracer_of_overlap', effectKey: 'bracer_of_overlap' }, 'x')).not.toThrow();
    expect(() => validateEquipmentEffectKey({ key: 'x', effectKey: 'nonsense' }, 'x')).toThrow();
  });

  // qa-playtester finding, fb085: the registry alone does not connect an item
  // to its engine hook — every real dispatch site (`hasEquipment`,
  // `equipmentEffectNum`) gates on the item's own `key`, so a registered-but-
  // mismatched pair would otherwise load clean and its hook would just never
  // fire, a silent no-op rather than a load error.
  it('loadContent refuses a registered effectKey that does not match its own item key (the silent-no-op shape)', () => {
    const doc = cloneEquipmentDoc();
    doc.items.push({
      key: 'plague_ring_test',
      slot: 'ring',
      name: 'Mismatched Test Item',
      mods: {},
      effectKey: 'ring_of_contagion', // registered, but the item's own key is different
      effectNums: { extraTargets: 1 },
      desc: 'test',
    });
    expect(() => loadContent({ equipment: doc })).toThrow(/does not match its own key/);
  });

  it('validateEquipmentEffectKey rejects a registered-but-mismatched key/effectKey pair directly', () => {
    expect(() => validateEquipmentEffectKey({ key: 'plague_ring', effectKey: 'ring_of_contagion' }, 'x')).toThrow(
      /does not match its own key/,
    );
  });

  it('a registered effectKey (matching its own item key) with an effectNums bag loads clean and the numbers reach content.equipmentByKey', () => {
    const doc = cloneEquipmentDoc();
    doc.items.push({
      key: 'ring_of_contagion',
      slot: 'ring',
      name: 'Test Item',
      mods: {},
      effectKey: 'ring_of_contagion',
      effectNums: { extraTargets: 2 },
      desc: 'test',
    });
    const c = loadContent({ equipment: doc });
    const item = c.equipmentByKey.get('ring_of_contagion')!;
    expect(item.effectKey).toBe('ring_of_contagion');
    expect(item.effectNums.extraTargets).toBe(2);
  });

  it('effectNums defaults to {} when an item authors no such field (every real, unmigrated item)', () => {
    for (const item of content.equipment.items) {
      expect(item.effectNums).toEqual(expect.any(Object));
    }
    const greatsword = content.equipmentByKey.get('greatsword')!;
    expect(greatsword.effectNums).toEqual({});
  });

  it('equipmentEffectNum reads the equipped item\'s own effectNums field, and falls back otherwise', () => {
    const doc = cloneEquipmentDoc();
    doc.items.push({
      key: 'fb085_test_item2',
      slot: 'ring',
      name: 'Test Item 2',
      mods: {},
      effectKey: 'none', // effectKey is documentation/registry only — equipmentEffectNum gates by the item's own key
      effectNums: { extraTargets: 3 },
      desc: 'test',
    });
    const c = loadContent({ equipment: doc });

    const equipped = new World(cfg({ classKey: 'engineer', equipment: ['fb085_test_item2'] }), c);
    expect(equipmentEffectNum(equipped, 'fb085_test_item2', 'extraTargets', 0)).toBe(3);
    expect(equipmentEffectNum(equipped, 'fb085_test_item2', 'missingField', 7)).toBe(7);

    const notEquipped = new World(cfg({ classKey: 'engineer', equipment: [] }), c);
    expect(equipmentEffectNum(notEquipped, 'fb085_test_item2', 'extraTargets', 0)).toBe(0);
  });
});

/* ------------------------------------------------------------------------ */
/* (b) Madness King / Voltbolt kind enums + REQUIRED_*_FIELDS               */
/* ------------------------------------------------------------------------ */

/** A minimal, otherwise-valid ClassEffect row for a given kind — every base field `ClassEffectSchema` always requires, none of a kind's own optionals. */
function baseEffect(kind: string, over: Record<string, unknown> = {}): ClassEffect {
  return { name: 'test', kind, cooldownSeconds: 1, radius: 0, damage: 0, ...over } as unknown as ClassEffect;
}

describe('fb085(b): Madness King/Voltbolt Active kinds + REQUIRED_EFFECT_FIELDS', () => {
  const WELL_FORMED: Record<string, Record<string, unknown>> = {
    mind_manipulation: {
      maxCharges: 3,
      rechargeSeconds: 4,
      eliteConvertTicks: 3,
      eliteConvertTickSeconds: 1,
      eliteConvertSlowAmount: 0.9,
    },
    spreading_madness: { madnessDurationSeconds: 10 },
    lightning_ball: { ballLifetimeSeconds: 2.5, moveSpeedDamageEfficiency: 0.25 },
    overdrive_voltbolt: {
      overdriveSeconds: 5,
      overdriveChain1Mul: 0.25,
      overdriveChain2Mul: 0.125,
      overdriveChain3Mul: 0.125,
      overdriveAtkSpdPerHit: 0.025,
      overdriveMoveSpdPerHit: 0.025,
    },
  };

  it.each(Object.keys(WELL_FORMED))('accepts a well-formed %s row', (kind) => {
    expect(() => validateClassEffect(baseEffect(kind, WELL_FORMED[kind]), 'x')).not.toThrow();
  });

  it.each(
    Object.entries(WELL_FORMED).flatMap(([kind, fields]) => Object.keys(fields).map((field) => [kind, field])),
  )('refuses a %s row missing "%s"', (kind, field) => {
    const fields = { ...WELL_FORMED[kind] };
    delete fields[field];
    expect(() => validateClassEffect(baseEffect(kind, fields), 'x')).toThrow();
  });
});

describe('fb085(b): Madness King/Voltbolt passive kinds + REQUIRED_PASSIVE_FIELDS', () => {
  const WELL_FORMED: Record<string, Record<string, unknown>> = {
    whispers: {
      madnessDurationSeconds: 3,
      madnessCap: 5,
      madnessAtkSpdPerStack: 0.1,
      madnessMoveSpdPerStack: 0.1,
    },
    frenzied_aim: { frenziedAimFlatBonus: 0.1 },
    arc: { arcChainDamageMul: 0.25, arcChainRadius: 3, arcChainDelaySeconds: 0.1 },
    lightning_accelerate: { projectileSpeedBonus: 1, towerStatConversionEfficiency: 0.5 },
  };

  function basePassive(kind: string, over: Record<string, unknown>): { kind?: string } {
    return { name: 'test', description: 'test', mods: {}, kind, ...over } as unknown as { kind?: string };
  }

  it.each(Object.keys(WELL_FORMED))('accepts a well-formed %s row', (kind) => {
    const fields = WELL_FORMED[kind];
    if (!fields) throw new Error(`expected WELL_FORMED to carry a "${kind}" row`);
    expect(() => validateClassPassive(basePassive(kind, fields), 'x')).not.toThrow();
  });

  it.each(
    Object.entries(WELL_FORMED).flatMap(([kind, fields]) => Object.keys(fields).map((field) => [kind, field])),
  )('refuses a %s row missing "%s"', (kind, field) => {
    const fields = { ...WELL_FORMED[kind] };
    delete fields[field];
    expect(() => validateClassPassive(basePassive(kind, fields), 'x')).toThrow();
  });
});

/* ------------------------------------------------------------------------ */
/* (b) the generic `madness` Enemy status + its targeting/movement          */
/* ------------------------------------------------------------------------ */

function worldWith(over: Record<string, unknown> = {}): World {
  const w = new World(cfg({ classKey: 'engineer', ...over }));
  w.gold = 1e6;
  return w;
}

function nth<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`expected index ${i} to exist`);
  return v;
}

function firstEnemyKey(w: World): string {
  const def = w.content.enemies.enemies[0];
  if (!def) throw new Error('expected at least one enemy definition');
  return def.key;
}

describe('fb085(b): the madness status on Enemy — install/decay/stacking', () => {
  it('applyMadness sets madnessRemaining, and Math.max-refreshes rather than resets it', () => {
    const w = worldWith();
    const e = spawnEnemy(w, firstEnemyKey(w), w.warden.x + 1, w.warden.y)!;
    applyMadness(e, 3);
    expect(e.madnessRemaining).toBe(3);
    applyMadness(e, 1); // shorter — must not shrink an already-longer remaining
    expect(e.madnessRemaining).toBe(3);
    applyMadness(e, 10); // longer — extends
    expect(e.madnessRemaining).toBe(10);
  });

  it('madnessRemaining decays every tick (tickTimers, via updateEnemies) and zeroes madnessStacks at expiry', () => {
    const w = worldWith();
    const e = spawnEnemy(w, firstEnemyKey(w), w.warden.x + 1, w.warden.y)!;
    w.rebuildBuckets();
    applyMadness(e, 2 / 60); // exactly 2 ticks
    registerMadnessAttack(e);
    expect(e.madnessStacks).toBe(1);
    updateEnemies(w, DT);
    expect(e.madnessRemaining).toBeCloseTo(1 / 60, 6);
    expect(e.madnessStacks).toBe(1); // not yet expired
    updateEnemies(w, DT);
    expect(e.madnessRemaining).toBe(0);
    expect(e.madnessStacks).toBe(0); // "lost at expiry"
  });

  it('registerMadnessAttack increments stacks while mad, and is a no-op once madnessRemaining has lapsed', () => {
    const w = worldWith();
    const e = spawnEnemy(w, firstEnemyKey(w), w.warden.x + 1, w.warden.y)!;
    registerMadnessAttack(e); // never mad — no-op
    expect(e.madnessStacks).toBe(0);
    applyMadness(e, 5);
    registerMadnessAttack(e);
    registerMadnessAttack(e);
    expect(e.madnessStacks).toBe(2);
    e.madnessRemaining = 0;
    registerMadnessAttack(e);
    expect(e.madnessStacks).toBe(2); // still a no-op past expiry
  });

  it('madnessPerStackBonus reads the active class\'s own whispers passive row, and is zero for every other class', () => {
    const doc = JSON.parse(JSON.stringify(content.raw.classes)) as { classes: { key: string; passive: Record<string, unknown> }[] };
    const row = doc.classes.find((c) => c.key === 'animist')!;
    row.passive = {
      name: 'Whispers (test)',
      description: 'test',
      mods: {},
      kind: 'whispers',
      madnessDurationSeconds: 3,
      madnessCap: 5,
      madnessAtkSpdPerStack: 0.1,
      madnessMoveSpdPerStack: 0.2,
    };
    const c = loadContent({ classes: doc });

    const madWorld = new World(cfg({ classKey: 'animist' }), c);
    expect(madnessPerStackBonus(madWorld)).toEqual({ attackSpeed: 0.1, moveSpeed: 0.2 });

    const otherWorld = new World(cfg({ classKey: 'engineer' }), c);
    expect(madnessPerStackBonus(otherWorld)).toEqual({ attackSpeed: 0, moveSpeed: 0 });
  });

  it('madnessStacks raises enemyAttackSpeedMul/effectiveSpeed by the per-stack bonus, multiplicatively', () => {
    const doc = JSON.parse(JSON.stringify(content.raw.classes)) as { classes: { key: string; passive: Record<string, unknown> }[] };
    const row = doc.classes.find((c) => c.key === 'animist')!;
    row.passive = {
      name: 'Whispers (test)',
      description: 'test',
      mods: {},
      kind: 'whispers',
      madnessDurationSeconds: 3,
      madnessCap: 5,
      madnessAtkSpdPerStack: 0.1,
      madnessMoveSpdPerStack: 0.1,
    };
    const c = loadContent({ classes: doc });
    const w = new World(cfg({ classKey: 'animist' }), c);
    const e = spawnEnemy(w, firstEnemyKey(w), w.warden.x + 1, w.warden.y)!;

    const baseAtkMul = enemyAttackSpeedMul(w, e);
    const baseSpeed = effectiveSpeed(w, e);
    e.madnessStacks = 3;
    expect(enemyAttackSpeedMul(w, e)).toBeCloseTo(baseAtkMul * 1.3, 6);
    expect(effectiveSpeed(w, e)).toBeCloseTo(baseSpeed * 1.3, 6);
  });
});

describe('fb085(b): madnessMoveTarget — the retarget/wander seam (§4.2 "attacks nearest other enemy in r3, or self + random-walk in r1")', () => {
  it('returns null for an enemy that is not currently mad', () => {
    const w = worldWith();
    const e = spawnEnemy(w, firstEnemyKey(w), w.warden.x + 1, w.warden.y)!;
    expect(madnessMoveTarget(w, e)).toBeNull();
  });

  it('returns null for a mad elite/boss — "elites never gain the movement change"', () => {
    const w = worldWith();
    const e = spawnEnemy(w, firstEnemyKey(w), w.warden.x + 1, w.warden.y, { elite: true })!;
    applyMadness(e, 3);
    expect(madnessMoveTarget(w, e)).toBeNull();
  });

  it('returns the nearest other live enemy within r3 when one stands that close', () => {
    const w = worldWith();
    const e = spawnEnemy(w, firstEnemyKey(w), 10, 10)!;
    const near = spawnEnemy(w, firstEnemyKey(w), 11, 10)!; // dist 1
    const far = spawnEnemy(w, firstEnemyKey(w), 19, 10)!; // dist 9, outside r3
    applyMadness(e, 3);
    w.rebuildBuckets();
    const target = madnessMoveTarget(w, e);
    expect(target).toEqual({ x: near.x, y: near.y });
    expect(target).not.toEqual({ x: far.x, y: far.y });
  });

  it('never targets itself, and skips a dead or submerged other enemy (falls back to wander, same as no candidate at all)', () => {
    const w = worldWith();
    const e = spawnEnemy(w, firstEnemyKey(w), 10, 10)!;
    const dead = spawnEnemy(w, firstEnemyKey(w), 10.5, 10)!;
    dead.dead = true;
    const submerged = spawnEnemy(w, firstEnemyKey(w), 10.8, 10)!;
    submerged.submerged = true;
    applyMadness(e, 3);
    w.rebuildBuckets();
    const target = madnessMoveTarget(w, e)!;
    expect(target).not.toBeNull();
    expect(target).not.toEqual({ x: e.x, y: e.y });
    expect(target).not.toEqual({ x: dead.x, y: dead.y });
    expect(target).not.toEqual({ x: submerged.x, y: submerged.y });
    expect(dist(e.x, e.y, target.x, target.y)).toBeCloseTo(1, 4); // the r1 wander radius
  });

  it('wanders within r1 of its own spot when nothing stands within r3 ("self + random-walk")', () => {
    const w = worldWith();
    const e = spawnEnemy(w, firstEnemyKey(w), 10, 10)!;
    applyMadness(e, 3);
    w.rebuildBuckets();
    for (let i = 0; i < 20; i++) {
      const target = madnessMoveTarget(w, e)!;
      expect(target).not.toBeNull();
      expect(dist(e.x, e.y, target.x, target.y)).toBeCloseTo(1, 4);
    }
  });

  it('updateEnemies: a taunted (Clarion Taunt) enemy is not also redirected by madness — the caster CC outranks the self-inflicted status', () => {
    const w = worldWith(); // fresh World defaults to act1_build — huntsWarden false, so TAUNT_WARDEN is a real diversion away from the Core (tauntTarget's own precedent)
    const e = spawnEnemy(w, firstEnemyKey(w), 10, 10)!;
    const decoy = spawnEnemy(w, firstEnemyKey(w), 10.5, 10)!; // would otherwise win the madness redirect
    e.tauntRemaining = 5;
    e.tauntKind = TAUNT_WARDEN;
    applyMadness(e, 5);
    w.rebuildBuckets();
    const before = dist(e.x, e.y, w.warden.x, w.warden.y);
    for (let t = 0; t < 30; t++) updateEnemies(w, DT);
    const after = dist(e.x, e.y, w.warden.x, w.warden.y);
    expect(after).toBeLessThan(before); // walked toward the taunt target (the Warden), not the decoy enemy
    void decoy;
  });
});

/* ------------------------------------------------------------------------ */
/* (c) ground_poison's zero-charge duration floor                          */
/* ------------------------------------------------------------------------ */

describe('fb085(c): a zero-charge duration floor beside groundDurationSeconds on ClassEffectSchema', () => {
  it('is optional and absent on every currently-shipped ground_poison row', () => {
    const plaguebringer = content.classByKey.get('plaguebringer')!;
    expect(plaguebringer.active1.kind).toBe('ground_poison');
    expect(plaguebringer.active1.minGroundDurationSeconds).toBeUndefined();
  });

  it('loads clean when authored at or below groundDurationSeconds (fb061\'s 8s -> 14s shape)', () => {
    const eff = baseEffect('ground_poison', { groundDurationSeconds: 14, minGroundDurationSeconds: 8 });
    expect(() => validateClassEffect(eff, 'x')).not.toThrow();
    const equal = baseEffect('ground_poison', { groundDurationSeconds: 8, minGroundDurationSeconds: 8 });
    expect(() => validateClassEffect(equal, 'x')).not.toThrow();
  });

  it('refuses a floor above its own ceiling — unpayable data (rule 4)', () => {
    const eff = baseEffect('ground_poison', { groundDurationSeconds: 8, minGroundDurationSeconds: 14 });
    expect(() => validateClassEffect(eff, 'x')).toThrow(/minGroundDurationSeconds/);
  });
});

/* ------------------------------------------------------------------------ */
/* (d) hooks for Ring of Contagion / Chronomail / Bracer of Overlap        */
/* ------------------------------------------------------------------------ */

describe('fb085(d): Ring of Contagion — an extra Spreading Plague fan-out target', () => {
  function plagueWorld(equipment: string[], c: Content): World {
    const w = new World(cfg({ classKey: 'plaguebringer', equipment }), c);
    w.gold = 1e6;
    w.warden.attackCooldown = 1e9;
    return w;
  }

  function contentWithRingOfContagion(extraTargets: number): Content {
    const doc = cloneEquipmentDoc();
    doc.items.push({
      key: 'ring_of_contagion',
      slot: 'ring',
      name: 'Ring of Contagion (test)',
      mods: {},
      effectKey: 'ring_of_contagion',
      effectNums: { extraTargets },
      desc: 'test',
    });
    return loadContent({ equipment: doc });
  }

  it('without the ring, the transfer still reaches exactly 1 nearest enemy (baseline unchanged)', () => {
    const c = contentWithRingOfContagion(1);
    const w = plagueWorld([], c);
    const dying = spawnEnemy(w, firstEnemyKey(w), w.warden.x + 1, w.warden.y)!;
    const nearest = spawnEnemy(w, firstEnemyKey(w), w.warden.x + 2, w.warden.y)!;
    const second = spawnEnemy(w, firstEnemyKey(w), w.warden.x + 3, w.warden.y)!;
    for (const e of [dying, nearest, second]) {
      e.hp = 1e6;
      e.maxHp = 1e6;
    }
    w.rebuildBuckets();
    applyDot(w, dying, 'poison', 10, 3, 'test');
    const owed = dotOutstanding(dying);
    damageEnemy(w, dying, 1e9, 'test', { pure: true, dot: true });
    expect(nearest.hp).toBeCloseTo(1e6 - owed, 5);
    expect(second.hp).toBe(1e6); // second-nearest untouched — only 1 target
  });

  it('equipped, the transfer fans out to 1 extra nearest enemy per effectNums.extraTargets', () => {
    const c = contentWithRingOfContagion(1);
    const w = plagueWorld(['ring_of_contagion'], c);
    const dying = spawnEnemy(w, firstEnemyKey(w), w.warden.x + 1, w.warden.y)!;
    const nearest = spawnEnemy(w, firstEnemyKey(w), w.warden.x + 2, w.warden.y)!;
    const second = spawnEnemy(w, firstEnemyKey(w), w.warden.x + 3, w.warden.y)!;
    const third = spawnEnemy(w, firstEnemyKey(w), w.warden.x + 10, w.warden.y)!;
    for (const e of [dying, nearest, second, third]) {
      e.hp = 1e6;
      e.maxHp = 1e6;
    }
    w.rebuildBuckets();
    applyDot(w, dying, 'poison', 10, 3, 'test');
    const owed = dotOutstanding(dying);
    damageEnemy(w, dying, 1e9, 'test', { pure: true, dot: true });
    expect(nearest.hp).toBeCloseTo(1e6 - owed, 5); // full unfinished total, not split
    expect(second.hp).toBeCloseTo(1e6 - owed, 5); // the ring's extra target
    expect(third.hp).toBe(1e6); // still out of reach of the extra target
  });
});

describe('fb085(d): Chronomail — a hook on Time Flow\'s window', () => {
  function contentWithChronomail(windowMul: number): Content {
    const doc = cloneEquipmentDoc();
    doc.items.push({
      key: 'chronomail',
      slot: 'necklace',
      name: 'Chronomail (test)',
      mods: {},
      effectKey: 'chronomail',
      effectNums: { windowMul },
      desc: 'test',
    });
    return loadContent({ equipment: doc });
  }

  it('without Chronomail, Time Flow converts a hit into its base-4s DoT (unchanged)', () => {
    const c = contentWithChronomail(2);
    const w = new World(cfg({ classKey: 'time_lord', equipment: [] }), c);
    w.warden.hp = 1000;
    damageWarden(w, 100);
    expect(nth(w.warden.dots, 0).remaining).toBeCloseTo(4, 5);
  });

  it('equipped, the window widens by effectNums.windowMul', () => {
    const c = contentWithChronomail(2);
    const w = new World(cfg({ classKey: 'time_lord', equipment: ['chronomail'] }), c);
    w.warden.hp = 1000;
    damageWarden(w, 100);
    expect(nth(w.warden.dots, 0).remaining).toBeCloseTo(8, 5);
    // Total damage owed is unchanged by the window widening (dps * remaining = the same mitigated total).
    const dot = nth(w.warden.dots, 0);
    const owed = dot.dps * dot.remaining;
    expect(owed).toBeCloseTo(100, 5);
  });
});

describe('fb085(d): Bracer of Overlap — a Time Lock zone-count hook + the array migration behind it', () => {
  function contentWithBracer(extraZones: number): Content {
    const doc = cloneEquipmentDoc();
    doc.items.push({
      key: 'bracer_of_overlap',
      slot: 'bracelet',
      name: 'Bracer of Overlap (test)',
      mods: {},
      effectKey: 'bracer_of_overlap',
      effectNums: { extraZones },
      desc: 'test',
    });
    return loadContent({ equipment: doc });
  }

  it('timeLockZoneCap is 1 by default, and 1+extraZones once the item is equipped', () => {
    const c = contentWithBracer(1);
    const without = new World(cfg({ classKey: 'time_lord', equipment: [] }), c);
    expect(timeLockZoneCap(without)).toBe(1);
    const withIt = new World(cfg({ classKey: 'time_lord', equipment: ['bracer_of_overlap'] }), c);
    expect(timeLockZoneCap(withIt)).toBe(2);
  });

  it('w.timeLockZone is a get/set alias onto timeLockZones[0] — every pre-fb085 read/write site is unchanged', () => {
    const w = worldWith();
    expect(w.timeLockZone).toBeNull();
    expect(w.timeLockZones).toEqual([]);
    const zone = { id: 1, x: 5, y: 5, radius: 3, remaining: 5, dotSeconds: 3, dps: 10 };
    w.timeLockZone = zone;
    expect(w.timeLockZones).toEqual([zone]);
    expect(w.timeLockZone).toBe(zone);
    w.timeLockZone = null;
    expect(w.timeLockZones).toEqual([]);
    expect(w.timeLockZone).toBeNull();
  });

  it('a second zone can live in timeLockZones[1] without disturbing the timeLockZone alias (the seam fb056 needs)', () => {
    const w = worldWith();
    const first = { id: 1, x: 1, y: 1, radius: 1, remaining: 1, dotSeconds: 1, dps: 1 };
    const second = { id: 2, x: 2, y: 2, radius: 2, remaining: 2, dotSeconds: 2, dps: 2 };
    w.timeLockZone = first;
    w.timeLockZones.push(second);
    expect(w.timeLockZone).toBe(first); // alias still reads index 0
    expect(w.timeLockZones).toEqual([first, second]);
  });
});

// Referenced so the `hasEquipment` import above is exercised (fb085(d)'s
// hooks all gate through it via `equipmentEffectNum`), not merely re-exported.
describe('fb085(d): hasEquipment gates by item key, unchanged by the effectKey registry opening', () => {
  it('is true only for a genuinely equipped item key', () => {
    const w = new World(cfg({ classKey: 'engineer', equipment: ['greatsword'] }));
    expect(hasEquipment(w, 'greatsword')).toBe(true);
    expect(hasEquipment(w, 'sleeve_sword')).toBe(false);
  });
});
