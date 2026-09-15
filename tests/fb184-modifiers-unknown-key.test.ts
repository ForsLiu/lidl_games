/**
 * fb184 (QUESTIONS Q181, "cheap closer"): the loader refuses an unrecognized
 * top-level key in `data/modifiers.json` instead of silently dropping it —
 * closing the `numberScal3`-typo class of silent mis-scale Q181 found, where
 * a typo left `numberScale` sitting on its `default(1)` (no rescale at all)
 * with no load error to say why.
 */

import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';

describe('fb184: modifiers.json rejects an unrecognized top-level key', () => {
  const content = loadContent();
  const raw = content.raw.modifiers as Record<string, unknown>;

  it('the numberScal3 typo repro fails to load, naming the field, instead of silently defaulting numberScale to 1.0', () => {
    const { numberScale, ...withoutScale } = raw;
    const typoed = { ...withoutScale, numberScal3: numberScale };
    expect(() => loadContent({ modifiers: typoed })).toThrow(/numberScal3/);
  });

  it('every currently legitimate top-level key still loads', () => {
    expect(() => loadContent({ modifiers: { ...raw } })).not.toThrow();
  });
});
