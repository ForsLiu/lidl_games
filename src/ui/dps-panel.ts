/**
 * DPS summary panel data model (owner feedback `feature-dps-summary`,
 * BACKLOG.md fb007; SPEC-FINAL §11).
 *
 * fb160 (owner feedback `ui-dps-panel-bars`): **whole-run totals only** — no
 * per-wave view any more. Total damage at the top, then one horizontal bar per
 * source, each bar segmented by §3 damage *type* in `data/damagetypes.json`'s
 * colors, the source's total at the bar's end, sorted by total; hovering a
 * segment names that type's amount and its percent of the source.
 *
 * Everything here is read straight off `World.damageBySourceType` — the
 * source x type matrix `damageEnemy` (`sim/enemies.ts`) credits at the same
 * choke point as the flat `damageByWeapon`/`damageByType` ledgers, and which
 * `buildReport` copies verbatim into `RunReport` — so a bar's total, and each
 * of its segments, cannot drift from what `RunReport` reports (the tests
 * reconcile all three ledgers against the rendered numbers).
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

import { damageStyleColor } from '../sim/damagetypes';
import { damageSince } from '../sim/run';
import type { World } from '../sim/world';

/** One damage-type slice of one source's bar. */
export interface DpsSegment {
  /** §3 damage-type key (`data/damagetypes.json`). */
  type: string;
  label: string;
  color: string;
  damage: number;
  /** This type's share of its source's total, 0..1. */
  share: number;
}

/** One source's bar: its whole-run total, split by damage type. */
export interface DpsBar {
  key: string;
  label: string;
  damage: number;
  dps: number;
  /** Bar length as a share of the largest source's total, 0..1. */
  length: number;
  segments: DpsSegment[];
}

export interface DpsPanelData {
  seconds: number;
  damage: number;
  dps: number;
  bars: DpsBar[];
}

/** Human label for a damage source key. Generic by design: an unrecognized
 * key falls through to the raw string rather than vanishing. */
function sourceLabel(w: World, key: string): string {
  const tower = w.content.towerByKey.get(key);
  if (tower) return tower.name;
  const dt = w.content.damageTypeByKey.get(key);
  if (dt) return dt.name;
  const cls = w.content.classByKey.get(w.cfg.classKey);
  const clsName = cls?.name ?? 'Class';
  switch (key) {
    case 'class_basic':
      return `${clsName} — Basic Attack`;
    case 'class_active':
      return `${clsName} — ${cls?.active1.name ?? 'Active 1'}`;
    case 'class_active2':
      return `${clsName} — ${cls?.active2.name ?? 'Active 2'}`;
    case 'class_passive':
      return `${clsName} — ${cls?.passive.name ?? 'Passive'}`;
    case 'class_summon':
      return `${clsName} — Summon`;
    case 'manual':
      return 'Manual Attack';
    // Plaguebringer's passive DoT (`enemies.ts`'s `spreading_plague` tick)
    // credits this literal key rather than `class_passive` — see `enemies.ts`.
    // fb057's `MADNESS_SOURCE`: a mad (or converted) enemy's own strikes,
    // kit-attributed to the Madness King's passive (fb160 QA: it showed raw).
    case 'madness':
      return `${clsName} — ${cls?.passive.name ?? 'Passive'} (maddened enemies)`;
    case 'spreading_plague':
      return `${clsName} — ${cls?.passive.name ?? 'Passive'}`;
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

function typeLabel(w: World, key: string): string {
  return w.content.damageTypeByKey.get(key)?.name ?? key;
}

/**
 * Builds the panel's data model. Called fresh every time the panel needs to
 * redraw — cheap: the matrix holds a few dozen sources x six types at most.
 * `colorblind` picks each type's authored colorblind-safe color instead
 * (Settings' accessible palette, fb005).
 */
export function dpsPanelData(w: World, colorblind = false): DpsPanelData {
  const seconds = w.tick / 60;
  const bars: DpsBar[] = [];
  for (const key of Object.keys(w.damageBySourceType)) {
    const row = w.damageBySourceType[key] ?? {};
    let damage = 0;
    for (const t of Object.keys(row)) damage += row[t] ?? 0;
    if (!(damage > 0)) continue;
    const segments = Object.keys(row)
      .filter((t) => (row[t] ?? 0) > 0)
      .map((t) => {
        const d = row[t] ?? 0;
        return { type: t, label: typeLabel(w, t), color: damageStyleColor(w, t, colorblind), damage: d, share: d / damage };
      })
      .sort((a, b) => b.damage - a.damage || a.type.localeCompare(b.type));
    bars.push({ key, label: sourceLabel(w, key), damage, dps: seconds > 0 ? damage / seconds : 0, length: 0, segments });
  }
  bars.sort((a, b) => b.damage - a.damage || a.key.localeCompare(b.key));
  const top = bars[0]?.damage ?? 0;
  for (const b of bars) b.length = top > 0 ? b.damage / top : 0;
  let damage = 0;
  for (const b of bars) damage += b.damage;
  return { seconds, damage, dps: seconds > 0 ? damage / seconds : 0, bars };
}

/** One source's damage over the current wave, for the VS wielded-attacks panel. */
export interface WaveSourceRow {
  key: string;
  damage: number;
  dps: number;
}

/**
 * The current wave's damage per source — the window the DPS panel used to
 * show as "this wave" before fb160 made it whole-run only. The VS panel's
 * per-attack "This wave" line (`vs-panel.ts`, fb037) still reads it: Act II
 * isolates its window at the Sundering (`damageAtSunder`, the same snapshot
 * A5's `act2DamageSoFar` uses), Act I at the current wave's `startWave`.
 */
export function waveDamageBySource(w: World): WaveSourceRow[] {
  const bySource = w.huntsWarden
    ? damageSince(w.damageByWeapon, w.damageAtSunder)
    : damageSince(w.damageByWeapon, w.damageAtWaveStart);
  const seconds = w.huntsWarden ? w.act2Time : (w.tick - w.waveStartTick) / 60;
  return Object.keys(bySource).map((key) => {
    const damage = bySource[key] ?? 0;
    return { key, damage, dps: seconds > 0 ? damage / seconds : 0 };
  });
}
