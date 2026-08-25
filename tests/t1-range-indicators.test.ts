/**
 * @vitest-environment jsdom
 *
 * SPEC-V3 §10 T1: "Placement ghost shows attack-range ring + AoE preview;
 * selected tower shows its ring."
 *
 * The M17 audit found two defects here rather than a missing feature: the ghost
 * drew `def.attack.range` — the *authored* number, ignoring tier and the
 * Constellation's tower-range bonus, so it lied about any upgraded tower — and
 * `view.showRanges`, wired to the R key, a HUD button and a Settings checkbox,
 * was never read by the renderer at all.
 *
 * The first version of this file tested all of that on a *default* world:
 * `towerRangeMul` 1, `areaMul` 1, tier 1 — exactly the point where the buggy
 * expression and the fixed one agree. QA re-inserted the original bug and every
 * test still passed. So every canvas case below runs on a deliberately skewed
 * world and asserts against the shared helper, never against a literal.
 */

import { describe, expect, it } from 'vitest';

import { Renderer, type ViewState } from '../src/render/canvas';
import { World } from '../src/sim/world';
import { GRID_W, TILE } from '../src/sim/grid';
import {
  buildTower,
  effectiveTowerAoe,
  effectiveTowerMinRange,
  effectiveTowerRange,
  towerRange,
  upgradeTower,
} from '../src/sim/towers';
import { loadContent } from '../src/sim/content';
import { defaultSettings } from '../src/ui/settings';
import { cfg } from './helpers';

const content = loadContent();

interface Arc {
  x: number;
  y: number;
  r: number;
}

/** Records the circles a frame draws, which is all these tests care about. */
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
    cursorX: 0,
    cursorY: 0,
    shake: 0,
    showRanges: false,
    settings: defaultSettings(),
    ...over,
  };
}

/** A tile next to the Warden so build-range checks pass. */
function placeNearWarden(w: World, key: string): { tx: number; ty: number } {
  const def = content.towerByKey.get(key)!;
  w.gold = 99999;
  for (let dx = 1; dx <= 3; dx++) {
    const tx = Math.floor(w.warden.x) + dx;
    const ty = Math.floor(w.warden.y);
    if (tx >= GRID_W - 1) break;
    if (buildTower(w, def.id, tx, ty).ok) return { tx, ty };
  }
  throw new Error(`could not place ${key}`);
}

/**
 * A world where the authored numbers and the effective numbers differ on every
 * axis: a range bonus, an area bonus, and a tower above tier 1.
 */
function skewedWorld(key = 'ballista'): { w: World; tx: number; ty: number } {
  const w = new World(cfg());
  const { tx, ty } = placeNearWarden(w, key);
  while (w.structureAt(tx, ty)!.tier < 3) {
    w.gold = 99999;
    if (!upgradeTower(w, tx, ty)) break;
  }
  w.derived.towerRangeMul = 1.25;
  w.derived.areaMul = 1.5;
  return { w, tx, ty };
}

function circleAt(arcs: Arc[], x: number, y: number, r: number): boolean {
  return arcs.some(
    (a) => Math.abs(a.x - x) < 0.001 && Math.abs(a.y - y) < 0.001 && Math.abs(a.r - r) < 0.001,
  );
}

describe('T1: the helper quotes the radius the turret reaches', () => {
  it('matches the sim for every attacking tower at every tier, with stats live', () => {
    const w = new World(cfg());
    w.derived.towerRangeMul = 1.25;
    w.derived.areaMul = 1.5;
    for (const def of content.towers.towers) {
      const a = def.attack;
      if (!a) continue;
      const { tx, ty } = placeNearWarden(w, def.key);
      const s = w.structureAt(tx, ty)!;
      for (let tier = 1; tier <= def.maxTier; tier++) {
        while (s.tier < tier) {
          w.gold = 99999;
          expect(upgradeTower(w, tx, ty), `${def.key} -> T${tier}`).toBe(true);
        }
        // `fireTower` transforms the targeting radius per kind: an aura pulses
        // over `range * areaMul`, everything else uses it as-is.
        const targeting = towerRange(w, s, a.range);
        const expected = a.kind === 'aura' ? targeting * w.derived.areaMul : targeting;
        expect(effectiveTowerRange(w, def, s.tier), `${def.key} T${tier}`).toBeCloseTo(expected, 10);
      }
      w.removeStructure(s);
    }
  });

  it('an aura tower reports the radius it actually pulses over', () => {
    // The bug: the helper omitted the aura's areaMul, hiding a third of a Frost
    // Obelisk's coverage for anyone carrying an Area stat.
    const w = new World(cfg());
    const def = content.towerByKey.get('frost_obelisk')!;
    expect(def.attack!.kind).toBe('aura');
    const plain = effectiveTowerRange(w, def);
    w.derived.areaMul = 1.5;
    expect(effectiveTowerRange(w, def)).toBeCloseTo(plain * 1.5, 10);
  });

  it('a non-aura tower is unaffected by the area stat', () => {
    const w = new World(cfg());
    const def = content.towerByKey.get('ballista')!;
    const plain = effectiveTowerRange(w, def);
    w.derived.areaMul = 2;
    expect(effectiveTowerRange(w, def)).toBeCloseTo(plain, 10);
  });

  it('grows with tier, so an upgraded tower does not under-report', () => {
    const w = new World(cfg());
    const def = content.towerByKey.get('ballista')!;
    expect(effectiveTowerRange(w, def, 2)).toBeGreaterThan(effectiveTowerRange(w, def, 1));
    expect(effectiveTowerRange(w, def, 3)).toBeGreaterThan(effectiveTowerRange(w, def, 2));
  });

  it('includes the Constellation tower-range bonus — the bug the ghost had', () => {
    const w = new World(cfg());
    const def = content.towerByKey.get('arrow_spire')!;
    const plain = effectiveTowerRange(w, def);
    w.derived.towerRangeMul = 1.5;
    expect(effectiveTowerRange(w, def)).toBeCloseTo(plain * 1.5, 10);
    expect(effectiveTowerRange(w, def)).not.toBeCloseTo(def.attack!.range, 5);
  });

  it('reports splash only for the kind that reads it', () => {
    const w = new World(cfg());
    for (const def of content.towers.towers) {
      const expected = def.attack?.kind === 'lob';
      expect(effectiveTowerAoe(w, def) > 0, `${def.key} splash`).toBe(expected);
    }
    expect(effectiveTowerAoe(w, content.towerByKey.get('mortar')!)).toBeGreaterThan(0);
  });

  it('scales splash with the area stat', () => {
    const w = new World(cfg());
    const def = content.towerByKey.get('mortar')!;
    const plain = effectiveTowerAoe(w, def);
    w.derived.areaMul = 2;
    expect(effectiveTowerAoe(w, def)).toBeCloseTo(plain * 2, 10);
  });

  it('reports the lob dead zone the sim refuses to fire inside', () => {
    const w = new World(cfg());
    const mortar = content.towerByKey.get('mortar')!;
    expect(effectiveTowerMinRange(w, mortar)).toBe(mortar.attack!.minRange);
    expect(effectiveTowerMinRange(w, mortar)).toBeGreaterThan(0);
    expect(effectiveTowerMinRange(w, content.towerByKey.get('ballista')!)).toBe(0);
  });

  it('mirrors the sim default for a lob that authors no splash', () => {
    // No shipped tower exercises this: mortar authors aoe 1.8. But
    // `spawnProjectile` falls back to 1.5, and the helper's whole job is to be
    // the same expression — so a future lob tower without an authored aoe
    // cannot silently disagree.
    const w = new World(cfg());
    const mortar = content.towerByKey.get('mortar')!;
    const withoutAoe = {
      ...mortar,
      attack: { ...mortar.attack!, aoe: undefined },
    } as unknown as typeof mortar;
    expect(effectiveTowerAoe(w, withoutAoe)).toBeCloseTo(1.5 * w.derived.areaMul, 10);
  });

  it('is zero for towers with no attack at all', () => {
    const w = new World(cfg());
    for (const key of ['palisade', 'beacon_totem', 'harvest_sprout']) {
      const def = content.towerByKey.get(key)!;
      expect(effectiveTowerRange(w, def), key).toBe(0);
      expect(effectiveTowerAoe(w, def), key).toBe(0);
    }
  });
});

describe('T1: showRanges changes what is drawn', () => {
  it('draws more circles with the toggle on than off', () => {
    const counts = [false, true].map((showRanges) => {
      const { w } = skewedWorld();
      const { canvas, arcs } = recordingCanvas();
      new Renderer(canvas).draw(w, view({ showRanges }));
      return arcs.length;
    });
    expect(counts[1], 'showRanges must draw something').toBeGreaterThan(counts[0]);
  });

  it('rings a built tower at its effective range, not its authored range', () => {
    const { w, tx, ty } = skewedWorld();
    const def = content.towerByKey.get('ballista')!;
    const s = w.structureAt(tx, ty)!;
    const { canvas, arcs } = recordingCanvas();
    new Renderer(canvas).draw(w, view({ showRanges: true }));

    const effective = effectiveTowerRange(w, def, s.tier) * TILE;
    const authored = def.attack!.range * TILE;
    expect(effective).not.toBeCloseTo(authored, 1);
    expect(circleAt(arcs, (tx + 0.5) * TILE, (ty + 0.5) * TILE, effective), 'effective').toBe(true);
    expect(circleAt(arcs, (tx + 0.5) * TILE, (ty + 0.5) * TILE, authored), 'authored').toBe(false);
  });

  it('rings the tower under the cursor even with the toggle off', () => {
    const { w, tx, ty } = skewedWorld();
    const def = content.towerByKey.get('ballista')!;
    const s = w.structureAt(tx, ty)!;
    const { canvas, arcs } = recordingCanvas();
    new Renderer(canvas).draw(w, view({ showRanges: false, cursorX: tx + 0.5, cursorY: ty + 0.5 }));
    const r = effectiveTowerRange(w, def, s.tier) * TILE;
    expect(circleAt(arcs, (tx + 0.5) * TILE, (ty + 0.5) * TILE, r)).toBe(true);
  });

  it('previews splash and the dead zone when hovering a lob tower', () => {
    const { w, tx, ty } = skewedWorld('mortar');
    const def = content.towerByKey.get('mortar')!;
    const s = w.structureAt(tx, ty)!;
    const { canvas, arcs } = recordingCanvas();
    new Renderer(canvas).draw(w, view({ showRanges: false, cursorX: tx + 0.5, cursorY: ty + 0.5 }));

    const cx = (tx + 0.5) * TILE;
    const cy = (ty + 0.5) * TILE;
    expect(circleAt(arcs, cx, cy, effectiveTowerRange(w, def, s.tier) * TILE), 'range').toBe(true);
    expect(circleAt(arcs, cx, cy, effectiveTowerAoe(w, def) * TILE), 'splash').toBe(true);
    expect(circleAt(arcs, cx, cy, effectiveTowerMinRange(w, def) * TILE), 'dead zone').toBe(true);
    expect(effectiveTowerAoe(w, def)).not.toBeCloseTo(def.attack!.aoe!, 2);
  });

  it('the placement ghost previews effective range and splash', () => {
    const { w } = skewedWorld();
    const mortar = content.towerByKey.get('mortar')!;
    const tx = Math.floor(w.warden.x) + 1;
    const ty = Math.floor(w.warden.y) + 1;
    const { canvas, arcs } = recordingCanvas();
    new Renderer(canvas).draw(
      w,
      view({ selectedTower: mortar.id, cursorX: tx + 0.5, cursorY: ty + 0.5 }),
    );
    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    expect(circleAt(arcs, cx, cy, effectiveTowerRange(w, mortar) * TILE), 'range ring').toBe(true);
    expect(circleAt(arcs, cx, cy, effectiveTowerAoe(w, mortar) * TILE), 'splash preview').toBe(true);
    expect(circleAt(arcs, cx, cy, mortar.attack!.range * TILE), 'authored ring gone').toBe(false);
  });

  it('a dead structure gets no ring', () => {
    const { w, tx, ty } = skewedWorld();
    const def = content.towerByKey.get('ballista')!;
    const s = w.structureAt(tx, ty)!;
    const r = effectiveTowerRange(w, def, s.tier) * TILE;
    s.dead = true;
    const { canvas, arcs } = recordingCanvas();
    new Renderer(canvas).draw(w, view({ showRanges: true }));
    expect(circleAt(arcs, (tx + 0.5) * TILE, (ty + 0.5) * TILE, r)).toBe(false);
  });

  it('a petrified tower gets no ring — it cannot fire', () => {
    // At Dawn every structure is petrified, so this used to ring the whole board.
    const { w, tx, ty } = skewedWorld();
    const def = content.towerByKey.get('ballista')!;
    const s = w.structureAt(tx, ty)!;
    const r = effectiveTowerRange(w, def, s.tier) * TILE;

    const live = recordingCanvas();
    new Renderer(live.canvas).draw(w, view({ showRanges: true }));
    expect(circleAt(live.arcs, (tx + 0.5) * TILE, (ty + 0.5) * TILE, r), 'while live').toBe(true);

    s.petrified = true;
    const stone = recordingCanvas();
    new Renderer(stone.canvas).draw(w, view({ showRanges: true }));
    expect(circleAt(stone.arcs, (tx + 0.5) * TILE, (ty + 0.5) * TILE, r), 'petrified').toBe(false);
  });

  it('draws no rings after the Sundering, when there is nothing to place', () => {
    const { w, tx, ty } = skewedWorld();
    const def = content.towerByKey.get('ballista')!;
    const s = w.structureAt(tx, ty)!;
    const r = effectiveTowerRange(w, def, s.tier) * TILE;

    const day = recordingCanvas();
    new Renderer(day.canvas).draw(w, view({ showRanges: true }));
    expect(circleAt(day.arcs, (tx + 0.5) * TILE, (ty + 0.5) * TILE, r), 'during the Day').toBe(true);

    // The renderer's "night" is `huntsWarden`, which follows the phase.
    w.sundered = true;
    w.phase = 'act2';
    expect(w.huntsWarden, 'test setup must actually reach Night').toBe(true);
    const night = recordingCanvas();
    new Renderer(night.canvas).draw(w, view({ showRanges: true }));
    expect(circleAt(night.arcs, (tx + 0.5) * TILE, (ty + 0.5) * TILE, r), 'at Night').toBe(false);
  });

  it('an off-board or NaN cursor rings nothing and does not throw', () => {
    const { w } = skewedWorld();
    const cursors: [number, number][] = [
      [-1.5, 6.5],
      [999, 999],
      [Number.NaN, Number.NaN],
    ];
    for (const [cursorX, cursorY] of cursors) {
      const { canvas, arcs } = recordingCanvas();
      expect(() =>
        new Renderer(canvas).draw(w, view({ showRanges: false, cursorX, cursorY })),
      ).not.toThrow();
      expect(arcs.every((a) => Number.isFinite(a.r))).toBe(true);
    }
  });
});
