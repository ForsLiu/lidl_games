/**
 * `c017` — Archer *Deeper Draw* (`archer_pierce_cap`, SPEC-FINAL §6.3's third
 * card for this class) has to buy a player something **on shipped `/data`**.
 *
 * `c016` filed the bug and pinned it: `fireDeadeyeDraw` computed
 * `Math.min(pierceCap + classLineBonus(w), 1 + Math.floor(held))`, and shipped
 * `data/classes.json` authors `pierceCap 6` beside `chargeCapSeconds 5`, so
 * the right-hand term is 6 at *any* hold length and the card's +2/rank could
 * never bind. Rank 0, 1 and 2 all pierced exactly six enemies.
 *
 * **c017's own proposed fix does not work, and this file is the measurement
 * that says so.** It proposed reading the pierce count off the *unclamped*
 * hold (`1 + Math.floor(chargeSeconds)` instead of the locally clamped
 * `held`). But `chargeSeconds` reaches `fireDeadeyeDraw` from exactly one call
 * site — `tickClassCharge` — which already clamps the
 * accumulator itself: `wd.active1Charge = Math.min(charge + dt * rate, cap)`.
 * The local `held` clamp is redundant, not binding, so unclamping it changes
 * nothing. Unclamping the *accumulator* instead is what the proposal really
 * needs, and that is out of this lane's Scope twice over: it widens the range
 * of `warden.active1Charge` (`src/sim/types.ts`) and it is asserted equal to
 * the cap by two tests this lane may not edit (`tests/fb015-equipment.test.ts`
 * :253, the Sleeve Sword instant-max row, and `tests/p6b-swordsman.test.ts`
 * :452).
 *
 * **What lands instead**: the card's bonus is added *on top of* the resolved
 * pierce count rather than only raising a rail that the charge clamp already
 * holds below itself —
 * `Math.min(pierceCap, 1 + Math.floor(held)) + classLineBonus(w)`. SPEC-FINAL
 * §2 authorises exactly this shape ("base-less stats (armor points, **+1
 * pierce**, charges) add"), and §4.2's *Long Draw* keeps owning the
 * charge-derived term. Two properties are what make it the minimal fix, and
 * both are asserted below:
 *   - **rank 0 moves nothing** — `classLineBonus` is 0 there, so every
 *     un-carded run (which is every run G10's `p6d-nine-classes` dps-optimal
 *     charge case measures) reads exactly what it read before;
 *   - **`pierceCap` stays a real rail** — it still bounds the charge-derived
 *     term, so a `/data` copy with a longer `chargeCapSeconds` is still held
 *     to six at rank 0. The `min` is corrected, not deleted.
 *
 * The cost is that the bonus now also applies to a *partial* charge (a 2 s
 * hold at rank 1 pierces 3 + 2), which reads the card's authored sentence
 * ("Deadeye Draw pierce cap +2", `data/vsupgrades.json` — not this lane's
 * file to reword) as flat added pierce. That is pinned deliberately below.
 *
 * The ladder itself is measured in `tests/class-line-bonus.test.ts` alongside
 * the other eleven `class_line` cards; this file is the c017-specific case,
 * and it is the file that goes red if the card ever silently returns to being
 * a no-op on shipped numbers.
 */
import { describe, expect, it } from 'vitest';

import { tickClassCharge } from '../src/sim/classes';
import { loadContent, type Content } from '../src/sim/content';
import { spawnEnemy } from '../src/sim/enemies';
import { GRID_W } from '../src/sim/grid';
import { emptyInput, type Enemy, type TickInput } from '../src/sim/types';
import { World } from '../src/sim/world';
import { WX, WY } from './class-board';
import { cfg } from './helpers';

const content = loadContent();

const DT = 1 / 60;

const CARD = 'archer_pierce_cap';

/** The archer's authored Active1 numbers, read out of `/data` rather than restated. */
function archerA1(c: Content = content) {
  return c.classByKey.get('archer')!.active1;
}

/** The one `class_line` card `/data` authors for the archer. */
function card() {
  const own = (content.boons.skillCards.archer ?? []).filter((k) => k.effect === 'class_line');
  expect(own.length, 'the archer should author exactly one class_line card').toBe(1);
  return own[0];
}

/** `rank * perRank` for Deeper Draw, straight off the authored card. */
function bonusAt(rank: number): number {
  return card().perRank * rank;
}

/** The pierce count *Long Draw* alone resolves at a full hold — the pre-c017 reading. */
function clampedReading(c: Content = content): number {
  const a1 = archerA1(c);
  return Math.min(a1.pierceCap ?? 1, 1 + Math.floor(a1.chargeCapSeconds ?? 0));
}

function archerWorld(ranks: Record<string, number>, c: Content = content): World {
  const w = new World(cfg({ classKey: 'archer' }), c);
  w.warden.attackCooldown = 1e9; // the basic attack is not the observable here
  w.warden.x = WX;
  w.warden.y = WY;
  w.skillCardRanks = { ...ranks };
  return w;
}

/**
 * An immovable, unarmoured punching bag deep enough that the smallest
 * pierce-falloff tail hit still shows as an hp change (c009's ULP lesson).
 */
function dummy(w: World, x: number, y: number): Enemy {
  const e = spawnEnemy(w, w.content.enemies.enemies[0].key, x, y)!;
  e.hp = 1e5;
  e.maxHp = Math.max(1e5, e.maxHp);
  e.speed = 0;
  e.armor = 0;
  w.rebuildBuckets();
  return e;
}

/**
 * A line of `count` standing targets along +x, each remembered with its
 * starting hp. `spacing` 0.7 keeps the whole budget inside the shot's own
 * `radius` reach; both that reach and the board edge are asserted, so a
 * `pierceCap`/`perRank` retune that pushes the tail out of range says so as a
 * harness shortfall instead of going red blaming the card.
 */
function lineOfDummies(w: World, count: number, spacing = 0.7): { e: Enemy; hp: number }[] {
  const line: { e: Enemy; hp: number }[] = [];
  const reach = archerA1(w.content).radius ?? 0;
  for (let i = 1; i <= count; i++) {
    const x = WX + i * spacing;
    expect(x, 'harness budget: the dummy line ran off the board').toBeLessThan(GRID_W - 1);
    expect(x, "harness budget: the dummy line ran past Deadeye Draw's own reach").toBeLessThan(WX + reach);
    const e = dummy(w, x, WY);
    line.push({ e, hp: e.hp });
  }
  return line;
}

function idle(over: Partial<TickInput> = {}): TickInput {
  return { ...emptyInput(), ...over };
}

/**
 * Holds Active1 for `seconds` at the real 60 Hz and releases it.
 *
 * Hold lengths below are always **fractional or past the cap**, never a whole
 * number: 120 accumulations of `1/60` land on 1.9999999999999993, so a "2 s"
 * hold reads `floor` 1 and a case written against a whole second measures the
 * float, not the mechanic. That includes a hold of exactly `chargeCapSeconds`,
 * which lands just *under* the cap and so never meets the clamp that would
 * have rounded it off; only a hold that overshoots the cap reads it exactly.
 */
function chargeFor(w: World, seconds: number): void {
  const c = w.content.classByKey.get('archer')!;
  const aim = { aimX: WX + 8, aimY: WY };
  for (let t = 0; t < Math.round(seconds * 60); t++) {
    tickClassCharge(w, c, idle({ ...aim, active1Held: true }), DT);
  }
  tickClassCharge(w, c, idle({ ...aim, active1Held: false }), DT);
}

/**
 * How many enemies one Deadeye Draw held for `seconds` actually pierces, at
 * the given card ranks. The line is always sized past the highest reading any
 * rank can produce, so "the card did nothing" is never confused with "the
 * harness ran out of bodies".
 */
function pierced(ranks: Record<string, number>, seconds: number, c: Content = content): number {
  const w = archerWorld(ranks, c);
  const budget = clampedReading(c) + bonusAt(card().maxRank) + 2;
  const line = lineOfDummies(w, budget);
  chargeFor(w, seconds);
  let n = 0;
  for (const r of line) if (r.e.hp < r.hp) n++;
  // The guard names *both* of its causes on purpose. Sizing it past every
  // cause is not available here: absorbing a scope leak that summed all twelve
  // `class_line` cards at max rank would need 6 + 28.8 + 2 = 37 bodies, and
  // 37 of them at any spacing run past Deadeye Draw's own 9-tile reach long
  // before the last one is placed. So a run that saturates this line is
  // ambiguous between a harness that is too small and a card that pierces
  // further than the Archer's own ceiling, and it says so rather than
  // asserting the first (QA, c017).
  expect(
    n,
    `the Deadeye pierce line saturated (read ${n} of ${budget}) — either the harness budget is too small, or the card reached past the Archer's own ceiling of ${clampedReading(c) + bonusAt(card().maxRank)}`,
  ).toBeLessThan(budget);
  return n;
}

/** A `Content` rebuilt from `data/classes.json` with the archer's Active1 edited (c011's helper). */
function contentWithArcher(mutate: (a1: Record<string, number>) => void): Content {
  const doc = JSON.parse(JSON.stringify(content.raw.classes)) as {
    classes: { key: string; active1: Record<string, number> }[];
  };
  const row = doc.classes.find((c) => c.key === 'archer')!;
  expect(row, 'archer missing from data/classes.json').toBeDefined();
  mutate(row.active1);
  return loadContent({ classes: doc });
}

describe('c017 — Deeper Draw binds on shipped /data', () => {
  /** Held past `chargeCapSeconds`, so the hold length never separates two readings. */
  const FULL = (archerA1().chargeCapSeconds ?? 0) + 1;

  it('the rank ladder is live: each rank pierces perRank more enemies than the last', () => {
    const base = clampedReading();
    const readings = [0, 1, 2].map((rank) => pierced(rank === 0 ? {} : { [CARD]: rank }, FULL));
    expect(readings, `Deeper Draw's ladder is flat on shipped data: ${readings.join(' -> ')}`).toEqual([
      base + bonusAt(0),
      base + bonusAt(1),
      base + bonusAt(2),
    ]);
    expect(readings[1]).toBeGreaterThan(readings[0]);
    expect(readings[2]).toBeGreaterThan(readings[1]);
  });

  it('rank 0 is exactly the pre-c017 reading, at every hold length', () => {
    const a1 = archerA1();
    const cap = a1.chargeCapSeconds ?? 0;
    // One tick is the shortest hold that fires at all: a zero-tick "hold"
    // never enters the charging state, so nothing is released and nothing is
    // measured.
    for (const hold of [DT, 0.5, 2.5, 4.5, cap + 2]) {
      expect(pierced({}, hold), `an un-carded ${hold}s hold moved`).toBe(
        Math.min(a1.pierceCap ?? 1, 1 + Math.floor(Math.min(hold, cap))),
      );
    }
  });

  it('the bonus is flat added pierce, so it also lands on a partial charge', () => {
    // The authored card sentence says "pierce cap +2"; with the charge clamp
    // holding the resolved count below the cap at *every* hold length, the
    // only reading that buys a player anything is flat added pierce (§2:
    // "base-less stats (…+1 pierce…) add"). Pinned so a later rewrite to a
    // full-charge-only bonus is a deliberate change, not a silent one.
    const a1 = archerA1();
    const HOLD = 2.5; // fractional, and well inside the cap — see `chargeFor`
    const partial = Math.min(a1.pierceCap ?? 1, 1 + Math.floor(Math.min(HOLD, a1.chargeCapSeconds ?? 0)));
    expect(partial, 'this case needs a hold the charge cap does not already saturate').toBeLessThan(
      clampedReading(),
    );
    expect(pierced({}, HOLD)).toBe(partial);
    expect(pierced({ [CARD]: 1 }, HOLD)).toBe(partial + bonusAt(1));
  });

  it('pierceCap is still a real rail: a longer charge cap does not lift rank 0 past it', () => {
    const longer = contentWithArcher((a1) => void (a1.chargeCapSeconds = (a1.pierceCap ?? 0) + 6));
    const a1 = archerA1(longer);
    expect(1 + Math.floor(a1.chargeCapSeconds ?? 0), 'the rebuild should out-run the cap').toBeGreaterThan(
      a1.pierceCap ?? 0,
    );
    expect(pierced({}, (a1.chargeCapSeconds ?? 0) + 1, longer)).toBe(a1.pierceCap ?? 0);
    // …and the card still adds on top of that rail.
    expect(pierced({ [CARD]: 1 }, (a1.chargeCapSeconds ?? 0) + 1, longer)).toBe((a1.pierceCap ?? 0) + bonusAt(1));
  });

  it('the card buys pierce and nothing else: the shot itself hits no harder at rank 2', () => {
    // QA (c017): every other case here counts *bodies*, so a bonus
    // fat-fingered onto the damage side of `fireDeadeyeDraw` — the line
    // directly above the one c017 moved — ships green through all twelve
    // archer-touching files in the repo. The first dummy is the one read: it
    // is always struck at `lineHit`'s falloff scale 1, so its hp loss is the
    // per-hit damage with the pierce count divided out.
    const firstHit = (ranks: Record<string, number>): number => {
      const w = archerWorld(ranks);
      const line = lineOfDummies(w, clampedReading() + bonusAt(card().maxRank) + 2);
      chargeFor(w, FULL);
      return line[0].hp - line[0].e.hp;
    };
    const r0 = firstHit({});
    expect(r0, 'the control shot did not land at all').toBeGreaterThan(0);
    expect(firstHit({ [CARD]: 1 }), 'rank 1 changed Deadeye damage, not just pierce').toBeCloseTo(r0, 9);
    expect(firstHit({ [CARD]: 2 }), 'rank 2 changed Deadeye damage, not just pierce').toBeCloseTo(r0, 9);
  });

  it("another class's class_line card at max rank changes nothing for the archer", () => {
    const foreign: Record<string, number> = {};
    for (const [key, cards] of Object.entries(content.boons.skillCards)) {
      if (key === 'archer') continue;
      for (const c of cards) if (c.effect === 'class_line') foreign[c.key] = c.maxRank;
    }
    expect(Object.keys(foreign).length, 'the other eleven classes should author a class_line card each').toBe(11);
    expect(pierced(foreign, FULL)).toBe(pierced({}, FULL));
  });
});
