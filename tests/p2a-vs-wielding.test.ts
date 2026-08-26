/**
 * p2a — SPEC-FINAL §6.1's VS tower-attack inheritance formula, gate G3.
 *
 * The worked example transcribed verbatim: "1×lv1 arrow + 2×lv3 arrow +
 * 1×lv1 poison → arrow VS damage = (1×lv1 + 2×lv3)/3 × (1 + 10%×3), with the
 * @3 upgrade's +1 pierce; poison computed the same way."
 *
 * "lv1"/"lv3" name the tower's own upgrade level, and the tower's own table
 * (§5.1) names its milestone "@3" — Arrow's `+1 pierce @3`. This codebase's
 * `attackProfile`/`upgradeStatMul` already establish (m20b-owner-towers.test.ts)
 * that "at 3" fires once 3 upgrade steps are bought, i.e. at engine tier 4 —
 * a built tower is tier 1 with zero steps. So the worked example's "lv3 arrow
 * carrying the @3 pierce" is reproduced here at engine tier 4, the tier where
 * the milestone is actually live; using tier 3 would assert a pierce bonus
 * the shipped milestone table does not grant there. Logged as a QUESTIONS.md
 * entry rather than guessed silently.
 */

import { describe, expect, it } from 'vitest';

import { loadContent, type TowerDef } from '../src/sim/content';
import { buildTower, upgradeTower } from '../src/sim/towers';
import { World } from '../src/sim/world';
import { wieldedAttacks } from '../src/sim/vswield';
import { cfg } from './helpers';

const content = loadContent();
const ARROW = content.towerByKey.get('arrow_spire')!;
const VENOM = content.towerByKey.get('venom_spore')!;
const WALL = content.towerByKey.get('palisade')!;

/** Free, buildable tiles that never collide with each other. */
function tiles(w: World, n: number): { tx: number; ty: number }[] {
  const out: { tx: number; ty: number }[] = [];
  for (let ty = 4; ty < 20 && out.length < n; ty++) {
    for (let tx = 4; tx < 20 && out.length < n; tx++) {
      if (w.grid.buildable(tx, ty) && !w.grid.wouldBlockPath([[tx, ty]])) out.push({ tx, ty });
    }
  }
  if (out.length < n) throw new Error('not enough buildable tiles');
  return out;
}

function build(w: World, def: TowerDef, tx: number, ty: number, steps: number) {
  w.warden.x = tx + 0.5;
  w.warden.y = ty + 0.5;
  w.gold = 1e6;
  expect(buildTower(w, def.id, tx, ty).ok).toBe(true);
  for (let i = 0; i < steps; i++) {
    w.gold = 1e6;
    expect(upgradeTower(w, tx, ty), `${def.key} step ${i + 1}`).toBe(true);
  }
}

describe('p2a — §6.1 VS wielding formula (G3)', () => {
  it('worked example verbatim: 1×lv1 arrow + 2×lv3(engine tier 4) arrow + 1×lv1 poison', () => {
    const w = new World(cfg(), content);
    const [a1, a2, a3, p1] = tiles(w, 4);
    // Arrow's own milestone table (§5.1): +1 pierce @3 — three steps bought,
    // engine tier 4 (tier 1 is zero steps). Matches attackProfile's own rule.
    build(w, ARROW, a1.tx, a1.ty, 0); // lv1, 0 steps
    build(w, ARROW, a2.tx, a2.ty, 3); // "lv3" per §6.1's example: carries @3's pierce
    build(w, ARROW, a3.tx, a3.ty, 3);
    build(w, VENOM, p1.tx, p1.ty, 0); // lv1 poison

    const wielded = wieldedAttacks(w);
    const arrow = wielded.find((x) => x.towerKey === 'arrow_spire')!;
    const poison = wielded.find((x) => x.towerKey === 'venom_spore')!;
    expect(arrow).toBeDefined();
    expect(poison).toBeDefined();

    const lv1 = ARROW.attack!.damage; // 5.5, unmodified
    const lv3 = ARROW.attack!.damage * Math.pow(content.towers.upgradeStepMul, 2); // 2 stat steps, 1 milestone step
    const expectedArrow = ((1 * lv1 + 2 * lv3) / 3) * (1 + 0.1 * 3);

    expect(arrow.count).toBe(3);
    expect(arrow.damage).toBeCloseTo(expectedArrow, 6);
    // "with the @3 upgrade's +1 pierce" — the highest-tier arrow's milestone
    // rides along in the wielded profile.
    expect(arrow.profile.pierce).toBe(1);
    expect(arrow.interval).toBe(ARROW.attack!.interval);

    // "poison computed the same way" — one lv1 tower, so average = itself and
    // the count bonus is the minimum +10%.
    const expectedPoison = VENOM.attack!.damage * (1 + 0.1 * 1);
    expect(poison.count).toBe(1);
    expect(poison.damage).toBeCloseTo(expectedPoison, 6);
    expect(poison.profile.ratio).toEqual(VENOM.attack!.damageRatio);
  });

  it('a tower type with no attack (wall) wields nothing', () => {
    const w = new World(cfg(), content);
    const [t1] = tiles(w, 1);
    build(w, WALL, t1.tx, t1.ty, 0);
    expect(wieldedAttacks(w)).toEqual([]);
  });

  it('a dead structure does not feed the average', () => {
    const w = new World(cfg(), content);
    const [t1, t2] = tiles(w, 2);
    build(w, ARROW, t1.tx, t1.ty, 0);
    build(w, ARROW, t2.tx, t2.ty, 0);
    const dead = w.structureAt(t2.tx, t2.ty)!;
    dead.dead = true;

    const [arrow] = wieldedAttacks(w);
    expect(arrow.count).toBe(1);
    expect(arrow.damage).toBeCloseTo(ARROW.attack!.damage * 1.1, 6);
  });
});
