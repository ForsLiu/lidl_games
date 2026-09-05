/**
 * c007 (BACKLOG-CONTENT, lane `content`) — **the whiff policy for the 24
 * class Actives**, pinned.
 *
 * c005 proved every Active is live *when it has something to act on*. This
 * file asks the opposite question, which c005's report loop explicitly does
 * not answer: what does an Active do when there is nothing to act on, and
 * does it charge you for it?
 *
 * The gap was real. Six kinds (`repair_heal`, `blood_tithe`, `death_pact`,
 * `manifest_spirit`, `chain_lightning`, `ice_wall`) reach a `break` in
 * `useClassActive`/`useClassActive2`'s switch and so pay the full cooldown,
 * even though their fire function early-returned with no target — and only
 * one of the six was pinned anywhere (`tests/p6d-nine-classes.test.ts`, Ice
 * Wall "still pays its cooldown when no tile could be placed"). A refactor
 * could flip the other five in either direction and nothing would notice.
 *
 * **The measured policy, and it is uniform: casting always costs.** All 24
 * pay in full, with no exception and no partial refund — a `repair_heal`
 * with no tower in radius is billed exactly what a repair that landed is
 * billed. That is a coherent rule and this file is where it now lives.
 * `raise_skeletons` belongs to the same group even though c007 did not name
 * it, by a different route: its early return is on the summon cap being full,
 * not on having no target, so in an empty world it runs to the end — and its
 * corpse loop simply iterates zero times.
 *
 * **This item pins the policy; it does not change it.** No `/src` or `/data`
 * byte moves. If a later design pass decides a whiffed cast should refund,
 * the row here is what has to be edited, deliberately, with a reason.
 *
 * ---
 *
 * **Two independent axes per row**, because "whiff" conflates them:
 *   - `pays` — did the cast consume its cooldown, ammo or charge? Measured
 *     as a diff of the cost fields, then re-measured against the *authored*
 *     `cooldownSeconds`/`rechargeSeconds` read back out of `/data`, so
 *     "pays in full" is a real claim and a retune cannot break this file.
 *   - `acts` — did the cast change anything about the world? Measured as a
 *     diff of `snapshot()` below.
 * A row with `pays: true, acts: false` is a pure whiff: paid for nothing.
 * **Thirteen of the 24 are**, in an empty world; the other eleven still do
 * something, because what they do does not need a target at all (drop a
 * cloud, dash, open a window, plant a totem, raise a wall). Those eleven are
 * not evidence of anything being wrong, and saying so per row is the point of
 * the table. The 13/11 split is asserted below, not just written here, so the
 * prose and the table cannot drift apart.
 *
 * **The observable set is c005's, plus `w.tempWalls`** (Ice Wall's product,
 * which c005's table never needed). In particular it keeps c005's two hard-won
 * exclusions, both of which are *costs* rather than products and both of which
 * would let a gutted Active pass here for exactly the reason they would there:
 *   - `w.corpses` — `fireRaiseSkeletons` splices the corpse it consumes
 *     *before* it spawns the skeleton, so a Raise with `spawnClassSummon`
 *     deleted still moves the corpse list.
 *   - `wd.wrathStored` — `fireJudgement` zeroes the bank *before* its own
 *     `rawWrath > 0` guard, so a Judgement with `applyAoE` deleted still
 *     moves it. Spent input, not product.
 * Neither field moves in any of the 24 empty-world casts, so excluding them
 * costs the table nothing and buys the control runs at the bottom their
 * strictness.
 *
 * **Dashes are carried by real movement, not by `wd.dashTravel`.** c005
 * excludes that field because `startDashTravel` only *arms* a travel —
 * `wd.x/y` do not move until `tickDashTravel` runs, so the flag flips
 * identically for every dash kind and for a degenerate travel that goes
 * nowhere. Rather than re-admit it, every row here `settle()`s the cast:
 * the travel is ticked to completion, and the four dash rows then prove
 * themselves on the Warden actually being somewhere else. That is the claim
 * their rationales make, and it is now the claim that is measured.
 *
 * `w.fx` stays excluded, for a sharper version of c005's reason. It is not
 * that every Active emits — seven of the whiff cases return before their
 * `w.emit`. It is that the ones which *do* emit unconditionally
 * (`fireEffect`'s cast flash, Time Lock, Overload) are precisely the silent
 * no-op wearing a costume, so `fx` would say "something happened" in exactly
 * the cases where nothing did.
 */
import { describe, expect, it } from 'vitest';

import { active2CdrFactor, tickClassCharge, useClassActive, useClassActive2 } from '../src/sim/classes';
import { loadContent, type ClassDef, type ClassEffect } from '../src/sim/content';
import { killEnemy, spawnEnemy } from '../src/sim/enemies';
import { applyCommand } from '../src/sim/run';
import { buildTower } from '../src/sim/towers';
import type { Enemy, TickInput } from '../src/sim/types';
import { tickDashTravel } from '../src/sim/wardenmove';
import { World } from '../src/sim/world';
import { BUILD_TX, BUILD_TY, HAS_WALL, WALL_TX, WALL_TY, WALL_TYS, WX, WY } from './class-board';
import { p6dIceWall } from './class-p6d-agreement';
import { cfg } from './helpers';

const content = loadContent();

/**
 * **`c025`: this file now shares `tests/class-board.ts`'s probed board too**,
 * and the exemption `c014` recorded for it is gone. Two things had to happen
 * first, and both are in that module rather than here:
 *
 *   - the shared probe exports a *column*, not a tile — the Ice Wall row
 *     pre-builds all three tiles a vertical wall occupies, and since `c026`
 *     the footprint asks for passable floor plus one buildable tile out east,
 *     which a wall column can fail. It is probed now (`WALL_TX`/`WALL_TYS`,
 *     `HAS_WALL`), and it degrades on its own rung so that one file's extra
 *     need never costs any other importer its board.
 *   - the p6d agreement had to stop being an absolute-tile pin. It read
 *     `expect([AX, AY]).toEqual([12, 10])` while both files parked at `10,10`;
 *     terrain moved the shared board to `10,6` at `c026`, so the literal is now
 *     p6d's tile and not this file's. What the two files actually agree on is
 *     the **offset** — aim two tiles east of where the Warden stands — and that
 *     is what the row asserts, with p6d's own park and aim read out of its
 *     source (`tests/class-p6d-agreement.ts`, whose header records the four
 *     ways QA broke the first parser) so the agreement still breaks loudly if
 *     p6d re-aims — and fails one named row, not all 58, if it cannot parse.
 */
/**
 * Every aimed cast points here — the shared board's Ice Wall aim point, two
 * tiles east of the Warden, which is inside every authored radius in the game
 * and is the middle tile of the column `WALL_TYS` names.
 */
const AX = WALL_TX;
const AY = WALL_TY;

/**
 * c007's "deliberately empty World". A fresh `World` already is one — no
 * enemies, no structures (not even a Core), no corpses, no summons, no areas,
 * no banked Wrath — which the coverage test below re-asserts rather than
 * trusting. Two things are set on top:
 *   - gold, so Ice Wall's build-and-refund loop is never gated by the wallet
 *     (it whiffs on tile occupancy in this file, never on cost);
 *   - the basic attack parked, the p6b/p6c/c001/c005 convention, so nothing
 *     but the Active under test can move an observable.
 */
function emptyWorld(classKey: string): World {
  const w = new World(cfg({ classKey }), content);
  w.gold = 1e6;
  w.warden.attackCooldown = 1e9;
  w.warden.x = WX;
  w.warden.y = WY;
  return w;
}

function idle(over: Partial<TickInput> = {}): TickInput {
  return { mx: 0, my: 0, dash: false, attack: false, aimX: 0, aimY: 0, active1Held: false, cmds: [], ...over };
}

function dummy(w: World, x: number, y: number): Enemy {
  const e = spawnEnemy(w, content.enemies.enemies[0].key, x, y)!;
  e.hp = 1e6;
  e.maxHp = 1e6;
  e.speed = 0;
  e.armor = 0;
  w.rebuildBuckets();
  return e;
}

function tower(w: World, tx: number, ty: number) {
  const res = buildTower(w, content.towerByKey.get('arrow_spire')!.id, tx, ty);
  expect(res.ok, `harness could not place a tower at ${tx},${ty}`).toBe(true);
  return w.structureAt(tx, ty)!;
}

/* ----------------------------------------------------------------- the axes */

/**
 * The `acts` axis: everything a cast is allowed to prove itself through —
 * c005's `observe()` field for field, plus `w.tempWalls`. See the header for
 * why `w.corpses`, `wd.wrathStored`, `wd.dashTravel` and `w.fx` are not here.
 */
function snapshot(w: World): string {
  const wd = w.warden;
  return JSON.stringify({
    enemies: w.enemies.map((e) => [
      e.id,
      e.hp,
      e.dead,
      e.x,
      e.y,
      e.armorShred,
      e.slowRemaining,
      e.slowAmount,
      e.atkSlowRemaining,
      e.atkSlowAmount,
      e.frostRemaining,
      e.frozenRemaining,
      e.frostHitStacks,
      e.tauntRemaining,
      e.tauntKind,
      e.timeMarkStage,
      e.timeLockZoneId,
      e.dots.map((d) => [d.type, d.dps, d.remaining]),
    ]),
    areas: w.areas.map((a) => [a.id, a.type, a.x, a.y, a.radius, a.dps, a.remaining, a.dead]),
    summons: w.classSummons.map((s) => [s.id, s.kind, s.x, s.y, s.dps, s.remaining, s.isAura ?? false]),
    structures: w.structures.map((s) => [
      s.id,
      s.tx,
      s.ty,
      s.hp,
      s.maxHp,
      s.dead,
      s.pactActive,
      s.tithed,
      s.atkSpdBuffRemaining,
    ]),
    tempWalls: w.tempWalls.map((t) => [t.structureIds.length, t.remaining]),
    timeLock: w.timeLockZone
      ? [w.timeLockZone.id, w.timeLockZone.x, w.timeLockZone.y, w.timeLockZone.radius, w.timeLockZone.remaining]
      : null,
    warden: [wd.x, wd.y, wd.hp, wd.overloadRemaining, wd.clarionRemaining],
  });
}

/**
 * Resolves whatever the cast set in motion, so `snapshot()` reads a landed
 * effect rather than an armed one. Today that is only the dash travel: a
 * no-op for the twenty non-dash rows, and for the four dash rows the step
 * that turns "a travel was armed" into "the Warden is somewhere else".
 *
 * Deliberately *not* a `Run.step` or an `updateWarden`: those would tick
 * cooldowns, areas and enemies too, and the cost axis is measured across this
 * call. `tickDashTravel` moves `wd.x/y` and nothing else.
 */
function settle(w: World): void {
  for (let t = 0; t < 600 && w.warden.dashTravel; t++) tickDashTravel(w, 1 / 60);
  expect(w.warden.dashTravel, 'a dash travel never landed within 10 s').toBeNull();
}

/** The `pays` axis: every field a cast can be billed through, cooldown / ammo / charge alike. */
interface Cost {
  a1Cooldown: number;
  a1Ammo: number;
  a1AmmoCooldown: number;
  a1Charge: number;
  a1Charging: boolean;
  a2Cooldown: number;
  a2Ammo: number;
  a2AmmoCooldown: number;
}

function costOf(w: World): Cost {
  const wd = w.warden;
  return {
    a1Cooldown: wd.active1Cooldown,
    a1Ammo: wd.active1Ammo,
    a1AmmoCooldown: wd.active1AmmoCooldown,
    a1Charge: wd.active1Charge,
    a1Charging: wd.active1Charging,
    a2Cooldown: wd.active2Cooldown,
    a2Ammo: wd.active2Ammo,
    a2AmmoCooldown: wd.active2AmmoCooldown,
  };
}

function cost(w: World): string {
  return JSON.stringify(costOf(w));
}

/**
 * Holds a charge Active to full and releases it — Circle Slash / Deadeye
 * Draw's only firing path (their Command deliberately reports nothing, p6b).
 * Held at 60 Hz rather than in one giant `dt`, c005's convention: a harness
 * that takes a path no real run takes stops being evidence about real runs.
 */
function chargeAndRelease(w: World): void {
  const cls = w.content.classByKey.get(w.cfg.classKey)!;
  const cap = cls.active1.chargeCapSeconds ?? 3;
  const aim = { aimX: AX, aimY: AY };
  for (let t = 0; t < Math.ceil(cap * 60) + 1; t++) {
    tickClassCharge(w, cls, idle({ ...aim, active1Held: true }), 1 / 60);
  }
  tickClassCharge(w, cls, idle({ ...aim, active1Held: false }), 1 / 60);
}

function fire(w: World, slot: 1 | 2): boolean | null {
  const cls = w.content.classByKey.get(w.cfg.classKey)!;
  const eff = slot === 1 ? cls.active1 : cls.active2;
  if (eff.kind === 'charge_nova' || eff.kind === 'charge_pierce') {
    // QA: returning a bare `null` here would make the two charge rows'
    // `reports` axis a literal that never consults the sim. p6b's actual rule
    // is that a charge kind's *Command* must decline — it must not fire and
    // must not bill, because the fire event is time-shifted to release — so
    // that is what gets asserted before taking the release path.
    expect(useClassActive(w, AX, AY), 'a charge kind fired from its Command instead of on release').toBe(false);
    expect(costOf(w), 'a charge kind was billed by its Command').toEqual(costOf(emptyWorld(w.cfg.classKey)));
    chargeAndRelease(w);
    return null;
  }
  return slot === 1 ? useClassActive(w, AX, AY) : useClassActive2(w, AX, AY);
}

/* ---------------------------------------------------------------- the table */

interface WhiffRow {
  classKey: string;
  slot: 1 | 2;
  /** `useClassActive`'s return; `null` for the two charge kinds, which fire from `tickClassCharge`. */
  reports: boolean | null;
  /** Did the cast consume cooldown/ammo/charge? */
  pays: boolean;
  /** Did the cast change anything about the world? `false` = a pure whiff. */
  acts: boolean;
  /** c007: "every row is an explicit expectation carrying a one-line rationale." Enforced non-empty below. */
  why: string;
}

const ROWS: readonly WhiffRow[] = [
  {
    classKey: 'swordsman',
    slot: 1, // Circle Slash (charge_nova)
    reports: null,
    pays: true,
    acts: false,
    why: 'the nova finds nobody, and `tickClassCharge` sets the cooldown on release unconditionally — a charge kind cannot abort',
  },
  {
    classKey: 'swordsman',
    slot: 2, // Dash Slash (dash_line)
    reports: true,
    pays: true,
    acts: true,
    why: 'the line hits nothing, but the dash itself is the other half of the Active and still moves the Warden',
  },
  {
    classKey: 'plaguebringer',
    slot: 1, // Poison Barrel (ground_poison)
    reports: true,
    pays: true,
    acts: true,
    why: 'a ground cloud needs no target: it lands on empty dirt and ticks there for its duration',
  },
  {
    classKey: 'plaguebringer',
    slot: 2, // Poison Boost (poison_boost)
    reports: true,
    pays: true,
    acts: false,
    why: 'it doubles poison already ticking, so with no stack anywhere it is a pure whiff — the clearest case in the table',
  },
  {
    classKey: 'engineer',
    slot: 1, // Field Kit (repair_heal)
    reports: true,
    pays: true,
    acts: false,
    why: 'c007 kind 1/6: `fireFieldKit` early-returns on `!nearestStructure`, and the switch has already committed to `break`',
  },
  {
    classKey: 'engineer',
    slot: 2, // Pop Turret (summon_turret)
    reports: true,
    pays: true,
    acts: true,
    why: 'the turret is placed at the Warden, not at a target, so it exists whether or not there is anything to shoot',
  },
  {
    classKey: 'pyromancer',
    slot: 1, // Immolation Wave (burst_damage)
    reports: true,
    pays: true,
    acts: false,
    why: 'a self-centred nova with an empty radius: `fireEffect` iterates nobody, and it leaves no ground area behind',
  },
  {
    classKey: 'pyromancer',
    slot: 2, // Flame Road (dash_trail)
    reports: true,
    pays: true,
    acts: true,
    why: 'the trail is `trailSegments` burn patches laid along the path travelled — terrain, not targets',
  },
  {
    classKey: 'archer',
    slot: 1, // Deadeye Draw (charge_pierce)
    reports: null,
    pays: true,
    acts: false,
    why: 'the pierce line crosses nobody; like Circle Slash the release path bills the cooldown with no success test',
  },
  {
    classKey: 'archer',
    slot: 2, // Quickstep (dash_volley)
    reports: true,
    pays: true,
    acts: true,
    why: 'the volley finds no target, but Quickstep is a dash first — the reposition lands regardless',
  },
  {
    classKey: 'necromancer',
    slot: 1, // Raise (raise_skeletons)
    reports: true,
    pays: true,
    acts: false,
    why: 'the seventh member of the c007 group, by a different route: its early return is on the summon cap, not on targets — here the corpse loop simply runs zero times',
  },
  {
    classKey: 'necromancer',
    slot: 2, // Death Pact (death_pact)
    reports: true,
    pays: true,
    acts: false,
    why: 'c007 kind 2/6: a per-tower toggle with no tower in radius early-returns before flipping anything',
  },
  {
    classKey: 'cryomancer',
    slot: 1, // Glaciate (frost_nova)
    reports: true,
    pays: true,
    acts: false,
    why: 'frost is applied per enemy in radius and leaves no ground effect, so an empty radius means nothing happened',
  },
  {
    classKey: 'cryomancer',
    slot: 2, // Ice Wall (ice_wall)
    reports: true,
    pays: true,
    acts: true,
    why: 'c007 kind 6/6, and the one that cannot whiff on emptiness — empty tiles are exactly what it needs; see the p6d agreement test below',
  },
  {
    classKey: 'stormcaller',
    slot: 1, // Chain Surge (chain_lightning)
    reports: true,
    pays: true,
    acts: false,
    why: 'c007 kind 5/6: `fireChainSurge` early-returns when the first `nearestEnemy` misses — there is no bolt without a first link',
  },
  {
    classKey: 'stormcaller',
    slot: 2, // Overload (overload)
    reports: true,
    pays: true,
    acts: true,
    why: 'a pure self-buff window: its whole product is `wd.overloadRemaining`, which needs no world at all',
  },
  {
    classKey: 'bloodlord',
    slot: 1, // Blood Tithe (blood_tithe)
    reports: true,
    pays: true,
    acts: false,
    why: 'c007 kind 3/6: no un-tithed tower in radius, so `fireBloodTithe` early-returns before the HP payment',
  },
  {
    classKey: 'bloodlord',
    slot: 2, // Crimson Rush (dash_heal)
    reports: true,
    pays: true,
    acts: true,
    why: 'nobody is passed through so nothing heals, but the dash travel is real movement bought with the cooldown',
  },
  {
    classKey: 'animist',
    slot: 1, // Manifest (manifest_spirit)
    reports: true,
    pays: true,
    acts: false,
    why: 'c007 kind 4/6: the spirit is a clone of a built tower, and with no tower in radius there is nothing to clone',
  },
  {
    classKey: 'animist',
    slot: 2, // Recall Totem (recall_totem)
    reports: true,
    pays: true,
    acts: true,
    why: 'the totem is planted at the Warden and its aura stands whether or not anything is nearby to benefit',
  },
  {
    classKey: 'paladin',
    slot: 1, // Clarion Taunt (clarion_taunt)
    reports: true,
    pays: true,
    acts: true,
    why: 'the enemy-tag half finds nobody, but the Wrath-banking window (`wd.clarionRemaining`) opens on the Warden regardless',
  },
  {
    classKey: 'paladin',
    slot: 2, // Judgement (judgement)
    reports: true,
    pays: true,
    acts: false,
    why: 'with nothing banked its own `rawWrath > 0` guard skips the nova, and zeroing an already-zero bank changes nothing',
  },
  {
    classKey: 'time_lord',
    slot: 1, // Time (time_mark) — the one ammo-gated Active1
    reports: true,
    pays: true,
    acts: false,
    why: 'the pulse marks enemies, so an empty pulse marks none — and it is billed a charge, not a cooldown',
  },
  {
    classKey: 'time_lord',
    slot: 2, // Time Lock (time_lock)
    reports: true,
    pays: true,
    acts: true,
    why: 'the zone is a placed volume (`w.timeLockZone`) that exists and ticks down before any enemy walks into it',
  },
];

function label(row: WhiffRow, cls: ClassDef): string {
  const eff = row.slot === 1 ? cls.active1 : cls.active2;
  return `${cls.name} ${eff.name} (Active${row.slot}, ${eff.kind})`;
}

/* ------------------------------------------------------------------- tests */

describe('c007: the whiff policy of all 24 class Actives', () => {
  it('covers all 24 Actives exactly once, each with a rationale', () => {
    expect(content.classes.classes).toHaveLength(12);
    const seen = ROWS.map((r) => `${r.classKey}:${r.slot}`);
    expect(new Set(seen).size, 'a duplicated row').toBe(seen.length);
    const wanted = content.classes.classes.flatMap((c) => [`${c.key}:1`, `${c.key}:2`]);
    expect([...seen].sort()).toEqual([...wanted].sort());
    for (const r of ROWS) {
      expect(r.why.length, `${r.classKey}:${r.slot} has no rationale`).toBeGreaterThan(20);
    }
    // The measurement this file exists to pin, asserted rather than only
    // written in the header — a row flipped without the prose following it is
    // exactly how the two drift apart.
    expect(ROWS.filter((r) => r.pays), 'the whole point: casting always costs').toHaveLength(24);
    expect(ROWS.filter((r) => !r.acts), 'pure whiffs — paid in full, changed nothing').toHaveLength(13);
    expect(ROWS.filter((r) => r.acts), 'act on an empty board because they need no target').toHaveLength(11);
  });

  it('the world every row fires into really is empty, and bills at full price', () => {
    // Per class, not just once: every row builds its own world, and a kit that
    // arrived with a summon or a stat that reduced cooldowns would break the
    // cost assertions below silently.
    for (const c of content.classes.classes) {
      const w = emptyWorld(c.key);
      expect(w.enemies, `${c.key}: an enemy would give the target-seeking kinds something to find`).toHaveLength(0);
      expect(w.structures, `${c.key}: a structure would feed Field Kit / Blood Tithe / Death Pact / Manifest`).toHaveLength(0);
      expect(w.corpses, `${c.key}: a corpse would feed Raise`).toHaveLength(0);
      expect(w.classSummons).toHaveLength(0);
      expect(w.areas).toHaveLength(0);
      expect(w.tempWalls).toHaveLength(0);
      expect(w.timeLockZone).toBeNull();
      expect(w.warden.wrathStored, `${c.key}: banked Wrath would feed Judgement`).toBe(0);
      // The cost assertions below multiply the authored seconds by these two.
      // If a fresh world ever stops being cooldown-neutral, "pays in full"
      // would quietly become "pays in full minus a reduction" and every row
      // would still be green — so the neutrality is asserted, not assumed.
      expect(w.derived.cdr, `${c.key}: a fresh world must have no cooldown reduction`).toBe(0);
      expect(active2CdrFactor(w), `${c.key}: a fresh world must have no Active2 cooldown reduction`).toBe(1);
    }
  });

  for (const row of ROWS) {
    const cls = content.classByKey.get(row.classKey)!;
    it(`${label(row, cls)} — ${row.why}`, () => {
      const w = emptyWorld(row.classKey);
      const beforeActs = snapshot(w);
      const beforeCost = cost(w);

      expect(fire(w, row.slot), 'the cast reported the wrong thing about itself').toBe(row.reports);
      expect(cost(w) !== beforeCost, row.pays ? 'cast for free' : 'was billed for a cast it did not make').toBe(row.pays);
      settle(w);
      expect(
        snapshot(w) !== beforeActs,
        row.acts ? 'this Active is supposed to work on an empty board' : 'changed the world with nothing to act on',
      ).toBe(row.acts);
    });
  }

  /**
   * "Pays a full cooldown for nothing" is c007's phrasing, and the diff above
   * only proves *something* was billed. This states the whole bill instead: it
   * takes the untouched cost vector, applies by hand the one charge the row is
   * allowed to incur, and requires the sim to land on exactly that.
   *
   * Whole-vector rather than field-by-field, because a per-field check cannot
   * see *over*-billing: QA broke an earlier draft by having `useClassActive`
   * also set `active2Cooldown`, which is a whiff-policy flip in the most
   * expensive direction, and every row stayed green. Anything billed beyond
   * the authored price now fails, whichever slot it lands on.
   *
   * The price is read back out of `/data` on both sides, so a retune moves the
   * expectation with the content and never turns this red — and it is exact,
   * not approximate, because the emptiness test above pins `cdr` at 0 and
   * `active2CdrFactor` at 1, and multiplying by 1 is exact in IEEE.
   */
  for (const row of ROWS) {
    const cls = content.classByKey.get(row.classKey)!;
    const eff: ClassEffect = row.slot === 1 ? cls.active1 : cls.active2;
    const ammo = (eff.maxCharges ?? 1) > 1;
    it(`${label(row, cls)} is billed the full authored ${ammo ? 'charge' : 'cooldown'} and nothing else`, () => {
      const w = emptyWorld(row.classKey);
      const expected = costOf(w);
      fire(w, row.slot);

      if (ammo) {
        // fb013's ammo gate: one charge spent, the refill timer armed at the
        // authored `rechargeSeconds`, and — the "a charge, *not* a cooldown"
        // half — the slot's `cooldown` field left at 0, which the vector
        // comparison enforces by simply not being told to expect anything else.
        if (row.slot === 1) {
          expected.a1Ammo -= 1;
          expected.a1AmmoCooldown = eff.rechargeSeconds ?? 0;
        } else {
          expected.a2Ammo -= 1;
          expected.a2AmmoCooldown = eff.rechargeSeconds ?? 0;
        }
      } else if (row.slot === 1) {
        expected.a1Cooldown = eff.cooldownSeconds;
      } else {
        expected.a2Cooldown = eff.cooldownSeconds;
      }
      // A charge kind must also have handed its charge back rather than
      // leaving the Warden mid-draw with the cooldown already running — which
      // the vector states as "`a1Charge`/`a1Charging` are back at their start".
      expect(costOf(w), 'the bill is not exactly the authored price of this one Active').toEqual(expected);
    });
  }
});

/**
 * The Ice Wall row is the one c007 names as already pinned, and the one
 * Active in the table that an *empty* world cannot make whiff — free tiles
 * are precisely what it wants. Its whiff condition is the opposite of
 * emptiness, so it gets the exception it needs: the exact setup from
 * `tests/p6d-nine-classes.test.ts` (all three target tiles pre-built), stated
 * here on the shared board with p6d's own park and aim read out of p6d, so the
 * two files state the same policy and a change has to break both.
 */
describe('c007: Ice Wall whiffs on occupancy, not emptiness (agrees with p6d)', () => {
  it('every target tile already occupied: no wall, and the cooldown is still paid in full', () => {
    const w = emptyWorld('cryomancer');
    // p6d aims at (12,10) from (10,10); the vertical wall that produces lands
    // at tx=12, ty in {9,10,11}. Pre-occupy all three so `buildTower` rejects
    // each one. AX/AY is that same aim point — *relative to the Warden*, which
    // is the half of it that survives the board moving (c025; the shared probe
    // walked to 10,6 when terrain landed, so p6d's literal `12,10` is its tile
    // and no longer this file's).
    // Read out of p6d's own occupancy test — the row this one co-states, not
    // the `castWall()` helper next to it, which QA showed the first draft was
    // reading instead (re-aiming the occupancy row left this file green).
    const p6d = p6dIceWall();
    expect([p6d.parkX, p6d.parkY], "p6d's own Ice Wall park moved").toEqual([10, 10]);
    expect([p6d.aimX, p6d.aimY], "p6d's own Ice Wall aim point moved").toEqual([12, 10]);
    expect(
      [AX - WX, AY - WY],
      'this file and p6d no longer aim at the same offset from the Warden — the two state one whiff ' +
        'policy and must fire the same cast to state it',
    ).toEqual([p6d.aimX - p6d.parkX, p6d.aimY - p6d.parkY]);
    expect(HAS_WALL, 'the shared board could not host an Ice Wall column — this row has nothing to occupy').toBe(true);
    for (const ty of WALL_TYS) tower(w, WALL_TX, ty);

    const beforeActs = snapshot(w);
    // `fireIceWall` pre-funds each tile and unwinds the funding when
    // `buildTower` rejects the spot, touching four run-level counters per
    // attempt. None is in `snapshot()` (they are not effects) nor in `cost()`
    // (they are not the Active's authored price), so a whiffed wall that
    // charged the player three towers' gold passed both this file and p6d —
    // QA's finding, and the loudest possible whiff-policy violation.
    const beforeLedger = JSON.stringify([w.gold, w.goldSpent, w.towersBuilt, w.towersByKey]);
    // Through the Command, exactly as p6d fires it. Architecture rule 3 makes
    // the Command the player-facing path, so an agreement test that called
    // `useClassActive2` directly could stay green while a break in the
    // Command's aim plumbing reddened p6d — the opposite of agreeing.
    applyCommand(w, { k: 'class_active2', aimX: AX, aimY: AY });

    expect(w.tempWalls, 'a wall was raised on occupied tiles').toHaveLength(0);
    expect(snapshot(w), 'nothing should have changed but the cooldown').toBe(beforeActs);
    expect(w.warden.active2Cooldown).toBeCloseTo(content.classByKey.get('cryomancer')!.active2.cooldownSeconds, 6);
    expect(
      JSON.stringify([w.gold, w.goldSpent, w.towersBuilt, w.towersByKey]),
      'a whiffed wall billed the player for tiles it never placed',
    ).toBe(beforeLedger);
  });
});

/**
 * The honesty half. Every `acts: false` row above could equally be explained
 * by "that Active is dead" — c005 is the file that rules that out in general,
 * but the seven rows c007 singles out are the ones whose `false` is a
 * deliberate early return (or, for Raise, an empty loop), so their `false` is
 * shown here to be *caused by the emptiness* and nothing else: give the world
 * the single thing each one looks for and the same cast acts.
 *
 * This is the control-run half of the pair (CLAUDE.md's measurement rules) —
 * without it the table above is 15 rows of "nothing happened" with no way to
 * tell a policy from a bug.
 */
describe('c007: the seven pure-whiff Actives c007 names act as soon as their one missing thing exists', () => {
  const CONTROLS: {
    classKey: string;
    slot: 1 | 2;
    needs: string;
    give: (w: World) => void;
    /** `c025`: this row builds on the Ice Wall column, which only a `hasWall` board has. */
    needsWall?: true;
  }[] = [
    {
      classKey: 'engineer',
      slot: 1,
      needs: 'a damaged tower in radius',
      give: (w) => void (tower(w, WALL_TX, WALL_TY).hp = 1),
      needsWall: true,
    },
    {
      classKey: 'bloodlord',
      slot: 1,
      needs: 'an un-tithed tower in radius',
      // `fireBloodTithe` floors the payment at 1 hp, so a tower already at 1
      // cannot move on the cost axis — `s.tithed` is left to carry the row,
      // which is c005's finding and the strictest form of this control.
      give: (w) => void (tower(w, WALL_TX, WALL_TY).hp = 1),
      needsWall: true,
    },
    {
      classKey: 'necromancer',
      slot: 2,
      needs: 'a tower in radius to pact with',
      give: (w) => void tower(w, WALL_TX, WALL_TY),
      needsWall: true,
    },
    { classKey: 'animist', slot: 1, needs: 'an attacking tower in radius to clone', give: (w) => void tower(w, BUILD_TX, BUILD_TY) },
    { classKey: 'stormcaller', slot: 1, needs: 'a first enemy for the bolt to link to', give: (w) => void dummy(w, AX, AY) },
    {
      classKey: 'necromancer',
      slot: 1,
      needs: 'a corpse in radius',
      give: (w) => {
        killEnemy(w, dummy(w, BUILD_TX, BUILD_TY), 'test');
        expect(w.corpses.length, 'harness left no corpse for Raise').toBeGreaterThan(0);
      },
    },
    {
      classKey: 'paladin',
      slot: 2,
      needs: 'banked Wrath and something to hit',
      give: (w) => {
        dummy(w, BUILD_TX, BUILD_TY);
        w.warden.wrathStored = 500;
      },
    },
  ];

  for (const c of CONTROLS) {
    const cls = content.classByKey.get(c.classKey)!;
    const eff = c.slot === 1 ? cls.active1 : cls.active2;
    it(`${cls.name} ${eff.name} whiffs only for want of ${c.needs}`, () => {
      const empty = ROWS.find((r) => r.classKey === c.classKey && r.slot === c.slot)!;
      expect(empty.acts, 'this control belongs to a row the table calls a pure whiff').toBe(false);
      // Three of these rows put their tower on the Ice Wall column, which the
      // shared probe only guarantees on a `hasWall` rung. Named here, on those
      // rows alone, rather than letting them die as "harness could not place a
      // tower at 12,6" — the opaque harness failure c014 exists to delete —
      // and rather than dragging the rows that build on the shared tile down
      // with them, which is the whole point of degrading on one rung.
      if (c.needsWall) {
        expect(HAS_WALL, 'this control builds on the Ice Wall column and the board has none').toBe(true);
      }

      const w = emptyWorld(c.classKey);
      c.give(w);
      const before = snapshot(w);
      expect(fire(w, c.slot)).toBe(true);
      expect(snapshot(w), 'given what it needs, this Active still did nothing').not.toBe(before);
    });
  }
});
