/**
 * fb073: player-configurable keyboard bindings. QUALITY.md BETA's Settings
 * checklist ("key remapping") — everything in `input.ts` used to be a
 * hardcoded literal.
 *
 * Presentation/input-mapping only, like `settings.ts` — nothing here changes
 * the simulation, so a replay is identical whatever a player has rebound.
 * Kept as its own module/localStorage key rather than folded into `Settings`:
 * it is a different shape (action -> single-character key) that needs its
 * own conflict-checked setter, not a plain slider/toggle.
 *
 * Deliberately NOT rebindable, and so absent from `ActionId`:
 *  - Escape (pause) — a near-universal convention, and pause needs to always
 *    be reachable even if every other key gets tangled into a conflict.
 *  - The arrow keys as a movement alternate to WASD — always-on regardless of
 *    what `moveUp`/`moveDown`/`moveLeft`/`moveRight` are rebound to, so a
 *    player never loses all movement input mid-rebind.
 *  - The level-up offer picker's `1`/`2`/`3` — a different physical-key
 *    concept from tower-slot selection (`towerSlot1..9` below), which reuses
 *    the same *default* keys but is independently rebindable; see the
 *    comment at its use site in `input.ts`.
 */

export type ActionId =
  | 'moveUp'
  | 'moveDown'
  | 'moveLeft'
  | 'moveRight'
  | 'dash'
  | 'active1'
  | 'active2'
  | 'toggleRanges'
  | 'cycleSpeed'
  | 'toggleCharacterPanel'
  | 'toggleDpsPanel'
  | 'toggleVsPanel'
  | 'upgradeSelection'
  | 'sellSelection'
  | 'clearSelection'
  | 'towerSlot1'
  | 'towerSlot2'
  | 'towerSlot3'
  | 'towerSlot4'
  | 'towerSlot5'
  | 'towerSlot6'
  | 'towerSlot7'
  | 'towerSlot8'
  | 'towerSlot9';

export type KeyBindings = Record<ActionId, string>;

/** In tower-slot index order (0-based), for `selectTowerByIndex`. */
export const TOWER_SLOT_ACTIONS: ActionId[] = [
  'towerSlot1',
  'towerSlot2',
  'towerSlot3',
  'towerSlot4',
  'towerSlot5',
  'towerSlot6',
  'towerSlot7',
  'towerSlot8',
  'towerSlot9',
];

/** Display order and label for the Settings "Controls" panel. */
export const ACTION_ORDER: { id: ActionId; label: string }[] = [
  { id: 'moveUp', label: 'Move up' },
  { id: 'moveDown', label: 'Move down' },
  { id: 'moveLeft', label: 'Move left' },
  { id: 'moveRight', label: 'Move right' },
  { id: 'dash', label: 'Dash' },
  { id: 'active1', label: 'Class Active 1' },
  { id: 'active2', label: 'Class Active 2' },
  { id: 'toggleRanges', label: 'Toggle tower ranges' },
  { id: 'cycleSpeed', label: 'Cycle game speed' },
  { id: 'toggleCharacterPanel', label: 'Character panel' },
  { id: 'toggleDpsPanel', label: 'DPS panel' },
  { id: 'toggleVsPanel', label: 'VS wielded-attacks panel' },
  { id: 'upgradeSelection', label: 'Upgrade selection' },
  { id: 'sellSelection', label: 'Sell selection' },
  { id: 'clearSelection', label: 'Clear selection' },
  { id: 'towerSlot1', label: 'Tower slot 1' },
  { id: 'towerSlot2', label: 'Tower slot 2' },
  { id: 'towerSlot3', label: 'Tower slot 3' },
  { id: 'towerSlot4', label: 'Tower slot 4' },
  { id: 'towerSlot5', label: 'Tower slot 5' },
  { id: 'towerSlot6', label: 'Tower slot 6' },
  { id: 'towerSlot7', label: 'Tower slot 7' },
  { id: 'towerSlot8', label: 'Tower slot 8' },
  { id: 'towerSlot9', label: 'Tower slot 9' },
];

export function defaultKeyBindings(): KeyBindings {
  return {
    moveUp: 'w',
    moveDown: 's',
    moveLeft: 'a',
    moveRight: 'd',
    dash: ' ',
    active1: 'q',
    active2: 'e',
    toggleRanges: 'r',
    cycleSpeed: 'f',
    toggleCharacterPanel: 'c',
    toggleDpsPanel: 'p',
    toggleVsPanel: 'v',
    upgradeSelection: 'u',
    sellSelection: 'x',
    clearSelection: '0',
    towerSlot1: '1',
    towerSlot2: '2',
    towerSlot3: '3',
    towerSlot4: '4',
    towerSlot5: '5',
    towerSlot6: '6',
    towerSlot7: '7',
    towerSlot8: '8',
    towerSlot9: '9',
  };
}

export const KEYBINDINGS_KEY = 'stonewake.keybindings.v1';

/**
 * Single-character fallback pool for `sanitizeKeyBindings` when an action's
 * stored key AND its own default are both already claimed/invalid (a chained
 * collision, e.g. one action's override lands on another action's default) —
 * comfortably more candidates than `ACTION_ORDER` has entries, so a free,
 * valid key always exists.
 */
const FALLBACK_KEY_POOL = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');

/**
 * True if `key` cannot validly belong to `action` in the output of
 * `sanitizeKeyBindings`: already claimed by an earlier action (`used`),
 * always-live movement (`UNBINDABLE_KEYS`), or reserved by a hardcoded
 * literal for a different action (`reservedKeyLabel`).
 */
function keyUnavailable(id: ActionId, key: string, used: Set<string>): boolean {
  return used.has(key) || UNBINDABLE_KEYS.has(key) || reservedKeyLabel(id, key) !== null;
}

/**
 * Fills in any action a stale/hand-edited save is missing with its default,
 * lower-cases every key, and de-duplicates: a hand-edited or corrupted save
 * can assign an action a key that collides with another action, an
 * always-live movement key, or a reserved literal (`rebindKey`/the Hub's
 * conflict check only prevent these going forward, at write time). Keeps the
 * first assignment in `ACTION_ORDER`; a later action holding an unavailable
 * key resets to its own default, or — if that default is ALSO unavailable —
 * the first free, valid key in `FALLBACK_KEY_POOL`. Same policy
 * `makeKeyDownHandler`'s independent `if` checks would otherwise both
 * silently fire for one keypress.
 */
export function sanitizeKeyBindings(b: Partial<KeyBindings> | null | undefined): KeyBindings {
  const defaults = defaultKeyBindings();
  const out = { ...defaults };
  for (const { id } of ACTION_ORDER) {
    const v = b?.[id];
    if (typeof v === 'string' && v.length > 0) out[id] = v.toLowerCase();
  }
  const used = new Set<string>();
  for (const { id } of ACTION_ORDER) {
    let candidate = out[id];
    if (keyUnavailable(id, candidate, used)) {
      candidate = defaults[id];
      if (keyUnavailable(id, candidate, used)) {
        candidate = FALLBACK_KEY_POOL.find((k) => !keyUnavailable(id, k, used)) ?? defaults[id];
      }
    }
    out[id] = candidate;
    used.add(candidate);
  }
  return out;
}

export function loadKeyBindings(): KeyBindings {
  try {
    const raw = globalThis.localStorage?.getItem(KEYBINDINGS_KEY);
    if (!raw) return defaultKeyBindings();
    return sanitizeKeyBindings(JSON.parse(raw) as Partial<KeyBindings>);
  } catch {
    return defaultKeyBindings();
  }
}

export function saveKeyBindings(b: KeyBindings): void {
  try {
    globalThis.localStorage?.setItem(KEYBINDINGS_KEY, JSON.stringify(b));
  } catch {
    // Storage unavailable: bindings simply do not persist.
  }
}

/**
 * Always-live keys no action may be rebound onto — the arrow-key movement
 * alternate `movementFromKeys` reads unconditionally (see the module doc
 * above). `rebindKey` doesn't reject these itself (it only knows about
 * `ActionId` conflicts); the Hub's rebind-capture UI checks this set before
 * calling it, so a player can't silently create a key that both moves and
 * fires some other action with no conflict warning.
 */
export const UNBINDABLE_KEYS = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

/**
 * fb079: keys reserved by a hardcoded, never-rebindable literal elsewhere in
 * `input.ts`'s `makeKeyDownHandler`, distinct from `UNBINDABLE_KEYS` (a flat
 * per-key bar with no notion of which action is being rebound). These two
 * need per-action awareness instead of a flat set:
 *  - `enter` unconditionally triggers the call-wave Command, for every
 *    action — rebinding anything onto it would double-fire alongside it.
 *  - `1`/`2`/`3` unconditionally trigger the level-up offer picker while
 *    `isChoosing`, for every action EXCEPT the matching towerSlot1/2/3 —
 *    that pair already legitimately shares the same physical key by design
 *    (see `input.ts`'s module doc and its `isChoosing`-gated block), so
 *    only a *different* action claiming '1'/'2'/'3' is the double-fire bug.
 * Returns a user-facing label for the reserved-key message, or null if
 * `key` is not reserved against `action`.
 */
export function reservedKeyLabel(action: ActionId, key: string): string | null {
  const k = key.toLowerCase();
  if (k === 'enter') return keyLabel(k);
  const pickerIndex = k === '1' ? 0 : k === '2' ? 1 : k === '3' ? 2 : -1;
  if (pickerIndex >= 0 && TOWER_SLOT_ACTIONS[pickerIndex] !== action) return keyLabel(k);
  return null;
}

export type RebindResult =
  | { ok: true; bindings: KeyBindings }
  | { ok: false; conflictWith: ActionId };

/**
 * Assigns `key` to `action`, rejecting (and leaving `bindings` untouched) if
 * another action already owns it. Binding an action to the key it already
 * holds is a no-op success, not a self-conflict.
 */
export function rebindKey(bindings: KeyBindings, action: ActionId, key: string): RebindResult {
  const k = key.toLowerCase();
  const conflict = ACTION_ORDER.find((a) => a.id !== action && bindings[a.id] === k);
  if (conflict) return { ok: false, conflictWith: conflict.id };
  return { ok: true, bindings: { ...bindings, [action]: k } };
}

/** Display label for a bound key — most are already fine uppercased, a few need spelling out. */
export function keyLabel(key: string): string {
  if (key === ' ') return 'Space';
  if (key === 'arrowup') return '↑';
  if (key === 'arrowdown') return '↓';
  if (key === 'arrowleft') return '←';
  if (key === 'arrowright') return '→';
  if (key === 'escape') return 'Esc';
  if (key === 'enter') return 'Enter';
  return key.length === 1 ? key.toUpperCase() : key;
}
