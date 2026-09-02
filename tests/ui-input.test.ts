/**
 * @vitest-environment jsdom
 *
 * Regression tests for the browser input path (playtest report, 2026-08-25):
 *   - the modal overlay stayed in the layout when "hidden", so it swallowed
 *     every click on the canvas and blurred the whole game through its
 *     backdrop-filter;
 *   - Constellation right-click appeared to do nothing when the account could
 *     not afford the respec, because affordability was checked inside `refund`
 *     rather than in `canRefund`.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { Hud } from '../src/ui/hud';
import { Renderer } from '../src/render/canvas';
import { GRID_H, GRID_W, TILE } from '../src/sim/grid';
import { bindCanvasInput, makeKeyDownHandler, pointerToTile } from '../src/ui/input';
import { Hub } from '../src/ui/hub';
import { World } from '../src/sim/world';
import { canRefund, defaultMeta, allocate, refund } from '../src/meta/meta';
import { loadContent } from '../src/sim/content';
import { defaultSettings } from '../src/ui/settings';
import type { Command, MetaState } from '../src/sim/types';
import { cfg } from './helpers';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

/** Mounts the real stylesheet so computed styles reflect what a player sees. */
function mount(): HTMLElement {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  return document.getElementById('app') as HTMLElement;
}

function noopHudCallbacks(pending: Command[]) {
  return {
    onSelectTower: () => {},
    onCallWave: () => pending.push({ k: 'call' }),
    onPickOffer: (index: number) => pending.push({ k: 'pick', index }),
    onReroll: () => pending.push({ k: 'reroll' }),
    onRetry: () => {},
    onNewRun: () => {},
    onToggleRanges: () => {},
    onToggleAutoPick: () => {},
    onToggleCharacterPanel: () => {},
    onEquipItem: () => {},
    onToggleDpsPanel: () => {},
    onResume: () => {},
    onPause: () => {},
    onCycleSpeed: () => {},
    onDev: () => {},
    onQuitToHub: () => {},
    onHoverSkill: () => {}, onUpgradeStructure: () => {}, onSellStructure: () => {}, onUpgradeCore: () => {},
  };
}

describe('the modal overlay does not sit on top of the game', () => {
  let root: HTMLElement;
  let hud: Hud;
  let world: World;

  beforeEach(() => {
    root = mount();
    hud = new Hud(root, noopHudCallbacks([]));
    world = new World(cfg());
    hud.buildTowerBar(world);
  });

  it('is out of the layout during ordinary play', () => {
    // act1_build is not a modal phase, so nothing should be over the canvas.
    hud.syncModal(world);
    const modal = root.querySelector('#sw-modal') as HTMLElement;
    expect(modal.hasAttribute('hidden')).toBe(true);
    expect(getComputedStyle(modal).display).toBe('none');
  });

  it('still shows when the run actually needs a choice', () => {
    world.phase = 'results';
    world.outcome = 'defeat_core';
    hud.syncModal(world);
    const modal = root.querySelector('#sw-modal') as HTMLElement;
    expect(modal.hasAttribute('hidden')).toBe(false);
    expect(getComputedStyle(modal).display).not.toBe('none');
    expect(modal.textContent).toContain('Core');
  });

  it('goes away again once the choice is taken', () => {
    world.phase = 'levelup';
    world.offers = [{ kind: 'boon', key: 'power', name: 'Power', desc: '', toLevel: 1 }];
    hud.syncModal(world);
    expect((root.querySelector('#sw-modal') as HTMLElement).hasAttribute('hidden')).toBe(false);

    world.phase = 'act2';
    world.offers = [];
    hud.syncModal(world);
    const modal = root.querySelector('#sw-modal') as HTMLElement;
    expect(modal.hasAttribute('hidden')).toBe(true);
    expect(getComputedStyle(modal).display).toBe('none');
  });

  it('never blurs or tints the canvas while the overlay is hidden', () => {
    hud.syncModal(world);
    const modal = root.querySelector('#sw-modal') as HTMLElement;
    const style = getComputedStyle(modal);
    // A hidden overlay must contribute no backdrop effect at all.
    expect(style.display).toBe('none');
    expect(modal.innerHTML).toBe('');
  });
});

/**
 * jsdom's cascade is not a browser's: it resolved `hidden` correctly even while
 * the shipped CSS did not. So the invariant is checked against the stylesheet
 * itself - this is the assertion that actually reproduces the playtest bug.
 */
describe('the overlay stylesheet cannot lose the cascade', () => {
  interface DisplayRule {
    selector: string;
    value: string;
    important: boolean;
  }

  /** Rough CSS specificity: ids, then classes/attributes/pseudo-classes. */
  function specificity(selector: string): number {
    let ids = 0;
    let classes = 0;
    for (let i = 0; i < selector.length; i++) {
      const ch = selector[i];
      if (ch === '#') ids++;
      else if (ch === '.' || ch === '[' || ch === ':') classes++;
    }
    return ids * 100 + classes;
  }

  /** Declared value of one property inside a rule body, or null. */
  function declared(body: string, property: string): string | null {
    for (const part of body.split(';')) {
      const colon = part.indexOf(':');
      if (colon < 0) continue;
      if (part.slice(0, colon).trim().toLowerCase() !== property) continue;
      return part.slice(colon + 1).trim();
    }
    return null;
  }

  /** Every selector mentioning .sw-modal that sets `display`. */
  function displayRules(): DisplayRule[] {
    const out: DisplayRule[] = [];
    for (const chunk of CSS.split('}')) {
      const brace = chunk.indexOf('{');
      if (brace < 0) continue;
      const selectorList = chunk.slice(0, brace);
      const body = chunk.slice(brace + 1);
      if (!selectorList.includes('.sw-modal')) continue;
      const value = declared(body, 'display');
      if (value === null) continue;
      for (const selector of selectorList.split(',')) {
        if (!selector.includes('.sw-modal')) continue;
        out.push({
          selector: selector.trim(),
          value: value.replace('!important', '').trim(),
          important: value.includes('!important'),
        });
      }
    }
    return out;
  }

  /** Body of the rule whose selector list contains `.sw-modal[hidden]`. */
  function hiddenRuleBody(): string | null {
    for (const chunk of CSS.split('}')) {
      const brace = chunk.indexOf('{');
      if (brace < 0) continue;
      if (!chunk.slice(0, brace).includes('.sw-modal[hidden]')) continue;
      return chunk.slice(brace + 1);
    }
    return null;
  }

  it('hides the overlay with a rule that outranks the one that shows it', () => {
    const rules = displayRules();
    const showing = rules.filter((r) => r.value !== 'none');
    const hiding = rules.filter((r) => r.value === 'none' && r.selector.includes('[hidden]'));

    expect(showing.length, 'expected a base .sw-modal display rule').toBeGreaterThan(0);
    expect(hiding.length, 'expected a .sw-modal[hidden] rule that hides it').toBeGreaterThan(0);

    for (const show of showing) {
      const beaten = hiding.some(
        (hide) => hide.important || specificity(hide.selector) > specificity(show.selector),
      );
      const why =
        `"${show.selector} { display: ${show.value} }" is not overridden when hidden, ` +
        'so the overlay would sit over the canvas';
      expect(beaten, why).toBe(true);
    }
  });

  it('stops a hidden overlay taking pointer events or blurring the canvas', () => {
    const body = hiddenRuleBody();
    expect(body, 'no .sw-modal[hidden] rule found').not.toBeNull();
    expect(declared(body as string, 'pointer-events')).toBe('none');
    expect(declared(body as string, 'backdrop-filter')).toBe('none');
  });
});

describe('Constellation refund (SPEC 8.1)', () => {
  const content = loadContent();

  /**
   * Hand-built rather than reached through `allocate`: with `respecCostPerNode`
   * now 1 (Q46, the same currency `allocate` spends), a node reached through
   * ordinary play can never actually go "broke" for its own refund — refunding
   * it both frees the slot `allocate` consumed and pays the fee from the same
   * pool, so the two exactly cancel. A `skillPoints` short of `respecCostPerNode`
   * is still a real state (e.g. mid-migration, or `TREE_AUTO_MAX` flipping off
   * under an account that never had this many points), so `refundBlocker`'s
   * cost branch is tested directly against a constructed one.
   */
  function metaWithOneNode(skillPoints: number): MetaState {
    const first = content.treeById.get(0)!.links[0];
    return { ...defaultMeta(), skillPoints, allocated: [0, first] };
  }

  it('reports a node as refundable only when the skill points are there', () => {
    const cost = content.tree.respecCostPerNode;
    const node = content.treeById.get(0)!.links[0];

    const broke = metaWithOneNode(Math.max(0, cost - 1));
    expect(canRefund(broke, node)).toBe(false);

    const flush = metaWithOneNode(cost);
    expect(canRefund(flush, node)).toBe(true);
  });

  // fb014 (Q134, SPEC-FINAL §8.3 temporary supersede): right-click refund is
  // disabled in the Hub tree UI while every node counts as allocated for
  // actual play (TREE_AUTO_MAX, src/meta/meta.ts). Re-enable if that flips
  // back to false.
  it.skip('actually refunds on right-click when affordable', () => {
    const root = mount();
    const cost = content.tree.respecCostPerNode;
    let meta = metaWithOneNode(cost + 10);
    const node = content.treeById.get(0)!.links[0];

    const hub = new Hub(root, meta, 1, {
      settings: defaultSettings(),
      onStart: () => {},
      onMetaChanged: (m) => (meta = m),
      onSettingsChanged: () => {},
    });
    hub.show();
    hub.openTab('tree');

    const el = root.querySelector(`[data-node="${node}"]`) as SVGCircleElement;
    expect(el).not.toBeNull();
    el.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

    expect(meta.allocated).not.toContain(node);
    expect(meta.skillPoints).toBe(cost + 10 - cost);
  });

  // fb014: same reason as the skip above — right-click refund UI is off.
  it.skip('leaves the node alone and says why when the skill points are short', () => {
    const root = mount();
    const cost = content.tree.respecCostPerNode;
    let meta = metaWithOneNode(Math.max(0, cost - 1));
    const node = content.treeById.get(0)!.links[0];

    const hub = new Hub(root, meta, 1, {
      settings: defaultSettings(),
      onStart: () => {},
      onMetaChanged: (m) => (meta = m),
      onSettingsChanged: () => {},
    });
    hub.show();
    hub.openTab('tree');

    const el = root.querySelector(`[data-node="${node}"]`) as SVGCircleElement;
    el.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

    expect(meta.allocated).toContain(node);
    // The player must be told why nothing happened.
    expect(root.textContent).toMatch(/skill point/i);
  });

  it('suppresses the browser context menu over the tree', () => {
    const root = mount();
    const meta = metaWithOneNode(100);
    const hub = new Hub(root, meta, 1, {
      settings: defaultSettings(),
      onStart: () => {},
      onMetaChanged: () => {},
      onSettingsChanged: () => {},
    });
    hub.show();
    hub.openTab('tree');

    const svg = root.querySelector('.sw-tree') as SVGElement;
    const evt = new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    svg.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
  });

  it('refuses a refund that would orphan a downstream node, whatever the skill points', () => {
    const a = content.treeById.get(0)!.links[0];
    const b = content.treeById.get(a)!.links.find((l) => l !== 0)!;
    let meta = { ...defaultMeta(), skillPoints: 10 };
    meta = allocate(meta, a);
    meta = allocate(meta, b);
    expect(canRefund(meta, a)).toBe(false);
    expect(refund(meta, a).allocated).toContain(a);
  });
});

describe('canvas clicks reach the game', () => {
  /** A canvas with a known CSS box, since jsdom does no layout. */
  function fakeCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', { value: 1152, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { value: 640, configurable: true });
    canvas.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 1152, height: 640, right: 1152, bottom: 640, x: 0, y: 0 }) as DOMRect;
    document.body.appendChild(canvas);
    return canvas;
  }

  function click(canvas: HTMLCanvasElement, button: number, x: number, y: number, shiftKey = false) {
    canvas.dispatchEvent(
      new window.MouseEvent('mousedown', { button, clientX: x, clientY: y, shiftKey, bubbles: true }),
    );
  }

  it('builds the selected tower on left click', () => {
    mount();
    const canvas = fakeCanvas();
    const queue: Command[] = [];
    const view = { selectedTower: 2, cursorX: 0, cursorY: 0 };
    bindCanvasInput({ canvas, view, keys: new Set(), queue: { push: (c) => queue.push(c) } });

    click(canvas, 0, 32 * 5 + 4, 32 * 7 + 4);
    expect(queue).toEqual([{ k: 'build', tower: 2, tx: 5, ty: 7 }]);
  });

  it('builds even when the click arrives without a prior mousemove', () => {
    mount();
    const canvas = fakeCanvas();
    const queue: Command[] = [];
    // cursor still at its initial 0,0 - a touchpad tap does this.
    const view = { selectedTower: 3, cursorX: 0, cursorY: 0 };
    bindCanvasInput({ canvas, view, keys: new Set(), queue: { push: (c) => queue.push(c) } });

    click(canvas, 0, 32 * 11 + 1, 32 * 4 + 1);
    expect(queue).toEqual([{ k: 'build', tower: 3, tx: 11, ty: 4 }]);
  });

  it('sells on right click and suppresses the browser menu', () => {
    mount();
    const canvas = fakeCanvas();
    const queue: Command[] = [];
    const view = { selectedTower: 0, cursorX: 0, cursorY: 0 };
    bindCanvasInput({ canvas, view, keys: new Set(), queue: { push: (c) => queue.push(c) } });

    click(canvas, 2, 32 * 9 + 8, 32 * 3 + 8);
    expect(queue).toEqual([{ k: 'sell', tx: 9, ty: 3 }]);

    const evt = new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    canvas.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
  });

  it('upgrades with U or Shift held', () => {
    mount();
    const canvas = fakeCanvas();
    const queue: Command[] = [];
    const view = { selectedTower: 2, cursorX: 0, cursorY: 0 };
    const keys = new Set<string>(['u']);
    bindCanvasInput({ canvas, view, keys, queue: { push: (c) => queue.push(c) } });

    click(canvas, 0, 32 * 6, 32 * 6);
    expect(queue).toEqual([{ k: 'upgrade', tx: 6, ty: 6 }]);

    keys.clear();
    queue.length = 0;
    click(canvas, 0, 32 * 6, 32 * 6, true);
    expect(queue).toEqual([{ k: 'upgrade', tx: 6, ty: 6 }]);
  });

  it('ignores clicks while an overlay owns input', () => {
    mount();
    const canvas = fakeCanvas();
    const queue: Command[] = [];
    const view = { selectedTower: 2, cursorX: 0, cursorY: 0 };
    let blocked = true;
    bindCanvasInput({
      canvas,
      view,
      keys: new Set(),
      queue: { push: (c) => queue.push(c) },
      isBlocked: () => blocked,
    });

    click(canvas, 0, 64, 64);
    expect(queue).toEqual([]);
    blocked = false;
    click(canvas, 0, 64, 64);
    expect(queue).toHaveLength(1);
  });

  it('maps pointer coordinates through the CSS box, not the backing store', () => {
    const canvas = fakeCanvas();
    // A HiDPI backing store must not shift where a click lands.
    canvas.width = 2304;
    canvas.height = 1280;
    const p = pointerToTile(canvas, 32 * 10, 32 * 5);
    expect(Math.floor(p.x)).toBe(10);
    expect(Math.floor(p.y)).toBe(5);
  });

  it('still hits the right tile when a narrower viewport shrinks the rendered CSS box (b078)', () => {
    const canvas = fakeCanvas();
    // The logical grid stays GRID_W*TILE x GRID_H*TILE (1152x640), but the
    // element's actual rendered box is smaller than that — reproduces
    // qa-playtester's repro of an ~872x484 CSS box against the 1152x640
    // logical grid after a viewport resize. A real browser moves
    // `clientWidth`/`clientHeight` and `getBoundingClientRect()` together
    // (src/ui/style.css pins #sw-canvas to a fixed aspect-ratio), so both are
    // shrunk here — overriding only the rect would leave the old buggy
    // formula's `canvas.clientWidth` term at the unshrunk logical size, which
    // cancels against the rect denominator and passes even without the fix.
    Object.defineProperty(canvas, 'clientWidth', { value: 872, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { value: 484, configurable: true });
    canvas.getBoundingClientRect = () =>
      ({ left: 10, top: 20, width: 872, height: 484, right: 882, bottom: 504, x: 10, y: 20 }) as DOMRect;
    // Backing store resolution is independent of the CSS box (e.g. left at the
    // logical size, or DPR-scaled) and must not affect the tile mapping.
    canvas.width = 1152;
    canvas.height = 640;

    // Tile (10, 5)'s center in logical pixels is (336, 176); scale that down
    // by the CSS box's 872/1152 and 484/640 ratios, then offset by the rect.
    const clientX = 10 + 336 * (872 / 1152);
    const clientY = 20 + 176 * (484 / 640);
    const p = pointerToTile(canvas, clientX, clientY);
    expect(Math.floor(p.x)).toBe(10);
    expect(Math.floor(p.y)).toBe(5);
  });
});

describe('pause (playtest request)', () => {
  it('Escape asks the game to toggle pause', () => {
    let toggled = 0;
    const handler = makeKeyDownHandler({
      keys: new Set(),
      queue: { push: () => {} },
      togglePause: () => toggled++,
    });
    handler(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(toggled).toBe(1);
  });

  it('Escape does not also call a wave or pick a card', () => {
    const queue: Command[] = [];
    let picked = -1;
    const handler = makeKeyDownHandler({
      keys: new Set(),
      queue: { push: (c) => queue.push(c) },
      togglePause: () => {},
      pickOffer: (i) => (picked = i),
      isChoosing: () => true,
    });
    handler(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(queue).toEqual([]);
    expect(picked).toBe(-1);
  });

  it('Q queues Active1 as a Command (SPEC-V2 §2 / SPEC-FINAL §4)', () => {
    const queue: Command[] = [];
    const handler = makeKeyDownHandler({
      keys: new Set(),
      queue: { push: (c) => queue.push(c) },
    });
    handler(new window.KeyboardEvent('keydown', { key: 'q' }));
    expect(queue).toEqual([{ k: 'class_active' }]);
  });

  it('E queues Active2 as a Command (SPEC-FINAL §4, p6a)', () => {
    const queue: Command[] = [];
    const handler = makeKeyDownHandler({
      keys: new Set(),
      queue: { push: (c) => queue.push(c) },
    });
    handler(new window.KeyboardEvent('keydown', { key: 'e' }));
    expect(queue).toEqual([{ k: 'class_active2' }]);
  });

  it('shows a pause overlay with resume and abandon, and takes it away again', () => {
    const root = mount();
    let resumed = 0;
    let quit = 0;
    const hud = new Hud(root, {
      ...noopHudCallbacks([]),
      onResume: () => resumed++,
      onPause: () => {},
      onCycleSpeed: () => {},
      onDev: () => {},
      onQuitToHub: () => quit++,
      onHoverSkill: () => {}, onUpgradeStructure: () => {}, onSellStructure: () => {}, onUpgradeCore: () => {},
    });
    const world = new World(cfg());
    hud.buildTowerBar(world);
    hud.syncModal(world);

    hud.setPaused(true, world);
    const modal = root.querySelector('#sw-modal') as HTMLElement;
    expect(modal.hasAttribute('hidden')).toBe(false);
    expect(modal.textContent).toContain('Paused');
    expect(hud.modalOpen).toBe(true);

    (modal.querySelector('[data-act="resume"]') as HTMLElement).click();
    expect(resumed).toBe(1);

    hud.setPaused(false, world);
    expect(modal.hasAttribute('hidden')).toBe(true);
    expect(hud.modalOpen).toBe(false);
    expect(quit).toBe(0);
  });

  it('asks for confirmation before abandoning, and cancel returns to the pause card', () => {
    const root = mount();
    let quit = 0;
    const hud = new Hud(root, {
      ...noopHudCallbacks([]),
      onResume: () => {},
      onPause: () => {},
      onCycleSpeed: () => {},
      onDev: () => {},
      onQuitToHub: () => quit++,
      onHoverSkill: () => {}, onUpgradeStructure: () => {}, onSellStructure: () => {}, onUpgradeCore: () => {},
    });
    const world = new World(cfg());
    hud.buildTowerBar(world);
    hud.setPaused(true, world);

    const modal = root.querySelector('#sw-modal') as HTMLElement;
    (modal.querySelector('[data-act="quit"]') as HTMLElement).click();
    expect(modal.textContent).toContain('Abandon run?');
    expect(quit).toBe(0);

    (modal.querySelector('[data-act="cancel"]') as HTMLElement).click();
    expect(modal.textContent).toContain('Paused');
    expect(modal.querySelector('[data-act="quit"]')).not.toBeNull();
    expect(quit).toBe(0);

    (modal.querySelector('[data-act="quit"]') as HTMLElement).click();
    (modal.querySelector('[data-act="confirm"]') as HTMLElement).click();
    expect(quit).toBe(1);
  });

  it('resets the abandon confirm when the pause is lifted and reopened', () => {
    const root = mount();
    const hud = new Hud(root, noopHudCallbacks([]));
    const world = new World(cfg());
    hud.buildTowerBar(world);
    hud.setPaused(true, world);
    let modal = root.querySelector('#sw-modal') as HTMLElement;
    (modal.querySelector('[data-act="quit"]') as HTMLElement).click();
    expect(modal.textContent).toContain('Abandon run?');

    hud.setPaused(false, world);
    hud.setPaused(true, world);
    modal = root.querySelector('#sw-modal') as HTMLElement;
    expect(modal.textContent).toContain('Paused');
    expect(modal.textContent).not.toContain('Abandon run?');
  });

  it.each(['act1_wave', 'act2'] as const)('pauses and resumes cleanly during %s', (phase) => {
    const root = mount();
    const hud = new Hud(root, noopHudCallbacks([]));
    const world = new World(cfg());
    hud.buildTowerBar(world);
    world.phase = phase;
    hud.syncModal(world);

    hud.setPaused(true, world);
    const modal = root.querySelector('#sw-modal') as HTMLElement;
    expect(modal.textContent).toContain('Paused');
    (modal.querySelector('[data-act="quit"]') as HTMLElement).click();
    expect(modal.textContent).toContain('Abandon run?');

    hud.setPaused(false, world);
    expect(modal.hasAttribute('hidden')).toBe(true);
  });

  it('restores the level-up screen when the pause is lifted', () => {
    const root = mount();
    const hud = new Hud(root, noopHudCallbacks([]));
    const world = new World(cfg());
    hud.buildTowerBar(world);
    world.phase = 'levelup';
    world.offers = [{ kind: 'boon', key: 'power', name: 'Power', desc: '', toLevel: 1 }];
    hud.syncModal(world);

    hud.setPaused(true, world);
    expect((root.querySelector('#sw-modal') as HTMLElement).textContent).toContain('Paused');

    hud.setPaused(false, world);
    const modal = root.querySelector('#sw-modal') as HTMLElement;
    expect(modal.hasAttribute('hidden')).toBe(false);
    expect(modal.textContent).toContain('Power');
  });

  it('does not let a level-up card screen be replaced by the pause card', () => {
    const root = mount();
    const hud = new Hud(root, noopHudCallbacks([]));
    const world = new World(cfg());
    hud.buildTowerBar(world);
    hud.setPaused(true, world);

    // A sim update arriving while paused must not tear down the pause screen.
    world.phase = 'levelup';
    world.offers = [{ kind: 'boon', key: 'power', name: 'Power', desc: '', toLevel: 1 }];
    hud.syncModal(world);
    expect((root.querySelector('#sw-modal') as HTMLElement).textContent).toContain('Paused');
  });
});

describe('canvas resolution (playtest: the game looked blurry)', () => {
  it('backs the canvas at the device pixel ratio, not the CSS size', () => {
    mount();
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    canvas.getContext = (() => ({ setTransform() {}, scale() {} })) as never;

    const r = new Renderer(canvas);
    r.resize(2);
    expect(canvas.width).toBe(GRID_W * TILE * 2);
    expect(canvas.height).toBe(GRID_H * TILE * 2);
    // The CSS box stays in logical pixels so layout and hit-testing are unchanged.
    expect(canvas.style.width).toBe(`${GRID_W * TILE}px`);
  });

  it('does not pin an inline height, so CSS can keep the aspect ratio', () => {
    mount();
    const canvas = document.createElement('canvas');
    canvas.getContext = (() => ({ setTransform() {}, scale() {} })) as never;
    const r = new Renderer(canvas);
    r.resize(2);
    expect(canvas.style.height).toBe('');
  });

  it('clamps silly ratios so the backing store cannot explode', () => {
    mount();
    const canvas = document.createElement('canvas');
    canvas.getContext = (() => ({ setTransform() {}, scale() {} })) as never;
    const r = new Renderer(canvas);
    r.resize(8);
    expect(canvas.width).toBeLessThanOrEqual(GRID_W * TILE * 3);
    r.resize(0.2);
    expect(canvas.width).toBeGreaterThanOrEqual(GRID_W * TILE);
  });
});
