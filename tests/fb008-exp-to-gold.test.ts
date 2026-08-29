/**
 * @vitest-environment jsdom
 *
 * fb008 (owner feedback `feature-exp-to-gold`): a VS wave end auto-collects
 * every gem still on the ground; EXP beyond the character's current
 * level-up need converts to gold at `data/spawns.json`'s `expToGoldRatio`
 * (Q137). Covers both the pure-EXP path (gem total doesn't finish the
 * current level) and the overflow-to-gold path (it does, and does so with
 * room to spare), plus the HUD toast that surfaces the overflow.
 */
import { describe, expect, it } from 'vitest';

import { World } from '../src/sim/world';
import { collectRemainingGems, xpToReach } from '../src/sim/progression';
import { applyCommand, Run } from '../src/sim/run';
import { emptyInput } from '../src/sim/types';
import { Hud } from '../src/ui/hud';
import { cfg } from './helpers';

function noopHudCallbacks() {
  return {
    onSelectTower: () => {},
    onCallWave: () => {},
    onPickOffer: () => {},
    onReroll: () => {},
    onRetry: () => {},
    onNewRun: () => {},
    onToggleRanges: () => {},
    onToggleAutoPick: () => {},
    onToggleCharacterPanel: () => {},
    onToggleDpsPanel: () => {},
    onResume: () => {},
    onPause: () => {},
    onCycleSpeed: () => {},
    onDev: () => {},
    onQuitToHub: () => {},
  };
}

function act2World(): World {
  const w = new World(cfg());
  w.phase = 'act2';
  w.sundered = true;
  w.warden.x = 18;
  w.warden.y = 10;
  w.updateNav(true);
  return w;
}

describe('fb008: gem auto-collect on wave end + EXP overflow to gold', () => {
  it('pure-EXP path: a gem total that does not finish the current level is granted as ordinary XP, no gold', () => {
    const w = act2World();
    expect(w.level).toBe(1);
    const need = xpToReach(2); // level 1's full need, since w.xp starts at 0
    const value = need - 1; // deliberately short of a level-up
    w.gems.push({ id: 1, x: w.warden.x + 50, y: w.warden.y + 50, value, vx: 0, vy: 0, life: 5, dead: false });
    const goldBefore = w.gold;

    collectRemainingGems(w);

    expect(w.gems.every((g) => g.dead)).toBe(true);
    expect(w.xp).toBe(value);
    expect(w.level).toBe(1);
    expect(w.gold).toBe(goldBefore);
    expect(w.fx.some((e) => e.k === 'xp_overflow_gold')).toBe(false);
  });

  it('overflow path: EXP past the current level-up need converts to gold, exactly one level is granted, and a toast fx fires', () => {
    const w = act2World();
    const need = xpToReach(2);
    const overflow = 6;
    w.gems.push({
      id: 1,
      x: w.warden.x + 50,
      y: w.warden.y + 50,
      value: need + overflow,
      vx: 0,
      vy: 0,
      life: 5,
      dead: false,
    });
    const goldBefore = w.gold;
    const expectedGold = Math.floor(overflow * w.content.spawns.expToGoldRatio);
    expect(expectedGold).toBeGreaterThan(0);

    collectRemainingGems(w);

    expect(w.gems.every((g) => g.dead)).toBe(true);
    expect(w.level).toBe(2);
    expect(w.xp).toBe(0);
    expect(w.gold).toBe(goldBefore + expectedGold);
    expect(w.goldEarned).toBeGreaterThanOrEqual(expectedGold);
    const toast = w.fx.find((e) => e.k === 'xp_overflow_gold');
    expect(toast).toBeTruthy();
    expect(toast!.a).toBe(expectedGold);
  });

  it('multiple leftover gems are summed together, not collected one at a time', () => {
    const w = act2World();
    const need = xpToReach(2);
    w.gems.push({ id: 1, x: w.warden.x + 50, y: w.warden.y, value: Math.floor(need / 2), vx: 0, vy: 0, life: 5, dead: false });
    w.gems.push({ id: 2, x: w.warden.x - 50, y: w.warden.y, value: need - Math.floor(need / 2) - 1, vx: 0, vy: 0, life: 5, dead: false });

    collectRemainingGems(w);

    expect(w.xp).toBe(need - 1);
    expect(w.level).toBe(1);
  });

  it('a gem field with nothing live on it is a no-op', () => {
    const w = act2World();
    w.gems.push({ id: 1, x: w.warden.x, y: w.warden.y, value: 5, vx: 0, vy: 0, life: 5, dead: true });
    const xpBefore = w.xp;
    const goldBefore = w.gold;
    collectRemainingGems(w);
    expect(w.xp).toBe(xpBefore);
    expect(w.gold).toBe(goldBefore);
  });

  it('a real VS wave ending (block advance) auto-collects a gem left far from the Warden, which proximity pickup alone would have missed', () => {
    const run = new Run(cfg({ cycles: 2, seed: 1 }));
    const w = run.world;
    w.invulnerable = true;
    w.godMode = true;

    // Force straight into the VS wave without depending on real TD content.
    w.phase = 'act2';
    w.sundered = true;
    w.act2Time = 0;
    w.cycle = 1;
    applyCommand(w, { k: 'set_autopick', on: true }); // avoid pausing on an incidental level-up
    w.gems.push({
      id: 999,
      x: w.warden.x + 500,
      y: w.warden.y,
      value: 3,
      vx: 0,
      vy: 0,
      life: 999,
      dead: false,
    });

    w.act2Time = w.content.waves.vsWaveSeconds;
    run.step(emptyInput());

    expect(w.phase).toBe('act1_build');
    expect(w.cycle).toBe(2);
    // Collected (and then swept by World's own dead-gem filter that same
    // tick), not merely faded: it never had time to hit its 999s life timer.
    expect(w.gems.find((g) => g.id === 999)).toBeUndefined();
    // Its value actually landed as XP, not just vanished.
    expect(w.xp).toBe(3);
  });

  it('the boss-kill victory path (the other VS-wave-end site) also collects leftover gems', () => {
    // Default `cycles: 1` from `cfg()` makes the very first block the final
    // one, so `finalNight` is true from the start — no need to actually
    // drive 18 TD waves and a real boss fight just to reach that branch.
    const run = new Run(cfg({ seed: 1 }));
    const w = run.world;
    w.phase = 'act2';
    w.sundered = true;
    w.act2Time = 0;
    w.gems.push({ id: 42, x: w.warden.x, y: w.warden.y, value: 3, vx: 0, vy: 0, life: 999, dead: false });
    w.bossKilled = true;

    run.step(emptyInput());

    expect(w.outcome).toBe('victory');
    expect(w.phase).toBe('results');
    expect(w.gems.find((g) => g.id === 42)).toBeUndefined();
    expect(w.xp).toBe(3);
  });
});

describe('fb008: the overflow-gold HUD toast', () => {
  it('Hud.ingestFx surfaces an xp_overflow_gold fx event as a toast', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const hud = new Hud(document.getElementById('app') as HTMLElement, noopHudCallbacks());
    const toast = document.querySelector('.sw-toast') as HTMLElement;
    expect(toast.classList.contains('show')).toBe(false);

    hud.ingestFx([{ k: 'xp_overflow_gold', a: 7 }]);

    expect(toast.classList.contains('show')).toBe(true);
    expect(toast.textContent).toBe('+7 gold (EXP overflow)');
  });

  it('ignores every other fx kind', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const hud = new Hud(document.getElementById('app') as HTMLElement, noopHudCallbacks());
    const toast = document.querySelector('.sw-toast') as HTMLElement;

    hud.ingestFx([{ k: 'gem', a: 5 }, { k: 'levelup', a: 2 }]);

    expect(toast.classList.contains('show')).toBe(false);
  });

  it('a real collectRemainingGems overflow event round-trips through ingestFx into a toast', () => {
    const w = act2World();
    const need = xpToReach(2);
    const overflow = 6;
    w.gems.push({ id: 1, x: w.warden.x, y: w.warden.y, value: need + overflow, vx: 0, vy: 0, life: 5, dead: false });
    collectRemainingGems(w);
    const expectedGold = Math.floor(overflow * w.content.spawns.expToGoldRatio);

    document.body.innerHTML = '<div id="app"></div>';
    const hud = new Hud(document.getElementById('app') as HTMLElement, noopHudCallbacks());
    const toast = document.querySelector('.sw-toast') as HTMLElement;
    hud.ingestFx(w.fx);

    expect(toast.classList.contains('show')).toBe(true);
    expect(toast.textContent).toBe(`+${expectedGold} gold (EXP overflow)`);
  });
});
