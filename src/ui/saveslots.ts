/**
 * fb096: 3 independent save slots layered entirely on top of `src/meta/meta.ts`'s
 * single `SAVE_KEY` — that module is out-of-scope for this lane (`src/meta/**`,
 * read-only) and is not edited at all. The *active* slot's data always lives
 * live in `SAVE_KEY` itself, exactly as before this feature existed, so
 * `loadMeta`/`saveMeta`/`loadMetaWithNotice` need no awareness slots exist.
 * This module mirrors `SAVE_KEY`'s raw JSON text into (or out of) a dedicated
 * per-slot key: at the moment a switch happens, and — since fb147 — after
 * every save, so `SAVE_KEY` is a live *cache* of the active slot rather than
 * the sole home of its data. Switching does not itself reload already-loaded
 * in-memory state (`Game`/`Hub`/`Hud` all assume
 * one account for their lifetime) — the caller surfaces a "reload to
 * continue" notice, the same pattern `settings.ts`'s `cleanProfile` toggle
 * already uses for its own "needs reload" note.
 */
import { SAVE_KEY, saveMeta } from '../meta/meta';
import type { MetaState } from '../sim/types';

export const SAVE_SLOT_COUNT = 3;
const SLOT_KEY_PREFIX = 'stonewake.save.slot';
const ACTIVE_SLOT_KEY = 'stonewake.activeslot.v1';

function slotStorageKey(slot: number): string {
  return `${SLOT_KEY_PREFIX}${slot + 1}.v1`;
}

/**
 * fb172: the exact string this module itself last wrote as BOTH `SAVE_KEY`
 * and `slotStorageKey(slot)` (the two are only ever set equal at a flush —
 * `syncActiveSlotKey`/`switchToSlot` below) — a shared "last known-good sync
 * point" per slot. Lets `switchToSlot` tell "nothing has touched either file
 * since we last synced them" apart from "an out-of-process write (a per-file
 * cloud restore) landed on one side or the other" without needing any
 * timestamp field on `MetaState` itself (`src/meta/meta.ts`/`src/sim/types.ts`
 * are out of this lane's Scope, so a real save-time timestamp isn't
 * reachable from here).
 */
function slotLastFlushKey(slot: number): string {
  return `${SLOT_KEY_PREFIX}${slot + 1}.lastflush.v1`;
}

/**
 * fb147 (qa-playtester finding during fb147 verification): the slot THIS page
 * load is playing, pinned at boot by `ensureActiveSlotMigrated` and never
 * moved afterwards — a switch is always followed by a reload (`hub.ts`, fb100),
 * and the reloaded page pins itself afresh.
 *
 * Without it, `syncActiveSlotKey` re-read the live pointer at save time and so
 * wrote this session's account into whatever slot the pointer named NOW. Any
 * writer holding a stale view of the active slot therefore overwrote a FOREIGN
 * slot's own file — measured two ways: a second live tab that switched the
 * pointer while the first kept autosaving, and fb100's documented
 * `location.reload()`-unavailable fallback, where the Hub stays live on the
 * old account after the pointer has already moved. Before fb147 such a writer
 * could only dirty `SAVE_KEY`; the foreign slot's file survived. Deliberately
 * NOT updated by `switchToSlot`: refusing to sync after a switch this page
 * has not reloaded through is exactly the protection wanted.
 */
let sessionSlot: number | null = null;

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
  // fb147: this call IS the page load, so it is where this session's sync
  // target is pinned — before the early return below, which every boot after
  // the first one takes.
  sessionSlot = getActiveSlot();
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
 * fb147 (qa-playtester finding during fb111 verification): copies the live
 * `SAVE_KEY` text into the slot key this session is playing, so the two are in
 * step.
 *
 * Reads `SAVE_KEY` back rather than re-serializing, so the slot key carries
 * byte-for-byte what actually landed.
 *
 * WRITE-ONLY (qa-playtester finding during fb147 verification): an absent
 * `SAVE_KEY` used to mean "remove the slot key", and that ran on the SAVE
 * path. A save can never legitimately mean "this slot has no data", but a save
 * whose own `SAVE_KEY` write silently failed under quota — which `main.ts`'s
 * `persistDisabled` comment documents as normal, a full T1 victory run crosses
 * the quota about 38% in — then DELETED the slot's own file while it was the
 * only surviving copy. Removals belong to `switchToSlot`/`deleteSlot`, which
 * own both keys at once.
 *
 * Writes only while `sessionSlot` still matches the live pointer, and NOT
 * called from `switchToSlot`/`deleteSlot`/`ensureActiveSlotMigrated`: those
 * move data between the two keys themselves, with the pointer deliberately
 * still on the OUTGOING slot, so a sync in the middle of one would write the
 * incoming account over the outgoing slot's flush. Not exported for the same
 * reason (code-reviewer finding): the export was the only way to reach that
 * hazard, and nothing outside this file needs it.
 */
function syncActiveSlotKey(): void {
  try {
    const active = getActiveSlot();
    // fb147/QA: pinned lazily on first use for a caller that never ran
    // `ensureActiveSlotMigrated` (tests, an embedder); every real boot pins it
    // there instead.
    if (sessionSlot === null) sessionSlot = active;
    else if (sessionSlot !== active) return;
    const live = globalThis.localStorage?.getItem(SAVE_KEY);
    if (live != null) {
      globalThis.localStorage?.setItem(slotStorageKey(active), live);
      // fb172: this normal, in-session flush IS a new "last known-good sync
      // point" for the outgoing-switch check below.
      globalThis.localStorage?.setItem(slotLastFlushKey(active), live);
    }
  } catch {
    // Storage unavailable: `SAVE_KEY` is no more written than the slot key is.
  }
}

/**
 * fb147: the save path every `src/ui` caller uses, replacing bare `saveMeta`.
 *
 * Before this, the active slot's data reached its own key only on a switch
 * AWAY from it, so a slot that had been played but never left had no dedicated
 * key at all. A cloud provider that restores or last-write-wins `SAVE_KEY`
 * alone (Steam Cloud is per-file LWW) then made that progress unrecoverable.
 *
 * `src/meta/meta.ts` is out of this lane's Scope, so this wraps `saveMeta`
 * rather than changing it — which is why `tests/ui-fb096-save-slots.test.ts`
 * also carries a source rule asserting no `src/ui` file calls `saveMeta`
 * directly. There are three call sites, all in `src/ui/main.ts`; a fourth that
 * forgot this wrapper would reintroduce exactly the bug fb147 closes.
 */
export function saveMetaToActiveSlot(meta: MetaState): void {
  saveMeta(meta);
  syncActiveSlotKey();
}

/**
 * Whether `slot` has ever held save data — its own dedicated key, or (for the
 * currently-active slot only, in the window before its first save or a
 * switch-away has flushed it into one) the live `SAVE_KEY`.
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
 * fb172: whether it is safe for `switchToSlot` to flush the live `SAVE_KEY`
 * into `slot`'s own key — true unless an out-of-process write (a per-file
 * cloud restore, the scenario `slotLastFlushKey`'s doc comment describes)
 * landed on `SAVE_KEY`, on `slot`'s own key, or both, since this module's
 * own last flush. A slot with no flush history yet (`known === null` — never
 * played this session, or an account that predates this fix) reads as safe,
 * matching this function's pre-fix behavior exactly for that case.
 */
function slotUnchangedSinceOurLastFlush(slot: number): { safe: boolean; slotFile: string | null } {
  const slotFile = globalThis.localStorage?.getItem(slotStorageKey(slot)) ?? null;
  const known = globalThis.localStorage?.getItem(slotLastFlushKey(slot));
  if (known == null) return { safe: true, slotFile };
  const live = globalThis.localStorage?.getItem(SAVE_KEY) ?? null;
  return { safe: slotFile === known && live === known, slotFile };
}

/**
 * Flushes the live `SAVE_KEY` into the current slot's own key, loads `slot`'s
 * own key (if any) into `SAVE_KEY` — or clears `SAVE_KEY` for a never-used
 * slot, so the next `loadMeta()` naturally falls back to `defaultMeta()`,
 * which doubles as the "create" affordance — and records `slot` as active.
 * Returns false (a no-op) for the already-active slot, an out-of-range index,
 * or an unavailable localStorage.
 *
 * fb172 (code-reviewer finding during fb147 review): the outgoing flush below
 * used to run unconditionally, so an out-of-process restore of either
 * `SAVE_KEY` or the outgoing slot's own file (a per-file cloud provider) was
 * silently destroyed by this same flush at the next switch-away — the
 * `slotUnchangedSinceOurLastFlush` guard refuses it instead of picking a side
 * un-asked (the acceptance's "either... or" — this takes the "refuse the
 * overwrite" branch, not "keep both and tell the player", which needs UX the
 * owner hasn't chosen — see BACKLOG-UI.md's Log for the QUESTIONS.md note).
 */
export function switchToSlot(slot: number): boolean {
  if (!inRange(slot)) return false;
  const current = getActiveSlot();
  if (slot === current) return false;
  try {
    const { safe, slotFile } = slotUnchangedSinceOurLastFlush(current);
    if (safe) {
      const live = globalThis.localStorage?.getItem(SAVE_KEY);
      if (live != null) {
        globalThis.localStorage?.setItem(slotStorageKey(current), live);
        globalThis.localStorage?.setItem(slotLastFlushKey(current), live);
      } else {
        globalThis.localStorage?.removeItem(slotStorageKey(current));
        globalThis.localStorage?.removeItem(slotLastFlushKey(current));
      }
    } else if (slotFile != null) {
      // fb172: re-sync our own bookkeeping to the slot file's actual current
      // content (never to `live` — that's the side we just refused to trust)
      // so a FUTURE switch-away compares against present reality instead of
      // being stuck refusing forever against this one stale record.
      globalThis.localStorage?.setItem(slotLastFlushKey(current), slotFile);
    } else {
      globalThis.localStorage?.removeItem(slotLastFlushKey(current));
    }

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
 *
 * fb147: deleting the ACTIVE slot from the Hub is followed by an
 * `onMetaChanged(defaultMeta())` that saves again, so the slot key reappears
 * immediately holding a fresh empty account. That is the same state the old
 * switch-away flush produced and the same state `slotHasData`'s `SAVE_KEY`
 * fallback already reported, so nothing observable changed — but "permanently
 * deletes" above means the stored copy, not the slot's existence.
 */
export function deleteSlot(slot: number): boolean {
  if (!inRange(slot)) return false;
  try {
    globalThis.localStorage?.removeItem(slotStorageKey(slot));
    // fb172: a deliberate delete is not a "foreign write since our last
    // flush" — clearing the record too means a later re-created slot's first
    // switch-away is compared against nothing (reads as safe), not against a
    // stale pre-deletion value it can never match again.
    globalThis.localStorage?.removeItem(slotLastFlushKey(slot));
    if (slot === getActiveSlot()) globalThis.localStorage?.removeItem(SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}
