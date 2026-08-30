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
import type { MetaState } from '../src/sim/types';

/** A save exactly as a v0.2 client would have written it, orbs and all. */
function v2Save(): string {
  return JSON.stringify({
    version: 1,
    meta: {
      accountLevel: 7,
      ember: 1234,
      allocated: [0],
      stash: [
        { id: 1, slot: 'sigil', rarity: 'rare', name: 'Relic 1', affixes: [{ key: 'power', stat: 'power', value: 0.08 }] },
        { id: 2, slot: 'plate', rarity: 'rare', name: 'Relic 2', affixes: [{ key: 'power', stat: 'power', value: 0.08 }] },
      ],
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
    expect(out.highestTier).toBe(4);
    expect(out.unlockedClasses).toEqual(['engineer', 'pyromancer']);
    expect(out.completedQuests).toEqual(['win_a_run']);
    expect(out.questProgress).toEqual({ wins: 6, lifetime_gold: 12000 });
    // p7d: `accountLevel`/`ember`/`nextRelicId` are the exception — the whole
    // economy they belonged to is retired, not merely a field rename. See the
    // dedicated "retiring the Ember economy" block below for what happens to
    // the value `ember` carried. `stash`/`equipped` are the older fb023
    // exception — see the "dropping relics at migration" block.
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

  it('p7f: strips a retired (or any unknown) key at every version, including the current one', () => {
    // Superseded by p7f: `migrate` used to strip `RETIRED_KEYS` only for
    // saves older than the version that retired each one, on the theory that
    // a future client might legitimately reuse the name — but that same
    // `{...base, ...meta}` spread let *any* unknown key round-trip forever at
    // the current version too, which is the actual bug (BACKLOG p7f). The
    // migrated object is now built field-by-field from the known
    // `MetaState` key set, so an unknown key never survives, at any version.
    const future = JSON.stringify({
      version: SAVE_VERSION,
      meta: { ...defaultMeta(), orbs: { newMechanic: 42 } },
    });
    const out = deserializeMeta(future) as unknown as Record<string, unknown>;
    expect(out.orbs).toBeUndefined();
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
    // p7d: the 1234 Ember the fixture carried converted once, at 100:1, into
    // 12 skill points — see the dedicated migration block below.
    expect(deserializeMeta(migrated).skillPoints).toBe(12);
  });

  it('survives a save whose orbs key is malformed', () => {
    for (const junk of ['null', '5', '"three"', '[]', '{"whetting":"lots"}']) {
      const save = v2Save().replace('{"whetting":3,"turning":2,"ascension":1}', junk);
      expect(() => deserializeMeta(save), junk).not.toThrow();
      const out = deserializeMeta(save) as unknown as Record<string, unknown>;
      expect(out.orbs, junk).toBeUndefined();
      expect((out as unknown as MetaState).skillPoints, junk).toBe(12);
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
 * written before `RELICS_DROPPED_AT` (3) had its `stash`/`equipped` dropped
 * outright on load rather than carried forward into a screen that no longer
 * existed to show them. p7d goes further: `MetaState` no longer declares
 * `stash`/`equipped` at all (retired at `SAVE_VERSION` 4), so a pre-p7d save's
 * copies are stripped from the output entirely rather than reset to an empty
 * shape — checked here as raw-object absence, since the type no longer has a
 * `.stash`/`.equipped` field to read.
 */
describe('fb023/p7d: dropping relics at migration', () => {
  it('an old save with a real relic loadout has stash/equipped stripped, not merely emptied', () => {
    const out = deserializeMeta(v2Save()) as unknown as Record<string, unknown>;
    expect(out.stash).toBeUndefined();
    expect(out.equipped).toBeUndefined();
  });

  it('loadMetaWithNotice reports the one-time drop for an old save that had relics', () => {
    const { meta, notice } = withSavedRaw(v2Save(), () => loadMetaWithNotice());
    expect((meta as unknown as Record<string, unknown>).stash).toBeUndefined();
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

  it('never reports a relics notice for a save already at SAVE_VERSION, even hand-crafted with a stash', () => {
    // A save at or past the cutoff cannot legitimately hold a `stash` (nothing
    // ever writes one post-migration, and the field is not even in the type).
    // The relics-dropped *notice* stays keyed on version, not presence — a
    // hand-crafted `stash` at the current version never triggers it — and
    // (p7f) the stray key itself is now stripped on output rather than
    // round-tripping as an unused extra key.
    const current = JSON.stringify({
      version: SAVE_VERSION,
      meta: { ...defaultMeta(), stash: [{ id: 1, slot: 'sigil' }] },
    });
    const { notice } = withSavedRaw(current, () => loadMetaWithNotice());
    expect(notice).toBeNull();
  });
});

/**
 * p7d (SPEC-FINAL §8, Q46): the Ember → account-level economy is retired
 * outright. A save older than `SAVE_VERSION` 4 has any leftover `ember`
 * converted once, at 100:1, into skill points, then `ember`/`accountLevel`
 * are dropped — see `tests/meta.test.ts` for the conversion arithmetic
 * itself; this file's job is the interaction with the *other* migration
 * layers (orbs, relics) a save this old also carries.
 */
describe('p7d: retiring the Ember economy at migration', () => {
  it('converts Ember to skill points in the same load that drops orbs and relics', () => {
    const out = deserializeMeta(v2Save()) as unknown as Record<string, unknown>;
    expect(out.ember).toBeUndefined();
    expect(out.accountLevel).toBeUndefined();
    expect(out.skillPoints).toBe(12); // floor(1234 / 100)
  });

  it('a save with 0 Ember converts to 0 extra skill points, not a stray field', () => {
    const zero = JSON.stringify({ version: 3, meta: { ...defaultMeta(), ember: 0 } });
    const out = deserializeMeta(zero);
    expect(out.skillPoints).toBe(0);
  });

  it('re-serialises without ember/accountLevel, and stably', () => {
    const once = serializeMeta(deserializeMeta(v2Save()));
    expect(once).not.toMatch(/"ember"/);
    expect(once).not.toMatch(/"accountLevel"/);
    const twice = serializeMeta(deserializeMeta(once));
    expect(twice).toBe(once);
  });
});
