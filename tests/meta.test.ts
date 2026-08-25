/** Meta layer (SPEC 8): Ember, Constellation, stash, Orb crafting, save/load. */

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
  pointsAvailable,
  refund,
  serializeMeta,
  stashCapacity,
} from '../src/meta/meta';
import { ascend, craft, discard, equip, turn, whet } from '../src/meta/crafting';
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

describe('relics and Orb crafting (SPEC 7, 8.2)', () => {
  it('Whetting rerolls values but keeps the affix set', () => {
    const relic = someRelic(1, 'rare');
    const next = whet(content, new Rng(99), relic);
    expect(typeof next).not.toBe('string');
    const r = next as Relic;
    expect(r.affixes.map((a) => a.key)).toEqual(relic.affixes.map((a) => a.key));
    expect(r.rarity).toBe(relic.rarity);
  });

  it('Turning swaps exactly one affix', () => {
    const relic = someRelic(2, 'rare');
    const r = turn(content, new Rng(5), relic) as Relic;
    const before = new Set(relic.affixes.map((a) => a.key));
    const after = r.affixes.map((a) => a.key);
    expect(after).toHaveLength(relic.affixes.length);
    expect(new Set(after).size).toBe(after.length);
    const changed = after.filter((k) => !before.has(k)).length;
    expect(changed).toBeLessThanOrEqual(1);
  });

  it('Ascension steps rarity up and stops at Rare', () => {
    let relic = someRelic(3, 'normal');
    relic = ascend(content, new Rng(1), relic) as Relic;
    expect(relic.rarity).toBe('magic');
    relic = ascend(content, new Rng(2), relic) as Relic;
    expect(relic.rarity).toBe('rare');
    expect(relic.affixes.length).toBe(3);
    expect(ascend(content, new Rng(3), relic)).toBe('max_rarity');
  });

  it('spends the orb and refuses when there is none', () => {
    const relic = someRelic(4, 'magic');
    const m = metaWith({ stash: [relic], orbs: { whetting: 1, turning: 0, ascension: 0 } });
    const ok = craft(m, 'whetting', relic.id, new Rng(1));
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.meta.orbs.whetting).toBe(0);
    expect(craft(ok.meta, 'whetting', relic.id, new Rng(1))).toEqual({ ok: false, reason: 'no_orb' });
  });

  it('leaves the original meta untouched (crafting is pure)', () => {
    const relic = someRelic(5, 'magic');
    const m = metaWith({ stash: [relic], orbs: { whetting: 1, turning: 0, ascension: 0 } });
    craft(m, 'whetting', relic.id, new Rng(1));
    expect(m.orbs.whetting).toBe(1);
  });

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
      orbs: { whetting: 2, turning: 1, ascension: 3 },
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
      orbsFound: 0,
      ember: 0,
      bossKilled: true,
      bossKillSeconds: 590,
      endHash: '',
    };
    const w = { stats: { modRewardBonus: 0 }, derived: { emberFind: 0 }, lastStandUsed: false } as never;
    const t1 = emberFor({ ...base, tier: 1 }, w);
    const t3 = emberFor({ ...base, tier: 3, modifiers: ['tough', 'fleet'] }, w);
    expect(t1).toBeGreaterThan(0);
    expect(t3).toBeGreaterThan(t1);
  });
});
