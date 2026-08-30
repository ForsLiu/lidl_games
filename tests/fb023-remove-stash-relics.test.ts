/**
 * @vitest-environment jsdom
 *
 * fb023 (SPEC-FINAL §7, §11), owner feedback `feature-remove-stash-relics`:
 * "no stash or relic window is reachable ... a grep-level test proves no
 * relic-window code paths remain."
 *
 * Same two-layer shape c7-no-orbs.test.ts already proved out for the Orb
 * currency: a source-level scan for the relic-UI-only vocabulary (functions
 * and DOM hooks `src/ui/hub.ts`'s `renderEquipment` used to own), and a
 * DOM-level scan of every real Hub tab a player can actually reach. Relic
 * *data structures* (`MetaState.stash`/`equipped`, `Relic`, `meta/stash.ts`'s
 * `equip`/`discard`) are explicitly allowed to remain internally per the
 * feedback's own text — this only asserts the UI is gone.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Hub } from '../src/ui/hub';
import { Hud } from '../src/ui/hud';
import { World } from '../src/sim/world';
import { defaultMeta, seedTestAccount, seedTestEquipment } from '../src/meta/meta';
import { defaultSettings } from '../src/ui/settings';
import { loadContent } from '../src/sim/content';
import { cfg } from './helpers';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

/**
 * Identifiers and DOM hooks that only ever belonged to the retired relic
 * Stash panel (`renderStash`, its compare/discard helpers, its `[data-relic]`/
 * `[data-eqslot]`/`[data-discard]` hooks). Not "relic"/"stash" themselves —
 * those remain legitimate as internal data-structure names
 * (`MetaState.stash`, `Relic`, `equipmentStash`) per the feedback's own "data
 * structures may remain internally" carve-out — only the UI-specific surface.
 */
const RELIC_UI = [
  /\brenderStash\b/,
  /data-relic=/,
  /data-eqslot=/,
  /data-discard/,
  /sw-stash-equipped/,
  /\bcompareRelics\b/,
  /\brenderCompareBlock\b/,
  /\bcompareTitle\(/,
  /\bimplicitLine\(/,
  /\bequippedIn\(/,
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|json|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

function mount(): HTMLElement {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  return document.getElementById('app') as HTMLElement;
}

describe('fb023: the relic Stash UI is gone from the source', () => {
  it('no source file carries the retired relic-UI vocabulary', () => {
    const files = [...walk('src')];
    const leaks: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      text.split(/\r?\n/).forEach((line, i) => {
        if (!RELIC_UI.some((re) => re.test(line))) return;
        leaks.push(`${file}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(leaks, `relic-UI references still present:\n${leaks.join('\n')}`).toEqual([]);
  });
});

describe('fb023: no stash or relic window is reachable from the Hub', () => {
  function hubText(meta = defaultMeta()): string {
    const root = mount();
    const hub = new Hub(root, meta, 1, {
      settings: defaultSettings(),
      onSettingsChanged: () => {},
      onStart: () => {},
      onMetaChanged: () => {},
    });
    let text = '';
    for (const tab of ['run', 'tree', 'equipment', 'settings'] as const) {
      hub.openTab(tab);
      text += ` ${root.textContent ?? ''} ${root.innerHTML}`;
    }
    return text;
  }

  it('no Hub tab renders a Stash or Relic heading, on a fresh account', () => {
    const text = hubText();
    expect(text).not.toMatch(/>Stash</);
    expect(text).not.toMatch(/>Relic</);
    expect(text).not.toMatch(/data-tab="stash"/);
  });

  it('nor on an account seeded with a real (internal-only) relic stash', () => {
    // seedTestAccount still fills `meta.stash` internally (kept for save-
    // migration coverage) — the point of this test is that having relics on
    // the account changes nothing a player can see.
    const meta = seedTestAccount(defaultMeta());
    expect(meta.stash.length).toBeGreaterThan(0);
    const text = hubText(meta);
    expect(text).not.toMatch(/>Stash</);
    expect(text).not.toMatch(/>Relic</);
    expect(text).not.toMatch(/data-relic=/);
  });

  it('the Equipment tab is the one reachable equip screen, with real owned items', () => {
    const meta = seedTestEquipment(defaultMeta());
    const root = mount();
    const hub = new Hub(root, meta, 1, {
      settings: defaultSettings(),
      onSettingsChanged: () => {},
      onStart: () => {},
      onMetaChanged: () => {},
    });
    hub.openTab('equipment');
    expect(root.textContent).toMatch(/Equipment/);
    expect(root.querySelectorAll('[data-item]').length).toBeGreaterThan(0);
    expect(root.querySelectorAll('[data-eqitemslot]').length).toBe(6);
  });

  // qa-playtester (fb023): the heading-shaped scan above missed inline prose
  // — "Relic Find" (Constellation node labels/tooltips) and a stray "relic"
  // in the Character panel's stat-breakdown note both slipped through until
  // this caught them. Every Hub tab's full text, case-insensitive, on an
  // account with every Constellation node allocated (so every node's label/
  // tooltip text actually renders).
  it('no Hub tab says "relic" anywhere in its text, case-insensitive, with every node allocated', () => {
    const meta = { ...defaultMeta(), allocated: allNodeIds() };
    const text = hubText(meta);
    expect(text).not.toMatch(/relic/i);
  });
});

function allNodeIds(): number[] {
  return loadContent().tree.nodes.map((n) => n.id);
}

describe('fb023: no relic text mid-run either', () => {
  it('the in-run character panel says nothing about relics', () => {
    const root = mount();
    const hud = new Hud(root, {
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
    });
    const w = new World(cfg({ allocated: allNodeIds() }));
    hud.buildTowerBar(w);
    hud.toggleCharacterPanel(w);
    const panel = root.querySelector('#sw-charpanel') as HTMLElement;
    expect(panel.innerHTML).not.toMatch(/relic/i);
  });
});
