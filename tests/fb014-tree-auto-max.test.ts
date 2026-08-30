/**
 * @vitest-environment jsdom
 *
 * fb014 (owner feedback `feature-constellation-auto-max`, Q134, SPEC-FINAL
 * §8.3 temporary supersede): the Constellation tree counts as fully allocated
 * on every run — no point-spending or allocation UI — while skill points
 * still accrue and display, and the tree screen shows every node allocated.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Hub } from '../src/ui/hub';
import { defaultMeta, pointsAvailable, TREE_AUTO_MAX, allTreeNodeIds } from '../src/meta/meta';
import { loadContent } from '../src/sim/content';
import { defaultSettings } from '../src/ui/settings';
import { baseRunStats } from '../src/sim/stats';
import type { MetaState, RunConfig } from '../src/sim/types';
import { cfg } from './helpers';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

function mountHub(
  meta: MetaState,
  onStart: (cfg: RunConfig) => void,
): { root: HTMLElement; hub: Hub; latest: () => MetaState } {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app') as HTMLElement;
  let current = meta;
  const hub = new Hub(root, meta, 1, {
    settings: defaultSettings(),
    onStart,
    onMetaChanged: (m) => (current = m),
    onSettingsChanged: () => {},
  });
  hub.show();
  return { root, hub, latest: () => current };
}

describe('fb014: Constellation auto-allocation', () => {
  it('flag is on per Q134 (applies in dev and normal play)', () => {
    expect(TREE_AUTO_MAX).toBe(true);
  });

  it('a fresh profile plays with every node effect active: RunConfig.allocated covers every node id', () => {
    let started: RunConfig | null = null;
    mountHub(defaultMeta(), (c) => (started = c));
    const content = loadContent();
    document.getElementById('app')!.querySelector<HTMLElement>('#sw-start')!.click();
    expect(started).not.toBeNull();
    const allIds = allTreeNodeIds(content);
    expect(started!.allocated.length).toBe(allIds.length);
    for (const id of allIds) expect(started!.allocated).toContain(id);
  });

  it('the full allocation actually reaches the run stat sheet (not just RunConfig)', () => {
    const content = loadContent();
    const fresh = derivedPowerWith(allTreeNodeIds(content));
    const none = derivedPowerWith([]);
    // Every node's stats are folded in as real sources, so the fully-allocated
    // sheet must differ from an empty one for at least one stat this rich a
    // tree grants (power is a near-universal node stat).
    expect(fresh).not.toEqual(none);

    function derivedPowerWith(allocated: number[]) {
      const stats = baseRunStats(content, cfg({ allocated }));
      return stats.factor('power');
    }
  });

  it('skill points still display the real pointsAvailable() figure, untouched by auto-max', () => {
    const meta: MetaState = { ...defaultMeta(), skillPoints: 5 };
    const want = pointsAvailable(meta);
    expect(want).toBeGreaterThan(0);
    const { root } = mountHub(meta, () => {});
    // The "Points" account cell specifically, not a coincidental digit match
    // anywhere else on the page (the Points cell lives on the account/summary
    // markup regardless of tab).
    const cell = [...root.querySelectorAll('span')].find((s) => s.textContent?.trim().startsWith('Points'));
    expect(cell).not.toBeUndefined();
    expect(cell!.querySelector('b')!.textContent).toBe(String(want));
  });

  it('the tree screen shows every node allocated and banks real points, with no spend/refund controls wired', () => {
    const meta = { ...defaultMeta(), skillPoints: 5 };
    const { root, hub, latest } = mountHub(meta, () => {});
    hub.openTab('tree');

    const content = loadContent();
    const total = content.tree.nodes.filter((n) => n.kind !== 'start').length;
    expect(root.textContent).toMatch(new RegExp(`${total} / ${total} allocated`));

    const nodes = root.querySelectorAll<SVGCircleElement>('.sw-node');
    expect(nodes.length).toBeGreaterThan(0);
    for (const n of nodes) expect(n.getAttribute('class')).toMatch(/\btaken\b/);

    // Clicking a node must not spend a real point — allocation UI is off.
    const before = latest().allocated.length;
    nodes[0]!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(latest().allocated.length).toBe(before);

    // Right-click must not refund anything either.
    nodes[0]!.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(latest().allocated.length).toBe(before);
  });
});
