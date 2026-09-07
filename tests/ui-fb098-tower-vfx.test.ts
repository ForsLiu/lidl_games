/**
 * @vitest-environment jsdom
 *
 * fb098 (SPEC-FINAL §5, §11, owner feedback
 * `feature-tower-projectile-sprites.md`): every tower gets a distinct
 * registered fire+travel+impact VFX entry (`TOWER_VFX`, vfx-registry.ts,
 * mirroring fb016's `CLASS_VFX`/`CORE_VFX` coverage-test pattern), and the
 * render pipeline these entries describe actually draws something —
 * `Frost Obelisk`'s aura tick (the `pulse` fx event, previously unhandled —
 * fell to `default: break` in `canvas.ts`'s `ingest()`, so its periodic hit
 * had no visual at all), a VS-wielded Ember Brazier cone reusing the same
 * `STYLES.ember_brazier` registry entry TD uses (previously looked up a
 * `'flame_cone'` style key `theme.ts`'s `STYLES` never registered, silently
 * falling back to the generic default dart look), and Beacon Totem/Harvest
 * Sprout's render-side ambient aura pulse (`drawStructures` — these two
 * towers have `attack: null`, so no sim event exists for a real fire moment).
 */
import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';
import { missingVfxCoverage, TOWER_VFX } from '../src/render/vfx-registry';
import { Renderer, type ViewState } from '../src/render/canvas';
import { projectileStyle } from '../src/render/theme';
import { World } from '../src/sim/world';
import { TILE } from '../src/sim/grid';
import { defaultSettings } from '../src/ui/settings';
import { buildTower } from '../src/sim/towers';
import { cfg as cfgWithTerrain } from './helpers';

function cfg(over: Parameters<typeof cfgWithTerrain>[0] = {}): ReturnType<typeof cfgWithTerrain> {
  return cfgWithTerrain({ practice: true, ...over });
}

/** One buildable tile, same convention `tests/fb016-vfx-registry.test.ts` uses. */
function nearBuildTile(w: World): { tx: number; ty: number } {
  for (let ty = 4; ty < 20; ty++) {
    for (let tx = 4; tx < 20; tx++) {
      if (w.grid.buildable(tx, ty) && !w.grid.wouldBlockPath([[tx, ty]])) return { tx, ty };
    }
  }
  throw new Error('no buildable tile');
}

const content = loadContent();
const realTowerKeys = content.towers.towers.map((t) => t.key);

/** Records `arc` calls (with the live `globalAlpha`), every `moveTo`/`lineTo` (with the live `strokeStyle`, the same convention `fb016-vfx-registry.test.ts`'s `lines` uses), and every `addColorStop(0, color)` on a radial gradient — enough for this file's pulse-ring, tracer-color and cone-color assertions. */
function recordingCanvas(): {
  canvas: HTMLCanvasElement;
  arcs: { x: number; y: number; r: number; alpha: number }[];
  lines: { x: number; y: number; color: string }[];
  gradientStop0Colors: string[];
} {
  const arcs: { x: number; y: number; r: number; alpha: number }[] = [];
  const lines: { x: number; y: number; color: string }[] = [];
  const gradientStop0Colors: string[] = [];
  const state = { globalAlpha: 1, strokeStyle: '' };
  const ctx = new Proxy(
    {
      arc(x: number, y: number, r: number) {
        arcs.push({ x, y, r, alpha: state.globalAlpha });
      },
      moveTo(x: number, y: number) {
        lines.push({ x, y, color: state.strokeStyle });
      },
      lineTo(x: number, y: number) {
        lines.push({ x, y, color: state.strokeStyle });
      },
      fillRect() {},
      strokeRect() {},
      fillText() {},
      beginPath() {},
      closePath() {},
      stroke() {},
      fill() {},
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({
        addColorStop(stop: number, color: string) {
          if (stop === 0) gradientStop0Colors.push(color);
        },
      }),
      measureText: () => ({ width: 10 }),
      setTransform() {},
      save() {},
      restore() {},
      translate() {},
    } as Record<string, unknown>,
    {
      get(target, prop) {
        if (prop === 'globalAlpha') return state.globalAlpha;
        if (prop === 'strokeStyle') return state.strokeStyle;
        if (prop in target) return target[prop as string];
        return () => undefined;
      },
      set(_target, prop, value) {
        if (prop === 'globalAlpha') state.globalAlpha = value as number;
        if (prop === 'strokeStyle') state.strokeStyle = value as string;
        return true;
      },
    },
  );
  const canvas = document.createElement('canvas');
  canvas.getContext = (() => ctx) as never;
  return { canvas, arcs, lines, gradientStop0Colors };
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

describe('fb098: the TOWER_VFX registry covers every real tower', () => {
  it('has a TOWER_VFX row for every tower, with non-empty fire/travel/impact fields', () => {
    expect(realTowerKeys.length).toBe(10); // SPEC-FINAL §13
    for (const key of realTowerKeys) {
      const entry = TOWER_VFX[key];
      expect(entry, key).toBeDefined();
      expect(entry.fire.length, `${key}.fire`).toBeGreaterThan(0);
      expect(entry.travel.length, `${key}.travel`).toBeGreaterThan(0);
      expect(entry.impact.length, `${key}.impact`).toBeGreaterThan(0);
    }
  });

  it('flags a tower key with no registered entry — the "new tower without VFX fails the test" contract', () => {
    const missing = missingVfxCoverage([], [], [...realTowerKeys, 'a_brand_new_tower']);
    expect(missing.towers).toEqual(['a_brand_new_tower']);
    // The real content alone is fully covered — this is what keeps the check honest.
    expect(missingVfxCoverage([], [], realTowerKeys).towers).toEqual([]);
  });
});

describe('fb098: Frost Obelisk\'s aura tick now draws a pulse ring (previously invisible)', () => {
  it('a `pulse` fx event draws an arc at the emitted radius (the `pulse` case, previously `default: break`)', () => {
    const w = new World(cfg());
    const { canvas, arcs } = recordingCanvas();
    const renderer = new Renderer(canvas);
    const before = arcs.length;
    w.fx.push({ k: 'pulse', x: 5, y: 6, a: 3, b: 0 });
    renderer.ingest(w, view());
    renderer.draw(w, view());
    expect(arcs.length, 'a pulse event must add at least one arc').toBeGreaterThan(before);
    expect(
      arcs.some((c) => Math.abs(c.x - 5 * TILE) < 0.01 && Math.abs(c.y - 6 * TILE) < TILE && Math.abs(c.r - 3 * TILE) < TILE * 0.3),
    ).toBe(true);
  });
});

describe('fb098: a VS-wielded Arrow Spire shot reuses the same registered style TD uses', () => {
  it('draws with STYLES.arrow_spire\'s own color regardless of huntsWarden, not the missing "arrow_volley" fallback', () => {
    const w = new World(cfg());
    w.phase = 'act2'; // huntsWarden === true
    const { canvas, lines } = recordingCanvas();
    const renderer = new Renderer(canvas);
    w.fx.push({ k: 'shot', x: 5, y: 6, a: 9, b: 6 });
    renderer.ingest(w, view());
    renderer.draw(w, view());
    expect(lines.some((l) => l.color === projectileStyle('arrow_spire').color)).toBe(true);
    expect(lines.some((l) => l.color === '#ffe9a8')).toBe(false); // DEFAULT_STYLE's color — the pre-fix fallback
  });
});

describe('fb098: a VS-wielded Tesla Coil chain reuses the same registered style TD uses', () => {
  it('draws with STYLES.tesla_coil\'s own color regardless of huntsWarden, not the missing "chain_lightning" fallback', () => {
    const w = new World(cfg());
    w.phase = 'act2'; // huntsWarden === true
    const { canvas, lines } = recordingCanvas();
    const renderer = new Renderer(canvas);
    w.fx.push({ k: 'arc', x: 5, y: 6, a: 9, b: 6 });
    renderer.ingest(w, view());
    renderer.draw(w, view());
    expect(lines.some((l) => l.color === projectileStyle('tesla_coil').color)).toBe(true);
    expect(lines.some((l) => l.color === '#ffe9a8')).toBe(false); // DEFAULT_STYLE's color — the pre-fix fallback
  });
});

describe('fb098: Venom Spore\'s shot is now visible (previously an unhandled fx event, invisible in both phases)', () => {
  it('a `spore` fx event draws a tracer in STYLES.venom_spore\'s own color', () => {
    const w = new World(cfg());
    const { canvas, lines } = recordingCanvas();
    const renderer = new Renderer(canvas);
    w.fx.push({ k: 'spore', x: 5, y: 6, a: 9, b: 6 });
    renderer.ingest(w, view());
    renderer.draw(w, view());
    expect(lines.some((l) => l.color === projectileStyle('venom_spore').color)).toBe(true);
  });

  it('the same visual fires in VS (huntsWarden true)', () => {
    const w = new World(cfg());
    w.phase = 'act2';
    const { canvas, lines } = recordingCanvas();
    const renderer = new Renderer(canvas);
    w.fx.push({ k: 'spore', x: 5, y: 6, a: 9, b: 6 });
    renderer.ingest(w, view());
    renderer.draw(w, view());
    expect(lines.some((l) => l.color === projectileStyle('venom_spore').color)).toBe(true);
  });
});

describe('fb098: a VS-wielded Ember Brazier cone reuses the same registered style TD uses', () => {
  it('draws with STYLES.ember_brazier\'s own color regardless of huntsWarden, not the missing "flame_cone" fallback', () => {
    const w = new World(cfg());
    w.phase = 'act2'; // huntsWarden === true
    const { canvas, gradientStop0Colors } = recordingCanvas();
    const renderer = new Renderer(canvas);
    w.fx.push({ k: 'cone', x: 5, y: 6, a: 1, b: 0 });
    renderer.ingest(w, view());
    renderer.draw(w, view());
    expect(gradientStop0Colors).toContain(projectileStyle('ember_brazier').color);
  });

  it('TD (huntsWarden false) and VS (huntsWarden true) cones both include the same registered color', () => {
    // A full draw() pass creates other, unrelated radial gradients too (arena
    // fire, day/night ambience) — the assertion is "both include Ember
    // Brazier's own color", not "the whole gradient list is identical",
    // since those other gradients legitimately differ between TD and VS.
    const ember = projectileStyle('ember_brazier').color;
    const tdColors = (() => {
      const w = new World(cfg());
      const { canvas, gradientStop0Colors } = recordingCanvas();
      const renderer = new Renderer(canvas);
      w.fx.push({ k: 'cone', x: 5, y: 6, a: 1, b: 0 });
      renderer.ingest(w, view());
      renderer.draw(w, view());
      return gradientStop0Colors;
    })();
    const vsColors = (() => {
      const w = new World(cfg());
      w.phase = 'act2';
      const { canvas, gradientStop0Colors } = recordingCanvas();
      const renderer = new Renderer(canvas);
      w.fx.push({ k: 'cone', x: 5, y: 6, a: 1, b: 0 });
      renderer.ingest(w, view());
      renderer.draw(w, view());
      return gradientStop0Colors;
    })();
    expect(tdColors).toContain(ember);
    expect(vsColors).toContain(ember);
  });
});

describe('fb098: Beacon Totem/Harvest Sprout get a render-side ambient aura pulse', () => {
  function buildAt(w: World, towerKey: string): { tx: number; ty: number } {
    w.gold = 1e6;
    const def = content.towers.towers.find((t) => t.key === towerKey)!;
    const { tx, ty } = nearBuildTile(w);
    // inBuildRange() checks distance from the Warden, not just tile
    // buildability — same convention `fb016-vfx-registry.test.ts` uses.
    w.warden.x = tx + 0.5;
    w.warden.y = ty + 0.5;
    expect(buildTower(w, def.id, tx, ty).ok).toBe(true);
    // Move off the built tile so the Warden's own body arc (drawWarden)
    // can't coincidentally satisfy `ringAt`'s position match below.
    w.warden.x = 0.5;
    w.warden.y = 0.5;
    return { tx, ty };
  }

  function ringAt(arcs: { x: number; y: number }[], tx: number, ty: number): boolean {
    return arcs.some(
      (c) => Math.abs(c.x - (tx * TILE + TILE / 2)) < 1 && Math.abs(c.y - (ty * TILE + TILE / 2)) < 1,
    );
  }

  it('a built Beacon Totem draws an expanding ring at its tile at the start of its pulse cadence', () => {
    const w = new World(cfg());
    const { tx, ty } = buildAt(w, 'beacon_totem');
    // w.tick === 0 at build time — the ambient cadence's first frame.
    const { canvas, arcs } = recordingCanvas();
    const renderer = new Renderer(canvas);
    renderer.draw(w, view());
    expect(ringAt(arcs, tx, ty)).toBe(true);
  });

  it('draws nothing once the cadence\'s visible window has passed', () => {
    const w = new World(cfg());
    const { tx, ty } = buildAt(w, 'beacon_totem');
    w.tick = 60; // past AURA_PULSE_VISIBLE_TICKS (30), still short of the 120-tick period
    const { canvas, arcs } = recordingCanvas();
    const renderer = new Renderer(canvas);
    renderer.draw(w, view());
    expect(ringAt(arcs, tx, ty)).toBe(false);
  });

  it('does not pulse once the Warden is off wielding in VS (huntsWarden true)', () => {
    const w = new World(cfg());
    const { tx, ty } = buildAt(w, 'beacon_totem');
    w.phase = 'act2';
    const { canvas, arcs } = recordingCanvas();
    const renderer = new Renderer(canvas);
    renderer.draw(w, view());
    expect(ringAt(arcs, tx, ty)).toBe(false);
  });

  it('is suppressed under the reducedMotion setting, same as this file\'s other ambient cues (fb086)', () => {
    const w = new World(cfg());
    const { tx, ty } = buildAt(w, 'beacon_totem');
    const { canvas, arcs } = recordingCanvas();
    const renderer = new Renderer(canvas);
    renderer.draw(w, view({ settings: { ...defaultSettings(), reducedMotion: true } }));
    expect(ringAt(arcs, tx, ty)).toBe(false);
  });

  it('a Harvest Sprout (the other attack:null economy tower) gets the same ambient pulse', () => {
    const w = new World(cfg());
    const { tx, ty } = buildAt(w, 'harvest_sprout');
    const { canvas, arcs } = recordingCanvas();
    const renderer = new Renderer(canvas);
    renderer.draw(w, view());
    expect(ringAt(arcs, tx, ty)).toBe(true);
  });

  it('an attacking tower (Arrow Spire) never gets the ambient aura-pulse ring', () => {
    const w = new World(cfg());
    const { tx, ty } = buildAt(w, 'arrow_spire');
    const { canvas, arcs } = recordingCanvas();
    const renderer = new Renderer(canvas);
    renderer.draw(w, view());
    expect(ringAt(arcs, tx, ty)).toBe(false);
  });
});
