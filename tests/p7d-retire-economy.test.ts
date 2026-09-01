/**
 * @vitest-environment jsdom
 *
 * p7d (SPEC-FINAL §8, Q46): retires the Ember -> account-level economy
 * outright, alongside the relic affix/rarity system fb023-remove-stash-
 * relics.test.ts already covers. Gate G12's "orbs nowhere" clause
 * (`tests/c7-no-orbs.test.ts`) is the direct precedent this file follows for
 * "Ember nowhere": a source-level scan for the currency's own vocabulary,
 * plus a DOM-level scan of what a player actually sees.
 *
 * The DOM scan is deliberately narrower than a blind case-insensitive
 * `/ember/i` over the whole game: "Ember Brazier" is a real, kept tower name
 * (§4, `data/towers.json`), so scanning any surface that renders the tower
 * catalog would self-contradict. The Hub tabs and the Results screen never
 * render a tower catalog (that lives on the in-run tower-build bar), so they
 * are the safe, correct surfaces for this gate — the same scope c7-no-orbs
 * and fb023's own DOM scans already use.
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
 * Identifiers that only ever belonged to the retired Ember economy — the
 * same "specific vocabulary, not a blanket word ban" rule
 * `tests/c7-no-orbs.test.ts`'s `ORB_CURRENCY` states, and for the same
 * reason: this list scans source *comments* too (a blanket ban would flag
 * this file's own header, and every legitimate "why we removed Ember"
 * comment throughout `src/meta/meta.ts`).
 *
 * Deliberately excludes a bare `.ember`/`.accountLevel` property-access
 * pattern: `migrateWithNotice`'s one-time Q46 conversion (`src/meta/meta.ts`)
 * has to read a pre-p7d save's raw `ember` value off the parsed JSON to
 * convert it, the same way `c7-no-orbs.test.ts`'s own carve-out names the
 * string `'orbs'` legitimately. What is banned is every *declared* name — a
 * function, field or constant — since none of those has any legitimate
 * reason to exist post-retirement.
 */
const EMBER_CURRENCY = [
  /\bemberFor\b/,
  /\baccountLevelFor\b/,
  /\bemberEarned\b/,
  /\bemberFindMul\b/,
  /\bemberFind\b/,
  /\bstartingEmber\b/,
  /\bemberBase\b/,
  /\bmaxAccountLevel\b/,
  /\bpointsPerLevel\b/,
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

describe('p7d: the Ember economy is gone from the source', () => {
  it('no source or data file carries the Ember currency vocabulary', () => {
    const files = [...walk('src'), ...walk('data'), ...walk('tools')];
    const leaks: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      text.split(/\r?\n/).forEach((line, i) => {
        if (!EMBER_CURRENCY.some((re) => re.test(line))) return;
        leaks.push(`${file}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(leaks, `Ember references still present:\n${leaks.join('\n')}`).toEqual([]);
  });

  it('the content schema no longer carries the Ember-only tree fields', () => {
    const tree = loadContent().tree as unknown as Record<string, unknown>;
    for (const key of ['maxAccountLevel', 'emberBase', 'startingEmber', 'pointsPerLevel']) {
      expect(tree[key], key).toBeUndefined();
    }
  });

  it('no Constellation node stat is emberFind (the whole stat key is retired)', () => {
    for (const node of loadContent().tree.nodes) {
      expect(Object.keys(node.stats), node.name).not.toContain('emberFind');
    }
  });
});

describe('p7d: Ember is gone from what a player sees', () => {
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

  it('no Hub tab renders the word "ember", on a fresh account', () => {
    expect(hubText()).not.toMatch(/ember/i);
  });

  it('nor on an account seeded with skill points and equipment, with every Constellation node allocated', () => {
    const seeded = { ...seedTestEquipment(seedTestAccount(defaultMeta())), allocated: allNodeIds() };
    expect(hubText(seeded)).not.toMatch(/ember/i);
  });

  it('the Settings notices are Ember-free after seeding and after wiping', () => {
    const root = mount();
    const hub = new Hub(root, defaultMeta(), 1, {
      settings: defaultSettings(),
      onSettingsChanged: () => {},
      onStart: () => {},
      onMetaChanged: () => {},
    });
    hub.openTab('settings');
    for (const id of ['#sw-seed', '#sw-wipe']) {
      const button = root.querySelector<HTMLButtonElement>(id);
      expect(button, id).not.toBeNull();
      button!.click();
      expect(`${root.textContent} ${root.innerHTML}`, id).not.toMatch(/ember/i);
    }
  });

  it('the Results screen reports skill points, not Ember', () => {
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
      onHoverSkill: () => {},
    });
    const w = new World(cfg());
    w.outcome = 'victory';
    w.phase = 'results';
    w.vsWavesCleared = 3;
    hud.buildTowerBar(w);
    hud.syncModal(w);
    // Scoped to the Results modal itself, not `root` as a whole: `buildTowerBar`
    // also renders the in-run tower catalog underneath, which legitimately
    // includes "Ember Brazier" (a kept tower name, §4) — scanning past the
    // modal into that catalog would make this test self-contradicting.
    const modal = root.querySelector('#sw-modal') as HTMLElement;
    expect(modal.textContent ?? '').not.toMatch(/ember/i);
    expect(modal.textContent ?? '').toMatch(/Skill points/i);
  });

  it('the in-run character panel says nothing about Ember', () => {
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
      onHoverSkill: () => {},
    });
    const w = new World(cfg({ allocated: allNodeIds() }));
    hud.buildTowerBar(w);
    hud.toggleCharacterPanel(w);
    const panel = root.querySelector('#sw-charpanel') as HTMLElement;
    expect(panel.innerHTML).not.toMatch(/ember/i);
  });
});

function allNodeIds(): number[] {
  return loadContent().tree.nodes.map((n) => n.id);
}
