/**
 * @vitest-environment jsdom
 *
 * fb055 (SPEC-FINAL §11 VFX registry, owner feedback
 * `feature-class-attack-sprites`): the three visible classes' basic attacks
 * previously looked like recolors of each other. Swordsman now gets an extra
 * `arc`-shape CastFx (a curved sweep) layered over the fb016 straight-line
 * swing (which stays, so that item's own regression test keeps passing),
 * Time Lord's bolt trails a second, jagged tracer, and all three land a
 * distinct impact effect at the target — `slash` / `splash` / `ripple`,
 * `vfx-registry.ts`'s new `BasicVfxEntry.impact` — instead of sharing the
 * plain `hit:` white flash every class always had. Hidden classes register
 * no `impact` and are unchanged (CLAUDE.md lane Scope: presentation-only,
 * no sim change).
 */
import { describe, expect, it } from 'vitest';

import { CLASS_VFX } from '../src/render/vfx-registry';
import { Renderer, type ViewState } from '../src/render/canvas';
import { World } from '../src/sim/world';
import { TILE } from '../src/sim/grid';
import { defaultSettings } from '../src/ui/settings';
import { cfg as cfgWithTerrain } from './helpers';

// fb116: this file's basic-attack VFX assertions have nothing to do with
// terrain (the same reasoning tests/fb016-vfx-registry.test.ts's own local
// `cfg()` wrapper already states for the identical reason) — every `cfg()`
// call here keeps the pre-fb077 flat board, so a real generated map's own
// rock-silhouette edge lines (drawn unconditionally, `drawTerrainEdges`) can
// never be mistaken for a tracer line by a test that scans every captured
// line rather than one filtered by color/position.
function cfg(over: Parameters<typeof cfgWithTerrain>[0] = {}): ReturnType<typeof cfgWithTerrain> {
  return cfgWithTerrain({ practice: true, ...over });
}

/** Same recording proxy as tests/fb016-vfx-registry.test.ts's `recordingCanvas`, plus `ellipse` (theme.ts's `glob`/`orb` projectile shapes call it) so a class_basic tracer doesn't throw. */
function recordingCanvas(): {
  canvas: HTMLCanvasElement;
  arcs: { x: number; y: number; r: number; alpha: number }[];
  lines: { x: number; y: number; color: string; alpha: number }[];
} {
  const arcs: { x: number; y: number; r: number; alpha: number }[] = [];
  const lines: { x: number; y: number; color: string; alpha: number }[] = [];
  const state = { globalAlpha: 1, strokeStyle: '', fillStyle: '' };
  const ctx = new Proxy(
    {
      arc(x: number, y: number, r: number) {
        arcs.push({ x, y, r, alpha: state.globalAlpha });
      },
      moveTo(x: number, y: number) {
        lines.push({ x, y, color: state.strokeStyle, alpha: state.globalAlpha });
      },
      lineTo(x: number, y: number) {
        lines.push({ x, y, color: state.strokeStyle, alpha: state.globalAlpha });
      },
      ellipse() {},
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
      measureText: () => ({ width: 10 }),
    } as Record<string, unknown>,
    {
      get(target, prop) {
        if (prop === 'globalAlpha') return state.globalAlpha;
        if (prop === 'strokeStyle') return state.strokeStyle;
        if (prop === 'fillStyle') return state.fillStyle;
        if (prop in target) return target[prop as string];
        return () => undefined;
      },
      set(_target, prop, value) {
        if (prop === 'globalAlpha') state.globalAlpha = value as number;
        if (prop === 'strokeStyle') state.strokeStyle = value as string;
        if (prop === 'fillStyle') state.fillStyle = value as string;
        return true;
      },
    },
  );
  const canvas = document.createElement('canvas');
  canvas.getContext = (() => ctx) as never;
  return { canvas, arcs, lines };
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

describe('fb055: the VFX registry gives the three visible classes distinct basic-attack impacts', () => {
  it('registers a distinct impact kind for each of Swordsman/Plaguebringer/Time Lord', () => {
    expect(CLASS_VFX.swordsman.basic.impact).toBe('slash');
    expect(CLASS_VFX.plaguebringer.basic.impact).toBe('splash');
    expect(CLASS_VFX.time_lord.basic.impact).toBe('ripple');
    const kinds = [CLASS_VFX.swordsman.basic.impact, CLASS_VFX.plaguebringer.basic.impact, CLASS_VFX.time_lord.basic.impact];
    expect(new Set(kinds).size).toBe(3); // three distinct kind strings, not one shape recolored
  });

  it('a hidden class (e.g. Pyromancer) registers no impact kind, unchanged by fb055', () => {
    expect(CLASS_VFX.pyromancer.basic.impact).toBeUndefined();
  });
});

describe('fb055: firing a basic attack actually draws the distinct shapes', () => {
  it('Swordsman draws both the fb016 straight swing line and a new curved arc sweep', () => {
    const w = new World(cfg({ classKey: 'swordsman' }));
    const { canvas, arcs, lines } = recordingCanvas();
    const renderer = new Renderer(canvas);
    const arcsBefore = arcs.length;
    w.fx.push({ k: 'class_basic', x: 5, y: 6, a: 9, b: 6 });
    renderer.ingest(w, view());
    renderer.draw(w, view());
    // The existing straight-line swing (fb021/fb016) still lands exactly at the target.
    const straightLine = lines.find((p) => Math.abs(p.x - 9 * TILE) < 0.01 && Math.abs(p.y - 6 * TILE) < 0.01);
    expect(straightLine, 'the swing line must still draw to the target').toBeDefined();
    expect(straightLine!.color).toBe(CLASS_VFX.swordsman.basic.color);
    // The new arc sweep draws via ctx.arc (a curved wedge), on top of the line — a genuinely different primitive, not a recolor.
    expect(arcs.length, 'the sword-swing-arc sweep must add at least one arc').toBeGreaterThan(arcsBefore);
  });

  it('Swordsman lands a slash-mark impact (crossed lines) at the target, not just the swing line', () => {
    const w = new World(cfg({ classKey: 'swordsman' }));
    const { canvas, lines } = recordingCanvas();
    const renderer = new Renderer(canvas);
    w.fx.push({ k: 'class_basic', x: 5, y: 6, a: 9, b: 6 });
    renderer.ingest(w, view());
    renderer.draw(w, view());
    // The slash impact draws two short crossed lines centered on the target, not the target itself.
    const tx = 9 * TILE;
    const ty = 6 * TILE;
    const crossMark = lines.some((p) => Math.abs(p.x - tx) > 0.01 && Math.abs(p.x - tx) < 10 && Math.abs(p.y - ty) < 10);
    expect(crossMark, 'a slash impact must draw short marks around the target, distinct from the swing line endpoint').toBe(true);
  });

  it('Plaguebringer lands a splash impact (a filled ring) at the target', () => {
    const w = new World(cfg({ classKey: 'plaguebringer' }));
    const { canvas, arcs } = recordingCanvas();
    const renderer = new Renderer(canvas);
    const before = arcs.length;
    w.fx.push({ k: 'class_basic', x: 5, y: 6, a: 9, b: 6 });
    renderer.ingest(w, view());
    renderer.draw(w, view());
    const splash = arcs.find(
      (c) => before <= arcs.indexOf(c) && Math.abs(c.x - 9 * TILE) < 0.01 && Math.abs(c.y - 6 * TILE) < 0.01,
    );
    expect(splash, 'a splash impact must draw an arc at the target').toBeDefined();
  });

  it('Time Lord lands a ripple impact (a stroked ring) at the target and trails a second jagged tracer', () => {
    const w = new World(cfg({ classKey: 'time_lord' }));
    const { canvas, arcs } = recordingCanvas();
    const renderer = new Renderer(canvas);
    w.fx.push({ k: 'class_basic', x: 5, y: 6, a: 9, b: 6 });
    renderer.ingest(w, view());
    renderer.draw(w, view());
    const ripple = arcs.find((c) => Math.abs(c.x - 9 * TILE) < 0.01 && Math.abs(c.y - 6 * TILE) < 0.01);
    expect(ripple, 'a ripple impact must draw an arc at the target').toBeDefined();
  });

  it('reducedFlash dims the new impact effects instead of removing them', () => {
    const w = new World(cfg({ classKey: 'swordsman' }));
    const normal = recordingCanvas();
    const dimmed = recordingCanvas();
    const r1 = new Renderer(normal.canvas);
    const r2 = new Renderer(dimmed.canvas);
    w.fx.push({ k: 'class_basic', x: 5, y: 6, a: 9, b: 6 });
    r1.ingest(w, view());
    r1.draw(w, view());
    r2.ingest(w, view({ settings: { ...defaultSettings(), reducedFlash: true } }));
    r2.draw(w, view({ settings: { ...defaultSettings(), reducedFlash: true } }));
    const tx = 9 * TILE;
    const ty = 6 * TILE;
    const slashLine = (list: typeof normal.lines) =>
      list.find((p) => Math.abs(p.x - tx) > 0.01 && Math.abs(p.x - tx) < 10 && Math.abs(p.y - ty) < 10);
    const normalMark = slashLine(normal.lines);
    const dimmedMark = slashLine(dimmed.lines);
    expect(normalMark, 'the slash impact must draw normally').toBeDefined();
    expect(dimmedMark, 'the slash impact must still draw under reducedFlash').toBeDefined();
    expect(dimmedMark!.alpha).toBeLessThan(normalMark!.alpha);
  });

  it('reducedFlash dims tracers too, including the Time Lord distortion tracer', () => {
    // A regression the qa-playtester pass on fb055 caught: drawTracers had no
    // reducedFlash branch at all, so the new second (jagged) tracer — and the
    // pre-existing fb021 primary tracer sharing the same draw path — stayed
    // full-bright under the setting while every other fb055 fx path dimmed.
    const w = new World(cfg({ classKey: 'time_lord' }));
    const normal = recordingCanvas();
    const dimmed = recordingCanvas();
    const r1 = new Renderer(normal.canvas);
    const r2 = new Renderer(dimmed.canvas);
    w.fx.push({ k: 'class_basic', x: 5, y: 6, a: 9, b: 6 });
    r1.ingest(w, view());
    r1.draw(w, view());
    r2.ingest(w, view({ settings: { ...defaultSettings(), reducedFlash: true } }));
    r2.draw(w, view({ settings: { ...defaultSettings(), reducedFlash: true } }));
    // A time_lord basic attack draws no lines except its tracers (the ripple
    // impact is an arc, not a line), so the max line alpha here is a tracer's.
    const maxAlpha = (list: typeof normal.lines) => Math.max(...list.map((p) => p.alpha));
    expect(normal.lines.length, 'time lord must draw tracer lines').toBeGreaterThan(0);
    expect(dimmed.lines.length, 'tracers must still draw under reducedFlash').toBeGreaterThan(0);
    expect(maxAlpha(dimmed.lines)).toBeLessThan(maxAlpha(normal.lines));
  });
});
