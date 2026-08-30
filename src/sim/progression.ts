/**
 * Act II progression: XP gems, level-ups and the SPEC-FINAL §6.3 1-of-3
 * level-up pool. Luck weights offer rarity; each level grants one free reroll.
 *
 * p7a rewrote the pool from a flat 12-boon list to §6.3's three card
 * families — stat boons (`w.boonRanks`), Type Mastery per built tower type
 * (`w.typeMasteryRanks`) and 3 skill cards per class (`w.skillCardRanks`) —
 * and, as part of that rewrite, closed BACKLOG b011 (`applyOffer`'s boon
 * case stored a forged `Offer.toLevel` unclamped): every case below now
 * clamps to a finite integer in `[1, maxRank]` before it is stored.
 */

import type { SkillCardDef } from './content';
import { dist2, normalize } from './math';
import type { Offer } from './types';
import { World } from './world';

/** An integer rank in `[1, maxRank]` — `applyOffer`'s guard against a forged
 * `Offer.toLevel` (BACKLOG b011: `NaN`/`Infinity`/negative all landed in
 * `boonRanks` unclamped before this rewrite). Only `NaN` needs a special
 * case: `Math.round`/`Math.max`/`Math.min` already saturate `+Infinity` to
 * `maxRank` and `-Infinity` to `1` correctly on their own. */
function clampRank(toLevel: number, maxRank: number): number {
  if (Number.isNaN(toLevel)) return 1;
  return Math.min(maxRank, Math.max(1, Math.round(toLevel)));
}

/** The current class's own copy of one of its 3 skill cards, by `effect`. */
function skillCard(w: World, effect: SkillCardDef['effect']): SkillCardDef | undefined {
  return w.content.boons.skillCards[w.cfg.classKey]?.find((c) => c.effect === effect);
}

/** SPEC-FINAL §6.3 skill card "Active1 potency +25%/rank" — generic across
 * every class's kind, since each class owns exactly one such card. */
export function active1PotencyMul(w: World): number {
  const card = skillCard(w, 'active1_potency');
  if (!card) return 1;
  return 1 + card.perRank * (w.skillCardRanks[card.key] ?? 0);
}

/** SPEC-FINAL §6.3 skill card "Active2 cooldown -25%/rank" — a fraction
 * subtracted alongside the general `cdr` stat, same shape, different source. */
export function active2CdrBonus(w: World): number {
  const card = skillCard(w, 'active2_cdr');
  if (!card) return 0;
  return card.perRank * (w.skillCardRanks[card.key] ?? 0);
}

/** SPEC-FINAL §6.3's bespoke third skill card, e.g. "Thousand Cuts applies 2
 * Bleeding" — the ready-to-use bonus amount (`rank * perRank`); which field
 * it bumps is class-specific engine code, read at exactly one call site per
 * class (Q144). */
export function classLineBonus(w: World): number {
  const card = skillCard(w, 'class_line');
  if (!card) return 0;
  return card.perRank * (w.skillCardRanks[card.key] ?? 0);
}

/** SPEC-FINAL §6.3 Type Mastery: "+20% that type's VS attack damage" per rank. */
export function typeMasteryMul(w: World, towerKey: string): number {
  return 1 + w.content.boons.typeMastery.perRank * (w.typeMasteryRanks[towerKey] ?? 0);
}

/** SPEC 5.2: XP to reach level n = 5n + n^2. */
export function xpToReach(level: number): number {
  return 5 * level + level * level;
}

export function addXp(w: World, amount: number): void {
  w.xp += amount * w.derived.xpMul;
  while (w.xp >= xpToReach(w.level + 1)) {
    w.xp -= xpToReach(w.level + 1);
    w.level++;
    w.emit('levelup', w.warden.x, w.warden.y, w.level, 0);
    queueLevelUp(w);
  }
}

function queueLevelUp(w: World): void {
  w.pendingLevelUps++;
}

/**
 * Called by the run loop when it is safe to pause for a choice. With
 * `autoPickLevelUps` on (SPEC-FINAL §6.3, owner feedback
 * `feature-auto-pick-boons`), it never actually pauses: a `while` loop
 * resolves every currently-pending level-up in this one call (rather than
 * recursing through `takeOffer`, whose own depth would otherwise scale with
 * how many levels a single large XP grant produces), so a caller never
 * observes `phase === 'levelup'` even transiently.
 */
export function openLevelUpIfPending(w: World): void {
  if (w.pendingLevelUps <= 0 || w.phase !== 'act2') return;
  if (w.cfg.autoPickLevelUps) {
    while (w.pendingLevelUps > 0) {
      w.pendingLevelUps--;
      const offers = rollOffers(w);
      if (offers.length === 0) continue;
      applyOffer(w, offers[pickAutoOfferIndex(w, offers)]);
    }
    w.offers = [];
    w.rerollsLeft = w.content.boons.rerollsPerLevel;
    return;
  }
  w.pendingLevelUps--;
  w.offers = rollOffers(w);
  w.rerollsLeft = w.content.boons.rerollsPerLevel;
  w.phase = 'levelup';
}

/**
 * The auto-pick rule: prefer the highest-rank owned stat boon among the
 * offers, else the first offered card.
 */
export function pickAutoOfferIndex(w: World, offers: Offer[]): number {
  let bestIdx = 0;
  let bestRank = -1;
  offers.forEach((o, i) => {
    if (o.kind !== 'boon') return;
    const owned = w.boonRanks[o.key] ?? 0;
    if (owned > 0 && owned > bestRank) {
      bestRank = owned;
      bestIdx = i;
    }
  });
  return bestIdx;
}

/* ------------------------------------------------------------------ gems */

export function updateGems(w: World, dt: number): void {
  const wd = w.warden;
  const radius = w.derived.pickupRadius;
  const r2 = radius * radius;
  for (const g of w.gems) {
    if (g.dead) continue;
    const d2 = dist2(g.x, g.y, wd.x, wd.y);
    if (d2 <= r2) {
      const n = normalize(wd.x - g.x, wd.y - g.y);
      const pull = 7 + radius;
      g.x += n.x * pull * dt;
      g.y += n.y * pull * dt;
    }
    if (d2 <= 0.25) {
      g.dead = true;
      addXp(w, g.value);
      w.emit('gem', g.x, g.y, g.value, 0);
      continue;
    }
    // Gems left on the floor fade: XP has to be walked to (SPEC 5.2 pickup radius).
    g.life -= dt;
    if (g.life <= 0) g.dead = true;
  }
  // Hard cap so a Warden that never collects cannot grow the world unbounded.
  const cap = w.content.spawns.gemCap;
  if (w.gems.length > cap) {
    let excess = w.gems.length - cap;
    for (const g of w.gems) {
      if (excess <= 0) break;
      if (g.dead) continue;
      g.dead = true;
      excess--;
    }
  }
}

/**
 * fb008 (owner feedback `feature-exp-to-gold`): called once when a VS wave
 * ends. Every gem still on the ground is collected at once instead of being
 * left to fade. Only enough of that XP to fill the character's *current*
 * level-up need is actually applied — the rest converts to gold at
 * `expToGoldRatio` (Q137) so one bulk end-of-wave pickup cannot cascade
 * through several levels the way a single huge `addXp` call would.
 */
export function collectRemainingGems(w: World): void {
  // No per-gem `emit('gem', ...)` here, unlike the proximity-pickup path
  // below: up to `gemCap` (500) gems can be live at once, and `World.fx`
  // holds only 512 events a tick — flooding it here could crowd out this
  // same tick's `levelup`/`xp_overflow_gold` toast events (see the identical
  // concern documented at `enemies.ts`'s "ailment ticks do not spark").
  let totalRaw = 0;
  for (const g of w.gems) {
    if (g.dead) continue;
    totalRaw += g.value;
    g.dead = true;
  }
  if (totalRaw <= 0) return;
  const totalXp = totalRaw * w.derived.xpMul;
  const need = xpToReach(w.level + 1) - w.xp;
  if (totalXp < need) {
    // Doesn't even finish the current level: ordinary partial progress, no overflow.
    w.xp += totalXp;
    return;
  }
  w.xp = 0;
  w.level++;
  w.emit('levelup', w.warden.x, w.warden.y, w.level, 0);
  queueLevelUp(w);
  const overflowXp = totalXp - need;
  const gold = Math.floor(overflowXp * w.content.spawns.expToGoldRatio);
  if (gold > 0) {
    w.gold += gold;
    w.goldEarned += gold;
    w.emit('xp_overflow_gold', w.warden.x, w.warden.y, gold, 0);
  }
}

/* ---------------------------------------------------------------- offers */

const OFFER_COUNT = 3;

export function rollOffers(w: World): Offer[] {
  const pool = buildOfferPool(w);
  if (pool.length === 0) return [];
  const rng = w.rng.offers;
  const picked: Offer[] = [];
  const remaining = pool.slice();
  // Luck nudges the roll toward higher-value (later-rank / higher-level) picks.
  const luckBias = Math.min(0.5, w.derived.luck * 0.004);
  for (let i = 0; i < OFFER_COUNT && remaining.length > 0; i++) {
    const weights = remaining.map((o) => o.weight * (1 + luckBias * o.value));
    const idx = rng.weightedIndex(weights);
    picked.push(remaining[idx].offer);
    remaining.splice(idx, 1);
  }
  return picked;
}

interface WeightedOffer {
  offer: Offer;
  weight: number;
  /** 0..1 "how good is this", used by the Luck bias. */
  value: number;
}

/**
 * SPEC-FINAL §6.3's three card families, offer weighting even (each entry's
 * `weight: 8` regardless of family — the spec's own wording; "Luck-style
 * modifiers may weight later" is explicitly marked ⚖, i.e. not this pass).
 */
function buildOfferPool(w: World): WeightedOffer[] {
  const out: WeightedOffer[] = [];

  for (const b of w.content.boons.statBoons) {
    const rank = w.boonRanks[b.key] ?? 0;
    if (rank >= b.maxRank) continue;
    out.push({
      offer: {
        kind: 'boon',
        key: b.key,
        name: `${b.name} ${romanRank(rank + 1)}`,
        desc: b.desc,
        toLevel: rank + 1,
      },
      weight: 8,
      value: rank / b.maxRank,
    });
  }

  // Type Mastery: one card per built tower type that actually has a VS
  // attack to boost (mirrors `vswield.ts`'s own `!def.attack` skip — a wall,
  // Beacon Totem or Harvest Sprout has nothing for this card to multiply).
  const mastery = w.content.boons.typeMastery;
  for (const towerKey of Object.keys(w.towersByKey)) {
    if ((w.towersByKey[towerKey] ?? 0) <= 0) continue;
    const def = w.content.towerByKey.get(towerKey);
    if (!def || !def.attack) continue;
    const rank = w.typeMasteryRanks[towerKey] ?? 0;
    if (rank >= mastery.maxRank) continue;
    out.push({
      offer: {
        kind: 'type_mastery',
        key: towerKey,
        name: `${def.name} Mastery ${romanRank(rank + 1)}`,
        desc: `+${Math.round(mastery.perRank * 100)}% ${def.name} VS damage`,
        toLevel: rank + 1,
        towerKey,
      },
      weight: 8,
      value: rank / mastery.maxRank,
    });
  }

  // Skill cards: only the 3 belonging to the run's own class.
  const cards = w.content.boons.skillCards[w.cfg.classKey] ?? [];
  for (const card of cards) {
    const rank = w.skillCardRanks[card.key] ?? 0;
    if (rank >= card.maxRank) continue;
    out.push({
      offer: {
        kind: 'skill_card',
        key: card.key,
        name: `${card.name} ${romanRank(rank + 1)}`,
        desc: card.desc,
        toLevel: rank + 1,
      },
      weight: 8,
      value: rank / card.maxRank,
    });
  }

  return out;
}

/** Standard subtractive-notation numerals; ranks are small but no longer
 * bounded at 5 (fb011), so this replaces the old fixed I-V lookup. */
const ROMAN: [number, string][] = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
  [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
  [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

function romanRank(n: number): string {
  let rest = n;
  let out = '';
  for (const [value, symbol] of ROMAN) {
    while (rest >= value) {
      out += symbol;
      rest -= value;
    }
  }
  return out;
}

export function takeOffer(w: World, index: number): boolean {
  if (w.phase !== 'levelup') return false;
  const offer = w.offers[index];
  if (!offer) return false;
  applyOffer(w, offer);
  w.offers = [];
  w.phase = 'act2';
  openLevelUpIfPending(w);
  return true;
}

export function rerollOffers(w: World): boolean {
  if (w.phase !== 'levelup' || w.rerollsLeft <= 0) return false;
  w.rerollsLeft--;
  w.offers = rollOffers(w);
  return true;
}

export function applyOffer(w: World, offer: Offer): void {
  switch (offer.kind) {
    case 'boon': {
      const b = w.content.boonByKey.get(offer.key);
      if (!b) return;
      const before = w.boonRanks[b.key] ?? 0;
      const toLevel = clampRank(offer.toLevel, b.maxRank);
      w.boonRanks[b.key] = toLevel;
      // One boon is one source: its ranks add within it, then multiply out
      // (V3 §2) — `Stats.addAll` sums onto the same source key across
      // repeated calls, so this must add only the ranks actually gained
      // this call (`delta`), not a flat `perRank`: the real UI/`rollOffers`
      // path only ever offers `rank + 1` so `delta` is always 1 there, but a
      // forged offer jumping several ranks at once (QA finding, p7a) would
      // otherwise under-credit `Stats` while `boonRanks` itself reports the
      // full jump, desyncing the displayed rank from the real bonus.
      const delta = toLevel - before;
      if (delta > 0) w.stats.addAll(`boon:${b.key}`, { [b.stat]: b.perRank * delta });
      w.recomputeDerived();
      // Vitality-style Max HP gains heal for the amount actually added.
      if (b.stat === 'maxHp' && delta > 0) {
        w.warden.hp = Math.min(w.derived.maxHp, w.warden.hp + b.perRank * delta);
      }
      break;
    }
    case 'type_mastery': {
      if (!offer.towerKey) return;
      const toLevel = clampRank(offer.toLevel, w.content.boons.typeMastery.maxRank);
      w.typeMasteryRanks[offer.towerKey] = toLevel;
      break;
    }
    case 'skill_card': {
      const card = w.content.skillCardByKey.get(offer.key);
      if (!card) return;
      w.skillCardRanks[card.key] = clampRank(offer.toLevel, card.maxRank);
      break;
    }
  }
}
