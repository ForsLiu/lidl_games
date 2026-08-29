/**
 * Act II progression: XP gems, level-ups and the 1-of-3 offer screen
 * (SPEC 5.2-5.4). Luck weights offer rarity; each level grants one free reroll.
 */

import { dist2, normalize } from './math';
import type { Offer } from './types';
import { World } from './world';

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

function buildOfferPool(w: World): WeightedOffer[] {
  const out: WeightedOffer[] = [];

  for (const b of w.content.boons.boons) {
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

  return out;
}

function romanRank(n: number): string {
  return ['I', 'II', 'III', 'IV', 'V'][n - 1] ?? String(n);
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
  if (offer.kind !== 'boon') return;
  const b = w.content.boonByKey.get(offer.key);
  if (!b) return;
  w.boonRanks[b.key] = offer.toLevel;
  // One boon is one source: its ranks add within it, then multiply out (V3 §2).
  w.stats.addAll(`boon:${b.key}`, { [b.stat]: b.perRank });
  w.recomputeDerived();
  // Vitality-style Max HP gains heal for the amount added.
  if (b.stat === 'maxHp') w.warden.hp = Math.min(w.derived.maxHp, w.warden.hp + b.perRank);
}
