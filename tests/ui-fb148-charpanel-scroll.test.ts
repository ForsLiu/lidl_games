/**
 * @vitest-environment jsdom
 *
 * fb148 (qa-playtester finding, fixed inside that item rather than filed —
 * it is a cost of fb148's own memo-key change, not a pre-existing gap).
 *
 * `renderCharacterPanel` (`src/ui/hud.ts`) rewrites the whole panel whenever
 * its memo key changes, and the key gained `w.warden.active1Charging` because
 * `classMoveSpeedMul` reads that flag (Archer's -40% while drawing) and it
 * bumps no `stats.revision` — without it, a panel opened mid-draw kept showing
 * the charging-reduced dash distance after the charge had ended.
 *
 * The cost was that `.sw-charcard` — which `style.css` gives
 * `max-height: 86vh; overflow-y: auto` — is replaced on every charge EDGE, and
 * the replacement starts at the top. Measured before the fix: 6 replacements
 * over 1200 ticks for a Swordsman holding Circle Slash, 14 for an Archer, and
 * a scroll offset of 250 reading back 0 every time. The panel does not pause
 * the run, so that is ordinary play.
 *
 * jsdom does no layout, so `Element.scrollTop` is inert there — its setter
 * silently keeps 0 on any element. The prototype is therefore given a real
 * backing store for this file, which is what makes "the offset is carried
 * across the rewrite" observable at all; it is restored afterwards.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Hud } from '../src/ui/hud';
import { Run } from '../src/sim/run';
import { emptyInput } from '../src/sim/types';
import { cfg } from './helpers';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

const realScrollTop = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
const offsets = new WeakMap<Element, number>();

beforeEach(() => {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  Object.defineProperty(Element.prototype, 'scrollTop', {
    configurable: true,
    get(this: Element) {
      return offsets.get(this) ?? 0;
    },
    set(this: Element, v: number) {
      offsets.set(this, v);
    },
  });
});

afterEach(() => {
  if (realScrollTop) Object.defineProperty(Element.prototype, 'scrollTop', realScrollTop);
});

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
    onDev: () => {},
    onQuitToHub: () => {},
    onHoverSkill: () => {},
    onUpgradeStructure: () => {},
    onSellStructure: () => {},
    onUpgradeCore: () => {},
    onHoverWieldedTower: () => {},
  });
}

describe('fb148: an Active1 charge edge does not scroll the open character panel back to the top', () => {
  it.each(['swordsman', 'archer'] as const)('%s: the offset survives every charge edge', (classKey) => {
    const root = document.getElementById('app') as HTMLElement;
    const hud = makeHud(root);
    const run = new Run(cfg({ classKey }));
    hud.buildTowerBar(run.world);
    hud.update(run.world);
    hud.toggleCharacterPanel(run.world);

    const card = () => root.querySelector('.sw-charcard') as HTMLElement | null;
    expect(card()).not.toBeNull();
    const revisionBefore = run.world.stats.revision;

    let edges = 0;
    let last = run.world.warden.active1Charging;
    for (let t = 0; t < 600; t++) {
      const before = card();
      if (before) before.scrollTop = 250;
      run.step({ ...emptyInput(), active1Held: Math.floor(t / 45) % 2 === 0 });
      hud.update(run.world);
      if (run.world.warden.active1Charging !== last) edges++;
      last = run.world.warden.active1Charging;
      expect(card()?.scrollTop ?? 0).toBe(250);
    }

    // Not vacuous on three counts: the charge really toggled, the panel really
    // was re-rendered by those edges, and nothing ELSE moved the memo key —
    // so a green run cannot mean "the panel never changed".
    expect(edges).toBeGreaterThan(0);
    expect(run.world.stats.revision).toBe(revisionBefore);
    expect(run.world.huntsWarden).toBe(false);
  });
});
