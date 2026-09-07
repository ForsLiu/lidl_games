/**
 * fb081 — `src/sim/combat.ts`'s `lineHit` broadphase queried enemies in a
 * circle of radius `range * 0.5 + 2`, a margin sized for the days when every
 * caller's `halfWidth` was a small fixed constant. Once c001 (§2 Area) made
 * several callers scale `halfWidth` by `w.derived.areaMul`, a wide enough
 * line's rectangle no longer fit inside that circle — the swept rectangle's
 * far corner sits at `sqrt((range/2)^2 + halfWidth^2)` from the midpoint, and
 * past ~areaMul 4 for Dash Slash (`dash_line`) that corner falls outside the
 * old `range*0.5+2` margin, so the circle saturates into a lens and the
 * outermost enemies stop being counted at all — even though the exact
 * per-enemy `perp > halfWidth + e.radius` test below it would have accepted
 * them (BACKLOG.md fb081, BACKLOG-CONTENT.md c001 Log). Confirmed bug per
 * CLAUDE.md rule 3: this file's first describe block is the failing
 * regression, red before the fix (`range * 0.5 + halfWidth + 2`) and green
 * after — mirrors the identical hand-rolled copy already fixed in
 * `classes.ts`'s `fireCrimsonRush`, pinned by `tests/class-area-stat.test.ts`.
 *
 * The rest of this file is fb081's other acceptance clause: the sibling
 * inconsistency between `towers.ts` (passed `LINE_HALF_WIDTH` raw) and
 * `vswield.ts`/`classes.ts` (scale it by Area). Per QUESTIONS.md Q194, both
 * of `towers.ts`'s line-shaped beam kinds are now aligned with the
 * `vswield.ts`/`classes.ts` convention: the `single` kind resolves its beam
 * the same instant it fires via a direct `lineHit` call (`LINE_HALF_WIDTH *
 * area`), and the `pierce` kind's `bestLineDirection` aim heuristic scales
 * the same way so a wide-Area build actually aims across the wider corridor
 * it now hits with.
 *
 * Measured first-miss threshold for `dash_line` (Swordsman): areaMul 4,
 * where `dashRange: 5, dashWidth: 1` (`data/classes.json`) gives
 * `halfWidth = 4`, and the rectangle's far corner sits at
 * `sqrt(2.5^2 + 4^2) ≈ 4.717`, past the old `range*0.5+2 = 4.5` margin.
 */
import { describe, expect, it } from 'vitest';

import { loadContent, type TowerDef } from '../src/sim/content';
import { spawnEnemy } from '../src/sim/enemies';
import { useClassActive2 } from '../src/sim/classes';
import { buildTower, updateTowers, upgradeTower } from '../src/sim/towers';
import type { Enemy } from '../src/sim/types';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const content = loadContent();
const DT = 1 / 60;

function areaWorld(classKey: string, area: number): World {
  const w = new World(cfg({ classKey }), content);
  w.gold = 1e6;
  w.warden.attackCooldown = 1e9;
  w.phase = 'act1_wave';
  if (area !== 0) {
    w.stats.addAll('test:area', { area });
    w.recomputeDerived();
  }
  return w;
}

function spawnAt(w: World, x: number, y: number): Enemy {
  const e = spawnEnemy(w, content.enemies.enemies[0].key, x, y)!;
  e.hp = 1e6;
  e.maxHp = 1e6;
  e.speed = 0;
  w.rebuildBuckets();
  return e;
}

describe('fb081: lineHit broadphase margin covers a wide, Area-scaled half-width', () => {
  it("Dash Slash (dash_line, via combat.ts's real lineHit) still counts an enemy at the edge of a very wide line", () => {
    const cls = content.classByKey.get('swordsman')!;
    const half = cls.active2.dashWidth ?? 0;
    const range = cls.active2.dashRange ?? 0;
    expect(half, 'fixture assumption: Dash Slash authors a nonzero dashWidth').toBeGreaterThan(0);
    const bigArea = 7; // areaMul 8, well past the ~4 where the old margin clipped

    const w = areaWorld('swordsman', bigArea);
    const scaledHalf = half * w.derived.areaMul;
    const e = spawnAt(w, w.warden.x + range * 0.5, w.warden.y + scaledHalf * 0.9);
    const hpBefore = e.hp;
    useClassActive2(w, w.warden.x + range, w.warden.y);
    expect(e.hp, 'an enemy inside the true (scaled) half-width must still be struck').toBeLessThan(hpBefore);
  });

  it('a small, unscaled half-width still saturates correctly at the old margin (no regression at areaMul 1)', () => {
    const cls = content.classByKey.get('swordsman')!;
    const half = cls.active2.dashWidth ?? 0;
    const range = cls.active2.dashRange ?? 0;

    const w = areaWorld('swordsman', 0);
    const e = spawnAt(w, w.warden.x + range * 0.5, w.warden.y + half * 0.9);
    const hpBefore = e.hp;
    useClassActive2(w, w.warden.x + range, w.warden.y);
    expect(e.hp).toBeLessThan(hpBefore);
  });

  it("Dash Slash still hits an enemy standing right at the line's far corner past areaMul 4", () => {
    const cls = content.classByKey.get('swordsman')!;
    const dashRange = cls.active2.dashRange ?? 0;
    const dashWidth = cls.active2.dashWidth ?? 0;
    expect(dashRange).toBeGreaterThan(0);
    expect(dashWidth).toBeGreaterThan(0);

    // area=3 -> areaMul 4, well past the ~4 corner where the old constant
    // margin (range*0.5+2) first falls short of the rectangle's true reach.
    const w = areaWorld('swordsman', 3);
    const halfWidth = dashWidth * w.derived.areaMul;
    expect(halfWidth).toBeCloseTo(4, 6);

    // Placed just inside the actual hit rectangle's far corner (along near
    // dashRange, perp near halfWidth) — exactly the region the old circular
    // broadphase undershoots. At range=5/halfWidth=4 this corner sits at
    // distance ~4.66 from the query center, past the old margin of 4.5.
    const e = spawnEnemy(w, content.enemies.enemies[0].key, w.warden.x + dashRange * 0.99, w.warden.y + halfWidth * 0.99)!;
    e.hp = 1e6;
    e.maxHp = 1e6;
    e.speed = 0;
    e.radius = 0.1;
    w.rebuildBuckets();

    w.warden.hp = 1;
    // Aim straight along +x so `dir = (1, 0)` and the corner math above holds.
    useClassActive2(w, w.warden.x + 100, w.warden.y);

    expect(e.hp).toBeLessThan(1e6);
  });
});

describe('fb081: towers.ts single-kind beams now scale with Area, matching vswield/classes (Q194)', () => {
  const ARROW = content.towerByKey.get('arrow_spire')!;

  /** A free, buildable tile that will not seal the path. */
  function freeTile(w: World): { tx: number; ty: number } {
    for (let ty = 4; ty < 20; ty++) {
      for (let tx = 4; tx < 20; tx++) {
        if (w.grid.buildable(tx, ty) && !w.grid.wouldBlockPath([[tx, ty]])) return { tx, ty };
      }
    }
    throw new Error('no buildable tile');
  }

  /**
   * `attackProfile` (upgrades.ts) reads a special's `at` against
   * `steps = level - 1`, so arrow_spire's `{ at: 3, key: 'pierce' }`
   * unlocks at tier 4 (3 upgrades from the built tier 1), not tier 3 —
   * needed so the sweep past the primary target has a hit to spend.
   */
  function buildPiercingArrow(w: World, def: TowerDef): { x: number; y: number } {
    const { tx, ty } = freeTile(w);
    w.warden.x = tx + 0.5;
    w.warden.y = ty + 0.5;
    w.gold = 1e6;
    expect(buildTower(w, def.id, tx, ty).ok).toBe(true);
    for (let i = 0; i < 3; i++) expect(upgradeTower(w, tx, ty)).toBe(true);
    return { x: tx + 0.5, y: ty + 0.5 };
  }

  // `targetFirst` (combat.ts) picks the enemy nearest the Core along the
  // flow field, not the nearest to the tower in a straight line — so a
  // "side" enemy placed only to test the sweep must be kept *outside*
  // `targetFirst`'s own range-5 circle around the tower (Euclidean, by
  // construction: `enemiesInRadius` is a true `dist2 <= radius^2` filter)
  // so it can never itself be chosen as primary, whatever the flow field
  // says. `along <= range` still holds, so the sweep phase (a different,
  // offset circle) still reaches it.
  it('a side enemy only within the Area-scaled half-width is pierced, at high Area', () => {
    const w = new World(cfg(), content);
    const { x, y } = buildPiercingArrow(w, ARROW);
    w.stats.addAll('test:area', { area: 7 }); // areaMul 8
    w.recomputeDerived();

    const primary = spawnAt(w, x + 1, y);
    // along=4 (<= range 5), perp=3.3: Euclidean distance from the tower is
    // ~5.19, outside targetFirst's range-5 circle, so this can only ever be
    // hit by the sweep — never chosen as primary itself.
    const side = spawnAt(w, x + 4, y + 3.3);
    const sideHpBefore = side.hp;

    for (let i = 0; i < 60 && side.hp === sideHpBefore; i++) {
      w.rebuildBuckets();
      updateTowers(w, DT);
    }
    expect(primary.hp, 'sanity: the shot still fires, on the intended primary').toBeLessThan(1e6);
    expect(side.hp, 'the widened beam must reach the side enemy').toBeLessThan(sideHpBefore);
  });

  it('the same side enemy is not pierced at areaMul 1 (the beam is really narrower, not just luckier)', () => {
    const w = new World(cfg(), content);
    const { x, y } = buildPiercingArrow(w, ARROW);

    const primary = spawnAt(w, x + 1, y);
    const side = spawnAt(w, x + 4, y + 3.3);
    const sideHpBefore = side.hp;

    for (let i = 0; i < 60; i++) {
      w.rebuildBuckets();
      updateTowers(w, DT);
    }
    expect(primary.hp, 'sanity: the shot still fires, on the intended primary').toBeLessThan(1e6);
    expect(side.hp, 'at areaMul 1 the side enemy sits outside the real (unscaled) half-width').toBe(sideHpBefore);
  });
});
