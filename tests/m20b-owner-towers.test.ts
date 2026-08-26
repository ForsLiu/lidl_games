/**
 * m20b — SPEC-V3 §4's three owner towers and their milestone specials.
 *
 * §4's table is authoritative for Arrow, Electric and Poison: it fixes their
 * profile (pierce, projectile count, damage-type split) and the step each
 * milestone lands on. So this file asserts the authored table first, then
 * drives every special through the real fire loop at the step below it and the
 * step it lands on — the m19a/m19b rule: a clause is not covered until deleting
 * the wiring turns something red, and "the step below" is what proves a
 * milestone is a milestone rather than something the tower always had.
 *
 * Levels versus steps: a built tower is level 1, so a special "at 3" is live at
 * level 4. Both numbers appear below and neither is guessed — `maxLevel` and
 * the authored `at` are read from `/data`.
 */

import { describe, expect, it } from 'vitest';

import { updateProjectiles } from '../src/sim/combat';
import {
  loadContent,
  validateDamageRatio,
  validateSpecial,
  type Content,
  type TowerDef,
} from '../src/sim/content';
import { dotOutstanding, dotStacks, spawnEnemy } from '../src/sim/enemies';
import {
  attackProfile,
  buildTower,
  damageShare,
  effectiveTowerAoe,
  maxLevel,
  towerDamage,
  updateTowers,
  upgradeTower,
} from '../src/sim/towers';
import type { Enemy } from '../src/sim/types';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const DT = 1 / 60;
const content = loadContent();
const ARROW = content.towerByKey.get('arrow_spire')!;
const TESLA = content.towerByKey.get('tesla_coil')!;
const VENOM = content.towerByKey.get('venom_spore')!;

/** A free, buildable tile that will not seal the path. */
function freeTile(w: World): { tx: number; ty: number } {
  for (let ty = 4; ty < 20; ty++) {
    for (let tx = 4; tx < 20; tx++) {
      if (w.grid.buildable(tx, ty) && !w.grid.wouldBlockPath([[tx, ty]])) return { tx, ty };
    }
  }
  throw new Error('no buildable tile');
}

/**
 * A tower of `def` built and then upgraded `steps` times — the state §4's table
 * talks about. Upgrades go through `upgradeTower`, not a written `tier`, so a
 * milestone the upgrade path fails to reach cannot pass here.
 */
function tower(def: TowerDef, steps = 0, c: Content = content) {
  const probe = new World(cfg(), c);
  const { tx, ty } = freeTile(probe);
  const w = new World(cfg(), c);
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
  // Every assertion below compares against what the sim itself says one hit of
  // this tower is worth, so a milestone can never be confused with the +10%.
  const hit = towerDamage(w, s, def.attack!.damage);
  return { w, s, x: tx + 0.5, y: ty + 0.5, hit };
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

/** Fires the tower exactly once and returns each enemy's HP loss. */
function fireOnce(w: World, enemies: Enemy[]): number[] {
  const before = enemies.map((e) => e.hp);
  w.rebuildBuckets();
  updateTowers(w, DT);
  return enemies.map((e, i) => before[i] - e.hp);
}

/* ------------------------------------------------------- §4's authored table */

describe("m20b — the three owner towers carry §4's profile", () => {
  it('Arrow: normal damage, one projectile, no pierce and no splash', () => {
    const a = ARROW.attack!;
    expect(a.damageRatio, 'all Normal, so there is no split to author').toBeUndefined();
    expect(damageShare(attackProfile(ARROW, 1).ratio, 'normal')).toBe(1);
    expect(attackProfile(ARROW, 1).projectiles).toBe(1);
    expect(attackProfile(ARROW, 1).pierce).toBe(0);
    expect(a.aoe ?? 0).toBe(0);
  });

  it('Electric: normal:electric = 1:1', () => {
    const ratio = TESLA.attack!.damageRatio!;
    expect(ratio.normal).toBe(1);
    expect(ratio.electric).toBe(1);
    expect(damageShare(ratio, 'electric')).toBeCloseTo(0.5, 12);
  });

  it('Poison: normal:poison = 1:1 with a small AoE', () => {
    const a = VENOM.attack!;
    expect(a.damageRatio!.normal).toBe(1);
    expect(a.damageRatio!.poison).toBe(1);
    expect(a.aoe!).toBeGreaterThan(0);
    expect(a.aoe!, 'small — it is not the mortar').toBeLessThan(1.8);
  });

  it('pins each milestone to the step §4 lists it at', () => {
    const at = (def: TowerDef) => def.upgrades.specials.map((sp) => `${sp.at}:${sp.key}`);
    expect(at(ARROW)).toEqual(['3:pierce', '4:onHit', '5:projectiles']);
    expect(at(TESLA)).toEqual(['3:electricChain']);
    expect(at(VENOM)).toEqual(['2:projectiles', '4:damageRatio']);
    expect(ARROW.upgrades.specials[1].type, 'Bleeding, by §3 key').toBe('bleeding');
    expect(VENOM.upgrades.specials[1].ratio).toEqual({ normal: 1, poison: 1.5 });
  });

  it('folds a special at its own step and not one earlier', () => {
    for (const def of [ARROW, TESLA, VENOM]) {
      for (const sp of def.upgrades.specials) {
        // Level `at` is `at - 1` steps bought: one short of the milestone.
        const before = attackProfile(def, sp.at);
        const after = attackProfile(def, sp.at + 1);
        expect(JSON.stringify(before), `${def.key} ${sp.key}`).not.toBe(JSON.stringify(after));
      }
      // A track cannot keep paying out past its end.
      expect(attackProfile(def, maxLevel(def) + 99)).toEqual(attackProfile(def, maxLevel(def)));
    }
  });
});

/* ------------------------------------------------------------------- Arrow */

describe('m20b — Arrow: +1 pierce @3, Bleeding @4, +1 projectile @5 (§4)', () => {
  /** Two enemies on one line east of the tower, the far one behind the near. */
  const line = (t: ReturnType<typeof tower>) => [dummy(t.w, t.x + 1.5, t.y), dummy(t.w, t.x + 2.5, t.y)];

  it('hits one enemy at level 1 and carries through to a second at @3', () => {
    const at3 = ARROW.upgrades.specials[0].at;

    const plain = tower(ARROW, at3 - 1);
    const hurt = fireOnce(plain.w, line(plain)).filter((d) => d > 0);
    expect(hurt, 'no free pierce below the milestone').toHaveLength(1);
    expect(hurt[0]).toBeCloseTo(plain.hit, 6);

    const pierced = tower(ARROW, at3);
    expect(attackProfile(ARROW, at3 + 1).pierce).toBe(1);
    const both = fireOnce(pierced.w, line(pierced)).filter((d) => d > 0);
    expect(both, 'the shot carries on through the target').toHaveLength(2);
    expect(both[0] + both[1]).toBeGreaterThan(pierced.hit);
  });

  it('pierces nothing rather than everything when it has no line to fire down', () => {
    // A target standing on the tower's own tile gives `normalize` a zero
    // vector, and every enemy in reach lies on the line (0,0): the pierce
    // would have swept the pile instead of the shot's path.
    const t = tower(ARROW, ARROW.upgrades.specials[0].at);
    const pile = [0, 1, 2, 3, 4].map(() => dummy(t.w, t.x, t.y));
    expect(fireOnce(t.w, pile).filter((d) => d > 0)).toHaveLength(1);
  });

  it('applies exactly one Bleeding per shot at @4, and none at @3', () => {
    const at4 = ARROW.upgrades.specials[1].at;

    const before = tower(ARROW, at4 - 1);
    const e0 = dummy(before.w, before.x + 1.5, before.y);
    fireOnce(before.w, [e0]);
    expect(dotStacks(e0, 'bleeding'), 'not until the milestone').toBe(0);

    const after = tower(ARROW, at4);
    const e1 = dummy(after.w, after.x + 1.5, after.y);
    fireOnce(after.w, [e1]);
    expect(dotStacks(e1, 'bleeding'), 'one application, per §4').toBe(1);
    // §3's row, unmodified: 1 dmg/s for 5 s is what one application owes.
    const row = content.damageTypeByKey.get('bleeding')!;
    expect(dotOutstanding(e1)).toBeCloseTo(row.dps! * row.duration!, 6);
  });

  it('puts a second shot down the same path at @5, doubling a lone target', () => {
    const at5 = ARROW.upgrades.specials[2].at;

    const one = tower(ARROW, at5 - 1);
    const e0 = dummy(one.w, one.x + 1.5, one.y);
    const single = fireOnce(one.w, [e0])[0];
    expect(single).toBeCloseTo(one.hit, 6);

    const two = tower(ARROW, at5);
    // Both levels carry the same stat multiplier — §4 spends both steps on
    // milestones — so this is the projectile count and nothing else.
    expect(two.hit).toBeCloseTo(one.hit, 10);
    const e1 = dummy(two.w, two.x + 1.5, two.y);
    const doubled = fireOnce(two.w, [e1])[0];
    expect(doubled).toBeCloseTo(single * 2, 6);
    expect(dotStacks(e1, 'bleeding'), 'two arrows, two Bleedings').toBe(2);
  });
});

/* ---------------------------------------------------------------- Electric */

describe('m20b — Electric: the 1:1 split, and the chain @3 (§4)', () => {
  it('splits its attack 1:1, with only the electric half landing in an area', () => {
    const t = tower(TESLA, 0);
    // Two enemies within Electric's inherent radius (§3, r0.8) of each other.
    // Which one the tower shoots is "first" targeting's business — whichever it
    // is takes both halves, and the other takes only the half that splashes.
    const pair = [dummy(t.w, t.x + 1.5, t.y), dummy(t.w, t.x + 1.5, t.y + 0.6)];
    const [struck, splashed] = fireOnce(t.w, pair).sort((a, b) => b - a);
    expect(struck, 'both halves land on the target').toBeCloseTo(t.hit, 6);
    expect(splashed, 'only the electric half splashes').toBeCloseTo(t.hit / 2, 6);
  });

  it('arcs the electric half to the nearest other enemy at @3, and not before', () => {
    const at3 = TESLA.upgrades.specials[0].at;
    const pair = (t: ReturnType<typeof tower>) => [
      dummy(t.w, t.x + 1.5, t.y),
      // Beyond Electric's own r0.8 splash, inside the tower's chain range.
      dummy(t.w, t.x + 1.5, t.y + 2),
    ];

    const before = tower(TESLA, at3 - 1);
    const quiet = fireOnce(before.w, pair(before)).sort((a, b) => b - a);
    expect(quiet[0], 'the struck enemy takes the whole attack').toBeCloseTo(before.hit, 6);
    expect(quiet[1], 'no arc below the milestone').toBe(0);

    const after = tower(TESLA, at3);
    const [first, second] = fireOnce(after.w, pair(after)).sort((a, b) => b - a);
    expect(first, 'the struck enemy takes the whole attack').toBeCloseTo(after.hit, 6);
    // "no normal damage in the chain": exactly the electric share travels.
    expect(second).toBeCloseTo(after.hit * damageShare(TESLA.attack!.damageRatio!, 'electric'), 6);
  });

  it('applies the electric half twice to the first when it is alone (§4)', () => {
    const at3 = TESLA.upgrades.specials[0].at;
    const t = tower(TESLA, at3);
    const lone = dummy(t.w, t.x + 1.5, t.y);
    const dealt = fireOnce(t.w, [lone])[0];
    const share = damageShare(TESLA.attack!.damageRatio!, 'electric');
    expect(dealt).toBeCloseTo(t.hit * (1 + share), 6);
  });

  it('fires that second application from where the first came from (review)', () => {
    // A Shellback's front shield reads the *origin* of a hit. The second
    // application is a copy of the first, so it has to arrive from the same
    // place; passing no origin made it bypass the shield and land harder than
    // the attack it copies.
    const at3 = TESLA.upgrades.specials[0].at;
    const shielded = (steps: number) => {
      const t = tower(TESLA, steps);
      const e = dummy(t.w, t.x + 1.5, t.y, 'shellback');
      e.hp = 1e9;
      e.maxHp = 1e9;
      // Facing the tower, so every hit from it is frontal.
      e.fx = -1;
      e.fy = 0;
      return fireOnce(t.w, [e])[0];
    };
    const shieldedHit = shielded(at3 - 1);
    const reduction = 1 - content.enemyByKey.get('shellback')!.frontReduction!;
    const t = tower(TESLA, at3 - 1);
    expect(shieldedHit, 'the shield is really in the way').toBeCloseTo(t.hit * reduction, 6);
    // Same stat multiplier at both levels (§4 spends step 3 on the milestone).
    const share = damageShare(TESLA.attack!.damageRatio!, 'electric');
    expect(shielded(at3)).toBeCloseTo(shieldedHit * (1 + share), 6);
  });
});

/* ------------------------------------------------------------------ Poison */

describe('m20b — Poison: the 1:1 split, +1 projectile @2, ratio 1:1.5 @4 (§4)', () => {
  const poisonRow = content.damageTypeByKey.get('poison')!;

  /** What §3's Poison row owes for a hit that put `share` of the attack in. */
  const owed = (hit: number, share: number) => hit * share * poisonRow.ratio!;

  it('states its poison as a share of the attack, not a second constant', () => {
    // V2 gave the tower a second constant (`attack.poison`: its own dps,
    // duration and stack cap) that no upgrade step touched. m20b deleted the
    // shape, so the loader would now drop an authored one on the floor.
    expect('poison' in (VENOM.attack as object), 'the V2 shape is gone').toBe(false);
    const t = tower(VENOM, 0);
    const e = dummy(t.w, t.x + 1.5, t.y);
    const direct = fireOnce(t.w, [e])[0];
    const share = damageShare(VENOM.attack!.damageRatio!, 'poison');
    expect(direct, 'the normal half lands now').toBeCloseTo(t.hit * (1 - share), 6);
    expect(dotOutstanding(e), 'the poison half is 120% of itself over 3 s').toBeCloseTo(
      owed(t.hit, share),
      6,
    );
  });

  it('scales that poison with the upgrade step, through the attack itself', () => {
    // The DoT is a share of the attack now, so +10% Attack is +10% DoT with no
    // second wiring to forget — this is what m20a asserted on `attack.poison`.
    const base = tower(VENOM, 0);
    const e0 = dummy(base.w, base.x + 1.5, base.y);
    fireOnce(base.w, [e0]);
    const stepped = tower(VENOM, 1);
    const e1 = dummy(stepped.w, stepped.x + 1.5, stepped.y);
    fireOnce(stepped.w, [e1]);
    const step = content.towers.upgradeStepMul;
    expect(stepped.hit).toBeCloseTo(base.hit * step, 6);
    expect(dotOutstanding(e1)).toBeCloseTo(dotOutstanding(e0) * step, 6);
  });

  it('fires a second spore at @2, at a second enemy', () => {
    const at2 = VENOM.upgrades.specials[0].at;
    // Two lanes, each well outside the other's splash.
    const pair = (t: ReturnType<typeof tower>) => [dummy(t.w, t.x + 2, t.y), dummy(t.w, t.x, t.y + 2)];

    const one = tower(VENOM, at2 - 1);
    expect(fireOnce(one.w, pair(one)).filter((d) => d > 0)).toHaveLength(1);

    const two = tower(VENOM, at2);
    expect(attackProfile(VENOM, at2 + 1).projectiles).toBe(2);
    const both = fireOnce(two.w, pair(two));
    expect(both.filter((d) => d > 0), 'one spore each').toHaveLength(2);
    for (const d of both) expect(d).toBeCloseTo(two.hit * 0.5, 6);
  });

  it('bursts its small AoE on whoever is standing with the target', () => {
    // Found by review: the splash shipped with no test at all — every other
    // venom case here is a lone target or a pair placed deliberately outside
    // each other's radius, so deleting the blast left the suite green.
    // Both pairs are symmetric — whichever enemy "first" targeting picks, the
    // other is the same distance from it — so the assertions do not depend on
    // which one the tower aimed at.
    const impactOf = (t: ReturnType<typeof tower>) =>
      t.hit * (1 - damageShare(VENOM.attack!.damageRatio!, 'poison'));

    const near = tower(VENOM, 0);
    const pair = [dummy(near.w, near.x + 1.5, near.y), dummy(near.w, near.x + 1.5, near.y + 0.6)];
    const both = fireOnce(near.w, pair);
    // Under `aoeFullTargets` the blast pays every body inside it in full.
    expect(both[0], 'the target takes the full spore').toBeCloseTo(impactOf(near), 6);
    expect(both[1], 'and so does whoever is standing with it').toBeCloseTo(impactOf(near), 6);
    expect(dotOutstanding(pair[0]), 'the poison half splashes too').toBeGreaterThan(0);
    expect(dotOutstanding(pair[1])).toBeCloseTo(dotOutstanding(pair[0]), 6);

    const far = tower(VENOM, 0);
    const apart = [dummy(far.w, far.x + 1.5, far.y), dummy(far.w, far.x + 1.5, far.y + 2.5)];
    expect(fireOnce(far.w, apart).filter((d) => d > 0), 'and nobody outside the radius').toHaveLength(1);
    // The radius the sim burst for is the one the panel draws (T1).
    expect(effectiveTowerAoe(far.w, VENOM)).toBeCloseTo(VENOM.attack!.aoe!, 10);
  });

  // TODO(m20d): QA filed the milestone as a paid no-op against a single enemy —
  // the spare spore is dropped rather than aimed at the target again, so @2 is
  // worth nothing against a lone Gatebreaker or the boss, on a step that also
  // gave up its +10% to be a milestone. Implemented, it flips A4's
  // "venom_spore alone fails Act I at T3" from 0/5 to 5/5, so it cannot ship
  // without re-pricing the tower — m20c/m20d's job with owner sign-off (Q79).
  // Left here, red-when-enabled, so the gap is visible rather than remembered.
  it.skip('still fires that second spore when there is only one enemy to fire it at', () => {
    const at2 = VENOM.upgrades.specials[0].at;
    const one = tower(VENOM, at2 - 1);
    const lone0 = dummy(one.w, one.x + 1.5, one.y);
    const before = fireOnce(one.w, [lone0])[0];

    const two = tower(VENOM, at2);
    const lone1 = dummy(two.w, two.x + 1.5, two.y);
    const after = fireOnce(two.w, [lone1])[0];
    expect(after, 'both spores land on the only target there is').toBeCloseTo(before * 2, 6);
    expect(dotOutstanding(lone1)).toBeCloseTo(dotOutstanding(lone0) * 2, 6);
  });

  it('is worth nothing at @2 against a lone target — the wart, pinned (QA)', () => {
    // The complement of the skipped case above: this is what ships, and it is
    // asserted so that fixing it turns *this* red rather than passing silently.
    const at2 = VENOM.upgrades.specials[0].at;
    const one = tower(VENOM, at2 - 1);
    const before = fireOnce(one.w, [dummy(one.w, one.x + 1.5, one.y)])[0];
    const two = tower(VENOM, at2);
    const after = fireOnce(two.w, [dummy(two.w, two.x + 1.5, two.y)])[0];
    expect(two.hit, 'and the step bought no +10% either').toBeCloseTo(one.hit, 10);
    expect(after).toBeCloseTo(before, 6);
  });

  it('moves its split to 1:1.5 at @4 — less impact, more poison', () => {
    const at4 = VENOM.upgrades.specials[1].at;

    const before = tower(VENOM, at4 - 1);
    const e0 = dummy(before.w, before.x + 1.5, before.y);
    const impact0 = fireOnce(before.w, [e0])[0];

    const after = tower(VENOM, at4);
    const e1 = dummy(after.w, after.x + 1.5, after.y);
    const impact1 = fireOnce(after.w, [e1])[0];

    // Both levels carry the same stat multiplier (§4 spends step 4 on the
    // milestone) and both fire the same two spores at the lone target, so every
    // difference below is the ratio.
    expect(after.hit).toBeCloseTo(before.hit, 10);
    expect(damageShare(attackProfile(VENOM, at4 + 1).ratio, 'poison')).toBeCloseTo(1.5 / 2.5, 12);
    expect(impact0).toBeCloseTo(before.hit * 0.5, 6);
    expect(impact1).toBeCloseTo(after.hit * 0.4, 6);
    expect(dotOutstanding(e0)).toBeCloseTo(owed(before.hit, 0.5), 6);
    expect(dotOutstanding(e1)).toBeCloseTo(owed(after.hit, 0.6), 6);
    expect(dotOutstanding(e1)).toBeGreaterThan(dotOutstanding(e0));
  });
});

/* ------------------------------------------------- the seam, and the loader */

describe('m20b — a composite split survives every shape a tower can fire', () => {
  it('reaches the enemy from all seven kinds', () => {
    // m19c's QA lesson one layer down: the split rides in the same bundle as
    // `onHit`, and a `kind` that dropped it would silently deal pure Normal.
    // Poison is the probe because a stack is unmistakable evidence it landed.
    const byKind = new Map<string, string>();
    for (const t of content.towers.towers) {
      if (t.attack && !byKind.has(t.attack.kind)) byKind.set(t.attack.kind, t.key);
    }
    expect([...byKind.keys()].sort()).toEqual([
      'aura',
      'chain',
      'cone',
      'lob',
      'pierce',
      'poison',
      'single',
    ]);

    for (const [kind, key] of byKind) {
      const def = content.towerByKey.get(key)!;
      const authored: TowerDef = {
        ...def,
        upgrades: { ...def.upgrades, specials: [] },
        attack: { ...def.attack!, damageRatio: { normal: 1, poison: 1 } },
      };
      const towers = content.towers.towers.map((t) => (t.key === key ? authored : t));
      const c: Content = {
        ...content,
        towers: { ...content.towers, towers },
        towerByKey: new Map(towers.map((t) => [t.key, t])),
        towerById: new Map(towers.map((t) => [t.id, t])),
      };
      const t = tower(authored, 0, c);
      // Outside the mortar's dead zone and inside every tower's range.
      const gap = Math.max((authored.attack!.minRange ?? 0) + 1, 2);
      const e = dummy(t.w, t.x, t.y - gap);
      for (let i = 0; i < 600 && dotStacks(e, 'poison') === 0; i++) {
        t.w.rebuildBuckets();
        updateTowers(t.w, DT);
        updateProjectiles(t.w, DT);
      }
      expect(kind + ':' + (dotStacks(e, 'poison') > 0)).toBe(kind + ':true');
    }
  });
});

describe('m20b — the loader refuses a special it cannot pay out', () => {
  const types = content.damageTypes;
  const coil = { kind: 'chain', damageRatio: { normal: 1, electric: 1 } };
  const spire = { kind: 'single' };

  it('demands whatever the key needs alongside it', () => {
    const bad = (sp: Record<string, unknown>, re: RegExp, a: object = coil) =>
      expect(() => validateSpecial(types, sp as never, a as never, 'x')).toThrow(re);
    bad({ key: 'pierce' }, /needs a value/, spire);
    bad({ key: 'projectiles' }, /needs a value/, spire);
    bad({ key: 'onHit' }, /needs a type/);
    bad({ key: 'onHit', type: 'electric' }, /no flat dps/);
    bad({ key: 'onHit', type: 'nonsense' }, /unknown damage type/);
    bad({ key: 'damageRatio' }, /needs a ratio/);
    bad({ key: 'damageRatio', ratio: { sparkle: 1 } }, /unknown type/);
    bad({ key: 'nonsense' }, /not a special the engine pays out/);
    expect(() => validateSpecial(types, { key: 'pierce', value: 1 }, null, 'x')).toThrow(/no attack/);
  });

  it('refuses a special the attack shape has no way to read', () => {
    // `fireTower`'s cone, aura and chain cases have no line and no shot count,
    // so a track pinning either key to one of them would load clean and grant
    // nothing — and m20c authors those four towers' tracks next.
    const bad = (sp: Record<string, unknown>, kind: string) =>
      expect(() => validateSpecial(types, sp as never, { kind } as never, 'x')).toThrow(/does nothing/);
    bad({ key: 'pierce', value: 1 }, 'lob');
    bad({ key: 'pierce', value: 1 }, 'poison');
    bad({ key: 'projectiles', value: 1 }, 'cone');
    bad({ key: 'projectiles', value: 1 }, 'aura');
    bad({ key: 'projectiles', value: 1 }, 'chain');
    for (const kind of ['single', 'pierce']) {
      expect(() => validateSpecial(types, { key: 'pierce', value: 1 }, { kind }, 'x')).not.toThrow();
    }
    for (const kind of ['single', 'pierce', 'poison']) {
      expect(() => validateSpecial(types, { key: 'projectiles', value: 1 }, { kind }, 'x')).not.toThrow();
    }
    // Every shipped track still loads: the rule is a floor, not a new veto.
    for (const def of content.towers.towers) {
      for (const sp of def.upgrades.specials) {
        expect(() => validateSpecial(types, sp, def.attack, def.key)).not.toThrow();
      }
    }
  });

  it('refuses an electric chain on a tower with no electric portion', () => {
    expect(() => validateSpecial(types, { key: 'electricChain' }, coil, 'x')).not.toThrow();
    expect(() => validateSpecial(types, { key: 'electricChain' }, { kind: 'chain' }, 'x')).toThrow(
      /needs an attack with an electric share/,
    );
    expect(() =>
      validateSpecial(types, { key: 'electricChain' }, { kind: 'chain', damageRatio: { normal: 1 } }, 'x'),
    ).toThrow(/needs an attack with an electric share/);
  });

  it('refuses a split that would quietly deal less than the attack says', () => {
    expect(() => validateDamageRatio(types, { normal: 1, electric: 1 }, 'x')).not.toThrow();
    expect(() => validateDamageRatio(types, { normal: 1, frost: 1 }, 'x')).toThrow(/unknown type/);
    expect(() => validateDamageRatio(types, { normal: -1 }, 'x')).toThrow(/negative share/);
    expect(() => validateDamageRatio(types, { normal: 0 }, 'x')).toThrow(/totals nothing/);
    expect(() => validateDamageRatio(types, {}, 'x')).toThrow(/totals nothing/);
  });
});
