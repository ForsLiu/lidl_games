/**
 * Input fuzzer (QUALITY.md ALPHA: "10,000 random valid Commands per phase
 * produce no crash and no negative/NaN stat"; lane item q2).
 *
 * The sim's whole player surface is the Command union in `src/sim/types.ts`
 * (architecture rule 3: every player action, including class actives, is a
 * Command). So the fuzz surface is that union, driven at each of the five
 * `Phase` values, with arguments drawn from each field's legal domain — a real
 * client can send any of these at any time, including at a phase where they
 * mean nothing.
 *
 * Ported to the SPEC-FINAL sim at the quality-lane merge: the souls system,
 * the dusk/soulpick/dawn phases and the `souls`/`rekindle`/`dawn_done`
 * commands are gone (p3d); `upgrade_core` and `class_active2` are new, and
 * `TickInput` gained the continuous `active1Held` (p6b), fuzzed alongside
 * dash/attack.
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
import { openLevelUpIfPending, takeOffer } from '../src/sim/progression';
import { emptyInput, type Command, type DevOp, type Phase, type RunConfig } from '../src/sim/types';
import { makePolicy } from '../src/bots';
import '../src/bots';
import { scanReport, scanWorld } from './invariants';

// Re-exported for the existing callers (q2's suite, q7's data-fuzz probes):
// the scanner itself moved to `tools/invariants.ts` (lane item q11) so it has
// one definition instead of a second one any future soak would have to
// re-derive.
export { scanReport, scanWorld };

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

/**
 * The bot that reaches each phase, and how many cycles its run needs.
 * `cycles: 3` everywhere: with more than one block, Act II (the first VS
 * wave) begins after `tdWavesPerVsWave` TD waves instead of the whole
 * authored table, so every phase past Act I is reached in a fraction of the
 * single-cycle route's wall time — and `results` needs a run that actually
 * ends, which three blocks of hybrid play does inside MAX_TICKS.
 */
const ROUTE: Record<Phase, { policy: string; cycles: number; seed: number }> = {
  act1_build: { policy: 'hybrid', cycles: 3, seed: 1 },
  act1_wave: { policy: 'hybrid', cycles: 3, seed: 1 },
  act2: { policy: 'hybrid', cycles: 3, seed: 1 },
  // `levelup` opens from act2 the first time the Warden banks a level's XP;
  // hybrid kites and collects gems, so it reaches the picker on its own.
  levelup: { policy: 'hybrid', cycles: 3, seed: 1 },
  results: { policy: 'hybrid', cycles: 3, seed: 1 },
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
    // and a fuzzer that cannot reach `applyDevCommand` is not fuzzing a
    // whole member of the Command union.
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

  while (run.world.phase !== phase && run.world.tick < MAX_TICKS) {
    if (run.done) break;
    run.step(policy.act(run.world));
  }
  if (run.world.phase !== phase) throw new Error(`fuzz: never reached phase ${phase}`);
  return run;
}

/* ------------------------------------------------------------- generation */

/**
 * Every `k` in the `Command` union. Exported for the same reason `PHASES` is:
 * a 12th Command member that never appears here would be a member this file
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
  'upgrade_core',
  'call',
  'pick',
  'reroll',
  'set_autopick',
  'equip',
  'class_active',
  'class_active2',
  'dev',
] as const satisfies readonly Command['k'][];

/**
 * One structurally valid Command with every argument drawn from its legal
 * domain: real tower ids, in-grid tiles, offer indices inside the offer list,
 * aim points inside the grid. Malformed and out-of-domain arguments are the
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
    case 'upgrade_core':
      return { k: 'upgrade_core' };
    case 'call':
      return { k: 'call' };
    case 'pick':
      return { k: 'pick', index: rng.intRange(0, Math.max(0, w.offers.length - 1)) };
    case 'reroll':
      return { k: 'reroll' };
    case 'set_autopick':
      return { k: 'set_autopick', on: rng.chance(0.5) };
    case 'equip':
      return { k: 'equip', relic: rng.intRange(0, Math.max(0, w.relicsFound.length - 1)) };
    case 'class_active': {
      // Half aimed (the p6d mouse-aimed Active1s), half omitted — an omitted
      // aim is the documented "self-centered" default and both are legal.
      if (rng.chance(0.5)) {
        return { k: 'class_active', aimX: rng.range(0, GRID_W), aimY: rng.range(0, GRID_H) };
      }
      return { k: 'class_active' };
    }
    case 'class_active2': {
      if (rng.chance(0.5)) {
        return { k: 'class_active2', aimX: rng.range(0, GRID_W), aimY: rng.range(0, GRID_H) };
      }
      return { k: 'class_active2' };
    }
    case 'dev':
      return { k: 'dev', op: rng.pick(DEV_OPS), amount: rng.intRange(0, 5000) };
  }
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
    if (phase === 'levelup' && phaseOf(w) === 'act2') {
      w.pendingLevelUps++;
      openLevelUpIfPending(w);
      if (phaseOf(w) === phase) return run;
    } else if (phase === 'act2' && phaseOf(w) === 'levelup') {
      // The only way out of `levelup` is taking an offer, which is what a
      // player does. It has to be drained rather than done once: `takeOffer`
      // ends with `openLevelUpIfPending`, so with level-ups queued it hands
      // straight back to `levelup`. Without this, act2 pays a full run rebuild
      // per picker. (`takeOffer` returns false on an *empty* offer list — a
      // maxed-out boon pool rolls zero offers — and that leaves `levelup`
      // unexitable through the sim's own doors, so the loop breaks to the
      // rebuild below.)
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
 * Commands that end the phase (`pick` ends `levelup`) are part of the surface
 * and are fired, but they must not end the fuzz: a levelup pass that just let
 * the world drift would spend a handful of commands in the phase it named and
 * the rest somewhere else. So only in-phase commands count toward `n`, and the
 * phase is re-entered when one leaves it.
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
 * choice rather than a flag to leave on. With it on, roughly an eleventh of
 * the commands are dev ops: `god` and `invuln` toggle the Warden's and the
 * Core's damage paths off, and `fast_forward` teleports through Act II, so the
 * run ends in a fraction of the ticks a played run takes and half of it never
 * exercises the damage, leech, second-wind or defeat code at all. With it off,
 * `applyDevCommand` returns immediately and the other ten command kinds fuzz
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
    // The p6b continuous input: a charge-kind Active1 held across ticks.
    // Fuzzed like dash/attack, at a hold-shaped rate so `tickClassCharge`
    // sees real multi-tick holds and real releases, not single-tick blips.
    input.active1Held = rng.chance(0.3);
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
 *  would read `ok   act2  0 cmds` as a pass. */
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
