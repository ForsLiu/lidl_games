/**
 * p11c (BACKLOG, QUESTIONS Q166): a locked-in regression guard for
 * `reactionReady`/`ImperfectState` (`tests/helpers.ts`) — the reaction-delay
 * model behind `scriptClassKitImperfect`/`buyCoreUpgradesImperfect`/
 * `runScriptedImperfect`. This file exists because the *first* version of
 * that harness had a real bug (rolled `missChance` fresh every tick a
 * decision stayed ready, instead of once per readiness window), caught only
 * by a code-reviewer pass, not by any test — nothing here re-runs G8/G23
 * itself (that measurement is ad-hoc and logged in BACKLOG p11c/QUESTIONS
 * Q166, not a permanent suite cost); this just pins that `missChance`
 * actually degrades play in an observable, monotonic way, so a future
 * regression of the same class fails loud instead of silently producing a
 * meaningless "imperfect play changes nothing" result again.
 */
import { describe, expect, it } from 'vitest';

import '../src/bots';
import { allTreeNodeIds } from '../src/meta/meta';
import { loadContent } from '../src/sim/content';
import { Run } from '../src/sim/run';
import { Rng } from '../src/sim/rng';
import { emptyInput, type RunConfig } from '../src/sim/types';
import { cfg, newImperfectState, runScripted, runScriptedImperfect, scriptClassKitImperfect } from './helpers';

const content = loadContent();
const FULL_TREE = allTreeNodeIds(content);

function archerConfig(): RunConfig {
  return cfg({ seed: 1, classKey: 'archer', tier: 1, modifiers: [], allocated: FULL_TREE, cycles: 1, policy: 'hybrid' });
}

function activeDamage(damageByWeapon: Record<string, number>): number {
  return damageByWeapon['class_active'] ?? 0;
}

describe('p11c: reaction-delay imperfect-play harness actually degrades play', () => {
  it('missChance=0 (jitter-only) fires the kit less precisely than perfect play, but strictly more than a high miss chance', () => {
    const perfect = runScripted(archerConfig(), 'hybrid', 60 * 60 * 45);
    const jitterOnly = runScriptedImperfect(archerConfig(), 'hybrid', 60 * 60 * 45, 0);
    const heavyMiss = runScriptedImperfect(archerConfig(), 'hybrid', 60 * 60 * 45, 0.9);

    const perfectDmg = activeDamage(perfect.report.damageByWeapon);
    const jitterDmg = activeDamage(jitterOnly.report.damageByWeapon);
    const heavyDmg = activeDamage(heavyMiss.report.damageByWeapon);

    // Aim jitter alone (missChance=0, no reaction delay) already costs some
    // precision against a homing/point target — perfect play still deals
    // strictly more Active damage.
    expect(jitterDmg).toBeLessThan(perfectDmg);
    // The reaction-delay model (missChance=0.9) must cost substantially more
    // than jitter alone — this is the exact effect the first, buggy version
    // of this harness failed to produce (a per-tick re-roll degenerates to a
    // sub-0.2s expected delay, indistinguishable from missChance=0). A 60%
    // margin is comfortably inside what a real 1-5s reaction delay against
    // archer's 1.5s active1 cooldown should produce (measured live: ~48.5%
    // of the jitter-only baseline), while still being loose enough not to
    // flake on the sim's own determinism.
    expect(heavyDmg).toBeLessThan(jitterDmg * 0.6);
  });

  it('a decision does not fire the instant it becomes ready under a near-certain miss chance, but does fire within the bounded reaction-delay window', () => {
    // `engineer`'s Field Kit (`repair_heal`) is not a charge kind, so a fire
    // is observable as a pushed `class_active` command — `archer`'s Deadeye
    // Draw is a charge kind (`active1Held`-driven, no command), which this
    // case would never see fire at all.
    const config = cfg({ seed: 1, classKey: 'engineer', tier: 1, modifiers: [], allocated: FULL_TREE });
    const run = new Run(config);
    const w = run.world;
    const state = newImperfectState();
    const rng = new Rng(7);

    let firstFireTick = -1;
    for (let t = 0; t < 400 && firstFireTick < 0; t++) {
      const input = emptyInput();
      scriptClassKitImperfect(w, input, rng, 1, state);
      if (input.cmds.some((c) => c.k === 'class_active')) firstFireTick = w.tick;
      run.step(input);
    }

    // REACTION_DELAY_TICKS is [60,300] (tests/helpers.ts) — missChance=1
    // always draws from that range, so the first fire must land inside it,
    // never immediately (tick 0, the pre-fix behaviour) and never past it.
    expect(firstFireTick).toBeGreaterThanOrEqual(60);
    expect(firstFireTick).toBeLessThan(300);
  });
});
