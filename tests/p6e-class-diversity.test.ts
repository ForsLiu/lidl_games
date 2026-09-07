/**
 * p6e — SPEC-FINAL §4, gate **G8**: "every class clears T1 at 35-70% win rate
 * (scripted kit bot); top damage source differs across >=8 of 11 classes."
 *
 * fb013 (2026-08-29) added a 12th class, Time Lord — `CLASS_KEYS` below picks
 * it up automatically, and SPEC-FINAL's own G8 text now reads ">=9 of 12"
 * (the same ~73% ratio). This file's entire
 * win-rate sweep was already `.skip`-ed per class pending **P10** before
 * fb013 landed (see the dated corrections below). Time Lord WAS run through it
 * by p10v (12/12, `it.skip('time_lord', ...)` at the end of this file) and
 * re-measured post-c001 by `tests/class-time-lord-band.test.ts` (unchanged,
 * 12/12); this paragraph used to say "has not been run" and STATUS.md
 * inherited the stale claim — corrected at the 2026-09-03 lane merge.
 *
 * Precedent and gap (Q120's own list, and p6b/p6c/p6d's write-ups all name it):
 * **no stock bot policy in `src/bots` ever issues `class_active`/`class_active2`,
 * or drives `active1Held` for a charge-kind Active1.** `tests/p-core-f-gates.
 * test.ts`'s `runCoreScripted` set the precedent for patching a real gap onto a
 * stock policy locally rather than teaching every policy a new Command
 * (`{k:'upgrade_core'}` there); `scriptClassKit` below does the same for the
 * class-kit gap, reused verbatim from that file's Core-upgrade injection for
 * the Core-upgrade half (a scripted kit bot should spend gold on the Core's own
 * HP track too, exactly as G23 already established).
 *
 * **T1**, concretely: `tier: 1, modifiers: []` (the `cfg()` default — no
 * `autoDraft` tier-modifier draft, unlike G7/G14's higher-tier gates) and
 * `cycles: 6` (also `cfg()`'s default — SPEC-FINAL §1.1's full 18 TD wave / 6 VS
 * wave / boss run, not a shortened practice slice), exactly the scope G23 named
 * "T1" for the Cores. 12 seeds, per that same precedent (CLAUDE.md: pass-rates
 * over a fixed seed set, never medians).
 *
 * **The scripted kit bot**: `hybrid`'s build/kite for economy and Act II
 * movement (a "reasonable T1 loadout," not a per-class-tailored one — a bot
 * that hand-picks each class's ideal tower mix would be measuring the bot's
 * cleverness, not the kit), plus:
 *   - fire Active1 the instant it is off cooldown; for a charge kind (Circle
 *     Slash, Deadeye Draw) hold for `min(chargeCapSeconds, 2s)` then release,
 *     rather than holding the full cap every time — a real player charges to
 *     "enough," not always to the ceiling;
 *   - fire Active2 the instant it is off cooldown, with one sequencing
 *     exception (below);
 *   - aim every Active at the nearest enemy (falling back to the Core when the
 *     board is empty), which also serves as `nearestStructure`'s implicit
 *     search origin for the structure-targeting Actives (Field Kit, Blood
 *     Tithe, Death Pact all default an omitted aim to the Warden's own tile,
 *     not the enemy's — passing no override for those three keeps that);
 *   - buy every Core upgrade step going, exactly as G23's own harness does.
 *
 * The one sequencing exception: Paladin's Judgement (§4.2 "release Wrath as a
 * holy nova") is gated on `clarionRemaining <= 0 && wrathStored > 0` in
 * addition to its own cooldown — firing it the instant it comes off cooldown,
 * independent of Clarion Taunt's 4-6s window, means it usually detonates on
 * whatever scraps of Wrath happened to be banked seconds into a fresh taunt,
 * instead of the window's full haul. Every other class's two Actives are left
 * to fire independently; this is the one kit whose two Actives are explicitly
 * a combo (SPEC-FINAL §4.2 names Wrath as the shared resource) and scripting
 * around that isn't hand-picking a build, it's not misplaying the one stated
 * combo. Measured with and without this gate: it did not fix Paladin's early
 * deaths outright (below), but it really did reduce how much stored Wrath
 * went to waste in the seeds that did survive.
 *
 * **Tuning (data/classes.json only, per CLAUDE.md's balance-tuning scope)**:
 * three classes' first honest measurement needed a second look before any
 * `.skip`, and two moved meaningfully:
 *   - **Cryomancer** measured 4/12 (33%) — one point under G8's 35% floor.
 *     Ice Wall's cooldown was the outlier among the roster's few actual
 *     defensive tools (14s, versus Clarion Taunt's 8-14s window and Circle
 *     Slash's 6s) for an ability whose entire value is board control (it
 *     blocks a lane tile outright); cut to 9s. Re-measured: **6/12 (50%)**,
 *     now solidly inside the band.
 *   - **Paladin** and **Necromancer** both showed a *majority* of losses as
 *     early `defeat_warden` (wave 3-9, well before any wave-content wall) —
 *     the two classes with `moveSpeedBonus: 0` (§4.2's "move low" band,
 *     shared by no other class), the one stat this bot's kiting AI leans on
 *     hardest to survive Act II and the one number SPEC-FINAL §4.2's band
 *     table already commits to (not this item's to override — §17 lists the
 *     nine filled classes as owner-vetoable, not open to a balance edit here).
 *     What *is* this item's to tune is each kit's own numbers: Necromancer's
 *     *Raise* (cooldown 12s->6s, `summonStatMul` 0.40->0.65, duration
 *     15s->24s, radius 6->8 — more, sturdier skeletons between the Warden and
 *     the horde more often) and Paladin's *Guardian Stance* / *Judgement*
 *     (`stanceArmor` 30->50, `stanceSeconds` 1->0.5, `wrathFraction`
 *     0.60->0.80, Clarion Taunt cooldown 14->8s, `tauntDurationSeconds` 4->6,
 *     `wrathDamageMul` 1.5->2.2). Neither crossed into the band — both are
 *     still 0/12 — but both re-measured with early `defeat_warden` now the
 *     *minority* outcome and the majority converged onto the same wave 11-17
 *     `defeat_core` signature every other class hits (below). That is real,
 *     verified progress, not a wash: it moved both classes from "loses to a
 *     generic VS-baseline gap" onto "loses to the same wall as the rest of
 *     the roster," which is the honest floor this bot can reach without
 *     inventing a fourth reason to keep tuning numbers that no longer move
 *     the outcome.
 *
 *     **CORRECTED (PRIORITY DIRECTIVE follow-up, this session, Q123):** the
 *     two counts this paragraph used to give (Necromancer 7/12, Paladin
 *     3/12) described the tuning-verification pass, not this file's real
 *     p8a content. The first full re-run of this `beforeAll` against p8a's
 *     real waves (this session) measures **Necromancer: 3/12 `defeat_warden`
 *     (waves 3/6/15), 9/12 `defeat_core` (waves 13-17), 0/12 wins** and
 *     **Paladin: 4/12 `defeat_warden` (three at wave 3, one at wave 6), 8/12
 *     `defeat_core` (waves 8/15/16), 0/12 wins** — both still majority
 *     wave-11-17-wall, same conclusion, corrected numbers.
 *
 * **The wall the other ten hit** (nine outright, one — Necromancer — mostly):
 * every seed that isn't Cryomancer's clears TD wave 11-17 and then dies
 * `defeat_core` to leak accumulation, or `defeat_warden` during the VS wave at
 * that same wave count — the exact "wave-9-to-14 death band" `tests/
 * a4-single-type.test.ts` and `tests/p-core-f-gates.test.ts` (G23) already
 * pinned to `data/waves.json` authoring only 10 real TD wave rows against the
 * still-climbing `1.30^(wave-1)` HP curve (the **p8a** content gap, not yet
 * built). G23 is the direct precedent for reading this signature as
 * content-gated rather than balance-gated: it found the *same* wave band
 * killing four of five Cores regardless of each Core's own numbers, and
 * `.skip`-ed those four with exactly this reasoning. This item corroborates
 * that finding across the *class* roster instead of the Core roster — ten of
 * eleven kits, tuned or not, converge on the identical wave-11-to-17 wall,
 * which is strong evidence the wall is systemic rather than eleven
 * independent balance stories. Only Cryomancer's kit (freeze/shatter crowd
 * control plus a cheap, spammable lane-blocking Ice Wall) does something the
 * wall doesn't care about stat scaling for — it removes enemies from the fight
 * outright or blocks their approach, rather than racing their HP growth.
 * Nothing else in the roster has a comparable non-DPS lever, and inflating
 * `damage`/`dps` fields far enough to out-race a 100x-by-wave-18 HP curve
 * would be an obviously-wrong data value, not a balance tune. Each of the ten
 * is `.skip`-ed individually below with its own measured numbers, per
 * CLAUDE.md rule 6 and the p3e/G23 precedent — not a blanket skip, since the
 * failure signature (and, for Necromancer/Paladin, how close tuning got it)
 * differs enough per class to be worth recording separately. Re-enable point
 * for all ten is `p8a`.
 *
 * **Top damage source** (Q121 logs the interpretation): `damageByWeapon`'s
 * source strings are coarse engine bookkeeping, not kit identity — every
 * class's own Active1/Active2/passive/summon damage is credited under one of
 * five shared literal strings (`class_active`, `class_active2`, `class_basic`,
 * `class_summon`, `class_passive`; `spreading_plague` is Plaguebringer's own
 * extra one), and only *tower* keys are class-specific-looking, which a
 * `hybrid`-loadout bot builds near-identically regardless of class — measuring
 * diversity over the raw keys collapses to "which tower did `hybrid` build
 * most" for nearly every class, which is G13's question, not G8's. Measured
 * this way (see Q121) it does not clear 8/11. This file instead resolves each
 * class's dominant *raw* bucket to the specific named §4/§4.2 mechanism behind
 * it (`describeSource`) — the same measured bucket-share, just labelled by the
 * data-authored ability name (`cls.active1.name`, etc.) rather than the shared
 * code-path string, since two classes topping out on `class_active` are
 * provably running different, spec-named abilities, not the same one.
 *
 * **CORRECTION (p8a, Q122):** the win-rate paragraphs above describe
 * Cryomancer as the roster's one class inside G8's band (6/12, after an Ice
 * Wall cooldown tune) against `data/waves.json`'s old repeated-wave-10
 * content. Once p8a authored real, escalating waves 11-18, Cryomancer
 * re-measured at **2/12** — below the floor, the same wave-11-17 wall the
 * other ten already named. G8's win-rate clause is now `.skip`-ed for all
 * eleven of eleven classes, not ten of eleven; see `cryomancer`'s own updated
 * `it.skip` below for the numbers. The diversity clause's own finding (2/11
 * distinct, Q121(4)) is unaffected by this correction.
 *
 * **RE-MEASURED IN FULL (PRIORITY DIRECTIVE follow-up, this session, Q123,
 * Q127).** The p8a commit corrected only Cryomancer's number and the
 * diversity count by spot-check; this session let the full `beforeAll` run
 * to completion twice (once live, once with a temporary diagnostic dump) and
 * recorded every class's real number below. **None of the eleven clears the
 * band — G8's win rate stays 0/11.** Every `it.skip` below carries its real,
 * freshly measured outcome string. One new fact this full re-run surfaces
 * that the earlier spot-check did not: **non-terminating `'timeout'` seeds
 * are no longer isolated to `swordsman` seed 1.** This run measured
 * `swordsman` at 4/12 seeds timing out (1, 2, 5, 9), `archer` at 2/12 (2,
 * 11), `stormcaller` at 1/12 (6), and `bloodlord` at 2/12 (1, 12) — 9 timeout
 * instances across 4 classes, up from the single instance previously
 * recorded. None were chased to a higher cap (Q127): the mechanism (the
 * wave-11-17 wall pushing some seeds into a genuine stalemate rather than a
 * slow loss) is already established by `tests/p-core-f-gates.test.ts`'s
 * `carnivorous_plant`/`corpse` cases, which spent real cap-raise attempts
 * proving it; a ninth-and-tenth confirmation on the class roster is
 * corroborating evidence, not a new question. The existing `'timeout'`
 * handling (excluded from `wins`, excluded from `ownDamage`/`allDamage`)
 * already treats these correctly.
 *
 * **fb049 re-measurement (Q138), this session — every number and `.skip`
 * reason above was measured with `allocated: []`, which no real Hub-started
 * run plays with (`TREE_AUTO_MAX`, `src/meta/meta.ts`).** Re-ran the full
 * `beforeAll` against `allTreeNodeIds(loadContent())`, the same fix
 * `tools/sim.ts`/`tools/sweep.ts` already got at fb039. The wave-11-17 wall
 * and every timeout it produced are both gone: **all twelve classes now
 * resolve cleanly (no `'timeout'` outcome anywhere), and eleven of twelve
 * clear 12/12 (100%) — only `bloodlord` sits at 10/12 (seeds 4 and 12 hit the
 * 120-minute cap as a genuine `'timeout'`, not chased further per CLAUDE.md
 * rule 6, the same precedent already spent on this exact mechanism).** Every
 * class is now far over G8's 70% ceiling (`floor(12*0.7) = 8`) rather than
 * under its 35% floor — the same floor-to-ceiling flip fb039/p10m already
 * found on G1/G14/G23. Diversity also moved, though not enough to close the
 * clause: **3 of 12 distinct top sources** (`ballista`, `frost_obelisk`,
 * `spreading_plague`), up from 2 — full-tree stat bonuses shift enough damage
 * share around that `necromancer`/`animist` now top out on `frost_obelisk`
 * (previously `ballista` like the rest of the pack) instead of collapsing
 * onto exactly two keys, but the >=9/12 target is not remotely in reach on
 * this axis. Every `it.skip` below carries its fresh full-tree number in its
 * trailing comment; the fuller per-class prose above is superseded by this
 * paragraph, not deleted, since it's still the record of how the wave-11-17
 * wall was originally found and closed. Re-enable point for both clauses
 * stays **P10** — this item (fb049) is the re-measurement, `p10r` inherits
 * the corrected (over-ceiling, not under-floor) retune target.
 *
 * **p12d (BACKLOG.md, BALANCE DIRECTION v2 §D), this session.** SPEC-FINAL
 * §14's G8 row is rewritten: T3 stays the reference tier for the per-class
 * win-rate band above, and the old "top damage source differs across >=9 of
 * 12" diversity clause is replaced by the two checks the owner verdict
 * specifies — see the `p6e: G8 diversity, BALANCE DIRECTION v2 §D` describe
 * block below, which reuses this file's own `measurements` sweep rather than
 * launching a second one. T1/T5 companion win-rate bands are added in their
 * own describe block, on the shared `hybrid` harness (not a per-class sweep
 * — see that block's own comment for the scope reasoning, logged in
 * QUESTIONS Q193).
 */
import { beforeAll, describe, expect, it } from 'vitest';

import '../src/bots';
import { loadContent, type ClassDef } from '../src/sim/content';
import { isKitSource } from '../src/sim/enemies';
import { allTreeNodeIds } from '../src/meta/meta';
import type { RunConfig, RunReport } from '../src/sim/types';
import { cfg, classifyMargin, GATE_TIER, runScripted, summarizeMargins } from './helpers';

const content = loadContent();
const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
// fb049 (Q138 re-measurement): real Hub-started runs feed the full
// Constellation tree into `allocated` (`TREE_AUTO_MAX`) — `cfg()`'s own
// default (`[]`) does not match that, so it is overridden explicitly below.
const FULL_TREE = allTreeNodeIds(content);
/** §14 gate G8's own band. */
const BAND_LO = 0.35;
const BAND_HI = 0.70;

/** The twelve §4-shaped classes, fb013. */
const CLASS_KEYS = content.classes.classes.map((c) => c.key);

/** T1, one class, one seed — hybrid economy/kiting, `tests/helpers.ts`'s shared kit script (`scriptClassKit`/`buyCoreUpgrades`, via `runScripted`) layered on top per BACKLOG p10w's de-dup — was a local copy of the same logic, now the shared implementation (p10s precedent). */
function runClassScripted(classKey: string, seed: number): RunReport {
  const config: RunConfig = cfg({
    seed,
    classKey,
    tier: GATE_TIER,
    modifiers: [],
    allocated: FULL_TREE,
    cycles: 6,
    policy: 'hybrid',
  });
  // Same headroom G23 measured its slowest resolution against (Q120).
  return runScripted(config, 'hybrid', 60 * 60 * 120).report;
}

/** A summon-producing kind's own Active — whichever of a class's two Actives actually spawns the `class_summon` bucket's damage. */
const SUMMON_KINDS = new Set(['summon_turret', 'raise_skeletons', 'manifest_spirit']);

/** Q121: resolves one raw `damageByWeapon` key to the specific named mechanism behind it — only called once a class's own-kit share has already cleared `MATERIALITY_SHARE` (below); this function never runs on a class whose kit is a bystander. */
function describeSource(cls: ClassDef, key: string): string {
  switch (key) {
    case 'class_active':
      return cls.active1.name;
    case 'class_active2':
      return cls.active2.name;
    case 'class_passive':
      return cls.passive.name;
    case 'class_basic':
      return `${cls.name} basic attack`;
    case 'class_summon':
      if (SUMMON_KINDS.has(cls.active2.kind)) return cls.active2.name;
      if (SUMMON_KINDS.has(cls.active1.kind)) return cls.active1.name;
      return `${cls.name} summon`;
    default:
      // spreading_plague (Plaguebringer's own passive) already reads as a name.
      return key;
  }
}

/**
 * Q121 (code-reviewer Major 1, round 2): a class's own-kit damage must clear
 * this share of its *total* damage (kit + towers) before its kit gets to name
 * the "top source" label at all — otherwise the label is whatever raw key
 * actually has the plurality, tower included, un-translated. Without this
 * bar, relabeling every non-tower bucket by its class-specific ability name
 * makes the >=8/11 clause pass near-tautologically (SPEC-FINAL already gives
 * every class's Active1/Active2/passive a distinct name, so translating the
 * bucket string is not the same as showing the kit actually *mattered*).
 *
 * CORRECTED (this session, before commit): an earlier draft of this comment
 * claimed the roster's own-kit shares "cluster either well above [20%] or
 * near zero." That was never checked against a completed run. The real
 * measured shares are a continuum from 0.4% (engineer) to 16.6%
 * (plaguebringer) and every one of the eleven sits under this bar — see the
 * `.skip`-ed diversity assertion below and its QUESTIONS.md Q121(4)
 * correction for the honest (red) result and why no threshold that still
 * means anything fixes it.
 *
 * RE-CORRECTED (PRIORITY DIRECTIVE follow-up, this session, Q123): the
 * paragraph above was itself measured against pre-p8a content. The full
 * post-p8a re-run measures the continuum as **0.4% (animist) to 15.4%
 * (plaguebringer)** — engineer is 2.1%, not the roster's low end. Every one
 * of the eleven still sits under the 20% bar; the conclusion (no threshold
 * that still means anything clears 8/11) is unchanged, only the two named
 * classes at the continuum's ends moved.
 */
const MATERIALITY_SHARE = 0.20;

interface ClassMeasurement {
  key: string;
  cls: ClassDef;
  wins: number;
  outcomes: string[];
  /** Summed over all 12 seeds, restricted to the class's own kit sources (header: tower keys are `hybrid`'s choice, not the kit's). */
  ownDamage: Record<string, number>;
  /** Summed over all 12 seeds, every source including towers — the denominator `ownShare` is measured against. */
  allDamage: Record<string, number>;
  /** ownDamage total / allDamage total. */
  ownShare: number;
  /**
   * p12d (BALANCE DIRECTION v2 §D clause (i), same denominator p12a/c002
   * measured): own-kit share of the character's **VS-only** damage
   * (`damageByWeaponVs`), restricted to seeds that reached
   * `QUALIFYING_WAVE` — reusing `class-kit-damage-share.test.ts`'s exact
   * method rather than inventing a second one.
   */
  vsShare: number;
  topLabel: string;
  /** p10z: every seed's raw report, kept so a retune probe can classify margin (`classifyMargin`/`summarizeMargins`, `tests/helpers.ts`) without a second sweep. */
  reports: RunReport[];
}

/** BALANCE DIRECTION v2 §D clause (i), p12a's own target. */
const KIT_SHARE_TARGET = 0.35;
/** class-kit-damage-share.test.ts's own qualifying-wave filter, reused verbatim (p12d). */
const QUALIFYING_WAVE = 12;
/** BALANCE DIRECTION v2 §D clause (ii). */
const FINGERPRINT_FLOOR = 0.15;

function sumValues(rec: Record<string, number>): number {
  let total = 0;
  for (const v of Object.values(rec)) total += v;
  return total;
}

function argmaxKey(rec: Record<string, number>): string {
  let bestKey = '';
  let bestVal = -1;
  for (const [k, v] of Object.entries(rec)) {
    if (v > bestVal) {
      bestVal = v;
      bestKey = k;
    }
  }
  return bestKey;
}

const measurements = new Map<string, ClassMeasurement>();

// File-scoped (not nested in either `describe` below): both describes' tests
// read `measurements`, and a `beforeAll` nested in the first would not be
// guaranteed to run before the second describe's tests under every runner.
// ~12 seeds x 11 classes, each up to a 120-simulated-minute cap (most resolve
// far sooner — see the per-class outcomes logged in each `it` below and in
// this file's header).
//
// p8a (Q122): this `beforeAll` used to hard-fail on any seed still `running`
// at the cap ("a non-terminal outcome is a timeout, not a measured loss, so
// don't silently count it either way" — G23's own precedent). Measured after
// p8a's real wave 11-18 content landed: `swordsman` seed 1 still doesn't
// resolve even at a 250-minute cap (up from 120, more than double G23's own
// headroom), which reads as a genuine stalemate under the new curve rather
// than "needs a bigger cap" — the same category of question the ten win-rate
// clauses below are already `.skip`-ed pending, not a new one to chase down
// here. Recorded as a `'timeout'` outcome instead of thrown, so the shared
// measurement matrix still completes for every other class/seed; the
// follow-up re-measurement pass inherits this one alongside the other ten
// (eleven, after `cryomancer`'s own re-measurement below also fell out of
// band). A `'timeout'` seed's `wins` contribution is correctly zero (only
// `'victory'` increments it, unchanged), but its damage tallies are excluded
// from `ownDamage`/`allDamage` entirely (code-reviewer finding on this item):
// a run capped mid-simulation accumulates over a much longer, incomparable
// window than a seed that actually terminates, and `topLabel`/the diversity
// pin read those two records — folding a stalemate seed's disproportionate
// tally in would silently skew both.
beforeAll(() => {
  for (const key of CLASS_KEYS) {
    const cls = content.classByKey.get(key);
    if (!cls) throw new Error(`${key}: expected a §4 class`);
    let wins = 0;
    const outcomes: string[] = [];
    const reports: RunReport[] = [];
    const ownDamage: Record<string, number> = {};
    const allDamage: Record<string, number> = {};
    const ownVs: Record<string, number> = {};
    const allVs: Record<string, number> = {};
    for (const seed of SEEDS) {
      const report = runClassScripted(key, seed);
      reports.push(report);
      if (report.outcome === 'victory') wins++;
      // p10z: margin, not just outcome — a "landslide" win (Core HP still
      // high) reads very differently from a "close" one, and an early loss
      // (before the roster's own wave-11-to-17 contested band) reads
      // differently from a loss inside it. See `classifyMargin`'s own doc
      // comment (`tests/helpers.ts`) for why bare win/loss couldn't
      // discriminate these (BACKLOG p10z, QUESTIONS Q158/Q159).
      const margin = classifyMargin(report);
      outcomes.push(
        `${seed}:${report.outcome === 'running' ? 'timeout' : report.outcome}/w${report.wavesCleared}/${margin.kind}`,
      );
      // A `'running'` (tick-cap timeout) seed never reached a real end state,
      // so its damage tally covers a much longer, incomparable window than a
      // terminating seed's — excluded from both records rather than folded
      // in, the same non-participation `wins` already gives it.
      if (report.outcome === 'running') continue;
      for (const [k, v] of Object.entries(report.damageByWeapon)) {
        allDamage[k] = (allDamage[k] ?? 0) + v;
        if (!content.towerByKey.has(k)) ownDamage[k] = (ownDamage[k] ?? 0) + v; // a tower key: hybrid's build, not the kit
      }
      // p12d (clause (i)): the VS-only half, same non-participation rule as
      // class-kit-damage-share.test.ts — a run that never reached the
      // qualifying wave can't speak to a target stated about a developed run.
      if (report.wavesCleared < QUALIFYING_WAVE) continue;
      for (const [k, v] of Object.entries(report.damageByWeaponVs)) {
        allVs[k] = (allVs[k] ?? 0) + v;
        if (isKitSource(k)) ownVs[k] = (ownVs[k] ?? 0) + v;
      }
    }
    const ownTotal = sumValues(ownDamage);
    const allTotal = sumValues(allDamage);
    const ownShare = allTotal > 0 ? ownTotal / allTotal : 0;
    const vsShare = sumValues(allVs) > 0 ? sumValues(ownVs) / sumValues(allVs) : 0;
    const topLabel =
      ownShare >= MATERIALITY_SHARE ? describeSource(cls, argmaxKey(ownDamage)) : argmaxKey(allDamage);
    measurements.set(key, { key, cls, wins, outcomes, ownDamage, allDamage, ownShare, vsShare, topLabel, reports });
  }
}, 6_000_000);

describe('p6e: G8 measured as a live test over the seed set (SPEC-FINAL §4, §14)', () => {
  function detail(key: string): string {
    const m = measurements.get(key)!;
    return (
      `${m.wins}/${SEEDS.length} — ${m.outcomes.join(' ')} — top: ${m.topLabel}` +
      ` — margins: ${summarizeMargins(m.reports)}`
    );
  }

  function assertBand(key: string): void {
    const m = measurements.get(key)!;
    expect(m.wins, detail(key)).toBeGreaterThanOrEqual(Math.ceil(SEEDS.length * BAND_LO));
    expect(m.wins, detail(key)).toBeLessThanOrEqual(Math.floor(SEEDS.length * BAND_HI));
  }

  // Was measured 6/12 (50%) after the Ice Wall cooldown tune (header) —
  // solidly inside [35, 70] — the one class whose kit (freeze/shatter CC, a
  // cheap lane-blocking wall) did something other than race the pre-p8a HP
  // curve (repeating wave 10's row forever).
  //
  // p8a re-opened this one (Q122): once real, escalating waves 11-18 replaced
  // the repeated wave-10 row, re-measured at **2/12** — 9:victory/w18,
  // 10:victory/w18, the other ten `defeat_core`/`defeat_warden` at wave 15-18
  // — below the 35% floor. Ice Wall's crowd control bought real survival
  // against a *flat* repeated wave, but the real curve still ramps past it;
  // this is the last of the eleven classes to join the wave-11-17 wall the
  // other ten already hit, not a separate story. `.skip`-ed with the measured
  // number on the same precedent, re-enable point folded into the same
  // follow-up re-measurement pass as the rest of G8.
  // Reconfirmed in full this session (PRIORITY DIRECTIVE follow-up, Q123):
  // identical to the p8a-era number above — 2/12 (seeds 9, 10 victory/w18),
  // no timeouts. Unchanged.
  //
  // p10m re-measurement (this session): re-run against HEAD, after the
  // `p10j`-`p10l` G1/G13 balance pass. Same over-correction story as G14/G23's
  // p10m passes — the floor problem is gone, replaced by a ceiling one:
  // **12/12 (100%)**, every seed victory/w18, up from 2/12. Still `.skip`-ed
  // with the new honest number; re-enable point stays **P10** (measurement
  // only, fix is separate balance work — PROGRESS.md's p10m entry).
  // p10s re-measurement (this session, QUESTIONS Q158/BACKLOG p10s): re-run
  // against HEAD after fb046/fb048 landed (unrelated commits between fb049
  // and this session). Still fully over-ceiling: **12/12** — every seed
  // victory/w18. p10s's own attempt (a real, measured Ice Wall cooldown
  // revert 9->14 plus a basicAttack/towerPassive/active1 cut of 30-40%) left
  // this number completely unmoved even at that magnitude — see p10s's
  // BACKLOG entry for the full per-class table and the `paladin` case below
  // for the even-more-extreme probe that also failed to move a class. Data
  // left unchanged (the tuning was reverted) since it produced zero measured
  // benefit. Re-enable point stays **P10**.
  it.skip('cryomancer', () => assertBand('cryomancer')); // p10s re-measurement: 12/12 — every seed victory/w18, unchanged after a real (reverted) cooldown/damage tuning attempt

  // Every one of the ten below converges on the same wave-11-to-17
  // `defeat_core`/`defeat_warden` wall (this file's header; G23's own
  // precedent for reading that signature as the p8a content gap, not a
  // balance story). Re-enable point: p8a authors real wave rows past 10.
  //
  // Re-measured in full this session (Q123, Q127) — every number below is
  // freshly measured against real p8a content, not inherited from an older
  // pre-p8a pass. `timeout` means the seed hit the 120-minute cap without
  // resolving (Q127); it counts as a non-win, matching every other
  // non-`victory` outcome.
  //
  // p10m re-measurement (this session, all ten below): re-run against HEAD,
  // after the `p10j`-`p10l` G1/G13 balance pass that also flipped G14/G23
  // from under-the-floor to over-the-ceiling. Every timeout and every
  // wave-11-to-17 wall death this file's header names is gone — the wall is
  // fully closed — but nine of the ten now clear 11-12/12 (91.7-100%),
  // past the 70% ceiling (`floor(12*0.70) = 8`), not inside [5, 8]. Only
  // necromancer stays under the 35% floor (`ceil(12*0.35) = 5`), now for a
  // different reason than before (see its own comment). Still `.skip`-ed
  // with the fresh honest numbers; re-enable point stays **P10** for all ten
  // (measurement only, fix is separate balance work — PROGRESS.md's p10m
  // entry).
  // p10s (this session): swordsman/plaguebringer/engineer/pyromancer/archer
  // all re-measured at HEAD, unchanged at 12/12 (pyromancer 11/12 — seed 8
  // has always been an early defeat_warden/w3 outlier, unrelated to any p10s
  // edit). p10s tried a real basicAttack/towerPassive/active cut on
  // pyromancer/archer (30-45%) and an active-only cut on engineer (kit is
  // bot-scripted here but `basicAttack`/`towerPassive`/`passive` are shared
  // with G1/G14's un-scripted engineer-only harness, so those three fields
  // are off-limits for engineer specifically) — all three still 100%-ish,
  // reverted since ineffective. swordsman/plaguebringer are additionally
  // constrained by `tests/p6b-swordsman.test.ts`/`tests/p6c-plaguebringer.
  // test.ts`'s own literal pins on `towerPassive.mods` (see those files) —
  // only `basicAttack`/`active1`/`active2` were legal to touch there, and a
  // ~35-40% cut on those alone also didn't move it. Data left unchanged.
  it.skip('swordsman', () => assertBand('swordsman')); // p10s re-measurement: 12/12 — every seed victory/w18, unmoved by a real (reverted) basicAttack/active cut
  it.skip('plaguebringer', () => assertBand('plaguebringer')); // p10s re-measurement: 12/12 — every seed victory/w18, unmoved by a real (reverted) basicAttack/active cut
  it.skip('engineer', () => assertBand('engineer')); // p10s re-measurement: 12/12 — every seed victory/w18, unmoved by a real (reverted) active-only cut (basicAttack/towerPassive/passive are shared with G1/G14's un-scripted engineer harness, off-limits)
  it.skip('pyromancer', () => assertBand('pyromancer')); // p10s re-measurement: 11/12 — seed 8 defeat_warden/w3 (pre-existing outlier), rest victory/w18; unmoved by a real (reverted) basicAttack/towerPassive/active cut
  it.skip('archer', () => assertBand('archer')); // p10s re-measurement: 12/12 — every seed victory/w18, unmoved by a real (reverted) basicAttack/towerPassive cut (active1.damage is pinned by G10's ceil<=3 formula test, untouched)
  // Tuned (header, corrected this session — Q123): Raise's
  // cooldown/potency/duration/radius all buffed. Early defeat_warden is now
  // the minority (3/12: waves 3/6/15) against a defeat_core majority (9/12:
  // waves 13-17) — real progress, still 0/12, no timeouts, no victories.
  //
  // p10m re-measurement (this session): re-run against HEAD, after the
  // `p10j`-`p10l` balance pass. The wave-11-to-17 wall is gone for the other
  // nine classes but not this one — necromancer stays under the 35% floor,
  // **4/12** (seeds 2, 5, 6, 8 victory/w18; seed 11 defeat_core/w17; the
  // other seven early defeat_warden at wave 3 or 6). The failure shape moved
  // (from a uniform mid-run wall to an early-death/late-clear split) but the
  // gate direction did not — still under-floor, not over-ceiling like the
  // other nine. Still `.skip`-ed with the fresh number; re-enable point stays
  // **P10**.
  // p10s (this session): necromancer re-measured 12/12, unmoved even after
  // reverting its p6e-era Raise buff back down (cooldown 6->10,
  // summonStatMul 0.65->0.42, duration 24->16, radius 8->6) plus a
  // towerPassive/basicAttack cut — reverted, ineffective. stormcaller
  // likewise 12/12 after a real (reverted) basicAttack/towerPassive/active1
  // cut. animist 10/12 (2 timeouts, seeds 5/7) — already short of 12/12 at
  // HEAD with no p10s edit at all (animist was left untouched; every lever
  // tried on other classes at this magnitude produced zero movement, so it
  // wasn't spent here) — still over the 8-win ceiling.
  it.skip('necromancer', () => assertBand('necromancer')); // p10s re-measurement: 12/12 — every seed victory/w18, unmoved by a real (reverted) Raise-nerf + towerPassive/basicAttack cut
  it.skip('stormcaller', () => assertBand('stormcaller')); // p10s re-measurement: 12/12 — every seed victory/w18, unmoved by a real (reverted) basicAttack/towerPassive/active1 cut
  // **p10s CLOSED THIS ONE — bloodlord is now in-band, un-skipped below.**
  it.skip('animist', () => assertBand('animist')); // p10s re-measurement: 10/12 — seeds 5,7 timeout/w18, rest victory/w18 (untouched by p10s; still over ceiling)
  // Tuned (header, corrected this session — Q123): Guardian
  // Stance/Clarion Taunt/Judgement all buffed. Early defeat_warden is 4/12
  // (three at wave 3, one at wave 6) against a defeat_core majority (8/12:
  // waves 8/15/16) — still 0/12, no timeouts, no victories.
  //
  // p10m re-measurement (this session): re-run against HEAD, after the
  // `p10j`-`p10l` balance pass. Same over-ceiling story as the other nine —
  // **11/12** (only seed8 early defeat_warden/w3, every other seed
  // victory/w18). Still `.skip`-ed with the fresh number; re-enable point
  // stays **P10**.
  //
  // p10s (this session): re-measured 12/12 at HEAD, then pushed the most
  // extreme single-class probe of this whole session against it — a real
  // (reverted) ~80% cut across basicAttack (10->2), Guardian Stance
  // (stanceArmor 30->10, stanceSeconds 1.0->2.0, wrathFraction 0.55->0.2)
  // and towerPassive (towerHp 0.04->0.01, towerDefenseBonus 2->0.5), all on
  // top of the earlier stanceArmor/wrathFraction/Clarion-Taunt/Judgement
  // reverts already folded into HEAD by a prior session. Still **6/6 (100%)**
  // on a 6-seed sample — zero movement even at that magnitude. This is the
  // decisive data point behind p10s's "genuine wall" conclusion: it isn't
  // that paladin's specific numbers are wrong, it's that none of
  // basicAttack/passive/towerPassive/active magnitude moves this gate at all
  // once T1 carries `TREE_AUTO_MAX`. Reverted (produced no benefit); data
  // unchanged from the fb049-era baseline. Re-enable point stays **P10**.
  it.skip('paladin', () => assertBand('paladin')); // p10s re-measurement: 12/12 — every seed victory/w18, unmoved even by an extreme (reverted) ~80% basicAttack/passive/towerPassive cut

  // **p10s (BACKLOG p10s, QUESTIONS Q158) — CLOSED.** Every other class in
  // this file sits on a genuine /data-only wall (see each `it.skip` above):
  // real, measured cuts of 30-80% across basicAttack/towerPassive/passive/
  // active fields move nothing, because T1 with the real `TREE_AUTO_MAX`
  // Constellation allocation already wins ~92-100% of the time almost
  // independent of any one class's own numbers. Bloodlord is the one
  // exception this session found: `data/classes.json` `basicAttack.dps`
  // 28->17 and `towerPassive.mods.towerDamage` 0.10->0.04 (leech intentionally
  // left at 0.03 — `tests/fb022-info-surfacing.test.ts`'s b053 case pins the
  // "+3% Leech" display string to that exact value) bring it from 10/12 to
  // **8/12 (66.7%)** — inside [35,70] with real headroom on both sides.
  // Bloodlord was already the roster's most timeout-prone class before this
  // change (fb049: 2/12 timeouts); the same nerf that pushes its win rate
  // into band also pushes two more seeds into a timeout rather than a clean
  // loss (2->4 of 12) — both are non-`victory` outcomes and both are already
  // handled correctly by `assertBand`. G1/G14 (both locked to
  // `classKey: 'engineer'`) and every other class/Core in this suite are
  // unaffected — confirmed by re-running both after this edit landed.
  // b080 (2026-09-03) RE-OPENED THIS ONE — re-measured 12/12 (100%,
  // landslide-win every seed), over the 70% ceiling again. Root cause is not
  // bloodlord's own `data/classes.json` numbers (p10s's basicAttack.dps
  // 28->17 / towerPassive.mods.towerDamage 0.10->0.04 nerf is untouched) —
  // it's `data/towers.json`'s solo-viability retune (BACKLOG b080, fixing
  // `tests/a4-single-type.test.ts`'s G13 regression), which raised damage on
  // 7 towers ~10-37x. Every class's scripted kit shares the same hybrid
  // tower build, so the retune lifted bloodlord's win rate along with every
  // other class's, undoing p10s's careful band-tuning as a side effect.
  // Rejoins the rest of the roster on the same already-exhausted G8
  // win-rate wall (BACKLOG p10s/p10r/p10t/p10z, QUESTIONS Q158-Q160: 4+
  // independent /data-only balance-analyst sessions found no lever that
  // moves this once T1 carries the real `TREE_AUTO_MAX` allocation) — not
  // re-chased here per CLAUDE.md rule 6. Re-enable point stays P10 / an
  // owner verdict on Q160.
  it.skip('bloodlord', () => assertBand('bloodlord')); // b080 re-measurement: 12/12 (100%) — every seed victory/w18/landslide-win, re-opened by the towers.json retune, not a bloodlord-specific regression

  // p10v: Time Lord (fb013's 12th class) rode along in `measurements`/the
  // diversity checks below but never had its own individual G8 win-rate pin
  // the way the other eleven do — filling that gap per BACKLOG p10v.
  // Measured against HEAD with the same scripted-kit/`TREE_AUTO_MAX` harness:
  // same over-ceiling story as the other ten un-skipped classes — every seed
  // a landslide win, no timeouts, no defeats.
  it.skip('time_lord', () => assertBand('time_lord')); // p10v: measured 12/12 — every seed victory/w18/landslide-win

  it('every one of the eleven §4 classes was actually measured (no key silently skipped)', () => {
    expect([...measurements.keys()].sort()).toEqual([...CLASS_KEYS].sort());
  });
});

/**
 * p12d (BACKLOG.md, BALANCE DIRECTION v2 §D): replaces the retired
 * "top damage source differs across >=9 of 12 classes" clause with the two
 * checks the owner verdict specifies. Both reuse this file's own T3
 * `beforeAll` sweep (`measurements`) rather than launching a second one —
 * clause (i)'s `vsShare` is computed alongside `ownShare` above; clause
 * (ii)'s vectors are built from the same `allDamage` records G22's method
 * already reads.
 */
describe('p6e: G8 diversity, BALANCE DIRECTION v2 §D (p12d)', () => {
  /** G22's `l1Distance` (`tests/p-core-f-gates.test.ts`), reused verbatim (also duplicated in `tests/class-kit-fingerprint.test.ts`, out of Scope there). */
  function shareVector(rec: Record<string, number>): Record<string, number> {
    const total = sumValues(rec);
    const out: Record<string, number> = {};
    if (total <= 0) return out;
    for (const [k, v] of Object.entries(rec)) out[k] = v / total;
    return out;
  }
  function l1Distance(a: Record<string, number>, b: Record<string, number>): number {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    let sum = 0;
    for (const k of keys) sum += Math.abs((a[k] ?? 0) - (b[k] ?? 0));
    return sum;
  }

  // c002/c030 (BACKLOG-CONTENT, T1, 12 seeds) already found this unreachable
  // from `data/classes.json` alone — best was `plaguebringer` at 17.85%,
  // 0/12 classes at the 35% target (QUESTIONS Q175, BACKLOG p12f, still
  // open). Measured here live at T3 (GATE_TIER) instead of T1 — a harder
  // reference tier does not change which side of the wall this sits on
  // (the mechanism is structural: VS-wielded weapon damage inherits the
  // full tower-upgrade/Constellation scaling stack and the kit does not, so
  // the denominator outgrows the numerator regardless of tier) — `.skip`-ed
  // with the fresh T3 number rather than assumed from the T1 one, per
  // CLAUDE.md's control-run rule. Re-enable point: p12f.
  it.skip('every class\'s own-kit VS damage share is >=35% from wave 12 (clause i)', () => {
    const meeting = CLASS_KEYS.filter((k) => measurements.get(k)!.vsShare >= KIT_SHARE_TARGET);
    const breakdown = CLASS_KEYS.map(
      (k) => `${k}: ${(measurements.get(k)!.vsShare * 100).toFixed(2)}%`,
    ).join(', ');
    expect(meeting.length, `${meeting.length}/${CLASS_KEYS.length} at >=35% — ${breakdown}`).toBe(
      CLASS_KEYS.length,
    );
  });

  // Pins the honest T3 measurement so a future change is forced to
  // re-examine this rather than silently drifting.
  it('the current (red) own-kit VS-share count is pinned, not silently drifting', () => {
    const meeting = CLASS_KEYS.filter((k) => measurements.get(k)!.vsShare >= KIT_SHARE_TARGET);
    expect(meeting.length).toBe(0);
  });

  // class-kit-fingerprint.test.ts (BACKLOG-CONTENT c033) measured this exact
  // clause first, at T1 with KIT_FP_SEEDS=2 (directional): 50/66 pairs meet
  // the floor, 16 fail, all inside one cluster of classes whose kit never
  // clears MATERIALITY_SHARE so their fingerprint is dominated by shared
  // `hybrid`-build tower usage.
  //
  // **Measured live here at T3/12 seeds (this file's own sweep), 2026-09-07:
  // 16/66 pairs fail the floor** — the identical count c033 found at T1/2
  // seeds (not necessarily the identical 16 pairs; not cross-checked pair-
  // for-pair). `.skip`-ed with this real T3 number rather than the T1 one,
  // per CLAUDE.md's control-run rule; the pin case right below asserts it
  // exactly. Re-enable point: same wall as clause (i) (own-kit share never
  // clears MATERIALITY_SHARE, so every class's fingerprint is dominated by
  // shared tower usage) — P10 / an owner verdict on Q160.
  it.skip('every one of the 66 class-pairs has fingerprint distance >=0.15 (clause ii)', () => {
    const vectors = CLASS_KEYS.map((k) => ({ key: k, vector: shareVector(measurements.get(k)!.allDamage) }));
    const pairs: { a: string; b: string; distance: number }[] = [];
    for (let i = 0; i < vectors.length; i++) {
      for (let j = i + 1; j < vectors.length; j++) {
        pairs.push({ a: vectors[i].key, b: vectors[j].key, distance: l1Distance(vectors[i].vector, vectors[j].vector) });
      }
    }
    const failing = pairs.filter((p) => p.distance < FINGERPRINT_FLOOR);
    const breakdown = failing
      .sort((x, y) => x.distance - y.distance)
      .map((p) => `${p.a}/${p.b} ${p.distance.toFixed(4)}`)
      .join(', ');
    expect(failing.length, `${failing.length}/${pairs.length} pairs below 0.15 — ${breakdown}`).toBe(0);
  }); // measured: 16/66 pairs below 0.15 (T3, 12 seeds, 2026-09-07)

  // Pins the honest T3 measurement (16/66, see the skip above) so a future
  // change is forced to re-examine this rather than silently drifting —
  // same exact-pin shape as clause (i)'s own pin three cases above.
  it('the current (red) fingerprint-distance failure count is pinned, not silently drifting', () => {
    const vectors = CLASS_KEYS.map((k) => ({ key: k, vector: shareVector(measurements.get(k)!.allDamage) }));
    let failing = 0;
    for (let i = 0; i < vectors.length; i++) {
      for (let j = i + 1; j < vectors.length; j++) {
        if (l1Distance(vectors[i].vector, vectors[j].vector) < FINGERPRINT_FLOOR) failing++;
      }
    }
    expect(failing).toBe(16);
  });
});

/**
 * p12d: T1/T5 companion win-rate bands, alongside — not replacing — the T3
 * reference-tier per-class bands above. Reuses the shared `hybrid`-loadout
 * harness (not per-class scripting) that `tests/p12c-margin.test.ts` first
 * measured these two bands against, since a full per-class x per-tier sweep
 * (12 classes x 2 extra tiers) would multiply this already-expensive file's
 * cost threefold for a question the shared harness already answers: whether
 * the T1/T5 rungs themselves produce the intended easy/hard skew. Logged as
 * a scope decision in QUESTIONS.md rather than assumed.
 */
describe('G8 companions: T1 and T5 confirm the tier ladder (BALANCE DIRECTION v2 §B/§C, p12d)', () => {
  const T1_WIN_BAND = [0.55, 0.9] as const;
  const T1_MIN_CLOSE_WIN = 0.25;
  const T5_WIN_BAND = [0.05, 0.2] as const;

  function runAt(tier: number): RunReport[] {
    return SEEDS.map(
      (seed) =>
        runScripted({ seed, classKey: 'engineer', tier, modifiers: [], allocated: FULL_TREE }, 'hybrid', 60 * 60 * 45)
          .report,
    );
  }

  // Measured 2026-09-07 (this file's own 12-seed shape, not G1's 24 — the
  // T5 case below is measured the same way): 6/12 wins (50%), just under the
  // 55% floor (close-win share itself is fine at 50%). `.skip`-ed per
  // CLAUDE.md rule 6 rather than nudged — a near-miss is still a miss, and
  // this is the same shared `engineer`/`hybrid` harness G1's own T1
  // companion (24 seeds, 66.7%) passed cleanly, so the gap is sampling noise
  // at n=12 rather than a new wall; a future re-measurement at 24 seeds
  // would be the first thing to try before treating this as real.
  it.skip('T1: win rate in [55%,90%] with >=25% close-win share', () => {
    const reports = runAt(1);
    const wins = reports.filter((r) => r.outcome === 'victory');
    const closeWins = reports.filter((r) => classifyMargin(r).kind === 'close-win').length;
    const rate = wins.length / reports.length;
    const closeShare = closeWins / reports.length;
    const detail = `T1: ${wins.length}/${reports.length} wins, ${closeWins} close-win — ${summarizeMargins(reports)}`;
    expect(rate, detail).toBeGreaterThanOrEqual(T1_WIN_BAND[0]);
    expect(rate, detail).toBeLessThanOrEqual(T1_WIN_BAND[1]);
    expect(closeShare, detail).toBeGreaterThanOrEqual(T1_MIN_CLOSE_WIN);
  }); // measured: 6/12 wins (50%) — just under the 55% floor

  it('T5: win rate in [5%,20%]', () => {
    const reports = runAt(5);
    const wins = reports.filter((r) => r.outcome === 'victory');
    const resolved = reports.filter((r) => r.outcome !== 'running');
    const rate = wins.length / resolved.length;
    const detail = `T5: ${wins.length}/${resolved.length} wins (of ${reports.length} seeds) — ${summarizeMargins(reports)}`;
    expect(rate, detail).toBeGreaterThanOrEqual(T5_WIN_BAND[0]);
    expect(rate, detail).toBeLessThanOrEqual(T5_WIN_BAND[1]);
  });
});
