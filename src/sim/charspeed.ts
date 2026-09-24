/**
 * The character's live attack-speed and movement-speed composition — shared
 * by `classes.ts` (the character's own cadence/movement, Voltbolt's kit) and
 * `towers.ts` (Voltbolt's *Lightning Accelerate* tower passive), which cannot
 * import each other without a cycle (`classes.ts` already imports `towers.ts`).
 *
 * fb059 (§4.2 Voltbolt): the kit reads the character's **total** attack-speed
 * and movement-speed bonuses — Lightning Ball's and the Overdrive burst's
 * damage, the burst's radius, and the tower passive's two conversions. "Total"
 * is the live multiplier the character actually attacks/moves at, less 1:
 * every stat source (class band, gear, tree, boons), the timed multipliers
 * applied at the integration site (a Time Core's VS move bonus, an Archer's
 * draw penalty, a Recall Totem's attack-speed aura) and Overdrive's own stacks.
 */
import type { ClassEffect } from './content';
import { coreAttackSpeedMul, coreMoveSpeedMul } from './cores';
import { dist2 } from './math';
import { BASE } from './stats';
import type { World } from './world';

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

/** The run's Voltbolt *Overdrive* row, or null for every other class. */
function overdriveEffect(w: World): ClassEffect | null {
  const cls = w.content.classByKey.get(w.cfg.classKey);
  return cls && cls.active2.kind === 'overdrive_voltbolt' ? cls.active2 : null;
}

/**
 * fb059 (§4.2 Voltbolt *Overdrive*): "every basic attack during Overdrive
 * adds +2.5% attack speed ... stacking, additive within this one source per
 * SPEC-FINAL §2" — ranks of one source add (`1 + n x 2.5%`), and that one
 * factor multiplies against every other source. 1 outside the window.
 */
export function overdriveAttackSpeedMul(w: World): number {
  const n = w.warden.overdriveStacks;
  if (n <= 0) return 1;
  return 1 + n * (overdriveEffect(w)?.overdriveAtkSpdPerHit ?? 0);
}

/** fb059: Overdrive's movement-speed half — the same additive stack, its own per-hit number. */
export function overdriveMoveSpeedMul(w: World): number {
  const n = w.warden.overdriveStacks;
  if (n <= 0) return 1;
  return 1 + n * (overdriveEffect(w)?.overdriveMoveSpdPerHit ?? 0);
}

/**
 * The per-tick movement multipliers `updateWarden` applies at the integration
 * site rather than writing into `w.derived` (a cached view of the stat sheet,
 * not per-tick state): §4.2 Archer's "move −40% while drawing" (a
 * `charge_pierce` Active1 mid-charge) and fb059's Overdrive stacks.
 */
export function classMoveSpeedMul(w: World): number {
  const mul = overdriveMoveSpeedMul(w);
  const wd = w.warden;
  if (!wd.active1Charging) return mul;
  const cls = w.content.classByKey.get(w.cfg.classKey);
  if (!cls || cls.active1.kind !== 'charge_pierce') return mul;
  return mul * (cls.active1.moveMulWhileCharging ?? 1);
}

/** The character's live movement speed (tiles/s) — the exact composition `updateWarden` moves at. */
export function characterMoveSpeed(w: World): number {
  return w.derived.moveSpeed * coreMoveSpeedMul(w) * classMoveSpeedMul(w);
}

/**
 * The character's live attack-speed multiplier — the exact composition its
 * basic attack's cadence divides by (`classBasicAttack`): the stat sheet, a
 * Recall Totem's aura at the character's position and Overdrive's stacks. In
 * VS it also carries the two VS-only factors the character's wielded cadence
 * reads (`vswield.ts`): a Time Core's bonus and a Beacon shrine's haste (code
 * review, fb059). The wielded attacks themselves read neither the aura nor
 * Overdrive's stacks — Overdrive speeds the character's basic attack and its
 * Lightning Ball, not its wielded towers (QUESTIONS Q219).
 */
export function characterAttackSpeedMul(w: World): number {
  const wd = w.warden;
  const vs = w.huntsWarden ? coreAttackSpeedMul(w) * (1 + w.shrineHaste) : 1;
  return w.derived.attackSpeedMul * auraSpeedMul(w, wd.x, wd.y) * overdriveAttackSpeedMul(w) * vs;
}

/**
 * fb059: the character's total movement-speed bonus — live speed over the
 * base stat, less 1 (so a class's own +30% movement band counts). Can be
 * negative (a slowed or drawing character); every Voltbolt conversion floors
 * it at 0, a missing bonus is never a malus (QUESTIONS Q219).
 */
export function characterMoveSpeedBonus(w: World): number {
  return characterMoveSpeed(w) / BASE.moveSpeed - 1;
}

/** fb059: the character's total attack-speed bonus — `characterAttackSpeedMul` less 1. */
export function characterAttackSpeedBonus(w: World): number {
  return characterAttackSpeedMul(w) - 1;
}
