/**
 * SFX hooks (SPEC M8). The sim emits gameplay events; this maps them to cue
 * names and plays them through WebAudio.
 *
 * No audio assets ship with v1, so cues are synthesised: a short shaped tone
 * per cue family. The seam that matters is `AudioSink` — drop in a sample-based
 * sink later and nothing else changes.
 */

import type { Settings } from '../ui/settings';

export interface Cue {
  /** Base frequency in Hz. */
  freq: number;
  /** Seconds. */
  duration: number;
  type: OscillatorType;
  gain: number;
  /** Frequency at the end of the cue, for a sweep. */
  sweepTo?: number;
}

/** One cue per gameplay event worth hearing. Keys match the sim's fx names. */
export const CUES: Record<string, Cue> = {
  shot: { freq: 880, duration: 0.05, type: 'square', gain: 0.05 },
  bolt: { freq: 420, duration: 0.09, type: 'sawtooth', gain: 0.09 },
  arc: { freq: 1500, duration: 0.06, type: 'square', gain: 0.05 },
  boom: { freq: 160, duration: 0.22, type: 'triangle', gain: 0.18, sweepTo: 55 },
  nova: { freq: 640, duration: 0.24, type: 'sine', gain: 0.14, sweepTo: 1200 },
  cone: { freq: 240, duration: 0.08, type: 'sawtooth', gain: 0.04 },
  build: { freq: 300, duration: 0.1, type: 'triangle', gain: 0.12, sweepTo: 520 },
  upgrade: { freq: 520, duration: 0.14, type: 'triangle', gain: 0.13, sweepTo: 900 },
  sell: { freq: 400, duration: 0.1, type: 'triangle', gain: 0.1, sweepTo: 200 },
  gem: { freq: 1250, duration: 0.05, type: 'sine', gain: 0.05 },
  levelup: { freq: 520, duration: 0.4, type: 'sine', gain: 0.22, sweepTo: 1560 },
  wardenhit: { freq: 200, duration: 0.14, type: 'sawtooth', gain: 0.16, sweepTo: 90 },
  leak: { freq: 130, duration: 0.3, type: 'sawtooth', gain: 0.2, sweepTo: 70 },
  waveclear: { freq: 660, duration: 0.3, type: 'triangle', gain: 0.16, sweepTo: 990 },
  sunder: { freq: 90, duration: 1.1, type: 'sawtooth', gain: 0.3, sweepTo: 420 },
  dash: { freq: 700, duration: 0.08, type: 'sine', gain: 0.08, sweepTo: 340 },
  boss: { freq: 70, duration: 1.3, type: 'sawtooth', gain: 0.32, sweepTo: 190 },
  bossphase: { freq: 110, duration: 0.6, type: 'sawtooth', gain: 0.26, sweepTo: 300 },
  bosstelegraph: { freq: 300, duration: 0.12, type: 'square', gain: 0.1 },
  bossslam: { freq: 120, duration: 0.3, type: 'triangle', gain: 0.22, sweepTo: 60 },
  rift: { freq: 150, duration: 0.7, type: 'sawtooth', gain: 0.24, sweepTo: 480 },
  secondwind: { freq: 440, duration: 0.5, type: 'sine', gain: 0.24, sweepTo: 1320 },
};

/**
 * Some cues fire many times a tick in a 350-enemy fight. Each is rate-limited
 * so a volley reads as one sound rather than a wall of clipping.
 */
const MIN_GAP_SECONDS: Record<string, number> = {
  shot: 0.05,
  arc: 0.06,
  cone: 0.12,
  bolt: 0.07,
  gem: 0.05,
  boom: 0.06,
  wardenhit: 0.12,
  bosstelegraph: 0.2,
};

export interface AudioSink {
  play(cue: Cue, volume: number): void;
  resume(): void;
}

/** Synthesised sink. Constructed lazily so no context is created until asked. */
export class WebAudioSink implements AudioSink {
  private ctx: AudioContext | null = null;

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor =
      (globalThis as { AudioContext?: typeof AudioContext }).AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    return this.ctx;
  }

  resume(): void {
    const ctx = this.context();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  }

  play(cue: Cue, volume: number): void {
    const ctx = this.context();
    if (!ctx || volume <= 0) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = cue.type;
    osc.frequency.setValueAtTime(cue.freq, now);
    if (cue.sweepTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, cue.sweepTo), now + cue.duration);
    }
    gain.gain.setValueAtTime(cue.gain * volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + cue.duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + cue.duration + 0.02);
  }
}

/** Drops everything; used when audio is unavailable or muted. */
export class SilentSink implements AudioSink {
  play(): void {}
  resume(): void {}
}

export class Sfx {
  private sink: AudioSink;
  private lastPlayed = new Map<string, number>();
  private clock = 0;

  constructor(sink: AudioSink = new WebAudioSink()) {
    this.sink = sink;
  }

  resume(): void {
    this.sink.resume();
  }

  /** Advance the rate-limiter clock by real elapsed seconds. */
  tick(dt: number): void {
    this.clock += dt;
  }

  /** Play the cues for one tick's worth of sim events. */
  emit(events: readonly { k: string }[], settings: Settings): void {
    const volume = settings.masterVolume * settings.sfxVolume;
    if (volume <= 0) return;
    for (const e of events) {
      const cue = CUES[e.k];
      if (!cue) continue;
      const gap = MIN_GAP_SECONDS[e.k];
      if (gap !== undefined) {
        const last = this.lastPlayed.get(e.k) ?? -Infinity;
        if (this.clock - last < gap) continue;
        this.lastPlayed.set(e.k, this.clock);
      }
      this.sink.play(cue, volume);
    }
  }
}
