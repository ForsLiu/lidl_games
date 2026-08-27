/**
 * World/report invariant scanner — extracted from `tools/fuzz-input.ts`
 * (lane item q11) so `scanWorld`/`scanReport` have one definition instead of
 * one that q2 fuzzes and a second any future harness would have to re-derive.
 * `tools/fuzz-input.ts` re-exports both for its existing callers; q7's
 * data-fuzz probes already reach them the same way, through that re-export.
 *
 * Every check here mirrors what q2's own commit history measured: only the
 * fields with an unarguable range are asserted non-negative/positive, and the
 * per-tick timers get finiteness only, because they are *defined* to end one
 * tick past zero (`buildTimer` lands on -0.0167, `duskTimer` on -3.2e-13, on
 * every run) — a stricter bound there would be a false invariant.
 */

import type { World } from '../src/sim/world';
import { GRID_H, GRID_W } from '../src/sim/grid';
import { STAT_KEYS } from '../src/sim/stats';

function bad(v: unknown): boolean {
  return typeof v !== 'number' || !Number.isFinite(v);
}

/**
 * `Derived`, checked for finiteness and — for the fields that have one — for
 * the range they are defined to keep. "No negative stat" is half of the
 * QUALITY.md line, and finiteness alone does not cover it: `maxHp: -50` and
 * `attackSpeedMul: 0` are both finite and both mean the run is over.
 *
 * Only the fields with an unarguable range are listed. Several `Derived` fields
 * are legitimately negative or zero — `armor` has a −100 floor (SPEC-FINAL §17,
 * still open for owner review), and every `...Bonus` is a signed delta — so a
 * blanket non-negative sweep would be a false failure waiting to happen.
 */
const DERIVED_POSITIVE = [
  'maxHp',
  'moveSpeed',
  'powerMul',
  'attackSpeedMul',
  'areaMul',
  'towerDamageMul',
  'towerRangeMul',
  'towerCostMul',
  'goldFindMul',
  'emberFindMul',
  'relicFindMul',
  'wallHpMul',
] as const;

const DERIVED_NON_NEGATIVE = ['pickupRadius', 'buildRange', 'weaponSlots', 'dashCharges', 'goldPerKill'] as const;

function scanDerived(w: World): string[] {
  const out: string[] = [];
  const d = w.derived as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(d)) {
    if (typeof v === 'number' && !Number.isFinite(v)) out.push(`derived.${k}=${String(v)} is not finite`);
  }
  for (const k of DERIVED_POSITIVE) {
    const v = d[k];
    if (typeof v === 'number' && Number.isFinite(v) && v <= 0) out.push(`derived.${k}=${v} is not positive`);
  }
  for (const k of DERIVED_NON_NEGATIVE) {
    const v = d[k];
    if (typeof v === 'number' && Number.isFinite(v) && v < 0) out.push(`derived.${k}=${v} is negative`);
  }
  // `cdr` is subtracted from each cooldown as a fraction; at 1 or above every
  // cooldown is zero or negative and every active is free forever.
  if (Number.isFinite(w.derived.cdr) && w.derived.cdr >= 1) out.push(`derived.cdr=${w.derived.cdr} is >= 1`);
  return out;
}

/**
 * Every number a Command can move, checked for NaN/Infinity and for the sign it
 * is defined to keep. Returns one string per violation; empty means clean.
 */
export function scanWorld(w: World): string[] {
  const out: string[] = [];
  const finite = (name: string, v: unknown): void => {
    if (bad(v)) out.push(`${name}=${String(v)} is not finite`);
  };
  const nonNeg = (name: string, v: unknown): void => {
    if (bad(v)) out.push(`${name}=${String(v)} is not finite`);
    else if ((v as number) < 0) out.push(`${name}=${String(v)} is negative`);
  };

  nonNeg('gold', w.gold);
  nonNeg('goldEarned', w.goldEarned);
  nonNeg('goldSpent', w.goldSpent);
  finite('coreHp', w.coreHp);
  nonNeg('coreMaxHp', w.coreMaxHp);
  nonNeg('xp', w.xp);
  nonNeg('level', w.level);
  nonNeg('kills', w.kills);
  nonNeg('leaks', w.leaks);
  nonNeg('wave', w.wave);
  nonNeg('wavesCleared', w.wavesCleared);
  nonNeg('towersBuilt', w.towersBuilt);
  nonNeg('damageTotal', w.damageTotal);
  nonNeg('act2Time', w.act2Time);
  nonNeg('rerollsLeft', w.rerollsLeft);
  nonNeg('spawnBudget', w.spawnBudget);
  nonNeg('cycle', w.cycle);
  nonNeg('tick', w.tick);
  nonNeg('emberEarned', w.emberEarned);
  // Timers and counters the fuzzed commands write directly: `call` zeroes
  // `buildTimer`, `pick` moves `pendingLevelUps`, `dawn_done`/`souls` gate on
  // the Dawn and Dusk clocks.
  //
  // The timers get finiteness only, deliberately. A countdown timer is `t -= dt`
  // until the phase reads it as expired, so it is *defined* to end one tick past
  // zero — measured, `buildTimer` lands on -0.0167 and `duskTimer` on -3.2e-13
  // every single run. A non-negative assertion here would have been a false
  // invariant that failed on correct behaviour. What actually matters is that a
  // timer stays a number: a NaN one never compares `<= 0`, so its phase never ends.
  finite('buildTimer', w.buildTimer);
  finite('duskTimer', w.duskTimer);
  finite('dawnTimer', w.dawnTimer);
  finite('soulPickTimer', w.soulPickTimer);
  finite('spawnTimer', w.spawnTimer);
  finite('dyingTimer', w.dyingTimer);
  nonNeg('pendingLevelUps', w.pendingLevelUps);

  const wd = w.warden;
  finite('warden.hp', wd.hp);
  finite('warden.x', wd.x);
  finite('warden.y', wd.y);
  // The cooldowns are the only durable state some commands write at all —
  // `class_active` writes `activeCooldown` and nothing else.
  finite('warden.activeCooldown', wd.activeCooldown);
  finite('warden.dashCooldown', wd.dashCooldown);
  finite('warden.attackCooldown', wd.attackCooldown);
  nonNeg('warden.dashCharges', wd.dashCharges);
  finite('warden.armorShred', wd.armorShred);
  finite('warden.leechAccumulator', wd.leechAccumulator);
  if (!bad(wd.x) && (wd.x < 0 || wd.x > GRID_W)) out.push(`warden.x=${wd.x} is off-grid`);
  if (!bad(wd.y) && (wd.y < 0 || wd.y > GRID_H)) out.push(`warden.y=${wd.y} is off-grid`);

  out.push(...scanDerived(w));

  // `Stats` keeps its contributions in a private Map, so enumerating the
  // object finds one Map and zero numbers. The values only exist through
  // `total()`/`factor()`, which is what has to be read.
  for (const key of STAT_KEYS) {
    finite(`stats.total(${key})`, w.stats.total(key));
    finite(`stats.factor(${key})`, w.stats.factor(key));
  }

  for (const [k, v] of Object.entries(w.damageByWeapon)) nonNeg(`damageByWeapon.${k}`, v);
  for (const [k, v] of Object.entries(w.towersByKey)) nonNeg(`towersByKey.${k}`, v);
  // The whole output of the `pick` command, which is one of the two commands
  // that most often lands.
  for (const [k, v] of Object.entries(w.boonRanks)) nonNeg(`boonRanks.${k}`, v);
  for (const [k, v] of Object.entries(w.soulLevels)) {
    nonNeg(`soulLevels.${k}.level`, v.level);
    finite(`soulLevels.${k}.damageBonus`, v.damageBonus);
  }

  // `reroll` and `pick` rewrite the offer list wholesale.
  for (let i = 0; i < w.offers.length; i++) nonNeg(`offers[${i}].toLevel`, w.offers[i].toLevel);

  for (const s of w.structures) {
    finite(`structure#${s.id}.hp`, s.hp);
    nonNeg(`structure#${s.id}.maxHp`, s.maxHp);
    nonNeg(`structure#${s.id}.spent`, s.spent);
    nonNeg(`structure#${s.id}.tier`, s.tier);
    finite(`structure#${s.id}.cooldown`, s.cooldown);
    // `build` places these, and an off-grid tile would index the grid out of
    // bounds for every reader downstream.
    if (!Number.isInteger(s.tx) || s.tx < 0 || s.tx >= GRID_W) {
      out.push(`structure#${s.id}.tx=${String(s.tx)} is off-grid`);
    }
    if (!Number.isInteger(s.ty) || s.ty < 0 || s.ty >= GRID_H) {
      out.push(`structure#${s.id}.ty=${String(s.ty)} is off-grid`);
    }
  }
  for (const e of w.enemies) {
    finite(`enemy#${e.id}.hp`, e.hp);
    finite(`enemy#${e.id}.x`, e.x);
    finite(`enemy#${e.id}.y`, e.y);
  }
  for (const p of w.projectiles) {
    finite('projectile.x', p.x);
    finite('projectile.y', p.y);
  }
  for (const g of w.gems) {
    finite(`gem#${g.id}.x`, g.x);
    finite(`gem#${g.id}.y`, g.y);
    nonNeg(`gem#${g.id}.value`, g.value);
  }
  for (const a of w.areas) {
    finite(`area#${a.id}.x`, a.x);
    finite(`area#${a.id}.y`, a.y);
    nonNeg(`area#${a.id}.radius`, a.radius);
    finite(`area#${a.id}.dps`, a.dps);
  }
  // Indexed by wave number, 1-based, so index 0 is a hole by design and every
  // wave that has not happened yet is another. Only written entries are checked.
  const perWave = (name: string, arr: number[]): void => {
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] !== undefined) nonNeg(`${name}[${i}]`, arr[i]);
    }
  };
  perWave('spawnedByWave', w.spawnedByWave);
  perWave('leaksByWave', w.leaksByWave);
  perWave('goldEarnedByWave', w.goldEarnedByWave);
  for (const wp of w.weapons) {
    nonNeg(`weapon.${wp.key}.level`, wp.level);
    finite(`weapon.${wp.key}.damageBonus`, wp.damageBonus);
  }
  return out;
}

/** Every number reachable in an end report, checked for NaN/Infinity. */
export function scanReport(value: unknown, path = 'report'): string[] {
  const out: string[] = [];
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) out.push(`${path}=${String(value)} is not finite`);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => out.push(...scanReport(v, `${path}[${i}]`)));
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) out.push(...scanReport(v, `${path}.${k}`));
  }
  return out;
}
