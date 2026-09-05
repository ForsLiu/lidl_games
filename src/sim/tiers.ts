/**
 * Map tiers: the difficulty ladder (p12b) and modifier drafting (SPEC 8.3).
 *
 * Tier N applies N-1 modifiers, each drafted by picking 1 of 2 offered.
 * This runs before a run starts, so it takes its own Rng rather than a World.
 */

import type { Content, ModifierDef } from './content';
import { Rng, fnv1a, DRAFT_STREAM, DRAFT_PICK_STREAM } from './rng';

export const MAX_TIER = 5;

/**
 * BACKLOG p12b (BALANCE DIRECTION v2 §B): the tier ladder's difficulty
 * scalars, `x^(tier - 1)` so **T1 is always exactly 1.0** and every existing
 * T1 measurement in the repo keeps its meaning.
 *
 * Before p12b, `cfg.tier` scaled exactly one thing directly — the final
 * boss's HP — and every other tier difference came from the 1-of-2 *drafted*
 * modifiers (`modifierDraft` below), which are random draws. That makes a
 * tier a distribution rather than a rung, which is fine while every gate
 * measures at T1 but not once §B moves the reference tier to T3. These three
 * are deterministic in `tier` alone.
 *
 * They are separate functions rather than one struct because each is read at
 * a different choke point and nothing reads all three.
 */
function ladder(perStep: number, tier: number): number {
  // A NaN tier would otherwise NaN *every* enemy's HP rather than just the
  // final boss's, and `stats.ts` already documents NaN HP as an unkillable
  // enemy (code-reviewer n14). NaN reads as T1; `Infinity` is clamped to the
  // top rung by the `Math.min` below exactly as `modifierDraft` clamps it, so
  // the two genuinely agree on "past the top rung" — an earlier version of
  // this guard sent `Infinity` to T1 here while `modifierDraft` sent it to T5,
  // i.e. the easiest ladder with the most modifiers (qa-playtester, p12b).
  const t = Number.isNaN(tier) ? 1 : tier;
  return Math.pow(perStep, Math.max(0, Math.min(MAX_TIER, t) - 1));
}

/** Enemy HP at spawn. Shipped 4.0/step -> x16 at T3, x256 at T5. */
export function tierEnemyHpMul(content: Content, tier: number): number {
  return ladder(content.modifiers.tierEnemyHpPerStep, tier);
}

/** Act II director budget. Shipped 1.9/step -> x3.61 at T3, x13.0 at T5. */
export function tierBudgetMul(content: Content, tier: number): number {
  return ladder(content.modifiers.tierBudgetPerStep, tier);
}

/**
 * Enemy `coreDamage` — the lever Q160 measured as the elastic one. §B:
 * Shipped 1.7/step -> x2.89 at T3, x8.35 at T5. Read through
 * `enemyCoreDamage` (`enemies.ts`) so all four of
 * its consumers (Core leak, leak telemetry, Warden contact, structure DPS)
 * scale together rather than three of them drifting.
 */
export function tierCoreDamageMul(content: Content, tier: number): number {
  return ladder(content.modifiers.tierCoreDamagePerStep, tier);
}

export interface DraftOffer {
  slot: number;
  options: ModifierDef[];
}

/** The 1-of-2 choices a player would be shown for a tier. */
export function modifierDraft(content: Content, seed: number, tier: number): DraftOffer[] {
  const rng = new Rng(fnv1a(`${DRAFT_STREAM}:${tier}`, seed >>> 0));
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
  const rng = new Rng(fnv1a(`${DRAFT_PICK_STREAM}:${tier}`, seed >>> 0));
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
