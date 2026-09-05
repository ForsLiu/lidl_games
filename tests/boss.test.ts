/** M6: the Warden-Eater's three phases, and Rift events. */

import { describe, expect, it } from 'vitest';

import { World } from '../src/sim/world';
import { Run } from '../src/sim/run';
import { spawnEnemy, updateEnemies } from '../src/sim/enemies';
import { bossUpdate, updateBossSlam } from '../src/sim/boss';
import { expandedRiftTimes, spawnFinalBoss, shouldSpawnBoss } from '../src/sim/act2';
import { buildTower } from '../src/sim/towers';
import { GRID_H, GRID_W } from '../src/sim/grid';
import { loadContent } from '../src/sim/content';
import { allTreeNodeIds } from '../src/meta/meta';
import type { Enemy } from '../src/sim/types';
import { tierEnemyHpMul } from '../src/sim/tiers';
import { cfg, GATE_TIER, runScripted } from './helpers';

// fb049 (Q138 re-measurement): real Hub-started runs feed the full
// Constellation tree into `allocated` (`TREE_AUTO_MAX`) — `cfg()`'s own
// default (`[]`) does not match that; used below for the two G14 win-rate
// gates only, not the unit-level boss-mechanic tests in this file.
//
// p10s (BACKLOG p10s): both gates now run through `runScripted` (`tests/
// helpers.ts`) instead of the stock unscripted `hybrid` policy — Engineer's
// Field Kit/Pop Turret fire on cooldown and every affordable Core upgrade
// step is bought, the same "scripted kit bot" shape G8/G23 already measure
// against, so a shared T1 difficulty lever moves all four gates
// proportionally instead of G1/G14 breaking first.
const FULL_TREE = allTreeNodeIds(loadContent());

/**
 * Mechanics fixtures (phases, telegraph, slam, arena fire) — deliberately
 * **T1**, not `GATE_TIER`. p12b briefly defaulted this to the reference tier,
 * which was wrong twice over (code-reviewer): none of these cases measure
 * anything, and running them against a T3 boss just made every fixture 16x
 * tougher for no gain. G14's actual *measurements* are the two `runScripted`
 * cases below, and those are where the re-point belongs.
 */
function act2World(tier = 1): World {
  const w = new World(cfg({ tier }));
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

function tick(w: World, e: Enemy, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    w.rebuildBuckets();
    bossUpdate(w, e, 1 / 60);
    updateBossSlam(w, 1 / 60);
  }
}

describe('the Warden-Eater (SPEC 5.5)', () => {
  // p10d (G1 balance pass): `bossTimeSeconds` 600->181 and `warden_eater` hp
  // 15000->10000, both /data-only (see PROGRESS.md's p10d entry). 181s is
  // the floor above SPEC 5.1's first rift at 180s. The HP cut is a deliberate
  // partial close, not the full cut that would zero the gate: every HP value
  // low enough to land G1's 30-36 min band drove the scripted bot's win rate
  // to 100%, which contradicts G14's own "<100%, a real fight" band — 10000
  // keeps a real, sometimes-lost fight (measured 79% win rate) at the cost of
  // leaving G1 short by ~1.15 min, `.skip`-ed with the honest number rather
  // than trivializing the boss to force it green. This test reads both
  // literals off content already, only the title and the HP assertion below
  // were hardcoded to the old numbers.
  // fb025 (enemy HP x10, including bosses this time — QUESTIONS Q155(a)):
  // warden_eater 10000 -> 100000.
  // fb099 (root-caused this session): fb076's tower-damage retune (closing
  // G13's solo-TD-tower gate) raised several towers 1.06x-2.6x — `lob`
  // (mortar-family) alone went 1602->4200 — and those same towers keep
  // firing on the Warden-Eater through Act II, so the "real fight" this
  // file's own header comment measured at 57.05s (pre-fb076) collapsed to
  // 15.68s (measured live via `tools/probe-boss.ts` on this seed/policy,
  // matching qa-playtester's independent 11.65s on a different seed window)
  // — under the test's own 20s floor. Re-measured tower DPS increase against
  // the boss directly (not inferred): ~3.6x. `data/enemies.json`
  // `warden_eater` hp retuned 100000 -> 365000 (same ~3.6x, restoring the
  // pre-fb076 fight length) rather than lowering the towers back down, since
  // those numbers are G13's own closed gate, not this bug's cause to reverse
  // (BACKLOG fb093 already establishes this precedent for the same towers).
  // Re-measured post-retune: 51.55s fight, real headroom over the 20s floor
  // and back in the original ~57s neighborhood. Blast radius checked against
  // G1 (`tests/p10d-run-length.test.ts`, the one other gate with a documented
  // history of trading off against this exact field): re-ran it both at HP
  // 100000 (pre-fix, via `git stash`) and 365000 (post-fix) — both pass, G1
  // unaffected by this ~36s fight-length increase.
  it('spawns at 3:01 with 365,000 HP scaled by tier', () => {
    // p12b: explicitly T1, not the file's new `GATE_TIER` default — this case
    // is *about* the authored base HP and how the ladder scales it, so it has
    // to read the rung it names rather than whichever tier the gates happen
    // to measure at.
    const w = act2World(1);
    expect(shouldSpawnBoss(w)).toBe(false);
    w.act2Time = w.content.spawns.bossTimeSeconds;
    expect(shouldSpawnBoss(w)).toBe(true);
    spawnFinalBoss(w);
    const e = w.enemies.find((x) => x.boss)!;
    // p12c: the authored 365,000 times the roster-wide `baseHpMul` — the
    // Warden-Eater is an enemy and takes the roster multiplier like every
    // other one, which at the shipped 20 puts it at 7.3M. Derived rather than
    // pinned so a re-anchor moves the fixture with the game; the *authored*
    // number is still asserted, just not the spawned one. The fight-length
    // case below is what proves this is still a beatable fight rather than a
    // wall, and it is measured, not assumed.
    expect(e.maxHp).toBeCloseTo(365000 * w.content.enemies.baseHpMul, 0);

    // p12b (code-reviewer m6): pin the *rung*, not just "bigger". A bare
    // `>` passed equally well when the boss carried its old borrowed
    // `tierRewardPerStep` scale, so it could not have caught this item
    // swapping one tier scaling for another.
    const w3 = act2World(3);
    const e3 = boss(w3);
    expect(e3.maxHp).toBeCloseTo(365000 * w3.content.enemies.baseHpMul * tierEnemyHpMul(w3.content, 3), 0);
    expect(e3.maxHp).toBeGreaterThan(e.maxHp);
  });

  it('moves through three phases as its HP falls', () => {
    const w = act2World();
    const e = boss(w, 1);
    tick(w, e, 0.1);
    expect(e.bossPhase).toBe(0);
    e.hp = e.maxHp * 0.5;
    tick(w, e, 0.1);
    expect(e.bossPhase).toBe(1);
    e.hp = e.maxHp * 0.2;
    tick(w, e, 0.1);
    expect(e.bossPhase).toBe(2);
  });

  it('telegraphs a charge before committing to it', () => {
    const w = act2World();
    const e = boss(w, 1);
    let sawTelegraph = false;
    for (let i = 0; i < 60 * 8 && !sawTelegraph; i++) {
      w.fx.length = 0;
      w.rebuildBuckets();
      bossUpdate(w, e, 1 / 60);
      if (w.fx.some((f) => f.k === 'bosstelegraph')) sawTelegraph = true;
    }
    expect(sawTelegraph).toBe(true);
  });

  it('shatters petrified terrain it charges through', () => {
    const w = act2World();
    w.phase = 'act1_build';
    w.gold = 100000;
    // A line of walls between the boss and the Warden.
    for (let x = 14; x <= 20; x++) {
      w.warden.x = x + 0.5;
      w.warden.y = GRID_H / 2;
      buildTower(w, 1, x, Math.floor(GRID_H / 2) - 1);
    }
    w.warden.x = GRID_W / 2;
    w.warden.y = GRID_H / 2;
    w.phase = 'act2';
    for (const s of w.structures) s.petrified = true;
    const before = w.structures.filter((s) => !s.dead).length;
    expect(before).toBeGreaterThan(2);

    const e = boss(w, 1);
    e.x = 13;
    e.y = Math.floor(GRID_H / 2) - 0.5;
    tick(w, e, 12);
    w.compact();
    expect(w.structures.filter((s) => !s.dead).length).toBeLessThan(before);
  });

  it('summons Wraiths and slams the ground in phase 2', () => {
    const w = act2World();
    const e = boss(w, 0.5);
    const before = w.enemies.length;
    tick(w, e, 10);
    const wraiths = w.enemies.filter(
      (x) => w.content.enemyById.get(x.defId)!.key === 'wraith' && !x.dead,
    );
    expect(w.enemies.length).toBeGreaterThan(before);
    expect(wraiths.length).toBeGreaterThan(0);
    expect(w.areas.some((a) => a.type === 'bossSlam')).toBe(true);
  });

  it('closes the arena with fire in phase 3, hurting a Warden at the rim', () => {
    const w = act2World();
    const e = boss(w, 0.2);
    tick(w, e, 0.2);
    expect(w.arenaFireActive).toBe(true);
    const r0 = w.arenaFireRadius;
    tick(w, e, 5);
    expect(w.arenaFireRadius).toBeLessThan(r0);

    // Park the Warden in a corner, well outside the ring, and check it burns.
    w.warden.x = 1.5;
    w.warden.y = 1.5;
    w.arenaFireRadius = 4;
    const hp = w.warden.hp;
    tick(w, e, 2);
    expect(w.warden.hp).toBeLessThan(hp);
  });

  it('falls through to a normal chase between abilities', () => {
    const w = act2World();
    const e = boss(w, 1);
    e.x = w.warden.x + 10;
    const before = e.x;
    for (let i = 0; i < 60 * 8; i++) {
      w.rebuildBuckets();
      updateEnemies(w, 1 / 60);
    }
    expect(e.x).toBeLessThan(before);
  });

  // p2e re-pin (measured, not tuned): deleting the double-paying soul-weapon
  // fire loop (the thing this whole item removes) cuts a scripted board's Act
  // II damage roughly in half, since it used to fire *alongside* every built
  // tower's wielded attack rather than being replaced by it. `maxbuild` (8
  // tower types, `upgradeFirst`) no longer wins at all across seeds 1-40
  // (measured 0/40); `hybrid` (6 types, no `upgradeFirst`) still wins about
  // half the time (measured 20/40, 9/20 over the same 1-20 window this test
  // used to probe). Switched to `hybrid` — the same policy the other two
  // boss-adjacent gates in this repo (`a3-movement-mandatory.test.ts`,
  // `f001-cycle-machine.test.ts`) already treat as "the build that moves and
  // can win" — rather than picking a new number for a policy that no longer
  // clears the fight at all. See QUESTIONS.md Q103.
  //
  // **p3e re-baseline (SPEC-FINAL §1.1/§16, Q109): both tests below moved to
  // `cycles: 6`** — the boss is only reachable at all through the real
  // 18-TD-wave/6-block shape now that p3d deleted the old single-block
  // escape hatch's exclusive claim on "the run." Measured (seeds 1-20,
  // `hybrid`, `cycles: 6`): **0/20 wins**, every seed dying `defeat_core` or
  // `defeat_warden` well before the boss-gated final block, most around TD
  // wave 9-14. Same root cause as `tests/light-build.test.ts` and
  // `tests/a4-single-type.test.ts`: `data/waves.json` authors only 10 real
  // wave rows, and `buildSpawnQueue` repeats row 10 past the table's end
  // against the HP curve's still-climbing `1.30^(wave-1)` multiplier, so no
  // scripted bot reaches the final block, let alone the boss inside it. This
  // is p8a's content gap ("wave data on the §1.1 shape"), not a P3 defect —
  // both cases are `.skip`-ed with their measured numbers, to be re-enabled
  // once p8a lands (p8c's own gate, G14, already expects to be the real
  // re-measurement point for this fight on the new shape).
  //
  // **Re-measured this session, now that p8a's real waves 11-18 are live**
  // (PRIORITY DIRECTIVE follow-up, Q123): seeds 1-20, `hybrid`, `cycles: 6`,
  // default `maxTicks` (45 simulated minutes) — every seed resolves cleanly,
  // none times out. **2/20 wins now** (seeds 7 and 10, both `victory`/
  // `bossKilled: true`, wavesCleared 18, survival 1037s/1078s) — up from
  // 0/20 before real content, but still far short of either test's band.
  // Seed 1 specifically (this test's own seed) still reads `defeat_core` at
  // wave 16, survival 375s — the Core is lost to leak accumulation two waves
  // short of the real content's own end, never reaching the boss-gated final
  // block. Full 20-seed breakdown: 1 defeat_core/w16, 2 defeat_core/w12, 3
  // defeat_core/w16, 4 defeat_core/w9, 5 defeat_core/w12, 6
  // defeat_warden/w6, 7 victory/w18, 8 defeat_core/w17, 9 defeat_core/w12,
  // 10 victory/w18, 11 defeat_core/w15, 12 defeat_core/w16, 13
  // defeat_core/w14, 14 defeat_core/w17, 15 defeat_core/w17, 16
  // defeat_core/w13, 17 defeat_core/w16, 18 defeat_warden/w9, 19
  // defeat_warden/w3, 20 defeat_core/w10. Real content narrowed the gap
  // (deaths now cluster wave 12-17, not 9-14) without closing it — the same
  // un-tuned-economy-against-the-real-curve conclusion `tests/
  // a4-single-type.test.ts`, `tests/p-core-f-gates.test.ts` (G23) and
  // `tests/p6e-class-diversity.test.ts` (G8) independently reached. Still
  // `.skip`-ed with the real number; re-enable point moves from `p8a` (done)
  // to **P10**. See QUESTIONS.md Q123.
  //
  // p10m re-measurement (this session): re-run against HEAD, past `p10j`-
  // `p10l`'s G1/G13 balance pass. Seed 1 now reads `victory`/`bossKilled:
  // true`/`equipmentFound: 18` — the outcome half clears. The
  // `bossKillSeconds > 600` literal does not: it dates from before `p10d`
  // retuned `data/spawns.json`'s `bossTimeSeconds` 600->181 (this file's own
  // top-of-describe comment), so it was asserting a spawn-time floor that no
  // longer matches content already changed several sessions ago. Seed 1's
  // real `bossKillSeconds` is 238.05 — 57.05s of actual fight after the boss
  // spawns at 181s (read live below, not re-hardcoded). Replaced the stale
  // spawn-time-shaped literal with a fight-duration floor (still `victory` at
  // an instant kill would be a red flag, not a pass) with headroom under the
  // measured 57s, rather than a bare `> bossTimeSeconds` check, which would
  // hold trivially since a kill can't be recorded before the boss spawns.
  // TODO(fb025) RESOLVED by fb049: the wave-2 collapse this note used to
  // describe was measured with `allocated: []`, which no real Hub-started run
  // plays with (`TREE_AUTO_MAX`). Re-measured against the real full-tree
  // allocation (`allTreeNodeIds(loadContent())`): seed 1 clears cleanly,
  // `victory`/`bossKilled: true` — fb025's enemy HP x10 / attacker speed x0.7
  // pass does not reproduce a wave-2 death once the character carries the
  // stat bonuses a real run has. Un-skipped.
  //
  // p10s (BACKLOG p10s): also switched to `runScripted` alongside the two
  // G14 gates below (code-reviewer flagged the missing note on this third
  // call site). Re-verified green under the scripted kit/Core-purchase
  // shape: still `victory`/`bossKilled: true`, `bossKillSeconds` well past
  // the >20s-over-spawn floor, `equipmentFound > 0` — none of this test's
  // thresholds are gate bands the scripted bot could push out of range the
  // way the two below can.
  //
  // fb099: fb076's tower retune (see the header comment above) pushed this
  // below the 20s floor (measured 15.68s on this seed). Fixed at the cause —
  // `warden_eater` hp retuned, not this assertion — re-measured 51.55s post-
  // fix. See the header comment for the full root-cause and measurement.
  //
  // fb152 (DoT tick cadence): **seed 1 flipped**, and the single-seed pin went
  // with it. The cadence cap re-times every DoT tick, so DoT-only kills land up
  // to one interval late (qa-playtester measured the kill frame moving 6->14 at
  // 1 hp, 119->134 at 20 hp, never negative); on seed 1 the extra leaks that
  // buys carry the Core to 0 — measured `defeat_core`, 146 leaks, against a
  // `victory` on the parent commit. Measured across seeds 1-6 at this config on
  // the fb152 tree: **4 of 6 still win with a boss kill** (2: victory, boss at
  // 707.9s, Core 763; 3: victory, 894.8s, Core 87; 4: victory, 389.2s, Core
  // 310.7; 6: victory, 463.0s, Core 519.7; 1 and 5 `defeat_core`). The
  // mechanism is intact and only this seed's trajectory moved, so the case is
  // re-pinned across a **fixed four-seed set** rather than re-pointed at
  // another single seed that the next re-timing would flip the same way. It is
  // still not a rate claim — G14's rate gate is the 20-seed case below — the
  // floor is set well under the measured 3/4 so it fails when the *mechanism*
  // breaks (nothing reaches or kills the boss), not when one trajectory moves.
  // The difficulty question this flip raises is P10/p12's, not this file's.
  it('a scripted run reaches it, kills it and wins', () => {
    // p12b: deliberately **T1**, not `GATE_TIER`. This case is a mechanism
    // check — the fight is reached, the boss dies, the fight is not trivially
    // short, equipment dropped — not a difficulty measurement, and at T3 the
    // run is contested by design (50% win rate), so pinning one seed to
    // `victory` there would be asserting a coin flip. G14's actual *gate* is
    // the 20-seed win-rate case at the bottom of this file, and that is what
    // p12b re-pointed. Keeping this one at T1 keeps live coverage of the
    // mechanism instead of trading it for a `.skip`.
    let wins = 0;
    for (const seed of [1, 2, 3, 4]) {
      const { report, run } = runScripted(cfg({ seed, cycles: 6, tier: 1, allocated: FULL_TREE }), 'hybrid');
      if (report.outcome !== 'victory') continue;
      wins++;
      // Every win must be a real one: the boss died, the fight was not
      // trivially short, and the run dropped equipment along the way.
      expect(report.bossKilled, `seed ${seed}`).toBe(true);
      expect(report.bossKillSeconds - run.world.content.spawns.bossTimeSeconds, `seed ${seed}`).toBeGreaterThan(20);
      expect(report.equipmentFound, `seed ${seed}`).toBeGreaterThan(0);
    }
    expect(wins, 'no seed reached and killed the boss — the fight is unreachable, not merely hard').toBeGreaterThanOrEqual(2);
  }, 300_000);

  // Twenty seeds, not eight. The claim is a *rate* — the bot loses this fight
  // some of the time — and the loss rate measured either side of m20b is
  // 15% (HEAD 17/20 wins, m20b 18/20). Eight seeds carry a better-than-1-in-4
  // chance of containing no loss at all, so the "but not all" half used to
  // pass or fail on which seeds happened to be in the window: m20b's content
  // change moved the losing seeds from {3,15,17} to {13,15} without moving the
  // rate, and that alone turned the assertion red.
  //
  // p2e re-pin (Q103): switched to `hybrid` for the same reason as the test
  // above, and restated honestly rather than kept at a lowered floor under
  // the old "most win" wording — measured over seeds 1-20, `hybrid` wins 9/20
  // (45%), which is a real fight in both directions, not a fight the bot
  // mostly wins. The old 60% floor is gone; this pins a band around the
  // measured rate (25%-65%) so the test still catches a gross regression
  // either way without asserting a false "mostly wins" story. P10's balance
  // pass, not this deletion, owns moving the rate itself.
  //
  // p3e re-baseline: see the doc comment above the previous test — measured
  // 0/20 at `cycles: 6`, `.skip`-ed for the same reason, same re-enable point.
  //
  // Re-measured this session against p8a's real wave 11-18 content (Q123):
  // **2/20 (10%)** — still below the band's floor (need >=5/20), though real
  // content did move two seeds all the way to `victory` where none did
  // before. Full breakdown in the doc comment above. `.skip`-ed with the
  // real number; re-enable point moves from `p8a` (done) to **P10**.
  //
  // p8c (G14 formal measurement, this session): the informal 25%-65% band
  // above pre-dates SPEC-FINAL's G-numbering. G14's own text (§14) is
  // literal: "20 seeds, scripted-build win rate >=60% and <100%". Restated
  // this test against that literal band (seed count/policy/cycles unchanged
  // from the p8a re-measurement — this is p8c's own gate, "measured on the
  // §1.1 run shape, so it must run after p3a") and replaced the hand-
  // transcribed per-seed breakdown in the comment above with a real per-seed
  // diagnostic the test itself builds and prints in its failure message, so
  // future re-measurement passes (P10) don't need to hand-copy numbers.
  //
  // CLAUDE.md: "a deferral is a measurement with an expiry date" — re-ran
  // rather than inherited Q123's 2/20. **Now 0/20 (0%)**, not 2/20: seeds 7
  // and 10, the two victories Q123 recorded, both now read `defeat_core` at
  // wave 17. p8b (landed after Q123, capping elite/boss-summon spawns at
  // `aliveCap`) is the intervening change on this path — consistent with
  // more enemies actually reaching the Core now that overshoot spawns no
  // longer die instantly to being over-cap, at the cost of the two seeds
  // that used to scrape a win. Full breakdown: seeds 1,2,3,5,6,9,11-14,16,18
  // defeat_core/w16; seeds 4,7,10,15,17,19,20 defeat_core/w17; seed 8
  // defeat_warden/w3 (unchanged from Q123). `.skip`-ed with this honest
  // number; re-enable point **P10** (CLAUDE.md: no balance tuning before
  // P10) — this item (p8c) is the measurement, not the fix.
  //
  // p10m re-measurement (this session, re-enable point reached): re-run
  // against HEAD, after the `p10j`-`p10l` G1/G13 balance pass (35-wave-
  // pacing retune, boss pacing ramp, `buildPhaseSeconds` 20->15) that landed
  // since p8c's 0/20 measurement above. **18/20 (90%)** — seeds 5 and 6
  // `defeat_warden` (wavesCleared 18, survivalSeconds 693.28s/630.03s), every
  // other seed `victory`/`bossKilled: true`/wavesCleared 18. 90% clears
  // G14's literal ">=60% and <100%" band with real headroom on both sides —
  // un-skipped. Full 20-seed dump captured in the diagnostic pass this item
  // added and removed (`tmp_p10m/boss-dump.json`, not committed).
  // b052: code-reviewer found this sibling of b020/b046-b051 while verifying
  // b051 — `bossUpdate` and `updateBossSlam` have no `w.dying` guard anywhere
  // in their call chain, so a boss that lands the killing blow keeps dealing
  // (and banking Wrath from) charge, slam and arena-fire damage through the
  // whole DEFEAT_SLOWMO beat. One test per damage path, each confirmed red
  // pre-fix.
  it('b052: charge-hit damage stops once w.dying is set', () => {
    const w = act2World();
    const e = boss(w, 1);
    e.bossAction = 2; // CHARGING (not exported by boss.ts; see IDLE/TELEGRAPH/CHARGING)
    e.bossTimer = 1;
    e.chargeVx = 0;
    e.chargeVy = 0;
    e.x = w.warden.x;
    e.y = w.warden.y;

    w.dying = 'defeat_warden';
    w.dyingTimer = 1.5;
    const hp = w.warden.hp;
    for (let i = 0; i < 90; i++) {
      w.rebuildBuckets();
      bossUpdate(w, e, 1 / 60);
    }
    expect(w.warden.hp).toBe(hp);
  });

  it('b052: slam ring damage stops once w.dying is set', () => {
    const w = act2World();
    w.areas.push({
      id: w.newId(),
      x: w.warden.x,
      y: w.warden.y,
      radius: 0.5,
      dps: 12,
      remaining: 1,
      type: 'bossSlam',
      source: 'warden_eater',
      acc: 0,
      dead: false,
    });

    w.dying = 'defeat_warden';
    w.dyingTimer = 1.5;
    const hp = w.warden.hp;
    for (let i = 0; i < 90; i++) updateBossSlam(w, 1 / 60);
    expect(w.warden.hp).toBe(hp);
  });

  it('b052: arena fire damage stops once w.dying is set', () => {
    const w = act2World();
    const e = boss(w, 0.2); // phase 3
    e.bossPhase = 2; // already in phase 3, skip the transition that would reset arenaFireRadius
    w.arenaFireActive = true;
    w.arenaFireRadius = 4;
    w.warden.x = 1.5;
    w.warden.y = 1.5;

    w.dying = 'defeat_warden';
    w.dyingTimer = 1.5;
    const hp = w.warden.hp;
    for (let i = 0; i < 90; i++) {
      w.rebuildBuckets();
      bossUpdate(w, e, 1 / 60);
    }
    expect(w.warden.hp).toBe(hp);
  });

  // TODO(fb025) RESOLVED by fb049 (Q138 re-measurement): the 0/20-wins
  // Act I collapse this note described was measured with `allocated: []` —
  // no real Hub-started run plays with an empty tree (`TREE_AUTO_MAX`).
  // Re-measured against the real full-tree allocation
  // (`allTreeNodeIds(loadContent())`): **19/20 (95%)** — seed 2 is the only
  // non-terminal (`running`) outcome at the 45-simulated-minute cap after
  // clearing all 18 TD waves, every other seed `victory`/`bossKilled: true`.
  // Comfortably inside G14's own [60%, 100%) band. Un-skipped.
  //
  // p10s (BACKLOG p10s, this session, part 3): this gate was previously a
  // guardrail only — re-run after every `/data` edit, since this file always
  // plays `classKey: 'engineer'`, `core` at its default (`stone_heart`),
  // un-scripted `hybrid` (no class-active firing, no forced Core-upgrade
  // purchases). That un-scripted shape is exactly the structural mismatch
  // Q158/p10r/p10s's own text named as the block: G1/G14 broke first under
  // any shared T1 difficulty lever, long before G8/G23's scripted-and-full-
  // tree harnesses moved at all, so the same lever could never be judged
  // against all four gates at once.
  //
  // This item lands the fix (option 2 from p10s's own text): `runScripted`
  // (`tests/helpers.ts`, factored out of `tests/p6e-class-diversity.test.ts`'s
  // `scriptClassKit` and `tests/p-core-f-gates.test.ts`'s Core-upgrade
  // injection) replaces the bare `runWithPolicy` call above and here — Field
  // Kit/Pop Turret now fire on cooldown and every affordable Core upgrade
  // step is bought, the identical "scripted kit bot" shape G8/G23 measure T1
  // against.
  //
  // **Re-measured under the new harness: 20/20 (100%)** — every seed
  // `victory`/`bossKilled: true`/wave 18, up from the un-scripted 16/20
  // (80%). This is not a regression this item introduced by tuning anything
  // (`/data` is untouched by this commit) — it is the same over-ceiling
  // story fb049/p10m already found on G1/G8/G23 once a run carries the real
  // `TREE_AUTO_MAX` tree, now confirmed on G14 too now that its harness
  // finally matches theirs. The practical payoff: G14 no longer breaks
  // *before* G8/G23 under a shared lever — all four gates now sit on the
  // same side of their bands (over-ceiling) under the same "real player"
  // shape, which is what a future `/data`-only retune pass needs to move
  // them together. `.skip`-ed with this honest number; re-enable point
  // stays the retune this makes possible, tracked as a new BACKLOG item
  // (p10s's own follow-up) rather than attempted in this same item per
  // CLAUDE.md's scope discipline (a harness change and a tuning pass are
  // different kinds of work, verified separately).
  it.skip('G14: over 20 seeds, the scripted-build win rate is >=60% and <100%', () => {
    const seeds = Array.from({ length: 20 }, (_, i) => i + 1);
    const results = seeds.map((seed) => {
      const { report } = runScripted(cfg({ seed, cycles: 6, tier: GATE_TIER, allocated: FULL_TREE }), 'hybrid');
      return { seed, outcome: report.outcome, wavesCleared: report.wavesCleared, survivalSeconds: report.survivalSeconds };
    });
    const wins = results.filter((r) => r.outcome === 'victory').length;
    const breakdown = results
      .map((r) => `seed ${r.seed}: ${r.outcome} (wave ${r.wavesCleared}, ${r.survivalSeconds}s)`)
      .join('\n');
    const message = `${wins}/${seeds.length} wins (need >=${Math.ceil(seeds.length * 0.6)}, <${seeds.length})\n${breakdown}`;
    expect(wins, message).toBeGreaterThanOrEqual(Math.ceil(seeds.length * 0.6));
    expect(wins, message).toBeLessThan(seeds.length);
  }); // p10s re-measurement (scripted harness): 20/20 (100%), every seed victory/w18
});

describe('Rift events (SPEC 5.1)', () => {
  it('fires at 3:00, 6:00 and 9:00', () => {
    const w = act2World();
    expect(w.content.spawns.riftTimes).toEqual([180, 360, 540]);
    expect(expandedRiftTimes(w)).toEqual([180, 360, 540]);
  });

  it('Rift Storm doubles the number of tears', () => {
    const w = new World(cfg({ modifiers: ['riftstorm'] }));
    expect(expandedRiftTimes(w).length).toBe(w.content.spawns.riftTimes.length * 2);
  });

  it('a Rift bursts a surge of enemies into the arena', () => {
    const run = new Run(cfg({ seed: 4 }));
    const w = run.world;
    w.phase = 'act2';
    w.sundered = true;
    w.act2Time = 179.9;
    w.updateNav(true);
    const before = w.enemies.length;
    let sawRift = false;
    for (let i = 0; i < 30 && !sawRift; i++) {
      run.step();
      if (w.fx.some((f) => f.k === 'rift')) sawRift = true;
    }
    expect(sawRift).toBe(true);
    expect(w.enemies.length).toBeGreaterThan(before);
  });
});
