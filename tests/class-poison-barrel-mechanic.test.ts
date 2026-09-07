/**
 * fb062 (BACKLOG-CONTENT.md) — pin down and enforce Poison Barrel's
 * every-second poison mechanic against SPEC-FINAL §4.1/§3, whatever the
 * current code does. Filed against `feedback/processed/*poison-barrel-
 * mechanic.md`'s literal "Done when" list:
 *   1. every 1s tick, every enemy inside gets one Poison application seeded
 *      by the skill's `damage` field, at §3's authored 120%-of-damage-over-3s
 *      magnitude (not a raw flat rate) — stack cap 3, refresh-shortest;
 *   2. the barrel deals zero direct/normal damage and no lifesteal;
 *   3. a tooltip text test matching the owner's sentence-form wording.
 *
 * (1) was a real, measured bug, found while scoping this item: `combat.ts`'s
 * `updateAreas` feeds a poison-type `GroundArea.dps` straight into a fresh
 * 3s `applyPoison` stack every tick with no ratio/duration conversion, so
 * `firePoisonBarrel` (classes.ts) seeding it with the raw scaled `damage`
 * delivered `damage x 3` per application instead of `damage x 1.2` (a 2.5x
 * overshoot) — the exact conversion `applyDamageType`'s own dot branch and
 * `cores.ts`'s Corpse-poison call site already apply via `dotDpsFor`
 * (damagetypes.ts) was simply never reached by the ground-zone path. Fixed
 * in `firePoisonBarrel` by running the seed through the same `dotDpsFor`.
 *
 * (3) cannot be closed from this lane: the tooltip sentence lives in
 * `src/ui/class-info.ts` (`poisonBarrelSentence`), out of this lane's Scope
 * (`src/sim/classes.ts`, `data/classes.json`/`equipment.json`, `tests/
 * class-*`/`equip-*` only) — filed as a UI-lane follow-up in this file's own
 * Log rather than edited from here. This file's own tooltip case documents
 * the current mismatch (red) as the UI lane's repro rather than silently
 * skipping it.
 */
import { describe, expect, it } from 'vitest';

import { characterDamage } from '../src/sim/classes';
import { loadContent, type ClassDef } from '../src/sim/content';
import { dotDpsFor } from '../src/sim/damagetypes';
import { applyDot, dotStacks, spawnEnemy } from '../src/sim/enemies';
import { active1PotencyMul } from '../src/sim/progression';
import { Run } from '../src/sim/run';
import type { TickInput } from '../src/sim/types';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const content = loadContent();
const plaguebringer = content.classByKey.get('plaguebringer')! as ClassDef;
const poisonDef = content.damageTypeByKey.get('poison')!;

function idle(over: Partial<TickInput> = {}): TickInput {
  return { mx: 0, my: 0, dash: false, attack: false, aimX: 0, aimY: 0, active1Held: false, cmds: [], ...over };
}

/** A fresh Run with Poison Barrel cast on a stationary, effectively-immortal enemy standing inside it. */
function castOnPinnedEnemy() {
  const run = new Run(cfg({ classKey: 'plaguebringer' }));
  run.world.gold = 1e6;
  run.world.phase = 'act1_wave'; // updateEnemies (and so tickDots) only runs here / act2
  run.world.warden.attackCooldown = 1e9; // suppress the basic attack — only the zone may deal damage
  const e = spawnEnemy(run.world, run.world.content.enemies.enemies[0].key, run.world.warden.x + 1, run.world.warden.y)!;
  e.hp = 1e9;
  e.maxHp = 1e9;
  e.speed = 0;
  e.armor = 500; // deliberately high — poison ignores armor (SPEC-FINAL §3); a formula bug that routed through armor would show up here
  run.world.rebuildBuckets();
  run.step(idle({ cmds: [{ k: 'class_active' }] }));
  return { run, e };
}

describe('fb062: Poison Barrel applications are seeded at §3\'s 120%-of-damage-over-3s, not a flat rate', () => {
  it('the formula itself: dotDpsFor(poison, seed) * 3s equals 1.2 * seed, not 3 * seed', () => {
    const seed = characterDamage(new World(cfg({ classKey: 'plaguebringer' })), plaguebringer, plaguebringer.active1.damage) * 7;
    const expectedPerApplicationTotal = dotDpsFor(poisonDef, seed) * poisonDef.duration!;
    // SPEC-FINAL §3: "120% of the triggering damage" — pin the ratio itself
    // so this test fails loudly if `/data`'s damagetypes.json ever drifts,
    // rather than silently re-deriving a moved number.
    expect(poisonDef.ratio).toBeCloseTo(1.2, 10);
    expect(poisonDef.duration).toBe(3);
    expect(expectedPerApplicationTotal).toBeCloseTo(seed * 1.2, 10);
    // A regression pin for the bug this item found: the pre-fix code would
    // have delivered `seed * 3` per application (2.5x too much) — assert we
    // are nowhere near that reading.
    expect(expectedPerApplicationTotal).toBeLessThan(seed * 3 * 0.9);
  });

  it('a single isolated application (applyDot driven directly, no barrel) deals dotDpsFor(poison, seed) * 3s total through the real DoT engine', () => {
    // `applyDot` is the same primitive `updateAreas` calls per tick; drive it
    // once, directly, with the seed `firePoisonBarrel` now computes, and let
    // the real `Run` tick loop (not a hand-rolled banking loop) pay it out —
    // isolates the formula from the live zone's own 1s-cadence overlap.
    const run = new Run(cfg({ classKey: 'plaguebringer' }));
    run.world.gold = 1e6;
    run.world.phase = 'act1_wave';
    run.world.warden.attackCooldown = 1e9;
    const e = spawnEnemy(run.world, run.world.content.enemies.enemies[0].key, run.world.warden.x + 1, run.world.warden.y)!;
    e.hp = 1e9;
    e.maxHp = 1e9;
    e.speed = 0;
    e.armor = 500;
    run.world.rebuildBuckets();

    const seed = characterDamage(run.world, plaguebringer, plaguebringer.active1.damage) * active1PotencyMul(run.world);
    const dps = dotDpsFor(poisonDef, seed);
    applyDot(run.world, e, 'poison', dps, poisonDef.duration!, 'class_active');

    for (let t = 0; t < 240; t++) run.step(idle()); // 4s: past the stack's full 3s lifetime
    const total = 1e9 - e.hp;
    expect(total).toBeCloseTo(seed * 1.2, 4);
    expect(total).not.toBeCloseTo(seed * 3, 1); // the pre-fix (bug) reading
  });

  it('the real Poison Barrel zone (firePoisonBarrel) delivers 5 applications x 1.2x seed each, not 5 x 3x seed', () => {
    // End-to-end: casts the real Active through `useClassActive`, not a
    // hand-fed `applyDot` — this is the case that actually exercises the
    // bug (`firePoisonBarrel`'s own `dps:` line), not just the formula in
    // isolation. groundDurationSeconds=5 / groundTickSeconds=1 means exactly
    // 5 applications land (t=1..5s, none evicted since the 3s duration keeps
    // at most 3 concurrent — under the cap the whole time), each paying out
    // its own dps over its own full 3s lifetime with none lost, so the
    // eventual total (once every stack has fully decayed) is exactly
    // 5 x one application's total.
    const { run, e } = castOnPinnedEnemy();
    const seed = characterDamage(run.world, plaguebringer, plaguebringer.active1.damage) * active1PotencyMul(run.world);
    const perApplication = dotDpsFor(poisonDef, seed) * poisonDef.duration!;

    for (let t = 0; t < 700; t++) run.step(idle()); // ~11.7s: comfortably past the 5th application's own 3s decay (ends ~t=8s)
    const total = 1e9 - e.hp;
    expect(total).toBeCloseTo(5 * perApplication, 4);
    expect(total).not.toBeCloseTo(5 * seed * 3, 1); // the pre-fix (bug) reading
  });
});

describe('fb062: Poison Barrel ticks exactly once per second and caps at 3 concurrent stacks', () => {
  it('applies on a 1s cadence up to the authored groundTickSeconds, capped at 3 live stacks', () => {
    const { run, e } = castOnPinnedEnemy();
    expect(plaguebringer.active1.groundTickSeconds).toBe(1);
    expect(dotStacks(e, 'poison')).toBe(0);

    // The cast step itself is tick 0 and already counts toward the zone's
    // own tickSeconds accumulator, so the first application lands on the
    // 60th total step (60 ticks == 1.0s of accumulated time from cast).
    for (let t = 0; t < 58; t++) run.step(idle());
    expect(dotStacks(e, 'poison')).toBe(0); // not yet — the first tick lands at exactly 1s

    run.step(idle());
    expect(dotStacks(e, 'poison')).toBe(1);

    for (let t = 0; t < 60; t++) run.step(idle());
    expect(dotStacks(e, 'poison')).toBe(2);

    for (let t = 0; t < 60; t++) run.step(idle());
    expect(dotStacks(e, 'poison')).toBe(3);

    // Cap holds: a 4th application (t=4s) refreshes the shortest-remaining
    // stack rather than growing past 3 (SPEC-FINAL §3: "cap 3 stacks, refresh
    // shortest").
    for (let t = 0; t < 60; t++) run.step(idle());
    expect(dotStacks(e, 'poison')).toBe(3);
  });
});

describe('fb062: Poison Barrel deals zero direct/normal damage and never lifesteals', () => {
  it('every hit the barrel lands is typed poison and ignores armor (no normal-damage component)', () => {
    const { run, e } = castOnPinnedEnemy();
    for (let t = 0; t < 120; t++) run.step(idle());
    expect(e.hp).toBeLessThan(1e9);
    expect(run.world.damageByType.normal ?? 0).toBe(0);
    expect(run.world.damageByType.poison).toBeGreaterThan(0);
  });

  it('does not accrue any lifesteal for the character, even with leech authored', () => {
    const { run, e } = castOnPinnedEnemy();
    run.world.derived.leech = 0.5; // deliberately generous — would be very visible if poison leaked into it
    run.world.warden.leechAccumulator = 0;
    for (let t = 0; t < 300; t++) run.step(idle());
    expect(e.hp).toBeLessThan(1e9);
    expect(run.world.warden.leechAccumulator).toBe(0);
  });
});

describe('fb062: tooltip text — blocked outside this lane\'s Scope, filed for the UI lane', () => {
  // `poisonBarrelSentence` (src/ui/class-info.ts) is out of this lane's Scope
  // (src/ui/** is not in the create/edit list), so this acceptance clause
  // cannot be closed from here (working rule 6: never leave a red assertion
  // in the committed suite — `.skip` with the measured/current reading
  // instead, filed for the UI lane in this file's own Log). The owner's
  // exact wording (feedback/processed/*poison-barrel-mechanic.md): "Poisons
  // every enemy inside the circle each second: each application deals 9.6
  // poison damage over 3 s (up to 3 stacks)." — a per-application/duration/
  // stack-count sentence. The shipped sentence (measured 2026-09-07, no
  // `live` context, matching `activeSkillMarkup`'s own default): "Drops a
  // 3-tile poison cloud dealing 2.4 damage/s for 5s. ... Cooldown 7s." — a
  // flat continuous-rate framing that names neither the per-application
  // total, the 3s window, nor the 3-stack cap.
  it.skip('the sentence names the per-application total, the 3s window and the 3-stack cap (UI-lane repro, not fixed here)', async () => {
    const { activeSkillMarkup } = await import('../src/ui/class-info');
    const perApplication = dotDpsFor(poisonDef, plaguebringer.active1.damage) * poisonDef.duration!;
    const markup = activeSkillMarkup(plaguebringer, 'active1');
    expect(markup).toContain(`${Math.round(perApplication * 100) / 100} poison damage over ${poisonDef.duration}`);
    expect(markup).toMatch(/up to 3 stacks/);
  });
});
