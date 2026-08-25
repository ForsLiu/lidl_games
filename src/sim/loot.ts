/**
 * Relic and Orb drops (SPEC 7, 8.2). Rolled on the `drops` RNG stream so loot
 * never perturbs combat determinism.
 */

import type { AffixDef, Content, EnemyDef } from './content';
import { Rng } from './rng';
import { setDropHandler } from './enemies';
import type { Enemy, Relic, RelicAffix } from './types';
import { World } from './world';

/** Rarity weights shift toward the top end with Luck (SPEC 7). */
export function rarityWeights(content: Content, luck: number): number[] {
  const shift = content.relics.luckRarityShift * luck;
  return content.relics.rarities.map((r, i) => {
    const bias = i === 0 ? 1 - shift : 1 + shift * i;
    return Math.max(0.01, r.weight * bias);
  });
}

export function rollRelic(
  content: Content,
  rng: Rng,
  luck: number,
  id: number,
  forceRarity?: string,
): Relic {
  const slots = content.relics.slots;
  const slot = slots[rng.int(slots.length)];

  let rarityIdx = rng.weightedIndex(rarityWeights(content, luck));
  if (forceRarity) {
    const idx = content.relics.rarities.findIndex((r) => r.key === forceRarity);
    if (idx >= 0) rarityIdx = idx;
  }
  const rarity = content.relics.rarities[rarityIdx];
  const count = rng.intRange(rarity.minAffixes, rarity.maxAffixes);

  const pool = content.relics.affixes.slice();
  const affixes: RelicAffix[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const pick = pool.splice(rng.int(pool.length), 1)[0];
    affixes.push(rollAffix(pick, rng));
  }
  affixes.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  return { id, slot, rarity: rarity.key, name: relicName(slot, rarity.key, affixes, content), affixes };
}

export function rollAffix(def: AffixDef, rng: Rng): RelicAffix {
  const raw = rng.range(def.min, def.max);
  // Percent affixes keep 3 decimals, flat affixes are whole numbers.
  const value = def.pct ? Math.round(raw * 1000) / 1000 : Math.round(raw);
  return { key: def.key, stat: def.stat, value };
}

const SLOT_NAMES: Record<string, string> = {
  sigil: 'Sigil',
  plate: 'Plate',
  charm: 'Charm',
};

function relicName(slot: string, rarity: string, affixes: RelicAffix[], content: Content): string {
  const base = SLOT_NAMES[slot] ?? slot;
  if (affixes.length === 0) return `${base}`;
  const first = content.relics.affixes.find((a) => a.key === affixes[0].key);
  const suffix = first ? ` ${first.name}` : '';
  const prefix = rarity === 'rare' ? 'Rare ' : '';
  return `${prefix}${base}${suffix}`;
}

/* ------------------------------------------------------------------- drops */

export function dropRelic(w: World, forceRarity?: string): Relic {
  const relic = rollRelic(
    w.content,
    w.rng.drops,
    w.derived.luck,
    w.relicsFound.length + 1,
    forceRarity,
  );
  w.relicsFound.push(relic);
  w.emit('relic', w.warden.x, w.warden.y, 0, 0);
  return relic;
}

export function dropOrb(w: World): string {
  const orbs = w.content.relics.orbs;
  const orb = orbs[w.rng.drops.int(orbs.length)].key;
  w.orbsFound.push(orb);
  w.emit('orb', w.warden.x, w.warden.y, 0, 0);
  return orb;
}

/**
 * SPEC 3.4/5.5/7: elites and bosses always drop a Relic; ordinary kills have a
 * small chance, scaled by relic find. Orbs come from elites, bosses and wins.
 */
export function handleKillDrops(w: World, e: Enemy, def: EnemyDef): void {
  const rates = w.content.relics.dropRates;
  const rng = w.rng.drops;
  const findMul = 1 + w.derived.relicFind;

  if (def.traits.includes('finalBoss')) {
    dropRelic(w, 'rare');
    for (let i = 0; i < Math.max(1, Math.round(rates.orbPerBoss)); i++) dropOrb(w);
    return;
  }
  if (def.traits.includes('boss')) {
    dropRelic(w);
    if (rng.chance(rates.orbPerBoss)) dropOrb(w);
    return;
  }
  if (e.elite || def.traits.includes('elite')) {
    if (rng.chance(Math.min(1, rates.eliteRelic * findMul))) dropRelic(w);
    if (rng.chance(rates.orbPerElite * findMul)) dropOrb(w);
    return;
  }
  // Rare wave drops: only from the tougher grades, so fodder does not flood.
  if (def.grade === 'S' && rng.chance(rates.waveRelic * 0.02 * findMul)) {
    dropRelic(w);
  }
}

setDropHandler(handleKillDrops);
