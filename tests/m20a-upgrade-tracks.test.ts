/**
 * m20a — SPEC-V3 §4's per-tower upgrade tracks.
 *
 * §4 is four claims about every tower in the game (its own upgrade count, +10%
 * HP / Attack / Defense per step, a flat step cost, sell 50% of total spent)
 * plus a table that fixes the count for three of them. So this file walks all
 * ten towers for each claim rather than sampling one, and reads every number it
 * asserts out of `/data` instead of re-typing it — the m19a/m19b rule: a clause
 * is not covered until deleting the wiring turns something red.
 */

import { describe, expect, it } from 'vitest';

import { loadContent, validateUpgradeTrack, type Content, type TowerDef } from '../src/sim/content';
import { damageStructure, dotOutstanding, spawnEnemy } from '../src/sim/enemies';
import { hashWorld } from '../src/sim/run';
import { damageTakenMul } from '../src/sim/stats';
import {
  attackProfile,
  buildTower,
  effectiveTowerRange,
  maxLevel,
  sellTower,
  sellValue,
  structureArmor,
  structureMaxHp,
  towerCost,
  towerDamage,
  upgradeCost,
  updateTowers,
  upgradeStatMul,
  upgradeTower,
} from '../src/sim/towers';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const content = loadContent();
const TOWERS = content.towers.towers;
const STEP = content.towers.upgradeStepMul;

/** A free, buildable tile that will not seal the path. */
function freeTile(w: World): { tx: number; ty: number } {
  for (let ty = 2; ty < 20; ty++) {
    for (let tx = 2; tx < 20; tx++) {
      if (w.grid.buildable(tx, ty) && !w.grid.wouldBlockPath([[tx, ty]])) return { tx, ty };
    }
  }
  throw new Error('no buildable tile');
}

/** A world with the Warden parked on `tx,ty` and gold for anything. */
function worldAt(tx: number, ty: number, c: Content = content): World {
  const w = new World(cfg(), c);
  w.warden.x = tx + 0.5;
  w.warden.y = ty + 0.5;
  w.gold = 1e6;
  return w;
}

/** Places `def` on the first free tile, Warden already in build range. */
function place(def: TowerDef, c: Content = content) {
  const probe = new World(cfg(), c);
  const { tx, ty } = freeTile(probe);
  const w = worldAt(tx, ty, c);
  expect(buildTower(w, def.id, tx, ty).ok, def.key).toBe(true);
  return { w, tx, ty, s: w.structureAt(tx, ty)! };
}

/**
 * A copy of the content with one tower def (and optionally one file-level
 * constant) overridden. `loadContent` caches, so nothing here may mutate it.
 */
function contentWith(key: string, over: Partial<TowerDef>, fileOver: Record<string, unknown> = {}): Content {
  const towers = TOWERS.map((t) => (t.key === key ? { ...t, ...over } : t));
  return {
    ...content,
    towers: { ...content.towers, ...fileOver, towers },
    towerByKey: new Map(towers.map((t) => [t.key, t])),
    towerById: new Map(towers.map((t) => [t.id, t])),
  };
}

describe('m20a — every tower has a well-formed upgrade track (§4)', () => {
  it('authors a count, a flat step cost and a defense on all ten towers', () => {
    expect(TOWERS).toHaveLength(10);
    for (const t of TOWERS) {
      expect(Number.isInteger(t.upgrades.count), t.key).toBe(true);
      expect(t.upgrades.count, t.key).toBeGreaterThanOrEqual(0);
      expect(t.upgrades.stepCost, t.key).toBeGreaterThan(t.upgrades.count > 0 ? 0 : -1);
      if (t.upgrades.count === 0) expect(t.upgrades.stepCost, t.key).toBe(0);
      expect(Number.isFinite(t.defense), t.key).toBe(true);
      expect(t.defense, t.key).toBeGreaterThanOrEqual(0);
      expect(maxLevel(t), t.key).toBe(t.upgrades.count + 1);
    }
  });

  it('pins every milestone special to a step the track actually has', () => {
    for (const t of TOWERS) validateUpgradeTrack(t.upgrades, t.key);
    // Nothing authors a special until m20b, so drive the loader's own predicate
    // rather than letting the rule ship with no coverage at all.
    const track = (over: Record<string, unknown> = {}) => ({ count: 3, stepCost: 10, specials: [], ...over });
    expect(() => validateUpgradeTrack(track({ specials: [{ at: 4, key: 'pierce' }] }), 'x')).toThrow(/step 4 of 3/);
    expect(() =>
      validateUpgradeTrack(
        track({
          specials: [
            { at: 2, key: 'a' },
            { at: 2, key: 'b' },
          ],
        }),
        'x',
      ),
    ).toThrow(/two specials/);
    expect(() => validateUpgradeTrack(track({ specials: [{ at: 3, key: 'ok' }] }), 'x')).not.toThrow();
    // A step nobody can buy is the other way a track goes silently inert.
    expect(() => validateUpgradeTrack(track({ stepCost: 0 }), 'x')).toThrow(/no price/);
    expect(() => validateUpgradeTrack(track({ count: 0, stepCost: 0 }), 'x'), 'a wall prices nothing').not.toThrow();
  });

  it('gives the three owner-specced towers the counts §4 states', () => {
    // §4's table is authoritative: Arrow 5, Electric 3, Poison 4.
    expect(content.towerByKey.get('arrow_spire')!.upgrades.count).toBe(5);
    expect(content.towerByKey.get('tesla_coil')!.upgrades.count).toBe(3);
    expect(content.towerByKey.get('venom_spore')!.upgrades.count).toBe(4);
  });
});

describe('m20a — sell refunds 50% of total spent, at every step (§4)', () => {
  it('pays exactly half of build + upgrades for every tower at every step', () => {
    expect(content.towers.sellRefund).toBe(0.5);
    for (const def of TOWERS) {
      const { w, tx, ty, s } = place(def);
      let spent = towerCost(w, def);
      for (let step = 0; step <= def.upgrades.count; step++) {
        expect(s.spent, `${def.key} step ${step}`).toBe(spent);
        expect(sellValue(w, s), `${def.key} step ${step}`).toBe(Math.round(spent * 0.5));

        // The quote is what the till actually pays. A twin on the same tile in
        // its own world is sold, so the structure under test survives the loop.
        const twin = worldAt(tx, ty);
        expect(buildTower(twin, def.id, tx, ty).ok).toBe(true);
        for (let i = 0; i < step; i++) expect(upgradeTower(twin, tx, ty)).toBe(true);
        const before = twin.gold;
        expect(sellTower(twin, tx, ty), `${def.key} sell at step ${step}`).toBe(true);
        expect(twin.gold - before, `${def.key} refund at step ${step}`).toBe(Math.round(spent * 0.5));

        if (step === def.upgrades.count) break;
        w.gold = 1e6;
        expect(upgradeTower(w, tx, ty), `${def.key} step ${step + 1}`).toBe(true);
        spent += upgradeCost(w, def);
      }
    }
  });

  it('refunds the gold the player was charged, not the price of the day', () => {
    // A relic or a Constellation node can move `towerCostMul` mid-run. The
    // refund follows what was paid, which is why `Structure` records it.
    const def = content.towerByKey.get('ballista')!;
    const { w, tx, ty, s } = place(def);
    const paid = s.spent;
    w.derived.towerCostMul = 0.5;
    expect(sellValue(w, s)).toBe(Math.round(paid * 0.5));
    const before = w.gold;
    expect(sellTower(w, tx, ty)).toBe(true);
    expect(w.gold - before).toBe(Math.round(paid * 0.5));
  });

  it('charges a flat cost per step — no ladder', () => {
    const def = content.towerByKey.get('arrow_spire')!;
    const { w, tx, ty } = place(def);
    const costs: number[] = [];
    for (let i = 0; i < def.upgrades.count; i++) {
      const g = w.gold;
      expect(upgradeTower(w, tx, ty)).toBe(true);
      costs.push(g - w.gold);
    }
    expect(costs).toHaveLength(def.upgrades.count);
    for (const c of costs) expect(c).toBe(costs[0]);
    expect(costs[0]).toBe(Math.round(def.upgrades.stepCost * w.derived.towerCostMul));
    expect(upgradeTower(w, tx, ty), 'track exhausted').toBe(false);
  });
});

describe('m20a — a step buys +10% HP, Attack and Defense (§4)', () => {
  it('scales HP and attack by exactly the authored step, on every tower', () => {
    expect(STEP).toBeCloseTo(1.1, 10);
    for (const def of TOWERS) {
      const { w, tx, ty, s } = place(def);
      const hp0 = s.maxHp;
      const dmg0 = def.attack ? towerDamage(w, s, def.attack.damage) : 0;
      // "+10% unless a milestone special is listed" (§4): a step carrying one
      // buys the special instead, so the exponent counts the plain steps.
      const plain = (step: number) => step - def.upgrades.specials.filter((sp) => sp.at <= step).length;
      for (let step = 1; step <= def.upgrades.count; step++) {
        w.gold = 1e6;
        expect(upgradeTower(w, tx, ty)).toBe(true);
        expect(s.maxHp, `${def.key} hp @${step}`).toBeCloseTo(hp0 * STEP ** plain(step), 6);
        expect(structureMaxHp(w, def, s.tier), def.key).toBeCloseTo(s.maxHp, 10);
        if (def.attack) {
          expect(towerDamage(w, s, def.attack.damage), `${def.key} dmg @${step}`).toBeCloseTo(
            dmg0 * STEP ** plain(step),
            6,
          );
        }
      }
    }
  });

  it('scales an attack ailment with the step too — burn dps', () => {
    // `fireTower` scales `attack.burn.dps` by the step multiplier. Driven
    // through the real fire loop, not the arithmetic: the only other reader is
    // the info panel, so nothing would notice if it lost its wiring.
    //
    // Venom Spore used to be the second case here; m20b restated its poison as
    // §3's ratio, so its DoT now scales through the attack itself and is
    // covered by m20b's own file. Ember Brazier now also carries p5c's own
    // `burnStacks` milestone (@2), which doubles the dps on top of whatever
    // stat steps the track still pays out below it — the expected ratio at
    // max level folds both in, the same way `fireTower` itself does, rather
    // than assuming every step is a plain +10%.
    for (const key of ['ember_brazier']) {
      const def = content.towerByKey.get(key)!;
      const owed = (levels: number) => {
        const { w, tx, ty } = place(def);
        for (let i = 0; i < levels; i++) {
          w.gold = 1e6;
          expect(upgradeTower(w, tx, ty)).toBe(true);
        }
        const e = spawnEnemy(w, 'husk', tx + 1.5, ty + 0.5, { overlay: false })!;
        e.hp = 1e9;
        w.rebuildBuckets();
        updateTowers(w, 1 / 60);
        return { w, outstanding: dotOutstanding(e) };
      };
      const base = owed(0);
      expect(base.outstanding, `${key} must apply a DoT at all`).toBeGreaterThan(0);
      const maxed = owed(def.upgrades.count);
      const statRatio = upgradeStatMul(maxed.w, def, maxLevel(def));
      const burnStacksRatio = attackProfile(def, maxLevel(def)).burnStacks;
      expect(maxed.outstanding, `${key} ailment at max`).toBeCloseTo(
        base.outstanding * statRatio * burnStacksRatio,
        4,
      );
    }
  });

  it('scales defense the same way, and defense is real damage reduction', () => {
    // m20c's bands are 0/5/10, so 20 is deliberately off-band — a value the
    // loader would now reject, reachable only through `contentWith`, which
    // keeps this asserting the *arithmetic* rather than a shipped number:
    // 20 defense is 20% off, through m19a's shared armour curve.
    const c = contentWith('ballista', { defense: 20 });
    const def = c.towerByKey.get('ballista')!;
    const { w, tx, ty, s } = place(def, c);
    expect(structureArmor(w, s)).toBeCloseTo(20, 10);
    const hp0 = s.hp;
    damageStructure(w, s, 100);
    expect(hp0 - s.hp).toBeCloseTo(80, 6);

    w.gold = 1e6;
    expect(upgradeTower(w, tx, ty)).toBe(true);
    expect(structureArmor(w, s)).toBeCloseTo(20 * STEP, 10);
  });

  it('leaves a shipped tower at exactly x1 damage taken', () => {
    const def = content.towerByKey.get('palisade')!;
    const { w, s } = place(def);
    expect(structureArmor(w, s)).toBe(0);
    const hp0 = s.hp;
    damageStructure(w, s, 50);
    expect(hp0 - s.hp).toBe(50);
  });

  it('does not scale range — §4 lists HP, Attack and Defense only', () => {
    const def = content.towerByKey.get('ballista')!;
    const { w, tx, ty, s } = place(def);
    const r0 = effectiveTowerRange(w, def, 1);
    for (let step = 1; step <= def.upgrades.count; step++) {
      w.gold = 1e6;
      expect(upgradeTower(w, tx, ty)).toBe(true);
      expect(effectiveTowerRange(w, def, s.tier), `range @${step}`).toBeCloseTo(r0, 10);
    }
  });

  it('carries the wound across an upgrade instead of healing it', () => {
    const def = content.towerByKey.get('ballista')!;
    const { w, tx, ty, s } = place(def);
    // Half its HP *through its armour* — m20c gave every tower a defense band,
    // so a raw `maxHp * 0.5` is no longer half a Ballista's health bar.
    damageStructure(w, s, (s.maxHp * 0.5) / damageTakenMul(structureArmor(w, s)));
    expect(upgradeTower(w, tx, ty)).toBe(true);
    expect(s.hp / s.maxHp).toBeCloseTo(0.5, 6);
  });
});

describe('m20a — milestone steps and the stat bump (§4, Q73)', () => {
  // Tesla's shipped track is this shape (one special, at 3); pinning the
  // special at 2 keeps the arithmetic below reading a step on either side.
  const track = { count: 3, stepCost: 10, specials: [{ at: 2, key: 'electricChain' as const }] };

  it('a step carrying a special pays the special instead of +10%', () => {
    const c = contentWith('tesla_coil', { upgrades: track });
    const w = new World(cfg(), c);
    const def = c.towerByKey.get('tesla_coil')!;
    expect(c.towers.milestoneStepsSkipStats).toBe(true);
    expect(upgradeStatMul(w, def, 1)).toBeCloseTo(1, 10);
    expect(upgradeStatMul(w, def, 2)).toBeCloseTo(STEP, 10);
    expect(upgradeStatMul(w, def, 3), 'step 2 is the special').toBeCloseTo(STEP, 10);
    expect(upgradeStatMul(w, def, 4)).toBeCloseTo(STEP ** 2, 10);
  });

  it('reads the other way when the owner flips the /data flag', () => {
    const c = contentWith('tesla_coil', { upgrades: track }, { milestoneStepsSkipStats: false });
    const w = new World(cfg(), c);
    const def = c.towerByKey.get('tesla_coil')!;
    for (let level = 1; level <= 4; level++) {
      expect(upgradeStatMul(w, def, level), `level ${level}`).toBeCloseTo(STEP ** (level - 1), 10);
    }
  });

  it('costs the shipped roster exactly its milestone steps and no more', () => {
    // m20b authored §4's specials onto the three owner towers; p5c adds the
    // four §5.2 towers (Ballista, Fire Brazier, Ice Obelisk, Mortar). All
    // seven pay for their milestones out of the stat bump; the remaining
    // three (wall, beacon totem, harvest sprout) still bump on every step.
    const w = new World(cfg());
    const withSpecials = TOWERS.filter((t) => t.upgrades.specials.length > 0).map((t) => t.key);
    expect(withSpecials).toEqual([
      'arrow_spire',
      'ballista',
      'ember_brazier',
      'frost_obelisk',
      'tesla_coil',
      'mortar',
      'venom_spore',
    ]);
    for (const def of TOWERS) {
      const statSteps = def.upgrades.count - def.upgrades.specials.length;
      expect(upgradeStatMul(w, def, maxLevel(def)), def.key).toBeCloseTo(STEP ** statSteps, 10);
    }
  });

  it('clamps outside the track', () => {
    const w = new World(cfg());
    const def = content.towerByKey.get('palisade')!;
    expect(upgradeStatMul(w, def, 1)).toBe(1);
    expect(upgradeStatMul(w, def, 9), 'a wall has no steps to take').toBe(1);
    expect(upgradeStatMul(w, def, 0)).toBe(1);
  });
});

describe('m20a — the track through the real loop', () => {
  it('hashes the gold spent, so a replay cannot diverge on refunds (A11)', () => {
    const def = content.towerByKey.get('arrow_spire')!;
    const a = place(def);
    const b = place(def);
    expect(hashWorld(b.w)).toBe(hashWorld(a.w));
    b.s.spent += 1;
    expect(hashWorld(b.w), 'Structure.spent must reach the end-state hash').not.toBe(hashWorld(a.w));
  });

  it('a fully upgraded tower still fires, and a wound still kills it', () => {
    const def = content.towerByKey.get('arrow_spire')!;
    const { w, tx, ty, s } = place(def);
    for (let i = 0; i < def.upgrades.count; i++) {
      w.gold = 1e6;
      expect(upgradeTower(w, tx, ty)).toBe(true);
    }
    const e = spawnEnemy(w, 'husk', tx + 1.5, ty + 0.5, { overlay: false })!;
    const hp0 = e.hp;
    for (let i = 0; i < 120; i++) {
      w.rebuildBuckets();
      updateTowers(w, 1 / 60);
    }
    expect(e.hp).toBeLessThan(hp0);
    // Twice its remaining HP rather than exactly its HP-through-armour: this
    // asserts that a wound kills, and the exact form sits on a float knife
    // edge that any band or HP tune would flip red for no behavioural reason.
    damageStructure(w, s, s.hp * 2);
    expect(s.dead).toBe(true);
  });
});
