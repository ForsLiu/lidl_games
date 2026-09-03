/** Shared test utilities. Keep these deterministic — no Math.random, no Date. */

import { Run } from '../src/sim/run';
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
