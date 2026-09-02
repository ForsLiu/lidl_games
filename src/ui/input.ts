/**
 * Browser input mapping. Extracted from the game loop so the click and key
 * routing can be tested without a canvas or a running game.
 *
 * Nothing here touches the sim directly: handlers push Commands onto a queue
 * that the loop hands to `Run.step` as one TickInput.
 */

import { GRID_H, GRID_W, TILE } from '../sim/grid';
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
  // The canvas is always GRID_W*TILE x GRID_H*TILE logical pixels regardless of
  // its backing-store resolution (HiDPI) or its actual rendered CSS box (which
  // can be scaled down by a narrower viewport, per b078) — so map the click's
  // *fraction* across the rendered box onto the fixed logical grid, never the
  // rendered box's own pixel size and never the backing size.
  const width = r.width || canvas.clientWidth || GRID_W * TILE;
  const height = r.height || canvas.clientHeight || GRID_H * TILE;
  return {
    x: ((clientX - r.left) / width) * GRID_W,
    y: ((clientY - r.top) / height) * GRID_H,
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
  /** Fast-forward: cycles through the declared speeds (`SPEEDS`). */
  cycleSpeed?: () => void;
  /** SPEC-FINAL §11, owner feedback `feature-boon-stats-panel`: opens/closes the character panel. */
  toggleCharacterPanel?: () => void;
  /** SPEC-FINAL §11, owner feedback `feature-dps-summary`: opens/closes the DPS summary panel. */
  toggleDpsPanel?: () => void;
  /** SPEC-FINAL §6.2, owner feedback `feature-vs-wielded-side-panel`: opens/closes the VS wielded-attacks panel. */
  toggleVsPanel?: () => void;
  isChoosing?: () => boolean;
  onAnyKey?: () => void;
  /** Current mouse-aim point in tile coords, for a `dash_line`-kind Active2 (p6b). */
  aim?: () => { x: number; y: number };
  /** fb027: `U` — upgrades whatever tower/Core is currently selected, in place of a build-menu click. */
  upgradeSelection?: () => void;
  /** fb027: `X` — sells whatever tower is currently selected. */
  sellSelection?: () => void;
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
    if (k === 'q') {
      // p6d: Active1 is mouse-aimed too now (Field Kit, Chain Surge, Blood
      // Tithe); a kind that ignores aim stays self-centered as before.
      const aim = b.aim?.();
      b.queue.push({ k: 'class_active', aimX: aim?.x, aimY: aim?.y });
    }
    if (k === 'e') {
      const aim = b.aim?.();
      b.queue.push({ k: 'class_active2', aimX: aim?.x, aimY: aim?.y });
    }
    if (k === 'r') b.toggleRanges?.();
    if (k === 'f') b.cycleSpeed?.();
    if (k === 'c') b.toggleCharacterPanel?.();
    if (k === 'p') b.toggleDpsPanel?.();
    if (k === 'v') b.toggleVsPanel?.();
    if (k === '0') b.clearSelection?.();
    // fb027: distinct from `bindCanvasInput`'s held-`u`-plus-click build-menu
    // upgrade below — this fires once per press, against whatever is selected,
    // with no build-menu tower needed.
    if (k === 'u') b.upgradeSelection?.();
    if (k === 'x') b.sellSelection?.();

    if (k >= '1' && k <= '9') {
      if (b.isChoosing?.() && k <= '3') b.pickOffer?.(Number(k) - 1);
      else b.selectTowerByIndex?.(Number(k) - 1);
    }
  };
}

/**
 * Clears held keys for a pause — except `q`. Every other key here drives a
 * momentary action (movement, dash, attack) that must not carry through to
 * the resume; `q` drives a multi-tick hold/release state machine
 * (Circle-Slash-style charging, p6b) instead, so clearing it would read as
 * a release on the very next resumed tick's `gatherInput()` call (no
 * keydown re-fires for an already-held key), silently firing whatever
 * charge had accumulated with no player intent to release — a real
 * QA-found bug. A genuine release during the pause still works correctly:
 * `keyup` listeners stay attached and armed while paused, so physically
 * letting go of `q` mid-pause still removes it before this ever runs.
 */
export function clearKeysForPause(keys: Set<string>): void {
  const heldCharge = keys.has('q');
  keys.clear();
  if (heldCharge) keys.add('q');
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
  // §4.1 (p6b): held continuously, like `dash`/`attack` — a charge-kind
  // Active1 reads this every tick rather than through a discrete Command.
  input.active1Held = keys.has('q');
  input.cmds = pending;
  return input;
}
