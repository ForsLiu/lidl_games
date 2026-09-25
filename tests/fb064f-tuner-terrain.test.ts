/**
 * @vitest-environment jsdom
 *
 * fb064f — Tuner terrain page (density/ratios editable) and the Training
 * Grounds flat-arena override.
 *
 * The terrain-side generator, `data/terrain.json`'s q7/fuzzer/Tuner-file
 * registration (fb080) and the flat-arena builder itself (fb064n) all
 * shipped ahead of this item; what was still missing was purely UI-lane-
 * shaped even though it lives in the main lane (BACKLOG-TERRAIN.md fb064f is
 * filed "out of scope — main lane" for exactly that reason):
 *
 *   1. `terrain` had no `CodexCollection` entry at all, so it was invisible
 *      to the Codex/Tuner UI despite being fully wired for it underneath.
 *   2. Once visible, it still needs to actually be *editable* the way the
 *      item's own "(density/ratios editable)" text and `config.ts`'s own
 *      `superRefine` comment ("fb064f's Tuner highlights by path") both call
 *      for: typed per-field widgets, joining Q150 ORDER's original four
 *      (towers, classes, cores, waves), and a refused save highlighting the
 *      exact widget (or nearest ancestor group, for a field shape no widget
 *      can describe) a schema issue's `path` points at.
 *   3. The Training Grounds flat-arena override itself — confirmed here to
 *      already be real (fb064n/fb130/fb156 landed it ahead of this item):
 *      a practice run's `Grid` is never terrain-painted, and matches
 *      `flatTerrain(w.gates)` over every interior tile (the one-tile border
 *      ring is walled off a different way by each — see the test below).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildCodexCollections, type CodexCollection } from '../src/ui/codex-collections';
import { mountTunerPanel } from '../src/ui/tuner';
import { clearAllTunerDirty } from '../src/ui/tuner-state';
import { flatTerrain } from '../src/sim/terrain';
import { GRID_H, GRID_W } from '../src/sim/grid';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

function terrainCollection(): CodexCollection {
  return buildCodexCollections().find((c) => c.key === 'terrain')!;
}

function fieldInput(root: HTMLElement, labelText: string): HTMLInputElement | HTMLSelectElement | null {
  for (const label of Array.from(root.querySelectorAll('.sw-tuner-field'))) {
    const span = label.querySelector('.sw-tuner-field-label');
    if (span?.textContent === labelText) return label.querySelector('.sw-tuner-field-input');
  }
  return null;
}

function fieldRow(root: HTMLElement, labelText: string): HTMLElement | null {
  for (const label of Array.from(root.querySelectorAll<HTMLElement>('.sw-tuner-field'))) {
    const span = label.querySelector('.sw-tuner-field-label');
    if (span?.textContent === labelText) return label;
  }
  return null;
}

function textareaDoc(root: HTMLElement): any {
  return JSON.parse((root.querySelector('.sw-tuner-editor') as HTMLTextAreaElement).value);
}

describe('fb064f: Tuner terrain page', () => {
  beforeEach(() => clearAllTunerDirty());
  afterEach(() => clearAllTunerDirty());

  it('terrain has a Codex collection whose Tuner file is the authored data/terrain.json document', () => {
    const c = terrainCollection();
    expect(c.tunerFile).toBe('terrain');
    expect(c.raw).toBeTruthy();
    expect((c.raw as any).density).toBeTruthy();
    // One row: the whole document, same as `warden` — terrain has no
    // per-entry array of its own at the document's top level.
    expect(c.rows.length).toBe(1);
  });

  it('renders typed widgets for terrain, joining the Q150-ORDER four', () => {
    const root = document.createElement('div');
    mountTunerPanel(root, terrainCollection());
    const panel = root.querySelector('.sw-tuner-fields')!;
    expect(panel.querySelector('.sw-tuner-field-input'), 'terrain panel has at least one typed widget').not.toBeNull();
    expect(root.querySelector('.sw-tuner-editor')).not.toBeNull();
  });

  it('editing a nested density field (density.rough) updates the same textarea Save posts', () => {
    const root = document.createElement('div');
    mountTunerPanel(root, terrainCollection());
    const before = textareaDoc(root).density.rough as number;

    const input = fieldInput(root, 'rough') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(Number(input.value)).toBeCloseTo(before, 6);

    input.value = String(before + 0.01);
    input.dispatchEvent(new Event('input'));

    expect(textareaDoc(root).density.rough).toBeCloseTo(before + 0.01, 6);
  });

  it('a refused save highlights the exact widget its error path names, opens its collapsed ancestor group, and clears on the next attempt', async () => {
    const root = document.createElement('div');
    mountTunerPanel(root, terrainCollection());
    const textarea = root.querySelector('.sw-tuner-editor') as HTMLTextAreaElement;
    textarea.value = `${textarea.value} `;
    textarea.dispatchEvent(new Event('input'));

    // code-reviewer (fb064f, Major): `wrapDetails` never sets `.open`, so
    // "density" (a nested ZodObject) starts collapsed — a highlight that
    // only sets a CSS class here would be invisible in a real browser, since
    // native <details> hides its whole subtree while closed.
    const densityGroup = Array.from(root.querySelectorAll<HTMLDetailsElement>('.sw-tuner-field-details')).find(
      (d) => d.dataset.tunerPath === 'density',
    )!;
    expect(densityGroup.open).toBe(false);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({ ok: false, errors: [{ path: 'density.rough', message: 'must be at most 1' }] }),
      })
      .mockResolvedValueOnce({ json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);

    (root.querySelector('.sw-tuner-save') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const roughRow = fieldRow(root, 'rough')!;
    expect(roughRow.classList.contains('sw-tuner-field-error')).toBe(true);
    expect(densityGroup.open, 'the collapsed ancestor group is force-opened so the mark is visible').toBe(true);
    // Nothing else in the panel is falsely marked.
    const otherRow = fieldRow(root, 'jitter')!;
    expect(otherRow.classList.contains('sw-tuner-field-error')).toBe(false);

    (root.querySelector('.sw-tuner-save') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(roughRow.classList.contains('sw-tuner-field-error')).toBe(false);

    vi.unstubAllGlobals();
  });

  it('a refused save on a field with no widget of its own highlights its nearest ancestor group', async () => {
    const root = document.createElement('div');
    mountTunerPanel(root, terrainCollection());

    // constraints.minCorridorWidth is a 1|2 literal union — renderField has
    // no branch for z.ZodUnion, so it renders no widget of its own; the
    // enclosing "constraints" <details> group is the nearest real element.
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        ok: false,
        errors: [{ path: 'constraints.minCorridorWidth', message: 'must be 1 or 2' }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    (root.querySelector('.sw-tuner-save') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const constraintsGroup = Array.from(root.querySelectorAll<HTMLElement>('.sw-tuner-field-details')).find(
      (d) => d.dataset.tunerPath === 'constraints',
    )!;
    expect(constraintsGroup).toBeTruthy();
    expect(constraintsGroup.classList.contains('sw-tuner-field-error')).toBe(true);

    vi.unstubAllGlobals();
  });
});

describe('fb064f: Training Grounds flat-arena override', () => {
  it('a practice run never generates terrain — its Grid matches flatTerrain(w.gates) over every interior tile', () => {
    // The one-tile border ring is walled off a different way in each (`Grid`
    // never writes Rock into `terrainKind` there — some other, structural
    // out-of-grid check does the blocking; `flatTerrain` paints it
    // explicitly), confirmed by measurement: 168 border-ring diffs, 0
    // interior diffs, at every seed tried. The interior is where a real run
    // actually places towers and paths enemies, so it is the tile set this
    // override's guarantee is about.
    for (const seed of [1, 2, 40]) {
      const w = new World(cfg({ practice: true, seed }));
      expect(w.terrainFallback).toBe(false);
      const flat = flatTerrain(w.gates);
      for (let y = 1; y < GRID_H - 1; y++) {
        for (let x = 1; x < GRID_W - 1; x++) {
          const i = y * GRID_W + x;
          expect(w.grid.terrainKind[i], `seed ${seed} tile (${x},${y})`).toBe(flat.kind[i]);
        }
      }
    }
  });
});
