/**
 * @vitest-environment jsdom
 *
 * fb092 (QUALITY.md 1.0 Steam/itch checklist: "credits + license screen").
 * A Hub tab, reachable without any dev-only gate, renders a seeded credits
 * list and license text.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Hub } from '../src/ui/hub';
import { defaultMeta } from '../src/meta/meta';
import { defaultSettings } from '../src/ui/settings';
import { CREDITS, LICENSE_TEXT } from '../src/ui/credits';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

function openHub(): HTMLElement {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app') as HTMLElement;
  const hub = new Hub(root, defaultMeta(), 1, {
    settings: defaultSettings(),
    onStart: () => {},
    onMetaChanged: () => {},
    onSettingsChanged: () => {},
  });
  hub.show();
  return root;
}

describe('fb092: credits + license screen', () => {
  it('the Credits tab is reachable from the Hub nav with no dev-only gate', () => {
    const root = openHub();
    const navButton = root.querySelector<HTMLButtonElement>('[data-tab="credits"]');
    expect(navButton).not.toBeNull();
    expect(navButton?.textContent?.trim()).toBe('Credits');
  });

  it('opening the Credits tab renders every seeded credit entry', () => {
    const root = openHub();
    const navButton = root.querySelector<HTMLButtonElement>('[data-tab="credits"]');
    navButton?.click();

    const list = root.querySelector('.sw-creditslist');
    expect(list).not.toBeNull();
    for (const entry of CREDITS) {
      expect(list?.textContent).toContain(entry.role);
      expect(list?.textContent).toContain(entry.name);
    }
  });

  it('opening the Credits tab renders the license text', () => {
    const root = openHub();
    root.querySelector<HTMLButtonElement>('[data-tab="credits"]')?.click();

    const license = root.querySelector('.sw-license');
    expect(license).not.toBeNull();
    expect(license?.textContent).toBe(LICENSE_TEXT);
  });

  it('the panel is not gated by dev profile — no devbadge-style class on the tab button', () => {
    const root = openHub();
    const navButton = root.querySelector<HTMLButtonElement>('[data-tab="credits"]');
    expect(navButton?.className).not.toMatch(/dev/i);
  });
});
