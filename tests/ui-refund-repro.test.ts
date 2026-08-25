/**
 * @vitest-environment jsdom
 *
 * Reproduces the playtest report that Constellation right-click refund still
 * does nothing, driving the real Hub DOM exactly as a player would: a fresh
 * account, one point spent, then right-click to take it back.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Hub } from '../src/ui/hub';
import { defaultMeta } from '../src/meta/meta';
import { loadContent } from '../src/sim/content';
import { defaultSettings } from '../src/ui/settings';
import type { MetaState } from '../src/sim/types';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

function mountHub(meta: MetaState): { root: HTMLElement; latest: () => MetaState } {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app') as HTMLElement;
  let current = meta;
  const hub = new Hub(root, meta, 1, {
    settings: defaultSettings(),
    onStart: () => {},
    onMetaChanged: (m) => (current = m),
    onSettingsChanged: () => {},
  });
  hub.show();
  hub.openTab('tree');
  return { root, latest: () => current };
}

function rightClick(el: Element): void {
  el.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
}

describe('a fresh account can undo a misclicked Constellation point', () => {
  const content = loadContent();
  const firstNode = content.treeById.get(0)!.links[0];

  it('allocates on left click', () => {
    const { root, latest } = mountHub(defaultMeta());
    (root.querySelector(`[data-node="${firstNode}"]`) as SVGCircleElement).dispatchEvent(
      new window.MouseEvent('click', { bubbles: true }),
    );
    expect(latest().allocated).toContain(firstNode);
  });

  it('takes that point back on right click, on a brand new account', () => {
    // A fresh account has 0 Ember, and Ember only arrives at the end of a run.
    // Without an undo the very first misclick is permanent, which is what the
    // playtest read as "refund does not work".
    const { root, latest } = mountHub(defaultMeta());
    const node = root.querySelector(`[data-node="${firstNode}"]`) as SVGCircleElement;
    node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(latest().allocated).toContain(firstNode);

    const again = root.querySelector(`[data-node="${firstNode}"]`) as SVGCircleElement;
    rightClick(again);
    expect(latest().allocated).not.toContain(firstNode);
  });

  it('does not charge Ember the account does not have', () => {
    const { root, latest } = mountHub(defaultMeta());
    const node = root.querySelector(`[data-node="${firstNode}"]`) as SVGCircleElement;
    node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    rightClick(root.querySelector(`[data-node="${firstNode}"]`) as Element);
    expect(latest().ember).toBeGreaterThanOrEqual(0);
  });

  it('shows the tree updating, not just the underlying state', () => {
    const { root } = mountHub(defaultMeta());
    const node = root.querySelector(`[data-node="${firstNode}"]`) as SVGCircleElement;
    node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const litFill = (root.querySelector(`[data-node="${firstNode}"]`) as Element).getAttribute('fill');

    rightClick(root.querySelector(`[data-node="${firstNode}"]`) as Element);
    const afterFill = (root.querySelector(`[data-node="${firstNode}"]`) as Element).getAttribute('fill');
    expect(afterFill).not.toBe(litFill);
  });
});
