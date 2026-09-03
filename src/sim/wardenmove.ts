/**
 * fb030 (SPEC-FINAL §10 amendment): the Warden's dash — the base movement
 * dodge-dash and every class-active dash effect (Dash Slash, Quickstep,
 * Flame Road, Crimson Rush) — is a fast move over `dashDuration` seconds,
 * not a teleport. Shared by `run.ts` (base dash) and `classes.ts` (class
 * dashes) — a third module rather than an import from either, the same
 * reason `classes.ts`'s old `dashWarden` gives for reimplementing rather
 * than importing `run.ts`'s `blinkWarden`: `run.ts` already imports
 * `classes.ts`'s Command handlers, so the reverse import would cycle.
 */

import { GRID_H, GRID_W } from './grid';
import { clamp, lerp } from './math';
import { BASE } from './stats';
import type { World } from './world';

/**
 * fb053 (SPEC-FINAL §10 amendment, amends fb030): a dash's speed is
 * `dashSpeedMul` x the Warden's *current* movement speed — the caller passes
 * in the already-fully-multiplied value (`coreMoveSpeedMul`/
 * `classMoveSpeedMul` live in `cores.ts`/`classes.ts`; this module stays
 * dependency-free of either, the same reverse-import-cycle reason fb030's own
 * header gives for being a third module) — so distance falls out of speed x
 * duration and a move-speed buff/boon lengthens every dash's reach along with
 * ordinary movement.
 */
export function dashDistance(currentMoveSpeed: number, duration: number): number {
  return BASE.dashSpeedMul * currentMoveSpeed * duration;
}

/**
 * The four class-active dashes (Dash Slash, Quickstep, Flame Road, Crimson
 * Rush) keep their own authored `dashRange` (`data/classes.json`) as a
 * calibration input rather than a literal distance: this derives the travel
 * duration that reproduces that exact distance at `baseMoveSpeed`, so each
 * dash's tuned reach is unchanged at baseline while still inheriting
 * `dashDistance`'s scale-with-current-speed formula once a buff is active —
 * the same "same formula, own duration" split fb053's own acceptance text
 * asks for. `baseMoveSpeed` must be the *owning class's own* baseline move
 * speed (its permanent `moveSpeedBonus` applied, no gear/boons/temporary
 * multipliers) — every class that ships a dash active has a nonzero
 * `moveSpeedBonus`, and calibrating against the global `BASE.moveSpeed`
 * instead would silently overshoot each one's originally-tuned `dashRange`
 * at baseline (code review, fb053).
 */
export function classDashDuration(dashRange: number, baseMoveSpeed: number): number {
  return dashRange / (BASE.dashSpeedMul * baseMoveSpeed);
}

/**
 * Resolves where a dash of (dx, dy) actually lands: it ignores terrain and
 * friendly structures (fb002 — `wardenPassable` only fails on the border),
 * but must land somewhere legal, walking the line backwards until a legal
 * tile appears. Pure — does not move the Warden. Gameplay effects that need
 * the dash's endpoint at cast time (hit lines, heal counts, trail segments)
 * call this directly instead of waiting for the travel to finish.
 */
export function resolveDashTarget(w: World, dx: number, dy: number): { x: number; y: number } {
  const wd = w.warden;
  const tx = clamp(wd.x + dx, 0.4, GRID_W - 0.4);
  const ty = clamp(wd.y + dy, 0.4, GRID_H - 0.4);
  if (w.grid.wardenPassable(Math.floor(tx), Math.floor(ty))) return { x: tx, y: ty };
  for (let s = 0.9; s > 0; s -= 0.1) {
    const px = clamp(wd.x + dx * s, 0.4, GRID_W - 0.4);
    const py = clamp(wd.y + dy * s, 0.4, GRID_H - 0.4);
    if (w.grid.wardenPassable(Math.floor(px), Math.floor(py))) return { x: px, y: py };
  }
  return { x: wd.x, y: wd.y };
}

/** Starts the Warden travelling from its current position to `target` over `duration` seconds. */
export function startDashTravel(w: World, target: { x: number; y: number }, duration: number): void {
  const wd = w.warden;
  wd.dashTravel = { x0: wd.x, y0: wd.y, x1: target.x, y1: target.y, t: 0, duration: Math.max(duration, 1 / 600) };
}

/**
 * Advances an in-progress dash travel by `dt`, moving `Warden.x/y` along it
 * and clearing it once it lands exactly on its target. Returns whether a
 * travel was in progress this tick, so `updateWarden` knows to skip its own
 * input-driven movement for the tick (the travel is the sole driver of
 * position while it runs).
 */
export function tickDashTravel(w: World, dt: number): boolean {
  const wd = w.warden;
  const tr = wd.dashTravel;
  if (!tr) return false;
  tr.t += dt;
  if (tr.t >= tr.duration) {
    wd.x = tr.x1;
    wd.y = tr.y1;
    wd.dashTravel = null;
  } else {
    const f = tr.t / tr.duration;
    wd.x = lerp(tr.x0, tr.x1, f);
    wd.y = lerp(tr.y0, tr.y1, f);
  }
  return true;
}
