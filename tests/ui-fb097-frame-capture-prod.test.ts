/**
 * @vitest-environment jsdom
 *
 * fb097: the Frame Capture control (`#sw-framecapture`) must be absent
 * outside the dev build/profile, matching fb094's own screenshot-export
 * gating pattern exactly (same split-file convention as
 * `ui-fb094-screenshot-export-prod.test.ts` — a `vi.mock` override of
 * `isDevBuild()` applies to every importer in this file's module graph, so
 * it is isolated from `ui-fb097-frame-capture.test.ts`'s dev-mode cases).
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

describe('fb097: frame capture absent outside dev profile', () => {
  it('never mounts the Frame Capture control under a simulated prod build', () => {
    const root = mount();
    makeHud(root);
    expect(root.querySelector('#sw-framecapture')).toBeNull();
  });
});
