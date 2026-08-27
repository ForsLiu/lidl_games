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
 * shape.
 */
import { applyAoE, applyEffects } from './combat';
import type { NewClassDef } from './content';
import { damageEnemy } from './enemies';
import type { Phase } from './types';
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
  kind: 'burst_damage';
  cooldownSeconds: number;
  radius: number;
  damage: number;
  slow?: number;
  slowDuration?: number;
  burnDps?: number;
  burnDuration?: number;
}

function fireEffect(w: World, x: number, y: number, eff: BurstEffect): void {
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
    });
  }
  w.emit('class_active', x, y, eff.radius, 0);
}

/** Returns whether the Active fired; false on cooldown, wrong phase, or no active defined. */
export function useClassActive(w: World): boolean {
  const wd = w.warden;
  if (!ACTIVE_PHASES.has(w.phase)) return false;
  const cls = w.content.classByKey.get(w.cfg.classKey);
  if (!cls) return false;

  if (cls.legacy) {
    if (wd.activeCooldown > 0) return false;
    const active = cls.active;
    switch (active.kind) {
      case 'burst_damage':
        fireEffect(w, wd.x, wd.y, active);
        break;
    }
    wd.activeCooldown = active.cooldownSeconds * (1 - w.derived.cdr);
    return true;
  }

  if (wd.active1Cooldown > 0) return false;
  switch (cls.active1.kind) {
    case 'burst_damage':
      fireEffect(w, wd.x, wd.y, cls.active1);
      break;
  }
  wd.active1Cooldown = cls.active1.cooldownSeconds * (1 - w.derived.cdr);
  return true;
}

/** SPEC-FINAL §4 Active2 (E). No-op for a `legacy: true` class — it has only one Active. */
export function useClassActive2(w: World): boolean {
  if (!ACTIVE_PHASES.has(w.phase)) return false;
  const cls = w.content.classByKey.get(w.cfg.classKey);
  if (!cls || cls.legacy) return false;

  const wd = w.warden;
  if (wd.active2Cooldown > 0) return false;
  switch (cls.active2.kind) {
    case 'burst_damage':
      fireEffect(w, wd.x, wd.y, cls.active2);
      break;
  }
  wd.active2Cooldown = cls.active2.cooldownSeconds * (1 - w.derived.cdr);
  return true;
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
  if (a.aoe > 0) {
    // Splash routes through the shared AoE convention (aoeFullTargets/aoeFalloff/
    // aoeFalloffFloor, data/towers.json) so a future kit's basic-attack aoe (p6b+)
    // doesn't silently skip the cap/falloff discipline every other splash source
    // already follows (code review on p6a).
    applyAoE(w, target.x, target.y, a.aoe, dmg, 'class_basic', {}, {
      primary: target,
      damage: { fromX: wd.x, fromY: wd.y },
    });
  } else {
    damageEnemy(w, target, dmg, 'class_basic', { fromX: wd.x, fromY: wd.y });
  }
  w.emit('class_basic', wd.x, wd.y, target.x, target.y);
}
