/**
 * @vitest-environment jsdom
 *
 * b031 (`npm run ui-audit`, QUALITY.md Beta bar): the control-hints bar and
 * every `.sw-sub` section label rendered below the 12px accessibility floor.
 * Pins the real CSS's computed font size for both, the same way
 * hud-controls.test.ts already loads `style.css` into jsdom rather than
 * asserting against a source-literal that could drift from what actually
 * paints.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Hud, towerInfoMarkup } from '../src/ui/hud';
import { towerInfo } from '../src/ui/tower-info';
import { buildTower } from '../src/sim/towers';
import { loadContent } from '../src/sim/content';
import { World } from '../src/sim/world';
import { GRID_W } from '../src/sim/grid';
import { cfg } from './helpers';

const content = loadContent();

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

function mount(): HTMLElement {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  return document.getElementById('app') as HTMLElement;
}

function makeHud(root: HTMLElement): Hud {
  return new Hud(root, {
    onSelectTower: () => {},
    onCallWave: () => {},
    onPickOffer: () => {},
    onReroll: () => {},
    onRetry: () => {},
    onNewRun: () => {},
    onToggleRanges: () => {},
    onToggleAutoPick: () => {},
    onToggleCharacterPanel: () => {},
    onEquipItem: () => {},
    onToggleDpsPanel: () => {},
    onResume: () => {},
    onPause: () => {},
    onCycleSpeed: () => {},
    onDev: () => {},
    onQuitToHub: () => {},
    onHoverSkill: () => {}, onUpgradeStructure: () => {}, onSellStructure: () => {}, onUpgradeCore: () => {},
  });
}

function fontPx(el: Element): number {
  return parseFloat(getComputedStyle(el).fontSize);
}

describe('b031: HUD text stays at or above the 12px accessibility floor', () => {
  it('the control-hints bar (.sw-help, its <b> key labels) is >= 12px', () => {
    const root = mount();
    makeHud(root);
    const help = root.querySelector('.sw-help') as HTMLElement;
    expect(help).not.toBeNull();
    expect(fontPx(help)).toBeGreaterThanOrEqual(12);
    const keys = help.querySelectorAll('b');
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(fontPx(key)).toBeGreaterThanOrEqual(12);
  });

  it('every rendered .sw-sub section label ("Practice tool", "Spawn enemy") is >= 12px', () => {
    const root = mount();
    const hud = makeHud(root);
    const w = new World(cfg());
    hud.showPracticeTools(true, w);
    const subs = root.querySelectorAll('.sw-sub');
    expect(subs.length).toBeGreaterThanOrEqual(2);
    for (const sub of subs) expect(fontPx(sub)).toBeGreaterThanOrEqual(12);
  });

  it('the tower-info panel\'s tier line and Upgrade button (seen on nearly every tower click) are >= 12px', () => {
    mount();
    const w = new World(cfg());
    w.gold = 99999;
    const def = content.towers.towers.find((t) => t.upgrades.count > 0)!;
    let placed: { tx: number; ty: number } | null = null;
    for (let dx = 1; dx <= 3 && !placed; dx++) {
      const tx = Math.floor(w.warden.x) + dx;
      const ty = Math.floor(w.warden.y);
      if (tx >= GRID_W - 1) break;
      if (buildTower(w, def.id, tx, ty).ok) placed = { tx, ty };
    }
    expect(placed).not.toBeNull();
    const { tx, ty } = placed!;
    const structure = w.structures.find((s) => s.tx === tx && s.ty === ty)!;
    const info = towerInfo(w, def, structure);
    const container = document.createElement('div');
    container.className = 'sw-towerinfo';
    container.innerHTML = towerInfoMarkup(info, w.gold, true);
    document.body.appendChild(container);

    const tierSmall = container.querySelector('h3 small') as HTMLElement;
    expect(tierSmall).not.toBeNull();
    expect(fontPx(tierSmall)).toBeGreaterThanOrEqual(12);

    // fb027: the old text-only "Hold U and click to upgrade" hint became a
    // real, self-labeled `data-act="upgrade"` button — same readability floor.
    const upgradeBtn = container.querySelector('[data-act="upgrade"]') as HTMLElement;
    expect(upgradeBtn).not.toBeNull();
    expect(fontPx(upgradeBtn)).toBeGreaterThanOrEqual(12);
  });

  it('a .sw-panel h2\'s <small> count badge (Constellation "120/120 allocated", Stash "3/20") is >= 12px', () => {
    const root = mount();
    // Real markup shape from tree-view.ts's Constellation header and hub.ts's
    // Stash tab header — an explicit rule, not the UA "smaller" keyword, so
    // the floor holds regardless of `.sw-panel h2`'s own font-size.
    root.innerHTML = '<div class="sw-panel wide"><h2>Constellation <small>120 / 120 allocated</small></h2></div>';
    const badge = root.querySelector('.sw-panel h2 small') as HTMLElement;
    expect(badge).not.toBeNull();
    expect(fontPx(badge)).toBeGreaterThanOrEqual(12);
  });
});
