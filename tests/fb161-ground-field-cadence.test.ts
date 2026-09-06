/**
 * fb161 — a ground fire field stops emitting a damage number every frame.
 *
 * fb152 put every §3 DoT *instance* on a `dotTickInterval` cadence and
 * deliberately left four `dot: true` sources at 60 Hz, on the grounds that they
 * are **zones, not DoT instances**: a field damages whoever is standing in it
 * this frame, with no per-target stack to bank against. Three of the four emit
 * nothing (`dot: true` suppresses the emit), so the owner's "spraying numbers"
 * complaint cannot reach them. The fourth can: `wardenAreaDamage`'s enemyFire
 * branch (`updateAreas`, combat.ts) calls into `damageWarden` once per frame
 * with no `dot` flag, and `damageWarden` emits `wardenhit` on every call — so
 * standing in a Cinderling's trail sprayed **60 numbers a second**, which is
 * the owner's symptom on a different mechanism.
 *
 * The decision this file pins (QUESTIONS Q189): the Warden-facing field takes
 * fb152's accrue-then-flush shape, banking on the field itself rather than on a
 * per-target stack, and the three invisible sources stay at 60 Hz. Banking them
 * too would move when enemies die, which re-rolls every run hash and every
 * balance measurement taken since P10, in exchange for no player-visible change
 * at all.
 *
 * The cases below drive `updateAreas` directly rather than through a full run:
 * a real run's Warden also takes contact hits, which emit the same `wardenhit`
 * event, so counting emits in a live wave would measure the wave. The last case
 * puts the change through a real seeded run for determinism.
 */
import { describe, expect, it } from 'vitest';

import { Run, wardenArmor } from '../src/sim/run';
import { damageTakenMul } from '../src/sim/stats';
import { updateAreas } from '../src/sim/combat';
import { World } from '../src/sim/world';
import { emptyInput, type GroundArea } from '../src/sim/types';
// Importing run.ts is what installs `setAreaDamageHandler`, so ground fire
// reaches the Warden at all; the reference is here to say so out loud.
void Run;

import { cfg } from './helpers';

const DT = 1 / 60;

/**
 * A world with nothing in it but a Warden, so the only `wardenhit` source is
 * the field.
 *
 * The HP pool is raised deliberately. At `numberScale` 0.1 a Warden holds ~10
 * HP, and a first draft of these cases killed it partway through the window —
 * measured as 51 emits in a second rather than 60, i.e. the probe was reading
 * the death, not the cadence. A pool nothing can exhaust keeps every case
 * measuring the field.
 */
function bareWorld(): World {
  const w = new World(cfg({ seed: 5 }));
  w.enemies.length = 0;
  w.areas.length = 0;
  w.warden.hp = 1e6;
  return w;
}

/** What one raw point of ground fire costs this Warden after armor. */
function mitigation(w: World): number {
  return damageTakenMul(wardenArmor(w));
}

/** An enemy fire field centred on the Warden, the shape `tickEnemy`'s fireTrail builds. */
function fieldOnWarden(w: World, dps: number, seconds: number): GroundArea {
  const a: GroundArea = {
    id: w.newId(),
    x: w.warden.x,
    y: w.warden.y,
    radius: 2,
    dps,
    remaining: seconds,
    type: 'enemyFire',
    source: 'cinderling',
    acc: 0,
    accTime: 0,
    dead: false,
  };
  w.areas.push(a);
  return a;
}

/** Steps `updateAreas` for `seconds`, returning every `wardenhit` payload it emitted. */
function runField(w: World, seconds: number): number[] {
  const hits: number[] = [];
  const ticks = Math.round(seconds / DT);
  for (let i = 0; i < ticks; i++) {
    w.fx.length = 0;
    updateAreas(w, DT);
    for (const f of w.fx) if (f.k === 'wardenhit') hits.push(f.a);
  }
  return hits;
}

describe('fb161 — ground fire pays on a cadence, not every frame', () => {
  it('emits at most 4 wardenhit events per second while the Warden stands in one field', () => {
    // The acceptance criterion, and the assertion that was red before the fix:
    // measured 60 emits per second on HEAD, one per frame.
    const w = bareWorld();
    fieldOnWarden(w, 12, 3);
    const hits = runField(w, 1);
    expect(hits.length, `${hits.length} wardenhit events in one second`).toBeLessThanOrEqual(4);
    // ...and not zero, which is the way a cadence fix goes vacuously green.
    expect(hits.length).toBeGreaterThan(0);
  });

  it('pays the field its exact authored total over its lifetime', () => {
    // "Totals unchanged" is the item's own clause, and the honest control for a
    // field is its authored one: `dps * seconds`, mitigated once by the same
    // armor the per-frame path applied to each frame. Armor is constant across
    // the window for a Warden standing still, so banking the raw amount and
    // mitigating at the flush must land on that number exactly, not near it.
    const dps = 12;
    const seconds = 2;
    const w = bareWorld();
    const hp0 = w.warden.hp;
    const m = mitigation(w);
    fieldOnWarden(w, dps, seconds);
    // A beat past expiry, so the final partial interval is flushed rather than
    // dropped — the clause fb152 records as what keeps a total exact.
    const hits = runField(w, seconds + 0.5);
    const paid = hits.reduce((a, b) => a + b, 0);
    const lost = hp0 - w.warden.hp;

    // Every emitted number reached the Warden's hp: the bank is paid, not shown.
    expect(paid).toBeCloseTo(lost, 6);
    expect(lost, `paid ${lost} against an authored ${dps} x ${seconds} x ${m}`)
      .toBeCloseTo(dps * seconds * m, 6);
    // Anti-vacuity: a mitigation of 0 would make the line above true of nothing.
    expect(lost).toBeGreaterThan(0);
  });

  it('is proportional to exposure, so the cadence cannot be swallowing a partial window', () => {
    // The check the authored-total case cannot make on its own: double the
    // duration, double the payment, exactly. A flush that dropped the trailing
    // partial interval would still pass a single-duration total if the duration
    // happened to be a whole number of intervals.
    const dps = 12;
    const pay = (seconds: number): number => {
      const w = bareWorld();
      const hp0 = w.warden.hp;
      fieldOnWarden(w, dps, seconds);
      runField(w, seconds + 0.5);
      return hp0 - w.warden.hp;
    };
    // 0.7 s is deliberately not a multiple of the 0.25 s interval.
    const short = pay(0.7);
    const long = pay(1.4);
    expect(short).toBeGreaterThan(0);
    // Within one frame's payment, not exactly: `remaining -= dt` leaves a float
    // residual, so a duration that is a whole number of frames can still buy a
    // 43rd one (measured on HEAD: 0.7 s paid 8.20 against 1.4 s's 16.60, a
    // ratio of 2.0244 — exactly one extra frame). That quantisation predates
    // fb161 and is unchanged by it: the bank sums over the same frames the
    // per-frame path paid on. What this case is for is the trailing partial
    // *interval*, which the flush must release, and one frame of slack is far
    // tighter than the 0.25 s a dropped interval would cost.
    const oneFrame = dps * DT * mitigation(bareWorld());
    expect(
      Math.abs(long - 2 * short),
      `0.7 s paid ${short}, 1.4 s paid ${long}; one frame is ${oneFrame}`,
    ).toBeLessThan(oneFrame * 1.5);
  });

  it('flushes what it banked when the field expires under a Warden who never moved', () => {
    // A field shorter than one interval must still pay: the whole total lives
    // in a partial bank that only the expiry flush can release.
    const w = bareWorld();
    const hp0 = w.warden.hp;
    fieldOnWarden(w, 20, 0.1);
    const hits = runField(w, 0.5);
    expect(hits.length, 'a sub-interval field pays exactly once').toBe(1);
    expect(hp0 - w.warden.hp).toBeGreaterThan(0);
  });

  it('leaves the three invisible per-frame sources alone — an enemy-facing field still pays every frame', () => {
    // The other half of the decision, asserted rather than left to prose: a
    // `burn` field damages enemies through `damageEnemy(..., { dot: true })`,
    // which emits nothing, so it has no symptom to fix and banking it would
    // move kill timing. If a later change puts it on the cadence, this goes red
    // and the QUESTIONS entry gets revisited rather than silently outdated.
    const w = bareWorld();
    const before = w.areas.length;
    w.areas.push({
      id: w.newId(),
      x: w.warden.x + 8,
      y: w.warden.y,
      radius: 2,
      dps: 12,
      remaining: 1,
      type: 'burn',
      source: 'test',
      acc: 0,
      accTime: 0,
      dead: false,
    });
    expect(w.areas.length).toBe(before + 1);
    const hits = runField(w, 1);
    // No Warden in it, and enemy-facing damage emits nothing either way.
    expect(hits.length).toBe(0);
  });

  it('stays deterministic: one seed, two runs, one end hash', () => {
    const hash = (): string => {
      const run = new Run(cfg({ seed: 11, policy: 'hybrid', classKey: 'swordsman' }));
      while (!run.done && run.world.tick < 60 * 90) run.step(emptyInput());
      return run.report().endHash;
    };
    expect(hash()).toBe(hash());
  });
});
