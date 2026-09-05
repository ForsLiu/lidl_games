/**
 * @vitest-environment jsdom
 *
 * fb104 — the bottom-bar "skill ready" ripple (`.sw-bb-flash`, a brief
 * event-triggered box-shadow animation) respects the `reducedFlash` Settings
 * toggle, matching fb055's own "reducedFlash dims/thins skill & Core effect
 * flashes" precedent. Found by qa-playtester during fb086 verification and
 * logged for the backlog generator rather than filed against fb086 itself
 * (fb086 only covers ambient *motion*, not this brief flash).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { World } from '../src/sim/world';
import { Hud } from '../src/ui/hud';
import { defaultSettings, type Settings } from '../src/ui/settings';
import { cfg } from './helpers';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

function mountHud(settings: Settings): { root: HTMLElement; hud: Hud } {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app') as HTMLElement;
  const hud = new Hud(
    root,
    {
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
    },
    settings,
  );
  return { root, hud };
}

/** Drives Active1 from "on cooldown" to "just became ready" across two `update()` ticks — the false->true edge `renderSkillIcon` gates its one-shot flash on. */
function triggerActive1ReadyEdge(hud: Hud, root: HTMLElement): HTMLElement {
  const w = new World(cfg({ classKey: 'swordsman' }));
  const cls = w.content.classByKey.get('swordsman')!;
  w.warden.active1Cooldown = cls.active1.cooldownSeconds * 0.5;
  hud.buildTowerBar(w);
  hud.update(w);
  w.warden.active1Cooldown = 0;
  hud.update(w);
  return root.querySelector('#sw-bb-active1') as HTMLElement;
}

/**
 * Same false->true ready edge as `triggerActive1ReadyEdge`, but for Active2's
 * icon (`renderSkillIcon`'s other call site, `hud.ts`) — code-reviewer noted
 * both call sites share the same generic gating and asked for coverage of
 * the other one.
 */
function triggerActive2ReadyEdge(hud: Hud, root: HTMLElement): HTMLElement {
  const w = new World(cfg({ classKey: 'swordsman' }));
  const cls = w.content.classByKey.get('swordsman')!;
  w.warden.active2Cooldown = cls.active2.cooldownSeconds * 0.5;
  hud.buildTowerBar(w);
  hud.update(w);
  w.warden.active2Cooldown = 0;
  hud.update(w);
  return root.querySelector('#sw-bb-active2') as HTMLElement;
}

/**
 * Same edge again, but for an ammo-style multi-charge Active (Time Lord's
 * *Time*, `maxCharges: 3`) — `bottom-bar.ts`'s `ready` gate is `ammo > 0`
 * here instead of `cooldownRemaining <= 0`, a different readiness path
 * through the same `renderSkillIcon` flash gate.
 */
function triggerMultiChargeReadyEdge(hud: Hud, root: HTMLElement): HTMLElement {
  const w = new World(cfg({ classKey: 'time_lord' }));
  w.warden.active1Ammo = 0;
  hud.buildTowerBar(w);
  hud.update(w);
  w.warden.active1Ammo = 1;
  hud.update(w);
  return root.querySelector('#sw-bb-active1') as HTMLElement;
}

describe('fb104 — skill-ready ripple respects reducedFlash', () => {
  it('withholds the sw-bb-flash ripple class when reducedFlash is on', () => {
    const settings = { ...defaultSettings(), reducedFlash: true };
    const { root, hud } = mountHud(settings);
    const icon = triggerActive1ReadyEdge(hud, root);
    expect(icon.classList.contains('sw-bb-flash')).toBe(false);
    // The non-flash "ready" state itself must still be reflected.
    expect(icon.classList.contains('ready')).toBe(true);
  });

  it('control: still plays the ripple normally with reducedFlash off (default)', () => {
    const settings = defaultSettings();
    expect(settings.reducedFlash).toBe(false);
    const { root, hud } = mountHud(settings);
    const icon = triggerActive1ReadyEdge(hud, root);
    expect(icon.classList.contains('sw-bb-flash')).toBe(true);
    expect(icon.classList.contains('ready')).toBe(true);
  });

  it("withholds Active2's own ripple too, not just Active1's", () => {
    const { root, hud } = mountHud({ ...defaultSettings(), reducedFlash: true });
    const icon = triggerActive2ReadyEdge(hud, root);
    expect(icon.classList.contains('sw-bb-flash')).toBe(false);
    expect(icon.classList.contains('ready')).toBe(true);
  });

  it('withholds the ripple for an ammo-style multi-charge Active as well', () => {
    const { root, hud } = mountHud({ ...defaultSettings(), reducedFlash: true });
    const icon = triggerMultiChargeReadyEdge(hud, root);
    expect(icon.classList.contains('sw-bb-flash')).toBe(false);
    expect(icon.classList.contains('ready')).toBe(true);
  });
});
