/**
 * c011 (BACKLOG-CONTENT, lane `content`) — **a passive's magnitudes and
 * lifetimes**, which `c006` deliberately left out.
 *
 * c006 put all 12 §4 passives on trial and proved each one *fires*. That is
 * liveness, and liveness is direction and presence only: "hp fell", "a corpse
 * exists", "the second jump hit harder than the first". A passive can go on
 * firing with its numbers meaningless and c006 stays green — its header says
 * so, and lists the holes. This file closes the nine of them that had a
 * verified one-line repro (QA on c006, recorded in BACKLOG-CONTENT's Log):
 *
 *   1. Grave Harvest's `corpseSeconds`      — a corpse that expires this tick still counts
 *   2. Conduction's `chainCap`              — `Math.min(i, capIndex)` can be dropped (G11's ceiling)
 *   3. Long Draw's `chargeCapSeconds`       — G10's *finite* dps-optimal charge
 *   4. Kinship's aura `remaining`           — an expired totem buffs forever
 *   5. Kinship's multi-aura stacking        — `mul *=` -> `mul =`
 *   6. Frost Touch's freeze-counter reset   — re-freeze on every hit past the count
 *   7. Frost Touch's frost-lapse reset      — hit stacks surviving frost lapsing
 *   8. Spreading Plague's transferred total — `total` -> `1`
 *   9. Time Flow's stack-cap merge          — overflow damage silently dropped
 *
 * **Every assertion here is relative, exactly as c006 requires.** Not one of
 * them names an authored number: each is either a comparison between two runs
 * of the same scenario (a longer hold against a shorter one, a doubled DoT
 * against a single one, a corpse one tick before its expiry against one tick
 * after), or a comparison against a `Content` rebuilt with that same field
 * changed. A retune of `corpseSeconds`, `chainCap`, `chargeCapSeconds`,
 * `freezeHits`, `auraAtkSpdMul` or `totemDurationSeconds` must leave this file
 * green — which is what makes it a *mechanism* test rather than a second copy
 * of `c008`'s figure ledger, and c008 is where a figure's value is audited.
 *
 * A handful of dependencies are *not* free, and are stated rather than left to
 * be discovered: `chainGrowth` and `compoundPerSecond` must stay nonzero (a
 * mechanism that compounds by 0 has nothing to observe); Animist
 * `summonDurationSeconds` must stay above `totemDurationSeconds` and its
 * `summonCap` must hold the spirits a case asks for (the aura cases read a
 * spirit's cadence on the tick the totem dies); Cryomancer `freezeHits` must
 * stay above 1 (every frost case needs a distinguishable before-the-freeze
 * phase); and Chain Surge's `radius` must leave room between Electric's own
 * blast and the link spacing derived from it. Each is asserted as a harness
 * precondition with its reason attached, so that retune fails as a *harness*
 * error and never as a phantom product regression — c009's declared-exception
 * pattern. QA found four of these five by retuning `/data` until something
 * broke; the fifth (link spacing) it found as a hardcoded 2.
 *
 * **Boundaries are read off the data, never written into the test.** Rows 1,
 * 2 and 3 all need to stand exactly at an edge (the tick a corpse dies, the
 * jump the growth stops at, the second the hold stops paying). Each computes
 * that edge from the shipped field and steps one tick either side of it, so
 * the *edge* moves with a retune and the *assertion* does not.
 *
 * **Three of the nine turned out not to be reachable the way c011 assumed, and
 * the route is named rather than smoothed over.** Each was found by running the
 * repro against a draft of this file and watching it stay green:
 *
 *   - Frost Touch's frost-lapse reset (`applyOnHit`'s `else` branch) is **dead
 *     code on shipped content**. `passiveOnHit` returns `['frost',
 *     'frost_track']` in that order and is `frost_track`'s only producer, so a
 *     hit that could count a stack has already re-applied the frost the branch
 *     tests for; and the one target that does reach the branch — a `slowImmune`
 *     one, where `applyFrost` returns early — has never banked a stack to lose,
 *     because the increment is inside the same `if`. Deleting the reset changes
 *     nothing observable in play. It is still what makes "hit 5 times **while
 *     frosted**" mean what it says, so it is pinned at `applyOnHit`, the sim's
 *     own exported on-hit hook and the seam a reordered `onHit` list would come
 *     through, alongside the slow-immune case that *is* reachable.
 *   - Kinship's `mul *=` cannot be reached by casting: `fireRecallTotem` evicts
 *     any standing totem before pushing its own, so one aura is the most the
 *     game can produce today. That eviction is itself untested, so row 5
 *     asserts *both* — the replace rule through real casts (which is what makes
 *     the stacking moot), and the multiplicative combination on a
 *     directly-constructed second aura, as a forward guard for the day a second
 *     aura source ships.
 *   - `chargeCapSeconds` is enforced in **three** independent places, not one:
 *     `tickClassCharge`'s accumulator clamp, `fireDeadeyeDraw`'s `Math.min`,
 *     and `circleSlashValues`' `clamp(chargeSeconds / cap, 0, 1)`. A first
 *     draft asserted only released *damage* and so stayed green with the
 *     accumulator clamp deleted outright — the clamp whose own observable is
 *     `warden.active1Charge`, the state the charge indicator renders (fb016)
 *     and a replay carries. A second draft still had no case for
 *     `circleSlashValues` — it is on the *other* charge kind, and nothing here
 *     built a Swordsman — so that clamp could be deleted with this file green
 *     while the header claimed otherwise (found by code review). All three now
 *     have a case.
 *
 * **The barrier is verified by mutation, never by argument.** Twenty `/src`
 * mutations turn this file red: every hole's recorded repro, plus the
 * totem-replace filter, a hardcoded `freezeHits`, a hardcoded `corpseSeconds`,
 * a halved corpse-decay and a halved summon-decay rate, each of the three
 * `chargeCapSeconds` clamps deleted on its own, `FROST_ON_HIT` reordered,
 * merging into the longest stack instead of the shortest, and the two
 * near-miss formulas QA found (the merge written as the *push* formula, and
 * `dotOutstanding` read as its first stack). A retune does not: `corpseSeconds`
 * 6->9.5, `chainCap` 8->7 with `chainGrowth` 0.20->0.13 and `chainCount` 6->5,
 * `chargeCapSeconds` 5->4 with `compoundPerSecond` 0.4->0.9, Swordsman
 * `chargeCapSeconds` 3->2, `freezeHits` 5->3, `auraAtkSpdMul` 0.15->0.33,
 * `totemDurationSeconds` 15->11, Plaguebringer `dps` 22->31 and
 * `maxStacksPerEnemy` 50->200, all at once, leave every case green; so do
 * Chain Surge `radius` 5->1.8 and Electric's own `radius` 0.8->1.2 separately.
 *
 * One mutation is **equivalent** and is called out where it lives rather than
 * chased: the shortest-stack *search loop* in `damageWarden` cannot change
 * behaviour while every Time Flow stack carries the same constant window.
 *
 * **The last `describe` is the completeness half.** Each case registers the
 * hole it exercises through `itCovering`, and the census requires the set to
 * equal `HOLES` — so deleting a case, or a whole `describe`, is red with the
 * missing hole named. Two earlier drafts of it were worse than useless: a
 * literal `expect(list.length).toBe(9)` that was true by construction (found by
 * code review), then a registration inside the `it` bodies that made `-t` and
 * `--sequence.shuffle` report "all nine holes were dropped" (found by QA).
 */
import { describe, expect, it } from 'vitest';

import {
  auraSpeedMul,
  circleSlashValues,
  classBasicAttack,
  tickClassCharge,
  updateClassPassives,
  updateClassSummons,
  useClassActive,
  useClassActive2,
} from '../src/sim/classes';
import { loadContent, type ClassDef, type Content } from '../src/sim/content';
import { TRAIT, applyDot, applyOnHit, damageEnemy, dotOutstanding, spawnEnemy } from '../src/sim/enemies';
import { damageWarden, tickWardenDots } from '../src/sim/run';
import { buildTower } from '../src/sim/towers';
import type { ClassSummon, Enemy, TickInput } from '../src/sim/types';
import { World } from '../src/sim/world';
import { BUILD_TX, BUILD_TY, WX, WY } from './class-board';
import { cfg } from './helpers';

const content = loadContent();

const DT = 1 / 60;
const SPIRE = 'arrow_spire';

function passiveWorld(classKey: string, c: Content = content): World {
  const w = new World(cfg({ classKey }), c);
  w.gold = 1e6;
  // The character basic attack would move the very observables most rows read;
  // the three rows that need it re-arm it explicitly through `attack()`.
  w.warden.attackCooldown = 1e9;
  w.warden.x = WX;
  w.warden.y = WY;
  return w;
}

function cls(w: World): ClassDef {
  return w.content.classByKey.get(w.cfg.classKey)!;
}

/** An immovable, unarmoured punching bag deep enough that nothing here kills it by accident. */
function dummy(w: World, x: number, y: number, hp = 1e6): Enemy {
  const e = spawnEnemy(w, w.content.enemies.enemies[0].key, x, y)!;
  e.hp = hp;
  e.maxHp = Math.max(hp, e.maxHp);
  e.speed = 0;
  e.armor = 0;
  w.rebuildBuckets();
  return e;
}

function attack(w: World): void {
  w.warden.attackCooldown = 0;
  classBasicAttack(w, cls(w));
}

function idle(over: Partial<TickInput> = {}): TickInput {
  return { mx: 0, my: 0, dash: false, attack: false, aimX: 0, aimY: 0, active1Held: false, cmds: [], ...over };
}

/** Holds a charge Active1 for `seconds` at the real 60 Hz and releases it. */
function chargeFor(w: World, seconds: number, aimX: number, aimY: number): void {
  const c = cls(w);
  const aim = { aimX, aimY };
  for (let t = 0; t < Math.round(seconds * 60); t++) {
    tickClassCharge(w, c, idle({ ...aim, active1Held: true }), DT);
  }
  tickClassCharge(w, c, idle({ ...aim, active1Held: false }), DT);
}

/** The shape of one `data/classes.json` row, as far as the rebuilds below care. */
type RawClassRow = {
  key: string;
  passive: { kind?: string; mods: Record<string, number>; [k: string]: unknown };
  active1: Record<string, unknown>;
  active2: Record<string, unknown>;
};

/**
 * `Content` rebuilt from a copy of `data/classes.json` with `mutate` applied to
 * one class's row — c005/c006's rebuild-from-copy path. Used here to *retune* a
 * magnitude rather than to remove a binding: every row below that names a field
 * proves the sim reads it by varying it and watching the boundary move, which
 * is the one thing a fixed expectation cannot show.
 */
/**
 * The nine holes `c006` deferred, by name. Every case below calls `cover()`
 * with the one it exercises and the last `describe` in the file requires the
 * set to be complete — so deleting a case, or a whole `describe`, is red with
 * that hole's name attached. A literal count would not do this: it would be
 * true by construction of its own array, which is the failure c008 and c009
 * both hit and this file was written to avoid.
 */
const HOLES = [
  'Grave Harvest corpseSeconds',
  'Conduction chainCap',
  'Long Draw chargeCapSeconds',
  'Kinship aura remaining',
  'Kinship aura stacking',
  'Frost Touch freeze reset',
  'Frost Touch lapse reset',
  'Spreading Plague transferred total',
  'Time Flow stack-cap merge',
] as const;

type Hole = (typeof HOLES)[number];

const covered = new Set<Hole>();

/**
 * `it`, plus the hole it exercises registered **at collection time**.
 *
 * Registering inside the `it` body instead made the census depend on every
 * prior case having *run*, so `-t <filter>` and `--sequence.shuffle` both
 * reported "all nine holes were dropped" — a harness artefact wearing a
 * product regression's message, which is the exact failure this file's header
 * argues against (found by QA). Collection still happens for a filtered-out
 * case, and deleting a case still deletes its registration, so the census
 * keeps the only property it is there for.
 */
function itCovering(hole: Hole, name: string, fn: () => void): void {
  covered.add(hole);
  it(name, fn);
}

function contentWith(classKey: string, mutate: (row: RawClassRow) => void): Content {
  const doc = JSON.parse(JSON.stringify(content.raw.classes)) as { classes: RawClassRow[] };
  const row = doc.classes.find((c) => c.key === classKey);
  expect(row, `${classKey} missing from data/classes.json`).toBeDefined();
  mutate(row!);
  return loadContent({ classes: doc });
}

/* ------------------------------------------------------- 1. corpseSeconds */

describe('c011 — Grave Harvest: a corpse really expires, and at the second it is authored', () => {
  /** Ticks `updateClassPassives` until the last corpse is gone; returns the tick count. */
  function corpseLifetimeTicks(c: Content, budgetSeconds: number): number {
    const w = passiveWorld('necromancer', c);
    damageEnemy(w, dummy(w, WX + 1, WY, 100), 1e6, 'test');
    expect(w.corpses.length, 'the kill left no corpse to time').toBeGreaterThan(0);
    for (let t = 1; t <= Math.round(budgetSeconds * 60); t++) {
      updateClassPassives(w, DT);
      if (w.corpses.length === 0) return t;
    }
    return 0;
  }

  itCovering('Grave Harvest corpseSeconds', 'the corpse is gone by its authored second, and halving the field halves the wait', () => {
    const shipped = content.classByKey.get('necromancer')!.passive.corpseSeconds!;
    const full = corpseLifetimeTicks(content, shipped * 4);
    expect(full, 'the corpse outlived four times its authored lifetime').toBeGreaterThan(0);

    // The magnitude is *read*, not defaulted: the sim's fallback is `?? 6` and
    // the shipped value is 6, so a corpse that ignored the field entirely would
    // look identical here. Halving it has to halve the observed lifetime.
    const half = corpseLifetimeTicks(
      contentWith('necromancer', (r) => void (r.passive.corpseSeconds = shipped / 2)),
      shipped * 4,
    );
    expect(half, 'the halved corpse never expired').toBeGreaterThan(0);
    expect(half / full).toBeCloseTo(0.5, 1);
  });

  itCovering('Grave Harvest corpseSeconds', 'a corpse that has reached its expiry cannot still be raised', () => {
    // The repro: `updateClassPassives`' `c.remaining <= 0` / `filter(remaining
    // > 0)` relaxed by one tick leaves a dead corpse in the list, and
    // `fireRaiseSkeletons` filters corpses by *distance only* — it never looks
    // at `remaining` — so an expired corpse would still raise a skeleton.
    const shipped = content.classByKey.get('necromancer')!.passive.corpseSeconds!;
    const raised = (ticks: number): number => {
      const w = passiveWorld('necromancer');
      damageEnemy(w, dummy(w, WX + 1, WY, 100), 1e6, 'test');
      for (let t = 0; t < ticks; t++) updateClassPassives(w, DT);
      w.warden.active1Cooldown = 0;
      useClassActive(w);
      return w.classSummons.filter((s) => s.kind === 'necro_skeleton').length;
    };
    // There is slack on the "alive" side only. `remaining` is accumulated by
    // subtraction, so at exactly `shipped * 60` ticks it lands at +1.6e-14 —
    // still alive — and `edge + 1` is the *first* dead tick, with no margin
    // beyond that float residue. That residue is what catches an off-by-one
    // relaxation of `remaining <= 0`, so it is deliberate rather than lucky;
    // it is also why this case must be re-derived if corpse decay ever moves
    // from accumulation to `spawnTick + duration` (found by code review).
    const edge = Math.round(shipped * 60);
    expect(raised(edge - 2), 'a corpse inside its lifetime raised nothing').toBeGreaterThan(0);
    expect(raised(edge + 1), 'an expired corpse still raised a skeleton').toBe(0);
  });
});

/* ------------------------------------------------------------ 2. chainCap */

describe('c011 — Conduction: the compounding stops at `chainCap` (G11 ceiling)', () => {
  /**
   * The gap between links, wide enough that each figure is that link's own jump
   * and not a neighbour's splash, and short enough that the bolt can still make
   * the hop.
   *
   * Both bounds are read from `/data`. A hardcoded 2 — c006's spacing — sat
   * between Electric's authored r0.8 blast and Chain Surge's authored r5 reach
   * with no stated margin either side, so a `radius` retune to 1.8 (an ordinary
   * ⚖ knob on the very row `c010` is about) reddened this file with "a link
   * took no damage at all" (found by QA).
   */
  const splash = content.damageTypeByKey.get('electric')!.radius ?? 0;
  const reach = content.classByKey.get('stormcaller')!.active1.radius;
  // `reach * 0.9`, not `reach`: laying links exactly `reach` apart puts the hop
  // on a float knife-edge — `WX + i * 1.8` accumulates to a gap a few ULP over
  // 1.8 and `nearestEnemy` refuses it, which reads as "a link took no damage at
  // all" rather than as a spacing problem.
  const spacing = Math.min(2, reach * 0.9);

  /** Damage each link of a straight chain took, in jump order. */
  function chainDamage(c: Content, links: number): number[] {
    expect(spacing, 'harness needs links spaced clear of Electric’s own blast').toBeGreaterThan(splash * 1.2);
    const w = passiveWorld('stormcaller', c);
    const line: Enemy[] = [];
    for (let i = 1; i <= links; i++) line.push(dummy(w, WX + i * spacing, WY));
    const before = line.map((e) => e.hp);
    expect(useClassActive(w, WX + spacing, WY)).toBe(true);
    return line.map((e, i) => before[i] - e.hp);
  }

  /**
   * How many links a bolt can actually reach: one per jump it makes, and
   * `jumps` is `chainCount` (+ Overload, + skill cards, neither live here).
   * Derived rather than written as 6, which is exactly today's `chainCount` and
   * so left the cases below with **zero** margin — a `chainCount` 6 -> 5 retune,
   * a ⚖ band number on the very row `c010` is about, would have reddened this
   * file with "a link took no damage at all" (found by code review).
   */
  const links = Math.min(6, Math.round(content.classByKey.get('stormcaller')!.active1.chainCount!));

  itCovering('Conduction chainCap', 'growth compounds up to the cap index and is flat after it', () => {
    // The shipped row cannot reach its own cap — `chainCount` + Overload's
    // extra jumps is at most `chainCap`, which is *why* G11's ceiling holds —
    // so the cap is lowered here to bring the boundary into reach. Lowering it
    // rather than asserting a shipped figure is what keeps this relative: a
    // retune of either number moves nothing in this case.
    const capAt = Math.min(3, links - 1);
    expect(capAt, 'harness needs a cap index strictly inside the chain').toBeGreaterThan(1);
    const c = contentWith('stormcaller', (r) => void (r.active1.chainCap = capAt));
    const dealt = chainDamage(c, links);
    for (const d of dealt) expect(d, 'a link took no damage at all').toBeGreaterThan(0);

    // Indices 0..capAt-1 still grow...
    for (let i = 1; i < capAt; i++) {
      expect(dealt[i] / dealt[i - 1], `jump ${i} did not compound`).toBeGreaterThan(1.0001);
    }
    // ...and every jump from the cap index on lands at the same damage. This
    // is the assertion `Math.min(i, capIndex)` exists for: without it the
    // ratios below stay above 1 and G11's ceiling is unbounded.
    for (let i = capAt; i < dealt.length; i++) {
      expect(dealt[i] / dealt[capAt - 1], `jump ${i} kept compounding past the cap`).toBeCloseTo(1, 6);
    }
  });

  itCovering('Conduction chainCap', 'the cap is read from `/data`: a lower cap flattens the chain sooner', () => {
    const at = (capAt: number) =>
      chainDamage(contentWith('stormcaller', (r) => void (r.active1.chainCap = capAt)), links);
    expect(links, 'harness needs a link past the low cap to compare at').toBeGreaterThanOrEqual(3);
    const last = links - 1;
    // Same chain, same growth, the last link: the higher cap must have kept
    // compounding where the lower one had already stopped. `links` as the high
    // cap means it never binds, so this is "capped at 2" against "uncapped".
    expect(at(links)[last] / at(2)[last]).toBeGreaterThan(1.0001);
  });
});

/* --------------------------------------------------- 3. chargeCapSeconds */

describe('c011 — Long Draw: the hold stops paying at `chargeCapSeconds` (G10 finite optimum)', () => {
  function shotDamage(c: Content, held: number): number {
    const w = passiveWorld('archer', c);
    const e = dummy(w, WX + 2, WY);
    const before = e.hp;
    chargeFor(w, held, WX + 6, WY);
    return before - e.hp;
  }

  itCovering('Long Draw chargeCapSeconds', 'holding past the cap adds nothing, while holding up to it still does', () => {
    const cap = content.classByKey.get('archer')!.active1.chargeCapSeconds!;
    // Below the cap the compounding is live — without this the row would pass
    // just as well on a shot that ignored the charge entirely.
    expect(shotDamage(content, cap)).toBeGreaterThan(shotDamage(content, cap - 1));
    // At and past it, identical: this is what makes G10's dps-optimal charge
    // finite rather than "hold forever".
    expect(shotDamage(content, cap + 2) / shotDamage(content, cap)).toBeCloseTo(1, 6);
  });

  itCovering('Long Draw chargeCapSeconds', 'the cap is read from `/data`: a longer cap keeps paying past the old one', () => {
    const cap = content.classByKey.get('archer')!.active1.chargeCapSeconds!;
    const longer = contentWith('archer', (r) => void (r.active1.chargeCapSeconds = cap + 2));
    expect(shotDamage(longer, cap + 2)).toBeGreaterThan(shotDamage(longer, cap));
  });

  itCovering('Long Draw chargeCapSeconds', 'the accumulator itself stops at the cap, not only the shot it fires', () => {
    // `chargeCapSeconds` is enforced in *three* independent places —
    // `tickClassCharge`'s accumulator clamp, `fireDeadeyeDraw`'s `Math.min`,
    // and `circleSlashValues`' `clamp(chargeSeconds / cap, 0, 1)` — so the two
    // cases above, which read damage, stay green with the accumulator clamp
    // deleted outright (verified by mutation). Its own observable is
    // `warden.active1Charge`, which is sim state the charge indicator renders
    // (fb016, `circleSlashValues`' own doc comment) and which a replay carries;
    // an unbounded one draws a ring that keeps filling past full.
    const cap = content.classByKey.get('archer')!.active1.chargeCapSeconds!;
    const chargeAfter = (seconds: number): number => {
      const w = passiveWorld('archer');
      const c = cls(w);
      for (let t = 0; t < Math.round(seconds * 60); t++) {
        tickClassCharge(w, c, idle({ aimX: WX + 6, aimY: WY, active1Held: true }), DT);
      }
      return w.warden.active1Charge;
    };
    expect(chargeAfter(cap)).toBeGreaterThan(chargeAfter(cap - 1));
    expect(chargeAfter(cap * 3) / chargeAfter(cap)).toBeCloseTo(1, 6);
  });

  itCovering('Long Draw chargeCapSeconds', '`fireDeadeyeDraw`s own clamp is a second, independent one', () => {
    // Defence in depth behind the accumulator, and so unreachable by holding:
    // reached here by writing an over-cap charge into the warden mid-hold — the
    // state a future change to `circleSlashChargeRate`, or any new charge
    // source, would produce — so that deleting *either* clamp turns this file
    // red rather than only one of them.
    const cap = content.classByKey.get('archer')!.active1.chargeCapSeconds!;
    const releaseAt = (charge: number): number => {
      const w = passiveWorld('archer');
      const e = dummy(w, WX + 2, WY);
      const before = e.hp;
      const c = cls(w);
      tickClassCharge(w, c, idle({ aimX: WX + 6, aimY: WY, active1Held: true }), DT);
      expect(w.warden.active1Charging, 'the harness never entered the charging state').toBe(true);
      w.warden.active1Charge = charge;
      tickClassCharge(w, c, idle({ aimX: WX + 6, aimY: WY, active1Held: false }), DT);
      return before - e.hp;
    };
    expect(releaseAt(cap * 3) / releaseAt(cap)).toBeCloseTo(1, 6);
  });

  itCovering('Long Draw chargeCapSeconds', '`circleSlashValues` is a third clamp, on the other charge kind', () => {
    // The third site, and the one no case in the first draft reached at all:
    // `charge_nova` scales its three outputs by `clamp(chargeSeconds / cap, 0,
    // 1)` rather than by clamping the hold. Reached as the pure function it is
    // — `circleSlashValues` is exported precisely so `canvas.ts`' charge
    // indicator can read it without re-deriving the lerp — so the fraction can
    // be pushed past 1 without inventing a warden state (found by code review:
    // dropping the `clamp` here left every other case in this file green).
    const swordsman = content.classByKey.get('swordsman')!.active1;
    const cap = swordsman.chargeCapSeconds!;
    const at = (held: number) => circleSlashValues(swordsman, held);
    const full = at(cap);

    // Below the cap the lerp is live, so this is not a comparison of two
    // constants: every field the nova scales is strictly smaller half-way up.
    const half = at(cap / 2);
    expect(half.radius).toBeLessThan(full.radius);
    expect(half.damage).toBeLessThan(full.damage);

    // At and past it, identical on all three fields.
    const over = at(cap * 3);
    expect(over.radius).toBeCloseTo(full.radius, 10);
    expect(over.damage).toBeCloseTo(full.damage, 10);
    expect(over.knockback).toBeCloseTo(full.knockback, 10);
  });
});

/* ------------------------------------------------- 4. & 5. Kinship's aura */

/**
 * A world with a Recall Totem and `spirits` Manifest spirits, cast in an order
 * that puts the requested number of spirits *after* the totem in
 * `w.classSummons`. Order is the whole point of row 4: `updateClassSummons`
 * decrements each summon in array order and only filters the expired ones out
 * at the end of the tick, so a summon standing after the totem is the one that
 * can read it on the tick it dies.
 */
function animistWorld(spiritsBefore: number, spiritsAfter: number, c: Content = content) {
  // Every case here reads a spirit's cadence *on or after* the tick the totem
  // dies, so the spirits have to outlive the totem. That is true of the shipped
  // pair (20 s spirits, 15 s totem) but it is a relationship between two
  // independently tunable fields, not a law — raising `totemDurationSeconds`
  // past the spirit lifetime would leave `updateClassSummons` no longer
  // touching a filtered-out summon, and a stale `attackCooldown` of 0 reads as
  // a full buff. Asserted here so that retune fails as a harness precondition
  // with its reason attached (found by code review).
  const animist = c.classByKey.get('animist')!;
  expect(
    animist.active1.summonDurationSeconds!,
    'harness needs spirits that outlive the totem — see this comment',
  ).toBeGreaterThan(animist.active2.totemDurationSeconds!);
  expect(
    animist.active1.summonCap!,
    'harness needs the authored summon cap to hold every spirit it asks for',
  ).toBeGreaterThanOrEqual(spiritsBefore + spiritsAfter);

  const w = passiveWorld('animist', c);
  expect(buildTower(w, c.towerByKey.get(SPIRE)!.id, BUILD_TX, BUILD_TY).ok).toBe(true);
  const manifest = () => {
    w.warden.active1Cooldown = 0;
    expect(useClassActive(w)).toBe(true);
  };
  for (let i = 0; i < spiritsBefore; i++) manifest();
  expect(useClassActive2(w)).toBe(true); // Recall Totem, centred on the Warden
  for (let i = 0; i < spiritsAfter; i++) manifest();

  const spirits = w.classSummons.filter((s) => s.kind === 'animist_spirit');
  const totem = w.classSummons.find((s) => s.kind === 'animist_totem');
  expect(spirits.length, 'harness produced fewer spirits than asked for').toBe(spiritsBefore + spiritsAfter);
  expect(totem, 'harness produced no totem').toBeDefined();
  // Every spirit spawns on the same tile (`fireManifestSpirit` clones one
  // structure), so a target beside that tile serves all of them.
  dummy(w, spirits[0].x + 1, spirits[0].y);
  w.rebuildBuckets();
  return { w, spirits, totem: totem! };
}

/**
 * The share of its own interval a summon's aura shaved off on the tick just
 * run — or `-1` if the summon did not fire at all.
 *
 * The `-1` matters: `attackCooldown` is left at whatever the caller wrote
 * (0, here) when a summon has no target or has been filtered out, and a naive
 * `(interval - 0) / interval` reports that as **1**, a *full* buff. Every
 * `toBeGreaterThan(0)` below would then pass on a spirit that never attacked
 * (found by code review).
 */
function shaved(s: ClassSummon): number {
  if (s.attackCooldown === 0) return -1;
  return (s.interval - s.attackCooldown) / s.interval;
}

describe('c011 — Kinship: the aura respects the totem lifetime it is authored with', () => {
  itCovering('Kinship aura remaining', 'a totem stops buffing on the tick it expires, not one tick later', () => {
    // One spirit before the totem and one after, so the same tick shows both
    // sides of `auraSpeedMul`'s `s.remaining <= 0` guard: the earlier spirit
    // reads the totem before it is decremented, the later one after.
    const { w, spirits, totem } = animistWorld(1, 1);
    const [early, late] = spirits;

    // Well inside the lifetime: both are buffed, which is the control.
    early.attackCooldown = 0;
    late.attackCooldown = 0;
    updateClassSummons(w, DT);
    expect(shaved(early), 'the earlier spirit was never buffed at all').toBeGreaterThan(0);
    expect(shaved(late), 'the later spirit was never buffed at all').toBeGreaterThan(0);

    // Run to the tick the totem dies on. `remaining` is stepped by the sim, not
    // assigned, so the boundary is `totemDurationSeconds` wherever a retune
    // puts it. Both spirits are re-armed every tick so each records that tick.
    let expiryTick = 0;
    for (let t = 1; t <= Math.round(60 * 60); t++) {
      early.attackCooldown = 0;
      late.attackCooldown = 0;
      updateClassSummons(w, DT);
      if (totem.remaining <= 0) {
        expiryTick = t;
        break;
      }
    }
    expect(expiryTick, 'the totem never expired inside a minute').toBeGreaterThan(0);

    // ...and it expired *when it was authored to*, not merely eventually. Both
    // Kinship cases were ratios before this line, so halving the whole
    // `s.remaining -= dt` rate cancelled out of both and a 15 s totem could
    // buff for 30 s with the file green (found by QA). The expected tick is
    // derived from `/data`, so this stays relative; the +-1 absorbs the float
    // residue of accumulating `dt`, and nothing else.
    const authoredTicks = Math.round(content.classByKey.get('animist')!.active2.totemDurationSeconds! * 60);
    expect(
      Math.abs(expiryTick - authoredTicks),
      `totem expired at tick ${expiryTick}, not the authored ${authoredTicks}`,
    ).toBeLessThanOrEqual(1);

    // The earlier spirit still saw a live totem this tick; the later one must
    // not have. Deleting `remaining <= 0` from `auraSpeedMul` buffs both.
    expect(shaved(early), 'the pre-totem spirit lost its buff early').toBeGreaterThan(0);
    expect(shaved(late), 'an expired totem still buffed a summon').toBe(0);

    // And from the next tick on the totem is gone outright, so nothing is buffed.
    early.attackCooldown = 0;
    updateClassSummons(w, DT);
    expect(w.classSummons.some((s) => s.kind === 'animist_totem')).toBe(false);
    expect(shaved(early)).toBe(0);
  });

  itCovering('Kinship aura remaining', 'the lifetime is read from `/data`: a shorter totem stops sooner', () => {
    // The *last tick the spirit was actually buffed on*, not merely the tick the
    // totem's counter crossed zero: reading `shaved` is what makes the name true
    // and keeps this a statement about the aura rather than about a field
    // decrementing (found by code review).
    const ticksBuffed = (c: Content): number => {
      const { w, spirits } = animistWorld(0, 1, c);
      const spirit = spirits[0];
      let last = 0;
      for (let t = 1; t <= Math.round(60 * 60); t++) {
        spirit.attackCooldown = 0;
        updateClassSummons(w, DT);
        if (shaved(spirit) > 0) last = t;
        else return last;
      }
      return 0;
    };
    const shipped = content.classByKey.get('animist')!.active2.totemDurationSeconds!;
    const full = ticksBuffed(content);
    const half = ticksBuffed(contentWith('animist', (r) => void (r.active2.totemDurationSeconds = shipped / 2)));
    expect(full).toBeGreaterThan(0);
    expect(half).toBeGreaterThan(0);
    expect(half / full).toBeCloseTo(0.5, 1);
  });
});

describe('c011 — Kinship: two auras combine, and casting twice does not make two', () => {
  itCovering('Kinship aura stacking', 'a second cast replaces the standing totem rather than adding one', () => {
    const { w } = animistWorld(0, 1);
    const one = auraSpeedMul(w, WX, WY);
    expect(one).toBeGreaterThan(1);

    w.warden.active2Cooldown = 0;
    expect(useClassActive2(w)).toBe(true);
    expect(w.classSummons.filter((s) => s.kind === 'animist_totem').length, 'a second cast stacked a totem').toBe(1);
    expect(auraSpeedMul(w, WX, WY)).toBeCloseTo(one, 10);
  });

  itCovering('Kinship aura stacking', 'overlapping auras multiply rather than overwrite', () => {
    // `fireRecallTotem` evicts the standing totem, so no cast can put two auras
    // on the board and `auraSpeedMul`'s `mul *=` is unreachable in play today.
    // The second aura is therefore built directly: this is a forward guard for
    // the first content that ships a second aura source, and it is red the day
    // `mul *=` is quietly relaxed to `mul =`.
    const { w, totem } = animistWorld(0, 1);
    const one = auraSpeedMul(w, WX, WY);
    w.classSummons.push({ ...totem, id: w.newId() });
    const two = auraSpeedMul(w, WX, WY);
    expect(two).toBeGreaterThan(one);
    expect(two).toBeCloseTo(one * one, 10);
  });
});

/* ---------------------------------------------- 6. & 7. Frost Touch's resets */

describe('c011 — Frost Touch: the freeze counter resets on a freeze and on a lapse', () => {
  function freezeHitsFor(c: Content): number {
    const need = c.classByKey.get('cryomancer')!.passive.freezeHits!;
    // Every case here counts hits *before* the freeze as a distinguishable
    // phase, which needs at least one of them. `freezeHits` 1 is legal data
    // (and `Brittle Frost` drives the runtime `need` there anyway), so it is
    // rejected as a harness precondition rather than left to fail as two
    // product-shaped assertions (found by QA).
    expect(need, 'harness needs a freeze that takes more than one hit').toBeGreaterThanOrEqual(2);
    return need;
  }

  itCovering('Frost Touch freeze reset', 'freezing costs the whole count again — it does not re-freeze on every later hit', () => {
    const need = freezeHitsFor(content);
    const w = passiveWorld('cryomancer');
    const e = dummy(w, WX + 1, WY);

    for (let i = 0; i < need; i++) attack(w);
    expect(e.frozenRemaining, 'the target never froze at all').toBeGreaterThan(0);

    // Wind the freeze down to a sliver so a *re*-freeze is visible as a jump
    // back up. `applyFrozen` is `Math.max(remaining, duration)`, so a refresh
    // cannot be seen on a target that is already fully frozen.
    const sliver = 0.1;
    e.frozenRemaining = sliver;
    // `frostHitStacks` is deliberately *not* reset here — the freeze itself is
    // what has to have reset it, which is the mutation this case must feel.
    for (let i = 0; i < need - 1; i++) {
      attack(w);
      expect(e.frozenRemaining, `hit ${i + 1} of the next count re-froze early`).toBe(sliver);
    }
    attack(w);
    expect(e.frozenRemaining, 'the count completed but did not re-freeze').toBeGreaterThan(sliver);
  });

  itCovering('Frost Touch freeze reset', 'the counter is zeroed by the freeze itself, so the next one is a fresh count', () => {
    // The reset under test (`applyOnHit`'s `e.frostHitStacks = 0` beside
    // `applyFrozen`), read straight off the enemy: without it the counter runs
    // away past `need` and every subsequent hit re-freezes.
    const need = freezeHitsFor(content);
    const w = passiveWorld('cryomancer');
    const e = dummy(w, WX + 1, WY);
    for (let i = 1; i <= need; i++) {
      attack(w);
      expect(e.frostHitStacks, `stack count is wrong after hit ${i}`).toBe(i === need ? 0 : i);
    }
    attack(w);
    expect(e.frostHitStacks, 'the counter did not restart after the freeze').toBe(1);
  });

  itCovering('Frost Touch freeze reset', 'the count is read from `/data`: a smaller `freezeHits` freezes sooner', () => {
    const need = freezeHitsFor(content);
    const hitsToFreeze = (c: Content): number => {
      const w = passiveWorld('cryomancer', c);
      const e = dummy(w, WX + 1, WY);
      for (let i = 1; i <= need * 2 + 4; i++) {
        attack(w);
        if (e.frozenRemaining > 0) return i;
      }
      return 0;
    };
    expect(hitsToFreeze(content)).toBe(need);
    expect(hitsToFreeze(contentWith('cryomancer', (r) => void (r.passive.freezeHits = need + 2)))).toBe(need + 2);
  });

  itCovering('Frost Touch lapse reset', 'a target that cannot be frosted banks no progress toward a freeze', () => {
    // `applyOnHit`'s `else { e.frostHitStacks = 0 }` — the lapse reset. It has
    // exactly one live route: `passiveOnHit` returns `['frost', 'frost_track']`
    // in that order, so an ordinary target has just been frosted by the time
    // the tracker looks, and only a `slowImmune` target (where `applyFrost`
    // returns early) ever reaches the branch. That is also the clause's real
    // meaning — no banking a freeze the target is immune to.
    const need = freezeHitsFor(content);
    const w = passiveWorld('cryomancer');
    const e = dummy(w, WX + 1, WY);
    e.flags |= TRAIT.slowImmune;

    for (let i = 1; i <= need * 2; i++) {
      attack(w);
      expect(e.frostRemaining, 'a slow-immune target took frost').toBe(0);
      expect(e.frostHitStacks, `a slow-immune target banked a stack on hit ${i}`).toBe(0);
    }
    expect(e.frozenRemaining, 'a slow-immune target froze').toBe(0);

    // ...and the same enemy does bank once its immunity is gone, so the row
    // above is the tracker declining to count and not the tracker being dead
    // for everyone.
    e.flags &= ~TRAIT.slowImmune;
    attack(w);
    expect(e.frostHitStacks).toBe(1);
  });

  itCovering('Frost Touch lapse reset', 'banked stacks do not survive frost lapsing', () => {
    // **The reset is unreachable through any attack, and that is the finding.**
    // `passiveOnHit` returns `['frost', 'frost_track']` in that order and is
    // `frost_track`'s only producer, so by the time the tracker looks, the same
    // hit has already re-frosted the target — the `else` never runs with a
    // nonzero counter. A slow-immune target reaches the branch (case above) but
    // has nothing banked to lose, so deleting the reset outright changes
    // nothing observable in the shipped game (verified by mutation).
    //
    // It is still the guard that makes "hit 5 times **while frosted**" mean
    // what it says, so it is pinned at `applyOnHit` — the sim's own exported
    // per-enemy on-hit hook, and the exact seam a reordered or split `onHit`
    // list would come through — rather than left as the one c011 hole with no
    // assertion at all.
    const need = freezeHitsFor(content);
    const w = passiveWorld('cryomancer');
    const e = dummy(w, WX + 1, WY);

    for (let i = 0; i < need - 1; i++) attack(w);
    expect(e.frostHitStacks, 'the harness banked nothing to lose').toBe(need - 1);

    e.frostRemaining = 0; // the frost runs out before the next hit lands
    applyOnHit(w, e, 'frost_track', 'test');
    expect(e.frostHitStacks, 'stacks survived the frost lapsing').toBe(0);

    // And the count really did restart: the target must now need the whole
    // count again rather than freezing on the next hit.
    for (let i = 0; i < need - 1; i++) attack(w);
    expect(e.frozenRemaining, 'a target froze on a count it had lost').toBe(0);
    attack(w);
    expect(e.frozenRemaining).toBeGreaterThan(0);
  });
});

/* ------------------------------------------- 8. Spreading Plague's amount */

describe('c011 — Spreading Plague: the transfer carries the whole unfinished total', () => {
  /** One unfinished DoT to hang on the carrier before it is killed. */
  type Owed = [type: string, dps: number, seconds: number];

  /**
   * Damage the bystander took from a carrier killed while owing `owed`.
   *
   * Takes a *list* because `drainPlagueTransfers` sums the carrier's stacks
   * (`dotOutstanding`) and a one-DoT carrier cannot tell that sum from "the
   * first stack": reading `e.dots[0]` instead survived a single-poison harness
   * with this file green, and a carrier owing poison **and** burning is the
   * routine case (a Poison Barrel plus any fire tower) that would then transfer
   * a fraction of what it owes (found by QA).
   */
  function transferred(...owed: Owed[]): { dealt: number; outstanding: number } {
    const w = passiveWorld('plaguebringer');
    const carrier = dummy(w, WX + 1, WY, 100);
    const bystander = dummy(w, WX + 2, WY);
    for (const [type, dps, seconds] of owed) applyDot(w, carrier, type, dps, seconds, 'test');
    const outstanding = dotOutstanding(carrier);
    const before = bystander.hp;
    damageEnemy(w, carrier, 1e6, 'test');
    expect(carrier.dead).toBe(true);
    return { dealt: before - bystander.hp, outstanding };
  }

  itCovering('Spreading Plague transferred total', 'twice the unfinished DoT transfers twice the damage', () => {
    // The repro is `damageEnemy(w, target, total, ...)` degraded to a constant.
    // A ratio, not a figure: nothing here names a poison number.
    const single = transferred(['poison', 20, 5]);
    const double = transferred(['poison', 40, 5]);
    expect(single.dealt).toBeGreaterThan(0);
    expect(double.dealt / single.dealt).toBeCloseTo(2, 6);
  });

  itCovering('Spreading Plague transferred total', 'the amount transferred is exactly what was left owing', () => {
    // `pure: true` on the transfer means armor and traits take nothing off it,
    // and the bag is unarmoured either way — so the two numbers are directly
    // comparable and any scaling factor slipped in would show here.
    const { dealt, outstanding } = transferred(['poison', 20, 5]);
    expect(outstanding).toBeGreaterThan(0);
    expect(dealt).toBeCloseTo(outstanding, 6);
  });

  itCovering('Spreading Plague transferred total', 'a longer remaining window owes more, and transfers more', () => {
    const short = transferred(['poison', 20, 2]);
    const long = transferred(['poison', 20, 6]);
    expect(long.dealt / short.dealt).toBeCloseTo(3, 6);
  });

  itCovering('Spreading Plague transferred total', 'a carrier owing two different DoTs transfers the sum, not one stack', () => {
    // The clause is "*unfinished DoT* transfers", singular only by accident of
    // the sentence: `dotOutstanding` sums every stack. Two types rather than
    // two stacks of one, so a per-type cap (poison's own `maxStacks` is 3)
    // cannot quietly merge them into the single-stack case.
    const poison = transferred(['poison', 20, 5]);
    const burning = transferred(['burning', 30, 4]);
    const both = transferred(['poison', 20, 5], ['burning', 30, 4]);

    expect(poison.dealt).toBeGreaterThan(0);
    expect(burning.dealt).toBeGreaterThan(0);
    expect(both.outstanding).toBeCloseTo(poison.outstanding + burning.outstanding, 6);
    expect(both.dealt).toBeCloseTo(poison.dealt + burning.dealt, 6);
    expect(both.dealt).toBeCloseTo(both.outstanding, 6);
  });
});

/* ----------------------------------------------- 9. Time Flow's stack cap */

describe('c011 — Time Flow: damage past the stack cap is merged, not dropped', () => {
  const cap = content.damageTypes.maxStacksPerEnemy;
  // Scaled to the cap rather than hand-tuned against today's 50: `cap + 8` hits
  // total ~20% of max HP whatever `maxStacksPerEnemy` is retuned to, so the
  // Warden cannot reform mid-drain and make `lost` meaningless (code review).
  const SHARE = 0.2 / (cap + 8);

  /**
   * Total hp the Warden lost after `hits` conversions of `SHARE` of max HP,
   * fully drained — optionally letting `elapse` seconds pass once the stack
   * array is full, *before* the overflow hits land.
   *
   * That `elapse` is the whole difference between this measuring the merge and
   * only appearing to. With every hit landed back-to-back, every stack still
   * has its full window, `dps * remaining` collapses to the same number the
   * push path would have written, and the merge formula can be replaced with
   * the *push* formula with this file green (found by QA: 6.9% of the overflow
   * is silently dropped at a 2 s-elapsed stack, and it approaches 100% as the
   * shortest stack nears expiry). A partly-elapsed shortest stack is also the
   * only kind a real run ever merges into.
   */
  function drained(hits: number, elapse = 0): { lost: number; stacks: number } {
    const w = passiveWorld('time_lord');
    const before = w.warden.hp;
    const firstBatch = elapse > 0 ? Math.min(hits, cap) : hits;
    for (let i = 0; i < firstBatch; i++) damageWarden(w, w.derived.maxHp * SHARE);
    expect(w.warden.hp, 'a converted hit landed immediately instead of as a DoT').toBe(before);
    if (elapse > 0) {
      expect(w.warden.dots.length, 'the harness never filled the stack array').toBe(cap);
      tickWardenDots(w, elapse);
      for (let i = firstBatch; i < hits; i++) damageWarden(w, w.derived.maxHp * SHARE);
    }
    const stacks = w.warden.dots.length;
    tickWardenDots(w, 1000); // far past any stack's own window, elapsed or not
    return { lost: before - w.warden.hp, stacks };
  }

  /** Half of one converted stack's own window, read off the sim rather than written down. */
  function halfWindow(): number {
    const w = passiveWorld('time_lord');
    damageWarden(w, w.derived.maxHp * SHARE);
    expect(w.warden.dots.length, 'the harness converted nothing').toBe(1);
    return w.warden.dots[0].remaining / 2;
  }

  itCovering('Time Flow stack-cap merge', 'overflow hits still arrive: more hits than the cap deal strictly more damage', () => {
    const atCap = drained(cap);
    const over = drained(cap + 8);

    expect(atCap.stacks).toBe(cap);
    expect(over.stacks, 'the stack array grew past the cap').toBe(cap);
    // The repro is the `else` branch dropping the hit instead of merging it:
    // the two totals would then be equal.
    expect(over.lost).toBeGreaterThan(atCap.lost);
  });

  itCovering('Time Flow stack-cap merge', 'nothing is lost in the merge — every hit is paid in full', () => {
    const one = drained(1);
    const over = drained(cap + 8);
    // Same hit, `cap + 8` of them: the total has to be exactly that multiple,
    // which is the "merge the full `dmg`" claim rather than merely "some of it".
    expect(over.lost / one.lost).toBeCloseTo(cap + 8, 4);
  });

  itCovering('Time Flow stack-cap merge', 'the overflow lands in the shortest-remaining stack, as the branch claims', () => {
    // Total damage is preserved whichever stack absorbs the overflow, so the
    // two cases above stay green with `remaining <` flipped to `>` — the choice
    // of stack is a *timing* claim, not a damage one, and it is the only part
    // of the branch neither covers. Folding into the shortest is what keeps the
    // merged damage arriving soonest rather than being parked behind the
    // longest window on the board.
    //
    // The search *loop* around that comparison is a different matter: every
    // Time Flow stack is pushed with the same constant window, so the array is
    // always ordered oldest-first and index 0 is always the minimum. Deleting
    // the loop is therefore an equivalent mutation on shipped content, and this
    // case deliberately does not claim otherwise — it pins the comparison,
    // which is what a second window length would make load-bearing.
    const w = passiveWorld('time_lord');
    // Fill all but one slot, let those age, then top up: the fresh stack is now
    // strictly the longest and the aged ones strictly the shortest.
    for (let i = 0; i < cap - 1; i++) damageWarden(w, w.derived.maxHp * SHARE);
    tickWardenDots(w, halfWindow());
    damageWarden(w, w.derived.maxHp * SHARE);
    expect(w.warden.dots.length, 'the harness never filled the stack array').toBe(cap);

    const before = w.warden.dots.map((d) => ({ remaining: d.remaining, dps: d.dps }));
    damageWarden(w, w.derived.maxHp * SHARE); // the overflow hit
    const grew = w.warden.dots.filter((d, i) => d.dps > before[i].dps + 1e-9);
    expect(grew.length, 'the overflow did not land in exactly one stack').toBe(1);

    const shortest = Math.min(...before.map((d) => d.remaining));
    expect(grew[0].remaining, 'the overflow was merged into a stack that was not the shortest').toBeCloseTo(
      shortest,
      10,
    );
  });

  itCovering('Time Flow stack-cap merge', 'nothing is lost merging into a stack that is already half spent', () => {
    // The case above with the *shortest stack partly elapsed* — the only state
    // the sim ever actually merges into, and the one that tells `dmg /
    // remaining` apart from the push path's `dmg / BASE` (found by QA).
    const one = drained(1);
    const over = drained(cap + 8, halfWindow());
    expect(over.lost / one.lost).toBeCloseTo(cap + 8, 4);
  });
});

/* ------------------------------------------------------------- the census */

describe('c011 — every hole c006 deferred has a case above', () => {
  it('all nine were exercised by a case that ran in this file', () => {
    // The failure this guards is a repro being quietly dropped rather than
    // fixed: c006 listed nine and this file owes nine. Vitest runs `describe`s
    // in file order, so by the time this last case runs every `cover()` call
    // above has fired — delete a case or a whole `describe` and the missing
    // hole is named here. A literal `expect(list.length).toBe(9)` would have
    // been true by construction of its own array and caught nothing (found by
    // code review; the same shape c008 and c009 each hit once).
    expect([...covered].sort()).toEqual([...HOLES].sort());
  });
});
