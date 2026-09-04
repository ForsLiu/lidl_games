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
import { defaultKeyBindings, TOWER_SLOT_ACTIONS, type KeyBindings } from './keybindings';

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
  /** fb073: defaults applied when omitted, so existing callers/tests are unaffected. */
  bindings?: KeyBindings;
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
  const bindings = b.bindings ?? defaultKeyBindings();

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
    if (keys.has(bindings.upgradeSelection) || e.shiftKey) {
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
  /** fb073: defaults applied when omitted, so existing callers/tests are unaffected. */
  bindings?: KeyBindings;
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
  const bindings = b.bindings ?? defaultKeyBindings();
  return (e: KeyboardEvent) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    b.keys.add(k);
    b.onAnyKey?.();

    // Never rebindable — see keybindings.ts's module doc.
    if (k === 'escape') {
      b.togglePause?.();
      return;
    }
    if (k === bindings.dash) e.preventDefault();
    if (k === 'enter') b.queue.push({ k: 'call' });
    if (k === bindings.active1) {
      // p6d: Active1 is mouse-aimed too now (Field Kit, Chain Surge, Blood
      // Tithe); a kind that ignores aim stays self-centered as before.
      const aim = b.aim?.();
      b.queue.push({ k: 'class_active', aimX: aim?.x, aimY: aim?.y });
    }
    if (k === bindings.active2) {
      const aim = b.aim?.();
      b.queue.push({ k: 'class_active2', aimX: aim?.x, aimY: aim?.y });
    }
    if (k === bindings.toggleRanges) b.toggleRanges?.();
    if (k === bindings.cycleSpeed) b.cycleSpeed?.();
    if (k === bindings.toggleCharacterPanel) b.toggleCharacterPanel?.();
    if (k === bindings.toggleDpsPanel) b.toggleDpsPanel?.();
    if (k === bindings.toggleVsPanel) b.toggleVsPanel?.();
    if (k === bindings.clearSelection) b.clearSelection?.();
    // fb027: distinct from `bindCanvasInput`'s held-upgrade-key-plus-click
    // build-menu upgrade below — this fires once per press, against whatever
    // is selected, with no build-menu tower needed.
    if (k === bindings.upgradeSelection) b.upgradeSelection?.();
    if (k === bindings.sellSelection) b.sellSelection?.();

    // fb073: the level-up offer picker's 1/2/3 stay literal, independent of
    // whatever towerSlot1-3 are rebound to — picking a card and selecting a
    // tower are different concepts that happen to share default physical
    // keys, not the same action wearing two hats.
    if (b.isChoosing?.() && (k === '1' || k === '2' || k === '3')) {
      b.pickOffer?.(Number(k) - 1);
      return;
    }
    const slot = TOWER_SLOT_ACTIONS.findIndex((a) => bindings[a] === k);
    if (slot >= 0) b.selectTowerByIndex?.(slot);
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
export function clearKeysForPause(keys: Set<string>, bindings: KeyBindings = defaultKeyBindings()): void {
  const heldCharge = keys.has(bindings.active1);
  keys.clear();
  if (heldCharge) keys.add(bindings.active1);
}

/**
 * Movement axes from the held keys, quantised so replays stay exact. The
 * arrow keys are always live regardless of `bindings` — see keybindings.ts's
 * module doc for why they are not part of `ActionId`.
 */
export function movementFromKeys(
  keys: Set<string>,
  bindings: KeyBindings = defaultKeyBindings(),
): { mx: number; my: number } {
  let mx = 0;
  let my = 0;
  if (keys.has(bindings.moveLeft) || keys.has('arrowleft')) mx -= 1;
  if (keys.has(bindings.moveRight) || keys.has('arrowright')) mx += 1;
  if (keys.has(bindings.moveUp) || keys.has('arrowup')) my -= 1;
  if (keys.has(bindings.moveDown) || keys.has('arrowdown')) my += 1;
  return { mx, my };
}

export function gatherInput(
  keys: Set<string>,
  pending: Command[],
  cursorX: number,
  cursorY: number,
  dash: boolean,
  bindings: KeyBindings = defaultKeyBindings(),
): TickInput {
  const input = emptyInput();
  const move = movementFromKeys(keys, bindings);
  input.mx = move.mx;
  input.my = move.my;
  input.dash = dash;
  input.attack = true;
  input.aimX = cursorX;
  input.aimY = cursorY;
  // §4.1 (p6b): held continuously, like `dash`/`attack` — a charge-kind
  // Active1 reads this every tick rather than through a discrete Command.
  input.active1Held = keys.has(bindings.active1);
  input.cmds = pending;
  return input;
}
