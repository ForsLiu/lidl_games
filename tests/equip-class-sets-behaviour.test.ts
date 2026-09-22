/**
 * fb056 — the behavioural half of SPEC-FINAL §7.1's class equipment sets.
 *
 * `data/equipment.json` carries fifteen class-set items (six Plaguebringer,
 * six Time Lord, three Swordsman). Every one of them has a mechanic that is
 * not `Stats`-shaped, read off the item's own `effectNums` through
 * `classEquipmentActive`/`classEquipmentNum` (src/sim/equipment.ts). Per the
 * owner's §7.1 rules the mechanic is live only for the class
 * `classFallback.notClassKey` names, and every other class gets the
 * `classFallback.mods` Stats bag instead: the fallback **replaces** the line,
 * it never stacks with it.
 *
 * This file holds one control pair (item worn vs not) for every numeric
 * clause of every Effect line, plus, per set:
 *  (a) an "if not <class>" test: the fallback source reaches a non-class
 *      wearer's `Stats` and moves the matching `Derived` value, never reaches
 *      the class wearer, and the mechanic is inert on the non-class wearer;
 *  (b) the set's headline synergy from §7.1's "Synergy chains" paragraph.
 *
 * Magnitudes are read from the loaded content (`effectNums`, class rows,
 * damage-type rows) rather than restated as literals. The figures' tie to
 * §7.1's table is not this file's job — a test that reads `/data` asserts the
 * engine applies whatever is authored, and each block asserts the with-item
 * vs without-item difference so it goes red if the hook stops firing.
 *
 * refs: SPEC-FINAL §7.1, §4.1, §4.2, BACKLOG fb056.
 */

import { describe, expect, it } from 'vitest';

import { loadContent, type ClassDef } from '../src/sim/content';
import {
  activeCooldownSeconds,
  activeMaxCharges,
  activeRechargeSeconds,
  characterDamage,
  circleSlashValues,
  classBasicAttack,
  tickAmmoRecharge,
  updateClassPassives,
  useClassActive,
} from '../src/sim/classes';
import { updateAreas } from '../src/sim/combat';
import { dotDpsFor } from '../src/sim/damagetypes';
import {
  applyDot,
  characterDotSpeedMul,
  damageEnemy,
  dotOutstanding,
  dotStacks,
  kitPowerMul,
  spawnEnemy,
} from '../src/sim/enemies';
import { classEquipmentActive, classEquipmentNum } from '../src/sim/equipment';
import { applyCommand, damageWarden, updateWarden } from '../src/sim/run';
import type { StatKey } from '../src/sim/statkeys';
import type { DotStack, Enemy, TickInput } from '../src/sim/types';
import { timeLockZoneCap, World } from '../src/sim/world';
import { cfg } from './helpers';

const content = loadContent();
const DT = 1 / 60;
/** A dummy's HP: far past anything one kit hit or one DoT total can roll, so a clamp-at-zero never passes a comparison by accident. */
const DUMMY_HP = 1e4;

const PLAGUE_SET = [
  'plague_flask',
  'miasma_robe',
  'carriers_boots',
  'ring_of_contagion',
  'pestilent_locket',
  'blightweaver_band',
] as const;
const TIME_SET = [
  'hourglass_scepter',
  'chronomail',
  'sandals_of_the_second_hand',
  'loop_ring',
  'pendulum_pendant',
  'bracer_of_overlap',
] as const;
const SWORD_SET = ['ring_of_a_thousand_cuts', 'duelists_pendant', 'bracer_of_the_whirlwind'] as const;

/* ------------------------------------------------------------------ helpers */

function classDef(key: string): ClassDef {
  const c = content.classByKey.get(key);
  if (!c) throw new Error(`expected class ${key} in content`);
  return c;
}

const plaguebringer = classDef('plaguebringer');
const timeLord = classDef('time_lord');
const swordsman = classDef('swordsman');

function item(key: string) {
  const it = content.equipmentByKey.get(key);
  if (!it) throw new Error(`expected equipment row ${key} in content`);
  return it;
}

/** An item's own authored `effectNums[field]` — throws rather than defaulting, so a renamed field fails loudly. */
function num(key: string, field: string): number {
  const v = item(key).effectNums[field];
  if (v === undefined) throw new Error(`${key}.effectNums.${field} is not authored`);
  return v;
}

/** A `classFallback.mods` value, loaded units. */
function fallbackMod(key: string, stat: string): number {
  const fb = item(key).classFallback;
  if (!fb) throw new Error(`${key} has no classFallback`);
  const v = (fb.mods as Record<string, number | undefined>)[stat];
  if (v === undefined) throw new Error(`${key}.classFallback.mods.${stat} is not authored`);
  return v;
}

function damageType(key: string) {
  const def = content.damageTypeByKey.get(key);
  if (!def) throw new Error(`expected damage type ${key}`);
  return def;
}

/** Basic attack suppressed by default (a test that wants it resets `attackCooldown`), gold for anything that costs it. */
function worldOf(classKey: string, equipment: readonly string[] = []): World {
  const w = new World(cfg({ classKey, equipment: [...equipment] }));
  w.gold = 1e6;
  w.warden.attackCooldown = 1e9;
  return w;
}

function input(over: Partial<TickInput> = {}): TickInput {
  return { mx: 0, my: 0, dash: false, attack: false, aimX: 0, aimY: 0, active1Held: false, cmds: [], ...over };
}

function held(active1Held: boolean): TickInput {
  return input({ active1Held });
}

/** A stationary high-HP dummy of the first authored enemy, buckets rebuilt so spatial queries see it. */
function dummy(w: World, x: number, y: number): Enemy {
  const key = w.content.enemies.enemies[0]?.key;
  if (key === undefined) throw new Error('expected at least one enemy definition');
  const e = spawnEnemy(w, key, x, y);
  if (!e) throw new Error('spawnEnemy returned null');
  e.hp = DUMMY_HP;
  e.maxHp = DUMMY_HP;
  e.speed = 0;
  w.rebuildBuckets();
  return e;
}

function stacksOf(e: Enemy, type: string): DotStack[] {
  return e.dots.filter((d) => d.type === type);
}

function only<T>(arr: readonly T[]): T {
  expect(arr.length).toBe(1);
  const v = arr[0];
  if (v === undefined) throw new Error('expected exactly one element');
  return v;
}

function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`expected index ${i} to exist`);
  return v;
}

function lastFx(w: World, k: string): { x: number; y: number; a: number; b: number } {
  const fx = [...w.fx].reverse().find((f) => f.k === k);
  if (!fx) throw new Error(`expected a ${k} fx event`);
  return fx;
}

/** Holds Circle Slash past its charge cap. */
function chargeFully(w: World): void {
  const cap = swordsman.active1.chargeCapSeconds ?? 3;
  for (let t = 0; t < Math.round((cap + 1) / DT); t++) updateWarden(w, held(true), DT);
}

/* ================================================================ Plaguebringer */

describe('fb056 §7.1 Plaguebringer set — every Effect clause, item worn vs not', () => {
  it('Plague Flask: every basic-attack hit applies a Poison stack worth poisonRatio x the hit over poisonSeconds', () => {
    const ratio = num('plague_flask', 'poisonRatio');
    const seconds = num('plague_flask', 'poisonSeconds');
    const basic = plaguebringer.basicAttack;

    const w = worldOf('plaguebringer', ['plague_flask']);
    const e = dummy(w, w.warden.x + 2, w.warden.y);
    w.warden.attackCooldown = 0;
    classBasicAttack(w, plaguebringer);
    const hit = characterDamage(w, plaguebringer, basic.dps * basic.interval);
    const stack = only(stacksOf(e, 'poison'));
    expect(stack.source).toBe('class_basic');
    expect(stack.remaining).toBeCloseTo(seconds, 9);
    expect(stack.dps).toBeCloseTo(((ratio * hit) / seconds) * w.derived.ailmentMul, 9);
    // "on every hit": a second swing lays a second stack.
    w.warden.attackCooldown = 0;
    classBasicAttack(w, plaguebringer);
    expect(dotStacks(e, 'poison')).toBe(2);

    const bare = worldOf('plaguebringer');
    const c = dummy(bare, bare.warden.x + 2, bare.warden.y);
    bare.warden.attackCooldown = 0;
    classBasicAttack(bare, plaguebringer);
    expect(c.hp).toBeLessThan(DUMMY_HP); // the swing itself landed
    expect(dotStacks(c, 'poison')).toBe(0);
  });

  it("Miasma Robe: Poison Barrel's cloud drifts toward the character at cloudDriftSpeed tiles/s", () => {
    const speed = num('miasma_robe', 'cloudDriftSpeed');
    function driftOverOneSecond(equipment: readonly string[]): { dx: number; dy: number; frozen: number | undefined } {
      const w = worldOf('plaguebringer', equipment);
      const x0 = w.warden.x;
      const y0 = w.warden.y;
      applyCommand(w, { k: 'class_active' });
      const cloud = only(w.areas.filter((a) => a.type === 'poison' && !a.dead));
      expect(cloud.x).toBe(x0);
      w.warden.x = x0 + 5; // the character walks away from her cloud
      for (let t = 0; t < 60; t++) updateAreas(w, DT);
      return { dx: cloud.x - x0, dy: cloud.y - y0, frozen: cloud.driftSpeed };
    }
    const worn = driftOverOneSecond(['miasma_robe']);
    expect(worn.frozen).toBe(speed);
    expect(worn.dx).toBeCloseTo(speed * 1, 6);
    expect(worn.dy).toBeCloseTo(0, 9);

    const bare = driftOverOneSecond([]);
    expect(bare.dx).toBe(0);
    expect(bare.dy).toBe(0);
  });

  it('Miasma Robe: Poison Boost also refreshes every live Poison stack to the row duration (never shortening one)', () => {
    const full = damageType('poison').duration ?? 0;
    expect(full).toBeGreaterThan(0);
    function remainingAfterBoost(equipment: readonly string[]): number[] {
      const w = worldOf('plaguebringer', equipment);
      const e = dummy(w, w.warden.x + 1, w.warden.y);
      applyDot(w, e, 'poison', 4, full / 3, 'test'); // most of its clock already spent
      applyDot(w, e, 'poison', 4, full * 2, 'test'); // longer than the row: must not be cut back
      applyCommand(w, { k: 'class_active2' });
      return stacksOf(e, 'poison').map((d) => d.remaining);
    }
    const worn = remainingAfterBoost(['miasma_robe']);
    expect(worn[0]).toBeCloseTo(full, 9);
    expect(worn[1]).toBeCloseTo(full * 2, 9);

    const bare = remainingAfterBoost([]);
    expect(bare[0]).toBeCloseTo(full / 3, 9);
    expect(bare[1]).toBeCloseTo(full * 2, 9);
  });

  it("Carrier's Boots: a dash lays a poison trail seeded by trailDamageMul x the basic hit, lasting trailSeconds", () => {
    const segments = Math.round(num('carriers_boots', 'trailSegments'));
    const seconds = num('carriers_boots', 'trailSeconds');
    const mul = num('carriers_boots', 'trailDamageMul');
    const radius = num('carriers_boots', 'trailRadius');
    const basic = plaguebringer.basicAttack;

    const w = worldOf('plaguebringer', ['carriers_boots']);
    const from = { x: w.warden.x, y: w.warden.y };
    updateWarden(w, input({ mx: 1, dash: true }), DT);
    const travel = w.warden.dashTravel;
    if (!travel) throw new Error('expected the dash to start');
    expect(travel.x1).toBeGreaterThan(from.x);

    const trail = w.areas.filter((a) => a.type === 'poison' && a.source === 'class_passive');
    expect(trail.length).toBe(segments);
    const hit = characterDamage(w, plaguebringer, basic.dps * basic.interval);
    const dps = dotDpsFor(damageType('poison'), mul * hit);
    expect(dps).toBeGreaterThan(0);
    for (const a of trail) {
      expect(a.remaining).toBeCloseTo(seconds, 9);
      expect(a.radius).toBeCloseTo(radius * w.derived.areaMul, 9);
      expect(a.dps).toBeCloseTo(dps, 9);
    }
    // Laid along the line actually travelled: first patch at the start, last at the landing.
    expect(at(trail, 0).x).toBeCloseTo(from.x, 9);
    expect(at(trail, 0).y).toBeCloseTo(from.y, 9);
    expect(at(trail, trail.length - 1).x).toBeCloseTo(travel.x1, 9);
    expect(at(trail, trail.length - 1).y).toBeCloseTo(travel.y1, 9);

    // It poisons whatever stands in it, and is gone once trailSeconds run out.
    const victim = dummy(w, from.x, from.y);
    for (let t = 0; t < Math.round(1.05 / DT); t++) updateAreas(w, DT);
    expect(dotStacks(victim, 'poison')).toBeGreaterThan(0);
    for (let t = 0; t < Math.round(seconds / DT); t++) updateAreas(w, DT);
    expect(trail.every((a) => a.dead)).toBe(true);

    const bare = worldOf('plaguebringer');
    updateWarden(bare, input({ mx: 1, dash: true }), DT);
    expect(bare.warden.dashTravel).not.toBeNull(); // the dash itself happened
    expect(bare.areas.length).toBe(0);
  });

  it('Ring of Contagion: Spreading Plague hands the full unfinished total to the 1 + extraTargets nearest enemies', () => {
    const extra = Math.round(num('ring_of_contagion', 'extraTargets'));
    expect(extra).toBeGreaterThan(0);
    function transfer(equipment: readonly string[]): { owed: number; losses: number[] } {
      const w = worldOf('plaguebringer', equipment);
      const x = w.warden.x;
      const y = w.warden.y;
      const dying = dummy(w, x + 1, y);
      const others: Enemy[] = [];
      for (let i = 0; i <= extra; i++) others.push(dummy(w, x + 2 + i, y)); // the 1 + extra nearest
      others.push(dummy(w, x + 2 + extra + 6, y)); // one beyond the fan-out
      applyDot(w, dying, 'poison', 10, 3, 'test');
      const owed = dotOutstanding(dying);
      damageEnemy(w, dying, 1e9, 'test', { pure: true, dot: true });
      expect(dying.dead).toBe(true);
      return { owed, losses: others.map((o) => DUMMY_HP - o.hp) };
    }
    const worn = transfer(['ring_of_contagion']);
    expect(worn.owed).toBeGreaterThan(0);
    for (let i = 0; i <= extra; i++) expect(at(worn.losses, i)).toBeCloseTo(worn.owed, 6);
    expect(at(worn.losses, extra + 1)).toBe(0);

    const bare = transfer([]);
    expect(at(bare.losses, 0)).toBeCloseTo(bare.owed, 6);
    for (let i = 1; i < bare.losses.length; i++) expect(at(bare.losses, i)).toBe(0);
  });

  it('Pestilent Locket: Poison Boost multiplies ALL DoT types by dotBoostMul, not just Poison', () => {
    const mul = num('pestilent_locket', 'dotBoostMul');
    const dotTypes = content.damageTypes.types.filter((t) => t.effect === 'dot').map((t) => t.key);
    expect(dotTypes).toEqual(expect.arrayContaining(['poison', 'toxic', 'bleeding', 'burning']));
    function ratios(equipment: readonly string[]): Map<string, number> {
      const w = worldOf('plaguebringer', equipment);
      const e = dummy(w, w.warden.x + 1, w.warden.y);
      for (const t of dotTypes) applyDot(w, e, t, 4, 5, 'test');
      expect(new Set(e.dots.map((d) => d.type))).toEqual(new Set(dotTypes));
      const before = new Map(e.dots.map((d) => [d.type, d.dps]));
      applyCommand(w, { k: 'class_active2' });
      return new Map(e.dots.map((d) => [d.type, d.dps / (before.get(d.type) ?? NaN)]));
    }
    const worn = ratios(['pestilent_locket']);
    for (const t of dotTypes) expect(worn.get(t), t).toBeCloseTo(mul, 9);

    const bare = ratios([]);
    expect(bare.get('poison')).toBeCloseTo(2, 9); // §4.1 Poison Boost alone: doubles Poison
    for (const t of dotTypes.filter((k) => k !== 'poison')) expect(bare.get(t), t).toBeCloseTo(1, 9);
  });

  it("Pestilent Locket: Poison Boost's cooldown is +extraCooldownSeconds", () => {
    const extra = num('pestilent_locket', 'extraCooldownSeconds');
    const base = plaguebringer.active2.cooldownSeconds;
    const worn = worldOf('plaguebringer', ['pestilent_locket']);
    const bare = worldOf('plaguebringer');
    expect(activeCooldownSeconds(worn, plaguebringer, 'active2')).toBeCloseTo(base + extra, 9);
    expect(activeCooldownSeconds(bare, plaguebringer, 'active2')).toBeCloseTo(base, 9);

    applyCommand(worn, { k: 'class_active2' });
    applyCommand(bare, { k: 'class_active2' });
    const cdrFactor = bare.warden.active2Cooldown / base;
    expect(cdrFactor).toBeGreaterThan(0);
    expect(worn.warden.active2Cooldown).toBeCloseTo((base + extra) * cdrFactor, 9);
  });

  it('Blightweaver Band: a poisoned enemy ticks contactShare of its summed live Poison dps onto every enemy within contactRadius', () => {
    const share = num('blightweaver_band', 'contactShare');
    const radius = num('blightweaver_band', 'contactRadius');
    function contact(equipment: readonly string[]): { expected: number; toucher: number; outside: number; carrier: number } {
      const w = worldOf('plaguebringer', equipment);
      const reach = radius * w.derived.areaMul;
      const cx = w.warden.x + 2;
      const cy = w.warden.y + 3;
      const carrier = dummy(w, cx, cy);
      const toucher = dummy(w, cx + reach * 0.5, cy);
      const outside = dummy(w, cx + reach + 0.5, cy);
      applyDot(w, carrier, 'poison', 6, 3, 'test');
      applyDot(w, carrier, 'poison', 3, 3, 'test');
      const poisonDps = stacksOf(carrier, 'poison').reduce((s, d) => s + d.dps, 0);
      updateClassPassives(w, DT);
      return {
        expected: share * poisonDps * DT * kitPowerMul(w),
        toucher: DUMMY_HP - toucher.hp,
        outside: DUMMY_HP - outside.hp,
        carrier: DUMMY_HP - carrier.hp,
      };
    }
    const worn = contact(['blightweaver_band']);
    expect(worn.expected).toBeGreaterThan(0);
    expect(worn.toucher).toBeCloseTo(worn.expected, 9);
    expect(worn.outside).toBe(0);
    expect(worn.carrier).toBe(0); // nothing poisoned touches the carrier

    const bare = contact([]);
    expect(bare.toucher).toBe(0);
  });
});

describe('fb056 code-review regressions (Plaguebringer set)', () => {
  it("Carrier's Boots: a dash a wall cuts short lays fewer patches, never a pile of overlapping ones (qa bug 2)", () => {
    const segments = Math.round(num('carriers_boots', 'trailSegments'));
    const radius = num('carriers_boots', 'trailRadius');
    const w = worldOf('plaguebringer', ['carriers_boots']);
    // Pin the Warden against the west border so a -x dash barely moves.
    w.warden.x = 0.6;
    updateWarden(w, input({ mx: -1, dash: true }), DT);
    const travel = w.warden.dashTravel;
    if (!travel) throw new Error('expected the dash to start');
    const travelled = Math.hypot(travel.x1 - travel.x0, travel.y1 - travel.y0);
    expect(travelled).toBeLessThan(2 * radius * w.derived.areaMul);
    const trail = w.areas.filter((a) => a.type === 'poison' && a.source === 'class_passive');
    expect(segments).toBeGreaterThan(1);
    expect(trail.length, 'a blocked dash still laid every patch on one spot').toBe(1);
  });

  it("Blightweaver Band spreads a tower's poison under the tower's own source — never kit-power-scaled (code review Major 2)", () => {
    const share = num('blightweaver_band', 'contactShare');
    const w = worldOf('plaguebringer', ['blightweaver_band']);
    w.wavesCleared = 15; // kitPowerMul well above 1
    expect(kitPowerMul(w)).toBeGreaterThan(2);
    const towerKey = w.content.towers.towers.find((t) => t.key === 'venom_spore')?.key ?? 'venom_spore';
    const cx = w.warden.x + 2;
    const cy = w.warden.y + 3;
    const carrier = dummy(w, cx, cy);
    const toucher = dummy(w, cx + 0.3, cy);
    applyDot(w, carrier, 'poison', 11, 3, towerKey);
    const poisonDps = stacksOf(carrier, 'poison').reduce((sum, d) => sum + d.dps, 0);
    updateClassPassives(w, DT);
    expect(DUMMY_HP - toucher.hp).toBeCloseTo(share * poisonDps * DT, 9);
  });
});

/* ================================================================ Time Lord */

describe('fb056 §7.1 Time Lord set — every Effect clause, item worn vs not', () => {
  it('Hourglass Scepter: every character-sourced DoT ticks dotSpeedMul x as fast for 1/dotSpeedMul the duration — same total', () => {
    const speed = num('hourglass_scepter', 'dotSpeedMul');
    const dormant = timeLord.passive.charDotSpeedMul ?? 1;
    const worn = worldOf('time_lord', ['hourglass_scepter']);
    const bare = worldOf('time_lord');
    expect(characterDotSpeedMul(worn)).toBeCloseTo(dormant * speed, 9);
    expect(characterDotSpeedMul(bare)).toBeCloseTo(dormant, 9);

    for (const source of ['class_active', 'class_active2', 'class_basic', 'class_passive']) {
      const a = dummy(worn, worn.warden.x + 1, worn.warden.y);
      const b = dummy(bare, bare.warden.x + 1, bare.warden.y);
      applyDot(worn, a, 'bleeding', 10, 6, source);
      applyDot(bare, b, 'bleeding', 10, 6, source);
      const sa = only(stacksOf(a, 'bleeding'));
      const sb = only(stacksOf(b, 'bleeding'));
      expect(sa.remaining, source).toBeCloseTo(sb.remaining / speed, 9);
      expect(sa.dps, source).toBeCloseTo(sb.dps * speed, 9);
      expect(sa.dps * sa.remaining, source).toBeCloseTo(sb.dps * sb.remaining, 9);
    }
    // Not "from the character": left alone even with the Scepter worn.
    const other = dummy(worn, worn.warden.x + 1, worn.warden.y);
    applyDot(worn, other, 'bleeding', 10, 6, 'test');
    expect(only(stacksOf(other, 'bleeding')).remaining).toBeCloseTo(6, 9);

    // The real kit: Time's past-stage DoT runs over half its authored seconds.
    const pastSeconds = timeLord.active1.markPastDotSeconds ?? 0;
    expect(pastSeconds).toBeGreaterThan(0);
    function pastStackRemaining(equipment: readonly string[]): number {
      const w = worldOf('time_lord', equipment);
      const e = dummy(w, w.warden.x + 1, w.warden.y);
      applyCommand(w, { k: 'class_active' });
      expect(e.timeMarkStage).toBe(1);
      return only(stacksOf(e, 'bleeding')).remaining;
    }
    expect(pastStackRemaining(['hourglass_scepter'])).toBeCloseTo(pastSeconds / (dormant * speed), 9);
    expect(pastStackRemaining([])).toBeCloseTo(pastSeconds / dormant, 9);
  });

  it('Chronomail: Time Flow converts a hit over charDotSeconds x windowMul (4 s -> 8 s)', () => {
    const base = timeLord.passive.charDotSeconds ?? 4;
    const windowMul = num('chronomail', 'windowMul');
    function windowAtFullHp(equipment: readonly string[]): number {
      const w = worldOf('time_lord', equipment);
      w.warden.hp = w.derived.maxHp;
      damageWarden(w, 10);
      return only(w.warden.dots).remaining;
    }
    expect(windowAtFullHp(['chronomail'])).toBeCloseTo(base * windowMul, 9);
    expect(windowAtFullHp([])).toBeCloseTo(base, 9);
  });

  it('Chronomail: at or below lowHpFraction of max HP, the window is charDotSeconds x lowHpWindowMul (12 s), same total', () => {
    const base = timeLord.passive.charDotSeconds ?? 4;
    const windowMul = num('chronomail', 'windowMul');
    const lowFrac = num('chronomail', 'lowHpFraction');
    const lowMul = num('chronomail', 'lowHpWindowMul');
    function windowAt(equipment: readonly string[], hp: (maxHp: number) => number): { remaining: number; owed: number } {
      const w = worldOf('time_lord', equipment);
      w.warden.hp = hp(w.derived.maxHp);
      damageWarden(w, 10);
      const d = only(w.warden.dots);
      return { remaining: d.remaining, owed: d.dps * d.remaining };
    }
    const atThreshold = windowAt(['chronomail'], (m) => lowFrac * m);
    expect(atThreshold.remaining).toBeCloseTo(base * lowMul, 9);
    const justAbove = windowAt(['chronomail'], (m) => lowFrac * m + 1);
    expect(justAbove.remaining).toBeCloseTo(base * windowMul, 9);
    // The window stretches, the owed total does not.
    expect(atThreshold.owed).toBeCloseTo(justAbove.owed, 9);
    // Without the item a low-HP hit is still the plain window.
    expect(windowAt([], (m) => lowFrac * m).remaining).toBeCloseTo(base, 9);
  });

  it("Sandals of the Second Hand: Time's rewind reaches rewindSeconds (6 s) back instead of markRewindSeconds (3 s)", () => {
    const rewind = num('sandals_of_the_second_hand', 'rewindSeconds');
    const baseSeconds = timeLord.active1.markRewindSeconds ?? 3;
    const v = 0.5; // tiles/s of a timestamped trajectory
    function rewoundBy(equipment: readonly string[]): { dist: number; samples: number } {
      const w = worldOf('time_lord', equipment);
      const x0 = w.warden.x - 6;
      const y = w.warden.y + 2;
      const e = dummy(w, x0, y);
      const ticks = Math.round((Math.max(rewind, baseSeconds) + 2) / DT);
      for (let t = 0; t <= ticks; t++) {
        e.x = x0 + v * t * DT;
        updateClassPassives(w, DT); // samples posHistory for Time
      }
      w.rebuildBuckets();
      const samples = e.posHistory.length;
      const before = e.x;
      applyCommand(w, { k: 'class_active' });
      expect(e.timeMarkStage).toBe(1);
      return { dist: before - e.x, samples };
    }
    const worn = rewoundBy(['sandals_of_the_second_hand']);
    const bare = rewoundBy([]);
    expect(worn.samples / bare.samples).toBeCloseTo(rewind / baseSeconds, 9);
    const sample = baseSeconds / bare.samples; // the buffer's own sample spacing
    // The oldest kept sample is between (N-1) and N sample periods old.
    expect(worn.dist).toBeGreaterThan(v * (rewind - sample) - 1e-9);
    expect(worn.dist).toBeLessThanOrEqual(v * rewind + 1e-9);
    expect(bare.dist).toBeGreaterThan(v * (baseSeconds - sample) - 1e-9);
    expect(bare.dist).toBeLessThanOrEqual(v * baseSeconds + 1e-9);
  });

  it('Loop Ring: Time holds maxCharges + extraCharges (3 -> 4), the run starts at the raised cap, and the next press is refused', () => {
    const base = timeLord.active1.maxCharges ?? 1;
    const extra = Math.round(num('loop_ring', 'extraCharges'));
    expect(extra).toBeGreaterThan(0);
    const worn = worldOf('time_lord', ['loop_ring']);
    const bare = worldOf('time_lord');
    expect(activeMaxCharges(worn, timeLord, 'active1')).toBe(base + extra);
    expect(worn.warden.active1Ammo).toBe(base + extra);
    expect(activeMaxCharges(bare, timeLord, 'active1')).toBe(base);
    expect(bare.warden.active1Ammo).toBe(base);

    for (let i = 0; i < base + extra; i++) expect(useClassActive(worn), `worn press ${i + 1}`).toBe(true);
    expect(useClassActive(worn)).toBe(false);
    for (let i = 0; i < base; i++) expect(useClassActive(bare), `bare press ${i + 1}`).toBe(true);
    expect(useClassActive(bare)).toBe(false);
  });

  it('Loop Ring: each Time charge recharges rechargeSpeedMul x as fast (6 s -> 4.8 s)', () => {
    const mul = num('loop_ring', 'rechargeSpeedMul');
    const base = timeLord.active1.rechargeSeconds ?? 0;
    expect(base).toBeGreaterThan(0);
    const worn = worldOf('time_lord', ['loop_ring']);
    const bare = worldOf('time_lord');
    expect(activeRechargeSeconds(worn, timeLord, 'active1')).toBeCloseTo(base / mul, 9);
    expect(activeRechargeSeconds(bare, timeLord, 'active1')).toBeCloseTo(base, 9);

    expect(useClassActive(worn)).toBe(true);
    expect(useClassActive(bare)).toBe(true);
    expect(worn.warden.active1AmmoCooldown).toBeCloseTo((base / mul) * (1 - worn.derived.cdr), 9);
    expect(bare.warden.active1AmmoCooldown).toBeCloseTo(base * (1 - bare.derived.cdr), 9);

    // Halfway between the two recharge times: the ring's charge is back, the bare one is not.
    const between = ((base / mul + base) / 2) * (1 - bare.derived.cdr);
    for (let t = 0; t < Math.round(between / DT); t++) {
      tickAmmoRecharge(worn, timeLord, DT);
      tickAmmoRecharge(bare, timeLord, DT);
    }
    expect(worn.warden.active1Ammo).toBe(activeMaxCharges(worn, timeLord, 'active1'));
    expect(bare.warden.active1Ammo).toBe(activeMaxCharges(bare, timeLord, 'active1') - 1);
  });

  it('Pendulum Pendant: executing a "future" enemy refunds executeRefundCharges Time charge', () => {
    const refund = Math.round(num('pendulum_pendant', 'executeRefundCharges'));
    expect(refund).toBeGreaterThan(0);
    function ammoAfterExecute(equipment: readonly string[]): number {
      const w = worldOf('time_lord', equipment);
      const e = dummy(w, w.warden.x + 1, w.warden.y);
      e.timeMarkStage = 3; // "future"
      w.warden.active1Ammo = 1; // well under any cap, so no clamp is in play
      applyCommand(w, { k: 'class_active' });
      expect(e.dead).toBe(true);
      return w.warden.active1Ammo;
    }
    expect(ammoAfterExecute(['pendulum_pendant'])).toBe(1 - 1 + refund);
    expect(ammoAfterExecute([])).toBe(0);
  });

  it('Pendulum Pendant: an elite/boss "future" execute takes eliteExecuteFraction (60%) of current HP instead of the authored 50%', () => {
    const frac = num('pendulum_pendant', 'eliteExecuteFraction');
    const base = timeLord.active1.markEliteExecuteFraction ?? 0.5;
    expect(frac).not.toBeCloseTo(base, 6);
    function fractionTaken(equipment: readonly string[], flag: 'elite' | 'boss'): { taken: number; dead: boolean } {
      const w = worldOf('time_lord', equipment);
      const e = dummy(w, w.warden.x + 1, w.warden.y);
      e[flag] = true;
      e.timeMarkStage = 3;
      const before = e.hp;
      applyCommand(w, { k: 'class_active' });
      return { taken: (before - e.hp) / (before * kitPowerMul(w)), dead: e.dead };
    }
    for (const flag of ['elite', 'boss'] as const) {
      const worn = fractionTaken(['pendulum_pendant'], flag);
      expect(worn.dead, flag).toBe(false);
      expect(worn.taken, flag).toBeCloseTo(frac, 9);
      const bare = fractionTaken([], flag);
      expect(bare.dead, flag).toBe(false);
      expect(bare.taken, flag).toBeCloseTo(base, 9);
    }
  });

  /** Two Time Lock casts on two well-separated dummies, each trapped by its own cast. */
  function twoLocks(equipment: readonly string[]): { w: World; a: Enemy; b: Enemy } {
    const w = worldOf('time_lord', equipment);
    const a = dummy(w, w.warden.x - 5, w.warden.y + 4);
    const b = dummy(w, w.warden.x + 5, w.warden.y + 4); // 10 apart: far outside each other's zone
    applyCommand(w, { k: 'class_active2', aimX: a.x, aimY: a.y });
    updateClassPassives(w, DT); // the zone traps on its first tick
    applyCommand(w, { k: 'class_active2', aimX: b.x, aimY: b.y });
    updateClassPassives(w, DT);
    return { w, a, b };
  }

  it('Bracer of Overlap: Time Lock holds 1 + extraZones zones at once — a second cast stands beside the first', () => {
    const extra = Math.round(num('bracer_of_overlap', 'extraZones'));
    expect(extra).toBeGreaterThan(0);
    const worn = twoLocks(['bracer_of_overlap']);
    expect(timeLockZoneCap(worn.w)).toBe(1 + extra);
    expect(worn.w.timeLockZones.length).toBe(2);
    expect(worn.a.timeLockZoneId).toBe(at(worn.w.timeLockZones, 0).id);
    expect(worn.b.timeLockZoneId).toBe(at(worn.w.timeLockZones, 1).id);
    expect(worn.a.x).toBeCloseTo(worn.w.warden.x - 5, 9); // not pulled anywhere

    const bare = twoLocks([]);
    expect(timeLockZoneCap(bare.w)).toBe(1);
    expect(bare.w.timeLockZones.length).toBe(1); // the recast replaced the first zone
    expect(bare.a.x).toBeCloseTo(bare.b.x, 9); // and pulled its enemy into the new one
  });

  it('Bracer of Overlap: casting past the cap teleports the enemies of BOTH standing zones into the new one and detonates their DoT', () => {
    const { w, a, b } = twoLocks(['bracer_of_overlap']);
    expect(w.timeLockZones.length).toBe(timeLockZoneCap(w));
    const heldIds = w.timeLockZones.map((z) => z.id);
    applyDot(w, a, 'poison', 5, 3, 'test');
    applyDot(w, b, 'poison', 7, 3, 'test');
    const owed = [dotOutstanding(a), dotOutstanding(b)];
    const hp = [a.hp, b.hp];
    w.warden.active2Ammo = 1; // the two casts above spent both authored charges
    const cx = w.warden.x;
    const cy = w.warden.y + 7;
    applyCommand(w, { k: 'class_active2', aimX: cx, aimY: cy });

    [a, b].forEach((e, i) => {
      expect(e.x, `enemy ${i}`).toBeCloseTo(cx, 9);
      expect(e.y, `enemy ${i}`).toBeCloseTo(cy, 9);
      expect(at(owed, i), `enemy ${i}`).toBeGreaterThan(0);
      expect(at(hp, i) - e.hp, `enemy ${i}`).toBeCloseTo(at(owed, i) * kitPowerMul(w), 6);
      expect(e.dots.length, `enemy ${i}`).toBe(0);
    });
    const fresh = only(w.timeLockZones);
    expect(heldIds).not.toContain(fresh.id);
    updateClassPassives(w, DT);
    expect(a.timeLockZoneId).toBe(fresh.id);
    expect(b.timeLockZoneId).toBe(fresh.id);
  });
});

/* ================================================================ Swordsman */

describe('fb056 §7.1 Swordsman set — every Effect clause, item worn vs not', () => {
  it('Ring of a Thousand Cuts: every attack applies bleedStacks Bleeding instead of the passive\'s authored bleedBaseStacks', () => {
    const stacks = Math.round(num('ring_of_a_thousand_cuts', 'bleedStacks'));
    const base = swordsman.passive.bleedBaseStacks ?? 1;
    expect(stacks).not.toBe(base);
    function basicBleeds(equipment: readonly string[]): number {
      const w = worldOf('swordsman', equipment);
      w.warden.attackCooldown = 0;
      const e = dummy(w, w.warden.x + 1, w.warden.y);
      for (let t = 0; t < 60 && dotStacks(e, 'bleeding') === 0; t++) updateWarden(w, input(), DT);
      return dotStacks(e, 'bleeding');
    }
    function dashBleeds(equipment: readonly string[]): number {
      const w = worldOf('swordsman', equipment);
      const e = dummy(w, w.warden.x + 3, w.warden.y);
      applyCommand(w, { k: 'class_active2', aimX: e.x, aimY: e.y });
      return dotStacks(e, 'bleeding');
    }
    expect(basicBleeds(['ring_of_a_thousand_cuts'])).toBe(stacks);
    expect(basicBleeds([])).toBe(base);
    expect(dashBleeds(['ring_of_a_thousand_cuts'])).toBe(stacks);
    expect(dashBleeds([])).toBe(base);
  });

  it("Duelist's Pendant: a Dash Slash merged into a charged Circle Slash banks chargeRefund of the charge and keeps the hold live — releasing chains a second slash", () => {
    const refund = num('duelists_pendant', 'chargeRefund');
    const cap = swordsman.active1.chargeCapSeconds ?? 3;
    function mergeThenRelease(equipment: readonly string[]) {
      const w = worldOf('swordsman', equipment);
      chargeFully(w);
      expect(w.warden.active1Charge).toBeCloseTo(cap, 9);
      applyCommand(w, { k: 'class_active2', aimX: w.warden.x + 100, aimY: w.warden.y });
      const afterMerge = {
        charge: w.warden.active1Charge,
        charging: w.warden.active1Charging,
        cooldown: w.warden.active1Cooldown,
      };
      for (let t = 0; t < 30; t++) updateWarden(w, held(true), DT); // the dash lands, key still down
      expect(w.warden.dashTravel).toBeNull();
      const near = dummy(w, w.warden.x + 1, w.warden.y);
      updateWarden(w, held(false), DT); // release
      return {
        ...afterMerge,
        chainHit: near.hp < DUMMY_HP,
        chargingAfterRelease: w.warden.active1Charging,
        cooldownAfterRelease: w.warden.active1Cooldown,
      };
    }
    const worn = mergeThenRelease(['duelists_pendant']);
    expect(worn.charge).toBeCloseTo(cap * refund, 9);
    expect(worn.charging).toBe(true);
    expect(worn.cooldown).toBe(0);
    expect(worn.chainHit).toBe(true); // the chained second slash
    expect(worn.chargingAfterRelease).toBe(false);
    expect(worn.cooldownAfterRelease).toBeGreaterThan(0); // the chain's release starts the cooldown

    const bare = mergeThenRelease([]);
    expect(bare.charge).toBe(0);
    expect(bare.charging).toBe(false);
    expect(bare.cooldown).toBeGreaterThan(0);
    expect(bare.chainHit).toBe(false);
  });

  it('Bracer of the Whirlwind: a Circle Slash release reaches radiusMul x its radius', () => {
    const radiusMul = num('bracer_of_the_whirlwind', 'radiusMul');
    const cap = swordsman.active1.chargeCapSeconds ?? 3;
    const full = circleSlashValues(swordsman.active1, cap).radius;
    function releaseReaches(equipment: readonly string[]): boolean {
      const w = worldOf('swordsman', equipment);
      expect(w.derived.areaMul).toBe(1); // the +area fallback never reaches the Swordsman
      const e = dummy(w, w.warden.x + (full * (1 + radiusMul)) / 2, w.warden.y);
      chargeFully(w);
      updateWarden(w, held(false), DT);
      return e.hp < DUMMY_HP;
    }
    expect(releaseReaches(['bracer_of_the_whirlwind'])).toBe(true);
    expect(releaseReaches([])).toBe(false);
  });

  it('Bracer of the Whirlwind: a Circle Slash knocks back knockbackMul x as far', () => {
    const knockbackMul = num('bracer_of_the_whirlwind', 'knockbackMul');
    const cap = swordsman.active1.chargeCapSeconds ?? 3;
    const knockback = circleSlashValues(swordsman.active1, cap).knockback;
    expect(knockback).toBeGreaterThan(0);
    function pushed(equipment: readonly string[]): number {
      const w = worldOf('swordsman', equipment);
      const e = dummy(w, w.warden.x + 1.2, w.warden.y);
      const x0 = e.x;
      chargeFully(w);
      updateWarden(w, held(false), DT);
      expect(e.dead).toBe(false);
      return e.x - x0;
    }
    expect(pushed(['bracer_of_the_whirlwind'])).toBeCloseTo(knockback * knockbackMul, 6);
    expect(pushed([])).toBeCloseTo(knockback, 6);
  });

  it("Bracer of the Whirlwind: Dash Slash's mid-charge merge widens by the same radiusMul", () => {
    const radiusMul = num('bracer_of_the_whirlwind', 'radiusMul');
    const cap = swordsman.active1.chargeCapSeconds ?? 3;
    const full = circleSlashValues(swordsman.active1, cap).radius;
    function mergedHitRange(equipment: readonly string[]): number {
      const w = worldOf('swordsman', equipment);
      chargeFully(w);
      w.fx.length = 0;
      applyCommand(w, { k: 'class_active2', aimX: w.warden.x + 100, aimY: w.warden.y });
      const fx = lastFx(w, 'class_active2');
      return Math.hypot(fx.a - fx.x, fx.b - fx.y); // fb151: the emitted segment is the real hit corridor
    }
    expect(mergedHitRange(['bracer_of_the_whirlwind']) - mergedHitRange([])).toBeCloseTo(full * (radiusMul - 1), 6);
  });
});

describe('fb056 code-review regressions (Swordsman set)', () => {
  it("Duelist's Pendant refunds once per hold: a second merge in the same hold consumes the charge and starts Circle Slash's cooldown (code review Major 1)", () => {
    const refund = num('duelists_pendant', 'chargeRefund');
    const cap = swordsman.active1.chargeCapSeconds ?? 3;
    const w = worldOf('swordsman', ['duelists_pendant']);
    chargeFully(w);
    applyCommand(w, { k: 'class_active2', aimX: w.warden.x + 100, aimY: w.warden.y });
    expect(w.warden.active1Charge).toBeCloseTo(cap * refund, 9);
    expect(w.warden.active1Cooldown).toBe(0);
    // Keep holding until Dash Slash is ready again, then merge a second time.
    for (let t = 0; t < 600 && w.warden.active2Cooldown > 0; t++) updateWarden(w, held(true), DT);
    expect(w.warden.active2Cooldown).toBeLessThanOrEqual(0);
    expect(w.warden.active1Charging).toBe(true);
    applyCommand(w, { k: 'class_active2', aimX: w.warden.x - 100, aimY: w.warden.y });
    expect(w.warden.active1Charging, 'a second merge in one hold must end the chain').toBe(false);
    expect(w.warden.active1Charge).toBe(0);
    expect(w.warden.active1Cooldown, 'the chain cannot dodge Circle Slash\'s cooldown').toBeGreaterThan(0);
    // A fresh hold after the cooldown earns a fresh refund.
    for (let t = 0; t < 2000 && w.warden.active1Cooldown > 0; t++) updateWarden(w, held(false), DT);
    for (let t = 0; t < 2000 && w.warden.active2Cooldown > 0; t++) updateWarden(w, held(false), DT);
    chargeFully(w);
    applyCommand(w, { k: 'class_active2', aimX: w.warden.x + 100, aimY: w.warden.y });
    expect(w.warden.active1Charging).toBe(true);
    expect(w.warden.active1Charge).toBeCloseTo(cap * refund, 9);
  });
});

/* ======================================================= (a) "if not <class>" */

/** Which `Derived` field each fallback stat lands on, and how it composes. */
const DERIVED_OF: Record<
  string,
  { field: 'attackSpeedMul' | 'maxHp' | 'moveSpeed' | 'hpRegen' | 'xpMul' | 'areaMul' | 'atkFlat' | 'armor'; kind: 'factor' | 'total' }
> = {
  attackSpeed: { field: 'attackSpeedMul', kind: 'factor' },
  maxHpPct: { field: 'maxHp', kind: 'factor' },
  moveSpeedPct: { field: 'moveSpeed', kind: 'factor' },
  hpRegen: { field: 'hpRegen', kind: 'total' },
  xpGain: { field: 'xpMul', kind: 'factor' },
  area: { field: 'areaMul', kind: 'factor' },
  atkFlat: { field: 'atkFlat', kind: 'total' },
  armor: { field: 'armor', kind: 'total' },
};

const SENTINEL = -12345;

/**
 * For every item of a set: its `classFallback` names `owner`; worn by
 * `wearer` the fallback is its own Stats source and moves the matching
 * Derived value by exactly the authored amount (measured against the same
 * world with just that source removed); worn by `owner` the source is absent;
 * and the mechanic gate is shut for `wearer` / open for `owner`.
 */
function expectFallbackReplacesLine(owner: string, wearer: string, keys: readonly string[]): void {
  for (const key of keys) {
    const row = item(key);
    const fb = row.classFallback;
    if (!fb) throw new Error(`${key} has no classFallback`);
    expect(fb.notClassKey, key).toBe(owner);
    const source = `equipment:${key}:fallback`;
    const mods = Object.entries(fb.mods as Record<string, number | undefined>);
    expect(mods.length, key).toBeGreaterThan(0);
    for (const [stat, v] of mods) {
      if (v === undefined) continue;
      const map = DERIVED_OF[stat];
      if (!map) throw new Error(`${key}: no Derived mapping for fallback stat ${stat} — extend DERIVED_OF`);
      const wWear = new World(cfg({ classKey: wearer, equipment: [key] }));
      const wOwn = new World(cfg({ classKey: owner, equipment: [key] }));
      expect(wWear.stats.contributions(stat as StatKey), `${key}.${stat}`).toContainEqual([source, v]);
      expect(wOwn.stats.contributions(stat as StatKey).map((c) => c[0]), `${key}.${stat}`).not.toContain(source);

      const withFallback = wWear.derived[map.field];
      wWear.stats.removeSource(source);
      wWear.recomputeDerived();
      const without = wWear.derived[map.field];
      if (map.kind === 'factor') expect(withFallback / without, `${key}.${stat}`).toBeCloseTo(1 + v, 9);
      else expect(withFallback - without, `${key}.${stat}`).toBeCloseTo(v, 9);
    }

    const wWear = new World(cfg({ classKey: wearer, equipment: [key] }));
    const wOwn = new World(cfg({ classKey: owner, equipment: [key] }));
    expect(classEquipmentActive(wWear, key), key).toBe(false);
    expect(classEquipmentActive(wOwn, key), key).toBe(true);
    for (const [field, v] of Object.entries(row.effectNums)) {
      expect(classEquipmentNum(wWear, key, field, SENTINEL), `${key}.${field}`).toBe(SENTINEL);
      expect(classEquipmentNum(wOwn, key, field, SENTINEL), `${key}.${field}`).toBe(v);
    }
  }
}

describe('fb056 §7.1 (a) "if not <class>": the fallback replaces the line for every other class', () => {
  it('if not Plaguebringer: each fallback reaches an Engineer wearer\'s Stats (never a Plaguebringer\'s), and Flask/Band/Boots stay inert on the Engineer', () => {
    expectFallbackReplacesLine('plaguebringer', 'engineer', PLAGUE_SET);

    const engineer = classDef('engineer');
    const w = worldOf('engineer', PLAGUE_SET); // one item per slot: the whole set at once
    // Plague Flask: the Engineer's own swing lands but carries no Poison.
    const target = dummy(w, w.warden.x + 2, w.warden.y);
    w.warden.attackCooldown = 0;
    classBasicAttack(w, engineer);
    expect(target.hp).toBeLessThan(DUMMY_HP);
    expect(dotStacks(target, 'poison')).toBe(0);
    // Blightweaver Band: a poisoned enemy ticks nothing onto its neighbour.
    applyDot(w, target, 'poison', 6, 3, 'test');
    const neighbour = dummy(w, target.x + 0.5, target.y);
    updateClassPassives(w, DT);
    expect(neighbour.hp).toBe(DUMMY_HP);
    // Carrier's Boots: a dash lays no trail.
    w.warden.attackCooldown = 1e9;
    const areas = w.areas.length;
    updateWarden(w, input({ mx: 1, dash: true }), DT);
    expect(w.warden.dashTravel).not.toBeNull();
    expect(w.areas.length).toBe(areas);
  });

  it('if not Time Lord: each fallback reaches a Swordsman wearer\'s Stats (never a Time Lord\'s), and the Scepter\'s DoT speed-up stays inert on the Swordsman', () => {
    expectFallbackReplacesLine('time_lord', 'swordsman', TIME_SET);

    const w = worldOf('swordsman', TIME_SET);
    expect(characterDotSpeedMul(w)).toBe(1);
    const e = dummy(w, w.warden.x + 1, w.warden.y);
    applyDot(w, e, 'bleeding', 10, 6, 'class_active');
    const s = only(stacksOf(e, 'bleeding'));
    expect(s.remaining).toBeCloseTo(6, 9);
    expect(s.dps).toBeCloseTo(10 * w.derived.ailmentMul, 9);
  });

  it('if not Swordsman: each fallback reaches a Plaguebringer wearer\'s Stats (never a Swordsman\'s), and her Actives widen by the +area fallback, not the Whirlwind\'s radiusMul', () => {
    expectFallbackReplacesLine('swordsman', 'plaguebringer', SWORD_SET);

    const radiusMul = num('bracer_of_the_whirlwind', 'radiusMul');
    const areaFallback = fallbackMod('bracer_of_the_whirlwind', 'area');
    const worn = worldOf('plaguebringer', SWORD_SET);
    const bare = worldOf('plaguebringer');
    applyCommand(worn, { k: 'class_active' });
    applyCommand(bare, { k: 'class_active' });
    const cloud = only(worn.areas).radius;
    const bareCloud = only(bare.areas).radius;
    expect(cloud).toBeCloseTo(bareCloud * (1 + areaFallback), 9);
    expect(Math.abs(cloud - bareCloud * radiusMul)).toBeGreaterThan(1e-3);
  });
});

/* ============================================================ (b) synergies */

describe('fb056 §7.1 (b) headline synergy chains', () => {
  it('Plaguebringer: Flask applies -> Band spreads it by contact -> Locket boosts it -> Ring fans the boosted remainder out on death', () => {
    const share = num('blightweaver_band', 'contactShare');
    const radius = num('blightweaver_band', 'contactRadius');
    const boost = num('pestilent_locket', 'dotBoostMul');
    const extra = Math.round(num('ring_of_contagion', 'extraTargets'));
    const CHAIN = ['plague_flask', 'blightweaver_band', 'pestilent_locket', 'ring_of_contagion'];

    function chain(equipment: readonly string[]) {
      const w = worldOf('plaguebringer', equipment);
      const reach = radius * w.derived.areaMul;
      const cx = w.warden.x + 2;
      const cy = w.warden.y;
      const carrier = dummy(w, cx, cy); // nearest to the Warden: the basic attack's target
      const toucher = dummy(w, cx + reach * 0.5, cy);
      const fanned: Enemy[] = [];
      for (let i = 0; i < extra; i++) fanned.push(dummy(w, cx, cy + (i % 2 === 0 ? 1 : -1) * (2 + i)));
      const beyond = dummy(w, cx, cy + 3 + extra + 3);

      // 1. Flask applies.
      w.warden.attackCooldown = 0;
      classBasicAttack(w, plaguebringer);
      w.warden.attackCooldown = 1e9;
      const poisoned = dotStacks(carrier, 'poison');
      const poisonDps = stacksOf(carrier, 'poison').reduce((s, d) => s + d.dps, 0);

      // 2. Band spreads it by contact.
      let before = toucher.hp;
      updateClassPassives(w, DT);
      const tick1 = before - toucher.hp;

      // 3. Locket boosts it — and the contact tick with it.
      applyCommand(w, { k: 'class_active2' });
      const boostedDps = stacksOf(carrier, 'poison').reduce((s, d) => s + d.dps, 0);
      before = toucher.hp;
      updateClassPassives(w, DT);
      const tick2 = before - toucher.hp;

      // 4. Ring fans the boosted remainder out when the carrier dies.
      const owed = dotOutstanding(carrier);
      const receivers = [toucher, ...fanned];
      const hpBefore = receivers.map((e) => e.hp);
      const beyondBefore = beyond.hp;
      damageEnemy(w, carrier, 1e9, 'test', { pure: true, dot: true });
      expect(carrier.dead).toBe(true);
      const received = receivers.map((e, i) => at(hpBefore, i) - e.hp);
      return { w, poisoned, poisonDps, tick1, boostedDps, tick2, owed, received, beyondLoss: beyondBefore - beyond.hp };
    }

    const on = chain(CHAIN);
    expect(on.poisoned).toBe(1);
    expect(on.tick1).toBeGreaterThan(0);
    expect(on.tick1).toBeCloseTo(share * on.poisonDps * DT * kitPowerMul(on.w), 9);
    expect(on.boostedDps).toBeCloseTo(on.poisonDps * boost, 9);
    expect(on.tick2).toBeCloseTo(on.tick1 * boost, 9);
    expect(on.owed).toBeGreaterThan(0);
    expect(on.received.length).toBe(1 + extra);
    for (const r of on.received) expect(r).toBeCloseTo(on.owed, 6);
    expect(on.beyondLoss).toBe(0);

    // Take the Flask off and the whole chain has nothing to carry.
    const off = chain(CHAIN.filter((k) => k !== 'plague_flask'));
    expect(off.poisoned).toBe(0);
    expect(off.tick1).toBe(0);
    expect(off.tick2).toBe(0);
    expect(off.owed).toBe(0);
    for (const r of off.received) expect(r).toBe(0);
  });

  describe('Time Lord: Scepter + Pendant + Loop Ring = the mark-cycling engine', () => {
    const base = timeLord.active1.maxCharges ?? 1;
    const extra = Math.round(num('loop_ring', 'extraCharges'));
    const refund = Math.round(num('pendulum_pendant', 'executeRefundCharges'));
    const speed = num('hourglass_scepter', 'dotSpeedMul');

    function cycle(equipment: readonly string[]) {
      const w = worldOf('time_lord', equipment);
      const e = dummy(w, w.warden.x + 1, w.warden.y);
      const startAmmo = w.warden.active1Ammo;
      const stages: number[] = [];
      let pastRemaining = NaN;
      for (let i = 0; i < 4; i++) {
        applyCommand(w, { k: 'class_active' });
        if (i === 0) pastRemaining = only(stacksOf(e, 'bleeding')).remaining;
        stages.push(e.dead ? -1 : e.timeMarkStage);
      }
      return { startAmmo, ammo: w.warden.active1Ammo, dead: e.dead, stages, pastRemaining };
    }

    it('a full Loop Ring bar walks one enemy unmarked -> executed in four presses, the Pendant hands a charge back, the Scepter halves each stage DoT', () => {
      // The premise: the base bar is one press short of a full cycle, the ring's is not.
      expect(base).toBeLessThan(4);
      expect(base + extra).toBeGreaterThanOrEqual(4);

      const engine = cycle(['loop_ring', 'pendulum_pendant', 'hourglass_scepter']);
      expect(engine.startAmmo).toBe(base + extra);
      expect(engine.stages).toEqual([1, 2, 3, -1]);
      expect(engine.dead).toBe(true);
      expect(engine.ammo).toBe(base + extra - 4 + refund);
      expect(engine.pastRemaining).toBeCloseTo((timeLord.active1.markPastDotSeconds ?? 0) / speed, 9);

      const noRing = cycle(['pendulum_pendant', 'hourglass_scepter']);
      expect(noRing.startAmmo).toBe(base);
      expect(noRing.stages).toEqual([1, 2, 3, 3]); // the 4th press has no charge to spend
      expect(noRing.dead).toBe(false);
      expect(noRing.ammo).toBe(0);

      const noPendant = cycle(['loop_ring', 'hourglass_scepter']);
      expect(noPendant.dead).toBe(true);
      expect(noPendant.ammo).toBe(0); // the same kill, no charge back
    });

    it("the Pendant's refund can fill the Loop Ring's raised cap: an execute press from a full 4/4 bar ends at 4/4", () => {
      const w = worldOf('time_lord', ['loop_ring', 'pendulum_pendant']);
      const cap = activeMaxCharges(w, timeLord, 'active1');
      expect(cap).toBe(base + extra);
      expect(w.warden.active1Ammo).toBe(cap);
      const e = dummy(w, w.warden.x + 1, w.warden.y);
      e.timeMarkStage = 3; // "future"
      applyCommand(w, { k: 'class_active' });
      expect(e.dead).toBe(true);
      // One charge spent on the press, `refund` handed back for the execute,
      // never above the ring's cap.
      expect(w.warden.active1Ammo).toBe(Math.min(cap, cap - 1 + refund));
    });
  });

  it("Swordsman: Duelist's Pendant chains a second slash and Bracer of the Whirlwind widens both the merge and the chained slash", () => {
    const radiusMul = num('bracer_of_the_whirlwind', 'radiusMul');
    const refund = num('duelists_pendant', 'chargeRefund');
    const eff = swordsman.active1;
    const cap = eff.chargeCapSeconds ?? 3;

    /** The unmerged Dash Slash hit corridor for this loadout (fb151: the emitted segment). */
    function dashRangeOf(equipment: readonly string[]): number {
      const w = worldOf('swordsman', equipment);
      w.fx.length = 0;
      applyCommand(w, { k: 'class_active2', aimX: w.warden.x + 100, aimY: w.warden.y });
      const fx = lastFx(w, 'class_active2');
      return Math.hypot(fx.a - fx.x, fx.b - fx.y);
    }

    function spin(equipment: readonly string[]) {
      const w = worldOf('swordsman', equipment);
      const x0 = w.warden.x;
      const y0 = w.warden.y;
      const plainFull = circleSlashValues(eff, cap).radius * w.derived.areaMul;
      // Past the plain merged corridor, inside the Whirlwind-widened one.
      const far = dummy(w, x0 + dashRangeOf(equipment) + (plainFull * (1 + radiusMul)) / 2, y0);
      chargeFully(w);
      applyCommand(w, { k: 'class_active2', aimX: x0 + 100, aimY: y0 });
      const mergeHitFar = far.hp < DUMMY_HP;
      const chargeAfterMerge = w.warden.active1Charge;
      const chargingAfterMerge = w.warden.active1Charging;
      for (let t = 0; t < 30; t++) updateWarden(w, held(true), DT); // land the dash, key still down
      expect(w.warden.dashTravel).toBeNull();
      // Past the plain chained radius at the charge actually banked, inside the widened one.
      const plain = circleSlashValues(eff, w.warden.active1Charge).radius * w.derived.areaMul;
      const ring = dummy(w, w.warden.x, w.warden.y + (plain * (1 + radiusMul)) / 2);
      updateWarden(w, held(false), DT); // release: the chained second slash, if there is one
      return {
        mergeHitFar,
        chargeAfterMerge,
        chargingAfterMerge,
        chainHitRing: ring.hp < DUMMY_HP,
        cooldownAfterRelease: w.warden.active1Cooldown,
      };
    }

    const both = spin(['duelists_pendant', 'bracer_of_the_whirlwind']);
    expect(both.mergeHitFar).toBe(true);
    expect(both.chargeAfterMerge).toBeCloseTo(cap * refund, 9);
    expect(both.chargingAfterMerge).toBe(true);
    expect(both.chainHitRing).toBe(true);
    expect(both.cooldownAfterRelease).toBeGreaterThan(0);

    // Pendant alone: the chain happens, but at the plain radius both times.
    const pendantOnly = spin(['duelists_pendant']);
    expect(pendantOnly.mergeHitFar).toBe(false);
    expect(pendantOnly.chargingAfterMerge).toBe(true);
    expect(pendantOnly.chainHitRing).toBe(false);
    expect(pendantOnly.cooldownAfterRelease).toBeGreaterThan(0); // the chain did release

    // Bracer alone: the merge is widened, but there is no second slash to widen.
    const bracerOnly = spin(['bracer_of_the_whirlwind']);
    expect(bracerOnly.mergeHitFar).toBe(true);
    expect(bracerOnly.chargingAfterMerge).toBe(false);
    expect(bracerOnly.chainHitRing).toBe(false);
  });
});
