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
 * **Two named deviations, `c019`'s convention: never silence.**
 *
 *  1. **Bloodlord *Blood Tithe* ignores the card completely.** `fireBloodTithe`
 *     (`classes.ts`) never calls `active1PotencyMul`, so
 *     `bloodlord_active1_potency` is inert on the whole kit at every rank —
 *     the one card of the twelve that buys nothing. It is not a clamp
 *     collision like the ones the item warned about; the Active's payout
 *     (`titheDamageMul`, "+25% dmg" on the tithed tower) is applied in
 *     `towers.ts`, and wiring potency into it would edit a file outside this
 *     lane's Scope. So this file **measures and pins** the zero, and the fix is
 *     logged for the main lane — the shape `c013` and `c023` already use here.
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

import { tickClassCharge, useClassActive } from '../src/sim/classes';
import { loadContent, type SkillCardDef } from '../src/sim/content';
import { spawnEnemy } from '../src/sim/enemies';
import { buildTower } from '../src/sim/towers';
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
   * *not* to move, with the reason. Absent on the ten live rows.
   */
  deviation?: string;
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
    what: "Blood Tithe's payout",
    deviation:
      'fireBloodTithe never calls active1PotencyMul. Its payout (titheDamageMul, "+25% dmg" on the ' +
      'tithed tower) is applied in towers.ts, outside this lane\'s Scope — logged for the main lane.',
    read: (w) => {
      const s = tower(w);
      const before = s.hp;
      castActive1(w);
      expect(s.tithed, 'harness: Blood Tithe did not tithe the tower').toBe(true);
      return before - s.hp;
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

  it('the four non-damage kits are named, not assumed — /data really authors them damage 0', () => {
    // The table in this file's header, asserted. If a kit gains a `damage`
    // figure, this row says so and the header needs re-reading.
    for (const k of ['engineer', 'necromancer', 'animist', 'paladin']) {
      expect(content.classByKey.get(k)!.active1.damage, `${k} Active1 damage`).toBe(0);
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
        expect(readings[n], `${card.key} rank ${n}: ${c.what} was ${readings.join(' -> ')}`).toBeCloseTo(
          readings[0] * (1 + card.perRank * n),
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

describe('c021 — named deviation 1: Blood Tithe is the one card of the twelve that buys nothing', () => {
  it('fireBloodTithe never reads the card: the tower pays the same HP at every rank', () => {
    const card = potencyCard('bloodlord');
    const cost = [0, card.maxRank].map((n) => {
      const w = potencyWorld('bloodlord', n === 0 ? {} : { [card.key]: n });
      const s = tower(w);
      const before = s.hp;
      castActive1(w);
      return before - s.hp;
    });
    expect(cost[0], 'harness: Blood Tithe took no HP at all').toBeGreaterThan(0);
    expect(cost[1], 'Blood Tithe now scales with the card — deviation 1 is stale').toBeCloseTo(cost[0], 6);
  });

  it("the payout it *should* scale lives in towers.ts, which is why this is a measurement and not a fix", () => {
    // Both halves out of `/data`, so the main-lane fix has a target: the cost
    // is `titheHpFraction` and the payout is `titheDamageMul`. Neither is
    // reachable from `active1PotencyMul` today.
    const eff = content.classByKey.get('bloodlord')!.active1;
    expect(eff.titheHpFraction, 'bloodlord Active1 authors no titheHpFraction').toBeGreaterThan(0);
    expect(eff.titheDamageMul, 'bloodlord Active1 authors no titheDamageMul for the main lane to scale').toBeGreaterThan(
      0,
    );
  });
});

describe('c021 — named deviation 2: Time scales two of its four stages, and only those two', () => {
  const card = potencyCard('time_lord');

  /** Advances the mark on one enemy `casts` times, returning it and its world. */
  function marked(ranks: Ranks, casts: number): Enemy {
    const w = potencyWorld('time_lord', ranks);
    const e = dummy(w, WX + 1, WY);
    for (let i = 0; i < casts; i++) {
      expect(useClassActive(w, WX + 1, WY), `harness: Time cast ${i + 1} did not land`).toBe(true);
      // Time is `maxCharges`-gated; the real `updateWarden` recharges it, so
      // the second cast is a real second cast rather than a bypassed gate.
      updateWarden(w, idle(), DT);
    }
    return e;
  }

  /** The largest DoT dps on the enemy — each stage adds its own stack. */
  function topDot(e: Enemy): number {
    expect(e.dots.length, 'harness: the mark applied no DoT').toBeGreaterThan(0);
    return Math.max(...e.dots.map((d) => d.dps));
  }

  it('stage 0 -> past: the DoT scales with the card', () => {
    const zero = topDot(marked({}, 1));
    const two = topDot(marked({ [card.key]: 2 }, 1));
    expect(two).toBeCloseTo(zero * (1 + card.perRank * 2), 6);
  });

  it('stage 1 -> present: the DoT scales with the card', () => {
    const zero = topDot(marked({}, 2));
    const two = topDot(marked({ [card.key]: 2 }, 2));
    expect(two).toBeCloseTo(zero * (1 + card.perRank * 2), 6);
  });

  it('stage 2 -> future is authored as remaining HP, so there is no /data magnitude to scale', () => {
    // Not a gap: `advanceTimeMark`'s future stage deals "DoT equal to remaining
    // HP" (§4.2), and stage 3 is an instant kill. Pinned so the partial reach
    // is a decision on record rather than something read later as a bug.
    const eff = content.classByKey.get('time_lord')!.active1;
    expect(eff.markPastDotDps, 'past stage authors no dps').toBeGreaterThan(0);
    expect(eff.markPresentDotDps, 'present stage authors no dps').toBeGreaterThan(0);
    // Asked of the authored keys rather than a property access: there is no
    // `markFuture*Dps` in the schema at all today, which is the fact being
    // pinned, and naming one directly would not even compile.
    const futureDps = Object.keys(eff).filter((k) => /^markFuture.*Dps$/.test(k));
    expect(
      futureDps,
      'the future stage now authors a dps figure — it is no longer HP-derived, so potency should reach it',
    ).toEqual([]);
  });
});
