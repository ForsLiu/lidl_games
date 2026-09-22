/**
 * fb151 (qa-playtester, filed during fb112 verification): `fireDashSlash`
 * (`src/sim/classes.ts`) swept `lineHit` out to `hitRange = dashRange +
 * mergedRadius` (widened whenever a Circle Slash charge merges in, per G9),
 * but emitted the `class_active2` fx event with `resolveDashTarget`'s
 * clamped *travel* endpoint instead — a value that never sees `mergedRadius`
 * and can additionally be clamped short by a wall the hit line itself
 * ignores. `canvas.ts`'s draw is a pure no-op over whatever the event
 * carries (confirmed by reading both sides — the bug is entirely in what
 * gets emitted), so the drawn slash could be shorter than the real hit
 * corridor: enemies died with no visible slash reaching them.
 *
 * This pins the fix directly against `w.fx`, independent of rendering:
 * a solo (unmerged) dash's emitted segment is unaffected (`mergedRadius` is
 * 0, so `hitRange === dashRange` and nothing changes); a merged dash's
 * emitted segment must be longer than the solo dash's by exactly the
 * charge's own (area-scaled) radius — the same `mergedRadius` `p6b-swordsman
 * .test.ts`'s "sums the two damages" case already proves the real hit line
 * reaches.
 */
import { describe, expect, it } from 'vitest';

import { circleSlashValues } from '../src/sim/classes';
import { loadContent, type ClassDef } from '../src/sim/content';
import { applyCommand, updateWarden } from '../src/sim/run';
import type { TickInput } from '../src/sim/types';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const content = loadContent();
const swordsman = content.classByKey.get('swordsman')! as ClassDef;

function held(active1Held: boolean): TickInput {
  return { mx: 0, my: 0, dash: false, attack: false, aimX: 0, aimY: 0, active1Held, cmds: [] };
}

function worldWith(): World {
  const w = new World(cfg({ classKey: 'swordsman' }));
  w.gold = 1e6;
  // Suppresses the basic attack so it cannot also emit a `class_active2`-
  // adjacent fx and contaminate the "last emitted" lookup below.
  w.warden.attackCooldown = 1e9;
  return w;
}

function lastDashSlashFx(w: World): { x: number; y: number; a: number; b: number } {
  for (let i = w.fx.length - 1; i >= 0; i--) {
    const fx = w.fx[i]!;
    if (fx.k === 'class_active2') return fx;
  }
  throw new Error('expected a class_active2 fx event');
}

describe('fb151: Dash Slash emits the real hit-line endpoint, not the (possibly shorter) travel target', () => {
  it('a solo (unmerged) dash is unaffected: emitted length equals the plain travel distance', () => {
    const w = worldWith();
    const before = { x: w.warden.x, y: w.warden.y };
    applyCommand(w, { k: 'class_active2', aimX: before.x + 10, aimY: before.y });
    const fx = lastDashSlashFx(w);
    expect(fx.x).toBeCloseTo(before.x, 5);
    expect(fx.y).toBeCloseTo(before.y, 5);
    expect(Math.hypot(fx.a - before.x, fx.b - before.y)).toBeGreaterThan(0);
  });

  it('a dash merged with a full Circle Slash charge emits a segment widened by the charge radius, past the travel target', () => {
    const solo = worldWith();
    const soloBefore = { x: solo.warden.x, y: solo.warden.y };
    applyCommand(solo, { k: 'class_active2', aimX: soloBefore.x + 10, aimY: soloBefore.y });
    const soloFx = lastDashSlashFx(solo);
    const soloLen = Math.hypot(soloFx.a - soloBefore.x, soloFx.b - soloBefore.y);

    const merged = worldWith();
    const mergedBefore = { x: merged.warden.x, y: merged.warden.y };
    for (let t = 0; t < 250; t++) updateWarden(merged, held(true), 1 / 60);
    expect(merged.warden.active1Charging).toBe(true);
    const v = circleSlashValues(swordsman.active1, merged.warden.active1Charge);
    const expectedMergedRadius = v.radius * merged.derived.areaMul;

    applyCommand(merged, { k: 'class_active2', aimX: mergedBefore.x + 10, aimY: mergedBefore.y });
    const mergedFx = lastDashSlashFx(merged);
    const mergedLen = Math.hypot(mergedFx.a - mergedBefore.x, mergedFx.b - mergedBefore.y);

    // Before the fix this was `toBeCloseTo(soloLen, 4)` — the emitted
    // endpoint was `resolveDashTarget`'s travel target, which never sees
    // `mergedRadius` because travel distance is calibrated from `dashRange`
    // alone. The fix widens the emitted endpoint to match `hitRange`, the
    // extent `lineHit` actually swept.
    expect(mergedLen).toBeCloseTo(soloLen + expectedMergedRadius, 4);
    expect(mergedLen).toBeGreaterThan(soloLen + 0.01);
  });
});
