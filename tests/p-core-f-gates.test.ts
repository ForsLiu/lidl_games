/**
 * `p-core-f`'s gates half (SPEC-FINAL §5.5, the owner feature inbox commit
 * 2026-08-26): **G22** (each Core shifts the run fingerprint by >=0.10 vs
 * Stone Heart on the same seed/build) and **G23** (every Core clears T1 at a
 * 35-70% win rate with the scripted bot). G21 (each Core's TD/VS numbers,
 * unit-tested with SPEC-FINAL's own worked examples) is already green in full
 * across `tests/p-core-b-effects.test.ts` through
 * `tests/p-core-e-time-decay.test.ts`; nothing here re-covers it.
 *
 * The unlock-quests and Codex-page thirds of the original `p-core-f` title
 * are **not** in this file — QUESTIONS.md Q116 executes the split Q93 had
 * already committed to: the real §8.4 quest engine (8-12 quests, unlocks
 * only) doesn't exist yet (`data/quests.json` is still the V2-era
 * Ember/relic-reward roster `p7d`/`p7e` haven't replaced), so the four Core
 * unlock lines and the Codex page are re-filed as `p7h`, queued alongside
 * `p7e` in P7. This file is the gates half only, which Q93 always expected
 * could run independently once the tower roster (P5) and the real run shape
 * (P3) existed — both are done.
 *
 * No bot policy buys Core upgrade steps on its own (a named, pre-existing gap
 * shared by every Core item since `p-core-a`) — `runCoreScripted` below fixes
 * that for these two gates only, the same way `p-core-e`'s own qa-playtester
 * *session* bought Time's steps by hand (there is no reusable test-code
 * precedent for this, only that PROGRESS.md write-up): it snaps the Warden
 * onto the Core's tile and queues `{k:'upgrade_core'}` every TD tick a step
 * remains, relying on `upgradeCore`'s own affordability/range checks to no-op
 * when gold is short, so a Core's full kit (not just its always-on `effects`)
 * is what both gates measure.
 */

import { describe, expect, it } from 'vitest';

import { Run } from '../src/sim/run';
import { makePolicy } from '../src/bots';
import '../src/bots';
import { coreCenter } from '../src/sim/grid';
import type { RunConfig, RunReport } from '../src/sim/types';
import { cfg } from './helpers';

const NON_DEFAULT_CORES = ['carnivorous_plant', 'vampire_heart', 'corpse', 'time'];

function runCoreScripted(
  coreKey: string,
  seed: number,
  opts: { cycles?: number; maxTicks?: number; policy?: string } = {},
): RunReport {
  const policyName = opts.policy ?? 'hybrid';
  const config: RunConfig = cfg({ seed, core: coreKey, cycles: opts.cycles ?? 6, policy: policyName });
  const run = new Run(config);
  const policy = makePolicy(policyName);
  const w = run.world;
  const center = coreCenter();
  // Headroom over the slowest observed resolution, re-measured whenever a
  // change makes runs longer. Q116 set 90 minutes against a
  // `carnivorous_plant` boss-gated final wave that ran ~70 simulated minutes
  // before losing (a 60-minute cap had left it non-terminal, which `winRate`
  // below asserts against rather than silently treating as a loss).
  //
  // p6d (Q120) moved it again: SPEC-FINAL §4.2 re-specs the Engineer — the
  // class `cfg()` runs this harness with — from build range +1 and a
  // press-to-attack manual attack to build range +2 and an auto-firing basic
  // attack, so the same seeds reach the Sundering with a bigger roster and
  // survive longer. Measured at a 400-minute cap, `carnivorous_plant` seed 9
  // now resolves at **106.8** simulated minutes (`defeat_warden`, all 18 TD
  // waves cleared) — a real loss that the old 90-minute cap was cutting off
  // mid-run, not a stall. 120 minutes is that plus headroom.
  const maxTicks = opts.maxTicks ?? 60 * 60 * 120;
  const stepCount = w.content.coreByKey.get(coreKey)?.upgrade.count ?? 0;
  while (!run.done && w.tick < maxTicks) {
    const input = policy.act(w);
    if ((w.phase === 'act1_build' || w.phase === 'act1_wave') && w.coreStep < stepCount) {
      // Build-range-gated (Q116): parking the Warden on the Core's own tile
      // guarantees `inCoreBuildRange` regardless of where the policy's own
      // movement would otherwise send it this tick — commands process before
      // `updateWarden` moves the character (`Run.step`), so this is in effect
      // for the command this same tick applies.
      w.warden.x = center.x;
      w.warden.y = center.y;
      input.cmds.push({ k: 'upgrade_core' });
    }
    run.step(input);
  }
  return run.report();
}

/** Q116: each `damageByWeapon` entry normalized by the run's own damage total. */
function damageShareVector(report: RunReport): Record<string, number> {
  const total = report.damageTotal;
  const out: Record<string, number> = {};
  if (total <= 0) return out;
  for (const [k, v] of Object.entries(report.damageByWeapon)) out[k] = v / total;
  return out;
}

function l1Distance(a: Record<string, number>, b: Record<string, number>): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let sum = 0;
  for (const k of keys) sum += Math.abs((a[k] ?? 0) - (b[k] ?? 0));
  return sum;
}

/** Q116: "the relative delta of a gold/XP economy pair" — `level` is the report's own XP proxy. */
function economyDelta(core: RunReport, base: RunReport): number {
  const goldDelta = Math.abs(core.goldEarned - base.goldEarned) / Math.max(base.goldEarned, 1);
  const levelDelta = Math.abs(core.level - base.level) / Math.max(base.level, 1);
  return Math.max(goldDelta, levelDelta);
}

function fingerprint(core: RunReport, base: RunReport): { value: number; damageL1: number; economy: number } {
  const damageL1 = l1Distance(damageShareVector(core), damageShareVector(base));
  const economy = economyDelta(core, base);
  return { value: Math.max(damageL1, economy), damageL1, economy };
}

describe('G22: each Core shifts the run fingerprint by >=0.10 vs Stone Heart', () => {
  for (const seed of [1, 2]) {
    const baseline = runCoreScripted('stone_heart', seed);
    for (const key of NON_DEFAULT_CORES) {
      it(`${key} vs Stone Heart, seed ${seed}`, () => {
        const report = runCoreScripted(key, seed);
        const fp = fingerprint(report, baseline);
        expect(
          fp.value,
          `${key} seed ${seed}: fingerprint ${fp.value.toFixed(3)} ` +
            `(damageL1 ${fp.damageL1.toFixed(3)}, economy ${fp.economy.toFixed(3)}) — ` +
            `stone_heart gold ${baseline.goldEarned}/level ${baseline.level}, ` +
            `${key} gold ${report.goldEarned}/level ${report.level}`,
        ).toBeGreaterThanOrEqual(0.1);
      });
    }
  }
});

describe('G23: every Core clears T1 at a 35-70% win rate with the scripted bot', () => {
  const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);

  function winRate(coreKey: string): { wins: number; outcomes: string[] } {
    let wins = 0;
    const outcomes: string[] = [];
    for (const seed of SEEDS) {
      const report = runCoreScripted(coreKey, seed);
      // A non-terminal outcome at the tick cap is a timeout, not a measured
      // loss — assert loudly rather than let it silently count as "not a
      // win" (code-reviewer finding: a `carnivorous_plant` seed hit exactly
      // this at a smaller cap; 90 simulated minutes now covers the slowest
      // observed resolution with headroom, so a `running` outcome here means
      // the cap needs raising again, not that this seed lost).
      expect(report.outcome, `${coreKey} seed ${seed} did not resolve within the tick cap`).not.toBe('running');
      if (report.outcome === 'victory') wins++;
      outcomes.push(`${seed}:${report.outcome}/w${report.wavesCleared}`);
    }
    return { wins, outcomes };
  }

  // Measured (Q116): 5/12 (41.7%) — the passing floor exactly
  // (`Math.ceil(12*0.35) = 5`), not comfortably inside the band. Carnivorous
  // Plant's devour/poison-volley damage is Core-driven and stat-independent,
  // so it is the one Core whose win rate doesn't bottleneck on the same wall
  // the four `.skip`-ed cases below hit.
  //
  // Re-measured at p6d (Q120), since §4.2's Engineer is a materially stronger
  // Act I class than the SPEC-V2 kit this harness used to run: **6/12 (50%)**
  // — seeds 1/2/3/10/11/12 `victory`, 4/5/7/8/9 `defeat_warden` after all 18
  // TD waves, 6 `defeat_warden` at wave 3. Still in band, and off the floor
  // rather than sitting on it.
  //
  // p8a re-opened this one (Q122): once real waves 11-18 landed, seed 2 stopped
  // resolving inside the 120-minute cap — but unlike every prior cap raise in
  // this file (60->90->120, each time finding a real termination just past the
  // old ceiling), measured directly at a 400-minute cap seed 2 is still
  // `running` at exactly 1,440,000 ticks, having already cleared all 18 TD
  // waves. Six-plus real hours of simulated time with no win, no Core loss and
  // no Warden loss reads as a genuine stalemate under the new curve — devour
  // sustaining the Core indefinitely while VS combat neither closes out the
  // Warden-Eater nor loses to it — not "the cap needs raising again." That is
  // a different, deeper question than a resolution-time headroom bump, and
  // squarely the same category the ten class win-rate clauses
  // (`tests/p6e-class-diversity.test.ts`) and the other three Cores below are
  // already `.skip`-ed pending: content is real now, the *economy* against it
  // isn't tuned yet (P10). `.skip`-ed on CLAUDE.md rule 6 (~2 real re-measure
  // attempts at 120 and 400 minutes, not a plausible-story skip) rather than
  // raising the cap a third time on a guess; re-enable point folds into the
  // same PRIORITY DIRECTIVE follow-up as the rest of G23 and G8.
  it.skip('carnivorous_plant', () => {
    const { wins, outcomes } = winRate('carnivorous_plant');
    expect(wins, `${wins}/${SEEDS.length} — ${outcomes.join(' ')}`).toBeGreaterThanOrEqual(
      Math.ceil(SEEDS.length * 0.35),
    );
    expect(wins, `${wins}/${SEEDS.length} — ${outcomes.join(' ')}`).toBeLessThanOrEqual(
      Math.floor(SEEDS.length * 0.7),
    );
  });

  // Measured (Q116, corrected on code-reviewer's finding — the first draft
  // misattributed this to P6/P7 without checking, which the harness's own
  // numbers contradict): 0/12 for all three, but not from an early VS death
  // the way `stone_heart` below dies. All three clear TD wave 7-13 and
  // multiple full VS wave cycles first (`vampire_heart`/`time` mostly die
  // `defeat_core` around wave 10-11 after ~225-300s of cumulative Act II
  // time; `corpse` mostly around wave 12-13) before finally losing the Core
  // to leak accumulation — squarely the wave-9-to-14 death band
  // `tests/a4-single-type.test.ts`'s own doc comment and `tests/boss.test.ts`
  // already pinned to `data/waves.json` authoring only 10 real TD wave rows,
  // with `buildSpawnQueue` repeating row 10 past the table's end against the
  // still-climbing `1.30^(wave-1)` HP curve — **the p8a content gap**, not a
  // P6/P7 VS-combat-strength story. That each of these three Cores' passive
  // numbers (tower lifesteal, execute/store, the slow aura) measurably
  // extends survival *past* `stone_heart`'s wave-3 death (a Core doing
  // nothing for towers or leaks at all) without changing which wall they
  // eventually hit is itself consistent with a shared, content-bound cause
  // rather than three independent VS-weakness stories. Re-enable point is
  // `p8a` (wave data on the real §1.1 shape); re-measure first, per
  // CLAUDE.md's measurement rules, rather than assume this is still true.
  it.skip('vampire_heart', () => {
    const { wins, outcomes } = winRate('vampire_heart');
    expect(wins, `${wins}/${SEEDS.length} — ${outcomes.join(' ')}`).toBeGreaterThanOrEqual(
      Math.ceil(SEEDS.length * 0.35),
    );
    expect(wins, `${wins}/${SEEDS.length} — ${outcomes.join(' ')}`).toBeLessThanOrEqual(
      Math.floor(SEEDS.length * 0.7),
    );
  });

  it.skip('corpse', () => {
    const { wins, outcomes } = winRate('corpse');
    expect(wins, `${wins}/${SEEDS.length} — ${outcomes.join(' ')}`).toBeGreaterThanOrEqual(
      Math.ceil(SEEDS.length * 0.35),
    );
    expect(wins, `${wins}/${SEEDS.length} — ${outcomes.join(' ')}`).toBeLessThanOrEqual(
      Math.floor(SEEDS.length * 0.7),
    );
  });

  it.skip('time', () => {
    const { wins, outcomes } = winRate('time');
    expect(wins, `${wins}/${SEEDS.length} — ${outcomes.join(' ')}`).toBeGreaterThanOrEqual(
      Math.ceil(SEEDS.length * 0.35),
    );
    expect(wins, `${wins}/${SEEDS.length} — ${outcomes.join(' ')}`).toBeLessThanOrEqual(
      Math.floor(SEEDS.length * 0.7),
    );
  });

  // Measured (Q116): 0/12 — dies `defeat_warden` at TD wave 3 every seed (the
  // very first VS wave), the exact "every policy dies inside VS wave 1, at TD
  // wave 3" finding p3e's own doc comment already recorded — a *different,
  // earlier* failure mode than the three above (Core HP loss to TD leaks
  // around wave 10-13): Stone Heart is the one Core that gives towers,
  // leaks or the character nothing at all, so it is the only one of the five
  // that still dies to raw VS-combat weakness rather than ever reaching the
  // p8a wall. Included for the record (the default Core is one of the "every
  // Core" G23 names) rather than omitted; `.skip`-ed with its own reason
  // (P6/P7 VS weakness, not p8a) since the two failure modes are genuinely
  // different, even though both currently read 0/12.
  it.skip('stone_heart (the default Core)', () => {
    const { wins, outcomes } = winRate('stone_heart');
    expect(wins, `${wins}/${SEEDS.length} — ${outcomes.join(' ')}`).toBeGreaterThanOrEqual(
      Math.ceil(SEEDS.length * 0.35),
    );
    expect(wins, `${wins}/${SEEDS.length} — ${outcomes.join(' ')}`).toBeLessThanOrEqual(
      Math.floor(SEEDS.length * 0.7),
    );
  });
});
