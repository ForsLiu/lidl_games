/**
 * SPEC-FINAL §10.5 (fb064k): the terrain repro format.
 *
 * A terrain bug used to be reported as a seed plus a screenshot, which is two
 * artefacts that can disagree and neither of which a test can consume.
 * `describeTerrain` collapses both into one deterministic string that carries
 * the provenance, the gates, every band `terrainLegal` judges, and the tiles
 * themselves; `parseTerrainDump` reads it back to a byte-identical `kind`
 * buffer, so a dump pasted into a report can be replayed rather than eyeballed.
 *
 * Two rules the format is built on, both learned from the rest of this module:
 *
 * 1. **The tile rows carry tiles and nothing else.** Overlaying gate markers on
 *    the map would read better and would destroy the round trip for any grid
 *    whose gate tile is not `normal` — which is a generator invariant
 *    (`flatKinds`), not a dump invariant, and hand-built grids in tests break
 *    it freely. Gates go in a header line instead.
 * 2. **A malformed dump throws.** Silently returning a short or mis-glyphed
 *    buffer would hand the caller a map that is not the one in the report, and
 *    the whole point of the format is that it is the same map, so a row mangled
 *    by a chat client is caught at the boundary rather than debugged as a
 *    generator defect. Two independent checks enforce it, and the split matters:
 *      - the **glyph histogram** printed on the `tiles` line is recounted from
 *        the decoded rows and must agree. This is config-free and dimension-free,
 *        so it covers *every* dump.
 *      - the **hash** is re-derived from the tiles and must agree. This is the
 *        stronger check — it catches a swap that preserves the histogram — but
 *        it only runs on an arena-sized dump that carries provenance, because
 *        `terrainHash` folds `GRID_W`/`GRID_H` rather than the map's own
 *        dimensions.
 *    The histogram check exists precisely because the hash's coverage has those
 *    two holes. Review and QA both found that with the hash alone, a
 *    provenance-free dump (or fb064f's announced non-arena Training Grounds
 *    dump) could be mangled by one glyph and still parse — returning a map that
 *    contradicted its own printed counts, which is the exact failure this rule
 *    is written against.
 *
 * Pure: the same map and config always produce the same string, byte for byte.
 * It is *not* free of `/data` opinions — `measureTerrain` reads the tile flags,
 * `coreGateClearance` (through `legalCoreAnchors`) and `minCorridorWidth`
 * (through `corridorsOk`), so a dump is only meaningful next to the config it
 * was taken under. That is why the parse never re-measures; see `TerrainDump`.
 */
import { GATES, GRID_H, GRID_W } from '../grid';
import { measureTerrain } from './analyze';
import {
  loadTerrain,
  TERRAIN_KEYS,
  TerrainKind,
  type TerrainConfig,
  type TerrainKey,
} from './config';
import { MAX_TERRAIN_SEED, MIN_TERRAIN_SEED, terrainHash } from './generate';
import type { TerrainGrid, TerrainMap, TerrainMeasure } from './types';

/**
 * One glyph per tile kind, keyed by `TerrainKey` so a *renamed or added* key is
 * a type error here rather than a dump that silently loses a kind. It does NOT
 * catch a reorder of `TERRAIN_KEYS` — the record still type-checks and every
 * glyph just shifts — so `describeTerrain`'s tests pin two glyphs by
 * `TerrainKind` to cover that; the authoritative reorder guard is
 * `config.ts`'s "order is load-bearing" refinement.
 *
 * All four are non-whitespace, and none is a digit, `-` or `=`: those appear in
 * the header lines, and a glyph that collided with one would make a hand-typed
 * dump ambiguous at exactly the moment someone is trying to read it. (`,` *is*
 * a glyph — `rough` — which is safe because the tile rows are decoded
 * positionally and never split on a delimiter.)
 *
 * These live in code rather than `/data`, a deliberate exception to
 * architecture rule 4: a Tuner-editable glyph would fork every golden and break
 * the round trip for every dump written before the edit. The format is a
 * diagnostic contract, not tuning. Recorded in the lane Log alongside
 * `core-placement.ts`'s `ROOM_RADIUS`.
 */
const GLYPHS: Readonly<Record<TerrainKey, string>> = {
  normal: '.',
  rough: ',',
  rock: '#',
  high: '^',
};

const GLYPH_BY_KIND: readonly string[] = TERRAIN_KEYS.map((k) => GLYPHS[k]);

/** Reverse of `GLYPH_BY_KIND`; built once, so an added kind cannot be missed. */
const KIND_BY_GLYPH: ReadonlyMap<string, number> = new Map(
  GLYPH_BY_KIND.map((g, kind) => [g, kind]),
);

// Two kinds sharing a glyph would break the round trip for one of them, and the
// `Record<TerrainKey, string>` type cannot express distinctness. Cheap, once.
if (KIND_BY_GLYPH.size !== GLYPH_BY_KIND.length) {
  throw new Error('describe.ts: two tile kinds share a glyph, so a dump cannot round-trip');
}

/**
 * Fixed-width fractions. `toFixed` pins the column count so dumps line up and
 * diff cleanly; `toString` would print 1 as `1` and 0.6708333333 in full. Both
 * are locale-independent (only `toLocaleString` is not), so this is a
 * formatting choice, not a correctness one.
 */
const FRAC_DIGITS = 6;

/** The provenance fields a `TerrainMap` carries and a bare `TerrainGrid` does not. */
type Provenance = Pick<TerrainMap, 'requestedSeed' | 'seed' | 'attempts' | 'fallback' | 'hash'>;

/** What `parseTerrainDump` reconstructs: the tiles, plus everything printed. */
export interface TerrainDump extends TerrainGrid {
  /** Present iff the dumped grid carried provenance (i.e. was a `TerrainMap`). */
  readonly provenance: Provenance | null;
  /** Gate positions as dumped, in `GATES` order. */
  readonly gates: ReadonlyArray<{ readonly key: string; readonly tx: number; readonly ty: number }>;
  /**
   * The bands *as printed*, not as re-measured.
   *
   * The fractions are therefore rounded to `FRAC_DIGITS`, and they reflect the
   * config the dump was written under, which the dump does not carry. That is
   * deliberate: a dump is a record of what was measured, and re-measuring it
   * here under whatever `/data` happens to be on disk now would silently
   * replace the reported numbers with different ones — turning the one artefact
   * that is supposed to settle "what did the generator actually produce" into a
   * second opinion.
   */
  readonly measure: TerrainMeasure;
  /** Tile counts by kind, in `TERRAIN_KEYS` order. */
  readonly tileCounts: readonly number[];
}

function hasProvenance(map: TerrainGrid): map is TerrainGrid & Provenance {
  return typeof (map as Partial<TerrainMap>).hash === 'string';
}

function frac(v: number): string {
  return v.toFixed(FRAC_DIGITS);
}

/**
 * The deterministic dump. `cfg` decides which tiles are walkable, so it decides
 * every band — pass the same config the map was generated under.
 */
export function describeTerrain(map: TerrainGrid, cfg: TerrainConfig = loadTerrain()): string {
  // Dimensions first, and stricter than "the buffer is the right size": a
  // `{ w: 2.5, h: 2 }` grid has a consistent 5-tile buffer, so the length check
  // alone waves it through and the rows come out as the literal text
  // `undefined`. `{ w: 0, h: 5 }` gets further still and dies inside
  // `blockMask` with `Invalid typed array length: -4`. Both are dumps
  // `parseTerrainDump` would refuse, so emitting them at all is a one-sided
  // format.
  if (!Number.isInteger(map.w) || !Number.isInteger(map.h) || map.w < 1 || map.h < 1) {
    throw new Error(`describeTerrain: dimensions must be positive integers, got ${map.w}x${map.h}`);
  }
  const n = map.w * map.h;
  // Same refusal as `terrainOverlay`, for the same reason: a short buffer or an
  // out-of-range kind would otherwise produce a plausible-looking dump with
  // missing or garbage tiles, which is worse than no dump at all.
  if (map.kind.length !== n) {
    throw new Error(`describeTerrain: kind length ${map.kind.length}, expected ${map.w}x${map.h}`);
  }
  const counts = new Array<number>(GLYPH_BY_KIND.length).fill(0);
  for (let i = 0; i < n; i++) {
    const k = map.kind[i];
    // Two-sided and integrality-checked, unlike `overlay.ts`'s upper-bound-only
    // guard. A `Uint8Array` cannot hold `-1` or `0.5`, but a JS caller or a
    // `JSON.parse`d grid can arrive with a plain array that does, and both
    // failure modes are silent: `0.5` writes the string `undefined` into a row,
    // `-1` dumps a histogram of all zeroes.
    if (!Number.isInteger(k) || k < 0 || k >= GLYPH_BY_KIND.length) {
      throw new Error(`describeTerrain: tile ${i} has kind ${k}, no such tile kind`);
    }
    counts[k]++;
  }

  const m = measureTerrain(map, cfg);
  const p = hasProvenance(map) ? map : null;
  const lines: string[] = [];
  lines.push(`terrain ${map.w}x${map.h}`);
  lines.push(
    p === null
      ? 'seed requested=- effective=- attempts=- fallback=- hash=-'
      : `seed requested=${p.requestedSeed} effective=${p.seed} attempts=${p.attempts} ` +
          `fallback=${p.fallback} hash=${p.hash}`,
  );
  lines.push(`gates ${GATES.map((g) => `${g.key}=${g.tx},${g.ty}`).join(' ')}`);
  lines.push(
    `bands walkable=${frac(m.walkableFrac)} buildableNormal=${frac(m.buildableNormalFrac)} ` +
      `gateReach=${frac(m.gateReachFrac)} coreLegal=${frac(m.coreLegalFrac)} ` +
      `gateDetour=${frac(m.maxGateDetour)} ` +
      `corridors=${m.corridorsOk} gatesOpen=${m.gatesOpen} gatesConnected=${m.gatesConnected}`,
  );
  lines.push(
    `counts walkable=${m.walkableCount} normal=${m.normalCount} coreAnchors=${m.legalCoreCount}`,
  );
  lines.push(`tiles ${TERRAIN_KEYS.map((k, i) => `${k}=${counts[i]}`).join(' ')}`);
  lines.push(`legend ${TERRAIN_KEYS.map((k) => `${k}=${GLYPHS[k]}`).join(' ')}`);
  lines.push('map');
  for (let y = 0; y < map.h; y++) {
    let row = '';
    for (let x = 0; x < map.w; x++) row += GLYPH_BY_KIND[map.kind[y * map.w + x]];
    lines.push(row);
  }
  return `${lines.join('\n')}\n`;
}

function fail(what: string): never {
  throw new Error(`parseTerrainDump: ${what}`);
}

/** `key=value` pairs from a `head a=1 b=2` line, with the head word checked. */
function fields(line: string | undefined, head: string): Map<string, string> {
  if (line === undefined) fail(`missing "${head}" line`);
  const parts = line.split(' ');
  if (parts[0] !== head) fail(`expected "${head}" line, got "${line}"`);
  const out = new Map<string, string>();
  for (let i = 1; i < parts.length; i++) {
    const eq = parts[i].indexOf('=');
    // `eq <= 0` rejects both `attempts` (no `=`, index -1) and `=5` (empty key,
    // index 0). An empty key would otherwise become a real map entry that no
    // reader looks up, which is a silent way to carry garbage.
    if (eq <= 0) fail(`malformed field "${parts[i]}" on the "${head}" line`);
    const key = parts[i].slice(0, eq);
    // Last-write-wins is how a six-character append disables the integrity
    // check: ` hash=-` on the end of the seed line drops provenance entirely
    // and takes the hash verification with it. Refuse rather than reinterpret —
    // the same rule the legend check below is written to.
    if (out.has(key)) fail(`duplicate "${key}" on the "${head}" line`);
    out.set(key, parts[i].slice(eq + 1));
  }
  return out;
}

function req(f: Map<string, string>, head: string, key: string): string {
  const v = f.get(key);
  if (v === undefined) fail(`"${head}" line has no "${key}"`);
  return v;
}

function num(f: Map<string, string>, head: string, key: string): number {
  const raw = req(f, head, key);
  // `Number('')` is 0, `Number(' 1 ')` is 1, `Number('0x10')` is 16 and
  // `Number('1e3')` is 1000; none is something a dump should be read as having
  // said. Leading zeros are refused too, so `01` and `1` cannot both denote the
  // same field — a dump has exactly one spelling per value.
  if (!/^-?(0|[1-9]\d*)(\.\d+)?$/.test(raw)) {
    fail(`"${head}" line has non-numeric ${key}="${raw}"`);
  }
  const v = Number(raw);
  // `-0` survives the regex and `Number('-0')` is `-0`, which compares equal to
  // `0` under `===` but not under `Object.is` — the exact trap fb064j closed in
  // `generateTerrain` and documented in `types.ts`.
  //
  // Refused rather than normalised (fb064n). Normalising made `-0` and `0` two
  // spellings of one value, which is the rule the leading-zero check above
  // exists to enforce, and it cost text-stability: a dump saying `attempts=-0`
  // reloaded and re-dumped as `attempts=0`, so the round trip was not a round
  // trip. No writer emits it — `generateTerrain` normalises `-0` before the
  // field is ever written — so this refuses only mangled input. `Object.is` is
  // the test, not `raw === '-0'`, because `-0.000000` is the same value wearing
  // a different spelling.
  if (Object.is(v, -0)) {
    fail(`"${head}" line has ${key}="${raw}"; -0 and 0 are one value, write 0`);
  }
  return v;
}

/** `num`, restricted to an integer in an inclusive range. */
function intIn(f: Map<string, string>, head: string, key: string, lo: number, hi: number): number {
  const v = num(f, head, key);
  if (!Number.isInteger(v) || v < lo || v > hi) {
    fail(`"${head}" line has ${key}=${v}, outside [${lo}, ${hi}]`);
  }
  return v;
}

function bool(f: Map<string, string>, head: string, key: string): boolean {
  const raw = req(f, head, key);
  if (raw !== 'true' && raw !== 'false') fail(`"${head}" line has non-boolean ${key}="${raw}"`);
  return raw === 'true';
}

/**
 * Read a dump back. Byte-identical `kind` to whatever `describeTerrain` was
 * given, or a throw naming what is wrong with the text.
 */
export function parseTerrainDump(text: string): TerrainDump {
  // A dump's whole job is to survive a trip through a bug report, so the two
  // things that trip does to text are absorbed here rather than diagnosed as
  // corruption: a leading BOM, and CRLF line endings. CRLF is not hypothetical
  // on this repo — `core.autocrlf` is true with no `.gitattributes`, so every
  // checked-out file is CRLF — and refusing it produced the worst possible
  // message, `expected a "terrain WxH" header, got "terrain 36x20"`, quoting
  // two strings that are identical on screen. Neither `\r` nor the BOM can be a
  // glyph or part of a field, so normalising loses nothing.
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  // Exactly one trailing newline is what `describeTerrain` emits. A *missing*
  // one is accepted (editors and chat clients strip it); an *extra* one is a
  // blank row and is refused by the row-count check below.
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();

  // `''.split()` yields `['']`, so `lines[0]` is always a string and the header
  // regex is what rejects an empty dump.
  const dims = /^terrain (\d+)x(\d+)$/.exec(lines[0]);
  if (dims === null) fail(`expected a "terrain WxH" header, got "${lines[0]}"`);
  const w = Number(dims[1]);
  const h = Number(dims[2]);
  if (w <= 0 || h <= 0) fail(`degenerate dimensions ${w}x${h}`);

  const seedLine = fields(lines[1], 'seed');
  // Provenance is all-or-nothing in what `describeTerrain` emits, so it is
  // all-or-nothing here. A dump with four real fields and `hash=-` is a shape
  // the writer never produces, and reading it as "no provenance" would silently
  // drop the hash check on a dump that looks like it carries one — which is
  // exactly how a mangled dump slipped through before.
  const PROV_KEYS = ['requested', 'effective', 'attempts', 'fallback', 'hash'] as const;
  const dashes = PROV_KEYS.filter((k) => req(seedLine, 'seed', k) === '-').length;
  if (dashes !== 0 && dashes !== PROV_KEYS.length) {
    fail(`"seed" line mixes "-" with real values; provenance is all-or-nothing`);
  }
  let provenance: Provenance | null = null;
  if (dashes === 0) {
    provenance = {
      // The same domain `generateTerrain` accepts (fb064j). `requestedSeed` is
      // the field a reader pastes back into `--seed`, so a dump carrying one
      // the generator would refuse is a dead repro.
      requestedSeed: intIn(seedLine, 'seed', 'requested', MIN_TERRAIN_SEED, MAX_TERRAIN_SEED),
      // The effective seed is a uint32 RNG key. Unbounded, `effective` could be
      // off by any multiple of 2**32 and still pass the hash check, because
      // `terrainHash` folds `seed | 0` — an invisible corruption of the one
      // field that says which key produced these tiles.
      seed: intIn(seedLine, 'seed', 'effective', 0, 0xffffffff),
      // Floor 0, not 1: `flatTerrain()` reports `attempts: 0` because no
      // generation attempt ran for it (fb064n), and a dump of it must reload.
      // Negatives stay refused — the field counts attempts.
      attempts: intIn(seedLine, 'seed', 'attempts', 0, Number.MAX_SAFE_INTEGER),
      fallback: bool(seedLine, 'seed', 'fallback'),
      hash: req(seedLine, 'seed', 'hash'),
    };
    // Cross-field, because the `attempts` floor alone no longer constrains this
    // shape (fb064n). `attempts: 0` means no generation attempt ran, which
    // exactly one producer emits — `flatTerrain()`, always as
    // `fallback: true, seed: 0, requestedSeed: 0`. The generator cannot reach
    // it from the other side either: `maxAttempts` is a positive int, so its
    // fallback always reports at least one attempt.
    //
    // Worth a check rather than a comment because `generate.ts` tells readers to
    // "prefer `attempts` to tell the two flat maps apart", and without this the
    // one field fb064n made load-bearing is the one the parser stopped
    // constraining: `fallback=false` flipped by hand, or a forged `effective`,
    // both parsed clean and described a map no build can produce. Same rule as
    // the gate, legend and all-or-nothing provenance checks above — refuse what
    // the writer never emits rather than reinterpret it.
    if (
      provenance.attempts === 0 &&
      (!provenance.fallback || provenance.seed !== 0 || provenance.requestedSeed !== 0)
    ) {
      fail(
        'attempts=0 is only the flat arena, which is always ' +
          'requested=0 effective=0 fallback=true',
      );
    }
  }

  const gateLine = fields(lines[2], 'gates');
  const gates = GATES.map((g) => {
    const raw = req(gateLine, 'gates', g.key);
    const at = /^(-?\d+),(-?\d+)$/.exec(raw);
    if (at === null) fail(`gate "${g.key}" is not "tx,ty": "${raw}"`);
    // Checked against `GATES`, not merely read, for the reason the legend is
    // checked below: every band on the `bands` line was measured against the
    // real gate positions, so a dump claiming different ones is describing a
    // measurement that never happened.
    if (Number(at[1]) !== g.tx || Number(at[2]) !== g.ty) {
      fail(`gate "${g.key}" is at ${raw}, this build has it at ${g.tx},${g.ty}`);
    }
    return { key: g.key, tx: g.tx, ty: g.ty };
  });

  const bandLine = fields(lines[3], 'bands');
  const countLine = fields(lines[4], 'counts');
  const measure: TerrainMeasure = {
    walkableFrac: num(bandLine, 'bands', 'walkable'),
    buildableNormalFrac: num(bandLine, 'bands', 'buildableNormal'),
    gateReachFrac: num(bandLine, 'bands', 'gateReach'),
    coreLegalFrac: num(bandLine, 'bands', 'coreLegal'),
    // fb064o. Not a fraction: it is a ratio `>= 1`, or the `-1` sentinel for a
    // map with no measurable approach. `num` accepts both spellings, and
    // `frac`'s six digits are as exact here as they are for the fracs — the
    // dump carries the rounded value and `TerrainDump` already documents that
    // the bands are read back as printed rather than re-measured.
    maxGateDetour: num(bandLine, 'bands', 'gateDetour'),
    corridorsOk: bool(bandLine, 'bands', 'corridors'),
    gatesOpen: bool(bandLine, 'bands', 'gatesOpen'),
    gatesConnected: bool(bandLine, 'bands', 'gatesConnected'),
    walkableCount: num(countLine, 'counts', 'walkable'),
    normalCount: num(countLine, 'counts', 'normal'),
    legalCoreCount: num(countLine, 'counts', 'coreAnchors'),
  };

  const tileLine = fields(lines[5], 'tiles');
  const tileCounts = TERRAIN_KEYS.map((k) => num(tileLine, 'tiles', k));

  // The legend is checked rather than trusted: a dump written by a future
  // version with different glyphs must be refused, not decoded with today's
  // table into a different map that parses cleanly.
  const legendLine = fields(lines[6], 'legend');
  for (const k of TERRAIN_KEYS) {
    const got = req(legendLine, 'legend', k);
    if (got !== GLYPHS[k]) fail(`legend says ${k}="${got}", this build uses "${GLYPHS[k]}"`);
  }
  if (lines[7] !== 'map') fail(`expected a "map" line, got "${lines[7] ?? '<end of dump>'}"`);

  const rows = lines.slice(8);
  if (rows.length !== h) fail(`header says ${h} rows, dump has ${rows.length}`);
  // Every row is length-checked *before* the buffer is allocated. `w` comes
  // straight out of the header, so `terrain 4294967295x1` followed by a
  // one-glyph row used to allocate 4.3 GB and only then discover the row was
  // the wrong length. The rows are the cheap evidence; use them first.
  for (let y = 0; y < h; y++) {
    if (rows[y].length !== w) fail(`row ${y} is ${rows[y].length} glyphs, header says ${w}`);
  }
  const kind = new Uint8Array(w * h);
  const seen = new Array<number>(GLYPH_BY_KIND.length).fill(0);
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < w; x++) {
      const k = KIND_BY_GLYPH.get(row[x]);
      if (k === undefined) fail(`row ${y} column ${x} has unknown glyph "${row[x]}"`);
      kind[y * w + x] = k;
      seen[k]++;
    }
  }

  // Integrity check 1: the histogram. Free (the decode loop already counted it),
  // config-free and dimension-free, so unlike the hash below it covers every
  // dump — including a provenance-free one and fb064f's announced non-arena
  // Training Grounds dump, which are precisely the two paths where a
  // single-glyph mangle used to parse cleanly into a map that contradicted its
  // own printed counts.
  for (let i = 0; i < seen.length; i++) {
    if (seen[i] !== tileCounts[i]) {
      fail(`"tiles" line says ${TERRAIN_KEYS[i]}=${tileCounts[i]}, the rows have ${seen[i]}`);
    }
  }
  // `normalCount` is a kind count wearing a different name, so it is the one
  // `counts` field that can be cross-checked without a config. `walkable` and
  // `coreAnchors` cannot: both depend on `/data`, which a dump does not carry.
  if (seen[TerrainKind.Normal] !== measure.normalCount) {
    fail(`"counts" line says normal=${measure.normalCount}, the rows have ${seen[TerrainKind.Normal]}`);
  }

  // Integrity check 2: the hash. Stronger than the histogram — it catches a swap
  // that keeps the counts intact — but narrower. `terrainHash` folds
  // `GRID_W`/`GRID_H` rather than the map's own dimensions, so it can only be
  // re-derived for an arena-sized dump; a differently-sized one is left to the
  // histogram rather than checked against a hash of the wrong shape.
  if (provenance !== null && w === GRID_W && h === GRID_H) {
    const want = terrainHash(provenance.seed, kind);
    if (want !== provenance.hash) {
      fail(`hash mismatch: dump says ${provenance.hash}, these tiles hash to ${want}`);
    }
  }

  return { w, h, kind, provenance, gates, measure, tileCounts };
}
