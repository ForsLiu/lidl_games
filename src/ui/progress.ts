/**
 * "How far into this am I?" (playtest report, 2026-08-25: "add more indicator
 * to the progress of stage").
 *
 * Act I is a countable ten waves; Act II is a ten-minute clock with scheduled
 * events on it. Both are derived here as a plain model so the HUD only has to
 * draw it, and so the schedule can be tested against the sim's own timings.
 *
 * Presentation only — nothing here writes to the World.
 */

import { xpToReach } from '../sim/progression';
import type { World } from '../sim/world';

export interface ProgressMarker {
  /** 0..1 along the bar. */
  at: number;
  label: string;
  kind: 'elite' | 'rift' | 'boss';
  /** True once the run has passed it. */
  done: boolean;
}

export interface RunProgress {
  /** Headline for the current stage. */
  title: string;
  /** One line saying what is happening and what is next. */
  detail: string;
  /** 0..1 through the whole act. */
  fraction: number;
  markers: ProgressMarker[];
  /** Secondary bar: wave clear in Act I, XP in Act II. */
  sub: { label: string; fraction: number; text: string } | null;
}

function mmss(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Live enemies plus everything the active wave has still to send. */
export function waveRemaining(w: World): number {
  const alive = w.enemies.reduce((n, e) => n + (e.dead ? 0 : 1), 0);
  return alive + w.spawnQueue.length;
}

export function runProgress(w: World): RunProgress {
  return w.huntsWarden ? act2Progress(w) : act1Progress(w);
}

function act1Progress(w: World): RunProgress {
  const total = Math.max(1, w.waveCount);
  const cleared = w.wavesCleared;

  if (w.phase === 'dusk' || w.phase === 'soulpick') {
    return {
      title: 'Dusk',
      detail:
        w.phase === 'dusk'
          ? `The Vale is holding. ${Math.ceil(w.duskTimer)}s before your towers petrify.`
          : 'Choose which souls to bind.',
      fraction: 1,
      markers: [],
      sub: null,
    };
  }

  if (w.phase === 'dawn') {
    return {
      title: `Dawn — Cycle ${w.cycle} of ${w.totalCycles}`,
      detail: 'Rekindle a petrified tower to fight again, or leave it standing.',
      fraction: 0,
      markers: [],
      sub: null,
    };
  }

  const building = w.phase === 'act1_build';
  const remaining = waveRemaining(w);
  const wave = Math.max(1, w.wave || cleared + 1);
  const dayLabel = w.totalCycles > 1 ? `Day ${w.cycle} — ` : '';

  return {
    title: building ? `${dayLabel}Build — wave ${wave} of ${total}` : `${dayLabel}Wave ${wave} of ${total}`,
    detail: building
      ? `${Math.ceil(w.buildTimer)}s to build. Enter calls the wave early for ${Math.round(
          w.buildTimer * w.content.waves.earlyCallGoldPerSecond,
        )} gold.`
      : `${remaining} enemy${remaining === 1 ? '' : 'ies'} left in this wave · Core at ${Math.round(
          (w.coreHp / w.coreMaxHp) * 100,
        )}%`,
    fraction: Math.min(1, cleared / total),
    markers: Array.from({ length: total }, (_, i) => ({
      at: (i + 1) / total,
      label: `Wave ${i + 1}`,
      kind: i + 1 === total ? ('boss' as const) : ('elite' as const),
      done: i < cleared,
    })),
    sub: building ? null : waveBar(w, wave, remaining),
  };
}

/**
 * How far through the active wave the run is: everything the wave has already
 * sent, minus what is still standing, over the wave's full size.
 */
function waveBar(w: World, wave: number, remaining: number): RunProgress['sub'] {
  const sent = w.spawnedByWave[wave] ?? 0;
  const total = sent + w.spawnQueue.length;
  if (total <= 0) return { label: 'Wave', fraction: 1, text: 'clear' };
  const killed = Math.max(0, total - remaining);
  return {
    label: 'Wave',
    fraction: Math.max(0, Math.min(1, killed / total)),
    text: `${killed} / ${total} down`,
  };
}

function act2Progress(w: World): RunProgress {
  const sp = w.content.spawns;
  const t = w.act2Time;
  const bossAt = sp.bossTimeSeconds;
  const span = Math.max(1, bossAt);

  const markers: ProgressMarker[] = [];
  for (let n = 1; n * sp.eliteIntervalSeconds < bossAt; n++) {
    const at = n * sp.eliteIntervalSeconds;
    markers.push({ at: at / span, label: `Elite ${mmss(at)}`, kind: 'elite', done: t >= at });
  }
  for (const at of sp.riftTimes) {
    if (at >= bossAt) continue;
    markers.push({ at: at / span, label: `Rift ${mmss(at)}`, kind: 'rift', done: t >= at });
  }
  markers.push({ at: 1, label: `Warden-Eater ${mmss(bossAt)}`, kind: 'boss', done: w.bossSpawned });

  const next = markers.find((m) => !m.done);
  const alive = w.enemies.reduce((n, e) => n + (e.dead ? 0 : 1), 0);
  const need = xpToReach(w.level + 1);

  return {
    title: w.bossSpawned ? 'The Warden-Eater' : `Nightfall ${mmss(t)}`,
    detail: w.bossSpawned
      ? `${alive} on the field. Kill it and the Vale holds.`
      : `${alive} on the field · next: ${next ? `${next.label.split(' ')[0]} in ${mmss(nextGap(markers, t, span))}` : '—'}`,
    fraction: Math.min(1, t / span),
    markers,
    sub: {
      label: `Level ${w.level}`,
      fraction: Math.max(0, Math.min(1, w.xp / need)),
      text: `${Math.floor(w.xp)} / ${need} XP`,
    },
  };
}

function nextGap(markers: ProgressMarker[], t: number, span: number): number {
  const next = markers.find((m) => !m.done);
  return next ? next.at * span - t : 0;
}
