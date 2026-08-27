/**
 * Class framework (SPEC-V2 §2): the Active skill. Implemented as a sim
 * Command (`class_active`) so bots and replays trigger it exactly like any
 * other action; the effect itself dispatches on `ClassActive.kind` so new
 * classes can add kinds here without touching the Command plumbing.
 */
import { applyEffects } from './combat';
import { damageEnemy } from './enemies';
import type { Phase } from './types';
import { World } from './world';

/** Usable both TD and VS, per SPEC-V2 §2 — but not in menu/transition phases. */
const ACTIVE_PHASES: ReadonlySet<Phase> = new Set(['act1_build', 'act1_wave', 'act2']);

/** Returns whether the Active fired; false on cooldown, wrong phase, or no active defined. */
export function useClassActive(w: World): boolean {
  const wd = w.warden;
  if (wd.activeCooldown > 0) return false;
  if (!ACTIVE_PHASES.has(w.phase)) return false;
  const cls = w.content.classByKey.get(w.cfg.classKey);
  const active = cls?.active;
  if (!active) return false;

  const x = wd.x;
  const y = wd.y;
  switch (active.kind) {
    case 'burst_damage': {
      const list = w.enemiesInRadius(x, y, active.radius);
      for (const e of list) {
        if (e.dead) continue;
        damageEnemy(w, e, active.damage * w.derived.powerMul, 'class_active', { fromX: x, fromY: y });
        if (e.dead) continue;
        applyEffects(w, e, {
          source: 'class_active',
          slow: active.slow,
          slowDuration: active.slowDuration,
          burnDps: active.burnDps,
          burnDuration: active.burnDuration,
        });
      }
      w.emit('class_active', x, y, active.radius, 0);
      break;
    }
  }

  wd.activeCooldown = active.cooldownSeconds * (1 - w.derived.cdr);
  return true;
}
