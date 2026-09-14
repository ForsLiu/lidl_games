/**
 * c013 (BACKLOG-CONTENT, lane `content`) — **how far the Animist's *Wide
 * Grove* actually reached, and what fb083's `towerArea` key changed about it.**
 *
 * `data/classes.json`'s Animist row says, in the player-facing sentence §4.2
 * gives it: *"All towers +10% area."* It used to be authored as
 * `towerPassive.mods.area` — `area` being §2's **global** Area stat, folded by
 * `baseRunStats` (`stats.ts:194`) into `derived.areaMul`, the same multiplier
 * every non-tower footprint in the sim read too, for want of a tower-only key.
 *
 * **This was a logged, owner-approved deviation, not an unapproved defect —
 * and the deferral has now expired.** `QUESTIONS.md` Q120 item 5 stated it —
 * "maps onto the existing global `area` stat, which also scales the
 * character's own effects — the closest existing key, over-applying rather
 * than inventing a `towerArea` nothing else reads, and flagged for the P10
 * pass" — with an owner verdict of *approved*. CLAUDE.md's first measurement
 * rule is that **a deferral is a measurement with an expiry date**; Q120 named
 * the expiry as the P10 pass, and `fb083` (§2, §4.2, Q163) is that pass
 * landing: `src/sim/statkeys.ts` now carries a `towerArea` key,
 * `effectiveTowerRange`/`effectiveTowerAoe`/`fireTower`'s own `area` alias
 * read it instead of the global one, and Wide Grove is authored on it. This
 * file, which used to size the over-application, now checks the fix against
 * the same twenty-one footprints it measured before — which of them actually
 * stopped leaking, and which did not.
 *
 * `c009` restated the deviation (route 5 of its five) and `c001` had made it
 * materially larger without anyone re-measuring: before c001,
 * `src/sim/classes.ts` never read `areaMul` at all, so the over-application
 * reached towers, VS wielded attacks, Electric's inherent AoE and Burning's
 * splash; after c001 it reached **all 24 class Actives too**, the Animist's
 * own included. CLAUDE.md names exactly this failure: *"check a `/data` row's
 * blast radius before calling it narrow"*, and *"when a field's range
 * changes, grep its readers, not just its writers."* fb083 is graded against
 * that whole blast radius, not just the sentence's own wording.
 *
 * **The result, in one line: eleven of twelve character-route leaks closed
 * (the twelfth stays open by design), and all nine tower-route footprints
 * §4.2 claims are widened — including the two, Electric off a Tesla Coil and
 * Burning off an Ember Brazier, that fb083's first landing left stopped on
 * *both* routes.** A follow-up fix closed that last gap by giving
 * `damagetypes.ts`/`enemies.ts` a way to tell a tower's own hit from a class
 * Active's without a `route` parameter — see `SHARED_READS`'s and
 * `CLOSED_BY_ROUTE`'s own comments for the mechanism, and `STILL_WIDENED`/
 * `STOPPED_WIDENING_BOTH` (now empty, kept for the history) for the count.
 *
 * **Reads and consumers are two different lists, and conflating them is how
 * this got bigger the first time.** `READS`/`READS_TOWER_AREA` are the places
 * in `src/sim` that multiply by the bare `areaMul`/`towerAreaMul` tokens.
 * `CONSUMERS` is the twenty-one *footprints* those reads produce — because
 * several reads sit inside helpers (`classArea`, `effectiveTowerAoe`,
 * `effectiveTowerRange`, `wieldedRangeFor`, `wieldedSplashFor`) that other
 * files call, and two more (`fireTower`'s and `fireWielded`'s `area` locals)
 * are each read by three to five footprints inside their own function. c001
 * widened this row's blast radius by adding a *caller*, not a read; a file
 * that only counted reads would have watched it happen and stayed green,
 * which is why `CARRIERS` pins the call sites too.
 *
 * **Four read-names are `shared` in the `CONSUMERS` table, and all four are
 * now genuinely closed — by two different mechanisms.** `effectiveTowerAoe`'s
 * lob/poison branches, `damagetypes.ts`'s Electric AoE and `enemies.ts`'s
 * Burning splash all had one line that could not see who was calling:
 *   - `effectiveTowerAoe` is a Venom Spore's own splash at `towers.ts:624`
 *     and the panel's mirror of a Mortar's shell, **and** the Animist's own
 *     *Manifest* spirit via `towerSummonProfile` (`classes.ts:553`), **and**
 *     every VS wielded lob/poison blast (`vswield.ts:295,296,487,505`);
 *   - Electric's inherent AoE and Burning's splash widen identically whether a
 *     Tesla Coil or a class Active applied the damage.
 * fb083's first landing gave `effectiveTowerAoe` a caller-chosen `route`, so
 * its two branches (`CLOSED_BY_ROUTE` from the start) were closed
 * immediately — every caller passes the route its own semantics demand. A
 * `route` parameter was never on the table for `damagetypes.ts`/`enemies.ts`:
 * `applyDamageType` and `tickDotSplash` see only a `source: string` (an
 * attack/tower id), never a caller-chosen enum, so that first landing left
 * Electric and Burning as one unrouted line each — moving Wide Grove off the
 * key they read did not close them, it **starved** them, and
 * `STOPPED_WIDENING_BOTH` (now empty) is the record of that gap. The
 * follow-up fix closed it by reusing this codebase's own precedent for
 * exactly this shape: `dotPotency` (`enemies.ts`) already tells a tower's own
 * Act I hit apart from every other caller with
 * `!w.huntsWarden && w.content.towerByKey.has(source)`, because poison damage
 * has the same one-string-and-nothing-else signature. A new
 * `isTowerSource(w, source)` helper names that same check, and
 * `applyDamageType`'s Electric branch and `tickDotSplash`'s Burning branch
 * now pick `towerAreaMul` or `areaMul` by asking it rather than by taking a
 * `route` argument — so `CLOSED_BY_ROUTE` names all four read-names today,
 * "by route" covering both an explicit parameter and a source-checked
 * dispatch, since either one ends up handing the right route the right key.
 * `shared` is not asserted by hand: it is derived from the consumer table —
 * a read-name is shared exactly when it has consumers on both routes — and
 * compared against `SHARED_READS`.
 *
 * **How each consumer is measured.** Two `Content`s, identical but for one
 * key: the shipped one, and one rebuilt from a copy of `data/classes.json`
 * with `animist.towerPassive.mods.towerArea` deleted (`c006`/`c009`'s control
 * shape). Both build an Animist `World`; each row returns one number that
 * grows with its footprint — a radius where the sim's own helper computes one,
 * and the damage taken by an enemy parked in the **ring between the un-widened
 * and the widened footprint** where it does not. "Widened" is `shipped >
 * no-grove`. Nothing here asserts an authored magnitude: `WIDE_GROVE` is read
 * out of `/data`, so a retune from 10% to 12% must not turn this file red
 * (`c008` owns the figure itself, in `tests/class-spec-numbers.test.ts`).
 *
 * Every `shared` read-name is probed on **both** routes, and each tower-route
 * probe parks its neighbour outside the firing tower's own reach so only the
 * splash under test can touch it. Two probes upgrade their tower first,
 * because the footprint they measure is only live behind a §5.2 milestone
 * (the Arrow's pierce, the Tesla's electric chain); which tier that is gets
 * asked of `attackProfile` rather than pinned, since a special's `at: 3` lands
 * at tier 4 and a retuned milestone must move the probe, not redden it.
 *
 * **The honesty half.** A row that measured nothing would report "does not
 * widen" and look like good news — the correct answer fb083 now produces for
 * most of the character-route consumers. So every probe is additionally run
 * on the no-grove content with an explicit +Area source of its own: each must
 * move. A row may only ever claim "Wide Grove does not reach here" while
 * proving it can still see Area arrive by another door — `controlOpts`/
 * `Consumer.controlKey` open the door this *specific* consumer's own
 * implementation reads, which for one consumer (the Manifest spirit)
 * disagrees with its `route` classification; see `Consumer.controlKey`'s own
 * doc comment for why.
 *
 * The VS rows are classified against `vswield.ts`'s own header rule: a wielded
 * attack is "treated as character attacks" (§6.1) and deliberately does *not*
 * ride `towerRangeMul`/`towerAreaMul`. fb083 made this structural rather than
 * accidental: `vswield.ts`'s four `effectiveTowerAoe` calls now pass
 * `'character'` explicitly, so a `towerArea` source genuinely cannot reach
 * them — this file's own per-consumer checks confirm it rather than assume it.
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

/**
 * fb152: a DoT instance now pays once per `dotTickInterval`, not once per
 * frame, so a splash probe that ran a single frame measured zero. The window
 * is read from the world's own content so a retune of the cadence moves the
 * probe rather than reddening this file.
 */
function runDotTick(w: World): void {
  const frames = Math.round(w.content.damageTypes.dotTickInterval * 60);
  for (let i = 0; i < frames; i++) updateEnemies(w, DT);
}

/** The authored magnitude, read from `/data` — never restated. A retune moves this file's ring positions with it. */
const WIDE_GROVE = content.classByKey.get('animist')!.towerPassive.mods.towerArea!;

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
  delete row.towerPassive.mods.towerArea;
  return loadContent({ classes: doc });
}

const noGrove = contentWithoutGrove();

interface WorldOpts {
  /**
   * An extra, explicit *character-route* Area source — the sensitivity
   * control's second door for a `route: 'character'` consumer. fb083 split
   * the one door into two: `classArea`/`vswield.ts`/the still-unrouted
   * `damagetypes.ts`/`enemies.ts` splash read `area`, so this is the one that
   * proves those probes.
   */
  area?: number;
  /**
   * fb083: the same door on the *tower* side. `effectiveTowerRange`/
   * `effectiveTowerAoe`'s default route and `fireTower`'s own `area` alias
   * read `towerArea`, so a `route: 'tower'` consumer needs this one instead —
   * `controlFor` below is what picks between the two so no call site has to.
   */
  towerArea?: number;
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
  if (o.area || o.towerArea) {
    w.stats.addAll('test:area', { area: o.area ?? 0, towerArea: o.towerArea ?? 0 });
    w.recomputeDerived();
  }
  return w;
}

/**
 * fb083: the sensitivity control, aimed at whichever key this consumer's own
 * `controlKey` (or, failing that, its `route`) says it actually reads. Before
 * the fix one door served every probe because one key served every reader;
 * now the two are genuinely separate stats, so the control has to ask the
 * consumer which one it is before opening a door — asking both at once would
 * prove nothing about the row the fix changed, only that *some* key on the
 * World responds.
 */
function controlOpts(c: Pick<Consumer, 'route' | 'controlKey'>, extra: WorldOpts = {}): WorldOpts {
  const key = c.controlKey ?? (c.route === 'tower' ? 'towerArea' : 'area');
  return key === 'towerArea' ? { ...extra, towerArea: CONTROL_AREA } : { ...extra, area: CONTROL_AREA };
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

/* ------------------------------------------------------------- the reads */

/**
 * One read in `src/sim`, of either the bare `areaMul` token or the bare
 * `towerAreaMul` one — `family` says which, and which completeness guard
 * below the entry counts against.
 *
 * fb083 split what used to be one `w.derived.areaMul` reader into two: most
 * reads moved wholesale to `towerAreaMul` (`R_TOWER_RANGE`, `R_FIRE_TOWER`),
 * and three call sites pick between the two *inline*, into a shared local
 * variable each names `areaMul` — the same identifier the global stat's own
 * derived factor uses. `effectiveTowerAoe` (`towers.ts:341`) does it with a
 * caller-chosen `route` parameter; `applyDamageType` (`damagetypes.ts`) and
 * `tickDotSplash` (`enemies.ts`) do it with an `isTowerSource(w, source)`
 * check instead, since neither has a `route` to ask (a `source: string` is
 * all either one gets). None of the three locals are this table's invention;
 * they are real production source, and each means its one dispatch line
 * carries a bare `areaMul` token (the variable's own name) *and* a bare
 * `towerAreaMul` token (the tower-route operand) at once — which is exactly
 * the case `weight` exists for.
 */
interface Read {
  /** `file` + the function the read sits in, as a reader would grep for it. */
  name: string;
  file: string;
  family: 'area' | 'towerArea';
  /**
   * How many bare tokens of `family`'s own kind this entry's anchor line
   * contributes — 1 unless stated otherwise. The three route-dispatch
   * entries (`R_TOWER_AOE_ROUTE`, `R_ELECTRIC_ROUTE`, `R_BURNING_ROUTE`) are
   * the only places this is not 1: see each one's own comment.
   */
  weight?: number;
  /**
   * Must still match `file`. Each anchor carries an adjacent line unique to
   * its function, so a read that moves to a *different* function in the same
   * file reddens its own row rather than going quiet.
   */
  anchor: RegExp;
}

const R_TOWER_RANGE = 'towers.ts effectiveTowerRange (aura kind)';
const R_TOWER_AOE_ROUTE =
  "towers.ts effectiveTowerAoe (route dispatch: towerAreaMul default / areaMul for 'character')";
const R_TOWER_AOE_LOB = 'towers.ts effectiveTowerAoe (lob branch)';
const R_TOWER_AOE_POISON = 'towers.ts effectiveTowerAoe (poison branch)';
const R_FIRE_TOWER = 'towers.ts fireTower (aura radius / cone half-angle / lob shell aoe)';
const R_CLASS_AREA = 'classes.ts classArea (a kit footprint: nova, cloud, zone, aura, line half-width, basic splash)';
/**
 * The follow-up fix's own dispatch line, the `isTowerSource` twin of
 * `R_TOWER_AOE_ROUTE`: `applyDamageType` has no `route` to switch on, only
 * `source`, so it asks `isTowerSource(w, source)` instead of taking a
 * parameter. Same shape, same reason it is in `NO_CONSUMER`: the line itself
 * produces no footprint, it only decides which key `R_ELECTRIC`'s own line
 * reads.
 */
const R_ELECTRIC_ROUTE =
  'damagetypes.ts applyDamageType (route dispatch via isTowerSource: towerAreaMul / areaMul)';
const R_ELECTRIC = 'damagetypes.ts applyDamageType (Electric inherent AoE)';
/** `tickDotSplash`'s own `isTowerSource` dispatch — see `R_ELECTRIC_ROUTE`'s comment, same shape. */
const R_BURNING_ROUTE = 'enemies.ts tickDotSplash (route dispatch via isTowerSource: towerAreaMul / areaMul)';
const R_BURNING = 'enemies.ts tickDotSplash (Burning splash)';
const R_WIELD_RANGE = 'vswield.ts wieldedRangeFor (VS wielded attack range)';
const R_WIELD_SPLASH = 'vswield.ts wieldedSplashFor (VS single-kind cleave radius)';
const R_FIRE_WIELDED = 'vswield.ts fireWielded (line half-width / cleave / cone / chain range)';

/**
 * These three dispatch lines name real production text (the check that
 * decides which of the two stats a caller gets) rather than a footprint of
 * their own — nobody's radius is *these* lines, they only feed the branch (or
 * the one radius line) below them, which already has its own row.
 * `R_TOWER_AOE_ROUTE` picks with a caller-chosen `route` parameter;
 * `R_ELECTRIC_ROUTE`/`R_BURNING_ROUTE` pick with `isTowerSource(w, source)`
 * instead, because `applyDamageType`/`tickDotSplash` only ever have a
 * `source: string` to ask, never a caller-chosen enum. Exempted from "every
 * read has a consumer" for the same reason `DEVIATIONS` exists: named and
 * reasoned about, not silently dropped.
 */
const NO_CONSUMER: readonly string[] = [R_TOWER_AOE_ROUTE, R_ELECTRIC_ROUTE, R_BURNING_ROUTE];

/** The dispatch line itself, quoted once so its two `Read` entries (one per family) cannot drift apart. */
const TOWER_AOE_ROUTE_ANCHOR =
  /const areaMul = route === 'tower' \? w\.derived\.towerAreaMul : w\.derived\.areaMul;/;

/**
 * `applyDamageType`'s `isTowerSource` dispatch line, quoted once for the same
 * reason `TOWER_AOE_ROUTE_ANCHOR` is: one physical line, two `Read` entries
 * (one per family), and this is the single source of truth for the text both
 * of them match.
 */
const ELECTRIC_ROUTE_ANCHOR =
  /const areaMul = isTowerSource\(w, source\) \? w\.derived\.towerAreaMul : w\.derived\.areaMul;/;

/** `tickDotSplash`'s twin of `ELECTRIC_ROUTE_ANCHOR`. */
const BURNING_ROUTE_ANCHOR =
  /const areaMul = isTowerSource\(w, acc\.source\) \? w\.derived\.towerAreaMul : w\.derived\.areaMul;/;

/** Reads of the bare `areaMul` token — the character-reachable half post-fix. */
const READS: readonly Read[] = [
  {
    // Both operands of the dispatch are on this one line: the local
    // variable's own name (`const areaMul =`) and the character-route
    // fallback (`w.derived.areaMul`) are two distinct `areaMul` tokens.
    name: R_TOWER_AOE_ROUTE,
    file: 'src/sim/towers.ts',
    family: 'area',
    weight: 2,
    anchor: TOWER_AOE_ROUTE_ANCHOR,
  },
  {
    name: R_TOWER_AOE_LOB,
    file: 'src/sim/towers.ts',
    family: 'area',
    anchor: /kind === 'lob'\) return \(a\.aoe \?\? 1\.5\) \* areaMul;/,
  },
  {
    name: R_TOWER_AOE_POISON,
    file: 'src/sim/towers.ts',
    family: 'area',
    anchor: /kind === 'poison'\) return \(a\.aoe \?\? 0\) \* areaMul;/,
  },
  {
    name: R_CLASS_AREA,
    file: 'src/sim/classes.ts',
    family: 'area',
    anchor: /function classArea\(w: World, radius: number\): number \{\r?\n\s*return radius \* w\.derived\.areaMul;/,
  },
  {
    // Same shape as `R_TOWER_AOE_ROUTE`'s own entry above: the dispatch line
    // carries both the local variable's own name (`const areaMul =`) and the
    // character-route fallback (`w.derived.areaMul`) — two distinct `areaMul`
    // tokens on one line.
    name: R_ELECTRIC_ROUTE,
    file: 'src/sim/damagetypes.ts',
    family: 'area',
    weight: 2,
    anchor: ELECTRIC_ROUTE_ANCHOR,
  },
  {
    name: R_ELECTRIC,
    file: 'src/sim/damagetypes.ts',
    family: 'area',
    anchor: /const r = radius \* areaMul;\r?\n\s*w\.emit\('pulse'/,
  },
  {
    // Same shape as `R_ELECTRIC_ROUTE` above, for `tickDotSplash`'s twin dispatch.
    name: R_BURNING_ROUTE,
    file: 'src/sim/enemies.ts',
    family: 'area',
    weight: 2,
    anchor: BURNING_ROUTE_ANCHOR,
  },
  {
    name: R_BURNING,
    file: 'src/sim/enemies.ts',
    family: 'area',
    anchor: /const r = \(acc\.radius \+ w\.derived\.burnSpread\) \* areaMul;/,
  },
  {
    name: R_WIELD_RANGE,
    file: 'src/sim/vswield.ts',
    family: 'area',
    anchor: /return a\.range \* w\.derived\.areaMul \* w\.derived\.charRangeMul;/,
  },
  {
    name: R_WIELD_SPLASH,
    file: 'src/sim/vswield.ts',
    family: 'area',
    anchor: /radius: WIELD_SPLASH_RADIUS \* w\.derived\.areaMul/,
  },
  {
    name: R_FIRE_WIELDED,
    file: 'src/sim/vswield.ts',
    family: 'area',
    anchor: /const y = wd\.y;\r?\n\s*const area = w\.derived\.areaMul;/,
  },
];

/**
 * Reads of the bare `towerAreaMul` token — the tower-only half fb083 carved
 * out. Three of these live in `towers.ts`; the follow-up fix added one each
 * in `damagetypes.ts`/`enemies.ts` (their own `isTowerSource` dispatch
 * lines) — nothing else in `src/sim` names the token today (the completeness
 * guard below is what would notice if that changed).
 */
const READS_TOWER_AREA: readonly Read[] = [
  {
    name: R_TOWER_RANGE,
    file: 'src/sim/towers.ts',
    family: 'towerArea',
    anchor:
      /const targeting = a\.range \* w\.derived\.towerRangeMul;\r?\n\s*return a\.kind === 'aura' \? targeting \* w\.derived\.towerAreaMul : targeting;/,
  },
  {
    // The tower-route operand of the same dispatch line `R_TOWER_AOE_ROUTE`
    // names above — one physical line, one entry per family, per that read's
    // own comment.
    name: R_TOWER_AOE_ROUTE,
    file: 'src/sim/towers.ts',
    family: 'towerArea',
    anchor: TOWER_AOE_ROUTE_ANCHOR,
  },
  {
    name: R_FIRE_TOWER,
    file: 'src/sim/towers.ts',
    family: 'towerArea',
    anchor: /const dmg = towerDamage\(w, s, a\.damage\);\r?\n\s*const area = w\.derived\.towerAreaMul;/,
  },
  {
    // The tower-route operand of `R_ELECTRIC_ROUTE`'s own dispatch line.
    name: R_ELECTRIC_ROUTE,
    file: 'src/sim/damagetypes.ts',
    family: 'towerArea',
    anchor: ELECTRIC_ROUTE_ANCHOR,
  },
  {
    // The tower-route operand of `R_BURNING_ROUTE`'s own dispatch line.
    name: R_BURNING_ROUTE,
    file: 'src/sim/enemies.ts',
    family: 'towerArea',
    anchor: BURNING_ROUTE_ANCHOR,
  },
];

/** Both families, for the checks that do not care which one a read belongs to. */
const ALL_READS: readonly Read[] = [...READS, ...READS_TOWER_AREA];

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
  /**
   * fb083: which Stats key this consumer's own sensitivity-control probe
   * should bump. Defaults to the key `route` implies (`towerArea` for
   * 'tower', `area` for 'character') — every consumer but one agrees with its
   * own route this way. The one exception is named on its own row below: the
   * Manifest spirit (`route: 'character'` per §4.2's coverage — a class
   * Active is not a tower — but internally a `'tower'`-route call by design).
   * The `R_ELECTRIC`/`R_BURNING` tower-route rows used to be a second
   * exception (`applyDamageType`/`tickDotSplash` took no `route` parameter
   * and only ever saw `area`, so their sensitivity control had to be forced
   * onto `area` even on the tower route) — the `isTowerSource` fix made them
   * agree with their own route again, so they no longer override this field.
   */
  controlKey?: 'area' | 'towerArea';
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
    // fb083: `towerSummonProfile` calls `effectiveTowerAoe(w, def)` with no
    // route argument (`classes.ts:553`) — the default, `'tower'` — because a
    // literal tower-clone summon is meant to ride the tower's own numbers.
    // So this footprint's *stat key* is `towerArea` even though its `route`
    // classification above is `'character'` (§4.2's sentence does not name a
    // class Active). See `Consumer.controlKey`'s own doc comment.
    controlKey: 'towerArea',
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
    // fb081: `fireTower`'s `single` case scaled `LINE_HALF_WIDTH` by `area`
    // for the first time (previously a bare, unscaled constant) — a fourth
    // `R_FIRE_TOWER` footprint alongside the Frost aura/Brazier cone/Mortar
    // splash rows above, mirroring "a wielded line's perpendicular
    // half-width" below on the character route.
    site: "an Arrow Spire's line half-width, at its §5.2 pierce milestone",
    read: R_FIRE_TOWER,
    route: 'tower',
    measure: (c, o) => {
      const w = animist(c, o);
      const p = placeProbed(w, ARROW);
      // At pierce 0 the line stops at its primary, so the half-width decides
      // nothing; the Arrow's §5.2 pierce milestone is the first tier where a
      // second enemy can be on the line at all.
      upgradeTo(w, p, tierWhere(c.towerByKey.get(ARROW)!, (prof) => prof.pierce > 0));
      const range = c.towerByKey.get(ARROW)!.attack!.range;
      const half = LINE_HALF_WIDTH;
      // `targetFirst` (combat.ts) picks whichever candidate is furthest along
      // the path to the Core, not whichever is nearest the tower — so the
      // on-axis primary sits at the reach's edge (most advanced, the only
      // sane choice of target) and the width-tested dummy sits *less*
      // advanced, off-axis, where only the sweep — never the guaranteed
      // primary strike — can decide whether it is on the line.
      const primary = dummy(w, p.x + range * 0.9, p.y);
      const beside = dummy(w, p.x + range * 0.5, p.y + half * RING, 0.01);
      const before = beside.hp;
      fireOnce(w, p.s);
      expect(primary.hp, 'harness fired no arrow volley').toBeLessThan(primary.maxHp);
      return before - beside.hp;
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
    // The follow-up fix (`isTowerSource`) means `applyDamageType` now agrees
    // with its own route classification, so no `controlKey` override is
    // needed here any more — the default (`towerArea` for `route: 'tower'`)
    // is the key this row actually reads. Before that fix `applyDamageType`
    // took no `route` parameter and only ever read `w.derived.areaMul`, which
    // is why this row used to force its control onto `area`; see
    // `Consumer.controlKey`'s own doc comment for the history.
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
    // Same history as the Electric row above: the `isTowerSource` fix means
    // `tickDotSplash` now agrees with its own route classification, so the
    // default `controlKey` (`towerArea`) is right and no override is needed.
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
      runDotTick(w);
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
      // fb152: *west* of the Warden, not east. The pair used to sit three tiles
      // towards the Core, which is inside its leak radius — harmless while the
      // probe ran a single frame (the splash landed before the leak did), fatal
      // once the probe has to hold the carrier alive for a whole tick interval.
      const carrier = dummy(w, w.warden.x - 3, w.warden.y);
      const neighbour = dummy(w, w.warden.x - 3, w.warden.y + authored * RING);
      const before = neighbour.hp;
      applyDot(w, carrier, 'burning', 100, 5, 'class_active');
      runDotTick(w);
      expect(carrier.dead, 'the carrier must survive its own tick interval or the probe measures nothing').toBe(false);
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
  {
    // fb081: `fireTower`'s own `pierce` case (a Ballista) passes the same
    // scaled half-width into the same helper, for the same reason.
    read: R_FIRE_TOWER,
    use: "a Ballista's `pierce` kind `bestLineDirection` half-width",
    anchor: /const dir = bestLineDirection\(w, x, y, range, LINE_HALF_WIDTH \* area\);/,
    why:
      'Same shape as the wielded deviation above: the widened half-width only re-scores which ' +
      'direction the volley is aimed in; the bolts it spawns carry their own geometry through ' +
      '`spawnProjectile` (`pierce`, combat.ts), which Area never touches. Declared here for the same ' +
      'reason, on the tower side of the same kind.',
  },
];

/**
 * A read's *name* is shared when `CONSUMERS` tags it on both routes — derived,
 * never hand-typed. Scanned over `ALL_READS` on purpose, not just `READS`:
 * nothing stops a future `towerArea`-family read from picking up a
 * character-route consumer, and this table should notice if one does.
 *
 * fb083 note: this is a **naming** fact about the `CONSUMERS` table, not
 * proof the underlying stat is still conflated. All four names below still
 * show up here because each one's helper (`effectiveTowerAoe`,
 * `applyDamageType`, `tickDotSplash`) backs consumers on both routes by
 * construction — a Tesla Coil's own hit and a class Active's hit both flow
 * through `applyDamageType`, for instance. What changed is only whether the
 * line *behind* that name can tell the two apart: `CLOSED_BY_ROUTE` below
 * names all four as genuinely closed today, the first two by an explicit
 * `route` parameter and the last two by the `isTowerSource` check.
 */
function sharedReads(): string[] {
  return ALL_READS.filter((r) => {
    const routes = new Set(CONSUMERS.filter((c) => c.read === r.name).map((c) => c.route));
    return routes.has('tower') && routes.has('character');
  }).map((r) => r.name);
}

/**
 * The four read-names `CONSUMERS` still tags on both routes. Unchanged in
 * *membership* since fb083's first landing (a naming fact — see
 * `sharedReads`'s own comment): it is a fact about which helper backs which
 * consumers, not about whether that helper can tell its callers apart, so
 * fixing the latter was never going to shrink this list. `CLOSED_BY_ROUTE`
 * is the list that tracks the fix.
 */
const SHARED_READS: readonly string[] = [R_TOWER_AOE_LOB, R_TOWER_AOE_POISON, R_ELECTRIC, R_BURNING];

/**
 * All four of `SHARED_READS`, now closed — by two different mechanisms.
 * `effectiveTowerAoe` takes an explicit `route` and every caller passes the
 * right one (`'tower'` by default for `fireTower`'s own poison dispatch and
 * the two literal tower-clone summons, `'character'` explicitly for every
 * `vswield.ts` wielded blast). `applyDamageType`/`tickDotSplash` have no
 * `route` to take — only a `source: string` — so they ask
 * `isTowerSource(w, source)` instead: `!w.huntsWarden &&
 * w.content.towerByKey.has(source)`, the same check `dotPotency` already used
 * for `towerPoisonDamageMul` (§4.1 Plaguebringer, p6c, Q119) for the same
 * reason. Either mechanism produces the same observable: a character-route
 * consumer of any of these four no longer reads `towerArea` at all, and a
 * tower-route one no longer reads the bare `area`. "By route" in this
 * constant's name covers both — a parameter the caller sets and a fact the
 * callee derives from `source` are two ways of answering the same question.
 */
const CLOSED_BY_ROUTE: readonly string[] = [R_TOWER_AOE_LOB, R_TOWER_AOE_POISON, R_ELECTRIC, R_BURNING];

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
 * `stats.ts` is where `areaMul`/`towerAreaMul` are *written* — each one's
 * `Derived` field and the `s.factor(...)` line that fills it, two lines per
 * stat, one stat per family. Everything else that names either token is a
 * reader, which is why the token count is what this guard watches rather than
 * the `w.derived.areaMul` spelling: destructuring it, bracket-indexing it or
 * splitting it over two lines are all reads that the narrower pattern misses.
 */
const WRITER = { 'src/sim/stats.ts': 2 };
/** fb083: `towerAreaMul`'s own two lines in `stats.ts`, the same shape as `WRITER`. */
const WRITER_TOWER_AREA = { 'src/sim/stats.ts': 2 };

/**
 * One family's completeness guard: every bare token of `family`'s own kind
 * under `src/sim` is either declared here (weighted, since `R_TOWER_AOE_ROUTE`
 * carries two `areaMul` tokens on one line) or is the writer's own two lines.
 */
function checkCompleteness(family: Read['family'], writer: Record<string, number>): void {
  const token = family === 'area' ? 'areaMul' : 'towerAreaMul';
  const re = family === 'area' ? /\bareaMul\b/ : /\btowerAreaMul\b/;
  const declared: Record<string, number> = { ...writer };
  for (const r of ALL_READS.filter((x) => x.family === family)) {
    declared[r.file] = (declared[r.file] ?? 0) + (r.weight ?? 1);
  }
  expect(
    asObject(scanSim(re)),
    `a src/sim file names ${token} a different number of times than its family's READS + WRITER claims`,
  ).toEqual(Object.fromEntries(Object.entries(declared).sort()));
}

describe('c013: the tables cover every way `areaMul`/`towerAreaMul` get out of the stat block', () => {
  it('every `areaMul` token under src/sim is a declared read or the writer itself', () => {
    checkCompleteness('area', WRITER);
  });

  it('every `towerAreaMul` token under src/sim is a declared read or the writer itself', () => {
    checkCompleteness('towerArea', WRITER_TOWER_AREA);
  });

  for (const r of ALL_READS) {
    it(`${r.name} [${r.family}]: its read is still where the table says it is`, () => {
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

  it('every consumer names a read that exists, and every read but the named dispatch has a consumer', () => {
    const names = new Set(ALL_READS.map((r) => r.name));
    for (const c of CONSUMERS) expect(names, `${c.site} names an unknown read`).toContain(c.read);
    for (const d of DEVIATIONS) expect(names, `${d.use} names an unknown read`).toContain(d.read);
    for (const r of ALL_READS) {
      if (NO_CONSUMER.includes(r.name)) continue;
      expect(
        CONSUMERS.some((c) => c.read === r.name),
        `${r.name} has no consumer — its reach is unmeasured`,
      ).toBe(true);
    }
  });

  it('NO_CONSUMER names only reads that really do go unconsumed, not a typo hiding a gap', () => {
    for (const name of NO_CONSUMER) {
      expect(
        CONSUMERS.some((c) => c.read === name),
        `${name} is in NO_CONSUMER but a CONSUMERS row already covers it — drop it from the exemption`,
      ).toBe(false);
    }
  });

  for (const d of DEVIATIONS) {
    it(`deviation: ${d.use} is uncovered on purpose, and still exists`, () => {
      const read = ALL_READS.find((r) => r.name === d.read)!;
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
    expect(content.classByKey.get('animist')!.towerPassive.mods.towerArea).toBe(WIDE_GROVE);
    expect(noGrove.classByKey.get('animist')!.towerPassive.mods.towerArea).toBeUndefined();
    expect(WIDE_GROVE).toBeGreaterThan(0);
  });

  it("fb083: Wide Grove is the whole of an Animist run's towerAreaMul, and no longer touches areaMul at all", () => {
    expect(animist(content).derived.towerAreaMul).toBeCloseTo(1 + WIDE_GROVE, 10);
    expect(animist(noGrove).derived.towerAreaMul).toBe(1);
    // The other half of the fix, stated as its own assertion rather than left
    // to be inferred from the tables below: the row that used to be the whole
    // of an Animist run's `areaMul` no longer contributes to it at all.
    expect(animist(content).derived.areaMul).toBe(1);
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
  // does not widen this" — the correct answer fb083 now produces for most of
  // the character rows. Every probe must therefore be shown to see Area
  // arriving by a door that is not Wide Grove — `controlOpts` opens the one
  // door this consumer's own `route` actually reads, per its own doc comment.
  for (const c of CONSUMERS) {
    it(`${c.site}: the probe still sees Area arriving from another source`, () => {
      const flat = c.measure(noGrove);
      const bumped = c.measure(noGrove, controlOpts(c));
      expect(bumped, `${c.site} is blind to Area — its "does not widen" reading would be worthless`).toBeGreaterThan(
        flat,
      );
    });
  }
});

/* ------------------------------------------------------------ the measurement */

describe('c013: what Wide Grove widens today, per consumer', () => {
  for (const c of CONSUMERS) {
    const shouldWiden = STILL_WIDENED.includes(c.site);
    it(`${c.site} [${c.route}]: Wide Grove ${shouldWiden ? 'still widens it' : 'no longer widens it (fb083)'}`, () => {
      const withGrove = c.measure(content);
      const without = c.measure(noGrove);
      // fb083 (both passes) landed: eleven of the twenty-one consumers read
      // "does not widen" today — every one of the twelve character-route
      // consumers but the Manifest spirit, a deliberate tower-clone.
      // `STILL_WIDENED` names the other ten (all nine tower-route consumers,
      // Electric/Burning off a tower included since the `isTowerSource`
      // follow-up, plus the Manifest spirit), so this loop's own assertion
      // direction follows the fix rather than hardcoding "greater than" and
      // hand-listing the flipped majority a second time.
      if (shouldWiden) {
        expect(withGrove, `${c.site} no longer widens — update STILL_WIDENED`).toBeGreaterThan(without);
      } else {
        expect(withGrove, `${c.site} still widens — update STILL_WIDENED`).toBeCloseTo(without, 10);
      }
    });
  }
});

/**
 * **fb083 landed, in two passes.** The first moved Wide Grove from the global
 * `area` key to `towerArea` (`data/classes.json`) and gave `effectiveTowerAoe`
 * a caller-chosen `route` (`towers.ts`); a follow-up gave `applyDamageType`/
 * `tickDotSplash` an `isTowerSource` check so Electric/Burning could tell
 * their callers apart too, with no `route` parameter to add. This is the set
 * of `CONSUMERS.site` names widened by Wide Grove today, across *both*
 * routes — stated once so the per-consumer loop above and the two
 * route-specific checks below all read off the same list.
 *
 * **Character route (one of twelve stayed open, by design):** the *Manifest*
 * spirit is the one `LEAKING_TODAY` row that did not flip. It is not a bug:
 * `towerSummonProfile` (`classes.ts:553`) calls `effectiveTowerAoe(w, def)`
 * with no route argument, the same call `fireTower`'s own poison dispatch and
 * Engineer's Pop Turret use, because SPEC-FINAL treats a literal tower-clone
 * summon as riding the tower's own numbers (`towers.ts`'s own doc comment on
 * the function, fb083). The other eleven — every wielded VS footprint, the
 * Recall Totem aura, and Electric/Burning off a class Active — read `area`
 * and Wide Grove does not touch it, so all eleven read "does not widen".
 *
 * **Tower route (all nine widen — the last two by a second fix):**
 * `effectiveTowerRange`, `effectiveTowerAoe`'s lob/poison branches and
 * `fireTower`'s own `area` alias moved to `towerArea` wholesale in the first
 * pass, so the seven consumers behind them (Frost's ring, Mortar's shell
 * radius, Venom Spore's splash, Frost's aura, Brazier's cone, Mortar's shell
 * splash, Arrow's line half-width) widened exactly as §4.2 claims from day
 * one. `R_ELECTRIC`/`R_BURNING` did not move in that pass — `damagetypes.ts`/
 * `enemies.ts` took no `route` parameter and read the bare `area`
 * unconditionally — so moving Wide Grove off that key briefly stopped it
 * reaching *either* of their two consumers, tower included: a Tesla Coil's
 * Electric proc and an Ember Brazier's Burning splash stopped receiving Wide
 * Grove's bonus at all, a footprint §4.2's own sentence ("all towers") claims
 * and the first pass silently dropped (`STOPPED_WIDENING_BOTH`, now empty,
 * is the record of that gap). The `isTowerSource` follow-up closed it: both
 * now read `towerAreaMul` when a real tower fired the hit, so all nine
 * tower-route consumers widen today.
 */
const STILL_WIDENED: readonly string[] = [
  "a Frost Obelisk's ring, as the panel and the range circle quote it",
  "a Mortar's shell radius, as the panel mirror quotes it",
  "the Animist's *Manifest* spirit, cloned from a Mortar",
  "a Venom Spore's own splash, as the spore really lands it",
  "a Frost Obelisk's aura, as the enemy standing in it feels it",
  'an Ember Brazier\'s cone half-angle',
  "a Mortar's shell splash, as the shell really detonates it",
  "an Arrow Spire's line half-width, at its §5.2 pierce milestone",
  "Electric's inherent AoE, off a Tesla Coil's own hit",
  "Burning's splash, off an Ember Brazier's own burn",
];

/**
 * **Empty, and kept that way on purpose.** §4.2 says "all towers +10% area",
 * and both of these are bona fide tower attacks; between fb083's first
 * landing and the `isTowerSource` follow-up, neither was widened by Wide
 * Grove on *either* route — `damagetypes.ts`/`enemies.ts` took no `route`
 * parameter and read the bare `area` unconditionally, so moving Wide Grove
 * off that key starved both consumers instead of closing either. The
 * follow-up gave both readers a way to ask `isTowerSource(w, source)` instead
 * of a parameter, and both sites now flow to `STILL_WIDENED`. Left as its own
 * (empty) constant, rather than deleted, so a regression that starves either
 * one again has a named place to land instead of silently vanishing from
 * `STILL_WIDENED`. See `SHARED_READS`'s and `CLOSED_BY_ROUTE`'s own comments
 * for the mechanism.
 */
const STOPPED_WIDENING_BOTH: readonly string[] = [];

/**
 * The one `LEAKING_TODAY` row fb083 could not close by construction — see
 * `STILL_WIDENED`'s own comment. Kept as its own named constant (rather than
 * inlined into the `describe` below) because `c024`'s Time Lord twin needs to
 * subtract the same one row from its own expectation, by name, not by index.
 */
const LEAKING_TODAY: readonly string[] = ["the Animist's *Manifest* spirit, cloned from a Mortar"];

describe('c013: the leak, stated as a set the fix can be checked against', () => {
  it('fb083 closed eleven of the twelve non-tower leaks; the Manifest spirit is the one left, by design', () => {
    const leaking = CONSUMERS.filter((c) => c.route === 'character' && c.measure(content) > c.measure(noGrove)).map(
      (c) => c.site,
    );
    expect(leaking, 'the leak set moved — update LEAKING_TODAY and say which fix moved it').toEqual(LEAKING_TODAY);
  });

  it('all nine tower-route footprints §4.2 claims are widened; none stopped', () => {
    const towers = CONSUMERS.filter((c) => c.route === 'tower');
    const stillWidened = towers.filter((c) => c.measure(content) > c.measure(noGrove)).map((c) => c.site);
    expect(
      stillWidened,
      'the still-widened tower set moved — update STILL_WIDENED/STOPPED_WIDENING_BOTH',
    ).toEqual(STILL_WIDENED.filter((s) => towers.some((c) => c.site === s)));
    const stopped = towers.filter((c) => c.measure(content) <= c.measure(noGrove)).map((c) => c.site);
    expect(
      stopped,
      'a genuine tower attack is no longer widened by "All towers +10% area" — see STOPPED_WIDENING_BOTH',
    ).toEqual(STOPPED_WIDENING_BOTH.filter((s) => towers.some((c) => c.site === s)));
    expect(stopped, 'STOPPED_WIDENING_BOTH is supposed to be empty today').toHaveLength(0);
    expect(towers.length, 'a tower-route consumer was added or dropped').toBe(9);
  });

  it('the four read-names CONSUMERS still tags on both routes are all genuinely closed today', () => {
    expect(sharedReads(), 'the shared-read set moved — a key swap now fixes more (or less) than it did').toEqual(
      SHARED_READS,
    );
    // Every one of the four now has a way to tell its caller's route apart —
    // `effectiveTowerAoe`'s explicit `route` parameter for the lob/poison
    // pair, `isTowerSource` for Electric/Burning — so none of them is still
    // shared in practice, only in the naming sense `sharedReads` measures.
    expect(SHARED_READS.filter((r) => !CLOSED_BY_ROUTE.includes(r))).toEqual([]);
  });
});

/* ------------------------------------- c024: the Time Lord twin, and it is bigger */

/**
 * **c024 — the same §4.2 "all towers" wording, on the other class, applied by
 * code instead of by `/data`.** Filed by QA on `c013`; the twin fb083 had to
 * close alongside Wide Grove or leave the larger leak standing.
 *
 * `applyChronalSurge` (`src/sim/run.ts:816-817`) used to be two adjacent lines:
 *
 * ```ts
 * w.stats.add(source, 'towerRange', cls.towerPassive.bonusRangeMul ?? 0);
 * w.stats.add(source, 'area',       cls.towerPassive.bonusAoeMul   ?? 0);
 * ```
 *
 * A **tower-scoped** key for the range half and the **global** key for the
 * area half, from one sentence, uncapped, and re-added every `waveInterval` TD
 * waves for the whole run. The Animist's leak that `c013` sized was a flat
 * `+10%` authored once in `data/classes.json`; this one compounded with wave
 * count, and this lane's own Log measured it at `areaMul 3.203` by end of run
 * — **+90% from Chronal Surge alone**, up to nine times the Animist's. fb083
 * (`run.ts:875`) moved the second line's key to `towerArea`, so both halves of
 * one sentence are tower-scoped now.
 *
 * **Why it had to live in this file.** Every one of the twenty-one
 * `CONSUMERS` built an Animist world. A main-lane `towerArea` swap that moved
 * `data/classes.json` but missed `run.ts:817` would have landed with this file
 * *fully green* while leaving the larger of the two leaks in place — it did
 * not miss it, and the `c024` describe block below is what confirms that
 * rather than trusting the diff. The consumers are class-parameterised
 * (`WorldOpts.classKey`), so the two classes' rows are checked to flip
 * together (`STILL_WIDENED`, shared with `c013`), or the difference is a
 * named deviation.
 *
 * **`run.ts` is not edited from this lane** — this is the measurement only.
 */

/**
 * `Content` rebuilt with Chronal Surge's *area* half zeroed, its range half
 * untouched.
 *
 * **Zeroed, not deleted** — and the difference is the loader doing its job.
 * `c013`'s Animist control deletes `towerPassive.mods.towerArea`, which is
 * legal because `mods` is a free map. `bonusAoeMul` is a *required field of
 * the `chronal_surge` kind* (`validateClassPassive`, `content.ts:1333`), so
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

  it("fb083: both halves are tower-scoped now, closing the bug the two adjacent lines used to be", () => {
    // Pre-fix this asserted the opposite — one tower-scoped `stats.add`, one on
    // the global `area` key, from one §4.2 sentence. fb083 (`run.ts:875`)
    // moved the area half to `towerArea` alongside it, asserted on the source
    // rather than described so a regression back to the global key reddens
    // here directly, not just in the LEAKING rows below.
    const run = readFileSync(join(__dirname, '../src/sim/run.ts'), 'utf8');
    expect(run, "Chronal Surge's range half is no longer tower-scoped").toMatch(
      /w\.stats\.add\(source, 'towerRange', cls\.towerPassive\.bonusRangeMul/,
    );
    expect(
      run,
      "Chronal Surge's area half is back on the global `area` key — the LEAKING rows below should have " +
        'flipped back with it',
    ).toMatch(/w\.stats\.add\(source, 'towerArea', cls\.towerPassive\.bonusAoeMul/);
  });

  /**
   * **Two of the twenty-one cannot exist in a Time Lord world at all**, and
   * that is structural rather than a finding: they are footprints of the
   * *Animist's own class Actives*. A Time Lord cannot summon a Manifest
   * spirit or plant a Recall Totem, so there is nothing to widen. Named, per
   * `c019`'s convention, rather than quietly dropped from the sweep.
   */
  const CLASS_SPECIFIC: readonly string[] = [
    "the Animist's *Manifest* spirit, cloned from a Mortar",
    "the Animist's *Recall Totem* aura radius",
  ];

  /**
   * **Three more are harness-calibrated for the Animist and do not survive
   * being pointed at this control**, which was, and mostly still is, a
   * statement about the probe and not about the leak. Measured, not guessed:
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
   * **Postscript on the middle row.** Electric off a Tesla hit briefly sat
   * outside `APPLICABLE` for *two* reasons at once: between fb083's first
   * landing and the `isTowerSource` follow-up, `damagetypes.ts` took no
   * `route` parameter and only read the bare `area`, so it was also one of
   * `STOPPED_WIDENING_BOTH`'s two rows — a production gap that would have
   * excluded it from a "still widens" claim on its own. The follow-up closed
   * that gap (this row now flows to `STILL_WIDENED`, same as its Burning
   * twin), so the calibration problem above is the *only* reason left this
   * row sits outside `APPLICABLE` — re-tuning it belongs with `c026`'s
   * footprint work, same as the other two `UNCALIBRATED` rows. Burning's own
   * tower row never had this row's calibration problem, which is why it
   * stayed in `APPLICABLE` throughout and could be swept directly (below)
   * rather than reasoned about here.
   *
   * All three of these are **tower-route**, which is the half §4.2's "all
   * towers" sentence actually covers, so none of them is where the closed
   * leak lived; the eleven now-closed character-route rows were (see
   * `STILL_WIDENED`'s complement, checked below). Re-calibrating these three
   * belongs with `c026`'s footprint work, not here — filed rather than
   * bodged, because widening a probe to make a control pass is how a
   * measurement stops measuring.
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
    expect(APPLICABLE.length, 'the sweep has stopped covering most of the table').toBe(16);
  });

  it('the two class-specific rows really are Animist Actives, and fb083 tells them apart, not something quietly dropped', () => {
    // Whether each one widens under the Animist is c013's finding, re-read
    // here via `STILL_WIDENED` rather than restated: the Manifest spirit is a
    // literal tower-clone (still widens), the Recall Totem reads the
    // character's own `classArea` (fb083 closed it). Their absence from this
    // describe's own sweep is about whose Active it is, nothing else —
    // proven by checking each against the *same* direction c013 measured,
    // not by assuming both still widen.
    for (const name of CLASS_SPECIFIC) {
      const c = CONSUMERS.find((x) => x.site === name)!;
      const withGrove = c.measure(content);
      const without = c.measure(noGrove);
      if (STILL_WIDENED.includes(name)) {
        expect(withGrove, `${name} no longer widens under the Animist either`).toBeGreaterThan(without);
      } else {
        expect(withGrove, `${name} widens under the Animist again — has fb083 regressed?`).toBeCloseTo(without, 10);
      }
    }
  });

  for (const c of APPLICABLE) {
    // fb083: Chronal Surge and Wide Grove now land on the exact same two
    // stat keys (`towerRange`/`towerArea`), so whether a footprint still
    // widens is the same fact `STILL_WIDENED` already states for c013 — a Time
    // Lord row that disagreed with its Animist twin would be the asymmetry
    // this item exists to catch.
    const shouldWiden = STILL_WIDENED.includes(c.site);
    it(`${c.site} [${c.route}]: Chronal Surge's area half ${shouldWiden ? 'still widens it, exactly as Wide Grove does' : 'no longer widens it (fb083), exactly as Wide Grove does not'}`, () => {
      const withSurge = c.measure(content, timeLordOpts());
      const without = c.measure(noSurgeAoe, timeLordOpts());
      if (shouldWiden) {
        expect(withSurge, `${c.site} is not widened by Chronal Surge, but is by Wide Grove`).toBeGreaterThan(without);
      } else {
        expect(withSurge, `${c.site} is widened by Chronal Surge, but is not by Wide Grove`).toBeCloseTo(without, 10);
      }
    });
  }

  it('fb083 closed the character-route leak under Time Lord too — none of them widen any more', () => {
    // The set that matters: §4.2's sentence says "all towers", and every one
    // of `LEAKING_TODAY`'s residual members is either `CLASS_SPECIFIC`
    // (excluded above) or, before fb083, a *character* footprint widened
    // anyway. `LEAKING_TODAY` now holds only the Manifest spirit — itself
    // `CLASS_SPECIFIC` — so the filtered `expected` set below is empty, and it
    // should be: the two classes land on the same two stat keys, so a
    // character-route leak fb083 closed for the Animist is closed for the
    // Time Lord by the same mechanism, not by a second fix.
    const expected = LEAKING_TODAY.filter((s) => !CLASS_SPECIFIC.includes(s) && !UNCALIBRATED.includes(s));
    const leaking = APPLICABLE.filter(
      (c) => c.route === 'character' && c.measure(content, timeLordOpts()) > c.measure(noSurgeAoe, timeLordOpts()),
    ).map((c) => c.site);
    expect(
      [...leaking].sort(),
      'the two classes no longer leak through the same set — one has been fixed without the other',
    ).toEqual([...expected].sort());
    expect(leaking.length, 'a character-route leak reappeared under Time Lord — has fb083 regressed?').toBe(0);
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
