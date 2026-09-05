/**
 * c013 (BACKLOG-CONTENT, lane `content`) — **how far the Animist's *Wide
 * Grove* actually reaches.**
 *
 * `data/classes.json`'s Animist row says, in the player-facing sentence §4.2
 * gives it: *"All towers +10% area."* It is authored as
 * `towerPassive.mods.area`, and `area` is §2's **global** Area stat, folded by
 * `baseRunStats` (`stats.ts:194`) into `derived.areaMul` — the same multiplier
 * every non-tower footprint in the sim reads. There is no `towerArea` key in
 * `src/sim/statkeys.ts`, so the row has nowhere else to go.
 *
 * **This is a logged, owner-approved deviation, not an unapproved defect.**
 * `QUESTIONS.md` Q120 item 5 states it — "maps onto the existing global `area`
 * stat, which also scales the character's own effects — the closest existing
 * key, over-applying rather than inventing a `towerArea` nothing else reads,
 * and flagged for the P10 pass" — and carries an owner verdict of *approved*.
 * What that verdict bought was a deferral, and CLAUDE.md's first measurement
 * rule is that **a deferral is a measurement with an expiry date**: Q120 named
 * the expiry (the P10 pass) and never sized the over-application. This file
 * sizes it. A green run here is the approved deviation behaving as approved,
 * not a bug going unreported.
 *
 * `c009` restated it (route 5 of its five) and `c001` then made it materially
 * larger without anyone re-measuring: before c001, `src/sim/classes.ts` never
 * read `areaMul` at all, so the over-application reached towers, VS wielded
 * attacks, Electric's inherent AoE and Burning's splash; after c001 it reaches
 * **all 24 class Actives too**, the Animist's own included. CLAUDE.md names
 * exactly this failure: *"check a `/data` row's blast radius before calling it
 * narrow"*, and *"when a field's range changes, grep its readers, not just its
 * writers."*
 *
 * **This file is the measurement, not the fix.** The fix needs a new stat key
 * in `src/sim/statkeys.ts`, which is outside this lane's Scope (the same
 * blocker `c004` sits behind). So the reach is written down as a red/green
 * target the main-lane `towerArea` fix flips, rather than as a claim in prose
 * the next reader has to re-derive.
 *
 * **Reads and consumers are two different lists, and conflating them is how
 * this got bigger the first time.** `READS` is the ten places in `src/sim`
 * that multiply by `w.derived.areaMul`. `CONSUMERS` is the twenty *footprints*
 * those reads produce — because five reads sit inside helpers (`classArea`,
 * `effectiveTowerAoe`, `effectiveTowerRange`, `wieldedRangeFor`,
 * `wieldedSplashFor`) that other files call, and two more (`fireTower`'s and
 * `fireWielded`'s `area` locals) are each read by three to five footprints
 * inside their own function. c001 widened this row's blast radius by adding a
 * *caller*, not a read; a file that only counted reads would have watched it
 * happen and stayed green, which is why `CARRIERS` pins the call sites too.
 *
 * **Four of the ten reads are `shared`, and they are what a `towerArea` key
 * alone does not close.** `effectiveTowerAoe`'s two branches,
 * `damagetypes.ts`'s Electric AoE and `enemies.ts`'s Burning splash each serve
 * both routes from one line that cannot see who is calling:
 *   - `effectiveTowerAoe` is a Venom Spore's own splash at `towers.ts:606`
 *     and the panel's mirror of a Mortar's shell, **and** the Animist's own
 *     *Manifest* spirit via `towerSummonProfile` (`classes.ts:523`), **and**
 *     every VS wielded lob/poison blast (`vswield.ts:295,296,487,505`);
 *   - Electric's inherent AoE and Burning's splash widen identically whether a
 *     Tesla Coil or a class Active applied the damage.
 * Moving the `/data` row to a `towerArea` key fixes the character-only
 * consumers and leaves these four sites needing a **source check** as well.
 * `shared` is not asserted by hand: it is derived from the consumer table — a
 * read is shared exactly when it has consumers on both routes — and compared
 * against `SHARED_READS`.
 *
 * **How each consumer is measured.** Two `Content`s, identical but for one
 * key: the shipped one, and one rebuilt from a copy of `data/classes.json`
 * with `animist.towerPassive.mods.area` deleted (`c006`/`c009`'s control
 * shape). Both build an Animist `World`; each row returns one number that
 * grows with its footprint — a radius where the sim's own helper computes one,
 * and the damage taken by an enemy parked in the **ring between the un-widened
 * and the widened footprint** where it does not. "Widened" is `shipped >
 * no-grove`. Nothing here asserts an authored magnitude: `WIDE_GROVE` is read
 * out of `/data`, so a retune from 10% to 12% must not turn this file red
 * (`c008` owns the figure itself, in `tests/class-spec-numbers.test.ts`).
 *
 * Every `shared` read is probed on **both** routes, and each tower-route probe
 * parks its neighbour outside the firing tower's own reach so only the splash
 * under test can touch it. Two probes upgrade their tower first, because the
 * footprint they measure is only live behind a §5.2 milestone (the Arrow's
 * pierce, the Tesla's electric chain); which tier that is gets asked of
 * `attackProfile` rather than pinned, since a special's `at: 3` lands at tier
 * 4 and a retuned milestone must move the probe, not redden it.
 *
 * **The honesty half.** A row that measured nothing would report "does not
 * widen" and look like good news — which is precisely the answer the main-lane
 * fix is expected to produce for twelve of these twenty consumers. So every
 * probe is additionally run on the no-grove content with an explicit +Area
 * source of its own: each must move. A row may only ever claim "Wide Grove
 * does not reach here" while proving it can still see Area arrive by another
 * door.
 *
 * The VS rows are classified against `vswield.ts`'s own header rule: a wielded
 * attack is "treated as character attacks" (§6.1) and deliberately does *not*
 * ride `towerRangeMul`. A `towerArea` that reached them would contradict the
 * reading that file already ships.
 *
 * **One use of one read has no probe, and it is named rather than left
 * silent** — `DEVIATIONS`, `c019`'s convention.
 *
 * **The board is probed, not pinned.** This file always asked
 * `grid.buildable` / `wouldBlockPath` for its tile rather than hardcoding one,
 * but it asked *privately*. `c014` has since made that probe shared: the tile
 * now comes from `tests/class-board.ts`, the module the five liveness files
 * import too, so the terrain epic moves all six together.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { updateProjectiles } from '../src/sim/combat';
import { useClassActive, useClassActive2 } from '../src/sim/classes';
import { loadContent, type Content, type TowerDef } from '../src/sim/content';
import { applyDamageType } from '../src/sim/damagetypes';
import { applyDot, spawnEnemy, updateEnemies } from '../src/sim/enemies';
import {
  attackProfile,
  buildTower,
  effectiveTowerAoe,
  effectiveTowerRange,
  LINE_HALF_WIDTH,
  maxLevel,
  updateTowers,
  upgradeTower,
} from '../src/sim/towers';
import { updateWieldedAttacks, wieldedAoeFor, wieldedRangeFor, wieldedSplashFor } from '../src/sim/vswield';
import { applyCommand, Run } from '../src/sim/run';
import { emptyInput, type Enemy, type Structure } from '../src/sim/types';
import { World } from '../src/sim/world';
import { BUILD_TX, BUILD_TY } from './class-board';
import { cfg } from './helpers';
import { GRID_H, GRID_W } from '../src/sim/grid';

const content = loadContent();

const DT = 1 / 60;

/** The authored magnitude, read from `/data` — never restated. A retune moves this file's ring positions with it. */
const WIDE_GROVE = content.classByKey.get('animist')!.towerPassive.mods.area!;

/**
 * Where a ring probe parks its enemy: half-way between the un-widened
 * footprint (x1) and the widened one (x`1 + WIDE_GROVE`), as a fraction of the
 * un-widened radius — or, for the two cone rows, of the authored half-angle.
 * Outside one, inside the other, for any positive magnitude the row could be
 * retuned to.
 */
const RING = 1 + WIDE_GROVE / 2;

/**
 * The sensitivity control's own Area source. Deliberately **not** derived from
 * `WIDE_GROVE`: the control's job is to clear every ring by a margin a retune
 * of the shipped row cannot erode. The property that matters is
 * `1 + CONTROL_AREA > RING`, which is asserted rather than assumed.
 */
const CONTROL_AREA = 0.5;

type RawClassRow = { key: string; towerPassive: { mods: Record<string, number> } };

/** `Content` rebuilt from a copy of `data/classes.json` with Wide Grove's one `mods` key removed. */
function contentWithoutGrove(): Content {
  const doc = JSON.parse(JSON.stringify(content.raw.classes)) as { classes: RawClassRow[] };
  const row = doc.classes.find((c) => c.key === 'animist');
  // A throw, not an `expect`: this runs at module scope, where a failed
  // assertion surfaces as an unnamed collection error.
  if (!row) throw new Error('animist missing from data/classes.json');
  delete row.towerPassive.mods.area;
  return loadContent({ classes: doc });
}

const noGrove = contentWithoutGrove();

interface WorldOpts {
  /** An extra, explicit Area source — the sensitivity control's second door. */
  area?: number;
  /** `act1_wave` for the class-Active rows (`ACTIVE_PHASES`). */
  phase?: World['phase'];
  /** c024: whose tower passive is under test. Defaults to the Animist (c013). */
  classKey?: string;
  /** c024: TD waves to clear first, so Chronal Surge has actually fired. */
  surges?: number;
}

function animist(c: Content, o: WorldOpts = {}): World {
  // c024: the class is a parameter now. Every one of the twenty `CONSUMERS`
  // built an Animist world, which is exactly why a main-lane `towerArea` swap
  // that moved `data/classes.json` but missed `run.ts:817` would have landed
  // with this file **fully green** — it never built a Time Lord world at all.
  const classKey = o.classKey ?? 'animist';
  const w = o.surges ? clearWaves(classKey, c, o.surges) : new World(cfg({ classKey }), c);
  if (o.surges) {
    // A world that has fought waves is not a probe world: it ends mid-`act1_wave`
    // with god mode on, spent corpses, and whatever the last wave left behind.
    // Everything the surge actually did lives in `w.stats`/`w.derived`, which
    // survive this reset — so the probes measure the same clean board the
    // Animist rows do, with the only difference being the stat contribution
    // under test.
    w.invulnerable = false;
    w.godMode = false;
    w.phase = 'act1_build';
    w.enemies = [];
    w.corpses = [];
    w.projectiles = [];
    w.areas = [];
    w.classSummons = [];
    w.rebuildBuckets();
  }
  w.gold = 1e6;
  // The character's own attack would contaminate every damage reading here.
  w.warden.attackCooldown = 1e9;
  if (o.phase) w.phase = o.phase;
  if (o.area) {
    w.stats.addAll('test:area', { area: o.area });
    w.recomputeDerived();
  }
  return w;
}

/**
 * `waves` TD waves called and cleared, which is the only honest way to reach
 * Chronal Surge: `applyChronalSurge` is private to `run.ts` and fires off
 * `completeWave`. Lifted from `class-tower-passive-liveness` (c009), whose own
 * Chronal Surge rows already drive it this way. The spawn queue and the enemy
 * list are emptied rather than fought, so the measurement is about the wave
 * *count* and not about who won.
 */
function clearWaves(classKey: string, c: Content, waves: number): World {
  const run = new Run(cfg({ classKey }), c);
  const w = run.world;
  w.gold = 1e6;
  w.invulnerable = true;
  w.godMode = true;
  w.phase = 'act1_build';
  for (let i = 0; i < waves; i++) {
    applyCommand(w, { k: 'call' });
    run.step(emptyInput());
    w.spawnQueue = [];
    w.enemies = [];
    run.step(emptyInput());
  }
  expect(w.wavesCleared, `harness failed to clear ${waves} TD waves`).toBe(waves);
  return w;
}

interface Placed {
  s: Structure;
  /** Tile center — every probe's origin. */
  x: number;
  y: number;
  tx: number;
  ty: number;
}

/** Builds `key` on a probed tile and leaves the Warden standing on it. */
function placeProbed(w: World, key: string): Placed {
  // c014's shared probe, not a private copy: the same tile the five §4
  // liveness files build on, so the terrain epic relocates all six at once.
  //
  // **This moved this file's baseline, and code review is why it is written
  // down.** The private probe it replaced scanned from `(4,4)` and, on the
  // shipped board, returned `4,4`; the shared board puts every row here at
  // `11,10` instead — seven tiles east and six south. Nothing went red, but
  // eastward headroom before the Core column at `x = 25` fell from ~31 tiles
  // to roughly 13, and the rows below measure ranges and splash rings outward
  // from this point (mortar range 10, `p.x + range * 0.95 + authored * RING`).
  // The margin is still real — worst case lands near `x = 23.7` — but it is
  // no longer so large that it can be left unstated, so `boardBound` below
  // asserts it per placement instead of trusting it.
  // The imported symbols are named at both sinks directly, not aliased into a
  // local `spot`. Code review's second pass: `class-board.test.ts` matches the
  // sinks on identifier *text*, so an allowlisted `spot.tx` would let the very
  // private probe this item deleted be re-introduced under the same name and
  // pass every rule. Naming `BUILD_TX`/`BUILD_TY` at the sink leaves the
  // allowlist containing nothing but imported symbols, which `tsc` forbids
  // shadowing.
  w.warden.x = BUILD_TX + 0.5;
  w.warden.y = BUILD_TY + 0.5;
  const def = w.content.towerByKey.get(key)!;
  const r = buildTower(w, def.id, BUILD_TX, BUILD_TY);
  expect(r.ok, `harness could not build ${key} at ${BUILD_TX},${BUILD_TY}`).toBe(true);
  return {
    s: (r as { ok: true; structure: Structure }).structure,
    x: BUILD_TX + 0.5,
    y: BUILD_TY + 0.5,
    tx: BUILD_TX,
    ty: BUILD_TY,
  };
}

/** Buys steps until the structure reaches `tier` — three rows need a §5.2 milestone to be live at all. */
function upgradeTo(w: World, p: Placed, tier: number): void {
  while (p.s.tier < tier) {
    w.gold = 1e6;
    expect(upgradeTower(w, p.tx, p.ty), `harness could not upgrade to tier ${tier}`).toBe(true);
  }
}

/** An immovable, unarmoured bag deep enough that no probe here can kill it (c009's `dummy`, same reasoning). */
function dummy(w: World, x: number, y: number, radius?: number): Enemy {
  // c014/code review: this file has no `GRID_W` guard of its own (unlike
  // `class-line-bonus`'s `expect(x).toBeLessThan(GRID_W - 1)`), and moving to
  // the shared board cut its eastward headroom. A ⚖ range retune that pushed a
  // probe off the board or onto the Core used to read as "the ring measured
  // nothing"; now it names itself.
  expect(x, `harness budget: a probe at x=${x} ran off the board`).toBeLessThan(GRID_W - 1);
  expect(x, `harness budget: a probe at x=${x} ran off the board`).toBeGreaterThan(0);
  expect(y, `harness budget: a probe at y=${y} ran off the board`).toBeLessThan(GRID_H - 1);
  expect(y, `harness budget: a probe at y=${y} ran off the board`).toBeGreaterThan(0);
  // `w.content`, not the module `content`: a no-grove world must spawn from its own Content.
  const e = spawnEnemy(w, w.content.enemies.enemies[0].key, x, y)!;
  e.hp = 1e7;
  e.maxHp = Math.max(1e7, e.maxHp);
  e.speed = 0;
  e.armor = 0;
  // `lineHit` tests against `halfWidth + e.radius`, so a line row has to take
  // the body's own girth out of the way for the half-width to be the thing
  // under test (c001's convention).
  if (radius !== undefined) e.radius = radius;
  w.rebuildBuckets();
  return e;
}

/** Fires `s` once whatever its cadence would have been (c009's `fireOnce`). */
function fireOnce(w: World, s: Structure): void {
  s.cooldown = 0;
  updateTowers(w, DT);
}

/**
 * Three enemies packed on the +x axis. `bestConeDirection` maximises the
 * number of enemies inside the cone with a strict `count > bestCount`, so a
 * cluster of three always beats aiming at the single off-axis probe — which
 * is what makes the cone rows a test of the half-*angle* rather than of the
 * direction search.
 */
function coneAnchors(w: World, x: number, y: number): void {
  for (const d of [1.2, 1.3, 1.4]) dummy(w, x + d, y);
}

/* ------------------------------------------------------------- the ten reads */

/** One `w.derived.areaMul` read in `src/sim`. */
interface Read {
  /** `file` + the function the read sits in, as a reader would grep for it. */
  name: string;
  file: string;
  /**
   * Must still match `file`. Each anchor carries an adjacent line unique to
   * its function, so a read that moves to a *different* function in the same
   * file reddens its own row rather than going quiet.
   */
  anchor: RegExp;
}

const R_TOWER_RANGE = 'towers.ts effectiveTowerRange (aura kind)';
const R_TOWER_AOE_LOB = 'towers.ts effectiveTowerAoe (lob branch)';
const R_TOWER_AOE_POISON = 'towers.ts effectiveTowerAoe (poison branch)';
const R_FIRE_TOWER = 'towers.ts fireTower (aura radius / cone half-angle / lob shell aoe)';
const R_CLASS_AREA = 'classes.ts classArea (a kit footprint: nova, cloud, zone, aura, line half-width, basic splash)';
const R_ELECTRIC = 'damagetypes.ts applyDamageType (Electric inherent AoE)';
const R_BURNING = 'enemies.ts tickDotSplash (Burning splash)';
const R_WIELD_RANGE = 'vswield.ts wieldedRangeFor (VS wielded attack range)';
const R_WIELD_SPLASH = 'vswield.ts wieldedSplashFor (VS single-kind cleave radius)';
const R_FIRE_WIELDED = 'vswield.ts fireWielded (line half-width / cleave / cone / chain range)';

const READS: readonly Read[] = [
  {
    name: R_TOWER_RANGE,
    file: 'src/sim/towers.ts',
    anchor:
      /const targeting = a\.range \* w\.derived\.towerRangeMul;\r?\n\s*return a\.kind === 'aura' \? targeting \* w\.derived\.areaMul : targeting;/,
  },
  {
    name: R_TOWER_AOE_LOB,
    file: 'src/sim/towers.ts',
    anchor: /kind === 'lob'\) return \(a\.aoe \?\? 1\.5\) \* w\.derived\.areaMul;/,
  },
  {
    name: R_TOWER_AOE_POISON,
    file: 'src/sim/towers.ts',
    anchor: /kind === 'poison'\) return \(a\.aoe \?\? 0\) \* w\.derived\.areaMul;/,
  },
  {
    name: R_FIRE_TOWER,
    file: 'src/sim/towers.ts',
    anchor: /const dmg = towerDamage\(w, s, a\.damage\);\r?\n\s*const area = w\.derived\.areaMul;/,
  },
  {
    name: R_CLASS_AREA,
    file: 'src/sim/classes.ts',
    anchor: /function classArea\(w: World, radius: number\): number \{\r?\n\s*return radius \* w\.derived\.areaMul;/,
  },
  {
    name: R_ELECTRIC,
    file: 'src/sim/damagetypes.ts',
    anchor: /const r = radius \* w\.derived\.areaMul;\r?\n\s*w\.emit\('pulse'/,
  },
  {
    name: R_BURNING,
    file: 'src/sim/enemies.ts',
    anchor: /const r = \(acc\.radius \+ w\.derived\.burnSpread\) \* w\.derived\.areaMul;/,
  },
  {
    name: R_WIELD_RANGE,
    file: 'src/sim/vswield.ts',
    anchor: /return a\.range \* w\.derived\.areaMul \* w\.derived\.charRangeMul;/,
  },
  {
    name: R_WIELD_SPLASH,
    file: 'src/sim/vswield.ts',
    anchor: /radius: WIELD_SPLASH_RADIUS \* w\.derived\.areaMul/,
  },
  {
    name: R_FIRE_WIELDED,
    file: 'src/sim/vswield.ts',
    anchor: /const y = wd\.y;\r?\n\s*const area = w\.derived\.areaMul;/,
  },
];

/**
 * The helpers that carry a read *out of* the function it lives in, and how
 * many times each **name** appears in each `src/sim` file (import and
 * definition included). This is the guard the read table cannot be: `c001`
 * widened Wide Grove's blast radius by adding **callers**, not reads.
 *
 * The count is on the bare name, not on `name(`, so a one-line alias
 * (`const areaOf = classArea`) is a diff here too — QA found the call-shaped
 * regex waved that through.
 */
const CARRIERS: ReadonlyArray<{ fn: string; sites: Record<string, number> }> = [
  { fn: 'classArea', sites: { 'src/sim/classes.ts': 18 } },
  {
    fn: 'effectiveTowerAoe',
    sites: { 'src/sim/classes.ts': 2, 'src/sim/towers.ts': 2, 'src/sim/vswield.ts': 5 },
  },
  { fn: 'effectiveTowerRange', sites: { 'src/sim/towers.ts': 1 } },
  { fn: 'wieldedRangeFor', sites: { 'src/sim/vswield.ts': 3 } },
  { fn: 'wieldedSplashFor', sites: { 'src/sim/vswield.ts': 1 } },
  // Not an `areaMul` read itself: it is how `effectiveTowerAoe` reaches a
  // *class summon*, the caller c001's own doc comment describes and the one
  // this file's Manifest row measures.
  { fn: 'towerSummonProfile', sites: { 'src/sim/classes.ts': 3 } },
];

/* -------------------------------------------------------- the twenty consumers */

/**
 * One footprint a read produces. `route` is what §4.2's sentence — "All towers
 * +10% area" — covers: a tower's own attack (or a surface quoting it), or
 * something else.
 */
interface Consumer {
  site: string;
  /** The `READS` entry this footprint flows from. */
  read: string;
  route: 'tower' | 'character';
  measure: (c: Content, o?: WorldOpts) => number;
}

const FROST = 'frost_obelisk';
const MORTAR = 'mortar';
const VENOM = 'venom_spore';
const TESLA = 'tesla_coil';
const BRAZIER = 'ember_brazier';
const ARROW = 'arrow_spire';

/**
 * The first tier at which `attackProfile` resolves a §5.2 milestone this file
 * needs — asked of the sim rather than read off `/data`, because a special's
 * `at: 3` lands at *tier 4* (tier 1 is the unupgraded tower) and because a
 * milestone that moves must move this file's probe with it, not redden it.
 */
function tierWhere(def: TowerDef, has: (p: ReturnType<typeof attackProfile>) => boolean): number {
  for (let t = 1; t <= maxLevel(def); t++) if (has(attackProfile(def, t))) return t;
  throw new Error(`no tier of ${def.key} resolves the milestone this probe needs`);
}

const CONSUMERS: readonly Consumer[] = [
  {
    site: "a Frost Obelisk's ring, as the panel and the range circle quote it",
    read: R_TOWER_RANGE,
    route: 'tower',
    measure: (c, o) => effectiveTowerRange(animist(c, o), c.towerByKey.get(FROST)!),
  },
  {
    // Named for what it is: `fireTower`'s lob case computes its shell radius
    // from its own inline `(a.aoe ?? 1.5) * area` (`towers.ts:577`), *not*
    // from this helper, so `effectiveTowerAoe`'s lob branch is the panel's
    // mirror of that number. Both are asserted — a `towerArea` fix that moves
    // one and not the other is a drift the two rows catch between them.
    site: "a Mortar's shell radius, as the panel mirror quotes it",
    read: R_TOWER_AOE_LOB,
    route: 'tower',
    measure: (c, o) => effectiveTowerAoe(animist(c, o), c.towerByKey.get(MORTAR)!),
  },
  {
    // The Animist's *own Active1*, reaching `effectiveTowerAoe` through
    // `towerSummonProfile` — a class footprint widened by a read this file
    // would otherwise have filed as authorised.
    site: "the Animist's *Manifest* spirit, cloned from a Mortar",
    read: R_TOWER_AOE_LOB,
    route: 'character',
    measure: (c, o) => {
      const w = animist(c, { ...o, phase: 'act1_wave' });
      placeProbed(w, MORTAR);
      expect(useClassActive(w), 'harness summoned no spirit').toBe(true);
      const spirit = w.classSummons.find((s) => s.kind === 'animist_spirit');
      expect(spirit, 'harness summoned no spirit').toBeDefined();
      return spirit!.aoe;
    },
  },
  {
    site: "a VS wielded lob's blast (§6.1: a character attack)",
    read: R_TOWER_AOE_LOB,
    route: 'character',
    measure: (c, o) => {
      const def = c.towerByKey.get(MORTAR)!;
      return wieldedAoeFor(animist(c, o), def, def.attack!);
    },
  },
  {
    // The poison branch's real TD consumer: `fireTower`'s poison case reads
    // this helper directly (`towers.ts:606`), unlike the lob case above.
    site: "a Venom Spore's own splash, as the spore really lands it",
    read: R_TOWER_AOE_POISON,
    route: 'tower',
    measure: (c, o) => {
      const w = animist(c, o);
      const p = placeProbed(w, VENOM);
      const authored = c.towerByKey.get(VENOM)!.attack!.aoe!;
      const reach = c.towerByKey.get(VENOM)!.attack!.range;
      // The primary at the edge of the spore's own reach, the bystander past
      // it: only the splash can touch the bystander.
      const primary = dummy(w, p.x + reach * 0.95, p.y);
      const bystander = dummy(w, p.x + reach * 0.95 + authored * RING, p.y);
      const before = bystander.hp;
      fireOnce(w, p.s);
      expect(primary.hp, 'harness fired no spore').toBeLessThan(primary.maxHp);
      return before - bystander.hp;
    },
  },
  {
    site: "a VS wielded poison's blast (§6.1: a character attack)",
    read: R_TOWER_AOE_POISON,
    route: 'character',
    measure: (c, o) => {
      const def = c.towerByKey.get(VENOM)!;
      return wieldedAoeFor(animist(c, o), def, def.attack!);
    },
  },
  {
    site: "a Frost Obelisk's aura, as the enemy standing in it feels it",
    read: R_FIRE_TOWER,
    route: 'tower',
    measure: (c, o) => {
      const w = animist(c, o);
      const p = placeProbed(w, FROST);
      const authored = c.towerByKey.get(FROST)!.attack!.range;
      const e = dummy(w, p.x + authored * RING, p.y);
      const before = e.hp;
      fireOnce(w, p.s);
      return before - e.hp;
    },
  },
  {
    site: "an Ember Brazier's cone half-angle",
    read: R_FIRE_TOWER,
    route: 'tower',
    measure: (c, o) => {
      const w = animist(c, o);
      const p = placeProbed(w, BRAZIER);
      const half = c.towerByKey.get(BRAZIER)!.attack!.coneHalfAngle ?? 0.6;
      coneAnchors(w, p.x, p.y);
      // Off-axis by the ring *angle*, at a radius well inside the cone's own
      // reach — which Area does not scale, so only the angle is under test.
      const along = 2;
      const probe = dummy(w, p.x + along, p.y + along * Math.tan(half * RING));
      const before = probe.hp;
      fireOnce(w, p.s);
      return before - probe.hp;
    },
  },
  {
    site: "a Mortar's shell splash, as the shell really detonates it",
    read: R_FIRE_TOWER,
    route: 'tower',
    measure: (c, o) => {
      const w = animist(c, o);
      const p = placeProbed(w, MORTAR);
      const a = c.towerByKey.get(MORTAR)!.attack!;
      const authored = a.aoe!;
      // Inside the mortar's own reach; the bystander past it, so `pickLobTarget`
      // can only ever aim at the primary.
      const primary = dummy(w, p.x + a.range * 0.95, p.y);
      const bystander = dummy(w, p.x + a.range * 0.95 + authored * RING, p.y);
      const before = bystander.hp;
      fireOnce(w, p.s);
      // The shell is the only asynchronous carrier here: it has to fly.
      for (let i = 0; i < 300 && w.projectiles.some((q) => !q.dead); i++) updateProjectiles(w, DT);
      expect(primary.hp, 'harness landed no shell').toBeLessThan(primary.maxHp);
      return before - bystander.hp;
    },
  },
  {
    site: "the Animist's *Recall Totem* aura radius",
    read: R_CLASS_AREA,
    route: 'character',
    measure: (c, o) => {
      // Recall Totem freezes its aura radius at cast (`fireRecallTotem`), so
      // the standing totem *is* the reading.
      const w = animist(c, { ...o, phase: 'act1_wave' });
      expect(useClassActive2(w, w.warden.x, w.warden.y), 'harness cast no totem').toBe(true);
      const totem = w.classSummons.find((s) => s.kind === 'animist_totem');
      expect(totem, 'harness cast no totem').toBeDefined();
      return totem!.auraRadius ?? 0;
    },
  },
  {
    site: "Electric's inherent AoE, off a Tesla Coil's own hit",
    read: R_ELECTRIC,
    route: 'tower',
    measure: (c, o) => {
      const w = animist(c, o);
      const p = placeProbed(w, TESLA);
      const reach = c.towerByKey.get(TESLA)!.attack!.range;
      const authored = c.damageTypeByKey.get('electric')!.radius!;
      // The primary at the far edge of the coil's own reach and the bystander
      // just past it, so the coil can only ever target the primary and only
      // the Electric splash can touch the bystander. A `chain`'s reach does
      // not scale with Area, so this holds under the control too.
      const primary = dummy(w, p.x + reach * 0.96, p.y);
      const bystander = dummy(w, p.x + reach * 0.96 + authored * RING, p.y);
      const before = bystander.hp;
      fireOnce(w, p.s);
      expect(primary.hp, 'harness fired no coil volley').toBeLessThan(primary.maxHp);
      return before - bystander.hp;
    },
  },
  {
    site: "Electric's inherent AoE, off a class Active",
    read: R_ELECTRIC,
    route: 'character',
    measure: (c, o) => {
      const w = animist(c, o);
      const authored = c.damageTypeByKey.get('electric')!.radius!;
      const primary = dummy(w, w.warden.x + 3, w.warden.y);
      const bystander = dummy(w, w.warden.x + 3, w.warden.y + authored * RING);
      const before = bystander.hp;
      applyDamageType(w, primary, 'electric', 500, 'class_active');
      return before - bystander.hp;
    },
  },
  {
    site: "Burning's splash, off an Ember Brazier's own burn",
    read: R_BURNING,
    route: 'tower',
    measure: (c, o) => {
      const w = animist(c, o);
      const p = placeProbed(w, BRAZIER);
      const reach = c.towerByKey.get(BRAZIER)!.attack!.range;
      const authored = c.damageTypeByKey.get('burning')!.radius!;
      expect(w.derived.burnSpread, 'burnSpread must be 0 here or the ring moves').toBe(0);
      // Same shape as the coil row: the carrier at the edge of the cone's
      // reach, the neighbour past it. A cone's *range* does not scale with
      // Area (only its half-angle does), so the neighbour is out of the
      // brazier's own reach in every world this file builds.
      const carrier = dummy(w, p.x + reach * 0.94, p.y);
      const neighbour = dummy(w, p.x + reach * 0.94 + authored * RING, p.y);
      const before = neighbour.hp;
      fireOnce(w, p.s);
      expect(
        carrier.dots.some((d) => d.type === 'burning'),
        'harness lit no burn',
      ).toBe(true);
      updateEnemies(w, DT);
      return before - neighbour.hp;
    },
  },
  {
    site: "Burning's splash, off a class Active",
    read: R_BURNING,
    route: 'character',
    measure: (c, o) => {
      const w = animist(c, o);
      const authored = c.damageTypeByKey.get('burning')!.radius!;
      expect(w.derived.burnSpread, 'burnSpread must be 0 here or the ring moves').toBe(0);
      const carrier = dummy(w, w.warden.x + 3, w.warden.y);
      const neighbour = dummy(w, w.warden.x + 3, w.warden.y + authored * RING);
      const before = neighbour.hp;
      applyDot(w, carrier, 'burning', 100, 5, 'class_active');
      updateEnemies(w, DT);
      return before - neighbour.hp;
    },
  },
  {
    site: "a VS wielded attack's range (§6.1: a character attack)",
    read: R_WIELD_RANGE,
    route: 'character',
    measure: (c, o) => wieldedRangeFor(animist(c, o), c.towerByKey.get(ARROW)!.attack!),
  },
  {
    site: 'a VS wielded single-kind cleave radius, as the panel quotes it',
    read: R_WIELD_SPLASH,
    route: 'character',
    measure: (c, o) => wieldedSplashFor(animist(c, o), c.towerByKey.get(ARROW)!.attack!)!.radius,
  },
  {
    site: 'the cleave a wielded shot really lands',
    read: R_FIRE_WIELDED,
    route: 'character',
    measure: (c, o) => {
      // Built first, *then* moved to Act II: `buildTower` refuses in the VS
      // phase, which is the order a real run does it in.
      const w = animist(c, o);
      const p = placeProbed(w, ARROW);
      w.phase = 'act2';
      // The un-widened cleave radius, read off a world that has no Area at all.
      const authored = wieldedSplashFor(animist(noGrove), c.towerByKey.get(ARROW)!.attack!)!.radius;
      const primary = dummy(w, p.x + 2, p.y);
      // Perpendicular to the shot, so only the cleave can reach it, never the line.
      const bystander = dummy(w, p.x + 2, p.y + authored * RING);
      const before = bystander.hp;
      updateWieldedAttacks(w, DT);
      expect(primary.hp, 'harness fired no wielded shot').toBeLessThan(primary.maxHp);
      return before - bystander.hp;
    },
  },
  {
    site: "a wielded line's perpendicular half-width (Arrow at its §5.2 pierce milestone)",
    read: R_FIRE_WIELDED,
    route: 'character',
    measure: (c, o) => {
      const w = animist(c, o);
      const p = placeProbed(w, ARROW);
      // At pierce 0 the line stops at its primary, so the half-width decides
      // nothing; the Arrow's §5.2 pierce milestone is the first tier where a
      // second enemy can be on the line at all.
      upgradeTo(w, p, tierWhere(c.towerByKey.get(ARROW)!, (prof) => prof.pierce > 0));
      w.phase = 'act2';
      const half = LINE_HALF_WIDTH;
      const primary = dummy(w, p.x + 1, p.y);
      // Far enough down the line that the cleave (radius ~1.6 from the
      // primary) cannot reach it, so only the line's half-width can.
      const beside = dummy(w, p.x + 4, p.y + half * RING, 0.01);
      const before = beside.hp;
      updateWieldedAttacks(w, DT);
      expect(primary.hp, 'harness fired no wielded shot').toBeLessThan(primary.maxHp);
      return before - beside.hp;
    },
  },
  {
    site: "a wielded cone's half-angle",
    read: R_FIRE_WIELDED,
    route: 'character',
    measure: (c, o) => {
      const w = animist(c, o);
      const p = placeProbed(w, BRAZIER);
      w.phase = 'act2';
      const half = c.towerByKey.get(BRAZIER)!.attack!.coneHalfAngle ?? 0.6;
      coneAnchors(w, p.x, p.y);
      const along = 2;
      const probe = dummy(w, p.x + along, p.y + along * Math.tan(half * RING));
      const before = probe.hp;
      updateWieldedAttacks(w, DT);
      return before - probe.hp;
    },
  },
  {
    site: "a wielded chain's jump range (Tesla at its §5.2 electric-chain milestone)",
    read: R_FIRE_WIELDED,
    route: 'character',
    measure: (c, o) => {
      const w = animist(c, o);
      const p = placeProbed(w, TESLA);
      // `chains: 1` means `chainHit` strikes only its first target, so the
      // jump range is observable only through the milestone's `arcElectric`.
      upgradeTo(w, p, tierWhere(c.towerByKey.get(TESLA)!, (prof) => prof.electricChain));
      w.phase = 'act2';
      const jump = c.towerByKey.get(TESLA)!.attack!.chainRange ?? 3;
      const primary = dummy(w, p.x + 1, p.y);
      const next = dummy(w, p.x + 1, p.y + jump * RING);
      const before = next.hp;
      updateWieldedAttacks(w, DT);
      expect(primary.hp, 'harness fired no wielded volley').toBeLessThan(primary.maxHp);
      return before - next.hp;
    },
  },
];

/**
 * The one use of one read with no probe, named rather than left silent
 * (`c019`'s convention).
 */
const DEVIATIONS: ReadonlyArray<{ read: string; use: string; anchor: RegExp; why: string }> = [
  {
    read: R_FIRE_WIELDED,
    use: "the `pierce` kind's `bestLineDirection` half-width",
    anchor: /const dir = bestLineDirection\(w, x, y, range, LINE_HALF_WIDTH \* area\);/,
    why:
      'The widened half-width only re-scores which direction the bolt is fired in; the bolt then ' +
      'carries its own geometry through `spawnProjectile` (`pierce`, combat.ts), which Area never ' +
      'touches. So it changes an observable only when it flips the chosen direction outright, and a ' +
      'probe that forced such a flip would be measuring the direction search rather than the ' +
      'footprint. Declared here so the uncovered use is a decision with a reason attached.',
  },
];

/** A read is shared when both routes flow through it — derived, never hand-typed. */
function sharedReads(): string[] {
  return READS.filter((r) => {
    const routes = new Set(CONSUMERS.filter((c) => c.read === r.name).map((c) => c.route));
    return routes.has('tower') && routes.has('character');
  }).map((r) => r.name);
}

/** The four a `towerArea` key alone cannot close: they need a source check at the site as well. */
const SHARED_READS: readonly string[] = [R_TOWER_AOE_LOB, R_TOWER_AOE_POISON, R_ELECTRIC, R_BURNING];

/* ------------------------------------------------------- the completeness guards */

/**
 * Comments removed, string literals kept. Both halves matter: the repo's doc
 * comments quote these expressions constantly (a reworded comment must not
 * redden this file), and `w.derived['areaMul']` is a real spelling of a real
 * read that lives inside a string literal.
 */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;
  let line = false;
  let block = false;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1] ?? '';
    if (line) {
      if (c === '\n') {
        line = false;
        out += c;
      }
      i++;
    } else if (block) {
      if (c === '*' && next === '/') {
        block = false;
        i += 2;
      } else {
        out += c === '\n' ? '\n' : ' ';
        i++;
      }
    } else if (quote) {
      out += c;
      if (c === '\\') {
        out += next;
        i += 2;
      } else {
        if (c === quote) quote = null;
        i++;
      }
    } else if (c === '/' && next === '/') {
      line = true;
      i += 2;
    } else if (c === '/' && next === '*') {
      block = true;
      i += 2;
    } else {
      if (c === "'" || c === '"' || c === '`') quote = c;
      out += c;
      i++;
    }
  }
  return out;
}

/** Per-file counts of a regex's matches across `src/sim`, comments excluded. */
function scanSim(re: RegExp): Map<string, number> {
  const out = new Map<string, number>();
  const walk = (dir: string): void => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(p);
        continue;
      }
      if (!ent.name.endsWith('.ts')) continue;
      const code = stripComments(readFileSync(p, 'utf8'));
      const n = (code.match(new RegExp(re.source, 'g')) ?? []).length;
      if (n > 0) out.set(p.replace(/\\/g, '/'), n);
    }
  };
  walk('src/sim');
  return out;
}

function asObject(m: Map<string, number>): Record<string, number> {
  return Object.fromEntries([...m].sort());
}

/**
 * `stats.ts` is where `areaMul` is *written* — the `Derived` field and the
 * `s.factor('area')` that fills it. Everything else that names the token is a
 * reader, which is why the token count is what this guard watches rather than
 * the `w.derived.areaMul` spelling: destructuring it, bracket-indexing it or
 * splitting it over two lines are all reads that the narrower pattern misses.
 */
const WRITER = { 'src/sim/stats.ts': 2 };

describe('c013: the tables cover every way `areaMul` gets out of the stat block', () => {
  it('every `areaMul` token under src/sim is a declared read or the writer itself', () => {
    const declared: Record<string, number> = { ...WRITER };
    for (const r of READS) declared[r.file] = (declared[r.file] ?? 0) + 1;
    expect(
      asObject(scanSim(/\bareaMul\b/)),
      'a src/sim file names areaMul a different number of times than READS + WRITER claims',
    ).toEqual(Object.fromEntries(Object.entries(declared).sort()));
  });

  for (const r of READS) {
    it(`${r.name}: its read is still where the table says it is`, () => {
      expect(readFileSync(r.file, 'utf8')).toMatch(r.anchor);
    });
  }

  // The guard the read table cannot be. c001 added a *caller*, not a read.
  for (const carrier of CARRIERS) {
    it(`${carrier.fn}: its call sites are still the ones the table knows about`, () => {
      expect(
        asObject(scanSim(new RegExp(`\\b${carrier.fn}\\b`))),
        `a new caller of ${carrier.fn} is a new footprint Wide Grove widens — give it a CONSUMERS row`,
      ).toEqual(carrier.sites);
    });
  }

  it('every consumer names a read that exists, and every read has at least one consumer', () => {
    const names = new Set(READS.map((r) => r.name));
    for (const c of CONSUMERS) expect(names, `${c.site} names an unknown read`).toContain(c.read);
    for (const d of DEVIATIONS) expect(names, `${d.use} names an unknown read`).toContain(d.read);
    for (const r of READS) {
      expect(
        CONSUMERS.some((c) => c.read === r.name),
        `${r.name} has no consumer — its reach is unmeasured`,
      ).toBe(true);
    }
  });

  for (const d of DEVIATIONS) {
    it(`deviation: ${d.use} is uncovered on purpose, and still exists`, () => {
      const read = READS.find((r) => r.name === d.read)!;
      expect(readFileSync(read.file, 'utf8'), d.why).toMatch(d.anchor);
    });
  }

  it('the display readers outside src/sim are named', () => {
    // These render or quote the same footprints without being able to widen
    // them: hud.ts formats `areaMul - 1` into the Character panel's "Area" row
    // (so an Animist reads "+10% Area" on the same screen whose class card
    // says "All towers +10% area"), and canvas.ts/tower-info.ts draw and quote
    // the tower rings and splashes through the two `effectiveTower*` helpers.
    // Asserted loosely on purpose: all three belong to the UI lane, and a
    // redden there would be noise from this file.
    for (const [file, re] of [
      ['src/ui/hud.ts', /areaMul/],
      ['src/ui/tower-info.ts', /effectiveTower(Range|Aoe)\(/],
      ['src/render/canvas.ts', /effectiveTower(Range|Aoe)\(/],
    ] as const) {
      expect(readFileSync(file, 'utf8'), `${file} no longer reads the footprint this file says it does`).toMatch(re);
    }
  });
});

/* ---------------------------------------------------------------- the harness */

describe('c013: the harness measures Wide Grove and nothing else', () => {
  it('the two Contents differ by exactly one key', () => {
    expect(content.classByKey.get('animist')!.towerPassive.mods.area).toBe(WIDE_GROVE);
    expect(noGrove.classByKey.get('animist')!.towerPassive.mods.area).toBeUndefined();
    expect(WIDE_GROVE).toBeGreaterThan(0);
  });

  it("Wide Grove is the whole of an Animist run's areaMul, and the control removes it", () => {
    expect(animist(content).derived.areaMul).toBeCloseTo(1 + WIDE_GROVE, 10);
    expect(animist(noGrove).derived.areaMul).toBe(1);
  });

  it('the sensitivity control clears every ring, which sits at RING', () => {
    expect(1 + CONTROL_AREA).toBeGreaterThan(RING);
    // ...and by a margin no retune of the shipped row can erode.
    expect(CONTROL_AREA).toBeGreaterThan(WIDE_GROVE);
  });

  it('the row set covers both routes, or the leak below would be unfalsifiable', () => {
    expect(CONSUMERS.some((c) => c.route === 'tower')).toBe(true);
    expect(CONSUMERS.some((c) => c.route === 'character')).toBe(true);
  });

  // The honesty half. A probe that measured nothing would report "Wide Grove
  // does not widen this" — the same answer the main-lane fix is expected to
  // produce for the character rows. Every probe must therefore be shown to see
  // Area arriving by a door that is not Wide Grove.
  for (const c of CONSUMERS) {
    it(`${c.site}: the probe still sees Area arriving from another source`, () => {
      const flat = c.measure(noGrove);
      const bumped = c.measure(noGrove, { area: CONTROL_AREA });
      expect(bumped, `${c.site} is blind to Area — its "does not widen" reading would be worthless`).toBeGreaterThan(
        flat,
      );
    });
  }
});

/* ------------------------------------------------------------ the measurement */

describe('c013: what Wide Grove widens today, per consumer', () => {
  for (const c of CONSUMERS) {
    it(`${c.site} [${c.route}]: Wide Grove widens it`, () => {
      const withGrove = c.measure(content);
      const without = c.measure(noGrove);
      // Every one of the twenty is widened today — that is the finding. When
      // the main-lane `towerArea` key lands, the twelve character rows flip
      // and this assertion goes red on exactly those rows.
      expect(withGrove, `${c.site} no longer widens — see LEAKING_TODAY below`).toBeGreaterThan(without);
    });
  }
});

/**
 * The claim in one place, as the thing the main-lane fix removes.
 *
 * `route === 'character'` is "§4.2's sentence does not cover this footprint".
 * Twelve of the twenty consumers are in that set today. A `towerArea` key
 * empties nine of them outright; the three that flow through a `shared` read
 * (the *Manifest* spirit and the two wielded blasts, all via
 * `effectiveTowerAoe`) plus the two shared damage-type sites need a source
 * check at the site as well, since none of those lines can see who called.
 */
const LEAKING_TODAY: readonly string[] = [
  "the Animist's *Manifest* spirit, cloned from a Mortar",
  "a VS wielded lob's blast (§6.1: a character attack)",
  "a VS wielded poison's blast (§6.1: a character attack)",
  "the Animist's *Recall Totem* aura radius",
  "Electric's inherent AoE, off a class Active",
  "Burning's splash, off a class Active",
  "a VS wielded attack's range (§6.1: a character attack)",
  'a VS wielded single-kind cleave radius, as the panel quotes it',
  'the cleave a wielded shot really lands',
  "a wielded line's perpendicular half-width (Arrow at its §5.2 pierce milestone)",
  "a wielded cone's half-angle",
  "a wielded chain's jump range (Tesla at its §5.2 electric-chain milestone)",
];

describe('c013: the leak, stated as a set the fix can be checked against', () => {
  it('exactly these twelve non-tower footprints are widened by "All towers +10% area"', () => {
    const leaking = CONSUMERS.filter((c) => c.route === 'character' && c.measure(content) > c.measure(noGrove)).map(
      (c) => c.site,
    );
    expect(leaking, 'the leak set moved — update LEAKING_TODAY and say which fix moved it').toEqual(LEAKING_TODAY);
  });

  it('and every footprint §4.2 does claim is still widened', () => {
    const towers = CONSUMERS.filter((c) => c.route === 'tower');
    for (const c of towers) {
      expect(c.measure(content), `${c.site} stopped obeying the row that claims it`).toBeGreaterThan(c.measure(noGrove));
    }
    expect(towers.length, 'a tower-route consumer was added or dropped').toBe(8);
  });

  it('four reads serve both routes, so a `towerArea` key alone cannot close them', () => {
    expect(sharedReads(), 'the shared-read set moved — a key swap now fixes more (or less) than it did').toEqual(
      SHARED_READS,
    );
  });
});

/* ------------------------------------- c024: the Time Lord twin, and it is bigger */

/**
 * **c024 — the same §4.2 "all towers" wording, on the other class, applied by
 * code instead of by `/data`.** Filed by QA on `c013`.
 *
 * `applyChronalSurge` (`src/sim/run.ts:816-817`) is two adjacent lines:
 *
 * ```ts
 * w.stats.add(source, 'towerRange', cls.towerPassive.bonusRangeMul ?? 0);
 * w.stats.add(source, 'area',       cls.towerPassive.bonusAoeMul   ?? 0);
 * ```
 *
 * A **tower-scoped** key for the range half and the **global** key for the
 * area half, from one sentence, uncapped, and re-added every `waveInterval` TD
 * waves for the whole run. The Animist's leak that `c013` sized is a flat
 * `+10%` authored once in `data/classes.json`; this one compounds with wave
 * count, and this lane's own Log already measured it at `areaMul 3.203` by end
 * of run — **+90% from Chronal Surge alone**, up to nine times the Animist's.
 *
 * **Why it had to live in this file.** Every one of the twenty `CONSUMERS`
 * built an Animist world. A main-lane `towerArea` swap that moved
 * `data/classes.json` but missed `run.ts:817` would therefore have landed with
 * this file *fully green* while leaving the larger of the two leaks in place.
 * The consumers are now class-parameterised (`WorldOpts.classKey`), so the two
 * classes' rows flip together or the difference is a named deviation.
 *
 * **`run.ts` is not edited from this lane** — this is the measurement only.
 */

/**
 * `Content` rebuilt with Chronal Surge's *area* half zeroed, its range half
 * untouched.
 *
 * **Zeroed, not deleted** — and the difference is the loader doing its job.
 * `c013`'s Animist control deletes `towerPassive.mods.area`, which is legal
 * because `mods` is a free map. `bonusAoeMul` is a *required field of the
 * `chronal_surge` kind* (`validateClassPassive`, `content.ts:1333`), so
 * deleting it is refused outright with "chronal_surge needs bonusAoeMul" —
 * architecture rule 4's "a loader rule that refuses unpayable data is worth
 * more than a comment saying the data must be valid", met head-on. `0` is the
 * payable spelling of the same control.
 */
function contentWithoutChronalAoe(): Content {
  const doc = JSON.parse(JSON.stringify(content.raw.classes)) as {
    classes: { key: string; towerPassive: Record<string, unknown> }[];
  };
  const row = doc.classes.find((c) => c.key === 'time_lord');
  if (!row) throw new Error('time_lord missing from data/classes.json');
  row.towerPassive.bonusAoeMul = 0;
  return loadContent({ classes: doc });
}

const noSurgeAoe = contentWithoutChronalAoe();

/** The interval the passive is authored to fire on — read, never assumed (c009's convention). */
const SURGE_INTERVAL = Math.max(1, Math.round(content.classByKey.get('time_lord')!.towerPassive.waveInterval ?? 2));

/** Enough clears for the surge to have fired twice, so a compounding leak is visibly compounding. */
const SURGES = SURGE_INTERVAL * 2;

const timeLordOpts = (o: WorldOpts = {}): WorldOpts => ({ ...o, classKey: 'time_lord', surges: SURGES });

describe('c024: Chronal Surge fired for real, and its area half reaches the same footprints', () => {
  it('the harness actually fires it: a tower footprint widens against the no-AoE control', () => {
    // Without this the whole block below could pass on twenty pairs of equal
    // readings — c005's "the probes are live" lesson, which this session has
    // already been bitten by once.
    const tower = CONSUMERS.find((c) => c.route === 'tower' && c.read === R_TOWER_AOE_LOB);
    expect(tower, 'no tower-route AoE consumer to anchor the harness on').toBeDefined();
    expect(tower!.measure(content, timeLordOpts())).toBeGreaterThan(tower!.measure(noSurgeAoe, timeLordOpts()));
  });

  it('the two halves really are authored on different stat keys, which is the whole bug', () => {
    // The cleanest evidence the main-lane `towerArea` key needs, asserted on
    // the source rather than described: two adjacent `stats.add` calls from one
    // §4.2 sentence, one tower-scoped and one global.
    const run = readFileSync(join(__dirname, '../src/sim/run.ts'), 'utf8');
    expect(run, "Chronal Surge's range half is no longer tower-scoped").toMatch(
      /w\.stats\.add\(source, 'towerRange', cls\.towerPassive\.bonusRangeMul/,
    );
    expect(
      run,
      "Chronal Surge's area half no longer uses the global `area` key — if a `towerArea` key landed, " +
        'the LEAKING rows below should have flipped with it',
    ).toMatch(/w\.stats\.add\(source, 'area', cls\.towerPassive\.bonusAoeMul/);
  });

  /**
   * **Two of the twenty cannot exist in a Time Lord world at all**, and that is
   * structural rather than a finding: they are footprints of the *Animist's own
   * class Actives*. A Time Lord cannot summon a Manifest spirit or plant a
   * Recall Totem, so there is nothing to widen. Named, per `c019`'s convention,
   * rather than quietly dropped from the sweep.
   */
  const CLASS_SPECIFIC: readonly string[] = [
    "the Animist's *Manifest* spirit, cloned from a Mortar",
    "the Animist's *Recall Totem* aura radius",
  ];

  /**
   * **Three more are harness-calibrated for the Animist and do not survive
   * being pointed at this control**, which is a statement about the probe and
   * not about the leak. Measured, not guessed:
   *
   *   | consumer                          | surge world | zeroed control      |
   *   |-----------------------------------|-------------|---------------------|
   *   | Venom Spore splash (tower)        | 190         | *no spore landed*   |
   *   | Electric off a Tesla hit (tower)  | 319         | *no volley landed*  |
   *   | Frost Obelisk aura (tower)        | 234         | 234 (saturated)     |
   *
   * The first two probes place their victim at a distance tuned to the
   * Animist's flat `+10%`; with Chronal Surge's area contribution zeroed the
   * footprint no longer reaches it and the probe's own harness assertion fires
   * — the control under-reaches, so there is no comparison to make. The third
   * reads a saturating observable (the enemy is inside the aura either way).
   *
   * All three are **tower-route**, which is the half §4.2's "all towers"
   * sentence actually covers, so none of them is where the leak lives; the
   * twelve character-route rows are. Re-calibrating them belongs with `c026`'s
   * footprint work, not here — filed rather than bodged, because widening a
   * probe to make a control pass is how a measurement stops measuring.
   */
  const UNCALIBRATED: readonly string[] = [
    "a Venom Spore's own splash, as the spore really lands it",
    "Electric's inherent AoE, off a Tesla Coil's own hit",
    "a Frost Obelisk's aura, as the enemy standing in it feels it",
  ];

  const APPLICABLE = CONSUMERS.filter((c) => !CLASS_SPECIFIC.includes(c.site) && !UNCALIBRATED.includes(c.site));

  it('the two exclusion lists name real consumers, and leave fifteen measured', () => {
    const sites = CONSUMERS.map((c) => c.site);
    for (const name of [...CLASS_SPECIFIC, ...UNCALIBRATED]) {
      expect(sites, `${name} is not a CONSUMERS row — the exclusion list has drifted`).toContain(name);
    }
    expect(APPLICABLE).toHaveLength(CONSUMERS.length - CLASS_SPECIFIC.length - UNCALIBRATED.length);
    expect(APPLICABLE.length, 'the sweep has stopped covering most of the table').toBe(15);
  });

  it('the two class-specific rows really are Animist Actives, not something quietly dropped', () => {
    // They widen under the Animist — that is c013's finding, re-read here — so
    // their absence under Time Lord is about whose Active it is, nothing else.
    for (const name of CLASS_SPECIFIC) {
      const c = CONSUMERS.find((x) => x.site === name)!;
      expect(c.measure(content), `${name} no longer widens under the Animist either`).toBeGreaterThan(
        c.measure(noGrove),
      );
    }
  });

  for (const c of APPLICABLE) {
    it(`${c.site} [${c.route}]: Chronal Surge's area half widens it, exactly as Wide Grove does`, () => {
      const withSurge = c.measure(content, timeLordOpts());
      const without = c.measure(noSurgeAoe, timeLordOpts());
      // The same footprints, so the two classes flip together when the
      // main-lane key lands. A row that stops widening here while the Animist
      // row still does is the asymmetry this item exists to catch.
      expect(withSurge, `${c.site} is not widened by Chronal Surge, but is by Wide Grove`).toBeGreaterThan(without);
    });
  }

  it('the same character-route footprints leak under Time Lord as under the Animist', () => {
    // The set that matters: §4.2's sentence says "all towers", and every one of
    // these is a *character* footprint widened anyway. Ten of `LEAKING_TODAY`'s
    // twelve; the other two are the Animist-Active rows above.
    const expected = LEAKING_TODAY.filter((s) => !CLASS_SPECIFIC.includes(s) && !UNCALIBRATED.includes(s));
    const leaking = APPLICABLE.filter(
      (c) => c.route === 'character' && c.measure(content, timeLordOpts()) > c.measure(noSurgeAoe, timeLordOpts()),
    ).map((c) => c.site);
    expect(
      [...leaking].sort(),
      'the two classes no longer leak through the same set — one has been fixed without the other',
    ).toEqual([...expected].sort());
    expect(leaking.length, 'the character-route leak set has emptied — has the main-lane fix landed?').toBe(10);
  });

  it('and it is the larger leak: it compounds with wave count, where Wide Grove is flat', () => {
    // The claim that makes this item "the larger of the two", measured rather
    // than quoted from the Log. Wide Grove is one authored `+10%` however long
    // the run goes; Chronal Surge re-adds its own every `waveInterval`.
    const probe = CONSUMERS.find((c) => c.route === 'tower' && c.read === R_TOWER_AOE_LOB)!;
    const once = probe.measure(content, { classKey: 'time_lord', surges: SURGE_INTERVAL });
    const twice = probe.measure(content, { classKey: 'time_lord', surges: SURGE_INTERVAL * 2 });
    expect(twice, 'Chronal Surge did not compound across two firings').toBeGreaterThan(once);

    const groveOnce = probe.measure(content);
    const groveTwice = probe.measure(content, { surges: SURGE_INTERVAL * 2 });
    expect(groveTwice, 'Wide Grove is supposed to be flat in wave count').toBeCloseTo(groveOnce, 10);
  });
});
