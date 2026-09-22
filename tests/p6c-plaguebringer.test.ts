/**
 * p6c — SPEC-FINAL §4.1's Plaguebringer kit (verbatim): Spreading Plague
 * (on-death unfinished-DoT transfer), Poison Barrel (a ground poison zone —
 * since fb061's §4.1 amendment a hold/release charge skill whose radius and
 * lifetime scale with the hold, 8 s -> 14 s on shipped data), Poison Boost
 * (doubles all live enemies' remaining poison damage),
 * Miasma (tower passive, +10% poison damage). Gate G9's second half is
 * Spreading Plague: "an enemy dying with unfinished DoT deals exactly the
 * unfinished total to the nearest enemy, once" — the third describe block
 * below drives that directly, including the p2f-style stack-safety case.
 */
import { describe, expect, it } from 'vitest';

import { poisonBarrelValues, tickClassCharge, useClassActive } from '../src/sim/classes';
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

function firstEnemyKey(w: World): string {
  const def = w.content.enemies.enemies[0];
  if (!def) throw new Error('expected at least one enemy definition');
  return def.key;
}

function idleInput(over: Partial<TickInput> = {}): TickInput {
  return { mx: 0, my: 0, dash: false, attack: false, aimX: 0, aimY: 0, active1Held: false, cmds: [], ...over };
}

/**
 * fb061: Poison Barrel fires on the release of a held Active1 key, the same
 * `TickInput.active1Held` path Circle Slash takes — `holdTicks` real
 * `Run.step` ticks held, then one released. Returns the charge the release
 * actually used (read off the Warden on the last held tick), so a caller can
 * derive the zone's radius/lifetime from `poisonBarrelValues` at that charge.
 */
function holdAndRelease(run: Run, holdTicks: number): number {
  for (let t = 0; t < holdTicks; t++) run.step(idleInput({ active1Held: true }));
  const charge = run.world.warden.active1Charge;
  run.step(idleInput());
  return charge;
}

/** A hold past the authored cap (c005's `Math.ceil(cap * 60) + 1`) — the full-charge end; one tick is the other. */
const FULL_HOLD_TICKS = Math.ceil((plaguebringer.active1.chargeCapSeconds ?? 3) * 60) + 1;

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

  /**
   * fb061 (code review): the shipped row now authors a zero-charge lifetime
   * floor, and fb061's own rules (tick vs floor, floor vs ceiling) would reject
   * these fb082 fixtures first — so fb082's own two rules would go untested.
   * They are checked on the row with the floor removed, and against their
   * exact messages, so only fb082's rule can satisfy each assertion.
   */
  function floorless(over: Partial<ClassEffect>): ClassEffect {
    const eff = { ...plaguebringer.active1, ...over } as ClassEffect;
    delete (eff as Record<string, unknown>).minGroundDurationSeconds;
    return eff;
  }

  it('fb082: rejects a ground_poison row whose groundTickSeconds exceeds groundDurationSeconds', () => {
    // qa-playtester finding: `updateAreas`' cadence gate (combat.ts) never
    // crosses a threshold larger than the zone's own remaining lifetime, so
    // an authored `groundTickSeconds` past `groundDurationSeconds` would
    // silently, permanently disable the mechanic — a loader rule that
    // refuses unpayable data beats a comment saying it must be valid.
    const tooSlow = floorless({ groundTickSeconds: (plaguebringer.active1.groundDurationSeconds ?? 5) + 1 });
    expect(() => validateClassEffect(tooSlow, 'x')).toThrow(/groundTickSeconds must not exceed groundDurationSeconds/);
  });

  it('fb082: rejects a non-positive groundDurationSeconds even with groundTickSeconds left unauthored', () => {
    // qa-playtester re-QA finding: the exceeds-check above only fires when
    // both fields are present, so `groundDurationSeconds <= 0` with no
    // explicit `groundTickSeconds` slipped through and reached
    // `firePoisonBarrel`'s `?? 1` fallback — a zero/negative lifetime can
    // never cross even that default cadence, so the zone would be
    // permanently inert. Checked independently of whether `groundTickSeconds`
    // happens to be authored.
    const zero = floorless({ groundDurationSeconds: 0 });
    delete (zero as Record<string, unknown>).groundTickSeconds;
    expect(() => validateClassEffect(zero, 'x')).toThrow(/groundDurationSeconds must be positive/);
    const negative = floorless({ groundDurationSeconds: -5 });
    delete (negative as Record<string, unknown>).groundTickSeconds;
    expect(() => validateClassEffect(negative, 'x')).toThrow(/groundDurationSeconds must be positive/);
  });

  it('fb061 review: a floor below the default 1 s tick is refused even with no tick authored, and a ground_poison minRadius must be positive', () => {
    const noTick = { ...plaguebringer.active1, minGroundDurationSeconds: 0.5 } as ClassEffect;
    delete (noTick as Record<string, unknown>).groundTickSeconds;
    expect(() => validateClassEffect(noTick, 'x')).toThrow(/must not exceed minGroundDurationSeconds/);
    expect(() => validateClassEffect({ ...plaguebringer.active1, minRadius: 0 } as ClassEffect, 'x')).toThrow(/minRadius must be positive/);
  });

  it('fb082: accepts groundTickSeconds exactly equal to groundDurationSeconds', () => {
    // The boundary itself must stay legal — `updateAreas`' cadence check now
    // accumulates *before* marking a poison area dead, so a tick and expiry
    // landing on the same frame still delivers the one scheduled application
    // (Venom Spore's own trail blob is built this way: tickSeconds ===
    // remaining exactly).
    const exact = floorless({ groundTickSeconds: plaguebringer.active1.groundDurationSeconds });
    expect(() => validateClassEffect(exact, 'x')).not.toThrow();
    // fb061: with the floor authored, the boundary the tick may equal is the
    // floor (a quick release) — pinned in fb085-enablers' fb061 block.
  });
});

describe('p6c: Poison Barrel — a ground zone that ticks poison for its own duration', () => {
  it('poisons an enemy standing inside the radius and starts active1Cooldown', () => {
    const run = new Run(cfg({ classKey: 'plaguebringer' }));
    run.world.gold = 1e6;
    run.world.phase = 'act1_wave'; // updateEnemies (and so tickDots) only runs here / act2, not act1_build
    run.world.warden.attackCooldown = 1e9; // suppress the basic attack so only the zone can deal damage
    const e = spawnEnemy(run.world, firstEnemyKey(run.world), run.world.warden.x + 1, run.world.warden.y)!;
    e.hp = 1000;
    e.maxHp = 1000;
    e.speed = 0; // stays put, so it can't wander out of the fixed ground zone
    run.world.rebuildBuckets();

    // fb061: a bare Command no longer fires it — Poison Barrel is a charge
    // kind, so the Command declines exactly as Circle Slash's does (p6b): it
    // reports false, drops no zone and bills no cooldown...
    expect(useClassActive(run.world), 'a bare Command fired Poison Barrel instead of arming a hold').toBe(false);
    run.step(idleInput({ cmds: [{ k: 'class_active' }] }));
    expect(run.world.warden.active1Cooldown).toBe(0);
    expect(run.world.areas.some((a) => a.type === 'poison')).toBe(false);

    // ...and a hold/release is what fires it, shortest real hold here.
    holdAndRelease(run, 1);
    expect(run.world.warden.active1Cooldown).toBeGreaterThan(0);
    expect(run.world.areas.some((a) => a.type === 'poison' && !a.dead)).toBe(true);

    for (let t = 0; t < 300; t++) run.step(idleInput()); // 5s at 60Hz
    expect(e.hp).toBeLessThan(1000);
    expect(dotStacks(e, 'poison')).toBeGreaterThan(0);
  });

  // fb061: the radius the zone lands at depends on the hold, so "outside" is
  // measured against the radius that actually landed, at both ends of the
  // charge — the shortest real hold, and one held past the cap (where the
  // cloud is widest, so an outside enemy is the strictest case).
  it.each([
    ['the shortest real hold', 1],
    ['a full-charge hold', FULL_HOLD_TICKS],
  ])('does not poison an enemy standing outside the zone radius — %s', (_label, holdTicks) => {
    const run = new Run(cfg({ classKey: 'plaguebringer' }));
    run.world.gold = 1e6;
    run.world.phase = 'act1_wave';
    run.world.warden.attackCooldown = 1e9;
    // The cloud this hold will land (one 60 Hz tick of charge per held tick).
    const landing = poisonBarrelValues(plaguebringer.active1, Math.min(holdTicks / 60, plaguebringer.active1.chargeCapSeconds ?? 3));
    // Pre-fb061 this enemy stood at +10 against a r5 cloud: twice the radius.
    const outside = Math.max(10, landing.radius * run.world.derived.areaMul * 2);
    const far = spawnEnemy(run.world, firstEnemyKey(run.world), run.world.warden.x + outside, run.world.warden.y)!;
    far.hp = 1000;
    far.maxHp = 1000;
    far.speed = 0;
    run.world.rebuildBuckets();

    const used = holdAndRelease(run, holdTicks);
    const zone = run.world.areas.find((a) => a.type === 'poison' && !a.dead);
    // Not vacuous: a zone really landed, at the radius this charge sizes it
    // to, and the enemy really is outside it.
    expect(zone, 'the release dropped no cloud').toBeDefined();
    expect(zone!.radius).toBeCloseTo(poisonBarrelValues(plaguebringer.active1, used).radius * run.world.derived.areaMul, 9);
    expect(outside).toBeGreaterThan(zone!.radius);
    for (let t = 0; t < 120; t++) run.step(idleInput());
    expect(far.hp).toBe(1000);
  });

  // Was "the zone stops mattering once its own duration (5s) has elapsed":
  // fb061 made the lifetime charge-dependent — `minGroundDurationSeconds`
  // (8 s) at no charge up to `groundDurationSeconds` (14 s) at full charge —
  // so it is checked at both ends, and on both sides of the boundary: still
  // alive just before its charge-scaled lifetime, dead just after.
  it.each([
    ['the shortest real hold (~8 s zone)', 1],
    ['a full-charge hold (14 s zone)', FULL_HOLD_TICKS],
  ])('the zone stops mattering once its own charge-scaled duration has elapsed — %s', (_label, holdTicks) => {
    const run = new Run(cfg({ classKey: 'plaguebringer' }));
    run.world.gold = 1e6;
    const used = holdAndRelease(run, holdTicks);
    const lifetime = poisonBarrelValues(plaguebringer.active1, used).durationSeconds;
    const eff = plaguebringer.active1;
    const cap = eff.chargeCapSeconds ?? 3;
    if (holdTicks === 1) {
      // One 60 Hz tick of charge: the lifetime sits one tick's share of the
      // 8 s -> 14 s lerp above the `minGroundDurationSeconds` floor.
      expect(used).toBeCloseTo(1 / 60, 12);
      const floor = eff.minGroundDurationSeconds ?? eff.groundDurationSeconds!;
      expect(lifetime).toBeCloseTo(floor + (eff.groundDurationSeconds! - floor) * (1 / 60 / cap), 9);
    } else {
      // Held past the cap: exactly the full-charge `groundDurationSeconds`.
      expect(used).toBe(cap);
      expect(lifetime).toBe(eff.groundDurationSeconds);
    }
    const zone = run.world.areas.find((a) => a.type === 'poison' && !a.dead);
    expect(zone, 'the release dropped no cloud').toBeDefined();
    // The zone really carries that lifetime (the release tick already spent one `dt`).
    expect(zone!.remaining).toBeCloseTo(lifetime - 1 / 60, 9);
    // The release tick already spent one `dt` of the lifetime.
    const ticksLeft = Math.round(lifetime * 60) - 1;
    for (let t = 0; t < ticksLeft - 2; t++) run.step(idleInput());
    expect(run.world.areas.some((a) => a.type === 'poison' && !a.dead), 'the zone died before its charge-scaled lifetime').toBe(true);
    for (let t = 0; t < 4; t++) run.step(idleInput());
    expect(run.world.areas.every((a) => a.dead), 'the zone outlived its charge-scaled lifetime').toBe(true);
  });

  it('the charge really scales it: a full hold lands a wider, longer-lived zone than the shortest one', () => {
    const land = (holdTicks: number) => {
      const run = new Run(cfg({ classKey: 'plaguebringer' }));
      run.world.gold = 1e6;
      holdAndRelease(run, holdTicks);
      return run.world.areas.find((a) => a.type === 'poison' && !a.dead)!;
    };
    const short = land(1);
    const full = land(FULL_HOLD_TICKS);
    const eff = plaguebringer.active1;
    expect(full.radius).toBeCloseTo(eff.radius, 9);
    expect(full.radius).toBeGreaterThan(short.radius);
    expect(full.remaining).toBeGreaterThan(short.remaining);
    // Poison per second is untouched by charge (§4.1 amended: "poison per
    // second is unchanged"), and so is the 1 s cadence (fb062).
    expect(full.dps).toBeCloseTo(short.dps, 9);
    expect(full.tickSeconds).toBe(short.tickSeconds);
    expect(full.tickSeconds).toBe(eff.groundTickSeconds);
  });

  it("Sleeve Sword / Swordsman Armor never touch a Plaguebringer's hold: their charge rules stay charge_nova-only (fb061 review)", () => {
    const eff = plaguebringer.active1;
    const hold = (equipment: string[]) => {
      const w = new World(cfg({ classKey: 'plaguebringer', equipment }));
      w.gold = 1e6;
      for (let t = 0; t < 30; t++) tickClassCharge(w, plaguebringer, idleInput({ active1Held: true }), 1 / 60);
      const charge = w.warden.active1Charge;
      tickClassCharge(w, plaguebringer, idleInput({ active1Held: false }), 1 / 60);
      return { charge, radius: w.areas.find((a) => a.type === 'poison' && !a.dead)!.radius, areaMul: w.derived.areaMul };
    };
    const bare = hold([]);
    const both = hold(['sleeve_sword', 'swordsman_armor']);
    expect(bare.charge).toBeCloseTo(0.5, 9);
    expect(both.charge).toBeCloseTo(0.5, 9); // no instant-max, no attack-speed charge rate
    expect(both.radius).toBeCloseTo(poisonBarrelValues(eff, 0.5).radius * both.areaMul, 9);
  });
});

describe('p6c: Poison Boost — doubles the remaining poison damage on all live enemies', () => {
  it('doubles an existing poison stack\'s dps in place, leaving its remaining time alone', () => {
    const w = worldWith();
    const e = spawnEnemy(w, firstEnemyKey(w), w.warden.x + 1, w.warden.y)!;
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
    const e = spawnEnemy(w, firstEnemyKey(w), w.warden.x + 1, w.warden.y)!;
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
    const dead = spawnEnemy(w, firstEnemyKey(w), w.warden.x + 1, w.warden.y)!;
    dead.dead = true;
    spawnEnemy(w, firstEnemyKey(w), w.warden.x + 2, w.warden.y);
    w.rebuildBuckets();
    expect(() => applyCommand(w, { k: 'class_active2' })).not.toThrow();
  });
});

describe('p6c: G9 second half — Spreading Plague transfers unfinished DoT to the nearest enemy, once', () => {
  it('deals exactly the unfinished total to the nearest live enemy, unmitigated by armor', () => {
    const w = worldWith();
    const dying = spawnEnemy(w, firstEnemyKey(w), w.warden.x + 1, w.warden.y)!;
    const nearest = spawnEnemy(w, firstEnemyKey(w), w.warden.x + 2, w.warden.y)!;
    const farther = spawnEnemy(w, firstEnemyKey(w), w.warden.x + 10, w.warden.y)!;
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
    const dying = spawnEnemy(w, firstEnemyKey(w), w.warden.x + 1, w.warden.y)!;
    const nearest = spawnEnemy(w, firstEnemyKey(w), w.warden.x + 2, w.warden.y)!;
    nearest.hp = 1e6;
    nearest.maxHp = 1e6;
    w.rebuildBuckets();
    damageEnemy(w, dying, 1e9, 'test', { pure: true, dot: true });
    expect(nearest.hp).toBe(1e6);
  });

  it('does not fire for a class other than Plaguebringer', () => {
    const w = new World(cfg({ classKey: 'swordsman' }));
    w.gold = 1e6;
    const dying = spawnEnemy(w, firstEnemyKey(w), w.warden.x + 1, w.warden.y)!;
    const nearest = spawnEnemy(w, firstEnemyKey(w), w.warden.x + 2, w.warden.y)!;
    nearest.hp = 1e6;
    nearest.maxHp = 1e6;
    w.rebuildBuckets();
    applyDot(w, dying, 'poison', 10, 3, 'test');
    damageEnemy(w, dying, 1e9, 'test', { pure: true, dot: true });
    expect(nearest.hp).toBe(1e6);
  });

  it('no other live enemy: the death resolves cleanly with no throw', () => {
    const w = worldWith();
    const dying = spawnEnemy(w, firstEnemyKey(w), w.warden.x + 1, w.warden.y)!;
    w.rebuildBuckets();
    applyDot(w, dying, 'poison', 10, 3, 'test');
    expect(() => damageEnemy(w, dying, 1e9, 'test', { pure: true, dot: true })).not.toThrow();
  });

  it('a splitting enemy still spawns its children when killed via the transfer', () => {
    const w = worldWith();
    const dying = spawnEnemy(w, firstEnemyKey(w), w.warden.x + 1, w.warden.y)!;
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
      const e = spawnEnemy(w, firstEnemyKey(w), x, y)!;
      e.hp = 0.001;
      e.maxHp = 1e6;
      chain.push(e);
    }
    w.rebuildBuckets();
    for (const e of chain) applyDot(w, e, 'poison', 1, 1, 'test'); // 1 unfinished damage each, dwarfs 0.001 hp
    const first = chain[0];
    if (!first) throw new Error('expected the 2000-enemy chain built above to be non-empty');
    expect(() => damageEnemy(w, first, 1e9, 'test', { pure: true, dot: true })).not.toThrow();
    expect(chain.every((e) => e.dead)).toBe(true);
  });
});

describe('p6c: Miasma — all towers +10% poison damage, Act I only', () => {
  it('a poison DoT sourced from a real tower key is boosted in Act I', () => {
    const w = worldWith();
    const boosted = spawnEnemy(w, firstEnemyKey(w), w.warden.x + 1, w.warden.y)!;
    const baseline = spawnEnemy(w, firstEnemyKey(w), w.warden.x + 2, w.warden.y)!;
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
    const e = spawnEnemy(w, firstEnemyKey(w), w.warden.x + 1, w.warden.y)!;
    e.hp = 1e6;
    e.maxHp = 1e6;
    w.rebuildBuckets();
    applyDamageType(w, e, 'poison', 100, 'venom_spore');
    const vsDps = e.dots.find((d) => d.type === 'poison')!.dps;

    const w2 = worldWith();
    const e2 = spawnEnemy(w2, firstEnemyKey(w2), w2.warden.x + 1, w2.warden.y)!;
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
    // fb061: fired by a hold/release, not a bare Command.
    tickClassCharge(w, plaguebringer, idleInput({ active1Held: true }), 1 / 60);
    tickClassCharge(w, plaguebringer, idleInput({ active1Held: false }), 1 / 60);
    const zone = w.areas.find((a) => a.type === 'poison' && !a.dead)!;
    expect(zone, 'the release dropped no cloud').toBeDefined();
    expect(zone.source).toBe('class_active');

    // Same base magnitude (8 dps, no powerMul contributions authored on
    // Plaguebringer), applied once from that exact non-tower source and once
    // from a real tower key — only the tower-sourced one is boosted.
    const e = spawnEnemy(w, firstEnemyKey(w), w.warden.x + 1, w.warden.y)!;
    const e2 = spawnEnemy(w, firstEnemyKey(w), w.warden.x + 2, w.warden.y)!;
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

    const ePlague = spawnEnemy(wPlague, firstEnemyKey(wPlague), 12, 10)!;
    const eOther = spawnEnemy(wOther, firstEnemyKey(wOther), 12, 10)!;
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
    // fb061: Poison Barrel is held from t=10 and released at t=70 (a 1 s,
    // mid-cap charge), the input shape a real key produces — the keydown's
    // `class_active` Command on the first held tick (which declines) plus
    // `active1Held` for as long as the key is down.
    for (let t = 0; t < 400; t++) {
      const cmds: Command[] = [];
      if (t === 10) cmds.push({ k: 'class_active' }); // Poison Barrel's keydown
      if (t === 200) cmds.push({ k: 'class_active2' }); // Poison Boost
      const active1Held = t >= 10 && t < 70;
      log.push({ mx: 0, my: 0, dash: false, attack: false, aimX: 0, aimY: 0, active1Held, cmds });
    }

    const a = new Run(cfg({ classKey: 'plaguebringer' }));
    a.world.gold = 1e6;
    const eA = spawnEnemy(a.world, firstEnemyKey(a.world), a.world.warden.x + 1, a.world.warden.y)!;
    eA.hp = 1e6;
    eA.maxHp = 1e6;
    const nearA = spawnEnemy(a.world, firstEnemyKey(a.world), a.world.warden.x + 2, a.world.warden.y)!;
    nearA.hp = 1e6;
    nearA.maxHp = 1e6;
    for (const input of log) a.step(input);

    const b = new Run(cfg({ classKey: 'plaguebringer' }));
    b.world.gold = 1e6;
    const eB = spawnEnemy(b.world, firstEnemyKey(b.world), b.world.warden.x + 1, b.world.warden.y)!;
    eB.hp = 1e6;
    eB.maxHp = 1e6;
    const nearB = spawnEnemy(b.world, firstEnemyKey(b.world), b.world.warden.x + 2, b.world.warden.y)!;
    nearB.hp = 1e6;
    nearB.maxHp = 1e6;
    for (const input of log) b.step(input);

    expect(a.hash()).toBe(b.hash());
    expect(hashWorld(a.world)).toBe(hashWorld(b.world));
    // The released Barrel (not the declined keydown Command) is what billed this.
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

  it('fb061: the hold/release that actually fires Poison Barrel is frozen while dying too', () => {
    // Since fb061 the bare Command above declines for every charge kind
    // whether or not the Warden is dying, so on its own it no longer proves
    // the dying guard. The real firing path is `updateWarden` ->
    // `tickClassCharge`, which the defeat slow-mo beat freezes (run.ts) — a
    // full hold and release driven through it must drop nothing and bill
    // nothing...
    const drive = (w: World): void => {
      for (let t = 0; t < FULL_HOLD_TICKS; t++) updateWarden(w, idleInput({ active1Held: true }), 1 / 60);
      updateWarden(w, idleInput({ active1Held: false }), 1 / 60);
    };
    const dying = worldWith();
    dying.phase = 'act2';
    dying.dying = 'defeat_warden';
    drive(dying);
    expect(dying.areas.some((a) => a.type === 'poison')).toBe(false);
    expect(dying.warden.active1Cooldown).toBe(0);
    expect(dying.warden.active1Charging).toBe(false);

    // ...while the identical drive on a live Warden does fire it, so the
    // freeze above is the guard at work, not a harness that fires nothing.
    const alive = worldWith();
    alive.phase = 'act2';
    drive(alive);
    expect(alive.areas.some((a) => a.type === 'poison' && !a.dead)).toBe(true);
    expect(alive.warden.active1Cooldown).toBeGreaterThan(0);
  });

  it('useClassActive2 (Poison Boost) is a no-op while dying', () => {
    const w = worldWith();
    const e = spawnEnemy(w, firstEnemyKey(w), w.warden.x + 1, w.warden.y)!;
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
    const e = spawnEnemy(w, firstEnemyKey(w), w.warden.x + plaguebringer.basicAttack.range - 0.1, w.warden.y)!;
    e.hp = 1e6;
    e.maxHp = 1e6;
    w.rebuildBuckets();
    for (let t = 0; t < 60; t++) updateWarden(w, idleInput(), 1 / 60);
    expect(e.hp).toBeLessThan(1e6);
  });
});
