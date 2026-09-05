/**
 * c005 (BACKLOG-CONTENT, lane `content`) — **no class Active is a silent
 * no-op.**
 *
 * `content.ts`'s `REQUIRED_EFFECT_FIELDS` already refuses *unpayable* kit
 * data: a `dash_heal` with no `healPerEnemy`, a `time_lock` with no
 * `zoneDotSeconds`. Its own comment names the failure it exists to prevent —
 * "an Active that fires and does nothing". But a required-field table can
 * only check the authored row; it cannot check that `useClassActive`'s
 * dispatch switch still *handles* the kind that row names. That second half
 * is the gap this file closes, and it is not hypothetical: `useClassActive`'s
 * own comments record it biting p6b twice, both times as a cooldown consumed
 * by a kind the switch never matched.
 *
 * **What "live" means here, precisely.** Each of the 24 Actives (12 classes x
 * Active1/Active2) is fired once in a real `World` that has been given
 * whatever the Active needs to act on — an enemy, a built tower, a corpse, a
 * poison stack, banked Wrath — and must change at least one entry of
 * `OBSERVABLES` (below). The check is a *diff of world state*, not a call to
 * a kind-specific getter, so it stays honest as kits are retuned: no row here
 * asserts a magnitude, and no row restates a number from
 * `data/classes.json`.
 *
 * **This is a liveness gate, not a completeness gate**, and the difference
 * matters for an Active with two authored clauses: "changed at least one
 * observable" is satisfied by either half, so deleting Field Kit's repair (or
 * its overclock), or Clarion Taunt's enemy tag (keeping its Wrath window),
 * passes here. QA confirmed all four such half-guts are caught by
 * `tests/p6d-nine-classes.test.ts`, which is the per-clause owner. What this
 * file owns is the whole-Active case: QA gutted all 24 bodies outright and
 * every one came out red.
 *
 * **What is deliberately excluded from the observable set**, because
 * including it would make the test pass for exactly the bug it hunts:
 *   - `w.fx` — a cast flash is cosmetic. `fireEffect` emits one before it
 *     knows whether anything was in radius, so an fx-only "change" is the
 *     silent no-op wearing a costume.
 *   - the cooldown/ammo fields (`active1Cooldown`, `active1Ammo`, ...) —
 *     paying the cost *is* the p6b symptom, not evidence of an effect.
 *   - the charge fields (`active1Charge`) — same reason, one step earlier.
 *   - `w.rng` stream state and `w.gold` — an Active that only burns a roll or
 *     refunds a build cost (Ice Wall's placement loop does both) has still
 *     done nothing observable to the run.
 *
 * The last `describe` is the harness-honesty half c005's acceptance asks for
 * ("a kind removed from the dispatch switch fails the test"). It does not
 * edit `classes.ts`: it rebuilds `Content` from a copy of `data/classes.json`
 * with one Active's `kind` swapped to a kind the *other* slot's switch owns
 * (`poison_boost` is Active2-only, `frost_nova` Active1-only), which is
 * exactly the state a deleted `case` leaves behind — the `default` branch.
 * Both then have to come out no-op, and the shared assertion has to say so.
 */
import { describe, expect, it } from 'vitest';

import { tickClassCharge, useClassActive, useClassActive2 } from '../src/sim/classes';
import { loadContent, type ClassDef, type Content } from '../src/sim/content';
import { applyDot, killEnemy, spawnEnemy } from '../src/sim/enemies';
import { buildTower } from '../src/sim/towers';
import type { Enemy, TickInput } from '../src/sim/types';
import { World } from '../src/sim/world';
import { BUILD_TX, BUILD_TY, WX, WY } from './class-board';
import { cfg } from './helpers';

const content = loadContent();

function kitWorld(classKey: string, c: Content = content): World {
  const w = new World(cfg({ classKey }), c);
  w.gold = 1e6;
  // The basic attack would change enemy hp on its own, which is precisely the
  // observable most rows read — suppress it, the p6b/p6c/c001 convention.
  w.warden.attackCooldown = 1e9;
  w.warden.x = WX;
  w.warden.y = WY;
  // c005's acceptance says "in a real `World` with enemies present", and QA
  // found ten of the 24 rows had none — a third of the table never exercised
  // the enemies-exist path of its own Active. This bystander fixes that, and
  // it sits at distance 10 from the Warden, outside the largest authored
  // footprint in the game (Time's r7), so no row can start passing *on* it.
  dummy(w, WX + 8, WY + 6);
  return w;
}

function idle(over: Partial<TickInput> = {}): TickInput {
  return { mx: 0, my: 0, dash: false, attack: false, aimX: 0, aimY: 0, active1Held: false, cmds: [], ...over };
}

function dummy(w: World, x: number, y: number): Enemy {
  const e = spawnEnemy(w, content.enemies.enemies[0].key, x, y)!;
  e.hp = 1e6;
  e.maxHp = 1e6;
  e.speed = 0;
  e.armor = 0;
  w.rebuildBuckets();
  return e;
}

/** An arrow_spire at `(tx, ty)`, the shape Field Kit / Blood Tithe / Death Pact / Manifest all need. */
function tower(w: World, tx: number, ty: number) {
  const res = buildTower(w, content.towerByKey.get('arrow_spire')!.id, tx, ty);
  expect(res.ok, `harness could not place a tower at ${tx},${ty}`).toBe(true);
  return w.structureAt(tx, ty)!;
}

/* ------------------------------------------------------------- observables */

/**
 * The world state an Active is allowed to prove itself through — c005's
 * acceptance list ("enemy hp/status, `w.areas`, `w.classSummons`,
 * `w.structures`, Warden position/hp"), spelled out field by field so the
 * diff below is a decision rather than a `JSON.stringify(w)`.
 */
function observe(w: World): string {
  const wd = w.warden;
  return JSON.stringify({
    enemies: w.enemies.map((e) => [
      e.id,
      e.hp,
      e.dead,
      e.x,
      e.y,
      e.armorShred,
      e.slowRemaining,
      e.slowAmount,
      e.atkSlowRemaining,
      e.atkSlowAmount,
      e.frostRemaining,
      e.frozenRemaining,
      e.frostHitStacks,
      e.tauntRemaining,
      e.tauntKind,
      e.timeMarkStage,
      e.timeLockZoneId,
      e.dots.map((d) => [d.type, d.dps, d.remaining]),
    ]),
    areas: w.areas.map((a) => [a.id, a.type, a.x, a.y, a.radius, a.dps, a.remaining, a.dead]),
    summons: w.classSummons.map((s) => [s.id, s.kind, s.x, s.y, s.dps, s.remaining, s.isAura ?? false, s.auraRadius ?? 0]),
    structures: w.structures.map((s) => [
      s.id,
      s.tx,
      s.ty,
      s.hp,
      s.maxHp,
      s.dead,
      s.pactActive,
      s.tithed,
      s.atkSpdBuffRemaining,
    ]),
    timeLock: w.timeLockZone
      ? [w.timeLockZone.id, w.timeLockZone.x, w.timeLockZone.y, w.timeLockZone.radius, w.timeLockZone.remaining]
      : null,
    // Warden position/hp, plus the two Warden fields that are some Active's
    // *whole* product: Overload's window and Clarion Taunt's Wrath-banking
    // window, each written by exactly one Active and nothing else.
    //
    // Two fields code review had to take back out of this tuple, because both
    // let a half-dead effect pass (c005 review, Major x2):
    //   - `dashTravel` — shared machinery. `startDashTravel` (wardenmove.ts)
    //     is called by all four dash kinds and does not move `x`/`y` at cast
    //     (fb030 made a dash a travel), so the flag flips identically whether
    //     or not the Active's payload ran. A Flame Road with its trail loop
    //     deleted, or a Crimson Rush with its heal deleted, would still pass.
    //   - `wrathStored` — a cost, not a product. `fireJudgement` zeroes it
    //     before its own `rawWrath > 0` guard, so the Paladin Active2 row
    //     would diff with the nova removed. Spent input, same category as the
    //     ammo/cooldown fields this file already excludes.
    // Both rows stay green on their real product (enemy hp, `w.areas`, the
    // heal) with the fields gone, which is the point.
    warden: [wd.x, wd.y, wd.hp, wd.overloadRemaining, wd.clarionRemaining],
  });
}

/* ------------------------------------------------------------------- cases */

interface KitCase {
  classKey: string;
  slot: 1 | 2;
  /** Everything the Active needs to have something to act on. Runs before the snapshot. */
  setup?: (w: World) => void;
  /**
   * Fires the Active exactly once. Returns what the sim reported for the 22
   * Command-driven kinds; `void` for the two charge kinds, whose Command
   * deliberately reports nothing (see `chargeAndRelease`).
   */
  fire: (w: World) => boolean | void;
}

/**
 * Holds a charge Active to full and releases it — Circle Slash / Deadeye
 * Draw's only firing path. Held at 60 Hz rather than in one giant `dt`: the
 * clamp in `circleSlashValues` would make a single `cap * 2` tick work today,
 * but only by accident, and a harness that takes a path no real run takes
 * stops being evidence about real runs (c005 review).
 *
 * A charge kind fires from the release tick, not from a Command, so
 * `useClassActive` deliberately reports false for it (p6b) — there is no
 * boolean worth returning here, and the state diff is the whole assertion.
 */
function chargeAndRelease(w: World, aimX: number, aimY: number): void {
  const cls = w.content.classByKey.get(w.cfg.classKey)!;
  const cap = cls.active1.chargeCapSeconds ?? 3;
  const aim = { aimX, aimY };
  for (let t = 0; t < Math.ceil(cap * 60) + 1; t++) {
    tickClassCharge(w, cls, idle({ ...aim, active1Held: true }), 1 / 60);
  }
  tickClassCharge(w, cls, idle({ ...aim, active1Held: false }), 1 / 60);
}

const CASES: readonly KitCase[] = [
  {
    classKey: 'swordsman',
    slot: 1, // Circle Slash (charge_nova)
    setup: (w) => void dummy(w, WX + 1, WY),
    fire: (w) => void chargeAndRelease(w, WX + 1, WY),
  },
  {
    classKey: 'swordsman',
    slot: 2, // Dash Slash (dash_line)
    setup: (w) => void dummy(w, WX + 2, WY),
    fire: (w) => useClassActive2(w, WX + 5, WY),
  },
  {
    classKey: 'plaguebringer',
    slot: 1, // Poison Barrel (ground_poison)
    fire: (w) => useClassActive(w),
  },
  {
    classKey: 'plaguebringer',
    slot: 2, // Poison Boost (poison_boost) — doubles what is already ticking, so it needs a stack to double
    setup: (w) => applyDot(w, dummy(w, WX + 1, WY), 'poison', 10, 5, 'test'),
    fire: (w) => useClassActive2(w),
  },
  {
    classKey: 'engineer',
    slot: 1, // Field Kit (repair_heal)
    setup: (w) => {
      const s = tower(w, BUILD_TX, BUILD_TY);
      s.hp = s.maxHp * 0.2;
    },
    fire: (w) => useClassActive(w, WX + 1, WY),
  },
  {
    classKey: 'engineer',
    slot: 2, // Pop Turret (summon_turret)
    fire: (w) => useClassActive2(w),
  },
  {
    classKey: 'pyromancer',
    slot: 1, // Immolation Wave (burst_damage)
    setup: (w) => void dummy(w, WX + 1, WY),
    fire: (w) => useClassActive(w),
  },
  {
    classKey: 'pyromancer',
    slot: 2, // Flame Road (dash_trail)
    fire: (w) => useClassActive2(w, WX + 5, WY),
  },
  {
    classKey: 'archer',
    slot: 1, // Deadeye Draw (charge_pierce)
    setup: (w) => void dummy(w, WX + 3, WY),
    fire: (w) => void chargeAndRelease(w, WX + 3, WY),
  },
  {
    classKey: 'archer',
    slot: 2, // Quickstep (dash_volley)
    setup: (w) => void dummy(w, WX + 1, WY),
    fire: (w) => useClassActive2(w, WX + 3, WY),
  },
  {
    classKey: 'necromancer',
    slot: 1, // Raise (raise_skeletons) — needs corpses, which only its own passive leaves
    setup: (w) => {
      for (let i = 0; i < 3; i++) killEnemy(w, dummy(w, WX + 1 + i, WY), 'test');
      expect(w.corpses.length, 'harness left no corpse for Raise to consume').toBeGreaterThan(0);
    },
    fire: (w) => useClassActive(w),
  },
  {
    classKey: 'necromancer',
    slot: 2, // Death Pact (death_pact)
    setup: (w) => void tower(w, BUILD_TX, BUILD_TY),
    fire: (w) => useClassActive2(w, WX + 1, WY),
  },
  {
    classKey: 'cryomancer',
    slot: 1, // Glaciate (frost_nova)
    setup: (w) => void dummy(w, WX + 1, WY),
    fire: (w) => useClassActive(w),
  },
  {
    classKey: 'cryomancer',
    slot: 2, // Ice Wall (ice_wall)
    fire: (w) => useClassActive2(w, WX + 3, WY),
  },
  {
    classKey: 'stormcaller',
    slot: 1, // Chain Surge (chain_lightning)
    setup: (w) => void dummy(w, WX + 1, WY),
    fire: (w) => useClassActive(w, WX + 1, WY),
  },
  {
    classKey: 'stormcaller',
    slot: 2, // Overload (overload) — a pure window, whose only product is Warden state
    fire: (w) => useClassActive2(w),
  },
  {
    classKey: 'bloodlord',
    slot: 1, // Blood Tithe (blood_tithe)
    setup: (w) => {
      // QA: `s.hp` shrinking is what the tower *pays*; `s.tithed` is the whole
      // product (the permanent +25%). With hp in the observable set the row
      // passed with `s.tithed = true` deleted — a tower paying 30% of its HP
      // for nothing, which is strictly worse than a no-op. `fireBloodTithe`
      // floors the payment at 1 hp (`Math.max(1, ...)`), so a target already
      // at 1 hp cannot move on the cost axis and the row has only `tithed`
      // left to prove itself with. `hp` stays in `observe()` because Field
      // Kit's row genuinely needs it.
      tower(w, BUILD_TX, BUILD_TY).hp = 1;
    },
    fire: (w) => useClassActive(w, WX + 1, WY),
  },
  {
    classKey: 'bloodlord',
    slot: 2, // Crimson Rush (dash_heal)
    setup: (w) => {
      dummy(w, WX + 2, WY);
      w.warden.hp = 1; // room for the per-enemy heal to actually land
    },
    fire: (w) => useClassActive2(w, WX + 6, WY),
  },
  {
    classKey: 'animist',
    slot: 1, // Manifest (manifest_spirit) — clones a built tower, so there has to be one
    setup: (w) => void tower(w, BUILD_TX, BUILD_TY),
    fire: (w) => useClassActive(w),
  },
  {
    classKey: 'animist',
    slot: 2, // Recall Totem (recall_totem)
    fire: (w) => useClassActive2(w),
  },
  {
    classKey: 'paladin',
    slot: 1, // Clarion Taunt (clarion_taunt)
    setup: (w) => void dummy(w, WX + 1, WY),
    fire: (w) => useClassActive(w),
  },
  {
    classKey: 'paladin',
    slot: 2, // Judgement (judgement) — spends banked Wrath, so it needs a bank
    setup: (w) => {
      dummy(w, WX + 1, WY);
      w.warden.wrathStored = 500;
    },
    fire: (w) => useClassActive2(w),
  },
  {
    classKey: 'time_lord',
    slot: 1, // Time (time_mark)
    setup: (w) => void dummy(w, WX + 1, WY),
    fire: (w) => useClassActive(w),
  },
  {
    classKey: 'time_lord',
    slot: 2, // Time Lock (time_lock)
    setup: (w) => void dummy(w, WX + 2, WY),
    fire: (w) => useClassActive2(w, WX + 2, WY),
  },
];

function label(c: KitCase, cls: ClassDef): string {
  const eff = c.slot === 1 ? cls.active1 : cls.active2;
  return `${cls.name} ${eff.name} (Active${c.slot}, ${eff.kind})`;
}

/* ------------------------------------------------------------------- tests */

describe('c005: every §4 class Active changes something observable', () => {
  it('covers all 24 Actives — every class, both slots, exactly once', () => {
    expect(content.classes.classes).toHaveLength(12);
    const seen = CASES.map((c) => `${c.classKey}:${c.slot}`);
    expect(new Set(seen).size, 'a duplicated case row').toBe(seen.length);
    const wanted = content.classes.classes.flatMap((c) => [`${c.key}:1`, `${c.key}:2`]);
    expect([...seen].sort()).toEqual([...wanted].sort());
  });

  it('every case really does fire with a live enemy in the world (the acceptance clause, self-enforcing)', () => {
    for (const c of CASES) {
      const w = kitWorld(c.classKey);
      c.setup?.(w);
      const cls = content.classByKey.get(c.classKey)!;
      expect(
        w.enemies.some((e) => !e.dead),
        `${label(c, cls)} fires into a world with no live enemy`,
      ).toBe(true);
    }
  });

  for (const c of CASES) {
    const cls = content.classByKey.get(c.classKey)!;
    it(`${label(c, cls)} is not a no-op`, () => {
      const w = kitWorld(c.classKey);
      c.setup?.(w);
      const before = observe(w);
      c.fire(w);
      expect(observe(w), 'fired, paid its cost, and changed nothing observable').not.toBe(before);
    });
  }

  /**
   * The Command-driven twenty-two also have a return value, and p6b's bug was
   * that it lied: the switch matched nothing, `useClassActive` returned early
   * from `default`, and yet the cooldown had already been set.
   *
   * Scope of this loop, stated plainly because it reads stronger than it is
   * (c005 review): a `true` here proves only that the *dispatch* found a case,
   * not that the case did anything — six kinds (`repair_heal`, `blood_tithe`,
   * `death_pact`, `manifest_spirit`, `chain_lightning`, `ice_wall`) return
   * `true` even when their fire function early-returns with no target. The
   * state-diff loop above is the real assertion; this one pins the other
   * direction, an Active with an effect that reports failure. The two charge
   * kinds are excluded because their Command deliberately returns false (they
   * fire from `tickClassCharge`'s release).
   */
  for (const c of CASES) {
    const cls = content.classByKey.get(c.classKey)!;
    const eff = c.slot === 1 ? cls.active1 : cls.active2;
    if (eff.kind === 'charge_nova' || eff.kind === 'charge_pierce') continue;
    it(`${label(c, cls)} reports the cast it actually performed`, () => {
      const w = kitWorld(c.classKey);
      c.setup?.(w);
      expect(c.fire(w), 'the dispatch switch did not handle this kind').toBe(true);
    });
  }
});

describe('c005: the harness fails when a kind loses its dispatch case', () => {
  /**
   * `Content` rebuilt from a copy of `data/classes.json` with one Active's
   * `kind` swapped for a kind the *other* slot's switch owns. `poison_boost`
   * and `frost_nova` are both authored kinds with no `REQUIRED_EFFECT_FIELDS`
   * row, so the loader accepts them and the only thing that changes is which
   * `case` the dispatch finds — none, exactly as a deleted case leaves it.
   * (Most swaps cannot get this far: `repair_heal`, `dash_heal` and the rest
   * of the table are refused at load for the fields the new kind needs and
   * the old row never authored. `REQUIRED_EFFECT_FIELDS` has 18 rows against
   * 23 authored kinds, so six are uncovered — `charge_nova`, `dash_line`,
   * `ground_poison`, `poison_boost`, `burst_damage`, `frost_nova` — of which
   * the ones usable for *this* swap are the three the other slot's switch
   * does not own: `{charge_nova, dash_line, poison_boost}` for an Active1
   * swap, `{charge_nova, ground_poison, frost_nova}` for an Active2 one.
   * That is the loader half of c005 working, and it is why the control has to
   * be built from those — the switch, not the schema, is on trial here.)
   */
  function contentWithKind(classKey: string, slot: 1 | 2, kind: string): Content {
    const doc = JSON.parse(JSON.stringify(content.raw.classes)) as {
      classes: { key: string; active1: { kind: string }; active2: { kind: string } }[];
    };
    const row = doc.classes.find((c) => c.key === classKey);
    expect(row, `${classKey} missing from data/classes.json`).toBeDefined();
    (slot === 1 ? row!.active1 : row!.active2).kind = kind;
    return loadContent({ classes: doc });
  }

  it('an Active1 whose kind the switch does not handle is caught: no report, no state change', () => {
    // Pyro's Immolation Wave, which the CASES row above proves is live.
    const broken = contentWithKind('pyromancer', 1, 'poison_boost');
    const w = kitWorld('pyromancer', broken);
    dummy(w, WX + 1, WY);
    const before = observe(w);
    expect(useClassActive(w)).toBe(false);
    expect(observe(w)).toBe(before);
    // And the p6b symptom itself: an unhandled kind must not pay.
    expect(w.warden.active1Cooldown).toBe(0);
  });

  it('an Active2 whose kind the switch does not handle is caught: no report, no state change', () => {
    // Stormcaller's Overload, whose whole product is one Warden field — the
    // thinnest observable in the table, and so the strictest control.
    const broken = contentWithKind('stormcaller', 2, 'frost_nova');
    const w = kitWorld('stormcaller', broken);
    dummy(w, WX + 1, WY);
    const before = observe(w);
    expect(useClassActive2(w)).toBe(false);
    expect(observe(w)).toBe(before);
    expect(w.warden.active2Cooldown).toBe(0);
  });

  it('the same swap on a live kit still passes when the kind is handled, so the control is not just "any edit fails"', () => {
    // Same rebuild-from-copy path, but swapping in a kind the Active2 switch
    // *does* own: the harness must still see the effect.
    const swapped = contentWithKind('stormcaller', 2, 'poison_boost');
    const w = kitWorld('stormcaller', swapped);
    applyDot(w, dummy(w, WX + 1, WY), 'poison', 10, 5, 'test');
    const before = observe(w);
    expect(useClassActive2(w)).toBe(true);
    expect(observe(w)).not.toBe(before);
  });
});
