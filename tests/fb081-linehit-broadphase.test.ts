/**
 * fb081 — `combat.ts`'s `lineHit` broadphase query uses a constant `range *
 * 0.5 + 2` margin around the line's midpoint. That margin only bounds the
 * rectangle swept by the line (half-length `range/2`, half-width
 * `halfWidth`) while `halfWidth <= ~2`; once an Area-scaled `halfWidth`
 * pushes the rectangle's corner (`sqrt((range/2)^2 + halfWidth^2)`) past the
 * margin, the outermost enemies fall outside the broadphase circle and are
 * never even perp-tested, let alone hit. `tests/class-area-stat.test.ts`
 * pinned this same defect in `classes.ts`'s own hand-rolled copy for
 * Crimson Rush (`fireCrimsonRush`) and fixed it there; the `combat.ts`
 * original — used by every tower beam (`towers.ts`) and by Swordsman's Dash
 * Slash (`fireDashSlash`, `classes.ts`) — was left as this follow-up.
 *
 * Measured first-miss threshold for `dash_line` (Swordsman): areaMul 4,
 * where `dashRange: 5, dashWidth: 1` (`data/classes.json`) gives
 * `halfWidth = 4`, and the rectangle's far corner sits at
 * `sqrt(2.5^2 + 4^2) ≈ 4.717`, past the old `range*0.5+2 = 4.5` margin.
 */
import { describe, expect, it } from 'vitest';

import { useClassActive2 } from '../src/sim/classes';
import { loadContent } from '../src/sim/content';
import { spawnEnemy } from '../src/sim/enemies';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const content = loadContent();

function areaWorld(classKey: string, area: number): World {
  const w = new World(cfg({ classKey }));
  w.gold = 1e6;
  w.warden.attackCooldown = 1e9;
  w.phase = 'act1_wave';
  if (area !== 0) {
    w.stats.addAll('test:area', { area });
    w.recomputeDerived();
  }
  return w;
}

describe('fb081: lineHit broadphase covers a wide, Area-scaled line all the way to its far corners', () => {
  it("Dash Slash still hits an enemy standing at the line's far corner past areaMul 4", () => {
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
