/**
 * Gate G1 (SPEC-FINAL §14, §1.1): the mean victorious run is 30-36 minutes
 * over 24+ seeds, reported as means and pass rates, never medians.
 *
 * Successor to the retired `tests/a1-run-length.test.ts` (SPEC A1, a median
 * 24-28 min target under the old Day/Night cycle shape — see that file's own
 * header). This measures the real §1.1 shape (18 TD + 6 VS waves, default
 * `cycles: 6`) with the `hybrid` bot, the same "genuinely playing, sometimes
 * loses" policy `tests/boss.test.ts` (G14) and `tests/f001-cycle-machine.
 * test.ts` already treat as the reference build, over 24 seeds.
 *
 * **First measured this session (p10d): mean victorious run 44.3 min, 13/24
 * wins (54%).** Well over the 30-36 min band. Act-by-act: TD ~26 min, VS+boss
 * ~18 min, of which the reported "boss fight" (`bossKillSeconds`, ~700s) was
 * mostly `data/spawns.json`'s `bossTimeSeconds` pre-spawn survival wait
 * (600s), not combat with the boss itself (~95s at that HP) — a distinction
 * PROGRESS.md's p10d entry lays out in full.
 *
 * **Partially closed, `/data`-only, `.skip`-ed with the honest remainder.**
 * `data/spawns.json`'s `bossTimeSeconds` 600->181 (the floor above SPEC 5.1's
 * first rift at 180s) removes the dead pre-spawn wait cleanly — verified not
 * to touch `tests/a4-single-type.test.ts`'s TD-only economy, and
 * `data/waves.json`'s `vsWaveSeconds`/`buildPhaseSeconds` were tried and
 * reverted after both proved coupled to a4's TD economy through blocks 1-5's
 * VS phases (see PROGRESS.md's p10d entry). That alone cuts the mean to
 * 38.46 min at the original 15000 HP boss (7/12 wins, matching the original
 * ~54% win rate — timer-only, no difficulty change).
 *
 * Closing the remaining ~2.5 min needs `data/enemies.json`'s `warden_eater`
 * hp cut too, but every value low enough to land the 30-36 band (measured
 * down to hp 1000, an ~8s fight) also drives the scripted bot's win rate to
 * 100% across every seed tried — a genuine cross-gate conflict with G14's own
 * text ("win rate >=60% and <100%", `tests/boss.test.ts`), not a missed
 * tuning value. Chose hp 15000->10000 instead: a real, sometimes-lost fight
 * (measured 79% win rate over the same 24 seeds) at the cost of leaving G1
 * short. `.skip`-ed rather than cut further into the fight's substance;
 * follow-up filed as BACKLOG p10k (a boss-pacing redesign — e.g. a DPS-race
 * or enrage-timer mechanic — that can shorten the fight without pinning its
 * outcome, out of a flat HP/timer tune). Full accounting in PROGRESS.md.
 *
 * **p10k**: added `src/sim/boss.ts`'s `PACING_START`/`PACING_INTERVAL`/
 * `PACING_VULNERABILITY_PER_STACK` — an independent, earlier-starting
 * damage-taken ramp on the boss (the spec's own 3:00 escalation clock,
 * Q126/Q127, never fires within these fight lengths, so it cannot be reused
 * for this). Live baseline had drifted since p10d (p10e-p10j's balance work):
 * **37.24 min, 16/24 (67%)** with the ramp inert. Swept a wide constant range
 * against `tools/p10k-sweep.ts`; every point traces the same curve —
 * 37.24/67% -> 37.05/79% -> 36.63/92% -> 36.26/96% -> 36.19/100% -> 35.88/100%
 * at the most extreme setting tried (an effectively instant kill for every
 * seed). Mean only crosses under 36 once win rate hits 100%, which G14
 * forbids outright — proof, via a second independent mechanism, of the same
 * wall p10d hit cutting HP directly: the residual gap is not inside the boss
 * fight's own time budget. Landed on 20/10/0.5 (**36.63 min, 22/24 (92%)**) as
 * the real, honest improvement available from a boss-only lever, still short
 * of the band. Follow-up filed as BACKLOG p10l.
 *
 * **p10l (closes the gate): `data/waves.json`'s `buildPhaseSeconds` 20->15.**
 * p10k's own note assumed any further pacing lever had to live in Act I or
 * the non-final VS blocks, and that `vsWaveSeconds`/`buildPhaseSeconds` were
 * both already ruled out by p10d's finding that they're "coupled to a4's
 * TD-only economy through the VS blocks its solo-tower probe traverses." That
 * finding was never isolated per-field — p10d changed both at once. Tried
 * `buildPhaseSeconds` alone this session: `tools/a4probe.ts`'s full roster
 * still measures 5/5 T1 / 0/5 T3 for all seven towers at 15s, unchanged from
 * 20s. This makes sense on inspection — the build-phase timer only gates
 * *when enemies spawn*, not how much gold the bot has to spend: for the
 * default `stone_heart` core both gated tests use, gold comes solely from
 * kill bounty and the fixed wave-clear bonus (`run.ts`'s `applyWaveClear`),
 * neither of which reads the build timer. (One core is a real exception —
 * "Time"'s `goldPerSecond` step ticks on every phase including the build
 * one, so it *is* wall-clock-coupled; harmless here since neither gated test
 * selects it, filed as BACKLOG b042.) So shortening the timer removes dead
 * waiting time without touching the economy a4 measures. `vsWaveSeconds`
 * stays untouched — it's
 * the field p10c's own investigation found genuinely coupled (VS kills feed
 * XP -> Power boons -> `towerDamage()`'s `powerMul`, which also scales TD
 * firing) and it's on §17's owner-review list besides. Measured: **mean
 * 35.29 min, 22/24 wins (92%)** — same win/loss split as the p10k baseline,
 * confirming the lever changes only pacing, not difficulty. Comfortably
 * inside the 30-36 min band. `tests/p3a-run-shape.test.ts`'s pinned
 * `buildPhaseSeconds` literal updated 20->15 to match; no other test pins the
 * old value. Gate **G1 is green in full.**
 */

import { describe, expect, it } from 'vitest';

import { Run } from '../src/sim/run';
import { makePolicy } from '../src/bots';
import '../src/bots';
import type { RunConfig, RunReport } from '../src/sim/types';

const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1);

function runOne(cfg: RunConfig, policyName: string, maxTicks: number): RunReport {
  const run = new Run({ ...cfg, policy: policyName });
  const policy = makePolicy(policyName);
  while (!run.done && run.world.tick < maxTicks) {
    run.step(policy.act(run.world));
  }
  return run.report();
}

describe('G1 mean victorious run is 30-36 minutes over 24+ seeds', () => {
  const reports = SEEDS.map((seed) =>
    runOne({ seed, classKey: 'engineer', tier: 1, modifiers: [], allocated: [] }, 'hybrid', 60 * 60 * 45),
  );
  const wins = reports.filter((r) => r.outcome === 'victory');
  const minutes = wins.map((r) => r.totalSeconds / 60);
  const mean = minutes.reduce((a, b) => a + b, 0) / (minutes.length || 1);
  const detail =
    `mean ${mean.toFixed(2)} min over ${wins.length}/${reports.length} wins ` +
    `(${minutes.map((m) => m.toFixed(1)).join(', ')})`;

  it('produces enough victories to have a mean', () => {
    expect(wins.length, detail).toBeGreaterThan(0);
  });

  // Reports the win rate too, so a future re-tune sees both halves of "means
  // and pass rates, never medians" at a glance rather than re-deriving the
  // rate from the raw report list.
  it('wins a real majority of runs, not all of them (G14 cross-check: a boss cut low enough to close G1 alone pins this at 100%)', () => {
    const rate = wins.length / reports.length;
    expect(rate, detail).toBeGreaterThan(0.5);
    expect(rate, detail).toBeLessThan(1);
  });

  // Closed at p10l: `data/waves.json`'s `buildPhaseSeconds` 20->15 (a TD-side
  // lever `tests/a4-single-type.test.ts`'s solo-tower probe never traverses a
  // build-phase-length dependency on — verified empirically, all seven towers
  // still 5/5 T1 / 0/5 T3 at 15s) shaves the dead per-wave build-phase wait
  // out of all 18 TD waves without touching combat difficulty (build phase
  // only gates when enemies spawn, not how much gold the bot has to spend —
  // gold comes solely from bounty and the fixed wave-clear bonus). Measured:
  // mean 35.29 min, 22/24 wins (92%) — same win/loss split as p10k's
  // pre-change baseline (36.63 min, 22/24), confirming the lever is
  // orthogonal to outcome, only to pacing. `vsWaveSeconds` (75s) is
  // deliberately untouched — it is on §17's owner-review list and was also
  // the lever p10d/p10k found genuinely coupled to a4's economy via the
  // VS-kills -> XP -> Power-boon -> `towerDamage()` `powerMul` pipeline that
  // also scales TD firing.
  it('has a mean victorious run of 30-36 minutes', () => {
    expect(mean, detail).toBeGreaterThanOrEqual(30);
    expect(mean, detail).toBeLessThanOrEqual(36);
  });
});
