/**
 * q21's recorded artefact, ported to the SPEC-FINAL sim: every
 * `tools/fuzz-weapon-boundary.ts` boundary case that is *not* cleanly `'ok'`
 * today, one `Record<string, Verdict>` per category (q7's multi-const
 * idiom). `tests/q21-weapon-boundary-fuzz.test.ts` asserts the live census
 * matches these maps **exactly** (q9-style: a new hole and a closed hole
 * both go red), so neither a fresh regression nor a silent fix can pass
 * without a conscious edit here.
 *
 * Port note: the original maps pinned the V2/V3 soul-weapon system
 * (`grantWeapon`/`levelStats`/`bindSouls`/awakenings), deleted wholesale by
 * SPEC-FINAL §6.1's wielding and the boon-only offer screen. Each map below
 * is the successor of one or more originals — see the category doc comments
 * in `tools/fuzz-weapon-boundary.ts` for the old->new mapping.
 *
 * Do **not** edit an entry to make a red run green — an entry here means the
 * shipped offer pipeline or wielding formula stored an illegal value,
 * bypassed a cap, corrupted downstream state, or softlocked a phase. The
 * fix belongs in `/src`, which this lane may not edit, and the deletion
 * follows the fix.
 *
 * Regenerate by running `npx tsx tools/fuzz-weapon-boundary.ts` and
 * transcribing every non-`ok` line — there are 10 today, against 37 total
 * (9 boonRank + 4 boonKey + 7 pickIndex + 4 reroll + 1 pool + 6 wieldTier +
 * 6 wieldRoster).
 */
import type { Verdict } from '../tools/fuzz-weapon-boundary';

/**
 * Successor of the original LEVEL / WEAPON OFFER / BOON OFFER maps (q21,
 * q27, q30): `applyOffer`'s `'boon'` case (progression.ts:148-158) still
 * assigns a forged `offer.toLevel` into `w.boonRanks` with zero validation.
 * The consequence splits by what `buildOfferPool`'s `rank >= b.maxRank`
 * re-offer cap (progression.ts:109) does with the poisoned value:
 *   - `0`, `-5`, `2.5` — the comparison is false, so the boon keeps being
 *     re-offered while the stored rank is illegal. `'ungated'`: each re-pick
 *     re-runs `stats.addAll(\`boon:...\`)`, so a negative seed stacks the
 *     stat past `maxRank` indefinitely (measured in the test file).
 *   - `6`, `Infinity` — the comparison is (accidentally or genuinely) true,
 *     so the cap holds; only the stored field is illegal. `'contaminated'`.
 *   - `NaN`, `-Infinity` — the comparison is false, so the offer *is* pushed
 *     into the pool, but its `rollOffers` weight comes out NaN (`NaN`
 *     directly, or `0 * -Infinity` inside the luck-bias product at
 *     progression.ts:89), and `Rng.weightedIndex` with a NaN total falls
 *     through every `r < 0` check to its last-index fallback —
 *     deterministically the *last remaining pool entry* every draw, so the
 *     poisoned boon never surfaces and the whole draw's weighting is
 *     defeated (the RNG stream no longer matters — measured in the test
 *     file). `'contaminated'` because it does not re-offer, but for a
 *     structurally worse reason than the cap holding.
 * Not reachable through the real Command surface: `buildOfferPool` only
 * ever emits `toLevel: rank + 1`, a legal integer in `[1, maxRank]`.
 */
export const BOON_RANK_HOLES: Readonly<Record<string, Verdict>> = {
  '0': 'ungated',
  '6': 'contaminated',
  negative: 'ungated',
  posInf: 'contaminated',
  negInf: 'contaminated',
  nan: 'contaminated',
  fractional: 'ungated',
};

/** A forged key `boonByKey` cannot resolve is a clean no-op in every probed
 * shape — no holes today. */
export const BOON_KEY_HOLES: Readonly<Record<string, Verdict>> = {};

/** `takeOffer`'s `w.offers[index]` lookup rejects every out-of-domain index
 * (negative, past-end, NaN, fractional, Infinity all read `undefined`) — no
 * holes today. Successor of the original slot/duplicate command probes. */
export const PICK_INDEX_HOLES: Readonly<Record<string, Verdict>> = {};

/**
 * `rerollOffers`' guard (`w.phase !== 'levelup' || w.rerollsLeft <= 0`,
 * progression.ts:142) holds at both legitimate ends and in the wrong phase,
 * but a corrupted counter slides through: `NaN <= 0` is false, so a NaN
 * `rerollsLeft` grants unlimited rerolls (`NaN - 1` stays NaN forever).
 * Not reachable through the real Command surface — the counter is only ever
 * written from `content.boons.rerollsPerLevel` — the same defense-in-depth
 * caveat as the forged-offer holes above.
 */
export const REROLL_HOLES: Readonly<Record<string, Verdict>> = {
  'rerolls:nan': 'ungated',
};

/**
 * The one hole reachable through *legitimate* play: with every boon at
 * `maxRank` (character level 57+ — 11 boons x 5 ranks + Second Wind's 1),
 * `buildOfferPool` is empty, yet `openLevelUpIfPending` (progression.ts:30)
 * still enters `'levelup'` with `offers = []`. `takeOffer` finds no offer at
 * any index and `rerollOffers` rerolls to another empty list, so nothing on
 * the Command surface can leave the phase — a permanent softlock. A sim bug
 * (reported upstream), pinned here rather than fixed because this lane may
 * not edit `/src`.
 */
export const POOL_HOLES: Readonly<Record<string, Verdict>> = {
  'pool:exhausted': 'softlock',
};

/**
 * Successor of the original INHERITANCE map's `tier:nan` (the corrupted
 * `Structure.tier` probe) fused with the damageBonus map's silent-corruption
 * finding: §6.1's `upgradeStatMul` clamp (`Math.max(0, Math.min(level,
 * maxLevel) - 1)`) is sound at 0 / negative / huge / fractional tiers but
 * propagates NaN, so a NaN tier yields a NaN wielded damage — which never
 * crashes (it is never an array index) and instead slips past
 * `damageEnemy`'s `amount <= 0` guard (`NaN <= 0` is false): the enemy's hp
 * goes NaN forever (it can never die again — every future `hp <= 0` is
 * false) and `w.damageTotal` goes NaN for the rest of the run. Not
 * reachable through the real Command surface: `buildTower`/`upgradeTower`
 * only ever produce integer tiers.
 */
export const WIELD_TIER_HOLES: Readonly<Record<string, Verdict>> = {
  'tier:nan': 'contaminated',
};

/** §6.1's roster invariants (one entry per attack-bearing type, attackless
 * types wield nothing, duplicates collapse into one averaged entry, dead
 * structures excluded, large groups stay finite) all hold — no holes today.
 * Successor of the original souls-vs-slots census. */
export const WIELD_ROSTER_HOLES: Readonly<Record<string, Verdict>> = {};
