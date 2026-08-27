/**
 * Soul-weapon boundary fuzz (BACKLOG-QUALITY q21).
 *
 * PROGRESS.md's P5 audit line: "P2's VS inheritance formula is not built —
 * `data/weapons.json`'s 8-weapon roster with its own level ladders and 6
 * slots stands where SPEC-FINAL §6.1's average-across-the-type formula
 * belongs." That old-but-shipped system is what this file fuzzes — the V2/V3
 * soul binding in `src/sim/progression.ts` (`deriveSouls`/`bindSouls`/
 * `soulLevelFor`) and `src/sim/weapons.ts` (`grantWeapon`/`levelStats`), still
 * live and reachable through every real run today. `soulLevelFor`'s own
 * comment already names its retirement date (p2e, when §6.1 replaces it
 * wholesale) — this file's findings are about what's shipped now, not a
 * critique of a formula the spec has already decided to throw away.
 *
 * Four named boundary categories (the first three are BACKLOG-QUALITY q21's
 * acceptance line; the fourth is q27's follow-up, added once q21's own QA
 * pass found a sibling gap):
 *
 *   1. LEVEL   — a weapon's level clamped at the 1/6 track ends, and what a
 *      caller outside that domain (0, negative, ±Infinity, NaN, fractional)
 *      does to `grantWeapon`/`levelStats`/the live fire loop.
 *   2. INHERITANCE — `soulLevelFor`'s tier->level mapping at tier boundaries
 *      (0, negative, absurdly high, NaN — the last reachable if a structure's
 *      `tier` field is ever corrupted upstream), plus the "fewer distinct
 *      souls than weapon slots" auto-bind path in `beginSoulPick`/`bindSouls`
 *      and the `weaponSlots` floor/fractional edges that feed it.
 *   3. AWAKENING — the Lv6 + boon-rank-3 gate. `buildOfferPool` (private,
 *      progression.ts:143-153) enforces it when *generating* an offer;
 *      `applyOffer`'s `'awakening'` case (progression.ts:198-207) does not
 *      re-check either condition when *applying* one — verified below via
 *      `applyOffer` itself, the real exported entrypoint, not a re-derived
 *      copy of the private predicate.
 *   4. WEAPON OFFER — `applyOffer`'s `'weapon'` case (progression.ts:182-186)
 *      has the same "trusts the offer's origin" shape as AWAKENING, but only
 *      half-guards it: `ws.level = Math.min(maxLevel, offer.toLevel)` clamps
 *      the upper bound and never re-validates the result the way
 *      `grantWeapon`'s own create-branch clamp does, so a forged `toLevel`
 *      can still land an illegal value in `ws.level`.
 *   5. WEAPON UPDATE (q29) — `grantWeapon`'s *update* branch (an existing
 *      `WeaponState` found by key, weapons.ts:63-66) does
 *      `existing.level = Math.max(existing.level, level)` with no clamp and
 *      no finite guard at all, unlike the create branch's own
 *      `Math.max(1, Math.min(maxLevel, level))`. Reached through `bindSouls`
 *      or `applyOffer`'s `'weapon'` case when either passes an out-of-domain
 *      `level` to an *already-granted* weapon — not a live Command-surface
 *      exploit today, since neither caller's real inputs are ever illegal.
 *   6. BOON OFFER (q30) — `applyOffer`'s `'boon'` case (progression.ts:
 *      187-196) has *zero* validation of `offer.toLevel`, not even the
 *      upper-bound-only clamp WEAPON OFFER gets: `w.boonRanks[b.key] =
 *      offer.toLevel` assigns a forged offer's value straight through. The
 *      poisoned rank then corrupts `buildOfferPool`'s own, independently
 *      correct `rank >= b.maxRank` re-offer cap (progression.ts:129) — NaN
 *      and negative values defeat the comparison and let the boon be
 *      re-picked (and its stats re-stacked) forever past `maxRank`.
 *
 * Every probe is a direct `World` construction (`new World(cfg(), content)`)
 * plus, where needed, `forcePlace` — the same "write a Structure directly,
 * bypass build legality" technique the retired `tests/sundering.test.ts` used
 * to test post-Sundering geometry. No `src/ui`/`src/render` import anywhere,
 * so every probe here is headless by construction, same guarantee q15's
 * fuzzer gets from the same discipline.
 *
 *   npx tsx tools/fuzz-weapon-boundary.ts
 */

import { type Content, loadContent } from '../src/sim/content';
import { spawnEnemy } from '../src/sim/enemies';
import { applyOffer, bindSouls, deriveSouls, rollOffers } from '../src/sim/progression';
import { beginSoulPick } from '../src/sim/sundering';
import type { RunConfig, Structure } from '../src/sim/types';
import { grantWeapon, updateWeapons } from '../src/sim/weapons';
import { World } from '../src/sim/world';

export type Verdict = 'ok' | 'crashes' | 'ungated' | 'contaminated';

export interface BoundaryCase {
  category: 'level' | 'inheritance' | 'awakening' | 'weaponOffer' | 'weaponUpdate' | 'boon' | 'damageBonus';
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
 * the retired `tests/sundering.test.ts`'s own technique for testing
 * post-Sundering state without a build phase in the way. Lets a probe pin a
 * tower's `tier` to a value `upgradeTower` would never produce.
 */
export function forcePlace(w: World, towerKey: string, tx: number, ty: number, tier: number): void {
  const def = w.content.towerByKey.get(towerKey)!;
  const s: Structure = {
    id: w.newId(),
    towerId: def.id,
    tier,
    tx,
    ty,
    // Real placement scales hp/maxHp via `structureMaxHp(w, def, tier)`; the
    // flat `def.hp` here is a deliberate simplification, harmless for every
    // probe in this file (none of the three boundary categories read hp),
    // but worth re-deriving through `structureMaxHp` before reusing
    // `forcePlace` for anything that does.
    hp: def.hp,
    maxHp: def.hp,
    spent: def.cost,
    cooldown: 0,
    dead: false,
    petrified: false,
    soulSuppressed: false,
    gemTimer: 0,
    gemsWaiting: 0,
    links: [],
    damageDealt: 0,
  };
  w.addStructure(s);
}

function tryRun(fn: () => void): { threw: boolean; message?: string } {
  try {
    fn();
    return { threw: false };
  } catch (e) {
    return { threw: true, message: e instanceof Error ? e.message : String(e) };
  }
}

/* ============================================================ 1. LEVEL ============================================================ */

const LEVEL_INPUTS: readonly number[] = [0, 1, 6, 7, -1, Infinity, -Infinity, NaN, 2.5];

function levelCaseId(level: number): string {
  if (Number.isNaN(level)) return 'nan';
  if (level === Infinity) return 'posInf';
  if (level === -Infinity) return 'negInf';
  if (!Number.isInteger(level)) return 'fractional';
  if (level < 0) return 'negative';
  return String(level);
}

export function levelBoundaryCases(content: Content = loadContent()): BoundaryCase[] {
  return LEVEL_INPUTS.map((level) => {
    const w = newWorld(content);
    const ws = grantWeapon(w, 'flame_cone', level, 0);
    const grantedLevel = ws.level;
    const r = tryRun(() => updateWeapons(w, 1 / 60));
    const verdict: Verdict = r.threw ? 'crashes' : 'ok';
    const detail = r.threw
      ? `grantWeapon(level=${level}) -> ws.level=${grantedLevel}, updateWeapons() threw: ${r.message}`
      : `grantWeapon(level=${level}) -> ws.level=${grantedLevel}, fires cleanly`;
    return { category: 'level', id: levelCaseId(level), verdict, detail };
  });
}

/* ======================================================= 2. INHERITANCE ======================================================= */

const TIER_INPUTS: readonly { id: string; tier: number }[] = [
  { id: 'tier:1', tier: 1 },
  { id: 'tier:zero', tier: 0 },
  { id: 'tier:negative', tier: -5 },
  { id: 'tier:huge', tier: 1e9 },
  { id: 'tier:nan', tier: NaN },
];

function tierBoundaryCase(content: Content, id: string, tier: number): BoundaryCase {
  const w = newWorld(content);
  forcePlace(w, 'ember_brazier', 5, 5, tier);
  const souls = deriveSouls(w);
  const derivedLevel = souls[0]?.level;
  bindSouls(w, souls.map((s) => s.key));
  const r = tryRun(() => updateWeapons(w, 1 / 60));
  const verdict: Verdict = r.threw ? 'crashes' : 'ok';
  const detail = r.threw
    ? `Structure.tier=${tier} -> deriveSouls level=${derivedLevel} -> updateWeapons() threw: ${r.message}`
    : `Structure.tier=${tier} -> deriveSouls level=${derivedLevel}, binds and fires cleanly`;
  return { category: 'inheritance', id, verdict, detail };
}

/** The 7 towers with a `soul`, in `data/towers.json` order. */
const SOUL_TOWER_KEYS: readonly string[] = [
  'arrow_spire',
  'ballista',
  'ember_brazier',
  'frost_obelisk',
  'tesla_coil',
  'mortar',
  'venom_spore',
];

function soulCountCase(content: Content, id: string, count: number): BoundaryCase {
  const w = newWorld(content);
  for (let i = 0; i < count; i++) forcePlace(w, SOUL_TOWER_KEYS[i], 5 + i, 5, 3);
  const slots = w.derived.weaponSlots;
  const r = tryRun(() => beginSoulPick(w));
  const verdict: Verdict = r.threw ? 'crashes' : 'ok';
  const detail = r.threw
    ? `${count} distinct souls, ${slots} slots -> beginSoulPick() threw: ${r.message}`
    : `${count} distinct souls, ${slots} slots -> phase=${w.phase}, weapons=[${w.weapons.map((x) => x.key).join(', ')}]`;
  return { category: 'inheritance', id, verdict, detail };
}

function slotsFlooredCase(content: Content): BoundaryCase {
  const w = newWorld(content);
  w.stats.add('probe', 'weaponSlots', -1000);
  w.recomputeDerived();
  const r = tryRun(() => beginSoulPick(w));
  const verdict: Verdict = r.threw ? 'crashes' : 'ok';
  const detail = r.threw
    ? `weaponSlots stat -1000 -> derived=${w.derived.weaponSlots}, beginSoulPick() threw: ${r.message}`
    : `weaponSlots stat -1000 -> derived=${w.derived.weaponSlots} (floored), phase=${w.phase}`;
  return { category: 'inheritance', id: 'slots:flooredAtOne', verdict, detail };
}

function slotsFractionalCase(content: Content): BoundaryCase {
  const w = newWorld(content);
  w.stats.add('probe', 'weaponSlots', -2.5);
  w.recomputeDerived();
  for (let i = 0; i < 4; i++) forcePlace(w, SOUL_TOWER_KEYS[i], 5 + i, 5, 3);
  const souls = deriveSouls(w);
  const r = tryRun(() => bindSouls(w, souls.map((s) => s.key)));
  const verdict: Verdict = r.threw ? 'crashes' : 'ok';
  const detail = r.threw
    ? `weaponSlots stat -2.5 -> derived=${w.derived.weaponSlots}, bindSouls() threw: ${r.message}`
    : `weaponSlots stat -2.5 -> derived=${w.derived.weaponSlots}, ${souls.length} candidate souls -> bound [${w.weapons.map((x) => x.key).join(', ')}]`;
  return { category: 'inheritance', id: 'slots:fractionalTruncates', verdict, detail };
}

export function inheritanceCases(content: Content = loadContent()): BoundaryCase[] {
  return [
    ...TIER_INPUTS.map(({ id, tier }) => tierBoundaryCase(content, id, tier)),
    soulCountCase(content, 'souls:zero', 0),
    soulCountCase(content, 'souls:one', 1),
    soulCountCase(content, 'souls:fewerThanSlots', 2),
    soulCountCase(content, 'souls:equalsSlots', 6),
    soulCountCase(content, 'souls:oneMoreThanSlots', 7),
    slotsFlooredCase(content),
    slotsFractionalCase(content),
  ];
}

/* ========================================================= 3. AWAKENING ========================================================= */

export const AWAKENING_KEY = 'storm_avatar'; // weapon: chain_lightning, boon: haste, boonRank: 3
export const AWAKENING_WEAPON = 'chain_lightning';
export const AWAKENING_BOON = 'haste';

const AWAKENING_GATE_INPUTS: readonly { id: string; level: number; rank: number; gateMet: boolean }[] = [
  { id: 'gate:levelMet_rankMet', level: 6, rank: 3, gateMet: true },
  { id: 'gate:levelMet_rankUnmet', level: 6, rank: 0, gateMet: false },
  { id: 'gate:levelUnmet_rankMet', level: 1, rank: 3, gateMet: false },
  { id: 'gate:levelUnmet_rankUnmet', level: 1, rank: 0, gateMet: false },
];

export function awakeningGateCases(content: Content = loadContent()): BoundaryCase[] {
  return AWAKENING_GATE_INPUTS.map(({ id, level, rank, gateMet }) => {
    const w = newWorld(content);
    const ws = grantWeapon(w, AWAKENING_WEAPON, level, 0);
    w.boonRanks[AWAKENING_BOON] = rank;
    applyOffer(w, { kind: 'awakening', key: AWAKENING_KEY, name: 'x', desc: 'x', toLevel: 1 });
    const applied = ws.awakened;
    // Applying when the gate is met is correct; applying when it is not is
    // the finding — `applyOffer` trusts the offer's origin instead of
    // re-checking the condition `buildOfferPool` used to generate it.
    const verdict: Verdict = applied && !gateMet ? 'ungated' : 'ok';
    const detail = `weapon level=${level} (needs 6), boon rank=${rank} (needs 3) -> applyOffer() ${applied ? 'applied' : 'no-op'}`;
    return { category: 'awakening', id, verdict, detail };
  });
}

/* ======================================================== 4. WEAPON OFFER ======================================================== */

const WEAPON_OFFER_INPUTS: readonly { id: string; toLevel: number }[] = [
  { id: 'weapon:toLevelNan', toLevel: NaN },
  { id: 'weapon:toLevelNegative', toLevel: -5 },
];

/** Same weapon `levelBoundaryCases` above already uses, kept starting at a legal mid-track level. */
export const WEAPON_OFFER_TARGET = 'flame_cone';

export function weaponOfferBoundaryCases(content: Content = loadContent()): BoundaryCase[] {
  return WEAPON_OFFER_INPUTS.map(({ id, toLevel }) => {
    const w = newWorld(content);
    const ws = grantWeapon(w, WEAPON_OFFER_TARGET, 3, 0);
    applyOffer(w, { kind: 'weapon', key: WEAPON_OFFER_TARGET, name: 'x', desc: 'x', toLevel });
    const appliedLevel = ws.level;
    const r = tryRun(() => updateWeapons(w, 1 / 60));
    const verdict: Verdict = r.threw ? 'crashes' : 'ok';
    const detail = r.threw
      ? `applyOffer(toLevel=${toLevel}) -> ws.level=${appliedLevel}, updateWeapons() threw: ${r.message}`
      : `applyOffer(toLevel=${toLevel}) -> ws.level=${appliedLevel}, fires cleanly`;
    return { category: 'weaponOffer', id, verdict, detail };
  });
}

/* ======================================================== 5. WEAPON UPDATE ======================================================== */

/**
 * Same weapon `levelBoundaryCases`/`weaponOfferBoundaryCases` above already
 * use, granted first at the track's floor (level 1) so any input above it is
 * a genuine change `Math.max` will let through.
 */
export const WEAPON_UPDATE_TARGET = 'flame_cone';

/**
 * The create branch's own clamp (`Math.max(1, Math.min(maxLevel, level))`)
 * means the *stored* result of an update call can differ from what the same
 * input would produce on a fresh grant — `grantWeapon`'s update branch skips
 * that clamp entirely. A result is `'contaminated'` when it neither crashes
 * the live fire loop (levelStats's own read-time
 * `Math.max(1, Math.min(top, ws.level))` clamp still protects most reads)
 * nor stays inside the legal `[1, maxLevel]` domain the create branch would
 * have enforced — so a raw reader of `ws.level` sees an illegal value the
 * fire loop's defensive clamp never surfaces. Measured (not assumed): the
 * determinism hash (`hashWorld`, run.ts:656, `h.int(wp.level)`) genuinely
 * discriminates a contaminated 7 from the legitimate cap 6; `buildOfferPool`
 * (progression.ts:112, `ws.level < maxLevel`) does NOT — 6 < 6 and 7 < 6 are
 * both false, so it excludes both cases identically and is not a
 * discriminating consequence of this hole.
 */
export function weaponUpdateBoundaryCases(content: Content = loadContent()): BoundaryCase[] {
  const maxLevel = content.weapons.maxLevel;
  return LEVEL_INPUTS.map((level) => {
    const w = newWorld(content);
    grantWeapon(w, WEAPON_UPDATE_TARGET, 1, 0); // create at the track's floor
    const ws = grantWeapon(w, WEAPON_UPDATE_TARGET, level, 0); // update with the poisoned value
    const updatedLevel = ws.level;
    const r = tryRun(() => updateWeapons(w, 1 / 60));
    const inDomain = updatedLevel >= 1 && updatedLevel <= maxLevel;
    const verdict: Verdict = r.threw ? 'crashes' : inDomain ? 'ok' : 'contaminated';
    const detail = r.threw
      ? `create(level=1) then update(level=${level}) -> ws.level=${updatedLevel}, updateWeapons() threw: ${r.message}`
      : `create(level=1) then update(level=${level}) -> ws.level=${updatedLevel}, fires cleanly${inDomain ? '' : ' (out of [1, maxLevel] domain)'}`;
    return { category: 'weaponUpdate', id: levelCaseId(level), verdict, detail };
  });
}

/* ========================================================== 6. BOON OFFER ========================================================== */

/**
 * Reuses `AWAKENING_BOON` ('haste', maxRank 5 — the same boon
 * `AWAKENING_GATE_INPUTS` already gates the Awakening on, at rank 3) as the
 * probed boon, so the same poisoned state can also demonstrate, in the test
 * file, that `buildOfferPool`'s independently-written Awakening rank check
 * (progression.ts:147) is fooled by the same corruption — not just its own
 * `'boon'`-offer re-cap check (progression.ts:129).
 *
 * Verdict measured (not assumed, and not the same mechanism for all three —
 * checked live with `tools/_scratch-probe*.ts`, not committed): does
 * `buildOfferPool`'s `rank >= b.maxRank` cap (progression.ts:129) still stop
 * the boon reappearing in the pool once its rank is poisoned?
 *   - Infinity: `Infinity >= 5` is `true` — the comparison is mathematically
 *     sound even on the poisoned value, so the boon is legitimately excluded
 *     from the pool. `'contaminated'`: the stored rank is still illegal.
 *     Distinguishable from every *legitimately reachable* `hashWorld` state
 *     for this boon key, but not for the reason it first looks like —
 *     `Hasher.int()`'s `v | 0` (hash.ts:13) coerces `NaN`/`±Infinity` *and*
 *     an explicit `0` to the identical hash contribution, measured directly;
 *     it only reads as "observable" because no legitimate `applyOffer` call
 *     ever stores `0` (every real offer is `rank + 1 >= 1`), not because
 *     `Infinity` carries a distinct bit pattern.
 *   - NaN: `NaN >= 5` is `false`, so the offer *is* pushed into the pool,
 *     with `value: NaN / 5 = NaN` and therefore a `NaN` `rollOffers` weight.
 *     `Rng.weightedIndex` sums weights into `total`; a `NaN` total makes
 *     every `r < 0` comparison in its scan false, so the loop falls through
 *     to its `return weights.length - 1` fallback — deterministically the
 *     *last remaining pool entry*, not the corrupted one, every single draw
 *     (measured: 0/200 across a wider sample than the census itself takes).
 *     So it never reoffers, but not because the cap held — the cap did
 *     *not* fire, and the cost is a side effect worse than a single boon
 *     reoffering: the entire draw's weighting is defeated whenever a NaN
 *     weight is anywhere in the pool, an independent, more general RNG-
 *     fairness gap this finding surfaced but does not fix (filed
 *     separately). `'contaminated'`, same as Infinity, but for a
 *     structurally different and more concerning reason.
 *   - Negative (-5): `-5 >= 5` is `false`, so the offer is pushed into the
 *     pool too, but `value: -5 / 5 = -1` is finite, so its `rollOffers`
 *     weight is finite and the draw's weighting is undisturbed — it really
 *     does keep winning a fair (if slightly disfavoured) share of draws,
 *     confirmed at 48/200 in a wider sample. `'ungated'`: a genuine,
 *     unbounded exploit — `applyOffer`'s own `+= b.perRank` stat add
 *     accumulates per re-pick (`StatBag.add`, stats.ts:159), so this lets a
 *     forged-offer-poisoned boon stack past `maxRank` indefinitely.
 */
const BOON_OFFER_INPUTS: readonly { id: string; toLevel: number }[] = [
  { id: 'boon:toLevelNan', toLevel: NaN },
  { id: 'boon:toLevelNegative', toLevel: -5 },
  { id: 'boon:toLevelInfinite', toLevel: Infinity },
];

export function boonOfferBoundaryCases(content: Content = loadContent()): BoundaryCase[] {
  return BOON_OFFER_INPUTS.map(({ id, toLevel }) => {
    const w = newWorld(content);
    applyOffer(w, { kind: 'boon', key: AWAKENING_BOON, name: 'x', desc: 'x', toLevel });
    const storedRank = w.boonRanks[AWAKENING_BOON];
    w.phase = 'levelup';
    let reoffered = false;
    for (let i = 0; i < 100 && !reoffered; i++) {
      const offers = rollOffers(w);
      if (offers.some((o) => o.kind === 'boon' && o.key === AWAKENING_BOON)) reoffered = true;
    }
    const verdict: Verdict = reoffered ? 'ungated' : 'contaminated';
    const detail = reoffered
      ? `applyOffer(toLevel=${toLevel}) -> boonRanks.${AWAKENING_BOON}=${storedRank}, buildOfferPool keeps offering it (cap bypassed)`
      : `applyOffer(toLevel=${toLevel}) -> boonRanks.${AWAKENING_BOON}=${storedRank}, buildOfferPool never re-offers it in 100 draws`;
    return { category: 'boon', id, verdict, detail };
  });
}

/* ======================================================== 7. DAMAGE BONUS ======================================================== */

/**
 * `grantWeapon`'s `damageBonus` parameter (weapons.ts:61-79) is unguarded in
 * *both* branches (q34): the create branch does a bare assignment with no
 * clamp at all, and the update branch's `Math.max(existing.damageBonus,
 * damageBonus)` propagates a non-finite value the same way the `level`
 * update branch does (q29). Unlike every `level`-shaped hole this file pins
 * (which either crash the array-index lookup or get re-floored by
 * `levelStats`'s read-time clamp), `damageBonus` is never used as an index —
 * it only ever feeds `weaponDamageMul`'s `(1 + ws.damageBonus)` multiplier —
 * so a poisoned value never crashes the fire loop. Instead it silently
 * corrupts *external* state the loop touches: `damageEnemy`'s own guard
 * (`e.dead || amount <= 0`) does not catch `NaN` (`NaN <= 0` is `false`), so
 * `e.hp -= NaN` sets the enemy's hp to `NaN` forever (every future
 * `e.hp <= 0` check is also `false`, so it can never die again), and
 * `w.damageTotal` goes `NaN` for the rest of the run.
 *
 * A real, non-forged `damageBonus` is always `deriveSouls`'s
 * `Math.min(cap, (count - 1) * per)` (progression.ts:251) — finite,
 * `>= 0`, already capped upstream — so this needs a direct `grantWeapon`
 * call, not a live Command-surface exploit, same reachability caveat as the
 * `level`-shaped findings above.
 *
 * Each case spawns a real `husk` enemy in range of a real `arrow_volley`
 * weapon and drives one `updateWeapons` tick (the weapon's cooldown starts
 * at 0, so it fires immediately) — verdict is measured from `e.hp`/
 * `w.damageTotal` after the tick, not from `ws.damageBonus` alone, since a
 * poisoned value that never crashes could otherwise look clean at the
 * stored-field level while still corrupting everything downstream. Two
 * cases are worth naming even though they measure `'ok'` here: `0.5`
 * (`'fractional'`) is stored and applied uncapped even though it exceeds
 * `data/weapons.json`'s `inheritDamageCap` (0.4) — a real cap-bypass gap on
 * the *stored* field, but one that produces a merely stronger (still
 * finite, still correctly-signed) hit, not the corruption this category
 * exists to catch, so it is not pinned as a hole under this file's
 * hp/damageTotal measure; and `-Infinity`, where `(1 + -Infinity)` yields a
 * multiplier of `-Infinity`, `damage` comes out `-Infinity`, and
 * `damageEnemy`'s own `amount <= 0` guard (`-Infinity <= 0` is `true`)
 * happens to catch it before anything is written — the stored field is
 * still illegally negative, but nothing downstream ever observes it.
 */
const DAMAGE_BONUS_TARGET = 'arrow_volley';

const DAMAGE_BONUS_INPUTS: readonly number[] = [0, 0.5, -1, Infinity, -Infinity, NaN];

function damageBonusCaseId(v: number): string {
  if (Number.isNaN(v)) return 'nan';
  if (v === Infinity) return 'posInf';
  if (v === -Infinity) return 'negInf';
  if (v < 0) return 'negative';
  if (!Number.isInteger(v)) return 'fractional';
  return String(v);
}

function damageBonusCase(content: Content, branch: 'create' | 'update', damageBonus: number): BoundaryCase {
  const w = newWorld(content);
  if (branch === 'update') grantWeapon(w, DAMAGE_BONUS_TARGET, 1, 0); // legal create first
  const ws = grantWeapon(w, DAMAGE_BONUS_TARGET, 1, damageBonus);
  const storedBonus = ws.damageBonus;
  const e = spawnEnemy(w, 'husk', w.warden.x + 1, w.warden.y, { overlay: false })!;
  w.rebuildBuckets(); // enemiesInRadius/nearestEnemy read the spatial hash Run.step() would otherwise refresh
  const r = tryRun(() => updateWeapons(w, 1 / 60));
  const hpFinite = Number.isFinite(e.hp);
  const totalFinite = Number.isFinite(w.damageTotal);
  const verdict: Verdict = r.threw ? 'crashes' : !hpFinite || !totalFinite ? 'contaminated' : 'ok';
  const detail = r.threw
    ? `${branch}(damageBonus=${damageBonus}) -> ws.damageBonus=${storedBonus}, updateWeapons() threw: ${r.message}`
    : `${branch}(damageBonus=${damageBonus}) -> ws.damageBonus=${storedBonus}, e.hp=${e.hp}, e.dead=${e.dead}, damageTotal=${w.damageTotal}`;
  return { category: 'damageBonus', id: `${branch}:${damageBonusCaseId(damageBonus)}`, verdict, detail };
}

export function damageBonusBoundaryCases(content: Content = loadContent()): BoundaryCase[] {
  return [
    ...DAMAGE_BONUS_INPUTS.map((v) => damageBonusCase(content, 'create', v)),
    ...DAMAGE_BONUS_INPUTS.map((v) => damageBonusCase(content, 'update', v)),
  ];
}

/* =============================================================== census =============================================================== */

export function runCensus(content: Content = loadContent()): BoundaryCase[] {
  return [
    ...levelBoundaryCases(content),
    ...inheritanceCases(content),
    ...awakeningGateCases(content),
    ...weaponOfferBoundaryCases(content),
    ...weaponUpdateBoundaryCases(content),
    ...boonOfferBoundaryCases(content),
    ...damageBonusBoundaryCases(content),
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
if (invokedDirectly) main();
