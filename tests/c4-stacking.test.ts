/**
 * Gate C4 (SPEC-V3 §12): "two 10%/20% same-stat sources from different origins
 * produce exactly ×1.32."
 *
 * SPEC-V3 §2's rule in full: "all boosts from different sources multiply
 * (10% + 20% atk speed → ×1.1×1.2). Same-source ranks add within the source,
 * then multiply out."
 *
 * v0.2 summed everything into one number, so this is not a tuning change — it
 * re-prices every percentage in `/data` at once (QUESTIONS Q40, Q59). What the
 * tests below pin is the *rule*, never an authored number.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { STAT_KEYS, STAT_KIND, Stats, derive, emptyStats, type StatKey } from '../src/sim/stats';
import { loadContent } from '../src/sim/content';
import { World } from '../src/sim/world';
import { Run, hashWorld } from '../src/sim/run';
import { applyOffer } from '../src/sim/progression';
import { killEnemy, spawnEnemy, updateEnemies } from '../src/sim/enemies';
import { applyTerrainPassives } from '../src/sim/weapons';
import { attackSpeedFor, buildTower, collectSproutGold } from '../src/sim/towers';
import { enemyInfoMarkup } from '../src/ui/hud';
import { emptyInput } from '../src/sim/types';
import { cfg } from './helpers';

const content = loadContent();

function derivedFrom(build: (s: Stats) => void) {
  const s = emptyStats();
  build(s);
  return derive(content, s);
}

describe('C4 — sources multiply', () => {
  it('two 10%/20% sources of the same stat give exactly ×1.32', () => {
    const d = derivedFrom((s) => {
      s.add('tree:1', 'attackSpeed', 0.1);
      s.add('relic:7', 'attackSpeed', 0.2);
    });
    expect(d.attackSpeedMul).toBeCloseTo(1.32, 12);
    // The old additive model gave 1.30. Named so a revert cannot pass.
    expect(d.attackSpeedMul).not.toBeCloseTo(1.3, 4);
  });

  it('holds for every multiplicative stat, not just attack speed', () => {
    const muls = STAT_KEYS.filter((k) => STAT_KIND[k] === 'mul');
    expect(muls.length).toBeGreaterThan(10);
    for (const stat of muls) {
      const s = emptyStats();
      s.add('a', stat, 0.1);
      s.add('b', stat, 0.2);
      expect(s.factor(stat), stat).toBeCloseTo(1.32, 12);
    }
  });

  it('compounds across many sources', () => {
    // MIGRATION §4.4's worked example: six +10% sources were ×1.60, now ×1.771561.
    const s = emptyStats();
    for (let i = 0; i < 6; i++) s.add('src' + i, 'power', 0.1);
    expect(s.factor('power')).toBeCloseTo(1.1 ** 6, 12);
    expect(s.total('power')).toBeCloseTo(0.6, 12);
  });

  it('a single source behaves exactly as before', () => {
    const s = emptyStats();
    s.add('only', 'power', 0.25);
    expect(s.factor('power')).toBeCloseTo(1.25, 12);
  });

  it('no sources is ×1, not ×0', () => {
    expect(emptyStats().factor('power')).toBe(1);
  });
});

describe('C4 — ranks add within a source', () => {
  it('three ranks of one source add before multiplying', () => {
    const s = emptyStats();
    s.add('boon:plating', 'power', 0.1);
    s.add('boon:plating', 'power', 0.1);
    s.add('boon:plating', 'power', 0.1);
    expect(s.factor('power')).toBeCloseTo(1.3, 12);
  });

  it('ranks add, then the source multiplies out against another', () => {
    const s = emptyStats();
    s.add('boon:might', 'power', 0.1);
    s.add('boon:might', 'power', 0.1);
    s.add('tree:9', 'power', 0.2);
    // (1 + 0.1 + 0.1) x (1 + 0.2) = 1.44 — not 1.40 (all additive) and not
    // 1.1 x 1.1 x 1.2 = 1.452 (every rank its own source).
    expect(s.factor('power')).toBeCloseTo(1.44, 12);
  });

  it('a boon taken to rank 3 through the real progression path is one source', () => {
    const w = new World(cfg());
    const boon = content.boons.statBoons.find((b) => b.stat === 'power')!;
    for (let rank = 1; rank <= 3; rank++) {
      applyOffer(w, { kind: 'boon', key: boon.key, name: boon.name, desc: '', toLevel: rank });
    }
    expect(w.boonRanks[boon.key]).toBe(3);
    expect(w.stats.contributions('power')).toEqual([['boon:' + boon.key, boon.perRank * 3]]);
    expect(w.derived.powerMul).toBeCloseTo(1 + boon.perRank * 3, 12);
  });
});

describe('C4 — flat stats still add', () => {
  it('armour points add rather than multiply', () => {
    const d = derivedFrom((s) => {
      s.add('tree:1', 'armor', 10);
      s.add('tree:2', 'armor', 20);
    });
    expect(d.armor).toBe(30);
  });

  it('dash charges are a count, not a multiplier', () => {
    const d = derivedFrom((s) => {
      s.add('a', 'dashCharges', 1);
      s.add('b', 'dashCharges', 1);
    });
    expect(d.dashCharges).toBe(3);
  });

  it('every stat is classified', () => {
    for (const k of STAT_KEYS) expect(STAT_KIND[k], k).toMatch(/^(flat|mul)$/);
    expect(Object.keys(STAT_KIND).sort()).toEqual([...STAT_KEYS].sort());
  });

  it('classifies as `mul` exactly the stats derive() reads with factor()', () => {
    // The trap: add a stat, classify it `flat`, then read it with factor() (or
    // the reverse). Both compile, and the stat silently stacks the wrong way.
    const src = readFileSync('src/sim/stats.ts', 'utf8');
    const body = src.slice(src.indexOf('export function derive('));
    let checked = 0;
    for (const k of STAT_KEYS) {
      const usesFactor = body.includes("factor('" + k + "')");
      const usesTotal = body.includes("total('" + k + "')");
      if (!usesFactor && !usesTotal) continue;
      checked++;
      expect(usesFactor, k + ' is ' + STAT_KIND[k] + ' but derive() reads it the other way').toBe(
        STAT_KIND[k] === 'mul',
      );
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('holds outside derive() too — no `mul` stat is read with total() anywhere', () => {
    // `derive()` is not the only reader: `coreHp` (world.ts) is pulled straight
    // off `Stats`, and the scan above stops at derive()'s closing brace.
    const files = [
      'src/sim/stats.ts',
      'src/sim/world.ts',
      'src/sim/progression.ts',
      'src/sim/weapons.ts',
    ];
    const src = files.map((f) => readFileSync(f, 'utf8')).join('\n');
    for (const k of STAT_KEYS) {
      if (STAT_KIND[k] === 'mul') {
        expect(src.includes("total('" + k + "')"), `${k} is mul but is read with total()`).toBe(
          false,
        );
      } else {
        expect(src.includes("factor('" + k + "')"), `${k} is flat but is read with factor()`).toBe(
          false,
        );
      }
    }
  });
});

describe('C4 — the product is deterministic (gate A11)', () => {
  it('does not depend on the order sources were added', () => {
    const a = emptyStats();
    a.add('zeta', 'power', 0.07);
    a.add('alpha', 'power', 0.13);
    a.add('mid', 'power', 0.29);
    const b = emptyStats();
    b.add('mid', 'power', 0.29);
    b.add('zeta', 'power', 0.07);
    b.add('alpha', 'power', 0.13);
    // Float multiplication is not associative, so this must be bit-identical
    // rather than merely close: gate A11 hashes what comes out of here.
    expect(a.factor('power')).toBe(b.factor('power'));
  });

  it('two identical builds derive identical numbers', () => {
    // Nodes 41/47/48 all grant `power`, so this actually exercises `factor()`'s
    // sort. Picking nodes that grant *different* stats (the first version of this
    // test used 1/2/3 — towerDamage, beaconRadius, towerCost) leaves one source
    // per stat and can never fail, whatever the iteration order.
    const one = new World(cfg({ allocated: [41, 47, 48] }));
    const two = new World(cfg({ allocated: [48, 41, 47] }));
    expect(one.stats.contributions('power')).toHaveLength(3);
    expect(one.derived).toEqual(two.derived);
  });

  it('`total()` is order-independent too, not just `factor()` (Q63)', () => {
    // Float addition is no more associative than multiplication, and `leech` feeds
    // `warden.hp`, which `hashWorld` hashes. 0.1/0.2/0.3 is the smallest set that
    // actually shows it: summed ascending it is 0.60000000000000008882, summed
    // descending 0.59999999999999997780. Six equal 0.003 tree nodes — the obvious
    // choice — cannot fail this however the sum is ordered.
    const asc = emptyStats();
    asc.add('a', 'leech', 0.1);
    asc.add('b', 'leech', 0.2);
    asc.add('c', 'leech', 0.3);
    const desc = emptyStats();
    desc.add('c', 'leech', 0.3);
    desc.add('b', 'leech', 0.2);
    desc.add('a', 'leech', 0.1);
    expect(asc.total('leech')).toBe(desc.total('leech'));
    // Bit-exact, not close: sorted key order means both take the ascending sum.
    expect(desc.total('leech')).toBe(0.1 + 0.2 + 0.3);
  });

  it('the same holds through a real build (Q63)', () => {
    const ids = [44, 51, 53, 66, 72, 77]; // every tree node granting leech
    const a = new World(cfg({ allocated: ids }));
    const b = new World(cfg({ allocated: [...ids].reverse() }));
    expect(a.stats.contributions('leech')).toHaveLength(6);
    expect(a.derived.leech).toBe(b.derived.leech);
  });

  it('a zero contribution is not recorded, but one that sums back to zero is', () => {
    const s = emptyStats();
    s.add('nothing', 'power', 0);
    expect(s.contributions('power')).toEqual([]);
    s.add('cancels', 'power', 0.1);
    s.add('cancels', 'power', -0.1);
    expect(s.contributions('power')).toEqual([['cancels', 0]]);
    expect(s.factor('power')).toBe(1);
  });
});

describe('C4 — the real stat pipeline carries sources', () => {
  it('each Constellation node is its own source (Q61)', () => {
    const nodes = content.tree.nodes.filter((n) => n.stats.power).slice(0, 2);
    expect(nodes).toHaveLength(2);
    const w = new World(cfg({ allocated: nodes.map((n) => n.id) }));
    expect(w.stats.contributions('power').map((c) => c[0])).toEqual(
      nodes.map((n) => 'tree:' + n.id).sort(),
    );
    const expected = nodes.reduce((f, n) => f * (1 + (n.stats.power as number)), 1);
    expect(w.derived.powerMul).toBeCloseTo(expected, 12);
    // ...and not the additive answer.
    const additive = 1 + nodes.reduce((sum, n) => sum + (n.stats.power as number), 0);
    expect(w.derived.powerMul).toBeGreaterThan(additive);
  });

  it('the class is a source distinct from the tree', () => {
    const w = new World(cfg());
    // SPEC-FINAL §4.2's class shape: the Engineer's stat line lives on
    // `passive.mods` and is sourced per slot (`class:<key>:passive`, p6a)
    // rather than on one flat `class:<key>`. The claim under test is
    // unchanged: whatever the class grants is its own source, never merged
    // into the tree's.
    const cls = content.classByKey.get('engineer')!;
    const stat = Object.keys(cls.passive.mods).find(
      (k) => (STAT_KEYS as readonly string[]).includes(k) && STAT_KIND[k as StatKey] === 'mul',
    ) as StatKey | undefined;
    expect(stat, 'the engineer should grant at least one multiplicative stat').toBeTruthy();
    expect(w.stats.contributions(stat!)[0][0]).toBe('class:engineer:passive');
  });

  it('petrified terrain is one source however many Sunderings ran', () => {
    // Drives the real `applyTerrainPassives`, not `Stats.add` by hand: the Q61
    // decision lives in weapons.ts, and hand-adding to a 'terrain' key here would
    // only re-test rank merging while leaving that source id free to collide.
    // Flat arena: fb077 generates terrain for every non-practice run, and the
    // 2026-09-04 merged generator put unbuildable ground under these fixed
    // tiles on seed 1. This case is about the stat pipeline, not the map.
    const w = new World(cfg({ practice: true }));
    w.warden.x = 6.5;
    w.warden.y = 6.5;
    buildTower(w, 1, 5, 5); // palisade -> terrain armour
    buildTower(w, 9, 6, 5); // beacon totem -> terrain attack speed
    const boon = content.boons.statBoons.find((b) => b.stat === 'attackSpeed');
    if (boon) applyOffer(w, { kind: 'boon', key: boon.key, name: boon.name, desc: '', toLevel: 1 });

    applyTerrainPassives(w);
    const afterOne = w.stats.contributions('attackSpeed').find((c) => c[0] === 'terrain')![1];
    expect(afterOne).toBeGreaterThan(0);
    applyTerrainPassives(w);

    const terrain = w.stats.contributions('attackSpeed').filter((c) => c[0] === 'terrain');
    expect(terrain).toHaveLength(1);
    expect(terrain[0][1]).toBeCloseTo(afterOne * 2, 12);
    expect(w.stats.contributions('armor').filter((c) => c[0] === 'terrain')).toHaveLength(1);

    if (boon) {
      // ...and the terrain source multiplies against the boon rather than
      // collapsing into it.
      const names = w.stats.contributions('attackSpeed').map((c) => c[0]);
      expect(names).toContain(`boon:${boon.key}`);
      expect(w.derived.attackSpeedMul).toBeCloseTo(
        (1 + terrain[0][1]) * (1 + boon.perRank),
        12,
      );
    }
  });
});

/**
 * The half of m19b that types cannot protect.
 *
 * `derive()` now hands out finished multipliers, so a consumer that still writes
 * `1 + x` compiles, runs, and is wrong by a whole factor of one. Six of the eight
 * rebased call sites had no test that could tell the difference — code review
 * found `meta.ts`'s two, `enemies.ts`'s chilled contact and `loot.ts`'s relic
 * find provably revertible with all 479 tests green.
 *
 * Each test below pins the **exact** number its consumer produces, and names the
 * two wrong answers: the pre-m19b additive model, and the `1 + x` double-apply.
 * Sources are 0.5/0.6 (x2.4) rather than C4's 0.1/0.2 (x1.32) precisely so the
 * three answers stay distinct after rounding.
 */
describe('C4 — every rebased consumer reads a finished multiplier', () => {
  function boosted(stat: StatKey, a = 0.5, b = 0.6): World {
    const w = new World(cfg());
    w.stats.add('src:a', stat, a);
    w.stats.add('src:b', stat, b);
    w.recomputeDerived();
    return w;
  }

  it('killEnemy pays bounty x goldFind (enemies.ts)', () => {
    const w = boosted('goldFind');
    expect(w.derived.goldFindMul).toBeCloseTo(2.4, 12);
    const def = content.enemyByKey.get('husk')!;
    expect(def.bounty).toBe(4);
    const e = spawnEnemy(w, 'husk', 10, 10)!;
    const before = w.gold;
    killEnemy(w, e, 'test');
    // 4 x 2.4 = 9.6 -> 10. Additive (x2.1) -> 8. Double-applied (x3.4) -> 14.
    expect(w.gold - before).toBe(10);
  });

  it('the HUD quotes the same number killEnemy actually pays (hud.ts)', () => {
    const w = boosted('goldFind');
    const e = spawnEnemy(w, 'husk', 10, 10)!;
    const quoted = enemyInfoMarkup(w, e);
    const before = w.gold;
    killEnemy(w, e, 'test');
    // The two formulas live in different files and can drift apart silently.
    expect(quoted).toContain(`${w.gold - before}g`);
  });

  it('the wave-clear bonus scales by goldFind (run.ts)', () => {
    const run = new Run(cfg());
    const w = run.world;
    w.stats.add('src:a', 'goldFind', 0.5);
    w.stats.add('src:b', 'goldFind', 0.6);
    w.recomputeDerived();
    // Empty the field at a wave boundary so the real Run.step -> completeWave
    // transition fires and gold moves for exactly one reason.
    w.phase = 'act1_wave';
    w.wave = 3;
    w.spawnQueue = [];
    w.enemies = [];
    const before = w.gold;
    run.step(emptyInput());
    // fb009: waveClearBase is now 20 (was 50). (20 + 10x3) x 2.4 = 120.
    // Additive -> 105. Double-applied -> 170.
    expect(w.gold - before).toBe(120);
  });

  // RETIRED (p7d, §8): `emberFor`'s emberFind/modRewardBonus scaling and
  // `handleKillDrops`'s relicFind scaling tested `src/meta/meta.ts`'s
  // `emberFor` and `src/sim/loot.ts`, both deleted along with the Ember
  // economy and the relic drop pipeline. `modRewardBonus` (Cartographer)
  // itself is not deleted — see QUESTIONS.md's p7d entry — it is simply
  // inert until a live consumer exists again.

  it('a chilled enemy hits for coreDamage x chilledDamageTaken (enemies.ts)', () => {
    const def = content.enemyByKey.get('husk')!;
    expect(def.coreDamage).toBe(5);
    for (const chilled of [false, true]) {
      // -25% and -50% from two sources: x0.75 x 0.5 = x0.375.
      const w = boosted('chilledDamageTaken', -0.25, -0.5);
      expect(w.derived.chilledDamageTakenMul).toBeCloseTo(0.375, 12);
      w.phase = 'act2';
      const e = spawnEnemy(w, 'husk', w.warden.x, w.warden.y)!;
      e.attackCooldown = 0;
      if (chilled) e.slowRemaining = 5;
      const hp = w.warden.hp;
      updateEnemies(w, 1 / 60);
      // 5 x 0.375 = 1.875. Additive (x0.25) -> 1.25. Double-applied (x1.375) -> 6.875.
      expect(hp - w.warden.hp).toBeCloseTo(chilled ? 1.875 : 5, 10);
    }
  });

  it('sprout gold scales by goldFind (towers.ts)', () => {
    const w = boosted('goldFind');
    w.warden.x = 5.5;
    w.warden.y = 5.5;
    buildTower(w, 10, 5, 5); // Harvest Sprout
    const before = w.gold;
    const paid = collectSproutGold(w);
    expect(w.gold - before).toBe(paid);
    // The unboosted board pays 5 (tests/act1.test.ts), so x2.4 -> 12.
    expect(paid).toBe(12);
  });
});

describe('C4 — origins that are not the boon/tree/equipment stack (QA bugs 1, 3, 5, 6)', () => {
  // p7d retired relics; equipment is the commonest way a player holds two
  // same-stat sources now, and Q61's granularity rule reads the same way —
  // one equipped item is one source (`equipment:<key>`) — but the headline
  // C4 test writes a source id onto a bare `Stats` by hand, so collapsing
  // the real key to a constant would leave the whole suite green.
  it('two equipped items are two sources, not one (QA bug 1)', () => {
    // `normal_necklace` (xpGain 0.2, towerCost -0.2) has no goldFind, so pick
    // two items that both carry it — none do in the shipped 12-item table, so
    // this reaches through `w.stats.add` the same way the equipment mod
    // pipeline itself would (`baseRunStats`'s `s.addAll('equipment:<key>', ...)`),
    // one source id per item.
    const w = new World(cfg());
    w.stats.add('equipment:ring_a', 'goldFind', 0.1);
    w.stats.add('equipment:ring_b', 'goldFind', 0.2);
    w.recomputeDerived();
    const names = w.stats.contributions('goldFind').map((c) => c[0]);
    expect(names).toContain('equipment:ring_a');
    expect(names).toContain('equipment:ring_b');
    // Gate C4's own numbers, reached through the real Stats aggregation.
    expect(w.derived.goldFindMul).toBeCloseTo(1.32, 12);
    expect(w.derived.goldFindMul).not.toBeCloseTo(1.3, 4);
  });

  it('one equipped item is one source spanning every stat it grants (Q61)', () => {
    // `normal_shoes` grants maxHp and armor in one mods bag (its third stat,
    // moveSpeedPct, is skipped here — `cfg()`'s default engineer class also
    // grants that one, via `class:engineer:bands`) — both must trace back to
    // the same `equipment:normal_shoes` source.
    const w = new World(cfg({ equipment: ['normal_shoes'] }));
    for (const stat of ['maxHp', 'armor'] as const) {
      const names = w.stats.contributions(stat).map((c) => c[0]);
      expect(names, stat).toEqual(['equipment:normal_shoes']);
    }
  });

  it('shrine haste multiplies the Warden stack rather than adding into it (QA bug 3)', () => {
    // p2e removed `intervalFor` (weapons.ts) along with the soul-weapon fire
    // loop it belonged to; the rule it enforced — a shrine is a separate
    // multiplicative origin from the boon/tree/relic stack, same as a tower
    // buff aura (see `attackSpeedFor`, towers.ts) — is asserted directly
    // against the raw numbers instead. Q102 ORDER (`vswield.ts`'s
    // `updateWieldedAttacks`) re-wired a real reader onto the same formula;
    // see `tests/p2b-wielded-fire.test.ts`'s own Q102 case for that reader's
    // regression test.
    const w = new World(cfg());
    w.stats.add('boon:haste', 'attackSpeed', 0.4);
    w.recomputeDerived();
    expect(w.derived.attackSpeedMul).toBeCloseTo(1.4, 12);
    w.shrineHaste = 0.15;
    const effective = w.derived.attackSpeedMul * (1 + w.shrineHaste);
    // 1.4 x 1.15 = 1.61. The additive answer was 1.55.
    expect(effective).toBeCloseTo(1.61, 12);
    expect(effective).not.toBeCloseTo(1.55, 6);
  });

  it('tower buff auras multiply the tower stack too (QA bug 3)', () => {
    const w = new World(cfg());
    w.stats.add('boon:haste', 'attackSpeed', 0.4);
    w.recomputeDerived();
    w.warden.x = 5.5;
    w.warden.y = 5.5;
    buildTower(w, 1, 5, 5);
    const s = w.structureAt(5, 5)!;
    expect(attackSpeedFor(w, s)).toBeCloseTo(1.4, 12);
    w.auraBonus.set(s.id, 0.2);
    // 1.4 x 1.2 = 1.68, not 1.60.
    expect(attackSpeedFor(w, s)).toBeCloseTo(1.68, 12);
  });

  it('a non-finite contribution cannot reach derive() (QA bug 5)', () => {
    // Math.max(0.25, NaN) is NaN, so the existing clamps do not stop this; a NaN
    // maxHp makes the Warden unkillable exactly as m19a's NaN armour did.
    for (const bad of [NaN, Infinity, -Infinity]) {
      const s = emptyStats();
      for (const k of STAT_KEYS) s.add('poison', k, bad);
      const d = derive(content, s);
      for (const [k, v] of Object.entries(d)) {
        if (typeof v === 'number') expect(Number.isFinite(v), `${k} from ${bad}`).toBe(true);
      }
    }
  });

  it('hashWorld sees every stat that derive() reads (QA bug 6)', () => {
    // QA measured 25 of 39 stats invisible to the hash 20 s into a run, so a
    // stacking regression could pass gate A11's replay comparison.
    //
    // Two stats are legitimately invisible because they never reach
    // `Derived`: `coreHp` is read straight off `Stats` once (in the World
    // constructor), so changing it later is a no-op by design;
    // `lastStandSundering` has no reader at all today.
    // `burnSpread` left this list at m19c, when SPEC-V3 §3 gave Burning the AoE
    // spread the stat was always named for. Listed explicitly so the exemption
    // cannot silently grow.
    // `startingGold` (fb042) joins `coreHp` in the same exemption for the same
    // reason: read straight off `Stats` once, into `w.gold`, in the World
    // constructor.
    const notDerived = ['coreHp', 'lastStandSundering', 'startingGold'];
    const missed: string[] = [];
    for (const k of STAT_KEYS) {
      const run = new Run(cfg());
      const before = hashWorld(run.world);
      run.world.stats.add('probe', k, k === 'towerCost' ? -0.05 : 0.5);
      run.world.recomputeDerived();
      if (hashWorld(run.world) === before) missed.push(k);
    }
    expect(missed.sort()).toEqual([...notDerived].sort());
    const src = readFileSync('src/sim/stats.ts', 'utf8');
    const body = src.slice(src.indexOf('export function derive('));
    for (const k of notDerived) {
      expect(body.includes(`'${k}'`), `${k} is exempt but derive() reads it`).toBe(false);
    }
  });
});

describe('C4 — the modifiers bundle is its own source (Q61)', () => {
  it('a run modifier multiplies against the tree rather than joining it', () => {
    // `shortarm` is pickup radius -20%. Node 81 grants pickupPct. Collapsing the
    // 'modifiers' source into a tree key left the whole suite green.
    const node = content.treeById.get(81)!;
    const per = node.stats.pickupPct as number;
    expect(per).toBeGreaterThan(0);
    const w = new World(cfg({ modifiers: ['shortarm'], allocated: [81] }));
    const names = w.stats.contributions('pickupPct').map((c) => c[0]);
    expect(names).toEqual(['modifiers', 'tree:81']);
    // (1 - 0.20) x (1 + per), not 1 + (per - 0.20).
    const plain = new World(cfg()).derived.pickupRadius;
    expect(w.derived.pickupRadius / plain).toBeCloseTo(0.8 * (1 + per), 12);
    expect(w.derived.pickupRadius / plain).not.toBeCloseTo(1 + per - 0.2, 6);
  });
});
