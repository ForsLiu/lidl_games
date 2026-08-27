/**
 * Content-data loader fuzzer (backlog q7; architecture rule 4 — "a loader rule
 * that refuses unpayable data is worth more than a comment saying the data must
 * be valid"; SPEC-FINAL §12).
 *
 * `loadContent()` is the only door `/data` comes through. Everything downstream
 * — every tower price, every enemy sheet, every cross-file key reference —
 * trusts whatever it hands back. This file asks the one question that door
 * exists to answer: **for each authored field, does a wrong value get refused,
 * or does it get built into a world?**
 *
 * Two things about the shape of the answer, both of which decided the design:
 *
 *   - The corpus is **exhaustive and deterministic, not sampled.** Every
 *     canonical field path in all fifteen `/data` files, crossed with every
 *     mutation family that is a genuine change for that field's type. No RNG at
 *     all: the census is a *fact about the loader*, so re-running it must give
 *     the same list or it is not a fact. (q2 and q3 are seeded samplers because
 *     their input spaces are unbounded; this one is not.)
 *   - The verdict is scored as **rejected / accepted**, and it is the *accepted*
 *     column that carries the information. A loader whose schemas all passed
 *     would score "no crash" perfectly. So the pinned artefact is the accepted
 *     set, asserted to be a subset of a recorded list — a new hole in `/data`'s
 *     door goes red on the next run without anyone having to notice it.
 *
 * The mutations never touch the disk: the `/data` modules are swapped at the
 * import seam by the test file (`vi.mock` over each `data/*.json`), and this
 * harness only ever builds plain objects. `filesOnDisk()` exists so the suite
 * can prove that by hash rather than assert it in a comment.
 *
 * There is no CLI here, unlike q2 and q3. The seam this needs — replacing a
 * static `import towersRaw from '../../data/towers.json'` — only exists inside a
 * module runner, so the driver lives in `tests/q7-data-fuzz.test.ts` and the
 * knob is `Q7_REPORT=1 npx vitest run tests/q7-data-fuzz.test.ts`. The census is
 * fixed-size by construction, so there is no depth to turn up.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* ------------------------------------------------------------------- data */

/**
 * Exactly the fifteen files `src/sim/content.ts` imports. Kept as a literal
 * rather than a `readdir` so a *new* `/data` file that nothing loads shows up as
 * a mismatch in the test's "the fifteen files are the ones the loader reads"
 * pin, instead of being fuzzed against a loader that never reads it.
 */
export const DATA_FILES = [
  'affinity',
  'boons',
  'classes',
  'cores',
  'damagetypes',
  'dev',
  'enemies',
  'modifiers',
  'quests',
  'relics',
  'spawns',
  'towers',
  'tree',
  'warden',
  'waves',
] as const;

export type DataFile = (typeof DATA_FILES)[number];

/**
 * `warden.json` is parsed at *module* scope (`export const wardenBase =
 * WardenFileSchema.parse(wardenRaw)`), not inside `loadContent`. A warden
 * mutation therefore throws on import and is invisible to a loader whose module
 * is already warm — so the driver has to re-import for it, and a census that
 * forgot would score every warden mutation as accepted.
 */
export const IMPORT_TIME_FILES: readonly DataFile[] = ['warden'];

export type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

const textCache = new Map<string, string>();

export function pristineText(file: DataFile): string {
  const hit = textCache.get(file);
  if (hit !== undefined) return hit;
  const text = readFileSync(join('data', `${file}.json`), 'utf8');
  textCache.set(file, text);
  return text;
}

/** A fresh deep copy every call — mutators write into it. */
export function pristine(file: DataFile): JsonValue {
  return JSON.parse(pristineText(file)) as JsonValue;
}

/** sha256 of every `/data` file as it sits on disk, for the no-writes pin. */
export function filesOnDisk(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of DATA_FILES) {
    out[f] = createHash('sha256').update(readFileSync(join('data', `${f}.json`))).digest('hex');
  }
  return out;
}

/* ------------------------------------------------------------------ sites */

export type SiteKind = 'null' | 'boolean' | 'number' | 'string' | 'array' | 'object';

export interface Site {
  file: DataFile;
  /** Array indices collapsed to `[]`, so `towers[0].hp` and `towers[9].hp` are one site. */
  path: string;
  /** A concrete route to the first occurrence of `path`: keys and indices from the file root. */
  pointer: (string | number)[];
  kind: SiteKind;
  /** True when the pointer's last step indexes an array, so there is no key to drop or rename. */
  inArray: boolean;
}

function kindOf(v: JsonValue): SiteKind {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v as SiteKind;
}

/**
 * Every canonical path in one file, first occurrence wins. Containers are
 * enumerated as well as leaves: an array is the only place `empty-array`,
 * `drop-element` and `dupe-element` can be aimed, and duplicate-id data is a
 * hole no leaf mutation can reach.
 *
 * First occurrence *across all elements*, not element 0's fields — an optional
 * field authored on one tower and absent on the other nine is still a site.
 */
export function sites(file: DataFile): Site[] {
  const out: Site[] = [];
  const seen = new Set<string>();
  const walk = (v: JsonValue, path: string, pointer: (string | number)[], inArray: boolean): void => {
    if (!seen.has(path)) {
      seen.add(path);
      out.push({ file, path, pointer: [...pointer], kind: kindOf(v), inArray });
    }
    if (Array.isArray(v)) {
      v.forEach((e, i) => walk(e, `${path}[]`, [...pointer, i], true));
      return;
    }
    if (v && typeof v === 'object') {
      for (const k of Object.keys(v)) walk(v[k], `${path}.${k}`, [...pointer, k], false);
    }
  };
  walk(pristine(file), file, [], false);
  // The file root itself is not a mutation site: replacing a whole document is
  // what q3 does to saves, and here it would say nothing per-field.
  return out.filter((s) => s.pointer.length > 0);
}

export function allSites(): Site[] {
  return DATA_FILES.flatMap((f) => sites(f));
}

/**
 * Every *concrete* string leaf in one file — no canonical dedup, so all ten
 * `towers[i].key`s are separate sites.
 *
 * This exists because the canonical census above answers a narrower question
 * than it looks like it does. `sites()` keeps the first occurrence of a path, so
 * "towers.towers[].key accepts garbage" is a fact about **tower 0**, not about
 * the field: the Palisade is in no affinity list, so nothing cross-checks its
 * key, while the Arrow Spire's key is referenced and would be caught. Reporting
 * the first as though it were the field is exactly the "check a /data row's
 * blast radius before calling it narrow" mistake CLAUDE.md's measurement rules
 * name. So string fields — the ones that carry every cross-file reference — get
 * swept row by row, and the artefact is an *accepted-of-total* count per path.
 */
export function stringSites(file: DataFile): Site[] {
  const out: Site[] = [];
  const walk = (v: JsonValue, path: string, pointer: (string | number)[], inArray: boolean): void => {
    if (typeof v === 'string') {
      out.push({ file, path, pointer: [...pointer], kind: 'string', inArray });
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((e, i) => walk(e, `${path}[]`, [...pointer, i], true));
      return;
    }
    if (v && typeof v === 'object') {
      for (const k of Object.keys(v)) walk(v[k], `${path}.${k}`, [...pointer, k], false);
    }
  };
  walk(pristine(file), file, [], false);
  return out;
}

export function allStringSites(): Site[] {
  return DATA_FILES.flatMap((f) => stringSites(f));
}

/** `accepted` of `total` occurrences of one canonical string path took garbage. */
export interface RefCount {
  total: number;
  accepted: number;
}

export function tallyRefs(rows: { path: string; outcome: Outcome }[]): Record<string, RefCount> {
  const out: Record<string, RefCount> = Object.create(null);
  for (const r of rows) {
    const c = (out[r.path] ??= { total: 0, accepted: 0 });
    c.total++;
    if (r.outcome === 'accepted') c.accepted++;
  }
  return out;
}

/**
 * How a canonical string path scored across all its rows. `checked` and `open`
 * are the two clean verdicts; `partial` is the interesting one — the loader
 * cross-checks *some* rows of this field and not others, which is what makes a
 * first-occurrence census misleading about it.
 */
export type RefVerdict = 'checked' | 'partial' | 'open';

export function refVerdict(c: RefCount): RefVerdict {
  if (c.accepted === 0) return 'checked';
  if (c.accepted === c.total) return 'open';
  return 'partial';
}

/* -------------------------------------------------------------- mutations */

export const FAMILIES = [
  'to-null',
  'to-string',
  'to-number',
  'to-bool',
  'to-array',
  'to-object',
  'drop-key',
  'rename-key',
  'negative',
  'zero',
  'infinite',
  'fractional',
  'empty-string',
  'flip-bool',
  'empty-array',
  'drop-element',
  'dupe-element',
] as const;

export type Family = (typeof FAMILIES)[number];

/** The string every `to-string`/garbage mutation uses — recognisable in an error. */
export const GARBAGE = '__q7_not_a_key__';

/**
 * Which families are a *genuine change* for a site of this kind. A family that
 * cannot move the value is not run: an ineffective trial scored as "rejected"
 * or "accepted" is the vacuity that ate the first cut of both q2 and q3.
 */
export function familiesFor(site: Site): Family[] {
  const out: Family[] = [];
  switch (site.kind) {
    case 'string':
      out.push('to-null', 'to-string', 'to-number', 'to-bool', 'to-array', 'to-object', 'empty-string');
      break;
    case 'number':
      out.push(
        'to-null',
        'to-string',
        'to-bool',
        'to-array',
        'to-object',
        'negative',
        'zero',
        'infinite',
        'fractional',
      );
      break;
    case 'boolean':
      out.push('to-null', 'to-string', 'to-number', 'to-array', 'to-object', 'flip-bool');
      break;
    case 'null':
      out.push('to-string', 'to-number', 'to-bool', 'to-array', 'to-object');
      break;
    case 'array':
      out.push(
        'to-null',
        'to-string',
        'to-number',
        'to-bool',
        'to-object',
        'empty-array',
        'drop-element',
        'dupe-element',
      );
      break;
    case 'object':
      out.push('to-null', 'to-string', 'to-number', 'to-bool', 'to-array');
      break;
  }
  // An array element has no key of its own; `drop-element` covers that ground.
  if (!site.inArray) out.push('drop-key', 'rename-key');
  return out;
}

interface Slot {
  parent: JsonValue[] | { [k: string]: JsonValue };
  key: string | number;
  value: JsonValue;
}

function resolve(root: JsonValue, pointer: (string | number)[]): Slot | null {
  let cur: JsonValue = root;
  for (let i = 0; i < pointer.length - 1; i++) {
    if (cur === null || typeof cur !== 'object') return null;
    cur = (cur as Record<string | number, JsonValue>)[pointer[i]];
  }
  if (cur === null || typeof cur !== 'object') return null;
  const key = pointer[pointer.length - 1];
  return {
    parent: cur as JsonValue[] | { [k: string]: JsonValue },
    key,
    value: (cur as Record<string | number, JsonValue>)[key],
  };
}

/**
 * `1e999` is legal JSON syntax and parses to `Infinity`, so a non-finite number
 * is reachable from a real hand-edited file. `NaN` is *not* — it has no JSON
 * spelling — which is why there is no `to-nan` family here, and why any NaN this
 * fuzzer sees downstream was computed by the engine rather than authored.
 */
export const INFINITE = JSON.parse('1e999') as number;

/** Applies `family` in place. Returns false when the family could not move it. */
export function mutate(root: JsonValue, site: Site, family: Family): boolean {
  const slot = resolve(root, site.pointer);
  if (!slot) return false;
  const { parent, key, value } = slot;
  const set = (v: JsonValue): boolean => {
    (parent as Record<string | number, JsonValue>)[key] = v;
    return true;
  };
  switch (family) {
    case 'to-null':
      return value === null ? false : set(null);
    case 'to-string':
      return value === GARBAGE ? false : set(GARBAGE);
    case 'to-number':
      return value === 42 ? false : set(42);
    case 'to-bool':
      return value === true ? false : set(true);
    case 'to-array':
      return Array.isArray(value) ? false : set([]);
    case 'to-object':
      return value !== null && typeof value === 'object' && !Array.isArray(value) ? false : set({});
    case 'empty-string':
      return value === '' ? false : set('');
    case 'flip-bool':
      return typeof value === 'boolean' ? set(!value) : false;
    case 'negative':
      return typeof value === 'number' ? set(-Math.abs(value) - 1) : false;
    case 'zero':
      return typeof value === 'number' && value !== 0 ? set(0) : false;
    case 'infinite':
      return typeof value === 'number' ? set(INFINITE) : false;
    case 'fractional':
      return typeof value === 'number' ? set(value + 0.5) : false;
    case 'empty-array':
      return Array.isArray(value) && value.length > 0 ? set([]) : false;
    case 'drop-element':
      return Array.isArray(value) && value.length > 0 ? set(value.slice(1)) : false;
    case 'dupe-element':
      return Array.isArray(value) && value.length > 0 ? set([...value, value[0]]) : false;
    case 'drop-key': {
      if (Array.isArray(parent) || !(key in parent)) return false;
      delete (parent as Record<string, JsonValue>)[key as string];
      return true;
    }
    case 'rename-key': {
      if (Array.isArray(parent) || !(key in parent)) return false;
      const p = parent as Record<string, JsonValue>;
      delete p[key as string];
      p[`${key}${GARBAGE}`] = value;
      return true;
    }
  }
}

export function censusKey(site: Site, family: Family): string {
  return `${site.path} | ${family}`;
}

/* --------------------------------------------------------------- outcomes */

export type Outcome = 'rejected' | 'accepted';

export interface Trial {
  key: string;
  file: DataFile;
  path: string;
  family: Family;
  outcome: Outcome;
  /** First line of the loader's complaint, for the report. Empty when accepted. */
  error: string;
  /** What `scanContent` said about an accepted world. Empty means it looked payable. */
  complaints: string[];
}

export interface Case {
  site: Site;
  family: Family;
  key: string;
}

/**
 * Every case in the census, in a fixed order. Deterministic: the same list, in
 * the same order, on every run and every host.
 */
export function census(): Case[] {
  const out: Case[] = [];
  for (const site of allSites()) {
    for (const family of familiesFor(site)) out.push({ site, family, key: censusKey(site, family) });
  }
  return out;
}

/**
 * Does an *accepted* `Content` describe a world the engine can actually pay out?
 * This is the second half of q7's acceptance wording — "reject the result rather
 * than building an unpayable world" — and it is what separates a hole that costs
 * nothing from one that ships a broken game.
 *
 * Deliberately narrow: only things that are unpayable on their face, never
 * balance. Each complaint names the field so a bug report can be written from
 * the census alone.
 */
export function scanContent(c: unknown): string[] {
  const out: string[] = [];
  const content = c as {
    towers: {
      towers: {
        key: string;
        cost: number;
        hp: number;
        attack: { interval: number; range: number } | null;
      }[];
    };
    enemies: { enemies: { key: string; hp: number }[] };
    towerByKey: Map<string, unknown>;
    towerById: Map<number, unknown>;
    enemyByKey: Map<string, unknown>;
    enemyById: Map<number, unknown>;
    tree: { nodes: { id: number }[] };
    treeById: Map<number, unknown>;
  };

  // Non-finite anywhere in the loaded content: every one of these is a number
  // the sim will go on to multiply by something.
  const walkNonFinite = (v: unknown, path: string, depth: number): void => {
    if (depth > 14 || out.length > 40) return;
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) out.push(`${path}=${String(v)} is not finite`);
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((e, i) => walkNonFinite(e, `${path}[${i}]`, depth + 1));
      return;
    }
    if (v && typeof v === 'object') {
      for (const [k, e] of Object.entries(v as Record<string, unknown>)) {
        walkNonFinite(e, `${path}.${k}`, depth + 1);
      }
    }
  };
  const SHEETS = [
    'towers',
    'enemies',
    'waves',
    'cores',
    'spawns',
    'boons',
    'relics',
    'tree',
    'modifiers',
    'classes',
    'affinity',
    'quests',
    'damageTypes',
    'warden',
  ] as const;
  for (const k of SHEETS) walkNonFinite((c as Record<string, unknown>)[k], k, 0);

  // A collision here is silent: the Map keeps the last row and the earlier one
  // stops existing, so a duplicated id *deletes* a tower rather than erroring.
  const collide = (name: string, mapSize: number, rows: number): void => {
    if (mapSize !== rows) out.push(`${name}: ${rows} rows collapse to ${mapSize} keys`);
  };
  collide('towerByKey', content.towerByKey.size, content.towers.towers.length);
  collide('towerById', content.towerById.size, content.towers.towers.length);
  collide('enemyByKey', content.enemyByKey.size, content.enemies.enemies.length);
  collide('enemyById', content.enemyById.size, content.enemies.enemies.length);
  collide('treeById', content.treeById.size, content.tree.nodes.length);

  // An attack that fires every <=0 seconds is the classic unbounded-loop shape,
  // and one with <=0 range can never acquire; both parse today.
  for (const t of content.towers.towers) {
    if (t.attack) {
      if (!(t.attack.interval > 0)) out.push(`tower ${t.key}: attack interval ${t.attack.interval} is not > 0`);
      if (!(t.attack.range > 0)) out.push(`tower ${t.key}: attack range ${t.attack.range} is not > 0`);
    }
    if (!(t.hp > 0)) out.push(`tower ${t.key}: hp ${t.hp} is not > 0`);
    if (t.cost < 0) out.push(`tower ${t.key}: cost ${t.cost} is negative`);
  }
  for (const e of content.enemies.enemies) {
    if (!(e.hp > 0)) out.push(`enemy ${e.key}: hp ${e.hp} is not > 0`);
  }
  return out;
}

/** The one-line complaint a loader threw, trimmed to something a report can hold. */
export function errorLine(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.split('\n')[0].slice(0, 160);
}

/* ---------------------------------------------------------------- summary */

export interface Summary {
  trials: number;
  rejected: number;
  accepted: number;
  acceptedKeys: string[];
  unpayable: { key: string; complaints: string[] }[];
  byFile: Record<string, { trials: number; accepted: number }>;
  byFamily: Record<string, { trials: number; accepted: number }>;
}

export function summarize(trials: Trial[]): Summary {
  // `Object.create(null)`, not `{}`: a family or file named `constructor` would
  // otherwise make `??=` hand back `Object` and silently miscount (q3's note).
  const byFile: Record<string, { trials: number; accepted: number }> = Object.create(null);
  const byFamily: Record<string, { trials: number; accepted: number }> = Object.create(null);
  const acceptedKeys: string[] = [];
  const unpayable: { key: string; complaints: string[] }[] = [];
  for (const t of trials) {
    const f = (byFile[t.file] ??= { trials: 0, accepted: 0 });
    const g = (byFamily[t.family] ??= { trials: 0, accepted: 0 });
    f.trials++;
    g.trials++;
    if (t.outcome === 'accepted') {
      f.accepted++;
      g.accepted++;
      acceptedKeys.push(t.key);
      if (t.complaints.length > 0) unpayable.push({ key: t.key, complaints: t.complaints });
    }
  }
  return {
    trials: trials.length,
    rejected: trials.length - acceptedKeys.length,
    accepted: acceptedKeys.length,
    acceptedKeys,
    unpayable,
    byFile,
    byFamily,
  };
}

export function report(s: Summary): string {
  const lines: string[] = [];
  lines.push(
    `q7 content-data loader fuzz — ${s.trials} mutations, ${s.rejected} rejected, ${s.accepted} accepted`,
  );
  lines.push('');
  lines.push('by file:');
  for (const f of DATA_FILES) {
    const r = s.byFile[f];
    if (!r) continue;
    lines.push(`  ${f.padEnd(13)} ${String(r.trials).padStart(5)} trials  ${String(r.accepted).padStart(4)} accepted`);
  }
  lines.push('');
  lines.push('by family:');
  for (const fam of FAMILIES) {
    const r = s.byFamily[fam];
    if (!r) continue;
    lines.push(
      `  ${fam.padEnd(13)} ${String(r.trials).padStart(5)} trials  ${String(r.accepted).padStart(4)} accepted`,
    );
  }
  if (s.unpayable.length > 0) {
    lines.push('');
    lines.push(`unpayable worlds built from accepted data (${s.unpayable.length}):`);
    for (const u of s.unpayable) lines.push(`  ${u.key}  ->  ${u.complaints.slice(0, 3).join('; ')}`);
  }
  return lines.join('\n');
}
