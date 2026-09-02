/**
 * fb039 (QUESTIONS Q138 OVERRIDE) — `tools/sim.ts`, `tools/sweep.ts` and
 * `tools/handoff-metrics.ts` used to default `RunConfig.allocated` to `[]`
 * regardless of what the real Hub UI feeds a run (`src/meta/meta.ts`'s
 * `TREE_AUTO_MAX` puts every node id in `allocated` via `allTreeNodeIds` for
 * every real Hub-started run, including `fb019`'s Training Grounds) —
 * measuring a materially weaker character than what a real player actually
 * plays with. `tools/handoff-metrics.ts` has no `--tree` flag at all (it's a
 * fixed metrics script, not a CLI with per-run overrides), so it now always
 * builds `RunConfig.allocated` from the full tree, no explicit-override path
 * needed. The other three (`tools/sim.ts`, `tools/sweep.ts`,
 * `tools/status.ts`'s `cfgFor`) keep an explicit override: a `--tree`/
 * `overrides.allocated` still wins outright, `--tree none` still means a
 * deliberately empty tree — only the *unset* default moved from `[]` to the
 * full tree.
 */
import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';
import { allTreeNodeIds } from '../src/meta/meta';
import { parseArgs, resolveAllocated as simResolveAllocated } from '../tools/sim';
import { buildRunConfig, resolveAllocated as sweepResolveAllocated, type Options } from '../tools/sweep';

const content = loadContent();
const FULL_TREE = allTreeNodeIds(content);

describe('fb039: tools/sim.ts defaults to the full Constellation tree', () => {
  it('resolveAllocated falls back to the full tree when nothing was passed', () => {
    expect(simResolveAllocated(content, null)).toEqual(FULL_TREE);
  });

  it('resolveAllocated honors an explicit empty tree', () => {
    expect(simResolveAllocated(content, [])).toEqual([]);
  });

  it('resolveAllocated honors an explicit partial tree', () => {
    expect(simResolveAllocated(content, [1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('parseArgs defaults --tree to unset (auto)', () => {
    expect(parseArgs([]).allocated).toBeNull();
  });

  it('parseArgs --tree none means a deliberate empty tree, not auto', () => {
    expect(parseArgs(['--tree', 'none']).allocated).toEqual([]);
  });

  it('parseArgs --tree 1,2,3 still parses an explicit id list', () => {
    expect(parseArgs(['--tree', '1,2,3']).allocated).toEqual([1, 2, 3]);
  });
});

describe('fb039: tools/sweep.ts defaults to the full Constellation tree', () => {
  function options(over: Partial<Options> = {}): Options {
    return {
      seeds: 1,
      seedStart: 1,
      policies: ['kite'],
      classKey: 'engineer',
      tier: 1,
      modifiers: [],
      allocated: null,
      json: false,
      maxTicks: 60 * 60 * 45,
      ...over,
    };
  }

  it('resolveAllocated falls back to the full tree when nothing was passed', () => {
    expect(sweepResolveAllocated(content, null)).toEqual(FULL_TREE);
  });

  it('resolveAllocated honors an explicit empty tree', () => {
    expect(sweepResolveAllocated(content, [])).toEqual([]);
  });

  it('buildRunConfig feeds the full tree into RunConfig.allocated by default', () => {
    const cfg = buildRunConfig(options(), content, 1);
    expect(cfg.allocated).toEqual(FULL_TREE);
  });

  it('buildRunConfig still honors an explicit --tree override', () => {
    const cfg = buildRunConfig(options({ allocated: [4, 5] }), content, 1);
    expect(cfg.allocated).toEqual([4, 5]);
  });
});

// `tools/status.ts`'s `cfgFor` now defaults to the same full-tree allocation
// via `resolveAllocated` (fb048, QUESTIONS Q156) — see the comment on
// `cfgFor` itself. Not covered by this file; `tests/fb038-status.test.ts`
// already covers `cfgFor`'s real behavior.
