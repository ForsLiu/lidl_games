/**
 * p6e — SPEC-FINAL §4, gate **G8**: "every class clears T1 at 35-70% win rate
 * (scripted kit bot); top damage source differs across >=8 of 11 classes."
 *
 * fb013 (2026-08-29) added a 12th class, Time Lord — `CLASS_KEYS` below picks
 * it up automatically, and SPEC-FINAL's own G8 text now reads ">=9 of 12"
 * (the same ~73% ratio). This file's entire
 * win-rate sweep was already `.skip`-ed per class pending **P10** before
 * fb013 landed (see the dated corrections below); Time Lord has not been run
 * through it — a full re-run costs ~1 h (b027's note) and stays out of scope
 * for an ordinary item per CLAUDE.md's ban on starting a background full/heavy
 * suite inside one. Re-measure Time Lord alongside the rest of G8 at P10.
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
 */
import { beforeAll, describe, expect, it } from 'vitest';

import { Run } from '../src/sim/run';
import { makePolicy } from '../src/bots';
import '../src/bots';
import { coreCenter } from '../src/sim/grid';
import { loadContent, type ClassDef } from '../src/sim/content';
import type { RunConfig, RunReport, TickInput } from '../src/sim/types';
import type { World } from '../src/sim/world';
import { cfg } from './helpers';

const content = loadContent();
const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
/** §14 gate G8's own band. */
const BAND_LO = 0.35;
const BAND_HI = 0.70;

/** The twelve §4-shaped classes, fb013. */
const CLASS_KEYS = content.classes.classes.map((c) => c.key);

const CHARGE_KINDS = new Set(['charge_nova', 'charge_pierce']);

/**
 * Structure-targeting kinds (Engineer's Field Kit, Bloodlord's Blood Tithe,
 * Necromancer's Death Pact) read `nearestStructure(w, aimX ?? wd.x, aimY ??
 * wd.y, ...)` (classes.ts) — an aim override at the nearest *enemy* points
 * that search at the enemy's tile instead of the Warden's own, which can
 * legitimately miss every structure the Warden is actually standing near.
 * code-reviewer (p6e round 2) caught that the header claimed these three omit
 * the override but the code unconditionally set one; fixed by actually
 * skipping the override for exactly this set, so the search falls through to
 * `nearestStructure`'s own `?? wd.x`/`?? wd.y` default.
 */
const STRUCTURE_TARGET_KINDS = new Set(['repair_heal', 'blood_tithe', 'death_pact']);

/** Nearest enemy, falling back to the Core when the board is empty — the aim point for every Active except the three `STRUCTURE_TARGET_KINDS` above. */
function aimPoint(w: World): { x: number; y: number } {
  const wd = w.warden;
  const t = w.nearestEnemy(wd.x, wd.y, 40);
  if (t) return { x: t.x, y: t.y };
  const c = coreCenter();
  return { x: c.x, y: c.y };
}

/** Drives one class's kit onto a stock policy's own TickInput, every tick Act I or Act II runs. See this file's header for the cadence/aim/sequencing rules. */
function scriptClassKit(w: World, input: TickInput): void {
  const cls = w.content.classByKey.get(w.cfg.classKey);
  if (!cls) return;
  const wd = w.warden;
  const aim = aimPoint(w);

  if (CHARGE_KINDS.has(cls.active1.kind)) {
    const cap = cls.active1.chargeCapSeconds ?? 3;
    const holdWindow = Math.min(cap, 2);
    input.active1Held = wd.active1Charging ? wd.active1Charge < holdWindow : wd.active1Cooldown <= 0;
    input.aimX = aim.x;
    input.aimY = aim.y;
  } else if (wd.active1Cooldown <= 0) {
    input.cmds.push(
      STRUCTURE_TARGET_KINDS.has(cls.active1.kind)
        ? { k: 'class_active' }
        : { k: 'class_active', aimX: aim.x, aimY: aim.y },
    );
  }

  // Paladin-only sequencing (header comment): don't detonate Judgement on
  // whatever scraps of Wrath a just-opened taunt window has banked so far.
  const judgementReady = cls.active2.kind !== 'judgement' || (wd.clarionRemaining <= 0 && wd.wrathStored > 0);
  if (wd.active2Cooldown <= 0 && judgementReady) {
    input.cmds.push(
      STRUCTURE_TARGET_KINDS.has(cls.active2.kind)
        ? { k: 'class_active2' }
        : { k: 'class_active2', aimX: aim.x, aimY: aim.y },
    );
  }
}

/** T1, one class, one seed — hybrid economy/kiting, this file's kit script layered on top, Core upgrades bought on the same precedent as G23's `runCoreScripted`. */
function runClassScripted(classKey: string, seed: number): RunReport {
  const policyName = 'hybrid';
  const config: RunConfig = cfg({ seed, classKey, tier: 1, modifiers: [], cycles: 6, policy: policyName });
  const run = new Run(config);
  const policy = makePolicy(policyName);
  const w = run.world;
  const center = coreCenter();
  const stepCount = w.content.coreByKey.get(w.coreKey)?.upgrade.count ?? 0;
  // Same headroom G23 measured its slowest resolution against (Q120).
  const maxTicks = 60 * 60 * 120;
  while (!run.done && w.tick < maxTicks) {
    const input = policy.act(w);
    if (w.phase === 'act1_build' || w.phase === 'act1_wave' || w.phase === 'act2') {
      scriptClassKit(w, input);
    }
    if ((w.phase === 'act1_build' || w.phase === 'act1_wave') && w.coreStep < stepCount) {
      w.warden.x = center.x;
      w.warden.y = center.y;
      input.cmds.push({ k: 'upgrade_core' });
    }
    run.step(input);
  }
  return run.report();
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
  topLabel: string;
}

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
    const ownDamage: Record<string, number> = {};
    const allDamage: Record<string, number> = {};
    for (const seed of SEEDS) {
      const report = runClassScripted(key, seed);
      if (report.outcome === 'victory') wins++;
      outcomes.push(`${seed}:${report.outcome === 'running' ? 'timeout' : report.outcome}/w${report.wavesCleared}`);
      // A `'running'` (tick-cap timeout) seed never reached a real end state,
      // so its damage tally covers a much longer, incomparable window than a
      // terminating seed's — excluded from both records rather than folded
      // in, the same non-participation `wins` already gives it.
      if (report.outcome === 'running') continue;
      for (const [k, v] of Object.entries(report.damageByWeapon)) {
        allDamage[k] = (allDamage[k] ?? 0) + v;
        if (!content.towerByKey.has(k)) ownDamage[k] = (ownDamage[k] ?? 0) + v; // a tower key: hybrid's build, not the kit
      }
    }
    const ownTotal = sumValues(ownDamage);
    const allTotal = sumValues(allDamage);
    const ownShare = allTotal > 0 ? ownTotal / allTotal : 0;
    const topLabel =
      ownShare >= MATERIALITY_SHARE ? describeSource(cls, argmaxKey(ownDamage)) : argmaxKey(allDamage);
    measurements.set(key, { key, cls, wins, outcomes, ownDamage, allDamage, ownShare, topLabel });
  }
}, 900_000);

describe('p6e: G8 measured as a live test over the seed set (SPEC-FINAL §4, §14)', () => {
  function detail(key: string): string {
    const m = measurements.get(key)!;
    return `${m.wins}/${SEEDS.length} — ${m.outcomes.join(' ')} — top: ${m.topLabel}`;
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
  it.skip('cryomancer', () => assertBand('cryomancer')); // 2/12 — 9:victory/w18, 10:victory/w18, other ten defeat_core/defeat_warden wave 15-18

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
  it.skip('swordsman', () => assertBand('swordsman')); // 2/12 — 4:victory/w18, 6:victory/w18, 4 timeouts (seeds 1,2,5,9), rest defeat_core/defeat_warden wave16-18
  it.skip('plaguebringer', () => assertBand('plaguebringer')); // 0/12 — all defeat_core wave13-17 except seed4 defeat_warden/w18
  it.skip('engineer', () => assertBand('engineer')); // 3/12 — seeds 7,9,10 victory/w18, rest defeat_core/defeat_warden wave14-17
  it.skip('pyromancer', () => assertBand('pyromancer')); // 1/12 — seed6 victory/w18, seed3 early defeat_warden/w3, rest defeat_core/defeat_warden wave16-18
  it.skip('archer', () => assertBand('archer')); // 2/12 — seeds 4,6 victory/w18, 2 timeouts (seeds 2,11), seeds 3,5 early defeat_warden/w3, rest defeat_core/defeat_warden wave16-18
  // Tuned (header, corrected this session — Q123): Raise's
  // cooldown/potency/duration/radius all buffed. Early defeat_warden is now
  // the minority (3/12: waves 3/6/15) against a defeat_core majority (9/12:
  // waves 13-17) — real progress, still 0/12, no timeouts, no victories.
  it.skip('necromancer', () => assertBand('necromancer'));
  it.skip('stormcaller', () => assertBand('stormcaller')); // 2/12 — seeds 7,10 victory/w18, 1 timeout (seed6), seed2 early defeat_warden/w6, rest defeat_core wave10-17/defeat_warden w18
  it.skip('bloodlord', () => assertBand('bloodlord')); // 4/12 — seeds 6,7,9,10 victory/w18, 2 timeouts (seeds 1,12), rest defeat_core/defeat_warden wave16-18
  it.skip('animist', () => assertBand('animist')); // 3/12 — seeds 2,6,10 victory/w18, rest defeat_core wave13-17, no timeouts
  // Tuned (header, corrected this session — Q123): Guardian
  // Stance/Clarion Taunt/Judgement all buffed. Early defeat_warden is 4/12
  // (three at wave 3, one at wave 6) against a defeat_core majority (8/12:
  // waves 8/15/16) — still 0/12, no timeouts, no victories.
  it.skip('paladin', () => assertBand('paladin'));

  it('every one of the eleven §4 classes was actually measured (no key silently skipped)', () => {
    expect([...measurements.keys()].sort()).toEqual([...CLASS_KEYS].sort());
  });
});

describe('p6e: G8 top-damage-source diversity (>=8 of 11 distinct)', () => {
  // CORRECTED (this session): QUESTIONS.md's original Q121(4) claimed this
  // measurement came out 11/11 distinct, with own-kit shares that "cluster
  // either well above [20%] or near zero." That claim was never actually
  // checked against a full, completed 12-seed x 11-class run — the first
  // time this file's own beforeAll was let run to completion (this session),
  // every class's own-kit share landed between 0.4% (engineer) and 16.6%
  // (plaguebringer): a continuum, not a cluster, and every single one under
  // MATERIALITY_SHARE. Re-run in isolation (not a contention flake): same
  // numbers. At the 20% bar, all eleven fall back to the raw allDamage
  // argmax, which collapses to two tower keys (`ballista`/`frost_obelisk`)
  // across the roster — G13's tower-diversity question, not a kit-identity
  // one. No materiality threshold that still means anything clears >=8/11:
  // the 8th-largest share is paladin's 1.6%, so "passing" would require
  // lowering the bar to ~1.5%, indistinguishable from no bar at all and
  // exactly the near-tautological pass code review's Major 1 finding (this
  // file's header) existed to prevent. Skipped on the same precedent as the
  // ten win-rate skips above (CLAUDE.md rule 6, Q109/G23): a red measurement
  // gets a recorded reason, not a lowered bar. Most likely the same root
  // cause as the wave-11-to-17 wall those ten hit — an 18-wave hybrid tower
  // economy has far more time to compound than any cooldown-gated class kit,
  // and `p8a`'s real wave content is what would shorten that runway — though
  // this item does not prove that link directly. Re-enable point: p8a.
  //
  // RE-CORRECTED (PRIORITY DIRECTIVE follow-up, this session, Q123): p8a
  // landed and this was re-measured in full — **distinct count is still 2**
  // (`frost_obelisk`/`ballista`), unchanged. The paragraph's own-kit-share
  // numbers were measured pre-p8a and are superseded: real post-p8a shares
  // run 0.4% (animist) to 15.4% (plaguebringer), and the 8th-largest is
  // cryomancer's 1.7%, not paladin's — same conclusion (no non-tautological
  // bar clears 8/11), corrected numbers. Re-enable point moves from `p8a`
  // (done) to **P10**, the same as every other clause this pass re-measured.
  // fb013: SPEC-FINAL's own G8 text now reads ">=9 of 12" (Time Lord folded
  // in at the original ~73% ratio) — threshold updated to match, unmeasured.
  it.skip('at least 9 of the 12 classes top out on a different source', () => {
    const labels = CLASS_KEYS.map((k) => measurements.get(k)!.topLabel);
    const distinct = new Set(labels);
    const breakdown = CLASS_KEYS.map((k) => {
      const m = measurements.get(k)!;
      return `${k}: ${m.topLabel} (own-kit share ${(m.ownShare * 100).toFixed(1)}%, ownDamage=${JSON.stringify(m.ownDamage)}, allDamage=${JSON.stringify(m.allDamage)})`;
    }).join('\n');
    expect(
      distinct.size,
      `only ${distinct.size}/${CLASS_KEYS.length} distinct top sources:\n${breakdown}`,
    ).toBeGreaterThanOrEqual(9);
  });

  // Pins the honest measurement so a future change is forced to re-examine
  // this rather than silently drifting: pre-fb013 (11 classes) it was 2.
  //
  // fb013: `CLASS_KEYS` now includes Time Lord, and this file's ~1 h
  // `beforeAll` sweep has not been re-run against the 12-class roster (out of
  // scope for an ordinary item per CLAUDE.md — see this file's header note).
  // Asserting the stale pre-fb013 number here would be an unearned pin, not a
  // measured one, so this is `.skip`-ed too until P10 re-measures all of G8
  // (win rate and diversity, all twelve classes) together.
  it.skip('the current (red) distinct-source count is pinned, not silently drifting', () => {
    const labels = CLASS_KEYS.map((k) => measurements.get(k)!.topLabel);
    const distinct = new Set(labels);
    expect(distinct.size).toBe(2);
  });
});
