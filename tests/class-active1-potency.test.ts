/**
 * c021 (BACKLOG-CONTENT, lane `content`) — **the twelve `active1_potency`
 * cards, on trial: the last of the three §6.3 cards with no cross-class
 * coverage.**
 *
 * `c016` closed `class_line` (twelve rows), `c019` closed `active2_cdr`
 * (twelve ladders plus two named deviations). `active1_potency` was touched
 * only by `tests/act2.test.ts:185` and `tests/p6b-swordsman.test.ts:274-281`,
 * **both swordsman-only**, so eleven of the twelve were unwatched and
 * `active1PotencyMul` could be deleted from eleven kits with the suite green.
 *
 * ---
 *
 * **"Potency" is not "damage", and pretending otherwise would have measured
 * four kits wrong.** The item's acceptance says the card must move "its own
 * Active1's damage"; four of the twelve Active1s author `damage: 0` and carry
 * their magnitude somewhere else entirely (`data/classes.json`):
 *
 *   | class       | Active1          | what potency actually multiplies      |
 *   |-------------|------------------|---------------------------------------|
 *   | engineer    | `repair_heal`    | `repairFraction` — how much it heals   |
 *   | necromancer | `raise_skeletons`| `summonStatMul` — each skeleton's dps  |
 *   | animist     | `manifest_spirit`| `summonStatMul` — the spirit's dps     |
 *   | paladin     | `clarion_taunt`  | `tauntDurationSeconds` — a longer taunt|
 *
 * `classes.ts` already reads it that way at each site, with a comment saying
 * so. So every row here names its own observable out of `/data` rather than
 * assuming a damage number, and the table above is the reason the file is
 * shaped as a per-class case list instead of one loop over enemy hp.
 *
 * **The observable is the effect that landed**, `c019`'s standard: an enemy's
 * hp, a structure's hp, a summon's `dps`, a taunt's remaining seconds, a
 * ground area's `dps`, a DoT's `dps`. Reading `active1PotencyMul(w)` back
 * would pass on a `progression.ts` that computed the multiplier correctly and
 * a `classes.ts` that never applied it — which is exactly the bug this file
 * exists to make impossible.
 *
 * **The control is the same card at rank 0** (`c016`'s convention, kept), and
 * every row asserts the *exact* ratio `1 + perRank * rank` rather than
 * "bigger": a rank-2 reading that is merely larger than rank 0 is satisfied by
 * an implementation that applies the card once and ignores the rank.
 *
 * **Every window and budget comes out of `/data`.** `perRank` and `maxRank` are
 * read off the card, so a ⚖ nerf moves the expectation with the card instead of
 * reddening the file, and a `perRank <= 0` is refused outright by the coverage
 * case rather than silently making every ladder a tie (the trap `c019`'s
 * `MAX_CADENCES` was earned by).
 *
 * ---
 *
 * **One named deviation, and one correction, `c019`'s convention: never
 * silence.**
 *
 *  1. **Bloodlord *Blood Tithe* scales its payout, not its cost — and the
 *     first version of this file got that backwards.** `fireBloodTithe`
 *     (`classes.ts`) does not call `active1PotencyMul`, and on that alone the
 *     first draft concluded the card "buys nothing" and filed a main-lane fix
 *     for a bug that does not exist. It was wrong: the tithe's *payout* is
 *     applied in `classTowerDamageMul` (`towers.ts`), which reads
 *     `1 + titheDamageMul * active1PotencyMul(w) + classLineBonus(w)` — with a
 *     comment saying exactly that. QA found it by mutating the line this file
 *     never looked at.
 *
 *     The lesson is CLAUDE.md's, verbatim: *"when a field's range changes,
 *     grep its readers, not just its writers"*. The draft grepped
 *     `classes.ts`, found no call, and never followed the payout to the file
 *     it had itself identified as holding it — then wrote a test that measured
 *     only the cost and so confirmed its own premise.
 *
 *     What is *true* is narrower and still worth pinning: the tithe's **HP
 *     cost** (`titheHpFraction`) does not scale with the card, only its
 *     **damage payout** (`titheDamageMul`) does. Both are measured below, and
 *     the payout row is a live ladder, not a deviation.
 *
 *  2. **Time Lord *Time* scales two of its four stages.** Potency multiplies
 *     `markPastDotDps` and `markPresentDotDps` (`advanceTimeMark`), but stage
 *     2's DoT is authored as the target's *remaining HP* and stage 3 is an
 *     instant kill — neither is a `/data` magnitude there is anything to
 *     multiply. Pinned per stage so the partial reach is a decision on record
 *     rather than a gap someone later reads as a bug.
 *
 * **This item changes no number.** No `/src` or `/data` byte moves; `c007`,
 * `c019` and `c008` set that precedent.
 */

import { describe, expect, it } from 'vitest';

import { characterDamage, tickClassCharge, useClassActive, useClassActive2 } from '../src/sim/classes';
import { loadContent, type SkillCardDef } from '../src/sim/content';
import { spawnEnemy } from '../src/sim/enemies';
import { buildTower, towerDamage } from '../src/sim/towers';
import { updateWarden } from '../src/sim/run';
import { emptyInput, type Enemy, type Structure, type TickInput } from '../src/sim/types';
import { World } from '../src/sim/world';
import { cfg } from './helpers';
import { BUILD_TX, BUILD_TY, WX, WY } from './class-board';

const content = loadContent();

const DT = 1 / 60;

const CLASS_KEYS = content.classes.classes.map((c) => c.key);

type Ranks = Record<string, number>;

/** The one `active1_potency` card `/data` authors for this class. */
function potencyCard(classKey: string): SkillCardDef {
  const own = (content.boons.skillCards[classKey] ?? []).filter((c) => c.effect === 'active1_potency');
  expect(own.length, `${classKey} should author exactly one active1_potency card`).toBe(1);
  return own[0];
}

/**
 * A world with the character's basic attack parked (the p6b/c005/c016/c019
 * convention) so nothing but the Active under test can move an observable.
 */
function potencyWorld(classKey: string, ranks: Ranks): World {
  const w = new World(cfg({ classKey }), content);
  w.gold = 1e6;
  w.warden.attackCooldown = 1e9;
  w.warden.x = WX;
  w.warden.y = WY;
  w.skillCardRanks = { ...ranks };
  return w;
}

function idle(over: Partial<TickInput> = {}): TickInput {
  return { ...emptyInput(), ...over };
}

/**
 * An immovable, unarmoured punching bag deep enough that no row here can kill
 * it — a kill would end the measurement early and hand a death trigger a
 * chance to move an observable this file attributes to the card
 * (c009's reasoning, and its 1e7 rather than 1e9: at 1e9 a float ULP is ~2.4e-7
 * and small deltas quantise away).
 */
function dummy(w: World, x: number, y: number, hp = 1e7): Enemy {
  const e = spawnEnemy(w, content.enemies.enemies[0].key, x, y)!;
  e.hp = hp;
  e.maxHp = Math.max(hp, e.maxHp);
  e.speed = 0;
  e.armor = 0;
  w.rebuildBuckets();
  return e;
}

/** An arrow_spire on the shared probed tile (c014), the shape Field Kit and Manifest both need. */
function tower(w: World): Structure {
  const res = buildTower(w, content.towerByKey.get('arrow_spire')!.id, BUILD_TX, BUILD_TY);
  expect(res.ok, 'harness could not place a tower on the shared build tile').toBe(true);
  return w.structureAt(BUILD_TX, BUILD_TY)!;
}

/**
 * Holds a charge Active to full and releases it — Circle Slash / Deadeye
 * Draw's only firing path, at the real 60 Hz (c005's convention: a harness
 * that takes a path no real run takes stops being evidence about real runs).
 */
function chargeAndRelease(w: World, aimX: number, aimY: number): void {
  const cls = w.content.classByKey.get(w.cfg.classKey)!;
  const cap = cls.active1.chargeCapSeconds ?? 3;
  const aim = { aimX, aimY };
  for (let t = 0; t < Math.ceil(cap * 60) + 1; t++) {
    tickClassCharge(w, cls, idle({ ...aim, active1Held: true }), DT);
  }
  tickClassCharge(w, cls, idle({ ...aim, active1Held: false }), DT);
}

interface PotencyCase {
  classKey: string;
  /** What `/data` field the card really multiplies, for the failure message. */
  what: string;
  /** Reads the observable after one cast of Active1 in a fresh world. */
  read: (w: World) => number;
  /**
   * Rows whose observable this file measures but which the card is expected
   * *not* to move, with the reason. Absent on the eleven live rows.
   */
  deviation?: string;
  /**
   * The ratio `reading(rank n) / reading(0)` this row expects, when it is not
   * the plain `1 + perRank * n`. Bloodlord is the one such row: potency scales
   * a *term inside* the tower's damage multiplier
   * (`1 + titheDamageMul * potency`), not the whole reading, so its ladder is
   * `(1 + t * (1 + p*n)) / (1 + t)` — derived from `/data`, like every other
   * expectation here.
   */
  ratioFor?: (n: number, perRank: number) => number;
}

/** Fires Active1 once, aimed one tile east, through whichever path `/data` authors. */
function castActive1(w: World): void {
  const cls = w.content.classByKey.get(w.cfg.classKey)!;
  if (cls.active1.chargeCapSeconds !== undefined) chargeAndRelease(w, WX + 1, WY);
  else expect(useClassActive(w, WX + 1, WY), `${w.cfg.classKey}: the Active1 cast did not land`).toBe(true);
}

/** Total hp one cast took off a lone dummy — the observable for the six damage kits. */
function damageDealt(w: World): number {
  const e = dummy(w, WX + 1, WY);
  const before = e.hp;
  castActive1(w);
  return before - e.hp;
}

const CASES: readonly PotencyCase[] = [
  {
    classKey: 'swordsman',
    what: 'Circle Slash damage',
    read: damageDealt,
  },
  {
    classKey: 'plaguebringer',
    what: "Poison Barrel's ground area dps",
    read: (w) => {
      castActive1(w);
      const area = w.areas.find((a) => a.type === 'poison');
      expect(area, 'harness: Poison Barrel left no area to read').toBeDefined();
      return area!.dps;
    },
  },
  {
    classKey: 'engineer',
    what: "Field Kit's repairFraction (hp healed)",
    read: (w) => {
      const s = tower(w);
      // Healed from 1, not from near-full: `fireFieldKit` clamps at `maxHp`,
      // and `repairFraction * (1 + perRank * maxRank)` is 0.4 * 1.5 = 0.6 of
      // maxHp, so a bag this deep can never clamp. The clamp is the collision
      // class the item warned about, avoided by construction rather than hoped
      // away — and asserted below.
      s.hp = 1;
      castActive1(w);
      expect(s.hp, 'harness: Field Kit healed to the maxHp clamp, so the reading is the clamp').toBeLessThan(s.maxHp);
      return s.hp - 1;
    },
  },
  { classKey: 'pyromancer', what: 'Flame Burst damage', read: damageDealt },
  { classKey: 'archer', what: 'Deadeye Draw damage', read: damageDealt },
  {
    classKey: 'necromancer',
    what: "Raise's summonStatMul (each skeleton's dps)",
    read: (w) => {
      // A corpse is what Raise consumes; one is enough, and one also keeps the
      // reading clear of `summonCap`, which binds *count* and not stat share.
      const e = dummy(w, WX + 1, WY, 1);
      w.corpses.push({ id: w.newId(), x: e.x, y: e.y, remaining: 10 });
      castActive1(w);
      const s = w.classSummons.find((k) => k.kind === 'necro_skeleton');
      expect(s, 'harness: Raise summoned no skeleton to read').toBeDefined();
      return s!.dps;
    },
  },
  { classKey: 'cryomancer', what: 'Frost Nova damage', read: damageDealt },
  { classKey: 'stormcaller', what: 'Chain Surge damage', read: damageDealt },
  {
    classKey: 'bloodlord',
    what: "Blood Tithe's titheDamageMul payout on the tithed tower",
    // `classTowerDamageMul` (towers.ts) computes
    // `1 + titheDamageMul * active1PotencyMul(w) + classLineBonus(w)`, so the
    // card moves a term *inside* the multiplier rather than the whole reading.
    ratioFor: (n, perRank) => {
      const t = content.classByKey.get('bloodlord')!.active1.titheDamageMul ?? 0;
      return (1 + t * (1 + perRank * n)) / (1 + t);
    },
    read: (w) => {
      const s = tower(w);
      castActive1(w);
      expect(s.tithed, 'harness: Blood Tithe did not tithe the tower').toBe(true);
      // The payout is only observable through a tower's damage, which is where
      // the first version of this file failed to look.
      return towerDamage(w, s, 100);
    },
  },
  {
    classKey: 'animist',
    what: "Manifest's summonStatMul (the spirit's dps)",
    read: (w) => {
      // Manifest clones a nearby *attacking* tower's profile, so one must exist.
      tower(w);
      castActive1(w);
      const s = w.classSummons.find((k) => k.kind === 'animist_spirit');
      expect(s, 'harness: Manifest summoned no spirit to read').toBeDefined();
      return s!.dps;
    },
  },
  {
    classKey: 'paladin',
    what: "Clarion Taunt's tauntDurationSeconds",
    read: (w) => {
      const e = dummy(w, WX + 1, WY);
      castActive1(w);
      expect(e.tauntRemaining, 'harness: Clarion Taunt taunted nobody').toBeGreaterThan(0);
      return e.tauntRemaining;
    },
  },
  {
    classKey: 'time_lord',
    what: "Time's markPastDotDps (stage 0 -> past)",
    read: (w) => {
      const e = dummy(w, WX + 1, WY);
      castActive1(w);
      expect(e.timeMarkStage, 'harness: Time did not advance the mark to past').toBe(1);
      const dot = e.dots.find((d) => d.dps > 0);
      expect(dot, 'harness: the past-stage mark applied no DoT').toBeDefined();
      return dot!.dps;
    },
  },
];

/** Every *other* class's `active1_potency` card at max rank — the key-leak probe. */
function foreignRanks(classKey: string): Ranks {
  const r: Ranks = {};
  for (const k of CLASS_KEYS) {
    if (k === classKey) continue;
    const card = potencyCard(k);
    r[card.key] = card.maxRank;
  }
  return r;
}

/* ------------------------------------------------------------ the coverage */

describe('c021 — every class is on trial, and every window comes out of /data', () => {
  it('all twelve classes are covered, once each', () => {
    expect(CASES.length).toBe(12);
    expect([...CASES].map((c) => c.classKey).sort()).toEqual([...CLASS_KEYS].sort());
  });

  it('each class authors exactly one active1_potency card, with a usable perRank and maxRank', () => {
    for (const k of CLASS_KEYS) {
      const card = potencyCard(k);
      // A non-positive `perRank` would make every ladder below a tie and read
      // as twelve dead cards; refused here so a bad `/data` row blames itself.
      // (c019 earned this the hard way: an unbounded `perRank` hung a worker.)
      expect(card.perRank, `${k}: /data authors perRank ${card.perRank}; no ladder can separate ranks of a free card`)
        .toBeGreaterThan(0);
      expect(card.maxRank, `${k}: cdr maxRank`).toBeGreaterThanOrEqual(2);
    }
  });

  it('the non-damage kits are derived from /data, not listed — the list was wrong, and that is how c021 shipped a false deviation', () => {
    // **This row used to hardcode four names, and it was six.** QA on the
    // correction traced the original Bloodlord error straight back here:
    // Bloodlord authors `damage: 0` and was never counted as a non-damage kit,
    // so it was slotted as a damage row, measured as one, and its real
    // (non-damage) payout went unlooked-for. A hand-written list of which kits
    // are special is exactly the thing that made "potency is not damage" true
    // in prose and false in the table.
    const nonDamage = content.classes.classes.filter((c) => (c.active1.damage ?? 0) === 0).map((c) => c.key);
    expect([...nonDamage].sort()).toEqual(
      ['animist', 'bloodlord', 'engineer', 'necromancer', 'paladin', 'time_lord'].sort(),
    );
    // And every one of them has a `what` naming a field that is not `damage`,
    // so the table cannot silently regain a damage row.
    for (const k of nonDamage) {
      const row = CASES.find((c) => c.classKey === k)!;
      expect(row.what, `${k} authors damage 0 but its row still claims to measure damage`).not.toMatch(/^\w+ damage$/);
    }
  });
});

/* -------------------------------------------------------------- the ladder */

describe('c021 — each class card moves its own Active1, by exactly its authored rank step', () => {
  for (const c of CASES) {
    const card = potencyCard(c.classKey);

    it(`${c.classKey} ${card.key}: ${c.what} scales by 1 + perRank * rank across ranks 0, 1, 2${
      c.deviation ? ' — NAMED DEVIATION, see below' : ''
    }`, () => {
      const readings = [0, 1, 2].map((n) => c.read(potencyWorld(c.classKey, n === 0 ? {} : { [card.key]: n })));
      expect(
        readings[0],
        `harness: ${c.classKey}'s rank-0 control read ${readings[0]} — nothing to scale`,
      ).toBeGreaterThan(0);

      if (c.deviation) {
        // The deviation is measured, not skipped: the card is asserted *flat*,
        // so wiring it up later reddens this row and forces the decision to be
        // made again on purpose.
        expect(readings[1], `${card.key} rank 1 moved ${c.what} — the deviation is stale: ${c.deviation}`).toBeCloseTo(
          readings[0],
          6,
        );
        expect(readings[2], `${card.key} rank 2 moved ${c.what} — the deviation is stale: ${c.deviation}`).toBeCloseTo(
          readings[0],
          6,
        );
        return;
      }

      for (const n of [1, 2]) {
        // The exact ratio, not "bigger": an implementation that applies the
        // card once and ignores the rank passes a `toBeGreaterThan` ladder.
        const ratio = c.ratioFor ? c.ratioFor(n, card.perRank) : 1 + card.perRank * n;
        expect(readings[n], `${card.key} rank ${n}: ${c.what} was ${readings.join(' -> ')}`).toBeCloseTo(
          readings[0] * ratio,
          6,
        );
      }
      expect(readings[1]).toBeGreaterThan(readings[0]);
      expect(readings[2]).toBeGreaterThan(readings[1]);
    });

    it(`${c.classKey} ${card.key}: every other class's potency card at max rank changes nothing`, () => {
      const own = c.read(potencyWorld(c.classKey, {}));
      const foreign = c.read(potencyWorld(c.classKey, foreignRanks(c.classKey)));
      expect(foreign, `${c.classKey}: another class's card moved ${c.what}`).toBeCloseTo(own, 6);
    });
  }
});

/* ---------------------------------------------------------- the deviations */

describe('c021 — correction: Blood Tithe scales its payout, and only its payout', () => {
  const card = potencyCard('bloodlord');

  it('the HP cost is flat at every rank — the half the card really does not touch', () => {
    // `fireBloodTithe` takes `s.hp * titheHpFraction` with no potency term, so
    // a higher rank does not make the tithe cost more. That is the true, and
    // much narrower, version of what the first draft of this file claimed
    // about the whole kit.
    const cost = [0, card.maxRank].map((n) => {
      const w = potencyWorld('bloodlord', n === 0 ? {} : { [card.key]: n });
      const s = tower(w);
      const before = s.hp;
      castActive1(w);
      return before - s.hp;
    });
    expect(cost[0], 'harness: Blood Tithe took no HP at all').toBeGreaterThan(0);
    expect(cost[1], 'the tithe cost now scales with the card').toBeCloseTo(cost[0], 6);
  });

  it('the damage payout does scale, through towers.ts — the row the first draft missed entirely', () => {
    // The regression that matters: this is the reading that goes flat if
    // `active1PotencyMul` is dropped from `classTowerDamageMul`
    // (`src/sim/towers.ts`), the mutation the first version of this file could
    // not see because it measured only the cost.
    const t = content.classByKey.get('bloodlord')!.active1.titheDamageMul ?? 0;
    expect(t, 'bloodlord authors no titheDamageMul to scale').toBeGreaterThan(0);
    const dmg = [0, 1, 2].map((n) => {
      const w = potencyWorld('bloodlord', n === 0 ? {} : { [card.key]: n });
      const s = tower(w);
      castActive1(w);
      return towerDamage(w, s, 100);
    });
    for (const n of [1, 2]) {
      expect(dmg[n], `rank ${n} tithed tower damage: ${dmg.join(' -> ')}`).toBeCloseTo(
        dmg[0] * ((1 + t * (1 + card.perRank * n)) / (1 + t)),
        6,
      );
    }
    expect(dmg[2]).toBeGreaterThan(dmg[1]);
  });

  it('an untithed tower is untouched by the card, so the ladder is the tithe and not the tower', () => {
    // Without this control the rows above would also pass if potency leaked
    // into some other term of `towerDamage`.
    const plain = [0, card.maxRank].map((n) => {
      const w = potencyWorld('bloodlord', n === 0 ? {} : { [card.key]: n });
      return towerDamage(w, tower(w), 100);
    });
    expect(plain[0], 'harness: the untithed control read nothing, so it controls for nothing').toBeGreaterThan(0);
    expect(plain[1], 'the card moved an untithed tower — it is not the tithe being measured').toBeCloseTo(
      plain[0],
      6,
    );
  });
});

describe('c021 — named deviation 2: Time scales two of its four stages, and only those two', () => {
  const card = potencyCard('time_lord');
  const eff = content.classByKey.get('time_lord')!.active1;

  /**
   * Advances the mark on one enemy `casts` times and returns **only the DoT
   * stacks the final cast added**.
   *
   * The first draft read `Math.max(...e.dots.map(d => d.dps))`, and QA proved
   * that wrong rather than merely risky. Bleeding stacks independently
   * (`data/damagetypes.json`: `maxStacks: 50`), so after two casts the enemy
   * carries *both* the past stack (12 dps) and the present stack (16 dps), and
   * the stage-1 row read the present one only because `markPresentDotDps >
   * markPastDotDps` — an ordering nothing asserted. Under a plausible ⚖ nerf
   * of `markPresentDotDps` to 8, dropping the present stage's potency wiring
   * entirely left the file **33/33 green**: `topDot` silently switched to the
   * past stack, which carries the same 1.5 ratio, and the assertion passed for
   * the wrong reason. Reading the stack the cast under test actually appended
   * removes the ambiguity instead of documenting it.
   */
  function stageDots(ranks: Ranks, casts: number, elite = false): { added: number[]; e: Enemy; hpBefore: number } {
    const w = potencyWorld('time_lord', ranks);
    const e = dummy(w, WX + 1, WY);
    e.elite = elite;
    let before: number[] = [];
    let hpBefore = e.hp;
    for (let i = 0; i < casts; i++) {
      before = e.dots.map((d) => d.dps);
      hpBefore = e.hp;
      // Time is `maxCharges`-gated (3 charges, 6 s recharge), so the fourth
      // cast has to *wait* for a real recharge rather than being forced. Ticked
      // through the real `updateWarden` until the gate opens, bounded so a
      // `/data` retune that makes it unreachable fails as a harness error
      // rather than hanging the worker (c019's `MAX_CADENCES` lesson).
      let landed = false;
      for (let t = 0; t < 60 * 120 && !landed; t++) {
        landed = useClassActive(w, WX + 1, WY);
        if (!landed) updateWarden(w, idle(), DT);
      }
      expect(landed, `harness: Time cast ${i + 1} never landed within 120s of recharge`).toBe(true);
      updateWarden(w, idle(), DT);
    }
    // Whatever this last cast appended, identified by position rather than by
    // being the largest.
    const added = e.dots.map((d) => d.dps).slice(before.length);
    return { added, e, hpBefore };
  }

  /**
   * The authored dps as the sim scales it for this character at rank 0 — so
   * the stage-identification assertions below name *which* `/data` figure each
   * stack came from, rather than only that two numbers have the right ratio.
   */
  function characterDamageOf(dps: number): number {
    const w = potencyWorld('time_lord', {});
    return characterDamage(w, content.classByKey.get('time_lord')!, dps);
  }

  /** The one stack the cast under test added — asserted to be exactly one, never assumed. */
  function addedDot(ranks: Ranks, casts: number): number {
    const { added } = stageDots(ranks, casts);
    expect(added.length, `cast ${casts} appended ${added.length} DoT stacks, not one`).toBe(1);
    return added[0];
  }

  it('the two authored dps figures are ordered as the harness assumed — pinned, since a retune flips it', () => {
    // The precondition the first draft relied on silently. It no longer decides
    // which stack is read, but it is worth knowing when it changes.
    expect(eff.markPastDotDps, 'past stage authors no dps').toBeGreaterThan(0);
    expect(eff.markPresentDotDps, 'present stage authors no dps').toBeGreaterThan(0);
  });

  it('stage 0 -> past: the DoT scales with the card', () => {
    const zero = addedDot({}, 1);
    const two = addedDot({ [card.key]: 2 }, 1);
    expect(zero).toBeCloseTo(characterDamageOf(eff.markPastDotDps ?? 0), 6);
    expect(two).toBeCloseTo(zero * (1 + card.perRank * 2), 6);
  });

  it('stage 1 -> present: the DoT scales with the card, read off its own stack', () => {
    const zero = addedDot({}, 2);
    const two = addedDot({ [card.key]: 2 }, 2);
    // Identified: this is the *present* stage's stack, not the past stage's.
    expect(zero).toBeCloseTo(characterDamageOf(eff.markPresentDotDps ?? 0), 6);
    expect(two).toBeCloseTo(zero * (1 + card.perRank * 2), 6);
  });

  it('stage 2 -> future: the DoT is the target\'s remaining HP and is flat across ranks', () => {
    // **Executed, not merely asserted from the schema.** The first draft's
    // third row was a `/data` key check, so `advanceTimeMark`'s stage-2 and
    // stage-3 branches were never entered by this file at all — adding a
    // potency term to either left 33/33 green here and green across ten other
    // files (QA). A deviation that says "only those two stages" has to run the
    // other two.
    const zero = addedDot({}, 3);
    const two = addedDot({ [card.key]: 2 }, 3);
    expect(zero, 'harness: the future stage applied no DoT').toBeGreaterThan(0);
    expect(two, 'the future stage now scales with the card — deviation 2 is stale').toBeCloseTo(zero, 6);
  });

  it('stage 3 -> executed (elite): the execute spend is flat across ranks', () => {
    // `markEliteExecuteFraction` **is** an authored `/data` magnitude, which
    // the first draft's wording denied ("neither is a /data magnitude there is
    // anything to multiply"). It is exactly the kind of number a future change
    // could scale, so it gets a behavioural row rather than a schema guard.
    expect(eff.markEliteExecuteFraction, 'the elite execute fraction is no longer authored').toBeGreaterThan(0);
    const spend = (ranks: Ranks): number => {
      const { e, hpBefore } = stageDots(ranks, 4, true);
      return hpBefore - e.hp;
    };
    const zero = spend({});
    expect(zero, 'harness: the elite execute took no HP').toBeGreaterThan(0);
    expect(spend({ [card.key]: 2 }), 'the elite execute now scales with the card — deviation 2 is stale').toBeCloseTo(
      zero,
      6,
    );
  });

  it('no future-stage dps figure has appeared for potency to reach', () => {
    // Kept from the first draft, and widened: `markEliteExecuteFraction` is
    // named here too, so the schema guard covers both magnitudes the later
    // stages actually carry rather than only the one that does not exist.
    const futureDps = Object.keys(eff).filter((k) => /^markFuture.*Dps$/.test(k));
    expect(
      futureDps,
      'the future stage now authors a dps figure — it is no longer HP-derived, so potency should reach it',
    ).toEqual([]);
    expect(Object.keys(eff)).toContain('markEliteExecuteFraction');
  });
});

/* ------------------------- c021: potency reaches its magnitude and only it */

/**
 * **The negative half, which the first version of this file had none of.**
 * Filed by QA: three simultaneous mutations — potency over-reaching into Field
 * Kit's `overclockSeconds` and Poison Barrel's `groundDurationSeconds`, and
 * *under*-reaching so it scaled only Chain Surge's first jump — left all 33
 * rows green. Every row measured "the named magnitude went up" and nothing
 * measured "and nothing else moved".
 *
 * Two shapes are needed, because the two failure modes are different:
 *
 *  - **Over-reach**: the card silently buys more than its sentence. Caught by
 *    asserting the Active's *other* authored `/data` fields are flat across
 *    ranks — durations, radii, lifetimes.
 *  - **Under-reach**: the card silently buys less. Caught by making a
 *    multi-target Active actually hit multiple targets; `damageDealt` spawns
 *    one dummy, so Chain Surge's jumps 1..n were never exercised at all.
 */
describe('c021 — the card moves its named magnitude and nothing else', () => {
  /**
   * Companion observables per class: an authored `/data` field of the same
   * Active that potency is *not* supposed to touch, read after one cast.
   * Absent for kits whose Active1 authors no second magnitude.
   */
  const COMPANIONS: Array<{ classKey: string; field: string; read: (w: World) => number }> = [
    {
      classKey: 'engineer',
      field: 'overclockSeconds (the Field Kit buff window)',
      read: (w) => {
        const s = tower(w);
        s.hp = 1;
        castActive1(w);
        return s.atkSpdBuffRemaining;
      },
    },
    {
      classKey: 'plaguebringer',
      field: 'groundDurationSeconds and radius (the barrel itself, not its dps)',
      read: (w) => {
        castActive1(w);
        const a = w.areas.find((x) => x.type === 'poison')!;
        // Both at once: a single number that moves if either does.
        return a.remaining * 1000 + a.radius;
      },
    },
    {
      classKey: 'necromancer',
      field: 'summonDurationSeconds (how long the skeleton lives, not its dps)',
      read: (w) => {
        const e = dummy(w, WX + 1, WY, 1);
        w.corpses.push({ id: w.newId(), x: e.x, y: e.y, remaining: 10 });
        castActive1(w);
        return w.classSummons.find((k) => k.kind === 'necro_skeleton')!.remaining;
      },
    },
    {
      classKey: 'animist',
      field: 'summonDurationSeconds (the spirit\'s lifetime, not its dps)',
      read: (w) => {
        tower(w);
        castActive1(w);
        return w.classSummons.find((k) => k.kind === 'animist_spirit')!.remaining;
      },
    },
    {
      classKey: 'time_lord',
      field: 'markPastDotSeconds (the DoT window, not its dps)',
      read: (w) => {
        const e = dummy(w, WX + 1, WY);
        castActive1(w);
        return e.dots[0].remaining;
      },
    },
  ];

  for (const c of COMPANIONS) {
    const card = potencyCard(c.classKey);
    it(`${c.classKey}: ${c.field} is flat across ranks 0 and ${card.maxRank}`, () => {
      const zero = c.read(potencyWorld(c.classKey, {}));
      expect(zero, `harness: ${c.classKey}'s companion observable read nothing`).toBeGreaterThan(0);
      expect(
        c.read(potencyWorld(c.classKey, { [card.key]: card.maxRank })),
        `${c.classKey}: the potency card moved ${c.field}, which its sentence does not name`,
      ).toBeCloseTo(zero, 6);
    });
  }

  it('stormcaller: potency scales every chain jump, not just the first', () => {
    // `damageDealt` spawns one dummy, so jumps 1..n were never exercised. A
    // mutation scaling only jump 0 halved the card in every real fight and left
    // the file green (QA). Spacing follows `class-passive-magnitudes`'s: clear
    // of Electric's own inherent splash, inside the Active's authored reach.
    const eff = content.classByKey.get('stormcaller')!.active1;
    const splash = content.damageTypeByKey.get('electric')!.radius ?? 0;
    const spacing = Math.min(2, eff.radius * 0.9);
    expect(spacing, 'harness needs links spaced clear of Electric’s own blast').toBeGreaterThan(splash * 1.2);

    const card = potencyCard('stormcaller');
    const totalOverChain = (ranks: Ranks): number => {
      const w = potencyWorld('stormcaller', ranks);
      const line = [1, 2, 3].map((i) => dummy(w, WX + i * spacing, WY));
      const before = line.map((e) => e.hp);
      expect(useClassActive(w, WX + spacing, WY), 'harness: Chain Surge did not fire').toBe(true);
      // Every link that took damage, summed — so a card that reaches only the
      // first jump reads strictly lower than one that reaches all of them.
      return line.reduce((sum, e, i) => sum + (before[i] - e.hp), 0);
    };
    const hit = (ranks: Ranks): number => {
      const w = potencyWorld('stormcaller', ranks);
      const line = [1, 2, 3].map((i) => dummy(w, WX + i * spacing, WY));
      const before = line.map((e) => e.hp);
      useClassActive(w, WX + spacing, WY);
      return line.filter((e, i) => before[i] - e.hp > 0).length;
    };
    expect(hit({}), 'harness: the chain reached fewer than two links, so jumps are untested').toBeGreaterThan(1);

    const zero = totalOverChain({});
    expect(zero).toBeGreaterThan(0);
    for (const n of [1, 2]) {
      expect(
        totalOverChain({ [card.key]: n }),
        `stormcaller rank ${n}: the card did not scale the whole chain`,
      ).toBeCloseTo(zero * (1 + card.perRank * n), 6);
    }
  });

  it("an Active1 potency card never scales an Active2 payout — the death_pact branch next door", () => {
    // The correction made `towers.ts`'s `classTowerDamageMul` load-bearing for
    // this file, but only its tithe branch was watched. Its sibling
    // `death_pact` branch (necromancer, `pactDamageMul`) was not: scaling that
    // by `active1PotencyMul` left this file and `class-active2-cdr` and
    // `class-line-bonus` all green (QA).
    const card = potencyCard('necromancer');
    const pacted = (ranks: Ranks): number => {
      const w = potencyWorld('necromancer', ranks);
      const s = tower(w);
      expect(useClassActive2(w, WX + 1, WY), 'harness: Death Pact did not fire').toBe(true);
      expect(s.pactActive, 'harness: Death Pact did not pact the tower').toBe(true);
      return towerDamage(w, s, 100);
    };
    const zero = pacted({});
    expect(zero).toBeGreaterThan(0);
    expect(
      pacted({ [card.key]: card.maxRank }),
      "the Active1 potency card scaled Death Pact's Active2 payout",
    ).toBeCloseTo(zero, 6);
  });
});
