/**
 * @vitest-environment jsdom
 *
 * fb084 (QUALITY.md BETA first-run onboarding): a one-time, dismissible,
 * non-blocking contextual prompt for the first TD build phase, the first
 * Dusk->Night VS wave ('sweep_to_vs', sundering.ts's `finishSundering`), and
 * the first Dawn return-to-build ('sweep_to_td', `advanceToNextBlock`) —
 * each shown at most once ever, tracked in `Settings`, replayable via a Hub
 * control.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { Hud, type HudCallbacks, type OnboardingKey } from '../src/ui/hud';
import { World } from '../src/sim/world';
import type { DevOp } from '../src/sim/types';
import { defaultSettings, sanitize, type Settings } from '../src/ui/settings';
import { finishSundering, advanceToNextBlock } from '../src/sim/sundering';
import { cfg } from './helpers';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

function mount(): HTMLElement {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  return document.getElementById('app') as HTMLElement;
}

function makeCallbacks(onOnboardingSeen?: (key: OnboardingKey) => void): HudCallbacks {
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
    onOnboardingSeen,
  };
}

function banner(root: HTMLElement): { el: HTMLElement; text: HTMLElement; close: HTMLElement } {
  return {
    el: root.querySelector('#sw-onboarding') as HTMLElement,
    text: root.querySelector('#sw-onboarding-text') as HTMLElement,
    close: root.querySelector('#sw-onboarding-close') as HTMLElement,
  };
}

describe('fb084: first-run onboarding prompts', () => {
  let root: HTMLElement;
  let w: World;

  beforeEach(() => {
    root = mount();
    w = new World(cfg());
  });

  it('shows the build prompt on the first update of a fresh run (phase act1_build)', () => {
    const hud = new Hud(root, makeCallbacks(), defaultSettings());
    hud.buildTowerBar(w);
    hud.update(w);
    const b = banner(root);
    expect(b.el.hidden).toBe(false);
    expect(b.text.textContent).toMatch(/build phase/i);
  });

  it('does not show the build prompt when Settings already marks it seen', () => {
    const seen: Settings = { ...defaultSettings(), onboardingSeenBuild: true };
    const hud = new Hud(root, makeCallbacks(), seen);
    hud.buildTowerBar(w);
    hud.update(w);
    expect(banner(root).el.hidden).toBe(true);
  });

  it('dismissing the build prompt hides it and reports onOnboardingSeen("build")', () => {
    const seenCalls: OnboardingKey[] = [];
    const hud = new Hud(root, makeCallbacks((k) => seenCalls.push(k)), defaultSettings());
    hud.buildTowerBar(w);
    hud.update(w);
    const b = banner(root);
    expect(b.el.hidden).toBe(false);
    b.close.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(b.el.hidden).toBe(true);
    expect(seenCalls).toEqual(['build']);
  });

  it('shows the dusk prompt exactly once on the first Dusk->Night (sweep_to_vs) transition', () => {
    const hud = new Hud(root, makeCallbacks(), { ...defaultSettings(), onboardingSeenBuild: true });
    hud.buildTowerBar(w);
    hud.update(w); // build prompt already seen, no-op

    finishSundering(w); // emits 'sweep_to_vs'
    hud.ingestFx(w.fx);
    hud.update(w);
    const b = banner(root);
    expect(b.el.hidden).toBe(false);
    expect(b.text.textContent).toMatch(/night falls/i);

    // Dismiss, then trigger another sweep_to_vs later — must not reappear.
    b.close.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    w.fx = [];
    finishSundering(w);
    hud.ingestFx(w.fx);
    hud.update(w);
    expect(banner(root).el.hidden).toBe(true);
  });

  it('shows the dawn prompt exactly once on the first Dawn (sweep_to_td) transition', () => {
    const hud = new Hud(root, makeCallbacks(), {
      ...defaultSettings(),
      onboardingSeenBuild: true,
      onboardingSeenDusk: true,
    });
    hud.buildTowerBar(w);
    hud.update(w);

    advanceToNextBlock(w); // emits 'sweep_to_td'
    hud.ingestFx(w.fx);
    hud.update(w);
    const b = banner(root);
    expect(b.el.hidden).toBe(false);
    expect(b.text.textContent).toMatch(/dawn breaks/i);

    b.close.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    w.fx = [];
    advanceToNextBlock(w);
    hud.ingestFx(w.fx);
    hud.update(w);
    expect(banner(root).el.hidden).toBe(true);
  });

  it('queues a later prompt instead of dropping it when an earlier one is left un-dismissed (qa-playtester fb084 finding)', () => {
    const seenCalls: OnboardingKey[] = [];
    const hud = new Hud(root, makeCallbacks((k) => seenCalls.push(k)), defaultSettings());
    hud.buildTowerBar(w);
    hud.update(w); // build prompt shows, left un-dismissed

    // A full TD/VS cycle runs with the build prompt still open — both the
    // dusk and dawn transitions fire while nothing has been dismissed yet.
    finishSundering(w);
    hud.ingestFx(w.fx);
    hud.update(w);
    let b = banner(root);
    expect(b.text.textContent).toMatch(/build phase/i); // still showing build, not dropped or overwritten

    w.fx = [];
    advanceToNextBlock(w);
    hud.ingestFx(w.fx);
    hud.update(w);
    b = banner(root);
    expect(b.text.textContent).toMatch(/build phase/i); // dawn queued too, build still showing

    // A second cycle's dusk/dawn must not duplicate the already-queued entries.
    w.fx = [];
    finishSundering(w);
    hud.ingestFx(w.fx);
    w.fx = [];
    advanceToNextBlock(w);
    hud.ingestFx(w.fx);
    hud.update(w);
    expect(banner(root).text.textContent).toMatch(/build phase/i);

    // Dismissing build reveals the queued dusk prompt immediately.
    b.close.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    hud.update(w);
    b = banner(root);
    expect(b.el.hidden).toBe(false);
    expect(b.text.textContent).toMatch(/night falls/i);
    expect(seenCalls).toEqual(['build']);

    // Dismissing dusk reveals the queued dawn prompt.
    b.close.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    hud.update(w);
    b = banner(root);
    expect(b.el.hidden).toBe(false);
    expect(b.text.textContent).toMatch(/dawn breaks/i);
    expect(seenCalls).toEqual(['build', 'dusk']);

    // Dismissing dawn empties the queue — nothing left to show.
    b.close.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    hud.update(w);
    expect(banner(root).el.hidden).toBe(true);
    expect(seenCalls).toEqual(['build', 'dusk', 'dawn']);
  });

  it('a fresh Hud instance (a new run) never re-shows a prompt Settings already marks seen', () => {
    const seen = sanitize({
      ...defaultSettings(),
      onboardingSeenBuild: true,
      onboardingSeenDusk: true,
      onboardingSeenDawn: true,
    });
    const hud = new Hud(root, makeCallbacks(), seen);
    hud.buildTowerBar(w);
    hud.update(w);
    expect(banner(root).el.hidden).toBe(true);

    finishSundering(w);
    hud.ingestFx(w.fx);
    hud.update(w);
    expect(banner(root).el.hidden).toBe(true);
  });

  it('is non-blocking: hidden behind an actual modal (pause), but does not itself set modalOpen', () => {
    const hud = new Hud(root, makeCallbacks(), defaultSettings());
    hud.buildTowerBar(w);
    hud.update(w);
    expect(banner(root).el.hidden).toBe(false);
    expect(hud.modalOpen).toBe(false);

    hud.setPaused(true, w);
    hud.update(w);
    expect(banner(root).el.hidden).toBe(true);

    hud.setPaused(false, w);
    hud.update(w);
    expect(banner(root).el.hidden).toBe(false);
  });
});

describe('fb084: Settings persistence shape', () => {
  it('defaults every onboarding-seen flag to false', () => {
    const s = defaultSettings();
    expect(s.onboardingSeenBuild).toBe(false);
    expect(s.onboardingSeenDusk).toBe(false);
    expect(s.onboardingSeenDawn).toBe(false);
  });

  it('sanitize coerces stale/non-boolean values', () => {
    const s = sanitize({ ...defaultSettings(), onboardingSeenBuild: 1 as unknown as boolean });
    expect(s.onboardingSeenBuild).toBe(true);
  });
});
