/**
 * @vitest-environment jsdom
 *
 * fb016 (SPEC-FINAL §11 extended to skills/Cores, owner feedback
 * `feature-skill-core-vfx`): indicators + fire VFX for every class Active,
 * a cue for every listed passive trigger, and indicator/VFX for every Core
 * function.
 *
 * Before this item every one of the 22 `ClassEffect.kind` fire functions in
 * `classes.ts` already called `w.emit('class_active'/'class_active2', ...)`
 * — `canvas.ts`'s `ingest()` simply had no case for either event, so every
 * skill cast in the game rendered nothing. The first block below is the
 * literal "done when" from the feedback file: a data-driven registry
 * checklist so a new skill or Core with no entry fails the test. The second
 * block proves the render pipeline itself actually draws something for a
 * representative nova/line/point/Core case, not just that the registry data
 * exists.
 */
import { describe, expect, it } from 'vitest';

import { loadContent, type ClassDef } from '../src/sim/content';
import { ACTIVE_KIND_SHAPE, CLASS_VFX, CORE_VFX, missingVfxCoverage } from '../src/render/vfx-registry';
import { Renderer, type ViewState } from '../src/render/canvas';
import { projectileStyle } from '../src/render/theme';
import { World } from '../src/sim/world';
import { CORE_X, CORE_Y, CORE_W, CORE_H, TILE } from '../src/sim/grid';
import { defaultSettings } from '../src/ui/settings';
import { applyCommand } from '../src/sim/run';
import { updateCarnivorousPlant, updateCorpse, upgradeCore } from '../src/sim/cores';
import { spawnEnemy } from '../src/sim/enemies';
import { buildTower, updateTowers } from '../src/sim/towers';
import { classArmorBonus, updateClassPassives } from '../src/sim/classes';
import { cfg as cfgWithTerrain } from './helpers';

// fb077: this file's VFX assertions build/warp onto fixed tile coordinates
// (Core-adjacent build tiles, hand-placed structures) with nothing to do with
// terrain, so every `cfg()` call here keeps the pre-fb077 flat board.
function cfg(over: Parameters<typeof cfgWithTerrain>[0] = {}): ReturnType<typeof cfgWithTerrain> {
  return cfgWithTerrain({ practice: true, ...over });
}

const DT = 1 / 60;

/** One buildable tile close to the Warden's default start, for the Vampire Heart lifesteal drive. */
function nearBuildTile(w: World): { tx: number; ty: number } {
  for (let ty = 4; ty < 20; ty++) {
    for (let tx = 4; tx < 20; tx++) {
      if (w.grid.buildable(tx, ty) && !w.grid.wouldBlockPath([[tx, ty]])) return { tx, ty };
    }
  }
  throw new Error('no buildable tile');
}

const content = loadContent();
const realClassKeys = content.classes.classes.map((c) => c.key);
const realCoreKeys = content.cores.cores.map((c) => c.key);

describe('fb016: the VFX registry covers every real class and Core', () => {
  it('has a CLASS_VFX row for every class, with populated q/e/passive fields', () => {
    expect(realClassKeys.length).toBe(12); // SPEC-FINAL §13, fb013
    for (const key of realClassKeys) {
      const entry = CLASS_VFX[key];
      expect(entry, key).toBeDefined();
      for (const slot of ['q', 'e'] as const) {
        expect(entry[slot].indicator.length, `${key}.${slot}.indicator`).toBeGreaterThan(0);
        expect(entry[slot].fire.length, `${key}.${slot}.fire`).toBeGreaterThan(0);
        expect(entry[slot].color, `${key}.${slot}.color`).toMatch(/^#[0-9a-f]{6}$/i);
      }
      expect(entry.passive.cue.length, `${key}.passive.cue`).toBeGreaterThan(0);
      expect(entry.passive.color, `${key}.passive.color`).toMatch(/^#[0-9a-f]{6}$/i);
      // fb021: every class's basic attack needs its own registered fire shape.
      expect(['swing', 'projectile']).toContain(entry.basic.shape);
      expect(entry.basic.fire.length, `${key}.basic.fire`).toBeGreaterThan(0);
      expect(entry.basic.color, `${key}.basic.color`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('has a CORE_VFX row for every Core, with a non-empty indicator description', () => {
    expect(realCoreKeys.length).toBe(5); // SPEC-FINAL §5.5
    for (const key of realCoreKeys) {
      const entry = CORE_VFX[key];
      expect(entry, key).toBeDefined();
      expect(entry.indicator.length, `${key}.indicator`).toBeGreaterThan(0);
      for (const eff of entry.effects) {
        expect(eff.vfx.length, `${key}.${eff.key}.vfx`).toBeGreaterThan(0);
        expect(eff.color, `${key}.${eff.key}.color`).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('maps every ClassEffect.kind actually authored in data/classes.json to a render shape', () => {
    for (const c of content.classes.classes) {
      expect(ACTIVE_KIND_SHAPE[c.active1.kind], `${c.key}.active1`).toBeDefined();
      expect(ACTIVE_KIND_SHAPE[c.active2.kind], `${c.key}.active2`).toBeDefined();
    }
  });

  it('flags a class/Core key with no registered entry — the "new skill without VFX fails the test" contract', () => {
    const missing = missingVfxCoverage(
      [...realClassKeys, 'a_brand_new_class'],
      [...realCoreKeys, 'a_brand_new_core'],
    );
    expect(missing.classes).toEqual(['a_brand_new_class']);
    expect(missing.cores).toEqual(['a_brand_new_core']);
    // The real content alone is fully covered — this is what keeps the check honest.
    expect(missingVfxCoverage(realClassKeys, realCoreKeys)).toEqual({ classes: [], cores: [] });
  });
});

/**
 * Records every `arc`/`moveTo`/`lineTo` call, which is all these tests care
 * about. Each recorded `arc` also snapshots `ctx.globalAlpha` at call time
 * (tracked via the `set` trap) so the reducedFlash test can assert the actual
 * dimming rather than just "something still drew."
 */
function recordingCanvas(): {
  canvas: HTMLCanvasElement;
  arcs: { x: number; y: number; r: number; alpha: number }[];
  // fb021 code review: `color` snapshots `ctx.strokeStyle` at call time (the
  // same `set`-trap pattern `alpha` already used for `globalAlpha`) so a test
  // can tell a `CastFx` line (drawn with the registry's `basic.color`) apart
  // from a `Tracer` line (drawn with `theme.ts`'s `projectileStyle` color) —
  // without it, two lines to the same endpoint are indistinguishable, so a
  // swing/projectile shape swap in `vfx-registry.ts` would pass silently.
  lines: { x: number; y: number; color: string }[];
  // fb050: `seq` is a shared, monotonically increasing call-order index
  // stamped on every recorded call (rects/texts included) so a test can
  // assert relative paint order across categories — e.g. "the Core label's
  // fillText happened after the tower's fillRect" — not just "both happened."
  rects: { x: number; y: number; w: number; h: number; seq: number }[];
  texts: { text: string; x: number; y: number; seq: number }[];
} {
  const arcs: { x: number; y: number; r: number; alpha: number }[] = [];
  const lines: { x: number; y: number; color: string }[] = [];
  const rects: { x: number; y: number; w: number; h: number; seq: number }[] = [];
  const texts: { text: string; x: number; y: number; seq: number }[] = [];
  const state = { globalAlpha: 1, strokeStyle: '' };
  let seq = 0;
  const ctx = new Proxy(
    {
      arc(x: number, y: number, r: number) {
        arcs.push({ x, y, r, alpha: state.globalAlpha });
        seq++;
      },
      moveTo(x: number, y: number) {
        lines.push({ x, y, color: state.strokeStyle });
        seq++;
      },
      lineTo(x: number, y: number) {
        lines.push({ x, y, color: state.strokeStyle });
        seq++;
      },
      fillRect(x: number, y: number, w: number, h: number) {
        rects.push({ x, y, w, h, seq: seq++ });
      },
      fillText(text: string, x: number, y: number) {
        texts.push({ text, x, y, seq: seq++ });
      },
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
      measureText: () => ({ width: 10 }),
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
  return { canvas, arcs, lines, rects, texts };
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

function closeTo(list: { x: number; y: number }[], x: number, y: number): boolean {
  return list.some((p) => Math.abs(p.x - x) < 0.01 && Math.abs(p.y - y) < 0.01);
}

describe('fb016: firing a skill or Core effect actually draws something', () => {
  it('a nova-kind Active (Swordsman Circle Slash) draws an arc at its cast radius', () => {
    const w = new World(cfg({ classKey: 'swordsman' }));
    const { canvas, arcs } = recordingCanvas();
    const renderer = new Renderer(canvas);
    const before = arcs.length;
    w.fx.push({ k: 'class_active', x: 5, y: 6, a: 2.5, b: 0 });
    renderer.ingest(w, view());
    renderer.draw(w, view());
    expect(arcs.length, 'a nova cast must add at least one arc').toBeGreaterThan(before);
    expect(arcs.some((c) => Math.abs(c.x - 5 * TILE) < 0.01 && Math.abs(c.y - 6 * TILE) < 0.01 && Math.abs(c.r - 2.5 * TILE) < TILE * 0.2)).toBe(true);
  });

  it('a line-kind Active (Swordsman Dash Slash) draws a line to its emitted endpoint', () => {
    const w = new World(cfg({ classKey: 'swordsman' }));
    const { canvas, lines } = recordingCanvas();
    const renderer = new Renderer(canvas);
    w.fx.push({ k: 'class_active2', x: 5, y: 6, a: 9, b: 6 });
    renderer.ingest(w, view());
    renderer.draw(w, view());
    expect(closeTo(lines, 9 * TILE, 6 * TILE), 'a dash cast must draw to its emitted endpoint').toBe(true);
  });

  it('a skip-kind Active (Stormcaller Chain Surge, already rendered via its own arc tracers) draws nothing extra from the cast layer', () => {
    const stormcaller = content.classByKey.get('stormcaller')! as ClassDef;
    expect(ACTIVE_KIND_SHAPE[stormcaller.active1.kind]).toBe('skip');

    // Two fresh worlds/canvases (not a before/after on one draw) since the
    // Warden's own body+facing-pip arcs draw every frame regardless of any
    // cast — the comparison that matters is baseline vs. baseline-plus-cast.
    const baseline = recordingCanvas();
    new Renderer(baseline.canvas).draw(new World(cfg({ classKey: 'stormcaller' })), view());

    const withCast = recordingCanvas();
    const w = new World(cfg({ classKey: 'stormcaller' }));
    w.fx.push({ k: 'class_active', x: 5, y: 6, a: 4, b: 0 });
    const renderer = new Renderer(withCast.canvas);
    renderer.ingest(w, view());
    renderer.draw(w, view());

    expect(withCast.arcs.length).toBe(baseline.arcs.length);
  });

  it('fb021: a swing-shape basic attack (Swordsman) draws a line to its target, in the registry\'s own basic.color', () => {
    const w = new World(cfg({ classKey: 'swordsman' }));
    expect(CLASS_VFX.swordsman.basic.shape).toBe('swing');
    const { canvas, lines } = recordingCanvas();
    const renderer = new Renderer(canvas);
    w.fx.push({ k: 'class_basic', x: 5, y: 6, a: 9, b: 6 });
    renderer.ingest(w, view());
    renderer.draw(w, view());
    const hit = lines.find((p) => Math.abs(p.x - 9 * TILE) < 0.01 && Math.abs(p.y - 6 * TILE) < 0.01);
    expect(hit, 'a basic-attack swing must draw to its target').toBeDefined();
    // Distinguishes the `pushCast('line', …)` path (CastFx, reads
    // `entry.basic.color`) from the `Tracer` path (reads `theme.ts`'s
    // `projectileStyle`, a different color for this class) — a shape swap in
    // the registry would fail this even though both mechanisms draw a line
    // to the same endpoint.
    expect(hit!.color).toBe(CLASS_VFX.swordsman.basic.color);
  });

  it('fb021: a projectile-shape basic attack (Archer) draws a travelling shot to its target, styled by theme.ts, not a CastFx line', () => {
    const w = new World(cfg({ classKey: 'archer' }));
    expect(CLASS_VFX.archer.basic.shape).toBe('projectile');
    const { canvas, lines } = recordingCanvas();
    const renderer = new Renderer(canvas);
    w.fx.push({ k: 'class_basic', x: 5, y: 6, a: 9, b: 6 });
    renderer.ingest(w, view());
    renderer.draw(w, view());
    const hit = lines.find((p) => Math.abs(p.x - 9 * TILE) < 0.01 && Math.abs(p.y - 6 * TILE) < 0.01);
    expect(hit, 'a basic-attack projectile must draw to its target').toBeDefined();
    expect(hit!.color).toBe(projectileStyle('archer').color);
  });

  it('fb021: every class basic attack draws something (registry completeness at the render layer)', () => {
    for (const key of realClassKeys) {
      const w = new World(cfg({ classKey: key }));
      const { canvas, arcs, lines } = recordingCanvas();
      const renderer = new Renderer(canvas);
      w.fx.push({ k: 'class_basic', x: 5, y: 6, a: 9, b: 6 });
      renderer.ingest(w, view());
      renderer.draw(w, view());
      expect(arcs.length + lines.length, `${key} basic attack drew nothing`).toBeGreaterThan(0);
    }
  });

  it('the Corpse Core execution beam draws from the Core to the target', () => {
    const w = new World(cfg({ core: 'corpse' }));
    const { canvas, lines } = recordingCanvas();
    const renderer = new Renderer(canvas);
    const cx = (CORE_X + CORE_W / 2) * TILE;
    const cy = (CORE_Y + CORE_H / 2) * TILE;
    w.fx.push({ k: 'core_beam', x: CORE_X + CORE_W / 2, y: CORE_Y + CORE_H / 2, a: 10, b: 12 });
    renderer.ingest(w, view());
    renderer.draw(w, view());
    expect(closeTo(lines, cx, cy), 'the beam must start at the Core').toBe(true);
    expect(closeTo(lines, 10 * TILE, 12 * TILE), 'the beam must end at the target').toBe(true);
  });

  it('fb050: the Corpse Core auto-fire beam draws from the Core to the target', () => {
    const w = new World(cfg({ core: 'corpse' }));
    const { canvas, lines } = recordingCanvas();
    const renderer = new Renderer(canvas);
    const cx = (CORE_X + CORE_W / 2) * TILE;
    const cy = (CORE_Y + CORE_H / 2) * TILE;
    w.fx.push({ k: 'core_autofire', x: CORE_X + CORE_W / 2, y: CORE_Y + CORE_H / 2, a: 10, b: 12 });
    renderer.ingest(w, view());
    renderer.draw(w, view());
    expect(closeTo(lines, cx, cy), 'the auto-fire beam must start at the Core').toBe(true);
    expect(closeTo(lines, 10 * TILE, 12 * TILE), 'the auto-fire beam must end at the target').toBe(true);
  });

  it('reducedFlash dims the cast layer instead of removing it', () => {
    const w = new World(cfg({ classKey: 'paladin' }));
    const normal = recordingCanvas();
    const dimmed = recordingCanvas();
    const r1 = new Renderer(normal.canvas);
    const r2 = new Renderer(dimmed.canvas);
    w.fx.push({ k: 'class_active2', x: 5, y: 5, a: 3, b: 0 });
    r1.ingest(w, view());
    r1.draw(w, view());
    r2.ingest(w, view({ settings: { ...defaultSettings(), reducedFlash: true } }));
    r2.draw(w, view({ settings: { ...defaultSettings(), reducedFlash: true } }));
    // Both still draw the cast (the cue survives); reducedFlash is an alpha
    // choice made at draw time, not a suppression, so the arc call itself
    // still lands either way — but the alpha it lands at must actually differ,
    // or a deleted `reduced ? 0.45 : 1` multiplier would pass this test too.
    const castArc = (list: typeof normal.arcs) =>
      list.find((c) => Math.abs(c.x - 5 * TILE) < 0.01 && Math.abs(c.y - 5 * TILE) < 0.01);
    const normalCast = castArc(normal.arcs);
    const dimmedCast = castArc(dimmed.arcs);
    expect(normalCast, 'the cast must draw an arc at the cast site').toBeDefined();
    expect(dimmedCast, 'the cast must still draw an arc when reducedFlash is on').toBeDefined();
    expect(normalCast!.alpha).toBeCloseTo(1, 5);
    expect(dimmedCast!.alpha).toBeCloseTo(0.45, 5);
  });
});

describe('fb016: the emit sites this item added/fixed actually fire through the real code path', () => {
  it('Ice Wall (previously the one Active2 kind with no emit at all) now emits class_active2', () => {
    const w = new World(cfg({ classKey: 'cryomancer' }));
    expect(w.fx.some((e) => e.k === 'class_active2')).toBe(false);
    applyCommand(w, { k: 'class_active2', aimX: w.warden.x + 2, aimY: w.warden.y });
    expect(w.fx.some((e) => e.k === 'class_active2')).toBe(true);
  });

  it('Carnivorous Plant TD devour emits core_plant on the devoured target', () => {
    const w = new World(cfg({ core: 'carnivorous_plant' }));
    spawnEnemy(w, 'husk', CORE_X - 1, CORE_Y);
    for (let i = 0; i < Math.round(w.core.devourCooldown / DT); i++) {
      w.rebuildBuckets();
      updateCarnivorousPlant(w, DT);
    }
    expect(w.fx.some((e) => e.k === 'core_plant')).toBe(true);
  });

  it('Carnivorous Plant VS poison volley emits core_plant per bullet', () => {
    const w = new World(cfg({ core: 'carnivorous_plant' }));
    w.phase = 'act2';
    w.digestionStacks = 5; // exactly 1 bullet
    spawnEnemy(w, 'husk', CORE_X - 1, CORE_Y);
    for (let i = 0; i < Math.round(1.5 / DT); i++) {
      w.rebuildBuckets();
      updateCarnivorousPlant(w, DT);
    }
    expect(w.fx.some((e) => e.k === 'core_plant')).toBe(true);
  });

  it('Vampire Heart TD tower lifesteal emits core_lifesteal from the healed structure', () => {
    const w = new World(cfg({ core: 'vampire_heart' }));
    const { tx, ty } = nearBuildTile(w);
    w.warden.x = tx + 0.5;
    w.warden.y = ty + 0.5;
    w.gold = 1e6;
    const ARROW = w.content.towerByKey.get('arrow_spire')!;
    expect(buildTower(w, ARROW.id, tx, ty).ok).toBe(true);
    const s = w.structureAt(tx, ty)!;
    s.hp = 1;
    s.maxHp = 1e6;
    const e = spawnEnemy(w, 'husk', tx + 1.5, ty + 0.5)!;
    e.hp = 1e9;
    e.maxHp = 1e9;
    e.speed = 0;
    w.rebuildBuckets();
    s.cooldown = 0;
    updateTowers(w, DT);
    expect(s.hp).toBeGreaterThan(1); // the heal landed at all
    expect(w.fx.some((f) => f.k === 'core_lifesteal')).toBe(true);
  });

  it('Corpse execution emits core_beam from the Core to the target, and core_explode once step 2 is bought', () => {
    const w = new World(cfg({ core: 'corpse' }));
    w.gold = 1e6;
    expect(upgradeCore(w)).toBe(true); // step 1
    expect(upgradeCore(w)).toBe(true); // step 2: corpseExecuteExplode = true
    expect(w.core.corpseExecuteExplode).toBe(true);
    w.corpseStore = 10;
    const victim = spawnEnemy(w, 'husk', 10, 10)!;
    victim.hp = 10;
    for (let i = 0; i < Math.round(1 / DT); i++) {
      w.rebuildBuckets();
      updateCorpse(w, DT);
    }
    expect(victim.dead).toBe(true);
    expect(w.fx.some((e) => e.k === 'core_beam')).toBe(true);
    expect(w.fx.some((e) => e.k === 'core_explode')).toBe(true);
  });

  it('fb050: Corpse step-3 auto-fire (previously emitted no fx at all) now emits core_autofire', () => {
    const w = new World(cfg({ core: 'corpse' }));
    w.gold = 1e6;
    expect(upgradeCore(w)).toBe(true); // step 1
    expect(upgradeCore(w)).toBe(true); // step 2
    expect(upgradeCore(w)).toBe(true); // step 3: corpseAutoFireInterval unlocked
    expect(w.core.corpseAutoFireInterval).toBeGreaterThan(0);
    // A victim far too costly for the 1s execute branch to ever afford (it
    // only fires against `highestAffordableEnemy(w, w.corpseStore)`), so only
    // step 3's independent auto-fire timer is exercised.
    w.corpseStore = 5;
    const victim = spawnEnemy(w, 'husk', 10, 10)!;
    victim.hp = 1e6;
    victim.maxHp = 1e6;
    for (let i = 0; i < Math.round(w.core.corpseAutoFireInterval / DT) + 1; i++) {
      w.rebuildBuckets();
      updateCorpse(w, DT);
    }
    expect(w.fx.some((e) => e.k === 'core_autofire')).toBe(true);
    expect(w.corpseStore).toBeLessThan(5); // the store was spent (a small credit may flow back in, per corpseStoreRatio)
  });
});

/**
 * qa-playtester found three registry entries whose claimed cue was
 * fabricated: Pyromancer's Contagious Flame touch damage and Paladin's
 * Guardian Stance stand-still armor glow rendered nothing at all (findings
 * #1/#2 — the registry-completeness test above can't catch this class of bug
 * since it only checks strings are non-empty, not that they're true), and
 * both charge indicators' "brightens with hold" claim was a flat, non-dynamic
 * alpha (finding #3). Judgement's fabricated "brightens with stored Wrath"
 * indicator (finding #4) had no real state to telegraph (Judgement fires
 * instantly, no charge phase), so that one was a doc fix in vfx-registry.ts
 * instead of new render code — nothing to regression-test.
 */
describe('fb016: QA-found overclaims, now real (or corrected)', () => {
  it('Contagious Flame touch damage flashes the adjacent enemy, not just the burning carrier', () => {
    const w = new World(cfg({ classKey: 'pyromancer' }));
    const carrier = spawnEnemy(w, 'husk', 5, 5)!;
    carrier.dots.push({ type: 'burning', remaining: 5, dps: 10, source: 'test', accTime: 0, accDamage: 0, accScaled: 0, accSource: 'test' });
    const other = spawnEnemy(w, 'husk', 5.5, 5)!; // well within flameRadius (1.2)
    w.rebuildBuckets();
    updateClassPassives(w, DT);
    expect(w.fx.some((e) => e.k === 'class_passive' && e.b === other.id)).toBe(true);
  });

  it('Guardian Stance draws an armor-glow ring once standStillTimer clears stanceSeconds', () => {
    const w = new World(cfg({ classKey: 'paladin' }));
    expect(classArmorBonus(w)).toBe(0);
    const { canvas: beforeCanvas, arcs: beforeArcs } = recordingCanvas();
    new Renderer(beforeCanvas).draw(w, view());
    w.warden.standStillTimer = 999;
    expect(classArmorBonus(w)).toBeGreaterThan(0);
    const { canvas: afterCanvas, arcs: afterArcs } = recordingCanvas();
    new Renderer(afterCanvas).draw(w, view());
    expect(afterArcs.length).toBeGreaterThan(beforeArcs.length);
  });

  it('the charge indicator brightens with hold instead of a flat alpha (Swordsman Circle Slash)', () => {
    const w = new World(cfg({ classKey: 'swordsman' }));
    // Baseline (not charging) fixes how many arcs everything *other* than
    // drawChargeIndicator draws, so the first arc past that count is always
    // the one this test cares about, regardless of draw-order elsewhere.
    const baseline = recordingCanvas();
    new Renderer(baseline.canvas).draw(w, view());
    const baseCount = baseline.arcs.length;

    w.warden.active1Charging = true;
    w.warden.active1Charge = 0;
    const lowCanvas = recordingCanvas();
    new Renderer(lowCanvas.canvas).draw(w, view());
    const lowArc = lowCanvas.arcs[baseCount];

    w.warden.active1Charge = 3; // this class's chargeCapSeconds (data/classes.json)
    const highCanvas = recordingCanvas();
    new Renderer(highCanvas.canvas).draw(w, view());
    const highArc = highCanvas.arcs[baseCount];

    expect(lowArc, 'a charge preview arc must exist at zero charge too').toBeDefined();
    expect(highArc, 'a charge preview arc must exist at full charge').toBeDefined();
    expect(highArc!.alpha).toBeGreaterThan(lowArc!.alpha);
  });
});

describe('fb050: Core status text draws above structures, with a backdrop', () => {
  it('the Store label paints after a tower built directly beside the Core, not under it', () => {
    const w = new World(cfg({ core: 'corpse' }));
    // corpseExecuteInterval is a base effect (data/cores.json), not gated by
    // any upgrade step, so the label renders on a fresh corpse-core world.
    expect(w.core.corpseExecuteInterval).toBeGreaterThan(0);
    w.corpseStore = 42;

    // A buildable ground tile directly above the Core's 2x2 footprint —
    // nothing marks it non-buildable (only the Core's own tiles are), so
    // this reproduces the exact real-play placement the bug report names.
    const tx = CORE_X;
    const ty = CORE_Y - 1;
    expect(w.grid.buildable(tx, ty)).toBe(true);
    const ARROW = w.content.towerByKey.get('arrow_spire')!;
    expect(buildTower(w, ARROW.id, tx, ty).ok).toBe(true);

    const { canvas, rects, texts } = recordingCanvas();
    const renderer = new Renderer(canvas);
    renderer.ingest(w, view());
    renderer.draw(w, view());

    const label = texts.find((t) => t.text.startsWith('Store'));
    expect(label, 'the Store label must still draw').toBeDefined();
    // The tower's own body fill: `fillRect(x + 2, y + 2, TILE - 4, TILE - 4)`
    // at this tile's pixel origin (drawStructures, canvas.ts).
    const towerFill = rects.find(
      (r) => Math.abs(r.x - (tx * TILE + 2)) < 0.01 && Math.abs(r.y - (ty * TILE + 2)) < 0.01,
    );
    expect(towerFill, 'the tower body must draw').toBeDefined();
    expect(label!.seq, 'the label must paint after the tower body, not before it').toBeGreaterThan(towerFill!.seq);

    // The backdrop behind the label (a fillRect immediately preceding it,
    // fb050) must also land after the tower, or the tower would still cover
    // the backdrop while the text drew "above" it.
    const backdrop = rects
      .filter((r) => r.seq < label!.seq)
      .reduce((best, r) => (best === undefined || r.seq > best.seq ? r : best), undefined as typeof rects[number] | undefined);
    expect(backdrop, 'a backdrop rect must precede the label').toBeDefined();
    expect(backdrop!.seq).toBeGreaterThan(towerFill!.seq);
  });
});
