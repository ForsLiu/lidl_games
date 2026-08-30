/**
 * The practice tool (playtest report, 2026-08-25: "add more dev options for
 * testing, like kill all enemy, add money etc like a league practice tool").
 *
 * Two things must hold or it is a liability rather than a tool: it must be
 * unreachable in a normal run, and a run that used it must bank nothing.
 */

import { describe, expect, it } from 'vitest';

import { Run, applyCommand, damageWarden } from '../src/sim/run';
import { World } from '../src/sim/world';
import { spawnEnemy } from '../src/sim/enemies';
import { applyRunResult, defaultMeta } from '../src/meta/meta';
import type { DevOp } from '../src/sim/types';
import { cfg } from './helpers';

/**
 * Keyed by DevOp rather than hand-listed, so adding an op without covering it
 * here is a compile error. The previous array silently missed 'god'.
 */
const OP_COVERAGE: Record<DevOp, true> = {
  kill_all: true,
  gold: true,
  xp: true,
  heal: true,
  invuln: true,
  god: true,
  skip_wave: true,
  summon_boss: true,
  fast_forward: true,
  spawn: true,
};

const ALL_OPS = Object.keys(OP_COVERAGE) as DevOp[];

function practiceWorld(): World {
  return new World({ ...cfg(), practice: true });
}

function dev(w: World, op: DevOp, amount = 0, enemyKey?: string): void {
  applyCommand(w, { k: 'dev', op, amount, enemyKey });
}

describe('practice tool', () => {
  it('does nothing at all in a run that did not opt in', () => {
    const w = new World(cfg());
    const gold = w.gold;
    for (const op of ALL_OPS) dev(w, op, 500);
    expect(w.gold).toBe(gold);
    expect(w.practiceUsed).toBe(false);
    expect(w.invulnerable).toBe(false);
  });

  it('marks the run the first time a command lands', () => {
    const w = practiceWorld();
    expect(w.practiceUsed).toBe(false);
    dev(w, 'gold', 100);
    expect(w.practiceUsed).toBe(true);
  });

  it('adds gold, and counts it as earned so the economy report stays honest', () => {
    const w = practiceWorld();
    const gold = w.gold;
    const earned = w.goldEarned;
    dev(w, 'gold', 500);
    expect(w.gold).toBe(gold + 500);
    expect(w.goldEarned).toBe(earned + 500);
  });

  it('kill_all clears the board but leaves the boss standing', () => {
    const w = practiceWorld();
    for (let i = 0; i < 5; i++) expect(spawnEnemy(w, 'husk', 5 + i, 5)).not.toBeNull();
    expect(spawnEnemy(w, 'warden_eater', 10, 10, { hpMul: 1, overlay: false })).not.toBeNull();
    dev(w, 'kill_all');
    const alive = w.enemies.filter((e) => !e.dead);
    expect(alive.length).toBe(1);
    expect(alive[0].boss).toBe(true);
  });

  it('heal tops up both the Warden and the Core', () => {
    const w = practiceWorld();
    w.warden.hp = 1;
    w.coreHp = 1;
    dev(w, 'heal');
    expect(w.warden.hp).toBe(w.derived.maxHp);
    expect(w.coreHp).toBe(w.coreMaxHp);
  });

  it('invuln toggles, and while it is on the Warden takes nothing', () => {
    const w = practiceWorld();
    w.warden.hp = 50;
    dev(w, 'invuln');
    expect(w.invulnerable).toBe(true);
    w.warden.dashIFrames = 0;
    damageWarden(w, 40);
    expect(w.warden.hp).toBe(50);
    dev(w, 'invuln');
    expect(w.invulnerable).toBe(false);
    damageWarden(w, 10);
    expect(w.warden.hp).toBeLessThan(50);
  });

  it('skip_wave ends the build phase, and empties a running wave', () => {
    const w = practiceWorld();
    w.phase = 'act1_build';
    w.buildTimer = 25;
    dev(w, 'skip_wave');
    expect(w.buildTimer).toBe(0);

    w.phase = 'act1_wave';
    w.spawnQueue = [[1, 0], [1, 1]];
    spawnEnemy(w, 'husk', 6, 6);
    dev(w, 'skip_wave');
    expect(w.spawnQueue.length).toBe(0);
    expect(w.enemies.filter((e) => !e.dead).length).toBe(0);
  });

  it('fast_forward and summon_boss only apply after the Sundering', () => {
    const w = practiceWorld();
    dev(w, 'fast_forward', 120);
    expect(w.act2Time).toBe(0);

    w.sundered = true;
    w.phase = 'act2';
    dev(w, 'fast_forward', 120);
    expect(w.act2Time).toBe(120);
    dev(w, 'summon_boss');
    expect(w.act2Time).toBe(w.content.spawns.bossTimeSeconds);
  });

  it('spawn (fb019 Training Grounds) puts a real enemy on the board with its full stats', () => {
    const w = practiceWorld();
    const def = w.content.enemyByKey.get('husk')!;
    const before = w.enemies.length;
    dev(w, 'spawn', 1, 'husk');
    const alive = w.enemies.filter((e) => !e.dead);
    expect(alive.length).toBe(before + 1);
    // No hpMul: a Training Grounds enemy fights exactly as it would in a live run.
    expect(alive[alive.length - 1].maxHp).toBe(def.hp);
  });

  it('spawn respects the requested count, clamped to a sane range', () => {
    const w = practiceWorld();
    dev(w, 'spawn', 5, 'husk');
    expect(w.enemies.filter((e) => !e.dead).length).toBe(5);
    dev(w, 'spawn', 9999, 'husk');
    expect(w.enemies.filter((e) => !e.dead).length).toBe(5 + 50);
  });

  it('spawn is a silent no-op for a missing key or an unknown enemy', () => {
    const w = practiceWorld();
    dev(w, 'spawn', 1);
    expect(w.enemies.length).toBe(0);
    dev(w, 'spawn', 1, 'not_a_real_enemy');
    expect(w.enemies.length).toBe(0);
  });

  it('a practice run banks nothing: no skill points, no equipment', () => {
    const run = new Run({ ...cfg(), practice: true, policy: 'none' });
    run.step({
      mx: 0,
      my: 0,
      dash: false,
      attack: false,
      aimX: 0,
      aimY: 0,
      active1Held: false,
      cmds: [{ k: 'dev', op: 'gold', amount: 999 }],
    });
    const w = run.world;
    w.equipmentFound.push('greatsword');

    const before = defaultMeta();
    const after = applyRunResult(before, run.report(), w);
    expect(after).toBe(before);
  });

  it('fb019 Training Grounds: a session that only ever spawned enemies still banks nothing', () => {
    const run = new Run({ ...cfg(), practice: true, policy: 'none' });
    run.step({
      mx: 0,
      my: 0,
      dash: false,
      attack: false,
      aimX: 0,
      aimY: 0,
      active1Held: false,
      cmds: [{ k: 'dev', op: 'spawn', amount: 3, enemyKey: 'husk' }],
    });
    const w = run.world;
    expect(w.enemies.filter((e) => !e.dead).length).toBe(3);
    w.gold += 12345; // a spawned enemy could be killed for bounty; still must not bank
    w.equipmentFound.push('greatsword');

    const before = defaultMeta();
    const after = applyRunResult(before, run.report(), w);
    expect(after).toBe(before);
  });

  it('an ordinary run still banks its rewards', () => {
    // The counterweight to the practice test above: this is the only place
    // that proves `applyRunResult` banks anything at all, so it asserts a
    // real equipment item arriving and skill points moving, not just
    // "nothing exploded".
    const run = new Run({ ...cfg(), policy: 'none' });
    run.step();
    const w = run.world;
    w.equipmentFound.push('greatsword');
    w.wavesCleared = 4;
    w.vsWavesCleared = 2;
    const before = defaultMeta();
    const after = applyRunResult(before, run.report(), w);
    expect(after.equipmentStash.greatsword).toBe((before.equipmentStash.greatsword ?? 0) + 1);
    expect(after.skillPoints).toBeGreaterThan(before.skillPoints);
  });

  it('the report says whether the tool was used', () => {
    const clean = new Run({ ...cfg(), policy: 'none' });
    clean.step();
    expect(clean.report().practiceUsed).toBe(false);

    const dirty = new Run({ ...cfg(), practice: true, policy: 'none' });
    dirty.step({
      mx: 0,
      my: 0,
      dash: false,
      attack: false,
      aimX: 0,
      aimY: 0,
      active1Held: false,
      cmds: [{ k: 'dev', op: 'heal', amount: 0 }],
    });
    expect(dirty.report().practiceUsed).toBe(true);
  });

  it('a practice run still replays exactly from its input log', () => {
    const cmds = [
      { k: 'dev' as const, op: 'gold' as const, amount: 250 },
      { k: 'dev' as const, op: 'heal' as const, amount: 0 },
    ];
    const hashes = [0, 1].map(() => {
      const run = new Run({ ...cfg(), practice: true, policy: 'none' });
      for (let t = 0; t < 120; t++) {
        run.step({
          mx: t % 3 === 0 ? 1 : 0,
          my: 0,
          dash: false,
          attack: false,
          aimX: 0,
          aimY: 0,
          active1Held: false,
          cmds: t === 30 ? cmds : [],
        });
      }
      return run.hash();
    });
    expect(hashes[0]).toBe(hashes[1]);
  });
});
