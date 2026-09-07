/**
 * fb064k — the `describeTerrain` repro format.
 *
 * A terrain bug report used to be a seed plus a screenshot: two artefacts that
 * can disagree, and neither of which a test can consume. This file pins the one
 * string that replaces them.
 *
 * What the item asks for, and where each clause is measured:
 *  - *round-trips to a byte-identical `kind` buffer* — "round trip" below, over
 *    a seed sweep, both wraps of the seed domain, the flat fallback map, and
 *    hand-built grids whose gate tiles are deliberately not `normal`.
 *  - *carries the gates, the legal-anchor count and every measured band* —
 *    "carries", which walks `TerrainMeasure`'s own key list rather than a
 *    hand-copied one, so a band added to the measurement and forgotten in the
 *    dump fails here.
 *  - *a known seed's dump matches a golden* — "golden".
 *
 * The golden deserves a note. Pasting the generator's own output into a test
 * pins a change and proves nothing about correctness, so the golden here is
 * cross-checked against independently derived facts in the same block: its
 * glyph histogram is recounted from the map rows, its hash is re-derived from
 * the tiles, its gate columns are read out of `GATES`, and its bands are
 * re-measured through `measureTerrain`. If the golden were recorded from a
 * broken build, those checks disagree with it.
 */

import { describe, expect, it } from 'vitest';

import { GATES, GRID_H, GRID_W, MODIFIER_GATES, type GateDef } from '../src/sim/grid';
import {
  describeTerrain,
  flatTerrain,
  generateTerrain,
  legalCoreAnchors,
  loadTerrain,
  measureTerrain,
  parseTerrain,
  parseTerrainDump,
  terrainHash,
  TerrainKind,
  TERRAIN_KEYS,
  type TerrainConfig,
  type TerrainGrid,
  type TerrainMap,
  type TerrainMeasure,
} from '../src/sim/terrain/index';
// Deep import on purpose (QA bug 3): `HEADER_KEYS` is the dump format's
// internal contract, not part of the terrain public surface `index.ts` exports,
// and it is reachable here only so the drift tests below can compare it against
// what `describeTerrain` writes.
import { HEADER_KEYS } from '../src/sim/terrain/describe';

const cfg = loadTerrain();

/**
 * fb065f: `world.ts`'s Fourth Gate list, in the order `World` builds it. The
 * `gates` header line is the one line whose key set is not closed, so a few
 * cases here need the maximal dump rather than the default three-gate one.
 */
const FOUR_GATES: readonly GateDef[] = [...GATES, ...MODIFIER_GATES];

function withConfig(patch: (raw: Record<string, unknown>) => void): TerrainConfig {
  const raw = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>;
  patch(raw);
  return parseTerrain(raw);
}

/**
 * A parsed dump put back into `TerrainMap` shape, so a dump can be re-described.
 *
 * `parseTerrainDump` returns provenance in a nested field rather than at the top
 * level, because a provenance-free `TerrainGrid` is a legal thing to dump and a
 * flat shape would have to invent a seed for it. This is the one-line cost.
 */
function reflate(text: string): TerrainGrid {
  const d = parseTerrainDump(text);
  return d.provenance === null ? { w: d.w, h: d.h, kind: d.kind } : { ...d.provenance, ...d };
}

/** A hand-built grid, for cases the generator cannot produce. */
function synthetic(fill: TerrainKind): TerrainGrid {
  return { w: GRID_W, h: GRID_H, kind: new Uint8Array(GRID_W * GRID_H).fill(fill) };
}

/** The map rows of a dump, i.e. everything after the `map` marker. */
function rowsOf(text: string): string[] {
  const lines = text.replace(/\n$/, '').split('\n');
  return lines.slice(lines.indexOf('map') + 1);
}

/** One `key=value` field's value from a dump's header line. */
function field(text: string, head: string, key: string): string {
  const line = text.split('\n').find((l) => l.startsWith(`${head} `));
  expect(line, `dump has no "${head}" line`).toBeDefined();
  const hit = (line as string).split(' ').find((p) => p.startsWith(`${key}=`));
  expect(hit, `"${head}" line has no "${key}"`).toBeDefined();
  return (hit as string).slice(key.length + 1);
}

/**
 * Seed 1's dump, as an array joined with an explicit newline.
 *
 * NOT a multi-line template literal, which is what this started as. This repo
 * has `core.autocrlf=true` and no `.gitattributes`, so every checked-out file
 * is CRLF — meaning a template literal's newlines become CRLF on the next
 * `git clone`, `git worktree add` or `git checkout`, and the byte-exact
 * `toBe(GOLDEN_SEED_1)` below goes red with a diff of invisible characters. It
 * passes today only because this file was written with LF and has never been
 * checked out, and the lane merge is a checkout. Joining makes the line endings
 * a property of the test rather than of the working copy. (Found by QA, which
 * measured the real failure through `git cat-file --filters`.)
 *
 * A `.gitattributes` with `* text=auto eol=lf` would fix this repo-wide and is
 * outside this lane's Scope; it is filed in the Log for the merge.
 *
 * **Moved a second time, at fb064s**, which added the `source` field to the
 * seed line. Nothing about seed 1's map changed — the hash, the bands, the
 * counts and all rows are byte-identical; only the one header line grew
 * the mark that tells a reader whether `requested` is a seed they can paste.
 *
 * **Moved once, at fb064m**, which demotes a `high` tile with no walkable tile
 * inside `highContestRadius` to rock. Only the hash, the `tiles` counts and
 * those glyphs move: the `bands` and `counts` lines are byte-identical,
 * because `high` and `rock` are both non-walkable and both non-normal, so the
 * demotion is invisible to every measured band. That is the clearest
 * statement of what fb064m costs, and it is why this golden was re-derived
 * rather than the item being talked out of moving it.
 *
 * **Moved a third time, at fb166**, the owner's bigger-map order: the grid
 * goes 36x20 -> 56x32 (`src/sim/grid.ts`'s `GRID_W`/`GRID_H`), with no change
 * to `data/terrain.json` — the 1000- and 12,000-seed sweeps this item ran
 * hold every owner band at the new size with real headroom (see
 * BACKLOG-TERRAIN.md's fb166 entry), so the density/blob/constraint numbers
 * are unchanged and only the golden itself moves.
 */
const GOLDEN_SEED_1 = [
  'terrain 56x32',
  'seed source=generator requested=1 effective=1 attempts=1 fallback=false hash=164edd68',
  'gates west=0,10 north=18,0 east=35,17',
  'bands walkable=0.736607 buildableNormal=0.553571 gateReach=1.000000 coreLegal=0.526210 gateDetour=1.050847 corridors=true gatesOpen=true gatesConnected=true',
  'counts walkable=1320 normal=992 coreAnchors=522',
  'tiles normal=992 rough=328 rock=354 high=118',
  'legend normal=. rough=, rock=# high=^',
  'map',
  '##################.#####################################',
  '#.....###.........................^^.....,,,,,^^^,,.,..#',
  '#....###.,...........,,........^^^^^...#...,,.,...,,,..#',
  '#.....###,,..........,,,.......^^^^^.####,,,,,,##,,,...#',
  '#.......,,...........^,,..,,,,..,,^^..####,,,,###,,....#',
  '#........,,,...............,,,..,,^^.,.#...,######.....#',
  '#.....,,..,,.,...............,..,,^^.,.........###...^.#',
  '#^^^^^,,.,,,,,...#................^,,,.........######^.#',
  '#...^.,,.........###.........,,.,,,,,,.......########^^#',
  '#.....,,.........#.#,........,,..,..,........########^^#',
  '.......,.......#.#.#,,.......,,,,,...........######,^^^#',
  '#.................,,,.........,,##...........###,.,,^^^#',
  '#..............................####.........^^.,,,,,...#',
  '#...................,,.^^........###..,.,...^^^,.,,....#',
  '#..,,...............,,..^..........#..,,,.....^.,,,#...#',
  '#.,,,.................................^....^^^^^.####..#',
  '#.,^^^......................................##...####..#',
  '#.,^^........................................##....#####',
  '###...^.....................................###....###^#',
  '####.^^.............,^^^^.................,,^^##...#^^^#',
  '#^###^^^###.........,,.^,,,,...........,...,,......##^^#',
  '#^###^#####..........,.^,,,,...........,,,,,..^......,,#',
  '#.....##.......,........#,#..........,,,.,,..^^.^^^^,,,#',
  '#^^^..##.......,,,.....####..,,,.##..,,,,,..,^^...^.,,.#',
  '#^^,,.....#.....,,,,.....##..,,###....,,,,..,,^..^^,,,,#',
  '#^,,,,.####....^^^.,,.###.,,,,,##...........,,...^^,.^.#',
  '#^,,,....#......,.....##...,,,.,,.....,......,..^^.,.^.#',
  '#^..,....###....,,.....#...,,,,,,,...,,,,,,.,,...^.,,^^#',
  '#^,,,,..###.....,,...,,##.#,,,,,......,...,..,.....,,..#',
  '#,,,,,,,.,.....,,,....,,####,,,,,......###.,,,,,.,..,,,#',
  '#,,,,,,,,,.....,,,,,,..,,,,,,,,,,,,....####,,,,,,,###..#',
  '########################################################',
].join('\n')
  .concat('\n');

describe('fb064k — a terrain dump is the whole repro', () => {
  it('golden: seed 1 dumps to the recorded string, and the string checks out', () => {
    const map = generateTerrain(1, cfg);
    const dump = describeTerrain(map, cfg);
    expect(dump).toBe(GOLDEN_SEED_1);

    // The golden is only worth having if it is more than "whatever came out".
    // Everything below re-derives a claim the golden makes, from a source that
    // is not the golden.
    const rows = rowsOf(GOLDEN_SEED_1);
    expect(rows.length).toBe(GRID_H);
    for (const row of rows) expect(row.length).toBe(GRID_W);

    // Histogram, recounted from the rows the golden actually shows.
    const glyphs = TERRAIN_KEYS.map((k) => field(GOLDEN_SEED_1, 'legend', k));
    const seen = glyphs.map((g) => rows.join('').split(g).length - 1);
    for (let i = 0; i < TERRAIN_KEYS.length; i++) {
      expect(seen[i], `${TERRAIN_KEYS[i]} count`).toBe(
        Number(field(GOLDEN_SEED_1, 'tiles', TERRAIN_KEYS[i])),
      );
    }
    expect(seen.reduce((a, b) => a + b, 0)).toBe(GRID_W * GRID_H);

    // Hash, re-derived from the golden's own tiles rather than copied from the
    // map: this is what makes a mangled row in a pasted dump detectable.
    const fromText = parseTerrainDump(GOLDEN_SEED_1);
    expect(terrainHash(1, fromText.kind)).toBe(field(GOLDEN_SEED_1, 'seed', 'hash'));
    expect(fromText.kind).toEqual(map.kind);

    // Gates, read out of `GATES` rather than out of the golden.
    for (const g of GATES) {
      expect(field(GOLDEN_SEED_1, 'gates', g.key)).toBe(`${g.tx},${g.ty}`);
    }

    // Bands, re-measured from the golden's OWN decoded tiles — not from `map`.
    // Measuring `map` would be tautological: line 1 of this test already
    // asserts the golden equals `describeTerrain(map)`, so any band derived
    // from `map` cannot fail unless that assertion has. Going through
    // `fromText` instead is what catches a golden whose printed bands describe
    // a different map from its printed rows. (Caught by review.)
    const m = measureTerrain({ w: GRID_W, h: GRID_H, kind: fromText.kind }, cfg);
    expect(field(GOLDEN_SEED_1, 'bands', 'walkable')).toBe(m.walkableFrac.toFixed(6));
    expect(field(GOLDEN_SEED_1, 'bands', 'buildableNormal')).toBe(
      m.buildableNormalFrac.toFixed(6),
    );
    expect(field(GOLDEN_SEED_1, 'bands', 'gateReach')).toBe(m.gateReachFrac.toFixed(6));
    expect(field(GOLDEN_SEED_1, 'bands', 'coreLegal')).toBe(m.coreLegalFrac.toFixed(6));
    expect(field(GOLDEN_SEED_1, 'bands', 'corridors')).toBe(String(m.corridorsOk));
    expect(field(GOLDEN_SEED_1, 'bands', 'gatesOpen')).toBe(String(m.gatesOpen));
    expect(field(GOLDEN_SEED_1, 'bands', 'gatesConnected')).toBe(String(m.gatesConnected));
    expect(field(GOLDEN_SEED_1, 'counts', 'walkable')).toBe(String(m.walkableCount));
    expect(field(GOLDEN_SEED_1, 'counts', 'normal')).toBe(String(m.normalCount));
    expect(field(GOLDEN_SEED_1, 'counts', 'coreAnchors')).toBe(
      String(legalCoreAnchors({ w: GRID_W, h: GRID_H, kind: fromText.kind }, cfg).length),
    );

    // The golden must be LF, or a CRLF checkout fails the byte-exact assertion
    // above with a diff of invisible characters instead of naming the cause.
    expect(GOLDEN_SEED_1.includes('\r')).toBe(false);
  });

  it('the glyph table survives a reorder of TERRAIN_KEYS', () => {
    // `Record<TerrainKey, string>` catches a renamed or added key at compile
    // time but NOT a reorder: every glyph would just shift by one and the file
    // still type-checks. Pinning two glyphs by `TerrainKind` is what makes a
    // reorder red here rather than in a golden diff nobody can read.
    expect(GOLDEN_SEED_1).toContain('legend normal=. rough=, rock=# high=^');
    const one = synthetic(TerrainKind.Rough);
    expect(rowsOf(describeTerrain(one, cfg))[0][0]).toBe(',');
    const two = synthetic(TerrainKind.High);
    expect(rowsOf(describeTerrain(two, cfg))[0][0]).toBe('^');
  });

  it('carries the gates, the legal-anchor count and every measured band', () => {
    const map = generateTerrain(4242, cfg);
    const dump = describeTerrain(map, cfg);
    const parsed = parseTerrainDump(dump);
    const m = measureTerrain(map, cfg);

    // Walks `TerrainMeasure`'s own keys, not a list copied by hand: a band added
    // to the measurement and forgotten in the dump fails right here, which a
    // field-by-field assertion would not do.
    const keys = Object.keys(m) as Array<keyof TerrainMeasure>;
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      const want = m[k];
      const got = parsed.measure[k];
      expect(got, `band ${k} missing or wrong in the dump`).not.toBeUndefined();
      if (typeof want === 'number') expect(got).toBeCloseTo(want, 6);
      else expect(got).toBe(want);
    }
    // Every key of the parsed measure is a key of the real one — no invented
    // bands, so the round trip above is over the same object shape.
    expect(Object.keys(parsed.measure).sort()).toEqual([...keys].sort());

    expect(parsed.measure.legalCoreCount).toBe(legalCoreAnchors(map, cfg).length);
    expect(parsed.gates.map((g) => [g.key, g.tx, g.ty])).toEqual(
      GATES.map((g) => [g.key, g.tx, g.ty]),
    );
    expect(parsed.provenance).toEqual({
      requestedSeed: map.requestedSeed,
      seed: map.seed,
      attempts: map.attempts,
      fallback: map.fallback,
      hash: map.hash,
    });
    expect(parsed.tileCounts.reduce((a, b) => a + b, 0)).toBe(GRID_W * GRID_H);
    expect(parsed.tileCounts[TerrainKind.Normal]).toBe(m.normalCount);
  });

  it('round trip: the dump reproduces a byte-identical kind buffer across the seed domain', () => {
    // Not a contiguous window: the far half of the uint32 domain is where
    // fb064j found the generator's provenance defects, and a format that only
    // round-trips small seeds would have looked fine there too.
    const seeds = [
      0,
      1,
      2,
      42,
      1000,
      7957, // fb064a's walkable-band cliff seed
      -1,
      -85542, // its far-domain twin
      0x7fffffff,
      0x80000000,
      0xfffffffe,
      0xffffffff,
      3000000000,
    ];
    for (let s = 1; s <= 60; s++) seeds.push(s * 104729);
    for (const s of seeds) {
      const map = generateTerrain(s, cfg);
      const text = describeTerrain(map, cfg);
      const back = parseTerrainDump(text);
      expect(back.w, `seed ${s}`).toBe(map.w);
      expect(back.h, `seed ${s}`).toBe(map.h);
      expect(Array.from(back.kind), `seed ${s} tiles`).toEqual(Array.from(map.kind));
      expect(back.provenance?.hash, `seed ${s} hash`).toBe(map.hash);
      // And the text is a fixed point: re-describing the parsed dump gives the
      // same bytes, so a dump can be passed through the format any number of
      // times without drifting.
      expect(describeTerrain(reflate(text), cfg), `seed ${s} refit`).toBe(text);
    }
  });

  it('round trip: the flat fallback map dumps and reloads like any other', () => {
    // The fallback is the one map with no RNG key behind it, and its `seed` is
    // the unadvanced one (fb064j). A format that assumed `seed === requested +
    // attempts - 1` would fail its hash check here and nowhere else.
    const impossible = withConfig((raw) => {
      (raw.constraints as Record<string, number>).minCoreLegalFrac = 0.9;
    });
    const map = generateTerrain(11, impossible);
    expect(map.fallback).toBe(true);
    const text = describeTerrain(map, impossible);
    expect(field(text, 'seed', 'fallback')).toBe('true');
    expect(field(text, 'seed', 'attempts')).toBe(String(impossible.maxAttempts));
    const back = parseTerrainDump(text);
    expect(Array.from(back.kind)).toEqual(Array.from(map.kind));
    expect(back.provenance?.seed).toBe(map.seed);
    // The dump records the bands that rejected every seed, so a fallback report
    // says *why* it fell back rather than just that it did.
    expect(back.measure.coreLegalFrac).toBeLessThan(0.9);
  });

  it('round trip: hand-built grids, including ones the generator cannot produce', () => {
    for (const fill of [TerrainKind.Normal, TerrainKind.Rough, TerrainKind.Rock, TerrainKind.High]) {
      const grid = synthetic(fill);
      const text = describeTerrain(grid, cfg);
      // A grid with no provenance dumps `-` rather than a fabricated seed.
      expect(field(text, 'seed', 'hash')).toBe('-');
      const back = parseTerrainDump(text);
      expect(back.provenance).toBeNull();
      expect(Array.from(back.kind), `fill ${fill}`).toEqual(Array.from(grid.kind));
      expect(describeTerrain(reflate(text), cfg)).toBe(text);
    }

    // The reason gates are a header line and not an overlay on the tile rows:
    // every gate tile here is rock, which no generated map ever has, and a
    // glyph overlay would silently report those three tiles as walkable.
    const walled = synthetic(TerrainKind.Normal);
    for (const g of GATES) walled.kind[g.ty * GRID_W + g.tx] = TerrainKind.Rock;
    const text = describeTerrain(walled, cfg);
    const rows = rowsOf(text);
    for (const g of GATES) expect(rows[g.ty][g.tx]).toBe('#');
    expect(Array.from(parseTerrainDump(text).kind)).toEqual(Array.from(walled.kind));
    // The three rock tiles are counted as rock, not quietly restored to normal
    // on the way through the format.
    expect(parseTerrainDump(text).tileCounts[TerrainKind.Rock]).toBe(GATES.length);
    expect(parseTerrainDump(text).measure.walkableCount).toBe(GRID_W * GRID_H - GATES.length);
    // `gatesOpen` stays true, and that is correct: it asks whether a gate has a
    // walkable *neighbour*, not whether the gate tile itself is walkable. Noted
    // because the opposite is the intuitive reading and was this test's first
    // assertion.
    expect(field(text, 'bands', 'gatesOpen')).toBe('true');
  });

  it('is pure: same input, same bytes, and the map is not touched', () => {
    const map = generateTerrain(77, cfg);
    const before = Array.from(map.kind);
    const a = describeTerrain(map, cfg);
    const b = describeTerrain(map, cfg);
    expect(b).toBe(a);
    expect(Array.from(map.kind)).toEqual(before);
    // The parsed buffer is a copy, so editing it cannot reach back into the map.
    const back = parseTerrainDump(a);
    back.kind[0] = TerrainKind.High;
    expect(map.kind[0]).toBe(before[0]);
    expect(describeTerrain(map, cfg)).toBe(a);
  });

  it('the dump reports what the config measures, not a frozen snapshot', () => {
    // A dump records *measurements*, and `/data` decides what several of them
    // mean — fb064f hands `/data` to live Tuner edits, so a dump that ignored
    // the config would describe a map nobody has. `coreGateClearance` is the
    // sharp case: it moves `coreLegalFrac` and the anchor count while leaving
    // every tile alone, so the two dumps below must agree on the map and
    // disagree on the judgement.
    const map = generateTerrain(9, cfg);
    const roomier = withConfig((raw) => {
      (raw as { coreGateClearance: number }).coreGateClearance = cfg.coreGateClearance + 3;
    });
    const a = parseTerrainDump(describeTerrain(map, cfg));
    const b = parseTerrainDump(describeTerrain(map, roomier));
    expect(Array.from(a.kind)).toEqual(Array.from(b.kind));
    expect(a.tileCounts).toEqual(b.tileCounts);
    expect(b.measure.legalCoreCount).toBe(legalCoreAnchors(map, roomier).length);
    expect(b.measure.legalCoreCount).toBeLessThan(a.measure.legalCoreCount);
    expect(b.measure.coreLegalFrac).toBeLessThan(a.measure.coreLegalFrac);
  });
});

describe('fb064k — a malformed dump is refused, never half-read', () => {
  const good = GOLDEN_SEED_1;

  it('rejects a dump whose tiles do not match its hash, even with the histogram intact', () => {
    // The hash's job, isolated from the histogram's. *Swapping* two tiles of
    // different kinds leaves every `tiles` count, every `counts` field, every
    // band and every dimension exactly as printed — the histogram check cannot
    // see it — while the tile order, and so the hash, changes. This is the case
    // that justifies keeping both checks rather than just the cheap one.
    const lines = good.replace(/\n$/, '').split('\n');
    const top = lines.indexOf('map') + 1;
    expect(lines[top][0]).toBe('#');
    expect(lines[top + 10][0]).toBe('.');
    lines[top] = `.${lines[top].slice(1)}`;
    lines[top + 10] = `#${lines[top + 10].slice(1)}`;
    const broken = `${lines.join('\n')}\n`;
    expect(broken).not.toBe(good);

    // The histogram really is blind to it: the swapped dump's counts are the
    // golden's counts, unchanged.
    for (const k of TERRAIN_KEYS) {
      expect(field(broken, 'tiles', k), `${k} count after the swap`).toBe(
        field(good, 'tiles', k),
      );
    }
    expect(() => parseTerrainDump(broken)).toThrow(/hash mismatch/);
  });

  it('rejects structural damage with a message naming the damage', () => {
    const cases: ReadonlyArray<readonly [string, string, RegExp]> = [
      ['empty', '', /expected a "terrain WxH" header/],
      ['blank line only', '\n', /expected a "terrain WxH" header/],
      ['bad header', good.replace('terrain 56x32', 'terrain 56 by 32'), /terrain WxH/],
      ['missing rows', good.split('\n').slice(0, -3).join('\n'), /header says 32 rows/],
      [
        'extra row',
        `${good}${'#'.repeat(GRID_W)}\n`,
        /header says 32 rows/,
      ],
      [
        'short row',
        good.replace(
          '##################.#####################################\n',
          '#....#\n',
        ),
        /glyphs/,
      ],
      ['unknown glyph', good.replace('##################.#', '##################?#'), /unknown glyph/],
      ['renamed legend', good.replace('normal=.', 'normal=o'), /legend says normal="o"/],
      ['no map marker', good.replace('\nmap\n', '\nmapp\n'), /expected a "map" line/],
      ['no gates line', good.replace(/^gates .*\n/m, ''), /expected "gates" line/],
      ['gate not a pair', good.replace('west=0,10', 'west=0'), /gate "west" is not "tx,ty"/],
      ['non-numeric band', good.replace('walkable=0.736607', 'walkable=lots'), /non-numeric/],
      ['non-boolean band', good.replace('corridors=true', 'corridors=yes'), /non-boolean/],
      ['field with no value', good.replace('attempts=1', 'attempts'), /malformed field/],
      ['field with no key', good.replace('attempts=1', '=1'), /malformed field/],
      ['header word only', 'terrain 56x32\nseed\n', /"seed" line has no "requested"/],
      ['truncated after the header', 'terrain 56x32\n', /missing "seed" line/],
      ['zero width', good.replace('terrain 56x32', 'terrain 0x32'), /degenerate dimensions/],
      // Duplicate keys were last-wins, which turned "the dump had no hash" into
      // "someone appended six characters to the seed line".
      ['duplicate field', good.replace(/^(seed .*)$/m, '$1 hash=-'), /duplicate "hash"/],
      [
        'duplicate band',
        good.replace('walkable=0.736607', 'walkable=0.669444 walkable=9'),
        /duplicate "walkable"/,
      ],
      // Provenance is all-or-nothing; a half-dashed seed line silently dropped
      // the hash check on a dump that looks like it carries one.
      ['half provenance', good.replace(/hash=[0-9a-f]+/, 'hash=-'), /all-or-nothing/],
      [
        'seed outside the generator domain',
        good.replace('requested=1', 'requested=99999999999'),
        /outside \[-2147483648, 4294967295\]/,
      ],
      [
        'effective seed above uint32',
        // Passes the hash check on its own — `terrainHash` folds `seed | 0`, so
        // any multiple of 2**32 is invisible to it.
        good.replace('effective=1', 'effective=4294967297'),
        /outside \[0, 4294967295\]/,
      ],
      // fb064n moved this floor from 1 to 0: `flatTerrain()` honestly reports
      // `attempts: 0` (no generation attempt ran for it), so its own dump has
      // to reload. Negative is still refused — the field counts attempts.
      ['negative attempts', good.replace('attempts=1', 'attempts=-1'), /outside \[0, /],
      // And the widened floor did not become a hole: `attempts=0` is the flat
      // arena and nothing else, so it cannot be pasted onto a generated map's
      // provenance. `good` is seed 1, `fallback=false`. Full coverage of the
      // shape lives in `tests/terrain-flat.test.ts`.
      // Pinned to fb064n's own wording, not to `/flat arena/` (fb064s QA bug 4):
      // fb064s's tile check says "the flat arena" too, so the loose pattern
      // would pass even if this check were deleted and the other one caught it.
      [
        'zero attempts on a generated map',
        good.replace('attempts=1', 'attempts=0'),
        /attempts=0 is only the flat arena/,
      ],
      // `-0` used to be normalised to `0`, which cost text-stability: this dump
      // reloaded and re-dumped with a different string than it went in with.
      ['minus zero', good.replace('attempts=1', 'attempts=-0'), /-0 and 0 are one value/],
      ['leading zero', good.replace('attempts=1', 'attempts=01'), /non-numeric/],
      ['gate moved', good.replace('west=0,10', 'west=9,9'), /gate "west" is at 9,9/],
      // fb064s. Same rule as the legend check one line of reasoning above: a
      // dump written by a future version with a third source is refused rather
      // than decoded as one of today's two.
      ['unknown source', good.replace('source=generator', 'source=magic'), /source="magic"/],
      // Pinned to the exact message, not to an alternation: this is the one
      // assertion recording that a pre-fb064s dump is *refused* rather than
      // read as provenance-free, and an alternation would pass under either
      // decision.
      ['missing source', good.replace('source=generator ', ''), /predates the field/],
    ];
    for (const [name, text, want] of cases) {
      expect(() => parseTerrainDump(text), name).toThrow(want);
    }
  });

  it('rejects a mangled dump even when no hash check can run', () => {
    // The hole both review and QA found. The hash only covers an arena-sized
    // dump that carries provenance; on the other two paths the rows used to be
    // decoded with nothing validating them at all, so a one-glyph mangle
    // returned a map that contradicted its own printed `tiles` line. The
    // histogram check closes both, using redundancy the dump already carries.
    const mangle = (text: string): string => {
      const lines = text.replace(/\n$/, '').split('\n');
      const y = lines.indexOf('map') + 11;
      lines[y] = `${lines[y].slice(0, 1)}#${lines[y].slice(2)}`;
      return `${lines.join('\n')}\n`;
    };

    // (a) provenance-free: a hand-built grid, which the suite blesses above.
    const map = generateTerrain(1, cfg);
    const bare: TerrainGrid = { w: map.w, h: map.h, kind: Uint8Array.from(map.kind) };
    const bareText = describeTerrain(bare, cfg);
    expect(field(bareText, 'seed', 'hash')).toBe('-');
    expect(() => parseTerrainDump(mangle(bareText))).toThrow(/the rows have/);

    // (b) non-arena dimensions: fb064f's announced Training Grounds override,
    // where the hash is present but `terrainHash`'s hardcoded GRID_W/GRID_H
    // means it cannot be re-derived.
    const small: TerrainGrid = { w: 12, h: 14, kind: new Uint8Array(12 * 14) };
    const smallText = describeTerrain(small, cfg);
    expect(() => parseTerrainDump(mangle(smallText))).toThrow(/"tiles" line says normal=168/);

    // And the `counts normal=` field is cross-checked too, independently of the
    // `tiles` line, since `normal` is a kind count wearing another name.
    expect(() => parseTerrainDump(good.replace('normal=992 coreAnchors', 'normal=991 coreAnchors')))
      .toThrow(/"counts" line says normal=991/);
  });

  it('refuses a "-0" seed rather than normalising it', () => {
    // fb064j's concern, kept: `types.ts` promises `requestedSeed` is
    // `-0`-normalised, and `Number('-0')` is `-0`, which compares equal to `0`
    // under `===` but not under `Object.is` — what vitest's `toBe`, a
    // deep-equal and a JSON round-trip all use. The promise has to hold on the
    // parse path or it holds on neither.
    //
    // fb064n tightened *how* it holds, from normalise to refuse, on QA's
    // finding. Both keep `-0` out of a `TerrainMap`; refusing also keeps the
    // format text-stable, which normalising did not — a dump saying
    // `requested=-0` reloaded and re-dumped as `requested=0`, so the round trip
    // silently changed the string. It also removes a contradiction inside
    // `num()`, three lines below its own "a dump has exactly one spelling per
    // value" rule. No writer emits `-0` (`generateTerrain` normalises before
    // the field is written), so only mangled input is affected.
    expect(() => parseTerrainDump(good.replace('requested=1', 'requested=-0'))).toThrow(
      /-0 and 0 are one value/,
    );
    // The invariant fb064j was protecting, restated as the thing that matters:
    // no parse can hand back a `-0`.
    const d = parseTerrainDump(good);
    expect(Object.is(d.provenance?.requestedSeed, -0)).toBe(false);
  });

  it('absorbs CRLF and a BOM rather than blaming the header', () => {
    // The likeliest paste artefact on this host, and the one that produced the
    // worst message: `expected a "terrain WxH" header, got "terrain 56x32"`,
    // quoting two strings that are identical on screen.
    const crlf = good.replace(/\n/g, '\r\n');
    expect(crlf).not.toBe(good);
    expect(Array.from(parseTerrainDump(crlf).kind)).toEqual(
      Array.from(parseTerrainDump(good).kind),
    );
    expect(Array.from(parseTerrainDump(`﻿${good}`).kind)).toEqual(
      Array.from(parseTerrainDump(good).kind),
    );
    // Normalising CRLF must not also swallow a genuine blank row.
    expect(() => parseTerrainDump(`${crlf}\r\n`)).toThrow(/header says 32 rows/);
  });

  it('refuses an oversized header before allocating for it', () => {
    // `w` came straight out of the header and was used to size the buffer
    // before any row was measured, so a nine-line dump allocated 4.3 GB and
    // only then discovered its single row was one glyph long.
    const huge = good
      .replace('terrain 56x32', 'terrain 4294967295x1')
      .replace(/map\n[\s\S]*$/, 'map\n.\n');
    const before = process.memoryUsage().arrayBuffers;
    expect(() => parseTerrainDump(huge)).toThrow(/row 0 is 1 glyphs/);
    expect(process.memoryUsage().arrayBuffers - before).toBeLessThan(64 * 1024 * 1024);
  });

  it('refuses to dump a grid it cannot describe honestly', () => {
    // Both of these produce a plausible-looking dump if unchecked — a short
    // buffer silently truncates the map, an out-of-range kind indexes past the
    // glyph table and writes `undefined` into a row.
    expect(() => describeTerrain({ w: GRID_W, h: GRID_H, kind: new Uint8Array(10) }, cfg)).toThrow(
      /kind length 10/,
    );
    const bad = synthetic(TerrainKind.Normal);
    bad.kind[5] = TERRAIN_KEYS.length;
    expect(() => describeTerrain(bad, cfg)).toThrow(/no such tile kind/);

    // The kind guard is two-sided and integrality-checked. A `Uint8Array` holds
    // neither, but a JS caller or a `JSON.parse`d grid arrives with a plain
    // array that does, and both failure modes are silent: `0.5` writes the
    // string `undefined` into a row, `-1` dumps an all-zero histogram.
    const asGrid = (kind: number[]): TerrainGrid =>
      ({ w: 2, h: 1, kind: kind as unknown as Uint8Array }) as TerrainGrid;
    expect(() => describeTerrain(asGrid([0, -1]), cfg)).toThrow(/no such tile kind/);
    expect(() => describeTerrain(asGrid([0, 0.5]), cfg)).toThrow(/no such tile kind/);

    // Dimensions must be positive integers. `{ w: 2.5, h: 2 }` has a consistent
    // 5-tile buffer, so the length check alone passed it and the rows came out
    // as the literal text `undefined`; `{ w: 0, h: 5 }` crashed inside
    // `blockMask` with a raw typed-array error instead of a named refusal.
    expect(() => describeTerrain({ w: 2.5, h: 2, kind: new Uint8Array(5) }, cfg)).toThrow(
      /positive integers/,
    );
    expect(() => describeTerrain({ w: 0, h: 5, kind: new Uint8Array(0) }, cfg)).toThrow(
      /positive integers/,
    );
  });

  it('a dump missing its trailing newline still parses; a doubled one does not', () => {
    // Chat clients and editors both strip a trailing newline, and a report that
    // failed for that reason would waste the reader's time. A *doubled* newline
    // is a different thing — a blank row — and is refused.
    expect(Array.from(parseTerrainDump(good.replace(/\n$/, '')).kind)).toEqual(
      Array.from(parseTerrainDump(good).kind),
    );
    expect(() => parseTerrainDump(`${good}\n`)).toThrow(/header says 32 rows/);
  });
});

describe('fb064w — a header line is refused unless its fields are exactly what the writer emits', () => {
  const good = GOLDEN_SEED_1;
  /** Every `head a=1 b=2` line in a dump, by head word, in emitted order. */
  const HEADS = ['seed', 'gates', 'bands', 'counts', 'tiles', 'legend'] as const;

  /** The one line of `text` starting with `head`, as emitted. */
  function headerLine(text: string, head: string): string {
    const line = text
      .replace(/\n$/, '')
      .split('\n')
      .find((l) => l.startsWith(`${head} `));
    if (line === undefined) throw new Error(`test bug: no "${head}" line`);
    return line;
  }

  it('refuses an unknown field on every header line, naming the key and the line', () => {
    // `fields()` used to collect any `key=value` into a `Map` that only named
    // readers ever looked in, so `hash=54fad3db bogus=1` parsed clean — the one
    // shape of damage the format did not refuse, in a parser written to
    // "refuse what the writer never emits rather than reinterpret it".
    for (const head of HEADS) {
      const line = headerLine(good, head);
      const broken = good.replace(line, `${line} bogus=1`);
      expect(broken, `${head}: the mutation must change the text`).not.toBe(good);
      expect(() => parseTerrainDump(broken), head).toThrow(/unknown "bogus" on the "/);
      expect(() => parseTerrainDump(broken), head).toThrow(new RegExp(`"${head}" line`));
    }
  });

  it('refuses a hash that is not a hash, which is how a tab smuggles fields past the key set', () => {
    // QA bug 1. `fields()` splits on a single space, so text separated by a
    // *tab* is not a field and never reaches the unknown-key check — and `hash`
    // was the one header value with no shape check at all, so it was free text.
    // On an arena-sized dump the hash comparison catches the result; on a
    // non-arena one (fb064f's announced Training Grounds shape) it cannot run,
    // which is the same coverage hole the glyph histogram was written for. So
    // the field is pinned to what `terrainHash` can actually produce.
    const small: TerrainMap = {
      w: 3,
      h: 3,
      kind: new Uint8Array(9),
      requestedSeed: 5,
      seed: 5,
      attempts: 1,
      fallback: false,
      hash: 'deadbeef',
    };
    const text = describeTerrain(small, cfg);
    expect(() => parseTerrainDump(text)).not.toThrow();
    expect(() =>
      parseTerrainDump(text.replace('hash=deadbeef', 'hash=deadbeef\tsource=flat-arena')),
    ).toThrow(/non-hash/);
    expect(() => parseTerrainDump(text.replace('hash=deadbeef', 'hash=not-a-hash'))).toThrow(
      /non-hash/,
    );
    expect(() => parseTerrainDump(text.replace('hash=deadbeef', 'hash=DEADBEEF'))).toThrow(
      /non-hash/,
    );
    // Every hash the writer emits satisfies it, over both shapes.
    for (let seed = 1; seed <= 60; seed++) {
      expect(generateTerrain(seed, cfg).hash).toMatch(/^[0-9a-f]{8}$/);
    }
    expect(flatTerrain().hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('names the expected key set and order in its two new refusals', () => {
    // QA bug 2. The standard this file already holds itself to: the gate check
    // prints `this build has it at 3,10`, the legend prints `this build uses
    // "."`, and fb064s's own message was upgraded to name the remedy. A reader
    // retyping a pasted dump by hand is exactly the audience.
    expect(() =>
      parseTerrainDump(
        good.replace(
          /^seed source=generator requested=1 /m,
          'seed requested=1 source=generator ',
        ),
      ),
    ).toThrow(/expected source requested effective attempts fallback hash/);
    expect(() => parseTerrainDump(good.replace(/^(counts .*)$/m, '$1 note=1'))).toThrow(
      /expected walkable normal coreAnchors/,
    );
  });

  it('refuses a field whose key belongs to a different header line', () => {
    // The near-miss the plain `bogus=1` case does not cover: a key that is real
    // *somewhere* in the format. `walkable` is a `bands` key and a `counts`
    // key, and neither line may borrow the other's fields.
    expect(() => parseTerrainDump(good.replace(/^counts /m, 'counts coreLegal=1 '))).toThrow(
      /unknown "coreLegal" on the "counts" line/,
    );
    expect(() => parseTerrainDump(good.replace(/^tiles /m, 'tiles west=0,10 '))).toThrow(
      /unknown "west" on the "tiles" line/,
    );
  });

  it('pins field order on every header line', () => {
    // fb064s made the seed line's *layout* a contract: `source` is worth having
    // because a reader's eye reaches it before `requested=0`. That was a
    // guarantee about what `describeTerrain` writes and not about what
    // `parseTerrainDump` accepts, so a hand-edited dump could put the mark last
    // and still parse — and a reader who trusted the format would be reading a
    // line whose shape the format never promised.
    for (const head of HEADS) {
      const line = headerLine(good, head);
      const parts = line.split(' ');
      expect(parts.length, `${head}: needs two fields to reorder`).toBeGreaterThan(2);
      // Every adjacent pair, not just the first two: on the `seed` line the
      // first swap is exactly fb064s's transposition, but on the other five
      // that alone would only prove that *some* swap is refused.
      for (let i = 1; i < parts.length - 1; i++) {
        const swapped = [
          ...parts.slice(0, i),
          parts[i + 1],
          parts[i],
          ...parts.slice(i + 2),
        ].join(' ');
        expect(
          () => parseTerrainDump(good.replace(line, swapped)),
          `${head}: ${parts[i]} <-> ${parts[i + 1]}`,
        ).toThrow(/fields are in a fixed order/);
      }
    }
  });

  it('names both keys when the order is wrong', () => {
    expect(() =>
      parseTerrainDump(
        good.replace(
          /^seed source=generator requested=1 /m,
          'seed requested=1 source=generator ',
        ),
      ),
    ).toThrow(/"seed" line has "source" after "requested"; fields are in a fixed order/);
  });

  it('declares exactly the fields the writer emits, in the emitted order', () => {
    // Both directions, because the accept tests below only catch one of them.
    // A key the *writer* adds or moves reddens those; a key left in
    // `HEADER_KEYS` that nothing emits reddens nothing at all — and that is the
    // leniency this item removed, reintroduced by a typo in the table the item
    // created. Review reproduced it: `legacyGhost` added to `HEADER_KEYS.counts`
    // left every test in this file green and let
    // `counts ... legacyGhost=1` parse clean.
    //
    // **fb065f made `gates` the one line with an optional declared key**, so it
    // is compared against the *maximal* dump — the four-gate one — rather than
    // against `good`. The guarantee is unchanged in the direction that matters:
    // every key the table declares must be a key the writer can emit. What it
    // no longer says is that every declared key appears in *every* dump, which
    // was never the claim the table made (its own doc block calls it a
    // no-extras-in-this-order list, never a required-key list).
    const maximal = describeTerrain(generateTerrain(7, cfg, FOUR_GATES), cfg, FOUR_GATES);
    for (const head of HEADS) {
      const from = head === 'gates' ? maximal : good;
      const emitted = headerLine(from, head)
        .split(' ')
        .slice(1)
        .map((f) => f.slice(0, f.indexOf('=')));
      expect(emitted, head).toEqual([...HEADER_KEYS[head]]);
    }
    expect([...Object.keys(HEADER_KEYS)].sort()).toEqual([...HEADS].sort());
  });

  it('pins the gates line’s refusal text, which fb065f changed silently', () => {
    // fb065f widened `HEADER_KEYS.gates`, which widened the key set these two
    // messages enumerate — from `west north east` to `west north east south`.
    // That is forced by the design and is fine; what was not fine is that the
    // item claimed the messages were unchanged and no test could have caught
    // it, because the existing coverage pins only the `seed` and `counts`
    // lines. Pinned here so the next modifier gate makes the text change
    // visible in review instead of in a QA report.
    const dump = describeTerrain(generateTerrain(7, cfg), cfg);
    const line = headerLine(dump, 'gates');
    expect(() => parseTerrainDump(dump.replace(line, `${line} bogus=1,1`))).toThrow(
      'parseTerrainDump: unknown "bogus" on the "gates" line; expected west north east south',
    );
    expect(() =>
      parseTerrainDump(dump.replace(line, 'gates north=18,0 west=0,10 east=35,17')),
    ).toThrow(
      'parseTerrainDump: "gates" line has "west" after "north"; ' +
        'fields are in a fixed order, expected west north east south',
    );
  });

  it('keeps the optional gate key last, which is what keeps the order pin total', () => {
    // The argument that lets `gates` carry an optional key without weakening
    // fb064w. `fields()` refuses a declared key that appears after one further
    // down the list, and a *missing* declared key falls through to `req` — so
    // an optional key is only safe where no declared key can follow it, i.e.
    // last. Pinned mechanically: a future modifier gate name inserted anywhere
    // but the end reddens here rather than silently reopening the hole.
    const base = GATES.map((g) => g.key);
    expect(HEADER_KEYS.gates.slice(0, base.length)).toEqual(base);
    // Every optional key trails the required ones. A *second* trailing optional
    // key would still be safe by the same argument — one declared among the
    // base three would not, and that is what this pins.
    expect(HEADER_KEYS.gates.slice(base.length)).toEqual(MODIFIER_GATES.map((g) => g.key));
    // ...and it really is refused out of order, not merely declared last.
    const four = describeTerrain(generateTerrain(7, cfg, FOUR_GATES), cfg, FOUR_GATES);
    expect(() =>
      parseTerrainDump(four.replace('gates west=0,10', 'gates south=12,19 west=0,10')),
    ).toThrow(/fields are in a fixed order/);
  });

  it('requires every field it declares, which is what makes the order pin total', () => {
    // The unstated invariant `HEADER_KEYS` now documents: the order check only
    // sees the fields that are *present*, so an optional field would be
    // accepted anywhere the indices still increase and the seed line's layout
    // would stop being a contract. Pinned mechanically rather than asserted in
    // a comment — drop each emitted field in turn and every one is refused.
    //
    // fb065f's optional `south` does not weaken this: `good` is a three-gate
    // dump so it never appears here, and the case above pins it as the *last*
    // declared key, which is the one position from which nothing can follow it.
    // A modifier gate declared anywhere else would be exactly the hole this
    // case is written against, and would redden that one.
    for (const head of HEADS) {
      const line = headerLine(good, head);
      const parts = line.split(' ');
      for (let i = 1; i < parts.length; i++) {
        const without = [...parts.slice(0, i), ...parts.slice(i + 1)].join(' ');
        expect(() => parseTerrainDump(good.replace(line, without)), `${head} without ${parts[i]}`)
          .toThrow();
      }
    }
  });

  it('accepts every line the writer emits, for a generated map and the flat arena', () => {
    // The other side of the same rule: a key set declared by hand is a second
    // place for the format to live, and this is what catches it drifting from
    // `describeTerrain`. Both emitted shapes, since the flat arena's seed line
    // differs from a generated map's only in its values.
    expect(() => parseTerrainDump(good)).not.toThrow();
    expect(() => parseTerrainDump(describeTerrain(flatTerrain(), cfg))).not.toThrow();
    for (let seed = 1; seed <= 40; seed++) {
      const map = generateTerrain(seed, cfg);
      expect(() => parseTerrainDump(describeTerrain(map, cfg)), `seed ${seed}`).not.toThrow();
    }
  });

  it('leaves the provenance-free seed line acceptable', () => {
    // `seed source=- requested=- ...` is the other shape `describeTerrain`
    // emits, and it carries the same keys in the same order.
    const grid: TerrainGrid = { w: GRID_W, h: GRID_H, kind: generateTerrain(3, cfg).kind.slice() };
    const text = describeTerrain(grid, cfg);
    expect(headerLine(text, 'seed')).toContain('source=-');
    expect(() => parseTerrainDump(text)).not.toThrow();
  });

  it('keeps a missing field reporting as missing, not as a set mismatch', () => {
    // The key set is checked as "no extras, in order", never as "exactly
    // these", so every existing missing-field message is untouched. `source`
    // is the one that matters most: its refusal tells a reader of a pre-fb064s
    // dump how to repair the text by hand, and a set check would have replaced
    // it with a generic complaint.
    expect(() => parseTerrainDump(good.replace('source=generator ', ''))).toThrow(
      /predates the field/,
    );
    expect(() => parseTerrainDump(good.replace(' coreAnchors=522', ''))).toThrow(
      /"counts" line has no "coreAnchors"/,
    );
    expect(() => parseTerrainDump(good.replace(' high=118', ''))).toThrow(
      /"tiles" line has no "high"/,
    );
  });

  it('still refuses a duplicate before it refuses the order', () => {
    // `duplicate "hash"` is the message fb064k recorded for a six-character
    // append to the seed line, and an order check that ran first would have
    // renamed it.
    expect(() => parseTerrainDump(good.replace(/^(seed .*)$/m, '$1 hash=-'))).toThrow(
      /duplicate "hash"/,
    );
    expect(() =>
      parseTerrainDump(good.replace('walkable=0.736607', 'walkable=0.669444 walkable=9')),
    ).toThrow(/duplicate "walkable"/);

    // ...and the other way round for a key the format never had: `unknown` is
    // checked first, so a repeated invention reports the real problem (it is
    // not part of the format) rather than the incidental one.
    expect(() => parseTerrainDump(good.replace(/^(seed .*)$/m, '$1 bogus=1 bogus=2'))).toThrow(
      /unknown "bogus" on the "seed" line/,
    );
  });
});

/** Type-level: a `TerrainMap` is describable without a cast. */
export function _typecheck(m: TerrainMap): string {
  return describeTerrain(m);
}
