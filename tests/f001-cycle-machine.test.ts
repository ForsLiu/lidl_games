/**
 * SPEC-V2 §1: the Day/Dusk/Night/Dawn cycle machine (BACKLOG f001).
 *
 * A run is 3 cycles by default; `cycles: 1` keeps the old single-pass shape
 * alive for the rest of the suite (see tests/helpers.ts).
 */

import { describe, expect, it } from 'vitest';

import { Run, applyCommand } from '../src/sim/run';
import { buildTower, towerCost } from '../src/sim/towers';
import { cycleWaveEnd, nightLengthSeconds, cycleEliteMul } from '../src/sim/world';
import { act2Minute, timeHpScale } from '../src/sim/act2';
import { emptyInput, type Command, type TickInput } from '../src/sim/types';
import { makePolicy } from '../src/bots';
import '../src/bots';
import { cfg, replay, runWithPolicy } from './helpers';

/**
 * Plays a real bot through cycle 1's Dusk and into Dawn, recording every
 * input, and injects a `rekindle` (of whatever petrified first) plus
 * `dawn_done` the moment Dawn opens — so the captured log exercises both new
 * commands through a real replay, not just a forced-state walk.
 */
function captureLogThroughDawn(seed: number): TickInput[] {
  const run = new Run(cfg({ cycles: 3, seed, policy: 'hybrid' }));
  const bot = makePolicy('hybrid');
  const log: TickInput[] = [];
  let injected = false;
  while (!run.done && run.world.tick < 60 * 60 * 12) {
    const w = run.world;
    let input = bot.act(w);
    if (w.phase === 'dawn' && !injected) {
      const target = w.structures.find((s) => s.petrified);
      const cmds: Command[] = [...input.cmds];
      if (target) cmds.push({ k: 'rekindle', structureId: target.id });
      cmds.push({ k: 'dawn_done' });
      input = { ...input, cmds };
      injected = true;
    }
    log.push(input);
    run.step(input);
  }
  return log;
}

/** Drives a wave boundary without playing the wave out: empties the field and
 * lets the real `Run.step` -> `completeWave` transition fire. */
function forceWaveClear(run: Run, wave: number): void {
  const w = run.world;
  w.phase = 'act1_wave';
  w.wave = wave;
  w.spawnQueue = [];
  w.enemies = [];
  run.step(emptyInput());
}

describe('cycle boundary helpers', () => {
  it('cycles:1 always ends the Day at the full wave count', () => {
    const w = new Run(cfg({ cycles: 1 })).world;
    expect(cycleWaveEnd(w, 1)).toBe(w.waveCount);
    expect(nightLengthSeconds(w, 1)).toBe(Infinity);
  });

  it('cycles:3 (default shape) splits waves 4/8/10 and only the last Night is boss-only', () => {
    const w = new Run(cfg({ cycles: 3 })).world;
    expect(cycleWaveEnd(w, 1)).toBe(4);
    expect(cycleWaveEnd(w, 2)).toBe(8);
    expect(cycleWaveEnd(w, 3)).toBe(w.waveCount);
    expect(nightLengthSeconds(w, 1)).toBe(180);
    expect(nightLengthSeconds(w, 2)).toBe(240);
    expect(nightLengthSeconds(w, 3)).toBe(Infinity);
    expect(cycleEliteMul(w, 1)).toBe(1);
    expect(cycleEliteMul(w, 2)).toBe(2);
    expect(cycleEliteMul(w, 3)).toBe(1);
  });
});

describe('the cycle state machine (SPEC-V2 §1)', () => {
  it('routes each cycle boundary to Dusk, ends non-final Nights by timer into Dawn, and Dawn resolves into the next Day', () => {
    const run = new Run(cfg({ cycles: 3 }));
    const w = run.world;

    forceWaveClear(run, cycleWaveEnd(w, 1));
    expect(w.phase).toBe('dusk');
    expect(w.duskTimer).toBe(15);

    w.duskTimer = 0;
    run.step(emptyInput());
    expect(w.phase).toBe('act2');
    expect(w.cycle).toBe(1);

    // Cycle 1 of 3 is not the final Night: it ends by timer, not boss kill.
    w.act2Time = nightLengthSeconds(w, 1);
    run.step(emptyInput());
    expect(w.phase).toBe('dawn');
    expect(w.bossSpawned).toBe(false);
    expect(w.outcome).toBe('running');

    applyCommand(w, { k: 'dawn_done' });
    expect(w.phase).toBe('act1_build');
    expect(w.cycle).toBe(2);

    forceWaveClear(run, cycleWaveEnd(w, 2));
    expect(w.phase).toBe('dusk');
    w.duskTimer = 0;
    run.step(emptyInput());
    expect(w.phase).toBe('act2');
    expect(w.cycle).toBe(2);

    // Cycle 2 of 3 also ends by timer.
    w.act2Time = nightLengthSeconds(w, 2);
    run.step(emptyInput());
    expect(w.phase).toBe('dawn');
    expect(w.bossSpawned).toBe(false);

    applyCommand(w, { k: 'dawn_done' });
    expect(w.cycle).toBe(3);

    forceWaveClear(run, cycleWaveEnd(w, 3));
    expect(w.phase).toBe('dusk');
    w.duskTimer = 0;
    run.step(emptyInput());
    expect(w.phase).toBe('act2');
    expect(w.cycle).toBe(3);

    // Only the final cycle's Night is boss-gated: a long timer alone must not
    // end it early into a fourth Dawn that doesn't exist.
    w.act2Time = nightLengthSeconds(w, 1) + nightLengthSeconds(w, 2);
    run.step(emptyInput());
    expect(w.phase).toBe('act2');
    expect(w.cycle).toBe(3);
  });

  it('Dawn auto-advances (all Leave) if no command arrives', () => {
    const run = new Run(cfg({ cycles: 3 }));
    const w = run.world;
    forceWaveClear(run, cycleWaveEnd(w, 1));
    w.duskTimer = 0;
    run.step(emptyInput());
    w.act2Time = nightLengthSeconds(w, 1);
    run.step(emptyInput());
    expect(w.phase).toBe('dawn');

    for (let i = 0; i < 60 * 25 && w.phase === 'dawn'; i++) run.step(emptyInput());
    expect(w.phase).toBe('act1_build');
    expect(w.cycle).toBe(2);
  });

  it('Rekindle un-petrifies a tower for gold; Leave keeps it as terrain', () => {
    const run = new Run(cfg({ cycles: 3 }));
    const w = run.world;
    w.warden.x = 5.5;
    w.warden.y = 5.5;
    const def = w.content.towerByKey.get('arrow_spire')!;
    const built = buildTower(w, def.id, 5, 6);
    if (!built.ok) throw new Error(`could not place arrow_spire: ${built.reason}`);
    const structureId = built.structure.id;

    forceWaveClear(run, cycleWaveEnd(w, 1));
    w.duskTimer = 0;
    run.step(emptyInput());
    expect(w.structures.find((s) => s.id === structureId)!.petrified).toBe(true);

    w.act2Time = nightLengthSeconds(w, 1);
    run.step(emptyInput());
    expect(w.phase).toBe('dawn');

    const cost = Math.max(1, Math.round(towerCost(w, def) * w.content.towers.rekindleCostMul));
    const goldBefore = w.gold;
    applyCommand(w, { k: 'rekindle', structureId });
    const s = w.structures.find((x) => x.id === structureId)!;
    expect(s.petrified).toBe(false);
    expect(s.soulSuppressed).toBe(true);
    expect(w.gold).toBe(goldBefore - cost);

    // A second Rekindle of the same (now live) structure is a no-op: it is not petrified.
    const goldAfterFirst = w.gold;
    applyCommand(w, { k: 'rekindle', structureId });
    expect(w.gold).toBe(goldAfterFirst);
  });

  it('B9: a petrified-left tower keeps its soul and Night-earned level; a Rekindled tower sits out the very next Dusk pick', () => {
    const run = new Run(cfg({ cycles: 3 }));
    const w = run.world;
    w.warden.x = 5.5;
    w.warden.y = 5.5;
    const spireDef = w.content.towerByKey.get('arrow_spire')!;
    const ballistaDef = w.content.towerByKey.get('ballista')!;
    buildTower(w, spireDef.id, 5, 6);
    buildTower(w, ballistaDef.id, 7, 6);
    const spireSoul = w.content.towerById.get(spireDef.id)!.soul!;
    const ballistaSoul = w.content.towerById.get(ballistaDef.id)!.soul!;

    // Cycle 1 -> Dusk auto-binds both souls (2 towers <= weapon slots).
    forceWaveClear(run, cycleWaveEnd(w, 1));
    w.duskTimer = 0;
    run.step(emptyInput());
    expect(w.phase).toBe('act2');
    expect(w.weapons.some((x) => x.key === spireSoul)).toBe(true);
    expect(w.weapons.some((x) => x.key === ballistaSoul)).toBe(true);

    // Simulate Night-time growth on the Spire's bound weapon.
    const spireWeapon = w.weapons.find((x) => x.key === spireSoul)!;
    spireWeapon.level = w.content.weapons.maxLevel;

    w.act2Time = nightLengthSeconds(w, 1);
    run.step(emptyInput());
    expect(w.phase).toBe('dawn');

    const spireStructure = w.structures.find((s) => s.towerId === spireDef.id)!;
    applyCommand(w, { k: 'rekindle', structureId: spireStructure.id });
    applyCommand(w, { k: 'dawn_done' });
    expect(w.phase).toBe('act1_build');
    expect(w.cycle).toBe(2);

    // Day 2: nothing else changes on the field. Skip straight to cycle 2's Dusk.
    forceWaveClear(run, cycleWaveEnd(w, 2));
    expect(w.phase).toBe('dusk');
    w.duskTimer = 0;
    run.step(emptyInput());

    // The rekindled Spire's soul is unavailable this Dusk even though it
    // survived (unharmed) and re-petrified in the same step. The Ballista,
    // never rekindled, stayed available the whole time.
    expect(w.soulCandidates).not.toContain(spireSoul);
    expect(w.soulCandidates).toContain(ballistaSoul);

    // SPEC-V2 §1: "weapon unavailable next Night" means genuinely unbound,
    // not just absent from the picker — it must stop firing for Night 2.
    expect(w.weapons.some((x) => x.key === spireSoul)).toBe(false);
    // ...but its Night-1 level was not lost, only benched.
    expect(w.soulLevels[spireSoul]?.level).toBe(w.content.weapons.maxLevel);

    // Having re-petrified at this same Dusk, it is eligible again next time.
    expect(spireStructure.petrified).toBe(true);
    expect(spireStructure.soulSuppressed).toBe(false);

    // Dawn 2: leave everything petrified. Dusk 3 should re-bind the Spire's
    // soul, resuming at its Night-1 level rather than restarting at tier 1.
    w.act2Time = nightLengthSeconds(w, 2);
    run.step(emptyInput());
    expect(w.phase).toBe('dawn');
    applyCommand(w, { k: 'dawn_done' });
    expect(w.cycle).toBe(3);

    forceWaveClear(run, cycleWaveEnd(w, 3));
    expect(w.phase).toBe('dusk');
    w.duskTimer = 0;
    run.step(emptyInput());
    expect(w.phase).toBe('act2');
    expect(w.soulCandidates).toContain(spireSoul);
    const spireWeaponResumed = w.weapons.find((x) => x.key === spireSoul);
    expect(spireWeaponResumed?.level).toBe(w.content.weapons.maxLevel);
  });

  it('a scripted 3-cycle sim completes', () => {
    // No bot policy Rekindles at Dawn (SPEC-V2 §1's Day-power/Night-power
    // tension is a player strategy, not scripted-bot behavior), so a bot's Day
    // 2+ board is thin and a defeat before cycle 3 is a legitimate outcome —
    // full-run balance for the cycle shape is M15/M16 work, not this item's.
    // Seed 5 happens to survive into the final cycle; that is what this test
    // pins: the machinery runs a real bot through all three cycles without
    // hanging, erroring, or getting stuck in any phase.
    const { report, run } = runWithPolicy(cfg({ cycles: 3, seed: 5 }), 'hybrid', 60 * 60 * 45);
    expect(run.done).toBe(true);
    expect(report.outcome).not.toBe('running');
    expect(run.world.cycle).toBe(3);
  });

  it('cycle never exceeds totalCycles, and only the final cycle can end in victory', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const { report, run } = runWithPolicy(cfg({ cycles: 3, seed }), 'hybrid', 60 * 60 * 45);
      expect(run.done).toBe(true);
      expect(run.world.cycle).toBeGreaterThanOrEqual(1);
      expect(run.world.cycle).toBeLessThanOrEqual(3);
      if (report.outcome === 'victory') expect(run.world.cycle).toBe(3);
    }
  });

  it('SPEC A11: a cycles:3 run with rekindle/dawn_done in the input log replays to an identical hash', () => {
    const log = captureLogThroughDawn(5);
    const a = replay(cfg({ cycles: 3, seed: 5 }), log);
    const b = replay(cfg({ cycles: 3, seed: 5 }), log);
    expect(b.endHash).toBe(a.endHash);
    expect(b.ticks).toBe(a.ticks);
    expect(b.kills).toBe(a.kills);
  });

  it('a terrain-passive tower built and petrified in cycle 2 actually applies its residual that Night', () => {
    const run = new Run(cfg({ cycles: 3 }));
    const w = run.world;

    // Cycle 1: nothing built, straight through to Dawn 1.
    forceWaveClear(run, cycleWaveEnd(w, 1));
    w.duskTimer = 0;
    run.step(emptyInput());
    w.act2Time = nightLengthSeconds(w, 1);
    run.step(emptyInput());
    expect(w.phase).toBe('dawn');
    applyCommand(w, { k: 'dawn_done' });
    expect(w.cycle).toBe(2);

    // Day 2: build a Venom Spore (has an auraRadius/auraDps terrain residual,
    // and is unlocked for every class, unlike the Pyromancer-locked Brazier).
    w.warden.x = 5.5;
    w.warden.y = 5.5;
    const def = w.content.towerByKey.get('venom_spore')!;
    const built = buildTower(w, def.id, 5, 6);
    if (!built.ok) throw new Error(`could not place venom_spore: ${built.reason}`);

    forceWaveClear(run, cycleWaveEnd(w, 2));
    w.duskTimer = 0;
    run.step(emptyInput());
    expect(w.phase).toBe('act2');
    const s = w.structures.find((x) => x.id === built.structure.id)!;
    expect(s.petrified).toBe(true);

    // Tick once so updateTerrainEffects runs against the post-petrify field.
    run.step(emptyInput());
    expect(w.terrainEffects?.auras).toContain(s);
  });

  it('SPEC-V2 §1: a later cycle\'s Night starts hotter — the same act2Time reaches a higher minute/HP scale', () => {
    const w1 = new Run(cfg({ cycles: 3 })).world;
    w1.act2Time = 0;
    const w3 = new Run(cfg({ cycles: 3 })).world;
    w3.cycle = 3;
    w3.act2Time = 0;

    expect(act2Minute(w3)).toBeGreaterThan(act2Minute(w1));
    expect(timeHpScale(w3)).toBeGreaterThan(timeHpScale(w1));

    // cycles:1 (the rest of the suite's default shape) is untouched: cycle
    // never advances past 1, so the offset is always zero there.
    const w1x = new Run(cfg({ cycles: 1 })).world;
    w1x.act2Time = 90;
    expect(act2Minute(w1x)).toBe(1);
  });
});
