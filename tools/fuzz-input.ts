/**
 * Input fuzzer (QUALITY.md ALPHA: "10,000 random valid Commands per phase
 * produce no crash and no negative/NaN stat"; lane item q2).
 *
 * The sim's whole player surface is the Command union in `src/sim/types.ts`
 * (architecture rule 3: every player action, including class actives, is a
 * Command). So the fuzz surface is that union, driven at each of the eight
 * `Phase` values, with arguments drawn from each field's legal domain — a real
 * client can send any of these at any time, including at a phase where they
 * mean nothing.
 *
 * Everything here is seeded: `fuzzPhase(phase, seed, n)` produces the identical
 * command sequence on every host and every run, so a failure reports a seed and
 * an index that reproduce it exactly.
 *
 *   npx tsx tools/fuzz-input.ts                 # all phases, 10k each
 *   npx tsx tools/fuzz-input.ts --n 200000 --phase act2 --seed 7
 */

import { applyCommand, Run } from '../src/sim/run';
import { World } from '../src/sim/world';
import { Rng } from '../src/sim/rng';
import { GRID_H, GRID_W } from '../src/sim/grid';
import { beginDawn, beginSoulPick } from '../src/sim/sundering';
import { openLevelUpIfPending, takeOffer } from '../src/sim/progression';
import { STAT_KEYS } from '../src/sim/stats';
import { buildTower } from '../src/sim/towers';
import { emptyInput, type Command, type DevOp, type Phase, type RunConfig } from '../src/sim/types';
import { makePolicy } from '../src/bots';
import '../src/bots';

const DEV_OPS: DevOp[] = [
  'kill_all',
  'gold',
  'xp',
  'heal',
  'invuln',
  'god',
  'skip_wave',
  'summon_boss',
  'fast_forward',
];

/** The bot that reaches each phase, and how many cycles its run needs. */
const ROUTE: Record<Phase, { policy: string; cycles: number; seed: number }> = {
  act1_build: { policy: 'hybrid', cycles: 1, seed: 1 },
  act1_wave: { policy: 'hybrid', cycles: 1, seed: 1 },
  dusk: { policy: 'hybrid', cycles: 1, seed: 1 },
  // `soulpick` only opens when there are more candidate souls than weapon
  // slots, which no shipped bot manages (see the q2 note in the lane Log); the
  // route below builds that spread by hand at Dusk.
  soulpick: { policy: 'hybrid', cycles: 1, seed: 1 },
  act2: { policy: 'hybrid', cycles: 1, seed: 1 },
  levelup: { policy: 'hybrid', cycles: 1, seed: 1 },
  // Dawn sits between cycles, so it needs a multi-cycle run that survives Night.
  dawn: { policy: 'greedy', cycles: 3, seed: 1 },
  // Same route as Dawn rather than a hybrid single-cycle win: it reaches a
  // Results state just as full — towers, souls, boons, a second cycle — in a
  // seventh of the wall time, and driving to Results is this file's one real cost.
  results: { policy: 'greedy', cycles: 3, seed: 1 },
};

/**
 * Derived from `ROUTE`, not written out again: `Record<Phase, …>` is exhaustive
 * by construction, so a phase added to the union without a route here is a
 * compile error rather than a phase this file quietly never fuzzes.
 */
export const PHASES = Object.keys(ROUTE) as Phase[];

const MAX_TICKS = 60 * 60 * 45;

function cfgFor(phase: Phase): RunConfig {
  const r = ROUTE[phase];
  return {
    seed: r.seed,
    classKey: 'engineer',
    tier: 1,
    modifiers: [],
    allocated: [],
    relics: [],
    policy: r.policy,
    cycles: r.cycles,
    // The dev commands are a no-op unless the run opted into the practice tool,
    // and a fuzzer that cannot reach `applyDevCommand` is not fuzzing a ninth
    // of the Command union.
    practice: true,
  };
}

/** Widening read: the sim mutates `w.phase` inside calls the compiler narrows across. */
function phaseOf(w: World): Phase {
  return w.phase;
}

/** Drive a bot run until it first stands in `phase`. Throws if unreachable. */
export function runInPhase(phase: Phase): Run {
  const route = ROUTE[phase];
  const run = new Run(cfgFor(phase));
  const policy = makePolicy(route.policy);

  if (phase === 'soulpick') {
    while (!run.done && run.world.phase !== 'dusk' && run.world.tick < MAX_TICKS) {
      run.step(policy.act(run.world));
    }
    if (run.world.phase !== 'dusk') throw new Error('fuzz: never reached dusk');
    seedSoulSpread(run.world);
    beginSoulPick(run.world);
    // Read through `phaseOf`: the `!== 'dusk'` guard above narrowed the
    // property, and `beginSoulPick` moves it behind the compiler's back.
    const after = phaseOf(run.world);
    if (after !== 'soulpick') throw new Error(`fuzz: beginSoulPick left phase=${after}`);
    return run;
  }

  while (run.world.phase !== phase && run.world.tick < MAX_TICKS) {
    if (run.done) break;
    run.step(policy.act(run.world));
  }
  if (run.world.phase !== phase) throw new Error(`fuzz: never reached phase ${phase}`);
  return run;
}

/**
 * Give the Dusk world more distinct tower souls than it has weapon slots, so
 * `beginSoulPick` opens the picker instead of auto-binding everything.
 */
function seedSoulSpread(w: World): void {
  w.gold = 1e6;
  const wardenX = w.warden.x;
  const wardenY = w.warden.y;
  // One tower per distinct soul: the picker opens on the count of distinct
  // souls, not on the number of towers, and several tower keys share one.
  const bySoul = new Map<string, number>();
  for (const def of w.content.towers.towers) {
    if (def.soul && !bySoul.has(def.soul)) bySoul.set(def.soul, def.id);
  }
  for (const towerId of bySoul.values()) {
    let done = false;
    for (let y = 1; y < GRID_H - 1 && !done; y++) {
      for (let x = 1; x < GRID_W - 1; x++) {
        w.warden.x = x + 0.5;
        w.warden.y = y + 0.5;
        if (buildTower(w, towerId, x, y).ok) {
          done = true;
          break;
        }
      }
    }
  }
  w.warden.x = wardenX;
  w.warden.y = wardenY;
}

/* ------------------------------------------------------------- generation */

/**
 * Every `k` in the `Command` union. Exported for the same reason `PHASES` is:
 * a 13th Command member that never appears here would be a member this file
 * silently never generates, and the suite would stay green. The test compares
 * this list against the union parsed out of `src/sim/types.ts`.
 *
 * The `satisfies` clause makes the compiler agree it is exactly the union's
 * tags — but `npm test` never runs `tsc`, hence the runtime check as well.
 */
export const COMMAND_KINDS = [
  'build',
  'upgrade',
  'sell',
  'call',
  'souls',
  'pick',
  'reroll',
  'equip',
  'rekindle',
  'dawn_done',
  'class_active',
  'dev',
] as const satisfies readonly Command['k'][];

/**
 * One structurally valid Command with every argument drawn from its legal
 * domain: real tower and structure ids, in-grid tiles, real soul keys, offer
 * indices inside the offer list. Malformed and out-of-domain arguments are the
 * save fuzzer's business (q3), not this one's.
 */
export function randomCommand(rng: Rng, w: World): Command {
  const kind = rng.pick(COMMAND_KINDS);
  const tx = rng.intRange(0, GRID_W - 1);
  const ty = rng.intRange(0, GRID_H - 1);
  switch (kind) {
    case 'build':
      return { k: 'build', tower: rng.pick(w.content.towers.towers).id, tx, ty };
    case 'upgrade':
      return { k: 'upgrade', tx, ty };
    case 'sell':
      return { k: 'sell', tx, ty };
    case 'call':
      return { k: 'call' };
    case 'souls': {
      // Sometimes the real candidate list, sometimes a subset of it, sometimes
      // arbitrary real soul keys that are not candidates at all.
      const all = w.content.weapons.weapons.map((x) => x.key);
      const pool = w.soulCandidates.length > 0 && rng.chance(0.7) ? w.soulCandidates : all;
      const n = rng.intRange(0, Math.min(pool.length, w.derived.weaponSlots + 2));
      const keys: string[] = [];
      for (let i = 0; i < n; i++) keys.push(rng.pick(pool));
      return { k: 'souls', keys };
    }
    case 'pick':
      return { k: 'pick', index: rng.intRange(0, Math.max(0, w.offers.length - 1)) };
    case 'reroll':
      return { k: 'reroll' };
    case 'equip':
      return { k: 'equip', relic: rng.intRange(0, Math.max(0, w.relicsFound.length - 1)) };
    case 'rekindle': {
      const ids = w.structures.map((s) => s.id);
      return { k: 'rekindle', structureId: ids.length > 0 ? rng.pick(ids) : 0 };
    }
    case 'dawn_done':
      return { k: 'dawn_done' };
    case 'class_active':
      return { k: 'class_active' };
    case 'dev':
      return { k: 'dev', op: rng.pick(DEV_OPS), amount: rng.intRange(0, 5000) };
  }
}

/* -------------------------------------------------------------- invariants */

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

/* ------------------------------------------------------------------ driver */

export interface FuzzResult {
  phase: Phase;
  seed: number;
  /** Commands applied *while the world stood in `phase`*. This is the number. */
  commands: number;
  /** Phases the world passed through while being fuzzed. */
  visited: Phase[];
  /** How many times the phase had to be re-entered after a command left it. */
  reentries: number;
  /** First failure, if any: what broke and which command index broke it. */
  failure: { index: number; command: Command; problems: string[] } | null;
  ms: number;
}

/**
 * Put `run` back into `phase` after a command left it, and return the run to
 * carry on with — the same one where the sim has a transition that re-enters
 * the phase, a fresh one where it does not.
 *
 * The cheap paths call the sim's own transition functions, the same ones the
 * run loop calls, rather than assigning `w.phase` — an assigned phase would
 * skip the setup the phase's update code expects and turn this into a source
 * of invented failures.
 */
function reenter(run: Run, phase: Phase): Run {
  const w = run.world;
  if (phaseOf(w) === phase) return run;

  if (!run.done) {
    if (phase === 'soulpick') {
      beginSoulPick(w);
      if (phaseOf(w) === phase) return run;
    } else if (phase === 'dawn') {
      beginDawn(w);
      if (phaseOf(w) === phase) return run;
    } else if (phase === 'levelup' && phaseOf(w) === 'act2') {
      w.pendingLevelUps++;
      openLevelUpIfPending(w);
      if (phaseOf(w) === phase) return run;
    } else if (phase === 'act2' && phaseOf(w) === 'levelup') {
      // The only way out of `levelup` is taking an offer, which is what a
      // player does. It has to be drained rather than done once: `takeOffer`
      // ends with `openLevelUpIfPending`, so with level-ups queued it hands
      // straight back to `levelup`. Without this, act2 pays a full run rebuild
      // per picker and costs 18 s instead of 1.
      for (let i = 0; i < 64 && phaseOf(w) === 'levelup'; i++) {
        if (!takeOffer(w, 0)) break;
      }
      if (phaseOf(w) === phase) return run;
    }
    // act1_build <-> act1_wave cycle on their own; give the run a second of
    // ticks to walk back before paying for a rebuild.
    for (let i = 0; i < 60 && !run.done && phaseOf(w) !== phase; i++) run.step(emptyInput());
    if (phaseOf(w) === phase) return run;
  }
  return runInPhase(phase);
}

/**
 * Fire `n` seeded commands at a world standing in `phase`, checking every
 * number after each one. Every `stepEvery` commands the sim also takes a tick,
 * so a value a command poisoned has somewhere to propagate to — a NaN that only
 * ever sits in a field nothing reads is not the interesting kind.
 *
 * Commands that end the phase (`souls` ends `soulpick`, `dawn_done` ends
 * `dawn`) are part of the surface and are fired, but they must not end the fuzz:
 * `souls` is 1 command in 12, so a soulpick pass that just let the world drift
 * would spend a dozen commands in the phase it named and 9,988 somewhere else.
 * So only in-phase commands count toward `n`, and the phase is re-entered when
 * one leaves it.
 */
export function fuzzPhase(phase: Phase, seed: number, n: number, stepEvery = 250): FuzzResult {
  const started = performance.now();
  let run = runInPhase(phase);
  // Deliberately not the same derivation as `fuzzRun`'s: the two halves are
  // meant to be independent samples, and `0x9e3779b1` *is* 2654435761, so
  // sharing the constant would start both from the identical generator state.
  const rng = new Rng((seed * 2654435761 + 0x5bf03635) >>> 0);
  const visited = new Set<Phase>([run.world.phase]);
  let failure: FuzzResult['failure'] = null;
  let reentries = 0;
  let applied = 0;

  for (let i = 0; i < n; i++) {
    if (phaseOf(run.world) !== phase) {
      run = reenter(run, phase);
      reentries++;
      visited.add(run.world.phase);
      if (phaseOf(run.world) !== phase) {
        failure = { index: i, command: { k: 'call' }, problems: [`could not re-enter ${phase}`] };
        break;
      }
    }
    const w = run.world;
    const cmd = randomCommand(rng, w);
    let problems: string[];
    try {
      applyCommand(w, cmd);
      applied++;
      problems = scanWorld(w);
      if (i % stepEvery === stepEvery - 1) {
        run.step(emptyInput());
        problems.push(...scanWorld(w));
      }
    } catch (err) {
      problems = [`threw ${(err as Error)?.stack ?? String(err)}`];
    }
    visited.add(w.phase);
    if (problems.length > 0) {
      failure = { index: i, command: cmd, problems: problems.slice(0, 8) };
      break;
    }
  }

  return {
    phase,
    seed,
    commands: applied,
    visited: [...visited],
    reentries,
    failure,
    ms: Math.round(performance.now() - started),
  };
}

export interface FuzzRunResult {
  seed: number;
  practice: boolean;
  classKey: string;
  commands: number;
  ticks: number;
  outcome: string;
  endHash: string;
  visited: Phase[];
  problems: string[];
  ms: number;
}

/**
 * The deeper half: instead of poking a frozen world, play a whole run and post
 * random commands *through the tick pipeline* alongside a bot's own input, so
 * anything a command corrupts gets a full run's worth of updates to surface in.
 * The world is scanned every `scanEvery` ticks and the end report is scanned
 * field by field.
 *
 * Seeded end to end, so the same seed yields the same `endHash` — which is what
 * makes a fuzz failure a bug report rather than an anecdote.
 *
 * `practice` decides whether the `dev` commands do anything, and it is a real
 * choice rather than a flag to leave on. With it on, roughly a twelfth of the
 * commands are dev ops: `god` and `invuln` toggle the Warden's and the Core's
 * damage paths off, and `fast_forward` teleports through Act II, so the run
 * ends in a fraction of the ticks a played run takes and half of it never
 * exercises the damage, leech, second-wind or defeat code at all. With it off,
 * `applyDevCommand` returns immediately and the other eleven command kinds fuzz
 * a run that is actually played. The suite uses both.
 */
export function fuzzRun(
  seed: number,
  practice = false,
  classKey = 'engineer',
  cmdsPerTick = 0.5,
  scanEvery = 60,
): FuzzRunResult {
  const started = performance.now();
  const cfg: RunConfig = {
    seed,
    classKey,
    tier: 1,
    modifiers: [],
    allocated: [],
    relics: [],
    policy: 'hybrid',
    cycles: 3,
    practice,
  };
  const run = new Run(cfg);
  const policy = makePolicy('hybrid');
  const rng = new Rng((seed * 0x9e3779b1) >>> 0);
  const w = run.world;
  const visited = new Set<Phase>();
  const problems: string[] = [];
  let commands = 0;

  while (!run.done && w.tick < MAX_TICKS && problems.length === 0) {
    visited.add(w.phase);
    const input = policy.act(w);
    const extra = rng.float() < cmdsPerTick ? rng.intRange(1, 3) : 0;
    for (let i = 0; i < extra; i++) {
      input.cmds.push(randomCommand(rng, w));
      commands++;
    }
    // Warden input is part of the surface too, and it is quantized to -1|0|1.
    input.mx = rng.intRange(-1, 1);
    input.my = rng.intRange(-1, 1);
    input.dash = rng.chance(0.05);
    input.attack = rng.chance(0.4);
    try {
      run.step(input);
    } catch (err) {
      problems.push(`tick ${w.tick} threw ${(err as Error)?.stack ?? String(err)}`);
      break;
    }
    if (w.tick % scanEvery === 0) problems.push(...scanWorld(w));
  }
  visited.add(w.phase);

  let endHash = '';
  if (problems.length === 0) {
    try {
      const report = run.report();
      endHash = report.endHash;
      problems.push(...scanReport(report));
    } catch (err) {
      problems.push(`report() threw ${(err as Error)?.stack ?? String(err)}`);
    }
  }

  return {
    seed,
    practice,
    classKey,
    commands,
    ticks: w.tick,
    outcome: w.outcome,
    endHash,
    visited: [...visited],
    problems: problems.slice(0, 8),
    ms: Math.round(performance.now() - started),
  };
}

/** One-line description of a failure, for a test message or the CLI. */
export function describeFailure(r: FuzzResult): string {
  if (!r.failure) return `${r.phase}: clean`;
  return (
    `${r.phase} seed ${r.seed} command #${r.failure.index} ` +
    `${JSON.stringify(r.failure.command)}\n  ${r.failure.problems.join('\n  ')}`
  );
}

/* --------------------------------------------------------------------- CLI */

/** Exits 2 with a usage message. A fuzzer that reports `ok` for a run it never
 *  did is worse than one that crashes: a CI wrapper with a typo'd variable
 *  would read `ok   dusk  0 cmds` as a pass. */
function usage(message: string): never {
  console.error(`fuzz-input: ${message}`);
  console.error('usage: tsx tools/fuzz-input.ts [--n <positive int>] [--seed <int>] [--phase a,b]');
  console.error(`  phases: ${PHASES.join(', ')}`);
  process.exit(2);
}

function positiveInt(flag: string, raw: string | undefined): number {
  const v = Number(raw);
  if (raw === undefined || !Number.isInteger(v) || v <= 0) {
    usage(`${flag} needs a positive integer, got ${raw === undefined ? '(nothing)' : `"${raw}"`}`);
  }
  return v;
}

function main(): void {
  const argv = process.argv.slice(2);
  let n = 10000;
  let seed = 1;
  let phases = PHASES;
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i + 1];
    switch (argv[i]) {
      case '--n':
        n = positiveInt('--n', v);
        i++;
        break;
      case '--seed': {
        const s = Number(v);
        if (v === undefined || !Number.isInteger(s)) {
          usage(`--seed needs an integer, got ${v === undefined ? '(nothing)' : `"${v}"`}`);
        }
        seed = s;
        i++;
        break;
      }
      case '--phase': {
        phases = (v ?? '').split(',').filter(Boolean) as Phase[];
        if (phases.length === 0) usage('--phase needs at least one phase name');
        const unknown = phases.filter((p) => !PHASES.includes(p));
        if (unknown.length > 0) usage(`unknown phase(s): ${unknown.join(', ')}`);
        i++;
        break;
      }
      default:
        usage(`unknown argument "${argv[i]}"`);
    }
  }
  let failed = 0;
  for (const phase of phases) {
    const r = fuzzPhase(phase, seed, n);
    if (r.failure) {
      failed++;
      console.log(`FAIL ${describeFailure(r)}`);
    } else {
      console.log(
        `ok   ${phase.padEnd(11)} ${r.commands} cmds (${r.reentries} re-entries) in ${r.ms} ms  ` +
          `visited: ${r.visited.join(',')}`,
      );
    }
  }
  for (const practice of [false, true]) {
    for (const s of [seed, seed + 1, seed + 2]) {
      const r = fuzzRun(s, practice);
      const tag = `run seed ${s} practice=${practice ? 'on ' : 'off'}`;
      if (r.problems.length > 0) {
        failed++;
        console.log(`FAIL ${tag}\n  ${r.problems.join('\n  ')}`);
      } else {
        console.log(
          `ok   ${tag}  ${r.commands} cmds over ${r.ticks} ticks in ${r.ms} ms  ` +
            `${r.outcome} hash ${r.endHash.slice(0, 12)}`,
        );
      }
    }
  }
  process.exit(failed === 0 ? 0 : 1);
}

const entry = (process.argv[1] ?? '').replace(/\\/g, '/');
if (entry.endsWith('tools/fuzz-input.ts')) main();
