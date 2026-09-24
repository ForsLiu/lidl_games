/**
 * DPS summary panel data model (owner feedback `feature-dps-summary`,
 * BACKLOG.md fb007, extended by fb007's segmented-bar redesign, owner
 * feedback `ui-dps-panel-bars`, BACKLOG-UI.md fb160; SPEC-FINAL §11).
 *
 * Everything here is read straight off `World.damageByWeapon`/`damageByType`/
 * `damageByWeaponType` — the same three accumulators `damageEnemy`
 * (`sim/enemies.ts`) credits on every hit and `buildReport` copies verbatim
 * into `RunReport` at run end — so the panel's "whole run" totals cannot
 * drift from what `RunReport` reports (a test asserts them equal at that
 * point). The "this wave" window isolates a slice of those same accumulators
 * via `damageSince()`/`damageMatrixSince()` against whichever snapshot marks
 * the window's start: `damageAtWaveStart` for an Act I wave (`startWave`,
 * `sim/run.ts`), `damageAtSunder` for the current VS wave
 * (`finishSundering`, `sim/sundering.ts`) — the same snapshot A5's own
 * `act2DamageSoFar` already isolates Act II with. Both windows stay computed
 * here (`vs-panel.ts`'s "live DPS this wave" column reads `.wave.bySource`),
 * even though fb160's redesigned panel body (`hud.ts`'s `dpsPanelBodyMarkup`)
 * only renders the `run` window now, per the owner feedback's own "whole-run
 * totals only (no per-wave view)" wording.
 *
 * "Source" rows cover tower types (TD) and wielded tower-type attacks (VS)
 * alike, since both credit the same tower-key source string (`towers.ts`,
 * `vswield.ts`) — the two are never live at once (towers petrify for the VS
 * wave), so one row per key already reads correctly in either phase — plus
 * class actives/passives/summons and the handful of other literal sources
 * `damageEnemy` sees (Core effects, reflect damage). "Type" rows cover the
 * six §3 damage types. fb160: each `bySource` row also carries `segments`,
 * that same row's damage split by type — the combined matrix
 * `damageByWeaponType` exists precisely because neither flat accumulator can
 * reconstruct this split on its own.
 *
 * Presentation only — this module never writes to the World.
 */

import { damageStyleColor, damageTypeDef } from '../sim/damagetypes';
import { damageMatrixSince, damageSince } from '../sim/run';
import type { World } from '../sim/world';

/** fb160: one damage-type slice of a `bySource` row's segmented bar. */
export interface DpsSegment {
  key: string;
  label: string;
  color: string;
  damage: number;
  dps: number;
  /** 0-100, this segment's share of its own row's total damage. */
  percent: number;
}

export interface DpsRow {
  key: string;
  label: string;
  damage: number;
  dps: number;
  /** fb160: this row's damage split by §3 type, sorted by damage descending. Empty for a `byType` row (a type cannot be split by itself). */
  segments: DpsSegment[];
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
  for (const k of Object.keys(byKey)) total += byKey[k] ?? 0;
  return total;
}

/** fb160: a row's damage split by type, sorted by damage descending like `rows()` itself. */
function segmentsFor(
  w: World,
  sourceRow: Record<string, number> | undefined,
  rowDamage: number,
  seconds: number,
  colorblind: boolean,
): DpsSegment[] {
  if (!sourceRow) return [];
  return Object.keys(sourceRow)
    .map((type) => {
      const damage = sourceRow[type] ?? 0;
      return {
        key: type,
        label: sourceLabel(w, type),
        color: damageStyleColor(w, type, colorblind),
        damage,
        dps: seconds > 0 ? damage / seconds : 0,
        percent: rowDamage > 0 ? (damage / rowDamage) * 100 : 0,
      };
    })
    .sort((a, b) => b.damage - a.damage || a.key.localeCompare(b.key));
}

function rows(
  w: World,
  byKey: Record<string, number>,
  seconds: number,
  matrix: Record<string, Record<string, number>> | undefined,
  colorblind: boolean,
): DpsRow[] {
  return Object.keys(byKey)
    .map((key) => {
      const damage = byKey[key] ?? 0;
      return {
        key,
        label: sourceLabel(w, key),
        damage,
        dps: seconds > 0 ? damage / seconds : 0,
        segments: segmentsFor(w, matrix?.[key], damage, seconds, colorblind),
      };
    })
    .sort((a, b) => b.damage - a.damage || a.key.localeCompare(b.key));
}

function windowData(
  w: World,
  label: string,
  bySource: Record<string, number>,
  byType: Record<string, number>,
  seconds: number,
  matrix: Record<string, Record<string, number>>,
  colorblind: boolean,
): DpsWindow {
  const damage = totalOf(bySource);
  return {
    label,
    seconds,
    damage,
    dps: seconds > 0 ? damage / seconds : 0,
    // Only `bySource` rows get a per-type `segments` breakdown: a `byType`
    // row already *is* one type, so splitting it by type again is meaningless.
    bySource: rows(w, bySource, seconds, matrix, colorblind),
    byType: rows(w, byType, seconds, undefined, colorblind),
  };
}

/**
 * Builds the panel's data model. Called fresh every time the panel needs to
 * redraw — cheap: all three accumulators hold at most a few dozen keys.
 * `colorblind` selects `data/damagetypes.json`'s `colorblindColor` for each
 * bar segment, matching every other per-damage-type color read in the
 * renderer (`damageStyleColor`'s own callers in `canvas.ts`).
 */
export function dpsPanelData(w: World, colorblind = false): DpsPanelData {
  const run = windowData(
    w,
    'Whole run',
    w.damageByWeapon,
    w.damageByType,
    w.tick / 60,
    w.damageByWeaponType,
    colorblind,
  );

  // Act II (including its level-up interrupt) isolates its window at the
  // Sundering, exactly like A5's own `act2DamageSoFar`; Act I isolates it at
  // the current wave's `startWave` call. Still computed for `vs-panel.ts`'s
  // "live DPS this wave" column even though the DPS panel's own body
  // (`hud.ts`) no longer renders this window — see the module doc.
  const wave = w.huntsWarden
    ? windowData(
        w,
        `VS wave ${w.cycle}`,
        damageSince(w.damageByWeapon, w.damageAtSunder),
        damageSince(w.damageByType, w.damageTypeAtSunder),
        w.act2Time,
        damageMatrixSince(w.damageByWeaponType, w.damageMatrixAtSunder),
        colorblind,
      )
    : windowData(
        w,
        `Wave ${w.wave}`,
        damageSince(w.damageByWeapon, w.damageAtWaveStart),
        damageSince(w.damageByType, w.damageTypeAtWaveStart),
        (w.tick - w.waveStartTick) / 60,
        damageMatrixSince(w.damageByWeaponType, w.damageMatrixAtWaveStart),
        colorblind,
      );

  return { wave, run };
}
