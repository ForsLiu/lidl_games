/**
 * @vitest-environment jsdom
 *
 * fb044 (§11, QUESTIONS Q150 ORDER): typed per-field widgets for the four
 * collections the owner tunes most — towers, classes, cores, waves — layered
 * above the whole-document JSON editor p9c already shipped. Confirms: (1)
 * each of the four gets typed widgets for its numeric/enum/boolean fields,
 * both at the document's top level and inside its array-of-rows; (2) editing
 * a widget round-trips into the *same* textarea Save already posts, so it
 * goes through the identical `postTunerSave`/schema-validation path, not a
 * second one; (3) a dynamic-key record (no fixed field list a widget can
 * describe) is left to the JSON editor, not silently dropped; (4) a
 * collection outside the owner's four gets no typed-field panel at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildCodexCollections, type CodexCollection } from '../src/ui/codex-collections';
import { clearAllTunerDirty, hasUnsavedTunerEdits } from '../src/ui/tuner-state';
import { mountTunerPanel } from '../src/ui/tuner';

function collection(key: string): CodexCollection {
  return buildCodexCollections().find((c) => c.key === key)!;
}

function fieldInput(root: HTMLElement, labelText: string): HTMLInputElement | HTMLSelectElement | null {
  for (const label of Array.from(root.querySelectorAll('.sw-tuner-field'))) {
    const span = label.querySelector('.sw-tuner-field-label');
    if (span?.textContent === labelText) {
      return label.querySelector('.sw-tuner-field-input');
    }
  }
  return null;
}

function textareaDoc(root: HTMLElement): any {
  return JSON.parse((root.querySelector('.sw-tuner-editor') as HTMLTextAreaElement).value);
}

describe('Tuner per-field widgets (fb044, Q150 ORDER)', () => {
  beforeEach(() => clearAllTunerDirty());
  afterEach(() => {
    clearAllTunerDirty();
    vi.unstubAllGlobals();
  });

  it('renders a typed-field panel for each of the four owner-ordered collections', () => {
    for (const key of ['towers', 'classes', 'cores', 'waves']) {
      const root = document.createElement('div');
      mountTunerPanel(root, collection(key));
      const panel = root.querySelector('.sw-tuner-fields')!;
      expect(panel.querySelector('.sw-tuner-field-input'), `${key} panel has at least one typed widget`).not.toBeNull();
      // The JSON editor is still there too — this is additive, not a replacement.
      expect(root.querySelector('.sw-tuner-editor')).not.toBeNull();
    }
  });

  it('renders no typed-field panel for a collection outside the four (JSON editor only)', () => {
    const root = document.createElement('div');
    mountTunerPanel(root, collection('enemies'));
    const panel = root.querySelector('.sw-tuner-fields')!;
    expect(panel.children.length).toBe(0);
    expect(root.querySelector('.sw-tuner-editor')).not.toBeNull();
  });

  it('waves: editing a top-level numeric field updates the same textarea Save posts', () => {
    const root = document.createElement('div');
    const c = collection('waves');
    mountTunerPanel(root, c);
    const before = textareaDoc(root).hpScalePerWave;

    const input = fieldInput(root, 'hpScalePerWave') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe(String(before));

    input.value = String(before + 1);
    input.dispatchEvent(new Event('input'));

    expect(textareaDoc(root).hpScalePerWave).toBe(before + 1);
    expect(hasUnsavedTunerEdits()).toBe(true);
  });

  it('towers: editing a nested per-row field (towers[0].cost) updates the right array element', () => {
    const root = document.createElement('div');
    const c = collection('towers');
    mountTunerPanel(root, c);
    const doc = textareaDoc(root) as { towers: { key: string; cost: number }[] };
    const firstKey = doc.towers[0].key;
    const before = doc.towers[0].cost;

    // The per-row <details> is labeled by the row's own `key` field.
    const rowDetails = Array.from(root.querySelectorAll('.sw-tuner-field-details')).find(
      (d) => d.querySelector(':scope > summary')?.textContent === `key: ${firstKey}`,
    ) as HTMLElement;
    expect(rowDetails, 'first tower row rendered as its own details block').not.toBeUndefined();

    const costInput = fieldInput(rowDetails, 'cost') as HTMLInputElement;
    expect(costInput).not.toBeNull();
    costInput.value = String(before + 5);
    costInput.dispatchEvent(new Event('input'));

    const after = textareaDoc(root) as { towers: { key: string; cost: number }[] };
    expect(after.towers[0].cost).toBe(before + 5);
    // Every other tower row is untouched.
    expect(after.towers.slice(1)).toEqual(doc.towers.slice(1));
  });

  it('towers: a boolean field (blocks) renders a checkbox and toggling it flips the value', () => {
    const root = document.createElement('div');
    mountTunerPanel(root, collection('towers'));
    const doc = textareaDoc(root) as { towers: { key: string; blocks: boolean }[] };
    const firstKey = doc.towers[0].key;
    const rowDetails = Array.from(root.querySelectorAll('.sw-tuner-field-details')).find(
      (d) => d.querySelector(':scope > summary')?.textContent === `key: ${firstKey}`,
    ) as HTMLElement;

    const checkbox = fieldInput(rowDetails, 'blocks') as HTMLInputElement;
    expect(checkbox.type).toBe('checkbox');
    expect(checkbox.checked).toBe(doc.towers[0].blocks);

    checkbox.checked = !doc.towers[0].blocks;
    checkbox.dispatchEvent(new Event('change'));

    const after = textareaDoc(root) as { towers: { blocks: boolean }[] };
    expect(after.towers[0].blocks).toBe(!doc.towers[0].blocks);
  });

  it('classes: an enum field (active1.kind) renders a <select> with the schema options, and changing it writes back', () => {
    const root = document.createElement('div');
    mountTunerPanel(root, collection('classes'));
    const doc = textareaDoc(root) as { classes: { key: string; active1: { kind: string } }[] };
    const firstKey = doc.classes[0].key;
    const rowDetails = Array.from(root.querySelectorAll('.sw-tuner-field-details')).find(
      (d) => d.querySelector(':scope > summary')?.textContent === `key: ${firstKey}`,
    ) as HTMLElement;
    const active1Details = Array.from(rowDetails.querySelectorAll('.sw-tuner-field-details')).find(
      (d) => d.querySelector(':scope > summary')?.textContent === 'active1',
    ) as HTMLElement;
    expect(active1Details, 'active1 nested as its own details block').not.toBeUndefined();

    const select = fieldInput(active1Details, 'kind') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toContain('burst_damage');
    expect(options).toContain(doc.classes[0].active1.kind);

    const otherKind = options.find((o) => o !== doc.classes[0].active1.kind)!;
    select.value = otherKind;
    select.dispatchEvent(new Event('change'));

    const after = textareaDoc(root) as { classes: { active1: { kind: string } }[] };
    expect(after.classes[0].active1.kind).toBe(otherKind);
  });

  it('cores: baseHp gets a typed widget, but the dynamic-key `effects`/`steps` records are left to the JSON editor', () => {
    const root = document.createElement('div');
    mountTunerPanel(root, collection('cores'));
    const doc = textareaDoc(root) as { cores: { key: string; baseHp: number }[] };
    const firstKey = doc.cores[0].key;
    const rowDetails = Array.from(root.querySelectorAll('.sw-tuner-field-details')).find(
      (d) => d.querySelector(':scope > summary')?.textContent === `key: ${firstKey}`,
    ) as HTMLElement;

    const baseHpInput = fieldInput(rowDetails, 'baseHp') as HTMLInputElement;
    expect(baseHpInput).not.toBeNull();
    baseHpInput.value = String(doc.cores[0].baseHp + 50);
    baseHpInput.dispatchEvent(new Event('input'));
    const after = textareaDoc(root) as { cores: { baseHp: number }[] };
    expect(after.cores[0].baseHp).toBe(doc.cores[0].baseHp + 50);

    // No widget anywhere claims to edit a record field by name — those stay JSON-only.
    const allLabels = Array.from(root.querySelectorAll('.sw-tuner-field-label')).map((s) => s.textContent);
    expect(allLabels).not.toContain('effects');
  });

  it('a typed-field edit Saves through the exact same /__tuner/save call as the textarea', async () => {
    const root = document.createElement('div');
    mountTunerPanel(root, collection('waves'));
    const before = textareaDoc(root).hpScalePerWave;
    const input = fieldInput(root, 'hpScalePerWave') as HTMLInputElement;
    input.value = String(before + 2);
    input.dispatchEvent(new Event('input'));

    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    (root.querySelector('.sw-tuner-save') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/__tuner/save');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.key).toBe('waves');
    expect(body.data.hpScalePerWave).toBe(before + 2);
    expect(hasUnsavedTunerEdits()).toBe(false);
  });

  it('typing a non-numeric value into a number widget is ignored rather than writing NaN', () => {
    const root = document.createElement('div');
    mountTunerPanel(root, collection('waves'));
    const before = textareaDoc(root).hpScalePerWave;
    const input = fieldInput(root, 'hpScalePerWave') as HTMLInputElement;

    input.value = 'not a number';
    input.dispatchEvent(new Event('input'));

    expect(textareaDoc(root).hpScalePerWave).toBe(before);
  });

  it('classes: a nullable string field (unlockQuest) renders a text input even when the live value is null', () => {
    const root = document.createElement('div');
    mountTunerPanel(root, collection('classes'));
    const doc = textareaDoc(root) as { classes: { key: string; unlockQuest: string | null }[] };
    const nullRow = doc.classes.find((c) => c.unlockQuest === null)!;
    expect(nullRow, 'fixture has at least one class with unlockQuest: null').not.toBeUndefined();

    const rowDetails = Array.from(root.querySelectorAll('.sw-tuner-field-details')).find(
      (d) => d.querySelector(':scope > summary')?.textContent === `key: ${nullRow.key}`,
    ) as HTMLElement;
    const input = fieldInput(rowDetails, 'unlockQuest') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.tagName).toBe('INPUT');
    expect(input.value).toBe('');

    input.value = 'some_quest';
    input.dispatchEvent(new Event('input'));

    const after = textareaDoc(root) as { classes: { key: string; unlockQuest: string | null }[] };
    expect(after.classes.find((c) => c.key === nullRow.key)!.unlockQuest).toBe('some_quest');

    // Clearing it back writes the schema's actual `null`, not an empty string that would
    // pass validation but silently change what the field means (code-reviewer Minor #2).
    input.value = '';
    input.dispatchEvent(new Event('input'));
    const cleared = textareaDoc(root) as { classes: { key: string; unlockQuest: string | null }[] };
    expect(cleared.classes.find((c) => c.key === nullRow.key)!.unlockQuest).toBeNull();
  });

  it('waves: a two-levels-deep array field (waves[].groups[].perGate) is independently editable', () => {
    const root = document.createElement('div');
    mountTunerPanel(root, collection('waves'));
    const doc = textareaDoc(root) as { waves: { wave: number; groups: { enemy: string; perGate?: number }[] }[] };
    const waveNum = doc.waves[0].wave;
    const before = doc.waves[0].groups[0].perGate;
    expect(before, 'fixture wave 1 has a perGate on its first group').not.toBeUndefined();

    const waveDetails = Array.from(root.querySelectorAll('.sw-tuner-field-details')).find(
      (d) => d.querySelector(':scope > summary')?.textContent === `wave: ${waveNum}`,
    ) as HTMLElement;
    expect(waveDetails, 'the wave row itself is rendered').not.toBeUndefined();
    const groupDetails = Array.from(waveDetails.querySelectorAll('.sw-tuner-field-details')).find(
      (d) => d.querySelector(':scope > summary')?.textContent?.startsWith('enemy:'),
    ) as HTMLElement;
    expect(groupDetails, 'the group row nested inside the wave row').not.toBeUndefined();

    const perGateInput = fieldInput(groupDetails, 'perGate') as HTMLInputElement;
    expect(perGateInput).not.toBeNull();
    perGateInput.value = String((before as number) + 3);
    perGateInput.dispatchEvent(new Event('input'));

    const after = textareaDoc(root) as { waves: { groups: { perGate?: number }[] }[] };
    expect(after.waves[0].groups[0].perGate).toBe((before as number) + 3);
  });

  it('towers: editing a field inside an optional nested object absent from the row creates it instead of throwing', () => {
    // code-reviewer's Critical #1: most towers ship with no `buffAura`/`economy`/`passive`
    // at all (only 1-2 of 10 have any of the three in data/towers.json), but the widget
    // for e.g. `economy.goldPerWavePerTier` still renders unconditionally.
    const root = document.createElement('div');
    mountTunerPanel(root, collection('towers'));
    const doc = textareaDoc(root) as { towers: { key: string; economy?: { goldPerWavePerTier: number } }[] };
    const noEconomyRow = doc.towers.find((t) => t.economy === undefined)!;
    expect(noEconomyRow, 'fixture has a tower with no economy block').not.toBeUndefined();

    const rowDetails = Array.from(root.querySelectorAll('.sw-tuner-field-details')).find(
      (d) => d.querySelector(':scope > summary')?.textContent === `key: ${noEconomyRow.key}`,
    ) as HTMLElement;
    const economyDetails = Array.from(rowDetails.querySelectorAll('.sw-tuner-field-details')).find(
      (d) => d.querySelector(':scope > summary')?.textContent === 'economy',
    ) as HTMLElement;
    expect(economyDetails, 'economy still renders a widget group despite being absent').not.toBeUndefined();

    const input = fieldInput(economyDetails, 'goldPerWavePerTier') as HTMLInputElement;
    expect(input).not.toBeNull();

    expect(() => {
      input.value = '5';
      input.dispatchEvent(new Event('input'));
    }).not.toThrow();

    const after = textareaDoc(root) as { towers: { key: string; economy?: { goldPerWavePerTier: number } }[] };
    expect(after.towers.find((t) => t.key === noEconomyRow.key)!.economy).toEqual({ goldPerWavePerTier: 5 });
    // Every other tower's own economy block (present or absent) is untouched.
    for (const t of after.towers) {
      if (t.key !== noEconomyRow.key) {
        expect(t.economy).toEqual(doc.towers.find((d) => d.key === t.key)!.economy);
      }
    }
  });

  it('towers: a widget edit does not tear down and rebuild the panel, so focus and other in-progress edits survive', () => {
    // code-reviewer's Major #1: renderFieldsPanel() used to be called from inside every
    // widget's own onChange, replacing the whole DOM subtree (and the focused node with
    // it) on literally every keystroke.
    const root = document.createElement('div');
    document.body.appendChild(root); // .focus() is a no-op on a node outside the document
    mountTunerPanel(root, collection('towers'));

    const input = fieldInput(root, 'upgradeStepMul') as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);

    input.value = '1.5';
    input.dispatchEvent(new Event('input'));

    expect(document.activeElement).toBe(input);
    expect(root.contains(input)).toBe(true);

    root.remove();
  });

  it('towers: two widget edits fired back-to-back both land, even though the panel is never rebuilt between them', () => {
    // The other half of the Major #1 fix: onChange re-reads the *current* textarea text
    // on every call rather than closing over a snapshot from the last render, so a second
    // edit can no longer silently overwrite a first one that hasn't triggered a rerender.
    const root = document.createElement('div');
    mountTunerPanel(root, collection('towers'));
    const before = textareaDoc(root) as { upgradeStepMul: number; aoeFullTargets: number };

    const a = fieldInput(root, 'upgradeStepMul') as HTMLInputElement;
    const b = fieldInput(root, 'aoeFullTargets') as HTMLInputElement;

    a.value = String(before.upgradeStepMul + 1);
    a.dispatchEvent(new Event('input'));
    b.value = String(before.aoeFullTargets + 1);
    b.dispatchEvent(new Event('input'));

    const after = textareaDoc(root) as { upgradeStepMul: number; aoeFullTargets: number };
    expect(after.upgradeStepMul).toBe(before.upgradeStepMul + 1);
    expect(after.aoeFullTargets).toBe(before.aoeFullTargets + 1);
  });

  it('towers: a discriminated union (vsSpecial) shows its active kind read-only and the matching variant\'s own fields typed', () => {
    const root = document.createElement('div');
    mountTunerPanel(root, collection('towers'));
    const doc = textareaDoc(root) as {
      towers: { key: string; vsSpecial: { kind: string; damage?: number; interval?: number } }[];
    };
    const electric = doc.towers.find((t) => t.vsSpecial.kind === 'electricWireGrid')!;
    expect(electric, 'fixture has a tower with vsSpecial.kind electricWireGrid').not.toBeUndefined();

    const rowDetails = Array.from(root.querySelectorAll('.sw-tuner-field-details')).find(
      (d) => d.querySelector(':scope > summary')?.textContent === `key: ${electric.key}`,
    ) as HTMLElement;
    const vsSpecialDetails = Array.from(rowDetails.querySelectorAll('.sw-tuner-field-details')).find(
      (d) => d.querySelector(':scope > summary')?.textContent === 'vsSpecial',
    ) as HTMLElement;
    expect(vsSpecialDetails, 'vsSpecial renders its own details block').not.toBeUndefined();

    const readonly = vsSpecialDetails.querySelector('.sw-tuner-field-readonly');
    expect(readonly?.textContent).toMatch(/kind: electricWireGrid/);
    // No select for `kind` itself — switching the variant is JSON-editor-only (Q150's own scoping).
    expect(fieldInput(vsSpecialDetails, 'kind')).toBeNull();

    const damageInput = fieldInput(vsSpecialDetails, 'damage') as HTMLInputElement;
    expect(damageInput).not.toBeNull();
    damageInput.value = String(electric.vsSpecial.damage! + 1);
    damageInput.dispatchEvent(new Event('input'));

    const after = textareaDoc(root) as { towers: { key: string; vsSpecial: { damage?: number } }[] };
    expect(after.towers.find((t) => t.key === electric.key)!.vsSpecial.damage).toBe(electric.vsSpecial.damage! + 1);
  });
});
