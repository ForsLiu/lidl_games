/**
 * @vitest-environment jsdom
 *
 * b010 — `rerollOffers`'s `w.rerollsLeft <= 0` guard did not check
 * finiteness. `NaN <= 0` is `false`, so a corrupted `rerollsLeft` (a
 * non-finite `data/vsupgrades.json` `rerollsPerLevel`, or any future write
 * that lands NaN/Infinity in this field) would have read as "rerolls
 * remaining" forever — unlimited free rerolls, silently, instead of the
 * disabled state the field is meant to represent once exhausted.
 * `rerollOffers` (`src/sim/progression.ts`) now rejects a non-finite
 * `rerollsLeft` the same way it rejects `<= 0`.
 *
 * code-reviewer (this item) found the same gap one layer up: the HUD's
 * `sw-reroll` button (`src/ui/hud.ts`) only checked `w.rerollsLeft <= 0` for
 * its `disabled` state, so a corrupted `rerollsLeft` would have rendered the
 * button clickable even though the sim guard above now correctly no-ops it
 * — a cosmetic mismatch, closed in the same commit with the same
 * `!Number.isFinite(...)` check.
 */
import { describe, expect, it } from 'vitest';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { World } from '../src/sim/world';
import { rerollOffers } from '../src/sim/progression';
import { Hud } from '../src/ui/hud';
import type { Command } from '../src/sim/types';
import { cfg } from './helpers';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

function mount(): HTMLElement {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  return document.getElementById('app') as HTMLElement;
}

function noopHudCallbacks(pending: Command[]) {
  return {
    onSelectTower: () => {},
    onCallWave: () => {},
    onPickOffer: (index: number) => pending.push({ k: 'pick', index }),
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
  };
}

function levelupWorld(): World {
  const w = new World(cfg());
  w.phase = 'act2';
  w.sundered = true;
  w.warden.x = 18;
  w.warden.y = 10;
  w.updateNav(true);
  w.phase = 'levelup';
  w.offers = [{ kind: 'boon', key: 'power', name: 'Power I', desc: '', toLevel: 1 }];
  return w;
}

describe('b010 — rerollOffers rejects a non-finite rerollsLeft', () => {
  for (const bad of [NaN, Infinity, -Infinity]) {
    it(`rerollsLeft = ${bad} is rejected as a clean no-op, not treated as "has rerolls"`, () => {
      const w = levelupWorld();
      w.rerollsLeft = bad;
      const before = w.offers;
      expect(rerollOffers(w)).toBe(false);
      expect(w.offers).toBe(before);
      expect(w.rerollsLeft).toBe(bad);
    });
  }

  it('a legitimate positive rerollsLeft is unaffected by the new guard', () => {
    const w = levelupWorld();
    w.rerollsLeft = 1;
    expect(rerollOffers(w)).toBe(true);
    expect(w.rerollsLeft).toBe(0);
  });

  it('rerollsLeft === 0 still rejects, as before (control)', () => {
    const w = levelupWorld();
    w.rerollsLeft = 0;
    expect(rerollOffers(w)).toBe(false);
  });
});

describe('b010 — the HUD reroll button shares the same finiteness guard (code-reviewer finding)', () => {
  it('disables the button for a NaN/Infinity/-Infinity rerollsLeft, not just <= 0', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      const root = mount();
      const hud = new Hud(root, noopHudCallbacks([]));
      const w = levelupWorld();
      w.rerollsLeft = bad;
      hud.buildTowerBar(w);
      hud.syncModal(w);
      const btn = root.querySelector('.sw-reroll') as HTMLButtonElement;
      expect(btn).not.toBeNull();
      expect(btn.disabled).toBe(true);
    }
  });

  it('control: a legitimate positive rerollsLeft still enables the button', () => {
    const root = mount();
    const hud = new Hud(root, noopHudCallbacks([]));
    const w = levelupWorld();
    w.rerollsLeft = 1;
    hud.buildTowerBar(w);
    hud.syncModal(w);
    const btn = root.querySelector('.sw-reroll') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });
});
