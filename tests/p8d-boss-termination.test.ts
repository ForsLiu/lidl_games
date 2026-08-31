/**
 * p8d — SPEC-FINAL §9 addendum (QUESTIONS Q126/Q127): "no run can stalemate,
 * every seed terminates." From 3:00 of boss-fight time the Warden-Eater
 * gains +10% damage and +5% move/attack speed every 30s, stacking without
 * cap, and whenever it cannot path to the Warden at all it chips the nearest
 * structure and, failing that, the Core directly — Core loss now ends the
 * run in Act II exactly as it already did in Act I.
 *
 * The known stalemate seeds this item names (carnivorous_plant 2/9, corpse
 * 2, the four class seeds) are all measured in `tests/p-core-f-gates.test.ts`
 * and `tests/p6e-class-diversity.test.ts` as a pure damage/sustain race: a
 * Core ability (Carnivorous Plant's devour) or a class's own sustain keeps
 * the Warden alive indefinitely while neither side's damage output closes
 * the fight out. Escalation is what actually breaks that race — it is
 * unbounded, so given enough time its multiplier exceeds *any* fixed sustain
 * rate — which is what the first test below proves directly rather than by
 * re-running a 12-seed, tens-of-minutes sweep inside an ordinary item (out
 * of scope per CLAUDE.md's full-suite-timing rule; re-measuring the actual
 * gates is P10's job, logged in BACKLOG.md).
 */
import { describe, expect, it } from 'vitest';

import { Run } from '../src/sim/run';
import { emptyInput } from '../src/sim/types';
import { damageEnemy, spawnEnemy } from '../src/sim/enemies';
import {
  bossUpdate,
  escalationDamageMul,
  escalationSpeedMul,
  escalationStacks,
  escalationVulnerabilityMul,
  UNREACHABLE_THRESHOLD,
} from '../src/sim/boss';
import { buildTower } from '../src/sim/towers';
import { GRID_H, GRID_W } from '../src/sim/grid';
import type { Enemy } from '../src/sim/types';
import type { World } from '../src/sim/world';
import { cfg } from './helpers';

function act2World(): World {
  const run = new Run(cfg());
  const w = run.world;
  w.phase = 'act2';
  w.sundered = true;
  w.warden.x = GRID_W / 2;
  w.warden.y = GRID_H / 2;
  w.updateNav(true);
  return w;
}

function boss(w: World, hpFraction = 1): Enemy {
  const e = spawnEnemy(w, 'warden_eater', w.warden.x + 6, w.warden.y, { overlay: false })!;
  e.hp = e.maxHp * hpFraction;
  return e;
}

describe('p8d: boss escalation (§9 addendum)', () => {
  it('stays at zero stacks before the boss spawns and before 3:00 of boss-fight time', () => {
    const w = act2World();
    expect(escalationStacks(w)).toBe(0); // bossSpawnTime still -1
    w.bossSpawnTime = 0;
    w.act2Time = 179.9;
    expect(escalationStacks(w)).toBe(0);
    expect(escalationDamageMul(w)).toBe(1);
    expect(escalationSpeedMul(w)).toBe(1);
  });

  it('gains a stack at 3:00 and one more every 30s after, without a cap', () => {
    const w = act2World();
    w.bossSpawnTime = 0;
    w.act2Time = 180;
    expect(escalationStacks(w)).toBe(1);
    w.act2Time = 209.9;
    expect(escalationStacks(w)).toBe(1);
    w.act2Time = 210;
    expect(escalationStacks(w)).toBe(2);
    w.act2Time = 180 + 30 * 40;
    expect(escalationStacks(w)).toBe(41);
    expect(escalationDamageMul(w)).toBeCloseTo(1 + 0.1 * 41, 6);
    expect(escalationSpeedMul(w)).toBeCloseTo(1 + 0.05 * 41, 6);
  });

  it('measures Act II elapsed time from the boss spawning, not from Act II starting', () => {
    const w = act2World();
    w.act2Time = 500;
    w.bossSpawnTime = 400; // boss spawned late, only 100s into its own fight
    expect(escalationStacks(w)).toBe(0);
  });

  it('escalates even for a boss placed by any spawn path, not just spawnFinalBoss', () => {
    // qa-playtester repro: the practice panel's generic debug "Spawn enemy"
    // tool (src/ui/hud.ts) lists every enemy unfiltered, `warden_eater`
    // included, and calls `spawnEnemy` directly — it never sets
    // `bossSpawned`/`bossSpawnTime`, which only `spawnFinalBoss` (act2.ts)
    // does. Without the lazy latch in `bossUpdate`, that boss never escalates
    // at all: `bossSpawnTime` stays -1 forever, so this guarantee's actual
    // mechanism silently never engages for it.
    const w = act2World();
    expect(w.bossSpawnTime).toBe(-1);
    const e = boss(w, 1); // uses spawnEnemy directly, exactly like the debug tool
    w.act2Time = 0;
    bossUpdate(w, e, 1 / 60);
    expect(w.bossSpawnTime).toBe(0); // latched on first sight, not left at -1

    w.act2Time = 20 * 60; // 20 simulated minutes later
    expect(escalationStacks(w)).toBeGreaterThan(0);
    expect(escalationDamageMul(w)).toBeGreaterThan(1);
  });

  it('an unbounded multiplier eventually overwhelms a sustain rate the un-escalated boss cannot break', () => {
    const w = act2World();
    w.bossSpawnTime = 0;
    const e = boss(w, 1);
    // In continuous contact for the whole test: a synthetic worst case (a
    // scripted bot standing in a sustain loop, never dying to positioning).
    e.x = w.warden.x;
    e.y = w.warden.y;
    e.bossAction = 2; // CHARGING (boss.ts's internal encoding — bossPhase/bossAction are already asserted as plain numbers in tests/boss.test.ts)
    e.chargeVx = 0;
    e.chargeVy = 0;
    e.bossTimer = 1e9; // never lets the charge state machine exit on its own
    const wd = w.warden;
    wd.hp = w.derived.maxHp;

    // Un-escalated full-contact charge DPS (CHARGE_DAMAGE=14, applied as
    // `CHARGE_DAMAGE * dt * 2` every tick): 28/s. A sustain rate well above
    // that is a stalemate for the *base* kit — the run only resolves once
    // escalation's multiplier drags the effective DPS past it.
    const BASELINE_DPS = 28;
    const SUSTAIN_PER_SECOND = 100;
    expect(SUSTAIN_PER_SECOND).toBeGreaterThan(BASELINE_DPS);

    const dt = 1; // coarse dt: this drives the pure boss.ts function directly, not the fixed-60Hz sim loop
    let seconds = 0;
    const capSeconds = 60 * 60; // the run's own 60-sim-minute boss cap
    let diedAt = -1;
    while (seconds < capSeconds) {
      wd.hp = Math.min(w.derived.maxHp, wd.hp + SUSTAIN_PER_SECOND * dt);
      w.act2Time = seconds;
      bossUpdate(w, e, dt);
      seconds += dt;
      if (w.dying === 'defeat_warden') {
        diedAt = seconds;
        break;
      }
    }

    expect(diedAt).toBeGreaterThan(0);
    expect(diedAt).toBeLessThan(capSeconds);
    // Confirms this genuinely needed escalation, not just base damage over a
    // long enough window: resolution only happens once stacks push the
    // multiplier past sustain/baseline.
    const stacksAtDeath = escalationStacks(w);
    expect(1 + 0.1 * stacksAtDeath).toBeGreaterThan(SUSTAIN_PER_SECOND / BASELINE_DPS);
  });
});

describe('p10k: boss pacing damage-taken ramp (G1×G14)', () => {
  it('stays at 1x before PACING_START, then steps every PACING_INTERVAL without cap', () => {
    const w = act2World();
    expect(escalationVulnerabilityMul(w)).toBe(1); // bossSpawnTime still -1
    w.bossSpawnTime = 0;
    w.act2Time = 19.9;
    expect(escalationVulnerabilityMul(w)).toBe(1);
    w.act2Time = 20; // PACING_START
    expect(escalationVulnerabilityMul(w)).toBeCloseTo(1.5, 6); // 1 + 0.5*1
    w.act2Time = 29.9;
    expect(escalationVulnerabilityMul(w)).toBeCloseTo(1.5, 6);
    w.act2Time = 30; // PACING_START + PACING_INTERVAL
    expect(escalationVulnerabilityMul(w)).toBeCloseTo(2, 6); // 1 + 0.5*2
    w.act2Time = 20 + 10 * 40;
    expect(escalationVulnerabilityMul(w)).toBeCloseTo(1 + 0.5 * 41, 6);
  });

  it('measures elapsed time from the boss spawning, not from Act II starting', () => {
    const w = act2World();
    w.act2Time = 100;
    w.bossSpawnTime = 90; // boss spawned late, only 10s into its own fight
    expect(escalationVulnerabilityMul(w)).toBe(1);
  });

  it('multiplies damage taken by a boss enemy once ramped, and leaves a non-boss enemy untouched', () => {
    const w = act2World();
    w.bossSpawnTime = 0;
    w.act2Time = 20; // one pacing stack -> 1.5x damage taken
    expect(escalationVulnerabilityMul(w)).toBeCloseTo(1.5, 6);

    const bossEnemy = boss(w, 1);
    bossEnemy.armor = 0;
    const bossHpBefore = bossEnemy.hp;
    const bossDealt = damageEnemy(w, bossEnemy, 100, 'test', { pure: true });
    expect(bossDealt).toBeCloseTo(150, 6);
    expect(bossHpBefore - bossEnemy.hp).toBeCloseTo(150, 6);

    const husk = spawnEnemy(w, 'husk', w.warden.x + 6, w.warden.y, { overlay: false })!;
    husk.armor = 0;
    const huskHpBefore = husk.hp;
    const huskDealt = damageEnemy(w, husk, 100, 'test', { pure: true });
    expect(huskDealt).toBeCloseTo(100, 6); // no boss flag, no ramp applied
    expect(huskHpBefore - husk.hp).toBeCloseTo(100, 6);
  });

  it('does not apply to gatebreaker: it carries TRAIT.boss but is not the final boss', () => {
    // qa-playtester repro: gatebreaker (data/enemies.json) carries the same
    // `boss` trait as warden_eater without being TRAIT.finalBoss. It cannot
    // co-spawn with the real boss through normal director/spawn logic, but
    // the practice panel's debug spawn tool can place it in Act II after
    // `bossSpawnTime` is already set — the ramp must not follow the broad
    // `e.boss` flag or an unrelated elite would inherit it.
    const w = act2World();
    w.bossSpawnTime = 0;
    w.act2Time = 20; // one pacing stack -> 1.5x damage taken, for the real boss only
    expect(escalationVulnerabilityMul(w)).toBeCloseTo(1.5, 6);

    const gatebreaker = spawnEnemy(w, 'gatebreaker', w.warden.x + 6, w.warden.y, { overlay: false })!;
    expect(gatebreaker.boss).toBe(true); // has the boss trait...
    gatebreaker.armor = 0;
    const hpBefore = gatebreaker.hp;
    const dealt = damageEnemy(w, gatebreaker, 100, 'test', { pure: true });
    expect(dealt).toBeCloseTo(100, 6); // ...but not the finalBoss ramp
    expect(hpBefore - gatebreaker.hp).toBeCloseTo(100, 6);
  });
});

describe('p8d: unreachable Warden (§9 addendum)', () => {
  /** Seals `(cx, cy)` behind a full ring of towers, leaving only the center tile open. */
  function sealRing(w: World, cx: number, cy: number): void {
    w.phase = 'act1_build';
    w.gold = 1_000_000;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        w.warden.x = cx + dx + 0.5;
        w.warden.y = cy + dy + 0.5;
        const r = buildTower(w, 1, cx + dx, cy + dy);
        if (!r.ok) throw new Error(`sealRing: build failed at ${cx + dx},${cy + dy}: ${r.reason}`);
      }
    }
    w.phase = 'act2';
    w.warden.x = cx + 0.5;
    w.warden.y = cy + 0.5;
    w.updateNav(true);
  }

  it('chips the nearest structure once it cannot path to the Warden at all', () => {
    const w = act2World();
    const cx = 18;
    const cy = 10;
    sealRing(w, cx, cy);
    const wallTower = w.structures.find((s) => s.tx === cx + 1 && s.ty === cy)!;
    expect(wallTower).toBeTruthy();
    const startHp = wallTower.hp;

    const e = boss(w, 1); // spawns far outside the ring
    e.x = cx + 2.5; // adjacent to the east wall tile, well outside the ring
    e.y = cy + 0.5;
    // Isolate the unreachable-fallback from the scripted charge (which would
    // otherwise shatter the wall itself once its own cooldown, 0 at spawn,
    // elapses) — this test is about `updateUnreachable`, not the charge.
    e.bossTimer = 1e9;
    const coreHpBefore = w.coreHp;

    const dt = 1 / 60;
    for (let i = 0; i < Math.round((UNREACHABLE_THRESHOLD + 2) * 60); i++) {
      w.rebuildBuckets();
      bossUpdate(w, e, dt);
    }

    expect(wallTower.hp).toBeLessThan(startHp);
    expect(w.coreHp).toBe(coreHpBefore); // a reachable structure absorbs the attack, not the Core
  });

  it('damages the Core directly once no structure is within reach', () => {
    const w = act2World();
    const cx = 18;
    const cy = 10;
    sealRing(w, cx, cy);

    const e = boss(w, 1); // spawns 6 tiles from center — every wall tile is >2.5 tiles away
    e.bossTimer = 1e9; // isolate from the scripted charge, as above
    const coreHpBefore = w.coreHp;
    expect(coreHpBefore).toBeGreaterThan(0);

    const dt = 1 / 60;
    for (let i = 0; i < Math.round((UNREACHABLE_THRESHOLD + 2) * 60); i++) {
      w.rebuildBuckets();
      bossUpdate(w, e, dt);
    }

    expect(w.coreHp).toBeLessThan(coreHpBefore);
  });

  it('does not chip the Core in god mode: the T4 practice invariant covers this fallback too', () => {
    const w = act2World();
    const cx = 18;
    const cy = 10;
    sealRing(w, cx, cy);
    w.godMode = true;

    const e = boss(w, 1); // spawns 6 tiles from center — every wall tile is >2.5 tiles away
    e.bossTimer = 1e9; // isolate from the scripted charge, as above
    const coreHpBefore = w.coreHp;

    const dt = 1 / 60;
    for (let i = 0; i < Math.round((UNREACHABLE_THRESHOLD + 2) * 60); i++) {
      w.rebuildBuckets();
      bossUpdate(w, e, dt);
    }

    expect(w.coreHp).toBe(coreHpBefore);
  });

  it('resets the unreachable timer the moment a route opens back up', () => {
    const w = act2World();
    const cx = 18;
    const cy = 10;
    sealRing(w, cx, cy);
    const e = boss(w, 1);
    e.x = cx + 2.5;
    e.y = cy + 0.5;
    e.bossTimer = 1e9; // isolate from the scripted charge, as above

    const dt = 1 / 60;
    for (let i = 0; i < Math.round((UNREACHABLE_THRESHOLD - 1) * 60); i++) {
      w.rebuildBuckets();
      bossUpdate(w, e, dt);
    }
    expect(e.bossUnreachableTime).toBeGreaterThan(0);

    // Break the ring open: a route exists again.
    const gap = w.structures.find((s) => s.tx === cx + 1 && s.ty === cy)!;
    w.removeStructure(gap);
    w.updateNav(true);
    w.rebuildBuckets();
    bossUpdate(w, e, dt);
    expect(e.bossUnreachableTime).toBe(0);
  });
});

describe('p8d: Core loss ends the run in Act II too', () => {
  it('defeat_core is reachable once huntsWarden is true, not just in Act I', () => {
    const run = new Run(cfg());
    const w = run.world;
    w.phase = 'act2';
    w.sundered = true;
    w.warden.x = GRID_W / 2;
    w.warden.y = GRID_H / 2;
    w.updateNav(true);

    run.step(emptyInput());
    expect(w.outcome).toBe('running');

    w.coreHp = 0;
    run.step(emptyInput());
    expect(w.dying).toBe('defeat_core');

    for (let i = 0; i < 100 && w.outcome === 'running'; i++) run.step(emptyInput());
    expect(w.outcome).toBe('defeat_core');
  });
});
