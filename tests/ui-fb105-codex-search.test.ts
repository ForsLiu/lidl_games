/**
 * @vitest-environment jsdom
 *
 * fb105: the Codex renders every collection as a plain unfiltered table,
 * unusable at §13's content-total row counts (120 Constellation Nodes, 20
 * enemies, ...). A search box above the table filters rows by case-
 * insensitive substring match against any cell's rendered text, and
 * switching collections clears the filter.
 */
import { describe, expect, it } from 'vitest';

import { mountCodex } from '../src/ui/codex';
import { buildCodexCollections, type CodexCollection } from '../src/ui/codex-collections';
import { loadContent } from '../src/sim/content';

function mount(): HTMLElement {
  document.body.innerHTML = '<div id="app"></div>';
  return document.getElementById('app') as HTMLElement;
}

function visibleBodyRows(root: HTMLElement): HTMLTableRowElement[] {
  const rows = Array.from(root.querySelectorAll<HTMLTableRowElement>('.sw-codex-content tbody tr'));
  return rows.filter((tr) => !tr.classList.contains('sw-codex-row-hidden'));
}

describe('fb105: Codex search/filter box', () => {
  it('renders a search input above the table for every collection', () => {
    const root = mount();
    mountCodex(root, buildCodexCollections());
    expect(root.querySelector('.sw-codex-search')).toBeTruthy();
  });

  it('filters a real many-row collection ("towers") to only the rows matching a unique substring', () => {
    const content = loadContent();
    const towers = content.towers.towers;
    expect(towers.length).toBeGreaterThan(3);

    const root = mount();
    const collections = buildCodexCollections(content);
    const handle = mountCodex(root, collections);
    handle.select('towers');

    expect(root.querySelectorAll('.sw-codex-content tbody tr').length).toBe(towers.length);

    const ballista = towers.find((t) => t.key === 'ballista')!;
    const input = root.querySelector<HTMLInputElement>('.sw-codex-search')!;
    input.value = 'ballista';
    input.dispatchEvent(new Event('input'));

    const visible = visibleBodyRows(root);
    expect(visible.length).toBe(1);
    expect(visible[0].textContent).toContain(ballista.key);

    input.value = '';
    input.dispatchEvent(new Event('input'));
    expect(visibleBodyRows(root).length).toBe(towers.length);
  });

  it('a substring matching a small subset leaves only matching rows visible, restored by clearing', () => {
    const root = mount();
    const synthetic: CodexCollection[] = [
      {
        key: 'a',
        label: 'A',
        rows: [
          { key: 'ballista', kind: 'physical' },
          { key: 'mortar', kind: 'physical' },
          { key: 'frost-tower', kind: 'ice' },
        ],
      },
    ];
    mountCodex(root, synthetic);

    const input = root.querySelector<HTMLInputElement>('.sw-codex-search')!;
    input.value = 'frost';
    input.dispatchEvent(new Event('input'));
    let visible = visibleBodyRows(root);
    expect(visible.length).toBe(1);
    expect(visible[0].textContent).toContain('frost-tower');

    input.value = '';
    input.dispatchEvent(new Event('input'));
    visible = visibleBodyRows(root);
    expect(visible.length).toBe(3);
  });

  it('is case-insensitive', () => {
    const root = mount();
    const synthetic: CodexCollection[] = [
      { key: 'a', label: 'A', rows: [{ key: 'Ballista' }, { key: 'Mortar' }] },
    ];
    mountCodex(root, synthetic);

    const input = root.querySelector<HTMLInputElement>('.sw-codex-search')!;
    input.value = 'ballista';
    input.dispatchEvent(new Event('input'));
    expect(visibleBodyRows(root).length).toBe(1);
    expect(visibleBodyRows(root)[0].textContent).toContain('Ballista');
  });

  it('shows a "no matches" message and an updated count when the query matches nothing', () => {
    const root = mount();
    const synthetic: CodexCollection[] = [
      { key: 'a', label: 'A', rows: [{ key: 'ballista' }, { key: 'mortar' }] },
    ];
    mountCodex(root, synthetic);

    const count = root.querySelector('.sw-codex-count')!;
    expect(count.textContent).toBe('2 entries');

    const input = root.querySelector<HTMLInputElement>('.sw-codex-search')!;
    input.value = 'no-such-substring';
    input.dispatchEvent(new Event('input'));

    expect(visibleBodyRows(root).length).toBe(0);
    const noMatches = root.querySelector<HTMLElement>('.sw-codex-no-matches')!;
    expect(noMatches.hidden).toBe(false);
    expect(count.textContent).toBe('0 of 2 entries');

    input.value = '';
    input.dispatchEvent(new Event('input'));
    expect(noMatches.hidden).toBe(true);
    expect(count.textContent).toBe('2 entries');
  });

  it('does not throw when searching an empty collection', () => {
    const root = mount();
    const synthetic: CodexCollection[] = [{ key: 'empty', label: 'Empty', rows: [] }];
    mountCodex(root, synthetic);

    const input = root.querySelector<HTMLInputElement>('.sw-codex-search')!;
    expect(() => {
      input.value = 'anything';
      input.dispatchEvent(new Event('input'));
    }).not.toThrow();
    expect(visibleBodyRows(root).length).toBe(0);
  });

  it('filters the largest real collection (constellation tree nodes) well past a "handful" of rows', () => {
    const content = loadContent();
    const root = mount();
    const collections = buildCodexCollections(content);
    const largest = collections.reduce((a, b) => (b.rows.length > a.rows.length ? b : a));
    expect(largest.rows.length).toBeGreaterThan(20);

    const handle = mountCodex(root, collections);
    handle.select(largest.key);
    expect(root.querySelectorAll('.sw-codex-content tbody tr').length).toBe(largest.rows.length);

    const target = largest.rows[0] as Record<string, unknown>;
    const targetKey = String(target.key ?? Object.values(target)[0]);
    const input = root.querySelector<HTMLInputElement>('.sw-codex-search')!;
    input.value = targetKey;
    input.dispatchEvent(new Event('input'));

    const visible = visibleBodyRows(root);
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.length).toBeLessThan(largest.rows.length);
    for (const tr of visible) expect(tr.textContent!.toLowerCase()).toContain(targetKey.toLowerCase());
  });

  it('switching collections via select() clears the filter and shows the new collection unfiltered', () => {
    const root = mount();
    const synthetic: CodexCollection[] = [
      { key: 'a', label: 'A', rows: [{ key: 'apple' }, { key: 'apricot' }, { key: 'banana' }] },
      { key: 'b', label: 'B', rows: [{ key: 'zebra' }, { key: 'yak' }] },
    ];
    const handle = mountCodex(root, synthetic);

    let input = root.querySelector<HTMLInputElement>('.sw-codex-search')!;
    input.value = 'ap';
    input.dispatchEvent(new Event('input'));
    expect(visibleBodyRows(root).length).toBe(2); // apple, apricot

    handle.select('b');
    input = root.querySelector<HTMLInputElement>('.sw-codex-search')!;
    expect(input.value).toBe('');
    expect(visibleBodyRows(root).length).toBe(2); // zebra, yak — both restored
  });
});
