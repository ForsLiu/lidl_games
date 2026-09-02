/**
 * fb034: Practice tool "Max all towers" — instantly raises every placed
 * tower (and the Core) to its final upgrade step, free. A practice-run-only
 * extension of `run.ts`'s `applyDevCommand` (SPEC has no such mode; see
 * practice.test.ts), mirroring `upgradeTower`/`upgradeCore`'s own math so a
 * maxed structure/Core is identical to one bought step by step.
 */

import { describe, expect, it } from 'vitest';

import { applyCommand, applyDevCommand, Run } from '../src/sim/run';
import { maxLevel, structureMaxHp } from '../src/sim/towers';
import { upgradeCore } from '../src/sim/cores';
import { damageStructure } from '../src/sim/enemies';
import { emptyInput } from '../src/sim/types';
import type { TickInput } from '../src/sim/types';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

function step(run: Run, cmds: TickInput['cmds'] = []): void {
  run.step({ ...emptyInput(), cmds });
}

/** Places the Warden on the build tile first, matching p-core-b-effects.test.ts's `buildAt` — the default spawn point is not always within `buildRange` of an arbitrary tile. */
function buildAt(w: World, tx: number, ty: number): void {
  w.warden.x = tx + 0.5;
  w.warden.y = ty + 0.5;
  w.gold = 1e6;
  const arrowSpireId = w.content.towerByKey.get('arrow_spire')!.id;
  applyCommand(w, { k: 'build', tower: arrowSpireId, tx, ty });
}

describe('fb034 practice tool: max all towers', () => {
  it('raises a freshly built tower straight to its final tier, free, and is a no-op outside practice', () => {
    const run = new Run({ ...cfg(), practice: true, policy: 'none' });
    const w = run.world;
    buildAt(w, 5, 5);
    const s = w.structureAt(5, 5)!;
    expect(s.tier).toBe(1);
    const def = w.content.towerById.get(s.towerId)!;
    const goldBefore = w.gold;

    applyDevCommand(w, 'max_towers', 0);
    expect(s.tier).toBe(maxLevel(def));
    expect(s.maxHp).toBeCloseTo(structureMaxHp(w, def, maxLevel(def)), 6);
    expect(s.hp).toBeCloseTo(s.maxHp, 6);
    expect(w.gold).toBe(goldBefore);

    const off = new Run({ ...cfg(), policy: 'none' });
    buildAt(off.world, 5, 5);
    const sOff = off.world.structureAt(5, 5)!;
    applyDevCommand(off.world, 'max_towers', 0);
    expect(sOff.tier).toBe(1);
    expect(off.world.practiceUsed).toBe(false);
  });

  it('preserves a wound ratio across the jump, the same rule upgradeTower applies one step at a time', () => {
    const run = new Run({ ...cfg(), practice: true, policy: 'none' });
    const w = run.world;
    buildAt(w, 5, 5);
    const s = w.structureAt(5, 5)!;
    damageStructure(w, s, s.maxHp * 0.5);
    const ratioBefore = s.hp / s.maxHp;
    expect(ratioBefore).toBeLessThan(1); // armour softened the raw 50% hit; the exact number doesn't matter, only that it carries across the jump below
    expect(ratioBefore).toBeGreaterThan(0);

    applyDevCommand(w, 'max_towers', 0);
    expect(s.hp / s.maxHp).toBeCloseTo(ratioBefore, 6);
  });

  it('leaves a petrified structure alone', () => {
    const run = new Run({ ...cfg(), practice: true, policy: 'none' });
    const w = run.world;
    buildAt(w, 5, 5);
    const s = w.structureAt(5, 5)!;
    s.petrified = true;
    const tierBefore = s.tier;
    const maxHpBefore = s.maxHp;

    applyDevCommand(w, 'max_towers', 0);
    expect(s.tier).toBe(tierBefore);
    expect(s.maxHp).toBe(maxHpBefore);
  });

  it('leaves a dead structure alone — reachable because `w.structures` keeps a dead entry until World.compact() runs, unlike `structureAt`', () => {
    const run = new Run({ ...cfg(), practice: true, policy: 'none' });
    const w = run.world;
    buildAt(w, 5, 5);
    const s = w.structureAt(5, 5)!;
    w.removeStructure(s);
    expect(w.structures).toContain(s); // still in the array, pre-compact
    const tierBefore = s.tier;
    const maxHpBefore = s.maxHp;

    applyDevCommand(w, 'max_towers', 0);
    expect(s.tier).toBe(tierBefore);
    expect(s.maxHp).toBe(maxHpBefore);
  });

  it('is idempotent: a second call on an already-maxed board changes nothing', () => {
    const run = new Run({ ...cfg(), practice: true, policy: 'none' });
    const w = run.world;
    buildAt(w, 5, 5);
    const s = w.structureAt(5, 5)!;
    applyDevCommand(w, 'max_towers', 0);
    const tier = s.tier;
    const maxHp = s.maxHp;
    const hp = s.hp;
    const coreStep = w.coreStep;
    const coreMaxHp = w.coreMaxHp;

    applyDevCommand(w, 'max_towers', 0);
    expect(s.tier).toBe(tier);
    expect(s.maxHp).toBe(maxHp);
    expect(s.hp).toBe(hp);
    expect(w.coreStep).toBe(coreStep);
    expect(w.coreMaxHp).toBe(coreMaxHp);
  });

  it('walks the Core free to its final upgrade step, matching a step-by-step purchase exactly', () => {
    const bought = new Run({ ...cfg(), policy: 'none' });
    const bw = bought.world;
    const def = bw.content.coreByKey.get(bw.coreKey)!;
    bw.gold = 1e6;
    // Buy every step for real, at real cost, from the Warden's default spawn
    // position (already within Core build range — see p-core-b-effects.test.ts).
    while (bw.coreStep < def.upgrade.count) expect(upgradeCore(bw)).toBe(true);
    expect(bw.coreStep).toBe(def.upgrade.count);

    const maxed = new Run({ ...cfg(), practice: true, policy: 'none' });
    const mw = maxed.world;
    const goldBefore = mw.gold;
    applyDevCommand(mw, 'max_towers', 0);
    expect(mw.coreStep).toBe(def.upgrade.count);
    expect(mw.coreMaxHp).toBeCloseTo(bw.coreMaxHp, 6);
    expect(mw.gold).toBe(goldBefore);
  });

  it('replays exactly from its input log with max_towers in it', () => {
    const cmdsAt: Record<number, TickInput['cmds']> = {
      2: [{ k: 'build', tower: 1, tx: 5, ty: 5 }],
      5: [{ k: 'dev', op: 'max_towers', amount: 0 }],
    };
    const hashes = [0, 1].map(() => {
      const run = new Run({ ...cfg(), practice: true, policy: 'none' });
      for (let t = 0; t < 60; t++) {
        step(run, cmdsAt[t] ?? []);
      }
      return run.hash();
    });
    expect(hashes[0]).toBe(hashes[1]);
  });
});
