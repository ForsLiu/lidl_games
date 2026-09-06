/**
 * @vitest-environment jsdom
 *
 * fb158 (owner feedback `ui-enemy-attack-indicators`, render half; blocked
 * on and following main-lane fb155, which authored `EnemyDef.attackKind`/
 * `attackRange`/`specialRange`): a small icon near every enemy's HP bar per
 * attack kind, an attack-range ring on hover and on selection (an elite/boss
 * also rings its `specialRange` once selected), and the Codex enemy pages
 * carrying the same icon and numbers. Every number here reads off the real
 * `EnemyDef` fields fb155 authored, never re-derived from `traits` — the
 * same posture `fb029-character-range-ring.test.ts` takes for the character
 * ring.
 */
import { describe, expect, it } from 'vitest';

import { Renderer, type ViewState } from '../src/render/canvas';
import { World } from '../src/sim/world';
import { TILE } from '../src/sim/grid';
import { loadContent } from '../src/sim/content';
import { spawnEnemy } from '../src/sim/enemies';
import { ATTACK_KIND_COLORS, attackKindIconShape } from '../src/render/theme';
import { defaultSettings } from '../src/ui/settings';
import { enemyInfoMarkup } from '../src/ui/hud';
import { enemyAttackDescription, enemyAttackIconMarkup, enemyAttackMarkup } from '../src/ui/enemy-info';
import { trimNum } from '../src/ui/info-format';
import { buildCodexCollections } from '../src/ui/codex-collections';
import { cfg } from './helpers';

const content = loadContent();

interface Arc {
  x: number;
  y: number;
  r: number;
  fillStyle: string;
  strokeStyle: string;
  globalAlpha: number;
  filled: boolean;
  dashed: boolean;
}

/**
 * Records every `arc()` call along with the style state active when it was
 * drawn (and whether the following call was `fill()` or `stroke()`) — same
 * technique `fb005-damage-colors.test.ts` uses for `fillText`, extended to
 * also track `setLineDash` so a dashed special-range ring is distinguishable
 * from a solid one.
 */
function recordingCanvas(): { canvas: HTMLCanvasElement; arcs: Arc[] } {
  const arcs: Arc[] = [];
  let fillStyle = '';
  let strokeStyle = '';
  let globalAlpha = 1;
  let dashed = false;
  let pending: Omit<Arc, 'filled'> | null = null;
  const ctx = new Proxy(
    {
      arc(x: number, y: number, r: number) {
        pending = { x, y, r, fillStyle, strokeStyle, globalAlpha, dashed };
      },
      fill() {
        if (pending) arcs.push({ ...pending, filled: true });
        pending = null;
      },
      stroke() {
        if (pending) arcs.push({ ...pending, filled: false });
        pending = null;
      },
      setLineDash(segs: number[]) {
        dashed = segs.length > 0;
      },
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
      measureText: () => ({ width: 10 }),
    } as Record<string, unknown>,
    {
      get(target, prop) {
        if (prop === 'fillStyle') return fillStyle;
        if (prop === 'strokeStyle') return strokeStyle;
        if (prop === 'globalAlpha') return globalAlpha;
        if (prop in target) return target[prop as string];
        return () => undefined;
      },
      set(_target, prop, value) {
        if (prop === 'fillStyle') fillStyle = value as string;
        else if (prop === 'strokeStyle') strokeStyle = value as string;
        else if (prop === 'globalAlpha') globalAlpha = value as number;
        return true;
      },
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

function circleAt(arcs: Arc[], x: number, y: number, r: number): Arc[] {
  return arcs.filter((a) => Math.abs(a.x - x) < 0.01 && Math.abs(a.y - y) < 0.01 && Math.abs(a.r - r) < 0.01);
}

describe('fb158: every enemy always shows its attack-kind icon', () => {
  it('draws a distinctly-shaped/colored icon marker for every one of the 20 enemy kinds', () => {
    const w = new World(cfg());
    let x = 3;
    for (const def of content.enemies.enemies) {
      spawnEnemy(w, def.key, x, 3);
      x += 2;
    }
    const { canvas, arcs } = recordingCanvas();
    new Renderer(canvas).draw(w, view());

    for (const e of w.enemies) {
      const def = w.content.enemyById.get(e.defId)!;
      const r = Math.max(3, e.radius * TILE);
      const px = e.x * TILE;
      const py = e.y * TILE;
      const ix = px + r + 5;
      const iy = py - r - 4.5;
      const shape = attackKindIconShape(def.attackKind);
      const expectedR = shape.big ? 4.5 : 3;
      const hits = circleAt(arcs, ix, iy, expectedR);
      expect(hits.length, `${def.key} (${def.attackKind}) icon`).toBeGreaterThan(0);
      const hit = hits[hits.length - 1];
      expect(hit.filled, `${def.key} filled-vs-ring`).toBe(shape.filled);
      expect(
        hit.filled ? hit.fillStyle : hit.strokeStyle,
        `${def.key} color`,
      ).toBe(ATTACK_KIND_COLORS[def.attackKind]);
      expect(hit.globalAlpha, `${def.key} alpha`).toBeCloseTo(shape.faded ? 0.55 : 1, 5);
    }
  });

  it('every kind maps to a unique (filled, big, faded) shape triple', () => {
    const kinds = ['melee', 'ranged', 'bomber', 'healer', 'buffer', 'burrower', 'phaser'];
    const seen = new Set<string>();
    for (const k of kinds) {
      const s = attackKindIconShape(k);
      const key = `${s.filled}:${s.big}:${s.faded}`;
      expect(seen.has(key), `${k} shape collides with an earlier kind`).toBe(false);
      seen.add(key);
    }
  });
});

describe('fb158: the attack-range ring draws on hover and on selection', () => {
  it('a hovered enemy rings its own attackRange, not drawn when nothing is hovered', () => {
    const w = new World(cfg());
    const e = spawnEnemy(w, 'spitter', 10, 10)!; // ranged, attackRange 4
    const def = content.enemyByKey.get('spitter')!;
    const cx = e.x * TILE;
    const cy = e.y * TILE;
    const expectedR = def.attackRange * TILE;

    const { canvas: c1, arcs: a1 } = recordingCanvas();
    new Renderer(c1).draw(w, view({ cursorX: e.x, cursorY: e.y }));
    expect(circleAt(a1, cx, cy, expectedR).length, 'hovered ring').toBeGreaterThan(0);

    const { canvas: c2, arcs: a2 } = recordingCanvas();
    new Renderer(c2).draw(w, view({ cursorX: -5, cursorY: -5 }));
    expect(circleAt(a2, cx, cy, expectedR).length, 'no ring when not hovered/selected').toBe(0);
  });

  it('a selected enemy rings its own attackRange at the bolder selected style', () => {
    const w = new World(cfg());
    const e = spawnEnemy(w, 'husk', 10, 10)!; // melee, attackRange 0.8
    const def = content.enemyByKey.get('husk')!;
    const cx = e.x * TILE;
    const cy = e.y * TILE;
    const expectedR = def.attackRange * TILE;

    const { canvas, arcs } = recordingCanvas();
    new Renderer(canvas).draw(w, view({ selection: { kind: 'enemy', id: e.id } }));
    const hits = circleAt(arcs, cx, cy, expectedR);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[hits.length - 1].globalAlpha).toBeCloseTo(0.85, 5);
  });

  it("a non-elite enemy's specialRange never rings, even selected", () => {
    const w = new World(cfg());
    const e = spawnEnemy(w, 'bomber', 10, 10)!; // has a specialRange but is not elite/boss
    const def = content.enemyByKey.get('bomber')!;
    expect(def.specialRange).toBeDefined();
    expect(e.elite).toBe(false);
    expect(e.boss).toBe(false);
    const cx = e.x * TILE;
    const cy = e.y * TILE;

    const { canvas, arcs } = recordingCanvas();
    new Renderer(canvas).draw(w, view({ selection: { kind: 'enemy', id: e.id } }));
    expect(circleAt(arcs, cx, cy, def.specialRange! * TILE).length).toBe(0);
  });

  it("selecting an elite rings both its attackRange and its dashed specialRange; hovering alone does not", () => {
    const w = new World(cfg());
    const e = spawnEnemy(w, 'colossus', 10, 10)!;
    const def = content.enemyByKey.get('colossus')!;
    expect(e.elite).toBe(true);
    expect(def.specialRange).toBeDefined();
    const cx = e.x * TILE;
    const cy = e.y * TILE;

    // Hover only: the base attackRange ring shows, the special one does not.
    const { canvas: c1, arcs: a1 } = recordingCanvas();
    new Renderer(c1).draw(w, view({ cursorX: e.x, cursorY: e.y }));
    expect(circleAt(a1, cx, cy, def.attackRange * TILE).length, 'hover base ring').toBeGreaterThan(0);
    expect(circleAt(a1, cx, cy, def.specialRange! * TILE).length, 'hover must not ring special range').toBe(0);

    // Selected: both ring, and the special one is dashed.
    const { canvas: c2, arcs: a2 } = recordingCanvas();
    new Renderer(c2).draw(w, view({ selection: { kind: 'enemy', id: e.id } }));
    expect(circleAt(a2, cx, cy, def.attackRange * TILE).length, 'selected base ring').toBeGreaterThan(0);
    const specialHits = circleAt(a2, cx, cy, def.specialRange! * TILE);
    expect(specialHits.length, 'selected special ring').toBeGreaterThan(0);
    expect(specialHits[specialHits.length - 1].dashed, 'special ring is dashed').toBe(true);
  });
});

describe('fb158: enemy info panel and Codex show the same icon and numbers', () => {
  it("enemyInfoMarkup's Attack row names the kind and the real attackRange number", () => {
    const w = new World(cfg());
    const e = spawnEnemy(w, 'colossus', 10, 10)!;
    const def = content.enemyByKey.get('colossus')!;
    const html = enemyInfoMarkup(w, e);
    expect(html).toContain('Attack');
    expect(html).toContain(enemyAttackDescription(def));
    expect(html).toContain('sw-atk-icon');
  });

  it('enemyAttackDescription names melee/ranged plainly and adds a special-range clause only when authored', () => {
    const husk = content.enemyByKey.get('husk')!;
    const spitter = content.enemyByKey.get('spitter')!;
    const colossus = content.enemyByKey.get('colossus')!;
    // Expected numbers go through `trimNum` too (same 1-decimal rounding the
    // formatter itself uses) rather than the raw field, which can carry more
    // precision than the description prints (colossus.attackRange is 1.15).
    expect(enemyAttackDescription(husk)).toBe(`Melee, ${trimNum(husk.attackRange, 1)} tiles`);
    expect(enemyAttackDescription(spitter)).toBe(`Ranged, ${trimNum(spitter.attackRange, 1)} tiles`);
    expect(enemyAttackDescription(colossus)).toBe(
      `Melee, ${trimNum(colossus.attackRange, 1)} tiles (special ${trimNum(colossus.specialRange!, 1)} tiles)`,
    );
  });

  it('enemyAttackIconMarkup carries a distinct color per attack kind, sourced from ATTACK_KIND_COLORS', () => {
    for (const def of content.enemies.enemies) {
      const html = enemyAttackIconMarkup(def);
      expect(html, def.key).toContain(`--atk-color:${ATTACK_KIND_COLORS[def.attackKind]}`);
    }
  });

  it("the Codex enemies collection's renderDetail shows the same icon+description enemyAttackMarkup produces", () => {
    const collections = buildCodexCollections(content);
    const enemies = collections.find((c) => c.key === 'enemies')!;
    expect(enemies.renderDetail).toBeDefined();
    for (const row of enemies.rows) {
      const html = enemies.renderDetail!(row);
      expect(html).toBe(enemyAttackMarkup(row as never));
    }
  });
});
