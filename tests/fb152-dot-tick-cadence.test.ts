/**
 * fb152 — DoT tick cadence (owner feedback `dot-tick-cadence`).
 *
 * The order, verbatim: "a DoT ticks at most once per 0.25 s per DoT instance;
 * each tick delivers the damage accrued for that interval (total over duration
 * unchanged)". Before this item both DoT loops — `tickDots` for enemies and
 * `tickWardenDots` for Time Lord's converted self-damage — paid `dps * dt`
 * once per stack per **sim frame**, i.e. 60 ticks a second, which sprays damage
 * numbers and fires every tick-driven effect (armor shred, Burning's neighbour
 * splash, lifesteal-on-DoT) at the same rate.
 *
 * Four things are pinned here, because there are four ways to lose this:
 *  1. the cadence itself, on an enemy and on the Warden (<= 16 ticks over 4 s);
 *  2. the **total**, which the cadence must not change — the last partial
 *     interval is clipped and paid at expiry, not dropped;
 *  3. the tick-driven effects that ride the same loop — armor shred accrued
 *     over a whole Burning stack, and the neighbour splash, which must move to
 *     the new cadence *without* changing what they accrue;
 *  4. the constant lives in `/data` (architecture rule 4), not as a literal.
 *
 * Ticks are counted as frames on which the victim's hp actually moved, which is
 * what the player sees as a number, rather than as an internal call count.
 */

import { describe, expect, it } from 'vitest';

import { applyDot, dotOutstanding, spawnEnemy, updateEnemies } from '../src/sim/enemies';
import { loadContent } from '../src/sim/content';
import { tickWardenDots } from '../src/sim/run';
import { World } from '../src/sim/world';
import type { Enemy } from '../src/sim/types';
import { cfg } from './helpers';
import damageTypesJson from '../data/damagetypes.json';

const DT = 1 / 60;

function world(): World {
  const w = new World(cfg());
  w.gold = 100000;
  return w;
}

/** Rooted and effectively unkillable, so a totals assertion stays one. */
function dummy(w: World, x = 10, y = 10): Enemy {
  const e = spawnEnemy(w, 'husk', x, y)!;
  e.hp = 1e6;
  e.maxHp = 1e6;
  e.speed = 0;
  w.rebuildBuckets();
  return e;
}

/** Runs `seconds` of sim, returning the per-frame hp drops that were non-zero. */
function tickHpDrops(w: World, e: Enemy, seconds: number): number[] {
  const drops: number[] = [];
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) {
    const before = e.hp;
    w.rebuildBuckets();
    updateEnemies(w, DT);
    const d = before - e.hp;
    if (d > 1e-9) drops.push(d);
  }
  return drops;
}

const INTERVAL = (damageTypesJson as { dotTickInterval?: number }).dotTickInterval ?? 0;
/**
 * The value the *engine* actually runs on, read the way the sim reads it. The
 * raw-JSON read above only proves the file says 0.25; this proves the loader
 * carries it, so an engine that hard-coded the cadence and ignored `/data`
 * cannot pass the last assertion of the first test.
 */
const LOADED_INTERVAL = loadContent().damageTypes.dotTickInterval;

/**
 * The owner's number, stated in the order itself. The cadence bounds below are
 * expressed against it rather than against whatever `/data` happens to hold, so
 * an unauthored (or zeroed) field fails the bound instead of making it vacuous;
 * the first test is what ties the two together (the m19c rule).
 */
const SPEC_INTERVAL = 0.25;
const maxTicks = (seconds: number): number => Math.ceil(seconds / SPEC_INTERVAL);

describe('fb152 — DoT tick cadence', () => {
  it('authors the cadence in /data, not as a literal in the engine', () => {
    expect(INTERVAL).toBeGreaterThan(0);
    // The owner's number. Kept as an equality so a retune is a visible /data
    // diff rather than a silently loosened test.
    expect(INTERVAL).toBe(SPEC_INTERVAL);
    // Read through the loader, not just off the file: the engine must run on
    // the authored number.
    expect(LOADED_INTERVAL).toBe(INTERVAL);
    // A cadence coarser than a row's whole duration would collapse that row
    // into a single hit at expiry, which is a hit, not a DoT.
    for (const t of damageTypesJson.types) {
      if (t.effect !== 'dot') continue;
      expect(INTERVAL).toBeLessThanOrEqual((t as { duration: number }).duration);
    }
  });

  it('an enemy DoT ticks at most 4x/s and delivers its exact total', () => {
    const w = world();
    const e = dummy(w);
    const dps = 10;
    const seconds = 4;
    applyDot(w, e, 'bleeding', dps, seconds);
    const drops = tickHpDrops(w, e, seconds + 0.5);

    expect(drops.length).toBeLessThanOrEqual(maxTicks(seconds));
    expect(drops.length).toBeGreaterThan(0);
    const total = drops.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(dps * seconds, 6);
  });

  it('the Warden\'s converted DoT ticks on the same cadence for the same total', () => {
    const w = world();
    const wd = w.warden;
    wd.hp = 1e6;
    const dps = 10;
    const seconds = 4;
    wd.dots.push({ dps, remaining: seconds, accTime: 0, accDamage: 0 });
    const drops: number[] = [];
    const steps = Math.round((seconds + 0.5) * 60);
    for (let i = 0; i < steps; i++) {
      const before = wd.hp;
      tickWardenDots(w, DT);
      const d = before - wd.hp;
      if (d > 1e-9) drops.push(d);
    }

    expect(drops.length).toBeLessThanOrEqual(maxTicks(seconds));
    expect(drops.length).toBeGreaterThan(0);
    expect(drops.reduce((a, b) => a + b, 0)).toBeCloseTo(dps * seconds, 6);
  });

  it('armor shred accrued over a whole Burning stack is unchanged by the cadence', () => {
    const w = world();
    const e = dummy(w);
    const burning = damageTypesJson.types.find((t) => t.key === 'burning') as {
      duration: number;
      armorShredPerSecond: number;
    };
    applyDot(w, e, 'burning', 5, burning.duration);
    tickHpDrops(w, e, burning.duration + 0.5);
    expect(e.armorShred).toBeCloseTo(burning.armorShredPerSecond * burning.duration, 6);
  });

  it('Burning\'s neighbour splash rides the new cadence too', () => {
    const w = world();
    const e = dummy(w, 10, 10);
    const neighbour = dummy(w, 10.4, 10);
    const burning = damageTypesJson.types.find((t) => t.key === 'burning') as { duration: number };
    applyDot(w, e, 'burning', 5, burning.duration);
    const drops: number[] = [];
    const steps = Math.round((burning.duration + 0.5) * 60);
    for (let i = 0; i < steps; i++) {
      const before = neighbour.hp;
      w.rebuildBuckets();
      updateEnemies(w, DT);
      const d = before - neighbour.hp;
      if (d > 1e-9) drops.push(d);
    }
    expect(drops.length).toBeGreaterThan(0);
    expect(drops.length).toBeLessThanOrEqual(maxTicks(burning.duration));
  });

  it('a stack refreshed mid-window still delivers exactly what it accrued', () => {
    // `poison`'s row is `refresh: 'shortest'`, so an application that finds the
    // per-type cap already full overwrites `dps`/`remaining` on the live stack
    // instead of adding one (`maxStacks: 1` tightens that cap to the single
    // stack this test is about). The bank must be paid at the rate that
    // accrued it, not re-priced at the new one.
    const w = world();
    const e = dummy(w);
    applyDot(w, e, 'poison', 10, 4, 'first', { maxStacks: 1 });
    const half = Math.round(0.1 * 60); // inside the first interval, so a bank exists
    for (let i = 0; i < half; i++) {
      w.rebuildBuckets();
      updateEnemies(w, DT);
    }
    expect(e.dots[0].accDamage).toBeGreaterThan(0);
    const bank = e.dots[0].accDamage;
    const bankedTime = e.dots[0].accTime;
    applyDot(w, e, 'poison', 40, 4, 'second', { maxStacks: 1 });
    expect(e.dots.length).toBe(1);
    const drops = tickHpDrops(w, e, 4.5);
    // Everything the first application accrued, plus the whole of the second's
    // own 4 s window at its own dps.
    expect(drops.reduce((a, b) => a + b, 0)).toBeCloseTo(bank + 40 * 4, 6);
    expect(bank).toBeCloseTo(10 * bankedTime, 9);
  });

  it('a carrier that dies mid-bank owes the bank, and Spreading Plague can see it', () => {
    const w = world();
    const e = dummy(w);
    applyDot(w, e, 'bleeding', 10, 4);
    const frames = Math.round(0.1 * 60);
    for (let i = 0; i < frames; i++) {
      w.rebuildBuckets();
      updateEnemies(w, DT);
    }
    const elapsed = frames * DT;
    // Nothing has been paid yet — it is all still owed.
    expect(dotOutstanding(e)).toBeCloseTo(10 * 4, 6);
    // And the owed total tracks the clock, bank included, rather than dropping
    // the accrued-but-unpaid part on the floor (`dotOutstanding` reads both).
    expect(e.dots[0].accDamage).toBeCloseTo(10 * elapsed, 9);
  });

  it('Burning\'s splash pays its whole bank even when the carrier dies on that tick', () => {
    // Code review, Major 1: the splash flush used to be skipped when the tick
    // killed the carrier, which cost one frame before this item and up to a
    // whole interval after it — and a burn finishing off its carrier is the
    // common case, not a corner.
    const w = world();
    const carrier = dummy(w, 10, 10);
    const neighbour = dummy(w, 10.4, 10);
    const dps = 20;
    const burning = damageTypesJson.types.find((t) => t.key === 'burning') as { duration: number };
    carrier.hp = dps * INTERVAL * 1.5; // dies on the second tick, mid-stack
    applyDot(w, carrier, 'burning', dps, burning.duration);
    const before = neighbour.hp;
    tickHpDrops(w, neighbour, burning.duration + 0.5);
    expect(carrier.dead).toBe(true);
    // Two whole intervals were banked and paid before the carrier fell: the
    // splash carries the same magnitude the carrier's own ticks did.
    expect(before - neighbour.hp).toBeCloseTo(dps * INTERVAL * 2, 6);
  });

  it('an evicted stack drops its bank, deliberately and visibly', () => {
    // The one path where the cadence does change a total: the shared 50-stack
    // budget is full, a type still under its own cap takes another type's
    // slot, and the evicted stack's unpaid bank goes with it. Paying it at
    // eviction would credit the incoming type's source with the outgoing
    // type's damage, and paying it from inside `applyDot` would deal damage
    // (and possibly a kill) in the middle of an application. Pinned rather
    // than fixed, so the loss stays deliberate.
    const w = world();
    const e = dummy(w);
    const cap = w.content.damageTypes.maxStacksPerEnemy;
    for (let i = 0; i < cap; i++) applyDot(w, e, 'bleeding', 10, 5, `bleed${i}`);
    expect(e.dots.length).toBe(cap);
    const frames = Math.round(0.1 * 60);
    for (let i = 0; i < frames; i++) {
      w.rebuildBuckets();
      updateEnemies(w, DT);
    }
    const owedBefore = dotOutstanding(e);
    applyDot(w, e, 'burning', 10, 3, 'burn');
    const evicted = 10 * frames * DT; // one bleeding stack's bank, lost with its slot
    // The burn replaced one bleeding stack: what is owed drops by that stack's
    // remaining damage *and* its bank, and gains the burn's own total.
    expect(dotOutstanding(e)).toBeLessThan(owedBefore - evicted + 10 * 3 + 1e-6);
  });

  it('a Frozen window that ends mid-interval still bills its seconds at +30%', () => {
    // qa-playtester (Major 2): the three time-varying multipliers on the DoT
    // path — Frozen, `kitPowerMul`, the final-boss ramp — are priced per frame
    // as the bank accrues (`dotVaryingMul`), not once at the flush instant. A
    // Frozen window that opened and closed inside one interval used to vanish
    // entirely; one that opened on the last frame used to bill the whole
    // interval at +30%.
    const w = world();
    const e = dummy(w);
    const dps = 10;
    const frozenFrames = 14; // ends inside the first interval
    const bonus = w.content.damageTypes.statuses.frozen.damageTaken;
    applyDot(w, e, 'bleeding', dps, 4);
    const before = e.hp;
    const steps = Math.round(4.5 * 60);
    for (let i = 0; i < steps; i++) {
      e.frozenRemaining = i < frozenFrames ? 10 : 0;
      w.rebuildBuckets();
      updateEnemies(w, DT);
    }
    // The analytic total: 4 s at base, plus the frozen seconds' surcharge.
    const expected = dps * 4 + dps * frozenFrames * DT * bonus;
    expect(before - e.hp).toBeCloseTo(expected, 5);
  });

  it('an i-frame window removes exactly its own seconds of a converted DoT', () => {
    // qa-playtester (Major 3): `damageWarden` drops a hit outright during a
    // dash/reform/god-mode window. Pricing a banked interval at the flush made
    // a 0.2 s dash erase either nothing or a whole 0.25 s — the latter
    // retroactively erasing damage accrued before the dash began.
    const dps = 100;
    const seconds = 4;
    const dashFrames = 12; // 0.2 s
    for (const start of [0, 5, 13, 20]) {
      const w = world();
      const wd = w.warden;
      wd.hp = 1e6;
      wd.dots.push({ dps, remaining: seconds, accTime: 0, accDamage: 0 });
      const before = wd.hp;
      const steps = Math.round((seconds + 0.5) * 60);
      for (let i = 0; i < steps; i++) {
        wd.dashIFrames = i >= start && i < start + dashFrames ? 1 : 0;
        tickWardenDots(w, DT);
      }
      expect(before - wd.hp, `dash starting at frame ${start}`).toBeCloseTo(
        dps * (seconds - dashFrames * DT),
        5,
      );
    }
  });

  it('conserves the total across a mid-bank death: what was paid plus what is owed', () => {
    // The Spreading Plague (C10) invariant, which is what `dotOutstanding`
    // reading the bank buys: a carrier killed mid-interval owes exactly what
    // it has not paid, to the tick.
    for (const killFrame of [5, 14, 15, 16, 30]) {
      const w = world();
      const e = dummy(w);
      const dps = 12;
      applyDot(w, e, 'bleeding', dps, 3);
      const drops = [];
      for (let i = 0; i < killFrame; i++) {
        const before = e.hp;
        w.rebuildBuckets();
        updateEnemies(w, DT);
        drops.push(before - e.hp);
      }
      const paid = drops.reduce((a, b) => a + b, 0);
      expect(paid + dotOutstanding(e), `kill frame ${killFrame}`).toBeCloseTo(dps * 3, 6);
    }
  });

  it('the Bleeding Ring heals on the cadence, for the same total', () => {
    // The order names lifesteal-on-DoT explicitly, and `bleedLifesteal` (fb015)
    // is the one authored DoT that leeches at all.
    const w = world();
    w.phase = 'act2';
    w.stats.add('test', 'leech', 0.5);
    w.recomputeDerived();
    // The ring's own flag, set directly rather than by equipping it: this test
    // is about the cadence, and `tests/fb015-equipment.test.ts` owns the wiring.
    w.derived.bleedLifesteal = true;
    const e = dummy(w);
    const dps = 10;
    applyDot(w, e, 'bleeding', dps, 4);
    let ticksThatHealed = 0;
    const steps = Math.round(4.5 * 60);
    for (let i = 0; i < steps; i++) {
      const before = w.warden.leechAccumulator;
      w.rebuildBuckets();
      updateEnemies(w, DT);
      if (w.warden.leechAccumulator - before > 1e-9) ticksThatHealed++;
    }
    expect(ticksThatHealed).toBeGreaterThan(0);
    expect(ticksThatHealed).toBeLessThanOrEqual(maxTicks(4));
    expect(w.warden.leechAccumulator).toBeCloseTo(dps * 4 * w.derived.leech, 5);
  });
});
