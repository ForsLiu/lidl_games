/**
 * Act II progression: XP gems, level-ups and the 1-of-3 offer screen
 * (SPEC 5.2-5.4). Luck weights offer rarity; each level grants one free reroll.
 */

import type { TowerDef } from './content';
import { dist2, normalize } from './math';
import type { Offer, WeaponState } from './types';
import { grantWeapon, weaponDef } from './weapons';
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

/** Called by the run loop when it is safe to pause for a choice. */
export function openLevelUpIfPending(w: World): void {
  if (w.pendingLevelUps <= 0 || w.phase !== 'act2') return;
  w.pendingLevelUps--;
  w.offers = rollOffers(w);
  w.rerollsLeft = w.content.boons.rerollsPerLevel;
  w.phase = 'levelup';
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
  const maxLevel = w.content.weapons.maxLevel;

  for (const ws of w.weapons) {
    const def = weaponDef(w, ws.key);
    if (ws.level < maxLevel) {
      out.push({
        offer: {
          kind: 'weapon',
          key: ws.key,
          name: `${def.name} Lv ${ws.level + 1}`,
          desc: def.desc,
          toLevel: ws.level + 1,
        },
        weight: 10,
        value: ws.level / maxLevel,
      });
    }
  }

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

  for (const a of w.content.weapons.awakenings) {
    if (w.awakenings.includes(a.key)) continue;
    const ws = w.weapons.find((x) => x.key === a.weapon);
    if (!ws || ws.level < maxLevel) continue;
    if ((w.boonRanks[a.boon] ?? 0) < a.boonRank) continue;
    out.push({
      offer: { kind: 'awakening', key: a.key, name: a.name, desc: a.desc, toLevel: 1 },
      weight: 30,
      value: 1,
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
  switch (offer.kind) {
    case 'weapon': {
      const ws = w.weapons.find((x) => x.key === offer.key);
      if (ws) ws.level = Math.min(w.content.weapons.maxLevel, offer.toLevel);
      break;
    }
    case 'boon': {
      const b = w.content.boonByKey.get(offer.key);
      if (!b) break;
      w.boonRanks[b.key] = offer.toLevel;
      // One boon is one source: its ranks add within it, then multiply out (V3 §2).
      w.stats.addAll(`boon:${b.key}`, { [b.stat]: b.perRank });
      w.recomputeDerived();
      // Vitality-style Max HP gains heal for the amount added.
      if (b.stat === 'maxHp') w.warden.hp = Math.min(w.derived.maxHp, w.warden.hp + b.perRank);
      break;
    }
    case 'awakening': {
      const a = w.content.weapons.awakenings.find((x) => x.key === offer.key);
      if (!a) break;
      const ws = w.weapons.find((x) => x.key === a.weapon);
      if (!ws) break;
      ws.awakened = true;
      w.awakenings.push(a.key);
      w.emit('awaken', w.warden.x, w.warden.y, 0, 0);
      break;
    }
  }
}

/* --------------------------------------------------- Sundering inheritance */

/**
 * SPEC 4.1. WeaponLevel = how far the best tower of that type walked its own
 * upgrade track. DamageBonus = +8% per additional tower of that type, capped
 * at +40%.
 *
 * V2 read the rule literally — level = tier — because every tower stopped at
 * tier 3 and `inheritMaxLevel` is 3. SPEC-V3 §4 gave each tower its own track
 * (0 to 11 levels), so a literal read handed a maxed Ballista level 11, which
 * `grantWeapon` clamps to the ladder's top: every soul would arrive in Act II
 * fully levelled, for less gold than V2 charged for a third of it. Scaling by
 * track position keeps the inheritance where V2 left it whatever a track's
 * length. (Transitional: V3 §5 replaces soul binding wholesale at m21d.)
 */
export function soulLevelFor(w: World, def: TowerDef, level: number): number {
  const top = w.content.weapons.inheritMaxLevel;
  const steps = def.upgrades.count;
  if (steps <= 0) return 1;
  const progress = Math.max(0, Math.min(1, (level - 1) / steps));
  return 1 + Math.round(progress * (top - 1));
}

export function deriveSouls(w: World): { key: string; level: number; damageBonus: number }[] {
  const counts = new Map<string, { count: number; tier: number }>();
  for (const s of w.structures) {
    // SPEC-V2 §1: a tower Rekindled at Dawn sits out the very next Dusk pick,
    // even if it survives the following Day and re-petrifies before then.
    if (s.dead || s.soulSuppressed) continue;
    const def = w.content.towerById.get(s.towerId)!;
    if (!def.soul) continue;
    const cur = counts.get(def.soul) ?? { count: 0, tier: 0 };
    cur.count++;
    cur.tier = Math.max(cur.tier, soulLevelFor(w, def, s.tier));
    counts.set(def.soul, cur);
  }
  const per = w.content.weapons.inheritDamagePerExtraTower;
  const cap = w.content.weapons.inheritDamageCap;
  const out: { key: string; level: number; damageBonus: number }[] = [];
  for (const [key, v] of counts) {
    out.push({ key, level: v.tier, damageBonus: Math.min(cap, (v.count - 1) * per) });
  }
  out.sort((a, b) => (a.key < b.key ? -1 : 1));
  return out;
}

/**
 * Grants the chosen souls plus every slotless innate weapon.
 *
 * SPEC-V2 §1: a soul not re-chosen this Dusk unbinds — its weapon stops
 * firing, not just falling out of the picker's candidate list — while its
 * Night-earned level survives in `w.soulLevels` so a later re-pick (once it
 * re-petrifies) resumes where it left off rather than restarting at its
 * tower's bare tier.
 */
export function bindSouls(w: World, chosen: string[]): WeaponState[] {
  const souls = deriveSouls(w);
  const byKey = new Map(souls.map((s) => [s.key, s]));
  const slots = w.derived.weaponSlots;
  const keys = chosen.filter((k) => byKey.has(k)).slice(0, slots);

  // Snapshot whatever the outgoing roster grew to over the Night that just
  // ended before any of it is dropped, so soul progress is never lost - only
  // benched.
  for (const ws of w.weapons) {
    if (weaponDef(w, ws.key).slotless) continue;
    const prev = w.soulLevels[ws.key];
    if (!prev || ws.level > prev.level || ws.damageBonus > prev.damageBonus) {
      w.soulLevels[ws.key] = {
        level: Math.max(ws.level, prev?.level ?? 0),
        damageBonus: Math.max(ws.damageBonus, prev?.damageBonus ?? 0),
      };
    }
  }

  // Rebuild the active roster from scratch: slotless innates always fight;
  // every other weapon must be in this Dusk's chosen set to stay bound.
  w.weapons = w.weapons.filter((ws) => weaponDef(w, ws.key).slotless);
  for (const def of w.content.weapons.weapons) {
    if (def.slotless) grantWeapon(w, def.key, 1, 0);
  }
  for (const k of keys) {
    const s = byKey.get(k)!;
    const persisted = w.soulLevels[k];
    grantWeapon(w, k, Math.max(s.level, persisted?.level ?? 0), Math.max(s.damageBonus, persisted?.damageBonus ?? 0));
  }

  // Soul Furnace: start Nightfall with the best weapon one level higher.
  const bump = w.stats.total('startWeaponLevel');
  if (bump > 0 && w.weapons.length > 0) {
    let best = w.weapons[0];
    for (const ws of w.weapons) if (ws.level > best.level) best = ws;
    best.level = Math.min(w.content.weapons.maxLevel, best.level + bump);
  }
  // Last Stand Sundering: every weapon comes through one level weaker.
  if (w.lastStandUsed) {
    for (const ws of w.weapons) ws.level = Math.max(1, ws.level - 1);
  }
  return w.weapons;
}
