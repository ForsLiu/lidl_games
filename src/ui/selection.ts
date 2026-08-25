/**
 * Click-to-select (SPEC-V3 §10 T2: "click has no reaction").
 *
 * Nothing in the game was selectable before this: clicking either placed a
 * tower or did nothing at all, which is the report V3 is answering.
 *
 * Presentation only. Selection lives in `ViewState`, never in the World, so it
 * cannot affect a replay — picking a target is a pure query over sim state.
 *
 * The click handler and the per-frame sweep live here rather than in the game
 * loop so that tests exercise the shipped code. An earlier version had
 * `main.ts` implement both inline and the test re-implement them, which meant
 * deleting the wiring entirely left the suite green.
 */

import type { Enemy, Structure } from '../sim/types';
import type { World } from '../sim/world';
import { CORE_H, CORE_W, CORE_X, CORE_Y } from '../sim/grid';

export type Selection =
  | { kind: 'tower'; id: number }
  | { kind: 'enemy'; id: number }
  | { kind: 'warden' }
  | { kind: 'core' }
  | null;

/**
 * How close a click must land to a body to count as hitting it, in tiles.
 *
 * Both were far too generous at first: the Warden is drawn at 0.25 tiles but
 * grabbed at 0.9, and an enemy's grab was its radius *plus* 0.35 — twice its
 * drawn body. The result was that you could not click a tower you were standing
 * beside, or one with a husk in the next tile, which is exactly when you want
 * to. Now both match what is drawn, and a click inside a tower's own tile
 * prefers the tower unless a body is genuinely on top of it.
 */
const ENEMY_GRAB = 0.05;
const WARDEN_GRAB = 0.35;

/**
 * What is under a point. A structure wins inside its own tile unless a body
 * actually covers the click; otherwise the character, then an enemy, then the
 * tile's structure. Returns null over empty ground, which is what deselects.
 */
export function pickAt(w: World, x: number, y: number): Selection {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const wd = w.warden;
  const onWarden = sqDist(x, y, wd.x, wd.y) <= WARDEN_GRAB * WARDEN_GRAB;
  const enemy = enemyAt(w, x, y);

  const tx = Math.floor(x);
  const ty = Math.floor(y);
  const inBounds = w.grid.inBounds(tx, ty);
  const structure = inBounds ? w.structureAt(tx, ty) : null;
  const tower = structure && !structure.dead ? structure : null;

  // A tower occupies its whole tile, so a click inside that tile means the
  // tower unless something is standing right on the spot.
  if (tower && !onWarden && !enemy) return { kind: 'tower', id: tower.id };
  if (onWarden) return { kind: 'warden' };
  if (enemy) return { kind: 'enemy', id: enemy.id };
  if (tower) return { kind: 'tower', id: tower.id };
  if (inBounds && isCoreTile(tx, ty)) return { kind: 'core' };
  return null;
}

function isCoreTile(tx: number, ty: number): boolean {
  return tx >= CORE_X && tx < CORE_X + CORE_W && ty >= CORE_Y && ty < CORE_Y + CORE_H;
}

/**
 * Closest live enemy whose body contains the point, or null.
 *
 * Burrowed enemies count: they are drawn (faded) and a player can see them, so
 * refusing to select something visible reads as the click being broken. Being
 * untargetable by towers is a combat rule, not an inspection one.
 */
function enemyAt(w: World, x: number, y: number): Enemy | null {
  let best: Enemy | null = null;
  let bestD = Infinity;
  for (const e of w.enemies) {
    if (e.dead) continue;
    const grab = e.radius + ENEMY_GRAB;
    const d = sqDist(x, y, e.x, e.y);
    if (d > grab * grab) continue;
    // Ties broken by id so a click on overlapping bodies is deterministic.
    if (d < bestD || (d === bestD && best !== null && e.id < best.id)) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

function sqDist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/**
 * Whether a selection still refers to something that exists. Enemies die and
 * towers are sold mid-run, and a stale selection would keep drawing a
 * highlight on empty ground.
 */
export function selectionAlive(w: World, sel: Selection): boolean {
  if (!sel) return false;
  if (sel.kind === 'warden' || sel.kind === 'core') return true;
  if (sel.kind === 'enemy') return w.enemies.some((e) => e.id === sel.id && !e.dead);
  return w.structures.some((s) => s.id === sel.id && !s.dead);
}

/** The selected structure, or null. */
export function selectedStructure(w: World, sel: Selection): Structure | null {
  if (sel?.kind !== 'tower') return null;
  return w.structures.find((s) => s.id === sel.id && !s.dead) ?? null;
}

/** The selected enemy, or null. */
export function selectedEnemy(w: World, sel: Selection): Enemy | null {
  if (sel?.kind !== 'enemy') return null;
  return w.enemies.find((e) => e.id === sel.id && !e.dead) ?? null;
}

/** True when two selections point at the same thing. */
export function sameSelection(a: Selection, b: Selection): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'warden' || a.kind === 'core') return true;
  return (a as { id: number }).id === (b as { id: number }).id;
}

/** Minimal view of `ViewState` this module needs, so it does not import the renderer. */
export interface SelectionHost {
  selection: Selection;
}

/**
 * The shipped click behaviour: select what is under the point, and clear when
 * the same thing is clicked again so every click produces a visible change.
 *
 * Returned as a closure rather than written inline in the game loop so the test
 * suite drives the same code the browser does.
 */
export function makeSelectHandler(
  host: SelectionHost,
  world: () => World | null,
): (x: number, y: number) => void {
  return (x, y) => {
    const w = world();
    if (!w) return;
    const picked = pickAt(w, x, y);
    host.selection = sameSelection(picked, host.selection) ? null : picked;
  };
}

/** Clears a selection whose target has gone. Called once per frame. */
export function sweepSelection(host: SelectionHost, w: World): void {
  if (!selectionAlive(w, host.selection)) host.selection = null;
}
