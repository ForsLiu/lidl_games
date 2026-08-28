/**
 * Q120 ORDER 1 (owner verdict, feedback/verdicts-q1-121, applied immediately
 * after `p8a`): "Minimal taunt: a taunted enemy (Clarion Taunt r6; Recall
 * Totem's TD taunt) sets its pathing destination to the taunting entity for
 * the stated duration — per-enemy target override, TD and VS, hashed state,
 * regression test covering the leak-catch case."
 *
 * Q120(5) had shipped both Actives with this half explicitly unbuilt ("the
 * sim has no targeting-priority mechanism for an enemy to be redirected
 * with") — this file is that mechanism landing: `Enemy.tauntRemaining`/
 * `tauntKind` (types.ts), applied as a cast-time snapshot for Clarion Taunt
 * and a continuous per-tick re-tag for Recall Totem (`classes.ts`), read by
 * `updateEnemies` (`enemies.ts`) to override the per-enemy movement target
 * with a live (not snapshotted) lookup of the taunting entity's position, and
 * moved via the same direct-line beeline fallback flying/ghosting enemies
 * already use — deliberately not a new flow field toward an arbitrary point,
 * per the order's own "minimal" framing.
 *
 * "TD and VS" is the mechanism's scope, not a claim both named Actives change
 * behavior in both phases: Clarion Taunt is a real redirect only in TD
 * (everyone already hunts the Warden in VS, and the Paladin *is* the Warden,
 * so the override there resolves to the same point); Recall Totem's taunt is
 * explicitly TD-only in the SPEC-FINAL prose ("in TD it taunts nearby
 * enemies") and is phase-gated accordingly.
 */
import { describe, expect, it } from 'vitest';

import { applyCommand, hashWorld, Run } from '../src/sim/run';
import { spawnEnemy, tauntTarget, TAUNT_TOTEM, TAUNT_WARDEN } from '../src/sim/enemies';
import { updateClassSummons } from '../src/sim/classes';
import { CORE_X, CORE_Y, GRID_H } from '../src/sim/grid';
import { buildTower } from '../src/sim/towers';
import { emptyInput } from '../src/sim/types';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const DT = 1 / 60;

describe('Q120 ORDER 1: minimal taunt — per-enemy pathing destination override', () => {
  it("Clarion Taunt tags every enemy inside r6 at cast time; tagged enemies then chase the Warden's live position instead of the Core", () => {
    const run = new Run(cfg({ classKey: 'paladin' }));
    const w = run.world;
    w.phase = 'act1_wave';
    w.spawnQueue = [];
    w.warden.x = 10;
    w.warden.y = 10;
    w.warden.attackCooldown = 1e9; // isolate the Active from the basic attack

    const key = w.content.enemies.enemies[0].key;
    const inRange = spawnEnemy(w, key, 11, 10)!;
    inRange.speed = 3;
    const outOfRange = spawnEnemy(w, key, 30, 15)!; // outside r6 of the cast point
    outOfRange.speed = 3;
    w.rebuildBuckets();

    applyCommand(w, { k: 'class_active' });

    expect(inRange.tauntRemaining).toBeGreaterThan(0);
    expect(inRange.tauntKind).toBe(TAUNT_WARDEN);
    // Never inside r6 at cast time: this is a snapshot, not a standing aura.
    expect(outOfRange.tauntKind).toBe(0);
    expect(outOfRange.tauntRemaining).toBe(0);

    // The Warden moves after the tag lands. A taunted enemy has to follow the
    // live position each tick, not the point it happened to be cast from —
    // otherwise this would be indistinguishable from a one-shot knockback.
    w.warden.x = 2;
    w.warden.y = 2;
    for (let i = 0; i < 60; i++) run.step(emptyInput());

    // Toward the Warden's new spot (2,2), both coordinates fall. Toward the
    // Core (CORE_X=25, CORE_Y=9) x would instead rise sharply.
    expect(inRange.x).toBeLessThan(11);
    expect(inRange.y).toBeLessThan(10);
  });

  it('Recall Totem taunts nearby enemies while its owner is in TD', () => {
    const run = new Run(cfg({ classKey: 'animist' }));
    const w = run.world;
    w.phase = 'act1_wave';
    w.spawnQueue = [];
    w.warden.x = 5;
    w.warden.y = 5;
    w.warden.attackCooldown = 1e9;

    applyCommand(w, { k: 'class_active2' }); // places the totem at (5,5)
    const totem = w.classSummons.find((s) => s.kind === 'animist_totem');
    expect(totem).toBeDefined();

    const key = w.content.enemies.enemies[0].key;
    // Distance 3 from the totem, inside its radius-4 aura.
    const near = spawnEnemy(w, key, 5, 8)!;
    near.speed = 3;
    w.rebuildBuckets();

    run.step(emptyInput()); // one tick lets updateClassSummons re-tag it

    expect(near.tauntKind).toBe(TAUNT_TOTEM);
    expect(near.tauntRemaining).toBeGreaterThan(0);

    for (let i = 0; i < 30; i++) run.step(emptyInput());

    // Toward the totem at (5,5): y falls, x stays near 5. Toward the Core
    // (25,9) x would instead be climbing sharply toward 25.
    expect(near.y).toBeLessThan(8);
    expect(near.x).toBeLessThan(10);
  });

  it('Recall Totem does not taunt during VS — "in TD" is a real phase gate, not a no-op description', () => {
    const w = new World(cfg({ classKey: 'animist' }));
    w.phase = 'act2';
    w.warden.x = 5;
    w.warden.y = 5;

    applyCommand(w, { k: 'class_active2' });
    expect(w.classSummons.some((s) => s.kind === 'animist_totem')).toBe(true);

    const key = w.content.enemies.enemies[0].key;
    const near = spawnEnemy(w, key, 5, 8, { overlay: false })!;
    w.rebuildBuckets();

    updateClassSummons(w, DT);

    expect(near.tauntKind).toBe(0);
    expect(near.tauntRemaining).toBe(0);
  });

  it('a taunted enemy standing on the Core tile still leaks — the tile-based catch does not care what its taunt target was', () => {
    const run = new Run(cfg({ classKey: 'paladin' }));
    const w = run.world;
    w.phase = 'act1_wave';
    w.spawnQueue = [];
    w.warden.x = 2;
    w.warden.y = 2;
    w.warden.attackCooldown = 1e9;

    const key = w.content.enemies.enemies[0].key;
    const e = spawnEnemy(w, key, CORE_X + 0.5, CORE_Y + 0.5, { overlay: false })!;
    e.speed = 0; // stands still: isolates the leak check from the movement override
    e.tauntRemaining = 5;
    e.tauntKind = TAUNT_WARDEN;
    w.rebuildBuckets();

    expect(w.leaks).toBe(0);
    run.step(emptyInput());
    expect(w.leaks).toBe(1);
  });

  it('a totem-taunt tag outliving the totem itself resolves to no override, not a stale beeline toward where the totem used to be', () => {
    // code review (Q120 ORDER 1): the totem's continuous re-tag decays over
    // TOTEM_TAUNT_SECONDS after an enemy leaves range, but the totem can also
    // just be gone outright (expired, or a second cast replacing it) while an
    // enemy's tag is still counting down. `tauntTarget` — the single function
    // `moveEnemy`'s `beeline` flag is derived from — must return null in that
    // case so the caller falls back to real flow-field pathing, not a beeline
    // toward a point resolved from a totem that no longer exists.
    const w = new World(cfg({ classKey: 'animist' }));
    const key = w.content.enemies.enemies[0].key;
    const e = spawnEnemy(w, key, 5, 8)!;
    e.tauntRemaining = 0.3; // still inside the totem's own decay tail
    e.tauntKind = TAUNT_TOTEM;
    // No totem in w.classSummons at all — expired, sold, or never re-cast.
    expect(tauntTarget(w, e)).toBeNull();
  });

  it('a totem-taunt tag survives its totem being replaced by a fresh cast, not just expiring outright — the leftover tag falls back to no override rather than snapping onto the new totem', () => {
    // qa-playtester finding: `tauntTarget`'s totem lookup originally matched
    // "any live `animist_totem`," so an enemy tagged by a totem that gets
    // replaced (recast before its own lifetime ends) would redirect its
    // beeline onto the *new* totem's position for the rest of its decay
    // window, even though it was never near the new totem. Fixed by matching
    // on the specific `ClassSummon.id` that applied the tag.
    const w = new World(cfg({ classKey: 'animist' }));
    w.phase = 'act1_wave';
    w.warden.x = 5;
    w.warden.y = 5;
    applyCommand(w, { k: 'class_active2' }); // totem #1 at (5,5)
    const totem1 = w.classSummons.find((s) => s.kind === 'animist_totem')!;

    const key = w.content.enemies.enemies[0].key;
    const e = spawnEnemy(w, key, 6, 5, { overlay: false })!;
    e.speed = 0;
    w.rebuildBuckets();
    updateClassSummons(w, DT); // tags `e` off totem #1

    expect(e.tauntKind).toBe(TAUNT_TOTEM);
    expect(e.tauntSourceId).toBe(totem1.id);

    // A fresh cast replaces totem #1 outright before the tag decays.
    w.warden.active2Cooldown = 0;
    w.warden.x = 50;
    w.warden.y = 50;
    applyCommand(w, { k: 'class_active2' }); // totem #2 at (50,50)
    expect(w.classSummons.filter((s) => s.kind === 'animist_totem')).toHaveLength(1);

    // `e`'s tag still names totem #1's id, which no longer exists — must not
    // resolve onto totem #2's position.
    expect(tauntTarget(w, e)).toBeNull();
  });

  it('a non-positive totemTauntTickSeconds does not tag at all, rather than leaving tauntKind stuck at TAUNT_TOTEM forever (qa-playtester finding, Q120 ORDER 1)', () => {
    // `tickTimers` only clears `tauntKind` back to TAUNT_NONE from inside its
    // `tauntRemaining > 0` branch — assigning a corrupted/misauthored <=0
    // tick would set `tauntRemaining` non-positive in the very tick it's
    // tagged, so that branch never runs and `tauntKind` never resets. Guard
    // it the same way `fireClarionTaunt` already guards its own `duration > 0`.
    const run = new Run(cfg({ classKey: 'animist' }));
    const w = run.world;
    w.phase = 'act1_wave';
    w.spawnQueue = [];
    w.warden.x = 5;
    w.warden.y = 5;

    applyCommand(w, { k: 'class_active2' });
    const totem = w.classSummons.find((s) => s.kind === 'animist_totem')!;
    totem.auraTauntTickSeconds = -1; // simulates a corrupted /data value

    const key = w.content.enemies.enemies[0].key;
    const e = spawnEnemy(w, key, 6, 5, { overlay: false })!;
    w.rebuildBuckets();

    run.step(emptyInput());

    expect(e.tauntKind).toBe(0);
    expect(e.tauntRemaining).toBe(0);
    expect(tauntTarget(w, e)).toBeNull();
  });

  it('Clarion Taunt in VS is a genuine no-op — the enemy is tagged, but tauntTarget defers to the normal flow-routed Warden target rather than overriding it', () => {
    // qa-playtester finding (post-review): the same *destination* is not the
    // same *path*. `w.targetPoint()` in VS already resolves to the Warden's
    // live position, but a taunted enemy taking the beeline branch instead
    // of `flowAim`'s routed flow field could snag on a persisted Act I wall
    // a normally-pathing VS enemy would route around — not a no-op at all.
    // Fixed by having `tauntTarget` itself return null whenever
    // `w.huntsWarden` is true for a `TAUNT_WARDEN` tag, so the caller falls
    // all the way through to ordinary flow-field movement.
    const w = new World(cfg({ classKey: 'paladin' }));
    w.phase = 'act2';
    w.warden.x = 8;
    w.warden.y = 8;
    const key = w.content.enemies.enemies[0].key;
    const e = spawnEnemy(w, key, 9, 8, { overlay: false })!; // inside r6
    w.rebuildBuckets();

    applyCommand(w, { k: 'class_active' });
    expect(e.tauntKind).toBe(TAUNT_WARDEN); // still tagged — the state itself is real
    expect(tauntTarget(w, e)).toBeNull(); // but drives no movement override in VS
  });

  it('a Clarion-tagged enemy in VS routes around a persisted Act I wall exactly like an untagged control, instead of beelining into it (qa-playtester finding)', () => {
    const run = new Run(cfg({ classKey: 'paladin' }));
    const w = run.world;
    w.phase = 'act1_build';
    w.gold = 100000;

    // A full-height wall between the enemies' spawn point and the Warden —
    // a normally-pathing VS enemy routes around it via the flow field; the
    // pre-fix beeline branch would instead walk straight into it and stall.
    const palisadeId = w.content.towerByKey.get('palisade')!.id;
    for (let y = 2; y <= GRID_H - 3; y++) {
      w.warden.x = 15.5;
      w.warden.y = y + 0.5;
      buildTower(w, palisadeId, 15, y);
    }
    w.warden.x = 16.5;
    w.warden.y = 9.5;
    w.phase = 'act2';
    w.grid.refresh();

    const key = w.content.enemies.enemies[0].key;
    const taunted = spawnEnemy(w, key, 13, 9.5, { overlay: true })!;
    taunted.speed = 2;
    w.rebuildBuckets();
    applyCommand(w, { k: 'class_active' }); // real cast, r6 catches `taunted`
    expect(taunted.tauntKind).toBe(TAUNT_WARDEN);
    const control = spawnEnemy(w, key, 13, 9.5, { overlay: true })!;
    control.speed = 2;
    w.rebuildBuckets();

    for (let i = 0; i < 60 * 30; i++) run.step(emptyInput());

    // Both reach the Warden's tile on essentially the same timeline — no
    // divergence from being tagged, even after the taunt window itself
    // (6s) has long since lapsed.
    const reach = 0.6;
    expect(Math.hypot(control.x - w.warden.x, control.y - w.warden.y)).toBeLessThan(reach);
    expect(Math.hypot(taunted.x - w.warden.x, taunted.y - w.warden.y)).toBeLessThan(reach);
  });

  it("a taunted enemy beelining into an unrelated wall is blocked but does not breach it — G7's \"incidental shove on an open path deals nothing\" still holds for a taunt override", () => {
    const run = new Run(cfg({ classKey: 'paladin' }));
    const w = run.world;
    w.phase = 'act1_wave';
    w.spawnQueue = [];
    w.gold = 100000;

    // Warp onto the build tile so build range never interferes (same trick
    // tests/p1a-sealing.test.ts's own `place` helper uses), then place a wall
    // that sits on the straight line between where the enemy spawns and
    // where the Warden will stand once taunt resolves live positions — but
    // is not on any *routed* path to the Core, so a normally-pathing enemy
    // would never touch it at all.
    const palisadeId = w.content.towerByKey.get('palisade')!.id;
    w.warden.x = 10.5;
    w.warden.y = 15.5;
    const built = buildTower(w, palisadeId, 10, 15);
    expect(built.ok).toBe(true);
    const wallHp = built.ok ? built.structure.hp : 0;

    // Cast from beside the enemy so it lands inside r6, then relocate the
    // Warden across the wall — the enemy's taunted beeline now has to cross
    // the wall's tile to reach it.
    w.warden.x = 13.5;
    w.warden.y = 15.5;
    const key = w.content.enemies.enemies[0].key;
    const e = spawnEnemy(w, key, 14, 15, { overlay: false })!;
    e.speed = 3;
    w.rebuildBuckets();

    applyCommand(w, { k: 'class_active' });
    expect(e.tauntKind).toBe(TAUNT_WARDEN);

    w.warden.x = 5.5;
    w.warden.y = 15.5;
    for (let i = 0; i < 90; i++) run.step(emptyInput());

    // Blocked at the wall (never crosses its tile at x=10..11) rather than
    // walking through it or chewing it down.
    expect(e.x).toBeGreaterThan(10.9);
    expect(e.attackingStructure).toBe(0);
    if (built.ok) expect(built.structure.hp).toBe(wallHp);
  });

  it("a totem-taunted enemy beelining into an unrelated wall is blocked but does not breach it, and resumes real pathing once the totem's own lifetime ends — the continuous re-tag is not a permanent soft-lock (code review, Q120 ORDER 1)", () => {
    // The Clarion Taunt wall test above covers a one-shot 4-6s window; the
    // totem's re-tag is continuous for up to `totemDurationSeconds` (15s) as
    // long as the enemy stays in range, so the same G7 guarantee needs its
    // own check on a much longer hold, plus confirmation the hold actually
    // ends rather than pinning the enemy at the wall forever.
    const run = new Run(cfg({ classKey: 'animist' }));
    const w = run.world;
    w.phase = 'act1_wave';
    w.spawnQueue = [];
    w.gold = 100000;
    w.warden.attackCooldown = 1e9; // isolate the taunt from the TD-only basic attack

    // Totem to the west of a two-tile-tall wall; enemy to the east, within
    // its radius-4 aura. Two stacked tiles (not one) because the enemy's
    // spawn y drifts across the row boundary as it beelines toward the
    // totem's own y — a single-row wall would let it slip through on
    // whichever row it happens to be crossing on that tick. The wall is not
    // on the enemy's normal routed path to the Core (25,9), further east.
    const palisadeId = w.content.towerByKey.get('palisade')!.id;
    w.warden.x = 10.5;
    w.warden.y = 14.5;
    buildTower(w, palisadeId, 12, 14);
    w.warden.y = 15.5;
    const built = buildTower(w, palisadeId, 12, 15);
    expect(built.ok).toBe(true);
    const wallHp = built.ok ? built.structure.hp : 0;

    w.warden.x = 10;
    w.warden.y = 15.5;
    applyCommand(w, { k: 'class_active2' }); // totem at (10,15.5), west of the wall
    const totem = w.classSummons.find((s) => s.kind === 'animist_totem');
    expect(totem).toBeDefined();

    const key = w.content.enemies.enemies[0].key;
    const e = spawnEnemy(w, key, 13, 15, { overlay: false })!; // distance 3, inside radius 4
    e.speed = 3;
    w.rebuildBuckets();

    for (let i = 0; i < 90; i++) run.step(emptyInput());

    expect(e.tauntKind).toBe(TAUNT_TOTEM);
    // Blocked at the wall (never crosses its tile at x=12..13, on the east
    // side it started on) rather than walking through it or chewing it down.
    expect(e.x).toBeGreaterThan(12.9);
    expect(e.x).toBeLessThan(13.5);
    expect(e.attackingStructure).toBe(0);
    const pinnedX = e.x;

    // Force the totem's own natural expiry rather than stepping the full
    // real 15s (900+ ticks would cross this world's own build/wave phase
    // boundary and freeze enemy updates entirely, which would prove nothing
    // about the taunt mechanism itself).
    if (totem) totem.remaining = 0.001;
    for (let i = 0; i < 120; i++) {
      w.phase = 'act1_wave';
      run.step(emptyInput());
    }

    expect(w.classSummons.some((s) => s.kind === 'animist_totem')).toBe(false);
    expect(e.tauntKind).toBe(0);
    expect(e.tauntRemaining).toBe(0);
    // Real flow-field pathing resumed and carried it well past where the
    // taunt had it pinned — the Core (25,9) lies further east of the wall,
    // so a resumed enemy keeps moving instead of sitting frozen at the wall
    // forever, the same "not a permanent soft-lock" property the Recall
    // Totem's own headless-run qa-playtester check found but never pinned
    // as a repeatable regression test.
    expect(e.x).toBeGreaterThan(pinnedX + 1);
    if (built.ok) expect(built.structure.hp).toBe(wallHp);
  });

  it('hashWorld covers the new taunt fields — two otherwise-identical worlds differing only there hash differently', () => {
    const a = new World(cfg({ classKey: 'paladin' }));
    const b = new World(cfg({ classKey: 'paladin' }));
    const key = a.content.enemies.enemies[0].key;
    const ea = spawnEnemy(a, key, 10, 10)!;
    spawnEnemy(b, key, 10, 10);

    expect(hashWorld(a)).toBe(hashWorld(b));

    ea.tauntRemaining = 3;
    ea.tauntKind = TAUNT_WARDEN;

    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});
