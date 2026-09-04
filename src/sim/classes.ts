/**
 * Class framework (SPEC-FINAL §4, p6a; the SPEC-V2 §2 single-Active/`mods`/
 * `manualAttack` shape was retired at p6f, Q38). Every class gets Active1 (Q)
 * and Active2 (E) as two independently cooled-down sim Commands
 * (`class_active` / `class_active2`) so bots and replays trigger either
 * exactly like any other action — plus a band-driven basic attack that
 * auto-fires with no Command at all (`classBasicAttack`, called from
 * `updateWarden`).
 *
 * `kind` dispatches the effect itself so new kinds can be added here as more
 * kits land without touching the Command plumbing or the schema shape. p6b
 * adds the Swordsman's `charge_nova` (Circle Slash, held via
 * `TickInput.active1Held` and fired on release — `tickClassCharge`) and
 * `dash_line` (Dash Slash, mouse-aimed) kinds, plus `passive.kind`, the same
 * dispatch idea for a non-stat-shaped passive (Thousand Cuts' on-hit
 * Bleeding). p6c adds the Plaguebringer's `ground_poison` (Poison Barrel, a
 * self-centered `GroundArea('poison')`) and `poison_boost` (Poison Boost, a
 * global no-target effect) Active kinds, plus `spreading_plague` on
 * `passive.kind` — that one is death-triggered rather than hit-triggered, so
 * it dispatches from `killEnemy` (enemies.ts), not from here.
 *
 * p6d fills §4.2's nine remaining classes and adds three things the two kits
 * before it never needed (Q120):
 *   - **per-tick class behaviour** that is neither an attack nor a Command —
 *     `updateClassPassives` (Contagious Flame's touch damage, Guardian
 *     Stance's stand-still ledger, Death Pact's HP drain, the Overload/Clarion
 *     timers, corpse decay), called from the three phase paths in `run.ts`
 *     alongside `updateAreas`;
 *   - **summons** — `updateClassSummons` drives one `ClassSummon` struct for
 *     Engineer turrets, Necromancer skeletons and Bone Pylons, Animist spirits
 *     and the Recall Totem's aura, capped per kind by `spawnClassSummon`;
 *   - **temporary structures** — `updateTempWalls` removes an Ice Wall's free
 *     palisades when their timer runs out.
 */
import { applyAoE, applyEffects, lineHit } from './combat';
import type { ClassDef, ClassEffect, TowerDef } from './content';
import { applyHealingToWarden } from './cores';
import { applyDamageType } from './damagetypes';
import {
  applyAtkSlow,
  applyDot,
  applyFrost,
  applyFrozen,
  applySlow,
  damageEnemy,
  dotOutstanding,
  TAUNT_TOTEM,
  TAUNT_WARDEN,
} from './enemies';
import { hasEquipment } from './equipment';
import { GRID_H, GRID_W } from './grid';
import { clamp, dist2, lerp, normalize } from './math';
import { active1PotencyMul, active2CdrBonus, classLineBonus } from './progression';
import { BASE } from './stats';
import { buildTower, effectiveTowerAoe, LINE_HALF_WIDTH, towerCost } from './towers';
import { maxLevel, upgradeStatMul } from './upgrades';
import { tickCooldown, type ClassSummon, type Enemy, type Phase, type Structure, type TickInput } from './types';
import { resolveDashTarget, startDashTravel } from './wardenmove';
import { World } from './world';

/** Usable both TD and VS, per SPEC-FINAL §4 — but not in menu/transition phases. */
const ACTIVE_PHASES: ReadonlySet<Phase> = new Set(['act1_build', 'act1_wave', 'act2']);

/**
 * The fields the one shared `kind` (`burst_damage`) reads — deliberately
 * narrower than the full Active/Effect schema (any kind-specific field is
 * irrelevant here), so this one function serves both Active1/Active2 without
 * a cast at either call site.
 */
interface BurstEffect {
  // Not read inside `fireEffect` itself — the caller's switch already
  // narrowed on it before calling in here, so this is intentionally the
  // wide union rather than the `'burst_damage'`-only literal both call sites
  // are actually in when they call this (`ClassEffectSchema`'s inferred type
  // isn't a discriminated union — one flat object shape covers every kind —
  // so passing `cls.active1`/`cls.active2` through a `'burst_damage'`-only
  // field would need a cast at every call site for no runtime benefit).
  kind: ClassEffect['kind'];
  cooldownSeconds: number;
  radius: number;
  damage: number;
  slow?: number;
  slowDuration?: number;
  burnDps?: number;
  burnDuration?: number;
}

/**
 * Thousand Cuts (§4.1, p6b): "each attack ... applies 1 Bleeding" — a
 * non-stat-shaped passive, dispatched by `passive.kind` the same way
 * `active1`/`active2` dispatch by their own `kind` (Q118). Threading this
 * through `HitEffects.onHit` means every existing multi-target hit shape
 * (`applyAoE`/`lineHit`/a direct `damageEnemy`+`applyEffects` pair) applies
 * it exactly once per enemy struck per attack event, whether that event's
 * damage came from one source or — Dash Slash merged with a Circle Slash
 * charge — two summed into one.
 *
 * §4.2 Cryomancer's "attacks apply frost" (p6d) rides the same hook, adding
 * the bookkeeping rider `frost_track` that counts hits-while-frosted toward
 * the freeze (`applyOnHit`, enemies.ts).
 */
const NO_ON_HIT: readonly string[] = [];
const BLEEDING_ON_HIT: readonly string[] = ['bleeding'];
const FROST_ON_HIT: readonly string[] = ['frost', 'frost_track'];

/**
 * p7a (§6.3): Swordsman's "Deeper Cuts" skill card ("Thousand Cuts applies 2
 * Bleeding") reads as extra stacks per hit — `applyEffects` (combat.ts)
 * already calls `applyOnHit` once per element of `onHit`, so repeating
 * `'bleeding'` N+1 times applies it N+1 times with no change to that shared
 * pipeline.
 */
function passiveOnHit(w: World, cls: ClassDef): readonly string[] {
  if (cls.passive.kind === 'thousand_cuts') {
    const extra = Math.round(classLineBonus(w));
    return extra > 0 ? Array(1 + extra).fill('bleeding') : BLEEDING_ON_HIT;
  }
  if (cls.passive.kind === 'frost_touch') return FROST_ON_HIT;
  return NO_ON_HIT;
}

/**
 * The Power multiplier a *character* attack of this class lands with —
 * `powerMul` for everyone but the Bloodlord, whose Blood Frenzy passive
 * (§4.2: "+10% attack in VS waves, −5% in TD waves") is phase-dependent and
 * so cannot fold into `Stats` the way an always-on `power` contribution
 * would. Read live at damage-calc time rather than cached, since `huntsWarden`
 * flips mid-run.
 *
 * Deliberately not applied to tower or wielded-tower damage: §4.2 says
 * "attack", and every other clause in that table that means towers says
 * "towers".
 */
export function classAttackPowerMul(w: World, cls: ClassDef): number {
  const p = cls.passive;
  if (p.kind !== 'blood_frenzy') return w.derived.powerMul;
  return w.derived.powerMul * (1 + (w.huntsWarden ? p.frenzyVsMul ?? 0 : p.frenzyTdMul ?? 0));
}

/**
 * fb015 (§7): every site below already scales a character hit by
 * `classAttackPowerMul` — equipment's flat "Atk" column rides along at every
 * one of them, the same footprint the %-power stat already has, added before
 * the multiplier per §2 ("flats add[, then sources multiply]").
 */
export function characterDamage(w: World, cls: ClassDef, base: number): number {
  return (base + w.derived.atkFlat) * classAttackPowerMul(w, cls);
}

/**
 * c001 (SPEC-FINAL §2, Area row: "Effect radius from center; **applies to
 * every attack, active, and effect**"): the class-side counterpart of
 * `effectiveTowerAoe` (towers.ts) and the `radius * w.derived.areaMul` lines
 * in `damagetypes.ts`/`enemies.ts`/`vswield.ts`. This file previously never
 * read `areaMul` at all, so every kit radius landed exactly as authored and
 * Normal Bracelet's +10%, the Animist's own Wide Grove and every `area`
 * tree/boon source were dead for all 24 Actives.
 *
 * What counts as an "effect radius from center", and so goes through here:
 * a nova/cloud/zone/aura radius, a line attack's *perpendicular half-width*,
 * and a basic attack's splash. What deliberately does not:
 *   - **travel distances** — a dash's own length is movement, not a
 *     footprint (and Swordsman Shoes already scales exactly that, separately);
 *   - **line lengths** — Deadeye Draw's reach is Range, §2's own other stat,
 *     which `charRange` scales;
 *   - **target-search / cast-reach radii** — Chain Surge's jump distance,
 *     Field Kit's/Blood Tithe's "nearest structure" search, Raise Skeletons'
 *     corpse sweep. Widening a search is not widening an effect, and §2 gives
 *     Range its own stat for it;
 *
 * A summon's own attack `aoe` *is* scaled, but at spawn only — frozen into
 * the `ClassSummon` beside its dps/range, so a later Area change does not
 * resize a spirit already standing. Code review on c001 found the first draft
 * of this comment claiming the opposite and the code split two ways: the two
 * tower-cloned summons (Pop Turret, Manifest Spirit) already inherited Area
 * through `towerSummonProfile`'s `effectiveTowerAoe`, while the one
 * character-cloned summon (the Necromancer's skeleton, which copies
 * `cls.basicAttack.aoe`) did not — an asymmetry masked only by that class
 * authoring `aoe: 0`. The skeleton now goes through `classArea` too, so all
 * three agree and the rule is one sentence instead of three cases.
 *
 * The one place Area does buy *reach*: `fireDashSlash`'s
 * `hitRange = dashRange + mergedRadius`. G9 reads a mid-charge merge as the
 * nova's would-be radius widening the dash's hit line, so the scaled nova
 * radius legitimately extends it — the dash's own travel distance stays
 * unscaled. Pinned by `tests/class-area-stat.test.ts` rather than left to
 * whoever reads this next.
 *
 * Every call site scales the *emitted* radius too, not just the one it
 * damages with, so the renderer's cast flash matches what actually landed.
 * Three renderer/UI paths still read the authored `/data` radius directly and
 * so now preview a stale footprint — all in `src/render`/`src/ui`, outside
 * this lane's Scope, and logged in BACKLOG-CONTENT.md for the UI lane.
 */
function classArea(w: World, radius: number): number {
  return radius * w.derived.areaMul;
}

/**
 * p7a (§6.3) skill card "Active2 cooldown -25%/rank": stacks with the
 * general `cdr` stat as one combined subtractive fraction, floored the same
 * way `cdr` alone already implicitly is (a `cooldownSeconds * (1 - x)` factor
 * cannot legally go negative without an active2Cooldown that counts up).
 */
export function active2CdrFactor(w: World): number {
  return Math.max(0.05, 1 - w.derived.cdr - active2CdrBonus(w));
}

/**
 * §4.2 Paladin *Guardian Stance*: "+30 defense after standing still 1 s".
 * Armour points, in the same units `wardenArmor` (run.ts) already works in —
 * not a `Stats` contribution, because it toggles several times a second and
 * `Stats`/`derive` are a per-change recompute, not a per-tick one.
 */
export function classArmorBonus(w: World): number {
  const cls = w.content.classByKey.get(w.cfg.classKey);
  if (!cls || cls.passive.kind !== 'guardian_stance') return 0;
  return w.warden.standStillTimer >= (cls.passive.stanceSeconds ?? 1) ? cls.passive.stanceArmor ?? 0 : 0;
}

/**
 * §4.2 Animist *Recall Totem*: "character & summons near it +15% atk spd."
 * Returns the attack-speed multiplier at a point, 1 where no totem reaches.
 * Applied to the character's own basic attack and to every summon's cadence;
 * Active1/Active2 cooldowns are deliberately left alone (Q120).
 */
export function auraSpeedMul(w: World, x: number, y: number): number {
  let mul = 1;
  for (const s of w.classSummons) {
    if (!s.isAura || s.remaining <= 0) continue;
    const r = s.auraRadius ?? 0;
    if (r > 0 && dist2(x, y, s.x, s.y) <= r * r) mul *= 1 + (s.auraAtkSpdMul ?? 0);
  }
  return mul;
}

/**
 * `potencyMul`/`extraBurnDuration` are only ever passed from the Active1
 * dispatch (Pyro's Immolation Wave is the only `burst_damage` kind any
 * current class authors): p7a's "Active1 potency"/class-line skill cards
 * are per-class, current-class-only lookups (`active1PotencyMul`,
 * `classLineBonus`), and this `kind` is shared with the (today unused)
 * Active2 switch case, which must not read a class's Active1 cards.
 */
function fireEffect(
  w: World,
  x: number,
  y: number,
  eff: BurstEffect,
  onHit: readonly string[] = [],
  potencyMul = 1,
  extraBurnDuration = 0,
): void {
  const radius = classArea(w, eff.radius);
  const list = w.enemiesInRadius(x, y, radius);
  for (const e of list) {
    if (e.dead) continue;
    damageEnemy(w, e, eff.damage * w.derived.powerMul * potencyMul, 'class_active', { fromX: x, fromY: y });
    if (e.dead) continue;
    applyEffects(w, e, {
      source: 'class_active',
      slow: eff.slow,
      slowDuration: eff.slowDuration,
      burnDps: eff.burnDps,
      burnDuration: eff.burnDuration ? eff.burnDuration + extraBurnDuration : eff.burnDuration,
      onHit,
    });
  }
  w.emit('class_active', x, y, radius, 0);
}

/**
 * Instant reposition away from `(fromX, fromY)`, clamped to a walkable tile
 * the same way `wardenmove.ts`'s `resolveDashTarget` clamps the Warden's own dash.
 * SPEC-FINAL names no velocity/impulse mechanism anywhere in the sim, so
 * Circle Slash's "knockback" (§4.1) is read as this instant shove, not a
 * physics body (Q118) — a defensible reading since nothing downstream of an
 * enemy's `x`/`y` distinguishes how it got there.
 */
function knockbackEnemy(w: World, e: Enemy, fromX: number, fromY: number, distance: number): void {
  if (distance <= 0) return;
  const n = normalize(e.x - fromX, e.y - fromY);
  if (n.x === 0 && n.y === 0) return;
  for (let s = distance; s > 0.05; s -= distance / 4) {
    const tx = clamp(e.x + n.x * s, 0.4, GRID_W - 0.4);
    const ty = clamp(e.y + n.y * s, 0.4, GRID_H - 0.4);
    if (w.grid.passable(Math.floor(tx), Math.floor(ty))) {
      e.x = tx;
      e.y = ty;
      return;
    }
  }
}

/**
 * §4.1 Circle Slash: nova radius/damage/knockback scale from their `min*`
 * floor (0 charge) up to the full `radius`/`damage`/`knockback` value at
 * `chargeCapSeconds` (default 3, per "cap = 3 s-equivalent"). Exported for
 * fb016: `canvas.ts`'s charge indicator reads the live radius the same way
 * `fireCircleSlash` does, rather than re-deriving the lerp — the same
 * render-imports-a-pure-sim-helper precedent `effectiveTowerRange` already
 * set for the tower range rings.
 */
export function circleSlashValues(
  eff: ClassEffect,
  chargeSeconds: number,
): { radius: number; damage: number; knockback: number } {
  const cap = eff.chargeCapSeconds ?? 3;
  const fraction = cap > 0 ? clamp(chargeSeconds / cap, 0, 1) : 1;
  return {
    radius: lerp(eff.minRadius ?? 0, eff.radius, fraction),
    damage: lerp(eff.minDamage ?? 0, eff.damage, fraction),
    knockback: lerp(0, eff.knockback ?? 0, fraction),
  };
}

/**
 * Fires a (possibly zero-charge) Circle Slash: a self-centered nova, scaled by
 * how long it was held.
 *
 * fb015/fb052 (§7) Swordsman Armor's cross-item clause: "if Sleeve Sword is
 * also equipped, Circle Slash damage is boosted by attack speed instead" — of
 * the charge-speed bonus it otherwise gives (`circleSlashChargeRate` below),
 * since Sleeve Sword's charge is already instant-max (charge *rate* is moot).
 * `atkSpdDamageBoost` is that "instead": an extra `attackSpeedMul` factor on
 * top of the ordinary power/flat-Atk scaling every other Active already gets.
 */
function fireCircleSlash(w: World, cls: ClassDef, chargeSeconds: number, atkSpdDamageBoost = false): void {
  const wd = w.warden;
  const eff = cls.active1;
  const { radius: authoredRadius, damage, knockback } = circleSlashValues(eff, chargeSeconds);
  const radius = classArea(w, authoredRadius);
  const onHit = passiveOnHit(w, cls);
  const hitList = knockback > 0 ? w.enemiesInRadius(wd.x, wd.y, radius).slice() : null;
  const boost = atkSpdDamageBoost ? w.derived.attackSpeedMul : 1;
  applyAoE(
    w,
    wd.x,
    wd.y,
    radius,
    characterDamage(w, cls, damage) * boost * active1PotencyMul(w),
    'class_active',
    { onHit },
    {},
  );
  if (hitList) for (const e of hitList) if (!e.dead) knockbackEnemy(w, e, wd.x, wd.y, knockback);
  w.emit('class_active', wd.x, wd.y, radius, 0);
}

/**
 * fb015 (§7) Swordsman Armor: "Circle Slash charging speed = original x
 * attack speed" — the hold accumulates by `dt * attackSpeedMul` instead of a
 * flat `dt`. Inert without the item; also a no-op once Sleeve Sword is also
 * equipped, since the charge already starts clamped at the cap — see
 * `fireCircleSlash`'s cross-item damage boost for what replaces it then.
 */
function circleSlashChargeRate(w: World, cls: ClassDef): number {
  if (cls.active1.kind !== 'charge_nova') return 1;
  if (!hasEquipment(w, 'swordsman_armor') || hasEquipment(w, 'sleeve_sword')) return 1;
  return w.derived.attackSpeedMul;
}

/**
 * Which way a mouse-aimed Active points: at the aim point when one was sent,
 * and along the Warden's current facing when it was not (or when the aim
 * lands exactly on the Warden, which normalizes to nothing).
 */
function aimDirection(w: World, aimX: number | undefined, aimY: number | undefined): { x: number; y: number } {
  const wd = w.warden;
  const raw = normalize((aimX ?? wd.x + wd.fx) - wd.x, (aimY ?? wd.y + wd.fy) - wd.y);
  return raw.x !== 0 || raw.y !== 0 ? raw : { x: wd.fx, y: wd.fy };
}

/**
 * §4.1 Dash Slash: dashes the Warden `eff.dashRange` toward the aim point
 * (or its current facing if unaimed), slashing every enemy on the line.
 *
 * "usable during Circle Slash charging — the hit range expands by the
 * current charge radius and the damages sum into one attack" (G9): if a
 * `charge_nova`-kind Active1 is mid-charge, that charge is consumed here —
 * its would-be radius widens the *hit* line (not the physical dash
 * distance, which is Dash Slash's own; Q118 reads "hit range" as the
 * detection reach, not the character's travel) and its damage is summed
 * into the one `lineHit` call, so `passiveOnHit`'s Thousand Cuts fires
 * exactly once per enemy struck, not once per merged source. The charge's
 * own knockback does not carry over — §4.1 names only range and damage as
 * transferring — and Active1 goes on cooldown exactly as it would from a
 * normal release: the flat `cooldownSeconds * (1 - cdr)` every release pays
 * regardless of how much charge it actually spent (code review on p6b:
 * an earlier draft of this comment claimed the cooldown itself scaled by
 * charge fraction too — it never has, in either this path or the plain
 * release path in `tickClassCharge`; corrected here and in Q118(4)).
 */
function fireDashSlash(w: World, cls: ClassDef, aimX: number | undefined, aimY: number | undefined): void {
  const wd = w.warden;
  const eff = cls.active2;
  const onHit = passiveOnHit(w, cls);

  let mergedRadius = 0;
  let mergedDamage = 0;
  if (cls.active1.kind === 'charge_nova' && wd.active1Charging) {
    const v = circleSlashValues(cls.active1, wd.active1Charge);
    mergedRadius = classArea(w, v.radius);
    // p7a (§6.3): the merged charge is still Circle Slash's own damage, so
    // it earns "Active1 potency" exactly like a normal release does
    // (`fireCircleSlash`) — code review found this path skipping it.
    // fb052 (§7): the Swordsman Armor + Sleeve Sword cross-item damage boost
    // applies here too, for the same reason — this merge still fires Circle
    // Slash's own charge, just folded into Dash Slash's hit instead of a
    // solo release (code review found this path skipping it too, once fb052
    // made the merge reachable again with Sleeve Sword equipped).
    const boost = hasEquipment(w, 'swordsman_armor') && hasEquipment(w, 'sleeve_sword') ? w.derived.attackSpeedMul : 1;
    mergedDamage = v.damage * active1PotencyMul(w) * boost;
    wd.active1Charging = false;
    wd.active1Charge = 0;
    wd.active1Cooldown = cls.active1.cooldownSeconds * (1 - w.derived.cdr);
  }

  const dir = aimDirection(w, aimX, aimY);
  // fb015 (§7): Swordsman Shoes "double Dash Slash distance". This function is
  // only ever reached for `dash_line` (the switch in `useClassActive2`), which
  // no class but Swordsman's authors, so no separate class check is needed —
  // the item is inert on every other kit for the structural reason it names
  // ("if not Swordsman") rather than a hardcoded one.
  const dashRange = (eff.dashRange ?? 0) * (hasEquipment(w, 'swordsman_shoes') ? 2 : 1);
  const hitRange = dashRange + mergedRadius;
  const damage = characterDamage(w, cls, eff.damage + mergedDamage);
  lineHit(w, wd.x, wd.y, dir.x, dir.y, hitRange, classArea(w, eff.dashWidth ?? 0), damage, 'class_active2', 9999, {
    onHit,
  });

  const before = { x: wd.x, y: wd.y };
  const target = resolveDashTarget(w, dir.x * dashRange, dir.y * dashRange);
  startDashTravel(w, target, BASE.dashDuration);
  w.emit('class_active2', before.x, before.y, target.x, target.y);
}

/**
 * §4.1 Poison Barrel (p6c, Q119): "a circle of poison on the ground for 5 s,
 * applying poison damage every second." Reuses the same `GroundArea('poison')`
 * mechanism `vsspecials.ts`'s Venom Spore poison trail and `combat.ts`'s
 * Mortar burning patch already spawn (`w.areas`, ticked by `updateAreas`) —
 * self-centered on the Warden the same way Circle Slash is, since §4.1 gives
 * Poison Barrel no aim direction the way Dash Slash's "mouse direction" does.
 */
function firePoisonBarrel(w: World, cls: ClassDef): void {
  const wd = w.warden;
  const eff = cls.active1;
  const radius = classArea(w, eff.radius);
  w.areas.push({
    id: w.newId(),
    x: wd.x,
    y: wd.y,
    radius,
    dps: characterDamage(w, cls, eff.damage) * active1PotencyMul(w),
    remaining: eff.groundDurationSeconds ?? 5,
    type: 'poison',
    source: 'class_active',
    acc: 0,
    dead: false,
  });
  w.emit('class_active', wd.x, wd.y, radius, 0);
}

/**
 * §4.1 Poison Boost (p6c, Q119): "double the remaining poison damage on all
 * enemies" — a global, targetless effect, unlike every other Active this
 * framework has fired so far. Doubling each live poison stack's `dps` in
 * place (rather than its `remaining` time) doubles the total damage still
 * owed while leaving its timing alone, which is the plain reading of
 * "remaining ... damage" as an amount, not a duration.
 */
function firePoisonBoost(w: World): void {
  for (const e of w.enemies) {
    if (e.dead) continue;
    for (const d of e.dots) {
      if (d.type === 'poison') d.dps *= 2;
    }
  }
  w.emit('class_active2', w.warden.x, w.warden.y, 0, 0);
}

/* ------------------------------------------------------------ p6d: §4.2 kits */

/** Nearest live, un-petrified structure to a point, ties broken by id. */
function nearestStructure(
  w: World,
  x: number,
  y: number,
  radius: number,
  filter?: (s: Structure) => boolean,
): Structure | null {
  let best: Structure | null = null;
  let bestD = radius * radius;
  for (const s of w.structures) {
    if (s.dead || s.petrified) continue;
    if (filter && !filter(s)) continue;
    const d = dist2(x, y, s.tx + 0.5, s.ty + 0.5);
    if (d < bestD || (d === bestD && best !== null && s.id < best.id)) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/**
 * What a summon copied from a tower fires with, before the ability's own
 * `summonStatMul` share is taken. Reads the same `attack`/`upgradeStatMul`
 * pair `fireTower` does rather than re-deriving a second formula, so a
 * manifested spirit cannot drift from the tower it was cloned from.
 */
function towerSummonProfile(
  w: World,
  def: TowerDef,
  level: number,
): { dps: number; range: number; interval: number; aoe: number } {
  const a = def.attack!;
  return {
    dps: (a.damage * upgradeStatMul(w, def, level)) / a.interval,
    range: a.range * w.derived.towerRangeMul,
    interval: a.interval,
    aoe: effectiveTowerAoe(w, def),
  };
}

/**
 * Adds a summon, evicting the oldest of its own `kind` when the ability's cap
 * is already met. `cap <= 0` means uncapped — Bone Pylons are a consequence of
 * a pact tower dying rather than something the player casts, so they have no
 * cast rate to cap in the first place.
 */
function spawnClassSummon(
  w: World,
  kind: string,
  cap: number,
  x: number,
  y: number,
  dps: number,
  range: number,
  interval: number,
  aoe: number,
  duration: number,
): void {
  if (cap > 0) {
    let live = 0;
    let oldest: ClassSummon | null = null;
    for (const s of w.classSummons) {
      if (s.kind !== kind) continue;
      live++;
      if (!oldest || s.id < oldest.id) oldest = s;
    }
    if (live >= cap && oldest) w.classSummons.splice(w.classSummons.indexOf(oldest), 1);
  }
  w.classSummons.push({
    id: w.newId(),
    x,
    y,
    dps,
    range,
    interval,
    aoe,
    attackCooldown: 0,
    remaining: duration,
    kind,
  });
}

/**
 * §4.2 Archer *Deadeye Draw*: "hold to charge, +40%/s compounding, release a
 * piercing shot", with *Long Draw*'s "+1 pierce per full second charged".
 *
 * Long Draw's other clause — "Deadeye damage has no cap" — is satisfied by
 * this function never clamping `damage`: what is bounded is how long the shot
 * can be *held* (`chargeCapSeconds`), which is what makes gate G10's
 * dps-optimal charge finite in the first place. `pierceCap` is a perf rail on
 * how many bodies one `lineHit` may sweep, not a damage ceiling — and since
 * c017 it rails the *charge-derived* count only: the §6.3 card adds on top, so
 * the true ceiling on bodies swept is `pierceCap + perRank * maxRank`, 10 on
 * shipped `/data` rather than 6. (`content.ts`'s `pierceCap` schema comment
 * still says 6's worth and is owed the same correction — out of the content
 * lane's Scope, logged in BACKLOG-CONTENT.md.)
 */
function fireDeadeyeDraw(
  w: World,
  cls: ClassDef,
  chargeSeconds: number,
  aimX: number | undefined,
  aimY: number | undefined,
): void {
  const wd = w.warden;
  const eff = cls.active1;
  const held = Math.min(chargeSeconds, eff.chargeCapSeconds ?? 0);
  const damage =
    characterDamage(w, cls, eff.damage * Math.pow(1 + (eff.compoundPerSecond ?? 0), held)) * active1PotencyMul(w);
  // p7a (§6.3) Archer skill card "Deeper Draw": pierce cap +2/rank.
  //
  // c017: the card's bonus is added to the *resolved* count rather than folded
  // into the `pierceCap` side of the `min`. Written the other way it was inert
  // on shipped `/data` — `pierceCap 6` sits at exactly `1 + chargeCapSeconds`,
  // so *Long Draw*'s charge-derived term was the binding one at every hold
  // length and rank 0, 1 and 2 all pierced six. `min(a, c) + b` is identically
  // `min(a + b, c + b)`, so the card still reads as "pierce cap +2" — it raises
  // the cap *and* the charge-derived term, which is the only way to raise a cap
  // that something else already holds you below. §2 authorises the additive
  // shape outright ("base-less stats (armor points, +1 pierce, charges) add"),
  // it moves nothing at rank 0, and `pierceCap` stays a real rail rather than
  // being deleted.
  const hits = Math.min(eff.pierceCap ?? 1, 1 + Math.floor(held)) + classLineBonus(w);
  const dir = aimDirection(w, aimX, aimY);
  // `radius` is this kind's shot length — the same field-reuse precedent
  // `dash_line`'s own unused `radius: 0` set (Q118's Nit).
  lineHit(w, wd.x, wd.y, dir.x, dir.y, eff.radius, classArea(w, LINE_HALF_WIDTH), damage, 'class_active', hits, {
    onHit: passiveOnHit(w, cls),
  });
  w.emit('class_active', wd.x, wd.y, wd.x + dir.x * eff.radius, wd.y + dir.y * eff.radius);
}

/**
 * §4.2 Archer *Quickstep*: "short dash toward mouse firing 3 arrows at nearest
 * enemies; usable while drawing without losing charge." The charge is left
 * untouched on purpose — unlike Dash Slash (§4.1), which explicitly consumes
 * and merges one.
 */
function fireQuickstep(w: World, cls: ClassDef, aimX: number | undefined, aimY: number | undefined): void {
  const wd = w.warden;
  const eff = cls.active2;
  const dir = aimDirection(w, aimX, aimY);
  const from = { x: wd.x, y: wd.y };
  const target = resolveDashTarget(w, dir.x * (eff.dashRange ?? 0), dir.y * (eff.dashRange ?? 0));
  startDashTravel(w, target, BASE.dashDuration);

  const onHit = passiveOnHit(w, cls);
  const shots = Math.max(0, Math.round(eff.volleyShots ?? 0));
  const struck = new Set<number>();
  const damage = characterDamage(w, cls, eff.damage);
  for (let i = 0; i < shots; i++) {
    const t = w.nearestEnemy(target.x, target.y, eff.radius, (e) => !struck.has(e.id));
    if (!t) break;
    struck.add(t.id);
    damageEnemy(w, t, damage, 'class_active2', { fromX: target.x, fromY: target.y });
    if (!t.dead) applyEffects(w, t, { onHit });
  }
  w.emit('class_active2', from.x, from.y, target.x, target.y);
}

/** §4.2 Engineer *Field Kit*: "repair target structure 40% max HP + overclock +50% atk spd 6 s". */
function fireFieldKit(w: World, cls: ClassDef, aimX: number | undefined, aimY: number | undefined): void {
  const wd = w.warden;
  const eff = cls.active1;
  const s = nearestStructure(w, aimX ?? wd.x, aimY ?? wd.y, eff.radius);
  if (!s) return;
  // p7a (§6.3) skill card "Active1 potency +25%": read as "heals more" for
  // a repair-shaped Active1, the same reading Field Kit's `repairFraction`
  // already gives it as this class's one non-damage primary magnitude.
  s.hp = Math.min(s.maxHp, s.hp + s.maxHp * (eff.repairFraction ?? 0) * active1PotencyMul(w));
  s.atkSpdBuffRemaining = Math.max(s.atkSpdBuffRemaining, eff.overclockSeconds ?? 0);
  w.emit('class_active', s.tx + 0.5, s.ty + 0.5, 0, 0);
}

/** §4.2 Engineer *Pop Turret*: "deploy a mini arrow turret (30% stats) 10 s, cap 2". */
function fireSummonTurret(w: World, cls: ClassDef): void {
  const wd = w.warden;
  const eff = cls.active2;
  const def = eff.towerKey ? w.content.towerByKey.get(eff.towerKey) : undefined;
  if (!def || !def.attack) return;
  const p = towerSummonProfile(w, def, 1);
  const share = eff.summonStatMul ?? 0;
  spawnClassSummon(
    w,
    'engineer_turret',
    // p7a (§6.3) skill card "Extra Turret": summon cap +1/rank.
    (eff.summonCap ?? 0) + classLineBonus(w),
    wd.x,
    wd.y,
    p.dps * share,
    p.range,
    p.interval,
    p.aoe,
    eff.summonDurationSeconds ?? 0,
  );
  w.emit('class_active2', wd.x, wd.y, 0, 0);
}

/**
 * §4.2 Pyro *Flame Road*: "dash leaving a burning trail 3 s." No damage of its
 * own — the trail is `trailSegments` ordinary `GroundArea('burn')` patches
 * spaced along the line actually travelled, so a dash cut short by terrain
 * lays its fire only as far as the Warden got.
 */
function fireFlameRoad(w: World, cls: ClassDef, aimX: number | undefined, aimY: number | undefined): void {
  const wd = w.warden;
  const eff = cls.active2;
  const dir = aimDirection(w, aimX, aimY);
  const from = { x: wd.x, y: wd.y };
  const target = resolveDashTarget(w, dir.x * (eff.dashRange ?? 0), dir.y * (eff.dashRange ?? 0));
  startDashTravel(w, target, BASE.dashDuration);

  const segments = Math.max(1, Math.round(eff.trailSegments ?? 1));
  const dps = characterDamage(w, cls, eff.damage);
  for (let i = 0; i < segments; i++) {
    const t = segments === 1 ? 0 : i / (segments - 1);
    w.areas.push({
      id: w.newId(),
      x: lerp(from.x, target.x, t),
      y: lerp(from.y, target.y, t),
      radius: classArea(w, eff.dashWidth ?? 1),
      dps,
      remaining: eff.groundDurationSeconds ?? 3,
      type: 'burn',
      source: 'class_active2',
      acc: 0,
      dead: false,
    });
  }
  w.emit('class_active2', from.x, from.y, target.x, target.y);
}

/** §4.2 Cryomancer *Glaciate*: "r4 nova applying frost; already-frosted enemies freeze". */
function fireFrostNova(w: World, cls: ClassDef): void {
  const wd = w.warden;
  const eff = cls.active1;
  const damage = characterDamage(w, cls, eff.damage) * active1PotencyMul(w);
  const radius = classArea(w, eff.radius);
  for (const e of w.enemiesInRadius(wd.x, wd.y, radius).slice()) {
    if (e.dead) continue;
    // Read before the hit: the shatter this nova can trigger keys off `frozen`,
    // and freezing first would make Glaciate shatter its own targets.
    const alreadyFrosted = e.frostRemaining > 0;
    damageEnemy(w, e, damage, 'class_active', { fromX: wd.x, fromY: wd.y });
    if (e.dead) continue;
    if (alreadyFrosted) applyFrozen(w, e);
    else applyFrost(w, e);
  }
  w.emit('class_active', wd.x, wd.y, radius, 0);
}

/**
 * §4.2 Cryomancer *Ice Wall*: "temporary 1×3 wall at mouse, 5 s (blocks paths;
 * enemies attack it)."
 *
 * Built out of the authored wall tower rather than a second obstacle system,
 * so it blocks, prices its tile for §10's breach field and takes damage with
 * no new rules at all — but free: its price is pre-funded and refunded around
 * `buildTower`, `spent` is zeroed so it cannot be sold for gold it never cost,
 * and the built/by-key counters are undone so a cast does not read as a
 * player-built tower in the run report. `updateTempWalls` removes whatever is
 * still standing when the timer expires.
 *
 * `buildTower` still keeps its own occupancy/range/gold legality rules, but is
 * called with `{ ignorePhase: true }` so a cast during a VS wave places real,
 * blocking tiles too (Q120 ORDER 2 — the owner verdict on Q120(5)'s deferred
 * "castable during VS waves" half; every player-facing Build path still
 * leaves `ignorePhase` unset, so ordinary construction stays Act-I-only).
 * Out of build range or every target tile already occupied still places
 * nothing. The Active still pays its cooldown either way, on Poison Boost's
 * precedent that a dispatched Active always does (Q120). A successful VS
 * cast also forces the Warden-chase field (`updateNav`) to recompute right
 * away — it otherwise only refreshes when the Warden crosses into a new
 * tile, and code review on this item found a stand-still cast (the
 * chokepoint-blocking case Ice Wall exists for) would leave enemies routing
 * through the now-occupied tile by a stale field until then, even though the
 * tile itself was already physically blocking on contact.
 */
function fireIceWall(w: World, cls: ClassDef, aimX: number | undefined, aimY: number | undefined): void {
  const wd = w.warden;
  const eff = cls.active2;
  const def = eff.towerKey ? w.content.towerByKey.get(eff.towerKey) : undefined;
  if (!def) return;
  const dir = aimDirection(w, aimX, aimY);
  const cx = aimX ?? wd.x + dir.x * (eff.radius || 1);
  const cy = aimY ?? wd.y + dir.y * (eff.radius || 1);
  // A wall stands across the way the caster is looking: aiming mostly
  // sideways gives a vertical 1x3, aiming mostly up/down a horizontal one.
  const vertical = Math.abs(dir.x) > Math.abs(dir.y);
  const ids: number[] = [];
  for (let i = -1; i <= 1; i++) {
    const tx = Math.floor(cx) + (vertical ? 0 : i);
    const ty = Math.floor(cy) + (vertical ? i : 0);
    const cost = towerCost(w, def);
    w.gold += cost;
    const res = buildTower(w, def.id, tx, ty, { ignorePhase: true });
    if (!res.ok) {
      w.gold -= cost;
      continue;
    }
    w.goldSpent -= cost;
    res.structure.spent = 0;
    w.towersBuilt--;
    w.towersByKey[def.key] = Math.max(0, (w.towersByKey[def.key] ?? 1) - 1);
    ids.push(res.structure.id);
  }
  if (ids.length > 0) {
    w.tempWalls.push({ structureIds: ids, remaining: eff.wallSeconds ?? 0 });
    // `updateNav`'s Warden-chase field only recomputes on a Warden tile
    // change (`sundering.ts` sets the same precedent for a sudden occupancy
    // change with no Warden movement) — a wall cast while standing still
    // would otherwise leave VS enemies routing through the now-blocked tile
    // by a stale field until the Warden happens to step to a new one. Costs
    // one Dijkstra pass, gated by the Active's own cooldown, not a hot loop.
    if (w.huntsWarden) w.updateNav(true);
    // fb016: the only Active2 kind that fired with no `w.emit` at all —
    // every other kind already had one, just no renderer case reading it.
    w.emit('class_active2', cx, cy, 0, 0);
  }
}

/**
 * §4.2 Stormcaller *Chain Surge* ("chain bolt, 6 jumps") under *Conduction*
 * ("electric damage +20% per jump, compounding, cap 8 jumps") and *Overload*
 * ("electric effects jump +2").
 *
 * Written here rather than through `combat.ts`'s `chainHit` because the
 * damage grows per jump — every other chain in the sim carries one flat
 * number down the line, so folding a growth curve into the shared helper
 * would put a parameter on it that only this one caller ever uses. The cap is
 * on the *exponent*, per §4.2 ("cap 8 jumps" bounding the compounding), which
 * is exactly what gate G11's ×3.6 ceiling measures.
 */
function fireChainSurge(w: World, cls: ClassDef, aimX: number | undefined, aimY: number | undefined): void {
  const wd = w.warden;
  const eff = cls.active1;
  let cur =
    w.nearestEnemy(aimX ?? wd.x, aimY ?? wd.y, eff.radius) ?? w.nearestEnemy(wd.x, wd.y, eff.radius);
  if (!cur) return;

  const extra = wd.overloadRemaining > 0 ? cls.active2.overloadExtraChains ?? 0 : 0;
  // p7a (§6.3) skill card "Longer Arc": jump cap +2/rank — the cast's own
  // chain count, not Conduction's separate compounding cap (`chainCap`,
  // gate G11's ceiling), which this leaves untouched.
  const jumps = Math.max(1, Math.round((eff.chainCount ?? 1) + extra + classLineBonus(w)));
  const capIndex = Math.max(1, Math.round(eff.chainCap ?? 1)) - 1;
  const growth = eff.chainGrowth ?? 0;
  const base = characterDamage(w, cls, eff.damage) * active1PotencyMul(w);
  const struck = new Set<number>();
  let px = wd.x;
  let py = wd.y;
  for (let i = 0; i < jumps && cur; i++) {
    struck.add(cur.id);
    const damage = base * Math.pow(1 + growth, Math.min(i, capIndex));
    applyDamageType(w, cur, 'electric', damage, 'class_active', { fromX: px, fromY: py });
    w.emit('arc', px, py, cur.x, cur.y);
    px = cur.x;
    py = cur.y;
    cur = w.nearestEnemy(px, py, eff.radius, (e) => !struck.has(e.id));
  }
}

/** §4.2 Stormcaller *Overload*: "5 s — electric effects jump +2; electric-tower wires pulse at double rate". */
function fireOverload(w: World, cls: ClassDef): void {
  const wd = w.warden;
  wd.overloadRemaining = cls.active2.overloadSeconds ?? 0;
  w.emit('class_active2', wd.x, wd.y, 0, 0);
}

/** §4.2 Necromancer *Raise*: "skeletons from corpses (cap 8, 15 s, 40% of char attack)". */
function fireRaiseSkeletons(w: World, cls: ClassDef): void {
  const wd = w.warden;
  const eff = cls.active1;
  // p7a (§6.3) skill card "Deeper Grave": skeleton cap +1/rank.
  const cap = Math.max(0, Math.round((eff.summonCap ?? 0) + classLineBonus(w)));
  let live = 0;
  for (const s of w.classSummons) if (s.kind === 'necro_skeleton') live++;
  let room = cap - live;
  if (room <= 0) return;

  const r = eff.summonRadius ?? 0;
  const inReach = w.corpses.filter((c) => dist2(c.x, c.y, wd.x, wd.y) <= r * r);
  inReach.sort((a, b) => dist2(a.x, a.y, wd.x, wd.y) - dist2(b.x, b.y, wd.x, wd.y) || a.id - b.id);
  // p7a: skill card "Active1 potency +25%" — each skeleton's damage share.
  const share = (eff.summonStatMul ?? 0) * active1PotencyMul(w);
  const a = cls.basicAttack;
  for (const c of inReach) {
    if (room <= 0) break;
    room--;
    const at = w.corpses.indexOf(c);
    if (at >= 0) w.corpses.splice(at, 1);
    spawnClassSummon(
      w,
      'necro_skeleton',
      cap,
      c.x,
      c.y,
      a.dps * share,
      a.range,
      a.interval,
      // c001: the other two summon kinds inherit Area at spawn through
      // `towerSummonProfile`'s `effectiveTowerAoe`; this one clones the
      // character's own basic attack, whose splash `classBasicAttack` scales,
      // so it scales here for the same reason and at the same moment.
      classArea(w, a.aoe),
      eff.summonDurationSeconds ?? 0,
    );
  }
  w.emit('class_active', wd.x, wd.y, r, 0);
}

/** §4.2 Necromancer *Death Pact*: a per-tower toggle; the drain and the Bone Pylon live in `updateClassPassives`. */
function fireDeathPact(w: World, cls: ClassDef, aimX: number | undefined, aimY: number | undefined): void {
  const wd = w.warden;
  const eff = cls.active2;
  const s = nearestStructure(w, aimX ?? wd.x, aimY ?? wd.y, eff.radius);
  if (!s) return;
  s.pactActive = !s.pactActive;
  w.emit('class_active2', s.tx + 0.5, s.ty + 0.5, s.pactActive ? 1 : 0, 0);
}

/**
 * §4.2 Bloodlord *Blood Tithe*: "tower pays 30% current HP once → permanently
 * +25% dmg." Already-tithed towers are skipped by the search rather than
 * charged a second time for nothing, since the bonus does not stack.
 */
function fireBloodTithe(w: World, cls: ClassDef, aimX: number | undefined, aimY: number | undefined): void {
  const wd = w.warden;
  const eff = cls.active1;
  const s = nearestStructure(w, aimX ?? wd.x, aimY ?? wd.y, eff.radius, (st) => !st.tithed);
  if (!s) return;
  s.hp = Math.max(1, s.hp - s.hp * (eff.titheHpFraction ?? 0));
  s.tithed = true;
  w.emit('class_active', s.tx + 0.5, s.ty + 0.5, 0, 0);
}

/** §4.2 Bloodlord *Crimson Rush*: "dash through enemies, +2 HP per enemy passed". */
function fireCrimsonRush(w: World, cls: ClassDef, aimX: number | undefined, aimY: number | undefined): void {
  const wd = w.warden;
  const eff = cls.active2;
  const dir = aimDirection(w, aimX, aimY);
  const from = { x: wd.x, y: wd.y };
  const range = eff.dashRange ?? 0;
  const half = classArea(w, eff.dashWidth ?? 0);

  // Same line test `lineHit` uses, run for its count rather than its damage:
  // Crimson Rush deals none.
  //
  // c001/QA: the broadphase radius must cover the *whole* rectangle the exact
  // test below accepts, or a widened half-width silently saturates into a
  // lens and the outermost enemies stop counting. `half` used to be a
  // constant, so the bare `+ 2` fudge was always enough; now that Area scales
  // it, the margin has to include it. (`lineHit`'s own copy of this
  // broadphase, `combat.ts`, has the same gap and is outside this lane's
  // Scope — logged in BACKLOG-CONTENT.md.)
  let passed = 0;
  for (const e of w.enemiesInRadius(from.x + dir.x * range * 0.5, from.y + dir.y * range * 0.5, range * 0.5 + half + 2)) {
    if (e.dead) continue;
    const rx = e.x - from.x;
    const ry = e.y - from.y;
    const along = rx * dir.x + ry * dir.y;
    if (along < -e.radius || along > range) continue;
    if (Math.abs(rx * -dir.y + ry * dir.x) > half + e.radius) continue;
    passed++;
  }
  const target = resolveDashTarget(w, dir.x * range, dir.y * range);
  startDashTravel(w, target, BASE.dashDuration);
  const heal = passed * (eff.healPerEnemy ?? 0);
  if (heal > 0) applyHealingToWarden(w, heal);
  w.emit('class_active2', from.x, from.y, target.x, target.y);
}

/**
 * §4.2 Animist *Manifest*: "summon a walking spirit of any built tower type
 * (30% of its stats at highest upgrade), 20 s, cap 3." Read at the tower's
 * `maxLevel`, per "at highest upgrade" — not at the tier actually built, which
 * would make the spirit weaker than the sentence promises.
 */
function fireManifestSpirit(w: World, cls: ClassDef): void {
  const wd = w.warden;
  const eff = cls.active1;
  const s = nearestStructure(w, wd.x, wd.y, eff.summonRadius ?? 0, (st) => {
    const d = w.content.towerById.get(st.towerId);
    return !!d && d.attack !== null;
  });
  if (!s) return;
  const def = w.content.towerById.get(s.towerId)!;
  const p = towerSummonProfile(w, def, maxLevel(def));
  // p7a (§6.3): "Active1 potency +25%" on the spirit's damage share.
  const share = (eff.summonStatMul ?? 0) * active1PotencyMul(w);
  spawnClassSummon(
    w,
    'animist_spirit',
    // p7a: skill card "Kindred Spirits" — spirit cap +1/rank.
    (eff.summonCap ?? 0) + classLineBonus(w),
    s.tx + 0.5,
    s.ty + 0.5,
    p.dps * share,
    p.range,
    p.interval,
    p.aoe,
    eff.summonDurationSeconds ?? 0,
  );
  w.emit('class_active', s.tx + 0.5, s.ty + 0.5, 0, 0);
}

/**
 * §4.2 Animist *Recall Totem*: "place a totem — character & summons near it
 * +15% atk spd; in TD it taunts nearby enemies." Both halves are built: the
 * atk-speed aura here, the taunt as a continuous re-tag applied every tick
 * from `updateClassSummons` (Q120 ORDER 1) while the totem stands and the
 * phase is TD (`!w.huntsWarden`) — "in TD" is a real phase gate, since in VS
 * every enemy already hunts the Warden and a totem taunt there would divert
 * them away from it instead of doing nothing.
 */
function fireRecallTotem(w: World, cls: ClassDef): void {
  const wd = w.warden;
  const eff = cls.active2;
  // c001: frozen at cast time beside the totem's other numbers, so a later
  // Area change does not resize a totem already standing.
  const auraRadius = classArea(w, eff.radius);
  // One totem at a time: a second cast replaces the first rather than stacking
  // two auras on the same spot.
  w.classSummons = w.classSummons.filter((s) => s.kind !== 'animist_totem');
  w.classSummons.push({
    id: w.newId(),
    x: wd.x,
    y: wd.y,
    dps: 0,
    range: 0,
    interval: 0,
    aoe: 0,
    attackCooldown: 0,
    remaining: eff.totemDurationSeconds ?? 0,
    isAura: true,
    auraAtkSpdMul: eff.auraAtkSpdMul ?? 0,
    auraRadius,
    auraTauntTickSeconds: eff.totemTauntTickSeconds ?? TOTEM_TAUNT_SECONDS_DEFAULT,
    kind: 'animist_totem',
  });
  w.emit('class_active2', wd.x, wd.y, auraRadius, 0);
}

/**
 * §4.2 Paladin *Clarion Taunt*: "enemies in r6 target the Paladin 4 s; 60% of
 * damage taken stores into Wrath." Both clauses are built (Q120 ORDER 1): a
 * snapshot at cast time — the enemies actually inside r6 right now, not
 * whoever wanders in later — is tagged for `tauntDurationSeconds`. In VS this
 * is a harmless no-op (`huntsWarden` already points every enemy at the
 * Warden, and the Paladin *is* the Warden); the clause is only ever a real
 * redirect during TD, where enemies normally path to the Core. The window
 * itself was already real sim state before this order: `damageWarden`
 * (run.ts) reads `clarionRemaining` to bank the stronger Wrath share.
 */
function fireClarionTaunt(w: World, cls: ClassDef): void {
  const wd = w.warden;
  const radius = classArea(w, cls.active1.radius);
  // p7a (§6.3): Clarion Taunt deals no damage, so "Active1 potency +25%"
  // reads as a longer taunt/Wrath-banking window instead.
  const duration = (cls.active1.tauntDurationSeconds ?? 0) * active1PotencyMul(w);
  wd.clarionRemaining = duration;
  if (duration > 0) {
    for (const e of w.enemiesInRadius(wd.x, wd.y, radius)) {
      e.tauntRemaining = duration;
      e.tauntKind = TAUNT_WARDEN;
    }
  }
  w.emit('class_active', wd.x, wd.y, radius, 0);
}

/** §4.2 Paladin *Judgement*: "release Wrath as a holy nova (stored ×1.5 as normal damage)". */
function fireJudgement(w: World, cls: ClassDef): void {
  const wd = w.warden;
  const eff = cls.active2;
  // code review, fb015: the resource gate has to run on the raw Wrath payout,
  // before `characterDamage` folds in equipment's flat Atk — otherwise 0
  // stored Wrath plus any atkFlat-granting item (10 of the 12 fb015 items do)
  // would still deal that flat's worth of damage, turning "nothing banked,
  // nothing dealt" into a free AoE nova on cooldown alone.
  // p7a (§6.3) skill card "Righteous Fury": Wrath multiplier +30%/rank.
  const radius = classArea(w, eff.radius);
  const rawWrath = wd.wrathStored * ((eff.wrathDamageMul ?? 0) + classLineBonus(w));
  wd.wrathStored = 0;
  if (rawWrath > 0) {
    const damage = characterDamage(w, cls, rawWrath);
    applyAoE(w, wd.x, wd.y, radius, damage, 'class_active2', { onHit: passiveOnHit(w, cls) }, {});
  }
  w.emit('class_active2', wd.x, wd.y, radius, 0);
}

/* -------------------------------------------------------------- fb013: Time Lord */

/** Sampling resolution (seconds) for `updateTimeLordHistory`'s ring buffer — an engine granularity constant, not a tunable design number. */
const POS_HISTORY_SAMPLE_SECONDS = 0.25;

/**
 * `active1.markRewindSeconds` (data/classes.json) drives how many samples the
 * ring buffer keeps — QA found this field previously unread (the buffer was a
 * hardcoded 12-sample/3 s constant regardless of what the data authored).
 */
function historySampleCount(cls: ClassDef): number {
  const seconds = cls.active1.markRewindSeconds ?? 3;
  return Math.max(1, Math.round(seconds / POS_HISTORY_SAMPLE_SECONDS));
}

/**
 * §4.2 (fb013) Time Lord *Time*: samples every live enemy's position onto its
 * own ring buffer, oldest first, so the unmarked->past stage's "N s-ago
 * position" (`advanceTimeMark`) has something to rewind to, N being
 * `active1.markRewindSeconds`. Only ticked while the active class's Active1
 * is `time_mark` (`updateClassPassives`) — every other run leaves
 * `Enemy.posHistory` empty and free.
 */
function updateTimeLordHistory(w: World, cls: ClassDef, dt: number): void {
  const samples = historySampleCount(cls);
  for (const e of w.enemies) {
    if (e.dead) continue;
    e.posHistoryTimer -= dt;
    if (e.posHistoryTimer > 0) continue;
    e.posHistoryTimer += POS_HISTORY_SAMPLE_SECONDS;
    e.posHistory.push({ x: e.x, y: e.y });
    if (e.posHistory.length > samples) e.posHistory.shift();
  }
}

/**
 * §4.2 (fb013) Time Lord *Time*: advances one enemy's 4-stage mark by one
 * stage — `fireTimeMark` calls this once per enemy caught in the r7 pulse
 * (the owner feedback text: "every enemy within r7 advances one time-mark
 * stage" is an unbracketed, literal AoE clause, not a [designer note]
 * interpretation, so it is not read as a single-target pick). Every stage's
 * DoT is authored as Bleeding — the sim's six damage types are already at
 * §13's stated total, so a 7th type for one class's flavor is not a reading
 * this loader rule allows without contradicting a content-totals gate (Q139).
 */
function advanceTimeMark(w: World, cls: ClassDef, e: Enemy): void {
  const eff = cls.active1;
  const stage = e.timeMarkStage;
  if (stage === 0) {
    // unmarked -> past: rewind to the oldest sample we have (a fresh spawn
    // with no 3 s of history yet rewinds to the oldest it does have) unless
    // Time Lock is holding it — a trapped enemy is "immune to Time's
    // rewind-pull" (§4.2), so the teleport half is skipped but the mark still
    // advances and its DoT still lands.
    const hist = e.posHistory[0];
    if (hist && e.timeLockZoneId === 0) {
      e.x = hist.x;
      e.y = hist.y;
    }
    applyDot(
      w,
      e,
      'bleeding',
      characterDamage(w, cls, eff.markPastDotDps ?? 0) * active1PotencyMul(w),
      eff.markPastDotSeconds ?? 0,
      'class_active',
    );
    e.timeMarkStage = 1;
  } else if (stage === 1) {
    // past -> present: "stun-locks 3 s" reuses `frozen`'s own authored 3 s
    // duration (Q139) — the sim has no separate generic stun, and frozen's
    // "cannot move" is exactly what a stun-lock reads as.
    applyFrozen(w, e);
    applyDot(
      w,
      e,
      'bleeding',
      characterDamage(w, cls, eff.markPresentDotDps ?? 0) * active1PotencyMul(w),
      eff.markPresentDotSeconds ?? 0,
      'class_active',
    );
    e.timeMarkStage = 2;
  } else if (stage === 2) {
    // present -> future: -20% atk/move speed, deferred while stunned/frozen
    // (`tickTimers`, enemies.ts, applies it once `frozenRemaining` clears),
    // plus a DoT worth its current HP spread over `markFutureDotSeconds`.
    const amount = eff.markFutureSlowAmount ?? 0;
    const seconds = eff.markFutureSlowSeconds ?? 0;
    if (e.frozenRemaining > 0) {
      e.timeMarkPendingSlow = true;
      e.timeMarkPendingSlowAmount = amount;
      e.timeMarkPendingSlowSeconds = seconds;
    } else {
      applySlow(w, e, amount, seconds);
      applyAtkSlow(w, e, amount, seconds);
    }
    const dotSeconds = eff.markFutureDotSeconds ?? 0;
    if (dotSeconds > 0 && e.hp > 0) {
      applyDot(w, e, 'bleeding', e.hp / dotSeconds, dotSeconds, 'class_active');
    }
    e.timeMarkStage = 3;
  } else {
    // future -> executed: an ordinary enemy takes the Corpse/Carnivorous
    // Plant "instant kill" precedent (a `pure`/`dot` hit for its exact
    // current HP, its own larger 'execute' event). Q139/the designer note
    // asks for a logged choice on whether the execute counts for on-kill/
    // lifesteal purposes; QUESTIONS.md's Q139 reconciliation now answers
    // that both branches deny it (`noLifesteal: true`) — the same
    // guaranteed, unmitigated hit shape either way, since the engine's one
    // armor-bypass mechanism (`dot: true`) is definitionally tied to
    // ailment-tick semantics that already exclude lifesteal eligibility, and
    // giving the elite branch a different shape than the non-elite branch
    // was itself a bug (armor silently ate most of the 50%, QA-found).
    const tx = e.x;
    const ty = e.y;
    if (e.elite || e.boss) {
      const spend = e.hp * (eff.markEliteExecuteFraction ?? 0.5);
      damageEnemy(w, e, spend, 'class_active', { pure: true, dot: true, type: 'normal', noLifesteal: true });
      w.emit('execute', tx, ty, spend, 0);
    } else {
      const spend = e.hp;
      damageEnemy(w, e, spend, 'class_active', { pure: true, dot: true, type: 'normal', noLifesteal: true });
      w.emit('execute', tx, ty, spend, 0);
    }
    e.timeMarkStage = 0;
  }
}

/**
 * §4.2 (fb013) Time Lord *Time*: "every enemy within r7 advances one
 * time-mark stage" — an AoE pulse centered on the Warden (the same
 * `enemiesInRadius(wd.x, wd.y, ...)` convention Clarion Taunt/Judgement
 * already use for a self-centered r-radius Active), not a single-target
 * aim pick.
 */
function fireTimeMark(w: World, cls: ClassDef): void {
  const wd = w.warden;
  const eff = cls.active1;
  const radius = classArea(w, eff.radius);
  let hit = false;
  for (const e of w.enemiesInRadius(wd.x, wd.y, radius)) {
    if (e.dead) continue;
    advanceTimeMark(w, cls, e);
    hit = true;
  }
  if (hit) w.emit('class_active', wd.x, wd.y, radius, 0);
}

/** Frees every enemy a since-expired/replaced Time Lock zone was still holding. */
function releaseTimeLockZone(w: World, id: number): void {
  for (const e of w.enemies) {
    if (e.timeLockZoneId === id) e.timeLockZoneId = 0;
  }
}

/**
 * §4.2 (fb013) Time Lord *Time Lock*: "re-casting while one exists teleports
 * its enemies into the new zone and detonates all their remaining DoT as one
 * instant burst" — read literally: every DoT they carry, not just this
 * zone's own contribution, on the same "hand back everything still owed"
 * precedent `dotOutstanding`/Spreading Plague's death transfer already set.
 */
function fireTimeLock(w: World, cls: ClassDef, aimX: number | undefined, aimY: number | undefined): void {
  const wd = w.warden;
  const eff = cls.active2;
  const cx = aimX ?? wd.x;
  const cy = aimY ?? wd.y;
  const old = w.timeLockZone;
  if (old) {
    for (const e of w.enemies) {
      if (e.dead || e.timeLockZoneId !== old.id) continue;
      const burst = dotOutstanding(e);
      if (burst > 0) damageEnemy(w, e, burst, 'class_active2', { pure: true, dot: true, type: 'normal' });
      e.dots = [];
      if (e.dead) continue;
      e.x = cx;
      e.y = cy;
      e.timeLockZoneId = 0;
    }
  }
  w.timeLockZone = {
    id: w.newId(),
    x: cx,
    y: cy,
    // The zone's radius is frozen here, at cast time, exactly like its dps and
    // duration — a later Area change does not resize a standing zone.
    radius: classArea(w, eff.radius),
    // p7a (§6.3) skill card "Lingering Stasis": zone duration +2s/rank.
    remaining: (eff.groundDurationSeconds ?? 5) + classLineBonus(w),
    dotSeconds: eff.zoneDotSeconds ?? 10,
    dps: characterDamage(w, cls, eff.damage),
  };
  w.emit('class_active2', cx, cy, w.timeLockZone.radius, 0);
}

/**
 * §4.2 (fb013) Time Lord *Time Lock*'s own per-tick half: tags a newly-entered
 * enemy once (installing its entry DoT), then clamps every tagged enemy back
 * inside the radius every tick regardless of how it tried to leave — the
 * "5 s no-exit" clause. Safe to call every tick of every run: a no-op unless
 * `w.timeLockZone` is actually set, which only *Time Lock* itself ever does.
 */
function updateTimeLockZone(w: World, dt: number): void {
  const z = w.timeLockZone;
  if (!z) return;
  // b048: same "the defeat slow-mo beat is a frozen moment" rule b020/b046/
  // b047 apply — the entry DoT and the forced-reposition clamp are both real
  // CC, not cosmetic. Guarded here (not by blanket-guarding the whole of
  // updateClassPassives) so the Warden timer decrements and corpse decay
  // above this call keep running, matching this item's acceptance.
  if (w.dying) return;
  z.remaining -= dt;
  if (z.remaining <= 0) {
    releaseTimeLockZone(w, z.id);
    w.timeLockZone = null;
    return;
  }
  const r2 = z.radius * z.radius;
  for (const e of w.enemies) {
    if (e.dead) continue;
    const already = e.timeLockZoneId === z.id;
    const inside = dist2(e.x, e.y, z.x, z.y) <= r2;
    if (!already && inside) {
      e.timeLockZoneId = z.id;
      applyDot(w, e, 'bleeding', z.dps, z.dotSeconds, 'class_active2');
    } else if (already && !inside) {
      const n = normalize(e.x - z.x, e.y - z.y);
      e.x = z.x + (n.x || 0) * z.radius;
      e.y = z.y + (n.y || 0) * z.radius;
    }
  }
}

/* ------------------------------------------------- p6d: per-tick class state */

// Reused across ticks rather than allocated per burning enemy — Contagious
// Flame runs the inner query once per Burning carrier, every tick.
const flameScratch: Enemy[] = [];

/**
 * Everything a class does on its own clock rather than off a Command or an
 * attack: §4.2's Contagious Flame, Guardian Stance, Death Pact drain, the
 * Overload/Clarion windows, and Necromancer corpse decay. Called from all
 * three phase paths in `run.ts` beside `updateAreas`.
 *
 * The two Warden timers and corpse decay run before the class check on
 * purpose: a timer that only ticks while its own class is selected would never
 * reach zero if the run somehow changed class mid-flight, and a corpse list is
 * cheap to drain whether or not anyone can raise it.
 *
 * b048: unlike `updateClassSummons`/`updateVsSpecials`/`updateWieldedAttacks`
 * (b020/b046/b047), this function is not blanket-guarded on `w.dying` — the
 * Warden timers and corpse decay above are cosmetic-only and keep running
 * through the DEFEAT_SLOWMO beat. Only the three damage/CC sub-routines
 * (`updateContagiousFlame`, `updateTimeLockZone`, `updatePactedTowers`) guard
 * themselves individually.
 */
export function updateClassPassives(w: World, dt: number): void {
  const wd = w.warden;
  if (wd.overloadRemaining > 0) wd.overloadRemaining = Math.max(0, wd.overloadRemaining - dt);
  if (wd.clarionRemaining > 0) wd.clarionRemaining = Math.max(0, wd.clarionRemaining - dt);
  if (w.corpses.length > 0) {
    let expired = false;
    for (const c of w.corpses) {
      c.remaining -= dt;
      if (c.remaining <= 0) expired = true;
    }
    if (expired) w.corpses = w.corpses.filter((c) => c.remaining > 0);
  }
  // fb013: a no-op unless `w.timeLockZone` is set, which only Time Lord's own
  // Active2 ever sets — cheap and safe to run unconditionally, same reasoning
  // the corpse-decay block above already gives.
  updateTimeLockZone(w, dt);

  const cls = w.content.classByKey.get(w.cfg.classKey);
  if (!cls) return;

  // Keyed off the Active that creates the pact, not off the passive: a pact
  // tower is Necromancer-only state and nothing else can ever set the flag.
  if (cls.active2.kind === 'death_pact') updatePactedTowers(w, cls, dt);
  // fb013: position sampling for *Time*'s rewind, kept off for every other kit.
  if (cls.active1.kind === 'time_mark') updateTimeLordHistory(w, cls, dt);

  switch (cls.passive.kind) {
    case 'contagious_flame':
      updateContagiousFlame(w, cls, dt);
      break;
    case 'guardian_stance':
      updateGuardianStance(w, cls, dt);
      break;
    default:
      break;
  }
}

/** §4.2 Pyro *Contagious Flame*: "Burning enemies deal 2 dmg/s to enemies touching them". */
function updateContagiousFlame(w: World, cls: ClassDef, dt: number): void {
  // b048: same DEFEAT_SLOWMO rule as b020/b046/b047 — touch damage to nearby
  // enemies is real combat, not a cosmetic tick.
  if (w.dying) return;
  const dps = cls.passive.flameDps ?? 0;
  const radius = classArea(w, cls.passive.flameRadius ?? 0);
  if (dps <= 0 || radius <= 0) return;
  const tick = dps * dt;
  // Length captured up front: a death here can split an enemy into children
  // appended to this same array, and they cannot be carriers on the tick they
  // are born.
  const n = w.enemies.length;
  for (let i = 0; i < n; i++) {
    const e = w.enemies[i];
    if (e.dead) continue;
    let burning = false;
    for (const d of e.dots) {
      if (d.type === 'burning') {
        burning = true;
        break;
      }
    }
    if (!burning) continue;
    const list = w.enemiesInRadius(e.x, e.y, radius, flameScratch);
    for (let j = 0; j < list.length; j++) {
      const other = list[j];
      if (other === e || other.dead) continue;
      damageEnemy(w, other, tick, 'class_passive', { pure: true, dot: true });
      // fb016: `dot: true` above deliberately suppresses `damageEnemy`'s own
      // 'hit' spark (same reasoning as `updateCorpseExecute`'s 'execute'
      // event) — without this, Contagious Flame's touch damage was the one
      // passive trigger in the registry with a claimed "visible cue" and
      // nothing rendering it at all (QA fb016 finding #1). `this.flashes` in
      // canvas.ts dedupes same-tick re-triggers by enemy id, so this is safe
      // to emit every tick a carrier is in range, not just once.
      w.emit('class_passive', other.x, other.y, tick, other.id);
    }
  }
}

/** §4.2 Paladin *Guardian Stance*'s stand-still ledger; `classArmorBonus` reads the result. */
function updateGuardianStance(w: World, cls: ClassDef, dt: number): void {
  const wd = w.warden;
  if (wd.x === wd.lastStillX && wd.y === wd.lastStillY) {
    wd.standStillTimer += dt;
    return;
  }
  wd.standStillTimer = 0;
  wd.lastStillX = wd.x;
  wd.lastStillY = wd.y;
  void cls;
}

/**
 * §4.2 Necromancer *Death Pact*'s per-second cost: "tower −2% max HP/s; a pact
 * tower that dies leaves a Bone Pylon (weak free turret)."
 *
 * The drain writes `hp` directly rather than going through `damageStructure`:
 * the clause names a share of *max* HP, and routing it through the damage path
 * would put the tower's own defense between the pact and its price.
 */
function updatePactedTowers(w: World, cls: ClassDef, dt: number): void {
  // b048: same DEFEAT_SLOWMO rule as b020/b046/b047 — the HP drain (and the
  // structdeath/Bone Pylon it can trigger) is real combat, not a cosmetic tick.
  if (w.dying) return;
  const eff = cls.active2;
  const drain = eff.pactDrainPerSecond ?? 0;
  if (drain <= 0) return;
  for (const s of w.structures) {
    if (s.dead || !s.pactActive) continue;
    s.hp -= s.maxHp * drain * dt;
    if (s.hp > 0) continue;
    w.emit('structdeath', s.tx + 0.5, s.ty + 0.5, s.towerId, 0);
    spawnClassSummon(
      w,
      'bone_pylon',
      0,
      s.tx + 0.5,
      s.ty + 0.5,
      eff.pylonDps ?? 0,
      eff.pylonRange ?? 0,
      eff.pylonInterval ?? 1,
      0,
      PYLON_SECONDS,
    );
    w.removeStructure(s);
  }
}

/**
 * A Bone Pylon has no stated lifetime ("a weak free turret"), so it is given
 * one long enough to outlast any run rather than a second, unbounded
 * `ClassSummon` shape with its own expiry rule (Q120).
 */
const PYLON_SECONDS = 1e9;

/**
 * Fallback for `ClassSummon.auraTauntTickSeconds` (Q120 ORDER 1) if
 * `data/classes.json`'s `totemTauntTickSeconds` is absent — an
 * older/hand-edited file still loads, same precedent as every other
 * `?? <default>` field in this module. The authored value lives in
 * `data/classes.json` (CLAUDE.md architecture rule 4); this is not itself
 * the number read at runtime whenever the data row sets its own.
 */
const TOTEM_TAUNT_SECONDS_DEFAULT = 0.5;

// Reused across ticks rather than allocated per totem-taunt query, same
// precedent as `flameScratch` above.
const totemTauntScratch: Enemy[] = [];

/** Ticks every live summon: lifetime, then either its attack cadence or nothing (a totem). */
export function updateClassSummons(w: World, dt: number): void {
  if (w.classSummons.length === 0) return;
  // b047: same "the defeat slow-mo beat is a frozen moment, not still-live
  // combat" rule b020/b046 already apply to `updateWieldedAttacks`/
  // `updateVsSpecials` — a live summon (e.g. Engineer's Pop Turret) has no
  // Command gate to catch it at, since it fires every tick from `updateAct1*`/
  // `updateAct2` regardless of input. The whole function is guarded, not just
  // the damage branch: the totem taunt re-tag is CC with the same "still-live
  // combat during a frozen beat" problem, not merely cosmetic.
  if (w.dying) return;
  let expired = false;
  for (const s of w.classSummons) {
    s.remaining -= dt;
    if (s.remaining <= 0) {
      expired = true;
      continue;
    }
    if (s.isAura) {
      // Recall Totem's "in TD it taunts nearby enemies" (Q120 ORDER 1): a
      // continuous re-tag, not a one-shot snapshot like Clarion Taunt, since
      // a totem is a standing structure rather than a burst effect —
      // refreshed to `auraTauntTickSeconds` every tick an enemy is in range,
      // so it decays shortly after the enemy leaves rather than outliving
      // the totem's reach. TD-only: in VS every enemy already hunts the Warden.
      if (s.kind === 'animist_totem' && !w.huntsWarden) {
        const radius = s.auraRadius ?? 0;
        const tick = s.auraTauntTickSeconds ?? TOTEM_TAUNT_SECONDS_DEFAULT;
        // qa-playtester finding (Q120 ORDER 1): a non-positive tick (a
        // corrupted/misauthored `totemTauntTickSeconds`, not today's shipped
        // 0.5) must not tag at all — `tickTimers` only clears `tauntKind`
        // back to TAUNT_NONE from inside its `tauntRemaining > 0` branch, so
        // assigning a <=0 value here would leave `tauntKind` stuck at
        // TAUNT_TOTEM forever, the same `duration > 0` guard
        // `fireClarionTaunt` already applies to its own one-shot tag.
        if (radius > 0 && tick > 0) {
          for (const e of w.enemiesInRadius(s.x, s.y, radius, totemTauntScratch)) {
            e.tauntRemaining = tick;
            e.tauntKind = TAUNT_TOTEM;
            e.tauntSourceId = s.id;
          }
        }
      }
      continue;
    }
    s.attackCooldown = tickCooldown(s.attackCooldown, dt);
    if (s.attackCooldown > 0) continue;
    const target = w.nearestEnemy(s.x, s.y, s.range);
    if (!target) continue;
    s.attackCooldown = s.interval / auraSpeedMul(w, s.x, s.y);
    const damage = s.dps * s.interval * w.derived.powerMul;
    if (s.aoe > 0) {
      applyAoE(w, target.x, target.y, s.aoe, damage, 'class_summon', {}, {
        primary: target,
        damage: { fromX: s.x, fromY: s.y },
      });
    } else {
      damageEnemy(w, target, damage, 'class_summon', { fromX: s.x, fromY: s.y });
    }
    w.emit('class_basic', s.x, s.y, target.x, target.y);
  }
  if (expired) w.classSummons = w.classSummons.filter((s) => s.remaining > 0);
}

/** Removes an Ice Wall's structures once its window closes — no refund, since they cost nothing. */
export function updateTempWalls(w: World, dt: number): void {
  if (w.tempWalls.length === 0) return;
  let expired = false;
  for (const tw of w.tempWalls) {
    tw.remaining -= dt;
    if (tw.remaining > 0) continue;
    expired = true;
    for (const id of tw.structureIds) {
      const s = w.structureById.get(id);
      if (s && !s.dead) w.removeStructure(s);
    }
  }
  if (expired) w.tempWalls = w.tempWalls.filter((t) => t.remaining > 0);
  // `removeStructure` only marks the Warden-chase field dirty (batched, so a
  // multi-segment expiry costs one Dijkstra pass, not one per segment) —
  // flush it once here, on the same single-call-after-the-loop precedent
  // `fireIceWall`'s own placement side already sets, so a caller stepping
  // only `updateTempWalls` (without a further `updateAct2` tick) still sees
  // the un-staled field immediately.
  if (expired && w.huntsWarden) w.updateNav();
}

/* ---------------------------------------------------------------- Commands */

/** Returns whether the Active fired; false on cooldown, wrong phase, or no active defined. */
export function useClassActive(w: World, aimX?: number, aimY?: number): boolean {
  const wd = w.warden;
  if (!ACTIVE_PHASES.has(w.phase)) return false;
  // `updateWarden`'s own "frozen for the defeat slow-mo beat" rule (run.ts)
  // never reaches a Command: `Run.step` applies `input.cmds` before the
  // phase switch that calls `updateWarden`, so a Command-driven Active was
  // never actually stopped by `w.dying` — a real, QA-found bug once Dash
  // Slash gave firing-while-dying a visible consequence (movement, damage)
  // rather than a no-op cosmetic effect (p6b).
  if (w.dying) return false;
  const cls = w.content.classByKey.get(w.cfg.classKey);
  if (!cls) return false;

  // A charge-kind Active1 (Circle Slash, Deadeye Draw) fires on release,
  // driven every tick by `TickInput.active1Held` through `tickClassCharge` —
  // the keydown that pushes this Command is what starts the hold, but the
  // fire event is time-shifted to release, so the Command itself must not
  // consume the cooldown or report success (p6b; this was a real bug in the
  // framework's first draft, which set `active1Cooldown` unconditionally
  // regardless of whether the kind switch below matched anything at all).
  if (isChargeKind(cls.active1.kind)) return false;

  // fb013: `maxCharges > 1` (Time Lord's *Time*) gates on ammo instead of the
  // single `active1Cooldown` every other kind still uses untouched.
  const max1 = cls.active1.maxCharges ?? 1;
  if (max1 > 1) {
    if (wd.active1Ammo <= 0) return false;
  } else if (wd.active1Cooldown > 0) {
    return false;
  }
  switch (cls.active1.kind) {
    case 'burst_damage':
      fireEffect(w, wd.x, wd.y, cls.active1, passiveOnHit(w, cls), active1PotencyMul(w), classLineBonus(w));
      break;
    case 'ground_poison':
      firePoisonBarrel(w, cls);
      break;
    case 'repair_heal':
      fireFieldKit(w, cls, aimX, aimY);
      break;
    case 'frost_nova':
      fireFrostNova(w, cls);
      break;
    case 'chain_lightning':
      fireChainSurge(w, cls, aimX, aimY);
      break;
    case 'raise_skeletons':
      fireRaiseSkeletons(w, cls);
      break;
    case 'blood_tithe':
      fireBloodTithe(w, cls, aimX, aimY);
      break;
    case 'manifest_spirit':
      fireManifestSpirit(w, cls);
      break;
    case 'clarion_taunt':
      fireClarionTaunt(w, cls);
      break;
    case 'time_mark':
      fireTimeMark(w, cls);
      break;
    default:
      // Same bug class as the legacy branch above: an unhandled kind (or one
      // that fires only from `tickClassCharge`'s hold/release path) must not
      // silently consume the cooldown.
      return false;
  }
  if (max1 > 1) {
    wd.active1Ammo--;
    if (wd.active1AmmoCooldown <= 0) wd.active1AmmoCooldown = (cls.active1.rechargeSeconds ?? 0) * (1 - w.derived.cdr);
  } else {
    wd.active1Cooldown = cls.active1.cooldownSeconds * (1 - w.derived.cdr);
  }
  return true;
}

/** Held on `TickInput.active1Held` and fired on release, rather than by its own Command. */
function isChargeKind(kind: ClassEffect['kind']): boolean {
  return kind === 'charge_nova' || kind === 'charge_pierce';
}

/**
 * SPEC-FINAL §4 Active2 (E). `aimX`/`aimY` (tile coords) are the mouse-aim
 * point a dash/placement-kind Active2 aims at; ignored by `burst_damage`,
 * which stays self-centered exactly as before.
 */
export function useClassActive2(w: World, aimX?: number, aimY?: number): boolean {
  if (!ACTIVE_PHASES.has(w.phase)) return false;
  // See the matching guard/comment in `useClassActive` above (p6b bug fix) —
  // same gap, same fix, and Dash Slash is exactly the case that made it
  // visible (it moves the Warden and deals damage, not just a cosmetic no-op).
  if (w.dying) return false;
  const cls = w.content.classByKey.get(w.cfg.classKey);
  if (!cls) return false;

  const wd = w.warden;
  // fb013: see the matching Active1 ammo gate above.
  const max2 = cls.active2.maxCharges ?? 1;
  if (max2 > 1) {
    if (wd.active2Ammo <= 0) return false;
  } else if (wd.active2Cooldown > 0) {
    return false;
  }
  switch (cls.active2.kind) {
    case 'burst_damage':
      fireEffect(w, wd.x, wd.y, cls.active2, passiveOnHit(w, cls));
      break;
    case 'dash_line':
      fireDashSlash(w, cls, aimX, aimY);
      break;
    case 'poison_boost':
      firePoisonBoost(w);
      break;
    case 'dash_volley':
      fireQuickstep(w, cls, aimX, aimY);
      break;
    case 'summon_turret':
      fireSummonTurret(w, cls);
      break;
    case 'dash_trail':
      fireFlameRoad(w, cls, aimX, aimY);
      break;
    case 'ice_wall':
      fireIceWall(w, cls, aimX, aimY);
      break;
    case 'overload':
      fireOverload(w, cls);
      break;
    case 'death_pact':
      fireDeathPact(w, cls, aimX, aimY);
      break;
    case 'dash_heal':
      fireCrimsonRush(w, cls, aimX, aimY);
      break;
    case 'recall_totem':
      fireRecallTotem(w, cls);
      break;
    case 'judgement':
      fireJudgement(w, cls);
      break;
    case 'time_lock':
      fireTimeLock(w, cls, aimX, aimY);
      break;
    default:
      // Guarded so a future mismatch (e.g. a charge kind authored onto Active2
      // by mistake) can't silently consume the cooldown for nothing, the same
      // bug class `useClassActive` above was fixed for (p6b).
      return false;
  }
  if (max2 > 1) {
    wd.active2Ammo--;
    if (wd.active2AmmoCooldown <= 0) wd.active2AmmoCooldown = (cls.active2.rechargeSeconds ?? 0) * active2CdrFactor(w);
  } else {
    wd.active2Cooldown = cls.active2.cooldownSeconds * active2CdrFactor(w);
  }
  return true;
}

/**
 * fb013: refills a `maxCharges`-authored Active's ammo, one charge per
 * `rechargeSeconds` up to the cap — the same increment-while-below-cap /
 * restart-timer-on-use shape the Warden's own dash charges already use
 * (`updateWarden`). A no-op for every kind that leaves `maxCharges` unset.
 */
export function tickAmmoRecharge(w: World, cls: ClassDef, dt: number): void {
  const wd = w.warden;
  const max1 = cls.active1.maxCharges ?? 1;
  if (max1 > 1 && wd.active1Ammo < max1) {
    wd.active1AmmoCooldown -= dt;
    if (wd.active1AmmoCooldown <= 0) {
      wd.active1Ammo++;
      if (wd.active1Ammo < max1) wd.active1AmmoCooldown = (cls.active1.rechargeSeconds ?? 0) * (1 - w.derived.cdr);
    }
  }
  const max2 = cls.active2.maxCharges ?? 1;
  if (max2 > 1 && wd.active2Ammo < max2) {
    wd.active2AmmoCooldown -= dt;
    if (wd.active2AmmoCooldown <= 0) {
      wd.active2Ammo++;
      if (wd.active2Ammo < max2) wd.active2AmmoCooldown = (cls.active2.rechargeSeconds ?? 0) * active2CdrFactor(w);
    }
  }
}

/**
 * SPEC-FINAL §4.1/§4.2 (p6b, p6d): drives a charge-kind Active1 from the
 * continuous `TickInput.active1Held` flag — start charging on the first
 * held tick (blocked while `active1Cooldown` is still running), accumulate
 * up to `chargeCapSeconds`, and fire on the tick `active1Held` goes false
 * while still charging. A no-op for every other kind and every `legacy:
 * true` class. Called every tick `updateWarden` runs (TD and VS alike,
 * matching `ACTIVE_PHASES`), so no further phase gate is needed here.
 */
export function tickClassCharge(w: World, cls: ClassDef, input: TickInput, dt: number): void {
  if (!isChargeKind(cls.active1.kind)) return;
  const wd = w.warden;
  const cap = cls.active1.chargeCapSeconds ?? 3;

  if (input.active1Held) {
    if (!wd.active1Charging) {
      if (wd.active1Cooldown > 0) return;
      wd.active1Charging = true;
      // fb052 (§7) Sleeve Sword: "Circle Slash's charge is at MAX from the
      // moment the key is pressed; release at any time applies the
      // max-charge effect" — the hold/release flow (and Dash Slash's
      // mid-charge merge, which reads `active1Charging`) stays real, unlike
      // the old fb015 shortcut that fired immediately and never entered the
      // charging state at all, silently breaking that merge.
      wd.active1Charge = cls.active1.kind === 'charge_nova' && hasEquipment(w, 'sleeve_sword') ? cap : 0;
    }
    wd.active1Charge = Math.min(wd.active1Charge + dt * circleSlashChargeRate(w, cls), cap);
    return;
  }

  if (wd.active1Charging) {
    if (cls.active1.kind === 'charge_nova') {
      // fb052 (§7) Swordsman Armor's cross-item clause: with Sleeve Sword
      // also equipped, charge rate is moot (already instant-max), so the
      // armor's bonus becomes a damage multiplier instead.
      fireCircleSlash(w, cls, wd.active1Charge, hasEquipment(w, 'swordsman_armor') && hasEquipment(w, 'sleeve_sword'));
    } else {
      fireDeadeyeDraw(w, cls, wd.active1Charge, input.aimX, input.aimY);
    }
    wd.active1Charging = false;
    wd.active1Charge = 0;
    wd.active1Cooldown = cls.active1.cooldownSeconds * (1 - w.derived.cdr);
  }
}

/**
 * The move-speed penalty a `charge_pierce` Active1 pays while drawing (§4.2
 * Archer: "move −40% while drawing"), as a multiplier `updateWarden` applies
 * at the movement integration site — never by mutating `w.derived`, which is
 * a cached view of the stat sheet and not per-tick state.
 */
export function classMoveSpeedMul(w: World): number {
  const wd = w.warden;
  if (!wd.active1Charging) return 1;
  const cls = w.content.classByKey.get(w.cfg.classKey);
  if (!cls || cls.active1.kind !== 'charge_pierce') return 1;
  return cls.active1.moveMulWhileCharging ?? 1;
}

/**
 * SPEC-FINAL §4: "every class auto-attacks the nearest enemy with its band
 * profile" — needs no `input.attack` press and fires on its own whenever
 * `wd.attackCooldown` allows. Scoped TD-only (`!w.huntsWarden`) — §6.1's
 * wielded-tower-attack system is what the character fights with during VS,
 * and nothing in §4 asks the band-profile basic attack to fire alongside it
 * too (Q117).
 */
export function classBasicAttack(w: World, cls: ClassDef): void {
  const wd = w.warden;
  if (wd.attackCooldown > 0) return;
  const a = cls.basicAttack;
  // fb015 (§7): Sniper Bracelet's "character ... range +10%". Routed through
  // `characterBasicRange` (fb029) so the fire path and the on-select range
  // ring can never drift apart from a formula change to one and not the
  // other.
  const target = w.nearestEnemy(wd.x, wd.y, characterBasicRange(w));
  if (!target) return;
  wd.attackCooldown = a.interval / (w.derived.attackSpeedMul * auraSpeedMul(w, wd.x, wd.y));
  const dmg = characterDamage(w, cls, a.dps * a.interval);
  const onHit = passiveOnHit(w, cls);
  if (a.aoe > 0) {
    // Splash routes through the shared AoE convention (aoeFullTargets/aoeFalloff/
    // aoeFalloffFloor, data/towers.json) so a future kit's basic-attack aoe (p6b+)
    // doesn't silently skip the cap/falloff discipline every other splash source
    // already follows (code review on p6a).
    applyAoE(w, target.x, target.y, classArea(w, a.aoe), dmg, 'class_basic', { onHit }, {
      primary: target,
      damage: { fromX: wd.x, fromY: wd.y },
    });
  } else {
    damageEnemy(w, target, dmg, 'class_basic', { fromX: wd.x, fromY: wd.y });
    if (!target.dead) applyEffects(w, target, { onHit });
  }
  w.emit('class_basic', wd.x, wd.y, target.x, target.y);
}

/**
 * fb029: the character's live basic-attack range in tiles, range bonuses
 * (Sniper Bracelet, tree, boons) included — the exact formula
 * `classBasicAttack` fires at above, exposed for the on-select attack-range
 * ring. 0 if the run has no resolvable class (should not happen live).
 */
export function characterBasicRange(w: World): number {
  const cls = w.content.classByKey.get(w.cfg.classKey);
  if (!cls) return 0;
  return cls.basicAttack.range * w.derived.charRangeMul;
}
