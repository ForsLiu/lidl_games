/**
 * Map tiers and modifier drafting (SPEC 8.3).
 *
 * Tier N applies N-1 modifiers, each drafted by picking 1 of 2 offered.
 * This runs before a run starts, so it takes its own Rng rather than a World.
 */

import type { Content, ModifierDef } from './content';
import { Rng, fnv1a } from './rng';

export const MAX_TIER = 5;

export interface DraftOffer {
  slot: number;
  options: ModifierDef[];
}

/** The 1-of-2 choices a player would be shown for a tier. */
export function modifierDraft(content: Content, seed: number, tier: number): DraftOffer[] {
  const rng = new Rng(fnv1a(`draft:${tier}`, seed >>> 0));
  const pool = content.modifiers.modifiers.slice();
  const offers: DraftOffer[] = [];
  const slots = Math.max(0, Math.min(MAX_TIER, tier) - 1);
  for (let slot = 0; slot < slots && pool.length >= 2; slot++) {
    const a = pool.splice(rng.int(pool.length), 1)[0];
    const b = pool.splice(rng.int(pool.length), 1)[0];
    offers.push({ slot, options: [a, b] });
  }
  return offers;
}

/** What an unattended bot takes: one option per slot, chosen on the same stream. */
export function autoDraft(content: Content, seed: number, tier: number): string[] {
  const rng = new Rng(fnv1a(`draftpick:${tier}`, seed >>> 0));
  return modifierDraft(content, seed, tier).map((o) => o.options[rng.int(o.options.length)].key);
}

/** The harshest option in each slot — used to check the top of the ladder. */
export function hardestDraft(content: Content, seed: number, tier: number): string[] {
  return modifierDraft(content, seed, tier).map((o) => {
    let worst = o.options[0];
    for (const m of o.options) if (severity(m) > severity(worst)) worst = m;
    return worst.key;
  });
}

/** Rough "how much harder does this make the run" score, for bot drafting. */
export function severity(m: ModifierDef): number {
  const e = m.effect;
  return (
    (e.enemyHp ?? 0) * 4 +
    (e.enemySpeed ?? 0) * 3 +
    (e.extraGates ?? 0) * 1.2 +
    (e.extraWaves ?? 0) * 0.5 +
    (e.eliteMul ?? 0) * 0.3 +
    (e.riftMul ?? 0) * 0.3 +
    (e.ghostWeightMul ?? 0) * 0.15 +
    (e.bossHp ?? 0) * 0.5 +
    Math.abs(e.coreHp ?? 0) / 150 +
    Math.abs(e.residualMul ?? 0) * 1.5 +
    Math.abs(e.pickupMul ?? 0) +
    (e.buildPhase ? 0.4 : 0)
  );
}

/** SPEC 8.3: rewards scale with tier and with the number of modifiers taken. */
export function rewardMultiplier(content: Content, tier: number, modifiers: string[]): number {
  const tierPart = 1 + content.modifiers.tierRewardPerStep * (tier - 1);
  let modPart = 0;
  for (const key of modifiers) {
    const m = content.modifierByKey.get(key);
    if (m) modPart += m.rewardBonus;
  }
  return tierPart * (1 + modPart);
}
