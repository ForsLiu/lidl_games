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
  loadMetaWithNotice,
  serializeMeta,
} from '../src/meta/meta';
import { withSavedRaw } from '../tools/fuzz-save';
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
    // fb023: `stash`/`equipped` are the one exception — see the dedicated
    // "dropping relics at migration" block below for why they do not survive.
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

  // qa-playtester (fb023): `equippedEquipment` had no `equipmentStash`-style
  // type guard — a corrupt non-object value spread character-by-character
  // (string) or index-by-index (array) into junk keys that then persisted
  // through every re-serialize.
  it('survives a save whose equippedEquipment key is malformed', () => {
    for (const junk of ['"hacked"', '["x","y","z"]', '5', 'null']) {
      const save = JSON.stringify({ version: SAVE_VERSION, meta: { ...defaultMeta() } }).replace(
        '"equippedEquipment":{"weapon":null,"armor":null,"shoes":null,"ring":null,"necklace":null,"bracelet":null}',
        `"equippedEquipment":${junk}`,
      );
      expect(() => deserializeMeta(save), junk).not.toThrow();
      const out = deserializeMeta(save);
      expect(out.equippedEquipment, junk).toEqual(defaultMeta().equippedEquipment);
      expect(Object.keys(out.equippedEquipment).sort(), junk).toEqual(
        Object.keys(defaultMeta().equippedEquipment).sort(),
      );
    }
  });
});

/**
 * fb023 (SPEC-FINAL §7): the relic stash/equip UI is retired, so a save
 * written before `RELICS_DROPPED_AT` (3) has its `stash`/`equipped` dropped
 * outright on load rather than carried forward into a screen that no longer
 * exists to show them — "old relics are dropped with a one-time notice" from
 * the owner feedback this item implements. Same v0.2 fixture `v2Save()`
 * already uses above (`version: 1`, well under the cutoff).
 */
describe('fb023: dropping relics at migration', () => {
  it('an old save with a real relic loadout has it dropped', () => {
    const out = deserializeMeta(v2Save());
    expect(out.stash).toEqual([]);
    expect(out.equipped).toEqual({ sigil: null, plate: null, charm: null });
  });

  it('loadMetaWithNotice reports the one-time drop for an old save that had relics', () => {
    const { meta, notice } = withSavedRaw(v2Save(), () => loadMetaWithNotice());
    expect(meta.stash).toEqual([]);
    expect(notice).toMatch(/relics/i);
  });

  it('loadMetaWithNotice reports no notice for a fresh save at the current version', () => {
    const fresh = serializeMeta(defaultMeta());
    const { notice } = withSavedRaw(fresh, () => loadMetaWithNotice());
    expect(notice).toBeNull();
  });

  it('loadMetaWithNotice reports no notice for an old save that never had any relics', () => {
    const emptyOldSave = JSON.stringify({
      version: 1,
      meta: { ...defaultMeta(), stash: [], equipped: { sigil: null, plate: null, charm: null } },
    });
    const { notice } = withSavedRaw(emptyOldSave, () => loadMetaWithNotice());
    expect(notice).toBeNull();
  });

  it('never reports a notice or drops anything for a save already at SAVE_VERSION', () => {
    // A save at or past the cutoff cannot legitimately hold relics (nothing
    // ever writes them post-migration), but the check is keyed on version,
    // not presence, so even a hand-crafted one is left alone.
    const current = JSON.stringify({
      version: SAVE_VERSION,
      meta: { ...defaultMeta(), stash: [relic(1, 'sigil')], equipped: { sigil: 1, plate: null, charm: null } },
    });
    const { meta, notice } = withSavedRaw(current, () => loadMetaWithNotice());
    expect(notice).toBeNull();
    expect(meta.stash.map((r) => r.id)).toEqual([1]);
  });
});
