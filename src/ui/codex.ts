/**
 * SPEC-V3 T5, gate C6 — the Codex's read-only half. A generic table renderer
 * over any collection of plain records: it never names a field, so a schema
 * gaining a field (and data filling it) shows up with zero changes here. The
 * edit half (t26c) and the save endpoint (t26b) are separate lane items.
 *
 * Wired into the Hub's Codex tab (`src/ui/hub.ts`, p9b). See
 * BACKLOG-TUNER.md's Log for the lane history that built this standalone.
 */
import { buildCodexCollections, type CodexCollection } from './codex-collections';
import { mountTunerPanel } from './tuner';

function formatCell(value: unknown): string {
  if (value === undefined) return '';
  if (value === null) return '—';
  if (typeof value === 'boolean') return value ? '✓' : '';
  if (Array.isArray(value)) return value.map(formatCell).join(', ');
  if (typeof value === 'object') {
    // /data is plain JSON and cannot encode a cycle, but this renderer is also
    // t26c's read half — a live-edited in-memory object can. A crash here
    // would abort mounting mid-render (QA-filed), so a cell degrades instead.
    try {
      return JSON.stringify(value);
    } catch {
      return '[unstringifiable]';
    }
  }
  return String(value);
}

/**
 * The union of every key present across a collection's rows, in first-seen
 * order — not the keys of row 0 alone, since an optional field absent from
 * the first record must still get a column.
 */
export function collectColumns(rows: Record<string, unknown>[]): string[] {
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  return columns;
}

export function renderCodexTable(rows: Record<string, unknown>[]): HTMLTableElement {
  const table = document.createElement('table');
  table.className = 'sw-codex-table';
  const columns = collectColumns(rows);

  const thead = table.createTHead();
  const headRow = thead.insertRow();
  for (const col of columns) {
    const th = document.createElement('th');
    th.textContent = col;
    headRow.appendChild(th);
  }

  const tbody = table.createTBody();
  for (const row of rows) {
    const tr = tbody.insertRow();
    for (const col of columns) {
      const td = tr.insertCell();
      td.textContent = formatCell(row[col]);
    }
  }
  return table;
}

export interface CodexHandle {
  /** Which collection key is currently shown. */
  current(): string | null;
  /** Switches the visible collection by key; a no-op for an unknown key. */
  select(key: string): void;
  destroy(): void;
}

export function mountCodex(
  root: HTMLElement,
  collections: CodexCollection[] = buildCodexCollections(),
): CodexHandle {
  // QA-filed: a duplicate key otherwise splits silently between two code
  // paths — the nav highlight (keyed off a Map, last-wins) and select()
  // (Array.find, first-wins) disagree about which collection "dup" means.
  // Same posture as content.ts's own referential-integrity checks: fail
  // loudly at construction rather than pick a winner nobody asked for.
  const seenKeys = new Set<string>();
  for (const c of collections) {
    if (seenKeys.has(c.key)) throw new Error(`mountCodex: duplicate collection key "${c.key}"`);
    seenKeys.add(c.key);
  }

  root.innerHTML = '';
  root.classList.add('sw-codex');

  const nav = document.createElement('nav');
  nav.className = 'sw-codex-nav';
  const content = document.createElement('div');
  content.className = 'sw-codex-content';

  let currentKey: string | null = null;
  let destroyed = false;
  const buttons = new Map<string, HTMLButtonElement>();

  function show(collection: CodexCollection): void {
    currentKey = collection.key;
    for (const [key, btn] of buttons) btn.classList.toggle('active', key === collection.key);

    content.innerHTML = '';
    const heading = document.createElement('h2');
    heading.textContent = collection.label;
    content.appendChild(heading);

    const count = document.createElement('p');
    count.className = 'sw-codex-count';
    count.textContent = `${collection.rows.length} ${collection.rows.length === 1 ? 'entry' : 'entries'}`;
    content.appendChild(count);

    const table = renderCodexTable(collection.rows);
    content.appendChild(table);

    // fb028: a collection that opted into `renderDetail` gets its rows made
    // clickable, showing that row's full live-formatted effect text below
    // the table — the Codex's other collections are untouched (no
    // `renderDetail`, no click wiring, table alone as before).
    if (collection.renderDetail) {
      const detail = document.createElement('div');
      detail.className = 'sw-codex-detail';
      detail.innerHTML = '<p class="sw-note dim">Click a row above for full effect text.</p>';
      content.appendChild(detail);
      const bodyRows = table.tBodies[0]?.rows;
      if (bodyRows) {
        for (let i = 0; i < bodyRows.length; i++) {
          const tr = bodyRows[i];
          tr.classList.add('sw-codex-row-clickable');
          tr.addEventListener('click', () => {
            for (const other of bodyRows) other.classList.remove('active');
            tr.classList.add('active');
            detail.innerHTML = collection.renderDetail!(collection.rows[i]);
          });
        }
      }
    }

    const tunerRoot = document.createElement('div');
    tunerRoot.className = 'sw-codex-tuner';
    content.appendChild(tunerRoot);
    mountTunerPanel(tunerRoot, collection);
  }

  for (const collection of collections) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sw-codex-nav-btn';
    btn.textContent = collection.label;
    btn.dataset.codexKey = collection.key;
    btn.addEventListener('click', () => show(collection));
    buttons.set(collection.key, btn);
    nav.appendChild(btn);
  }

  root.appendChild(nav);
  root.appendChild(content);

  if (collections.length > 0) show(collections[0]);

  return {
    // QA-filed: post-destroy, `nav`/`content` are detached from `root` but the
    // closure still holds them, so writes here would silently succeed against
    // nothing rather than signal the handle is dead.
    current: () => (destroyed ? null : currentKey),
    select(key: string) {
      if (destroyed) return;
      const collection = collections.find((c) => c.key === key);
      if (collection) show(collection);
    },
    destroy() {
      destroyed = true;
      root.innerHTML = '';
      root.classList.remove('sw-codex');
    },
  };
}
