/**
 * Browser input mapping. Extracted from the game loop so the click and key
 * routing can be tested without a canvas or a running game.
 *
 * Nothing here touches the sim directly: handlers push Commands onto a queue
 * that the loop hands to `Run.step` as one TickInput.
 */

import { TILE } from '../sim/grid';
import type { Command, TickInput } from '../sim/types';
import { emptyInput } from '../sim/types';

export interface PointerTarget {
  /** Tower id the player has selected for building, 0 = none. */
  selectedTower: number;
  cursorX: number;
  cursorY: number;
}

export interface InputQueue {
  push(cmd: Command): void;
}

export interface CanvasBinding {
  canvas: HTMLCanvasElement;
  view: PointerTarget;
  queue: InputQueue;
  /** Currently held keys, lower-cased. */
  keys: Set<string>;
  /** True while a modal or the pause menu owns input. */
  isBlocked?: () => boolean;
  /**
   * SPEC-V3 T2: a left click that is not placing a tower selects whatever is
   * under it, and empty ground deselects. Selection is presentation state, so
   * it is handed back through this callback rather than pushed as a Command.
   */
  onSelect?: (x: number, y: number) => void;
}

/** Converts a pointer event to tile coordinates, accounting for CSS scaling. */
export function pointerToTile(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  // The canvas backing store may be larger than its CSS box on a HiDPI screen,
  // so map through the CSS box and the logical tile size, never the backing size.
  const width = r.width || canvas.clientWidth || TILE;
  const height = r.height || canvas.clientHeight || TILE;
  return {
    x: ((clientX - r.left) / width) * (canvas.clientWidth || width) / TILE,
    y: ((clientY - r.top) / height) * (canvas.clientHeight || height) / TILE,
  };
}

/**
 * Wires mouse handling on the play canvas.
 * Left click builds the selected tower, right click sells, U or Shift upgrades.
 */
export function bindCanvasInput(b: CanvasBinding): void {
  const { canvas, view, queue, keys } = b;

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('mousemove', (e) => {
    const p = pointerToTile(canvas, e.clientX, e.clientY);
    view.cursorX = p.x;
    view.cursorY = p.y;
  });

  canvas.addEventListener('mousedown', (e) => {
    if (b.isBlocked?.()) return;
    // Update from the event itself: a click can arrive without a prior move
    // (touchpad tap, or the pointer entering over the canvas).
    const p = pointerToTile(canvas, e.clientX, e.clientY);
    view.cursorX = p.x;
    view.cursorY = p.y;
    const tx = Math.floor(p.x);
    const ty = Math.floor(p.y);

    if (e.button === 2) {
      queue.push({ k: 'sell', tx, ty });
      return;
    }
    if (e.button !== 0) return;
    if (keys.has('u') || e.shiftKey) {
      queue.push({ k: 'upgrade', tx, ty });
      return;
    }
    if (view.selectedTower > 0) {
      queue.push({ k: 'build', tower: view.selectedTower, tx, ty });
      return;
    }
    // Nothing to place, so the click is a selection. Empty ground clears it.
    b.onSelect?.(p.x, p.y);
  });
}

export interface KeyBinding {
  keys: Set<string>;
  queue: InputQueue;
  /** Level-up card index, 1-3, when the offer screen is open. */
  pickOffer?: (index: number) => void;
  selectTowerByIndex?: (index: number) => void;
  clearSelection?: () => void;
  toggleRanges?: () => void;
  togglePause?: () => void;
  /** Fast-forward: cycles 1x / 2x / 3x. */
  cycleSpeed?: () => void;
  isChoosing?: () => boolean;
  onAnyKey?: () => void;
}

/** Returns the keydown handler, so callers can attach and detach it. */
export function makeKeyDownHandler(b: KeyBinding): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    b.keys.add(k);
    b.onAnyKey?.();

    if (k === 'escape') {
      b.togglePause?.();
      return;
    }
    if (k === ' ') e.preventDefault();
    if (k === 'enter') b.queue.push({ k: 'call' });
    if (k === 'q') b.queue.push({ k: 'class_active' });
    if (k === 'r') b.toggleRanges?.();
    if (k === 'f') b.cycleSpeed?.();
    if (k === '0') b.clearSelection?.();

    if (k >= '1' && k <= '9') {
      if (b.isChoosing?.() && k <= '3') b.pickOffer?.(Number(k) - 1);
      else b.selectTowerByIndex?.(Number(k) - 1);
    }
  };
}

/** Movement axes from the held keys, quantised so replays stay exact. */
export function movementFromKeys(keys: Set<string>): { mx: number; my: number } {
  let mx = 0;
  let my = 0;
  if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
  if (keys.has('d') || keys.has('arrowright')) mx += 1;
  if (keys.has('w') || keys.has('arrowup')) my -= 1;
  if (keys.has('s') || keys.has('arrowdown')) my += 1;
  return { mx, my };
}

export function gatherInput(
  keys: Set<string>,
  pending: Command[],
  cursorX: number,
  cursorY: number,
  dash: boolean,
): TickInput {
  const input = emptyInput();
  const move = movementFromKeys(keys);
  input.mx = move.mx;
  input.my = move.my;
  input.dash = dash;
  input.attack = true;
  input.aimX = cursorX;
  input.aimY = cursorY;
  input.cmds = pending;
  return input;
}
