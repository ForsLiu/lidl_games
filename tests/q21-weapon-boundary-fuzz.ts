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
 * transcribing every non-`ok` line — there are 6 today, against 25 total
 * (9 level + 12 inheritance + 4 awakening).
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
