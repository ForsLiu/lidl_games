/**
 * c016 (BACKLOG-CONTENT, lane `content`) — **no `class_line` skill-card branch
 * is a silent no-op.** The third §6.3 card of every class, on trial.
 *
 * `c005` put the 24 Actives on trial, `c006` the 12 Passives, `c009` the 12
 * tower-passive rows and `c011` nine passive magnitudes. What none of them
 * watches is the *skill-card* half of the same kits: `c006`'s own header names
 * the gap ("So can the p7a skill-card branches (`classLineBonus`) inside
 * Thousand Cuts, Frost Touch and Spreading Plague") and it was never filed
 * until c016. It is also bigger than those three — `classLineBonus` is read at
 * **twelve** call sites, exactly one per class, spread over three files:
 *
 *   | class         | card              | call site                           |
 *   | swordsman     | Deeper Cuts       | `classes.ts` `passiveOnHit`         |
 *   | plaguebringer | Wider Contagion   | `enemies.ts` `drainPlagueTransfers` |
 *   | engineer      | Extra Turret      | `classes.ts` `fireSummonTurret`     |
 *   | pyromancer    | Lingering Flame   | `classes.ts` `useClassActive`       |
 *   | archer        | Deeper Draw       | `classes.ts` `fireDeadeyeDraw`      |
 *   | necromancer   | Deeper Grave      | `classes.ts` `fireRaiseSkeletons`   |
 *   | cryomancer    | Brittle Frost     | `enemies.ts` `applyOnHit`           |
 *   | stormcaller   | Longer Arc        | `classes.ts` `fireChainSurge`       |
 *   | bloodlord     | Deeper Tithe      | `towers.ts` `classTowerDamageMul`   |
 *   | animist       | Kindred Spirits   | `classes.ts` `fireManifestSpirit`   |
 *   | paladin       | Righteous Fury    | `classes.ts` `fireJudgement`        |
 *   | time_lord     | Lingering Stasis  | `classes.ts` `fireTimeLock`         |
 *
 * Every one of those is a bare `+ classLineBonus(w)` inside an expression that
 * is already correct without it, so deleting the term leaves the whole suite
 * green — the card keeps appearing in the level-up offer and keeps doing
 * nothing.
 *
 * **The control is the same card at rank 0**, not another class (c016's
 * acceptance, and a deliberate departure from `c006`, whose control is a
 * control *class*). A rank-gated branch is a claim about one run's own
 * progression: "this class, this world, this scenario, one more rank" is the
 * only comparison that isolates it. Every row therefore builds the identical
 * world three times — rank 0, 1 and 2 (`maxRank` is 2 for all twelve) — and
 * requires the observable to move **strictly** in the card's own direction at
 * each step. Strictly at both steps, not just once: clamping the bonus to a
 * single rank, or paying it only from rank 2, is a real regression that a
 * rank-0-vs-rank-2 check alone would absorb.
 *
 * **No row asserts an authored magnitude** (c005's convention, kept): what is
 * asserted is that the number moved, which way, and — where a row can — that
 * the rank-0 reading equals the `/data` field the mechanism claims to read.
 * Both sides of that last comparison come out of `/data`, so a retune moves
 * them together.
 *
 * **Every scenario size is derived, never a literal** (code review + QA on the
 * first draft, which hard-coded them). A row that measures a cap by casting
 * until the cap binds has to cast *more* times than the cap can ever reach, or
 * a `/data` retune turns the row red with a message blaming the card. Eight of
 * seventeen plausible retunes did exactly that before this pass: `summonCap`
 * 2->6 read `4 -> 4 -> 4` and reported it as a dead branch. Budgets are now
 * `field + maxRank * perRank + slack`, read off `/data` and the card, and any
 * row that still runs out of room says **"harness budget"** in its message
 * rather than accusing the branch.
 *
 * **What a retune may still do.** `freezeHits` <= `maxRank * perRank` makes
 * Brittle Frost's ladder physically flat (`Math.max(1, ...)`, `enemies.ts`),
 * and that row asserts the precondition separately so the failure names the
 * retune. `perRank` itself is **not** pinned: a `classLineBonus` that returned
 * the raw rank and ignored `perRank` entirely keeps eleven of twelve rows
 * green (QA). That is magnitude, which is `c011`'s job for the passives and has
 * no sibling here yet — logged in BACKLOG-CONTENT rather than smuggled in.
 *
 * **The class-scoping half.** Each row re-measures with every one of the other
 * eleven `class_line` keys at max rank and requires its rank-0 reading back
 * exactly. The bug this catches is a **`skillCardRanks` key leak** — a
 * `classLineBonus` that read, say, the largest rank in the record rather than
 * its own card's. (It is *not* the only guard on `skillCard`'s
 * `[w.cfg.classKey]` index: dropping that index makes every class resolve the
 * swordsman's card, which the ladders below catch on their own for 11 of 12
 * rows. QA confirmed both: an index drop fails 23 tests, a leak that spares
 * the ladder fails exactly these 12.)
 *
 * **This file shipped with two named deviations, and both are now fixed** —
 * a card can be live in code and still inert in a real run, and each of these
 * was.
 *
 * **`c017` — Archer *Deeper Draw*, fixed.** `fireDeadeyeDraw` computed
 * `Math.min(pierceCap + classLineBonus(w), 1 + floor(held))` with `held`
 * clamped to `chargeCapSeconds`; shipped data authors `pierceCap 6` beside
 * `chargeCapSeconds 5`, so the right-hand term was 6 at *any* hold and the
 * +2/rank could never bind (QA confirmed no equipment, tree node, boon or
 * modifier touches either field). The tripwire that pinned the flat 6/6/6
 * reading, and the Archer's rebuilt-`/data` ladder beside it, are both gone:
 * the bonus is now added on top of the resolved count
 * (`min(pierceCap, 1 + floor(held)) + classLineBonus(w)`), which binds on
 * shipped numbers and moves nothing at rank 0. `tests/class-deeper-draw.test
 * .ts` is that fix's own regression, and its header carries the reasoning —
 * including why c017's *proposed* fix (unclamping the hold) could not work.
 *
 * **`c018` — fixed too** — Engineer *Extra Turret* and Animist *Kindred
 * Spirits* each raised a summon **cap** the
 * Active's own cast cadence could never reach (Pop Turret 12 s cooldown /
 * 10 s duration, ceiling 1 live turret against a base cap of 2; Manifest
 * 16 s / 20 s, ceiling 2 against a base cap of *3*, so one point of the
 * authored cap was dead before the card was). Filed by QA on c016, fixed in
 * `c018` by `/data` cooldowns alone — 12 -> 3 and 16 -> 4 — since §4.2 authors
 * both durations and both caps but no clause anywhere authors an Active's
 * cooldown. Its tripwire is now a positive regression `describe` at the bottom
 * of this file, and the two rows sit in the ordinary ladder above.
 *
 * **What this file is not.** Liveness, not balance: whether +2 pierce or +30%
 * Wrath is the *right* number is p10r's. It also says nothing about the other
 * two §6.3 cards — `active1_potency` is touched by `tests/act2.test.ts:185`
 * and `tests/p6b-swordsman.test.ts:274-281` (swordsman only), and
 * `active2_cdr`'s only behavioural coverage is a HUD readout in
 * `tests/fb026-bottom-bar.test.ts`; both gaps are logged, neither is c016's.
 *
 * **`active2_cdr`'s gap is now closed, elsewhere**: `c019` put all twelve of
 * those cards on trial in `tests/class-active2-cdr.test.ts`, and its named
 * deviations are the reason two cards in *this* file's `c018` block look
 * livelier than they are — Pop Turret and Recall Totem each summon against a
 * cap their cooldown card cannot raise. Anyone arriving here asking "why is
 * this card inert" should read that file's header next.
 */
import { describe, expect, it } from 'vitest';

import {
  classBasicAttack,
  tickClassCharge,
  updateClassPassives,
  updateClassSummons,
  useClassActive,
  useClassActive2,
} from '../src/sim/classes';
import { loadContent, type ClassDef, type Content } from '../src/sim/content';
import { applyDot, applyFrost, damageEnemy, dotRemaining, dotStacks, spawnEnemy } from '../src/sim/enemies';
import { updateWarden } from '../src/sim/run';
import { buildTower, updateTowers } from '../src/sim/towers';
import { GRID_W } from '../src/sim/grid';
import { emptyInput, type Enemy, type Structure, type TickInput } from '../src/sim/types';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const content = loadContent();

/** Warden's parking spot for every case — well inside the board, room in every direction. */
const WX = 10;
const WY = 10;

const DT = 1 / 60;

const SPIRE = 'arrow_spire';

/** Ranks, keyed by skill-card key — the shape `World.skillCardRanks` already has. */
type Ranks = Record<string, number>;

/**
 * A world with the character's basic attack suppressed by default. The rows
 * whose observable *is* the basic attack (Deeper Cuts, Brittle Frost) re-arm it
 * explicitly through `attack()`, the same convention `class-passive-liveness`
 * (c006) uses.
 */
function lineWorld(classKey: string, ranks: Ranks, c: Content = content): World {
  const w = new World(cfg({ classKey }), c);
  w.gold = 1e6;
  w.warden.attackCooldown = 1e9;
  w.warden.x = WX;
  w.warden.y = WY;
  w.skillCardRanks = { ...ranks };
  return w;
}

function cls(w: World): ClassDef {
  return w.content.classByKey.get(w.cfg.classKey)!;
}

/** The one `class_line` card `/data` authors for this class. */
function lineCard(classKey: string) {
  const own = (content.boons.skillCards[classKey] ?? []).filter((c) => c.effect === 'class_line');
  expect(own.length, `${classKey} should author exactly one class_line card`).toBe(1);
  return own[0];
}

/** The largest bonus that card can ever contribute — every budget below is sized against it. */
function maxBonus(classKey: string): number {
  const c = lineCard(classKey);
  return c.maxRank * c.perRank;
}

/**
 * How many casts/enemies/corpses a row needs so the card's own cap is always
 * the binding constraint. `slack` is headroom on top of the highest reading any
 * rank can produce; a row that still runs out says so through
 * `withinBudget` rather than reporting a dead branch.
 */
function budgetFor(classKey: string, base: number, slack = 2): number {
  return Math.ceil(base + maxBonus(classKey)) + slack;
}

/** Distinguishes "the card did nothing" from "the harness ran out of room". */
function withinBudget(reading: number, budget: number, what: string): number {
  expect(
    reading,
    `harness budget for ${what} was too small (read ${reading} of ${budget}) — a harness shortfall, not a dead branch`,
  ).toBeLessThan(budget);
  return reading;
}

/**
 * An immovable, unarmoured punching bag. `1e5` rather than something larger:
 * every counting row below reads "did this enemy's hp change at all", and a
 * pool deep enough to look obviously safe is also deep enough to quantise the
 * smallest pierce-falloff tail hit into a float no-op (c009's ULP lesson).
 * Nothing here deals more than ~1e3, so nothing dies by accident either.
 */
function dummy(w: World, x: number, y: number, hp = 1e5): Enemy {
  const e = spawnEnemy(w, w.content.enemies.enemies[0].key, x, y)!;
  e.hp = hp;
  e.maxHp = Math.max(hp, e.maxHp);
  e.speed = 0;
  e.armor = 0;
  w.rebuildBuckets();
  return e;
}

/** Fires exactly one character basic attack, whatever the cadence would have been. */
function attack(w: World): void {
  w.warden.attackCooldown = 0;
  classBasicAttack(w, cls(w));
}

/**
 * Casts Active1 `times` times, **ignoring the cooldown** between casts.
 *
 * For the cap rows (Raise, Manifest) this is deliberate and is what separates
 * a *cap* from a *cadence*: this file measures the cap the card raises, and the
 * cadence that can or cannot reach it is `c018`, measured separately at the
 * bottom of this file through the real `updateWarden` cooldown tick.
 */
function cast1(w: World, times: number, aimX?: number, aimY?: number): void {
  for (let i = 0; i < times; i++) {
    w.warden.active1Cooldown = 0;
    w.warden.active1Ammo = Math.max(w.warden.active1Ammo, 1);
    useClassActive(w, aimX, aimY);
  }
}

/** Casts Active2 `times` times, ignoring the cooldown (and the ammo gate) between casts. */
function cast2(w: World, times: number, aimX?: number, aimY?: number): void {
  for (let i = 0; i < times; i++) {
    w.warden.active2Cooldown = 0;
    w.warden.active2Ammo = Math.max(w.warden.active2Ammo, 1);
    useClassActive2(w, aimX, aimY);
  }
}

function idle(over: Partial<TickInput> = {}): TickInput {
  return { ...emptyInput(), ...over };
}

/** Holds a `charge_pierce` Active1 for `seconds` at the real 60 Hz and releases it (c006's `chargeFor`). */
function chargeFor(w: World, seconds: number, aimX: number, aimY: number): void {
  const c = cls(w);
  const aim = { aimX, aimY };
  for (let t = 0; t < Math.round(seconds * 60); t++) {
    tickClassCharge(w, c, idle({ ...aim, active1Held: true }), DT);
  }
  tickClassCharge(w, c, idle({ ...aim, active1Held: false }), DT);
}

function summonCount(w: World, kind: string): number {
  let n = 0;
  for (const s of w.classSummons) if (s.kind === kind) n++;
  return n;
}

/** How many of `list` lost hp — the count-shaped observable three rows below share. */
function struckCount(list: readonly { e: Enemy; hp: number }[]): number {
  let n = 0;
  for (const r of list) if (r.e.hp < r.hp) n++;
  return n;
}

/**
 * A line of dummies along +x at `spacing` tiles, each remembered with its
 * starting hp. Spacing matters: `electric` carries an inherent `radius` 0.8
 * (`data/damagetypes.json`) that splashes neighbours, so a line packed tighter
 * than that plus an enemy radius counts splash victims as chain jumps — which
 * the first draft of the stormcaller row did, at exactly 0.8 (QA).
 */
function lineOfDummies(w: World, count: number, spacing: number): { e: Enemy; hp: number }[] {
  const line: { e: Enemy; hp: number }[] = [];
  for (let i = 1; i <= count; i++) {
    const x = WX + i * spacing;
    expect(x, 'harness budget: the dummy line ran off the board').toBeLessThan(GRID_W - 1);
    const e = dummy(w, x, WY);
    line.push({ e, hp: e.hp });
  }
  return line;
}

function place(w: World, key: string, tx: number, ty: number): Structure {
  const def = w.content.towerByKey.get(key)!;
  const r = buildTower(w, def.id, tx, ty);
  expect(r.ok, `harness could not build ${key} at ${tx},${ty}`).toBe(true);
  return (r as { ok: true; structure: Structure }).structure;
}

type RawClassRow = { key: string; active1: Record<string, number>; active2: Record<string, number> };

/** A `Content` rebuilt from `data/classes.json` with one class row edited (c011's helper). */
function contentWith(classKey: string, mutate: (row: RawClassRow) => void): Content {
  const doc = JSON.parse(JSON.stringify(content.raw.classes)) as { classes: RawClassRow[] };
  const row = doc.classes.find((c) => c.key === classKey);
  expect(row, `${classKey} missing from data/classes.json`).toBeDefined();
  mutate(row!);
  return loadContent({ classes: doc });
}

/* ------------------------------------------------------------ the twelve rows */

/**
 * One class's card: the key it is authored under, which way its observable
 * moves per rank, and how to read that observable out of a real world.
 *
 * `Content` is a parameter of `measure` rather than a closure capture, and
 * since `c017` **no call site passes it** — the deviation rows that re-ran the
 * identical measurement against an edited `/data` are gone, so every row
 * measures shipped `/data` through the default. The seam is kept rather than
 * inlined because it is what let the Archer's ladder be measured at all while
 * its bug was open, and it is cheaper than the second measurement function the
 * next deviation would otherwise grow (and which could drift from this one).
 */
type Row = {
  classKey: string;
  card: string;
  observable: string;
  dir: 'up' | 'down';
  measure: (ranks: Ranks, c?: Content) => number;
};

const ROWS: Row[] = [
  {
    classKey: 'swordsman',
    card: 'swordsman_bleed_stacks',
    observable: 'Bleeding stacks one basic attack applies',
    dir: 'up',
    // `passiveOnHit` repeats `'bleeding'` in the `onHit` list and `applyEffects`
    // calls `applyOnHit` once per element, so the stack count *is* the branch.
    // Bleeding's own `maxStacks` is 50, far above anything a rank can reach.
    measure: (ranks, c) => {
      const w = lineWorld('swordsman', ranks, c);
      const e = dummy(w, WX + 1, WY);
      attack(w);
      return dotStacks(e, 'bleeding');
    },
  },
  {
    classKey: 'plaguebringer',
    card: 'plaguebringer_plague_spread',
    observable: 'bystanders a DoT-carrying death transfers to',
    dir: 'up',
    measure: (ranks, c) => {
      const w = lineWorld('plaguebringer', ranks, c);
      const carrier = dummy(w, WX + 1, WY, 100);
      // §4.1 names one target, so the reading is `1 + bonus`; the crowd is
      // sized past what rank 2 can reach so running out reads as a shortfall.
      const budget = budgetFor('plaguebringer', 1);
      const bystanders: { e: Enemy; hp: number }[] = [];
      for (let i = 1; i <= budget; i++) {
        const e = dummy(w, WX + 1 + i * 0.6, WY + 1);
        bystanders.push({ e, hp: e.hp });
      }
      applyDot(w, carrier, 'poison', 20, 5, 'test');
      damageEnemy(w, carrier, 1e6, 'test');
      expect(carrier.dead, 'the carrier survived, so nothing spread').toBe(true);
      // The transfer is a bare `damageEnemy` (`pure`/`dot`), no AoE, so the
      // 0.6 packing cannot inflate the count the way electric splash could.
      return withinBudget(struckCount(bystanders), budget, 'Spreading Plague bystanders');
    },
  },
  {
    classKey: 'engineer',
    card: 'engineer_turret_cap',
    observable: 'live Pop Turrets the cap allows',
    dir: 'up',
    measure: (ranks, c) => {
      const w = lineWorld('engineer', ranks, c);
      const budget = budgetFor('engineer', cls(w).active2.summonCap ?? 0);
      cast2(w, budget);
      return withinBudget(summonCount(w, 'engineer_turret'), budget, 'Pop Turret casts');
    },
  },
  {
    classKey: 'pyromancer',
    card: 'pyromancer_burn_duration',
    observable: "seconds left on Immolation Wave's Burning",
    dir: 'up',
    measure: (ranks, c) => {
      const w = lineWorld('pyromancer', ranks, c);
      const e = dummy(w, WX + 1, WY);
      cast1(w, 1);
      return dotRemaining(e, 'burning');
    },
  },
  {
    classKey: 'archer',
    card: 'archer_pierce_cap',
    observable: 'enemies one full-charge Deadeye Draw pierces',
    dir: 'up',
    measure: (ranks, c) => {
      const w = lineWorld('archer', ranks, c);
      const eff = cls(w).active1;
      const budget = budgetFor('archer', eff.pierceCap ?? 1);
      // 0.7 spacing keeps the whole budget inside the shot's own `radius`
      // reach; Deadeye deals `normal`, which carries no inherent splash.
      const line = lineOfDummies(w, budget, 0.7);
      // Held past `chargeCapSeconds`, whatever `/data` authors it as, so the
      // hold never separates two readings.
      chargeFor(w, (eff.chargeCapSeconds ?? 0) + 1, WX + 8, WY);
      return withinBudget(struckCount(line), budget, 'Deadeye Draw pierce line');
    },
  },
  {
    classKey: 'necromancer',
    card: 'necromancer_skeleton_cap',
    observable: 'skeletons one Raise puts up',
    dir: 'up',
    measure: (ranks, c) => {
      const w = lineWorld('necromancer', ranks, c);
      const budget = budgetFor('necromancer', cls(w).active1.summonCap ?? 0);
      for (let i = 0; i < budget; i++) {
        // A 5-wide grid at 0.5 tiles stays well inside Raise's 8-tile
        // `summonRadius` for any budget this row can reach, and each corpse is
        // left by a *real* kill so Grave Harvest is what produces it.
        damageEnemy(w, dummy(w, WX + 1 + (i % 5) * 0.5, WY + 1 + Math.floor(i / 5) * 0.5, 100), 1e6, 'test');
      }
      expect(w.corpses.length, 'harness budget: too few corpses to reach any cap').toBeGreaterThanOrEqual(budget);
      cast1(w, 1);
      return withinBudget(summonCount(w, 'necro_skeleton'), budget, 'Raise corpses');
    },
  },
  {
    classKey: 'cryomancer',
    card: 'cryomancer_freeze_hits',
    observable: 'basic attacks a frosted enemy survives before freezing',
    dir: 'down',
    measure: (ranks, c) => {
      const w = lineWorld('cryomancer', ranks, c);
      const need = cls(w).passive.freezeHits ?? 5;
      // `applyOnHit` floors the threshold at 1 (`enemies.ts`), so a retune of
      // `freezeHits` down to the card's own reach makes the ladder physically
      // flat. That is a retune, not a dead branch, and it says so here.
      expect(
        need - maxBonus('cryomancer'),
        'harness budget: freezeHits retuned to at or below the card\'s reach, so Math.max(1, ...) flattens the ladder',
      ).toBeGreaterThanOrEqual(1);
      const e = dummy(w, WX + 1, WY, 1e6);
      applyFrost(w, e);
      const budget = Math.ceil(need) + 5;
      let hits = 0;
      while (e.frozenRemaining <= 0 && hits < budget) {
        attack(w);
        hits++;
      }
      expect(e.frozenRemaining, `harness budget: ${budget} frosted hits never froze the enemy`).toBeGreaterThan(0);
      return hits;
    },
  },
  {
    classKey: 'stormcaller',
    card: 'stormcaller_jump_cap',
    observable: 'enemies one Chain Surge reaches',
    dir: 'up',
    measure: (ranks, c) => {
      const w = lineWorld('stormcaller', ranks, c);
      const jumps = cls(w).active1.chainCount ?? 1;
      const budget = budgetFor('stormcaller', jumps);
      // 1.2 tiles: past `electric`'s inherent 0.8 splash (`enemiesInRadius`
      // compares centre distance, so 0.8 is the true threshold) so a jump
      // strikes exactly one enemy, and far inside the 5-tile chain radius so
      // the jump *count* is what ends the chain. The assertion below is what
      // proves that separation still holds rather than assuming it.
      const line = lineOfDummies(w, budget, 1.2);
      cast1(w, 1, WX + 1.2, WY);
      const struck = withinBudget(struckCount(line), budget, 'Chain Surge enemy line');
      const bonus = Math.round((ranks[lineCard('stormcaller').key] ?? 0) * lineCard('stormcaller').perRank);
      // Mechanism pin, both sides out of `/data`: one jump, one enemy. A
      // spacing that let splash back in would read high here first.
      expect(struck, 'Chain Surge struck more enemies than it had jumps — splash is leaking in').toBe(
        Math.round(jumps) + bonus,
      );
      return struck;
    },
  },
  {
    classKey: 'bloodlord',
    card: 'bloodlord_tithe_bonus',
    observable: 'damage one volley from a tithed Arrow Spire deals',
    dir: 'up',
    measure: (ranks, c) => {
      const w = lineWorld('bloodlord', ranks, c);
      const s = place(w, SPIRE, WX + 1, WY);
      const e = dummy(w, WX + 2, WY);
      cast1(w, 1, s.tx + 0.5, s.ty + 0.5);
      expect(s.tithed, 'Blood Tithe never landed on the spire').toBe(true);
      const before = e.hp;
      s.cooldown = 0;
      updateTowers(w, DT);
      return before - e.hp;
    },
  },
  {
    classKey: 'animist',
    card: 'animist_spirit_cap',
    observable: 'live Manifested spirits the cap allows',
    dir: 'up',
    measure: (ranks, c) => {
      const w = lineWorld('animist', ranks, c);
      // Manifest needs an attacking structure inside its 6-tile `summonRadius`.
      place(w, SPIRE, WX + 1, WY);
      const budget = budgetFor('animist', cls(w).active1.summonCap ?? 0);
      cast1(w, budget);
      return withinBudget(summonCount(w, 'animist_spirit'), budget, 'Manifest casts');
    },
  },
  {
    classKey: 'paladin',
    card: 'paladin_wrath_bonus',
    observable: 'damage Judgement releases from banked Wrath',
    dir: 'up',
    measure: (ranks, c) => {
      const w = lineWorld('paladin', ranks, c);
      const e = dummy(w, WX + 1, WY);
      // Banked directly: `wrathStored` is uncapped and accrues from blocked
      // damage in a real run, and Guardian Stance's own accrual rate is
      // c006/c011's observable — driving it here would add a second variable.
      w.warden.wrathStored = 100;
      const before = e.hp;
      cast2(w, 1);
      return before - e.hp;
    },
  },
  {
    classKey: 'time_lord',
    card: 'time_lord_lock_duration',
    observable: 'ticks the Time Lock zone stands for',
    dir: 'up',
    measure: (ranks, c) => {
      const w = lineWorld('time_lord', ranks, c);
      cast2(w, 1, WX + 1, WY);
      expect(w.timeLockZone, 'Time Lock never placed a zone').toBeTruthy();
      const budget = Math.round(60 * ((cls(w).active2.groundDurationSeconds ?? 5) + maxBonus('time_lord') + 5));
      for (let t = 1; t <= budget; t++) {
        updateClassPassives(w, DT);
        if (!w.timeLockZone) return t;
      }
      throw new Error(`harness budget: the Time Lock zone outlived ${budget} ticks and never expired`);
    },
  },
];

/* ------------------------------------------------------------------ the census */

/**
 * Every `class_line` card in `/data` must have a row above. This is the half
 * that survives new content: `fb057`/`fb059` add a 13th and 14th class, each
 * with its own bespoke third card and its own bare `+ classLineBonus(w)`
 * somewhere, and this assertion is what makes them arrive with a measurement
 * instead of without one. (A class added to `data/classes.json` with *no*
 * `vsupgrades.json` block would slip past this census, because `authored` is
 * read off the cards; `tests/content-complete.test.ts:68-79` iterates the
 * classes instead and is what closes that side — do not "simplify" it away.)
 */
describe('c016 — every class_line skill card is on trial', () => {
  const authored = Object.entries(content.boons.skillCards).flatMap(([classKey, cards]) =>
    cards.filter((c) => c.effect === 'class_line').map((c) => ({ classKey, card: c })),
  );

  it('the twelve authored class_line cards are exactly the rows measured below', () => {
    expect(authored.map((a) => `${a.classKey}:${a.card.key}`).sort()).toEqual(
      ROWS.map((r) => `${r.classKey}:${r.card}`).sort(),
    );
  });

  it('each class authors exactly one class_line card, and every row names its real key', () => {
    for (const r of ROWS) {
      const own = lineCard(r.classKey);
      expect(own.key).toBe(r.card);
      // Every row below reads rank 0/1/2 off it; a card capped lower would make
      // the rank-2 step vacuous rather than red.
      expect(own.maxRank, `${r.card} maxRank`).toBeGreaterThanOrEqual(2);
      expect(own.perRank, `${r.card} perRank`).toBeGreaterThan(0);
    }
  });
});

/* -------------------------------------------------------- rank 0 -> 1 -> 2 */

/** Every other class's card at max rank — the noise a correctly key-scoped lookup ignores. */
function foreignRanks(classKey: string): Ranks {
  const ranks: Ranks = {};
  for (const r of ROWS) if (r.classKey !== classKey) ranks[r.card] = 2;
  return ranks;
}

function moved(dir: 'up' | 'down', lo: number, hi: number): boolean {
  return dir === 'up' ? hi > lo : hi < lo;
}

/**
 * **Every row below now measures shipped `/data`, untouched.** The Archer used
 * to need a rebuilt `Content` — `c017`'s binding term was the charge clamp, so
 * its ladder could not be read on shipped numbers at all — and that override
 * was written to expire the day the bug was fixed. `c017` landed, so it is
 * gone. (`c018`'s two rows never needed one: those ladders measure a *cap*, and
 * `cast1`/`cast2` bypass the cadence `c018` is about; that bug is measured on
 * its own terms at the bottom of this file.)
 */

describe('c016 — a rank moves the branch it names, and nothing else', () => {
  for (const row of ROWS) {
    it(`${row.classKey} ${row.card}: ${row.observable} moves ${row.dir} at rank 1 and again at rank 2`, () => {
      const r0 = row.measure({});
      const r1 = row.measure({ [row.card]: 1 });
      const r2 = row.measure({ [row.card]: 2 });
      expect(moved(row.dir, r0, r1), `rank 0 -> 1 did not move ${row.observable} (${r0} -> ${r1})`).toBe(true);
      expect(moved(row.dir, r1, r2), `rank 1 -> 2 did not move ${row.observable} (${r1} -> ${r2})`).toBe(true);
    });

    it(`${row.classKey} ${row.card}: every other class's card at max rank changes nothing`, () => {
      expect(row.measure(foreignRanks(row.classKey))).toBe(row.measure({}));
    });
  }

  /**
   * The `class_line` branch sits directly beside `active1_potency` at two call
   * sites, and `towers.ts` carries an explicit design comment about it: the
   * card "adds a further flat bonus **on top**, rather than the same lever
   * twice". Rewriting that line as `(titheDamageMul + bonus) * potency` left
   * every other case in this file green (code review), so the two levers get
   * one case of their own.
   */
  it('bloodlord Deeper Tithe adds on top of Blood Tithe Potency, not inside it', () => {
    const row = ROWS.find((r) => r.classKey === 'bloodlord')!;
    const potency = { bloodlord_active1_potency: 2 };
    const plain = row.measure({ [row.card]: 1 }) - row.measure({});
    const withPotency = row.measure({ ...potency, [row.card]: 1 }) - row.measure(potency);
    expect(plain).toBeGreaterThan(0);
    expect(withPotency).toBeCloseTo(plain, 6);
  });
});

/* ----------------------------------------------------- the filed deviations */

/**
 * `c018`, filed by QA on c016 and fixed here. Both cards raise a summon
 * **cap**, and the rows above measure that cap with the cooldown bypassed —
 * the right way to measure a cap and the wrong way to measure a run. A summon
 * lives `summonDurationSeconds` and one arrives every `cooldownSeconds`, so
 * the most a player spamming the key can ever hold is
 * `floor(duration / cooldown) + 1`. On the data c016 shipped against, that
 * ceiling was **1** live turret (Pop Turret, 12 s / 10 s) against an authored
 * cap of 2, and **2** spirits (Manifest, 16 s / 20 s) against an authored cap
 * of *3* — one point of the authored cap was already dead before the card
 * was, and both cards bought a player nothing at all.
 *
 * The fix is `/data` only and cooldown only: §4.2 authors both durations
 * ("10 s, cap 2", "20 s, cap 3") and `tests/class-spec-numbers.test.ts` pins
 * them, while no §-clause anywhere authors an Active's cooldown — it is the
 * one free ⚖ lever of the three, so it is the one that moved.
 *
 * The observable is the peak number of live summons a player who presses the
 * Active every single tick ever holds, with the cooldown ticked by the real
 * `updateWarden` and expiry by the real `updateClassSummons` — no forced
 * resets anywhere, which is exactly what `cast1`/`cast2` do and why they
 * cannot see this bug. It is asserted as an **equality against `/data`**
 * (`summonCap + rank * perRank`), not merely as movement: the authored cap
 * being reachable is half of what was broken, and a ladder that only moved
 * would still pass with the Animist stuck one spirit short of its own 3.
 */
/**
 * The most live summons an Active can ever hold: one arrives every `cooldown`,
 * each lives `duration`, so the ceiling is `floor(duration / cooldown) + 1` —
 * **minus a tick at exact multiples**. `Run.step` casts before
 * `updateClassSummons` expires, and expiry is `remaining -= dt` reaching 0 at
 * the end of the previous tick, so when `duration / cooldown` is an integer
 * the n-th summon is cast on the very tick the first one dies and the two
 * never coexist at a sample point. Measured, not reasoned: at cooldown 5.0 s
 * against Manifest's 20 s the naive formula says 5 and a real run peaks at 4
 * (QA, on this item). Shipped values are non-integer ratios so this bites
 * nothing today — it is the trap the next ⚖ cooldown pass would fall into,
 * and 5.0 s is exactly the round number that pass would reach for.
 */
function cadenceCeiling(duration: number | undefined, cooldown: number | undefined): number {
  if (!cooldown || !duration) return 0;
  return Math.floor((duration - DT) / cooldown) + 1;
}

describe('c018 — both summon caps are reachable at the real cast cadence', () => {
  function peakLiveSummons(
    classKey: string,
    ranks: Ranks,
    slot: 1 | 2,
    kind: string,
    seconds: number,
    c: Content = content,
  ): number {
    const w = lineWorld(classKey, ranks, c);
    if (classKey === 'animist') place(w, SPIRE, WX + 1, WY);
    let peak = 0;
    for (let t = 0; t < Math.round(seconds * 60); t++) {
      if (slot === 1) useClassActive(w, WX + 1, WY);
      else useClassActive2(w, WX + 1, WY);
      updateWarden(w, idle(), DT);
      updateClassSummons(w, DT);
      peak = Math.max(peak, summonCount(w, kind));
    }
    return peak;
  }

  const CASES = [
    { classKey: 'engineer', card: 'engineer_turret_cap', kind: 'engineer_turret', name: 'Extra Turret' },
    { classKey: 'animist', card: 'animist_spirit_cap', kind: 'animist_spirit', name: 'Kindred Spirits' },
  ];

  for (const k of CASES) {
    // Pop Turret is Active2, Manifest is Active1 — read the slot off `/data`
    // rather than restating it, so a kit reshuffle cannot leave this measuring
    // an Active that no longer summons.
    const row = content.classByKey.get(k.classKey)!;
    const slot: 1 | 2 = row.active1.summonCap !== undefined ? 1 : 2;
    const eff = slot === 1 ? row.active1 : row.active2;
    // Long enough for the slowest ladder to fill: every rank needs
    // `cap + maxBonus` casts at one cooldown apiece, plus two cooldowns of
    // slack so the last summon is measured while the first is still alive.
    // Derived, never a literal — a cooldown retune lengthens the window too.
    const windowSeconds = ((eff.summonCap ?? 0) + maxBonus(k.classKey) + 1) * (eff.cooldownSeconds ?? 1);
    const target = (eff.summonCap ?? 0) + maxBonus(k.classKey);

    it(`${k.classKey} ${k.name}: the cadence itself reaches the card's full ceiling`, () => {
      expect(
        cadenceCeiling(eff.summonDurationSeconds, eff.cooldownSeconds),
        `${k.name}'s cast cadence cannot reach ${target} live ${k.kind}s — ` +
          `cooldown ${eff.cooldownSeconds}s against duration ${eff.summonDurationSeconds}s is c018 all over again`,
      ).toBeGreaterThanOrEqual(target);
    });

    it(`${k.classKey} ${k.name}: each rank holds one more live summon in a real run`, () => {
      const card = lineCard(k.classKey);
      const peaks = [0, 1, 2].map((n) => peakLiveSummons(k.classKey, n === 0 ? {} : { [k.card]: n }, slot, k.kind, windowSeconds));
      // Both sides come out of `/data`, so a retune of either the cap or the
      // card's `perRank` moves them together — this pins the mechanism, not a
      // magnitude (c005's convention, kept).
      expect(peaks, `${k.name}'s live count did not follow the card: ${peaks.join(' -> ')}`).toEqual(
        [0, 1, 2].map((n) => (eff.summonCap ?? 0) + n * card.perRank),
      );
    });

    it(`${k.classKey} ${k.name}: the cadence, not the cap, is what changed — lengthening the cooldown puts the ceiling back`, () => {
      // The mirror of the old deviation's companion case: the branch was
      // always live, the cadence was not. Stretch the cooldown past the
      // duration on a `/data` copy and the flat ceiling c018 filed returns,
      // which is what proves the shipped ladder above is the cooldown's doing
      // and not some other edit that happened to land at the same time.
      const slow = contentWith(
        k.classKey,
        (r) => void ((slot === 1 ? r.active1 : r.active2).cooldownSeconds = (eff.summonDurationSeconds ?? 0) + 1),
      );
      const slowCooldown = (eff.summonDurationSeconds ?? 0) + 1;
      const at0 = peakLiveSummons(k.classKey, {}, slot, k.kind, windowSeconds, slow);
      const at2 = peakLiveSummons(k.classKey, { [k.card]: 2 }, slot, k.kind, windowSeconds, slow);
      // Tied to `cadenceCeiling`, not to the literal 1, so the formula the
      // guard above trusts is itself measured against a real run at least once
      // — the one thing the deleted c018 tripwire covered that nothing else
      // did (QA, on this item).
      const ceiling = cadenceCeiling(eff.summonDurationSeconds, slowCooldown);
      expect(ceiling).toBe(1);
      expect(at0).toBe(ceiling);
      expect(at2).toBe(ceiling);
    });
  }
});
