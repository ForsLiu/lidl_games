/**
 * Class framework. Two shapes coexist (Q38): `legacy: true` classes
 * (`engineer`, `pyromancer`, `frost_warden`) keep SPEC-V2 §2's single Active,
 * dispatched by `useClassActive` exactly as before. `legacy: false` classes
 * (SPEC-FINAL §4, p6a) get Active1 (Q) and Active2 (E) as two independently
 * cooled-down sim Commands (`class_active` / `class_active2`) so bots and
 * replays trigger either exactly like any other action — plus a band-driven
 * basic attack that auto-fires with no Command at all (`classBasicAttack`,
 * called from `updateWarden`).
 *
 * `kind` dispatches the effect itself so new kinds can be added here as more
 * kits land (p6b+) without touching the Command plumbing or the schema
 * shape. p6b adds the Swordsman's `charge_nova` (Circle Slash, held via
 * `TickInput.active1Held` and fired on release — `tickClassCharge`) and
 * `dash_line` (Dash Slash, mouse-aimed) kinds, plus `passive.kind`, the same
 * dispatch idea for a non-stat-shaped passive (Thousand Cuts' on-hit
 * Bleeding).
 */
import { applyAoE, applyEffects, lineHit } from './combat';
import type { ClassEffect, NewClassDef } from './content';
import { damageEnemy } from './enemies';
import { GRID_H, GRID_W } from './grid';
import { clamp, lerp, normalize } from './math';
import type { Enemy, Phase, TickInput } from './types';
import { World } from './world';

/** Usable both TD and VS, per SPEC-V2 §2 / SPEC-FINAL §4 — but not in menu/transition phases. */
const ACTIVE_PHASES: ReadonlySet<Phase> = new Set(['act1_build', 'act1_wave', 'act2']);

/**
 * The fields the one shared `kind` (`burst_damage`) reads — deliberately
 * narrower than either schema's full Active/Effect shape (both the legacy
 * `dayUse`/`nightUse` and any future kind-specific fields are irrelevant
 * here), so this one function serves the legacy single Active and both
 * new-shape Active1/Active2 without either schema needing to match the other.
 */
interface BurstEffect {
  // Not read inside `fireEffect` itself — the caller's switch already
  // narrowed on it before calling in here, so this is intentionally the
  // wide union rather than the `'burst_damage'` literal both call sites are
  // actually in when they call this (`ClassEffectSchema`'s inferred type
  // isn't a discriminated union — one flat object shape covers every kind —
  // so passing `cls.active1`/`cls.active2` through a `'burst_damage'`-only
  // field would need a cast at every call site for no runtime benefit).
  kind: 'burst_damage' | 'charge_nova' | 'dash_line';
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
 */
const NO_ON_HIT: readonly string[] = [];
const BLEEDING_ON_HIT: readonly string[] = ['bleeding'];

function passiveOnHit(cls: NewClassDef): readonly string[] {
  return cls.passive.kind === 'thousand_cuts' ? BLEEDING_ON_HIT : NO_ON_HIT;
}

function fireEffect(w: World, x: number, y: number, eff: BurstEffect, onHit: readonly string[] = []): void {
  const list = w.enemiesInRadius(x, y, eff.radius);
  for (const e of list) {
    if (e.dead) continue;
    damageEnemy(w, e, eff.damage * w.derived.powerMul, 'class_active', { fromX: x, fromY: y });
    if (e.dead) continue;
    applyEffects(w, e, {
      source: 'class_active',
      slow: eff.slow,
      slowDuration: eff.slowDuration,
      burnDps: eff.burnDps,
      burnDuration: eff.burnDuration,
      onHit,
    });
  }
  w.emit('class_active', x, y, eff.radius, 0);
}

/**
 * Instant reposition away from `(fromX, fromY)`, clamped to a walkable tile
 * the same way `run.ts`'s `blinkWarden` clamps the Warden's own dash.
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

/** §4.1 Circle Slash: nova radius/damage/knockback scale from their `min*` floor (0 charge) up to the full `radius`/`damage`/`knockback` value at `chargeCapSeconds` (default 3, per "cap = 3 s-equivalent"). */
function circleSlashValues(
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

/** Fires a (possibly zero-charge) Circle Slash: a self-centered nova, scaled by how long it was held. */
function fireCircleSlash(w: World, cls: NewClassDef, chargeSeconds: number): void {
  const wd = w.warden;
  const eff = cls.active1;
  const { radius, damage, knockback } = circleSlashValues(eff, chargeSeconds);
  const onHit = passiveOnHit(cls);
  const hitList = knockback > 0 ? w.enemiesInRadius(wd.x, wd.y, radius).slice() : null;
  applyAoE(w, wd.x, wd.y, radius, damage * w.derived.powerMul, 'class_active', { onHit }, {});
  if (hitList) for (const e of hitList) if (!e.dead) knockbackEnemy(w, e, wd.x, wd.y, knockback);
  w.emit('class_active', wd.x, wd.y, radius, 0);
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
function fireDashSlash(w: World, cls: NewClassDef, aimX: number | undefined, aimY: number | undefined): void {
  const wd = w.warden;
  const eff = cls.active2;
  const onHit = passiveOnHit(cls);

  let mergedRadius = 0;
  let mergedDamage = 0;
  if (cls.active1.kind === 'charge_nova' && wd.active1Charging) {
    const v = circleSlashValues(cls.active1, wd.active1Charge);
    mergedRadius = v.radius;
    mergedDamage = v.damage;
    wd.active1Charging = false;
    wd.active1Charge = 0;
    wd.active1Cooldown = cls.active1.cooldownSeconds * (1 - w.derived.cdr);
  }

  const rawDir = normalize((aimX ?? wd.x + wd.fx) - wd.x, (aimY ?? wd.y + wd.fy) - wd.y);
  const dx = rawDir.x !== 0 || rawDir.y !== 0 ? rawDir.x : wd.fx;
  const dy = rawDir.x !== 0 || rawDir.y !== 0 ? rawDir.y : wd.fy;

  const dashRange = eff.dashRange ?? 0;
  const hitRange = dashRange + mergedRadius;
  const damage = (eff.damage + mergedDamage) * w.derived.powerMul;
  lineHit(w, wd.x, wd.y, dx, dy, hitRange, eff.dashWidth ?? 0, damage, 'class_active2', 9999, { onHit });

  const before = { x: wd.x, y: wd.y };
  dashWarden(w, dx * dashRange, dy * dashRange);
  w.emit('class_active2', before.x, before.y, wd.x, wd.y);
}

/**
 * Blink-step for Dash Slash — ignores terrain but must land somewhere
 * legal, the same rule `run.ts`'s `blinkWarden` applies to the movement
 * dodge-dash. Reimplemented locally rather than imported to avoid a
 * `classes.ts` <-> `run.ts` cycle (`run.ts` already imports this file's
 * Command handlers), the same reasoning `cores.ts`'s `corpseExplode` gives
 * for hand-rolling its own AoE instead of importing `combat.ts`'s.
 */
function dashWarden(w: World, dx: number, dy: number): void {
  const wd = w.warden;
  const tx = clamp(wd.x + dx, 0.4, GRID_W - 0.4);
  const ty = clamp(wd.y + dy, 0.4, GRID_H - 0.4);
  if (w.grid.passable(Math.floor(tx), Math.floor(ty))) {
    wd.x = tx;
    wd.y = ty;
    return;
  }
  for (let s = 0.9; s > 0; s -= 0.1) {
    const px = clamp(wd.x + dx * s, 0.4, GRID_W - 0.4);
    const py = clamp(wd.y + dy * s, 0.4, GRID_H - 0.4);
    if (w.grid.passable(Math.floor(px), Math.floor(py))) {
      wd.x = px;
      wd.y = py;
      return;
    }
  }
}

/** Returns whether the Active fired; false on cooldown, wrong phase, or no active defined. */
export function useClassActive(w: World): boolean {
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

  if (cls.legacy) {
    if (wd.activeCooldown > 0) return false;
    const active = cls.active;
    // Only `burst_damage` exists on the legacy shape today, but this must
    // still not fire-and-consume-cooldown on an unhandled kind (see the
    // Active1 comment below — the same bug class, guarded the same way).
    if (active.kind !== 'burst_damage') return false;
    fireEffect(w, wd.x, wd.y, active);
    wd.activeCooldown = active.cooldownSeconds * (1 - w.derived.cdr);
    return true;
  }

  // A charge-kind Active1 (Circle Slash) fires on release, driven every tick
  // by `TickInput.active1Held` through `tickClassCharge` — the keydown that
  // pushes this Command is what starts the hold, but the fire event is
  // time-shifted to release, so the Command itself must not consume the
  // cooldown or report success (p6b; this was a real bug in the framework's
  // first draft, which set `active1Cooldown` unconditionally regardless of
  // whether the kind switch below matched anything at all).
  if (cls.active1.kind === 'charge_nova') return false;

  if (wd.active1Cooldown > 0) return false;
  if (cls.active1.kind !== 'burst_damage') return false;
  fireEffect(w, wd.x, wd.y, cls.active1, passiveOnHit(cls));
  wd.active1Cooldown = cls.active1.cooldownSeconds * (1 - w.derived.cdr);
  return true;
}

/**
 * SPEC-FINAL §4 Active2 (E). No-op for a `legacy: true` class — it has only
 * one Active. `aimX`/`aimY` (tile coords) are the mouse-aim point a
 * `dash_line`-kind Active2 dashes toward; ignored by `burst_damage`, which
 * stays self-centered exactly as before.
 */
export function useClassActive2(w: World, aimX?: number, aimY?: number): boolean {
  if (!ACTIVE_PHASES.has(w.phase)) return false;
  // See the matching guard/comment in `useClassActive` above (p6b bug fix) —
  // same gap, same fix, and Dash Slash is exactly the case that made it
  // visible (it moves the Warden and deals damage, not just a cosmetic no-op).
  if (w.dying) return false;
  const cls = w.content.classByKey.get(w.cfg.classKey);
  if (!cls || cls.legacy) return false;

  const wd = w.warden;
  if (wd.active2Cooldown > 0) return false;
  switch (cls.active2.kind) {
    case 'burst_damage':
      fireEffect(w, wd.x, wd.y, cls.active2, passiveOnHit(cls));
      break;
    case 'dash_line':
      fireDashSlash(w, cls, aimX, aimY);
      break;
    default:
      // No Active2 kind exists yet that isn't one of the two above — guarded
      // anyway so a future mismatch (e.g. `charge_nova` authored onto
      // Active2 by mistake) can't silently consume the cooldown for nothing,
      // the same bug class `useClassActive` above was fixed for (p6b).
      return false;
  }
  wd.active2Cooldown = cls.active2.cooldownSeconds * (1 - w.derived.cdr);
  return true;
}

/**
 * SPEC-FINAL §4.1 (p6b): drives a `charge_nova`-kind Active1 from the
 * continuous `TickInput.active1Held` flag — start charging on the first
 * held tick (blocked while `active1Cooldown` is still running), accumulate
 * up to `chargeCapSeconds`, and fire on the tick `active1Held` goes false
 * while still charging. A no-op for every other kind and every `legacy:
 * true` class. Called every tick `updateWarden` runs (TD and VS alike,
 * matching `ACTIVE_PHASES`), so no further phase gate is needed here.
 */
export function tickClassCharge(w: World, cls: NewClassDef, input: TickInput, dt: number): void {
  if (cls.active1.kind !== 'charge_nova') return;
  const wd = w.warden;

  if (input.active1Held) {
    if (!wd.active1Charging) {
      if (wd.active1Cooldown > 0) return;
      wd.active1Charging = true;
      wd.active1Charge = 0;
    }
    const cap = cls.active1.chargeCapSeconds ?? 3;
    wd.active1Charge = Math.min(wd.active1Charge + dt, cap);
    return;
  }

  if (wd.active1Charging) {
    fireCircleSlash(w, cls, wd.active1Charge);
    wd.active1Charging = false;
    wd.active1Charge = 0;
    wd.active1Cooldown = cls.active1.cooldownSeconds * (1 - w.derived.cdr);
  }
}

/**
 * SPEC-FINAL §4: "every class auto-attacks the nearest enemy with its band
 * profile" — unlike the legacy `manualAttack` (`run.ts`), this needs no
 * `input.attack` press and fires on its own whenever `wd.attackCooldown`
 * allows. Scoped TD-only (`!w.huntsWarden`), mirroring `manualAttack`'s own
 * existing scope — §6.1's wielded-tower-attack system is what the character
 * fights with during VS, and nothing in §4 asks the band-profile basic
 * attack to fire alongside it too (Q117).
 */
export function classBasicAttack(w: World, cls: NewClassDef): void {
  const wd = w.warden;
  if (wd.attackCooldown > 0) return;
  const a = cls.basicAttack;
  const target = w.nearestEnemy(wd.x, wd.y, a.range);
  if (!target) return;
  wd.attackCooldown = a.interval / w.derived.attackSpeedMul;
  const dmg = a.dps * a.interval * w.derived.powerMul;
  const onHit = passiveOnHit(cls);
  if (a.aoe > 0) {
    // Splash routes through the shared AoE convention (aoeFullTargets/aoeFalloff/
    // aoeFalloffFloor, data/towers.json) so a future kit's basic-attack aoe (p6b+)
    // doesn't silently skip the cap/falloff discipline every other splash source
    // already follows (code review on p6a).
    applyAoE(w, target.x, target.y, a.aoe, dmg, 'class_basic', { onHit }, {
      primary: target,
      damage: { fromX: wd.x, fromY: wd.y },
    });
  } else {
    damageEnemy(w, target, dmg, 'class_basic', { fromX: wd.x, fromY: wd.y });
    if (!target.dead) applyEffects(w, target, { onHit });
  }
  w.emit('class_basic', wd.x, wd.y, target.x, target.y);
}
