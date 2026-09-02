/**
 * @vitest-environment jsdom
 *
 * fb027 (SPEC-FINAL §5, §5.5, §11, owner feedback `feature-core-tower-panels`):
 * Core and tower selection panels. Most of the *reading* half of this item
 * already existed (`renderSelectionInfo` in hud.ts, `towerInfo`/`coreLiveMarkup`)
 * — what fb027 adds is the *acting* half: HP/def and milestone/stack lines on
 * the tower panel, a Core panel that can actually purchase its own next step
 * (there was previously no reachable UI for `upgrade_core` at all — only tests
 * and fuzzers ever sent it), and real Upgrade/Sell buttons plus `U`/`X`
 * hotkeys wherever a tower or the Core is selected, in place of the old
 * build-menu-only "hold U and click the tile" flow.
 *
 * Three layers: the pure `towerInfo`/markup functions (no DOM), the Hud's
 * button wiring (jsdom, mirrors `fb026-bottom-bar.test.ts`'s `mountHud`), and
 * the `U`/`X` hotkeys end to end through the real `Game` (mirrors
 * `b030-autopick-pause-toggle.test.ts`'s pattern of reading private state
 * through a narrow `GameInternals` cast rather than re-implementing the loop).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { World } from '../src/sim/world';
import { attackProfile, buildTower, inBuildRange, sellTower, upgradeTower } from '../src/sim/towers';
import { upgradeCore } from '../src/sim/cores';
import { structureArmor } from '../src/sim/upgrades';
import type { Command } from '../src/sim/types';
import { towerInfo } from '../src/ui/tower-info';
import { Hud, towerInfoMarkup } from '../src/ui/hud';
import { coreLiveMarkup } from '../src/ui/core-info';
import type { Selection } from '../src/ui/selection';
import { Game } from '../src/ui/main';
import { cfg } from './helpers';

function freeTileNear(w: World): { tx: number; ty: number } {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const tx = Math.floor(w.warden.x) + dx;
      const ty = Math.floor(w.warden.y) + dy;
      if (w.grid.passable(tx, ty) && !w.structureAt(tx, ty)) return { tx, ty };
    }
  }
  throw new Error('no free tile near the Warden');
}

/* -------------------------------------------------------------- towerInfo */

describe('fb027 towerInfo: the panel data the buttons/badges read from', () => {
  it('carries the structure\'s own tile, so a button can target it — null for an unbuilt preview', () => {
    const w = new World(cfg());
    const def = w.content.towerByKey.get('ballista')!;
    expect(towerInfo(w, def).tx).toBeNull();
    expect(towerInfo(w, def).ty).toBeNull();

    const { tx, ty } = freeTileNear(w);
    w.gold = 9999;
    expect(buildTower(w, def.id, tx, ty).ok).toBe(true);
    const s = w.structureAt(tx, ty)!;
    const info = towerInfo(w, def, s);
    expect(info.tx).toBe(tx);
    expect(info.ty).toBe(ty);
  });

  it('a milestone is "still to buy" (the Upgrade-N stat line) at its own tier, and only "owned" one tier later', () => {
    // code-reviewer finding: `milestonesOwned` used `sp.at <= tier`, which
    // listed a milestone as already-owned in the same breath the "Upgrade N"
    // stat line still called it purchasable — `attackProfile` (upgrades.ts)
    // only activates a milestone once `tier > sp.at`, matching the existing
    // "Upgrade N" line's own `sp.at === tier` ("still to buy right now").
    const w = new World(cfg());
    const def = w.content.towerByKey.get('tesla_coil')!;
    const first = def.upgrades.specials[0];
    expect(first, 'tesla_coil is one of the milestone towers').toBeDefined();
    const { tx, ty } = freeTileNear(w);
    w.gold = 99999;
    buildTower(w, def.id, tx, ty);
    while (w.structureAt(tx, ty)!.tier < first.at) {
      w.gold = 99999;
      expect(upgradeTower(w, tx, ty)).toBe(true);
    }
    // At tier === first.at: purchasable ("Upgrade N"), not yet owned, and
    // `attackProfile` agrees it hasn't taken effect.
    const atMilestone = towerInfo(w, def, w.structureAt(tx, ty)!);
    expect(atMilestone.tier).toBe(first.at);
    expect(atMilestone.milestonesOwned).toEqual([]);
    expect(atMilestone.stats.some((s) => s.label === `Upgrade ${first.at}`)).toBe(true);
    expect(attackProfile(def, first.at).electricChain).toBe(false);

    // One tier later: owned, no longer listed as "still to buy", and
    // `attackProfile` agrees it's live.
    w.gold = 99999;
    expect(upgradeTower(w, tx, ty)).toBe(true);
    const pastMilestone = towerInfo(w, def, w.structureAt(tx, ty)!);
    expect(pastMilestone.milestonesOwned.map((m) => m.at)).toEqual([first.at]);
    expect(pastMilestone.milestonesOwned[0].text).toBe(first.note ?? first.key);
    expect(pastMilestone.stats.some((s) => s.label === `Upgrade ${first.at}`)).toBe(false);
    expect(attackProfile(def, first.at + 1).electricChain).toBe(true);
  });

  it('canAct is false out of build range or off-phase, mirroring what upgradeTower/sellTower actually enforce', () => {
    // code-reviewer finding: the panel used to price/afford-gate the buttons
    // with no regard for whether `upgradeTower`/`sellTower` (towers.ts) would
    // actually do anything — both gate on `inBuildRange`/`canBuildNow` too, so
    // a tower selected from clear across the map read as live and clickable
    // and silently no-op'd on click.
    const w = new World(cfg());
    const def = w.content.towerByKey.get('ballista')!;
    const { tx, ty } = freeTileNear(w);
    w.gold = 9999;
    buildTower(w, def.id, tx, ty);
    const s = w.structureAt(tx, ty)!;
    expect(towerInfo(w, def, s).canAct).toBe(true);

    // Walk the Warden far away: still selectable (selection has no range
    // limit), but no longer actionable.
    w.warden.x = tx + 500;
    w.warden.y = ty + 500;
    expect(towerInfo(w, def, s).canAct).toBe(false);
    expect(inBuildRange(w, tx, ty)).toBe(false);

    // Back in range, but the wrong phase (upgradeTower/sellTower only run
    // during act1_build/act1_wave).
    w.warden.x = tx + 0.5;
    w.warden.y = ty + 0.5;
    w.phase = 'levelup';
    expect(towerInfo(w, def, s).canAct).toBe(false);
  });

  it('reflects a live Death Pact/Blood Tithe flag straight off the Structure', () => {
    const w = new World(cfg());
    const def = w.content.towerByKey.get('ballista')!;
    const { tx, ty } = freeTileNear(w);
    w.gold = 9999;
    buildTower(w, def.id, tx, ty);
    const s = w.structureAt(tx, ty)!;
    expect(towerInfo(w, def, s).pactActive).toBe(false);
    expect(towerInfo(w, def, s).tithed).toBe(false);
    s.pactActive = true;
    s.tithed = true;
    const info = towerInfo(w, def, s);
    expect(info.pactActive).toBe(true);
    expect(info.tithed).toBe(true);
  });

  it('quotes the exact same Defense number combat resolves against, including a flat towerDefenseBonus', () => {
    const w = new World(cfg());
    const def = w.content.towerByKey.get('ballista')!;
    const { tx, ty } = freeTileNear(w);
    w.gold = 9999;
    buildTower(w, def.id, tx, ty);
    const s = w.structureAt(tx, ty)!;
    // A synthetic flat defense bonus, the same shape Paladin's passive grants
    // — the panel must fold it in, or a player reading the panel would see a
    // lower number than the enemy's hit actually gets reduced by.
    w.stats.add('test:bonus', 'towerDefenseBonus', 7);
    w.recomputeDerived();
    expect(towerInfo(w, def, s).defense).toBeCloseTo(structureArmor(w, s), 6);
  });
});

/* ------------------------------------------------------------------ markup */

describe('fb027 towerInfoMarkup: real Upgrade/Sell buttons, not text-only rows', () => {
  it('renders a data-act="upgrade" button carrying the structure\'s own tile, enabled when affordable', () => {
    const w = new World(cfg());
    const def = w.content.towerByKey.get('ballista')!;
    const { tx, ty } = freeTileNear(w);
    w.gold = 9999;
    buildTower(w, def.id, tx, ty);
    const s = w.structureAt(tx, ty)!;
    const info = towerInfo(w, def, s);
    const html = towerInfoMarkup(info, 9999, true);
    expect(html).toContain(`data-act="upgrade"`);
    expect(html).toContain(`data-tx="${tx}"`);
    expect(html).toContain(`data-ty="${ty}"`);
    expect(html).not.toMatch(/data-act="upgrade"[^>]*disabled/);

    const poor = towerInfoMarkup(info, 0, true);
    expect(poor).toMatch(/data-act="upgrade"[^>]*disabled/);
  });

  it('renders a data-act="sell" button quoting the real refund', () => {
    const w = new World(cfg());
    const def = w.content.towerByKey.get('ballista')!;
    const { tx, ty } = freeTileNear(w);
    w.gold = 9999;
    buildTower(w, def.id, tx, ty);
    const s = w.structureAt(tx, ty)!;
    const info = towerInfo(w, def, s);
    const html = towerInfoMarkup(info, 9999, true);
    expect(html).toContain(`data-act="sell"`);
    expect(html).toContain(`data-tx="${tx}"`);
    expect(html).toContain(`${info.sellValue}g`);
  });

  it('an unbuilt bar preview gets no buttons at all — nothing for them to target', () => {
    const w = new World(cfg());
    const def = w.content.towerByKey.get('ballista')!;
    const html = towerInfoMarkup(towerInfo(w, def), 9999, false);
    expect(html).not.toContain('data-act="upgrade"');
    expect(html).not.toContain('data-act="sell"');
  });

  it('both buttons go disabled out of build range, even fully affordable', () => {
    // code-reviewer finding: affordability alone used to drive `disabled`.
    const w = new World(cfg());
    const def = w.content.towerByKey.get('ballista')!;
    const { tx, ty } = freeTileNear(w);
    w.gold = 9999;
    buildTower(w, def.id, tx, ty);
    const s = w.structureAt(tx, ty)!;
    w.warden.x = tx + 500;
    w.warden.y = ty + 500;
    const info = towerInfo(w, def, s);
    expect(info.canAct).toBe(false);
    const html = towerInfoMarkup(info, 9999, true);
    expect(html).toMatch(/data-act="upgrade"[^>]*disabled/);
    expect(html).toMatch(/data-act="sell"[^>]*disabled/);
  });
});

describe('fb027 coreLiveMarkup: an Upgrade button and no Sell, ever', () => {
  it('renders data-act="upgrade-core" priced at the next step, disabled when unaffordable', () => {
    const w = new World(cfg({ core: 'stone_heart' }));
    const def = w.content.coreByKey.get('stone_heart')!;
    const rich = coreLiveMarkup(w.content, w.coreKey, w.coreStep, w.core, w.coreHp, w.coreMaxHp, 99999);
    expect(rich).toContain('data-act="upgrade-core"');
    expect(rich).toContain(`${def.upgrade.stepCost}g`);
    expect(rich).not.toMatch(/data-act="upgrade-core"[^>]*disabled/);
    expect(rich).not.toMatch(/data-act="sell/);

    const poor = coreLiveMarkup(w.content, w.coreKey, w.coreStep, w.core, w.coreHp, w.coreMaxHp, 0);
    expect(poor).toMatch(/data-act="upgrade-core"[^>]*disabled/);
  });

  it('a fully-upgraded Core has no Upgrade button left to click', () => {
    const w = new World(cfg({ core: 'stone_heart' }));
    const def = w.content.coreByKey.get('stone_heart')!;
    w.gold = 1e6;
    for (let i = 0; i < def.upgrade.count; i++) expect(upgradeCore(w)).toBe(true);
    const html = coreLiveMarkup(w.content, w.coreKey, w.coreStep, w.core, w.coreHp, w.coreMaxHp, 1e6);
    expect(html).not.toContain('data-act="upgrade-core"');
    expect(html).toMatch(/Fully upgraded/);
  });
});

/* ------------------------------------------------------------------- Hud DOM */

describe('fb027 Hud: clicking the panel buttons calls the right HudCallbacks', () => {
  const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

  function mountHud(): {
    root: HTMLElement;
    hud: Hud;
    calls: { upgrade: [number, number][]; sell: [number, number][]; upgradeCore: number };
  } {
    document.head.innerHTML = `<style>${CSS}</style>`;
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.getElementById('app') as HTMLElement;
    const calls = { upgrade: [] as [number, number][], sell: [] as [number, number][], upgradeCore: 0 };
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
      onUpgradeStructure: (tx, ty) => calls.upgrade.push([tx, ty]),
      onSellStructure: (tx, ty) => calls.sell.push([tx, ty]),
      onUpgradeCore: () => calls.upgradeCore++,
    });
    return { root, hud, calls };
  }

  it('a click on the Upgrade button fires onUpgradeStructure with the structure\'s own tile', () => {
    const w = new World(cfg());
    const def = w.content.towerByKey.get('ballista')!;
    const { tx, ty } = freeTileNear(w);
    w.gold = 9999;
    buildTower(w, def.id, tx, ty);
    const { root, hud, calls } = mountHud();
    hud.buildTowerBar(w);
    const sel: Selection = { kind: 'tower', id: w.structureAt(tx, ty)!.id };
    hud.update(w, undefined, sel);

    const btn = root.querySelector('[data-act="upgrade"]') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    btn.click();
    expect(calls.upgrade).toEqual([[tx, ty]]);

    // Applying the same real command it dispatched actually upgrades the tower.
    expect(upgradeTower(w, tx, ty)).toBe(true);
  });

  it('a disabled Upgrade button (too poor) does not fire on click', () => {
    const w = new World(cfg());
    const def = w.content.towerByKey.get('ballista')!;
    const { tx, ty } = freeTileNear(w);
    w.gold = 9999;
    buildTower(w, def.id, tx, ty);
    w.gold = 0;
    const { root, hud, calls } = mountHud();
    hud.buildTowerBar(w);
    const sel: Selection = { kind: 'tower', id: w.structureAt(tx, ty)!.id };
    hud.update(w, undefined, sel);

    const btn = root.querySelector('[data-act="upgrade"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    btn.click();
    expect(calls.upgrade).toEqual([]);
  });

  it('b074: the panel repaints across a Math.ceil bucket even when Math.round of the same HP does not move', () => {
    // qa-playtester repro: the memo key used Math.round while the HP row
    // itself renders Math.ceil. hp 10.4 (ceil 11) -> 9.9 (ceil 10) both
    // Math.round to 10, so a Math.round-keyed panel held at "11" instead of
    // dropping to "10" — reproduced directly here against the real Hud DOM.
    const w = new World(cfg());
    const def = w.content.towerByKey.get('ballista')!;
    const { tx, ty } = freeTileNear(w);
    w.gold = 9999;
    buildTower(w, def.id, tx, ty);
    const s = w.structureAt(tx, ty)!;
    const { root, hud } = mountHud();
    hud.buildTowerBar(w);
    const sel: Selection = { kind: 'tower', id: s.id };

    s.hp = 10.4;
    hud.update(w, undefined, sel);
    expect(root.querySelector('#sw-towerinfo')?.textContent).toContain('11 /');

    s.hp = 9.9;
    hud.update(w, undefined, sel);
    expect(root.querySelector('#sw-towerinfo')?.textContent).toContain('10 /');
  });

  it('b075: a Death Pact badge appears the instant pactActive flips, with id/tier/hp/gold all unchanged', () => {
    // qa-playtester repro: fireDeathPact (classes.ts) only ever touches
    // `pactActive` — no accompanying hp/tier/gold change to force a
    // re-render, so the memo key has to observe the flag directly.
    const w = new World(cfg());
    const def = w.content.towerByKey.get('ballista')!;
    const { tx, ty } = freeTileNear(w);
    w.gold = 9999;
    buildTower(w, def.id, tx, ty);
    const s = w.structureAt(tx, ty)!;
    const { root, hud } = mountHud();
    hud.buildTowerBar(w);
    const sel: Selection = { kind: 'tower', id: s.id };

    hud.update(w, undefined, sel);
    expect(root.querySelector('#sw-towerinfo')?.textContent).not.toContain('Death Pact');

    s.pactActive = true;
    hud.update(w, undefined, sel);
    expect(root.querySelector('#sw-towerinfo')?.textContent).toContain('Death Pact');

    s.pactActive = false;
    hud.update(w, undefined, sel);
    expect(root.querySelector('#sw-towerinfo')?.textContent).not.toContain('Death Pact');
  });

  it('a click on Sell fires onSellStructure, and applying it actually removes the tower', () => {
    const w = new World(cfg());
    const def = w.content.towerByKey.get('ballista')!;
    const { tx, ty } = freeTileNear(w);
    w.gold = 9999;
    buildTower(w, def.id, tx, ty);
    const { root, hud, calls } = mountHud();
    hud.buildTowerBar(w);
    const sel: Selection = { kind: 'tower', id: w.structureAt(tx, ty)!.id };
    hud.update(w, undefined, sel);

    const btn = root.querySelector('[data-act="sell"]') as HTMLButtonElement;
    btn.click();
    expect(calls.sell).toEqual([[tx, ty]]);
    expect(sellTower(w, tx, ty)).toBe(true);
    expect(w.structureAt(tx, ty)).toBeNull();
  });

  it('a click on the Core\'s Upgrade button fires onUpgradeCore, and it actually buys the step', () => {
    const w = new World(cfg({ core: 'stone_heart' }));
    w.gold = 1e6;
    const { root, hud, calls } = mountHud();
    hud.buildTowerBar(w);
    const sel: Selection = { kind: 'core' };
    hud.update(w, undefined, sel);

    const btn = root.querySelector('[data-act="upgrade-core"]') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    const stepBefore = w.coreStep;
    btn.click();
    expect(calls.upgradeCore).toBe(1);
    expect(upgradeCore(w)).toBe(true);
    expect(w.coreStep).toBe(stepBefore + 1);
  });

  it('the panel re-renders live: buying the Core step removes its own Upgrade button once fully upgraded', () => {
    const w = new World(cfg({ core: 'stone_heart' }));
    const def = w.content.coreByKey.get('stone_heart')!;
    w.gold = 1e6;
    const { root, hud } = mountHud();
    hud.buildTowerBar(w);
    const sel: Selection = { kind: 'core' };
    for (let i = 0; i < def.upgrade.count; i++) {
      hud.update(w, undefined, sel);
      expect(root.querySelector('[data-act="upgrade-core"]')).not.toBeNull();
      expect(upgradeCore(w)).toBe(true);
    }
    hud.update(w, undefined, sel);
    expect(root.querySelector('[data-act="upgrade-core"]')).toBeNull();
  });
});

/* ------------------------------------------------------------- U/X hotkeys */

describe('fb027 U/X hotkeys act on whatever is selected, end to end through Game', () => {
  interface GameInternals {
    run: { world: World } | null;
    view: { selection: Selection };
    pending: Command[];
  }

  function mount(): HTMLElement {
    document.head.innerHTML = `<style>${readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8')}</style>`;
    document.body.innerHTML = '<div id="app"></div>';
    HTMLCanvasElement.prototype.getContext = (() => ({
      setTransform() {},
      scale() {},
    })) as never;
    window.requestAnimationFrame = (() => 0) as never;
    return document.getElementById('app') as HTMLElement;
  }

  it('U on a selected tower queues the same upgrade Command the panel button does', () => {
    const root = mount();
    const game = new Game();
    game.start(root);
    (root.querySelector('#sw-start') as HTMLElement).click();
    const g = game as unknown as GameInternals;
    const w = g.run!.world;

    const def = w.content.towerByKey.get('ballista')!;
    const { tx, ty } = freeTileNear(w);
    w.gold = 9999;
    buildTower(w, def.id, tx, ty);
    g.view.selection = { kind: 'tower', id: w.structureAt(tx, ty)!.id };

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'u' }));
    expect(g.pending).toContainEqual({ k: 'upgrade', tx, ty });
  });

  it('X on a selected tower queues sell; X with the Core selected queues nothing (no sell_core exists)', () => {
    const root = mount();
    const game = new Game();
    game.start(root);
    (root.querySelector('#sw-start') as HTMLElement).click();
    const g = game as unknown as GameInternals;
    const w = g.run!.world;

    const def = w.content.towerByKey.get('ballista')!;
    const { tx, ty } = freeTileNear(w);
    w.gold = 9999;
    buildTower(w, def.id, tx, ty);
    g.view.selection = { kind: 'tower', id: w.structureAt(tx, ty)!.id };
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
    expect(g.pending).toContainEqual({ k: 'sell', tx, ty });

    g.pending.length = 0;
    g.view.selection = { kind: 'core' };
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
    expect(g.pending.some((c) => c.k === 'sell')).toBe(false);
  });

  it('U with the Core selected queues upgrade_core', () => {
    const root = mount();
    const game = new Game();
    game.start(root);
    (root.querySelector('#sw-start') as HTMLElement).click();
    const g = game as unknown as GameInternals;
    g.view.selection = { kind: 'core' };

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'u' }));
    expect(g.pending).toContainEqual({ k: 'upgrade_core' });
  });

  it('U/X with nothing selected queue nothing', () => {
    const root = mount();
    const game = new Game();
    game.start(root);
    (root.querySelector('#sw-start') as HTMLElement).click();
    const g = game as unknown as GameInternals;
    g.view.selection = null;

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'u' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
    expect(g.pending).toEqual([]);
  });
});
