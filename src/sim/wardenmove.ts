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
import type { World } from './world';

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
