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

/** fb041's uncapped families (stat boons, Type Mastery) still need a *finite*
 * ceiling passed to `clampRank` — code-reviewer finding: `clampRank(toLevel,
 * Infinity)` is a no-op clamp, so a forged `Offer.toLevel` of `Infinity`
 * landed verbatim in `boonRanks`/`typeMasteryRanks`, and `romanRank` below
 * then looped forever building an ever-growing string off it, OOM-crashing
 * the process on the very next `buildOfferPool` call — unrecoverable, not
 * something a `try`/`catch` at the call site can defend against. Far above
 * any rank a real run reaches (fb041's own acceptance is "10+"). */
const UNCAPPED_RANK_CEILING = 9999;

/** An integer rank in `[1, maxRank]` — `applyOffer`'s guard against a forged
 * `Offer.toLevel` (BACKLOG b011: `NaN`/`Infinity`/negative all landed in
 * `boonRanks` unclamped before this rewrite). Only `NaN` needs a special
 * case: `Math.round`/`Math.max`/`Math.min` already saturate `-Infinity` to
 * `1` correctly on their own; `+Infinity` does **not** saturate correctly —
 * callers must never pass `Infinity` as `maxRank` (see
 * `UNCAPPED_RANK_CEILING`), or this becomes a no-op clamp. */
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
  // p9e (code-reviewer finding): an exhausted offer pool (every stat boon,
  // built-type Type Mastery and this class's skill card already at max rank)
  // is legitimate — mirror the autopick branch above and simply consume the
  // level-up with nothing to show, rather than opening `levelup` with zero
  // offers, which was a second, still-live G18 dead-end (nothing could ever
  // resolve a phase with no offer to pick).
  const offers = rollOffers(w);
  if (offers.length === 0) return;
  w.offers = offers;
  w.rerollsLeft = w.content.boons.rerollsPerLevel;
  w.phase = 'levelup';
  w.levelupIdleTicks = 0;
}

/**
 * p9e (G18's dead-end clause, QA on t4 bug 4): every other decision phase
 * either times out (Act I's build/wave timers) or is driven by a Command; a
 * `levelup` offer with `autoPickLevelUps` off had no such floor, so an
 * unattended run (no bot policy, no player, e.g. a stepped headless/practice
 * run) parked in `phase === 'levelup'` forever once XP queued one. Called
 * once per tick the run loop spends in that phase (`run.ts`); after
 * `LEVELUP_IDLE_TIMEOUT_TICKS` with no `pick`/`reroll` Command applied, it
 * resolves the standing offer with the same rule `autoPickLevelUps` already
 * uses (Q150: 20s, the precedent V2's Dawn auto-advance set for "unattended
 * decision phase must not stall forever") — this never fires for a player
 * actually driving the level-up screen inside that window; it only bounds
 * the worst case for a run nobody is deciding for.
 *
 * fb045 (Q151 OVERRIDE): "unattended" means a `RunConfig` with a bot policy,
 * or a headless/sim run — both always set `cfg.policy` (see `tests/
 * helpers.ts`'s `cfg()` default and every `tools/*.ts` runner). A real
 * human-driven UI run never sets `policy` at all (`src/ui/main.ts`'s
 * `startRun`), so it is exempt and waits indefinitely with auto-pick off,
 * exactly as it always has for every other decision the player drives.
 */
export const LEVELUP_IDLE_TIMEOUT_TICKS = 20 * 60;

export function tickLevelupIdle(w: World): void {
  if (w.phase !== 'levelup') return;
  if (w.cfg.policy === undefined) return;
  w.levelupIdleTicks++;
  if (w.levelupIdleTicks < LEVELUP_IDLE_TIMEOUT_TICKS) return;
  // `openLevelUpIfPending` no longer opens this phase with an empty offer
  // list, so this should be unreachable in practice — kept as a defensive
  // fallback (belt-and-suspenders, same discipline this codebase applies
  // elsewhere) rather than a silent no-op forever if some future caller ever
  // does leave `w.offers` empty mid-phase: with nothing to pick, resume the
  // run instead of parking, which is the one thing G18 actually forbids.
  if (w.offers.length === 0) {
    w.phase = 'act2';
    return;
  }
  takeOffer(w, pickAutoOfferIndex(w, w.offers));
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
  // fb031: once a gem is attracted its pull speed ramps by `gemAttractGrowth`
  // every `gemAttractPeriodSeconds`, uncapped, so it always eventually
  // catches a character however far movement speed is stacked (fb041 removed
  // the VS "swift" boon's rank cap, so a build's real move speed has no
  // ceiling).
  const growth = w.content.spawns.gemAttractGrowth;
  const period = w.content.spawns.gemAttractPeriodSeconds;
  for (const g of w.gems) {
    if (g.dead) continue;
    const d2 = dist2(g.x, g.y, wd.x, wd.y);
    // A gem that has never entered pickup radius keeps waiting exactly as
    // before. One that has is attracted for good: the chase is sticky, so a
    // character fleeing fast enough to briefly reopen the gap cannot strand
    // it outside radius with the ramp frozen — the ramp is uncapped, so it
    // always closes the gap eventually instead of stalling the moment the
    // gap reopens.
    const attracted = d2 <= r2 || (g.attractedT ?? 0) > 0;
    if (attracted) {
      g.attractedT = (g.attractedT ?? 0) + dt;
      const mul = Math.pow(growth, g.attractedT / period);
      const n = normalize(wd.x - g.x, wd.y - g.y);
      const pull = (7 + radius) * mul;
      // Clamp the step to the actual remaining gap: an uncapped exponential
      // ramp otherwise flings the gem straight past the Warden and out the
      // far side once `pull * dt` exceeds the gap, diverging tick over tick
      // instead of closing it (qa-playtester found this live on fb031's
      // first submission — a gem could fly off and never be caught).
      const step = Math.min(pull * dt, Math.sqrt(d2));
      g.x += n.x * step;
      g.y += n.y * step;
    }
    // Re-measured after this tick's own move so a gem that just closed the
    // gap is collected the same tick, not one tick late.
    const d2After = attracted ? dist2(g.x, g.y, wd.x, wd.y) : d2;
    if (d2After <= 0.25) {
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
  // Traced (b010): today's only writer of the `luck` stat is `tree.json`'s
  // static integer nodes (finite, summing well under 200), so `luckBias`
  // itself cannot go non-finite through any current content. `Stats.add`'s
  // per-value guard also can't be bypassed by a single poisoned source. The
  // one real gap — `Stats.total`'s cross-source *summation* can still
  // overflow to +/-Infinity if two individually-finite extreme values are
  // both live at once — is left open as b022; `weightedIndex` below now
  // degrades that gracefully (every offer's weight goes non-finite and is
  // skipped, landing on a deterministic-but-valid pick) instead of crashing
  // or silently "always picking last".
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
    if (!b.uncapped && rank >= b.maxRank) continue;
    out.push({
      offer: {
        kind: 'boon',
        key: b.key,
        name: `${b.name} ${romanRank(rank + 1)}`,
        desc: b.desc,
        toLevel: rank + 1,
      },
      weight: 8,
      // fb041: an uncapped boon keeps stacking past `maxRank`, so the Luck
      // value saturates at 1 there instead of climbing past it forever
      // (same approach fb011 used for the old boon pool).
      value: b.uncapped ? Math.min(1, rank / b.maxRank) : rank / b.maxRank,
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
    if (!mastery.uncapped && rank >= mastery.maxRank) continue;
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
      value: mastery.uncapped ? Math.min(1, rank / mastery.maxRank) : rank / mastery.maxRank,
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
  // `NaN <= 0` is false, so a corrupted `rerollsLeft` (e.g. non-finite
  // `rerollsPerLevel` data) would otherwise read as "rerolls remaining"
  // forever, granting unlimited rerolls (b010).
  if (w.phase !== 'levelup' || !Number.isFinite(w.rerollsLeft) || w.rerollsLeft <= 0) return false;
  w.rerollsLeft--;
  w.offers = rollOffers(w);
  // p9e (code-reviewer finding): a reroll is a fresh offer roll exactly like
  // the one `openLevelUpIfPending` resets the idle clock for — without this,
  // a player who spends ~20s deciding and then rerolls (the clearest signal
  // of active engagement this phase has) could have the new offer auto-
  // resolved out from under them almost immediately.
  w.levelupIdleTicks = 0;
  return true;
}

export function applyOffer(w: World, offer: Offer): void {
  switch (offer.kind) {
    case 'boon': {
      const b = w.content.boonByKey.get(offer.key);
      if (!b) return;
      const before = w.boonRanks[b.key] ?? 0;
      const toLevel = clampRank(offer.toLevel, b.uncapped ? UNCAPPED_RANK_CEILING : b.maxRank);
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
      const mastery = w.content.boons.typeMastery;
      const toLevel = clampRank(offer.toLevel, mastery.uncapped ? UNCAPPED_RANK_CEILING : mastery.maxRank);
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
