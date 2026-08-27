/**
 * @vitest-environment jsdom
 *
 * Gate C7 (SPEC-V3 §12), Orbs half: "orbs appear nowhere (grep-level UI test)".
 *
 * Two layers, because either alone is easy to fool. A source-level scan catches
 * a leftover identifier that nothing renders yet; a DOM-level scan catches text
 * a player would actually read. Both run against the real Hub and HUD.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Hub } from '../src/ui/hub';
import { Hud } from '../src/ui/hud';
import { World } from '../src/sim/world';
import { defaultMeta, seedTestAccount } from '../src/meta/meta';
import { defaultSettings } from '../src/ui/settings';
import { loadContent } from '../src/sim/content';
import { cfg } from './helpers';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

/**
 * Scanning for the bare word "orb" is the wrong rule: the Phoenix Ring's
 * orbiting fire and the projectile "orb" shape both use it legitimately, and an
 * allow-list of those lines needs editing every time either is touched.
 *
 * So this scans for the *currency's own vocabulary* instead — identifiers and
 * strings that only ever belonged to the deleted Orb system. Player-visible
 * text is covered separately by the DOM tests below.
 */
const ORB_CURRENCY = [
  /\bfreeOrbTurning\b/,
  /\borbsFound\b/,
  /\borbPer(Elite|Boss|Win)\b/,
  /\bOrbKey\b/,
  /\bORB_HELP\b/,
  /Orb of (Whetting|Turning|Ascension)/i,
  /\bwhetting\b/i,
  /\bascension\b/i,
  /\.orbs\b/,
  /\borbs:\s*[{[]/,
  /meta\/crafting/,
];

/**
 * No exemptions. An earlier version of this test excused `loot.ts` and
 * `stash.ts` because their prose used the currency's vocabulary — which
 * permanently blinded the scan to the two files most likely to regress
 * (QA reintroduced `orbPerElite` into loot.ts and this gate passed). The
 * comments were reworded instead.
 */

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

describe('C7: Orbs are gone from the source', () => {
  it('no source or data file carries the Orb currency vocabulary', () => {
    const files = [...walk('src'), ...walk('data'), ...walk('tools')];
    const leaks: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      text.split(/\r?\n/).forEach((line, i) => {
        if (!ORB_CURRENCY.some((re) => re.test(line))) return;
        leaks.push(`${file}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(leaks, `Orb references still present:\n${leaks.join('\n')}`).toEqual([]);
  });

  it('the content schema no longer carries an orbs collection', () => {
    const relics = loadContent().relics as unknown as Record<string, unknown>;
    expect(relics.orbs).toBeUndefined();
    const rates = relics.dropRates as Record<string, unknown>;
    for (const key of ['orbPerElite', 'orbPerBoss', 'orbPerWin']) {
      expect(rates[key], key).toBeUndefined();
    }
  });

  it('no Constellation node grants an Orb', () => {
    for (const node of loadContent().tree.nodes) {
      expect(Object.keys(node.stats), node.name).not.toContain('freeOrbTurning');
      expect(node.desc ?? '', node.name).not.toMatch(/orb/i);
    }
  });
});

describe('C7: Orbs are gone from what a player sees', () => {
  function hubText(meta = defaultMeta()): string {
    const root = mount();
    const hub = new Hub(root, meta, 1, {
      settings: defaultSettings(),
      onSettingsChanged: () => {},
      onStart: () => {},
      onMetaChanged: () => {},
    });
    let text = '';
    for (const tab of ['run', 'tree', 'stash', 'settings'] as const) {
      hub.openTab(tab);
      text += ` ${root.textContent ?? ''} ${root.innerHTML}`;
    }
    return text;
  }

  it('no Hub tab renders the word "orb", on a fresh account', () => {
    expect(hubText()).not.toMatch(/orb/i);
  });

  it('the Settings notices are orb-free after seeding and after wiping', () => {
    // `Hub.notice` is only populated by an action, so a passive tab scan never
    // sees it. Seeding used to announce "3 of each Orb".
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
      expect(`${root.textContent} ${root.innerHTML}`, id).not.toMatch(/orb/i);
    }
  });

  it('nor on a seeded account with a full stash and a relic selected', () => {
    const root = mount();
    const meta = seedTestAccount(defaultMeta());
    const hub = new Hub(root, meta, 1, {
      settings: defaultSettings(),
      onSettingsChanged: () => {},
      onStart: () => {},
      onMetaChanged: () => {},
    });
    hub.openTab('stash');
    // Select the first relic, which is what used to reveal the craft row.
    const first = root.querySelector<HTMLElement>('[data-relic]');
    expect(first, 'seeded account should have a stash').not.toBeNull();
    first!.click();
    expect(`${root.textContent} ${root.innerHTML}`).not.toMatch(/orb/i);
  });

  it('the Results screen does not report Orbs found', () => {
    const root = mount();
    const hud = new Hud(root, {
      onSelectTower: () => {},
      onCallWave: () => {},
      onPickOffer: () => {},
      onReroll: () => {},
      onRetry: () => {},
      onNewRun: () => {},
      onToggleRanges: () => {},
      onResume: () => {},
      onPause: () => {},
      onCycleSpeed: () => {},
      onDev: () => {},
      onQuitToHub: () => {},
    });
    const w = new World(cfg());
    w.outcome = 'victory';
    w.phase = 'results';
    hud.buildTowerBar(w);
    hud.syncModal(w);
    expect(root.textContent ?? '').not.toMatch(/orb/i);
  });
});
