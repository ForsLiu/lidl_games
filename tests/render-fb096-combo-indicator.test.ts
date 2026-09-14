/**
 * @vitest-environment jsdom
 *
 * fb096 (owner feedback `feature-combo-area-indicator`): while charging
 * Circle Slash, the aim indicator must show the FULL effective hit region a
 * Dash Slash cast right now would merge into — not the plain Dash Slash
 * corridor `drawChargeIndicator`/`drawSkillHoverRing` already preview for the
 * un-merged case.
 *
 * The owner feedback describes this as "the charged circle swept along the
 * dash path, a capsule/stadium shape," but `lineHit` (`src/sim/combat.ts`)
 * has no rounded cap at either end for a zero-radius point (`along` rejected
 * outright once it exceeds `range`, regardless of `perp`) — so the real
 * hit-detection region is a plain rectangle, and this file's acceptance
 * check ("a test asserts the rendered region equals the sim's hit-detection
 * region") is against that rectangle, not a capsule approximation of it.
 */
import { describe, expect, it } from 'vitest';

import { applyCommand } from '../src/sim/run';
import { spawnEnemy } from '../src/sim/enemies';
import { tickClassCharge } from '../src/sim/classes';
import { loadContent } from '../src/sim/content';
import type { TickInput } from '../src/sim/types';
import { World } from '../src/sim/world';
import { comboIndicatorRect, comboRectCorners, Renderer, type ViewState } from '../src/render/canvas';
import { defaultSettings } from '../src/ui/settings';
import { cfg as cfgWithTerrain } from './helpers';

// This file's assertions are about the combo geometry, not terrain — the
// same reasoning tests/fb016-vfx-registry.test.ts's own local `cfg()`
// wrapper states.
function cfg(over: Parameters<typeof cfgWithTerrain>[0] = {}): ReturnType<typeof cfgWithTerrain> {
  return cfgWithTerrain({ practice: true, ...over });
}

const content = loadContent();
const FULL_HP = 1e6;

function idle(over: Partial<TickInput> = {}): TickInput {
  return { mx: 0, my: 0, dash: false, attack: false, aimX: 0, aimY: 0, active1Held: false, cmds: [], ...over };
}

/** A fresh Swordsman world, Warden pinned at (4, 12), charged for `heldSeconds` (0 = untouched, still eligible to charge). */
function chargedWorld(heldSeconds: number, equipment: string[] = []): World {
  const w = new World(cfg({ classKey: 'swordsman', equipment }));
  w.warden.x = 4;
  w.warden.y = 12;
  if (heldSeconds > 0) {
    const cls = content.classByKey.get('swordsman')!;
    tickClassCharge(w, cls, idle({ active1Held: true }), heldSeconds);
  } else {
    w.warden.active1Charging = true;
  }
  return w;
}

/** An immovable, unkillable, zero-radius enemy at an absolute tile position — the same convention fb146/fb148 use to measure a corridor exactly. */
function place(w: World, x: number, y: number) {
  const e = spawnEnemy(w, 'husk', x, y)!;
  e.hp = FULL_HP;
  e.maxHp = FULL_HP;
  e.speed = 0;
  e.armor = 0;
  e.radius = 0;
  return e;
}

function view(over: Partial<ViewState> = {}): ViewState {
  return {
    selectedTower: 0,
    cursorX: 0,
    cursorY: 0,
    shake: 0,
    showRanges: false,
    selection: null,
    settings: defaultSettings(),
    ...over,
  };
}

describe('fb096: comboIndicatorRect matches the real merged Dash Slash hit region', () => {
  it('is null when not charging', () => {
    const w = new World(cfg({ classKey: 'swordsman' }));
    expect(comboIndicatorRect(w, content.classByKey.get('swordsman')!, w.warden.x + 10, w.warden.y)).toBeNull();
  });

  it('is null for a class with no charge_nova + dash_line pair (Archer: charge_pierce + dash_volley)', () => {
    const w = new World(cfg({ classKey: 'archer' }));
    w.warden.active1Charging = true;
    expect(comboIndicatorRect(w, content.classByKey.get('archer')!, w.warden.x + 10, w.warden.y)).toBeNull();
  });

  it.each([0, 1, 3])('half-charge=%s: the rectangle\'s along-range and half-width equal the real engine measurement', (heldSeconds) => {
    const w = chargedWorld(heldSeconds);
    const cls = content.classByKey.get('swordsman')!;
    const rect = comboIndicatorRect(w, cls, w.warden.x + 100, w.warden.y);
    expect(rect).not.toBeNull();
    const hitRange = Math.hypot(rect!.x2 - rect!.x1, rect!.y2 - rect!.y1);

    // Real engine measurement: a fresh, identically-charged world actually
    // fires the merge, binary-searching the furthest struck enemy exactly
    // like tests/ui-fb148-dash-range-live.test.ts's own harness.
    const furthestStruck = (): number => {
      let lo = 0;
      let hi = 40;
      for (let i = 0; i < 44; i++) {
        const mid = (lo + hi) / 2;
        const probe = chargedWorld(heldSeconds);
        const e = place(probe, probe.warden.x + mid, probe.warden.y);
        probe.rebuildBuckets();
        applyCommand(probe, { k: 'class_active2', aimX: probe.warden.x + 100, aimY: probe.warden.y });
        if (e.hp < FULL_HP) lo = mid;
        else hi = mid;
      }
      return lo;
    };
    expect(hitRange).toBeCloseTo(furthestStruck(), 6);

    const widthProbe = chargedWorld(heldSeconds);
    const scaled = rect!.halfWidth;
    const inside = place(widthProbe, widthProbe.warden.x + 2, widthProbe.warden.y + (scaled > 0 ? scaled * 0.99 : 0.01));
    const outside = place(widthProbe, widthProbe.warden.x + 2, widthProbe.warden.y + scaled * 1.01 + 0.001);
    widthProbe.rebuildBuckets();
    applyCommand(widthProbe, { k: 'class_active2', aimX: widthProbe.warden.x + 100, aimY: widthProbe.warden.y });
    expect(inside.hp).toBeLessThan(FULL_HP);
    expect(outside.hp).toBe(FULL_HP);
  });

  it('the merged radius (and therefore the rectangle length) grows with hold time', () => {
    const cls = content.classByKey.get('swordsman')!;
    const zero = comboIndicatorRect(chargedWorld(0), cls, 100, 0)!;
    const held = comboIndicatorRect(chargedWorld(3), cls, 100, 0)!;
    const lenOf = (r: typeof zero) => Math.hypot(r.x2 - r.x1, r.y2 - r.y1);
    expect(lenOf(held)).toBeGreaterThan(lenOf(zero));
  });

  it('scales with the live Area stat, same as the sim (c001)', () => {
    const cls = content.classByKey.get('swordsman')!;
    const plain = chargedWorld(3);
    const boosted = chargedWorld(3, ['normal_bracelet']);
    expect(boosted.derived.areaMul).toBeGreaterThan(plain.derived.areaMul);
    const r1 = comboIndicatorRect(plain, cls, 100, 0)!;
    const r2 = comboIndicatorRect(boosted, cls, 100, 0)!;
    expect(r2.halfWidth).toBeGreaterThan(r1.halfWidth);
    // The nova's own contribution to length also scales — the whole hitRange
    // besides the (Area-independent) dash-travel term must therefore grow too.
    const len1 = Math.hypot(r1.x2 - r1.x1, r1.y2 - r1.y1);
    const len2 = Math.hypot(r2.x2 - r2.x1, r2.y2 - r2.y1);
    expect(len2).toBeGreaterThan(len1);
  });

  it('points toward the cursor, not always toward +X', () => {
    const cls = content.classByKey.get('swordsman')!;
    const w = chargedWorld(1);
    const rect = comboIndicatorRect(w, cls, w.warden.x, w.warden.y - 10)!; // straight up
    expect(rect.x2).toBeCloseTo(rect.x1, 6);
    expect(rect.y2).toBeLessThan(rect.y1);
  });
});

describe('fb096: the live indicator actually renders the exact rectangle', () => {
  function recordingCanvas(): { canvas: HTMLCanvasElement; polys: { x: number; y: number }[][] } {
    const polys: { x: number; y: number }[][] = [];
    let current: { x: number; y: number }[] = [];
    const ctx = new Proxy(
      {
        beginPath() {
          current = [];
        },
        moveTo(x: number, y: number) {
          current.push({ x, y });
        },
        lineTo(x: number, y: number) {
          current.push({ x, y });
        },
        closePath() {
          if (current.length) polys.push(current);
        },
        stroke() {},
        fill() {},
        arc() {},
        fillRect() {},
        fillText() {},
        setLineDash() {},
        createLinearGradient: () => ({ addColorStop() {} }),
        createRadialGradient: () => ({ addColorStop() {} }),
        measureText: () => ({ width: 10 }),
      } as Record<string, unknown>,
      { get: (t, p) => (p in t ? t[p as string] : () => undefined), set: () => true },
    );
    const canvas = document.createElement('canvas');
    canvas.getContext = (() => ctx) as never;
    return { canvas, polys };
  }

  it('draws the exact 4 corners comboIndicatorRect/comboRectCorners compute', () => {
    const w = chargedWorld(1.5);
    const cls = content.classByKey.get('swordsman')!;
    const cursorX = w.warden.x + 10;
    const cursorY = w.warden.y + 3;
    const expected = comboRectCorners(comboIndicatorRect(w, cls, cursorX, cursorY)!);
    const { canvas, polys } = recordingCanvas();
    new Renderer(canvas).draw(w, view({ cursorX, cursorY }));
    const TILE = 32;
    const match = polys.find(
      (poly) =>
        poly.length === 4 &&
        poly.some((p) => Math.abs(p.x - expected.p1x * TILE) < 0.01 && Math.abs(p.y - expected.p1y * TILE) < 0.01),
    );
    expect(match, 'no rendered polygon matched the computed rectangle corners').toBeDefined();
    const xs = match!.map((p) => p.x).sort((a, b) => a - b);
    const ys = match!.map((p) => p.y).sort((a, b) => a - b);
    const expXs = [expected.p1x, expected.p2x, expected.p3x, expected.p4x].map((v) => v * TILE).sort((a, b) => a - b);
    const expYs = [expected.p1y, expected.p2y, expected.p3y, expected.p4y].map((v) => v * TILE).sort((a, b) => a - b);
    for (let i = 0; i < 4; i++) {
      expect(xs[i]).toBeCloseTo(expXs[i], 1);
      expect(ys[i]).toBeCloseTo(expYs[i], 1);
    }
  });

  it('draws nothing when not charging', () => {
    const w = new World(cfg({ classKey: 'swordsman' }));
    const { canvas, polys } = recordingCanvas();
    new Renderer(canvas).draw(w, view());
    expect(polys).toHaveLength(0);
  });
});

/** A bare no-op 2D context, sufficient for `ingest()`/`update()`/`draw()` to run without throwing. Set on the canvas BEFORE constructing a `Renderer` — its constructor calls `getContext('2d')` immediately. */
function noopCtx(): unknown {
  return {
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    stroke() {},
    fill() {},
    arc() {},
    fillRect() {},
    fillText() {},
    setLineDash() {},
    setTransform() {},
    save() {},
    restore() {},
    translate() {},
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    measureText: () => ({ width: 10 }),
  };
}

function mockRenderer(getContext: () => unknown = noopCtx): Renderer {
  const canvas = document.createElement('canvas');
  canvas.getContext = getContext as never;
  return new Renderer(canvas);
}

/** Reaches the private `comboAfterimages` array for a length assertion — the DOM/canvas has no other observable surface for "an afterimage exists" without a real 2D context recording draws. */
function afterimageCount(r: Renderer): number {
  return (r as unknown as { comboAfterimages: unknown[] }).comboAfterimages.length;
}

describe('fb096: a brief afterimage on release, respecting reduced-flash', () => {
  it('a merge leaves an afterimage; a lone Circle Slash release (no merge) does not', () => {
    const w1 = new World(cfg({ classKey: 'swordsman' }));
    w1.warden.x = 4;
    w1.warden.y = 12;
    const r1 = mockRenderer();
    const cls = content.classByKey.get('swordsman')!;
    tickClassCharge(w1, cls, idle({ active1Held: true }), 1);
    r1.ingest(w1, view()); // caches lastComboRect/wasComboCharging while still charging
    applyCommand(w1, { k: 'class_active2', aimX: w1.warden.x + 100, aimY: w1.warden.y }); // fires the merge, resets charging
    r1.ingest(w1, view()); // sees the class_active2 event, spawns the afterimage
    expect(afterimageCount(r1)).toBe(1);

    // Control: charge, then release Circle Slash itself (class_active, not
    // class_active2) — no merge, no afterimage.
    const w2 = new World(cfg({ classKey: 'swordsman' }));
    w2.warden.x = 4;
    w2.warden.y = 12;
    const r2 = mockRenderer();
    tickClassCharge(w2, cls, idle({ active1Held: true }), 1);
    r2.ingest(w2, view());
    tickClassCharge(w2, cls, idle({ active1Held: false }), 1 / 60); // release: fires class_active, not class_active2
    r2.ingest(w2, view());
    expect(afterimageCount(r2)).toBe(0);
  });

  it('respects reducedFlash: a dimmer render, never zero, never omitted', () => {
    const alphas: number[] = [];
    function recordingCtx(): unknown {
      let alpha = 1;
      return new Proxy(
        {
          ...(noopCtx() as Record<string, unknown>),
          stroke() {
            alphas.push(alpha);
          },
        },
        {
          get(t, p) {
            if (p === 'globalAlpha') return alpha;
            if (p in t) return (t as Record<string, unknown>)[p as string];
            return () => undefined;
          },
          set(_t, p, v) {
            if (p === 'globalAlpha') alpha = v as number;
            return true;
          },
        },
      );
    }

    const runOnce = (reducedFlash: boolean): number => {
      const w = new World(cfg({ classKey: 'swordsman' }));
      w.warden.x = 4;
      w.warden.y = 12;
      const r = mockRenderer(recordingCtx);
      const cls = content.classByKey.get('swordsman')!;
      tickClassCharge(w, cls, idle({ active1Held: true }), 1);
      r.ingest(w, view());
      applyCommand(w, { k: 'class_active2', aimX: w.warden.x + 100, aimY: w.warden.y });
      r.ingest(w, view());
      alphas.length = 0;
      r.draw(w, view({ settings: { ...defaultSettings(), reducedFlash } }));
      return Math.max(...alphas.filter((a) => a > 0));
    };

    const normalAlpha = runOnce(false);
    const dimmedAlpha = runOnce(true);
    expect(dimmedAlpha).toBeGreaterThan(0);
    expect(dimmedAlpha).toBeLessThan(normalAlpha);
  });

  it('fades out and is gone after its lifetime elapses (update())', () => {
    const w = new World(cfg({ classKey: 'swordsman' }));
    w.warden.x = 4;
    w.warden.y = 12;
    const r = mockRenderer();
    const cls = content.classByKey.get('swordsman')!;
    tickClassCharge(w, cls, idle({ active1Held: true }), 1);
    r.ingest(w, view());
    applyCommand(w, { k: 'class_active2', aimX: w.warden.x + 100, aimY: w.warden.y });
    r.ingest(w, view());
    expect(afterimageCount(r)).toBe(1);
    r.update(1, view());
    expect(afterimageCount(r)).toBe(0);
  });
});
