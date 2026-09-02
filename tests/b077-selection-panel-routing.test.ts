/**
 * @vitest-environment jsdom
 *
 * b077 (qa-playtester, fb029's QA pass): `hud.ts`'s selection-panel routing
 * gate (`update()`'s `blocking` check) read `w.sundered` — a one-way flag set
 * once at the very first TD->VS transition (`finishSundering`) and never
 * reset by the return trip (`advanceToNextBlock`) — instead of the
 * current-phase `w.huntsWarden` getter. Once any real run passed its first
 * Sundering, `renderSelectionInfo` (the Warden/tower/enemy/Core click panel)
 * silently stopped rendering for the rest of the run, TD and VS alike,
 * falling back to the generic tower/weapon panel regardless of selection.
 *
 * Drives a real `Hud` through one full TD -> VS -> TD cycle via the actual
 * `finishSundering`/`advanceToNextBlock` sim functions (not a hand-set
 * `w.phase`), asserting `#sw-towerinfo` tracks each selection: a VS-phase
 * case (the Warden, fb029's own gap) and a post-Sundering TD-phase case
 * (tower/enemy/Core, the permanent-lockout bug).
 */
import { describe, expect, it } from 'vitest';

import { World } from '../src/sim/world';
import { GRID_W } from '../src/sim/grid';
import { buildTower } from '../src/sim/towers';
import { spawnEnemy } from '../src/sim/enemies';
import { finishSundering, advanceToNextBlock } from '../src/sim/sundering';
import { Hud } from '../src/ui/hud';
import type { Selection } from '../src/ui/selection';
import { cfg } from './helpers';

function placeNearWarden(w: World, key = 'ballista'): { tx: number; ty: number } {
  const def = w.content.towerByKey.get(key)!;
  w.gold = 99999;
  for (let dx = 1; dx <= 3; dx++) {
    const tx = Math.floor(w.warden.x) + dx;
    const ty = Math.floor(w.warden.y);
    if (tx >= GRID_W - 1) break;
    if (buildTower(w, def.id, tx, ty).ok) return { tx, ty };
  }
  throw new Error(`could not place ${key}`);
}

function mountHud(): { root: HTMLElement; hud: Hud } {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app') as HTMLElement;
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
    onSetSpeed: () => {},
    onDev: () => {},
    onQuitToHub: () => {},
    onHoverSkill: () => {},
    onUpgradeStructure: () => {},
    onSellStructure: () => {},
    onUpgradeCore: () => {},
  });
  return { root, hud };
}

function panelText(root: HTMLElement, hud: Hud, w: World, sel: Selection): string {
  hud.update(w, undefined, sel);
  return (root.querySelector('#sw-towerinfo') as HTMLElement).textContent ?? '';
}

describe('b077: the selection panel survives a real TD -> VS -> TD cycle', () => {
  it('a VS-phase Warden selection shows its own panel, not the wielded-lineage fallback', () => {
    const w = new World(cfg());
    const { tx, ty } = placeNearWarden(w);
    void tx;
    void ty;
    finishSundering(w); // real TD -> VS transition: phase 'act2', w.sundered = true
    expect(w.phase).toBe('act2');
    expect(w.sundered).toBe(true);

    const { root, hud } = mountHud();
    hud.buildTowerBar(w);
    const text = panelText(root, hud, w, { kind: 'warden' });
    expect(text).toContain('Warden');
    expect(text).not.toContain('Wielded towers');
  });

  it('a tower/enemy/Core selection in a later Act I phase (post-Sundering) shows its own panel again', () => {
    const w = new World(cfg());
    const { tx, ty } = placeNearWarden(w);
    finishSundering(w);
    expect(w.sundered).toBe(true);
    advanceToNextBlock(w); // real VS -> TD transition: phase back to 'act1_build'
    expect(w.phase).toBe('act1_build');
    // The bug: w.sundered stays permanently true across this return trip.
    expect(w.sundered).toBe(true);

    const { root, hud } = mountHud();
    hud.buildTowerBar(w);

    const s = w.structureAt(tx, ty)!;
    const towerText = panelText(root, hud, w, { kind: 'tower', id: s.id });
    expect(towerText).toContain('Ballista');

    const g = { x: 2.5, y: 2.5 };
    const e = spawnEnemy(w, 'husk', g.x, g.y)!;
    const enemyText = panelText(root, hud, w, { kind: 'enemy', id: e.id });
    expect(enemyText).toContain('Husk');

    const coreText = panelText(root, hud, w, { kind: 'core' });
    expect(coreText).not.toBe(towerText);
    expect(coreText).not.toContain('Pick a tower');

    const wardenText = panelText(root, hud, w, { kind: 'warden' });
    expect(wardenText).toContain('Warden');
  });
});
