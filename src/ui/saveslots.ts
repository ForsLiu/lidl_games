/**
 * fb096: 3 independent save slots layered entirely on top of `src/meta/meta.ts`'s
 * single `SAVE_KEY` — that module is out-of-scope for this lane (`src/meta/**`,
 * read-only) and is not edited at all. The *active* slot's data always lives
 * live in `SAVE_KEY` itself, exactly as before this feature existed, so
 * `loadMeta`/`saveMeta`/`loadMetaWithNotice` need no awareness slots exist.
 * This module only mirrors `SAVE_KEY`'s raw JSON text into (or out of) a
 * dedicated per-slot key at the moment a switch happens. Switching does not
 * itself reload already-loaded in-memory state (`Game`/`Hub`/`Hud` all assume
 * one account for their lifetime) — the caller surfaces a "reload to
 * continue" notice, the same pattern `settings.ts`'s `cleanProfile` toggle
 * already uses for its own "needs reload" note.
 */
import { SAVE_KEY } from '../meta/meta';

export const SAVE_SLOT_COUNT = 3;
const SLOT_KEY_PREFIX = 'stonewake.save.slot';
const ACTIVE_SLOT_KEY = 'stonewake.activeslot.v1';

function slotStorageKey(slot: number): string {
  return `${SLOT_KEY_PREFIX}${slot + 1}.v1`;
}

function inRange(slot: number): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot < SAVE_SLOT_COUNT;
}

export function getActiveSlot(): number {
  try {
    const raw = globalThis.localStorage?.getItem(ACTIVE_SLOT_KEY);
    const n = raw === null || raw === undefined ? 0 : Number(raw);
    return inRange(n) ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * fb101 (qa-playtester finding): deliberately does not swallow its own
 * exception — `switchToSlot`'s outer try/catch must see a failure on this,
 * its last of three writes, so it can return `false` rather than claiming
 * success while the active-slot pointer never actually moved. Only
 * `ensureActiveSlotMigrated` (whose own outer try/catch already treats any
 * failure here the same way — nothing to migrate this boot) calls this
 * outside of `switchToSlot`.
 */
function setActiveSlotRaw(slot: number): void {
  globalThis.localStorage?.setItem(ACTIVE_SLOT_KEY, String(slot));
}

/**
 * Called once at boot, before `loadMetaWithNotice()`. First run after this
 * feature ships: no `ACTIVE_SLOT_KEY` yet. A pre-existing single save
 * (today's real storage shape, still live in `SAVE_KEY`) becomes slot 1's own
 * copy too, so it's discoverable as a slot rather than silently orphaned
 * outside the slot system — `SAVE_KEY` itself is left untouched, so
 * `loadMeta()` keeps working exactly as it did before this feature for a save
 * predating it. A no-op on every later boot (`ACTIVE_SLOT_KEY` already set).
 */
export function ensureActiveSlotMigrated(): void {
  try {
    if (globalThis.localStorage?.getItem(ACTIVE_SLOT_KEY) != null) return;
    const legacy = globalThis.localStorage?.getItem(SAVE_KEY);
    if (legacy != null) globalThis.localStorage?.setItem(slotStorageKey(0), legacy);
    setActiveSlotRaw(0);
  } catch {
    // Storage unavailable: nothing to migrate.
  }
}

/**
 * Whether `slot` has ever held save data — its own dedicated key, or (for the
 * currently-active slot only, before its first switch-away ever flushes it
 * into one) the live `SAVE_KEY`.
 */
export function slotHasData(slot: number): boolean {
  try {
    if (globalThis.localStorage?.getItem(slotStorageKey(slot)) != null) return true;
    return slot === getActiveSlot() && globalThis.localStorage?.getItem(SAVE_KEY) != null;
  } catch {
    return false;
  }
}

/**
 * Flushes the live `SAVE_KEY` into the current slot's own key, loads `slot`'s
 * own key (if any) into `SAVE_KEY` — or clears `SAVE_KEY` for a never-used
 * slot, so the next `loadMeta()` naturally falls back to `defaultMeta()`,
 * which doubles as the "create" affordance — and records `slot` as active.
 * Returns false (a no-op) for the already-active slot, an out-of-range index,
 * or an unavailable localStorage.
 */
export function switchToSlot(slot: number): boolean {
  if (!inRange(slot)) return false;
  const current = getActiveSlot();
  if (slot === current) return false;
  try {
    const live = globalThis.localStorage?.getItem(SAVE_KEY);
    if (live != null) globalThis.localStorage?.setItem(slotStorageKey(current), live);
    else globalThis.localStorage?.removeItem(slotStorageKey(current));

    const incoming = globalThis.localStorage?.getItem(slotStorageKey(slot));
    if (incoming != null) globalThis.localStorage?.setItem(SAVE_KEY, incoming);
    else globalThis.localStorage?.removeItem(SAVE_KEY);

    setActiveSlotRaw(slot);
    return true;
  } catch {
    return false;
  }
}

/**
 * Permanently deletes `slot`'s own stored copy. If `slot` is the currently
 * active one, also clears the live `SAVE_KEY` (matching "Wipe account"'s own
 * `defaultMeta()`-on-next-load behavior) — the caller is responsible for
 * reflecting that in already-loaded in-memory state, same as any other
 * `SAVE_KEY` mutation from outside `meta.ts`'s own `saveMeta`.
 */
export function deleteSlot(slot: number): boolean {
  if (!inRange(slot)) return false;
  try {
    globalThis.localStorage?.removeItem(slotStorageKey(slot));
    if (slot === getActiveSlot()) globalThis.localStorage?.removeItem(SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}
