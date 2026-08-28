/**
 * Act I towers (SPEC 3.3): placement rules, upgrades, selling and firing.
 *
 * Placement obeys two hard rules:
 *   - the tile must be buildable,
 *   - the Warden must be within build range.
 * The old path guarantee is gone: SPEC-FINAL §10 legalises sealing the Core,
 * and a sealed board routes enemies over the cheapest breach (see grid.ts).
 */

import {
  applyAoE,
  applyEffects,
  bestConeDirection,
  bestLineDirection,
  chainHit,
  coneHit,
  dealHit,
  type HitEffects,
  lineHit,
  spawnProjectile,
  targetFirst,
} from './combat';
import type { TowerDef } from './content';
import { applyTowerLifesteal, vampireMissingHpBuffMul } from './cores';
import { applyDamageType } from './damagetypes';
import { dist2, normalize } from './math';
import { applySlow } from './enemies';
import type { Enemy, Structure, TowerClassBonus } from './types';
import {
  attackProfile,
  damageShare,
  maxLevel,
  sellValue,
  structureMaxHp,
  upgradeCost,
  upgradeStatMul,
} from './upgrades';
import { World } from './world';

// SPEC-V3 §4's track math lives in `upgrades.ts` (enemies.ts needs part of it
// and imports would go circular); re-exported so `towers` stays the one import
// the UI, the bots and the tests reach for.
export {
  attackProfile,
  damageShare,
  maxLevel,
  sellValue,
  structureArmor,
  structureMaxHp,
  upgradeCost,
  upgradeStatMul,
} from './upgrades';
export type { AttackProfile } from './upgrades';

export type BuildResult =
  | { ok: true; structure: Structure }
  | { ok: false; reason: BuildRejection };

export type BuildRejection =
  | 'phase'
  | 'unknown_tower'
  | 'occupied'
  | 'out_of_range'
  | 'gold';

/** Only the two Act I phases allow construction; a VS wave never does (p3d deleted the Dusk phase that used to bridge them). */
export function canBuildNow(w: World): boolean {
  return w.phase === 'act1_build' || w.phase === 'act1_wave';
}

export function towerCost(w: World, def: TowerDef): number {
  return Math.max(1, Math.round(def.cost * w.derived.towerCostMul));
}

export function inBuildRange(w: World, tx: number, ty: number): boolean {
  const r = w.derived.buildRange;
  return dist2(w.warden.x, w.warden.y, tx + 0.5, ty + 0.5) <= r * r;
}

export interface BuildOptions {
  /**
   * Skips `canBuildNow`'s Act-I-only gate. Only Ice Wall's internal placement
   * call (`fireIceWall`, classes.ts) sets this — every player-facing Build
   * path (the `build` Command, the UI ghost, bot policies) always leaves it
   * unset, so ordinary tower placement stays Act-I-only per §12 rule 3
   * (Q120 ORDER 2).
   */
  ignorePhase?: boolean;
}

/** Full legality check without side effects — the renderer uses it for ghosts. */
export function checkBuild(
  w: World,
  towerId: number,
  tx: number,
  ty: number,
  opts?: BuildOptions,
): BuildRejection | null {
  if (!opts?.ignorePhase && !canBuildNow(w)) return 'phase';
  const def = w.content.towerById.get(towerId);
  if (!def) return 'unknown_tower';
  if (!w.grid.buildable(tx, ty)) return 'occupied';
  if (!inBuildRange(w, tx, ty)) return 'out_of_range';
  if (w.gold < towerCost(w, def)) return 'gold';
  // No path-guarantee check: SPEC-FINAL §10 allows sealing the Core outright.
  return null;
}

export function buildTower(
  w: World,
  towerId: number,
  tx: number,
  ty: number,
  opts?: BuildOptions,
): BuildResult {
  const reason = checkBuild(w, towerId, tx, ty, opts);
  if (reason) return { ok: false, reason };
  const def = w.content.towerById.get(towerId)!;

  // b016: `checkBuild` has no path-guarantee-style check against the
  // Warden's own tile (§10 legalises sealing, so "occupied by the Warden"
  // isn't a placement rule the way "occupied by a structure" is) — the
  // Warden is relocated to the nearest reachable open tile instead of
  // ending up trapped inside the structure's now-blocked footprint. The
  // escape search treats (tx,ty) as already blocked (it is, the instant
  // this build lands) and is an unbounded flood fill, not a capped radius —
  // a capped search can exhaust itself against a real ring of towers and
  // silently leave the Warden trapped, the exact bug this exists to close.
  // If genuinely no tile is reachable, the build is refused outright rather
  // than reporting success while trapping the Warden.
  const wardenHere = Math.floor(w.warden.x) === tx && Math.floor(w.warden.y) === ty;
  const escape = wardenHere ? findEscapeTile(w, tx, ty) : null;
  if (wardenHere && !escape) return { ok: false, reason: 'occupied' };

  const cost = towerCost(w, def);
  w.gold -= cost;
  w.goldSpent += cost;

  const maxHp = structureMaxHp(w, def, 1);
  const s: Structure = {
    id: w.newId(),
    towerId: def.id,
    tier: 1,
    tx,
    ty,
    hp: maxHp,
    maxHp,
    spent: cost,
    cooldown: 0,
    dead: false,
    petrified: false,
    gemTimer: 0,
    gemsWaiting: 0,
    links: [],
    damageDealt: 0,
    pactActive: false,
    atkSpdBuffRemaining: 0,
    tithed: false,
  };
  w.addStructure(s);
  w.towersBuilt++;
  w.towersByKey[def.key] = (w.towersByKey[def.key] ?? 0) + 1;
  w.emit('build', tx + 0.5, ty + 0.5, def.id, 1);
  markAuraDirty(w);
  if (escape) {
    w.warden.x = escape[0] + 0.5;
    w.warden.y = escape[1] + 0.5;
    w.emit('wardendisplaced', w.warden.x, w.warden.y, 0, 0);
  }
  return { ok: true, structure: s };
}

/**
 * Nearest tile reachable from (tx,ty) that isn't `(tx,ty)` itself and is
 * currently passable — an unbounded BFS over the (small, fixed-size) grid,
 * so it always finds a reachable open tile if one exists at all, rather
 * than a capped radius that can exhaust itself against a real ring of
 * built structures. Deterministic: iterates `grid.passable`, no RNG.
 */
function findEscapeTile(w: World, tx: number, ty: number): [number, number] | null {
  const seen = new Set<number>([w.grid.idx(tx, ty)]);
  let frontier: Array<[number, number]> = [[tx, ty]];
  while (frontier.length > 0) {
    const next: Array<[number, number]> = [];
    for (const [x, y] of frontier) {
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (!w.grid.inBounds(nx, ny)) continue;
        const i = w.grid.idx(nx, ny);
        if (seen.has(i)) continue;
        seen.add(i);
        if (w.grid.passable(nx, ny)) return [nx, ny];
        next.push([nx, ny]);
      }
    }
    frontier = next;
  }
  return null;
}

export function upgradeTower(w: World, tx: number, ty: number): boolean {
  if (!canBuildNow(w)) return false;
  const s = w.structureAt(tx, ty);
  if (!s || s.petrified) return false;
  const def = w.content.towerById.get(s.towerId)!;
  if (s.tier >= maxLevel(def)) return false;
  if (!inBuildRange(w, tx, ty)) return false;
  const cost = upgradeCost(w, def);
  if (w.gold < cost) return false;
  w.gold -= cost;
  w.goldSpent += cost;
  s.spent += cost;
  s.tier++;
  // Damage taken carries across the upgrade: V2's +50%/tier HP curve becomes
  // §4's +10%/step, and both preserve the wound rather than healing it.
  const ratio = s.maxHp > 0 ? s.hp / s.maxHp : 1;
  s.maxHp = structureMaxHp(w, def, s.tier);
  s.hp = s.maxHp * ratio;
  // A step buys HP and Defense, both of which price the tile's breach (§10).
  w.refreshBreach(s);
  w.emit('upgrade', tx + 0.5, ty + 0.5, def.id, s.tier);
  markAuraDirty(w);
  return true;
}

export function sellTower(w: World, tx: number, ty: number): boolean {
  if (!canBuildNow(w)) return false;
  const s = w.structureAt(tx, ty);
  if (!s || s.petrified) return false;
  if (!inBuildRange(w, tx, ty)) return false;
  const def = w.content.towerById.get(s.towerId)!;
  // §4 states one sell rule and does not except a phase, so V2's harsher Dusk
  // rate (35%) is gone with the constant that carried it.
  const refund = sellValue(w, s);
  w.gold += refund;
  w.removeStructure(s);
  w.towersByKey[def.key] = Math.max(0, (w.towersByKey[def.key] ?? 1) - 1);
  w.emit('sell', tx + 0.5, ty + 0.5, def.id, refund);
  markAuraDirty(w);
  return true;
}

/* ------------------------------------------------------------ tower stats */

/** SPEC-V2 §2: an affinity tower deals +`bonus` effectiveness for its class. */
export function affinityMul(w: World, towerKey: string): number {
  const aff = w.content.affinityByClass.get(w.cfg.classKey);
  return aff && aff.towers.includes(towerKey) ? 1 + aff.bonus : 1;
}

/** SPEC 2.1: Power multiplies tower damage in Act I. */
export function towerDamage(w: World, s: Structure, base: number): number {
  const def = w.content.towerById.get(s.towerId)!;
  return (
    base *
    upgradeStatMul(w, def, s.tier) *
    w.derived.powerMul *
    w.derived.towerDamageMul *
    affinityMul(w, def.key) *
    // SPEC-FINAL §5.5 Vampire Heart: "+0.5% damage ... per 1% HP missing".
    vampireMissingHpBuffMul(w, s) *
    // §4.2's per-structure class effects (p6d): Death Pact, Blood Tithe and
    // Necromancer's below-full-HP tower passive.
    classTowerDamageMul(w, s)
  );
}

/**
 * SPEC-FINAL §4.2, p6d: the damage multipliers a class hangs on one specific
 * structure. Read straight off the selected class row rather than through
 * `Stats`/`STAT_KEYS`, because none of the three is a run-wide contribution —
 * two are per-structure flags a cast set, and the third depends on that
 * structure's current HP.
 */
function classTowerDamageMul(w: World, s: Structure): number {
  const cls = w.content.classByKey.get(w.cfg.classKey);
  if (!cls || cls.legacy) return 1;
  let mul = 1;
  if (s.pactActive && cls.active2.kind === 'death_pact') mul *= 1 + (cls.active2.pactDamageMul ?? 0);
  if (s.tithed && cls.active1.kind === 'blood_tithe') mul *= 1 + (cls.active1.titheDamageMul ?? 0);
  // "all towers +15% damage while below full HP" — Act I only, the default
  // every tower stat but Wind Slash already carries (Q118/Q119).
  const lowHp = cls.towerPassive.mods.towerLowHpDamageBonus ?? 0;
  if (lowHp > 0 && !w.huntsWarden && s.hp < s.maxHp) mul *= 1 + lowHp;
  return mul;
}

/**
 * §4.2's three target-conditional tower passives, resolved once per volley.
 * Null for every class that authors none, so the hot `dealHit` path pays one
 * null check rather than three dictionary reads per struck enemy. Act I only,
 * same default as `classTowerDamageMul` above.
 */
export function classTowerBonus(w: World): TowerClassBonus | null {
  if (w.huntsWarden) return null;
  const cls = w.content.classByKey.get(w.cfg.classKey);
  if (!cls || cls.legacy) return null;
  const m = cls.towerPassive.mods;
  const extraElectricPct = m.towerExtraElectricPct ?? 0;
  const vsBurningPct = m.towerDamageVsBurning ?? 0;
  const vsChilledPct = m.towerDamageVsChilled ?? 0;
  if (extraElectricPct === 0 && vsBurningPct === 0 && vsChilledPct === 0) return null;
  return { extraElectricPct, vsBurningPct, vsChilledPct };
}

/**
 * SPEC-V3 §4 upgrades move HP, Attack and Defense — **not** range. V2's
 * `tierRangeMul` (x1.1 per tier) is gone, so a tower's reach is its authored
 * range and whatever the Constellation adds.
 */
export function towerRange(w: World, _s: Structure, base: number): number {
  return base * w.derived.towerRangeMul;
}

/**
 * The radius a tower of this type actually reaches, at a given tier.
 *
 * Shared by the renderer's range rings and the tower info panel so neither can
 * drift from the sim. The placement ghost used to draw the raw
 * `def.attack.range`, so it lied about every upgraded tower and about any
 * Constellation range bonus (SPEC-V3 T1).
 *
 * Kind matters, which this helper's first version missed: `fireTower` scales an
 * **aura** by `areaMul` on top of the targeting range, so a Frost Obelisk with
 * any Area stat covers more than `towerRange` alone reports.
 */
export function effectiveTowerRange(w: World, def: TowerDef, _level = 1): number {
  const a = def.attack;
  if (!a) return 0;
  // The level parameter survives for callers that iterate a track (and for the
  // panel's "next level" column); under §4 it no longer changes the answer.
  const targeting = a.range * w.derived.towerRangeMul;
  return a.kind === 'aura' ? targeting * w.derived.areaMul : targeting;
}

/**
 * Splash radius a shell detonates for, or 0 for a tower that has none. Only
 * `lob` reads `aoe` in `fireTower`, and it defaults to 1.5 when unauthored —
 * both facts are mirrored here so a new lob tower cannot silently disagree.
 */
export function effectiveTowerAoe(w: World, def: TowerDef): number {
  const a = def.attack;
  if (!a) return 0;
  // A lob always bursts (1.5 where unauthored); SPEC-V3 §4's Poison tower has
  // a "small AoE" it authors outright, and every other kind has none.
  if (a.kind === 'lob') return (a.aoe ?? 1.5) * w.derived.areaMul;
  if (a.kind === 'poison') return (a.aoe ?? 0) * w.derived.areaMul;
  return 0;
}

/** Minimum range a lob refuses to fire inside, or 0. See `pickLobTarget`. */
export function effectiveTowerMinRange(_w: World, def: TowerDef): number {
  const a = def.attack;
  return a && a.kind === 'lob' ? (a.minRange ?? 0) : 0;
}

/* ------------------------------------------------------------ beacon auras */

/**
 * Aura state lives on the World, never at module scope: several worlds are
 * alive at once in tests and sweeps, and structure ids restart per world.
 */
export function markAuraDirty(w?: World): void {
  if (!w) return;
  w.auraDirty = true;
  // The tower roster feeding both caches changed together — see the doc
  // comment on `World.wieldedCache` (p2b, code review finding #2).
  w.wieldedDirty = true;
}

function refreshAuras(w: World): void {
  w.auraBonus.clear();
  const beacons: Structure[] = [];
  for (const s of w.structures) {
    if (s.dead || s.petrified) continue;
    const def = w.content.towerById.get(s.towerId)!;
    if (def.buffAura) beacons.push(s);
  }
  w.auraDirty = false;
  if (beacons.length === 0) return;
  for (const s of w.structures) {
    if (s.dead || s.petrified) continue;
    let bonus = 0;
    for (const b of beacons) {
      if (b.id === s.id) continue;
      const def = w.content.towerById.get(b.towerId)!;
      const r = def.buffAura!.radius + w.derived.beaconRadiusBonus;
      if (dist2(b.tx + 0.5, b.ty + 0.5, s.tx + 0.5, s.ty + 0.5) <= r * r) {
        // Higher-tier beacons project a stronger aura.
        bonus += def.buffAura!.attackSpeed * (1 + 0.25 * (b.tier - 1));
      }
    }
    if (bonus > 0) w.auraBonus.set(s.id, bonus);
  }
}

export function attackSpeedFor(w: World, s: Structure): number {
  // V3 §2: buff auras are a different origin from the Warden's own stat stack, so
  // they multiply. Overlapping auras sum into `bonus` first (ranks within one
  // source), matching the shrine rule in weapons.ts.
  // SPEC-FINAL §5.5 Vampire Heart: "... and attack speed per 1% HP missing".
  // §4.1 Wind Slash (p6b): "all towers +10% attack speed" — a tower-side
  // multiplier distinct from the Warden's own `attackSpeedMul` above.
  // §4.2 (p6d): Engineer's Field Kit overclock (a timed buff) and
  // Necromancer's Death Pact (a toggle) are both per-structure, so they
  // multiply here rather than folding into the shared `towerAttackSpeed` stat.
  return (
    w.derived.attackSpeedMul *
    w.derived.towerAttackSpeedMul *
    (1 + (w.auraBonus.get(s.id) ?? 0)) *
    vampireMissingHpBuffMul(w, s) *
    classTowerAttackSpeedMul(w, s)
  );
}

function classTowerAttackSpeedMul(w: World, s: Structure): number {
  if (s.atkSpdBuffRemaining <= 0 && !s.pactActive) return 1;
  const cls = w.content.classByKey.get(w.cfg.classKey);
  if (!cls || cls.legacy) return 1;
  let mul = 1;
  if (s.atkSpdBuffRemaining > 0 && cls.active1.kind === 'repair_heal') {
    mul *= 1 + (cls.active1.overclockAtkSpdMul ?? 0);
  }
  if (s.pactActive && cls.active2.kind === 'death_pact') mul *= 1 + (cls.active2.pactAtkSpdMul ?? 0);
  return mul;
}

/* ---------------------------------------------------------------- firing */

export function updateTowers(w: World, dt: number): void {
  if (w.auraDirty) refreshAuras(w);
  for (const s of w.structures) {
    if (s.dead || s.petrified) continue;
    // §4.2 Engineer's overclock runs down whether or not this tower shoots.
    if (s.atkSpdBuffRemaining > 0) s.atkSpdBuffRemaining = Math.max(0, s.atkSpdBuffRemaining - dt);
    const def = w.content.towerById.get(s.towerId)!;
    if (!def.attack) continue;
    s.cooldown -= dt * attackSpeedFor(w, s);
    if (s.cooldown > 0) continue;
    s.cooldown += def.attack.interval;
    if (s.cooldown < 0) s.cooldown = 0;
    // SPEC-FINAL §5.5 Vampire Heart: "TD: all towers gain 0.1% lifesteal" —
    // read as the delta `fireTower` synchronously landed (`damageDealt`'s own
    // before/after). This only covers `single`/`cone`/`aura`/`chain`/`poison`
    // — `pierce`/`lob` land later, asynchronously, through `combat.ts`'s
    // `updateProjectiles`/`detonate`, which call `applyTowerLifesteal`
    // themselves at the same two sites `p5d` already credits `damageDealt`
    // from, so every attack kind lifesteals exactly once regardless of when
    // its damage actually lands.
    const before = s.damageDealt;
    fireTower(w, s, def);
    applyTowerLifesteal(w, s, s.damageDealt - before);
  }
}

/** SPEC-V3 §4: how wide a line an Arrow's shot sweeps as it carries through. */
export const LINE_HALF_WIDTH = 0.4;

function fireTower(w: World, s: Structure, def: TowerDef): void {
  const a = def.attack!;
  const x = s.tx + 0.5;
  const y = s.ty + 0.5;
  const range = towerRange(w, s, a.range);
  const dmg = towerDamage(w, s, a.damage);
  const area = w.derived.areaMul;
  const source = def.key;
  // SPEC-V3 §4's milestone specials, folded into what this tower fires *at this
  // level*. Read here rather than off `def` so no case can shoot the authored
  // attack and quietly ignore the steps the player bought.
  const prof = attackProfile(def, s.tier);
  // SPEC-V3 §3 riders and the composite split travel with every shape this
  // tower can fire, so neither can be silently dropped by one `kind` out of
  // seven.
  const fx: HitEffects = { source, onHit: prof.onHit, ratio: prof.ratio, towerBonus: classTowerBonus(w) };

  switch (a.kind) {
    case 'single': {
      const t = targetFirst(w, x, y, range);
      if (!t) {
        s.cooldown = 0;
        return;
      }
      // §4 Arrow: the shot flies through the target and carries on into
      // whoever is behind it (`pierce`), and a milestone can put a second shot
      // down that same path (`projectiles`). At `pierce: 0, projectiles: 1` —
      // every V2-authored single-target tower — this is one full-damage hit on
      // the target and nothing else, which is what it has always been.
      const dir = normalize(t.x - x, t.y - y);
      // A target standing exactly on the tower gives no direction, and a line
      // of (0,0) is a line every enemy in reach lies on — so the shot pierces
      // nothing rather than everything.
      const hits = dir.x === 0 && dir.y === 0 ? 1 : 1 + prof.pierce;
      for (let i = 0; i < prof.projectiles; i++) {
        s.damageDealt += lineHit(w, x, y, dir.x, dir.y, range, LINE_HALF_WIDTH, dmg, source, hits, fx, {
          primary: t,
        });
        w.emit('shot', x, y, t.x, t.y);
      }
      break;
    }
    case 'pierce': {
      const dir = bestLineDirection(w, x, y, range, LINE_HALF_WIDTH);
      if (!dir) {
        s.cooldown = 0;
        return;
      }
      for (let i = 0; i < prof.projectiles; i++) {
        spawnProjectile(w, {
          kind: 'bolt',
          x,
          y,
          targetX: x + dir.x * range,
          targetY: y + dir.y * range,
          speed: a.projectileSpeed ?? 14,
          damage: dmg,
          pierce: prof.pierce,
          source,
          fx,
          structureId: s.id,
        });
      }
      break;
    }
    case 'cone': {
      // §5.2 Fire Brazier @4: "cone width +50%" is a multiplier on the
      // authored half-angle, on top of the character's own Area stat.
      const halfAngle = (a.coneHalfAngle ?? 0.6) * area * prof.coneWidthMul;
      const dir = bestConeDirection(w, x, y, range, halfAngle);
      if (!dir) {
        s.cooldown = 0;
        return;
      }
      // §5.2 Fire Brazier @2: "+1 Burning per hit" reads as a dps multiplier,
      // not a second stack — see `AttackProfile.burnStacks`'s doc comment.
      s.damageDealt += coneHit(w, x, y, dir.x, dir.y, range, halfAngle, dmg, source, {
        ...fx,
        burnDps: a.burn ? a.burn.dps * prof.burnStacks * upgradeStatMul(w, def, s.tier) : 0,
        burnDuration: a.burn?.duration ?? 0,
      });
      w.emit('cone', x, y, dir.x, dir.y);
      break;
    }
    case 'aura': {
      const r = range * area;
      const list = w.enemiesInRadius(x, y, r);
      for (const e of list) {
        if (e.dead) continue;
        s.damageDealt += dealHit(w, e, dmg, source, fx, { fromX: x, fromY: y });
        if (e.dead) continue;
        // §5.2 Frost Obelisk @3: "frost from this tower lasts 5s" — `prof`
        // already resolves this against the authored `slowDuration`.
        if (a.slow) applySlow(w, e, a.slow, prof.slowDuration);
        applyEffects(w, e, fx);
      }
      if (list.length > 0) w.emit('pulse', x, y, r, 0);
      break;
    }
    case 'chain': {
      const t = targetFirst(w, x, y, range);
      if (!t) {
        s.cooldown = 0;
        return;
      }
      // V2 gave +1 arc per tier. SPEC-V3 §4 spends an upgrade step on HP,
      // Attack and Defense and makes the Electric tower's chaining a milestone
      // special at step 3 instead, so the authored count is the count at every
      // level and the milestone arcs on top of it.
      const chainRange = a.chainRange ?? 3;
      s.damageDealt += chainHit(w, x, y, t, a.chains ?? 3, chainRange, dmg, source, fx);
      if (prof.electricChain) {
        s.damageDealt += arcElectric(w, t, dmg, prof.ratio, chainRange, source, x, y);
      }
      break;
    }
    case 'lob': {
      const minR = a.minRange ?? 0;
      const t = pickLobTarget(w, x, y, minR, range);
      if (!t) {
        s.cooldown = 0;
        return;
      }
      const speed = a.projectileSpeed ?? 7;
      const lead = Math.sqrt(dist2(x, y, t.x, t.y)) / speed;
      const aim = leadTarget(t, lead);
      spawnProjectile(w, {
        kind: 'shell',
        x,
        y,
        targetX: aim.x,
        targetY: aim.y,
        speed,
        damage: dmg,
        aoe: (a.aoe ?? 1.5) * area,
        source,
        fx,
        // §5.2 Mortar @3: "shells leave a burning patch" — a ground hazard
        // spawned on impact, not a per-enemy hit effect (see `detonate`).
        groundBurn: prof.groundBurn,
        groundBurnSeconds: prof.groundBurnSeconds,
        structureId: s.id,
      });
      break;
    }
    case 'poison': {
      // §5.1 Poison: "small AoE", and a milestone that adds a second spore
      // "(same path, not spread) @2" — the identical annotation §5.1 gives
      // Arrow's own second projectile, not the "spreads to the next enemy
      // down the path" reading m20b shipped under the older SPEC-V3 table
      // (p5a, QUESTIONS Q79/Q86/Q87/Q110). So every spore this tower fires,
      // milestone or not, lands on the one primary target — same as Arrow's
      // `single` case above, just without the line/pierce geometry Poison
      // never authors.
      const t = targetFirst(w, x, y, range);
      if (!t) {
        s.cooldown = 0;
        return;
      }
      // §3's ratio *is* the poison now: V2's second constant (`attack.poison`,
      // a dps and a duration of its own) is gone, so the DoT scales with the
      // attack rather than with a number nobody remembers to upgrade.
      // One reading of the radius, the panel's: two would drift (the m20a trap).
      const splash = effectiveTowerAoe(w, def);
      for (let i = 0; i < prof.projectiles; i++) {
        if (splash > 0) {
          s.damageDealt += applyAoE(w, t.x, t.y, splash, dmg, source, fx, {
            primary: t,
            damage: { fromX: x, fromY: y },
          });
        } else {
          s.damageDealt += dealHit(w, t, dmg, source, fx, { fromX: x, fromY: y });
          if (!t.dead) applyEffects(w, t, fx);
        }
        w.emit('spore', x, y, t.x, t.y);
      }
      break;
    }
  }
}

/**
 * SPEC-V3 §4 Electric @3: "the electric portion chains to the nearest other
 * enemy (visual arc, no normal damage in the chain); if no other target, it
 * applies twice to the first".
 *
 * Only the electric share travels, so this is not another `chainHit` — the arc
 * carries a fraction of the attack, not the attack.
 */
export function arcElectric(
  w: World,
  first: Enemy,
  damage: number,
  ratio: Readonly<Record<string, number>> | null,
  chainRange: number,
  source: string,
  originX: number,
  originY: number,
): number {
  const share = damageShare(ratio, 'electric') * damage;
  if (share <= 0) return 0;
  const next = w.nearestEnemy(first.x, first.y, chainRange, (e) => e.id !== first.id);
  if (!next) {
    // "Applies twice to the first": the attack landed one, this is the second —
    // and it comes from the same place the first did, so a Shellback's front
    // shield reads it the same way. Without the origin the second application
    // hits *harder* than the one it is a copy of.
    return applyDamageType(w, first, 'electric', share, source, { fromX: originX, fromY: originY });
  }
  w.emit('arc', first.x, first.y, next.x, next.y);
  return applyDamageType(w, next, 'electric', share, source, { fromX: first.x, fromY: first.y });
}

export function pickLobTarget(w: World, x: number, y: number, minRange: number, range: number) {
  const list = w.enemiesInRadius(x, y, range);
  const min2 = minRange * minRange;
  let best = null;
  let bestCount = -1;
  for (const c of list) {
    if (dist2(x, y, c.x, c.y) < min2) continue;
    let count = 0;
    for (const e of list) if (dist2(c.x, c.y, e.x, e.y) <= 2.25) count++;
    if (count > bestCount) {
      bestCount = count;
      best = c;
    }
  }
  return best;
}

export function leadTarget(t: { x: number; y: number; fx: number; fy: number; speed: number }, time: number) {
  const n = normalize(t.fx, t.fy);
  return { x: t.x + n.x * t.speed * time, y: t.y + n.y * t.speed * time };
}

/* ------------------------------------------------------------ Harvest gold */

/** SPEC 3.3 #10: Sprouts pay +5 gold per wave per tier at wave clear. */
export function collectSproutGold(w: World): number {
  let total = 0;
  for (const s of w.structures) {
    if (s.dead || s.petrified) continue;
    const def = w.content.towerById.get(s.towerId)!;
    if (!def.economy) continue;
    total += def.economy.goldPerWavePerTier * s.tier;
  }
  if (total > 0) {
    const gold = Math.round(total * w.derived.sproutMul * w.derived.goldFindMul);
    w.gold += gold;
    w.goldEarned += gold;
    return gold;
  }
  return 0;
}
