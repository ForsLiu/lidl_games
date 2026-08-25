/**
 * Gate C7 (SPEC-V3 §12), save-migration half: "orbs appear nowhere … + save
 * migration test".
 *
 * QA measured the pre-migration behaviour as low urgency — a v0.2 save with an
 * `orbs` key loaded and rendered fine — but the key survived as a zombie that
 * `serializeMeta` wrote back on every save, forever. This pins that it is
 * stripped, and, more importantly, that stripping it does not take anything
 * else with it.
 */

import { describe, expect, it } from 'vitest';

import {
  SAVE_VERSION,
  defaultMeta,
  deserializeMeta,
  serializeMeta,
} from '../src/meta/meta';
import type { MetaState, Relic } from '../src/sim/types';

function relic(id: number, slot: string): Relic {
  return { id, slot, rarity: 'rare', name: `Relic ${id}`, affixes: [{ key: 'power', stat: 'power', value: 0.08 }] };
}

/** A save exactly as a v0.2 client would have written it, orbs and all. */
function v2Save(): string {
  return JSON.stringify({
    version: 1,
    meta: {
      accountLevel: 7,
      ember: 1234,
      allocated: [0],
      stash: [relic(1, 'sigil'), relic(2, 'plate')],
      equipped: { sigil: 1, plate: null, charm: null },
      orbs: { whetting: 3, turning: 2, ascension: 1 },
      unlockedClasses: ['engineer', 'pyromancer'],
      highestTier: 4,
      questProgress: { wins: 6, lifetime_gold: 12000 },
      completedQuests: ['win_a_run'],
      nextRelicId: 9,
    },
  });
}

describe('C7: migrating a v0.2 save', () => {
  it('drops the orbs key', () => {
    const out = deserializeMeta(v2Save()) as unknown as Record<string, unknown>;
    expect(out.orbs).toBeUndefined();
  });

  it('keeps every other field intact', () => {
    const out = deserializeMeta(v2Save());
    expect(out.accountLevel).toBe(7);
    expect(out.ember).toBe(1234);
    expect(out.highestTier).toBe(4);
    expect(out.nextRelicId).toBe(9);
    expect(out.unlockedClasses).toEqual(['engineer', 'pyromancer']);
    expect(out.completedQuests).toEqual(['win_a_run']);
    expect(out.questProgress).toEqual({ wins: 6, lifetime_gold: 12000 });
    expect(out.stash.map((r) => r.id)).toEqual([1, 2]);
    expect(out.stash[0].affixes).toEqual([{ key: 'power', stat: 'power', value: 0.08 }]);
    expect(out.equipped.sigil).toBe(1);
  });

  it('re-serialises without the orbs key, and stably', () => {
    const once = serializeMeta(deserializeMeta(v2Save()));
    expect(once).not.toMatch(/orbs/);
    // A second round trip must be a fixed point, or every save would rewrite
    // the file and the "zombie key" problem would simply move.
    const twice = serializeMeta(deserializeMeta(once));
    expect(twice).toBe(once);
  });

  it('stamps the new save version', () => {
    expect(SAVE_VERSION).toBeGreaterThan(1);
    const parsed = JSON.parse(serializeMeta(defaultMeta())) as { version: number };
    expect(parsed.version).toBe(SAVE_VERSION);
  });

  it('a v0.2 save still round-trips to something a fresh client can use', () => {
    const out = deserializeMeta(v2Save());
    // Same shape as a brand-new account, minus the values the save carried.
    const fresh = defaultMeta();
    expect(Object.keys(out).sort()).toEqual(Object.keys(fresh).sort());
  });

  it('only strips a retired key from saves older than the version that retired it', () => {
    // QA's repro: a future client that legitimately reuses the name for
    // something else must not have that field eaten on every load.
    const future = JSON.stringify({
      version: SAVE_VERSION,
      meta: { ...defaultMeta(), orbs: { newMechanic: 42 } },
    });
    const out = deserializeMeta(future) as unknown as Record<string, unknown>;
    expect(out.orbs).toEqual({ newMechanic: 42 });
  });

  it('never strips a name the current MetaState actually uses', () => {
    // The second guard: even from an old save, a retired name that is a live
    // field today must survive. This is what stops a future rename from
    // quietly deleting real data.
    const out = deserializeMeta(v2Save());
    for (const key of Object.keys(defaultMeta())) {
      expect(out, key).toHaveProperty(key);
    }
  });

  it('survives a save with no orbs key at all (already-migrated)', () => {
    const migrated = serializeMeta(deserializeMeta(v2Save()));
    expect(() => deserializeMeta(migrated)).not.toThrow();
    expect(deserializeMeta(migrated).ember).toBe(1234);
  });

  it('survives a save whose orbs key is malformed', () => {
    for (const junk of ['null', '5', '"three"', '[]', '{"whetting":"lots"}']) {
      const save = v2Save().replace('{"whetting":3,"turning":2,"ascension":1}', junk);
      expect(() => deserializeMeta(save), junk).not.toThrow();
      const out = deserializeMeta(save) as unknown as Record<string, unknown>;
      expect(out.orbs, junk).toBeUndefined();
      expect((out as unknown as MetaState).ember, junk).toBe(1234);
    }
  });
});
