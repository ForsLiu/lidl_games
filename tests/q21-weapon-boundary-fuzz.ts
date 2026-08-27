/**
 * q21's recorded artefact: every `tools/fuzz-weapon-boundary.ts` boundary
 * case that is *not* cleanly `'ok'` today, one `Record<string, Verdict>` per
 * named boundary category (q7's multi-const idiom — this file has three
 * qualitatively different boundary mechanisms, unlike q15's single field x
 * family grid). `tests/q21-weapon-boundary-fuzz.test.ts` asserts the live
 * census matches these maps **exactly** (q9-style: a new hole and a closed
 * hole both go red), so neither a fresh regression nor a silent fix can pass
 * without a conscious edit here.
 *
 * Do **not** edit an entry to make a red run green — an entry here means the
 * shipped soul-weapon system crashed, corrupted state, or bypassed a gate it
 * should have enforced. The fix belongs in `/src`, which this lane may not
 * edit, and the deletion follows the fix. See BACKLOG-QUALITY.md's Log for
 * the write-up (session 17).
 *
 * Regenerate by running `npx tsx tools/fuzz-weapon-boundary.ts` and
 * transcribing every non-`ok` line — there are 14 today, against 39 total
 * (9 level + 12 inheritance + 4 awakening + 2 weaponOffer + 9 weaponUpdate +
 * 3 boon, the last added by q30).
 */
import type { Verdict } from '../tools/fuzz-weapon-boundary';

/**
 * `grantWeapon`/`levelStats` clamp level 0/negative/-Infinity to 1 and
 * 7/Infinity to 6 correctly, but a non-finite or non-integer `ws.level` is
 * not caught by either clamp (`Math.max`/`Math.min` propagate `NaN`, and
 * fractional array indexing just misses): `def.levels[lv - 1]` comes back
 * `undefined` and the live fire loop throws reading `.range`/`.damage`/etc.
 * off it on the very next tick.
 */
export const LEVEL_BOUNDARY_HOLES: Readonly<Record<string, Verdict>> = {
  nan: 'crashes',
  fractional: 'crashes',
};

/**
 * `soulLevelFor`'s tier->level mapping clamps 0/negative/absurdly-high tiers
 * correctly (all resolve to a legal 1..inheritMaxLevel level), but a `NaN`
 * `Structure.tier` — unreachable through `upgradeTower`'s own legality
 * checks today, but not guarded against by `soulLevelFor` itself — produces
 * a `NaN` soul level that `deriveSouls`/`bindSouls` carry straight into a
 * granted `WeaponState.level`, crashing the fire loop the same way the level
 * category's `nan` hole does, just reached through the inheritance path
 * instead of a direct `grantWeapon` call. Every "fewer distinct souls than
 * weapon slots" case (0, 1, 2-of-6, exactly-6-of-6) and both `weaponSlots`
 * edges (floored at 1, a fractional value silently truncating `Array.slice`)
 * bind cleanly.
 */
export const INHERITANCE_HOLES: Readonly<Record<string, Verdict>> = {
  'tier:nan': 'crashes',
};

/**
 * The Lv6 + boon-rank-3 Awakening gate is enforced only where an offer is
 * *generated* (the private `buildOfferPool`, progression.ts:143-153) — not
 * where one is *applied* (`applyOffer`'s `'awakening'` case,
 * progression.ts:198-207 trusts the offer's origin and only checks the
 * weapon exists). Calling `applyOffer` directly with a hand-built awakening
 * offer applies it regardless of the granting weapon's level or the boon's
 * rank. Not reachable through the real Command surface today — `takeOffer`
 * only ever plays back `w.offers[index]`, and `w.offers` is populated
 * exclusively by the correctly-gated `rollOffers`/`buildOfferPool` — but a
 * defense-in-depth gap: nothing about `applyOffer`'s own contract stops a
 * future caller (a new Command, a replay patch) from reaching it directly.
 */
export const AWAKENING_GATE_HOLES: Readonly<Record<string, Verdict>> = {
  'gate:levelMet_rankUnmet': 'ungated',
  'gate:levelUnmet_rankMet': 'ungated',
  'gate:levelUnmet_rankUnmet': 'ungated',
};

/**
 * `applyOffer`'s `'weapon'` case (progression.ts:182-186) does
 * `ws.level = Math.min(maxLevel, offer.toLevel)` — an upper-bound-only clamp
 * that never re-validates the result, unlike `grantWeapon`'s own create-branch
 * clamp (`Math.max(1, Math.min(maxLevel, level))`). A forged `Offer` with
 * `toLevel: NaN` propagates straight into `ws.level`, crashing the live fire
 * loop the same way the `level`/`inheritance` `nan` holes do, just through a
 * third entry point (q27). A negative `toLevel` (e.g. -5) is latent rather
 * than crashing today only because `levelStats`'s own read-time clamp
 * (`Math.max(1, Math.min(top, ws.level))`) happens to re-floor it back to a
 * legal index before every read — so it is pinned here as `'ok'` by the
 * census (no crash, no gate bypassed), not as a hole, even though the stored
 * field itself briefly holds an illegal value. Not reachable through the real
 * Command surface today: `buildOfferPool` only ever emits
 * `toLevel: ws.level + 1`, always a legal positive integer.
 */
export const WEAPON_OFFER_HOLES: Readonly<Record<string, Verdict>> = {
  'weapon:toLevelNan': 'crashes',
};

/**
 * `grantWeapon`'s *update* branch (an existing `WeaponState` found by key,
 * weapons.ts:63-66) does `existing.level = Math.max(existing.level, level)`
 * with no clamp and no finite guard at all — unlike the create branch's own
 * `Math.max(1, Math.min(maxLevel, level))` (q29). Measured against the same
 * `LEVEL_INPUTS` domain the create branch uses (`levelBoundaryCases`), the
 * live fire loop turns out to be protected for most of them: `levelStats`'s
 * own read-time clamp (`Math.max(1, Math.min(top, ws.level))`) re-floors
 * `7`/`Infinity` back to a legal index on every read, so neither crashes —
 * they are `'contaminated'` instead, because the *stored* `ws.level` itself
 * sits outside `[1, maxLevel]` where a raw reader sees the illegal value
 * directly. Measured (not assumed) which raw readers actually discriminate
 * it: the determinism hash (`hashWorld`, run.ts:656, `h.int(wp.level)`) does
 * — a contaminated 7 and the legitimate cap 6 hash differently even though
 * the fire loop treats them identically; `buildOfferPool`'s own
 * `ws.level < maxLevel` cutoff (progression.ts:112) does NOT — `6 < 6` and
 * `7 < 6` are both false, so it excludes both cases the same way. `NaN` and
 * a fractional value above the existing level still crash, the same failure
 * mode the `level`/`inheritance`/`weaponOffer` `nan`/`fractional` holes
 * already pin, just through a fourth entry point. Not reachable through the
 * real Command surface today: `bindSouls`'s own inputs are always legal
 * integers, and `applyOffer`'s `'weapon'` case (q27) is the only other
 * caller of an update-branch `grantWeapon`, itself only reachable via a
 * forged `Offer`.
 */
export const WEAPON_UPDATE_HOLES: Readonly<Record<string, Verdict>> = {
  '7': 'contaminated',
  posInf: 'contaminated',
  nan: 'crashes',
  fractional: 'crashes',
};

/**
 * `applyOffer`'s `'boon'` case (progression.ts:187-196) has *zero*
 * validation of `offer.toLevel` — not even the upper-bound-only clamp
 * `WEAPON OFFER` gets — so `w.boonRanks[b.key] = offer.toLevel` assigns a
 * forged offer's value straight through (q30). All three probed values
 * (`NaN`, `-5`, `Infinity`) leave the *stored* rank illegal, but the
 * measured, live consequence splits three ways, not two:
 *   - `Infinity`: `buildOfferPool`'s `rank >= b.maxRank` cap (line 129)
 *     legitimately excludes it from the offer pool — `Infinity >= 5` is
 *     mathematically sound. `'contaminated'`, not `'ungated'`: the cap
 *     genuinely holds, only the stored value is illegal.
 *   - `NaN`: `NaN >= b.maxRank` is `false`, so the offer *is* pushed into
 *     the pool with a `NaN` weight — but `Rng.weightedIndex` sums weights
 *     into a `NaN` total, which makes every in-loop `r < 0` check false and
 *     falls through to its `return weights.length - 1` fallback: the *last*
 *     remaining pool entry, deterministically, every draw. The corrupted
 *     boon happens not to be last in this content's pool order, so it never
 *     wins — measured 0/200 draws — but that is a side effect of the whole
 *     draw's weighting being defeated, not the cap working. Still
 *     `'contaminated'` here (it does not reoffer), but for a structurally
 *     different and more concerning reason than the `Infinity` case, spelled
 *     out in `tools/fuzz-weapon-boundary.ts`'s own doc comment.
 *   - `-5` (negative): `-5 >= b.maxRank` is `false` too, but `-5 / b.maxRank`
 *     is finite, so the weight stays finite and the draw's fairness is
 *     undisturbed — the boon really does keep winning a real (if
 *     disfavoured) share of draws, measured 48/200. `'ungated'`: a genuine,
 *     unbounded exploit, since `StatBag.add` (stats.ts:159) accumulates
 *     `perRank` per re-pick with no cap of its own.
 * Not reachable through the real Command surface today: `buildOfferPool`
 * only ever emits `toLevel: rank + 1`, always a legal integer in
 * `[1, maxRank]`.
 */
export const BOON_OFFER_HOLES: Readonly<Record<string, Verdict>> = {
  'boon:toLevelNan': 'contaminated',
  'boon:toLevelNegative': 'ungated',
  'boon:toLevelInfinite': 'contaminated',
};
