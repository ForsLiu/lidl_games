/**
 * fb064t — a truncated `tiles` array must be refused, not crash the loader.
 *
 * `data/terrain.json`'s `tiles` array is *positional*: `TerrainKind` is an
 * index into it, and `parseTerrain`'s refinement reads `cfg.tiles[i]` for
 * `i` in `0..3` plus `cfg.tiles[TerrainKind.Normal]` directly. The array is
 * length-pinned on the schema, but zod reports a wrong array length as a
 * *dirty* parse rather than an aborted one, so the refinement still ran on
 * the short array and threw `Cannot read properties of undefined (reading
 * 'key')` — a raw `TypeError` naming neither the field nor the file, out of
 * the one function whose whole job is refusing bad data legibly.
 *
 * The guard is deliberately surgical rather than an early return: a document
 * with a short `tiles` array *and* a bad blob still reports both, so fixing
 * one broken field does not uncover the next one on the following run.
 */

import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import terrainRaw from '../data/terrain.json';
import { parseTerrain, TerrainKind, TERRAIN_KEYS } from '../src/sim/terrain';

function clone(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(terrainRaw)) as Record<string, unknown>;
}

function tilesOf(doc: Record<string, unknown>): Array<Record<string, unknown>> {
  return doc.tiles as Array<Record<string, unknown>>;
}

/** Parse and hand back the thrown error, or fail loudly if it was accepted. */
function refusalOf(doc: unknown): unknown {
  try {
    parseTerrain(doc);
  } catch (e) {
    return e;
  }
  throw new Error('expected parseTerrain to refuse this document, but it was accepted');
}

describe('fb064t — parseTerrain refuses a mis-sized tiles array as data, not as a crash', () => {
  // The empty array is the sharpest case: *every* positional read is
  // undefined, so the pre-fix loader could not get past the first one.
  const lengths: ReadonlyArray<{ name: string; tiles: unknown[] }> = (() => {
    const full = tilesOf(clone());
    return [
      { name: 'empty', tiles: [] },
      { name: 'one short', tiles: full.slice(0, TERRAIN_KEYS.length - 1) },
      { name: 'truncated to two', tiles: full.slice(0, 2) },
      { name: 'one too many', tiles: [...full, full[0]] },
    ];
  })();

  for (const { name, tiles } of lengths) {
    it(`refuses a ${name} tiles array with a zod issue naming "tiles"`, () => {
      const doc = clone();
      doc.tiles = tiles;
      const err = refusalOf(doc);

      // The regression: a `TypeError` here is the raw crash this item closes.
      expect(err).toBeInstanceOf(ZodError);
      const issues = (err as ZodError).issues;
      const onTiles = issues.filter((i) => i.path[0] === 'tiles' && i.path.length === 1);
      expect(onTiles.length, JSON.stringify(issues)).toBeGreaterThan(0);
      // Pin the issue *shape*, not zod's wording: "Array must contain exactly 4
      // element(s)" is library-internal text, and a zod minor that rewords it
      // is not a regression in this loader.
      expect(onTiles[0].code).toMatch(/^too_(small|big)$/);
      // A caller printing `err.message` must see the field name, which is what
      // the `TypeError` never carried.
      expect((err as ZodError).message).toMatch(/"tiles"/);
    });
  }

  it('refuses a tiles field that is not an array at all', () => {
    for (const value of [null, 7, 'normal', {}]) {
      const doc = clone();
      doc.tiles = value;
      const err = refusalOf(doc);
      expect(err, String(value)).toBeInstanceOf(ZodError);
      expect((err as ZodError).message).toMatch(/"tiles"/);
    }
  });

  it('refuses a missing tiles field', () => {
    const doc = clone();
    delete doc.tiles;
    expect(refusalOf(doc)).toBeInstanceOf(ZodError);
  });

  it('the length guard is surgical: other issues in the same document still report', () => {
    const doc = clone();
    doc.tiles = [];
    (doc.blob as Record<string, number>).maxSize = 1;
    (doc.blob as Record<string, number>).minSize = 5;
    const issues = (refusalOf(doc) as ZodError).issues;
    expect(issues.some((i) => i.path[0] === 'tiles')).toBe(true);
    expect(issues.some((i) => i.path[0] === 'blob')).toBe(true);
  });

  it('a tiles array whose length lies about its contents is refused, not accepted empty', () => {
    // QA bug 1 against the first cut of this guard. zod checks `exactLength`
    // against `.length` and then builds the parsed array by spreading the
    // iterator, so when those two disagree the length check passes — and a
    // guard that only skipped missing slots would report nothing at all and
    // hand back a config with `tiles: []`, moving the crash into `sealPockets`
    // where it names neither the field nor the file. Not reachable from
    // `JSON.parse`, so this is hardening; it is here because the refinement
    // must not depend on zod having spoken first.
    const doc = clone();
    const lying = tilesOf(doc).slice();
    Object.defineProperty(lying, Symbol.iterator, {
      value: function* () {},
      configurable: true,
    });
    doc.tiles = lying;

    const err = refusalOf(doc);
    expect(err).toBeInstanceOf(ZodError);
    expect((err as ZodError).message).toMatch(/"tiles"/);
    expect((err as ZodError).message).toMatch(/must define all 4 kinds in order/);
  });

  it('a short array still reports the positional problems in the tiles it does have', () => {
    // Two tiles, in the wrong order: the length issue and the order issue are
    // independent faults and the reader deserves both.
    const full = tilesOf(clone());
    const doc = clone();
    doc.tiles = [full[1], full[0]];
    const err = refusalOf(doc) as ZodError;
    expect(err.issues.some((i) => i.path.length === 1 && i.path[0] === 'tiles')).toBe(true);
    expect(err.message).toMatch(/order is load-bearing/);
  });

  it('a long array reports its length and still checks the four positional slots', () => {
    // The mirror of the case above. Only indices 0..3 are positional, so the
    // fifth tile is covered by the length issue alone — that asymmetry is the
    // design, and this pins it so a later change to the loop bound is visible.
    const full = tilesOf(clone());
    const doc = clone();
    const wrongAtTwo = [full[0], full[1], full[3], full[2], full[0]];
    doc.tiles = wrongAtTwo;
    const err = refusalOf(doc) as ZodError;
    expect(err.issues.some((i) => i.path.length === 1 && i.path[0] === 'tiles')).toBe(true);
    expect(err.message).toMatch(/order is load-bearing/);
  });

  it('every existing refusal message is unchanged by the guard', () => {
    const reorder = clone();
    const t = tilesOf(reorder);
    [t[1], t[2]] = [t[2], t[1]];
    expect(() => parseTerrain(reorder)).toThrow(/order is load-bearing/);

    const flag = clone();
    tilesOf(flag)[TerrainKind.Rock].walkable = true;
    expect(() => parseTerrain(flag)).toThrow(/rock.*must have walkable: false/);

    const character = clone();
    tilesOf(character)[TerrainKind.Normal].blocksCharacter = true;
    expect(() => parseTerrain(character)).toThrow(/normal.*must have blocksCharacter: false/);

    // And the shipped file still loads.
    expect(parseTerrain(clone()).tiles.length).toBe(TERRAIN_KEYS.length);
  });
});

/**
 * fb064t was one instance of a class: a zod check that fails *dirty* (array
 * lengths, numeric bounds) lets `superRefine` run on the bad value, so any
 * positional read in a refinement is a latent raw crash. The case above pins
 * the instance; this pins the class, so the next positional array added to
 * this schema is caught here rather than by a bug report.
 */
describe('fb064t — no mutation of a top-level field escapes as a non-ZodError', () => {
  const BAD_VALUES: readonly unknown[] = [
    undefined, // i.e. delete the key
    null,
    [],
    [null],
    {},
    0,
    -1,
    1e9,
    1.5,
    NaN,
    '',
    true,
  ];

  it('every top-level field x every hostile value either loads or throws a ZodError', () => {
    const keys = Object.keys(clone());
    expect(keys.length).toBeGreaterThan(0);
    const escapes: string[] = [];
    for (const key of keys) {
      for (const value of BAD_VALUES) {
        const doc = clone();
        if (value === undefined) delete doc[key];
        else doc[key] = value;
        try {
          parseTerrain(doc);
        } catch (e) {
          if (e instanceof ZodError) continue;
          escapes.push(`${key}=${JSON.stringify(value) ?? 'undefined'}: ${String(e)}`);
        }
      }
    }
    expect(escapes, escapes.join('\n')).toEqual([]);
  });

  it('a mis-sized tiles array cannot make any other field crash the loader either', () => {
    // The combined case: the hole and a second fault in the same document.
    // Pre-fix, every one of these was the same `TypeError` regardless of the
    // second fault, which is what made the crash so uninformative.
    const full = tilesOf(clone());
    const sizes = [[], full.slice(0, 1), full.slice(0, 3), [...full, full[0]]];
    const escapes: string[] = [];
    for (const tiles of sizes) {
      for (const key of Object.keys(clone())) {
        if (key === 'tiles') continue;
        for (const value of BAD_VALUES) {
          const doc = clone();
          doc.tiles = tiles;
          if (value === undefined) delete doc[key];
          else doc[key] = value;
          try {
            parseTerrain(doc);
            escapes.push(`tiles(${tiles.length}) + ${key}=${String(value)}: ACCEPTED`);
          } catch (e) {
            if (e instanceof ZodError) continue;
            escapes.push(`tiles(${tiles.length}) + ${key}=${String(value)}: ${String(e)}`);
          }
        }
      }
    }
    expect(escapes, escapes.slice(0, 5).join('\n')).toEqual([]);
  });
});
