/**
 * Wall-clock pacing for the browser loop, including fast-forward.
 *
 * The sim only ever advances by whole fixed ticks, so "2x speed" means running
 * twice as many ticks per frame — never a larger dt. A run played at 3x is
 * therefore bit-identical to the same run played at 1x, which is what keeps
 * the seed + input log promise (SPEC 9.2) true while the player skips a lull.
 *
 * Extracted from the loop so the catch-up rules can be tested without a canvas.
 */

import { FIXED_DT } from '../sim/types';

/** Speeds the fast-forward control offers, cycled by F or picked directly from the dropdown (fb035). */
export const SPEEDS = [0.25, 0.5, 1, 2, 3, 10, 50] as const;

/** Ticks a single frame may run at 1x before the loop gives up catching up. */
export const MAX_CATCHUP_TICKS = 8;

/** Longest real frame the pacer will believe; anything more is a stall. */
export const MAX_FRAME_SECONDS = 0.25;

/** `SPEEDS` no longer starts at 1x (fb035 added slower options below it), so this is looked up rather than assumed to be index 0. */
const DEFAULT_SPEED_INDEX = SPEEDS.indexOf(1);

export class Pacer {
  private acc = 0;
  private speedIndex = DEFAULT_SPEED_INDEX;

  get speed(): number {
    return SPEEDS[this.speedIndex];
  }

  get label(): string {
    return `${this.speed}x`;
  }

  /** Advances to the next speed and returns it. */
  cycle(): number {
    this.speedIndex = (this.speedIndex + 1) % SPEEDS.length;
    return this.speed;
  }

  /** Jumps directly to a declared speed (the fb035 dropdown); unknown values are ignored. */
  setSpeed(speed: number): number {
    const idx = SPEEDS.indexOf(speed as (typeof SPEEDS)[number]);
    if (idx >= 0) this.speedIndex = idx;
    return this.speed;
  }

  reset(): void {
    this.acc = 0;
    this.speedIndex = DEFAULT_SPEED_INDEX;
  }

  /** Drops any banked time; used when resuming from pause. */
  clearBacklog(): void {
    this.acc = 0;
  }

  /**
   * How many sim ticks this frame should run. The catch-up cap scales with the
   * speed, so 3x is allowed to do three times the work of 1x but no more —
   * without that, a slow frame at 3x would compound into a spiral.
   */
  plan(dtReal: number): number {
    const dt = Math.min(MAX_FRAME_SECONDS, Math.max(0, dtReal)) * this.speed;
    this.acc += dt;
    const cap = MAX_CATCHUP_TICKS * this.speed;
    let ticks = Math.floor(this.acc / FIXED_DT);
    if (ticks > cap) {
      // Too far behind to catch up honestly: run the cap and drop the rest,
      // so the game slows down rather than freezing.
      ticks = cap;
      this.acc = 0;
      return ticks;
    }
    this.acc -= ticks * FIXED_DT;
    return ticks;
  }
}
