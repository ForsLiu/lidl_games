/**
 * @vitest-environment jsdom
 *
 * fb116 (BACKLOG-TERRAIN fb064e, the terrain epic's UI half): organic terrain
 * (`Grid.terrainKind`, painted from `data/terrain.json`'s per-kind `color`)
 * drawn over the square collision grid, with an edge line around a Rock
 * cluster's silhouette. Blocked on fb077 (main-lane, "no real run has a
 * generated map yet") until it shipped 2026-09-04 — `new World(cfg({ seed }))`
 * without `practice: true` now carries real generated terrain from that seed
 * (`World`'s constructor, `applyRunTerrain`), which is what every case below
 * drives instead of hand-building a `Grid`.
 *
 * Acceptance, verified directly: every non-normal tile is painted with its
 * kind's authored colour; every Rock tile's silhouette edge is drawn; the
 * flat/practice arena's frame is byte-for-byte unchanged.
 */
import { describe, expect, it } from 'vitest';

import { GRID_H, GRID_W, TILE, TileType, type Grid } from '../src/sim/grid';
import { loadTerrain, TerrainKind } from '../src/sim/terrain';
import { World } from '../src/sim/world';
import { Renderer, type ViewState } from '../src/render/canvas';
import { defaultSettings } from '../src/ui/settings';
import { cfg } from './helpers';

const terrainCfg = loadTerrain();

/** Same recording idiom `tests/fb016-vfx-registry.test.ts` uses, extended to tag every `fillRect` with the `fillStyle` live at call time and every `moveTo`/`lineTo` pair into a line segment. */
function recordingCanvas(): {
  canvas: HTMLCanvasElement;
  fills: { x: number; y: number; w: number; h: number; color: string }[];
  segments: { x1: number; y1: number; x2: number; y2: number; color: string }[];
} {
  const fills: { x: number; y: number; w: number; h: number; color: string }[] = [];
  const segments: { x1: number; y1: number; x2: number; y2: number; color: string }[] = [];
  const state = { fillStyle: '', strokeStyle: '' };
  let pending: { x: number; y: number } | null = null;
  const ctx = new Proxy(
    {
      fillRect(x: number, y: number, w: number, h: number) {
        fills.push({ x, y, w, h, color: state.fillStyle });
      },
      moveTo(x: number, y: number) {
        pending = { x, y };
      },
      lineTo(x: number, y: number) {
        if (pending) segments.push({ x1: pending.x, y1: pending.y, x2: x, y2: y, color: state.strokeStyle });
        pending = { x, y };
      },
      beginPath() {
        pending = null;
      },
      stroke() {},
      arc() {},
      fillText() {},
      setLineDash() {},
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
      measureText: () => ({ width: 10 }),
    } as Record<string, unknown>,
    {
      get(target, prop) {
        if (prop === 'fillStyle') return state.fillStyle;
        if (prop === 'strokeStyle') return state.strokeStyle;
        if (prop in target) return target[prop as string];
        return () => undefined;
      },
      set(_target, prop, value) {
        if (prop === 'fillStyle') state.fillStyle = value as string;
        if (prop === 'strokeStyle') state.strokeStyle = value as string;
        return true;
      },
    },
  );
  const canvas = document.createElement('canvas');
  canvas.getContext = (() => ctx) as never;
  return { canvas, fills, segments };
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

/** The fillRect for tile (x, y)'s TOP-LEFT corner — `drawTiles` always fills the whole `TILE`x`TILE` square from there. */
function tileFillColor(fills: { x: number; y: number; color: string }[], x: number, y: number): string | undefined {
  return fills.find((f) => f.x === x * TILE && f.y === y * TILE)?.color;
}

/** Independent reimplementation of `isInteriorRock`'s rule, from `Grid` state alone — never imports the renderer's own helper, so this cannot pass by construction. */
function sealed(grid: Grid, x: number, y: number): boolean {
  if (!grid.inBounds(x, y)) return true;
  const idx = grid.idx(x, y);
  if (grid.tile[idx] === TileType.Border) return true;
  return grid.terrainKind[idx] === TerrainKind.Rock;
}

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

/** Populated by the `it.each` block below, read by the non-vacuousness check after it — both inside the one `describe`, run in declaration order. */
const seenNonNormalBySeed = new Map<number, boolean>();

describe('fb116: every non-normal tile is painted with its kind\'s authored colour', () => {
  it.each(SEEDS)('seed %i', (seed) => {
    const w = new World(cfg({ seed }));
    const { canvas, fills } = recordingCanvas();
    new Renderer(canvas).draw(w, view());

    let sawNonNormal = false;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const idx = w.grid.idx(x, y);
        const t = w.grid.tile[idx];
        if (t === TileType.Border || t === TileType.Gate) continue; // fb116: these win over terrain — see drawTiles' own comment.
        const kind = w.grid.terrainKind[idx];
        if (kind === TerrainKind.Normal) continue;
        sawNonNormal = true;
        const authored = terrainCfg.tiles[kind]!.color;
        const painted = tileFillColor(fills, x, y);
        expect(painted, `tile (${x},${y}) kind ${kind} painted nothing`).toBeDefined();
        // `terrainTileFill` jitters lightness by up to 12% — never repaints
        // with a WHOLLY unrelated color. Checked structurally (same 6-hex
        // shape, and each RGB channel within the jitter's own byte budget)
        // rather than re-deriving the exact jittered value here, which would
        // just re-run the renderer's own formula against itself.
        expect(painted).toMatch(/^#[0-9a-f]{6}$/i);
        const [pr, pg, pb] = [1, 3, 5].map((i) => parseInt(painted!.slice(i, i + 2), 16));
        const [ar, ag, ab] = [1, 3, 5].map((i) => parseInt(authored.slice(i, i + 2), 16));
        for (const [p, a] of [
          [pr, ar],
          [pg, ag],
          [pb, ab],
        ]) {
          expect(Math.abs(p - a)).toBeLessThanOrEqual(Math.ceil(0.12 * 255));
        }
      }
    }
    seenNonNormalBySeed.set(seed, sawNonNormal);
  });

  it('at least one of the 20 seeds actually generates non-normal terrain (non-vacuous)', () => {
    // Not every seed is guaranteed non-flat by the generator's own
    // retry/fallback rules, but the whole point of this suite goes vacuous if
    // it silently ran on 20 flat maps — measured, not assumed, and only
    // meaningful once the `it.each` block above has populated the map.
    expect(seenNonNormalBySeed.size).toBe(SEEDS.length);
    expect([...seenNonNormalBySeed.values()].some(Boolean)).toBe(true);
  });

  it('the border tiles are never repainted, even though the border is ALSO TerrainKind.Rock (except where a gate is carved into it, which stays TerrainKind.Normal)', () => {
    const w = new World(cfg({ seed: 7 }));
    const { canvas, fills } = recordingCanvas();
    new Renderer(canvas).draw(w, view());
    let sawRock = 0;
    for (let x = 0; x < GRID_W; x++) {
      const idx = w.grid.idx(x, 0);
      if (w.grid.tile[idx] === TileType.Gate) continue; // a gate carved into the border row — TerrainKind.Normal by construction, checked separately below.
      expect(w.grid.terrainKind[idx]).toBe(TerrainKind.Rock);
      sawRock++;
      expect(tileFillColor(fills, x, 0)).toBe('#0a0c11'); // PALETTE.border
    }
    expect(sawRock).toBeGreaterThan(0); // non-vacuous: row 0 really is mostly Rock, not all-gate.
    for (const g of w.gates) {
      expect(tileFillColor(fills, g.tx, g.ty)).toBe('#7a4a2a'); // PALETTE.gate
    }
  });
});

describe('fb116: every Rock tile silhouette edge is drawn', () => {
  it.each(SEEDS)('seed %i: the rendered edge set matches an independent recount', (seed) => {
    const w = new World(cfg({ seed }));
    const { canvas, segments } = recordingCanvas();
    new Renderer(canvas).draw(w, view());
    const black = segments.filter((s) => s.color === '#00000099');

    // Every expected edge, built without touching the renderer's own helper.
    const expected = new Set<string>();
    for (let y = 1; y < GRID_H - 1; y++) {
      for (let x = 1; x < GRID_W - 1; x++) {
        const idx = w.grid.idx(x, y);
        if (w.grid.tile[idx] !== TileType.Open && w.grid.tile[idx] !== TileType.Core) continue;
        if (w.grid.terrainKind[idx] !== TerrainKind.Rock) continue;
        const px = x * TILE;
        const py = y * TILE;
        if (!sealed(w.grid, x, y - 1)) expected.add(`${px},${py}-${px + TILE},${py}`);
        if (!sealed(w.grid, x, y + 1)) expected.add(`${px},${py + TILE}-${px + TILE},${py + TILE}`);
        if (!sealed(w.grid, x - 1, y)) expected.add(`${px},${py}-${px},${py + TILE}`);
        if (!sealed(w.grid, x + 1, y)) expected.add(`${px + TILE},${py}-${px + TILE},${py + TILE}`);
      }
    }

    const rendered = new Set(black.map((s) => `${s.x1},${s.y1}-${s.x2},${s.y2}`));
    expect(rendered).toEqual(expected);
  });
});

describe('fb116: Training Grounds\' flat arena renders exactly as it always has', () => {
  it('practice mode paints no terrain-kind fill and draws no rock-silhouette edge', () => {
    const w = new World(cfg({ practice: true }));
    // The flat map still seals its own border as TerrainKind.Rock (same as a
    // real map) — the claim under test is that nothing ELSE changes.
    let interiorNonNormal = 0;
    for (let y = 1; y < GRID_H - 1; y++) {
      for (let x = 1; x < GRID_W - 1; x++) {
        if (w.grid.terrainKind[w.grid.idx(x, y)] !== TerrainKind.Normal) interiorNonNormal++;
      }
    }
    expect(interiorNonNormal).toBe(0);

    const { canvas, fills, segments } = recordingCanvas();
    new Renderer(canvas).draw(w, view());
    expect(segments.filter((s) => s.color === '#00000099')).toHaveLength(0);
    // Every interior Open/Core tile's fill is one of the two checkerboard
    // colors (or night's), never a terrain-kind color — the same set
    // `drawTiles` has always painted a flat arena with.
    const checkerboard = new Set(['#2a3240', '#232b37']);
    for (let y = 1; y < GRID_H - 1; y++) {
      for (let x = 1; x < GRID_W - 1; x++) {
        const t = w.grid.tile[w.grid.idx(x, y)];
        if (t === TileType.Gate) continue;
        const color = tileFillColor(fills, x, y);
        if (t === TileType.Core) continue; // overpainted by the Core rect afterward, not a checkerboard tile.
        expect(checkerboard.has(color!), `(${x},${y}) painted ${color}`).toBe(true);
      }
    }
  });

  it('a fresh Renderer draws byte-identical fills for two separate practice Worlds (determinism, not just "some color")', () => {
    const w1 = new World(cfg({ practice: true }));
    const w2 = new World(cfg({ practice: true }));
    const r1 = recordingCanvas();
    const r2 = recordingCanvas();
    new Renderer(r1.canvas).draw(w1, view());
    new Renderer(r2.canvas).draw(w2, view());
    expect(r1.fills.map((f) => f.color)).toEqual(r2.fills.map((f) => f.color));
  });
});

describe('fb116: the build ghost names the terrain rejection', () => {
  it('a rock tile inside build range shows "Blocked by terrain", not a bare red square', () => {
    const w = new World(cfg({ seed: 7 }));
    w.gold = 1e6;
    // Find a real Rock tile the Warden can reach (`checkBuild`'s own build-range gate).
    let target: { x: number; y: number } | null = null;
    for (let y = 1; y < GRID_H - 1 && !target; y++) {
      for (let x = 1; x < GRID_W - 1 && !target; x++) {
        const idx = w.grid.idx(x, y);
        if (w.grid.terrainKind[idx] !== TerrainKind.Rock) continue;
        if (w.grid.tile[idx] === TileType.Border) continue;
        w.warden.x = x + 0.5;
        w.warden.y = y + 0.5;
        target = { x, y };
      }
    }
    expect(target, 'seed 7 must generate at least one interior Rock tile').not.toBeNull();

    const towerId = w.content.towers.towers[0].id;
    const texts: string[] = [];
    const canvas = document.createElement('canvas');
    canvas.getContext = (() =>
      new Proxy(
        {
          fillText(text: string) {
            texts.push(text);
          },
          moveTo() {},
          lineTo() {},
          fillRect() {},
          beginPath() {},
          stroke() {},
          arc() {},
          setLineDash() {},
          createLinearGradient: () => ({ addColorStop() {} }),
          createRadialGradient: () => ({ addColorStop() {} }),
          measureText: () => ({ width: 10 }),
        } as Record<string, unknown>,
        { get: (t, p) => (p in t ? t[p as string] : () => undefined), set: () => true },
      )) as never;
    new Renderer(canvas).draw(w, view({ selectedTower: towerId, cursorX: target!.x + 0.5, cursorY: target!.y + 0.5 }));
    expect(texts).toContain('Blocked by terrain');
  });
});
