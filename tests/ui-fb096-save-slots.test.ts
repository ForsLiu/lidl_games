/**
 * @vitest-environment jsdom
 *
 * fb096 (QUALITY.md 1.0 Steam/itch checklist: "save slots (3)"). `src/ui/
 * saveslots.ts` layers 3 independent storage keys on top of `src/meta/
 * meta.ts`'s single `SAVE_KEY` without editing that (out-of-scope) module —
 * the active slot's data always lives live in `SAVE_KEY`, mirrored into a
 * dedicated per-slot key only at the moment of a switch.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Hub } from '../src/ui/hub';
import { SAVE_KEY, defaultMeta, loadMeta, saveMeta } from '../src/meta/meta';
import { defaultSettings } from '../src/ui/settings';
import type { MetaState } from '../src/sim/types';
import {
  SAVE_SLOT_COUNT,
  deleteSlot,
  ensureActiveSlotMigrated,
  getActiveSlot,
  saveMetaToActiveSlot,
  slotHasData,
  switchToSlot,
} from '../src/ui/saveslots';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

function openHub(meta: MetaState = defaultMeta(), onMetaChanged: (m: MetaState) => void = () => {}): {
  root: HTMLElement;
  hub: Hub;
} {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app') as HTMLElement;
  const hub = new Hub(root, meta, 1, {
    settings: defaultSettings(),
    onStart: () => {},
    onMetaChanged,
    onSettingsChanged: () => {},
  });
  hub.show();
  hub.openTab('settings');
  return { root, hub };
}

const realLocation = window.location;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  Object.defineProperty(window, 'location', { value: realLocation, writable: true, configurable: true });
});

/**
 * fb147's source rule: a reference to `meta.ts`'s `saveMeta` by name, in any
 * form — call, alias, or by-reference. `saveMetaToActiveSlot` and
 * `autosaveMeta` deliberately do not match.
 *
 * Not `/g`: a `RegExp` with the global flag carries `lastIndex` across calls,
 * so a shared instance would skip every other match.
 */
const SAVE_META_REF = /(?<![A-Za-z0-9_$])saveMeta(?![A-Za-z0-9_$])/;

/**
 * fb147: what a page load does — `main.ts`'s `Game.start()` calls
 * `ensureActiveSlotMigrated()` before anything reads the save. It is also
 * where this session's sync target is pinned, so a test that switches slots
 * has to model the reload `hub.ts` performs after every successful switch
 * (fb100) rather than carrying on in the same session.
 */
function reload(): void {
  ensureActiveSlotMigrated();
}

/** The `skillPoints` stored in `slot`'s own dedicated key, or null if it has none. */
function slotSkillPoints(slot: number): number | null {
  const raw = localStorage.getItem(`stonewake.save.slot${slot + 1}.v1`);
  if (raw === null) return null;
  return (JSON.parse(raw) as { meta: { skillPoints: number } }).meta.skillPoints;
}

describe('fb096: save-slots module', () => {
  it('a fresh profile (no prior save) defaults to slot 0 active with no data anywhere', () => {
    ensureActiveSlotMigrated();
    expect(getActiveSlot()).toBe(0);
    for (let i = 0; i < SAVE_SLOT_COUNT; i++) expect(slotHasData(i)).toBe(false);
  });

  it('migration: a pre-existing single save appears intact in slot 1 the first time the slot-aware loader runs', () => {
    const legacy = { ...defaultMeta(), skillPoints: 42 };
    saveMeta(legacy);

    ensureActiveSlotMigrated();

    expect(getActiveSlot()).toBe(0);
    expect(slotHasData(0)).toBe(true);
    // SAVE_KEY itself is untouched by migration — loadMeta() keeps working.
    expect(loadMeta().skillPoints).toBe(42);
    // A dedicated copy also exists under slot 1's own key.
    expect(localStorage.getItem('stonewake.save.slot1.v1')).toBe(localStorage.getItem(SAVE_KEY));
  });

  it('migration is a no-op on a later boot (does not clobber an already-recorded active slot)', () => {
    ensureActiveSlotMigrated();
    switchToSlot(1);
    saveMeta({ ...defaultMeta(), skillPoints: 7 });

    ensureActiveSlotMigrated();

    expect(getActiveSlot()).toBe(1);
    expect(loadMeta().skillPoints).toBe(7);
  });

  it('independent progress in slot 1 and slot 2 persists independently across a simulated reload', () => {
    ensureActiveSlotMigrated();
    saveMeta({ ...defaultMeta(), skillPoints: 10 });
    expect(loadMeta().skillPoints).toBe(10);

    expect(switchToSlot(1)).toBe(true);
    // A never-used slot loads as a fresh account, not slot 0's leftover state.
    expect(loadMeta().skillPoints).toBe(0);
    saveMeta({ ...defaultMeta(), skillPoints: 25 });
    expect(loadMeta().skillPoints).toBe(25);

    // Simulated reload: re-read via the ordinary loader with nothing else touched.
    expect(loadMeta().skillPoints).toBe(25);

    expect(switchToSlot(0)).toBe(true);
    expect(loadMeta().skillPoints).toBe(10);

    expect(switchToSlot(1)).toBe(true);
    expect(loadMeta().skillPoints).toBe(25);
  });

  it('switching to the already-active slot, or an out-of-range slot, is a no-op', () => {
    ensureActiveSlotMigrated();
    saveMeta({ ...defaultMeta(), skillPoints: 5 });
    expect(switchToSlot(0)).toBe(false);
    expect(switchToSlot(-1)).toBe(false);
    expect(switchToSlot(SAVE_SLOT_COUNT)).toBe(false);
    expect(loadMeta().skillPoints).toBe(5);
  });

  /**
   * fb101 (qa-playtester finding): a failure on `switchToSlot`'s third and
   * final write (the active-slot pointer) must fail the whole call closed —
   * not report success while the pointer never actually moved.
   */
  it('a storage failure on the active-slot-pointer write fails switchToSlot closed', () => {
    ensureActiveSlotMigrated();
    // Both slot 0 and slot 1 must already hold data so `switchToSlot`'s flush
    // and load steps both take the `setItem` branch (not `removeItem`) —
    // otherwise the pointer write isn't actually the 3rd `setItem` call.
    saveMeta({ ...defaultMeta(), skillPoints: 5 });
    switchToSlot(1);
    saveMeta({ ...defaultMeta(), skillPoints: 9 });
    switchToSlot(0);
    expect(getActiveSlot()).toBe(0);

    const realSetItem = Storage.prototype.setItem.bind(localStorage);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    let calls = 0;
    setItem.mockImplementation((key, value) => {
      calls++;
      if (calls === 3) throw new Error('quota exceeded');
      realSetItem(key, value);
    });

    expect(switchToSlot(1)).toBe(false);
    setItem.mockRestore();
    expect(calls).toBe(3);
    expect(getActiveSlot()).toBe(0);
  });

  it('deleteSlot removes a non-active slot without touching the live save', () => {
    ensureActiveSlotMigrated();
    saveMeta({ ...defaultMeta(), skillPoints: 5 });
    switchToSlot(1);
    saveMeta({ ...defaultMeta(), skillPoints: 9 });
    switchToSlot(0);

    expect(slotHasData(1)).toBe(true);
    expect(deleteSlot(1)).toBe(true);
    expect(slotHasData(1)).toBe(false);
    expect(loadMeta().skillPoints).toBe(5); // active slot 0 untouched
  });

  /**
   * fb147 (qa-playtester finding during fb111 verification): before this, the
   * ACTIVE slot's data lived ONLY in `SAVE_KEY` until a switch-AWAY mirrored
   * it into that slot's own key — so a slot that had been played but never
   * left had no dedicated key at all. A cloud provider that restores or
   * last-write-wins `SAVE_KEY` alone (Steam Cloud is per-file LWW) then made
   * that progress unrecoverable, and the next switch wrote the foreign account
   * into the slot's key, cementing the loss.
   *
   * `SAVE_KEY` is now a live cache of the active slot, not the sole home of
   * its data. fb111's per-blob round-trip audit structurally cannot see this:
   * it is a cross-key invariant, not a non-portable field.
   *
   * `src/meta/meta.ts` is out of this lane's Scope, so the sync wraps
   * `saveMeta` at its callers instead of changing it — and the last case below
   * is what makes "on every save" true rather than "on every save someone
   * remembered": a source rule over `src/ui/**`.
   */
  it("fb147: the active slot's own key holds its data BEFORE any switch-away", () => {
    // QA's exact repro. The `saveMeta` is the pre-slots legacy save it stands
    // for; the two later ones go through the save path `src/ui` now uses, and
    // each switch is followed by `reload()` because `hub.ts` reloads the page
    // on every successful switch (fb100).
    saveMeta({ ...defaultMeta(), skillPoints: 111 });
    ensureActiveSlotMigrated();
    switchToSlot(1);
    reload();
    saveMetaToActiveSlot({ ...defaultMeta(), skillPoints: 222 });
    switchToSlot(2);
    reload();
    saveMetaToActiveSlot({ ...defaultMeta(), skillPoints: 333 });

    expect(getActiveSlot()).toBe(2);
    expect(slotSkillPoints(0)).toBe(111);
    expect(slotSkillPoints(1)).toBe(222);
    // The one that used to be missing entirely.
    expect(localStorage.getItem('stonewake.save.slot3.v1')).not.toBeNull();
    expect(slotSkillPoints(2)).toBe(333);
    expect(loadMeta().skillPoints).toBe(333);
  });

  it("fb147: a per-file cloud restore of SAVE_KEY alone leaves the slot's own copy intact", () => {
    saveMeta({ ...defaultMeta(), skillPoints: 111 });
    ensureActiveSlotMigrated();
    switchToSlot(2);
    reload();
    saveMetaToActiveSlot({ ...defaultMeta(), skillPoints: 333 });
    expect(slotSkillPoints(2)).toBe(333);

    // A last-write-wins provider replaces the SAVE_KEY file out of process.
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, meta: { ...defaultMeta(), skillPoints: 7 } }));

    // Before fb147 slot 3 had no key at all and 333 was simply gone. It is now
    // a file of its own, which is the point: a per-file provider can back it
    // up and hand it back. Recovering the LIVE cache from it is still the
    // switch machinery's job — `switchToSlot` still flushes `SAVE_KEY` over
    // the outgoing slot key — so this asserts the data survives the restore,
    // not that the game repairs itself afterwards (filed as fb172).
    expect(loadMeta().skillPoints).toBe(7);
    expect(slotSkillPoints(2)).toBe(333);
  });

  it('fb147: every later save keeps the slot key in step, and a wipe propagates', () => {
    ensureActiveSlotMigrated();
    switchToSlot(1);
    reload();
    for (const sp of [1, 2, 3]) {
      saveMetaToActiveSlot({ ...defaultMeta(), skillPoints: sp });
      expect(slotSkillPoints(1)).toBe(sp);
    }
    // "Wipe account" (`hub.ts`'s `#sw-wipe`) is an `onMetaChanged(defaultMeta())`,
    // which reaches `main.ts`'s save site — so it must reach the slot key too
    // rather than leaving the wiped account resurrectable there.
    saveMetaToActiveSlot(defaultMeta());
    expect(slotSkillPoints(1)).toBe(0);
  });

  it('fb147: syncing stays out of a switch, which owns both keys itself', () => {
    // A sync running inside `switchToSlot` would write the INCOMING account
    // over the OUTGOING slot's freshly flushed key: the active-slot pointer is
    // deliberately still on the outgoing slot at that instant.
    ensureActiveSlotMigrated();
    saveMetaToActiveSlot({ ...defaultMeta(), skillPoints: 5 });
    switchToSlot(1);
    reload();
    saveMetaToActiveSlot({ ...defaultMeta(), skillPoints: 9 });
    switchToSlot(0);
    reload();
    expect(slotSkillPoints(0)).toBe(5);
    expect(slotSkillPoints(1)).toBe(9);
    expect(loadMeta().skillPoints).toBe(5);
  });

  /**
   * qa-playtester finding during fb147 verification, fixed inside fb147 rather
   * than filed: syncing re-read the live pointer at save time, so a writer
   * holding a stale view of the active slot wrote its own account into a
   * FOREIGN slot's file. Two reachable triggers, both a page that did not
   * reload through the switch — a second live tab (`runpersist.ts`'s
   * `sessionId` machinery exists because two tabs are supported), and fb100's
   * documented `location.reload()`-unavailable fallback, where the Hub stays
   * live on the old account after the pointer has already moved. Before fb147
   * such a writer could only dirty `SAVE_KEY`; the foreign slot's file
   * survived, and it must still.
   */
  it('fb147: a save never writes into a slot this session did not boot on', () => {
    saveMeta({ ...defaultMeta(), skillPoints: 11 });
    ensureActiveSlotMigrated();
    switchToSlot(1);
    reload();
    saveMetaToActiveSlot({ ...defaultMeta(), skillPoints: 22 });
    switchToSlot(0);
    reload();
    expect(slotSkillPoints(1)).toBe(22);

    // Something moves the pointer WITHOUT this page reloading through it.
    switchToSlot(1);
    // ...and this session keeps autosaving its own, now-stale account.
    saveMetaToActiveSlot({ ...defaultMeta(), skillPoints: 99 });

    // Slot 2's own file is untouched. (`SAVE_KEY` is this session's to dirty,
    // exactly as it was before fb147 — that half is unchanged.)
    expect(slotSkillPoints(1)).toBe(22);
  });

  /**
   * qa-playtester finding during fb147 verification, also fixed inside fb147:
   * the sync used to remove the slot key when `SAVE_KEY` was absent, and that
   * branch ran on the SAVE path. A save can never legitimately mean "this slot
   * has no data" — and under quota (`main.ts` documents a full T1 victory run
   * crossing it about 38% in) it deleted the only surviving copy.
   */
  it('fb147: a save whose own SAVE_KEY write fails never deletes the slot backup', () => {
    ensureActiveSlotMigrated();
    saveMetaToActiveSlot({ ...defaultMeta(), skillPoints: 42 });
    expect(slotSkillPoints(0)).toBe(42);

    // A per-file provider deletes the SAVE_KEY file out of process...
    localStorage.removeItem(SAVE_KEY);
    // ...and storage is now full, so `saveMeta`'s own write throws and is
    // swallowed, leaving `SAVE_KEY` absent at the moment the sync runs.
    const realSetItem = Storage.prototype.setItem.bind(localStorage);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    setItem.mockImplementation((key, value) => {
      if (key === SAVE_KEY) throw new Error('quota exceeded');
      realSetItem(key, value);
    });
    try {
      saveMetaToActiveSlot({ ...defaultMeta(), skillPoints: 43 });
    } finally {
      setItem.mockRestore();
    }

    expect(localStorage.getItem(SAVE_KEY)).toBeNull();
    expect(slotSkillPoints(0)).toBe(42);
  });

  it('fb147: no src/ui or src/render file references saveMeta directly — the wrapper is the only save path', () => {
    // What makes "the slot key stays in step on EVERY save" a property of the
    // codebase rather than of three call sites someone got right once.
    //
    // Matches the bare IDENTIFIER, not a call (code-reviewer finding): keyed
    // to `saveMeta(`, the rule was defeated by an aliased import
    // (`import { saveMeta as persistMeta }`), by a by-reference use
    // (`saveMeta.bind(...)`), and by a `//` inside an earlier string literal
    // on the same line. An alias is now itself an offender, which is the only
    // form of this rule that cannot be walked around by accident.
    const roots = [join(process.cwd(), 'src', 'ui'), join(process.cwd(), 'src', 'render')];
    const offenders: string[] = [];
    for (const dir of roots) {
      // Recursive: `src/ui` is flat today, but a future `src/ui/panels/x.ts`
      // would otherwise escape the rule silently.
      for (const rel of readdirSync(dir, { recursive: true }) as string[]) {
        if (!rel.endsWith('.ts')) continue;
        // `saveslots.ts` is the wrapper's own home and the one legitimate user.
        if (rel === 'saveslots.ts') continue;
        readFileSync(join(dir, rel), 'utf8')
          .split('\n')
          .forEach((line, i) => {
            const trimmed = line.trimStart();
            if (trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('//')) return;
            if (SAVE_META_REF.test(line.split('//')[0])) offenders.push(`${rel}:${i + 1}: ${trimmed}`);
          });
      }
    }
    expect(offenders).toEqual([]);
  });

  it.each([
    ['a direct call', '        saveMeta(this.meta);'],
    ['an aliased import', "import { saveMeta as persistMeta } from '../meta/meta';"],
    ['a by-reference use', '  queueMicrotask(saveMeta.bind(null, m));'],
  ])('fb147: the save-path rule catches %s — its own proof cases', (_label, source) => {
    // Paired with the loop above and sharing its one regex, so weakening the
    // rule cannot leave these green (code-reviewer finding: three separate
    // copies of the literal meant the anti-vacuity guard guarded nothing).
    expect(SAVE_META_REF.test(source)).toBe(true);
  });

  it.each([
    ['the wrapper itself', '  saveMetaToActiveSlot(this.meta);'],
    ['the wrapper import', "import { saveMetaToActiveSlot } from './saveslots';"],
    ['an unrelated identifier that merely ends the same way', '  autosaveMeta(m);'],
  ])('fb147: the save-path rule does not fire on %s', (_label, source) => {
    expect(SAVE_META_REF.test(source)).toBe(false);
  });

  it('deleteSlot on the active slot also clears the live SAVE_KEY', () => {
    ensureActiveSlotMigrated();
    saveMeta({ ...defaultMeta(), skillPoints: 5 });
    expect(deleteSlot(0)).toBe(true);
    expect(localStorage.getItem(SAVE_KEY)).toBeNull();
    expect(loadMeta().skillPoints).toBe(0); // falls back to defaultMeta()
  });
});

describe('fb096: Settings tab Save Slots panel', () => {
  it('lists all 3 slots, marking the active one and disabling its own Switch button', () => {
    ensureActiveSlotMigrated();
    const { root } = openHub();
    const rows = root.querySelectorAll('.sw-slotrow');
    expect(rows.length).toBe(SAVE_SLOT_COUNT);
    expect(root.textContent).toContain('Slot 1 (active)');
    const switchButtons = root.querySelectorAll<HTMLButtonElement>('[data-slot-switch]');
    expect(switchButtons[0].disabled).toBe(true);
    expect(switchButtons[1].disabled).toBe(false);
  });

  it('an empty slot is labeled empty and its Delete button is disabled', () => {
    ensureActiveSlotMigrated();
    const { root } = openHub();
    expect(root.textContent).toContain('Slot 2 — empty');
    const deleteButtons = root.querySelectorAll<HTMLButtonElement>('[data-slot-delete]');
    expect(deleteButtons[1].disabled).toBe(true);
  });

  it('clicking Switch moves the active slot and reloads the page immediately, without touching in-memory meta', () => {
    ensureActiveSlotMigrated();
    const reload = vi.fn();
    Object.defineProperty(window, 'location', { value: { reload }, writable: true, configurable: true });
    let changedMeta: MetaState | null = null;
    const { root } = openHub(defaultMeta(), (m) => {
      changedMeta = m;
    });

    root.querySelector<HTMLButtonElement>('[data-slot-switch="1"]')?.click();

    expect(getActiveSlot()).toBe(1);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(changedMeta).toBeNull();
  });

  /**
   * fb100 (qa-playtester finding against fb096's first draft): switching used
   * to only show an advisory "please reload" notice, leaving this already-
   * constructed `Hub`'s stale in-memory `this.meta` free to keep mutating and
   * re-saving over the *new* active slot's `SAVE_KEY` via any other Settings
   * control before the player manually reloaded — silently corrupting the
   * slot just switched into. An immediate reload closes that window; this
   * confirms `window.location.reload` is what actually gets called, the
   * concrete mechanism the fix relies on.
   */
  it('a failed/unavailable reload falls back to the advisory notice instead of leaving the stale Hub silently mutable', () => {
    ensureActiveSlotMigrated();
    Object.defineProperty(window, 'location', {
      value: {
        reload: () => {
          throw new Error('reload unavailable in this embedding');
        },
      },
      writable: true,
      configurable: true,
    });
    const { root } = openHub();

    root.querySelector<HTMLButtonElement>('[data-slot-switch="1"]')?.click();

    expect(getActiveSlot()).toBe(1);
    expect(root.textContent).toContain('Switched to Slot 2. Reload the page to continue on it.');
  });

  it('deleting the active slot resets in-memory meta via onMetaChanged and shows a confirmation notice', () => {
    ensureActiveSlotMigrated();
    saveMeta({ ...defaultMeta(), skillPoints: 33 });
    let changedMeta: MetaState | null = null;
    const { root } = openHub({ ...defaultMeta(), skillPoints: 33 }, (m) => {
      changedMeta = m;
    });

    root.querySelector<HTMLButtonElement>('[data-slot-delete="0"]')?.click();

    expect((changedMeta as MetaState | null)?.skillPoints).toBe(0);
    expect(root.textContent).toContain('Slot 1 deleted.');
    expect(loadMeta().skillPoints).toBe(0);
  });

  it('deleting a non-active, populated slot does not call onMetaChanged', () => {
    ensureActiveSlotMigrated();
    switchToSlot(1);
    saveMeta({ ...defaultMeta(), skillPoints: 12 });
    switchToSlot(0);

    let called = false;
    const { root } = openHub(defaultMeta(), () => {
      called = true;
    });

    root.querySelector<HTMLButtonElement>('[data-slot-delete="1"]')?.click();

    expect(called).toBe(false);
    expect(root.textContent).toContain('Slot 2 deleted.');
  });
});
