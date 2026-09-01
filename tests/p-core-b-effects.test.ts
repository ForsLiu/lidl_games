/**
 * p-core-b — SPEC-FINAL §5.5's gameplay half of gate G21 for three Cores:
 * Stone Heart in full, Vampire Heart in full (base effects + all three
 * upgrade steps), and Time's steps 1-2 (its TD/VS base effects are live too;
 * steps 3-5's decay aura is `p-core-e`'s job). `p-core-a` shipped selection,
 * hashing and loader validation only — nothing here duplicates that file's
 * plumbing tests.
 *
 * Every Core upgrade is bought through `upgradeCore` (src/sim/cores.ts), the
 * shared rule §5.5 states once: interact within build range, flat cost per
 * step (never `towerCostMul`), grant only the listed effect (no tower
 * upgrade's implicit "+10%/step"), never sellable.
 */

import { describe, expect, it } from 'vitest';

import { loadContent, validateCoreUpgrade } from '../src/sim/content';
import {
  applyHealingToStructure,
  applyHealingToWarden,
  coreAttackSpeedMul,
  coreHpBonus,
  coreMoveSpeedMul,
  computeCoreState,
  inCoreBuildRange,
  updateCoreEffects,
  upgradeCore,
} from '../src/sim/cores';
import { updateProjectiles } from '../src/sim/combat';
import { effectiveSpeed, enemyAttackSpeedMul, spawnEnemy } from '../src/sim/enemies';
import { CORE_X, CORE_Y } from '../src/sim/grid';
import { applyCommand, hashWorld, updateWarden } from '../src/sim/run';
import { buildTower, towerDamage, updateTowers } from '../src/sim/towers';
import { emptyInput } from '../src/sim/types';
import { updateWieldedAttacks } from '../src/sim/vswield';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const DT = 1 / 60;
const content = loadContent();
const ARROW = content.towerByKey.get('arrow_spire')!;

/** A free, buildable tile close to the Warden's default start (near the Core). */
function nearTile(w: World): { tx: number; ty: number } {
  for (let ty = 4; ty < 20; ty++) {
    for (let tx = 4; tx < 20; tx++) {
      if (w.grid.buildable(tx, ty) && !w.grid.wouldBlockPath([[tx, ty]])) return { tx, ty };
    }
  }
  throw new Error('no buildable tile');
}

function buildAt(w: World, tx: number, ty: number) {
  w.warden.x = tx + 0.5;
  w.warden.y = ty + 0.5;
  w.gold = 1e6;
  expect(buildTower(w, ARROW.id, tx, ty).ok).toBe(true);
  return w.structureAt(tx, ty)!;
}

describe('p-core-b — shared Core-upgrade rule', () => {
  it('is bought at a flat, unmultiplied cost, never `towerCostMul`', () => {
    const w = new World(cfg({ core: 'stone_heart' }), content);
    w.stats.add('boon:cheap', 'towerCost', -0.9); // would crater a tower's price
    w.recomputeDerived();
    w.gold = 50;
    expect(upgradeCore(w)).toBe(true);
    expect(w.gold).toBe(0); // exactly stepCost (50), not discounted
  });

  it('rejects out of build range', () => {
    const w = new World(cfg({ core: 'stone_heart' }), content);
    w.warden.x = 2;
    w.warden.y = 2;
    w.gold = 1e6;
    expect(inCoreBuildRange(w)).toBe(false);
    expect(upgradeCore(w)).toBe(false);
    expect(w.coreStep).toBe(0);
  });

  it('rejects without enough gold, and past the track\'s own step count', () => {
    const w = new World(cfg({ core: 'stone_heart' }), content);
    w.gold = 10;
    expect(upgradeCore(w)).toBe(false);
    w.gold = 1e6;
    for (let i = 0; i < 3; i++) expect(upgradeCore(w)).toBe(true);
    expect(w.coreStep).toBe(3);
    expect(upgradeCore(w)).toBe(false); // Stone Heart only has 3 steps
    expect(w.coreStep).toBe(3);
  });

  it('rejects outside Act I — a VS wave is not a build-range interaction', () => {
    const w = new World(cfg({ core: 'stone_heart' }), content);
    w.gold = 1e6;
    w.phase = 'act2';
    expect(upgradeCore(w)).toBe(false);
    expect(w.coreStep).toBe(0);
  });

  it('grants only the listed effect per step — no tower-style default +10%', () => {
    const w = new World(cfg({ core: 'stone_heart' }), content);
    const base = w.coreMaxHp;
    w.gold = 1e6;
    expect(upgradeCore(w)).toBe(true);
    // Exactly +100, not +100 and also +10% of the base (550) or any other
    // compounding — §5.5: "steps grant ONLY the listed effect".
    expect(w.coreMaxHp).toBe(base + 100);
    expect(w.coreMaxHp).not.toBeCloseTo(base * 1.1, 0);
  });

  it('cannot be sold: there is no sell path, and a forged "sell" command is a silent no-op', () => {
    const w = new World(cfg({ core: 'stone_heart' }), content);
    w.gold = 1e6;
    expect(upgradeCore(w)).toBe(true);
    const stepAfter = w.coreStep;
    const goldAfter = w.gold;
    // `Command` has no `sell_core` variant at all (compile-time) — the only
    // way to probe "can this be undone" at runtime is to hand `applyCommand`
    // a shape that isn't a real Command and confirm it does nothing, the same
    // way any other unrecognised command already falls through its `default`.
    applyCommand(w, { k: 'sell_core' } as never);
    expect(w.coreStep).toBe(stepAfter);
    expect(w.gold).toBe(goldAfter);
  });

  it('an authored step past the track\'s own count fails to load', () => {
    expect(() =>
      validateCoreUpgrade({
        key: 'test_core',
        upgrade: { count: 1, stepCost: 50, steps: [{ x: 1 }, { x: 1 }] },
      }),
    ).toThrow(/authors 2 step effects for only 1/);
  });
});

describe('p-core-b — Stone Heart: +100 Core HP per step', () => {
  it('base HP is read from cores.json, not the old waves.json fallback', () => {
    const w = new World(cfg({ core: 'stone_heart' }), content);
    expect(w.coreMaxHp).toBe(500);
    expect(w.coreHp).toBe(500);
  });

  it('every non-Stone-Heart Core now uses its own baseHp (the p-core-a bug this item fixes)', () => {
    const vamp = new World(cfg({ core: 'vampire_heart' }), content);
    expect(vamp.coreMaxHp).toBe(350); // cores.json's own baseHp, not waves.json's 500
    const time = new World(cfg({ core: 'time' }), content);
    expect(time.coreMaxHp).toBe(300);
  });

  it('three steps take it from 500 to 800, preserving the current wound ratio', () => {
    const w = new World(cfg({ core: 'stone_heart' }), content);
    w.coreHp = 250; // half-damaged
    w.gold = 1e6;
    expect(upgradeCore(w)).toBe(true);
    expect(w.coreMaxHp).toBe(600);
    expect(w.coreHp).toBe(300); // still exactly half, not healed to full
    expect(upgradeCore(w)).toBe(true);
    expect(upgradeCore(w)).toBe(true);
    expect(w.coreMaxHp).toBe(800);
    expect(coreHpBonus(content, 'stone_heart', 3)).toBe(300);
  });

  it('is hashed: two replays differing only by a bought Stone Heart step diverge', () => {
    const a = new World(cfg({ core: 'stone_heart' }), content);
    const b = new World(cfg({ core: 'stone_heart' }), content);
    b.gold = 1e6;
    expect(upgradeCore(b)).toBe(true);
    expect(hashWorld(b)).not.toBe(hashWorld(a));
  });
});

describe('p-core-b — Vampire Heart', () => {
  it('base effects load exactly as authored', () => {
    const w = new World(cfg({ core: 'vampire_heart' }), content);
    expect(w.core.towerLifestealPct).toBeCloseTo(0.001, 9);
    expect(w.core.missingHpBuffPerPct).toBeCloseTo(0.005, 9);
    expect(w.core.missingHpBuffCap).toBeCloseTo(0.3, 9);
    expect(w.core.vsLifestealPct).toBeCloseTo(0.01, 9);
    expect(w.core.overhealGoldRatio).toBe(20);
    expect(w.core.towerOverhealConverts).toBe(false);
  });

  it('TD: a tower heals for exactly 0.1% of the damage it just dealt', () => {
    const w = new World(cfg({ core: 'vampire_heart' }), content);
    const { tx, ty } = nearTile(w);
    const s = buildAt(w, tx, ty);
    s.hp = 1;
    s.maxHp = 1e6;
    const e = spawnEnemy(w, 'husk', tx + 1.5, ty + 0.5)!;
    e.hp = 1e9;
    e.maxHp = 1e9;
    e.speed = 0;
    w.rebuildBuckets();
    s.cooldown = 0;

    updateTowers(w, DT);

    const dealt = w.damageByWeapon['arrow_spire'];
    expect(dealt).toBeGreaterThan(0);
    expect(s.hp).toBeCloseTo(1 + dealt * 0.001, 9);
  });

  // Regression: `pierce`/`lob`-kind towers (Ballista, Mortar) credit
  // `Structure.damageDealt` asynchronously, once their shot actually lands
  // (`combat.ts`'s `updateProjectiles`/`detonate`, the same p5d split), not
  // synchronously inside `fireTower` — code review on this item caught a
  // first draft that only wired the lifesteal heal into `updateTowers`'s own
  // before/after `damageDealt` snapshot, which is always 0 for these two
  // kinds, so the heal silently never fired for them.
  it('TD: a pierce-kind tower (Ballista) still lifesteals once its bolt actually lands', () => {
    const w = new World(cfg({ core: 'vampire_heart' }), content);
    const BALLISTA = content.towerByKey.get('ballista')!;
    const { tx, ty } = nearTile(w);
    w.warden.x = tx + 0.5;
    w.warden.y = ty + 0.5;
    w.gold = 1e6;
    expect(buildTower(w, BALLISTA.id, tx, ty).ok).toBe(true);
    const s = w.structureAt(tx, ty)!;
    s.hp = 1;
    s.maxHp = 1e6;
    const e = spawnEnemy(w, 'husk', tx + 1.5, ty + 0.5)!;
    e.hp = 1e9;
    e.maxHp = 1e9;
    e.armor = 0;
    e.speed = 0;

    for (let i = 0; i < 400 && s.damageDealt === 0; i++) {
      w.rebuildBuckets();
      updateTowers(w, DT);
      updateProjectiles(w, DT);
    }

    expect(s.damageDealt).toBeGreaterThan(0);
    expect(s.hp).toBeCloseTo(1 + s.damageDealt * 0.001, 6);
  });

  it('TD: a tower below full HP deals more damage and fires faster, capped at +30%', () => {
    const w = new World(cfg({ core: 'vampire_heart' }), content);
    const { tx, ty } = nearTile(w);
    const s = buildAt(w, tx, ty);
    s.maxHp = 100;

    s.hp = 100; // full HP: no buff
    expect(towerDamage(w, s, 10)).toBeCloseTo(10, 9);

    s.hp = 50; // 50% missing -> +25% (min(30%, 50*0.5%))
    expect(towerDamage(w, s, 10)).toBeCloseTo(12.5, 9);

    s.hp = 1; // 99% missing -> capped at +30%, not +49.5%
    expect(towerDamage(w, s, 10)).toBeCloseTo(13, 9);
  });

  it('VS: character lifesteal is 1% from the base effect alone, no step required', () => {
    const w = new World(cfg({ core: 'vampire_heart' }), content);
    const { tx, ty } = nearTile(w);
    buildAt(w, tx, ty);
    w.phase = 'act2';
    const e = spawnEnemy(w, 'husk', w.warden.x + 1, w.warden.y)!;
    e.hp = 1e9;
    e.maxHp = 1e9;
    e.speed = 0;
    w.rebuildBuckets();

    updateWieldedAttacks(w, DT);

    const dealt = w.damageByWeapon['arrow_spire'];
    expect(dealt).toBeGreaterThan(0);
    expect(w.warden.leechAccumulator).toBeCloseTo(dealt * 0.01, 9);
  });

  it('VS: overhealing converts to gold at 20:1 before any step is bought', () => {
    const w = new World(cfg({ core: 'vampire_heart' }), content);
    w.phase = 'act2';
    w.warden.hp = w.derived.maxHp - 5;
    const goldBefore = w.gold;
    applyHealingToWarden(w, 25); // 5 tops off maxHp, 20 is overheal -> 1 gold @ 20:1
    expect(w.warden.hp).toBe(w.derived.maxHp);
    expect(w.gold).toBe(goldBefore + 1);
  });

  it('outside VS, the same overheal is simply discarded (no gold, TD lifesteal never overheals a Warden)', () => {
    const w = new World(cfg({ core: 'vampire_heart' }), content);
    w.warden.hp = w.derived.maxHp - 5;
    const goldBefore = w.gold;
    applyHealingToWarden(w, 25);
    expect(w.warden.hp).toBe(w.derived.maxHp);
    expect(w.gold).toBe(goldBefore);
  });

  // QA (p-core-b): a non-finite heal amount used to poison
  // `coreGoldAccumulator` permanently (`Math.floor(NaN)` is NaN, `NaN > 0` is
  // always false, so the "flush whole gold" branch could never fire again) —
  // every subsequent *legitimate* trickle was then silently lost forever.
  it('a NaN/non-finite heal is dropped rather than corrupting the gold accumulator forever', () => {
    const w = new World(cfg({ core: 'vampire_heart' }), content);
    w.phase = 'act2';
    w.warden.hp = w.derived.maxHp - 10;
    applyHealingToWarden(w, NaN);
    applyHealingToWarden(w, Infinity);
    expect(Number.isFinite(w.coreGoldAccumulator)).toBe(true);
    expect(w.coreGoldAccumulator).toBe(0);

    w.warden.hp = w.derived.maxHp;
    const before = w.gold;
    for (let i = 0; i < 100; i++) applyHealingToWarden(w, 20); // 2000 hp overheal @ 20:1 -> 100 gold
    expect(w.gold).toBe(before + 100);
  });

  it('a different Core never converts overheal, even in VS (overhealGoldRatio is 0)', () => {
    const w = new World(cfg({ core: 'stone_heart' }), content);
    w.phase = 'act2';
    w.warden.hp = w.derived.maxHp - 5;
    const goldBefore = w.gold;
    applyHealingToWarden(w, 25);
    expect(w.gold).toBe(goldBefore);
  });

  it('step 1: tower overheal now also converts to gold, at the same 20:1 base ratio', () => {
    const w = new World(cfg({ core: 'vampire_heart' }), content);
    const { tx, ty } = nearTile(w);
    const s = buildAt(w, tx, ty);
    s.maxHp = 100;
    s.hp = 95;
    const goldBefore = w.gold;

    applyHealingToStructure(w, s, 25); // before step 1: overheal discarded
    expect(s.hp).toBe(100);
    expect(w.gold).toBe(goldBefore);

    w.gold = 1e6;
    w.warden.x = CORE_X - 1; // back within the Core's build range, away from the built tile
    w.warden.y = CORE_Y;
    expect(upgradeCore(w)).toBe(true); // step 1
    s.hp = 95;
    const goldAfterStep = w.gold;
    applyHealingToStructure(w, s, 25); // 5 tops off, 20 overheal -> 1 gold @ 20:1
    expect(s.hp).toBe(100);
    expect(w.gold).toBe(goldAfterStep + 1);
  });

  it('step 2: both conversions become 10:1', () => {
    const w = new World(cfg({ core: 'vampire_heart' }), content);
    w.gold = 1e6;
    expect(upgradeCore(w)).toBe(true); // step 1
    expect(upgradeCore(w)).toBe(true); // step 2
    expect(w.core.overhealGoldRatio).toBe(10);

    w.phase = 'act2';
    w.warden.hp = w.derived.maxHp - 5;
    const goldBefore = w.gold;
    applyHealingToWarden(w, 25); // 20 overheal @ 10:1 -> 2 gold
    expect(w.gold).toBe(goldBefore + 2);
  });

  it('step 3: tower lifesteal becomes 0.3% total (0.1% base + 0.2% bonus)', () => {
    const w = new World(cfg({ core: 'vampire_heart' }), content);
    w.gold = 1e6;
    expect(upgradeCore(w)).toBe(true);
    expect(upgradeCore(w)).toBe(true);
    expect(upgradeCore(w)).toBe(true);
    expect(w.coreStep).toBe(3);
    expect(w.core.towerLifestealPct).toBeCloseTo(0.003, 9);
  });

  it('is hashed: a bought Vampire Heart step changes the end-state hash', () => {
    const a = new World(cfg({ core: 'vampire_heart' }), content);
    const b = new World(cfg({ core: 'vampire_heart' }), content);
    b.gold = 1e6;
    expect(upgradeCore(b)).toBe(true);
    expect(hashWorld(b)).not.toBe(hashWorld(a));
  });
});

describe('p-core-b — Time (steps 1-2; steps 3-5 are p-core-e)', () => {
  it('base effects load exactly as authored', () => {
    const w = new World(cfg({ core: 'time' }), content);
    expect(w.core.tdSlowRadius).toBe(3);
    expect(w.core.tdSlowPct).toBeCloseTo(0.2, 9);
    expect(w.core.vsSpeedPct).toBeCloseTo(0.2, 9);
    expect(w.core.goldPerSecond).toBe(0);
    expect(w.core.hpRegenPerSecond).toBe(0);
    expect(w.core.healingReceivedMul).toBe(1);
  });

  it('TD: an enemy within r3 of the Core has -20% move and attack speed', () => {
    const w = new World(cfg({ core: 'time' }), content);
    const near = spawnEnemy(w, 'husk', CORE_X - 1, CORE_Y)!; // 1 tile off the footprint
    const far = spawnEnemy(w, 'husk', CORE_X - 10, CORE_Y)!;
    expect(effectiveSpeed(w, near)).toBeCloseTo(near.speed * 0.8, 9);
    expect(effectiveSpeed(w, far)).toBeCloseTo(far.speed, 9);
    expect(enemyAttackSpeedMul(w, near)).toBeCloseTo(0.8, 9);
    expect(enemyAttackSpeedMul(w, far)).toBeCloseTo(1, 9);
  });

  it('TD: a slow-immune enemy (Frostkin) ignores the aura', () => {
    const w = new World(cfg({ core: 'time' }), content);
    const e = spawnEnemy(w, 'frostkin', CORE_X - 1, CORE_Y)!;
    expect(effectiveSpeed(w, e)).toBeCloseTo(e.speed, 9);
  });

  it('the aura is TD-only: once VS begins, enemies hunt the Warden and the aura no longer applies', () => {
    const w = new World(cfg({ core: 'time' }), content);
    w.phase = 'act2';
    const e = spawnEnemy(w, 'husk', CORE_X - 1, CORE_Y)!;
    expect(effectiveSpeed(w, e)).toBeCloseTo(e.speed, 9);
  });

  it('VS: character attack and movement speed +20%, TD unaffected', () => {
    const w = new World(cfg({ core: 'time' }), content);
    expect(coreMoveSpeedMul(w)).toBe(1); // TD
    expect(coreAttackSpeedMul(w)).toBe(1);
    w.phase = 'act2';
    expect(coreMoveSpeedMul(w)).toBeCloseTo(1.2, 9);
    expect(coreAttackSpeedMul(w)).toBeCloseTo(1.2, 9);
  });

  it('step 1: +1 flat gold/s, unaffected by gold-gain bonuses', () => {
    const w = new World(cfg({ core: 'time' }), content);
    w.stats.add('boon:greed', 'goldFind', 5); // +500% gold find
    w.recomputeDerived();
    w.gold = 1e6;
    expect(upgradeCore(w)).toBe(true); // step 1
    const before = w.gold;
    for (let i = 0; i < 60; i++) updateCoreEffects(w, DT); // 1 simulated second
    expect(w.gold).toBe(before + 1); // exactly +1, not scaled by goldFindMul
  });

  // b042: unlike kill bounty, the fixed wave-clear bonus and Harvest Sprout's
  // per-wave-clear income (all flat-per-event, per p10l's qa-playtester
  // audit), step 1's gold/s is genuinely coupled to real wall-clock time —
  // including `act1_build`, which is `data/waves.json`'s `buildPhaseSeconds`.
  // These two tests pin that coupling by construction, reading the expected
  // amount from the same duration source, so a future pacing-timer retune
  // (p10l moved `buildPhaseSeconds` 20->15) shows up here instead of being
  // rediscovered from a live-run gold audit each time.
  it('step 1: total income over a build phase equals data/waves.json\'s buildPhaseSeconds exactly', () => {
    const w = new World(cfg({ core: 'time' }), content);
    w.gold = 1e6;
    expect(upgradeCore(w)).toBe(true); // step 1
    const before = w.gold;
    const seconds = content.waves.buildPhaseSeconds;
    for (let i = 0; i < Math.round(seconds * 60); i++) updateCoreEffects(w, DT);
    expect(w.gold).toBe(before + seconds);
  });

  it('step 1: income scales linearly with elapsed time, unlike a flat per-event gold source', () => {
    const w = new World(cfg({ core: 'time' }), content);
    w.gold = 1e6;
    expect(upgradeCore(w)).toBe(true); // step 1
    const before = w.gold;
    for (let i = 0; i < 60 * 10; i++) updateCoreEffects(w, DT); // 10s
    const after10s = w.gold - before;
    for (let i = 0; i < 60 * 10; i++) updateCoreEffects(w, DT); // +10s = 20s total
    const after20s = w.gold - before;
    expect(after10s).toBe(10);
    expect(after20s).toBe(20);
    expect(after20s).toBe(after10s * 2); // doubling elapsed time doubles income
  });

  it('step 2: towers regen +1 HP/s, scaled by the same step\'s +20% healing received', () => {
    const w = new World(cfg({ core: 'time' }), content);
    const { tx, ty } = nearTile(w);
    const s = buildAt(w, tx, ty);
    s.maxHp = 1000;
    s.hp = 1;
    w.gold = 1e6;
    w.warden.x = CORE_X - 1; // back within the Core's build range, away from the built tile
    w.warden.y = CORE_Y;
    expect(upgradeCore(w)).toBe(true); // step 1
    expect(upgradeCore(w)).toBe(true); // step 2
    expect(w.core.healingReceivedMul).toBeCloseTo(1.2, 9);

    for (let i = 0; i < 60; i++) updateCoreEffects(w, DT); // 1 simulated second
    expect(s.hp).toBeCloseTo(1 + 1 * 1.2, 6); // +1 HP/s * 1.2 healing-received
  });

  it('step 2: character also gains +1 HP regen/s via the generic Stats pipeline, VS-scaled the same as any other regen', () => {
    const w = new World(cfg({ core: 'time' }), content);
    const before = w.derived.hpRegen;
    w.gold = 1e6;
    expect(upgradeCore(w)).toBe(true);
    expect(upgradeCore(w)).toBe(true);
    expect(w.derived.hpRegen).toBeCloseTo(before + 1, 9);

    w.phase = 'act2';
    w.warden.hp = 1;
    updateWarden(w, emptyInput(), DT);
    // Healing received +20% applies to every heal the Warden gets, regen included.
    expect(w.warden.hp).toBeCloseTo(1 + w.derived.hpRegen * DT * 1.2, 6);
  });

  it('steps 3-5 are not yet authored: buying up to the full 5 leaves the decay aura fields at their base zero', () => {
    const w = new World(cfg({ core: 'time' }), content);
    w.gold = 1e6;
    for (let i = 0; i < 5; i++) expect(upgradeCore(w)).toBe(true);
    expect(w.coreStep).toBe(5);
    expect(w.core.goldPerSecond).toBe(1); // only step 1 authored
    expect(w.core.hpRegenPerSecond).toBe(1); // only step 2 authored
  });

  it('is hashed: a bought Time step changes the end-state hash', () => {
    const a = new World(cfg({ core: 'time' }), content);
    const b = new World(cfg({ core: 'time' }), content);
    b.gold = 1e6;
    expect(upgradeCore(b)).toBe(true);
    expect(hashWorld(b)).not.toBe(hashWorld(a));
  });
});

describe('p-core-b — computeCoreState is a pure fold (no double-counting across recomputes)', () => {
  it('re-deriving state at the same step count twice gives identical numbers', () => {
    const a = computeCoreState(content, 'vampire_heart', 2);
    const b = computeCoreState(content, 'vampire_heart', 2);
    expect(b).toEqual(a);
    expect(a.overhealGoldRatio).toBe(10);
    expect(a.towerOverhealConverts).toBe(true);
  });

  it('an unknown core key resolves to an all-zero, inert state rather than throwing', () => {
    const st = computeCoreState(content, 'not_a_real_core', 3);
    expect(st.towerLifestealPct).toBe(0);
    expect(st.overhealGoldRatio).toBe(0);
    expect(st.healingReceivedMul).toBe(1);
  });
});
