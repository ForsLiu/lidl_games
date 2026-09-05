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
 *    generator defect. Three independent checks enforce it, and the split
 *    matters — each covers what the ones above it structurally cannot:
 *      - the **glyph histogram** printed on the `tiles` line is recounted from
 *        the decoded rows and must agree. This is config-free and dimension-free,
 *        so it covers *every* dump.
 *      - the **hash** is re-derived from the tiles and must agree. This is the
 *        stronger check — it catches a swap that preserves the histogram — but
 *        it only runs on an arena-sized dump that carries provenance, because
 *        `terrainHash` folds `GRID_W`/`GRID_H` rather than the map's own
 *        dimensions.
 *      - the **flat-arena mark** (`source=flat-arena`, fb064s) is compared
 *        against `flatTerrain()`'s actual bytes. The histogram counts kinds and
 *        not positions, and the hash is re-derived from the seed the *dump*
 *        claims, so a generated map wearing the flat arena's whole provenance
 *        agreed with both and parsed clean until this check existed.
 *
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
import { GATES, GRID_H, GRID_W, type GateDef } from '../grid';
import { measureTerrain } from './analyze';
import {
  loadTerrain,
  TERRAIN_KEYS,
  TerrainKind,
  type TerrainConfig,
  type TerrainKey,
} from './config';
import { flatTerrain, MAX_TERRAIN_SEED, MIN_TERRAIN_SEED, terrainHash } from './generate';
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

/**
 * What produced the tiles, printed as the first field of the `seed` line
 * (fb064s).
 *
 * The rest of that line answers "which seed?", and for every map
 * `generateTerrain` returns the answer is usable: paste `requested` into
 * `npm run sim -- --seed <n>` and the same tiles come back. `flatTerrain()` is
 * the one map where it is not. It has no seed at all — `requestedSeed` and
 * `seed` are `0` only because `TerrainMap` has nowhere to write "none"
 * (`generate.ts`) — so its dump used to read `requested=0 effective=0` and a
 * reader who took that at face value got seed 0's map, which is a scattered
 * map with a different hash. The only tell was `attempts=0`: unforgeable in the
 * parser since fb064n, and invisible to a human skimming a bug report, which is
 * the audience the format is for.
 *
 * Derived from `attempts`, never stored on `TerrainMap`. A sixth provenance
 * field would be a second place for the same fact to live and so a place for
 * the two to disagree; as a derivation the mark cannot contradict the count,
 * and the parser asserts the equivalence in both directions rather than
 * assuming it.
 *
 * **Printed first, and read that way too** (fb064w). The mark's value to a
 * human is that their eye reaches it before `requested=0`, which for one item
 * was a property of what `describeTerrain` emits and not of what
 * `parseTerrainDump` accepts: the parser read every header line as unordered
 * `key=value` pairs and accepted unknown ones, so a hand-edited dump could put
 * the mark last, or bury it among invented fields, and still parse as a dump of
 * this format. `HEADER_KEYS` now declares each line's fields once, in emitted
 * order, and the parser holds both.
 *
 * `generator` covers the degraded map too (`isDegradedMap`: `maxAttempts`
 * seeds all failed the bands, so the flat arena shipped under a real seed).
 * Its tiles are flat, but its `requested` *does* reproduce it, which is the
 * question this field answers.
 */
const SOURCE_FLAT = 'flat-arena';
const SOURCE_GENERATOR = 'generator';

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
 *
 * **It validates shape, not provenance, and the two are not the same rule.**
 * The guards below refuse a map whose dimensions or tile kinds would produce
 * literally unreadable text (`undefined` in a row, a histogram of zeroes) —
 * text no reader could act on. They do not refuse a map whose *provenance* is
 * impossible: `attempts: 0` on tiles that are not the flat arena is written
 * happily here and refused on the way back in (fb064s), as `attempts: 0` with
 * `fallback: false` already was (fb064n). That asymmetry is deliberate. This is
 * a diagnostic, and the moment a caller most needs a dump is the moment its map
 * is wrong; a writer that refused to describe a malformed map would withhold
 * the evidence exactly when it matters. Refusing on the read side loses
 * nothing, because a dump is only ever *acted on* after a parse.
 */
export function describeTerrain(
  map: TerrainGrid,
  cfg: TerrainConfig = loadTerrain(),
  gates: readonly GateDef[] = GATES,
): string {
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

  const m = measureTerrain(map, cfg, gates);
  const p = hasProvenance(map) ? map : null;
  const lines: string[] = [];
  lines.push(`terrain ${map.w}x${map.h}`);
  // `source` leads the line rather than trailing it: the whole point is that a
  // reader's eye reaches the mark before it reaches `requested=0`.
  lines.push(
    p === null
      ? 'seed source=- requested=- effective=- attempts=- fallback=- hash=-'
      : `seed source=${p.attempts === 0 ? SOURCE_FLAT : SOURCE_GENERATOR} ` +
          `requested=${p.requestedSeed} effective=${p.seed} attempts=${p.attempts} ` +
          `fallback=${p.fallback} hash=${p.hash}`,
  );
  // fb065f: the gate list the bands were measured against, not the base three.
  // The line is the dump's own statement of which arena it describes, which is
  // why `measureTerrain` above takes the same list — a short gate line is
  // visible to a reader, bands measured against a different arena are not.
  lines.push(`gates ${gates.map((g) => `${g.key}=${g.tx},${g.ty}`).join(' ')}`);
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

/**
 * Every header line's field list, in the order `describeTerrain` writes it
 * (fb064w).
 *
 * One declaration per line, and the three dynamic ones are derived from the
 * same tables the writer loops over rather than hand-copied, so a gate or a
 * tile kind cannot be added to the format on one side only.
 *
 * The list does double duty and the two duties are deliberately not the same
 * strength:
 *  - **no extras.** A key the writer never emits is refused, because reading it
 *    as "some future field, ignore it" is the one shape of damage this parser
 *    used to reinterpret rather than refuse — `hash=54fad3db bogus=1` parsed
 *    clean — in a file whose every other check is written the other way.
 *  - **in this order.** fb064s made the seed line's *layout* load-bearing: the
 *    value of `source` is that a reader's eye reaches it before `requested=0`.
 *    Until this pin that was a promise about what `describeTerrain` writes and
 *    not about what `parseTerrainDump` accepts, so a dump could put the mark
 *    last and still be read as a dump of the format.
 *
 * It is emphatically *not* a required-key list. Missing keys stay `req`'s job,
 * because each of those refusals says something specific about the field that
 * is gone — `source`'s names the remedy for a pre-fb064s dump — and a set
 * comparison here would replace all of them with one generic complaint.
 *
 * **That split rests on an invariant worth stating: every key here is `req`'d
 * by some reader below.** It is what makes the order pin *total* rather than
 * partial — a field no reader requires could be omitted, and the order check
 * only sees the fields that are present, so an optional field would be
 * accepted in any position that keeps the indices increasing and the seed
 * line's layout contract would quietly weaken again. A test drops each emitted
 * field in turn and expects a refusal, so the invariant is pinned rather than
 * merely asserted here.
 *
 * Exported for that test and for the one that compares this table against what
 * `describeTerrain` actually writes, in *both* directions: a key added here and
 * never emitted is the same leniency this item removed, reintroduced by a typo
 * in the table the item created.
 */
export const HEADER_KEYS = {
  seed: ['source', 'requested', 'effective', 'attempts', 'fallback', 'hash'],
  // fb065f: the base three, which every build has and every dump must carry,
  // plus the names a *modifier* can add. `south` is fb077's Fourth Gate
  // (`world.ts`), and it is declared here rather than accepted as a free-form
  // extra on purpose: an open-ended key set would have turned fb064w's
  // `unknown "bogus" on the "gates" line` into a confusing complaint about
  // coordinates, and the whole table exists to refuse what the writer never
  // emits. The cost is a real coupling — a new modifier gate adds its name
  // here — which is the same discipline every other line in this table follows.
  //
  // Declared is not required: `HEADER_KEYS` is a no-extras-in-this-order list,
  // never a required-key list (see the doc block above), so a three-gate dump
  // is unaffected and every existing golden is byte-identical.
  gates: [...GATES.map((g) => g.key), 'south'],
  bands: [
    'walkable',
    'buildableNormal',
    'gateReach',
    'coreLegal',
    'gateDetour',
    'corridors',
    'gatesOpen',
    'gatesConnected',
  ],
  counts: ['walkable', 'normal', 'coreAnchors'],
  tiles: [...TERRAIN_KEYS],
  legend: [...TERRAIN_KEYS],
} as const satisfies Record<string, readonly string[]>;

export type HeaderName = keyof typeof HEADER_KEYS;


/** `key=value` pairs from a `head a=1 b=2` line, with the head word checked. */
function fields(line: string | undefined, head: HeaderName): Map<string, string> {
  if (line === undefined) fail(`missing "${head}" line`);
  const parts = line.split(' ');
  if (parts[0] !== head) fail(`expected "${head}" line, got "${line}"`);
  const allowed: readonly string[] = HEADER_KEYS[head];
  const out = new Map<string, string>();
  // Index in `allowed` of the last field read, so order is checked against the
  // declaration rather than against a required-key count — which is what keeps
  // a *missing* field falling through to `req` with its own message.
  let prevAt = -1;
  let prevKey = '';
  for (let i = 1; i < parts.length; i++) {
    const eq = parts[i].indexOf('=');
    // `eq <= 0` rejects both `attempts` (no `=`, index -1) and `=5` (empty key,
    // index 0). An empty key would otherwise become a real map entry that no
    // reader looks up, which is a silent way to carry garbage.
    if (eq <= 0) fail(`malformed field "${parts[i]}" on the "${head}" line`);
    const key = parts[i].slice(0, eq);
    const at = allowed.indexOf(key);
    // Checked before the duplicate rule so that `bogus=1 bogus=2` reports the
    // real problem (the key is not part of the format) rather than the
    // incidental one. Every key the duplicate rule was written for is a known
    // key, so its messages are untouched.
    // The refusal names the key set, not just the offender: this file's own
    // standard (the gate check prints where *this build* has the gate, the
    // legend prints the glyph this build uses, and fb064s's message names the
    // remedy), and a human retyping a pasted dump is the audience.
    if (at < 0) fail(`unknown "${key}" on the "${head}" line; expected ${allowed.join(' ')}`);
    // Last-write-wins is how a six-character append disables the integrity
    // check: ` hash=-` on the end of the seed line drops provenance entirely
    // and takes the hash verification with it. Refuse rather than reinterpret —
    // the same rule the legend check below is written to.
    if (out.has(key)) fail(`duplicate "${key}" on the "${head}" line`);
    // `<`, not `!==`: a *missing* field leaves a gap in the sequence and must
    // still reach `req`, so only a field that moves backwards is a reorder.
    if (at < prevAt) {
      fail(
        `"${head}" line has "${key}" after "${prevKey}"; ` +
          `fields are in a fixed order, expected ${allowed.join(' ')}`,
      );
    }
    prevAt = at;
    prevKey = key;
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

/** The `hash` field, pinned to what `terrainHash` can produce. */
function hashField(f: Map<string, string>): string {
  const raw = req(f, 'seed', 'hash');
  if (!/^[0-9a-f]{8}$/.test(raw)) {
    fail(`"seed" line has non-hash hash="${raw}"; expected eight lowercase hex digits`);
  }
  return raw;
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

  // fb064s. Read separately from `PROV_KEYS` above rather than appended to it,
  // for the message: a dump written before this item has the other five fields
  // and not this one, and `req`'s bare `"seed" line has no "source"` would send
  // its reader hunting for a corrupted paste. It is refused — the same
  // build-lockstep rule the legend and gate checks are written to, since a dump
  // whose seed line this build cannot fully read is a dump this build cannot
  // vouch for — but the refusal says what happened and how to fix the text by
  // hand.
  const source = seedLine.get('source');
  if (source === undefined) {
    // The remedy is named for *this* dump, not for dumps in general (QA bug 1).
    // `describeTerrain` emits two shapes and the fix differs between them, so a
    // message offering both sent the reader of a provenance-free dump straight
    // into `provenance is all-or-nothing` — a second, unrelated refusal from
    // following the first one's advice. `dashes` is already known here.
    const remedy =
      dashes === PROV_KEYS.length
        ? 'this dump carries no provenance, so add source=-'
        : 'add source=generator, or source=flat-arena when attempts=0';
    fail(
      `"seed" line has no "source"; a dump written before fb064s predates the field — ${remedy}`,
    );
  }
  // The mark dashes with the rest: a real `source` beside five dashes is the
  // same half-provenance shape the check above refuses, one field wider.
  if ((source === '-') !== (dashes === PROV_KEYS.length)) {
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
      // Shape-checked, and it is the only header value that was not (QA bug 1).
      // `fields()` splits on a single space, so text separated by a *tab* is
      // never a field and never meets the unknown-key rule above — which made
      // free text in `hash` a way around fb064w's whole "no extras" contract:
      // `hash=deadbeef\tsource=flat-arena` parsed clean and put an arbitrary
      // string in `provenance.hash`. On an arena-sized dump the hash comparison
      // at the end catches the result, but that check cannot run on a
      // provenance-carrying *non-arena* dump (fb064f's Training Grounds shape)
      // — the same coverage hole the glyph histogram exists to cover. The
      // pattern is `terrainHash`'s own output shape: eight lowercase hex
      // digits, which is what `toString(16).padStart(8, '0')` of a uint32 is.
      hash: hashField(seedLine),
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

    // fb064s. The mark and `attempts` are two spellings of one fact, and the
    // mark is the readable one, so it is checked against the count in both
    // directions rather than believed. An unknown value is refused for the
    // reason the legend is: a dump written by a future version with a third
    // source must be refused, not silently read as one of today's two.
    if (source !== SOURCE_FLAT && source !== SOURCE_GENERATOR) {
      fail(
        `"seed" line has source="${source}", expected "${SOURCE_FLAT}" or "${SOURCE_GENERATOR}"`,
      );
    }
    if ((source === SOURCE_FLAT) !== (provenance.attempts === 0)) {
      fail(
        `"seed" line says source=${source} with attempts=${provenance.attempts}; ` +
          `source=${SOURCE_FLAT} is exactly attempts=0`,
      );
    }
  }

  const gateLine = fields(lines[2], 'gates');
  /** `"tx,ty"` as a pair, or a refusal naming the gate. */
  const at = (key: string, raw: string): readonly [number, number] => {
    const m = /^(-?\d+),(-?\d+)$/.exec(raw);
    if (m === null) fail(`gate "${key}" is not "tx,ty": "${raw}"`);
    return [Number(m[1]), Number(m[2])];
  };
  const gates = GATES.map((g) => {
    const [tx, ty] = at(g.key, req(gateLine, 'gates', g.key));
    // Checked against `GATES`, not merely read, for the reason the legend is
    // checked below: every band on the `bands` line was measured against the
    // real gate positions, so a dump claiming different ones is describing a
    // measurement that never happened. This holds for the base three only —
    // they are fixed by the build — while fb077's modifier gates are read as
    // written, because there is nothing to check them against.
    if (tx !== g.tx || ty !== g.ty) {
      fail(`gate "${g.key}" is at ${tx},${ty}, this build has it at ${g.tx},${g.ty}`);
    }
    return { key: g.key, tx: g.tx, ty: g.ty };
  });
  // fb065f: the modifier gates, when present. Nothing in this build knows where
  // one belongs — `world.ts` chooses the tile — so the only check available is
  // that it is a tile at all, which is worth making: the alternative is a dump
  // whose `gates` line indexes off the board and whose bands were therefore
  // measured somewhere the reader cannot see.
  const BASE = new Set(GATES.map((g) => g.key));
  for (const key of HEADER_KEYS.gates) {
    if (BASE.has(key)) continue;
    const raw = gateLine.get(key);
    if (raw === undefined) continue;
    const [tx, ty] = at(key, raw);
    if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) {
      fail(`gate "${key}" is at ${tx},${ty}, which is off the grid`);
    }
    gates.push({ key, tx, ty });
  }

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

  // Integrity check 3 (fb064s): the flat-arena mark means these exact bytes.
  //
  // Neither check above can stand in for it. The histogram counts kinds and not
  // positions, and the hash is re-derived from the seed the *dump* claims — so
  // seed 1's tiles wearing `requested=0 effective=0 attempts=0 fallback=true`
  // and a hash of `terrainHash(0, thoseTiles)` agreed with both, and parsed
  // clean before this item. `flatTerrain()` takes no config and is a function
  // of the arena's geometry alone, so this comparison is as config-free as the
  // histogram is.
  //
  // Note what the *other* mark does not buy, so it is not over-trusted:
  // `source=generator` is not proof that `requested` reproduces these tiles. The
  // hash is re-derived from the seed the dump claims, so a dump saying
  // `requested=999999` over seed 1's tiles passes every check here. Catching
  // that would mean regenerating under the config the dump was written against,
  // which a dump does not carry (`TerrainDump`). The mark answers "is
  // `requested` meant to be a seed at all", which is the question fb064s found
  // unanswerable, and not "is it the right one".
  if (source === SOURCE_FLAT) {
    const flat = flatTerrain();
    // Dimensions first, and with their own message (QA bug 3). Folding them
    // into the byte compare made a 3x3 dump — fb064f's announced non-arena
    // Training Grounds shape is the realistic case — report "these are not the
    // flat arena's tiles" without a tile ever having been compared, sending its
    // reader to diff 720 glyphs over a fault that is in the header.
    if (w !== flat.w || h !== flat.h) {
      fail(
        `"seed" line says source=${SOURCE_FLAT}, which is always ${flat.w}x${flat.h}; ` +
          `this dump is ${w}x${h}`,
      );
    }
    let same = true;
    for (let i = 0; same && i < kind.length; i++) same = kind[i] === flat.kind[i];
    if (!same) {
      fail(`"seed" line says source=${SOURCE_FLAT}, but these are not the flat arena's tiles`);
    }
  }

  return { w, h, kind, provenance, gates, measure, tileCounts };
}
