/**
 * @vitest-environment jsdom
 *
 * fb094: the Screenshot export control (`#sw-screenshot`) must be absent
 * outside the dev build/profile, matching every other dev-only control's
 * existing gating pattern (e.g. hub.ts's `showHiddenClasses` toggle row).
 * `vi.mock` overrides `isDevBuild()` for every importer in this file's
 * module graph, simulating a production build the same way
 * `p9c-tuner-prod-ui.test.ts` does — split into its own file so this mock
 * doesn't leak into `ui-fb094-screenshot-export.test.ts`'s dev-mode cases.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/meta/devprofile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/meta/devprofile')>();
  return { ...actual, isDevBuild: () => false };
});

import { Hud } from '../src/ui/hud';
import type { DevOp } from '../src/sim/types';

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

describe('fb094: screenshot export absent outside dev profile', () => {
  it('never mounts the Screenshot control under a simulated prod build', () => {
    const root = mount();
    makeHud(root);
    expect(root.querySelector('#sw-screenshot')).toBeNull();
  });
});
