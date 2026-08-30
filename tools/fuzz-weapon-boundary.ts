/**
 * Level-up-offer / VS-wielding boundary fuzz (BACKLOG-QUALITY q21, ported).
 *
 * q21 was written against the V2/V3 soul-weapon roster (`grantWeapon`/
 * `levelStats`/`bindSouls`/`beginSoulPick`), which SPEC-FINAL deleted
 * wholesale: §6.1's "every built tower type wields automatically"
 * (`wieldedAttacks`/`updateWieldedAttacks`, src/sim/vswield.ts) replaced the
 * granted-weapon system, and the level-up screen now deals only in `'boon'`
 * offers (`rollOffers`/`applyOffer`/`takeOffer`/`rerollOffers`,
 * src/sim/progression.ts). This port keeps q21's *intent* — clamping at
 * track ends, out-of-domain numeric inputs (0, negative, ±Infinity, NaN,
 * fractional), forged-offer trust, and slot/roster shape invariants — and
 * retargets each original category at its successor mechanic:
 *
 *   1. BOON RANK (was LEVEL + WEAPON OFFER + BOON OFFER) — `applyOffer`'s
 *      `'boon'` case still does `w.boonRanks[b.key] = offer.toLevel` with
 *      zero validation, the exact hole the original q30 category pinned; the
 *      whole numeric input domain is probed against it, and the consequence
 *      measured through `buildOfferPool`'s `rank >= b.maxRank` re-offer cap
 *      (progression.ts:109) — the only read-back gate the value has.
 *   2. BOON KEY — a forged offer whose key matches no boon (or the wrong
 *      case) must be a no-op, not a phantom `boonRanks` entry.
 *   3. PICK INDEX (was the slot-limit / duplicate-key command probes) —
 *      `takeOffer`'s index domain: `w.offers[index]` on -1, past-end, NaN,
 *      fractional and Infinity, plus the in-domain control.
 *   4. REROLL — `rerollOffers` at the counter's ends: zero left, exactly one
 *      left, wrong phase, and a corrupted (`NaN`) counter.
 *   5. POOL EXHAUSTED — every boon at `maxRank` when a level-up opens:
 *      `openLevelUpIfPending` still enters `'levelup'` with zero offers, and
 *      neither `takeOffer` (no offer at any index) nor `rerollOffers`
 *      (rerolls to another empty list) can leave the phase.
 *   6. WIELD TIER (was LEVEL/INHERITANCE via `Structure.tier`) — §6.1's
 *      formula reads `Structure.tier` through `upgradeStatMul`'s
 *      `Math.max(0, Math.min(level, maxLevel) - 1)` clamp, which propagates
 *      NaN exactly the way `soulLevelFor`'s clamp used to; a NaN tier makes
 *      the wielded damage NaN and one live `updateWieldedAttacks` tick then
 *      corrupts the enemy it hits (`damageEnemy`'s `amount <= 0` guard does
 *      not catch NaN) — the same immortal-enemy/NaN-`damageTotal` corruption
 *      the original damageBonus category pinned, reached through the
 *      successor path.
 *   7. WIELD ROSTER (was the souls-vs-slots census) — one entry per built
 *      attack-bearing type, attackless types wield nothing, duplicates of a
 *      type collapse into one averaged entry, dead structures are excluded,
 *      and a large group stays finite.
 *
 * Every probe is a direct `World` construction (`new World(cfg(), content)`)
 * plus, where needed, `forcePlace` — the same "write a Structure directly,
 * bypass build legality" technique the original file used, which lets a
 * probe pin a tier `upgradeTower` would never produce. No `src/ui`/
 * `src/render` import anywhere, so every probe is headless by construction.
 * Determinism: all randomness flows from `World`'s own seeded RNG streams.
 *
 *   npx tsx tools/fuzz-weapon-boundary.ts
 */

import { type Content, loadContent } from '../src/sim/content';
import { spawnEnemy } from '../src/sim/enemies';
import { applyOffer, openLevelUpIfPending, rerollOffers, rollOffers, takeOffer } from '../src/sim/progression';
import type { RunConfig, Structure } from '../src/sim/types';
import { updateWieldedAttacks, wieldedAttacks } from '../src/sim/vswield';
import { World } from '../src/sim/world';

export type Verdict = 'ok' | 'crashes' | 'ungated' | 'contaminated' | 'softlock';

export interface BoundaryCase {
  category: 'boonRank' | 'boonKey' | 'pickIndex' | 'reroll' | 'pool' | 'wieldTier' | 'wieldRoster';
  id: string;
  verdict: Verdict;
  detail: string;
}

export function cfg(): RunConfig {
  return { seed: 1, classKey: 'engineer', tier: 1, modifiers: [], allocated: [], relics: [], policy: 'none', cycles: 1 };
}

export function newWorld(content: Content = loadContent()): World {
  return new World(cfg(), content);
}

/**
 * Writes a Structure directly, bypassing `buildTower`'s placement legality —
 * the original file's technique, kept so a probe can pin a `tier` value
 * `upgradeTower` would never produce. Real placement scales hp/maxHp via
 * `structureMaxHp`; the flat `def.hp` here is a deliberate simplification,
 * harmless for every probe in this file (nothing here reads structure hp).
 * `wieldedDirty`/`auraDirty` are raised by hand because only the real
 * build/sell/death paths invalidate those caches.
 */
export function forcePlace(w: World, towerKey: string, tx: number, ty: number, tier: number): void {
  const def = w.content.towerByKey.get(towerKey)!;
  const s: Structure = {
    id: w.newId(),
    towerId: def.id,
    tier,
    tx,
    ty,
    hp: def.hp,
    maxHp: def.hp,
    spent: def.cost,
    cooldown: 0,
    dead: false,
    petrified: false,
    gemTimer: 0,
    gemsWaiting: 0,
    links: [],
    damageDealt: 0,
    pactActive: false,
    atkSpdBuffRemaining: 0,
    tithed: false,
  };
  w.addStructure(s);
  w.wieldedDirty = true;
  w.auraDirty = true;
}

function tryRun(fn: () => void): { threw: boolean; message?: string } {
  try {
    fn();
    return { threw: false };
  } catch (e) {
    return { threw: true, message: e instanceof Error ? e.message : String(e) };
  }
}

/** The boon every rank probe targets: maxRank 5, stat 'attackSpeed'. */
export const PROBE_BOON = 'haste';

/** How many `rollOffers` draws a re-offer probe samples. 3 of a ~10-card pool
 * (7 stat boons + 3 skill cards; Type Mastery is empty with no tower built)
 * per draw at (mostly) equal weight makes a missing re-offer over 60 draws a
 * ~1e-6 event, not a plausible unlucky streak. */
const REOFFER_DRAWS = 60;

function reoffersWithin(w: World, key: string, draws = REOFFER_DRAWS): boolean {
  w.phase = 'levelup';
  for (let i = 0; i < draws; i++) {
    if (rollOffers(w).some((o) => o.kind === 'boon' && o.key === key)) return true;
  }
  return false;
}

/* =========================================================== 1. BOON RANK =========================================================== */

const RANK_INPUTS: readonly number[] = [0, 1, 5, 6, -5, Infinity, -Infinity, NaN, 2.5];

function numCaseId(v: number): string {
  if (Number.isNaN(v)) return 'nan';
  if (v === Infinity) return 'posInf';
  if (v === -Infinity) return 'negInf';
  if (!Number.isInteger(v)) return 'fractional';
  if (v < 0) return 'negative';
  return String(v);
}

/**
 * `applyOffer`'s `'boon'` case (progression.ts:148-158) assigns
 * `offer.toLevel` into `boonRanks` unvalidated — the original q30 hole,
 * intact in the ported sim. Legal stores are integers in `[1, maxRank]`
 * (`buildOfferPool` only ever emits `rank + 1`). For an illegal store the
 * verdict is decided by what `buildOfferPool`'s `rank >= b.maxRank` cap does
 * when it reads the value back:
 *   - still re-offered  -> 'ungated' (each re-pick re-runs `stats.addAll`,
 *     so the boon can stack past `maxRank` — unbounded for a negative rank);
 *   - correctly held    -> 'contaminated' (the stored field is illegal, and
 *     for NaN the whole draw's weighting is defeated on the way — see the
 *     test file's named finding — but the cap's outcome held).
 */
export function boonRankBoundaryCases(content: Content = loadContent()): BoundaryCase[] {
  return RANK_INPUTS.map((toLevel) => {
    const w = newWorld(content);
    const maxRank = content.boonByKey.get(PROBE_BOON)!.maxRank;
    const r = tryRun(() => applyOffer(w, { kind: 'boon', key: PROBE_BOON, name: 'x', desc: 'x', toLevel }));
    const stored = w.boonRanks[PROBE_BOON];
    const inDomain = Number.isInteger(stored) && stored >= 1 && stored <= maxRank;
    const reoffered = r.threw ? false : reoffersWithin(w, PROBE_BOON);
    const verdict: Verdict = r.threw ? 'crashes' : inDomain ? 'ok' : reoffered ? 'ungated' : 'contaminated';
    const detail = r.threw
      ? `applyOffer(toLevel=${toLevel}) threw: ${r.message}`
      : `applyOffer(toLevel=${toLevel}) -> boonRanks.${PROBE_BOON}=${stored}${inDomain ? '' : ' (out of [1, maxRank])'}, ${reoffered ? 're-offered' : `never re-offered in ${REOFFER_DRAWS} draws`}`;
    return { category: 'boonRank', id: numCaseId(toLevel), verdict, detail };
  });
}

/* ============================================================ 2. BOON KEY ============================================================ */

const KEY_INPUTS: readonly { id: string; key: string }[] = [
  { id: 'key:valid', key: PROBE_BOON },
  { id: 'key:unknown', key: 'no_such_boon' },
  { id: 'key:empty', key: '' },
  { id: 'key:wrongCase', key: 'HASTE' },
];

/** A forged offer with a key `boonByKey` cannot resolve must change nothing. */
export function boonKeyBoundaryCases(content: Content = loadContent()): BoundaryCase[] {
  return KEY_INPUTS.map(({ id, key }) => {
    const w = newWorld(content);
    const r = tryRun(() => applyOffer(w, { kind: 'boon', key, name: 'x', desc: 'x', toLevel: 1 }));
    const isReal = content.boonByKey.has(key);
    const entries = Object.keys(w.boonRanks);
    const clean = isReal ? w.boonRanks[key] === 1 : entries.length === 0;
    const verdict: Verdict = r.threw ? 'crashes' : clean ? 'ok' : 'contaminated';
    const detail = r.threw
      ? `applyOffer(key='${key}') threw: ${r.message}`
      : `applyOffer(key='${key}') -> boonRanks keys [${entries.join(', ')}]`;
    return { category: 'boonKey', id, verdict, detail };
  });
}

/* =========================================================== 3. PICK INDEX =========================================================== */

const INDEX_INPUTS: readonly number[] = [0, -1, 3, 100, NaN, 0.5, Infinity];

/**
 * The `'pick'` Command's payload lands in `takeOffer(w, index)` unchecked;
 * `w.offers[index]` is the only gate. Out-of-domain indices must be
 * rejected (return false, stay in 'levelup', change nothing) — an accepted
 * one would be a forged-Command state change.
 */
export function pickIndexBoundaryCases(content: Content = loadContent()): BoundaryCase[] {
  return INDEX_INPUTS.map((index) => {
    const w = newWorld(content);
    w.phase = 'levelup';
    w.offers = rollOffers(w);
    const offerCount = w.offers.length;
    const legal = Number.isInteger(index) && index >= 0 && index < offerCount;
    let took = false;
    const r = tryRun(() => {
      took = takeOffer(w, index);
    });
    const stateChanged = Object.keys(w.boonRanks).length > 0 || w.phase !== 'levelup';
    const verdict: Verdict = r.threw
      ? 'crashes'
      : legal
        ? took && stateChanged
          ? 'ok'
          : 'contaminated'
        : took || stateChanged
          ? 'ungated'
          : 'ok';
    const detail = r.threw
      ? `takeOffer(index=${index}) threw: ${r.message}`
      : `takeOffer(index=${index}) of ${offerCount} offers -> ${took}, phase=${w.phase}, ranks=[${Object.keys(w.boonRanks).join(', ')}]`;
    return { category: 'pickIndex', id: numCaseId(index), verdict, detail };
  });
}

/* ============================================================== 4. REROLL ============================================================== */

function rerollNoneLeftCase(content: Content): BoundaryCase {
  const w = newWorld(content);
  w.phase = 'levelup';
  w.offers = rollOffers(w);
  w.rerollsLeft = 0;
  const before = w.offers;
  const ok = !rerollOffers(w) && w.offers === before && w.rerollsLeft === 0;
  return {
    category: 'reroll',
    id: 'rerolls:zero',
    verdict: ok ? 'ok' : 'ungated',
    detail: `rerollsLeft=0 -> rerollOffers()=${!ok ? 'accepted' : 'refused'}, rerollsLeft=${w.rerollsLeft}`,
  };
}

function rerollLastCase(content: Content): BoundaryCase {
  const w = newWorld(content);
  w.phase = 'levelup';
  w.offers = rollOffers(w);
  w.rerollsLeft = 1;
  const first = rerollOffers(w);
  const second = rerollOffers(w);
  const ok = first && !second && w.rerollsLeft === 0;
  return {
    category: 'reroll',
    id: 'rerolls:lastThenStop',
    verdict: ok ? 'ok' : 'ungated',
    detail: `rerollsLeft=1 -> first=${first}, second=${second}, rerollsLeft=${w.rerollsLeft}`,
  };
}

function rerollWrongPhaseCase(content: Content): BoundaryCase {
  const w = newWorld(content);
  w.rerollsLeft = 3; // phase is 'act1_build'
  const accepted = rerollOffers(w);
  return {
    category: 'reroll',
    id: 'rerolls:wrongPhase',
    verdict: accepted ? 'ungated' : 'ok',
    detail: `phase=${w.phase}, rerollsLeft=3 -> rerollOffers()=${accepted}`,
  };
}

/** A corrupted counter: `NaN <= 0` is false, so the phase-and-counter guard
 * passes and `NaN - 1` stays NaN — infinite rerolls. Not reachable through
 * the real Command surface (the counter is only ever written from
 * `content.boons.rerollsPerLevel`), the same defense-in-depth caveat as the
 * original file's forged-offer probes. */
function rerollNanCounterCase(content: Content): BoundaryCase {
  const w = newWorld(content);
  w.phase = 'levelup';
  w.offers = rollOffers(w);
  w.rerollsLeft = NaN;
  let accepted = 0;
  for (let i = 0; i < 10; i++) if (rerollOffers(w)) accepted++;
  return {
    category: 'reroll',
    id: 'rerolls:nan',
    verdict: accepted === 0 ? 'ok' : 'ungated',
    detail: `rerollsLeft=NaN -> ${accepted}/10 rerolls accepted, rerollsLeft=${w.rerollsLeft}`,
  };
}

export function rerollBoundaryCases(content: Content = loadContent()): BoundaryCase[] {
  return [rerollNoneLeftCase(content), rerollLastCase(content), rerollWrongPhaseCase(content), rerollNanCounterCase(content)];
}

/* ======================================================== 5. POOL EXHAUSTED ======================================================== */

/**
 * Every stat boon and skill card legitimately at `maxRank` (the ladder
 * `applyOffer` itself walks) empties `buildOfferPool` (Type Mastery is
 * already empty here — no tower is ever built in this probe). A level-up
 * then opens 'levelup' with zero offers — and `takeOffer` (no offer at any
 * index) and `rerollOffers` (rerolls to another empty list) both leave the
 * phase where it is. Reachable through real play (7 stat boons x 5 ranks + 3
 * skill cards x 2 ranks), so this one carries no forged-input caveat.
 */
export function poolExhaustedCases(content: Content = loadContent()): BoundaryCase[] {
  const w = newWorld(content);
  // p7a (§6.3): the pool is 3 families now — stat boons, Type Mastery (never
  // offered here since no tower is ever built in this probe, so it
  // contributes nothing to exhaust) and the run class's 3 skill cards. Both
  // real families have to be maxed for `buildOfferPool` to actually empty.
  for (const b of content.boons.statBoons) {
    for (let rank = 1; rank <= b.maxRank; rank++) {
      applyOffer(w, { kind: 'boon', key: b.key, name: 'x', desc: 'x', toLevel: rank });
    }
  }
  for (const card of content.boons.skillCards[w.cfg.classKey] ?? []) {
    for (let rank = 1; rank <= card.maxRank; rank++) {
      applyOffer(w, { kind: 'skill_card', key: card.key, name: 'x', desc: 'x', toLevel: rank });
    }
  }
  w.phase = 'act2';
  w.pendingLevelUps = 1;
  const r = tryRun(() => openLevelUpIfPending(w));
  if (r.threw) {
    return [{ category: 'pool', id: 'pool:exhausted', verdict: 'crashes', detail: `openLevelUpIfPending() threw: ${r.message}` }];
  }
  // `as string`: TS still narrows `w.phase` to the 'act2' literal assigned
  // above — it cannot see openLevelUpIfPending's mutation through tryRun.
  const entered = (w.phase as string) === 'levelup';
  const offerCount = w.offers.length;
  let escaped = !entered;
  if (entered) {
    for (let i = 0; i < 3 && !escaped; i++) escaped = takeOffer(w, i);
    if (!escaped) {
      rerollOffers(w);
      for (let i = 0; i < 3 && !escaped; i++) escaped = takeOffer(w, i);
    }
    escaped = escaped || (w.phase as string) !== 'levelup';
  }
  const verdict: Verdict = entered && offerCount === 0 && !escaped ? 'softlock' : 'ok';
  const detail = `all boons at maxRank -> openLevelUpIfPending(): phase=${w.phase}, ${offerCount} offers; pick x3 + reroll + pick x3 ${escaped ? 'escaped' : 'cannot leave the phase'}`;
  return [{ category: 'pool', id: 'pool:exhausted', verdict, detail }];
}

/* =========================================================== 6. WIELD TIER =========================================================== */

const TIER_INPUTS: readonly { id: string; tier: number }[] = [
  { id: 'tier:1', tier: 1 },
  { id: 'tier:zero', tier: 0 },
  { id: 'tier:negative', tier: -5 },
  { id: 'tier:huge', tier: 1e9 },
  { id: 'tier:nan', tier: NaN },
  { id: 'tier:fractional', tier: 2.5 },
];

/**
 * §6.1 reads `Structure.tier` through `upgradeStatMul`'s
 * `Math.max(0, Math.min(level, maxLevel) - 1)` clamp — sound at 0, negative
 * and huge, but NaN propagates (the exact shape of the original
 * `soulLevelFor` finding). The verdict is measured at the consequence, not
 * the stored field: one live `updateWieldedAttacks` tick against a real husk
 * in range, then `e.hp`/`w.damageTotal` finiteness — because a NaN wielded
 * damage never crashes (it is never an array index), it slips past
 * `damageEnemy`'s `amount <= 0` guard (`NaN <= 0` is false) and corrupts the
 * enemy and the run totals silently, the original damageBonus category's
 * failure mode reached through the successor mechanic.
 */
export function wieldTierBoundaryCases(content: Content = loadContent()): BoundaryCase[] {
  return TIER_INPUTS.map(({ id, tier }) => {
    const w = newWorld(content);
    forcePlace(w, 'arrow_spire', 5, 5, tier);
    let damage = NaN;
    const rF = tryRun(() => {
      const [a] = wieldedAttacks(w);
      damage = a?.damage ?? NaN;
    });
    if (rF.threw) {
      return { category: 'wieldTier', id, verdict: 'crashes', detail: `tier=${tier} -> wieldedAttacks() threw: ${rF.message}` };
    }
    const e = spawnEnemy(w, 'husk', w.warden.x + 1, w.warden.y, { overlay: false })!;
    w.rebuildBuckets();
    const rT = tryRun(() => updateWieldedAttacks(w, 1 / 60));
    const clean = Number.isFinite(damage) && Number.isFinite(e.hp) && Number.isFinite(w.damageTotal);
    const verdict: Verdict = rT.threw ? 'crashes' : clean ? 'ok' : 'contaminated';
    const detail = rT.threw
      ? `tier=${tier} -> wielded damage=${damage}, updateWieldedAttacks() threw: ${rT.message}`
      : `tier=${tier} -> wielded damage=${damage}, after one tick e.hp=${e.hp}, e.dead=${e.dead}, damageTotal=${w.damageTotal}`;
    return { category: 'wieldTier', id, verdict, detail };
  });
}

/* ========================================================== 7. WIELD ROSTER ========================================================== */

/** The 7 towers that author an `attack`, in `data/towers.json` order. */
export const ATTACK_TOWER_KEYS: readonly string[] = [
  'arrow_spire',
  'ballista',
  'ember_brazier',
  'frost_obelisk',
  'tesla_coil',
  'mortar',
  'venom_spore',
];

/** The 3 that do not (per §6.1, they stand inert and wield nothing). */
export const ATTACKLESS_TOWER_KEYS: readonly string[] = ['palisade', 'beacon_totem', 'harvest_sprout'];

function rosterCase(content: Content, id: string, probe: (w: World) => { pass: boolean; note: string }): BoundaryCase {
  const w = newWorld(content);
  let out = { pass: false, note: '' };
  const r = tryRun(() => {
    out = probe(w);
  });
  const verdict: Verdict = r.threw ? 'crashes' : out.pass ? 'ok' : 'contaminated';
  return { category: 'wieldRoster', id, verdict, detail: r.threw ? `threw: ${r.message}` : out.note };
}

export function wieldRosterCases(content: Content = loadContent()): BoundaryCase[] {
  return [
    rosterCase(content, 'roster:empty', (w) => {
      const list = wieldedAttacks(w);
      return { pass: list.length === 0, note: `empty board -> ${list.length} wielded entries` };
    }),
    rosterCase(content, 'roster:allTypes', (w) => {
      ATTACK_TOWER_KEYS.forEach((k, i) => forcePlace(w, k, 4 + i, 4, 1));
      ATTACKLESS_TOWER_KEYS.forEach((k, i) => forcePlace(w, k, 4 + i, 6, 1));
      const list = wieldedAttacks(w);
      const keys = list.map((a) => a.towerKey).sort();
      const finite = list.every((a) => Number.isFinite(a.damage) && a.damage > 0 && Number.isFinite(a.interval));
      const pass = list.length === ATTACK_TOWER_KEYS.length && finite && list.every((a) => a.count === 1);
      return { pass, note: `all 10 types built -> wields [${keys.join(', ')}], all finite=${finite}` };
    }),
    rosterCase(content, 'roster:attacklessOnly', (w) => {
      ATTACKLESS_TOWER_KEYS.forEach((k, i) => forcePlace(w, k, 4 + i, 4, 1));
      const list = wieldedAttacks(w);
      return { pass: list.length === 0, note: `walls/totem/sprout only -> ${list.length} wielded entries` };
    }),
    rosterCase(content, 'roster:duplicatesCollapse', (w) => {
      for (let i = 0; i < 5; i++) forcePlace(w, 'arrow_spire', 4 + i, 4, 1);
      const list = wieldedAttacks(w);
      const a = list[0];
      const base = w.content.towerByKey.get('arrow_spire')!.attack!.damage;
      const pass = list.length === 1 && a.count === 5 && Math.abs(a.damage - base * 1.5) < 1e-9;
      return { pass, note: `5 identical arrows -> ${list.length} entry, count=${a?.count}, damage=${a?.damage} (expect ${base * 1.5})` };
    }),
    rosterCase(content, 'roster:deadExcluded', (w) => {
      forcePlace(w, 'arrow_spire', 4, 4, 1);
      forcePlace(w, 'arrow_spire', 5, 4, 1);
      w.structures[1].dead = true;
      const list = wieldedAttacks(w);
      return { pass: list.length === 1 && list[0].count === 1, note: `1 live + 1 dead arrow -> count=${list[0]?.count}` };
    }),
    rosterCase(content, 'roster:many', (w) => {
      let n = 0;
      for (let ty = 4; ty < 14; ty++) for (let tx = 4; tx < 14; tx++) forcePlace(w, 'arrow_spire', tx, ty, 1), n++;
      const [a] = wieldedAttacks(w);
      const base = w.content.towerByKey.get('arrow_spire')!.attack!.damage;
      const pass = a.count === n && Number.isFinite(a.damage) && Math.abs(a.damage - base * (1 + 0.1 * n)) < 1e-6;
      return { pass, note: `${n} arrows -> count=${a.count}, damage=${a.damage} (finite, +10% each)` };
    }),
  ];
}

/* =============================================================== census =============================================================== */

export function runCensus(content: Content = loadContent()): BoundaryCase[] {
  return [
    ...boonRankBoundaryCases(content),
    ...boonKeyBoundaryCases(content),
    ...pickIndexBoundaryCases(content),
    ...rerollBoundaryCases(content),
    ...poolExhaustedCases(content),
    ...wieldTierBoundaryCases(content),
    ...wieldRosterCases(content),
  ];
}

/* eslint-disable no-console */
function main(): void {
  const rows = runCensus();
  for (const r of rows) {
    console.log(`[${r.verdict.padEnd(12)}] ${r.category}:${r.id} — ${r.detail}`);
  }
  const holes = rows.filter((r) => r.verdict !== 'ok');
  console.log(`\n${holes.length}/${rows.length} boundary cases are not cleanly 'ok'.`);
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('tools/fuzz-weapon-boundary.ts');
if (invokedDirectly) {
  try {
    main();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`fuzz-weapon-boundary: ${message.replace(/\s+/g, ' ').trim()}`);
    process.exitCode = 1;
  }
}
