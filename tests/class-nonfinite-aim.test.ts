/**
 * fb204 (BACKLOG-CONTENT) — a non-finite aim (`NaN`, `+-Infinity` — a
 * hand-edited input log or replay bundle can produce one; a mouse cannot)
 * reaches `fireTimeLock` through `useClassActive2`'s raw `aimX ?? wd.x`,
 * which only guards `undefined`. `NaN ?? wd.x` is `NaN`, so Time Lock plants
 * its zone at `(NaN, NaN)`, which then lives its full span and feeds `NaN`
 * into `hashWorld` (fb059 QA finding 3) — the exact defect fb059 already
 * found and fixed for Voltbolt's Lightning Ball alone
 * (`fireLightningBall`'s own guard, `tests/class-voltbolt.test.ts`'s "an aim
 * of (...) is treated as unaimed" cases).
 *
 * **The defect is generic, not Time-Lock-specific**, and this file's real
 * job is proving that, not just re-proving the one reported case:
 *   - every `aimX ?? wd.x`/`aimY ?? wd.y` pattern in `classes.ts` (Time Lock,
 *     Mind Manipulation, Spreading Madness, Field Kit, Chain Surge, Death
 *     Pact, Blood Tithe, Ice Wall) has the identical `??`-only gap;
 *   - every dash-kind Active2 (Dash Slash, Quickstep, Flame Road, Crimson
 *     Rush) routes through the shared `aimDirection` helper, whose
 *     `normalize(NaN - x, NaN - y)` call is worse than a silent pass-through:
 *     `normalize` only treats a *zero* length as "no direction"
 *     (`l === 0`), and a `NaN` length survives that check, so it comes back
 *     out as `{x: NaN, y: NaN}` and would plant the Warden itself at NaN on
 *     landing — not merely a cosmetic zone position, an unrecoverable World.
 *
 * **The fix** (`src/sim/classes.ts`) sanitizes `aimX`/`aimY` once, at the two
 * Command entry points `useClassActive`/`useClassActive2`, before either
 * dispatches to any kind's fire function (`sanitizeAim`) — the same "no aim
 * at all" reading fb059 gave a bad pair, now applied generically instead of
 * per-kind. `fireLightningBall`'s own now-redundant local guard was
 * simplified to lean on it rather than duplicate it.
 *
 * Every row below reuses `tests/class-board.ts`'s shared probed geometry
 * (`WX`/`WY` the Warden's park, `BUILD_TX`/`BUILD_TY` the shared build tile
 * one tile east — closer than, and so at least as "inside every authored
 * radius in the game" as, `class-kit-whiff.test.ts`'s own `WALL_TX`/`WALL_TY`
 * aim point) so a terrain change moves with every importer instead of
 * breaking this file alone.
 */
import { describe, expect, it } from 'vitest';

import { tickClassCharge, useClassActive, useClassActive2 } from '../src/sim/classes';
import { loadContent } from '../src/sim/content';
import { spawnEnemy } from '../src/sim/enemies';
import { buildTower } from '../src/sim/towers';
import { emptyInput } from '../src/sim/types';
import { World } from '../src/sim/world';
import { tickDashTravel } from '../src/sim/wardenmove';
import { BUILD_TX, BUILD_TY, WX, WY } from './class-board';
import { cfg } from './helpers';

const content = loadContent();

const AX = BUILD_TX;
const AY = BUILD_TY;

function world(classKey: string): World {
  const w = new World(cfg({ classKey }), content);
  w.gold = 1e6;
  w.warden.attackCooldown = 1e9;
  w.warden.x = WX;
  w.warden.y = WY;
  w.phase = 'act1_wave';
  return w;
}

function tower(w: World, tx: number = BUILD_TX, ty: number = BUILD_TY): void {
  const res = buildTower(w, content.towerByKey.get('arrow_spire')!.id, tx, ty);
  expect(res.ok, `harness could not build a probe tower at ${tx},${ty}`).toBe(true);
}

function bag(w: World): void {
  const firstEnemy = content.enemies.enemies[0];
  if (!firstEnemy) throw new Error('no enemies in content');
  const e = spawnEnemy(w, firstEnemy.key, AX, AY)!;
  e.hp = 1e6;
  e.maxHp = 1e6;
  e.speed = 0;
  e.armor = 0;
  w.rebuildBuckets();
}

/** Resolves an armed dash travel, the p6b/c007 convention (`tickDashTravel` moves only `wd.x/y`). */
function settle(w: World): void {
  for (let t = 0; t < 600 && w.warden.dashTravel; t++) tickDashTravel(w, 1 / 60);
  expect(w.warden.dashTravel, 'a dash travel never landed within 10 s').toBeNull();
}

/** Broad enough to catch a divergent search result or a corrupted position, narrow enough to stay legible. */
function snapshot(w: World): unknown {
  const wd = w.warden;
  return {
    warden: [wd.x, wd.y],
    timeLockZones: w.timeLockZones.map((z) => [z.x, z.y, z.radius, z.remaining]),
    tempWalls: w.tempWalls.map((t) => [t.structureIds.length, t.remaining]),
    areas: w.areas.map((a) => [a.type, a.x, a.y, a.radius, a.remaining]),
    classSummons: w.classSummons.map((s) => [s.kind, s.x, s.y, s.dps, s.remaining]),
    mindTicks: w.mindTicks.map((m) => [m.enemyId, m.ticksLeft]),
    structures: w.structures.map((s) => [s.tx, s.ty, s.hp, s.pactActive, s.tithed, s.atkSpdBuffRemaining]),
    enemies: w.enemies.map((e) => [
      e.id,
      e.x,
      e.y,
      e.hp,
      e.dead,
      e.armorShred,
      e.slowAmount,
      e.atkSlowAmount,
      e.frostHitStacks,
      e.tauntKind,
      e.timeMarkStage,
      e.timeLockZoneId,
      e.madnessRemaining,
    ]),
  };
}

/**
 * Every value below is entirely non-finite on both axes; a real mouse can
 * never send one. Kept to whole-pair cases so "the bad-aim cast" below can
 * be compared against a plain unaimed control (`undefined, undefined`) —
 * `sanitizeAim` treats each axis independently, so a *mixed* pair (one
 * finite axis, one not) sanitizes to a mixed result, not a blanket unaimed
 * one; that per-axis behaviour gets its own, hand-computed case in the
 * Time Lock block below rather than the generic table, since only Time
 * Lock's `aimX ?? wd.x` / `aimY ?? wd.y` are simple enough per axis to
 * predict by hand — the dash kinds combine both axes through one shared
 * `normalize` call.
 */
const BAD_AIMS: [string, number, number][] = [
  ['NaN,NaN', Number.NaN, Number.NaN],
  ['+Inf,+Inf', Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
  ['-Inf,-Inf', Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
];

describe('fb204: the reported case — Time Lock never plants a zone at NaN', () => {
  it.each(BAD_AIMS)('aim (%s) — the zone lands at the Warden, finite', (_label, ax, ay) => {
    const w = world('time_lord');
    expect(useClassActive2(w, ax, ay)).toBe(true);
    const zone = w.timeLockZone;
    expect(zone, 'Time Lock did not place a zone').toBeTruthy();
    expect(zone!.x, 'zone.x').toBe(WX);
    expect(zone!.y, 'zone.y').toBe(WY);
    expect(Number.isFinite(zone!.x)).toBe(true);
    expect(Number.isFinite(zone!.y)).toBe(true);
  });

  it('a finite aim still places the zone there, unaffected — the guard only catches non-finite input', () => {
    const w = world('time_lord');
    expect(useClassActive2(w, AX, AY)).toBe(true);
    const zone = w.timeLockZone!;
    expect([zone.x, zone.y]).toEqual([AX, AY]);
  });

  it('a mixed aim (one non-finite axis) drops only that axis, per `sanitizeAim`', () => {
    const w = world('time_lord');
    expect(useClassActive2(w, Number.POSITIVE_INFINITY, AY)).toBe(true);
    // x is non-finite (falls back to wd.x = WX); y was a real, finite aim (AY).
    expect([w.timeLockZone!.x, w.timeLockZone!.y]).toEqual([WX, AY]);

    const w2 = world('time_lord');
    expect(useClassActive2(w2, AX, Number.NEGATIVE_INFINITY)).toBe(true);
    expect([w2.timeLockZone!.x, w2.timeLockZone!.y]).toEqual([AX, WY]);
  });
});

interface Row {
  classKey: string;
  which: 'active1' | 'active2';
  kind: string;
  setup?: (w: World) => void;
  isDash?: boolean;
}

const ROWS: Row[] = [
  { classKey: 'swordsman', which: 'active2', kind: 'dash_line', isDash: true },
  { classKey: 'engineer', which: 'active1', kind: 'repair_heal', setup: tower },
  { classKey: 'pyromancer', which: 'active2', kind: 'dash_trail', isDash: true },
  { classKey: 'archer', which: 'active2', kind: 'dash_volley', isDash: true },
  { classKey: 'necromancer', which: 'active2', kind: 'death_pact', setup: tower },
  { classKey: 'cryomancer', which: 'active2', kind: 'ice_wall' },
  { classKey: 'stormcaller', which: 'active1', kind: 'chain_lightning', setup: bag },
  { classKey: 'bloodlord', which: 'active1', kind: 'blood_tithe', setup: tower },
  { classKey: 'bloodlord', which: 'active2', kind: 'dash_heal', isDash: true },
  { classKey: 'madness_king', which: 'active1', kind: 'mind_manipulation', setup: bag },
  { classKey: 'madness_king', which: 'active2', kind: 'spreading_madness', setup: bag },
];

describe('fb204: every other aimed Active — a non-finite aim behaves exactly like no aim at all', () => {
  it.each(ROWS.flatMap((row) => BAD_AIMS.map((bad) => [row, bad] as const)))(
    '%o cast with a bad aim %o matches the same cast unaimed',
    (row, [, ax, ay]) => {
      const cls = content.classByKey.get(row.classKey)!;
      expect(cls[row.which].kind, `${row.classKey}.${row.which} is not ${row.kind} on current /data`).toBe(row.kind);

      const control = world(row.classKey);
      row.setup?.(control);
      const cast = row.which === 'active1' ? useClassActive : useClassActive2;
      expect(cast(control, undefined, undefined), 'the unaimed control cast did not fire').toBe(true);
      if (row.isDash) settle(control);

      const bad = world(row.classKey);
      row.setup?.(bad);
      expect(cast(bad, ax, ay), 'the bad-aim cast did not fire').toBe(true);
      if (row.isDash) settle(bad);

      expect(snapshot(bad)).toEqual(snapshot(control));
      // And every position the cast produced is finite, independent of the
      // control comparison above (belt and braces — a shared corruption in
      // both worlds would pass the equality check alone).
      const wd = bad.warden;
      expect(Number.isFinite(wd.x) && Number.isFinite(wd.y), `warden at (${wd.x},${wd.y})`).toBe(true);
      for (const z of bad.timeLockZones) expect(Number.isFinite(z.x) && Number.isFinite(z.y)).toBe(true);
      for (const s of bad.classSummons) expect(Number.isFinite(s.x) && Number.isFinite(s.y)).toBe(true);
    },
  );
});

/**
 * fb204 (QA follow-up): Archer's Deadeye Draw (`charge_pierce`) is a
 * charge-kind Active1 — it fires from `tickClassCharge` on release, reading
 * `TickInput.aimX`/`aimY` directly, never through `useClassActive`'s
 * `sanitizeAim` call. QA caught this as a real gap in the first pass of this
 * fix: `w.fx`'s emitted shot endpoint (`classes.ts`'s `fireDeadeyeDraw`,
 * `w.emit('class_active', wd.x, wd.y, wd.x + dir.x * eff.radius, ...)`) went
 * NaN because `aimDirection`'s `normalize(NaN, NaN)` survives the `l === 0`
 * escape hatch (see the file header). `tickClassCharge` now sanitizes at its
 * own call site instead. `TickInput.aimX`/`aimY` are non-optional numbers
 * (unlike a Command's `aimX?`/`aimY?`), so the "no real aim" control here is
 * `(WX, WY)` — the aim landing exactly on the Warden, `aimDirection`'s own
 * documented second "use facing instead" case, not merely a fix for this file.
 */
describe('fb204 QA follow-up: Deadeye Draw fires through tickClassCharge, not useClassActive', () => {
  const archer = content.classByKey.get('archer')!;

  it('archer.active1 is charge_pierce (Deadeye Draw) on current /data', () => {
    expect(archer.active1.kind).toBe('charge_pierce');
  });

  function release(w: World, aimX: number, aimY: number): void {
    tickClassCharge(w, archer, { ...emptyInput(), active1Held: true, aimX, aimY }, 1 / 60);
    tickClassCharge(w, archer, { ...emptyInput(), active1Held: false, aimX, aimY }, 1 / 60);
  }

  function shotEndpoint(w: World): [number, number] {
    const ev = w.fx.at(-1);
    expect(ev, 'Deadeye Draw did not emit a class_active event').toBeTruthy();
    return [ev!.a, ev!.b];
  }

  it.each(BAD_AIMS)('a non-finite aim (%s) on release fires along the facing, not at NaN', (_label, ax, ay) => {
    const control = world('archer');
    release(control, WX, WY);
    const wantEndpoint = shotEndpoint(control);

    const bad = world('archer');
    release(bad, ax, ay);
    const gotEndpoint = shotEndpoint(bad);

    expect(gotEndpoint).toEqual(wantEndpoint);
    expect(gotEndpoint.every((v) => Number.isFinite(v)), `shot endpoint ${gotEndpoint}`).toBe(true);
  });
});
