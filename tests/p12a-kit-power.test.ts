/**
 * BACKLOG p12a (BALANCE DIRECTION v2 §A): a run-long `kitPower` multiplier on
 * all class-kit damage (`class_basic`/`class_active`/`class_active2`/
 * `class_passive`/`class_summon`), `1 + 0.12 * wavesCleared`, applied at the
 * `damageEnemy` choke point every kit source already funnels through. Tower
 * damage (a `tower_*`/other source) must stay untouched — it has its own
 * economy and its own `towerDamageMul`.
 */

import { describe, expect, it } from 'vitest';

import { damageEnemy, dotOutstanding, isKitSource, kitPowerMul, spawnEnemy } from '../src/sim/enemies';
import { hashWorld } from '../src/sim/run';
import type { Enemy } from '../src/sim/types';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

function world(): World {
  const w = new World(cfg());
  w.warden.hp = w.derived.maxHp;
  return w;
}

function husk(w: World): Enemy {
  const e = spawnEnemy(w, 'husk', 10, 10)!;
  e.hp = 1e6;
  e.maxHp = 1e6;
  e.armor = 0;
  return e;
}

describe('p12a — kitPowerMul', () => {
  it('is exactly 1 at wave 0 (fresh run, no growth yet)', () => {
    const w = world();
    expect(w.wavesCleared).toBe(0);
    expect(kitPowerMul(w)).toBeCloseTo(1, 6);
  });

  it('grows 0.12 per TD wave cleared, ~x3.2 by wave 18', () => {
    const w = world();
    w.wavesCleared = 12;
    expect(kitPowerMul(w)).toBeCloseTo(2.44, 6);
    w.wavesCleared = 18;
    expect(kitPowerMul(w)).toBeCloseTo(3.16, 6);
  });

  it('scales every class_* damageEnemy source, monotonically with wavesCleared', () => {
    const w = world();
    const e1 = husk(w);
    const atWave0 = damageEnemy(w, e1, 100, 'class_basic');
    expect(atWave0).toBeCloseTo(100, 6);

    w.wavesCleared = 18;
    const e2 = husk(w);
    const atWave18 = damageEnemy(w, e2, 100, 'class_basic');
    expect(atWave18).toBeCloseTo(100 * kitPowerMul(w), 6);
    expect(atWave18).toBeGreaterThan(atWave0);

    // Every one of the five class sources gets the same treatment.
    for (const source of ['class_active', 'class_active2', 'class_passive', 'class_summon']) {
      const e = husk(w);
      expect(damageEnemy(w, e, 100, source)).toBeCloseTo(100 * kitPowerMul(w), 6);
    }
  });

  it('never touches non-class (tower) damage sources', () => {
    const w = world();
    w.wavesCleared = 18;
    const e = husk(w);
    expect(damageEnemy(w, e, 100, 'ballista')).toBeCloseTo(100, 6);
  });

  it("attributes `spreading_plague` to the kit but does NOT scale it", () => {
    // The two questions are deliberately different (qa-playtester, p12a). The
    // Plaguebringer's §4.2 passive is unambiguously its kit for attribution —
    // it dispatches from `killEnemy` under its own name so `describeSource`
    // can label it. But the transfer's magnitude is `dotOutstanding(e)`, the
    // sum of every unfinished DoT on the corpse whoever applied it, so
    // scaling it by `kitPower` would multiply tower-authored damage (Venom
    // Spore poison, Ember Brazier Burning) on the very build the class's own
    // `towerPassive` exists to support.
    const w = world();
    w.wavesCleared = 18;
    expect(isKitSource('spreading_plague')).toBe(true);
    const e = husk(w);
    expect(damageEnemy(w, e, 100, 'spreading_plague', { dot: true })).toBeCloseTo(100, 6);
  });

  it('a purely tower-sourced DoT remainder transfers at face value, at any wave', () => {
    // qa-playtester's repro, as a regression: an enemy carrying ONLY a
    // venom_spore poison must transfer its outstanding total unamplified,
    // however far into the run the kit multiplier has ramped.
    const atWave = (waves: number): number => {
      const w = world();
      w.wavesCleared = waves;
      const e = husk(w);
      e.dots = [{ type: 'poison', dps: 100, remaining: 5, source: 'venom_spore' }];
      const target = husk(w);
      return damageEnemy(w, target, dotOutstanding(e), 'spreading_plague', { pure: true, dot: true });
    };
    expect(atWave(0)).toBeCloseTo(500, 6);
    expect(atWave(18)).toBeCloseTo(500, 6); // was 1580 before the fix
  });

  it('does not treat a Core effect or the boss as kit', () => {
    for (const source of ['carnivorous_plant', 'corpse', 'time', 'warden_eater', 'ballista']) {
      expect(isKitSource(source), source).toBe(false);
    }
  });

  it('applies to DoT ticks too, since a stack keeps its applying source', () => {
    const w = world();
    w.wavesCleared = 18;
    const e = husk(w);
    // dot:true skips the armor multiplier but still routes through the same
    // choke point, so a class-kit-applied DoT tick should scale too.
    expect(damageEnemy(w, e, 100, 'class_active', { dot: true })).toBeCloseTo(100 * kitPowerMul(w), 6);
  });
});

/**
 * The VS-only tally p12a's own-kit-share target is measured against
 * (`World.damageByWeaponVs` -> `RunReport.damageByWeaponVs`). `damageByWeapon`
 * is the whole run; this one must count a hit only while the run is in its VS
 * half, and must be covered by `hashWorld` like every other accumulator a
 * consumer reads (gate G2, the p9g `goldSpent` precedent).
 */
describe('p12a — damageByWeaponVs isolates the VS half', () => {
  it('a TD-phase hit lands in damageByWeapon but not in damageByWeaponVs', () => {
    const w = world();
    w.phase = 'act1_wave';
    const e = husk(w);
    damageEnemy(w, e, 100, 'class_basic');
    expect(w.damageByWeapon['class_basic']).toBeCloseTo(100, 6);
    expect(w.damageByWeaponVs['class_basic']).toBeUndefined();
  });

  it('a VS-phase hit lands in both, with the same amount', () => {
    const w = world();
    w.phase = 'act2';
    const e = husk(w);
    damageEnemy(w, e, 100, 'class_basic');
    expect(w.damageByWeaponVs['class_basic']).toBeCloseTo(w.damageByWeapon['class_basic'], 6);
  });

  it('it sums across VS blocks rather than resetting, unlike a single snapshot', () => {
    const w = world();
    w.phase = 'act2';
    damageEnemy(w, husk(w), 100, 'class_basic');
    w.phase = 'act1_wave'; // back to TD for the next block
    damageEnemy(w, husk(w), 100, 'class_basic');
    w.phase = 'act2'; // second VS block
    damageEnemy(w, husk(w), 100, 'class_basic');
    expect(w.damageByWeaponVs['class_basic']).toBeCloseTo(200, 6);
    expect(w.damageByWeapon['class_basic']).toBeCloseTo(300, 6);
  });

  it("counts a hit landed during the level-up pause — that is still the VS half", () => {
    // `huntsWarden` is `act2 || levelup`, and `levelup` is reachable only out
    // of `act2`. The update loop deals no damage there, but a queued
    // `class_active` Command can (`applyCommand` has no phase guard), and
    // that damage is VS damage. Pinned so a future narrowing of the predicate
    // to a bare `act2` shows up here (code-reviewer, p12a).
    const w = world();
    w.phase = 'levelup';
    const e = husk(w);
    damageEnemy(w, e, 100, 'class_active');
    expect(w.damageByWeaponVs['class_active']).toBeCloseTo(w.damageByWeapon['class_active'], 6);
  });

  it('a wielded-weapon (tower-key) source is counted too — it is the character in VS', () => {
    const w = world();
    w.phase = 'act2';
    damageEnemy(w, husk(w), 100, 'ballista');
    expect(w.damageByWeaponVs['ballista']).toBeCloseTo(100, 6);
  });

  it('a damageByWeaponVs difference changes the hash (gate G2, p9g precedent)', () => {
    const a = new World(cfg());
    const b = new World(cfg());
    a.damageByWeaponVs = { class_basic: 100 };
    b.damageByWeaponVs = { class_basic: 140 };
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});
