/**
 * m20c — the other seven towers' tracks, and every tower's defense band.
 *
 * SPEC-V3 §4 fixes three upgrade counts (Arrow 5, Electric 3, Poison 4), no
 * step price at all, and gives defense as a profile word ("medium HP/def",
 * "low def"). Everything else about the roster is a proposal for owner
 * sign-off, which is what m20c authored and Q80 records.
 *
 * The point of this file is that the proposal is a **rule with named
 * exceptions**, not ten numbers someone typed. So it drives the loader's own
 * predicates (`validateStepPrice`, `validateDefense`), pins how far the count
 * line can honestly claim to come from §4 (not as far as the first draft said
 * — see `COUNT_LINE_DIVISOR`), and asserts that every departure from it
 * carries a `note`, because a track that quietly disagrees and a track that
 * disagrees for a measured reason are the same diff otherwise.
 */

import { describe, expect, it } from 'vitest';

import {
  loadContent,
  TowerSchema,
  TowersFileSchema,
  validateDefense,
  validateStepPrice,
} from '../src/sim/content';
import { damageStructure } from '../src/sim/enemies';
import { damageTakenMul } from '../src/sim/stats';
import { buildTower, structureArmor, upgradeCost, upgradeTower } from '../src/sim/towers';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const content = loadContent();
const TOWERS = content.towers.towers;
const FILE = content.towers;

/** §4's table: the three counts the owner fixed, which nothing here may move. */
const OWNER_COUNTS: Record<string, number> = { arrow_spire: 5, tesla_coil: 3, venom_spore: 4 };

/**
 * m20c's count rule: `count = 5 - (cost - 50) / 35`, which agrees with §4's
 * three counts. **The divisor is fitted, not derived** — QA's finding, and it
 * matters to a sign-off: §4's three points are not collinear (the 50→75 slope
 * is −0.040, the 75→120 slope −0.022), so under `Math.round` every divisor in
 * (28, 46.5] reproduces all three, and they disagree about the open roster —
 * 30 reads Mortar 2, 45 reads Ember Brazier and Frost Obelisk 5. 35 is the
 * midpoint of that family. So the case below claims agreement, not derivation,
 * and Q80 records the family the owner is picking from.
 *
 * A tower with no attack is outside the rule rather than an exception to it:
 * its step buys a linear aura or gold figure, not +10% Attack.
 */
const COUNT_LINE_DIVISOR = 35;

function familyCount(cost: number): number {
  return Math.round(5 - (cost - 50) / COUNT_LINE_DIVISOR);
}

function place(key: string): { w: World; tx: number; ty: number } {
  const w = new World(cfg(), content);
  for (let ty = 2; ty < 20; ty++) {
    for (let tx = 2; tx < 20; tx++) {
      if (!w.grid.buildable(tx, ty) || w.grid.wouldBlockPath([[tx, ty]])) continue;
      w.warden.x = tx + 0.5;
      w.warden.y = ty + 0.5;
      w.gold = 1e6;
      expect(buildTower(w, content.towerByKey.get(key)!.id, tx, ty).ok, key).toBe(true);
      return { w, tx, ty };
    }
  }
  throw new Error('no buildable tile');
}

describe('m20c — the count rule, and §4 as its own evidence', () => {
  it('agrees with §4’s three counts', () => {
    for (const [key, count] of Object.entries(OWNER_COUNTS)) {
      const def = content.towerByKey.get(key)!;
      expect(def.upgrades.count, key).toBe(count);
      expect(familyCount(def.cost), `${key} is off §4's own line`).toBe(count);
    }
  });

  it('is one of a family of divisors that agree, and says which', () => {
    // The honest bound on the claim above (QA): §4's three counts do not pin
    // the divisor, so this pins the *family* instead. If a future edit moves a
    // build cost or a specced count, this turns red before the line silently
    // starts reading a different roster.
    const agrees = (d: number) =>
      Object.entries(OWNER_COUNTS).every(([key, n]) => Math.round(5 - (content.towerByKey.get(key)!.cost - 50) / d) === n);
    const family: number[] = [];
    for (let d = 1; d <= 200; d += 0.5) if (agrees(d)) family.push(d);
    expect(family[0]).toBeCloseTo(28, 10);
    expect(family[family.length - 1]).toBeCloseTo(46.5, 10);
    expect(family).toContain(COUNT_LINE_DIVISOR);
    // And the family really does disagree about the towers §4 left open —
    // which is why the choice inside it is the owner's, not a detail.
    const mortar = content.towerByKey.get('mortar')!.cost;
    const ember = content.towerByKey.get('ember_brazier')!.cost;
    expect(Math.round(5 - (mortar - 50) / 30)).toBe(2);
    expect(Math.round(5 - (ember - 50) / 45)).toBe(5);
    expect(familyCount(mortar)).toBe(3);
    expect(familyCount(ember)).toBe(4);
  });

  it('makes every tower that is off the line say why, and nothing else carry a note', () => {
    // The four towers §4 left open are all off it, and every one is a
    // *measured* exception rather than a preference. Shortening a track under
    // the price rule below is two nerfs at once — the ceiling falls (x2.59 ->
    // x1.46) and each step gets dearer, since the same total buys fewer of
    // them. At the line's count and the rule's price: Ballista alone takes the
    // boss gate's scripted maxbuild run from `victory` to `defeat_warden`, and
    // Ember Brazier, Frost Obelisk and Mortar all drop A4's T1 clause to 0/5.
    // The qualifier is load-bearing and QA had to supply it — Ember Brazier at
    // count 4 and Mortar at 3 pass A4 at the price they charge *today*, which
    // the rule would not let them keep. That is m20e. Q80 has every run.
    const offLine = TOWERS.filter((t) => t.attack && t.upgrades.count !== familyCount(t.cost)).map((t) => t.key);
    expect(offLine).toEqual(['ballista', 'ember_brazier', 'frost_obelisk', 'mortar']);
    for (const key of offLine) expect(content.towerByKey.get(key)!.upgrades.note, key).toBeTruthy();

    // The other side of the same claim: `note` marks a departure, so a tower
    // that follows the line must not carry one, or the field decays into
    // commentary and stops meaning "this one is deliberate".
    const onLine = TOWERS.filter((t) => t.attack && t.upgrades.count === familyCount(t.cost)).map((t) => t.key);
    expect(onLine).toEqual(['arrow_spire', 'tesla_coil', 'venom_spore']);
    for (const key of onLine) expect(content.towerByKey.get(key)!.upgrades.note, key).toBeUndefined();
  });

  it('leaves the three attackless towers outside the rule, each with its reason', () => {
    for (const key of ['palisade', 'beacon_totem', 'harvest_sprout']) {
      const def = content.towerByKey.get(key)!;
      expect(def.attack, key).toBeNull();
      expect(def.upgrades.note, key).toBeTruthy();
    }
    // A wall has no track at all; the two support towers keep V2's count
    // because their per-level effect is linear in level (Q73).
    expect(content.towerByKey.get('palisade')!.upgrades.count).toBe(0);
    expect(content.towerByKey.get('beacon_totem')!.upgrades.count).toBe(2);
    expect(content.towerByKey.get('harvest_sprout')!.upgrades.count).toBe(2);
  });
});

describe('m20c — a whole track costs what V2’s three tiers cost, however many steps it has', () => {
  it('prices all ten towers by the rule, with no exception anywhere', () => {
    expect(FILE.upgradeTotalCostMul).toBeCloseTo(2, 10);
    for (const def of TOWERS) {
      if (def.upgrades.count === 0) {
        expect(def.upgrades.stepCost, def.key).toBe(0);
        continue;
      }
      const want = Math.round((def.cost * FILE.upgradeTotalCostMul) / def.upgrades.count);
      expect(def.upgrades.stepCost, `${def.key} step price`).toBe(want);
      expect(() => validateStepPrice(FILE.upgradeTotalCostMul, def, def.key), def.key).not.toThrow();
    }
  });

  it('refuses a hand-typed price, note or no note', () => {
    const def = content.towerByKey.get('ballista')!;
    const bad = { ...def, upgrades: { ...def.upgrades, stepCost: def.upgrades.stepCost + 1 } };
    expect(() => validateStepPrice(FILE.upgradeTotalCostMul, bad, 'x')).toThrow(/prices a step at 19, not 18/);
    // The count line's `note` is not a licence on the price — Ballista carries
    // one, and its price is still checked. A different price is a different
    // rule, and the rule is one line in `/data`.
    expect(def.upgrades.note).toBeTruthy();
    const wall = content.towerByKey.get('palisade')!;
    expect(() => validateStepPrice(FILE.upgradeTotalCostMul, wall, 'x'), 'no steps, no price').not.toThrow();
    // And the other direction, which `validateUpgradeTrack` does not cover: a
    // price on a track that has no steps to spend it on would load clean.
    expect(() =>
      validateStepPrice(FILE.upgradeTotalCostMul, { ...wall, upgrades: { ...wall.upgrades, stepCost: 99 } }, 'x'),
    ).toThrow(/has no steps/);
  });

  it('charges the authored price through the real till', () => {
    const def = content.towerByKey.get('ballista')!;
    const { w, tx, ty } = place('ballista');
    const before = w.gold;
    expect(upgradeTower(w, tx, ty)).toBe(true);
    // What the till takes is the authored price through the run's cost
    // multiplier — the Engineer's -10% is live in `cfg()`, and the refund
    // ledger m20a pinned depends on the two agreeing.
    expect(upgradeCost(w, def)).toBe(Math.round(def.upgrades.stepCost * w.derived.towerCostMul));
    expect(before - w.gold).toBe(upgradeCost(w, def));
  });
});

describe('m20c — §4’s defense words are three bands, and they are live damage reduction', () => {
  it('draws every tower’s defense from the band table', () => {
    expect(Object.keys(FILE.defenseBands).sort()).toEqual(['low', 'medium', 'none']);
    expect(FILE.defenseBands).toEqual({ none: 0, low: 5, medium: 10 });
    for (const def of TOWERS) {
      expect(() => validateDefense(FILE.defenseBands, def.defense, def.key), def.key).not.toThrow();
    }
    expect(() => validateDefense(FILE.defenseBands, 7, 'x')).toThrow(/no band/);
    expect(() => validateDefense({}, 0, 'x')).toThrow(/no defense bands/);
  });

  it('refuses a misspelt band or defense key instead of dropping it', () => {
    // QA's finding: `.strict()` on the track alone left the asymmetry where
    // `"defence": 10` on a tower, or `"defenceBands"` at the file root, loaded
    // clean and was silently discarded — the tower keeping whatever `defense`
    // it really had. The two new fields are exactly the pair a typo silences,
    // so both levels are closed now.
    const tower = { ...TOWERS[1] } as Record<string, unknown>;
    expect(() => TowerSchema.parse({ ...tower, defence: 10 })).toThrow();
    expect(() => TowerSchema.parse(tower)).not.toThrow();
    expect(() => TowersFileSchema.parse({ ...FILE, defenceBands: {} })).toThrow();
    expect(() => TowersFileSchema.parse(FILE)).not.toThrow();
  });

  it('gives the three §4-specced towers the band their profile names', () => {
    // "medium HP/def" for Arrow and Electric, "medium HP, low def" for Poison.
    expect(content.towerByKey.get('arrow_spire')!.defense).toBe(FILE.defenseBands.medium);
    expect(content.towerByKey.get('tesla_coil')!.defense).toBe(FILE.defenseBands.medium);
    expect(content.towerByKey.get('venom_spore')!.defense).toBe(FILE.defenseBands.low);
  });

  it('uses all three bands, so none of them is decoration', () => {
    const used = new Set(TOWERS.map((t) => t.defense));
    for (const band of Object.values(FILE.defenseBands)) expect(used.has(band), `band ${band}`).toBe(true);
  });

  it('turns a band into real damage reduction on a real structure', () => {
    // The Palisade is `none` on purpose (its toughness is its HP, and V3 §9
    // makes that a pathing cost), so the pair below is the whole claim: a
    // banded tower takes less, a `none` tower takes exactly what it is dealt.
    const cases: [string, number][] = [
      ['ballista', FILE.defenseBands.medium],
      ['mortar', FILE.defenseBands.low],
      ['palisade', FILE.defenseBands.none],
    ];
    for (const [key, band] of cases) {
      const { w, tx, ty } = place(key);
      const s = w.structureAt(tx, ty)!;
      expect(structureArmor(w, s), key).toBeCloseTo(band, 10);
      const hp0 = s.hp;
      damageStructure(w, s, 100);
      expect(hp0 - s.hp, key).toBeCloseTo(100 * damageTakenMul(band), 6);
    }
  });

  it('scales the band with the track, so §4’s "+10% Defense" is not inert', () => {
    // m20a proved the arithmetic against an authored 20; now a shipped tower
    // carries it, which is the difference between a rule and a rule with a
    // caller.
    const def = content.towerByKey.get('ballista')!;
    const { w, tx, ty } = place('ballista');
    const s = w.structureAt(tx, ty)!;
    expect(structureArmor(w, s)).toBeGreaterThan(0);
    for (let step = 1; step <= def.upgrades.count; step++) {
      w.gold = 1e6;
      expect(upgradeTower(w, tx, ty)).toBe(true);
      expect(structureArmor(w, s), `@${step}`).toBeCloseTo(def.defense * FILE.upgradeStepMul ** step, 6);
    }
  });
});
