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
 * transcribing every non-`ok` line — there is 1 today (p7a closed b011's 7
 * boonRank holes; p9e closed the 1 pool hole; b010 closed the 1 reroll hole),
 * against 37 total (9 boonRank + 4 boonKey + 7 pickIndex + 4 reroll + 1 pool +
 * 6 wieldTier + 6 wieldRoster).
 */
import type { Verdict } from '../tools/fuzz-weapon-boundary';

/**
 * CLOSED at p7a (BACKLOG b011). `applyOffer`'s `'boon'` case used to assign a
 * forged `offer.toLevel` into `w.boonRanks` with zero validation; p7a's pool
 * rewrite (SPEC-FINAL §6.3) added `clampRank` (progression.ts), which every
 * case below (`'boon'`, `'type_mastery'`, `'skill_card'`) now runs its
 * `toLevel` through before storing: non-finite collapses to rank 1, everything
 * else rounds and clamps to `[1, maxRank]`. Every input in `RANK_INPUTS`
 * (`0, 1, 5, 6, -5, Infinity, -Infinity, NaN, 2.5`) now stores a legal,
 * in-domain rank — no holes today. The detailed old exploit chain (unbounded
 * stat-stacking from a forged `-5`, the NaN-poisoned draw, the `Infinity`/hash
 * collision) is preserved as history in `tests/q21-weapon-boundary-fuzz.test.ts`'s
 * "b011 closed" describe block, which now asserts the *fixed* behavior instead.
 *
 * fb041 (Q144(1) OVERRIDE) re-opened two of these, deliberately: `PROBE_BOON`
 * (`haste`) is now one of the uncapped stat boons, so `inDomain`'s `stored <=
 * maxRank` check (against the boon's authored `maxRank: 5`, still the
 * historical/display reference rank) is the wrong question for it — storing
 * rank 6, or `Infinity` clamped to `UNCAPPED_RANK_CEILING` (9999,
 * progression.ts), is the *intended* fb041 behavior, not contamination. Both
 * are `'ungated'` rather than `'contaminated'` because `haste` legitimately
 * keeps re-offering past 5, exactly per fb041's "never exhausts on rank
 * alone" acceptance line. Regenerated via `npx tsx
 * tools/fuzz-weapon-boundary.ts` after the fix landed for the code-reviewer
 * finding that `clampRank(toLevel, Infinity)` was a no-op clamp — an
 * unclamped `Infinity` rank OOM-crashed the process the first time
 * `romanRank` tried to render it as a display numeral.
 */
export const BOON_RANK_HOLES: Readonly<Record<string, Verdict>> = {
  '6': 'ungated',
  posInf: 'ungated',
};

/** A forged key `boonByKey` cannot resolve is a clean no-op in every probed
 * shape — no holes today. */
export const BOON_KEY_HOLES: Readonly<Record<string, Verdict>> = {};

/** `takeOffer`'s `w.offers[index]` lookup rejects every out-of-domain index
 * (negative, past-end, NaN, fractional, Infinity all read `undefined`) — no
 * holes today. Successor of the original slot/duplicate command probes. */
export const PICK_INDEX_HOLES: Readonly<Record<string, Verdict>> = {};

/**
 * CLOSED at BACKLOG b010. `rerollOffers`' guard (`w.phase !== 'levelup' ||
 * w.rerollsLeft <= 0`, progression.ts) holds at both legitimate ends and in
 * the wrong phase, but a corrupted counter used to slide through: `NaN <= 0`
 * is false, so a NaN `rerollsLeft` granted unlimited rerolls (`NaN - 1`
 * stayed NaN forever). The guard now also checks
 * `!Number.isFinite(w.rerollsLeft)` — no holes today. Not reachable through
 * the real Command surface — the counter is only ever written from
 * `content.boons.rerollsPerLevel` — the same defense-in-depth caveat as the
 * forged-offer holes above.
 */
export const REROLL_HOLES: Readonly<Record<string, Verdict>> = {};

/**
 * CLOSED at p9e (G18). With every stat boon and every one of the run class's
 * 3 skill cards at `maxRank` (Type Mastery never contributes — no tower is
 * ever built in this probe), `buildOfferPool` empties, and `openLevelUpIfPending`
 * (progression.ts) used to still enter `'levelup'` with `offers = []` — a
 * permanent softlock reachable through legitimate play (`takeOffer` finds no
 * offer at any index, `rerollOffers` rerolls to another empty list, nothing on
 * the Command surface could leave the phase). `openLevelUpIfPending`'s manual
 * branch now mirrors the `autoPickLevelUps` branch's own pre-existing guard —
 * an empty roll consumes the pending level-up without opening the phase at
 * all — closing this the same way p9e closed the general "unattended run
 * parks in levelup forever" gap. `tests/q21-weapon-boundary-fuzz.test.ts`'s
 * former "sim bug, pinned not fixed" describe block now asserts the fixed
 * behavior instead, the same pattern `BOON_RANK_HOLES`'s b011 closure used.
 */
export const POOL_HOLES: Readonly<Record<string, Verdict>> = {};

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
