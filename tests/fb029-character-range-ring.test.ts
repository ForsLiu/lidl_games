/**
 * @vitest-environment jsdom
 *
 * fb029 — SPEC-FINAL §11 (selection/indicators): clicking the character
 * selects it (the same `pickAt`/`Selection` system towers and enemies
 * already use) and draws its basic-attack range ring plus its stats panel;
 * in VS the basic attack no longer fires at all (Q117), so the ring swaps to
 * a dashed one at the longest wielded range instead of also ringing an inert
 * attack — the same "no ring for something that can't fire" rule
 * `drawRangeRings` already enforces for a petrified tower.
 *
 * Follows `t1-range-indicators.test.ts`'s own rule: never assert against a
 * default-world literal, since that is exactly the point where a buggy
 * expression and the fixed one agree. Every case here skews `charRangeMul`/
 * `areaMul` away from 1 first.
 */

import { describe, expect, it } from 'vitest';

import { Renderer, type ViewState } from '../src/render/canvas';
import { World } from '../src/sim/world';
import { GRID_W, TILE } from '../src/sim/grid';
import { buildTower } from '../src/sim/towers';
import { loadContent } from '../src/sim/content';
import { characterBasicRange } from '../src/sim/classes';
import { longestWieldedRange } from '../src/sim/vswield';
import { defaultSettings } from '../src/ui/settings';
import { wardenInfoMarkup } from '../src/ui/hud';
import { cfg } from './helpers';

const content = loadContent();

interface Arc {
  x: number;
  y: number;
  r: number;
}

/** Records the circles a frame draws — same recorder `t1-range-indicators.test.ts` uses. */
function recordingCanvas(): { canvas: HTMLCanvasElement; arcs: Arc[] } {
  const arcs: Arc[] = [];
  const ctx = new Proxy(
    {
      arc(x: number, y: number, r: number) {
        arcs.push({ x, y, r });
      },
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
      measureText: () => ({ width: 10 }),
    } as Record<string, unknown>,
    {
      get(target, prop) {
        if (prop in target) return target[prop as string];
        return () => undefined;
      },
      set: () => true,
    },
  );
  const canvas = document.createElement('canvas');
  canvas.getContext = (() => ctx) as never;
  return { canvas, arcs };
}

function view(over: Partial<ViewState> = {}): ViewState {
  return {
    selectedTower: 0,
    cursorX: -5,
    cursorY: -5,
    shake: 0,
    showRanges: false,
    selection: null,
    settings: defaultSettings(),
    ...over,
  };
}

function circleAt(arcs: Arc[], x: number, y: number, r: number): boolean {
  return arcs.some((a) => Math.abs(a.x - x) < 0.001 && Math.abs(a.y - y) < 0.001 && Math.abs(a.r - r) < 0.001);
}

/** Places a tower type on the first free tile in a small box near the Warden. */
function placeNearWarden(w: World, key: string): { tx: number; ty: number } {
  const def = content.towerByKey.get(key)!;
  w.gold = 99999;
  const bx = Math.floor(w.warden.x);
  const by = Math.floor(w.warden.y);
  for (let dy = 0; dy <= 4; dy++) {
    for (let dx = 1; dx <= 4; dx++) {
      const tx = bx + dx;
      const ty = by + dy;
      if (tx >= GRID_W - 1) continue;
      if (buildTower(w, def.id, tx, ty).ok) return { tx, ty };
    }
  }
  throw new Error(`could not place ${key}`);
}

describe('fb029: character selection draws its own attack-range ring', () => {
  it('rings the Warden at its live basic-attack range once selected — not the authored range', () => {
    const w = new World(cfg());
    w.derived.charRangeMul = 1.6;
    const { canvas, arcs } = recordingCanvas();
    new Renderer(canvas).draw(w, view({ selection: { kind: 'warden' } }));

    const cx = w.warden.x * TILE;
    const cy = w.warden.y * TILE;
    const expected = characterBasicRange(w) * TILE;
    const cls = content.classByKey.get(w.cfg.classKey)!;
    expect(expected).not.toBeCloseTo(cls.basicAttack.range * TILE, 1);
    expect(circleAt(arcs, cx, cy, expected), 'effective basic range ring').toBe(true);
  });

  it('draws no character ring when nothing is selected', () => {
    const w = new World(cfg());
    const { canvas, arcs } = recordingCanvas();
    new Renderer(canvas).draw(w, view({ selection: null }));
    const cx = w.warden.x * TILE;
    const cy = w.warden.y * TILE;
    const r = characterBasicRange(w) * TILE;
    expect(circleAt(arcs, cx, cy, r)).toBe(false);
  });

  it('the ring radius tracks range bonuses (equipment/boons land on charRangeMul)', () => {
    const w = new World(cfg());
    w.derived.charRangeMul = 1;
    const base = characterBasicRange(w);
    w.derived.charRangeMul = 1.35;
    const boosted = characterBasicRange(w);
    expect(boosted).toBeCloseTo(base * 1.35, 10);

    const { canvas, arcs } = recordingCanvas();
    new Renderer(canvas).draw(w, view({ selection: { kind: 'warden' } }));
    expect(circleAt(arcs, w.warden.x * TILE, w.warden.y * TILE, boosted * TILE)).toBe(true);
    expect(circleAt(arcs, w.warden.x * TILE, w.warden.y * TILE, base * TILE)).toBe(false);
  });

  it('in VS, the ring switches to the longest wielded range instead of the (now-inert) basic-attack range', () => {
    // classBasicAttack never fires once w.huntsWarden (Q117), so ringing its
    // range there would be exactly the "false advertising" drawRangeRings
    // already refuses for a petrified tower — code review caught the first
    // version of this test locking in the opposite (both rings at once).
    const w = new World(cfg());
    placeNearWarden(w, 'ballista');
    placeNearWarden(w, 'frost_obelisk');
    w.derived.charRangeMul = 1.2;
    w.derived.areaMul = 1.4;
    w.phase = 'act2';
    expect(w.huntsWarden).toBe(true);

    const wielded = longestWieldedRange(w);
    expect(wielded).toBeGreaterThan(0);
    const basic = characterBasicRange(w);
    expect(wielded).not.toBeCloseTo(basic, 1);

    const { canvas, arcs } = recordingCanvas();
    new Renderer(canvas).draw(w, view({ selection: { kind: 'warden' } }));
    const cx = w.warden.x * TILE;
    const cy = w.warden.y * TILE;
    expect(circleAt(arcs, cx, cy, wielded * TILE), 'longest-wielded ring').toBe(true);
    expect(circleAt(arcs, cx, cy, basic * TILE), 'inert basic-attack ring must not draw in VS').toBe(false);
  });

  it('the wielded ring scales with Area, unlike the basic-attack ring', () => {
    const w = new World(cfg());
    placeNearWarden(w, 'ballista');
    w.phase = 'act2';
    w.derived.areaMul = 1;
    const plain = longestWieldedRange(w);
    w.derived.areaMul = 2;
    const areaBoosted = longestWieldedRange(w);
    expect(areaBoosted).toBeCloseTo(plain * 2, 10);

    const basicPlain = characterBasicRange(w);
    w.derived.areaMul = 1;
    expect(characterBasicRange(w)).toBeCloseTo(basicPlain, 10);
  });

  it('outside VS, no wielded-range ring is drawn even with towers built', () => {
    const w = new World(cfg());
    placeNearWarden(w, 'ballista');
    expect(w.huntsWarden).toBe(false);
    const wielded = longestWieldedRange(w);
    expect(wielded).toBeGreaterThan(0);

    const { canvas, arcs } = recordingCanvas();
    new Renderer(canvas).draw(w, view({ selection: { kind: 'warden' } }));
    expect(circleAt(arcs, w.warden.x * TILE, w.warden.y * TILE, wielded * TILE)).toBe(false);
  });
});

describe('fb029: the character stats panel shows the same range the ring draws', () => {
  it('shows a Range row matching characterBasicRange in TD', () => {
    const w = new World(cfg());
    w.derived.charRangeMul = 1.5;
    const r = characterBasicRange(w);
    const html = wardenInfoMarkup(w);
    expect(html).toContain('Range');
    expect(html).toContain(String(Math.round(r * 10) / 10));
  });

  it('shows a Wielded range row matching longestWieldedRange in VS', () => {
    const w = new World(cfg());
    placeNearWarden(w, 'ballista');
    w.phase = 'act2';
    w.derived.areaMul = 1.3;
    const r = longestWieldedRange(w);
    const html = wardenInfoMarkup(w);
    expect(html).toContain('Wielded range');
    expect(html).toContain(String(Math.round(r * 10) / 10));
  });
});
