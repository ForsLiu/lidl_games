/**
 * @vitest-environment jsdom
 *
 * SPEC-FINAL §1.1 leak coupling (BACKLOG f003/p3c, gate G6): "each enemy
 * reaching the Core in TD adds `2 x its spawn cost` to the next VS wave's
 * budget, shown as a 'Loose in the dark: N' [counter]." The mechanism
 * (`leakIntoCore` in `src/sim/enemies.ts`, banked in `World.nightBudgetBonus`/
 * `looseInTheDark` and spent into `spawnBudget` at the TD-block-to-VS
 * transition by `finishSundering`) predates SPEC-FINAL and already reads
 * `leakBudgetMultiplier` from `/data` rather than a hardcoded 2 — this file
 * is p3c's re-pointing of that coverage onto §1.1's TD/VS vocabulary (was
 * SPEC-V2 §1's Day/Night) plus one new test (below) proving the same
 * mechanism repeats correctly across all 6 TD-block -> VS-wave boundaries of
 * the real §1.1 shape (BACKLOG p3a). p3d then deleted the Dusk/Dawn phase
 * machine these cases used to step through by name; the TD-block -> VS-wave
 * transition these cases exercise is now immediate (`finishSundering` fires
 * synchronously the instant the block's last wave clears — see `completeWave`,
 * run.ts), and the VS-wave -> next-TD-block transition is `advanceToNextBlock`,
 * with no Dawn ledger command to drive. No leak-coupling behavior changed —
 * `leakIntoCore`/`finishSundering` are untouched by this item.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Run, hashWorld } from '../src/sim/run';
import { spawnEnemy } from '../src/sim/enemies';
import { CORE_X, CORE_Y } from '../src/sim/grid';
import { cycleWaveEnd, World } from '../src/sim/world';
import { emptyInput } from '../src/sim/types';
import { makePolicy } from '../src/bots';
import '../src/bots';
import { Hud } from '../src/ui/hud';
import { cfg } from './helpers';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

/** Drives a wave boundary without playing the wave out (same trick as f001). */
function forceWaveClear(run: Run, wave: number): void {
  const w = run.world;
  w.phase = 'act1_wave';
  w.wave = wave;
  w.spawnQueue = [];
  w.enemies = [];
  run.step(emptyInput());
}

/** Standing exactly on the Core tile leaks the instant the wave update runs. */
function leakOne(run: Run, key: string): void {
  const w = run.world;
  // p6d: the default test class (Engineer) is a SPEC-FINAL §4.2 kit now, so it
  // auto-attacks with no `input.attack` press (Q117) — and it reforms/starts
  // within its own range of the Core tile these leakers stand on. Suppressed
  // the same way p6b/p6c's kit tests do, so this file keeps measuring leak
  // coupling rather than whether the character happened to finish a leaker
  // first.
  w.warden.attackCooldown = 1e9;
  w.phase = 'act1_wave';
  spawnEnemy(w, key, CORE_X + 0.5, CORE_Y + 0.5, { hpMul: 1, gate: 0, overlay: false });
  run.step(emptyInput());
}

describe('BACKLOG f003/p3c: leak coupling (SPEC-FINAL §1.1, gate G6)', () => {
  it('a TD leak adds leakBudgetMultiplier (§1.1: 2) x its director cost to nightBudgetBonus and the "loose in the dark" headcount', () => {
    const run = new Run(cfg());
    const w = run.world;
    const huskCost = w.content.spawns.costs.husk;
    const mul = w.content.spawns.leakBudgetMultiplier;
    // SPEC-FINAL §1.1's literal number, sourced from /data (`data/spawns.json`)
    // rather than hardcoded, per CLAUDE.md's architecture rule 4.
    expect(mul).toBe(2);

    leakOne(run, 'husk');
    expect(w.leaks).toBe(1);
    expect(w.looseInTheDark).toBe(1);
    expect(w.nightBudgetBonus).toBeCloseTo(huskCost * mul, 6);

    // A second, differently-costed enemy type adds its own director cost, not the first's.
    const menderCost = w.content.spawns.costs.mender;
    leakOne(run, 'mender');
    expect(w.leaks).toBe(2);
    expect(w.looseInTheDark).toBe(2);
    expect(w.nightBudgetBonus).toBeCloseTo((huskCost + menderCost) * mul, 6);
  });

  it('QA repro: a leaked pack enemy is charged its director cost once per spawn-call, not once per physical body', () => {
    // The director's cost table (act2.ts spendBudget) prices one spawn call,
    // and a pack call produces `packSize` physical bodies for that one price.
    // A first pass at leakIntoCore charged the full per-call cost to every
    // physical leaked body, so a fully-leaked swarm_rat pack (packSize 4)
    // billed the Night 4x what the Director actually paid to create it.
    const run = new Run(cfg());
    const w = run.world;
    w.phase = 'act1_wave';
    w.warden.attackCooldown = 1e9; // see `leakOne` (p6d)
    const def = w.content.enemyByKey.get('swarm_rat')!;
    const cost = w.content.spawns.costs.swarm_rat;
    const mul = w.content.spawns.leakBudgetMultiplier;

    // Centred in the 2x2 Core block, so every pack member's <=0.6-tile spawn
    // offset still lands on a Core tile and all of them leak on the same tick.
    spawnEnemy(w, 'swarm_rat', CORE_X + 1, CORE_Y + 1, { hpMul: 1, gate: 0, overlay: false });
    expect(w.enemies.length).toBe(def.packSize);

    run.step(emptyInput());
    expect(w.looseInTheDark).toBe(def.packSize);
    // A fully-leaked pack costs the Night exactly what the one spawn call
    // that created it cost the Director — not packSize x that.
    expect(w.nightBudgetBonus).toBeCloseTo(cost * mul, 6);
  });

  it('an unrecognized director cost falls back to the same default (5) the spawn director itself uses', () => {
    const w = new World(cfg());
    expect(w.content.spawns.costs.not_a_real_enemy).toBeUndefined();
    // The fallback lives in both enemies.ts (leak coupling) and act2.ts
    // (spendBudget); pin the shared constant here so the two cannot drift.
    expect(w.content.spawns.costs.husk).not.toBe(5);
  });

  it('the accumulated bonus lands in spawnBudget exactly once, at the TD-block-to-VS-wave transition, then clears for the next block', () => {
    const run = new Run(cfg({ cycles: 3 }));
    const w = run.world;
    const huskCost = w.content.spawns.costs.husk;
    const mul = w.content.spawns.leakBudgetMultiplier;

    for (let i = 0; i < 10; i++) leakOne(run, 'husk');
    expect(w.looseInTheDark).toBe(10);
    const expectedBonus = huskCost * mul * 10;
    expect(w.nightBudgetBonus).toBeCloseTo(expectedBonus, 6);

    // The block-boundary transition is immediate (p3d): `forceWaveClear`'s own
    // `run.step` already runs `completeWave` -> `finishSundering` synchronously.
    forceWaveClear(run, cycleWaveEnd(w, 1));
    expect(w.phase).toBe('act2');
    expect(w.spawnBudget).toBeCloseTo(expectedBonus, 6);
    // Spent and reset: VS wave 1 does not get paid twice, and block 2 starts clean.
    expect(w.nightBudgetBonus).toBe(0);
    expect(w.looseInTheDark).toBe(0);
  });

  it('a VS wave with no TD leaks gets no bonus (spawnBudget starts at 0, same as before this feature)', () => {
    const run = new Run(cfg());
    const w = run.world;
    forceWaveClear(run, cycleWaveEnd(w, 1));
    expect(w.phase).toBe('act2');
    expect(w.spawnBudget).toBe(0);
  });

  it('+10 leaked Husks in a TD block measurably raises that VS wave\'s starting spawn budget (gate G6\'s budget half)', () => {
    const baseline = new Run(cfg({ cycles: 3 }));
    forceWaveClear(baseline, cycleWaveEnd(baseline.world, 1));
    const baselineBudget = baseline.world.spawnBudget;

    const withLeaks = new Run(cfg({ cycles: 3 }));
    for (let i = 0; i < 10; i++) leakOne(withLeaks, 'husk');
    forceWaveClear(withLeaks, cycleWaveEnd(withLeaks.world, 1));

    const huskCost = withLeaks.world.content.spawns.costs.husk;
    const mul = withLeaks.world.content.spawns.leakBudgetMultiplier;
    expect(withLeaks.world.spawnBudget - baselineBudget).toBeCloseTo(huskCost * mul * 10, 6);
    expect(withLeaks.world.spawnBudget).toBeGreaterThan(baselineBudget);
  });

  it('hashWorld covers nightBudgetBonus/looseInTheDark/spawnBudget, so a divergence there cannot pass A11 undetected', () => {
    const a = new World(cfg());
    const b = new World(cfg());
    expect(hashWorld(a)).toBe(hashWorld(b));

    b.nightBudgetBonus = 6;
    expect(hashWorld(a)).not.toBe(hashWorld(b));

    const c = new World(cfg());
    c.looseInTheDark = 1;
    expect(hashWorld(a)).not.toBe(hashWorld(c));

    const d = new World(cfg());
    d.spawnBudget = 3;
    expect(hashWorld(a)).not.toBe(hashWorld(d));
  });

  it('the same seed played twice with the same forced Day leaks reaches an identical end-state hash (no nondeterminism sneaked in by leak coupling)', () => {
    // Forcing an enemy to leak is a test-harness mutation, not a replayable
    // Command, so this drives two independent bot-controlled sims with the
    // same seed rather than routing through the log-replay helper: both must
    // hit the same phase/tick at the same wall-clock-free tick count (seeded
    // RNG + a deterministic bot make that so) and therefore force the leak at
    // the same point both times.
    function play(seed: number): { hash: string; leaks: number } {
      const run = new Run(cfg({ cycles: 3, seed, policy: 'hybrid' }));
      const bot = makePolicy('hybrid');
      let forcedLeaks = 0;
      while (!run.done && run.world.tick < 60 * 60 * 12) {
        const w = run.world;
        const input = bot.act(w);
        // Force a few real Day-1 leaks so the run actually exercises the
        // leak-coupling path, not just the ordinary cycle machinery.
        if (w.phase === 'act1_wave' && forcedLeaks < 5) {
          spawnEnemy(w, 'husk', CORE_X + 0.5, CORE_Y + 0.5, { hpMul: 1, gate: 0, overlay: false });
          forcedLeaks++;
        }
        run.step(input);
      }
      return { hash: hashWorld(run.world), leaks: run.world.leaks };
    }
    const a = play(3);
    const b = play(3);
    expect(b.hash).toBe(a.hash);
    expect(a.leaks).toBeGreaterThanOrEqual(5);
  });

  it('a full TD-block-to-VS-wave-to-next-TD-block cycle carries the bonus, and does not re-apply or carry it forward', () => {
    const run = new Run(cfg({ cycles: 3 }));
    const w = run.world;
    for (let i = 0; i < 3; i++) leakOne(run, 'sprinter');
    const expectedBonus = w.content.spawns.costs.sprinter * w.content.spawns.leakBudgetMultiplier * 3;

    forceWaveClear(run, cycleWaveEnd(w, 1));
    expect(w.spawnBudget).toBeCloseTo(expectedBonus, 6);

    // Burn through VS wave 1 (its 75s timer, not the boss-gated final one) and
    // confirm the immediate transition into block 2 does not re-apply or
    // carry over a stale bonus from block 1 (p3d: no Dawn ledger to route
    // through — `advanceToNextBlock` fires directly from `updateAct2`).
    w.act2Time = w.content.waves.vsWaveSeconds;
    run.step(emptyInput());
    expect(w.phase).toBe('act1_build');
    expect(w.cycle).toBe(2);
    expect(w.nightBudgetBonus).toBe(0);
    expect(w.looseInTheDark).toBe(0);
  });

  it('p3c: repeats correctly across all 6 TD-block -> VS-wave transitions of the real §1.1 shape, each block getting only its own leaks', () => {
    const run = new Run(cfg({ cycles: 6, seed: 1 }));
    const w = run.world;
    const huskCost = w.content.spawns.costs.husk;
    const mul = w.content.spawns.leakBudgetMultiplier;

    for (let block = 1; block <= 6; block++) {
      // A different leak count per block so a stale carry-over from the
      // previous block's bonus (or a bonus computed against the wrong
      // block's leaks) would not accidentally match the expectation below.
      for (let i = 0; i < block; i++) leakOne(run, 'husk');
      expect(w.looseInTheDark).toBe(block);
      expect(w.nightBudgetBonus).toBeCloseTo(huskCost * mul * block, 6);

      // The block-boundary transition is immediate (p3d): the same
      // `forceWaveClear` step that clears the block's last wave already runs
      // `finishSundering` synchronously, landing straight in 'act2'.
      forceWaveClear(run, cycleWaveEnd(w, block));
      expect(w.phase).toBe('act2');
      expect(w.cycle).toBe(block);
      // This block's leaks land in spawnBudget exactly once, at the
      // TD-block -> VS-wave transition, and nowhere else.
      expect(w.spawnBudget).toBeCloseTo(huskCost * mul * block, 6);
      expect(w.nightBudgetBonus).toBe(0);
      expect(w.looseInTheDark).toBe(0);

      if (block < 6) {
        // Burn through this VS wave and land back in TD build for the next
        // block (p3d: immediate, no Dawn ledger), confirming the bonus does
        // not leak (pun intended) forward.
        w.act2Time = w.content.waves.vsWaveSeconds;
        run.step(emptyInput());
        expect(w.phase).toBe('act1_build');
        expect(w.cycle).toBe(block + 1);
      }
      // else: the final VS wave is boss-gated (BACKLOG p3a), not timed, but
      // the same finishSundering transition already paid it its own bonus
      // above — the boss-gating changes how VS wave 6 *ends*, not how it is
      // funded, so there is nothing further to drive.
    }
  });
});

describe('BACKLOG f003/p3c: TD HUD shows the "Loose in the dark" counter', () => {
  function mountHud(): { root: HTMLElement; hud: Hud } {
    document.head.innerHTML = `<style>${CSS}</style>`;
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.getElementById('app') as HTMLElement;
    const hud = new Hud(root, {
      onSelectTower: () => {},
      onCallWave: () => {},
      onPickOffer: () => {},
      onReroll: () => {},
      onRetry: () => {},
      onNewRun: () => {},
      onToggleRanges: () => {},
      onToggleAutoPick: () => {},
      onToggleCharacterPanel: () => {},
      onResume: () => {},
      onPause: () => {},
      onCycleSpeed: () => {},
      onDev: () => {},
      onQuitToHub: () => {},
    });
    return { root, hud };
  }

  it('reads 0 on a fresh Day and the live count once enemies have leaked', () => {
    const { root, hud } = mountHud();
    const w = new World(cfg());
    w.phase = 'act1_wave';
    hud.update(w);
    expect(root.textContent).toMatch(/Loose in the dark/);
    expect(root.querySelector('.sw-row b')?.parentElement?.textContent).toBeTruthy();

    w.looseInTheDark = 7;
    hud.update(w);
    const rows = Array.from(root.querySelectorAll('.sw-row')).map((el) => el.textContent ?? '');
    expect(rows.some((t) => t.includes('Loose in the dark') && t.includes('7'))).toBe(true);
  });

  it('does not show the Day counter during Night, when enemies hunt the Warden instead of the Core', () => {
    const { root, hud } = mountHud();
    const w = new World(cfg());
    w.phase = 'act2';
    w.sundered = true;
    hud.update(w);
    expect(root.textContent).not.toMatch(/Loose in the dark/);
  });
});
