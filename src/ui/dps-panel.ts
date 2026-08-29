/**
 * DPS summary panel data model (owner feedback `feature-dps-summary`,
 * BACKLOG.md fb007; SPEC-FINAL §11).
 *
 * Everything here is read straight off `World.damageByWeapon`/`damageByType`
 * — the same two accumulators `damageEnemy` (`sim/enemies.ts`) credits on
 * every hit and `buildReport` copies verbatim into `RunReport` at run end —
 * so the panel's "whole run" totals cannot drift from what `RunReport`
 * reports (a test asserts them equal at that point). The "this wave" window
 * isolates a slice of those same accumulators via `damageSince()` against
 * whichever snapshot marks the window's start: `damageAtWaveStart` for an
 * Act I wave (`startWave`, `sim/run.ts`), `damageAtSunder` for the current VS
 * wave (`finishSundering`, `sim/sundering.ts`) — the same snapshot A5's own
 * `act2DamageSoFar` already isolates Act II with.
 *
 * "Source" rows cover tower types (TD) and wielded tower-type attacks (VS)
 * alike, since both credit the same tower-key source string (`towers.ts`,
 * `vswield.ts`) — the two are never live at once (towers petrify for the VS
 * wave), so one row per key already reads correctly in either phase — plus
 * class actives/passives/summons and the handful of other literal sources
 * `damageEnemy` sees (Core effects, reflect damage). "Type" rows cover the
 * six §3 damage types.
 *
 * Presentation only — this module never writes to the World.
 */

import { damageTypeDef } from '../sim/damagetypes';
import { damageSince } from '../sim/run';
import type { World } from '../sim/world';

export interface DpsRow {
  key: string;
  label: string;
  damage: number;
  dps: number;
}

export interface DpsWindow {
  label: string;
  seconds: number;
  damage: number;
  dps: number;
  bySource: DpsRow[];
  byType: DpsRow[];
}

export interface DpsPanelData {
  wave: DpsWindow;
  run: DpsWindow;
}

/** Human label for a `damageByWeapon`/`damageByType` key. Generic by design:
 * an unrecognized key falls through to the raw string rather than vanishing. */
function sourceLabel(w: World, key: string): string {
  const tower = w.content.towerByKey.get(key);
  if (tower) return tower.name;
  const dt = damageTypeDef(w, key);
  if (dt) return dt.name;
  const cls = w.content.classByKey.get(w.cfg.classKey);
  const clsName = cls?.name ?? 'Class';
  switch (key) {
    case 'class_basic':
      return `${clsName} — Basic Attack`;
    case 'class_active':
      return `${clsName} — Active 1`;
    case 'class_active2':
      return `${clsName} — Active 2`;
    case 'class_passive':
      return `${clsName} — Passive`;
    case 'class_summon':
      return `${clsName} — Summon`;
    case 'manual':
      return 'Manual Attack';
    // Plaguebringer's passive DoT (`enemies.ts`'s `spreading_plague` tick)
    // credits this literal key rather than `class_passive` — see `enemies.ts`.
    case 'spreading_plague':
      return `${clsName} — Passive`;
    default: {
      const core = w.content.coreByKey.get(key);
      if (core) return `Core: ${core.name}`;
      const enemy = w.content.enemyByKey.get(key);
      // No reflect mechanic exists in this codebase; an enemy-keyed source is
      // enemy-authored AoE that also hits other enemies (e.g. the
      // Warden-Eater's ground slam, `boss.ts`'s `updateBossSlam`), not damage
      // reflected back at its attacker.
      if (enemy) return `${enemy.name} (Enemy Damage)`;
      return key;
    }
  }
}

function totalOf(byKey: Record<string, number>): number {
  let total = 0;
  for (const k of Object.keys(byKey)) total += byKey[k];
  return total;
}

function rows(w: World, byKey: Record<string, number>, seconds: number): DpsRow[] {
  return Object.keys(byKey)
    .map((key) => ({
      key,
      label: sourceLabel(w, key),
      damage: byKey[key],
      dps: seconds > 0 ? byKey[key] / seconds : 0,
    }))
    .sort((a, b) => b.damage - a.damage || a.key.localeCompare(b.key));
}

function windowData(
  w: World,
  label: string,
  bySource: Record<string, number>,
  byType: Record<string, number>,
  seconds: number,
): DpsWindow {
  const damage = totalOf(bySource);
  return {
    label,
    seconds,
    damage,
    dps: seconds > 0 ? damage / seconds : 0,
    bySource: rows(w, bySource, seconds),
    byType: rows(w, byType, seconds),
  };
}

/**
 * Builds the panel's data model. Called fresh every time the panel needs to
 * redraw — cheap: both accumulators hold at most a few dozen keys.
 */
export function dpsPanelData(w: World): DpsPanelData {
  const run = windowData(w, 'Whole run', w.damageByWeapon, w.damageByType, w.tick / 60);

  // Act II (including its level-up interrupt) isolates its window at the
  // Sundering, exactly like A5's own `act2DamageSoFar`; Act I isolates it at
  // the current wave's `startWave` call.
  const wave = w.huntsWarden
    ? windowData(
        w,
        `VS wave ${w.cycle}`,
        damageSince(w.damageByWeapon, w.damageAtSunder),
        damageSince(w.damageByType, w.damageTypeAtSunder),
        w.act2Time,
      )
    : windowData(
        w,
        `Wave ${w.wave}`,
        damageSince(w.damageByWeapon, w.damageAtWaveStart),
        damageSince(w.damageByType, w.damageTypeAtWaveStart),
        (w.tick - w.waveStartTick) / 60,
      );

  return { wave, run };
}
