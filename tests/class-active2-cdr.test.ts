/**
 * c019 (BACKLOG-CONTENT, lane `content`) — **the `active2_cdr` card, on trial,
 * and its one dead corner pinned rather than left implicit.**
 *
 * Filed by QA on `c018`. `c016` put the twelve `class_line` cards on trial and
 * closed its own header with the gap this file fills: of the three §6.3 cards
 * every class owns, `active1_potency` is touched by `tests/act2.test.ts` and
 * `tests/p6b-swordsman.test.ts` (swordsman only) and **`active2_cdr`'s only
 * behavioural coverage anywhere was a HUD readout** in
 * `tests/fb026-bottom-bar.test.ts` — a number printed on a bar, never a cast
 * that landed. All twelve could be deleted from `progression.ts` and the suite
 * would stay green.
 *
 * ---
 *
 * **The disposition c019 asks to be pinned.** `c018` made both summon caps
 * reachable at the real cast cadence (Pop Turret 12 s -> 3 s, Manifest
 * 16 s -> 4 s). QA immediately re-measured the neighbouring card and found
 * that the fix had made Engineer *Pop Turret Cooldown* inert **on live turret
 * count** at `engineer_turret_cap` rank 0 — the state every Engineer starts a
 * run in — where before the fix it had bought a turret:
 *
 *   | arm            | cap rank | peak by cdr rank 0/1/2 | mean by cdr rank 0/1/2   |
 *   | before (cd 12) | 0        | 1 -> 2 -> 2            | 0.83 -> 1.11 -> 1.66     |
 *   | after  (cd 3)  | 0        | **2 -> 2 -> 2**        | **2.00 -> 2.00 -> 2.00** |
 *
 * That is not a regression to undo; it is **inherent**, and undoing it would
 * un-fix `c018`. Once a turret outlives a full lap of the cap — which is what
 * c018's acceptance demands — the cap binds, and no amount of cooldown
 * reduction can add a summon, because there is no room left above the cap to
 * add one into. Cutting the cooldown further can only make casts arrive
 * sooner, and `spawnClassSummon` answers a cast at the cap by *replacing the
 * oldest turret*, not by adding one more.
 *
 * **So the disposition is pinned here, in the shape c019's option (b) names:**
 *
 *   > `active2_cdr` is a **cast-rate** card, everywhere, for all twelve
 *   > classes. On a class whose Active2 summons against a cap, at any cap rank
 *   > where a summon outlives a full lap of that cap — which today means
 *   > Engineer at `engineer_turret_cap` rank 0 and rank 1 — the cap binds the
 *   > *count*, and what the cooldown card buys instead is **how fast the board
 *   > fills to the cap** from empty and **how young the set on it stays**: a
 *   > younger turret is one placed at a more recent Warden position, which for
 *   > a moving Engineer is a turret that kept up with her. Turrets have no HP,
 *   > so those two are the whole of its remaining value there.
 *
 * The qualifier is load-bearing and the last case in that block is why. This is
 * **not** "the card never buys turrets": at the **top** cap rank the cadence
 * only just reaches the cap, a turret no longer outlives a lap of it, and cdr
 * rank 1 is worth +0.67 mean turrets (3.33 -> 4.00 -> 4.00) — exactly the
 * figure c019's item text records. Stated unqualified, the disposition would
 * read as far more alarming than what is actually true (code review).
 *
 * **There is a second row, and finding it is what answers c019's last
 * sentence** ("the same question applies to the other eleven `active2_cdr`
 * cards"). Animist *Recall Totem Cooldown* has the same dead corner by a
 * different route: its cap of 1 is enforced in **code**, not `/data`, so the
 * first draft's `/data`-scoped tripwire could not see it (QA — deleting that
 * code cap left all 45 cases of that draft green). The census case below is
 * behavioural for exactly that reason. Recall Totem's card buys uptime rather
 * than count, and 15 s of totem on a 20 s cooldown means **one rank already
 * covers the gap** — the second is worth a tenth of a percent.
 *
 * The matching QUESTIONS.md entry is out of this lane's Scope and is written
 * verbatim into BACKLOG-CONTENT.md's Log for the main lane to transcribe —
 * "never silence" is satisfied in both places, not one.
 *
 * **This item changes no number.** No `/src` or `/data` byte moves; c007 set
 * the same precedent for the whiff policy. What moves is that the twelve cards
 * now have a behavioural ladder, and the one row where that ladder is flat on
 * an observable a player might reasonably expect it to move says so out loud,
 * with the reason and with its own exception, rather than being absent.
 *
 * ---
 *
 * **The observable is a cast that landed**, not a cooldown field: every row
 * spams the Active every single tick through the real
 * `useClassActive2` -> `updateWarden` loop and counts the `true` returns.
 * A cooldown field readback would pass on a `progression.ts` that computed the
 * discount correctly and a `classes.ts` that never applied it. "Landed" here
 * is c007's sense — the cast was *billed* — so for the handful of kinds whose
 * fire function early-returns with no target in an empty world (Death Pact
 * most clearly) a counted cast is a c007 whiff that paid in full. That is the
 * house policy `tests/class-kit-whiff.test.ts` pins, and it is the right
 * observable here for the same reason: what a cooldown card moves is the
 * billing cadence.
 *
 * Cooldowns are ticked by the real `updateWarden`, which also drives Time
 * Lord's ammo recharge (`tickAmmoRecharge`, `classes.ts`) — the one kit whose
 * Active2 is gated on charges rather than a cooldown — so the ladder is
 * measured through whatever gate `/data` actually authors for that class.
 *
 * **The control is the same card at rank 0** (c016's convention, kept): a
 * rank-gated discount is a claim about one run's own progression, so every row
 * builds the identical world three times and requires the count to move
 * strictly at rank 0 -> 1 **and again** at 1 -> 2. Clamping the bonus to one
 * rank is a real regression a rank-0-vs-rank-2 check would absorb.
 *
 * **One row does tie to `/data`**, and it is separate from the ladder: after a
 * single cast in a fresh world, the cost field the class is actually gated on
 * equals its authored `cooldownSeconds`/`rechargeSeconds` scaled by
 * `1 - perRank * rank`, with `derived.cdr === 0` and `active2CdrFactor`'s 0.05
 * floor both asserted as the preconditions that make that arithmetic the whole
 * story. Both sides come out of `/data`, so a retune moves them together —
 * c005's convention: pin the mechanism, not a magnitude.
 *
 * **The Warden is parked every tick.** Four of the twelve Active2s are dashes;
 * left alone, a rank-2 world casts more, travels further and ends the window on
 * different terrain from its own rank-0 control. Nothing gates a cast on
 * position — none of the thirteen `useClassActive2` cases early-returns on
 * position, terrain or dash state, and `tickDashTravel` is time-based, so
 * parking cannot strand a travel (code review) — so parking costs the
 * measurement nothing and removes its only asymmetry.
 *
 * A walking Warden was tried, for the one claim parking might be thought to
 * hide (turrets keeping up with her), and **withdrawn**: distance-to-Warden is
 * a walk artifact, not a property. It beats against the cast period, and at
 * cooldown 4.9 s or 12 s it reads rank 1 *farther* than rank 0 (QA). The
 * turret set's mean **age** is the same claim without the artifact, and is what
 * that case measures instead.
 *
 * **The board spot is derived from `grid.ts`, not written down.** The five
 * sibling §4 liveness files used to hardcode `10,10` and a build tile at
 * `11,10`, and would have broken together on the terrain epic; `c014` has
 * since moved them onto a shared probe (`tests/class-board.ts`). This file
 * needs no build tile at all, so it stays on its own derived centre rather
 * than importing a build spot it would never use.
 */
import { describe, expect, it } from 'vitest';

import {
  active2CdrFactor,
  tickClassCharge,
  updateClassSummons,
  useClassActive,
  useClassActive2,
} from '../src/sim/classes';
import { loadContent, type ClassEffect, type SkillCardDef } from '../src/sim/content';
import { GRID_H, GRID_W } from '../src/sim/grid';
import { active2CdrBonus } from '../src/sim/progression';
import { BASE } from '../src/sim/stats';
import { updateWarden } from '../src/sim/run';
import { emptyInput, type TickInput } from '../src/sim/types';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const content = loadContent();

const DT = 1 / 60;

/** Well inside the board in every direction, and derived — see the header. */
const WX = Math.floor(GRID_W / 2);
const WY = Math.floor(GRID_H / 2);

/** Every aimed cast points 2 tiles east, inside every authored radius in the game (c007's convention). */
const AX = WX + 2;
const AY = WY;

/**
 * How many of the class's own cooldowns a ladder window is worth, *before* the
 * card's own `perRank` is taken into account. See `cadencesFor`.
 */
const WINDOW_CADENCES = 8;

/**
 * The hard ceiling on that widening. `cadencesFor` scales as `2 / perRank`, and
 * `perRank` is a `/data` number with no positivity or floor constraint in
 * `SkillCardSchema` — so `perRank: 0` made the window `Infinity`, and a
 * synchronous `for` loop of `Infinity` ticks **hung the worker forever** rather
 * than failing: vitest's `testTimeout` cannot interrupt a synchronous loop (QA,
 * reproduced three times, one of them a 25-minute stall). `perRank: 0.001` was
 * the same root cause in its survivable form, turning a 366 ms file into
 * minutes. A test file must fail on bad `/data`, never hang on it.
 */
const MAX_CADENCES = 64;

type Ranks = Record<string, number>;

const CLASS_KEYS = content.classes.classes.map((c) => c.key);

/** The one `active2_cdr` card `/data` authors for this class. */
function cdrCard(classKey: string): SkillCardDef {
  const own = (content.boons.skillCards[classKey] ?? []).filter((c) => c.effect === 'active2_cdr');
  expect(own.length, `${classKey} should author exactly one active2_cdr card`).toBe(1);
  return own[0];
}

/** The one `class_line` card, which for the Engineer is the cap this deviation turns on. */
function lineCard(classKey: string): SkillCardDef {
  const own = (content.boons.skillCards[classKey] ?? []).filter((c) => c.effect === 'class_line');
  expect(own.length, `${classKey} should author exactly one class_line card`).toBe(1);
  return own[0];
}

function active2(classKey: string): ClassEffect {
  return content.classByKey.get(classKey)!.active2;
}

/**
 * How long this class's Active2 summon lives. Two `/data` field names, because
 * the two summoning Active2s are authored differently: Pop Turret is a summon
 * proper (`summonDurationSeconds`), Recall Totem is a standing aura
 * (`totemDurationSeconds`). `0` for the ten Active2s that summon nothing.
 */
function summonLifetime(classKey: string): number {
  const eff = active2(classKey);
  return eff.summonDurationSeconds ?? eff.totemDurationSeconds ?? 0;
}

/**
 * The gate `/data` actually puts on this class's Active2, and the field a cast
 * writes its cost into. `maxCharges > 1` (Time Lord alone today) is ammo-gated
 * and pays into `active2AmmoCooldown`; everything else pays into
 * `active2Cooldown`. Read off `/data` rather than restated, so a kit that
 * gains or loses charges is measured through its new gate, not its old one.
 */
function gateOf(classKey: string): { seconds: number; field: 'active2Cooldown' | 'active2AmmoCooldown' } {
  const eff = active2(classKey);
  return (eff.maxCharges ?? 1) > 1
    ? { seconds: eff.rechargeSeconds ?? 0, field: 'active2AmmoCooldown' }
    : { seconds: eff.cooldownSeconds, field: 'active2Cooldown' };
}

/**
 * How many of the class's own cooldowns the ladder window must span for one
 * rank of the card to be worth a whole extra cast.
 *
 * `WINDOW_CADENCES` alone is scale-invariant under a *cooldown* retune (8 s or
 * 80 s both read 8 -> 11 -> 16 casts) but not under a `perRank` one: casts land
 * at `floor(n / (1 - perRank * rank))`, which ties at rank 0 -> 1 as soon as
 * `perRank < 1/(n+1)`. A ⚖ nerf from 25 % to 10 % would read `8 -> 8 -> 10`
 * and the ladder's message would blame the card rather than the window (code
 * review). `ceil(2 / perRank)` is the window that always separates them, and
 * the guard below re-derives the separation instead of trusting the algebra.
 *
 * Both ends are bounded, because `perRank` is unconstrained `/data`: a
 * non-positive one is refused outright (it would divide to `Infinity` and hang
 * the worker) and the widening is clamped to `MAX_CADENCES`, past which the
 * ladder simply fails and names the card. See `MAX_CADENCES`.
 */
function cadencesFor(card: SkillCardDef): number {
  // Kept total rather than assertive: `describe` bodies call this, so throwing
  // here would abort collection and take the other 48 cases down with it. A
  // non-positive `perRank` falls through to the ceiling and is *reported* by
  // the window case below, which fails as a test and names the card.
  const wanted = card.perRank > 0 ? Math.ceil(2 / card.perRank) : MAX_CADENCES;
  return Math.min(MAX_CADENCES, Math.max(WINDOW_CADENCES, wanted));
}

/** The window this class needs for its ladder to have room to separate. */
function windowFor(classKey: string): number {
  return gateOf(classKey).seconds * cadencesFor(cdrCard(classKey));
}

/**
 * A world with the character's basic attack parked (the p6b/c005/c006/c016
 * convention) so nothing but the Active under test can move an observable.
 */
function cdrWorld(classKey: string, ranks: Ranks, statCdr = 0): World {
  const w = new World(cfg({ classKey }), content);
  w.gold = 1e6;
  w.warden.attackCooldown = 1e9;
  w.warden.x = WX;
  w.warden.y = WY;
  w.skillCardRanks = { ...ranks };
  if (statCdr !== 0) {
    // c020's lever: the *general* `cdr` stat, granted the way a boon, a tree
    // node or an equipment affix would grant it — through `Stats`, not through
    // a `/data` row invented for the test. `grep '"cdr"' data/*.json` finds no
    // row granting it today, which is precisely why nothing was watching the
    // term until now.
    w.stats.addAll('test:cdr', { cdr: statCdr });
    w.recomputeDerived();
  }
  // c019's rows measure one lever and say so; c020's say which two. The
  // default `statCdr = 0` keeps c019's original precondition verbatim — no
  // shipped content grants `cdr`, so those rows still measure the card alone —
  // and the reason is kept in the message rather than lost to the refactor.
  expect(
    w.derived.cdr,
    statCdr === 0
      ? `${classKey}: the general cdr stat must be 0 or this file measures two levers`
      : `${classKey}: derived.cdr is ${w.derived.cdr}, not the ${statCdr} this world asked for`,
  ).toBeCloseTo(statCdr, 10);
  return w;
}

function idle(over: Partial<TickInput> = {}): TickInput {
  return { ...emptyInput(), ...over };
}

/**
 * Holds a `charge_*` Active1 to its cap and releases it, at the real 60 Hz
 * (c006's `chargeFor`). Returns whether the release actually billed, so the
 * slot-scoping case can treat both Active1 paths the same way.
 */
function chargeAndRelease(w: World, capSeconds: number): boolean {
  const c = w.content.classByKey.get(w.cfg.classKey)!;
  const aim = { aimX: AX, aimY: AY };
  for (let t = 0; t < Math.round((capSeconds + 1) * 60); t++) {
    tickClassCharge(w, c, idle({ ...aim, active1Held: true }), DT);
  }
  tickClassCharge(w, c, idle({ ...aim, active1Held: false }), DT);
  return w.warden.active1Cooldown > 0;
}

type SpamOptions = {
  /**
   * Count live summons of this kind per tick, and their ages. Off by default —
   * only the deviation block needs it.
   */
  trackKind?: string;
  /** Record the peak live count of *every* summon kind, whatever it is. */
  census?: boolean;
};

type SpamResult = {
  casts: number;
  /** Live `trackKind` summons, one entry per tick. Empty unless `trackKind` was asked for. */
  liveByTick: number[];
  /** Fraction of ticks with at least one live `trackKind` summon. */
  uptime: number;
  /**
   * Mean age of the live `trackKind` summons, over every (tick, summon) pair.
   * `duration - remaining`, so it is "how long ago was this one placed".
   */
  meanAge: number;
  /** Peak live count per summon kind seen at any tick. `census` only. */
  peakByKind: Record<string, number>;
};

/**
 * Spams Active2 every tick for `seconds` and reports what happened. Nothing is
 * force-reset — the cooldown is ticked by the real `updateWarden` and summons
 * expire through the real `updateClassSummons`, which is what separates a
 * cadence measurement from `class-line-bonus`'s deliberate cooldown bypass.
 */
function spamActive2(
  classKey: string,
  ranks: Ranks,
  seconds: number,
  opts: SpamOptions = {},
  statCdr = 0,
): SpamResult {
  const w = cdrWorld(classKey, ranks, statCdr);
  const life = summonLifetime(classKey);
  let casts = 0;
  let ageSum = 0;
  let agePairs = 0;
  let aliveTicks = 0;
  const liveByTick: number[] = [];
  const peakByKind: Record<string, number> = {};
  const ticks = Math.round(seconds * 60);
  expect(Number.isFinite(ticks), `${classKey}: the harness window is not finite`).toBe(true);
  for (let t = 0; t < ticks; t++) {
    if (useClassActive2(w, AX, AY)) casts++;
    updateWarden(w, idle(), DT);
    updateClassSummons(w, DT);
    // See the header: four Active2s are dashes, and only the parked Warden
    // makes the three worlds of a row otherwise identical.
    w.warden.x = WX;
    w.warden.y = WY;
    if (opts.census) {
      const seen: Record<string, number> = {};
      for (const s of w.classSummons) seen[s.kind] = (seen[s.kind] ?? 0) + 1;
      for (const [k, n] of Object.entries(seen)) peakByKind[k] = Math.max(peakByKind[k] ?? 0, n);
    }
    if (opts.trackKind !== undefined) {
      let live = 0;
      for (const s of w.classSummons) {
        if (s.kind !== opts.trackKind) continue;
        live++;
        ageSum += life - s.remaining;
        agePairs++;
      }
      liveByTick.push(live);
      if (live > 0) aliveTicks++;
    }
  }
  return {
    casts,
    liveByTick,
    uptime: liveByTick.length > 0 ? aliveTicks / liveByTick.length : NaN,
    meanAge: agePairs > 0 ? ageSum / agePairs : NaN,
    peakByKind,
  };
}

/** Casts once into a fresh world and reads back what that cast cost. */
function costOfOneCast(classKey: string, ranks: Ranks, statCdr = 0): number {
  const w = cdrWorld(classKey, ranks, statCdr);
  const field = gateOf(classKey).field;
  // The ammo branch only writes its cost `if (active2AmmoCooldown <= 0)`, so a
  // fresh world that ever seeded that field would make this read a stale value
  // that still passes at rank 0 (code review). Assert the zero it depends on.
  expect(w.warden[field], `${classKey}: ${field} must start at 0 for this to measure the cast`).toBe(0);
  expect(useClassActive2(w, AX, AY), `${classKey}: the very first cast of a fresh world must land`).toBe(true);
  return w.warden[field];
}

/** Every *other* class's `active2_cdr` card at max rank — the key-leak probe. */
function foreignRanks(classKey: string): Ranks {
  const r: Ranks = {};
  for (const k of CLASS_KEYS) {
    if (k === classKey) continue;
    const card = cdrCard(k);
    r[card.key] = card.maxRank;
  }
  return r;
}

/* --------------------------------------------------- the twelve cast ladders */

describe("c019 — every active2_cdr card raises its own class's cast rate", () => {
  it('all twelve classes are covered, and each authors exactly one active2_cdr card', () => {
    expect(CLASS_KEYS.length).toBe(12);
    for (const k of CLASS_KEYS) expect(cdrCard(k).maxRank, `${k} cdr maxRank`).toBeGreaterThanOrEqual(2);
  });

  /**
   * Every window this file will spin a `for` loop over, checked **before** any
   * of them runs. `SkillCardSchema` puts no positivity or floor constraint on
   * `perRank` (`content.ts`), and `perRank: 0` used to make `cadencesFor`
   * divide to `Infinity`, `windowFor` return `Infinity` seconds, and the
   * synchronous tick loop run forever — vitest's `testTimeout` cannot interrupt
   * a synchronous loop, so the worker hung rather than failing (QA, three
   * reproductions, one a 25-minute stall). A test file must fail on bad
   * `/data`, never hang on it. The loader would be the better home for this
   * rule (architecture rule 4) and `src/sim/content.ts` is out of this lane's
   * Scope — logged for the main lane in BACKLOG-CONTENT.md.
   */
  it('every class window is a finite, bounded number of ticks', () => {
    for (const k of CLASS_KEYS) {
      const card = cdrCard(k);
      expect(
        card.perRank,
        `${card.key}: /data authors perRank ${card.perRank}; no window can separate the ranks of a card worth nothing`,
      ).toBeGreaterThan(0);
      const seconds = windowFor(k);
      expect(Number.isFinite(seconds), `${k}: window is ${seconds}s`).toBe(true);
      expect(cadencesFor(card), `${k}: window is unbounded`).toBeLessThanOrEqual(MAX_CADENCES);
    }
  });

  for (const classKey of CLASS_KEYS) {
    const card = cdrCard(classKey);

    it(`${classKey} ${card.key}: strictly more casts land at rank 1, and again at rank 2`, () => {
      const cadences = cadencesFor(card);
      // The window is checked for separation *before* the ladder is believed,
      // so a `perRank` retune blames the harness rather than the card.
      expect(
        Math.floor(cadences / (1 - card.perRank)),
        `harness window for ${classKey} cannot separate rank 0 from rank 1 at perRank ${card.perRank} — a harness shortfall, not a dead card`,
      ).toBeGreaterThan(cadences);

      const seconds = windowFor(classKey);
      const casts = [0, 1, 2].map((n) => spamActive2(classKey, n === 0 ? {} : { [card.key]: n }, seconds).casts);
      expect(
        casts[0],
        `harness window for ${classKey} was too short (${seconds}s produced ${casts[0]} casts) — a harness shortfall, not a dead card`,
      ).toBeGreaterThanOrEqual(2);
      expect(casts[1], `${card.key} rank 0 -> 1 landed no extra cast: ${casts.join(' -> ')}`).toBeGreaterThan(casts[0]);
      expect(casts[2], `${card.key} rank 1 -> 2 landed no extra cast: ${casts.join(' -> ')}`).toBeGreaterThan(casts[1]);
    });

    it(`${classKey} ${card.key}: the cast's cost is the authored /data figure, cut by perRank per rank`, () => {
      const authored = gateOf(classKey).seconds;
      expect(authored, `${classKey}: /data authors no Active2 gate to measure`).toBeGreaterThan(0);
      // `active2CdrFactor` floors the multiplier at 0.05; the tie below is the
      // unfloored formula, so say out loud that the floor is not in play.
      expect(
        card.perRank * card.maxRank,
        `${classKey}: the card can now reach active2CdrFactor's 0.05 floor — the tie below is the unfloored formula`,
      ).toBeLessThanOrEqual(0.95);
      for (const n of [0, 1, 2]) {
        const cost = costOfOneCast(classKey, n === 0 ? {} : { [card.key]: n });
        expect(cost, `${card.key} rank ${n} cost`).toBeCloseTo(authored * (1 - card.perRank * n), 6);
      }
    });

    it(`${classKey} ${card.key}: every other class's cdr card at max rank changes nothing`, () => {
      const seconds = windowFor(classKey);
      expect(spamActive2(classKey, foreignRanks(classKey), seconds).casts).toBe(
        spamActive2(classKey, {}, seconds).casts,
      );
    });
  }

  /**
   * The card names Active**2**, and the class-scoping probe above only proves
   * it does not leak across *classes*. A copy-paste applying
   * `active2CdrFactor` inside `useClassActive` would leave every case in this
   * file green while silently discounting the other Active too (code review),
   * and this file is the natural home for that card's blast radius.
   */
  it("the discount is slot-scoped: no cdr rank touches any class's Active1 cost", () => {
    // Both Active1 cost fields, summed: Time Lord's `time_mark` is
    // `maxCharges`-gated and bills `active1AmmoCooldown`, so reading only the
    // cooldown would let a leak into *its* slot pass unseen.
    const billed = (w: World) => w.warden.active1Cooldown + w.warden.active1AmmoCooldown;
    let measured = 0;
    for (const classKey of CLASS_KEYS) {
      const card = cdrCard(classKey);
      const charge = content.classByKey.get(classKey)!.active1.chargeCapSeconds;
      const readings = [0, 2].map((n) => {
        const w = cdrWorld(classKey, n === 0 ? {} : { [card.key]: n });
        // The two `charge_*` Active1s never reach `useClassActive` — they are
        // held and released through `tickClassCharge`, which has a cooldown
        // write of its own. A leak into *that* write survived the first draft
        // of this case (self-mutation), so both paths are driven here.
        const landed = charge === undefined ? useClassActive(w, AX, AY) : chargeAndRelease(w, charge);
        return { landed, cost: billed(w) };
      });
      expect(readings[1].landed, `${classKey}: Active1 landed differently at cdr rank 2`).toBe(readings[0].landed);
      expect(
        readings[1].cost,
        `${classKey}: cdr rank 2 moved Active1's cost ${readings[0].cost} -> ${readings[1].cost}`,
      ).toBeCloseTo(readings[0].cost, 9);
      if (readings[0].cost > 0) measured++;
    }
    // Not covered, and said rather than implied: `classes.ts` has a *third*
    // Active1 cooldown write, in `fireDashSlash`, where a Swordsman who dashes
    // mid-charge merges Circle Slash into Dash Slash and bills Active1 there.
    // Reaching it needs a charge and a dash in the same tick, which is the
    // Swordsman kit's business rather than this card's; a leak into that one
    // line alone would survive this case (self-mutation).
    //
    // Every one of the twelve must have billed something, or this case has
    // quietly become vacuous for the classes it did not reach.
    expect(measured, 'a class billed no Active1 cost at all, so it proves nothing here').toBe(CLASS_KEYS.length);
  });
});

/* --------------------------------------------- the filed deviation (c019 (b)) */

/**
 * The invariant that decides whether a summon cap binds the *count*: how many
 * casts land inside one summon's own lifetime. `spawnClassSummon` evicts the
 * oldest summon once `cap` are live, so a summon that outlives a full lap of
 * the cap (`lapsPerLife >= cap`) is always replaced before it can expire, the
 * board never dips, and cooldown reduction has nowhere to put another one.
 *
 * This is deliberately **not** `c018`'s `cadenceCeiling`, which counts the t=0
 * cast on top of a whole duration window and so reads one higher. That formula
 * answers c018's question ("can this cadence ever *reach* the cap?"); this one
 * answers c019's ("does it *hold* the cap?"). Shipped data separates them:
 * Pop Turret at cap rank 2 reaches 4 and holds only 3, which is exactly the
 * exception at the bottom of this block — and using c018's formula here would
 * have let the tripwire stay green after the disposition it explains had died
 * (code review).
 *
 * It does keep c018's `- DT`, and for c018's exact reason. `Run.step` casts
 * before `updateClassSummons` expires, so at an exact multiple the summon is
 * filtered at the end of the tick *before* the cast that would have replaced
 * it, and the board dips for one tick. Without the epsilon, cooldown 5.0 s
 * against a 10 s duration reads "2 laps, the cap of 2 holds" while the real run
 * dips to 1 — the guard would stay green and the flat case would fail with a
 * message about a dip instead of about the cooldown (QA, reproduced twice;
 * 4.9 s does not dip). c018's own Log warns that 5.0 s is exactly the round
 * number the next ⚖ cooldown pass reaches for.
 */
function lapsPerLife(eff: ClassEffect): number {
  return Math.floor(((eff.summonDurationSeconds ?? 0) - DT) / eff.cooldownSeconds);
}

/**
 * Engineer *Pop Turret Cooldown*, the row QA filed. The cases below are the
 * whole disposition: the count does **not** move, the card is **not** dead,
 * what it buys instead is fill speed and relocation, the cause is named so a
 * retune that revives the count turns this block red — and the last case is
 * the exception that stops the claim from overreaching.
 */
describe('c019 — named deviation: at a cap it holds, Pop Turret Cooldown buys speed, not turrets', () => {
  const classKey = 'engineer';
  const card = cdrCard(classKey);
  const capCard = lineCard(classKey);
  const eff = active2(classKey);
  const kind = 'engineer_turret';
  const cap = eff.summonCap ?? 0;
  /** The Animist's totem, the second capped Active2 summon — see the census below. */
  const TOTEM_KIND = 'animist_totem';
  /** Long enough to fill from empty at the *slowest* rank and then hold. */
  const seconds = eff.cooldownSeconds * (cap + cadencesFor(card));

  function live(cdrRank: number, extra: Ranks = {}, opts: SpamOptions = {}) {
    const ranks: Ranks = { ...extra };
    if (cdrRank > 0) ranks[card.key] = cdrRank;
    return spamActive2(classKey, ranks, seconds, { trackKind: kind, ...opts });
  }

  /**
   * The precondition every count/fill/age case below shares: this whole block
   * describes what a cooldown card buys **at a cap that holds**, so when the
   * cap stops holding each of them must fail naming that, not with a marginal
   * reading of its own observable. Without it, a cooldown retune to 12 s made
   * the age case report `5.00 -> 4.92 -> 4.94` — true, useless, and blaming the
   * card (QA's bug 5 repro, re-run on the fix).
   */
  function requireCapHolds() {
    expect(
      lapsPerLife(eff),
      `Pop Turret no longer holds its cap (${lapsPerLife(eff)} laps per turret life against a cap of ${cap}) — re-measure the disposition`,
    ).toBeGreaterThanOrEqual(cap);
  }

  /** c018's formula: can the cadence ever *reach* `target`, whether or not it then holds it? */
  function cadenceReaches(target: number) {
    const ceiling = Math.floor(((eff.summonDurationSeconds ?? 0) - DT) / eff.cooldownSeconds) + 1;
    expect(
      ceiling,
      `Pop Turret's cadence can no longer reach ${target} live turrets (ceiling ${ceiling}) — c018 has regressed, and this case cannot be measured until it is fixed`,
    ).toBeGreaterThanOrEqual(target);
  }

  /** Steady state: sampled from the tick `target` is first reached, so the fill transient is excluded. */
  function steady(r: SpamResult, target: number, label: string) {
    const first = r.liveByTick.indexOf(target);
    expect(first, `${label} never reached ${target} live ${kind}s`).toBeGreaterThanOrEqual(0);
    const tail = r.liveByTick.slice(first);
    return { first, min: Math.min(...tail), mean: tail.reduce((a, b) => a + b, 0) / tail.length };
  }

  /**
   * The tripwire that says how many rows this deviation needs, and it is
   * **behavioural, not `/data`-scoped**. The first draft filtered on
   * `active2.summonCap !== undefined` and concluded "exactly one class" — which
   * was already false about the game: Recall Totem's cap of 1 is enforced in
   * *code* (`fireRecallTotem` clears the previous totem, `classes.ts`) and is
   * invisible to any `/data` filter. QA found the second row that way, and
   * proved the old tripwire could not: deleting the totem's cap left all 45
   * green. Spamming every Active2 and looking at what is actually on the board
   * catches both a `/data` cap and a code one.
   */
  it('the summon census: only two Active2s put anything on the board, and both are pinned below', () => {
    const census: Record<string, Record<string, number>> = {};
    for (const k of CLASS_KEYS) {
      // At the class's own cdr card at max rank: the fastest cadence `/data`
      // allows is the arm most likely to overflow a cap, so it is the arm a
      // census should look at.
      const fastest = { [cdrCard(k).key]: cdrCard(k).maxRank };
      const peaks = spamActive2(k, fastest, windowFor(k), { census: true }).peakByKind;
      if (Object.keys(peaks).length > 0) census[k] = peaks;
    }
    // The *set* of summoning Active2s and the cap each is held under. Not the
    // exact peak: whether a cap is actually reached is c018's question and is
    // pinned by the flat-at-cap case below, so asserting it here too would make
    // a cooldown retune fail with "a summon this file does not know about"
    // (QA's bug 5 repro at 12 s). Caps come from where each is really enforced
    // — `/data` for the turret, `classes.ts` for the totem.
    const declared: Record<string, Record<string, number>> = {
      [classKey]: { [kind]: cap },
      animist: { [TOTEM_KIND]: 1 },
    };
    expect(
      Object.keys(census).sort(),
      'an Active2 summon this file does not know about — it needs a deviation row, or a cdr card that silently does nothing',
    ).toEqual(Object.keys(declared).sort());
    for (const [k, peaks] of Object.entries(census)) {
      expect(Object.keys(peaks).sort(), `${k} summons a kind this file does not know about`).toEqual(
        Object.keys(declared[k]).sort(),
      );
      for (const [sk, peak] of Object.entries(peaks)) {
        expect(peak, `${k} put ${peak} ${sk}s on the board against a cap of ${declared[k][sk]}`).toBeLessThanOrEqual(
          declared[k][sk],
        );
      }
    }
  });

  it('the cap holds at cap rank 0: a turret outlives a full lap of it, so there is no room above it', () => {
    // The cause, stated as the invariant and measured against `/data`. The day
    // a retune drops this below `cap`, cdr starts buying turrets again and this
    // whole deviation block should be deleted rather than re-explained.
    requireCapHolds();
  });

  /**
   * The epsilon in `lapsPerLife`, pinned where it bites rather than only in a
   * comment. The whole deviation is built on that guard firing *first*, so the
   * boundary it is wrong at without `- DT` is worth one case of its own.
   */
  it('lapsPerLife counts the one-tick dip at an exact multiple: a 10 s summon on a 5 s cooldown holds 1 lap, not 2', () => {
    const at = (duration: number, cooldown: number) =>
      lapsPerLife({ ...eff, summonDurationSeconds: duration, cooldownSeconds: cooldown });
    expect(at(10, 5), 'the exact multiple must round down — the summon dies a tick before its replacement').toBe(1);
    expect(at(10, 4.9), 'just under the multiple genuinely holds 2 laps').toBe(2);
    expect(at(eff.summonDurationSeconds ?? 0, eff.cooldownSeconds), 'shipped').toBe(lapsPerLife(eff));
  });

  it('at cap rank 0 the live turret count is flat across cdr ranks — and flat at the authored cap', () => {
    requireCapHolds();
    const readings = [0, 1, 2].map((n) => steady(live(n), cap, `cdr rank ${n}`));
    // Equality against `/data`, not merely "did not move": the cap being the
    // thing it is flat *at* is half the claim (c018's lesson). `min` as well as
    // `mean`, so "flat" cannot be a mean hiding a dip.
    for (const n of [0, 1, 2]) {
      expect(readings[n].min, `cdr rank ${n} dipped below the cap in steady state`).toBe(cap);
      expect(readings[n].mean, `cdr rank ${n} steady-state mean`).toBeCloseTo(cap, 6);
    }
  });

  it('the card is nonetheless live: the same three worlds land strictly more casts', () => {
    const casts = [0, 1, 2].map((n) => live(n).casts);
    expect(casts[1], `Pop Turret Cooldown rank 0 -> 1: ${casts.join(' -> ')}`).toBeGreaterThan(casts[0]);
    expect(casts[2], `Pop Turret Cooldown rank 1 -> 2: ${casts.join(' -> ')}`).toBeGreaterThan(casts[1]);
  });

  it('what it buys, first: the board reaches the cap sooner from an empty board', () => {
    requireCapHolds();
    const ticksToCap = [0, 1, 2].map((n) => steady(live(n), cap, `cdr rank ${n}`).first);
    expect(
      ticksToCap[1],
      `Pop Turret Cooldown rank 0 -> 1 did not shorten the fill: ${ticksToCap.join(' -> ')} ticks`,
    ).toBeLessThan(ticksToCap[0]);
    expect(
      ticksToCap[2],
      `Pop Turret Cooldown rank 1 -> 2 did not shorten the fill: ${ticksToCap.join(' -> ')} ticks`,
    ).toBeLessThan(ticksToCap[1]);
  });

  /**
   * The second half of the remaining value, and the one the count case is
   * structurally unable to see: **the set is the same size and a different
   * set**. Every cast re-places a turret at the Warden's feet
   * (`spawnClassSummon`, called with `wd.x, wd.y`), so a younger board is a
   * board placed at more recent Warden positions — which for a *moving*
   * Engineer, i.e. every Engineer in a VS Night, is turrets that keep up with
   * her.
   *
   * The observable is the mean **age** of the live turrets, not their distance
   * from the Warden. Distance was the first draft and it is a patrol artifact,
   * not a property (QA): the mean depends on how the cast period beats against
   * the walk, and at cooldown 4.9 s or 12 s it reads rank 1 *farther* than rank
   * 0 (`5.44 -> 5.48 -> 4.57`, `9.86 -> 10.01 -> 7.87`) — a ⚖ cooldown pass
   * would read that as "the card stopped relocating turrets", which is false.
   * Age is what the mechanism actually owns, is path-independent, and is
   * monotone at every one of those cooldowns (`2.94 -> 2.22 -> 1.49` shipped,
   * `4.89 -> 3.70 -> 2.48` at 5 s).
   */
  it('what it buys, second: the same-sized turret set is strictly younger at each rank', () => {
    requireCapHolds();
    const ages = [0, 1, 2].map((n) => live(n).meanAge);
    for (const [n, a] of ages.entries()) expect(a, `cdr rank ${n}: no live turret to age`).not.toBeNaN();
    expect(
      ages[1],
      `rank 0 -> 1 did not refresh the turret set: ${ages.map((a) => a.toFixed(2)).join(' -> ')}s mean age`,
    ).toBeLessThan(ages[0]);
    expect(
      ages[2],
      `rank 1 -> 2 did not refresh the turret set: ${ages.map((a) => a.toFixed(2)).join(' -> ')}s mean age`,
    ).toBeLessThan(ages[1]);
  });

  /**
   * The exception that keeps the disposition honest, and c019's own "the card
   * is *not* wholly dead — rank 1 at cap rank 2 is worth +0.67 mean turrets".
   * Measured across the whole grid at 60 s:
   *
   *   | cap rank  | steady-state live turrets by cdr rank 0/1/2 |
   *   | 0 (cap 2) | 2.00 -> 2.00 -> 2.00                        |
   *   | 1 (cap 3) | 3.00 -> 3.00 -> 3.00                        |
   *   | 2 (cap 4) | **3.33 -> 4.00 -> 4.00**                    |
   *
   * The cap binds the count exactly where `lapsPerLife >= cap`. At the **top**
   * cap rank it does not: a turret outlives only 3 laps of a 4-turret cap, so
   * the board oscillates between 3 and 4 at cdr rank 0 and the first rank of
   * cooldown is what pins it at 4. The second still buys nothing. Pinning only
   * the flat rows would overstate the deviation into "this card never buys
   * turrets", which is false.
   */
  it('the deviation is not "never": at the top cap rank, where the cap stops holding, cdr rank 1 does buy count', () => {
    const topCap = cap + capCard.maxRank * capCard.perRank;
    // The precondition that makes this row the exception, and the mirror of
    // the "cap holds" case above. A retune that lets a turret outlive a lap of
    // the *top* cap makes this row behave like the flat ones and turns this
    // case red, asking for the whole grid to be re-measured.
    expect(
      lapsPerLife(eff),
      `the top cap rank now holds its cap too (${lapsPerLife(eff)} laps against ${topCap}) — re-measure the whole deviation`,
    ).toBeLessThan(topCap);

    cadenceReaches(topCap);

    const top: Ranks = { [capCard.key]: capCard.maxRank };
    const means = [0, 1, 2].map((n) => steady(live(n, top), topCap, `cdr rank ${n} at the top cap`).mean);
    expect(
      means[1],
      `cdr rank 0 -> 1 bought no turrets at the top cap rank: ${means.map((m) => m.toFixed(2)).join(' -> ')}`,
    ).toBeGreaterThan(means[0]);
    expect(means[1], 'rank 1 should already pin the board at the top cap').toBeCloseTo(topCap, 6);
    expect(means[2], 'rank 2 has nothing left to buy above the cap').toBeCloseTo(means[1], 6);
  });
});

/**
 * **The second named deviation, and it is the one c019's last sentence was
 * asking about.** c019 closed with "the same question applies to the other
 * eleven `active2_cdr` cards"; QA answered it by measuring all twelve Active2s
 * on the board rather than in `/data`, and found Animist *Recall Totem
 * Cooldown* has the identical dead corner for an entirely different reason.
 *
 * Recall Totem's cap is **1, enforced in code** — `fireRecallTotem` clears the
 * previous totem before planting the next (`classes.ts`) — so no `/data` field
 * says "cap", and the count can never move at any rank. What the card can move
 * is **uptime**: `/data` authors a 15 s totem on a 20 s cooldown, so a rank-0
 * Animist has no totem for a quarter of the fight. Measured over 12 cadences:
 *
 *   | cdr rank | casts | peak totems | uptime     |
 *   | 0        | 12    | 1           | 0.7492     |
 *   | 1        | 16    | 1           | **0.9989** |
 *   | 2        | 24    | 1           | 1.0000     |
 *
 * One rank buys a quarter of the fight back; the second buys **one tenth of a
 * percent**, because the first already covers the whole cooldown. Its remaining
 * value at rank 2 is the same as the Engineer's: not count, not uptime, but a
 * totem re-planted at the Warden's current position more often.
 *
 * The 0.9989 rather than 1.0000 at rank 1 is `lapsPerLife`'s epsilon again from
 * the other side: a −25 % cut of 20 s is exactly 15 s, exactly the totem's own
 * duration, so it lapses for one tick per cycle. c018's exact-multiple trap,
 * shipped and live, costing nothing.
 */
describe('c019 — named deviation 2: Recall Totem Cooldown buys uptime, and only its first rank', () => {
  const classKey = 'animist';
  const card = cdrCard(classKey);
  const eff = active2(classKey);
  const kind = 'animist_totem';
  const life = summonLifetime(classKey);
  const seconds = eff.cooldownSeconds * cadencesFor(card);

  function run(cdrRank: number) {
    return spamActive2(classKey, cdrRank > 0 ? { [card.key]: cdrRank } : {}, seconds, { trackKind: kind });
  }

  it('the cap is 1 and lives in code, not /data — so no cdr rank can ever buy a second totem', () => {
    expect(eff.summonCap, 'Recall Totem now authors a /data cap; the census and this row both need re-reading').toBeUndefined();
    for (const n of [0, 1, 2]) {
      expect(Math.max(...run(n).liveByTick), `cdr rank ${n} put more than one totem on the board`).toBe(1);
    }
  });

  it('what it buys is uptime, and /data says one rank is already enough to cover the cooldown', () => {
    // The precondition, first, so a cooldown/duration retune names itself
    // rather than letting the saturation claim below blame the card.
    expect(
      life,
      `a rank-1 totem (${(eff.cooldownSeconds * (1 - card.perRank)).toFixed(2)}s cooldown) no longer covers its own gap at ${life}s — re-measure this row`,
    ).toBeGreaterThanOrEqual(eff.cooldownSeconds * (1 - card.perRank));
    // ...and that rank 0 leaves a real gap, or there is nothing to buy at all.
    expect(life, 'a rank-0 totem already covers its own cooldown; this row has no gap to measure').toBeLessThan(
      eff.cooldownSeconds,
    );

    const uptime = [0, 1, 2].map((n) => run(n).uptime);
    const shown = uptime.map((u) => u.toFixed(4)).join(' -> ');
    // Rank 0 is the authored duty cycle, read straight off `/data`.
    expect(uptime[0], `rank 0 uptime should be duration/cooldown: ${shown}`).toBeCloseTo(life / eff.cooldownSeconds, 2);
    expect(uptime[1], `rank 0 -> 1 bought no uptime: ${shown}`).toBeGreaterThan(uptime[0]);
    // The deviation itself: the second rank buys less than a tenth of what the
    // first did, because the first already closed the gap.
    expect(
      uptime[2] - uptime[1],
      `rank 1 -> 2 is no longer the saturated step this deviation names: ${shown}`,
    ).toBeLessThan((uptime[1] - uptime[0]) / 10);
  });

  it('the card is nonetheless live at every rank: more casts, and a totem re-planted more often', () => {
    const runs = [0, 1, 2].map((n) => run(n));
    const casts = runs.map((r) => r.casts);
    expect(casts[1], `Recall Totem Cooldown rank 0 -> 1: ${casts.join(' -> ')}`).toBeGreaterThan(casts[0]);
    expect(casts[2], `Recall Totem Cooldown rank 1 -> 2: ${casts.join(' -> ')}`).toBeGreaterThan(casts[1]);
    // Age is the observable that still moves at rank 2, the same one the
    // Engineer's row ends on: a younger totem is a totem planted where the
    // Animist is now.
    const ages = runs.map((r) => r.meanAge);
    expect(
      ages[2],
      `rank 1 -> 2 bought nothing at all, not even a fresher totem: ${ages.map((a) => a.toFixed(2)).join(' -> ')}s`,
    ).toBeLessThan(ages[1]);
  });
});

/* ------------------------------------------- c020: the other half of the sum */

/**
 * **c020 — `active2CdrFactor`'s general `cdr` term, which nothing was
 * watching.** Filed by QA on `c019`.
 *
 * `active2CdrFactor` (classes.ts) is one subtraction with two terms:
 *
 * ```ts
 * Math.max(0.05, 1 - w.derived.cdr - active2CdrBonus(w))
 * ```
 *
 * Everything above measures the right-hand term. QA deleted the left one —
 * `Math.max(0.05, 1 - active2CdrBonus(w))` — and **659 tests across the 16
 * most relevant files stayed green**, this file included. It could not have
 * gone red: `cdrWorld` asserts `derived.cdr === 0` as its *precondition*,
 * precisely so c019 measures one lever, which is exactly what leaves the other
 * unwatched.
 *
 * It is harmless today and a live bug the day it is not. `grep '"cdr"'
 * data/*.json` finds no row granting the stat, so no shipped world can tell
 * the two implementations apart. `fb056`'s fifteen new equipment items are the
 * obvious candidate to grant it first, and the failure mode then is silent:
 * Active2 quietly ignoring a stat §2's Cooldown row says applies to it, on a
 * class whose card is already working, so the HUD number and the cast cadence
 * would simply be a little worse than the item promised.
 *
 * **The lever is `Stats`, not `/data`.** Adding a `cdr` row to `/data` to test
 * with would be authoring the very content this file exists to be independent
 * of, and would move `data/vsupgrades.json`'s or `data/tree.json`'s balance
 * with it. `w.stats.addAll('test:cdr', ...)` is the same door every real
 * grantor comes through (`c013`'s convention with `test:area`).
 *
 * **Three claims, in the order a reader needs them.**
 *
 *  1. *The term is live.* The stat alone, with every card at rank 0, cuts the
 *     Active2 gate by exactly its own fraction and lands strictly more casts.
 *  2. *It stacks, rather than replacing.* With both levers up, the cost is
 *     `authored * (1 - cdr - perRank * rank)` — a figure that is neither the
 *     card's own nor the stat's own, so an implementation that took the larger
 *     of the two, or the last one written, fails here rather than passing two
 *     out of three cases.
 *  3. *The 0.05 floor is what catches them together.* Asserted directly on
 *     `active2CdrFactor`, and reported as a **named deviation** — the floor is
 *     not reachable from live `/data` today, by a margin this file computes
 *     rather than states, so the row that proves the floor exists has to drive
 *     `derived.cdr` past `BASE.cdrCap` by hand. `c019`'s convention: never
 *     silence, always a named row.
 */

/** Half the shipped cap, so the exact arithmetic below is never the cap's arithmetic. */
const PROBE_CDR = BASE.cdrCap / 2;

/** Every class's card at max rank, for the stacking rows. */
function ownMaxRank(classKey: string): Ranks {
  const card = cdrCard(classKey);
  return { [card.key]: card.maxRank };
}

describe('c020 — the general cdr stat reaches Active2, and stacks with the card', () => {
  it('the probe fraction is a live, positive one taken from /data, not a number written here', () => {
    expect(BASE.cdrCap, 'data/warden.json authors no cdrCap for the stat to live under').toBeGreaterThan(0);
    expect(PROBE_CDR).toBeGreaterThan(0);
    expect(PROBE_CDR).toBeLessThan(BASE.cdrCap);
  });

  it('the stat is capped by /data, which is what bounds the stacking rows below', () => {
    // Not decoration: the deviation case at the bottom multiplies this cap
    // against the card's own reach, and reports whether the pair can touch the
    // floor. If the cap stops binding, that report is wrong.
    const w = cdrWorld('swordsman', {}, 0);
    w.stats.addAll('test:cdr', { cdr: BASE.cdrCap * 10 });
    w.recomputeDerived();
    expect(w.derived.cdr).toBeCloseTo(BASE.cdrCap, 10);
  });

  for (const classKey of CLASS_KEYS) {
    const card = cdrCard(classKey);

    it(`${classKey}: the cdr stat alone cuts the Active2 gate by its own fraction`, () => {
      const authored = gateOf(classKey).seconds;
      expect(authored, `${classKey}: /data authors no Active2 gate to measure`).toBeGreaterThan(0);
      const plain = costOfOneCast(classKey, {});
      const withStat = costOfOneCast(classKey, {}, PROBE_CDR);
      expect(plain, `${classKey}: rank-0 control`).toBeCloseTo(authored, 6);
      expect(
        withStat,
        `${classKey}: derived.cdr ${PROBE_CDR} did not reach the Active2 gate — this is the c020 bug`,
      ).toBeCloseTo(authored * (1 - PROBE_CDR), 6);
      expect(withStat).toBeLessThan(plain);
    });

    it(`${classKey}: the cdr stat's extra casts compound with the window, at every gate the kit uses`, () => {
      // The billing-cadence observable c019 argues for, applied to the other
      // term: a cost-field readback alone would pass on a `classes.ts` that
      // computed the discount and never spent it.
      //
      // **Why the gap is measured at two windows and not just `> plain`.**
      // QA on c020 found a surviving mutant: `active2CdrFactor` has *three*
      // call sites, and dropping the stat from the third —
      // `tickAmmoRecharge`'s refill (`classes.ts:1752`) — left all 90 tests
      // green. Time Lord is the one kit with `maxCharges > 1`, so its
      // *sustained* cadence is governed by that refill and not by the cast
      // site, while `costOfOneCast` only ever reads the first cast's bill.
      // The mutant still landed one extra cast from the single un-mutated
      // site, which is all `toBeGreaterThan(plain)` ever asked for. A real
      // discount compounds: the correct build measured 9 -> 11 at 80 s and
      // 17 -> 21 at 160 s, while the mutant sat at a flat +1 at both.
      const seconds = windowFor(classKey);
      const gapAt = (w: number) =>
        spamActive2(classKey, {}, w, {}, PROBE_CDR).casts - spamActive2(classKey, {}, w, {}).casts;
      const plain = spamActive2(classKey, {}, seconds).casts;
      expect(plain, `${classKey}: harness window too short (${seconds}s)`).toBeGreaterThanOrEqual(2);

      const near = gapAt(seconds);
      const far = gapAt(seconds * 3);
      expect(near, `${classKey}: cdr ${PROBE_CDR} landed no extra cast at ${seconds}s`).toBeGreaterThan(0);
      expect(
        far,
        `${classKey}: the cdr advantage did not grow with the window (${near} extra casts at ${seconds}s, ` +
          `${far} at ${seconds * 3}s) — a flat gap means some gate this kit uses is ignoring the stat, ` +
          'which is how the tickAmmoRecharge site hid from this file',
      ).toBeGreaterThan(near);
    });

    it(`${classKey} ${card.key}: stat and card stack — the combined cost is neither one alone`, () => {
      const authored = gateOf(classKey).seconds;
      const cardCut = card.perRank * card.maxRank;
      // The unfloored formula is the whole story only while the pair stays
      // clear of `active2CdrFactor`'s floor. Said out loud, as the c019 row
      // above says it for the card alone.
      expect(
        PROBE_CDR + cardCut,
        `${classKey}: the pair now reaches active2CdrFactor's 0.05 floor — the tie below is the unfloored formula`,
      ).toBeLessThanOrEqual(0.95);

      const statOnly = costOfOneCast(classKey, {}, PROBE_CDR);
      const cardOnly = costOfOneCast(classKey, ownMaxRank(classKey));
      const both = costOfOneCast(classKey, ownMaxRank(classKey), PROBE_CDR);

      expect(both, `${classKey}: the two terms do not sum`).toBeCloseTo(authored * (1 - PROBE_CDR - cardCut), 6);
      // The three implementations this rules out, named: taking the larger
      // term, taking the smaller, or letting the last writer win.
      expect(both, `${classKey}: the card replaced the stat rather than stacking`).toBeLessThan(cardOnly);
      expect(both, `${classKey}: the stat replaced the card rather than stacking`).toBeLessThan(statOnly);
    });
  }

  it('the 0.05 floor is what catches the two terms together past 0.95', () => {
    const classKey = 'swordsman';
    const card = cdrCard(classKey);
    const w = cdrWorld(classKey, { [card.key]: card.maxRank });
    // Driven onto `derived` by hand, and only here. `Stats` cannot reach this
    // state: `derive` clamps the stat at `BASE.cdrCap` (asserted above), so the
    // live pair tops out below the floor — see the deviation row. What the
    // floor guards is the *expression*, which has no cap of its own.
    w.derived.cdr = 0.96 - active2CdrBonus(w);
    expect(w.derived.cdr + active2CdrBonus(w), 'the harness did not actually exceed 0.95').toBeGreaterThan(0.95);
    expect(active2CdrFactor(w), 'the sum ran past the floor').toBe(0.05);

    // And the floor is what the cast is billed at, not just what the helper
    // returns — the same distinction every row in this file draws.
    const field = gateOf(classKey).field;
    expect(useClassActive2(w, AX, AY)).toBe(true);
    expect(w.warden[field]).toBeCloseTo(gateOf(classKey).seconds * 0.05, 6);
  });

  it('named deviation: live /data cannot reach the floor, and the margin says by how little', () => {
    // Both halves out of `/data`, so a ⚖ retune of either moves this row rather
    // than letting the pair quietly start clamping. `c005`'s convention: pin
    // the mechanism, not a magnitude.
    const worstCard = Math.max(...CLASS_KEYS.map((k) => cdrCard(k).perRank * cdrCard(k).maxRank));
    const reachable = BASE.cdrCap + worstCard;
    expect(
      reachable,
      `live /data now reaches ${reachable} — the floor is live, and the "unfloored formula" caveats above need re-reading`,
    ).toBeLessThanOrEqual(0.95);
    // Recorded, not asserted as a magnitude: today `0.4 + 0.5 = 0.9`, one
    // 0.05 short. A `cdrCap` 0.4 -> 0.45 or a `perRank` 0.25 -> 0.30 reaches it.
    expect(
      0.95 - reachable,
      `the margin is gone: BASE.cdrCap ${BASE.cdrCap} + the widest card ${worstCard} = ${reachable}, and ` +
        "active2CdrFactor's 0.05 floor now clamps live worlds. Every \"unfloored formula\" caveat above " +
        'needs re-reading, and the floor row below stops being a hand-driven case.',
    ).toBeGreaterThan(0);
  });
});
