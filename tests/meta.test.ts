/** Meta layer (SPEC 8): skill points, Constellation, equipment stash, save/load. */

import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';
import { baseRunStats, derive } from '../src/sim/stats';
import type { MetaState } from '../src/sim/types';
import {
  SAVE_VERSION,
  allocate,
  canAllocate,
  canRefund,
  defaultMeta,
  deserializeMeta,
  isConnected,
  metricsFor,
  pointsAvailable,
  refund,
  serializeMeta,
} from '../src/meta/meta';
import type { RunReport } from '../src/sim/types';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const content = loadContent();

function metaWith(over: Partial<MetaState> = {}): MetaState {
  return { ...defaultMeta(), ...over };
}

describe('the Constellation (SPEC 8.1, 8.3)', () => {
  it('has 120 allocatable nodes, 3 keystones, and a connected graph', () => {
    const allocatable = content.tree.nodes.filter((n) => n.kind !== 'start');
    expect(allocatable).toHaveLength(120);
    expect(allocatable.filter((n) => n.kind === 'keystone')).toHaveLength(3);
    for (const n of content.tree.nodes) {
      if (n.kind === 'start') continue;
      expect(n.links.length, `${n.id} is orphaned`).toBeGreaterThan(0);
    }
  });

  it('p7d: skill points are the tree\'s only currency — available points is skillPoints minus allocated', () => {
    const m = metaWith({ skillPoints: 5 });
    expect(pointsAvailable(m)).toBe(5);
    const a = content.treeById.get(0)!.links[0];
    const spent = allocate(m, a);
    expect(pointsAvailable(spent)).toBe(4);
  });

  it('only allows nodes adjacent to what is already taken', () => {
    const m = metaWith({ skillPoints: 3 });
    const start = content.treeById.get(0)!;
    const near = start.links[0];
    const far = content.tree.nodes.find(
      (n) => n.kind !== 'start' && !start.links.includes(n.id) && !n.links.includes(0),
    )!;
    expect(canAllocate(m, near)).toBe(true);
    expect(canAllocate(m, far.id)).toBe(false);
  });

  it('refuses to allocate without points', () => {
    const m = metaWith({ skillPoints: 1, allocated: [0, content.treeById.get(0)!.links[0]] });
    expect(pointsAvailable(m)).toBe(0);
    const next = content.treeById.get(content.treeById.get(0)!.links[0])!.links.find((l) => l !== 0)!;
    expect(canAllocate(m, next)).toBe(false);
  });

  it('refuses a refund that would orphan a downstream node', () => {
    let m = metaWith({ skillPoints: 10 });
    const a = content.treeById.get(0)!.links[0];
    m = allocate(m, a);
    const b = content.treeById.get(a)!.links.find((l) => l !== 0)!;
    m = allocate(m, b);
    expect(canRefund(m, b)).toBe(true);
    expect(canRefund(m, a)).toBe(false);
  });

  it('§8.3 (Q46): "respec 1 point per node" — refunding charges the tree\'s respecCostPerNode in skill points', () => {
    let m = metaWith({ skillPoints: 10 });
    const a = content.treeById.get(0)!.links[0];
    m = allocate(m, a);
    const before = m.skillPoints;
    m = refund(m, a);
    expect(m.allocated).not.toContain(a);
    expect(before - m.skillPoints).toBe(content.tree.respecCostPerNode);
  });

  it('a free (same-visit) refund costs nothing', () => {
    let m = metaWith({ skillPoints: 10 });
    const a = content.treeById.get(0)!.links[0];
    m = allocate(m, a);
    const before = m.skillPoints;
    m = refund(m, a, { free: true });
    expect(m.skillPoints).toBe(before);
  });

  it('refuses a paid refund without enough skill points banked', () => {
    let m = metaWith({ skillPoints: content.tree.respecCostPerNode });
    const a = content.treeById.get(0)!.links[0];
    m = allocate(m, a);
    // Spending down to exactly 0 leaves nothing to pay the respec fee with.
    m = { ...m, skillPoints: 0 };
    expect(canRefund(m, a)).toBe(false);
  });

  it('feeds allocated node stats into the run stat sheet', () => {
    const node = content.tree.nodes.find((n) => n.stats.power)!;
    const plain = derive(content, baseRunStats(content, cfg()));
    const withNode = derive(content, baseRunStats(content, cfg({ allocated: [node.id] })));
    expect(withNode.powerMul).toBeGreaterThan(plain.powerMul);
  });
});

describe('save / load', () => {
  it('round-trips a populated account exactly', () => {
    const a = content.treeById.get(0)!.links[0];
    const meta = metaWith({
      skillPoints: 7,
      allocated: [0, a],
      equipmentStash: { greatsword: 2 },
      equippedEquipment: { ...defaultMeta().equippedEquipment, weapon: 'greatsword' },
      unlockedClasses: ['engineer', 'pyromancer'],
      highestTier: 3,
      questProgress: { wins: 4, lifetime_gold: 9000 },
      completedQuests: ['win_a_run'],
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

  it('p7g: a malformed equipmentStash/questProgress coerces to {} instead of losing the whole account', () => {
    // Filed when `equipmentStash` was still the old array-shaped `stash` field
    // and `migrate()` had no guard on it at all, so a corrupt value threw out
    // of `migrateWithNotice`, `loadMeta`'s try/catch caught it, and the entire
    // account — level, unlocks, quests — was silently replaced with a fresh
    // one. Re-measured (CLAUDE.md's "a deferral is a measurement with an
    // expiry date"): p7d's rename to the `Record<string, number>`-shaped
    // `equipmentStash` and p7f's field-by-field rebuild already added a type
    // guard on this field. `questProgress` is the same object-shaped class.
    // Only a string or an array actually exercise the guard (object-spreading
    // `null`/a number/a boolean is already `{}` with no guard at all).
    for (const field of ['equipmentStash', 'questProgress'] as const) {
      for (const bad of ['nope', ['x', null, 1]]) {
        const json = JSON.stringify({ version: SAVE_VERSION, meta: { ...metaWith(), [field]: bad } });
        expect(() => deserializeMeta(json), `${field} = ${JSON.stringify(bad)}`).not.toThrow();
        expect(deserializeMeta(json)[field]).toEqual({});
      }
    }
  });

  it('p7g: a malformed allocated/unlockedClasses/completedQuests coerces to [] instead of throwing out of migrate()', () => {
    // code-reviewer finding on this item: `[...x]` throws `TypeError: x is not
    // iterable` for any non-nullish, non-iterable `x` (a number, a boolean, a
    // plain object) — unlike an object spread, which degrades harmlessly to
    // `{}`. That throw used to propagate out of `migrate()` and hit `loadMeta`'s
    // outer catch, discarding the *entire* account — the same failure class as
    // the `equipmentStash` case above, just reproduced on these three fields
    // instead. `null` is excluded: `?? base`/`?? []` already covers it.
    for (const field of ['allocated', 'unlockedClasses', 'completedQuests'] as const) {
      for (const bad of [42, true, {}]) {
        const json = JSON.stringify({ version: SAVE_VERSION, meta: { ...metaWith(), [field]: bad } });
        expect(() => deserializeMeta(json), `${field} = ${JSON.stringify(bad)}`).not.toThrow();
      }
    }
  });

  it('p7g: the rest of the account survives alongside a repaired corrupt field', () => {
    // Not just "does not throw" but "does not discard everything else" — the
    // part of the original bug report that mattered most.
    const json = JSON.stringify({
      version: 1,
      meta: {
        equipmentStash: 'nope',
        completedQuests: 42,
        skillPoints: 42,
        highestTier: 3,
        unlockedClasses: ['engineer', 'pyromancer'],
      },
    });
    const migrated = deserializeMeta(json);
    expect(migrated.skillPoints).toBe(42);
    expect(migrated.highestTier).toBe(3);
    expect(migrated.unlockedClasses).toEqual(['engineer', 'pyromancer']);
    expect(migrated.completedQuests).toEqual([]);
    expect(migrated.equipmentStash).toEqual({});
  });

  it('opens a new account with 0 skill points — the Hub explains itself rather than starting pre-spent', () => {
    const fresh = defaultMeta();
    expect(fresh.skillPoints).toBe(0);
    expect(pointsAvailable(fresh)).toBe(0);
  });

  it('repairs a save whose allocation graph is disconnected', () => {
    const bad = JSON.stringify({ version: 1, meta: metaWith({ allocated: [0, 119] }) });
    expect(isConnected([0, 119])).toBe(false);
    expect(deserializeMeta(bad).allocated).toEqual([0]);
  });

  it('p7d (Q46): a pre-p7d save\'s leftover Ember converts once, at 100:1, into skill points', () => {
    const legacy = JSON.stringify({
      version: 3,
      meta: { ...metaWith(), ember: 1234, accountLevel: 9 },
    });
    const migrated = deserializeMeta(legacy);
    expect(migrated.skillPoints).toBe(Math.floor(1234 / 100));
    expect((migrated as unknown as Record<string, unknown>).ember).toBeUndefined();
    expect((migrated as unknown as Record<string, unknown>).accountLevel).toBeUndefined();
  });

  it('adds the converted Ember on top of any skillPoints already earned this way', () => {
    const legacy = JSON.stringify({
      version: 2,
      meta: { ...metaWith(), skillPoints: 5, ember: 300 },
    });
    expect(deserializeMeta(legacy).skillPoints).toBe(5 + 3);
  });

  it('a save already at SAVE_VERSION 4 does not re-convert a stray ember field', () => {
    const modern = JSON.stringify({
      version: 4,
      meta: { ...metaWith(), skillPoints: 5, ember: 9999 },
    });
    // version >= ECONOMY_RETIRED_AT: no conversion — the stray field never
    // contributes to skillPoints. (It is also dropped outright, per p7f below;
    // this test only pins the non-conversion.)
    expect(deserializeMeta(modern).skillPoints).toBe(5);
  });

  it('p7f: migrate() builds from the known key set, not a wholesale spread — a junk key never round-trips, at any version', () => {
    // Before p7f, `{...base, ...meta, <overrides>}` copied every key `meta`
    // carried, so an arbitrary key survived every re-serialize forever
    // (RETIRED_KEYS only ever stripped its own six named fields, and only for
    // saves older than the version that retired each one). A save carrying a
    // field the client has never heard of — a future field, a hand-edit, a
    // save from a fork — must not become a permanent zombie in this account.
    for (const version of [0, 1, 4, SAVE_VERSION, 999]) {
      const dirty = JSON.stringify({
        version,
        meta: { ...metaWith(), someFutureField: 'zzz', anotherOne: { nested: 1 }, 7: 'index-key' },
      });
      const migrated = deserializeMeta(dirty) as unknown as Record<string, unknown>;
      expect(Object.keys(migrated).sort(), `version ${version}`).toEqual(Object.keys(defaultMeta()).sort());
    }
  });

  it('p7f: a non-object meta (e.g. a bare string) migrates to exactly the MetaState key set, not a character-spread', () => {
    // `{"meta":"orbs"}` used to string-spread into indexed keys (`{0:'o',1:'r',...}`)
    // via `...meta`, and those junk keys re-serialised stably. A non-object
    // `meta` should just fall back to defaults field-by-field.
    const stringMeta = JSON.stringify({ version: SAVE_VERSION, meta: 'orbs' });
    const migrated = deserializeMeta(stringMeta) as unknown as Record<string, unknown>;
    expect(Object.keys(migrated).sort()).toEqual(Object.keys(defaultMeta()).sort());
    expect(migrated).toEqual(defaultMeta());
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
      vsWavesCleared: 2,
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
      typeMastery: {},
      skillCards: {},
      equipmentFound: 0,
      bossKilled: true,
      bossKillSeconds: 590,
      endHash: '',
      practiceUsed: false,
      sealed: false,
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
