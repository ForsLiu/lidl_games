/**
 * p5c — SPEC-FINAL §5's four remaining milestone specials (Ballista, Fire
 * Brazier, Ice Obelisk, Mortar all shipped with empty `specials` arrays) and
 * gate **G20**: "every §5 milestone special measurably changes the attack it
 * names, and the loader validates it."
 *
 * Three layers, matching m20b's own precedent for the first three owner
 * towers: a structural pass drives every tower's own track through
 * `attackProfile` at the step below each milestone and the step it lands on
 * (covers all ten towers uniformly — the three that predate this item and
 * the four it adds — and doubles as the loader's own "does this special do
 * anything" gate, `validateSpecialChangesProfile` in `src/sim/content.ts`);
 * a live-fire pass proves the four new mechanisms are actually wired into
 * `fireTower` (Act I), not just computed and dropped; a third pass proves the
 * same four are wired into `fireWielded` (`src/sim/vswield.ts`) too — §6.1
 * inherits a tower's "highest upgrade effect" into VS, so a milestone that
 * only fires in Act I is only half-shipped (code review on this item's first
 * draft caught exactly this gap, live in `fireWielded`'s cone/aura/lob cases
 * before the fix below). The m19a/m19b rule throughout: a clause is not
 * covered until deleting the wiring turns something red.
 */

import { describe, expect, it } from 'vitest';

import { coneHit, updateProjectiles } from '../src/sim/combat';
import { loadContent, validateSpecialChangesProfile, type Content, type TowerDef } from '../src/sim/content';
import { dotOutstanding, spawnEnemy } from '../src/sim/enemies';
import { attackProfile, buildTower, updateTowers, upgradeStatMul, upgradeTower } from '../src/sim/towers';
import type { Enemy } from '../src/sim/types';
import { updateWieldedAttacks } from '../src/sim/vswield';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const DT = 1 / 60;
const content = loadContent();
const BALLISTA = content.towerByKey.get('ballista')!;
const EMBER = content.towerByKey.get('ember_brazier')!;
const FROST = content.towerByKey.get('frost_obelisk')!;
const MORTAR = content.towerByKey.get('mortar')!;

/** A free, buildable tile that will not seal the path. */
function freeTile(w: World): { tx: number; ty: number } {
  for (let ty = 4; ty < 20; ty++) {
    for (let tx = 4; tx < 20; tx++) {
      if (w.grid.buildable(tx, ty) && !w.grid.wouldBlockPath([[tx, ty]])) return { tx, ty };
    }
  }
  throw new Error('no buildable tile');
}

/** A tower of `def` built and upgraded `steps` times, via the real build/upgrade path. */
function tower(def: TowerDef, steps = 0, c: Content = content) {
  const w = new World(cfg(), c);
  const { tx, ty } = freeTile(w);
  w.warden.x = tx + 0.5;
  w.warden.y = ty + 0.5;
  w.gold = 1e6;
  expect(buildTower(w, def.id, tx, ty).ok, def.key).toBe(true);
  for (let i = 0; i < steps; i++) {
    w.gold = 1e6;
    expect(upgradeTower(w, tx, ty), `${def.key} step ${i + 1}`).toBe(true);
  }
  const s = w.structureAt(tx, ty)!;
  expect(s.tier).toBe(steps + 1);
  return { w, s, x: tx + 0.5, y: ty + 0.5 };
}

/** Same as `tower`, but switches to a VS wave afterward so `updateWieldedAttacks` fires. */
function wieldedTower(def: TowerDef, steps = 0, c: Content = content) {
  const built = tower(def, steps, c);
  built.w.phase = 'act2';
  return built;
}

/** A rooted husk with enough HP to outlive anything this file fires at it. */
function dummy(w: World, x: number, y: number, key = 'husk'): Enemy {
  const e = spawnEnemy(w, key, x, y)!;
  e.hp = 1e9;
  e.maxHp = 1e9;
  e.armor = 0;
  e.speed = 0;
  w.rebuildBuckets();
  return e;
}

describe('p5c — gate G20: every milestone special measurably changes attackProfile', () => {
  it('drives every tower with a track through the step below and the step of each milestone', () => {
    let checked = 0;
    for (const t of content.towers.towers) {
      for (const sp of t.upgrades.specials) {
        const before = attackProfile(t, sp.at);
        const after = attackProfile(t, sp.at + 1);
        expect(JSON.stringify(before), `${t.key} @${sp.at} "${sp.key}"`).not.toBe(JSON.stringify(after));
        checked++;
      }
    }
    // Arrow(3) + Tesla(1) + Venom(2), m20b's three, plus Ballista(2) +
    // Ember(2) + Frost(1) + Mortar(1), this item's four.
    expect(checked).toBe(12);
  });

  it('the loader rejects a special that folds into a no-op against the attack\'s own base', () => {
    // A `slowDuration` milestone that repeats the base `slowDuration` reads
    // clean structurally (SPECIAL_KINDS/validateSpecial both pass an `aura`
    // kind) but changes nothing about what the tower actually fires.
    const inert = { at: 1, key: 'slowDuration' as const, seconds: FROST.attack!.slowDuration! };
    const track = { count: FROST.upgrades.count, stepCost: 0, specials: [inert] };
    expect(() => validateSpecialChangesProfile(inert, FROST.attack, track, 'x')).toThrow(/does not change/);
  });

  it('rejects a second milestone that repeats an earlier milestone\'s own value, not just the attack\'s base', () => {
    // QA's finding on this item's own review: checking a special against a
    // *synthetic single-special* track can only ever compare it to the
    // attack's absolute unmilestoned default. A second special on the same
    // real track that repeats a *different, earlier* milestone's value reads
    // as "changes the profile" under that synthetic check (it does differ
    // from the bare default) even though it changes nothing past what the
    // earlier milestone already set — the exact class of no-op step G20
    // exists to catch. Passing the tower's real, full `upgrades` (both
    // specials together) is what closes the gap: the earlier milestone stays
    // active in both the "before" and "after" snapshots, isolating only the
    // one flip the second special itself would cause.
    const repeat = { at: 5, key: 'slowDuration' as const, seconds: 5 };
    const track = {
      count: 6,
      stepCost: 0,
      specials: [{ at: 3, key: 'slowDuration' as const, seconds: 5 }, repeat],
    };
    expect(() => validateSpecialChangesProfile(repeat, FROST.attack, track, 'x')).toThrow(/does not change/);
  });

  it('every real milestone special in /data passes the same rule loadContent already enforced', () => {
    for (const t of content.towers.towers) {
      for (const sp of t.upgrades.specials) {
        expect(() => validateSpecialChangesProfile(sp, t.attack, t.upgrades, t.key)).not.toThrow();
      }
    }
  });
});

describe('p5c — Ballista: +1 pierce @2, +1 projectile @4', () => {
  it('reuses Arrow\'s own pierce/projectiles keys, unmilestoned at level 1', () => {
    const prof = attackProfile(BALLISTA, 1);
    expect(prof.pierce).toBe(BALLISTA.attack!.pierce);
    expect(prof.projectiles).toBe(1);
  });

  it('pierce +1 lands at level 3, +1 projectile at level 5', () => {
    expect(attackProfile(BALLISTA, 2).pierce).toBe(BALLISTA.attack!.pierce);
    expect(attackProfile(BALLISTA, 3).pierce).toBe(BALLISTA.attack!.pierce! + 1);
    expect(attackProfile(BALLISTA, 4).projectiles).toBe(1);
    expect(attackProfile(BALLISTA, 5).projectiles).toBe(2);
  });
});

describe('p5c — Fire Brazier: +1 Burning per hit @2, cone width +50% @4', () => {
  it('the burn a hit deals doubles once the level-3 milestone is live', () => {
    // Burning stacks per application since p10a, but this milestone stays a
    // dps multiplier on the one application a hit deals rather than a second
    // literal stack — see `AttackProfile.burnStacks`'s doc comment (Q112).
    const unmilestoned = tower(EMBER, 0);
    const e1 = dummy(unmilestoned.w, unmilestoned.x, unmilestoned.y - 1);
    unmilestoned.w.rebuildBuckets();
    updateTowers(unmilestoned.w, DT);
    const outstanding1 = dotOutstanding(e1);
    expect(outstanding1).toBeGreaterThan(0);

    const milestoned = tower(EMBER, 2); // level 3 — the burnStacks milestone is live
    const e2 = dummy(milestoned.w, milestoned.x, milestoned.y - 1);
    milestoned.w.rebuildBuckets();
    updateTowers(milestoned.w, DT);
    const outstanding2 = dotOutstanding(e2);
    // Level 3 also carries the one ordinary +10% stat step this track still
    // pays out below the milestone (steps 1 and 3 are stat bumps; step 2 is
    // spent on burnStacks instead — `milestoneStepsSkipStats`), so the exact
    // ratio is ×2 from the milestone times that stat multiplier, not a flat ×2.
    const statMul = upgradeStatMul(milestoned.w, EMBER, milestoned.s.tier);
    expect(outstanding2).toBeCloseTo(outstanding1 * 2 * statMul, 4);
  });

  it('the cone widens at level 5, reaching an enemy the base width misses', () => {
    const baseAngle = (EMBER.attack!.coneHalfAngle ?? 0.6) * attackProfile(EMBER, 4).coneWidthMul;
    const widenedAngle = (EMBER.attack!.coneHalfAngle ?? 0.6) * attackProfile(EMBER, 5).coneWidthMul;
    expect(widenedAngle).toBeGreaterThan(baseAngle);

    // Called directly against `coneHit` (not through `fireTower`'s own
    // direction-picking) so the test measures the milestone's geometry, not
    // `bestConeDirection`'s aim heuristic. An enemy sitting exactly at the
    // midpoint angle is inside the widened cone and outside the base one.
    const midAngle = (baseAngle + widenedAngle) / 2;
    const range = EMBER.attack!.range;
    const w = new World(cfg(), content);
    const ex = 0.5 + Math.sin(midAngle) * (range * 0.9);
    const ey = 0.5 - Math.cos(midAngle) * (range * 0.9);
    dummy(w, ex, ey);

    const hitNarrow = coneHit(w, 0.5, 0.5, 0, -1, range, baseAngle, 5, 'ember_brazier');
    expect(hitNarrow).toBe(0);
    const hitWide = coneHit(w, 0.5, 0.5, 0, -1, range, widenedAngle, 5, 'ember_brazier');
    expect(hitWide).toBeGreaterThan(0);
  });
});

describe('p5c — Ice Obelisk: frost from this tower lasts 5s @3', () => {
  it('the applied slow lasts 1.2s unmilestoned, 5s once the level-4 milestone is live', () => {
    const unmilestoned = tower(FROST, 0);
    const e1 = dummy(unmilestoned.w, unmilestoned.x, unmilestoned.y - 1);
    for (let i = 0; i < 120 && e1.slowRemaining <= 0; i++) {
      unmilestoned.w.rebuildBuckets();
      updateTowers(unmilestoned.w, DT);
    }
    expect(e1.slowRemaining).toBeCloseTo(FROST.attack!.slowDuration!, 5);

    const milestoned = tower(FROST, 3); // level 4 — the slowDuration milestone is live
    const e2 = dummy(milestoned.w, milestoned.x, milestoned.y - 1);
    for (let i = 0; i < 120 && e2.slowRemaining <= 0; i++) {
      milestoned.w.rebuildBuckets();
      updateTowers(milestoned.w, DT);
    }
    expect(e2.slowRemaining).toBeCloseTo(5, 5);
  });
});

describe('p5c — Mortar: shells leave a burning patch for 2s @3', () => {
  it('a shell leaves no ground patch unmilestoned, one 2s patch once the level-4 milestone is live', () => {
    const unmilestoned = tower(MORTAR, 0);
    const e1 = dummy(unmilestoned.w, unmilestoned.x, unmilestoned.y - 6);
    // ~51 ticks to travel the 6-tile gap at the mortar's own projectile speed;
    // 100 stays well short of the ~132-tick reload that would fire a second
    // shell and double-count the patch below.
    for (let i = 0; i < 100; i++) {
      unmilestoned.w.rebuildBuckets();
      updateTowers(unmilestoned.w, DT);
      updateProjectiles(unmilestoned.w, DT);
    }
    expect(e1.hp).toBeLessThan(1e9); // the shell actually landed
    expect(unmilestoned.w.areas.filter((a) => a.type === 'burn')).toHaveLength(0);

    const milestoned = tower(MORTAR, 3); // level 4 — the burnPatch milestone is live
    const e2 = dummy(milestoned.w, milestoned.x, milestoned.y - 6);
    // ~51 ticks to travel the 6-tile gap at the mortar's own projectile speed;
    // 100 stays well short of the ~132-tick reload that would fire a second
    // shell and double-count the patch below.
    for (let i = 0; i < 100; i++) {
      milestoned.w.rebuildBuckets();
      updateTowers(milestoned.w, DT);
      updateProjectiles(milestoned.w, DT);
    }
    expect(e2.hp).toBeLessThan(1e9);
    const patches = milestoned.w.areas.filter((a) => a.type === 'burn');
    expect(patches).toHaveLength(1);
    expect(patches[0].remaining).toBeCloseTo(2, 1);
    expect(patches[0].radius).toBeCloseTo((MORTAR.attack!.aoe ?? 1.5), 5);
  });
});

describe('p5c — the same milestones apply to the VS-wielded attack (§6.1)', () => {
  it('Fire Brazier: the wielded burn doubles once the level-3 milestone is live', () => {
    const unmilestoned = wieldedTower(EMBER, 0);
    const e1 = dummy(unmilestoned.w, unmilestoned.x, unmilestoned.y - 1);
    unmilestoned.w.rebuildBuckets();
    updateWieldedAttacks(unmilestoned.w, DT);
    const outstanding1 = dotOutstanding(e1);
    expect(outstanding1).toBeGreaterThan(0);

    const milestoned = wieldedTower(EMBER, 2); // level 3 — burnStacks live
    const e2 = dummy(milestoned.w, milestoned.x, milestoned.y - 1);
    milestoned.w.rebuildBuckets();
    updateWieldedAttacks(milestoned.w, DT);
    const outstanding2 = dotOutstanding(e2);
    // §6.1 wields "the highest upgrade effect" — the burn rider still scales
    // by the group's own tier (`upgradeStatMul`), same as Act I.
    const statMul = upgradeStatMul(milestoned.w, EMBER, milestoned.s.tier);
    expect(outstanding2).toBeCloseTo(outstanding1 * 2 * statMul, 4);
  });

  it('Fire Brazier: the wielded cone widens at level 5, reaching an enemy the base width misses', () => {
    // Two enemies straddling a shared bisector, far enough apart that no
    // single aim covers both at the base half-angle but one does once it
    // widens — `bestConeDirection` (combat.ts) only samples directions
    // pointed exactly at a candidate enemy, so covering both from one aim
    // needs the *full* angular separation (2*theta) within the half-angle.
    const baseAngle = (EMBER.attack!.coneHalfAngle ?? 0.6) * attackProfile(EMBER, 4).coneWidthMul;
    const widenedAngle = (EMBER.attack!.coneHalfAngle ?? 0.6) * attackProfile(EMBER, 5).coneWidthMul;
    const theta = (baseAngle + widenedAngle) / 4; // 2*theta lands between the two
    expect(2 * theta).toBeGreaterThan(baseAngle);
    expect(2 * theta).toBeLessThanOrEqual(widenedAngle);

    const place = (w: World, x: number, y: number) => {
      const range = EMBER.attack!.range * 0.9;
      const a1 = dummy(w, x + Math.sin(-theta) * range, y - Math.cos(-theta) * range);
      const a2 = dummy(w, x + Math.sin(theta) * range, y - Math.cos(theta) * range);
      return [a1, a2] as const;
    };

    const unmilestoned = wieldedTower(EMBER, 3); // level 4 — coneWidth not yet live
    const [n1, n2] = place(unmilestoned.w, unmilestoned.x, unmilestoned.y);
    unmilestoned.w.rebuildBuckets();
    updateWieldedAttacks(unmilestoned.w, DT);
    const narrowHits = [n1, n2].filter((e) => e.hp < 1e9).length;
    expect(narrowHits, 'base width hits at most one of the two').toBeLessThanOrEqual(1);

    const milestoned = wieldedTower(EMBER, 4); // level 5 — coneWidth live
    const [w1, w2] = place(milestoned.w, milestoned.x, milestoned.y);
    milestoned.w.rebuildBuckets();
    updateWieldedAttacks(milestoned.w, DT);
    expect(w1.hp, 'widened cone hits both').toBeLessThan(1e9);
    expect(w2.hp, 'widened cone hits both').toBeLessThan(1e9);
  });

  it('Ice Obelisk: the wielded slow lasts 1.2s unmilestoned, 5s once the level-4 milestone is live', () => {
    const unmilestoned = wieldedTower(FROST, 0);
    const e1 = dummy(unmilestoned.w, unmilestoned.x, unmilestoned.y - 1);
    unmilestoned.w.rebuildBuckets();
    updateWieldedAttacks(unmilestoned.w, DT);
    expect(e1.slowRemaining).toBeCloseTo(FROST.attack!.slowDuration!, 5);

    const milestoned = wieldedTower(FROST, 3); // level 4 — slowDuration live
    const e2 = dummy(milestoned.w, milestoned.x, milestoned.y - 1);
    milestoned.w.rebuildBuckets();
    updateWieldedAttacks(milestoned.w, DT);
    expect(e2.slowRemaining).toBeCloseTo(5, 5);
  });

  it('Mortar: a wielded shell leaves no ground patch unmilestoned, one 2s patch once the level-4 milestone is live', () => {
    const unmilestoned = wieldedTower(MORTAR, 0);
    const e1 = dummy(unmilestoned.w, unmilestoned.x, unmilestoned.y - 6);
    for (let i = 0; i < 100; i++) {
      unmilestoned.w.rebuildBuckets();
      updateWieldedAttacks(unmilestoned.w, DT);
      updateProjectiles(unmilestoned.w, DT);
    }
    expect(e1.hp).toBeLessThan(1e9); // the shell actually landed
    expect(unmilestoned.w.areas.filter((a) => a.type === 'burn')).toHaveLength(0);

    const milestoned = wieldedTower(MORTAR, 3); // level 4 — burnPatch live
    const e2 = dummy(milestoned.w, milestoned.x, milestoned.y - 6);
    for (let i = 0; i < 100; i++) {
      milestoned.w.rebuildBuckets();
      updateWieldedAttacks(milestoned.w, DT);
      updateProjectiles(milestoned.w, DT);
    }
    expect(e2.hp).toBeLessThan(1e9);
    expect(milestoned.w.areas.filter((a) => a.type === 'burn')).toHaveLength(1);
  });
});
