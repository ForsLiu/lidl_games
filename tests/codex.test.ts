/**
 * @vitest-environment jsdom
 *
 * SPEC-V3 T5, gate C6 (UI half): the read-only Codex. Two things need
 * proving separately —
 *
 * 1. The renderer is generic: it must derive its columns from whatever
 *    fields the records actually carry, never from a hardcoded list. Since
 *    this lane may not edit `/src/sim/content.ts` or `/data/**`, that claim
 *    is proven against synthetic records carrying a field no schema in this
 *    repo has ever had — if the renderer only worked for known field names,
 *    this would fail.
 * 2. Every real /data collection actually renders through `loadContent()`.
 */
import { describe, expect, it } from 'vitest';

import { collectColumns, renderCodexTable, mountCodex } from '../src/ui/codex';
import { buildCodexCollections, type CodexCollection } from '../src/ui/codex-collections';
import { loadContent, TUNER_FILES } from '../src/sim/content';

describe('collectColumns — generic, schema-agnostic', () => {
  it('derives columns from the union of keys actually present, in first-seen order', () => {
    const rows = [
      { key: 'a', name: 'Alpha', novelFieldNoSchemaHasEverHad: 42 },
      { key: 'b', name: 'Beta' },
      { key: 'c', name: 'Gamma', anotherBrandNewField: true },
    ];
    expect(collectColumns(rows)).toEqual([
      'key',
      'name',
      'novelFieldNoSchemaHasEverHad',
      'anotherBrandNewField',
    ]);
  });

  it('is empty for an empty collection', () => {
    expect(collectColumns([])).toEqual([]);
  });
});

describe('renderCodexTable — a field added to a schema needs no code change here', () => {
  it('renders a header + one row per record, columns matching the union of keys', () => {
    const rows = [
      { key: 'ballista', hitherto: 'unknown', freshlyAddedStat: 7 },
      { key: 'mortar', hitherto: 'unknown' },
    ];
    const table = renderCodexTable(rows);

    const headers = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent);
    expect(headers).toEqual(['key', 'hitherto', 'freshlyAddedStat']);

    const bodyRows = table.querySelectorAll('tbody tr');
    expect(bodyRows.length).toBe(2);

    const firstCells = Array.from(bodyRows[0].querySelectorAll('td')).map((td) => td.textContent);
    expect(firstCells).toEqual(['ballista', 'unknown', '7']);

    // Row 2 has no `freshlyAddedStat` — the column still exists, the cell is blank,
    // not dropped or misaligned.
    const secondCells = Array.from(bodyRows[1].querySelectorAll('td')).map((td) => td.textContent);
    expect(secondCells).toEqual(['mortar', 'unknown', '']);
  });

  it('formats arrays, nested objects, booleans and null legibly', () => {
    const table = renderCodexTable([
      { traits: ['armoured', 'flying'], attack: { kind: 'single', damage: 10 }, blocks: true, soul: null },
    ]);
    const cells = Array.from(table.querySelectorAll('tbody td')).map((td) => td.textContent);
    expect(cells).toEqual(['armoured, flying', '{"kind":"single","damage":10}', '✓', '—']);
  });

  it('renders an empty table (no columns, no rows) for an empty collection', () => {
    const table = renderCodexTable([]);
    expect(table.querySelectorAll('thead th').length).toBe(0);
    expect(table.querySelectorAll('tbody tr').length).toBe(0);
  });

  it('QA-filed: a self-referential cell value degrades instead of throwing out of the render path', () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    const table = renderCodexTable([{ key: 'x', bad: circular }]);
    const cells = Array.from(table.querySelectorAll('tbody td')).map((td) => td.textContent);
    expect(cells).toEqual(['x', '[unstringifiable]']);
  });
});

describe('buildCodexCollections — every /data collection is reachable', () => {
  const content = loadContent();
  const collections = buildCodexCollections(content);

  it('names every collection the item asks for: class, tower, equipment, damage type, enemy, wave', () => {
    const keys = collections.map((c) => c.key);
    for (const must of ['classes', 'towers', 'equipment', 'damagetypes', 'enemies', 'waves']) {
      expect(keys).toContain(must);
    }
  });

  it('QA-filed: every collection key is unique, so mountCodex never rejects the real roster', () => {
    const keys = collections.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every collection has real rows sourced from the loaded content, none silently empty', () => {
    for (const c of collections) {
      expect(c.rows.length, `${c.key} has no rows`).toBeGreaterThan(0);
    }
  });

  it('row counts match the underlying content arrays exactly (no truncation, no duplication)', () => {
    const byKey = new Map(collections.map((c) => [c.key, c]));
    expect(byKey.get('towers')!.rows.length).toBe(content.towers.towers.length);
    expect(byKey.get('enemies')!.rows.length).toBe(content.enemies.enemies.length);
    expect(byKey.get('waves')!.rows.length).toBe(content.waves.waves.length);
    expect(byKey.get('classes')!.rows.length).toBe(content.classes.classes.length);
    expect(byKey.get('damagetypes')!.rows.length).toBe(content.damageTypes.types.length);
  });

  // p12e: the Codex enemies column shows the HP an enemy actually *spawns*
  // with (p12c), which since p12e differs for the final boss specifically —
  // it no longer takes `baseHpMul` (QUESTIONS Q177/Q184), unlike every other
  // enemy including the wave-18 `gatebreaker` miniboss, which also carries
  // the `boss` trait but is not the final boss and must keep taking it
  // (code-reviewer p12e finding: the two must not be conflated).
  it('enemies row HP is the spawned value: baseHpMul applies to every enemy except the final boss', () => {
    const byKey = new Map(collections.map((c) => [c.key, c]));
    const rows = byKey.get('enemies')!.rows as unknown as { key: string; hp: number }[];
    const rowByKey = new Map(rows.map((r) => [r.key, r]));
    const defByKey = content.enemyByKey;
    const husk = rowByKey.get('husk')!;
    expect(husk.hp).toBeCloseTo(defByKey.get('husk')!.hp * content.enemies.baseHpMul, 6);
    const gatebreaker = rowByKey.get('gatebreaker')!;
    expect(gatebreaker.hp).toBeCloseTo(defByKey.get('gatebreaker')!.hp * content.enemies.baseHpMul, 6);
    const wardenEater = rowByKey.get('warden_eater')!;
    expect(wardenEater.hp).toBeCloseTo(defByKey.get('warden_eater')!.hp, 6);
    expect(wardenEater.hp).not.toBeCloseTo(defByKey.get('warden_eater')!.hp * content.enemies.baseHpMul, 6);
  });

  it('a schema field the current roster has never used still gets its own column, on real rows', () => {
    // Not synthetic from scratch — real tower rows with one extra property spread
    // on, standing in for "the schema gains a field, some rows populate it". If
    // the renderer ever regressed to a hardcoded column list keyed off known
    // tower fields, this is the case that would catch it and the isolated
    // synthetic-record tests above would not.
    const realRows = content.towers.towers.map((t) => ({ ...t }));
    (realRows[0] as Record<string, unknown>).futureUpgradeSlot = 'prismatic';
    const table = renderCodexTable(realRows);
    const headers = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent);
    expect(headers).toContain('futureUpgradeSlot');
    expect(headers).toContain('cost'); // still carries every real field too

    const firstRowCells = table.querySelectorAll('tbody tr')[0].querySelectorAll('td');
    const col = headers.indexOf('futureUpgradeSlot');
    expect(firstRowCells[col].textContent).toBe('prismatic');
  });

  it('p9c: every collection\'s tunerFile names a real TUNER_FILES entry (code-reviewer Minor #3)', () => {
    // Nothing ties `codex-collections.ts`'s hardcoded `tunerFile` strings to
    // `TUNER_FILES`'s keys at compile time — a future collection added to one
    // side and not the other would silently render an editor whose Save
    // always 400s with "unknown tuner file", discovered only by a developer
    // clicking Save, not by any test.
    const validKeys = new Set(TUNER_FILES.map((f) => f.key));
    for (const c of collections) {
      expect(c.tunerFile, `${c.key} has no tunerFile`).toBeDefined();
      expect(validKeys.has(c.tunerFile!), `${c.key}.tunerFile "${c.tunerFile}" is not in TUNER_FILES`).toBe(true);
    }
  });

  it('a real field (tower cost) survives the generic pipeline into a rendered cell', () => {
    const towers = byKeyRows(collections, 'towers');
    const ballista = content.towers.towers.find((t) => t.key === 'ballista')!;
    const table = renderCodexTable(towers);
    const headers = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent);
    const costCol = headers.indexOf('cost');
    expect(costCol).toBeGreaterThanOrEqual(0);

    const rowIndex = towers.findIndex((r) => r.key === 'ballista');
    const cell = table.querySelectorAll('tbody tr')[rowIndex].querySelectorAll('td')[costCol];
    expect(cell.textContent).toBe(String(ballista.cost));
  });
});

function byKeyRows(collections: ReturnType<typeof buildCodexCollections>, key: string) {
  return collections.find((c) => c.key === key)!.rows;
}

describe('mountCodex — the assembled page', () => {
  function mount(): HTMLElement {
    document.body.innerHTML = '<div id="app"></div>';
    return document.getElementById('app') as HTMLElement;
  }

  it('renders a nav button per collection and shows the first collection by default', () => {
    const root = mount();
    const collections = buildCodexCollections();
    const handle = mountCodex(root, collections);

    const buttons = root.querySelectorAll('.sw-codex-nav-btn');
    expect(buttons.length).toBe(collections.length);
    expect(handle.current()).toBe(collections[0].key);

    const table = root.querySelector('.sw-codex-content table')!;
    expect(table.querySelectorAll('tbody tr').length).toBe(collections[0].rows.length);
  });

  it('switching collections re-renders the table to match the new collection', () => {
    const root = mount();
    const collections = buildCodexCollections();
    const handle = mountCodex(root, collections);

    const towers = collections.find((c) => c.key === 'towers')!;
    handle.select('towers');
    expect(handle.current()).toBe('towers');

    const table = root.querySelector('.sw-codex-content table')!;
    expect(table.querySelectorAll('tbody tr').length).toBe(towers.rows.length);

    const heading = root.querySelector('.sw-codex-content h2')!;
    expect(heading.textContent).toBe(towers.label);
  });

  it('ignores a select() for an unknown key rather than blanking the page', () => {
    const root = mount();
    const handle = mountCodex(root, buildCodexCollections());
    const before = handle.current();
    handle.select('not-a-real-collection');
    expect(handle.current()).toBe(before);
  });

  it('destroy() clears the mounted DOM', () => {
    const root = mount();
    const handle = mountCodex(root, buildCodexCollections());
    handle.destroy();
    expect(root.innerHTML).toBe('');
    expect(root.classList.contains('sw-codex')).toBe(false);
  });

  it('QA-filed: select()/current() go inert after destroy() rather than writing into a detached subtree', () => {
    const root = mount();
    const handle = mountCodex(root, buildCodexCollections());
    handle.destroy();

    handle.select('towers');
    expect(handle.current()).toBeNull();
    expect(root.innerHTML).toBe('');
  });

  it('QA-filed: rejects a collections list with a duplicate key rather than silently picking a winner', () => {
    const root = mount();
    const dup: CodexCollection[] = [
      { key: 'dup', label: 'Dup A', rows: [{ a: 1 }] },
      { key: 'dup', label: 'Dup B', rows: [{ b: 2 }] },
    ];
    expect(() => mountCodex(root, dup)).toThrow(/duplicate collection key/);
  });

  it('renders every named /data collection’s table without throwing, end to end', () => {
    const root = mount();
    const collections = buildCodexCollections();
    const handle = mountCodex(root, collections);
    for (const c of collections) {
      handle.select(c.key);
      const rows = root.querySelectorAll('.sw-codex-content tbody tr');
      expect(rows.length, `${c.key} did not render its rows`).toBe(c.rows.length);
    }
  });
});
