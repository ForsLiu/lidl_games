/**
 * p6c — SPEC-FINAL §4.1's Plaguebringer kit (verbatim): Spreading Plague
 * (on-death unfinished-DoT transfer), Poison Barrel (a 5 s ground poison
 * zone), Poison Boost (doubles all live enemies' remaining poison damage),
 * Miasma (tower passive, +10% poison damage). Gate G9's second half is
 * Spreading Plague: "an enemy dying with unfinished DoT deals exactly the
 * unfinished total to the nearest enemy, once" — the third describe block
 * below drives that directly, including the p2f-style stack-safety case.
 */
import { describe, expect, it } from 'vitest';

import { loadContent, validateClassEffect, type ClassEffect, type ClassDef } from '../src/sim/content';
import { applyDamageType } from '../src/sim/damagetypes';
import { applyDot, damageEnemy, dotOutstanding, dotStacks, spawnEnemy } from '../src/sim/enemies';
import { buildTower, updateTowers } from '../src/sim/towers';
import { applyCommand, hashWorld, Run, updateWarden } from '../src/sim/run';
import type { Command, Enemy, TickInput } from '../src/sim/types';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const content = loadContent();
const plaguebringer = content.classByKey.get('plaguebringer')! as ClassDef;

function idleInput(over: Partial<TickInput> = {}): TickInput {
  return { mx: 0, my: 0, dash: false, attack: false, aimX: 0, aimY: 0, active1Held: false, cmds: [], ...over };
}

function worldWith(over = {}): World {
  const w = new World(cfg({ classKey: 'plaguebringer', ...over }));
  w.gold = 1e6;
  // Plaguebringer's basic attack (range 6) would otherwise contaminate a
  // zone/transfer-only damage measurement — suppressed the same way p6b's
  // `worldWith` suppresses Swordsman's.
  w.warden.attackCooldown = 1e9;
  return w;
}

describe('p6c: Plaguebringer loads with the §4.1 kit', () => {
  it('is authored with the four §4 slots and the right effect kinds', () => {
    expect(plaguebringer.passive.kind).toBe('spreading_plague');
    expect(plaguebringer.active1.kind).toBe('ground_poison');
    expect(plaguebringer.active2.kind).toBe('poison_boost');
    expect(plaguebringer.towerPassive.mods.towerPoisonDamage).toBeGreaterThan(0);
  });
});

describe('p6c: the loader rejects a ground_poison row missing groundDurationSeconds', () => {
  it('accepts the real, shipped Plaguebringer active1 and active2 rows', () => {
    expect(() => validateClassEffect(plaguebringer.active1, 'x')).not.toThrow();
    expect(() => validateClassEffect(plaguebringer.active2, 'x')).not.toThrow();
  });

  it('rejects a ground_poison row missing "groundDurationSeconds"', () => {
    const broken = { ...plaguebringer.active1 } as Record<string, unknown>;
    delete broken.groundDurationSeconds;
    expect(() => validateClassEffect(broken as ClassEffect, 'x')).toThrow();
  });

  it('a poison_boost row needs none of the other kinds\' fields', () => {
    const boost: ClassEffect = { name: 'x', kind: 'poison_boost', cooldownSeconds: 1, radius: 0, damage: 0 };
    expect(() => validateClassEffect(boost, 'x')).not.toThrow();
  });
});

describe('p6c: Poison Barrel — a ground zone that ticks poison for its own duration', () => {
  it('poisons an enemy standing inside the radius and starts active1Cooldown', () => {
    const run = new Run(cfg({ classKey: 'plaguebringer' }));
    run.world.gold = 1e6;
    run.world.phase = 'act1_wave'; // updateEnemies (and so tickDots) only runs here / act2, not act1_build
    run.world.warden.attackCooldown = 1e9; // suppress the basic attack so only the zone can deal damage
    const e = spawnEnemy(run.world, run.world.content.enemies.enemies[0].key, run.world.warden.x + 1, run.world.warden.y)!;
    e.hp = 1000;
    e.maxHp = 1000;
    e.speed = 0; // stays put, so it can't wander out of the fixed ground zone
    run.world.rebuildBuckets();

    run.step(idleInput({ cmds: [{ k: 'class_active' }] }));
    expect(run.world.warden.active1Cooldown).toBeGreaterThan(0);
    expect(run.world.areas.some((a) => a.type === 'poison' && !a.dead)).toBe(true);

    for (let t = 0; t < 300; t++) run.step(idleInput()); // 5s at 60Hz
    expect(e.hp).toBeLessThan(1000);
    expect(dotStacks(e, 'poison')).toBeGreaterThan(0);
  });

  it('does not poison an enemy standing outside the zone radius', () => {
    const run = new Run(cfg({ classKey: 'plaguebringer' }));
    run.world.gold = 1e6;
    run.world.phase = 'act1_wave';
    run.world.warden.attackCooldown = 1e9;
    const far = spawnEnemy(run.world, run.world.content.enemies.enemies[0].key, run.world.warden.x + 10, run.world.warden.y)!;
    far.hp = 1000;
    far.maxHp = 1000;
    far.speed = 0;
    run.world.rebuildBuckets();

    run.step(idleInput({ cmds: [{ k: 'class_active' }] }));
    for (let t = 0; t < 120; t++) run.step(idleInput());
    expect(far.hp).toBe(1000);
  });

  it('the zone stops mattering once its own duration (5s) has elapsed', () => {
    const run = new Run(cfg({ classKey: 'plaguebringer' }));
    run.world.gold = 1e6;
    run.step(idleInput({ cmds: [{ k: 'class_active' }] }));
    for (let t = 0; t < 400; t++) run.step(idleInput()); // well past 5s
    expect(run.world.areas.every((a) => a.dead)).toBe(true);
  });
});

describe('p6c: Poison Boost — doubles the remaining poison damage on all live enemies', () => {
  it('doubles an existing poison stack\'s dps in place, leaving its remaining time alone', () => {
    const w = worldWith();
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
    e.hp = 1e6;
    e.maxHp = 1e6;
    w.rebuildBuckets();
    applyDot(w, e, 'poison', 4, 2, 'test');
    const before = dotOutstanding(e);
    expect(before).toBeCloseTo(8, 5); // 4 dps * 2s remaining

    applyCommand(w, { k: 'class_active2' });
    expect(dotOutstanding(e)).toBeCloseTo(16, 5);
    expect(w.warden.active2Cooldown).toBeGreaterThan(0);
  });

  it('leaves a non-poison DoT (Bleeding) untouched', () => {
    const w = worldWith();
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
    e.hp = 1e6;
    e.maxHp = 1e6;
    w.rebuildBuckets();
    applyDot(w, e, 'bleeding', 1, 5, 'test');
    const before = dotOutstanding(e);
    applyCommand(w, { k: 'class_active2' });
    expect(dotOutstanding(e)).toBeCloseTo(before, 5);
  });

  it('a dead enemy and an enemy with no poison are both handled without throwing', () => {
    const w = worldWith();
    const dead = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
    dead.dead = true;
    spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 2, w.warden.y);
    w.rebuildBuckets();
    expect(() => applyCommand(w, { k: 'class_active2' })).not.toThrow();
  });
});

describe('p6c: G9 second half — Spreading Plague transfers unfinished DoT to the nearest enemy, once', () => {
  it('deals exactly the unfinished total to the nearest live enemy, unmitigated by armor', () => {
    const w = worldWith();
    const dying = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
    const nearest = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 2, w.warden.y)!;
    const farther = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 10, w.warden.y)!;
    for (const e of [dying, nearest, farther]) {
      e.hp = 1e6;
      e.maxHp = 1e6;
    }
    nearest.armor = 90; // would block 90% of a normal hit; the transfer must ignore this
    w.rebuildBuckets();
    applyDot(w, dying, 'poison', 10, 3, 'test'); // 30 unfinished damage
    applyDot(w, dying, 'bleeding', 2, 5, 'test'); // +10 unfinished damage = 40 total
    const owed = dotOutstanding(dying);
    expect(owed).toBeCloseTo(40, 5);

    damageEnemy(w, dying, 1e9, 'test', { pure: true, dot: true }); // instant, unrelated kill
    expect(dying.dead).toBe(true);
    expect(nearest.hp).toBeCloseTo(1e6 - owed, 5);
    expect(farther.hp).toBe(1e6); // not the nearest — untouched
  });

  it('does nothing when the dying enemy carries no DoT', () => {
    const w = worldWith();
    const dying = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
    const nearest = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 2, w.warden.y)!;
    nearest.hp = 1e6;
    nearest.maxHp = 1e6;
    w.rebuildBuckets();
    damageEnemy(w, dying, 1e9, 'test', { pure: true, dot: true });
    expect(nearest.hp).toBe(1e6);
  });

  it('does not fire for a class other than Plaguebringer', () => {
    const w = new World(cfg({ classKey: 'swordsman' }));
    w.gold = 1e6;
    const dying = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
    const nearest = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 2, w.warden.y)!;
    nearest.hp = 1e6;
    nearest.maxHp = 1e6;
    w.rebuildBuckets();
    applyDot(w, dying, 'poison', 10, 3, 'test');
    damageEnemy(w, dying, 1e9, 'test', { pure: true, dot: true });
    expect(nearest.hp).toBe(1e6);
  });

  it('no other live enemy: the death resolves cleanly with no throw', () => {
    const w = worldWith();
    const dying = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
    w.rebuildBuckets();
    applyDot(w, dying, 'poison', 10, 3, 'test');
    expect(() => damageEnemy(w, dying, 1e9, 'test', { pure: true, dot: true })).not.toThrow();
  });

  it('a splitting enemy still spawns its children when killed via the transfer', () => {
    const w = worldWith();
    const dying = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
    const splitterDef = w.content.enemies.enemies.find((d) => (d.splitInto ?? 0) > 0);
    if (!splitterDef) return; // no splitting enemy authored — nothing to assert
    const nearest = spawnEnemy(w, splitterDef.key, w.warden.x + 2, w.warden.y)!;
    nearest.hp = 0.001;
    nearest.maxHp = 1e6;
    w.rebuildBuckets();
    applyDot(w, dying, 'poison', 10, 3, 'test');
    const before = w.enemies.length;
    damageEnemy(w, dying, 1e9, 'test', { pure: true, dot: true });
    expect(nearest.dead).toBe(true);
    expect(w.enemies.length).toBeGreaterThan(before);
  });

  // p2f precedent: Fire Brazier's VS death-explosion chain used to recurse
  // directly and overflowed the call stack at ~1500-1600 linked deaths.
  // Spreading Plague's transfer can chain the exact same way (a transfer
  // kills an enemy that is itself carrying unfinished DoT), so it is built
  // on the same enqueue-then-drain worklist — this proves a long chain
  // does not blow the stack.
  it('a 2000-enemy cascade of lethal transfers completes without overflowing the call stack', () => {
    const w = worldWith();
    const chain: Enemy[] = [];
    for (let i = 0; i < 2000; i++) {
      const x = 4 + (i % 300) * 0.01;
      const y = 4 + Math.floor(i / 300) * 0.01;
      const e = spawnEnemy(w, w.content.enemies.enemies[0].key, x, y)!;
      e.hp = 0.001;
      e.maxHp = 1e6;
      chain.push(e);
    }
    w.rebuildBuckets();
    for (const e of chain) applyDot(w, e, 'poison', 1, 1, 'test'); // 1 unfinished damage each, dwarfs 0.001 hp
    expect(() => damageEnemy(w, chain[0], 1e9, 'test', { pure: true, dot: true })).not.toThrow();
    expect(chain.every((e) => e.dead)).toBe(true);
  });
});

describe('p6c: Miasma — all towers +10% poison damage, Act I only', () => {
  it('a poison DoT sourced from a real tower key is boosted in Act I', () => {
    const w = worldWith();
    const boosted = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
    const baseline = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 2, w.warden.y)!;
    boosted.hp = 1e6;
    boosted.maxHp = 1e6;
    baseline.hp = 1e6;
    baseline.maxHp = 1e6;
    w.rebuildBuckets();
    applyDamageType(w, boosted, 'poison', 100, 'venom_spore'); // a real tower key
    applyDamageType(w, baseline, 'poison', 100, 'class_active'); // not a tower key
    const boostedDps = boosted.dots.find((d) => d.type === 'poison')!.dps;
    const baselineDps = baseline.dots.find((d) => d.type === 'poison')!.dps;
    expect(boostedDps).toBeCloseTo(baselineDps * 1.1, 5);
  });

  it('the same tower-sourced poison is not boosted once huntsWarden (VS) is true', () => {
    const w = worldWith();
    w.phase = 'act2'; // huntsWarden derives from phase
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
    e.hp = 1e6;
    e.maxHp = 1e6;
    w.rebuildBuckets();
    applyDamageType(w, e, 'poison', 100, 'venom_spore');
    const vsDps = e.dots.find((d) => d.type === 'poison')!.dps;

    const w2 = worldWith();
    const e2 = spawnEnemy(w2, w2.content.enemies.enemies[0].key, w2.warden.x + 1, w2.warden.y)!;
    e2.hp = 1e6;
    e2.maxHp = 1e6;
    w2.rebuildBuckets();
    applyDamageType(w2, e2, 'poison', 100, 'class_active');
    const nonTowerDps = e2.dots.find((d) => d.type === 'poison')!.dps;
    expect(vsDps).toBeCloseTo(nonTowerDps, 5);
  });

  it('does not boost Poison Barrel\'s own zone: its GroundArea is sourced "class_active", not a tower key', () => {
    const w = worldWith();
    expect(w.content.towerByKey.has('class_active')).toBe(false);
    applyCommand(w, { k: 'class_active' });
    const zone = w.areas.find((a) => a.type === 'poison' && !a.dead)!;
    expect(zone.source).toBe('class_active');

    // Same base magnitude (8 dps, no powerMul contributions authored on
    // Plaguebringer), applied once from that exact non-tower source and once
    // from a real tower key — only the tower-sourced one is boosted.
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
    const e2 = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 2, w.warden.y)!;
    w.rebuildBuckets();
    applyDot(w, e, 'poison', 8, 1, zone.source);
    applyDot(w, e2, 'poison', 8, 1, 'venom_spore');
    const nonTowerDps = e.dots.find((d) => d.type === 'poison')!.dps;
    const towerDps = e2.dots.find((d) => d.type === 'poison')!.dps;
    expect(towerDps).toBeCloseTo(nonTowerDps * 1.1, 5);
  });

  it('a built poison tower fires harder poison under Plaguebringer than under a class with no Miasma', () => {
    const venomSpore = content.towerByKey.get('venom_spore')!;
    const wPlague = worldWith();
    wPlague.warden.x = 10;
    wPlague.warden.y = 10;
    expect(buildTower(wPlague, venomSpore.id, 10, 10).ok).toBe(true);
    const wOther = new World(cfg({ classKey: 'swordsman' }));
    wOther.gold = 1e6;
    wOther.warden.x = 10;
    wOther.warden.y = 10;
    expect(buildTower(wOther, venomSpore.id, 10, 10).ok).toBe(true);

    const ePlague = spawnEnemy(wPlague, wPlague.content.enemies.enemies[0].key, 12, 10)!;
    const eOther = spawnEnemy(wOther, wOther.content.enemies.enemies[0].key, 12, 10)!;
    for (const e of [ePlague, eOther]) {
      e.hp = 1e6;
      e.maxHp = 1e6;
      e.speed = 0;
      e.armor = 0;
    }
    wPlague.rebuildBuckets();
    wOther.rebuildBuckets();
    updateTowers(wPlague, 1 / 60);
    updateTowers(wOther, 1 / 60);

    const plagueDps = ePlague.dots.find((d) => d.type === 'poison')?.dps ?? 0;
    const otherDps = eOther.dots.find((d) => d.type === 'poison')?.dps ?? 0;
    expect(plagueDps).toBeGreaterThan(0);
    expect(plagueDps).toBeCloseTo(otherDps * 1.1, 4);
  });
});

describe('p6c: replay-hash determinism with Poison Barrel, Poison Boost and a Spreading Plague transfer in the log', () => {
  it('two independent runs from the same input log reach an identical end-state hash', () => {
    const log: TickInput[] = [];
    for (let t = 0; t < 400; t++) {
      const cmds: Command[] = [];
      if (t === 10) cmds.push({ k: 'class_active' }); // Poison Barrel
      if (t === 200) cmds.push({ k: 'class_active2' }); // Poison Boost
      log.push({ mx: 0, my: 0, dash: false, attack: false, aimX: 0, aimY: 0, active1Held: false, cmds });
    }

    const a = new Run(cfg({ classKey: 'plaguebringer' }));
    a.world.gold = 1e6;
    const eA = spawnEnemy(a.world, a.world.content.enemies.enemies[0].key, a.world.warden.x + 1, a.world.warden.y)!;
    eA.hp = 1e6;
    eA.maxHp = 1e6;
    const nearA = spawnEnemy(a.world, a.world.content.enemies.enemies[0].key, a.world.warden.x + 2, a.world.warden.y)!;
    nearA.hp = 1e6;
    nearA.maxHp = 1e6;
    for (const input of log) a.step(input);

    const b = new Run(cfg({ classKey: 'plaguebringer' }));
    b.world.gold = 1e6;
    const eB = spawnEnemy(b.world, b.world.content.enemies.enemies[0].key, b.world.warden.x + 1, b.world.warden.y)!;
    eB.hp = 1e6;
    eB.maxHp = 1e6;
    const nearB = spawnEnemy(b.world, b.world.content.enemies.enemies[0].key, b.world.warden.x + 2, b.world.warden.y)!;
    nearB.hp = 1e6;
    nearB.maxHp = 1e6;
    for (const input of log) b.step(input);

    expect(a.hash()).toBe(b.hash());
    expect(hashWorld(a.world)).toBe(hashWorld(b.world));
    expect(a.world.warden.active1Cooldown).toBeGreaterThan(0);
    expect(a.world.warden.active2Cooldown).toBeGreaterThan(0);
  });
});

describe('p6c: QA-precedent guard — w.dying freezes Poison Barrel/Poison Boost too', () => {
  it('useClassActive (Poison Barrel) is a no-op while dying', () => {
    const w = worldWith();
    w.phase = 'act2';
    w.dying = 'defeat_warden';
    const before = w.areas.length;
    applyCommand(w, { k: 'class_active' });
    expect(w.areas.length).toBe(before);
    expect(w.warden.active1Cooldown).toBe(0);
  });

  it('useClassActive2 (Poison Boost) is a no-op while dying', () => {
    const w = worldWith();
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
    e.hp = 1e6;
    e.maxHp = 1e6;
    w.rebuildBuckets();
    applyDot(w, e, 'poison', 4, 2, 'test');
    const before = dotOutstanding(e);
    w.phase = 'act2';
    w.dying = 'defeat_warden';
    applyCommand(w, { k: 'class_active2' });
    expect(dotOutstanding(e)).toBeCloseTo(before, 5);
    expect(w.warden.active2Cooldown).toBe(0);
  });
});

describe('p6c: basic attack — range high, dmg low, spd medium, no AoE', () => {
  it('has no aoe (single-target only), consistent with "AoE no" in §4.1', () => {
    expect(plaguebringer.basicAttack.aoe).toBe(0);
  });

  it('the basic attack fires and damages a lone enemy at Plaguebringer\'s longer range', () => {
    const w = new World(cfg({ classKey: 'plaguebringer' }));
    w.gold = 1e6;
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + plaguebringer.basicAttack.range - 0.1, w.warden.y)!;
    e.hp = 1e6;
    e.maxHp = 1e6;
    w.rebuildBuckets();
    for (let t = 0; t < 60; t++) updateWarden(w, idleInput(), 1 / 60);
    expect(e.hp).toBeLessThan(1e6);
  });
});
