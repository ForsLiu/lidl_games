/**
 * @vitest-environment jsdom
 *
 * fb160 (owner feedback `ui-dps-panel-bars`): "the DPS panel shows only
 * whole-run damage (no per-wave view): total damage at the top, then one
 * horizontal bar per source ... each bar segmented by damage TYPE in the
 * damage-type colors, with the source's total number printed at the right end
 * of its bar; sorted by total. Hover a segment: that type's amount and
 * percent." Done when: "bars render from the run report; numbers reconcile
 * with the sim's damage ledger (test); colors from data/damagetypes.json."
 *
 * This file reconciles the **rendered** panel — the text, widths, colors and
 * hover titles a player actually sees — against the sim's own ledgers, on a
 * real bot run.
 */
import { describe, expect, it } from 'vitest';

import '../src/bots';
import { dpsPanelData, type DpsPanelData } from '../src/ui/dps-panel';
import { dpsPanelBodyMarkup, Hud } from '../src/ui/hud';
import { damageEnemy, spawnEnemy } from '../src/sim/enemies';
import { World } from '../src/sim/world';
import { defaultSettings } from '../src/ui/settings';
import { cfg, runWithPolicy } from './helpers';

function render(html: string): HTMLElement {
  document.body.innerHTML = `<div id="dps">${html}</div>`;
  return document.getElementById('dps') as HTMLElement;
}

/** `formatDamage`'s own rendering (hud.ts): rounded, thousands-grouped. */
const shown = (v: number): string => Math.round(v).toLocaleString();

function hexToRgb(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

describe('fb160 — the rendered DPS bars reconcile with the sim ledgers', () => {
  const { run } = runWithPolicy(cfg({ policy: 'hybrid', practice: true }), 'hybrid', 60 * 60 * 10);
  const w = run.world;
  const report = run.report();
  const root = render(dpsPanelBodyMarkup(dpsPanelData(w)));
  const rows = [...root.querySelectorAll<HTMLElement>('.sw-dpsbar-row')];

  it('the harness dealt damage from more than one source', () => {
    expect(report.damageTotal).toBeGreaterThan(0);
    expect(rows.length).toBeGreaterThan(1);
  });

  it('the total at the top is the run report\'s damage total', () => {
    const total = root.querySelector('.sw-dps-total')!;
    expect(total.textContent).toContain(shown(report.damageTotal));
  });

  it('one bar per source that dealt damage, sorted by total, each total printed at its end', () => {
    const sources = Object.entries(report.damageByWeapon).filter(([, v]) => v > 0);
    expect(rows.map((r) => r.dataset.src).sort()).toEqual(sources.map(([k]) => k).sort());
    const totals = rows.map((r) => report.damageByWeapon[r.dataset.src!] ?? 0);
    for (let i = 1; i < totals.length; i++) expect(totals[i]!).toBeLessThanOrEqual(totals[i - 1]!);
    for (const r of rows) {
      expect(r.querySelector('.sw-dpsbar-total')!.textContent).toBe(shown(report.damageByWeapon[r.dataset.src!] ?? 0));
    }
  });

  it('bar lengths are proportional to the totals, the top one full', () => {
    const top = report.damageByWeapon[rows[0]!.dataset.src!] ?? 0;
    for (const r of rows) {
      const width = Number.parseFloat((r.querySelector('.sw-dpsbar') as HTMLElement).style.width);
      expect(width).toBeCloseTo(((report.damageByWeapon[r.dataset.src!] ?? 0) / top) * 100, 2);
    }
  });

  it('every segment is one damage type of that source: width, color and hover text all come from the ledger', () => {
    for (const r of rows) {
      const src = r.dataset.src!;
      const byType = report.damageBySourceType[src] ?? {};
      const total = report.damageByWeapon[src] ?? 0;
      const segs = [...r.querySelectorAll<HTMLElement>('.sw-dpsseg')];
      expect(segs.map((s) => s.dataset.type).sort()).toEqual(
        Object.entries(byType)
          .filter(([, v]) => v > 0)
          .map(([k]) => k)
          .sort(),
      );
      let widthSum = 0;
      for (const s of segs) {
        const type = s.dataset.type!;
        const amount = byType[type] ?? 0;
        const def = w.content.damageTypeByKey.get(type)!;
        const width = Number.parseFloat(s.style.width);
        widthSum += width;
        expect(width, `${src}/${type}`).toBeCloseTo((amount / total) * 100, 2);
        expect(s.style.background, `${src}/${type} color`).toBe(hexToRgb(def.color ?? ""));
        expect(s.title).toBe(`${def.name}: ${shown(amount)} (${Math.round((amount / total) * 100)}%)`);
      }
      expect(widthSum, src).toBeCloseTo(100, 2);
    }
  });

  it('has no per-wave view any more', () => {
    expect(root.textContent).not.toMatch(/\bWave \d|VS wave/);
    expect(root.querySelectorAll('.sw-sub')).toHaveLength(0);
  });
});

describe('fb160 — the live panel', () => {
  function hud(accessiblePalette: boolean): { hud: Hud; root: HTMLElement } {
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.getElementById('app') as HTMLElement;
    const callbacks = new Proxy({}, { get: () => () => {} }) as ConstructorParameters<typeof Hud>[1];
    const h = new Hud(root, callbacks, { ...defaultSettings(), accessiblePalette });
    return { hud: h, root };
  }

  it('renders the bars in the docked panel, in the colorblind palette when that setting is on', () => {
    const w = new World(cfg({ practice: true }));
    const e = spawnEnemy(w, 'husk', 3, 3)!;
    damageEnemy(w, e, 5, 'ember_brazier', { type: 'burning' });
    const burning = w.content.damageTypeByKey.get('burning')!;
    for (const palette of [false, true]) {
      const { hud: h, root } = hud(palette);
      h.toggleDpsPanel(w);
      h.update(w);
      const seg = root.querySelector<HTMLElement>('#sw-dpspanel .sw-dpsseg')!;
      expect(seg.dataset.type).toBe('burning');
      const color = (palette ? burning.colorblindColor || burning.color : burning.color) ?? "";
      expect(seg.style.background).toBe(hexToRgb(color));
    }
  });
});

describe('fb160 review — the bars survive redraws, and /data strings are escaped', () => {
  function liveHud(): { h: Hud; root: HTMLElement } {
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.getElementById('app') as HTMLElement;
    const callbacks = new Proxy({}, { get: () => () => {} }) as ConstructorParameters<typeof Hud>[1];
    return { h: new Hud(root, callbacks, defaultSettings()), root };
  }

  it('the hovered segment is the same element across ticks — only its width/title change (a tooltip can appear)', () => {
    const w = new World(cfg({ practice: true }));
    const e = spawnEnemy(w, 'husk', 3, 3)!;
    e.hp = 1e6;
    e.maxHp = 1e6;
    e.armor = 0;
    damageEnemy(w, e, 30, 'tesla_coil', { type: 'normal' });
    damageEnemy(w, e, 10, 'tesla_coil', { type: 'electric' });
    const { h, root } = liveHud();
    h.toggleDpsPanel(w);
    h.update(w);
    const seg = root.querySelector<HTMLElement>('#sw-dpspanel .sw-dpsseg[data-type="electric"]')!;
    const row = root.querySelector<HTMLElement>('#sw-dpspanel .sw-dpsbar-row[data-src="tesla_coil"]')!;
    const before = seg.title;
    damageEnemy(w, e, 30, 'tesla_coil', { type: 'electric' });
    h.update(w);
    const after = root.querySelector<HTMLElement>('#sw-dpspanel .sw-dpsseg[data-type="electric"]')!;
    expect(after, 'the segment under the cursor was recreated').toBe(seg);
    expect(root.querySelector('#sw-dpspanel .sw-dpsbar-row[data-src="tesla_coil"]')).toBe(row);
    expect(after.title).not.toBe(before);
    // Electric now outweighs normal: the segments reorder, still the same nodes.
    expect([...row.querySelectorAll<HTMLElement>('.sw-dpsseg')].map((s) => s.dataset.type)).toEqual(['electric', 'normal']);
    // A new source joins the list without recreating the existing one.
    damageEnemy(w, e, 500, 'mortar', { type: 'normal' });
    h.update(w);
    const rows = [...root.querySelectorAll<HTMLElement>('#sw-dpspanel .sw-dpsbar-row')];
    expect(rows.map((r) => r.dataset.src)).toEqual(['mortar', 'tesla_coil']);
    expect(rows[1]).toBe(row);
  });

  it('labels and hover titles from /data are escaped, and a sliver reads "<1%", not "0%"', () => {
    const data: DpsPanelData = {
      seconds: 10,
      damage: 1001,
      dps: 100.1,
      bars: [
        {
          key: 'x"y',
          label: 'Hush "the" <Blade> & Co',
          damage: 1001,
          dps: 100.1,
          length: 1,
          segments: [
            { type: 'normal', label: 'Normal', color: '#ffffff', damage: 1000, share: 1000 / 1001 },
            { type: 'poison', label: 'Poi"son', color: '#00ff00', damage: 1, share: 1 / 1001 },
          ],
        },
      ],
    };
    const root = render(dpsPanelBodyMarkup(data));
    const row = root.querySelector<HTMLElement>('.sw-dpsbar-row')!;
    expect(row.dataset.src).toBe('x"y');
    expect(row.querySelector('.sw-dpsbar-label')!.textContent).toBe('Hush "the" <Blade> & Co');
    expect(root.querySelectorAll('.sw-dpsbar-row')).toHaveLength(1);
    const [, sliver] = [...row.querySelectorAll<HTMLElement>('.sw-dpsseg')];
    expect(sliver!.title).toBe('Poi"son: 1 (<1%)');
  });
});
