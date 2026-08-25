/**
 * Orb crafting (SPEC 8.2). Between runs, Orbs reroll and upgrade stashed relics.
 *
 * Crafting is a meta-layer action, not a sim one, so it takes an explicit Rng
 * from the caller and returns new objects rather than mutating in place.
 */

import { loadContent, type Content } from '../sim/content';
import { rollAffix } from '../sim/loot';
import { Rng } from '../sim/rng';
import type { MetaState, Relic, RelicAffix } from '../sim/types';

export type OrbKey = 'whetting' | 'turning' | 'ascension';

export type CraftResult =
  | { ok: true; relic: Relic; meta: MetaState }
  | { ok: false; reason: CraftRejection };

export type CraftRejection = 'no_orb' | 'no_relic' | 'no_affixes' | 'max_rarity' | 'no_pool';

function rarityIndex(content: Content, key: string): number {
  return content.relics.rarities.findIndex((r) => r.key === key);
}

/** Orb of Whetting: reroll the numeric values of a relic's affixes. */
export function whet(content: Content, rng: Rng, relic: Relic): Relic | CraftRejection {
  if (relic.affixes.length === 0) return 'no_affixes';
  const affixes = relic.affixes.map((a) => {
    const def = content.relics.affixes.find((d) => d.key === a.key);
    return def ? rollAffix(def, rng) : a;
  });
  return { ...relic, affixes };
}

/** Orb of Turning: reroll one random affix into another from the pool. */
export function turn(content: Content, rng: Rng, relic: Relic): Relic | CraftRejection {
  if (relic.affixes.length === 0) return 'no_affixes';
  const taken = new Set(relic.affixes.map((a) => a.key));
  const idx = rng.int(relic.affixes.length);
  taken.delete(relic.affixes[idx].key);
  const pool = content.relics.affixes.filter((d) => !taken.has(d.key));
  if (pool.length === 0) return 'no_pool';
  const def = pool[rng.int(pool.length)];
  const affixes: RelicAffix[] = relic.affixes.slice();
  affixes[idx] = rollAffix(def, rng);
  affixes.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { ...relic, affixes };
}

/** Orb of Ascension: Normal -> Magic -> Rare, adding affixes to suit. */
export function ascend(content: Content, rng: Rng, relic: Relic): Relic | CraftRejection {
  const i = rarityIndex(content, relic.rarity);
  if (i < 0 || i >= content.relics.rarities.length - 1) return 'max_rarity';
  const next = content.relics.rarities[i + 1];
  const target = rng.intRange(next.minAffixes, next.maxAffixes);
  const taken = new Set(relic.affixes.map((a) => a.key));
  const affixes = relic.affixes.slice();
  while (affixes.length < target) {
    const pool = content.relics.affixes.filter((d) => !taken.has(d.key));
    if (pool.length === 0) break;
    const def = pool[rng.int(pool.length)];
    taken.add(def.key);
    affixes.push(rollAffix(def, rng));
  }
  affixes.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { ...relic, rarity: next.key, affixes };
}

/**
 * Spend one Orb on a stashed relic. Returns a new MetaState; the original is
 * untouched so callers can preview a craft before committing.
 */
export function craft(
  meta: MetaState,
  orb: OrbKey,
  relicId: number,
  rng: Rng,
  content: Content = loadContent(),
): CraftResult {
  if ((meta.orbs[orb] ?? 0) <= 0) return { ok: false, reason: 'no_orb' };
  const idx = meta.stash.findIndex((r) => r.id === relicId);
  if (idx < 0) return { ok: false, reason: 'no_relic' };

  const relic = meta.stash[idx];
  const result =
    orb === 'whetting'
      ? whet(content, rng, relic)
      : orb === 'turning'
        ? turn(content, rng, relic)
        : ascend(content, rng, relic);

  if (typeof result === 'string') return { ok: false, reason: result };

  const stash = meta.stash.slice();
  stash[idx] = result;
  return {
    ok: true,
    relic: result,
    meta: { ...meta, stash, orbs: { ...meta.orbs, [orb]: meta.orbs[orb] - 1 } },
  };
}

/** Equip a stashed relic into its slot, or clear the slot with `null`. */
export function equip(meta: MetaState, slot: string, relicId: number | null): MetaState {
  if (!(slot in meta.equipped)) return meta;
  if (relicId !== null) {
    const relic = meta.stash.find((r) => r.id === relicId);
    if (!relic || relic.slot !== slot) return meta;
  }
  return { ...meta, equipped: { ...meta.equipped, [slot]: relicId } };
}

/** Drop a relic from the stash, unequipping it first if needed. */
export function discard(meta: MetaState, relicId: number): MetaState {
  const equipped = { ...meta.equipped };
  for (const slot of Object.keys(equipped) as (keyof typeof equipped)[]) {
    if (equipped[slot] === relicId) equipped[slot] = null;
  }
  return { ...meta, equipped, stash: meta.stash.filter((r) => r.id !== relicId) };
}
