/**
 * c001 — SPEC-FINAL §2's stat table, Area row: "Effect radius from center;
 * **applies to every attack, active, and effect**."
 *
 * `towers.ts` (`effectiveTowerRange`/`effectiveTowerAoe`), `vswield.ts`,
 * `damagetypes.ts` (Electric's inherent AoE) and `enemies.ts` (Burning's
 * splash) all scale their radii by `w.derived.areaMul`. `src/sim/classes.ts`
 * did not read it once, so every class Active landed at exactly its authored
 * radius no matter how much Area the run had bought — Normal Bracelet's
 * +10%, the Animist's own Wide Grove and every `area` tree/boon source were
 * dead for all 24 Actives. Found by the lane-scoped generation rule; a
 * code-contradicts-SPEC-FINAL bug, so per CLAUDE.md rule 3 it outranks the
 * queue and gets its failing test first.
 *
 * **The line this file pins**, and the one `classArea` (classes.ts) is
 * written to: §2's Area is an *effect footprint from a center*, so it scales
 * a nova/cloud/zone/aura radius, a line attack's perpendicular half-width and
 * a basic attack's splash. It is deliberately NOT applied to travel
 * distances (a dash's length), to line lengths (Deadeye Draw's reach), or to
 * target-search/cast-reach radii (Chain Surge's jump distance, Field Kit's
 * "nearest structure" search) — those are Range, §2's own separate stat, and
 * `charRange`/`towerRange` already scale what they should.
 *
 * A class summon's own attack `aoe` *is* scaled, but frozen at spawn beside
 * its dps/range — see `classArea`'s own comment for the asymmetry code review
 * found there and how it was resolved.
 */
import { describe, expect, it } from 'vitest';

import {
  classBasicAttack,
  tickClassCharge,
  updateClassPassives,
  useClassActive,
  useClassActive2,
} from '../src/sim/classes';
import { loadContent } from '../src/sim/content';
import { LINE_HALF_WIDTH } from '../src/sim/towers';
import { applyDot, spawnEnemy } from '../src/sim/enemies';
import type { Enemy, TickInput } from '../src/sim/types';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const content = loadContent();

/** +100% Area, applied as its own `Stats` source so `derive` folds it exactly as a bracelet/boon would. */
const AREA_BONUS = 1;

function areaWorld(classKey: string, area: number): World {
  const w = new World(cfg({ classKey }));
  w.gold = 1e6;
  // Suppress the basic attack: it would otherwise contaminate an Active-only
  // radius measurement, the same convention p6b/p6c's harnesses use.
  w.warden.attackCooldown = 1e9;
  w.phase = 'act1_wave';
  if (area !== 0) {
    w.stats.addAll('test:area', { area });
    w.recomputeDerived();
  }
  return w;
}

function idle(over: Partial<TickInput> = {}): TickInput {
  return { mx: 0, my: 0, dash: false, attack: false, aimX: 0, aimY: 0, active1Held: false, cmds: [], ...over };
}

/** The `a` field of the last emitted `k` event — every self-centered Active reports its own radius there. */
function lastFxRadius(w: World, k: string): number {
  for (let i = w.fx.length - 1; i >= 0; i--) {
    if (w.fx[i].k === k) return w.fx[i].a;
  }
  throw new Error(`no "${k}" event was emitted`);
}

function spawnAt(w: World, x: number, y: number): Enemy {
  const e = spawnEnemy(w, content.enemies.enemies[0].key, x, y)!;
  e.hp = 1e6;
  e.maxHp = 1e6;
  e.speed = 0;
  w.rebuildBuckets();
  return e;
}

describe('c001: the Area stat reaches every self-centered class Active radius', () => {
  it('derive folds the test Area source into areaMul, so the harness itself is honest', () => {
    expect(areaWorld('swordsman', 0).derived.areaMul).toBe(1);
    expect(areaWorld('swordsman', AREA_BONUS).derived.areaMul).toBeCloseTo(1 + AREA_BONUS, 10);
  });

  /**
   * Every entry: a class, how to fire the Active in question, and how to read
   * back the radius it actually landed at. The expected value is always the
   * *authored* `/data` radius times `areaMul` — hardcoding a number here
   * would only re-state `data/classes.json`, and the thing under test is the
   * multiplication, not the authored value.
   */
  const CASES: ReadonlyArray<{
    name: string;
    classKey: string;
    authored: (w: World) => number;
    fire: (w: World) => void;
    observe: (w: World) => number;
  }> = [
    {
      name: 'Pyro Immolation Wave (burst_damage)',
      classKey: 'pyromancer',
      authored: (w) => w.content.classByKey.get('pyromancer')!.active1.radius,
      fire: (w) => void useClassActive(w),
      observe: (w) => lastFxRadius(w, 'class_active'),
    },
    {
      name: 'Plaguebringer Poison Barrel (ground_poison)',
      classKey: 'plaguebringer',
      authored: (w) => w.content.classByKey.get('plaguebringer')!.active1.radius,
      fire: (w) => void useClassActive(w),
      observe: (w) => w.areas.find((a) => a.type === 'poison' && !a.dead)!.radius,
    },
    {
      name: 'Cryomancer Frost Nova (frost_nova)',
      classKey: 'cryomancer',
      authored: (w) => w.content.classByKey.get('cryomancer')!.active1.radius,
      fire: (w) => void useClassActive(w),
      observe: (w) => lastFxRadius(w, 'class_active'),
    },
    {
      name: 'Paladin Clarion Taunt (clarion_taunt)',
      classKey: 'paladin',
      authored: (w) => w.content.classByKey.get('paladin')!.active1.radius,
      fire: (w) => void useClassActive(w),
      observe: (w) => lastFxRadius(w, 'class_active'),
    },
    {
      name: 'Time Lord Time (time_mark r7 pulse)',
      classKey: 'time_lord',
      authored: (w) => w.content.classByKey.get('time_lord')!.active1.radius,
      fire: (w) => {
        // `fireTimeMark` only emits when the pulse actually caught something.
        spawnAt(w, w.warden.x + 0.5, w.warden.y);
        void useClassActive(w);
      },
      observe: (w) => lastFxRadius(w, 'class_active'),
    },
    {
      name: 'Time Lord Time Lock (time_lock zone)',
      classKey: 'time_lord',
      authored: (w) => w.content.classByKey.get('time_lord')!.active2.radius,
      fire: (w) => void useClassActive2(w, w.warden.x, w.warden.y),
      observe: (w) => w.timeLockZone!.radius,
    },
    {
      name: 'Animist Recall Totem (recall_totem aura)',
      classKey: 'animist',
      authored: (w) => w.content.classByKey.get('animist')!.active2.radius,
      fire: (w) => void useClassActive2(w),
      observe: (w) => w.classSummons.find((s) => s.isAura)!.auraRadius!,
    },
    {
      name: 'Pyro Flame Road (dash_trail burn patches)',
      classKey: 'pyromancer',
      authored: (w) => w.content.classByKey.get('pyromancer')!.active2.dashWidth ?? 0,
      fire: (w) => void useClassActive2(w, w.warden.x + 5, w.warden.y),
      observe: (w) => w.areas.find((a) => a.type === 'burn' && !a.dead)!.radius,
    },
    {
      name: 'Swordsman Circle Slash (charge_nova, at full charge)',
      classKey: 'swordsman',
      authored: (w) => w.content.classByKey.get('swordsman')!.active1.radius,
      fire: (w) => {
        const cls = w.content.classByKey.get('swordsman')!;
        const cap = cls.active1.chargeCapSeconds ?? 3;
        // Hold past the cap, then release: `circleSlashValues` clamps the
        // fraction to 1, so this is the authored full-charge radius.
        tickClassCharge(w, cls, idle({ active1Held: true }), cap * 2);
        tickClassCharge(w, cls, idle({ active1Held: false }), 1 / 60);
      },
      observe: (w) => lastFxRadius(w, 'class_active'),
    },
  ];

  for (const c of CASES) {
    // `areaMul` is not 1 for every kit even with no test source: the Animist's
    // own Wide Grove tower passive authors the *global* `area` stat (there is
    // no tower-only Area stat key today), so an Animist run already carries
    // +10%. The claim is always "authored x whatever areaMul the run has",
    // never "authored" — asserting the latter would only re-pin
    // `data/classes.json`'s own numbers.
    it(`${c.name}: the radius that lands is the authored value x areaMul`, () => {
      const w = areaWorld(c.classKey, 0);
      c.fire(w);
      expect(c.observe(w)).toBeCloseTo(c.authored(w) * w.derived.areaMul, 10);
    });

    it(`${c.name}: +${AREA_BONUS * 100}% Area widens it by exactly that much`, () => {
      const plain = areaWorld(c.classKey, 0);
      c.fire(plain);
      const before = c.observe(plain);

      const boosted = areaWorld(c.classKey, AREA_BONUS);
      c.fire(boosted);
      expect(c.observe(boosted)).toBeCloseTo(c.authored(boosted) * boosted.derived.areaMul, 10);
      // The ratio is the real claim, and it holds whatever baseline Area the
      // kit itself carries.
      expect(c.observe(boosted) / before).toBeCloseTo(1 + AREA_BONUS, 10);
    });
  }
});

describe('c001: Area reaches the footprints that are not a plain radius field', () => {
  it("a Dash Slash's perpendicular half-width scales, so an enemy off the line is only struck with Area", () => {
    const cls = content.classByKey.get('swordsman')!;
    const half = cls.active2.dashWidth ?? 0;
    expect(half).toBeGreaterThan(0);
    // Sits beside the dash line, outside the authored half-width but inside
    // the doubled one — the one enemy whose fate the fix changes.
    const offset = half * 1.5;

    const plain = areaWorld('swordsman', 0);
    const a = spawnAt(plain, plain.warden.x + 2, plain.warden.y + offset);
    useClassActive2(plain, plain.warden.x + 5, plain.warden.y);
    expect(a.hp).toBe(a.maxHp);

    const boosted = areaWorld('swordsman', AREA_BONUS);
    const b = spawnAt(boosted, boosted.warden.x + 2, boosted.warden.y + offset);
    useClassActive2(boosted, boosted.warden.x + 5, boosted.warden.y);
    expect(b.hp).toBeLessThan(b.maxHp);
  });

  it("a class basic attack's splash radius scales", () => {
    const splashClass = content.classes.classes.find((c) => c.basicAttack.aoe > 0);
    expect(splashClass, 'no class authors a basic-attack aoe').toBeDefined();
    const aoe = splashClass!.basicAttack.aoe;
    const offset = aoe * 1.5;

    for (const [area, expectSplashed] of [
      [0, false],
      [AREA_BONUS, true],
    ] as const) {
      const w = areaWorld(splashClass!.key, area);
      w.warden.attackCooldown = 0; // this one test wants the basic attack
      const primary = spawnAt(w, w.warden.x + 1, w.warden.y);
      const bystander = spawnAt(w, w.warden.x + 1, w.warden.y + offset);
      classBasicAttack(w, w.content.classByKey.get(splashClass!.key)!);
      expect(primary.hp).toBeLessThan(primary.maxHp);
      expect(bystander.hp < bystander.maxHp).toBe(expectSplashed);
    }
  });

  it("Contagious Flame's touch radius scales", () => {
    const cls = content.classByKey.get('pyromancer')!;
    const radius = cls.passive.flameRadius ?? 0;
    expect(radius).toBeGreaterThan(0);
    const offset = radius * 1.5;

    for (const [area, expectBurned] of [
      [0, false],
      [AREA_BONUS, true],
    ] as const) {
      const w = areaWorld('pyromancer', area);
      const carrier = spawnAt(w, w.warden.x + 3, w.warden.y);
      const neighbour = spawnAt(w, w.warden.x + 3, w.warden.y + offset);
      applyDot(w, carrier, 'burning', 5, 10, 'test');
      updateClassPassives(w, 1 / 60);
      expect(neighbour.hp < neighbour.maxHp).toBe(expectBurned);
    }
  });
});

describe('c001: the two line kinds whose half-width is the footprint', () => {
  /**
   * Both kinds carry their half-width in a field the CASES table above cannot
   * read back off world state, so each is driven behaviourally: an enemy
   * parked beside the line, outside the authored half-width and inside the
   * scaled one. code-reviewer/qa-playtester on c001 both flagged these two
   * (plus `dash_trail`, now a CASES row) as scaled-but-unasserted.
   */
  it("Deadeye Draw's perpendicular half-width scales (its length, tested below, does not)", () => {
    const cls = content.classByKey.get('archer')!;
    // LINE_HALF_WIDTH is the shared line constant `fireDeadeyeDraw` passes.
    const offset = LINE_HALF_WIDTH * 1.5;
    const aimAt = (w: World) => ({ aimX: w.warden.x + cls.active1.radius * 0.5, aimY: w.warden.y });

    for (const [area, expectHit] of [
      [0, false],
      [AREA_BONUS, true],
    ] as const) {
      const w = areaWorld('archer', area);
      const beside = spawnAt(w, w.warden.x + cls.active1.radius * 0.4, w.warden.y + offset);
      // `lineHit` accepts `halfWidth + e.radius`, so the body's own girth has
      // to be taken out of the way for the half-width itself to be the thing
      // under test.
      beside.radius = 0.01;
      const cap = cls.active1.chargeCapSeconds ?? 3;
      tickClassCharge(w, cls, idle({ ...aimAt(w), active1Held: true }), cap * 2);
      tickClassCharge(w, cls, idle({ ...aimAt(w), active1Held: false }), 1 / 60);
      expect(beside.hp < beside.maxHp).toBe(expectHit);
    }
  });

  it("Crimson Rush's half-width scales, so the dash heals for more enemies passed", () => {
    const cls = content.classByKey.get('bloodlord')!;
    const half = cls.active2.dashWidth ?? 0;
    const range = cls.active2.dashRange ?? 0;
    expect(half).toBeGreaterThan(0);
    const offset = half * 1.5;

    const healed = (area: number): number => {
      const w = areaWorld('bloodlord', area);
      spawnAt(w, w.warden.x + range * 0.5, w.warden.y + offset);
      w.warden.hp = 1; // room to actually observe the heal
      useClassActive2(w, w.warden.x + range, w.warden.y);
      return w.warden.hp;
    };
    // Only the boosted dash counts the enemy beside the line, so only it heals.
    expect(healed(AREA_BONUS)).toBeGreaterThan(healed(0));
  });

  /**
   * qa-playtester on c001: `lineHit`'s broadphase (`combat.ts`) and this
   * kind's hand-rolled copy both used a constant `+ 2` margin, so above
   * areaMul ~4 a widened half-width saturated into a lens and the outermost
   * enemies stopped being counted at all. The `classes.ts` copy now includes
   * `half` in the margin; the `combat.ts` copy is outside this lane's Scope
   * and is logged. This pins the half that was fixed.
   */
  it("Crimson Rush still counts an enemy at the edge of a very wide line (broadphase margin)", () => {
    const cls = content.classByKey.get('bloodlord')!;
    const half = cls.active2.dashWidth ?? 0;
    const range = cls.active2.dashRange ?? 0;
    const bigArea = 7; // areaMul 8, well past the ~4 where the old margin clipped

    const w = areaWorld('bloodlord', bigArea);
    const scaledHalf = half * w.derived.areaMul;
    const e = spawnAt(w, w.warden.x + range * 0.5, w.warden.y + scaledHalf * 0.9);
    w.warden.hp = 1;
    const before = w.warden.hp;
    useClassActive2(w, w.warden.x + range, w.warden.y);
    expect(e.id).toBeGreaterThan(0);
    expect(w.warden.hp).toBeGreaterThan(before);
  });
});

describe('c001: the one place Area legitimately buys reach', () => {
  /**
   * `fireDashSlash`'s `hitRange = dashRange + mergedRadius`: G9 reads a
   * mid-charge merge as the nova's would-be radius widening the dash's hit
   * line, so a scaled nova radius extends it. Called out by both reviewers as
   * the exception to `classArea`'s "Area never lengthens a line" rule —
   * pinned here so the reading is a decision, not an accident. The dash's own
   * travel distance stays unscaled, which is the other half of the claim.
   */
  it("a merged Circle Slash extends Dash Slash's hit line by the scaled nova radius, but not its travel", () => {
    const cls = content.classByKey.get('swordsman')!;
    const dashRange = cls.active2.dashRange ?? 0;
    const nova = cls.active1.radius;
    // Beyond `dashRange + nova` but inside `dashRange + nova * 2`.
    const beyond = dashRange + nova * 1.5;

    const fire = (area: number): { hit: boolean; travelled: number } => {
      const w = areaWorld('swordsman', area);
      const startX = w.warden.x;
      const far = spawnAt(w, startX + beyond, w.warden.y);
      const cap = cls.active1.chargeCapSeconds ?? 3;
      tickClassCharge(w, cls, idle({ active1Held: true }), cap * 2);
      useClassActive2(w, startX + dashRange, w.warden.y);
      const travel = w.warden.dashTravel!;
      return { hit: far.hp < far.maxHp, travelled: Math.abs(travel.x1 - travel.x0) };
    };

    const plain = fire(0);
    const boosted = fire(AREA_BONUS);
    expect(plain.hit).toBe(false);
    expect(boosted.hit).toBe(true);
    // The dash itself is movement, not a footprint: same distance either way.
    expect(boosted.travelled).toBeCloseTo(plain.travelled, 10);
  });
});

describe('c001: Area is deliberately not applied to Range-shaped numbers', () => {
  it("a Deadeye Draw's line length is unchanged by Area (that is charRange's job)", () => {
    const cls = content.classByKey.get('archer')!;
    const reach = cls.active1.radius;
    // Just past the authored reach: still a miss even at +100% Area.
    const beyond = reach * 1.5;
    const w = areaWorld('archer', AREA_BONUS);
    const far = spawnAt(w, w.warden.x + beyond, w.warden.y);
    const cap = cls.active1.chargeCapSeconds ?? 3;
    const aim = idle({ aimX: w.warden.x + beyond, aimY: w.warden.y });
    tickClassCharge(w, cls, { ...aim, active1Held: true }, cap * 2);
    tickClassCharge(w, cls, { ...aim, active1Held: false }, 1 / 60);
    expect(far.hp).toBe(far.maxHp);
  });
});
