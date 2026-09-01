/** Shared test utilities. Keep these deterministic — no Math.random, no Date. */

import { Run } from '../src/sim/run';
import { Rng } from '../src/sim/rng';
import { emptyInput, type Command, type RunConfig, type RunReport, type TickInput } from '../src/sim/types';
import { makePolicy } from '../src/bots';
import '../src/bots';

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
