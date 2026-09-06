/** Shared test utilities. Keep these deterministic — no Math.random, no Date. */

import { Run } from '../src/sim/run';
import { loadContent } from '../src/sim/content';
import { Rng } from '../src/sim/rng';
import { emptyInput, type Command, type RunConfig, type RunReport, type TickInput } from '../src/sim/types';
import { makePolicy } from '../src/bots';
import '../src/bots';
import { coreCenter } from '../src/sim/grid';
import type { World } from '../src/sim/world';

export function cfg(over: Partial<RunConfig> = {}): RunConfig {
  return {
    seed: 1,
    classKey: 'engineer',
    tier: 1,
    modifiers: [],
    allocated: [],
    policy: 'none',
    // Most of the suite predates SPEC-V2's 3-cycle run and measures a single
    // Day/Dusk/Night pass; pass `cycles: 3` explicitly to test the cycle machine.
    cycles: 1,
    ...over,
  };
}

/** A reproducible pseudo-input log: movement noise plus the odd dash/attack. */
export function makeInputLog(seed: number, ticks: number): TickInput[] {
  const rng = new Rng(seed >>> 0);
  const log: TickInput[] = [];
  let mx = 0;
  let my = 0;
  for (let t = 0; t < ticks; t++) {
    if (t % 17 === 0) {
      mx = rng.intRange(-1, 1);
      my = rng.intRange(-1, 1);
    }
    const cmds: Command[] = [];
    if (t % 601 === 600) cmds.push({ k: 'call' });
    log.push({
      mx,
      my,
      dash: t % 211 === 0,
      attack: rng.float() < 0.4,
      aimX: 0,
      aimY: 0,
      active1Held: false,
      cmds,
    });
  }
  return log;
}

export function replay(config: RunConfig, log: TickInput[], maxTicks = log.length): RunReport {
  const run = new Run(config);
  for (let t = 0; t < maxTicks && !run.done; t++) {
    run.step(log[t] ?? emptyInput());
  }
  return run.report();
}

export function runWithPolicy(
  config: RunConfig,
  policyName: string,
  maxTicks = 60 * 60 * 45,
): { report: RunReport; run: Run } {
  const runCfg = { ...config, policy: policyName };
  const run = new Run(runCfg);
  // b039: `World`'s constructor stamps the content hash onto whatever config
  // object it was actually given, which here is `runCfg` — a spread copy, not
  // the caller's `config`. Unlike `replay()` (which passes its config
  // straight through and so gets this for free), that stamp needs forwarding
  // by hand or the caller's config never becomes a valid `RecordedRun.config`.
  config.contentHash = runCfg.contentHash;
  const policy = makePolicy(policyName);
  while (!run.done && run.world.tick < maxTicks) {
    run.step(policy.act(run.world));
  }
  return { report: run.report(), run };
}

const CHARGE_KINDS = new Set(['charge_nova', 'charge_pierce']);
/** Structure-targeting kinds (Field Kit, Blood Tithe, Death Pact) default an omitted aim to the Warden's own tile, not the enemy's — see `tests/p6e-class-diversity.test.ts`'s header for why an aim override is skipped for these. */
const STRUCTURE_TARGET_KINDS = new Set(['repair_heal', 'blood_tithe', 'death_pact']);

function aimPoint(w: World): { x: number; y: number } {
  const wd = w.warden;
  const t = w.nearestEnemy(wd.x, wd.y, 40);
  if (t) return { x: t.x, y: t.y };
  const c = coreCenter();
  return { x: c.x, y: c.y };
}

/**
 * Fires a class's kit onto a stock policy's own `TickInput` — the same
 * "scripted kit bot" shape G8/G23 already use (`tests/p6e-class-diversity.
 * test.ts`'s `scriptClassKit`, reused verbatim here per BACKLOG p10s so
 * G1/G14 can measure under the identical "real player" shape instead of the
 * stock `hybrid` bot, which never fires a class Active on its own).
 */
export function scriptClassKit(w: World, input: TickInput): void {
  const cls = w.content.classByKey.get(w.cfg.classKey);
  if (!cls) return;
  const wd = w.warden;
  const aim = aimPoint(w);

  if (CHARGE_KINDS.has(cls.active1.kind)) {
    const cap = cls.active1.chargeCapSeconds ?? 3;
    const holdWindow = Math.min(cap, 2);
    input.active1Held = wd.active1Charging ? wd.active1Charge < holdWindow : wd.active1Cooldown <= 0;
    input.aimX = aim.x;
    input.aimY = aim.y;
  } else if (wd.active1Cooldown <= 0) {
    input.cmds.push(
      STRUCTURE_TARGET_KINDS.has(cls.active1.kind)
        ? { k: 'class_active' }
        : { k: 'class_active', aimX: aim.x, aimY: aim.y },
    );
  }

  const judgementReady = cls.active2.kind !== 'judgement' || (wd.clarionRemaining <= 0 && wd.wrathStored > 0);
  if (wd.active2Cooldown <= 0 && judgementReady) {
    input.cmds.push(
      STRUCTURE_TARGET_KINDS.has(cls.active2.kind)
        ? { k: 'class_active2' }
        : { k: 'class_active2', aimX: aim.x, aimY: aim.y },
    );
  }
}

/** Buys every Core upgrade step going, parking the Warden on the Core's tile to guarantee range — same injection G23's `runCoreScripted` (`tests/p-core-f-gates.test.ts`) already uses, reused verbatim per BACKLOG p10s. */
export function buyCoreUpgrades(w: World, input: TickInput): void {
  const stepCount = w.content.coreByKey.get(w.coreKey)?.upgrade.count ?? 0;
  if ((w.phase === 'act1_build' || w.phase === 'act1_wave') && w.coreStep < stepCount) {
    const center = coreCenter();
    w.warden.x = center.x;
    w.warden.y = center.y;
    input.cmds.push({ k: 'upgrade_core' });
  }
}

/**
 * `runWithPolicy`, but layers `scriptClassKit`/`buyCoreUpgrades` onto every
 * tick — the "scripted kit bot" shape BACKLOG p10s gives G1/G14 so a shared
 * T1 difficulty lever moves all four gates (G1/G8/G14/G23) proportionally
 * instead of G1/G14's un-scripted `hybrid` breaking first.
 *
 * `maxTicks` defaults to G23's 120-simulated-minute headroom
 * (`tests/p-core-f-gates.test.ts`'s own measured-slowest-resolution
 * rationale), wider than `runWithPolicy`'s 45-minute default — a scripted
 * kit bot can run long via Core-upgrade purchases eating build-phase time,
 * so callers that need a tighter window (e.g. G1's own 45-minute cap) pass
 * it explicitly, as `tests/p10d-run-length.test.ts` does.
 */
/**
 * BACKLOG p12b (BALANCE DIRECTION v2 §B): the tier the four reference gates —
 * G1 (run length), G8 (class win rate + diversity), G14 (boss band) and G23
 * (Core win rate) — are measured at.
 *
 * It was T1 for every gate in the repo's history, at a time when `cfg.tier`
 * scaled almost nothing directly, so T1 vs T5 was a difference in *drafted
 * modifiers* (random draws) rather than a rung. §B authors a real ladder
 * (`tierEnemyHpMul`/`tierBudgetMul`/`tierCoreDamageMul`, `src/sim/tiers.ts`)
 * and moves the reference to **T3**, the middle rung, so the gates measure a
 * contested run rather than one the scripted bot wins 100% of the time.
 *
 * Named here rather than written as a literal `3` in four files so the move is
 * one logged config change — §B's own "a real, logged config change, not a
 * silent rename" — and so a future re-point is one edit.
 *
 * **The recorded numbers in those four suites' headers are T1 history.** p12d
 * owns rewriting the gate text and bands against T3; until it lands, read any
 * pre-2026-09-05 figure in them as "measured at T1".
 */
export const GATE_TIER = 3;

export function runScripted(
  config: RunConfig,
  policyName: string,
  maxTicks = 60 * 60 * 120,
): { report: RunReport; run: Run } {
  const runCfg = { ...config, policy: policyName };
  const run = new Run(runCfg);
  config.contentHash = runCfg.contentHash;
  const policy = makePolicy(policyName);
  const w = run.world;
  while (!run.done && w.tick < maxTicks) {
    const input = policy.act(w);
    if (w.phase === 'act1_build' || w.phase === 'act1_wave' || w.phase === 'act2') {
      scriptClassKit(w, input);
    }
    buyCoreUpgrades(w, input);
    run.step(input);
  }
  return { report: run.report(), run };
}

/**
 * p11c (BACKLOG, `p10z`'s own untried candidate direction (b)): a
 * miss-chance-scaled *imperfect* stand-in for `scriptClassKit`/
 * `buyCoreUpgrades`, used to test whether G8/G23's near-universal
 * `landslide-win` shape (Q158/Q159/Q160/Q161) is an artifact of the harness
 * playing every kit/Core-purchase decision perfectly on-cooldown with a
 * perfect aim, rather than of `/data` itself.
 *
 * A miss is modelled as a **reaction delay**, not a per-tick coin-flip: the
 * first version of this harness rolled `rng.chance(missChance)` fresh every
 * tick a decision stayed ready, which a code-reviewer pass on p11c's own
 * diff caught as neutering itself — a ready condition (a cooldown at 0, an
 * affordable Core step) does not clear itself on a miss, so at 60 ticks/sec
 * the *expected* delay before a "miss" finally lets a retry through is
 * `1/(1-missChance)` ticks — under 0.2s even at `missChance=0.9`, nothing an
 * outcome measured in minutes could ever see. `reactionReady` fixes this: it
 * rolls **once** per readiness window (the tick a decision *becomes* ready),
 * deciding then whether this window fires immediately or only after a
 * `REACTION_DELAY_TICKS`-range hold — a real, human-scale "noticed it late"
 * delay — and does not re-roll again until it either fires or the window
 * goes not-ready. Note the two aren't quite the same thing for the
 * Core-purchase caller: `buyCoreUpgradesImperfect` folds affordability into
 * its own `nowReady` specifically so "fire" and "the purchase actually
 * succeeds" stay the same event — otherwise an unaffordable step would close
 * a window on a no-op and immediately open a fresh one next tick, each with
 * its own independent (and possibly zero) delay, quietly compressing the
 * one-roll-per-window guarantee during a "waiting on gold" stretch.
 * `ImperfectState` carries that per-decision bookkeeping across
 * ticks; a fresh one is created per run by `runScriptedImperfect` so nothing
 * bleeds between sweep iterations. A fired Active's aim is jittered rather
 * than locked onto the nearest enemy/Warden tile — both draws come from
 * `rng`, a stream private to the call site (seeded from the run's own seed
 * by the caller) so a sweep stays reproducible without touching the sim's
 * own RNG streams (architecture rule 2).
 */
function jitterAim(aim: { x: number; y: number }, rng: Rng): { x: number; y: number } {
  const angle = rng.range(0, Math.PI * 2);
  const radius = rng.range(0, 4);
  return { x: aim.x + Math.cos(angle) * radius, y: aim.y + Math.sin(angle) * radius };
}

export interface ImperfectState {
  active1ReadySince: number | null;
  active1Delay: number;
  /** Rolled once per charge-hold (charge kinds release early instead of at the optimal `holdWindow`). */
  active1HoldTarget: number | null;
  active2ReadySince: number | null;
  active2Delay: number;
  coreReadySince: number | null;
  coreDelay: number;
}

export function newImperfectState(): ImperfectState {
  return {
    active1ReadySince: null,
    active1Delay: 0,
    active1HoldTarget: null,
    active2ReadySince: null,
    active2Delay: 0,
    coreReadySince: null,
    coreDelay: 0,
  };
}

type ReadySinceKey = 'active1ReadySince' | 'active2ReadySince' | 'coreReadySince';
type DelayKey = 'active1Delay' | 'active2Delay' | 'coreDelay';

/** 1-5s at 60Hz: the range a missed window's reaction delay is drawn from. */
const REACTION_DELAY_TICKS: readonly [number, number] = [60, 300];

/**
 * Rolls (once per readiness window) and tracks whether *this* tick is the
 * tick a decision should actually act. See this section's header comment for
 * why a window-scoped roll, not a per-tick one, is what "a miss" has to mean
 * for `missChance` to do anything observable.
 */
function reactionReady(
  w: World,
  rng: Rng,
  missChance: number,
  state: ImperfectState,
  sinceKey: ReadySinceKey,
  delayKey: DelayKey,
  nowReady: boolean,
): boolean {
  if (!nowReady) {
    state[sinceKey] = null;
    return false;
  }
  if (state[sinceKey] === null) {
    state[sinceKey] = w.tick;
    state[delayKey] = rng.chance(missChance) ? rng.intRange(...REACTION_DELAY_TICKS) : 0;
  }
  const fire = w.tick - (state[sinceKey] as number) >= state[delayKey];
  if (fire) state[sinceKey] = null;
  return fire;
}

export function scriptClassKitImperfect(
  w: World,
  input: TickInput,
  rng: Rng,
  missChance: number,
  state: ImperfectState,
): void {
  const cls = w.content.classByKey.get(w.cfg.classKey);
  if (!cls) return;
  const wd = w.warden;
  const aim = jitterAim(aimPoint(w), rng);

  if (CHARGE_KINDS.has(cls.active1.kind)) {
    const cap = cls.active1.chargeCapSeconds ?? 3;
    const holdWindow = Math.min(cap, 2);
    if (wd.active1Charging) {
      if (state.active1HoldTarget === null) {
        state.active1HoldTarget = rng.chance(missChance) ? rng.range(0, holdWindow) : holdWindow;
      }
      input.active1Held = wd.active1Charge < state.active1HoldTarget;
    } else {
      state.active1HoldTarget = null;
      input.active1Held = reactionReady(
        w,
        rng,
        missChance,
        state,
        'active1ReadySince',
        'active1Delay',
        wd.active1Cooldown <= 0,
      );
    }
    input.aimX = aim.x;
    input.aimY = aim.y;
  } else if (
    reactionReady(w, rng, missChance, state, 'active1ReadySince', 'active1Delay', wd.active1Cooldown <= 0)
  ) {
    input.cmds.push(
      STRUCTURE_TARGET_KINDS.has(cls.active1.kind)
        ? { k: 'class_active' }
        : { k: 'class_active', aimX: aim.x, aimY: aim.y },
    );
  }

  const judgementReady = cls.active2.kind !== 'judgement' || (wd.clarionRemaining <= 0 && wd.wrathStored > 0);
  if (
    reactionReady(
      w,
      rng,
      missChance,
      state,
      'active2ReadySince',
      'active2Delay',
      wd.active2Cooldown <= 0 && judgementReady,
    )
  ) {
    input.cmds.push(
      STRUCTURE_TARGET_KINDS.has(cls.active2.kind)
        ? { k: 'class_active2' }
        : { k: 'class_active2', aimX: aim.x, aimY: aim.y },
    );
  }
}

export function buyCoreUpgradesImperfect(
  w: World,
  input: TickInput,
  rng: Rng,
  missChance: number,
  state: ImperfectState,
): void {
  const def = w.content.coreByKey.get(w.coreKey);
  const stepCount = def?.upgrade.count ?? 0;
  // Affordability is folded into readiness (not just phase/step-count) so a
  // window doesn't close on a `reactionReady` "fire" that `upgradeCore` then
  // silently no-ops for being unaffordable — code-reviewer's p11c finding:
  // without this, an unaffordable step reopens a fresh window every tick,
  // and each has its own `1-missChance` chance of an immediate zero-delay
  // refire, quietly compressing the intended one-roll-per-window guarantee.
  const nowReady =
    (w.phase === 'act1_build' || w.phase === 'act1_wave') &&
    w.coreStep < stepCount &&
    w.gold >= (def?.upgrade.stepCost ?? Infinity);
  if (reactionReady(w, rng, missChance, state, 'coreReadySince', 'coreDelay', nowReady)) {
    const center = coreCenter();
    w.warden.x = center.x;
    w.warden.y = center.y;
    input.cmds.push({ k: 'upgrade_core' });
  }
}

/**
 * `runScripted`, but with the kit/Core-purchase decisions run through
 * `scriptClassKitImperfect`/`buyCoreUpgradesImperfect` instead of their
 * perfect-play originals — see the doc comment above them for why (p11c).
 * `missChance` 0 degenerates to `runScripted`'s own behaviour modulo the aim
 * jitter, which is intentionally always-on (a perfectly-timed but
 * perfectly-aimed bot is still not "imperfect play").
 */
export function runScriptedImperfect(
  config: RunConfig,
  policyName: string,
  maxTicks = 60 * 60 * 120,
  missChance = 0.35,
): { report: RunReport; run: Run } {
  const runCfg = { ...config, policy: policyName };
  const run = new Run(runCfg);
  config.contentHash = runCfg.contentHash;
  const policy = makePolicy(policyName);
  const rng = new Rng((config.seed >>> 0) ^ 0x9e3779b9);
  const state = newImperfectState();
  const w = run.world;
  while (!run.done && w.tick < maxTicks) {
    const input = policy.act(w);
    if (w.phase === 'act1_build' || w.phase === 'act1_wave' || w.phase === 'act2') {
      scriptClassKitImperfect(w, input, rng, missChance, state);
    }
    buyCoreUpgradesImperfect(w, input, rng, missChance, state);
    run.step(input);
  }
  return { report: run.report(), run };
}

/**
 * p10z (BACKLOG, QUESTIONS Q158/Q159): classifies one already-finished
 * `RunReport` by *margin*, not just win/loss. `p10r`/`p10s`/`p10t` spent
 * ~11 real `/data`-only probes across G1/G8/G14/G23 and found the roster's
 * outcomes are close to bimodal under `TREE_AUTO_MAX` — a run either wins by
 * an overwhelming margin (the full-tree build overwhelms the T1 board
 * regardless of the axis tried) or loses for a reason structurally unrelated
 * to whichever shared lever is being tuned (an early one-off alpha strike
 * well before the wave-11-to-17 wall those items independently pinned as the
 * roster's real contested band, or a tick-cap stalemate). A probe that only
 * reads `report.outcome` cannot tell "this lever nudged the real fight" from
 * "this lever pushed some unrelated early-death seeds into timeouts and left
 * the landslide wins fully unmoved" (exactly what happened to `p10t`'s
 * `hpScalePerMinute` probe, Q159(1)) — that is the missing signal this
 * function gives a probe.
 *
 * The two thresholds below are read from the roster's own already-measured
 * shape, not invented: `CONTESTED_WAVE_FLOOR` sits just under the wave-11
 * start of the wall `p10r`'s G8/G23 write-ups and this repo's `a4-single-
 * type.test.ts` all independently name; `LANDSLIDE_HP_FRAC` treats a `victory`
 * that still has at least half the Core's HP bar left as a win the lever
 * never seriously contested, versus one that scraped through near 0.
 */
export type SeedMargin =
  /** `victory`, Core HP still at/above `LANDSLIDE_HP_FRAC` — the lever never seriously contested this seed. */
  | 'landslide-win'
  /** `victory`, Core HP scraped through under `LANDSLIDE_HP_FRAC` — a real, close contest. */
  | 'close-win'
  /** `defeat_core`/`defeat_warden` at or past `CONTESTED_WAVE_FLOOR` — a loss inside the roster's own contested band, the kind of seed a shared lever should be judged against. */
  | 'contested-loss'
  /** `defeat_core`/`defeat_warden` before `CONTESTED_WAVE_FLOOR` — an early one-off (e.g. an alpha strike) unrelated to the lever under test. */
  | 'early-loss'
  /** Hit the tick cap without resolving — neither a win nor a real loss. */
  | 'timeout';

/** TD wave just under the wave-11-to-17 wall `p10r`/G23/G8's own write-ups pinned (BACKLOG p10r, this file's own header history). */
const CONTESTED_WAVE_FLOOR = 10;
/** A `victory` at or above half the Core's max HP reads as untouched by whatever lever is under test. */
const LANDSLIDE_HP_FRAC = 0.5;

export function classifyMargin(report: RunReport): { kind: SeedMargin; coreHpFrac: number } {
  const coreHpFrac = report.coreMaxHp > 0 ? report.coreHp / report.coreMaxHp : 0;
  if (report.outcome === 'running') return { kind: 'timeout', coreHpFrac };
  if (report.outcome === 'victory') {
    return { kind: coreHpFrac >= LANDSLIDE_HP_FRAC ? 'landslide-win' : 'close-win', coreHpFrac };
  }
  return { kind: report.wavesCleared >= CONTESTED_WAVE_FLOOR ? 'contested-loss' : 'early-loss', coreHpFrac };
}

/** One-line margin-classification summary over a batch of reports, e.g. `"landslide-win:9 contested-loss:2 early-loss:1"` — the shape a probe's failure message quotes so a retune pass can see *why* the roster's win rate sits where it does, not just the rate itself. */
export function summarizeMargins(reports: RunReport[]): string {
  const counts: Record<SeedMargin, number> = {
    'landslide-win': 0,
    'close-win': 0,
    'contested-loss': 0,
    'early-loss': 0,
    timeout: 0,
  };
  for (const r of reports) counts[classifyMargin(r).kind]++;
  return (Object.entries(counts) as [SeedMargin, number][])
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k}:${n}`)
    .join(' ');
}

/**
 * fb153a: `data/modifiers.json`'s `numberScale` divides every HP- and
 * damage-denominated number in `/data` at load, so the sim runs on
 * `authored x numberScale()`. Specs, owner orders and this suite's own
 * expectations are written in **authored** units, so a test that asserts a
 * magnitude wraps it in `scaled()` rather than restating it in display units —
 * which is what keeps the factor a ⚖ tunable instead of a suite-wide rewrite
 * every time it moves.
 *
 * Ratios, durations, radii, speeds, armor points and gold are on other axes and
 * are never wrapped. `STAT_SCALED` (src/sim/statkeys.ts) is the same question
 * for `/data`-authored stat records.
 */
let cachedScale: number | undefined;

/**
 * Read **lazily**, never at module scope: `tools/perf-ratio.ts` imports `cfg`
 * from this file, and a top-level `loadContent()` here would throw its
 * ZodError at import time — before that tool's own try/catch — turning its
 * one-line "/data is broken" message into a raw stack dump (caught by
 * `tests/q45-cli-schema-violation.test.ts`).
 */
export function numberScale(): number {
  return (cachedScale ??= loadContent().modifiers.numberScale);
}

/** An authored HP/damage magnitude, in the units the sim actually runs on. */
export function scaled(authored: number): number {
  return authored * numberScale();
}
