/**
 * @vitest-environment jsdom
 *
 * fb032 (owner feedback `feature-practice-amount-dropdowns`): the practice
 * tool's +gold/+XP buttons become amount dropdowns (500/1000/2500/5000/
 * 100000) instead of a fixed +500, reusing the same `dev` Command path with
 * the dropdown's chosen value as `amount`.
 */

import { describe, expect, it } from 'vitest';

import { Hud, PRACTICE_AMOUNTS } from '../src/ui/hud';
import { Run, applyDevCommand } from '../src/sim/run';
import { World } from '../src/sim/world';
import type { DevOp } from '../src/sim/types';
import { cfg } from './helpers';

function mountHud(onDev: (op: DevOp, amount: number, enemyKey?: string) => void): { root: HTMLElement; hud: Hud } {
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
    onDev,
    onQuitToHub: () => {},
    onHoverSkill: () => {},
    onUpgradeStructure: () => {},
    onSellStructure: () => {},
    onUpgradeCore: () => {},
  });
  return { root, hud };
}

describe('fb032: practice +gold/+XP amount dropdowns', () => {
  it('offers exactly the five amounts, ordered, for both gold and xp', () => {
    const { root, hud } = mountHud(() => {});
    hud.showPracticeTools(true);
    for (const op of ['gold', 'xp'] as const) {
      const select = root.querySelector<HTMLSelectElement>(`#sw-dev-amount-${op}`);
      expect(select, op).not.toBeNull();
      const values = [...select!.options].map((o) => Number(o.value));
      expect(values).toEqual([...PRACTICE_AMOUNTS]);
    }
  });

  it.each([...PRACTICE_AMOUNTS])('gold dropdown grants exactly %i when selected then clicked', (amount) => {
    const log: { op: DevOp; amount: number }[] = [];
    const { root, hud } = mountHud((op, amt) => log.push({ op, amount: amt }));
    hud.showPracticeTools(true);

    const select = root.querySelector<HTMLSelectElement>('#sw-dev-amount-gold')!;
    select.value = String(amount);
    root.querySelector<HTMLElement>('[data-dev="gold"]')!.click();

    expect(log).toEqual([{ op: 'gold', amount }]);
  });

  it.each([...PRACTICE_AMOUNTS])('xp dropdown grants exactly %i when selected then clicked', (amount) => {
    const log: { op: DevOp; amount: number }[] = [];
    const { root, hud } = mountHud((op, amt) => log.push({ op, amount: amt }));
    hud.showPracticeTools(true);

    const select = root.querySelector<HTMLSelectElement>('#sw-dev-amount-xp')!;
    select.value = String(amount);
    root.querySelector<HTMLElement>('[data-dev="xp"]')!.click();

    expect(log).toEqual([{ op: 'xp', amount }]);
  });

  it('re-clicking after changing the selection sends the new amount, not the first one', () => {
    const log: { op: DevOp; amount: number }[] = [];
    const { root, hud } = mountHud((op, amt) => log.push({ op, amount: amt }));
    hud.showPracticeTools(true);

    const select = root.querySelector<HTMLSelectElement>('#sw-dev-amount-gold')!;
    const button = root.querySelector<HTMLElement>('[data-dev="gold"]')!;
    select.value = String(PRACTICE_AMOUNTS[0]);
    button.click();
    select.value = String(PRACTICE_AMOUNTS[PRACTICE_AMOUNTS.length - 1]);
    button.click();

    expect(log.map((e) => e.amount)).toEqual([PRACTICE_AMOUNTS[0], PRACTICE_AMOUNTS[PRACTICE_AMOUNTS.length - 1]]);
  });

  for (const amount of PRACTICE_AMOUNTS) {
    it(`sim: dev gold ${amount} actually adds ${amount} gold`, () => {
      const w = new World({ ...cfg(), practice: true });
      const before = w.gold;
      applyDevCommand(w, 'gold', amount);
      expect(w.gold).toBe(before + amount);
    });

    it(`sim: dev xp ${amount} actually adds xp in Act II`, () => {
      const w = new World({ ...cfg(), practice: true });
      w.sundered = true;
      w.phase = 'act2';
      const before = w.xp;
      applyDevCommand(w, 'xp', amount);
      expect(w.xp).toBeGreaterThan(before);
    });
  }

  it('replay safety: every dropdown amount produces a hash-identical replay from the same seed + log', () => {
    for (const amount of PRACTICE_AMOUNTS) {
      const cmds = [
        { k: 'dev' as const, op: 'gold' as const, amount },
        { k: 'dev' as const, op: 'xp' as const, amount },
      ];
      const hashes = [0, 1].map(() => {
        const run = new Run({ ...cfg(), practice: true, policy: 'none' });
        run.world.sundered = true;
        run.world.phase = 'act2';
        for (let t = 0; t < 60; t++) {
          run.step({
            mx: t % 3 === 0 ? 1 : 0,
            my: 0,
            dash: false,
            attack: false,
            aimX: 0,
            aimY: 0,
            active1Held: false,
            cmds: t === 10 ? cmds : [],
          });
        }
        return run.hash();
      });
      expect(hashes[0], `amount ${amount}`).toBe(hashes[1]);
    }
  });
});
