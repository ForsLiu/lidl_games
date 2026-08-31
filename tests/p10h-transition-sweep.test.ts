/**
 * @vitest-environment jsdom
 *
 * BACKLOG p10h (SPEC-FINAL §11, §15 P10): "the 2 s TD<->VS transition sweep."
 * `finishSundering` (TD->VS) already emitted 'sunder' for the shake/bass-hit
 * cue; nothing distinguished the sweep's own direction or covered the reverse
 * boundary (`advanceToNextBlock`, VS->TD) at all. This pins: (1) the sim emits
 * a direction-keyed fx event at both real phase boundaries, through the real
 * `Run.step` tick loop (not the bare `sundering.ts` functions called
 * directly, so a wiring regression - e.g. `completeWave` stops calling
 * `finishSundering` - would show up here too); (2) the renderer turns each
 * fx event into a 2s sweep state and
 * clears it on schedule; (3) `w.fx` (and therefore this whole feature) is
 * outside `hashWorld` per run.ts, so G2 is unaffected - re-asserted directly
 * rather than only trusted from that file's own comment.
 */
import { describe, expect, it } from 'vitest';

import { Run, hashWorld } from '../src/sim/run';
import { emptyInput } from '../src/sim/types';
import { Renderer, type ViewState } from '../src/render/canvas';
import { defaultSettings } from '../src/ui/settings';
import { cfg } from './helpers';

function noopCanvas(): HTMLCanvasElement {
  const ctx = new Proxy(
    { createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) },
    { get: (target, prop) => (prop in target ? (target as never)[prop] : () => undefined) },
  );
  const canvas = document.createElement('canvas');
  canvas.getContext = (() => ctx) as never;
  return canvas;
}

function view(): ViewState {
  return {
    selectedTower: 0,
    cursorX: 0,
    cursorY: 0,
    shake: 0,
    showRanges: false,
    selection: null,
    settings: defaultSettings(),
  };
}

function sweepOf(r: Renderer): { life: number; dir: 1 | -1 } | null {
  return (r as unknown as { sweep: { life: number; dir: 1 | -1 } | null }).sweep;
}

describe('p10h: TD<->VS transition sweep', () => {
  it('finishSundering (TD->VS) emits sweep_to_vs alongside the existing sunder cue', () => {
    // cycles: 2 so block 1 is not the final (boss-gated) block and ends its TD
    // interleave at wave 3, matching tdWavesPerVsWave (see p3a-run-shape.test.ts).
    const run = new Run(cfg({ cycles: 2, seed: 1 }));
    const w = run.world;
    w.invulnerable = true;
    w.godMode = true;

    // Drive to the wave-3 Sundering the same way p3a does: clear each wave's
    // field and let the real completeWave()/finishSundering() fire.
    for (let i = 0; i < 3; i++) {
      w.buildTimer = 0;
      run.step(emptyInput());
      w.spawnQueue = [];
      w.enemies = [];
      run.step(emptyInput());
    }

    expect(w.phase).toBe('act2');
    const kinds = w.fx.map((e) => e.k);
    expect(kinds).toContain('sunder');
    expect(kinds).toContain('sweep_to_vs');
  });

  it('advanceToNextBlock (VS->TD) emits sweep_to_td', () => {
    const run = new Run(cfg({ cycles: 2, seed: 1 }));
    const w = run.world;
    w.invulnerable = true;
    w.godMode = true;

    for (let i = 0; i < 3; i++) {
      w.buildTimer = 0;
      run.step(emptyInput());
      w.spawnQueue = [];
      w.enemies = [];
      run.step(emptyInput());
    }
    expect(w.phase).toBe('act2');

    const vsWaveSeconds = w.content.waves.vsWaveSeconds;
    w.act2Time = vsWaveSeconds;
    run.step(emptyInput());

    expect(w.phase).toBe('act1_build');
    const kinds = w.fx.map((e) => e.k);
    expect(kinds).toContain('sweep_to_td');
  });

  it('the renderer starts a 2s sweep on sweep_to_vs, direction 1', () => {
    const w = new Run(cfg()).world;
    const r = new Renderer(noopCanvas());
    w.fx = [{ k: 'sweep_to_vs', x: 1, y: 1, a: 0, b: 0 }];
    r.ingest(w, view());
    expect(sweepOf(r)).toEqual({ life: 2, dir: 1 });
  });

  it('the renderer starts a 2s sweep on sweep_to_td, direction -1, from a clean (no prior sweep) state', () => {
    const w = new Run(cfg()).world;
    const r = new Renderer(noopCanvas());
    expect(sweepOf(r)).toBeNull();
    w.fx = [{ k: 'sweep_to_td', x: 1, y: 1, a: 0, b: 0 }];
    r.ingest(w, view());
    expect(sweepOf(r)).toEqual({ life: 2, dir: -1 });
  });

  it('the renderer starts a 2s sweep on sweep_to_td, direction -1, replacing any sweep in flight', () => {
    const w = new Run(cfg()).world;
    const r = new Renderer(noopCanvas());
    w.fx = [{ k: 'sweep_to_vs', x: 1, y: 1, a: 0, b: 0 }];
    r.ingest(w, view());
    w.fx = [{ k: 'sweep_to_td', x: 1, y: 1, a: 0, b: 0 }];
    r.ingest(w, view());
    expect(sweepOf(r)).toEqual({ life: 2, dir: -1 });
  });

  it('update() ticks the sweep down and clears it once its 2s window elapses', () => {
    const w = new Run(cfg()).world;
    const r = new Renderer(noopCanvas());
    w.fx = [{ k: 'sweep_to_vs', x: 1, y: 1, a: 0, b: 0 }];
    r.ingest(w, view());
    r.update(1.5, view());
    expect(sweepOf(r)?.life).toBeCloseTo(0.5, 5);
    r.update(0.6, view());
    expect(sweepOf(r)).toBeNull();
  });

  it('draw() does not throw while a sweep is in flight, at full brightness and under reducedFlash', () => {
    const w = new Run(cfg()).world;
    const r = new Renderer(noopCanvas());
    w.fx = [{ k: 'sweep_to_vs', x: 1, y: 1, a: 0, b: 0 }];
    r.ingest(w, view());
    expect(() => r.draw(w, view())).not.toThrow();
    const reduced = view();
    reduced.settings.reducedFlash = true;
    expect(() => r.draw(w, reduced)).not.toThrow();
  });

  it('G2: w.fx (and therefore the sweep events) never reaches hashWorld', () => {
    const w = new Run(cfg({ seed: 7 })).world;
    const before = hashWorld(w);
    w.fx = [
      { k: 'sweep_to_vs', x: 1, y: 1, a: 0, b: 0 },
      { k: 'sweep_to_td', x: 1, y: 1, a: 0, b: 0 },
      { k: 'sunder', x: 1, y: 1, a: 0, b: 0 },
    ];
    expect(hashWorld(w)).toBe(before);
  });
});
