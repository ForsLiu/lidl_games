/**
 * @vitest-environment jsdom
 *
 * SPEC-V2 D2 / gate B10 (stash half): clicking a relic while its slot is
 * occupied swaps it in (old relic returns to the stash, it is never removed
 * from it to begin with); an equipped relic can be unequipped again by
 * clicking it a second time, by the explicit button in the detail panel, or
 * by dragging the equipped slot onto the stash list — so there is no state
 * a click can walk you into and not back out of. Right-click selects a relic
 * for the compare panel without equipping it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Hub } from '../src/ui/hub';
import { defaultMeta } from '../src/meta/meta';
import { defaultSettings } from '../src/ui/settings';
import type { MetaState, Relic } from '../src/sim/types';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

function relic(id: number, slot: string, name: string, affixes: Relic['affixes'] = []): Relic {
  return { id, slot, rarity: affixes.length ? 'magic' : 'normal', name, affixes };
}

function metaWith(stash: Relic[], equipped: Partial<MetaState['equipped']> = {}): MetaState {
  const base = defaultMeta();
  return { ...base, stash, equipped: { ...base.equipped, ...equipped } };
}

function mountHub(meta: MetaState): { root: HTMLElement; latest: () => MetaState } {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app') as HTMLElement;
  let current = meta;
  const hub = new Hub(root, meta, 1, {
    settings: defaultSettings(),
    onStart: () => {},
    onMetaChanged: (m) => (current = m),
    onSettingsChanged: () => {},
  });
  hub.show();
  hub.openTab('stash');
  return { root, latest: () => current };
}

function click(el: Element): void {
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

function rightClick(el: Element): void {
  el.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
}

describe('clicking a stash relic equips it, swapping whatever was there', () => {
  const ringA = relic(1, 'sigil', 'Ring A');
  const ringB = relic(2, 'sigil', 'Ring B');

  it('equips into an empty slot on the first click', () => {
    const { root, latest } = mountHub(metaWith([ringA]));
    click(root.querySelector('[data-relic="1"]')!);
    expect(latest().equipped.sigil).toBe(1);
  });

  it('swaps in the new relic and leaves the old one in the stash, not discarded', () => {
    const { root, latest } = mountHub(metaWith([ringA, ringB], { sigil: 1 }));
    click(root.querySelector('[data-relic="2"]')!);
    expect(latest().equipped.sigil).toBe(2);
    expect(latest().stash.map((r) => r.id)).toEqual(expect.arrayContaining([1, 2]));
  });

  it('never lands on a relic equipped in the wrong slot', () => {
    const plate = relic(3, 'plate', 'Plate A');
    const { root, latest } = mountHub(metaWith([ringA, plate]));
    click(root.querySelector('[data-relic="3"]')!);
    expect(latest().equipped.plate).toBe(3);
    expect(latest().equipped.sigil).toBeNull();
  });
});

describe('an equipped relic is never a dead end', () => {
  const ringA = relic(1, 'sigil', 'Ring A');

  it('clicking the equipped relic again unequips it', () => {
    const { root, latest } = mountHub(metaWith([ringA], { sigil: 1 }));
    click(root.querySelector('[data-relic="1"]')!);
    expect(latest().equipped.sigil).toBeNull();
    // The relic itself is untouched — unequip is not discard.
    expect(latest().stash.map((r) => r.id)).toContain(1);
  });

  it('the detail panel button reads "Unequip" for an equipped relic and works', () => {
    const { root, latest } = mountHub(metaWith([ringA], { sigil: 1 }));
    // Right-click selects for the detail panel without touching the equip state.
    rightClick(root.querySelector('[data-relic="1"]')!);
    expect(latest().equipped.sigil).toBe(1);
    const btn = root.querySelector('[data-equip]') as HTMLButtonElement;
    expect(btn.textContent).toMatch(/Unequip/);
    click(btn);
    expect(latest().equipped.sigil).toBeNull();
  });

  it('clicking the equipped slot in the Loadout strip unequips it', () => {
    const { root, latest } = mountHub(metaWith([ringA], { sigil: 1 }));
    click(root.querySelector('[data-eqslot="sigil"]')!);
    expect(latest().equipped.sigil).toBeNull();
  });

  it('dragging the equipped slot onto the stash list unequips it', () => {
    const { root, latest } = mountHub(metaWith([ringA], { sigil: 1 }));
    const slotEl = root.querySelector('[data-eqslot="sigil"]') as HTMLElement;
    const stashEl = root.querySelector('.sw-stash') as HTMLElement;

    const dragStart = new window.Event('dragstart', { bubbles: true, cancelable: true });
    const store = new Map<string, string>();
    (dragStart as any).dataTransfer = { setData: (k: string, v: string) => store.set(k, v) };
    slotEl.dispatchEvent(dragStart);

    const drop = new window.Event('drop', { bubbles: true, cancelable: true });
    (drop as any).dataTransfer = { getData: (k: string) => store.get(k) ?? '' };
    stashEl.dispatchEvent(drop);

    expect(latest().equipped.sigil).toBeNull();
  });

  it('dropping on a relic button (not just the container) still unequips, via bubbling', () => {
    const ringB = relic(2, 'sigil', 'Ring B');
    const { root, latest } = mountHub(metaWith([ringA, ringB], { sigil: 1 }));
    const slotEl = root.querySelector('[data-eqslot="sigil"]') as HTMLElement;
    const relicBtn = root.querySelector('[data-relic="2"]') as HTMLElement;

    const dragStart = new window.Event('dragstart', { bubbles: true, cancelable: true });
    const store = new Map<string, string>();
    (dragStart as any).dataTransfer = { setData: (k: string, v: string) => store.set(k, v) };
    slotEl.dispatchEvent(dragStart);

    const drop = new window.Event('drop', { bubbles: true, cancelable: true });
    (drop as any).dataTransfer = { getData: (k: string) => store.get(k) ?? '' };
    relicBtn.dispatchEvent(drop);

    expect(latest().equipped.sigil).toBeNull();
  });

  it('the drop target still exists and works when the stash list is in its empty-state markup', () => {
    // The 0-relic branch of renderStash swaps the relic-button grid for a
    // <p class="sw-note">, but .sw-stash itself (the drop target) still
    // wraps it — this pins that the handler survives that branch.
    const meta = defaultMeta();
    meta.stash = [];
    const { root, latest } = mountHub(meta);
    const stashEl = root.querySelector('.sw-stash') as HTMLElement;
    expect(stashEl).not.toBeNull();
    const drop = new window.Event('drop', { bubbles: true, cancelable: true });
    (drop as any).dataTransfer = { getData: () => 'sigil' };
    expect(() => stashEl.dispatchEvent(drop)).not.toThrow();
    expect(latest().equipped.sigil).toBeNull();
  });

  it('discarding an equipped relic also clears its slot', () => {
    const { root, latest } = mountHub(metaWith([ringA], { sigil: 1 }));
    rightClick(root.querySelector('[data-relic="1"]')!);
    click(root.querySelector('[data-discard]')!);
    expect(latest().equipped.sigil).toBeNull();
    expect(latest().stash).toHaveLength(0);
  });
});

describe('right-click compares without equipping', () => {
  const equipped = relic(1, 'sigil', 'Ring A', [{ key: 'power', stat: 'power', value: 0.08 }]);
  const candidate = relic(2, 'sigil', 'Ring B', [{ key: 'power', stat: 'power', value: 0.04 }]);

  it('selects the relic for the detail panel but leaves the equip state alone', () => {
    const { root, latest } = mountHub(metaWith([equipped, candidate], { sigil: 1 }));
    rightClick(root.querySelector('[data-relic="2"]')!);
    expect(latest().equipped.sigil).toBe(1);
    expect(root.querySelector('.sw-relicdetail b')?.textContent).toBe('Ring B');
  });

  it('shows a compare block against the currently equipped relic', () => {
    const { root } = mountHub(metaWith([equipped, candidate], { sigil: 1 }));
    rightClick(root.querySelector('[data-relic="2"]')!);
    const compare = root.querySelector('.sw-compare');
    expect(compare).not.toBeNull();
    expect(compare?.textContent).toMatch(/Ring A/);
    expect(compare?.textContent).toMatch(/power/);
  });

  it('the stash button carries a compare tooltip against the equipped relic', () => {
    const { root } = mountHub(metaWith([equipped, candidate], { sigil: 1 }));
    const btn = root.querySelector('[data-relic="2"]') as HTMLButtonElement;
    expect(btn.title).toMatch(/vs Ring A/);
  });

  it('shows no compare block for the relic that is already equipped', () => {
    const { root } = mountHub(metaWith([equipped, candidate], { sigil: 1 }));
    rightClick(root.querySelector('[data-relic="1"]')!);
    expect(root.querySelector('.sw-compare')).toBeNull();
  });

  it('merges an implicit-only candidate against an equipped relic with an affix on that same stat', () => {
    // Sigil's implicit is `power`; ringA (equipped) also carries a `power`
    // affix. A candidate with no affixes at all should still diff cleanly
    // against the combined implicit+affix total, not double-count or crash.
    const plainRing = relic(3, 'sigil', 'Plain Ring');
    const { root } = mountHub(metaWith([equipped, plainRing], { sigil: 1 }));
    rightClick(root.querySelector('[data-relic="3"]')!);
    const compare = root.querySelector('.sw-compare');
    expect(compare).not.toBeNull();
    expect(compare?.textContent).toMatch(/power/);
  });
});
