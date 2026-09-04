/**
 * @vitest-environment jsdom
 *
 * fb113: `Hud.syncModal`'s memo key (`phase:offers.length:outcome:level:
 * classKey:coreKey`) didn't change on an offer reroll — `rerollOffers`
 * (`src/sim/progression.ts`) replaces `w.offers` with a fresh array of the
 * same length, so none of the memo key's fields move, and `syncModal`
 * (`src/ui/hud.ts`) treated the post-reroll frame as a memo hit and skipped
 * re-rendering. The Level-Up modal kept showing the pre-reroll offer cards
 * while `onPickOffer(index)` would have applied the new, rerolled offer at
 * that index — reachable via completely ordinary play (any level-up
 * followed by a reroll click).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { Hud } from '../src/ui/hud';
import { World } from '../src/sim/world';
import { openLevelUpIfPending, rerollOffers } from '../src/sim/progression';
import type { DevOp } from '../src/sim/types';
import { cfg } from './helpers';

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
    onToggleVsPanel: () => {},
    onResume: () => {},
    onPause: () => {},
    onCycleSpeed: () => {},
    onSetSpeed: () => {},
    onDev: (_op: DevOp) => {},
    onQuitToHub: () => {},
    onHoverSkill: () => {},
    onUpgradeStructure: () => {},
    onSellStructure: () => {},
    onUpgradeCore: () => {},
    onHoverWieldedTower: () => {},
  });
}

describe('fb113: Level-Up modal memo key tracks reroll identity', () => {
  let root: HTMLElement;
  let hud: Hud;

  beforeEach(() => {
    root = mount();
    hud = makeHud(root);
  });

  it('shows the rerolled offers, not the stale pre-reroll ones, after a reroll', () => {
    const w = new World(cfg({ classKey: 'swordsman', core: 'vampire_heart' }));
    w.phase = 'act2';
    w.pendingLevelUps = 1;
    openLevelUpIfPending(w);
    expect(w.phase).toBe('levelup');

    hud.buildTowerBar(w);
    hud.syncModal(w);

    const preRerollNames = w.offers.map((o) => o.name);
    let labels = Array.from(root.querySelectorAll('.sw-offer b')).map((el) => el.textContent);
    expect(labels).toEqual(preRerollNames);

    const rerolled = rerollOffers(w);
    expect(rerolled).toBe(true);
    hud.syncModal(w);

    const postRerollNames = w.offers.map((o) => o.name);
    expect(postRerollNames).not.toEqual(preRerollNames);
    labels = Array.from(root.querySelectorAll('.sw-offer b')).map((el) => el.textContent);
    expect(labels).toEqual(postRerollNames);
  });
});
