/**
 * @vitest-environment jsdom
 *
 * fb102: fb072's boss HP banner (`.sw-bossbar`, centered on the stage at a
 * fixed 360px) and fb065's floating rails (`.sw-rail-left`/`.sw-rail-right`,
 * each up to a fixed 300px) had no relationship to one another — at any
 * stage narrow enough that those three fixed-ish boxes plus their edge gaps
 * don't fit side by side, the centered boss bar overlaps whichever rail is
 * expanded. fb072's and fb065's own DONE notes both flagged this as a
 * "theoretical"/"known limitation" without filing it.
 *
 * `Hud.syncStageOverlayGeometry()` (hud.ts) now also publishes a
 * `--bossbar-maxw` CSS custom property — the widest the boss bar can be
 * without reaching into an expanded rail's own worst-case footprint — which
 * `.sw-bossbar`'s `max-width` (style.css) reads instead of a flat `60%`.
 *
 * jsdom never runs real layout (no getBoundingClientRect/getComputedStyle
 * resolution of `calc()`/`var()`), so this test computes the three boxes'
 * effective left/right bounds directly from the published `--cv-*`/
 * `--bossbar-maxw` custom properties plus the same rail box-model numbers
 * `style.css` itself hardcodes (`.sw-rail`'s `width: 300px`, its
 * `@media (max-width: 1180px)` `max-width: 55%`, and the `8px` edge gap) —
 * the same idiom `tests/ui-fb082-overlay-geometry.test.ts` already uses for
 * the letterboxing math.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Hud } from '../src/ui/hud';
import { World } from '../src/sim/world';
import { GRID_W, GRID_H } from '../src/sim/grid';
import type { DevOp } from '../src/sim/types';
import { cfg } from './helpers';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

// Transcribed from style.css's `.sw-rail`/`@media (max-width: 1180px)` rules.
const RAIL_WIDTH_PX = 300;
const RAIL_NARROW_MAX_FRACTION = 0.55;
const RAIL_NARROW_BREAKPOINT_PX = 1180;
const RAIL_EDGE_GAP_PX = 8;

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

function stubStageSize(root: HTMLElement, w: number, h: number): void {
  const stage = root.querySelector('.sw-stage') as HTMLElement;
  Object.defineProperty(stage, 'clientWidth', { value: w, configurable: true });
  Object.defineProperty(stage, 'clientHeight', { value: h, configurable: true });
}

function stageVar(root: HTMLElement, name: string): number {
  const stage = root.querySelector('.sw-stage') as HTMLElement;
  const raw = stage.style.getPropertyValue(name);
  expect(raw).not.toBe('');
  return parseFloat(raw);
}

describe('fb102: the boss banner never overlaps an expanded floating rail', () => {
  // code-reviewer (fb102): the geometry tests below only assert on the
  // `--bossbar-maxw` custom property `hud.ts` publishes — jsdom never
  // resolves `calc()`/`var()`, so nothing else in this suite would notice if
  // `.sw-bossbar`'s `max-width` declaration in style.css were ever reverted
  // back to a flat `60%` (silently reintroducing this item's bug) while
  // `hud.ts` kept publishing the property unread. Assert the CSS text itself
  // wires the two together.
  it("style.css's .sw-bossbar rule reads its max-width from --bossbar-maxw", () => {
    expect(CSS).toMatch(/\.sw-bossbar\s*\{[^}]*max-width:\s*var\(--bossbar-maxw/);
  });

  it('at a narrow (900px) stage width, the boss bar and both rails stay clear of one another', () => {
    const root = mount();
    const hud = makeHud(root);
    const w = new World(cfg());
    hud.buildTowerBar(w);
    // aspect = GRID_W/GRID_H; pick a height that puts 900 exactly on-aspect:
    // no letterboxing, --cv-left/--cv-right both 0px, keeping the arithmetic
    // below simple. 900px is under the 1180px rail-widening breakpoint.
    const stageW = 900;
    const stageH = stageW / (GRID_W / GRID_H);
    stubStageSize(root, stageW, stageH);

    hud.update(w);

    const cvLeft = stageVar(root, '--cv-left');
    const cvRight = stageVar(root, '--cv-right');
    const cx = stageVar(root, '--cv-cx');
    const bossMaxW = stageVar(root, '--bossbar-maxw');
    expect(cvLeft).toBe(0);
    expect(cvRight).toBe(0);
    expect(cx).toBe(450);

    const railFraction = stageW <= RAIL_NARROW_BREAKPOINT_PX ? RAIL_NARROW_MAX_FRACTION : 0.32;
    const railW = Math.min(RAIL_WIDTH_PX, railFraction * stageW);
    const leftRailRightEdge = cvLeft + RAIL_EDGE_GAP_PX + railW;
    const rightRailLeftEdge = stageW - cvRight - RAIL_EDGE_GAP_PX - railW;

    const bossLeftEdge = cx - bossMaxW / 2;
    const bossRightEdge = cx + bossMaxW / 2;

    expect(bossLeftEdge).toBeGreaterThanOrEqual(leftRailRightEdge);
    expect(bossRightEdge).toBeLessThanOrEqual(rightRailLeftEdge);

    // The bug this item fixes: the old flat `max-width: 60%` (no relationship
    // to the rails at all) would have sized the boss bar to min(360, 0.6*900)
    // = 360px, spanning [270, 630] — well inside both rails' footprints
    // ([8, 308] and [592, 892]). Asserting that hypothetical width against
    // the same rail edges proves this test would have failed pre-fix.
    const unfixedBossW = Math.min(360, 0.6 * stageW);
    const unfixedLeftEdge = cx - unfixedBossW / 2;
    const unfixedRightEdge = cx + unfixedBossW / 2;
    expect(unfixedLeftEdge).toBeLessThan(leftRailRightEdge);
    expect(unfixedRightEdge).toBeGreaterThan(rightRailLeftEdge);
  });

  it('at a wide (1920px) stage width, the boss bar keeps its full 360px width', () => {
    const root = mount();
    const hud = makeHud(root);
    const w = new World(cfg());
    hud.buildTowerBar(w);
    stubStageSize(root, 1920, 1067); // ~36:20-ish, close enough that letterboxing stays small

    hud.update(w);

    expect(stageVar(root, '--bossbar-maxw')).toBe(360);
  });

  it('fb109: at a pathologically narrow (200px) stage width, --bossbar-maxw floors instead of shrinking toward 0', () => {
    const root = mount();
    const hud = makeHud(root);
    const w = new World(cfg());
    hud.buildTowerBar(w);
    // At this width both rails' worst-case footprints (up to 300px each,
    // capped at the narrow 55% fraction) overlap each other, driving the
    // pre-fix `maxFromLeft`/`maxFromRight` negative and the old
    // `Math.max(0, ...)` clamp to exactly 0 — an illegible boss bar.
    stubStageSize(root, 200, 112);

    hud.update(w);

    const bossMaxW = stageVar(root, '--bossbar-maxw');
    expect(bossMaxW).toBe(120);
    expect(bossMaxW).toBeGreaterThan(0);
  });

  it('fb109: at a stage narrower than the floor itself, --bossbar-maxw never exceeds availW', () => {
    const root = mount();
    const hud = makeHud(root);
    const w = new World(cfg());
    hud.buildTowerBar(w);
    // 100px < BOSSBAR_MIN_WIDTH_PX (120) — far past any real device/browser
    // minimum, but the floor must still degrade toward "as wide as the stage
    // allows" rather than spilling the boss bar past the stage's own edges.
    stubStageSize(root, 100, 56);

    hud.update(w);

    const bossMaxW = stageVar(root, '--bossbar-maxw');
    expect(bossMaxW).toBe(100);
    expect(bossMaxW).toBeLessThanOrEqual(100);
  });

  it('falls back to no --bossbar-maxw property when the stage has no real layout (jsdom default)', () => {
    const root = mount();
    const hud = makeHud(root);
    const w = new World(cfg());
    hud.buildTowerBar(w);
    // No stubStageSize() call: clientWidth/clientHeight stay 0.

    hud.update(w);

    const stage = root.querySelector('.sw-stage') as HTMLElement;
    expect(stage.style.getPropertyValue('--bossbar-maxw')).toBe('');
  });
});
