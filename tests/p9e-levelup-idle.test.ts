/**
 * G18's dead-end clause (QA on t4 bug 4): `levelup` is SPEC-FINAL's only
 * remaining decision phase (`p3d` deleted Dusk/Dawn) with no floor of its
 * own — Act I's build/wave timers and a VS block all end on their own, but
 * a rolled level-up offer sat forever with `autoPickLevelUps` off and
 * nothing driving input. `tickLevelupIdle` (`src/sim/progression.ts`) closes
 * it with an idle timeout (Q150), independent of the player-facing
 * `autoPickLevelUps` toggle.
 */

import { describe, expect, it } from 'vitest';

import { World } from '../src/sim/world';
import { Run, applyCommand, hashWorld } from '../src/sim/run';
import { addXp, openLevelUpIfPending, xpToReach, LEVELUP_IDLE_TIMEOUT_TICKS } from '../src/sim/progression';
import { emptyInput } from '../src/sim/types';
import { cfg } from './helpers';

function newAct2Run(): Run {
  const run = new Run(cfg());
  const w = run.world;
  w.phase = 'act2';
  w.sundered = true;
  w.warden.x = 18;
  w.warden.y = 10;
  w.updateNav(true);
  return run;
}

function act2World(): World {
  const w = new World(cfg());
  w.phase = 'act2';
  w.sundered = true;
  w.warden.x = 18;
  w.warden.y = 10;
  w.updateNav(true);
  return w;
}

describe('levelup idle auto-resolve (p9e, G18)', () => {
  it('an unattended run (no pick, no autopick) auto-resolves the offer after the idle timeout and returns to act2', () => {
    const run = new Run(cfg());
    const w = run.world;
    w.phase = 'act2';
    w.sundered = true;
    w.warden.x = 18;
    w.warden.y = 10;
    w.updateNav(true);
    addXp(w, xpToReach(2));
    openLevelUpIfPending(w);
    expect(w.phase).toBe('levelup');
    expect(w.offers.length).toBeGreaterThan(0);

    // Step with genuinely empty input, well short of the timeout: still parked.
    for (let i = 0; i < LEVELUP_IDLE_TIMEOUT_TICKS - 1; i++) run.step(emptyInput());
    expect(w.phase).toBe('levelup');

    // One more tick crosses the timeout: resolved, without ever receiving a pick Command.
    run.step(emptyInput());
    expect(w.phase).toBe('act2');
    expect(w.offers).toEqual([]);
    expect(Object.keys(w.boonRanks).length + Object.keys(w.typeMasteryRanks).length + Object.keys(w.skillCardRanks).length)
      .toBeGreaterThan(0);
  });

  it('a headless run stepped far past its tick budget never sits in a decision phase (the literal t4-bug-4 repro shape)', () => {
    const run = new Run(cfg());
    const w = run.world;
    w.phase = 'act2';
    w.sundered = true;
    w.warden.x = 18;
    w.warden.y = 10;
    w.updateNav(true);
    addXp(w, xpToReach(2) + xpToReach(3));
    openLevelUpIfPending(w);
    expect(w.phase).toBe('levelup');

    // 72,000 ticks — the exact repro's step count — of pure empty input.
    for (let i = 0; i < 72_000 && !run.done; i++) run.step(emptyInput());

    expect(w.phase).not.toBe('levelup');
    // Both queued level-ups resolved: no pendingLevelUps left stuck either.
    expect(w.pendingLevelUps).toBe(0);
  });

  it('a real manual pick well inside the idle window still works exactly as before (no premature auto-resolve)', () => {
    const run = new Run(cfg());
    const w = run.world;
    w.phase = 'act2';
    w.sundered = true;
    w.warden.x = 18;
    w.warden.y = 10;
    w.updateNav(true);
    addXp(w, xpToReach(2));
    openLevelUpIfPending(w);
    const offeredKey = w.offers[0].key;
    for (let i = 0; i < 30; i++) run.step(emptyInput());
    expect(w.phase).toBe('levelup');
    run.step({ ...emptyInput(), cmds: [{ k: 'pick', index: 0 }] });
    expect(w.phase).toBe('act2');
    expect(
      (w.boonRanks[offeredKey] ?? 0) > 0 ||
        (w.typeMasteryRanks[offeredKey] ?? 0) > 0 ||
        (w.skillCardRanks[offeredKey] ?? 0) > 0,
    ).toBe(true);
  });

  it('each freshly-rolled offer gets its own full idle budget, not a shared running total', () => {
    const run = new Run(cfg());
    const w = run.world;
    w.phase = 'act2';
    w.sundered = true;
    w.warden.x = 18;
    w.warden.y = 10;
    w.updateNav(true);
    addXp(w, xpToReach(2));
    openLevelUpIfPending(w);
    // Burn most of the first offer's budget, then resolve it manually.
    for (let i = 0; i < LEVELUP_IDLE_TIMEOUT_TICKS - 5; i++) run.step(emptyInput());
    expect(w.phase).toBe('levelup');
    run.step({ ...emptyInput(), cmds: [{ k: 'pick', index: 0 }] });
    expect(w.phase).toBe('act2');

    // A second level-up should not inherit the first offer's near-exhausted timer:
    // openLevelUpIfPending resets levelupIdleTicks for every freshly-rolled offer.
    addXp(w, xpToReach(3));
    openLevelUpIfPending(w);
    expect(w.phase).toBe('levelup');
    expect(w.levelupIdleTicks).toBe(0);
    for (let i = 0; i < 10; i++) run.step(emptyInput());
    expect(w.phase).toBe('levelup');
  });

  it('the set_autopick Command and the idle timeout resolve the same way (both use pickAutoOfferIndex)', () => {
    const runA = new Run(cfg());
    const wa = runA.world;
    wa.phase = 'act2';
    wa.sundered = true;
    wa.warden.x = 18;
    wa.warden.y = 10;
    wa.updateNav(true);
    wa.boonRanks = { power: 3 };
    addXp(wa, xpToReach(2));
    openLevelUpIfPending(wa);
    for (let i = 0; i < LEVELUP_IDLE_TIMEOUT_TICKS; i++) runA.step(emptyInput());
    expect(wa.phase).toBe('act2');

    const runB = new Run(cfg());
    const wb = runB.world;
    wb.phase = 'act2';
    wb.sundered = true;
    wb.warden.x = 18;
    wb.warden.y = 10;
    wb.updateNav(true);
    wb.boonRanks = { power: 3 };
    addXp(wb, xpToReach(2));
    openLevelUpIfPending(wb);
    applyCommand(wb, { k: 'set_autopick', on: true });

    expect(wa.boonRanks).toEqual(wb.boonRanks);
  });

  it('a reroll near the idle timeout re-arms the clock instead of losing the freshly-rerolled offer to auto-resolve (code-reviewer finding)', () => {
    const run = newAct2Run();
    const w = run.world;
    addXp(w, xpToReach(2));
    openLevelUpIfPending(w);
    expect(w.phase).toBe('levelup');
    for (let i = 0; i < LEVELUP_IDLE_TIMEOUT_TICKS - 2; i++) run.step(emptyInput());
    expect(w.phase).toBe('levelup');
    // A reroll this close to the timeout is the clearest signal of active
    // engagement this phase has — it must not be auto-resolved out from
    // under the player within the next couple of ticks.
    run.step({ ...emptyInput(), cmds: [{ k: 'reroll' }] });
    // The reroll Command resets the clock to 0 before this same step's
    // `tickLevelupIdle` runs and increments it once — 1, not a value near
    // the timeout it was at a moment ago.
    expect(w.levelupIdleTicks).toBe(1);
    for (let i = 0; i < LEVELUP_IDLE_TIMEOUT_TICKS - 2; i++) run.step(emptyInput());
    expect(w.phase).toBe('levelup');
    // The re-armed clock still eventually fires if nobody ever acts on it.
    for (let i = 0; i < 3; i++) run.step(emptyInput());
    expect(w.phase).toBe('act2');
  });

  it('set_autopick flipped on mid-idle-window still resolves the standing offer immediately, same as at tick 0', () => {
    const run = newAct2Run();
    const w = run.world;
    addXp(w, xpToReach(2));
    openLevelUpIfPending(w);
    for (let i = 0; i < LEVELUP_IDLE_TIMEOUT_TICKS - 5; i++) run.step(emptyInput());
    expect(w.phase).toBe('levelup');
    run.step({ ...emptyInput(), cmds: [{ k: 'set_autopick', on: true }] });
    expect(w.phase).toBe('act2');
    expect(w.offers).toEqual([]);
  });

  it('an exhausted offer pool (everything already at max rank) never opens a dead-end levelup phase (code-reviewer finding)', () => {
    const run = newAct2Run();
    const w = run.world;
    for (const b of w.content.boons.statBoons) w.boonRanks[b.key] = b.maxRank;
    for (const c of w.content.boons.skillCards[w.cfg.classKey] ?? []) {
      w.skillCardRanks[c.key] = c.maxRank;
    }
    // No tower is built in this world, so Type Mastery is already naturally
    // empty (`buildOfferPool` only offers it for a built type) — the pool as
    // a whole is now genuinely exhausted.
    addXp(w, xpToReach(2));
    openLevelUpIfPending(w);
    expect(w.phase).toBe('act2');
    expect(w.pendingLevelUps).toBe(0);
    // Stepping well past the idle timeout confirms nothing is silently
    // parked waiting for a resolve that can never come.
    for (let i = 0; i < LEVELUP_IDLE_TIMEOUT_TICKS + 10; i++) run.step(emptyInput());
    expect(w.phase).not.toBe('levelup');
  });

  it('hashWorld distinguishes worlds that differ only in levelupIdleTicks (G2 hash coverage)', () => {
    const w1 = act2World();
    addXp(w1, xpToReach(2));
    openLevelUpIfPending(w1);
    const w2 = act2World();
    addXp(w2, xpToReach(2));
    openLevelUpIfPending(w2);
    w2.levelupIdleTicks = 500;
    expect(hashWorld(w1)).not.toBe(hashWorld(w2));
  });
});
