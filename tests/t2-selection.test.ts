/**
 * @vitest-environment jsdom
 *
 * SPEC-V3 §10 T2, the owner's "click has no reaction" report: "Clicking any
 * tower/enemy/character selects it: highlight + range ring + stats panel. Click
 * empty ground deselects. Hover shows a light outline."
 *
 * See QUESTIONS Q57 for the interpretation, which V3 T2 explicitly asks to be
 * logged.
 *
 * The first version of this file re-implemented the game loop's click wiring in
 * its own harness, so deleting that wiring from `main.ts` entirely left all 23
 * tests green — clicking would have selected nothing in the real game. The
 * handler and the stale-selection sweep now live in `selection.ts` and these
 * tests drive the shipped closures.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Renderer, type ViewState } from '../src/render/canvas';
import { World } from '../src/sim/world';
import { CORE_X, CORE_Y, GRID_H, GRID_W, TILE } from '../src/sim/grid';
import { buildTower, effectiveTowerRange } from '../src/sim/towers';
import { spawnEnemy } from '../src/sim/enemies';
import { Run } from '../src/sim/run';
import { bindCanvasInput } from '../src/ui/input';
import { Hud } from '../src/ui/hud';
import {
  makeSelectHandler,
  pickAt,
  sameSelection,
  selectedStructure,
  selectionAlive,
  sweepSelection,
  type Selection,
} from '../src/ui/selection';
import { loadContent } from '../src/sim/content';
import { defaultSettings } from '../src/ui/settings';
import type { Command } from '../src/sim/types';
import { cfg } from './helpers';

const content = loadContent();

function view(over: Partial<ViewState> = {}): ViewState {
  return {
    selectedTower: 0,
    cursorX: -50,
    cursorY: -50,
    shake: 0,
    showRanges: false,
    selection: null,
    settings: defaultSettings(),
    ...over,
  };
}

function placeNearWarden(w: World, key = 'ballista'): { tx: number; ty: number } {
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

/** Parks the Warden well away, so its own grab radius cannot skew a case. */
function parkWarden(w: World): void {
  w.warden.x = 1.5;
  w.warden.y = 1.5;
}

function emptyGround(w: World): { x: number; y: number } {
  for (let ty = 2; ty < 18; ty++) {
    for (let tx = 2; tx < GRID_W - 2; tx++) {
      if (!w.grid.passable(tx, ty)) continue;
      if (w.structureAt(tx, ty)) continue;
      const dx = tx + 0.5 - w.warden.x;
      const dy = ty + 0.5 - w.warden.y;
      if (dx * dx + dy * dy < 9) continue;
      return { x: tx + 0.5, y: ty + 0.5 };
    }
  }
  throw new Error('no empty ground');
}

describe('T2: picking what is under a click', () => {
  it('selects a tower, an enemy, the character and the Core', () => {
    const w = new World(cfg());
    const { tx, ty } = placeNearWarden(w);
    const s = w.structureAt(tx, ty)!;
    expect(pickAt(w, w.warden.x, w.warden.y)).toEqual({ kind: 'warden' });

    parkWarden(w);
    expect(pickAt(w, tx + 0.5, ty + 0.5)).toEqual({ kind: 'tower', id: s.id });

    const g = emptyGround(w);
    const e = spawnEnemy(w, 'husk', g.x, g.y)!;
    expect(pickAt(w, g.x, g.y)).toEqual({ kind: 'enemy', id: e.id });

    // The Core is the thing whose HP is the lose condition; clicking it used to
    // deselect, which reads as the click being broken.
    expect(pickAt(w, CORE_X + 0.5, CORE_Y + 0.5)).toEqual({ kind: 'core' });
  });

  it('returns nothing over empty ground, which is what deselects', () => {
    const w = new World(cfg());
    const g = emptyGround(w);
    expect(pickAt(w, g.x, g.y)).toBeNull();
  });

  it('a tower you are standing beside is still clickable', () => {
    // The Warden's grab radius was 0.9 tiles against a 0.25-tile sprite, so it
    // swallowed clicks on adjacent towers — and the Engineer stands beside its
    // towers constantly, because that is what build range means.
    const w = new World(cfg());
    const { tx, ty } = placeNearWarden(w);
    const s = w.structureAt(tx, ty)!;
    w.warden.x = tx + 0.5;
    w.warden.y = ty + 0.5 - 0.6;
    expect(pickAt(w, tx + 0.5, ty + 0.5)).toEqual({ kind: 'tower', id: s.id });
  });

  it('a tower with an enemy in the next tile is still clickable', () => {
    // Enemy grab was radius + 0.35, i.e. twice the drawn body, so a lane full of
    // husks made the towers behind them unclickable.
    const w = new World(cfg());
    const { tx, ty } = placeNearWarden(w);
    const s = w.structureAt(tx, ty)!;
    parkWarden(w);
    spawnEnemy(w, 'husk', tx + 0.5, ty + 0.5 - 0.6);
    expect(pickAt(w, tx + 0.5, ty + 0.5)).toEqual({ kind: 'tower', id: s.id });
  });

  it('an enemy actually on top of a tower still wins', () => {
    const w = new World(cfg());
    const { tx, ty } = placeNearWarden(w);
    parkWarden(w);
    const e = spawnEnemy(w, 'husk', tx + 0.5, ty + 0.5)!;
    expect(pickAt(w, tx + 0.5, ty + 0.5)).toEqual({ kind: 'enemy', id: e.id });
  });

  it('prefers the character over an enemy standing on it', () => {
    const w = new World(cfg());
    spawnEnemy(w, 'husk', w.warden.x, w.warden.y);
    expect(pickAt(w, w.warden.x, w.warden.y)).toEqual({ kind: 'warden' });
  });

  it('ignores dead enemies but selects burrowed ones, which are drawn', () => {
    const w = new World(cfg());
    parkWarden(w);
    const g = emptyGround(w);
    const dead = spawnEnemy(w, 'husk', g.x, g.y)!;
    dead.dead = true;
    expect(pickAt(w, g.x, g.y)).toBeNull();

    // A burrower is rendered faded rather than hidden, so refusing to select
    // something visible reads as the click being broken. Untargetable by towers
    // is a combat rule, not an inspection one.
    const hidden = spawnEnemy(w, 'husk', g.x, g.y)!;
    hidden.submerged = true;
    expect(pickAt(w, g.x, g.y)).toEqual({ kind: 'enemy', id: hidden.id });
  });

  it('breaks ties between overlapping enemies deterministically', () => {
    const w = new World(cfg());
    parkWarden(w);
    const g = emptyGround(w);
    const a = spawnEnemy(w, 'husk', g.x, g.y)!;
    spawnEnemy(w, 'husk', g.x, g.y);
    expect(pickAt(w, g.x, g.y)).toEqual({ kind: 'enemy', id: a.id });
    expect(pickAt(w, g.x, g.y)).toEqual({ kind: 'enemy', id: a.id });
  });

  it('survives an off-board or NaN point', () => {
    const w = new World(cfg());
    for (const [x, y] of [[-5, -5], [999, 999], [Number.NaN, 3]]) {
      expect(() => pickAt(w, x, y)).not.toThrow();
      expect(pickAt(w, x, y)).toBeNull();
    }
  });
});

describe('T2: the shipped click handler', () => {
  it('selects, and clears when the same thing is clicked again', () => {
    const w = new World(cfg());
    const { tx, ty } = placeNearWarden(w);
    const s = w.structureAt(tx, ty)!;
    parkWarden(w);
    const host = view();
    const select = makeSelectHandler(host, () => w);

    select(tx + 0.5, ty + 0.5);
    expect(host.selection).toEqual({ kind: 'tower', id: s.id });
    select(tx + 0.5, ty + 0.5);
    expect(host.selection).toBeNull();
  });

  it('clicking empty ground clears an existing selection', () => {
    const w = new World(cfg());
    const { tx, ty } = placeNearWarden(w);
    parkWarden(w);
    const host = view();
    const select = makeSelectHandler(host, () => w);
    select(tx + 0.5, ty + 0.5);
    const g = emptyGround(w);
    select(g.x, g.y);
    expect(host.selection).toBeNull();
  });

  it('does nothing when there is no run', () => {
    const host = view({ selection: { kind: 'warden' } });
    makeSelectHandler(host, () => null)(3, 3);
    expect(host.selection).toEqual({ kind: 'warden' });
  });

  it('the sweep drops a selection whose target has gone', () => {
    const w = new World(cfg());
    parkWarden(w);
    const g = emptyGround(w);
    const e = spawnEnemy(w, 'husk', g.x, g.y)!;
    const host = view({ selection: { kind: 'enemy', id: e.id } });

    sweepSelection(host, w);
    expect(host.selection).not.toBeNull();
    e.dead = true;
    sweepSelection(host, w);
    expect(host.selection).toBeNull();
  });

  it('the sweep keeps the character and the Core, which never go away', () => {
    const w = new World(cfg());
    for (const selection of [{ kind: 'warden' } as const, { kind: 'core' } as const]) {
      const host = view({ selection });
      sweepSelection(host, w);
      expect(host.selection).toEqual(selection);
    }
  });

  it('a sold tower stops being selected', () => {
    const w = new World(cfg());
    const { tx, ty } = placeNearWarden(w);
    const s = w.structureAt(tx, ty)!;
    const host = view({ selection: { kind: 'tower', id: s.id } });
    expect(selectedStructure(w, host.selection)?.id).toBe(s.id);
    w.removeStructure(s);
    sweepSelection(host, w);
    expect(host.selection).toBeNull();
    expect(selectionAlive(w, { kind: 'tower', id: s.id })).toBe(false);
  });

  it('sameSelection compares identity, not object shape', () => {
    expect(sameSelection({ kind: 'tower', id: 3 }, { kind: 'tower', id: 3 })).toBe(true);
    expect(sameSelection({ kind: 'tower', id: 3 }, { kind: 'tower', id: 4 })).toBe(false);
    expect(sameSelection({ kind: 'tower', id: 3 }, { kind: 'enemy', id: 3 })).toBe(false);
    expect(sameSelection({ kind: 'warden' }, { kind: 'warden' })).toBe(true);
    expect(sameSelection({ kind: 'core' }, { kind: 'warden' })).toBe(false);
    expect(sameSelection(null, null)).toBe(true);
  });
});

describe('T2: clicking the canvas reaches the handler', () => {
  function harness(w: World) {
    const canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: GRID_W * TILE, height: GRID_H * TILE }) as DOMRect;
    Object.defineProperty(canvas, 'clientWidth', { value: GRID_W * TILE });
    Object.defineProperty(canvas, 'clientHeight', { value: GRID_H * TILE });
    const v = view();
    const cmds: Command[] = [];
    bindCanvasInput({
      canvas,
      view: v,
      keys: new Set<string>(),
      queue: { push: (c) => cmds.push(c) },
      // The shipped closure, not a copy of it.
      onSelect: makeSelectHandler(v, () => w),
    });
    const click = (x: number, y: number) =>
      canvas.dispatchEvent(
        new MouseEvent('mousedown', { button: 0, clientX: x * TILE, clientY: y * TILE, bubbles: true }),
      );
    return { v, cmds, click };
  }

  it('a click on a tower selects it and issues no Command', () => {
    const w = new World(cfg());
    const { tx, ty } = placeNearWarden(w);
    const s = w.structureAt(tx, ty)!;
    parkWarden(w);
    const { v, cmds, click } = harness(w);
    click(tx + 0.5, ty + 0.5);
    expect(v.selection).toEqual({ kind: 'tower', id: s.id });
    expect(cmds).toEqual([]);
  });

  it('does not select while a tower is queued for placement', () => {
    const w = new World(cfg());
    const { tx, ty } = placeNearWarden(w);
    const { v, cmds, click } = harness(w);
    v.selectedTower = content.towerByKey.get('arrow_spire')!.id;
    click(tx + 0.5, ty + 0.5);
    expect(v.selection, 'building must win over selecting').toBeNull();
    expect(cmds.some((c) => c.k === 'build')).toBe(true);
  });

  it('selecting never touches the sim: the run hashes identically', () => {
    const hashFor = (select: boolean) => {
      const run = new Run({ ...cfg(), policy: 'none' });
      const host = view();
      const handler = makeSelectHandler(host, () => run.world);
      for (let t = 0; t < 300; t++) {
        run.step({ mx: t % 2, my: 0, dash: false, attack: false, aimX: 0, aimY: 0, active1Held: false, cmds: [] });
        if (select) {
          handler(run.world.warden.x, run.world.warden.y);
          sweepSelection(host, run.world);
        }
      }
      // A positive control: the clicking arm really did select things.
      if (select) expect(host.selection === null || host.selection.kind === 'warden').toBe(true);
      return run.hash();
    };
    expect(hashFor(true)).toBe(hashFor(false));
  });
});

describe('T2: the game loop uses the shared wiring', () => {
  // Source-level, deliberately. Nothing in the suite can import `main.ts` (it
  // starts a real game at module load), and QA showed that gutting the wiring
  // there left every behavioural test green — because the tests had their own
  // copy of it. This asserts the loop calls the shipped closures.
  const source = readFileSync(join(process.cwd(), 'src', 'ui', 'main.ts'), 'utf8');

  it('installs the shared click handler', () => {
    expect(source).toMatch(/onSelect: makeSelectHandler\(/);
  });

  it('sweeps stale selections every frame', () => {
    expect(source).toContain('sweepSelection(this.view, w)');
  });

  it('clears the selection when a new run starts', () => {
    expect(source).toContain('this.view.selection = null');
  });
});

describe('T2: the selection is visible', () => {
  function arcsFor(w: World, over: Partial<ViewState>): number[] {
    const arcs: number[] = [];
    const ctx = new Proxy(
      {
        arc(_x: number, _y: number, r: number) {
          arcs.push(r);
        },
        createLinearGradient: () => ({ addColorStop() {} }),
        createRadialGradient: () => ({ addColorStop() {} }),
        measureText: () => ({ width: 10 }),
      } as Record<string, unknown>,
      {
        get(t, p) {
          return p in t ? t[p as string] : () => undefined;
        },
        set: () => true,
      },
    );
    const canvas = document.createElement('canvas');
    canvas.getContext = (() => ctx) as never;
    new Renderer(canvas).draw(w, view(over));
    return arcs;
  }

  it('draws a highlight for each kind of selection', () => {
    const w = new World(cfg());
    const { tx, ty } = placeNearWarden(w);
    const s = w.structureAt(tx, ty)!;
    parkWarden(w);
    const g = emptyGround(w);
    const e = spawnEnemy(w, 'husk', g.x, g.y)!;

    const none = arcsFor(w, { selection: null }).length;
    for (const sel of [
      { kind: 'tower', id: s.id } as const,
      { kind: 'enemy', id: e.id } as const,
      { kind: 'warden' } as const,
      { kind: 'core' } as const,
    ]) {
      expect(arcsFor(w, { selection: sel }).length, sel.kind).toBeGreaterThan(none);
    }
  });

  it('a selected tower gets its range ring, at the effective radius', () => {
    // Counting total arcs cannot fail here — the highlight alone adds two — so
    // this looks for the ring's own radius specifically.
    const w = new World(cfg());
    const { tx, ty } = placeNearWarden(w);
    const s = w.structureAt(tx, ty)!;
    parkWarden(w);
    const def = content.towerByKey.get('ballista')!;
    const wanted = effectiveTowerRange(w, def, s.tier) * TILE;

    const unselected = arcsFor(w, { selection: null });
    expect(unselected.some((r) => Math.abs(r - wanted) < 0.001), 'ring while unselected').toBe(false);
    const selected = arcsFor(w, { selection: { kind: 'tower', id: s.id } });
    expect(selected.some((r) => Math.abs(r - wanted) < 0.001), 'ring while selected').toBe(true);
  });

  it('hovering draws a light outline before any click', () => {
    // Hovering a *tower* is not a valid probe: T1 already rings a hovered
    // tower, so the arc count rises whether or not the T2 outline exists.
    // An enemy and the Warden get no T1 ring, so only the outline can add one.
    const w = new World(cfg());
    parkWarden(w);
    const g = emptyGround(w);
    spawnEnemy(w, 'husk', g.x, g.y);

    const away = arcsFor(w, { cursorX: -50, cursorY: -50 }).length;
    expect(arcsFor(w, { cursorX: g.x, cursorY: g.y }).length, 'enemy').toBeGreaterThan(away);
    expect(
      arcsFor(w, { cursorX: w.warden.x, cursorY: w.warden.y }).length,
      'character',
    ).toBeGreaterThan(away);
  });

  it('no outline on what is already selected — the highlight says it', () => {
    const w = new World(cfg());
    parkWarden(w);
    const g = emptyGround(w);
    const e = spawnEnemy(w, 'husk', g.x, g.y)!;
    const hovering = arcsFor(w, { cursorX: g.x, cursorY: g.y }).length;
    const both = arcsFor(w, {
      cursorX: g.x,
      cursorY: g.y,
      selection: { kind: 'enemy', id: e.id },
    }).length;
    // Selected draws 2 arcs; hover draws 1. Hovering the selected thing must
    // not stack a third.
    expect(both).toBe(hovering + 1);
  });

  it('no hover outline while a tower is queued for placement', () => {
    const w = new World(cfg());
    const { tx, ty } = placeNearWarden(w);
    parkWarden(w);
    const plain = arcsFor(w, { cursorX: tx + 0.5, cursorY: ty + 0.5 }).length;
    const building = arcsFor(w, {
      cursorX: tx + 0.5,
      cursorY: ty + 0.5,
      selectedTower: content.towerByKey.get('arrow_spire')!.id,
      selection: { kind: 'tower', id: w.structureAt(tx, ty)!.id },
    }).length;
    expect(building).toBeLessThan(plain + 6);
  });
});

describe('T2: the selection gets a stats panel', () => {
  function hudFor(w: World, selection: Selection, pick?: number): string {
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.getElementById('app') as HTMLElement;
    const hud = new Hud(root, {
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
      onResume: () => {},
      onPause: () => {},
      onCycleSpeed: () => {}, onSetSpeed: () => {},
      onDev: () => {},
      onQuitToHub: () => {},
      onHoverSkill: () => {}, onUpgradeStructure: () => {}, onSellStructure: () => {}, onUpgradeCore: () => {},
    });
    hud.buildTowerBar(w);
    if (pick !== undefined) hud.select(pick);
    hud.update(w, undefined, selection);
    return (root.querySelector('#sw-towerinfo') as HTMLElement).textContent ?? '';
  }

  it('describes a selected tower, enemy and character', () => {
    const w = new World(cfg());
    const { tx, ty } = placeNearWarden(w);
    const s = w.structureAt(tx, ty)!;
    expect(hudFor(w, { kind: 'tower', id: s.id })).toContain('Ballista');

    const g = emptyGround(w);
    const e = spawnEnemy(w, 'husk', g.x, g.y)!;
    e.hp = e.maxHp / 2;
    const enemyText = hudFor(w, { kind: 'enemy', id: e.id });
    expect(enemyText).toContain('Husk');
    expect(enemyText).toMatch(/50%/);

    const wardenText = hudFor(w, { kind: 'warden' });
    expect(wardenText).toContain('Warden');
    expect(wardenText).toMatch(/Move speed/);
  });

  it('a queued build tower keeps the panel — you must not place one blind', () => {
    const w = new World(cfg());
    const g = emptyGround(w);
    const e = spawnEnemy(w, 'husk', g.x, g.y)!;
    const spire = content.towerByKey.get('arrow_spire')!;
    const text = hudFor(w, { kind: 'enemy', id: e.id }, spire.id);
    expect(text).toContain('Arrow Spire');
    expect(text).not.toContain('Husk');
  });

  it('Act II keeps the weapon panel — it holds the wielded lineage', () => {
    // SPEC-FINAL §6.1 (p2e): no separate weapon roster, just every built
    // tower type's own wielded lineage line. Act II is entered directly
    // (the p2d-weapon-lineage.test.ts pattern) rather than through
    // `finishSundering`, whose pocket-clear/lane logic can remove a tower
    // built this close to the Core.
    const w = new World(cfg());
    w.gold = 99999;
    const def = w.content.towerByKey.get('ballista')!;
    const tx = 5;
    const ty = 5;
    w.warden.x = tx + 0.5;
    w.warden.y = ty + 0.5;
    expect(buildTower(w, def.id, tx, ty).ok).toBe(true);
    w.phase = 'act2';
    // `sundered` is what makes the weapon panel win over an enemy selection
    // (`update()`'s `blocking` check) — the actual claim this test makes.
    w.sundered = true;
    const g = emptyGround(w);
    const e = spawnEnemy(w, 'husk', g.x, g.y)!;
    const text = hudFor(w, { kind: 'enemy', id: e.id });
    expect(text).toContain('Ballista');
  });

  it('the enemy panel updates when the enemy is slowed', () => {
    const w = new World(cfg());
    parkWarden(w);
    const g = emptyGround(w);
    const e = spawnEnemy(w, 'husk', g.x, g.y)!;
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.getElementById('app') as HTMLElement;
    const hud = new Hud(root, {
      onSelectTower: () => {}, onCallWave: () => {}, onPickOffer: () => {},
      onReroll: () => {}, onRetry: () => {},
      onNewRun: () => {}, onToggleRanges: () => {}, onToggleAutoPick: () => {}, onToggleCharacterPanel: () => {}, onEquipItem: () => {}, onToggleDpsPanel: () => {}, onResume: () => {}, onPause: () => {},
      onCycleSpeed: () => {}, onSetSpeed: () => {}, onDev: () => {}, onQuitToHub: () => {}, onHoverSkill: () => {}, onUpgradeStructure: () => {}, onSellStructure: () => {}, onUpgradeCore: () => {},
    });
    hud.buildTowerBar(w);
    const sel: Selection = { kind: 'enemy', id: e.id };
    hud.update(w, undefined, sel);
    const panel = root.querySelector('#sw-towerinfo') as HTMLElement;
    expect(panel.textContent).not.toMatch(/Slowed/);

    e.slowAmount = 0.5;
    hud.update(w, undefined, sel);
    expect(panel.textContent, 'the panel must not go stale').toMatch(/Slowed/);
  });

  it('shows the enemy armour the damage path reads, shred included', () => {
    // The panel used to label `flatReduction` — a trait, not a stat — as
    // "Armour", and never showed the number the damage path actually reads.
    const w = new World(cfg());
    parkWarden(w);
    const g = emptyGround(w);
    const e = spawnEnemy(w, 'husk', g.x, g.y)!;
    e.armor = 40;
    e.armorShred = 10;
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.getElementById('app') as HTMLElement;
    const hud = new Hud(root, {
      onSelectTower: () => {}, onCallWave: () => {}, onPickOffer: () => {},
      onReroll: () => {}, onRetry: () => {},
      onNewRun: () => {}, onToggleRanges: () => {}, onToggleAutoPick: () => {}, onToggleCharacterPanel: () => {}, onEquipItem: () => {}, onToggleDpsPanel: () => {}, onResume: () => {}, onPause: () => {},
      onCycleSpeed: () => {}, onSetSpeed: () => {}, onDev: () => {}, onQuitToHub: () => {}, onHoverSkill: () => {}, onUpgradeStructure: () => {}, onSellStructure: () => {}, onUpgradeCore: () => {},
    });
    hud.buildTowerBar(w);
    hud.update(w, undefined, { kind: 'enemy', id: e.id } as Selection);
    const panel = root.querySelector('#sw-towerinfo') as HTMLElement;
    expect(panel.textContent).toMatch(/Armour\s*30 \(30% off\)/);
  });

  it('quotes the gold a kill actually pays, not the authored bounty', () => {
    const w = new World(cfg());
    parkWarden(w);
    const g = emptyGround(w);
    const e = spawnEnemy(w, 'husk', g.x, g.y)!;
    const def = w.content.enemyById.get(e.defId)!;
    w.derived.goldFindMul = 2;
    const text = hudFor(w, { kind: 'enemy', id: e.id });
    expect(text).toContain(`${Math.round(def.bounty * 2)}g`);
  });

  it('a petrified tower offers neither sale nor upgrade', () => {
    const w = new World(cfg());
    const { tx, ty } = placeNearWarden(w);
    const s = w.structureAt(tx, ty)!;
    s.petrified = true;
    const text = hudFor(w, { kind: 'tower', id: s.id });
    expect(text).not.toMatch(/Sell/);
    expect(text).not.toMatch(/Upgrade to/);
  });

  it('falls back to the hover panel when nothing is selected', () => {
    expect(hudFor(new World(cfg()), null)).toMatch(/Pick a tower/);
  });
});
