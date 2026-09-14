/**
 * fb082 — a poison ground area (Poison Barrel, Venom Spore's poison trail)
 * called `applyPoison` on every 60 Hz frame instead of on SPEC-FINAL §4.1's
 * cadence ("applying poison damage every second"). Fixed in two parts, both
 * covered here: (1) `updateAreas` (combat.ts) now gates the call on a
 * per-area cadence (`tickSeconds`, an accumulator field on `GroundArea` that
 * existed since the type was written but was never read); (2) the
 * per-application `duration` passed to `applyPoison` — hardcoded `1.0`
 * before this item, unchanged by a first pass at (1) alone — is now
 * `tick * POISON_STACK_CAP`, because gating *only* the call frequency while
 * leaving `duration: 1.0` let every stack fully expire before the next
 * application arrived, capping concurrency at 1 instead of the pre-existing
 * cap of 3: a real ~3.5x DPS regression a first pass at this item shipped
 * and code-reviewer/qa-playtester both caught independently. The fixed
 * shape restores the pre-fix magnitude (stacks ramp to, and sustain, the
 * cap) while still cadencing correctly — one *application* per `tick`, not
 * one every frame.
 *
 * `applyPoison` is spied through a partial `vi.mock` (same `importOriginal`
 * passthrough idiom `tests/ui-fb094-screenshot-export-prod.test.ts` already
 * uses) so the count/arguments are of the real call `combat.ts`'s
 * `updateAreas` makes, not a re-implementation of the logic under test.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/sim/enemies', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/sim/enemies')>();
  return { ...actual, applyPoison: vi.fn(actual.applyPoison) };
});

import { applyPoison, dotStacks, makeEnemy, updateEnemies } from '../src/sim/enemies';
import { updateAreas } from '../src/sim/combat';
import { World } from '../src/sim/world';
import type { Enemy, GroundArea } from '../src/sim/types';
import { cfg } from './helpers';

const DT = 1 / 60;
const applyPoisonMock = applyPoison as unknown as ReturnType<typeof vi.fn>;

function bareWorld(): World {
  const w = new World(cfg({ seed: 5 }));
  w.enemies.length = 0;
  w.areas.length = 0;
  return w;
}

function standingEnemy(w: World): Enemy {
  const base = w.content.enemyByKey.get('husk')!;
  // A pool nothing this test deals can exhaust, same reasoning fb161's own
  // bareWorld() comment gives — a case that kills its target partway through
  // the window would measure the death, not the cadence.
  const e = makeEnemy(w, { ...base, hp: 1e9 }, 0, 0);
  w.addEnemy(e);
  // `enemiesInRadius` reads the spatial-hash buckets `rebuildBuckets()`
  // populates from `w.enemies` each real tick — `updateAreas` alone never
  // calls it, so a manual scene like this one must, or the enemy is
  // (silently) invisible to every ground area no matter where it stands.
  w.rebuildBuckets();
  return e;
}

function poisonAreaOn(w: World, x: number, y: number, dps: number, seconds: number, tickSeconds?: number): GroundArea {
  const a: GroundArea = {
    id: w.newId(),
    x,
    y,
    radius: 2,
    dps,
    remaining: seconds,
    type: 'poison',
    source: 'class_active',
    acc: 0,
    dead: false,
    tickSeconds,
  };
  w.areas.push(a);
  return a;
}

describe('fb082 — a poison ground area applies on a per-second cadence, not every frame', () => {
  it('an area whose whole lifetime exactly equals its own tickSeconds still delivers its one application (Venom Spore\'s own trail shape)', () => {
    // qa-playtester finding: a naive cadence gate that marks the area dead
    // and `continue`s before ever re-checking `acc` on the area's own final
    // frame loses this application to a `remaining`/`acc` rounding race at
    // the boundary — measured 0 calls at the shipped Venom Spore interval
    // (1.4286 s) before this ordering fix. `remaining === tickSeconds`
    // exactly is not an edge case for this mechanic; it is how every Venom
    // Spore trail blob is actually built (`updatePoisonTrail`, vsspecials.ts).
    const w = bareWorld();
    standingEnemy(w);
    poisonAreaOn(w, 0, 0, 10, 1.4286, 1.4286);
    applyPoisonMock.mockClear();
    const ticks = Math.round(1.4286 / DT);
    for (let i = 0; i < ticks; i++) updateAreas(w, DT);
    expect(applyPoisonMock.mock.calls.length).toBe(1);
  });

  it('calls applyPoison at most once per second for a standing enemy (measured 60/s before the fix)', () => {
    const w = bareWorld();
    standingEnemy(w);
    poisonAreaOn(w, 0, 0, 10, 3);
    applyPoisonMock.mockClear();
    for (let i = 0; i < 60; i++) updateAreas(w, DT);
    expect(applyPoisonMock.mock.calls.length, `${applyPoisonMock.mock.calls.length} applyPoison calls in one second`).toBeLessThanOrEqual(1);
    // ...and not zero, which is the way a cadence fix goes vacuously green.
    expect(applyPoisonMock.mock.calls.length).toBeGreaterThan(0);
  });

  it('an authored tickSeconds other than 1 is honoured (per-area cadence, not a hardcoded one)', () => {
    const w = bareWorld();
    standingEnemy(w);
    poisonAreaOn(w, 0, 0, 10, 3, 0.5);
    applyPoisonMock.mockClear();
    for (let i = 0; i < 60; i++) updateAreas(w, DT);
    expect(applyPoisonMock.mock.calls.length).toBe(2);
  });

  it('the accumulator advances even on a frame no target is in range, so a target that steps in mid-window is not credited a free early tick', () => {
    const w = bareWorld();
    const e = standingEnemy(w);
    e.x = 100;
    e.y = 100;
    w.rebuildBuckets();
    const area = poisonAreaOn(w, 0, 0, 10, 3);
    // Half a cadence window with the target out of range: the area's own
    // accumulator must still advance (it is the area's clock, not the
    // target's), or moving into range afterward would re-arm a full window.
    for (let i = 0; i < 30; i++) updateAreas(w, DT);
    e.x = 0;
    e.y = 0;
    w.rebuildBuckets();
    applyPoisonMock.mockClear();
    for (let i = 0; i < 30; i++) updateAreas(w, DT);
    expect(applyPoisonMock.mock.calls.length).toBe(1);
    expect(area.dead).toBe(false);
  });

  it('sustains the full stack cap at steady state — the regression code-reviewer/qa-playtester caught in this same session', () => {
    // The bug a naive cadence-only fix reintroduces: `applyPoison`'s
    // pre-existing `duration: 1.0` unchanged, now that applications land
    // once per `tick` instead of every frame, lets each stack fully expire
    // before the next arrives — never more than 1 concurrent stack, where
    // the pre-fix 60 Hz spam kept all 3 slots full almost continuously
    // (measured ~3.5x less total damage over the barrel's life, silently
    // failing this item's own "TTK unchanged" acceptance clause). The fix:
    // `duration: tick * POISON_STACK_CAP`, so a new stack lands every `tick`
    // and each lives long enough (`cap` ticks) to overlap the next two,
    // reaching and holding the cap exactly like the pre-fix spam did.
    const w = bareWorld();
    const e = standingEnemy(w);
    // A long-lived area (well past the ramp-up plus one stack's own 3 s
    // duration) so the measurement point sits safely inside the sustained
    // plateau — not so close to the cap being freshly reached, or to the
    // area's own death, that a stack's natural expiry could coincide with
    // the exact measurement frame and read as a false regression.
    poisonAreaOn(w, 0, 0, 10, 10);
    // Each stack's own `remaining` only counts down through `updateEnemies`'
    // (real) per-frame dot ticking — `updateAreas` alone only ever *creates*
    // stacks, so a test that never decays them would see 3 concurrent stacks
    // "accumulate" even with the pre-fix `duration: 1.0` bug (nothing would
    // ever expire to make room), proving nothing. Position is re-pinned every
    // frame: `updateEnemies` also drives real chase/pathing AI, which would
    // otherwise walk this husk toward the Core and out of the field's r2
    // within a second or two, ending the very exposure under test.
    // t=0: 1 stack. t=1: 2. t=2: 3 (cap). t=3+: refreshes, stays at 3 — run
    // well past the ramp-up to measure steady state, not the climb.
    for (let i = 0; i < 6 * 60; i++) {
      updateAreas(w, DT);
      updateEnemies(w, DT);
      e.x = 0;
      e.y = 0;
      w.rebuildBuckets();
    }
    expect(dotStacks(e, 'poison')).toBe(3);
  });

  it('an authored tickSeconds still uses applyPoison\'s real per-call arguments (dps and the tick-scaled duration), not a re-implementation', () => {
    const w = bareWorld();
    standingEnemy(w);
    poisonAreaOn(w, 0, 0, 10, 3);
    applyPoisonMock.mockClear();
    for (let i = 0; i < 60; i++) updateAreas(w, DT);
    expect(applyPoisonMock.mock.calls.length).toBe(1);
    const [, , dps, duration, maxStacks] = applyPoisonMock.mock.calls[0];
    expect(dps).toBe(10);
    // tick (1s, the default) * POISON_STACK_CAP (3) — not the old hardcoded 1.0.
    expect(duration).toBe(3);
    expect(maxStacks).toBe(3);
  });
});
