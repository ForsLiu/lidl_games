/**
 * p6b — SPEC-FINAL §4.1's Swordsman kit (verbatim): Thousand Cuts (on-hit
 * Bleeding), Circle Slash (charge-scaled nova), Dash Slash (mouse-aimed
 * line, mergeable with a Circle Slash charge), Wind Slash (tower passive).
 * Gate G9's first half is the merge behavior: "Dash during a Circle Slash
 * charge is one merged attack whose hit range is widened by the current
 * charge radius and whose damages sum, and each enemy struck takes exactly
 * 1 Bleeding" — the last `describe` block below drives that directly.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { attackSpeedFor, buildTower } from '../src/sim/towers';
import { loadContent, validateClassEffect, type ClassEffect, type ClassDef } from '../src/sim/content';
import { useClassActive, useClassActive2 } from '../src/sim/classes';
import { dotStacks, spawnEnemy } from '../src/sim/enemies';
import { applyCommand, damageWarden, hashWorld, Run, updateWarden } from '../src/sim/run';
import type { Command, TickInput } from '../src/sim/types';
import { World } from '../src/sim/world';
import { clearKeysForPause } from '../src/ui/input';
import { towerInfo } from '../src/ui/tower-info';
import { cfg } from './helpers';

const content = loadContent();
const swordsman = content.classByKey.get('swordsman')! as ClassDef;

function held(active1Held: boolean, over: Partial<TickInput> = {}): TickInput {
  return { mx: 0, my: 0, dash: false, attack: false, aimX: 0, aimY: 0, active1Held, cmds: [], ...over };
}

/**
 * Swordsman's basic attack (range 2.5) auto-fires the instant
 * `wd.attackCooldown` allows — the first tick of any `updateWarden` call,
 * by default — and would otherwise contaminate a Circle-Slash-only/
 * Dash-Slash-only damage or Bleeding-stack measurement below. Suppressed
 * here by default; the one test that wants the basic attack to fire opts
 * back in with `suppressBasicAttack: false`.
 */
function worldWith(over = {}, opts: { suppressBasicAttack?: boolean } = {}): World {
  const w = new World(cfg({ classKey: 'swordsman', ...over }));
  w.gold = 1e6;
  if (opts.suppressBasicAttack !== false) w.warden.attackCooldown = 1e9;
  return w;
}

describe('p6b: Swordsman loads with the §4.1 kit', () => {
  it('is authored with the four §4 slots and the right effect kinds', () => {
    expect(swordsman.passive.kind).toBe('thousand_cuts');
    expect(swordsman.active1.kind).toBe('charge_nova');
    expect(swordsman.active2.kind).toBe('dash_line');
  });
});

describe('p6b: the loader rejects a charge_nova/dash_line row missing its kind-specific fields', () => {
  it('accepts the real, shipped Swordsman active1 and active2 rows', () => {
    expect(() => validateClassEffect(swordsman.active1, 'x')).not.toThrow();
    expect(() => validateClassEffect(swordsman.active2, 'x')).not.toThrow();
  });

  for (const field of ['minRadius', 'minDamage', 'chargeCapSeconds', 'knockback'] as const) {
    it(`rejects a charge_nova row missing "${field}"`, () => {
      const broken = { ...swordsman.active1 } as Record<string, unknown>;
      delete broken[field];
      expect(() => validateClassEffect(broken as ClassEffect, 'x')).toThrow();
    });
  }

  for (const field of ['dashRange', 'dashWidth'] as const) {
    it(`rejects a dash_line row missing "${field}"`, () => {
      const broken = { ...swordsman.active2 } as Record<string, unknown>;
      delete broken[field];
      expect(() => validateClassEffect(broken as ClassEffect, 'x')).toThrow();
    });
  }

  it('a burst_damage row needs none of the charge_nova/dash_line fields', () => {
    const burst: ClassEffect = { name: 'x', kind: 'burst_damage', cooldownSeconds: 1, radius: 1, damage: 1 };
    expect(() => validateClassEffect(burst, 'x')).not.toThrow();
  });
});

describe('p6b: Thousand Cuts — every attack applies exactly 1 Bleeding', () => {
  it('the basic attack applies exactly 1 Bleeding stack per hit, not more', () => {
    const w = worldWith({}, { suppressBasicAttack: false });
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
    e.hp = 1e6;
    e.maxHp = 1e6;
    w.rebuildBuckets();
    for (let t = 0; t < 60 && dotStacks(e, 'bleeding') === 0; t++) updateWarden(w, held(false), 1 / 60);
    expect(dotStacks(e, 'bleeding')).toBe(1);
  });

  it('a class without Thousand Cuts never applies Bleeding from its own basic attack', () => {
    const w = new World(cfg({ classKey: 'engineer' }));
    w.gold = 1e6;
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
    w.rebuildBuckets();
    const input: TickInput = { mx: 0, my: 0, dash: false, attack: true, aimX: e.x, aimY: e.y, active1Held: false, cmds: [] };
    for (let t = 0; t < 60; t++) updateWarden(w, input, 1 / 60);
    expect(dotStacks(e, 'bleeding')).toBe(0);
  });
});

describe('p6b: Circle Slash charges on hold and fires on release, scaled by charge', () => {
  let w: World;
  beforeEach(() => {
    w = worldWith();
  });

  it('does nothing while merely held — no damage, no cooldown, until release', () => {
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1.2, w.warden.y)!;
    w.rebuildBuckets();
    const hpBefore = e.hp;
    for (let t = 0; t < 30; t++) updateWarden(w, held(true), 1 / 60);
    expect(e.hp).toBe(hpBefore);
    expect(w.warden.active1Cooldown).toBe(0);
    expect(w.warden.active1Charging).toBe(true);
  });

  it('releasing after a near-zero hold fires at the minRadius/minDamage floor', () => {
    const near = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1.2, w.warden.y)!;
    const far = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 3, w.warden.y)!;
    w.rebuildBuckets();
    updateWarden(w, held(true), 1 / 60); // one tick of charge
    updateWarden(w, held(false), 1 / 60); // release
    expect(near.hp).toBeLessThan(near.maxHp); // within minRadius (1.5)
    expect(far.hp).toBe(far.maxHp); // outside minRadius, not yet reached maxRadius growth
    expect(w.warden.active1Charging).toBe(false);
    expect(w.warden.active1Charge).toBe(0);
    expect(w.warden.active1Cooldown).toBeGreaterThan(0);
  });

  it('a full (capped) charge hits a farther enemy and deals more damage than a near-zero charge', () => {
    const wMin = worldWith();
    const wMax = worldWith();
    const eMin = spawnEnemy(wMin, wMin.content.enemies.enemies[0].key, wMin.warden.x + 1.2, wMin.warden.y)!;
    const eMax = spawnEnemy(wMax, wMax.content.enemies.enemies[0].key, wMax.warden.x + 1.2, wMax.warden.y)!;
    const farMax = spawnEnemy(wMax, wMax.content.enemies.enemies[0].key, wMax.warden.x + 3, wMax.warden.y)!;
    // High HP so neither dies mid-test — a clamped-at-0 comparison would
    // still pass by accident and hide a scaling regression.
    for (const e of [eMin, eMax, farMax]) {
      e.hp = 1000;
      e.maxHp = 1000;
    }
    wMin.rebuildBuckets();
    wMax.rebuildBuckets();

    updateWarden(wMin, held(true), 1 / 60);
    updateWarden(wMin, held(false), 1 / 60);

    for (let t = 0; t < 250; t++) updateWarden(wMax, held(true), 1 / 60); // past chargeCapSeconds (3s = 180 ticks)
    updateWarden(wMax, held(false), 1 / 60);

    expect(eMax.hp).toBeLessThan(eMin.hp); // full charge hits harder than a near-zero one
    expect(farMax.hp).toBeLessThan(farMax.maxHp); // full charge's wider radius (4) now reaches distance 3
  });

  it('a full charge knocks a struck enemy back away from the Warden', () => {
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1.2, w.warden.y)!;
    e.hp = 1000; // survive the hit so the knockback branch (gated on `!e.dead`) actually runs
    e.maxHp = 1000;
    w.rebuildBuckets();
    const before = { x: e.x, y: e.y };
    for (let t = 0; t < 250; t++) updateWarden(w, held(true), 1 / 60);
    updateWarden(w, held(false), 1 / 60);
    expect(e.x).toBeGreaterThan(before.x); // pushed further from the Warden along +x
  });

  it('holding Q does not start a new charge while active1Cooldown is still running', () => {
    updateWarden(w, held(true), 1 / 60);
    updateWarden(w, held(false), 1 / 60); // fires a near-zero-charge slash, starts the cooldown
    expect(w.warden.active1Cooldown).toBeGreaterThan(0);
    updateWarden(w, held(true), 1 / 60);
    expect(w.warden.active1Charging).toBe(false);
  });

  it('the class_active Command is a no-op for a charge-kind Active1: no cooldown, no damage, returns false', () => {
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
    w.rebuildBuckets();
    const hpBefore = e.hp;
    const fired = useClassActive(w);
    expect(fired).toBe(false);
    expect(e.hp).toBe(hpBefore);
    expect(w.warden.active1Cooldown).toBe(0);
  });
});

describe('p6b: Dash Slash — mouse-aimed line, own cooldown, moves the Warden', () => {
  it('damages an enemy on the aimed line and applies exactly 1 Bleeding', () => {
    const w = worldWith();
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 3, w.warden.y)!;
    e.hp = 1000; // survive the hit — a dead enemy skips `applyEffects`/onHit entirely
    e.maxHp = 1000;
    w.rebuildBuckets();
    const hpBefore = e.hp;
    applyCommand(w, { k: 'class_active2', aimX: e.x, aimY: e.y });
    expect(e.hp).toBeLessThan(hpBefore);
    expect(dotStacks(e, 'bleeding')).toBe(1);
    expect(w.warden.active2Cooldown).toBeGreaterThan(0);
  });

  it('moves the Warden toward the aim point', () => {
    const w = worldWith();
    const startX = w.warden.x;
    applyCommand(w, { k: 'class_active2', aimX: startX + 5, aimY: w.warden.y });
    expect(w.warden.x).toBeGreaterThan(startX);
  });

  it('an unaimed press (no aimX/aimY) dashes along the current facing rather than throwing', () => {
    const w = worldWith();
    expect(() => applyCommand(w, { k: 'class_active2' })).not.toThrow();
    expect(w.warden.active2Cooldown).toBeGreaterThan(0);
  });
});

describe("p6b: G9 — Dash during a Circle Slash charge merges into one attack", () => {
  it('reaches an enemy beyond dashRange alone, widened by the charge radius', () => {
    const w = worldWith();
    // dashRange 5, full-charge circle radius 4 -> hit range 9; place the enemy at 7.
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 7, w.warden.y)!;
    w.rebuildBuckets();
    for (let t = 0; t < 250; t++) updateWarden(w, held(true), 1 / 60);
    expect(w.warden.active1Charging).toBe(true);

    const hpBefore = e.hp;
    applyCommand(w, { k: 'class_active2', aimX: e.x, aimY: e.y });
    expect(e.hp).toBeLessThan(hpBefore);
  });

  it('consumes the charge: active1Charging/active1Charge reset and active1Cooldown starts', () => {
    const w = worldWith();
    for (let t = 0; t < 250; t++) updateWarden(w, held(true), 1 / 60);
    applyCommand(w, { k: 'class_active2' });
    expect(w.warden.active1Charging).toBe(false);
    expect(w.warden.active1Charge).toBe(0);
    expect(w.warden.active1Cooldown).toBeGreaterThan(0);
  });

  it('sums the two damages into one hit (armor-mitigated total equals the two solo hits summed)', () => {
    const dashOnly = worldWith();
    const eDash = spawnEnemy(dashOnly, dashOnly.content.enemies.enemies[0].key, dashOnly.warden.x + 3, dashOnly.warden.y)!;
    eDash.hp = 1e6;
    eDash.maxHp = 1e6;
    dashOnly.rebuildBuckets();
    applyCommand(dashOnly, { k: 'class_active2', aimX: eDash.x, aimY: eDash.y });
    const dashLoss = 1e6 - eDash.hp;

    const circleOnly = worldWith();
    const eCircle = spawnEnemy(circleOnly, circleOnly.content.enemies.enemies[0].key, circleOnly.warden.x + 1.2, circleOnly.warden.y)!;
    eCircle.hp = 1e6;
    eCircle.maxHp = 1e6;
    circleOnly.rebuildBuckets();
    for (let t = 0; t < 250; t++) updateWarden(circleOnly, held(true), 1 / 60);
    updateWarden(circleOnly, held(false), 1 / 60);
    const circleLoss = 1e6 - eCircle.hp;

    const merged = worldWith();
    const eMerged = spawnEnemy(merged, merged.content.enemies.enemies[0].key, merged.warden.x + 3, merged.warden.y)!;
    eMerged.hp = 1e6;
    eMerged.maxHp = 1e6;
    merged.rebuildBuckets();
    for (let t = 0; t < 250; t++) updateWarden(merged, held(true), 1 / 60);
    applyCommand(merged, { k: 'class_active2', aimX: eMerged.x, aimY: eMerged.y });
    const mergedLoss = 1e6 - eMerged.hp;

    expect(mergedLoss).toBeCloseTo(dashLoss + circleLoss, 5);
  });

  /**
   * p7a (§6.3) skill card "Circle Slash Potency" (`active1_potency`) code
   * review finding: the merged charge is still Circle Slash's own damage
   * (`circleSlashValues(cls.active1, ...)`), so it must scale by
   * `active1PotencyMul` exactly like a normal, unmerged release
   * (`fireCircleSlash`) does — this was found silently skipping it.
   */
  it('the Circle Slash Potency skill card scales the merged charge damage too, not just a solo release', () => {
    const card = content.boons.skillCards['swordsman']!.find((c) => c.effect === 'active1_potency')!;

    const unranked = worldWith();
    const eUnranked = spawnEnemy(unranked, unranked.content.enemies.enemies[0].key, unranked.warden.x + 3, unranked.warden.y)!;
    eUnranked.hp = 1e6;
    eUnranked.maxHp = 1e6;
    unranked.rebuildBuckets();
    for (let t = 0; t < 250; t++) updateWarden(unranked, held(true), 1 / 60);
    applyCommand(unranked, { k: 'class_active2', aimX: eUnranked.x, aimY: eUnranked.y });
    const unrankedLoss = 1e6 - eUnranked.hp;

    const ranked = worldWith();
    ranked.skillCardRanks[card.key] = 1;
    const eRanked = spawnEnemy(ranked, ranked.content.enemies.enemies[0].key, ranked.warden.x + 3, ranked.warden.y)!;
    eRanked.hp = 1e6;
    eRanked.maxHp = 1e6;
    ranked.rebuildBuckets();
    for (let t = 0; t < 250; t++) updateWarden(ranked, held(true), 1 / 60);
    applyCommand(ranked, { k: 'class_active2', aimX: eRanked.x, aimY: eRanked.y });
    const rankedLoss = 1e6 - eRanked.hp;

    expect(rankedLoss).toBeGreaterThan(unrankedLoss);
  });

  it('each enemy struck takes exactly 1 Bleeding from the merged attack, not 2', () => {
    const w = worldWith();
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 3, w.warden.y)!;
    e.hp = 1e6;
    e.maxHp = 1e6;
    w.rebuildBuckets();
    for (let t = 0; t < 250; t++) updateWarden(w, held(true), 1 / 60);
    applyCommand(w, { k: 'class_active2', aimX: e.x, aimY: e.y });
    expect(dotStacks(e, 'bleeding')).toBe(1);
  });

  it('firing Circle Slash and Dash Slash back to back (not merged) does stack 2 Bleeding, unlike the merge', () => {
    const w = worldWith();
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1.2, w.warden.y)!;
    e.hp = 1e6;
    e.maxHp = 1e6;
    w.rebuildBuckets();
    updateWarden(w, held(true), 1 / 60);
    updateWarden(w, held(false), 1 / 60); // Circle Slash fires alone, 1 Bleeding
    expect(dotStacks(e, 'bleeding')).toBe(1);
    applyCommand(w, { k: 'class_active2', aimX: e.x, aimY: e.y }); // Dash Slash fires alone, a 2nd Bleeding
    expect(dotStacks(e, 'bleeding')).toBe(2);
  });
});

describe('p6b: Wind Slash — all towers +10% attack speed, effective in VS', () => {
  it('the tower passive mods are sourced as class:swordsman:towerPassive', () => {
    const w = worldWith();
    expect(w.stats.contributions('towerAttackSpeed')).toContainEqual(['class:swordsman:towerPassive', 0.1]);
    expect(w.derived.towerAttackSpeedMul).toBeCloseTo(1.1, 5);
  });

  it('a built tower actually fires faster under Swordsman than under a class with no Wind Slash', () => {
    const arrow = content.towerByKey.get('arrow_spire')!;
    const wSword = worldWith();
    wSword.warden.x = 10;
    wSword.warden.y = 10;
    expect(buildTower(wSword, arrow.id, 10, 10).ok).toBe(true);
    const wOther = new World(cfg({ classKey: 'pyromancer' }));
    wOther.gold = 1e6;
    wOther.warden.x = 10;
    wOther.warden.y = 10;
    expect(buildTower(wOther, arrow.id, 10, 10).ok).toBe(true);

    expect(attackSpeedFor(wSword, wSword.structures[0])).toBeGreaterThan(attackSpeedFor(wOther, wOther.structures[0]));
  });
});

describe('p6b: replay-hash determinism with charging, Dash Slash and the merge in the log', () => {
  it('two independent runs from the same input log reach an identical end-state hash', () => {
    const log: TickInput[] = [];
    for (let t = 0; t < 400; t++) {
      const cmds: Command[] = [];
      if (t === 260) cmds.push({ k: 'class_active2', aimX: 5, aimY: 0 });
      log.push({
        mx: t % 7 === 0 ? 1 : 0,
        my: 0,
        dash: false,
        attack: false,
        aimX: 0,
        aimY: 0,
        active1Held: t >= 50 && t < 260,
        cmds,
      });
    }

    const a = new Run(cfg({ classKey: 'swordsman' }));
    a.world.gold = 1e6;
    spawnEnemy(a.world, a.world.content.enemies.enemies[0].key, a.world.warden.x + 3, a.world.warden.y);
    for (const input of log) a.step(input);

    const b = new Run(cfg({ classKey: 'swordsman' }));
    b.world.gold = 1e6;
    spawnEnemy(b.world, b.world.content.enemies.enemies[0].key, b.world.warden.x + 3, b.world.warden.y);
    for (const input of log) b.step(input);

    expect(a.hash()).toBe(b.hash());
    expect(hashWorld(a.world)).toBe(hashWorld(b.world));
    // Not a vacuous replay: the merge actually fired.
    expect(a.world.warden.active1Charging).toBe(false);
    expect(a.world.warden.active2Cooldown).toBeGreaterThan(0);
  });
});

describe('p6b: QA bug 1 — w.dying freezes Command-driven class actions, not just updateWarden', () => {
  function dyingWorld(): World {
    const w = worldWith();
    w.phase = 'act2'; // huntsWarden, so damageWarden's own defeat path is live
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 3, w.warden.y)!;
    e.hp = 1000;
    e.maxHp = 1000;
    w.rebuildBuckets();
    damageWarden(w, 1e9);
    expect(w.dying).toBe('defeat_warden');
    expect(w.outcome).toBe('running'); // still mid slow-mo, not yet resolved
    return w;
  }

  it('useClassActive2 (Dash Slash) is a no-op while dying: no movement, no damage, no cooldown', () => {
    const w = dyingWorld();
    const e = w.enemies[0];
    const hpBefore = e.hp;
    const before = { x: w.warden.x, y: w.warden.y };
    const fired = useClassActive2(w, e.x, e.y);
    expect(fired).toBe(false);
    expect(w.warden.x).toBe(before.x);
    expect(w.warden.y).toBe(before.y);
    expect(e.hp).toBe(hpBefore);
    expect(w.warden.active2Cooldown).toBe(0);
  });

  it('useClassActive is a no-op while dying, for a burst_damage Active1 too — not vacuously true only because Swordsman\'s charge_nova already returns false for its own, unrelated reason', () => {
    // Swordsman's Active1 is charge_nova, which useClassActive already
    // no-ops on Command dispatch regardless of `w.dying` (it fires on
    // release via tickClassCharge, not this function) — so proving the
    // dying-guard actually gates this function needs a burst_damage class,
    // the kind that would otherwise really fire here. Pyro's Immolation Wave
    // is that class, with the cooldown it would have eaten on `active1Cooldown`.
    const w = new World(cfg({ classKey: 'pyromancer' }));
    w.gold = 1e6;
    w.phase = 'act2';
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
    e.hp = 1000;
    e.maxHp = 1000;
    w.rebuildBuckets();
    damageWarden(w, 1e9);
    expect(w.dying).toBe('defeat_warden');

    const hpBefore = e.hp;
    const fired = useClassActive(w);
    expect(fired).toBe(false);
    expect(e.hp).toBe(hpBefore);
    expect(w.warden.active1Cooldown).toBe(0);
  });

  it('a merged Dash Slash cannot fire while dying even if a charge was already in progress', () => {
    const w = dyingWorld();
    // Force a mid-charge state directly, the same state a real hold would reach.
    w.warden.active1Charging = true;
    w.warden.active1Charge = 3;
    const e = w.enemies[0];
    const hpBefore = e.hp;
    const fired = useClassActive2(w, e.x, e.y);
    expect(fired).toBe(false);
    expect(e.hp).toBe(hpBefore);
    // The charge is untouched, not silently consumed by the blocked Command.
    expect(w.warden.active1Charging).toBe(true);
    expect(w.warden.active1Charge).toBe(3);
  });
});

describe('p6b: QA bug 2 — pausing mid-charge does not force-release it', () => {
  it('preserves a held "q" across the clear, unlike every other key', () => {
    const keys = new Set(['q', 'w', 'a', ' ']);
    clearKeysForPause(keys);
    expect(keys.has('q')).toBe(true);
    expect(keys.has('w')).toBe(false);
    expect(keys.has('a')).toBe(false);
    expect(keys.has(' ')).toBe(false);
  });

  it('a genuine release during the pause (q not held) still clears cleanly', () => {
    const keys = new Set(['w', 'a']);
    clearKeysForPause(keys);
    expect(keys.size).toBe(0);
  });

  it('end to end: a charge survives clearKeysForPause, unlike the raw keys.clear() it replaced', () => {
    const w = worldWith();
    updateWarden(w, held(true), 1 / 60); // starts a charge
    expect(w.warden.active1Charging).toBe(true);
    const chargeBefore = w.warden.active1Charge;

    const keys = new Set(['q']);
    clearKeysForPause(keys); // simulates App.setPaused(true)
    // Resuming with `q` still physically held reads as still-held, not a release.
    updateWarden(w, held(keys.has('q')), 1 / 60);
    expect(w.warden.active1Charging).toBe(true);
    expect(w.warden.active1Charge).toBeGreaterThanOrEqual(chargeBefore);
  });
});

describe('p6b: QA bug 3 — the build-menu tower preview includes Wind Slash before the tower is built', () => {
  it('the pre-build "Rate" stat matches the post-build one under Swordsman', () => {
    const w = worldWith();
    w.warden.x = 10;
    w.warden.y = 10;
    const arrow = content.towerByKey.get('arrow_spire')!;
    const preview = towerInfo(w, arrow).stats.find((s) => s.label === 'Rate')!;
    expect(buildTower(w, arrow.id, 10, 10).ok).toBe(true);
    const built = towerInfo(w, arrow, w.structures[0]).stats.find((s) => s.label === 'Rate')!;
    expect(preview.value).toBe(built.value);
  });
});
