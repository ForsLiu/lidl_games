/** Meta layer (SPEC 8): Ember, Constellation, stash, save/load. */

import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';
import { Rng } from '../src/sim/rng';
import { rollRelic } from '../src/sim/loot';
import { baseRunStats, derive } from '../src/sim/stats';
import type { MetaState, Relic } from '../src/sim/types';
import {
  accountLevelFor,
  allocate,
  canAllocate,
  canRefund,
  defaultMeta,
  deserializeMeta,
  emberFor,
  isConnected,
  metricsFor,
  pointsAvailable,
  refund,
  serializeMeta,
  stashCapacity,
} from '../src/meta/meta';
import { discard, equip } from '../src/meta/stash';
import type { RunReport } from '../src/sim/types';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const content = loadContent();

function metaWith(over: Partial<MetaState> = {}): MetaState {
  return { ...defaultMeta(), ...over };
}

function someRelic(id = 1, rarity = 'magic'): Relic {
  return rollRelic(content, new Rng(id * 17 + 3), 0, id, rarity);
}

describe('the Constellation (SPEC 8.1)', () => {
  it('has 120 allocatable nodes, 3 keystones, and a connected graph', () => {
    const allocatable = content.tree.nodes.filter((n) => n.kind !== 'start');
    expect(allocatable).toHaveLength(120);
    expect(allocatable.filter((n) => n.kind === 'keystone')).toHaveLength(3);
    for (const n of content.tree.nodes) {
      if (n.kind === 'start') continue;
      expect(n.links.length, `${n.id} is orphaned`).toBeGreaterThan(0);
    }
  });

  it('grants one point per account level', () => {
    const m = metaWith({ accountLevel: 5 });
    expect(pointsAvailable(m)).toBe(5);
  });

  it('only allows nodes adjacent to what is already taken', () => {
    const m = metaWith({ accountLevel: 3 });
    const start = content.treeById.get(0)!;
    const near = start.links[0];
    const far = content.tree.nodes.find(
      (n) => n.kind !== 'start' && !start.links.includes(n.id) && !n.links.includes(0),
    )!;
    expect(canAllocate(m, near)).toBe(true);
    expect(canAllocate(m, far.id)).toBe(false);
  });

  it('refuses to allocate without points', () => {
    const m = metaWith({ accountLevel: 1, allocated: [0, content.treeById.get(0)!.links[0]] });
    expect(pointsAvailable(m)).toBe(0);
    const next = content.treeById.get(content.treeById.get(0)!.links[0])!.links.find((l) => l !== 0)!;
    expect(canAllocate(m, next)).toBe(false);
  });

  it('refuses a refund that would orphan a downstream node', () => {
    let m = metaWith({ accountLevel: 10, ember: 1000 });
    const a = content.treeById.get(0)!.links[0];
    m = allocate(m, a);
    const b = content.treeById.get(a)!.links.find((l) => l !== 0)!;
    m = allocate(m, b);
    expect(canRefund(m, b)).toBe(true);
    expect(canRefund(m, a)).toBe(false);
  });

  it('charges Ember to refund a node', () => {
    let m = metaWith({ accountLevel: 10, ember: 1000 });
    const a = content.treeById.get(0)!.links[0];
    m = allocate(m, a);
    const before = m.ember;
    m = refund(m, a);
    expect(m.allocated).not.toContain(a);
    expect(before - m.ember).toBe(content.tree.respecCostPerNode);
  });

  it('feeds allocated node stats into the run stat sheet', () => {
    const node = content.tree.nodes.find((n) => n.stats.power)!;
    const plain = derive(content, baseRunStats(content, cfg()));
    const withNode = derive(content, baseRunStats(content, cfg({ allocated: [node.id] })));
    expect(withNode.powerMul).toBeGreaterThan(plain.powerMul);
  });

  it('raises the account level as Ember accumulates', () => {
    expect(accountLevelFor(0)).toBe(1);
    expect(accountLevelFor(100)).toBe(2);
    expect(accountLevelFor(1e9)).toBe(content.tree.maxAccountLevel);
  });
});

// SPEC-V3 §8 deletes Orbs, so the five Orb-crafting tests that lived here
// (Whetting / Turning / Ascension / spend-and-refuse / purity) went with
// `src/meta/crafting.ts`. Equip and discard are stash mechanics V3 keeps.
describe('the relic stash (SPEC 7)', () => {
  it('equips only into the matching slot, and discarding unequips', () => {
    const relic = someRelic(6, 'magic');
    let m = metaWith({ stash: [relic] });
    const wrong = content.relics.slots.find((s) => s !== relic.slot)!;
    expect(equip(m, wrong, relic.id).equipped).toEqual(m.equipped);
    m = equip(m, relic.slot, relic.id);
    expect(m.equipped[relic.slot as 'sigil']).toBe(relic.id);
    m = discard(m, relic.id);
    expect(m.stash).toHaveLength(0);
    expect(m.equipped[relic.slot as 'sigil']).toBeNull();
  });

  it('caps the stash at the SPEC 7 size', () => {
    expect(stashCapacity(defaultMeta())).toBe(content.relics.stashSlots);
    expect(stashCapacity(metaWith({ completedQuests: ['archivist'] }))).toBe(
      content.relics.stashSlots + 8,
    );
  });
});

describe('save / load', () => {
  it('round-trips a populated account exactly', () => {
    const a = content.treeById.get(0)!.links[0];
    const meta = metaWith({
      accountLevel: 7,
      ember: 1234,
      allocated: [0, a],
      stash: [someRelic(1, 'rare'), someRelic(2, 'magic')],
      equipped: { sigil: null, plate: null, charm: null },
      unlockedClasses: ['engineer', 'pyromancer'],
      highestTier: 3,
      questProgress: { wins: 4, lifetime_gold: 9000 },
      completedQuests: ['win_a_run'],
      nextRelicId: 9,
    });
    const back = deserializeMeta(serializeMeta(meta));
    expect(back).toEqual(meta);
  });

  it('survives a corrupt or empty save without throwing', () => {
    expect(() => deserializeMeta('{}')).not.toThrow();
    // A corrupt save falls back to a brand-new account, whatever that is worth.
    expect(deserializeMeta('{}')).toEqual(defaultMeta());
    expect(deserializeMeta('{"version":1}').allocated).toEqual([0]);
  });

  it('opens a new account with the starting Ember and the level it buys', () => {
    const fresh = defaultMeta();
    expect(fresh.ember).toBe(content.tree.startingEmber);
    expect(fresh.accountLevel).toBe(accountLevelFor(content.tree.startingEmber));
    // The point of the starting Ember is that the Hub is not a dead screen.
    expect(pointsAvailable(fresh)).toBeGreaterThan(0);
  });

  it('repairs a save whose allocation graph is disconnected', () => {
    const bad = JSON.stringify({ version: 1, meta: metaWith({ allocated: [0, 119] }) });
    expect(isConnected([0, 119])).toBe(false);
    expect(deserializeMeta(bad).allocated).toEqual([0]);
  });
});

describe('Ember rewards (SPEC 8.1)', () => {
  it('pays more for a higher tier and more modifiers', () => {
    const base = {
      seed: 1,
      policy: 'x',
      classKey: 'engineer',
      core: 'stone_heart',
      modifiers: [] as string[],
      outcome: 'victory' as const,
      ticks: 0,
      totalSeconds: 0,
      act1Seconds: 0,
      act2Seconds: 0,
      wavesCleared: 10,
      coreHp: 100,
      coreMaxHp: 500,
      goldEarned: 0,
      goldSpent: 0,
      goldLeft: 0,
      towersBuilt: 0,
      towersByKey: {},
      survivalSeconds: 600,
      level: 30,
      kills: 0,
      leaks: 0,
      damageByWeapon: {},
      damageByType: {},
      damageTotal: 0,
      damageThroughMinute8: null,
      spawnedByWave: [],
      leaksByWave: [],
      goldEarnedByWave: [],
      topWeaponShareMinute8: 0,
      topWeaponMinute8: '',
      weapons: [],
      boons: {},
      relicsFound: 0,
      ember: 0,
      bossKilled: true,
      bossKillSeconds: 590,
      endHash: '',
      practiceUsed: false,
    };
    // A real World, not a hand-built stub: the stub this replaced was cast
    // `as never`, so when m19b renamed `derived.emberFind` to `emberFindMul`
    // nothing type-checked it and `emberFor` quietly returned NaN.
    const w = new World(cfg());
    const t1 = emberFor({ ...base, tier: 1 }, w);
    const t3 = emberFor({ ...base, tier: 3, modifiers: ['tough', 'fleet'] }, w);
    expect(t1).toBeGreaterThan(0);
    expect(t3).toBeGreaterThan(t1);
  });
});

describe('quest metrics (Q101, p2e)', () => {
  function reportWith(towersByKey: Record<string, number>): RunReport {
    return {
      seed: 1,
      policy: 'x',
      classKey: 'engineer',
      core: 'stone_heart',
      tier: 1,
      modifiers: [],
      outcome: 'victory',
      ticks: 0,
      totalSeconds: 0,
      act1Seconds: 0,
      act2Seconds: 0,
      wavesCleared: 10,
      coreHp: 100,
      coreMaxHp: 500,
      goldEarned: 0,
      goldSpent: 0,
      goldLeft: 0,
      towersBuilt: 0,
      towersByKey,
      survivalSeconds: 600,
      level: 30,
      kills: 0,
      leaks: 0,
      damageByWeapon: {},
      damageByType: {},
      damageTotal: 0,
      spawnedByWave: [],
      leaksByWave: [],
      goldEarnedByWave: [],
      damageThroughMinute8: null,
      topWeaponShareMinute8: 0,
      topWeaponMinute8: '',
      boons: {},
      relicsFound: 0,
      ember: 0,
      bossKilled: true,
      bossKillSeconds: 590,
      endHash: '',
      practiceUsed: false,
    };
  }

  const w = new World(cfg());

  it('"Ascetic" (wins_max4towertypes) does not charge a wall against the cap', () => {
    // A maze plus exactly 4 attacking types is meant to qualify (mirrors the
    // pre-p2e metric, which only ever counted towers that granted a weapon —
    // Palisade's `soul` was null, so a wall was always free).
    const withWall = metricsFor(
      reportWith({ palisade: 15, arrow_spire: 10, ballista: 6, frost_obelisk: 5, venom_spore: 2 }),
      w,
    );
    expect(withWall.wins_max4towertypes).toBe(1);

    // A fifth *attacking* type still fails the cap.
    const fiveAttackers = metricsFor(
      reportWith({
        palisade: 15,
        arrow_spire: 10,
        ballista: 6,
        frost_obelisk: 5,
        venom_spore: 2,
        tesla_coil: 1,
      }),
      w,
    );
    expect(fiveAttackers.wins_max4towertypes).toBe(0);
  });
});
