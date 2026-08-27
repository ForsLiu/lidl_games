/**
 * Save fuzzer (backlog q3; QUALITY.md ALPHA "corrupted-save ... loads into
 * repair path, never a crash"; SPEC-FINAL §14 G18).
 *
 * Generates a rich, *valid* save, corrupts it fifteen different ways, and
 * checks what comes back out of `loadMeta` — the path the game actually uses.
 *
 * Two contracts are deliberately kept apart, because they fail differently:
 *
 *   - `deserializeMeta` is the **repair path**. When it returns something, the
 *     save was repaired and the player's data survived. When it throws,
 *     `loadMeta`'s `catch` hands back `defaultMeta()` — no crash, but the
 *     account is gone. And when it hits `!parsed.meta` it *returns*
 *     `defaultMeta()` without throwing, which is the same total loss reached by
 *     a path no `catch` can observe. Those three are scored `repaired`,
 *     `rejected` and `wiped`; a fuzzer that only checked "never a crash" would
 *     score all three the same.
 *   - `loadMeta` is the **crash contract**. It must never throw and must never
 *     return something the Hub cannot use, whatever is in storage. Note that
 *     `loadMeta` catches everything, so this contract cannot be *violated* by
 *     any input — which is exactly why `changed` below is tracked too: without
 *     an effectiveness measure a corpus of no-ops would look like a clean run.
 *
 * What this file does *not* assert is `MetaState`'s scalar types: `migrate`
 * spreads the parsed save over the defaults without checking any of them, so
 * `accountLevel: "seven"` survives a load today. That is a real defect and it
 * is filed as one (BACKLOG-QUALITY.md Log, 2026-08-26 session 2) rather than
 * asserted here, because this lane may not edit `/src`. `fieldMatrix()` pins
 * the exact set of shapes that launder or crash so a *new* one goes red.
 *
 * CLI:  npx tsx tools/fuzz-save.ts --n 20000 --seed 7
 */

import { loadContent } from '../src/sim/content';
import {
  SAVE_KEY,
  SAVE_VERSION,
  accountLevelFor,
  allocate,
  canAllocate,
  defaultMeta,
  deserializeMeta,
  isConnected,
  loadMeta,
  pointsAvailable,
  refundBlocker,
  serializeMeta,
  stashCapacity,
} from '../src/meta/meta';
import { discard, equip } from '../src/meta/stash';
import { Rng } from '../src/sim/rng';
import type { MetaState } from '../src/sim/types';

/* --------------------------------------------------------------- storage */

interface FakeStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

/**
 * `loadMeta` reads `globalThis.localStorage`, which does not exist under Node.
 * Without a stub every trial would take the `!raw` branch and this whole file
 * would be asserting that `defaultMeta()` equals itself. Restores the original
 * descriptor so nothing leaks into another test file.
 */
export function withSavedRaw<T>(raw: string | null, fn: () => T, key: string = SAVE_KEY): T {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const store = new Map<string, string>();
  if (raw !== null) store.set(key, raw);
  const stub: FakeStorage = {
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true, writable: true });
  try {
    return fn();
  } finally {
    if (had) Object.defineProperty(globalThis, 'localStorage', had);
    else delete (globalThis as unknown as Record<string, unknown>).localStorage;
  }
}

/* ----------------------------------------------------------- valid saves */

/** A connected walk out from node 0, so `allocated` is legal by construction. */
function connectedAllocation(rng: Rng, count: number): number[] {
  const c = loadContent();
  const taken = [0];
  const set = new Set([0]);
  for (let i = 0; i < count; i++) {
    const frontier: number[] = [];
    for (const id of taken) {
      const node = c.treeById.get(id);
      if (!node) continue;
      for (const l of node.links) if (!set.has(l)) frontier.push(l);
    }
    if (frontier.length === 0) break;
    const next = rng.pick(frontier);
    taken.push(next);
    set.add(next);
  }
  return taken;
}

/**
 * A save with something in every field — an empty stash or an empty quest log
 * gives the structural mutators nothing to hit, and half the families would
 * quietly degenerate into "mutate one of the two numbers".
 */
export function validMeta(rng: Rng): MetaState {
  const c = loadContent();
  const slots = ['sigil', 'plate', 'charm'];
  const affixKeys = ['power', 'guard', 'haste', 'greed'];
  const stashSize = rng.intRange(2, 6);
  const stash = Array.from({ length: stashSize }, (_, i) => ({
    id: i + 1,
    slot: rng.pick(slots),
    rarity: rng.pick(['common', 'magic', 'rare']),
    name: `Relic ${i + 1}`,
    affixes: Array.from({ length: rng.intRange(1, 3) }, () => ({
      key: rng.pick(affixKeys),
      stat: rng.pick(affixKeys),
      value: rng.intRange(1, 20) / 100,
    })),
  }));
  const ember = rng.intRange(0, 8000);
  const equipped: MetaState['equipped'] = { sigil: null, plate: null, charm: null };
  for (const r of stash) {
    if (r.slot in equipped && rng.chance(0.5)) {
      equipped[r.slot as keyof typeof equipped] = r.id;
    }
  }
  const questProgress: Record<string, number> = {};
  for (const m of new Set(c.quests.quests.map((q) => q.metric))) {
    if (rng.chance(0.7)) questProgress[m] = rng.intRange(0, 5000);
  }
  return {
    accountLevel: accountLevelFor(ember),
    ember,
    allocated: connectedAllocation(rng, rng.intRange(1, 9)),
    stash,
    equipped,
    unlockedClasses: [
      ...new Set(['engineer', ...c.classes.classes.filter(() => rng.chance(0.6)).map((k) => k.key)]),
    ],
    highestTier: rng.intRange(1, 5),
    questProgress,
    completedQuests: c.quests.quests.filter(() => rng.chance(0.3)).map((q) => q.key),
    nextRelicId: stashSize + 1,
  };
}

export function validSave(rng: Rng): string {
  return serializeMeta(validMeta(rng));
}

/**
 * A save as a v0.2 client wrote it: stamped version 1 and carrying the key
 * `RETIRED_KEYS` drops. Without one of these in the corpus the `version` family
 * is a provable no-op — the only thing `migrate` reads the stamp for is that
 * strip, so re-stamping a save with nothing to strip changes nothing any
 * assertion could see. (Code review, session 2.)
 *
 * The value is a scalar rather than the sub-object the deleted currency
 * actually used, for two reasons. The strip is keyed on the field *name*, so a
 * scalar exercises it identically — and `tests/c7-no-orbs.test.ts` scans
 * `tools/` for that currency's vocabulary, deliberately and with no
 * exemptions, so spelling the old shape out here turns C7 red.
 * `tests/t6c-save-migration.test.ts` already covers malformed values of this
 * key, `5` among them. (QA, session 2.)
 */
export function legacySave(rng: Rng): string {
  return JSON.stringify({ version: 1, meta: { ...validMeta(rng), orbs: rng.int(9) } });
}

/* -------------------------------------------------------------- mutation */

export const FAMILIES = [
  'truncate',
  'bitflip',
  'delete-span',
  'duplicate-span',
  'insert-junk',
  'retype',
  'drop-key',
  'rename-key',
  'extreme-number',
  'empty-container',
  'grow-array',
  'proto-key',
  'deep-nest',
  'long-string',
  'version',
] as const;
export type Family = (typeof FAMILIES)[number];

export interface Mutation {
  family: Family;
  label: string;
  /** The corrupted save. */
  json: string;
  /** The uncorrupted save it was made from, so a trial can tell a no-op apart
   *  from a corruption the loader happens to absorb. */
  base: string;
}

type Path = (string | number)[];

function collectPaths(v: unknown, base: Path = [], out: Path[] = []): Path[] {
  out.push(base);
  if (Array.isArray(v)) v.forEach((x, i) => collectPaths(x, [...base, i], out));
  else if (v !== null && typeof v === 'object') {
    for (const k of Object.keys(v as object)) collectPaths((v as Record<string, unknown>)[k], [...base, k], out);
  }
  return out;
}

function getAt(root: unknown, path: Path): unknown {
  let cur = root;
  for (const step of path) cur = (cur as Record<string | number, unknown> | undefined)?.[step];
  return cur;
}

function setAt(root: unknown, path: Path, value: unknown): unknown {
  if (path.length === 0) return value;
  const parent = getAt(root, path.slice(0, -1)) as Record<string | number, unknown>;
  if (parent === null || typeof parent !== 'object') return root;
  parent[path[path.length - 1]] = value;
  return root;
}

function delAt(root: unknown, path: Path): void {
  if (path.length === 0) return;
  const parent = getAt(root, path.slice(0, -1)) as Record<string | number, unknown>;
  if (parent === null || typeof parent !== 'object') return;
  if (Array.isArray(parent)) parent.splice(Number(path[path.length - 1]), 1);
  else delete parent[path[path.length - 1]];
}

/**
 * `JSON.stringify` cannot emit `Infinity` or a 30-digit integer, but a
 * hand-edited or bit-rotted save can hold both and `JSON.parse` accepts them.
 * Sentinels ride through the stringifier as strings and are unquoted
 * afterwards, so the extreme-number family reaches values a purely structural
 * mutator cannot express.
 *
 * The unquoting is a whole-document string replace, so a save whose *content*
 * held one of these names would have every occurrence rewritten. Nothing
 * `validMeta` emits can, but keep the names implausible if the generator grows.
 */
const SENTINELS: Record<string, string> = {
  __INF__: '1e999',
  __NEGINF__: '-1e999',
  __TINY__: '1e-999',
  __HUGE_INT__: '123456789012345678901234567890',
  __NEG_ZERO__: '-0',
};

function unsentinel(json: string): string {
  let out = json;
  for (const [k, v] of Object.entries(SENTINELS)) out = out.split(`"${k}"`).join(v);
  return out;
}

const JUNK = ['{', '}', '[', ']', '"', ':', ',', '\\', ' ', '�', 'null', '\n'];

const WRONG_VALUES: unknown[] = [null, true, false, 0, -1, 1e308, 'x', 'seven', '', [], [1, 2], {}, { a: 1 }];

const HOSTILE_VERSIONS: unknown[] = [0, 1, 2, 3, 999, -1, 1.5, '2', null, true, [], { v: 2 }, '__INF__'];

const BLOBS = [' ', 'A', '\u{1F4A9}', '\\"', '‮'];

/** Key that `proto-key` smuggles past `JSON.stringify`; see that case. */
const PROTO_SENTINEL = '__PROTO_SENTINEL__';

/** The nearest ancestor that is a plain object, since only those have keys. */
function objectAncestor(root: unknown, path: Path): Path | null {
  for (let p = path.slice(0, -1); ; p = p.slice(0, -1)) {
    const v = getAt(root, p);
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) return p;
    if (p.length === 0) return null;
  }
}

export function mutate(json: string, rng: Rng, family: Family = rng.pick(FAMILIES)): Mutation {
  const at = (label: string, out: string): Mutation => ({ family, label, json: out, base: json });
  const len = json.length;

  switch (family) {
    case 'truncate': {
      const k = rng.int(len);
      return at(`truncate@${k}`, json.slice(0, k));
    }
    case 'bitflip': {
      const i = rng.int(len);
      const bit = rng.int(7);
      const code = json.charCodeAt(i) ^ (1 << bit);
      return at(`bitflip@${i}^${bit}`, json.slice(0, i) + String.fromCharCode(code) + json.slice(i + 1));
    }
    case 'delete-span': {
      const i = rng.int(len);
      const n = rng.intRange(1, Math.min(24, Math.max(1, len - i)));
      return at(`delete@${i}+${n}`, json.slice(0, i) + json.slice(i + n));
    }
    case 'duplicate-span': {
      const i = rng.int(len);
      const n = rng.intRange(1, Math.min(24, Math.max(1, len - i)));
      return at(`dup@${i}+${n}`, json.slice(0, i + n) + json.slice(i, i + n) + json.slice(i + n));
    }
    case 'insert-junk': {
      const i = rng.int(len);
      const j = rng.pick(JUNK);
      return at(`insert@${i}:${JSON.stringify(j)}`, json.slice(0, i) + j + json.slice(i));
    }
    default:
      break;
  }

  // Structural families: parse, mutate one node, re-stringify.
  const root = JSON.parse(json) as unknown;
  const paths = collectPaths(root).filter((p) => p.length > 0);
  const path = rng.pick(paths);
  const label = (kind: string) => `${kind}:${path.join('.')}`;

  switch (family) {
    case 'retype': {
      const v = rng.pick(WRONG_VALUES);
      return at(`${label('retype')}=${JSON.stringify(v)}`, JSON.stringify(setAt(root, path, v)));
    }
    case 'drop-key': {
      delAt(root, path);
      return at(label('drop'), JSON.stringify(root));
    }
    case 'rename-key': {
      // An array index has no name to rename, so climb to the nearest object
      // and rename one of its keys instead. The old code returned the input
      // untouched here and still counted it as a corruption — 26% of the
      // family was a no-op (code review, session 2).
      let target = path;
      if (typeof path[path.length - 1] === 'number') {
        const up = objectAncestor(root, path);
        if (up === null || up.length === 0) return at(label('rename-noop'), JSON.stringify(root));
        target = up;
      }
      const parent = getAt(root, target.slice(0, -1));
      if (parent === null || typeof parent !== 'object' || Array.isArray(parent)) {
        return at(label('rename-noop'), JSON.stringify(root));
      }
      const key = String(target[target.length - 1]);
      const bag = parent as Record<string, unknown>;
      const renamed = rng.chance(0.5) ? `${key}_` : key.toUpperCase();
      bag[renamed] = bag[key];
      delete bag[key];
      return at(`rename:${target.join('.')}->${renamed}`, JSON.stringify(root));
    }
    case 'extreme-number': {
      const v = rng.pick(Object.keys(SENTINELS));
      return at(`${label('extreme')}=${SENTINELS[v]}`, unsentinel(JSON.stringify(setAt(root, path, v))));
    }
    case 'empty-container': {
      const cur = getAt(root, path);
      const empty = Array.isArray(cur) ? [] : cur !== null && typeof cur === 'object' ? {} : '';
      return at(label('empty'), JSON.stringify(setAt(root, path, empty)));
    }
    case 'grow-array': {
      const cur = getAt(root, path);
      const grown = Array.isArray(cur)
        ? Array.from({ length: 200 }, (_, i) => cur[i % Math.max(1, cur.length)] as unknown)
        : Array.from({ length: 200 }, () => cur);
      return at(label('grow'), JSON.stringify(setAt(root, path, grown)));
    }
    case 'proto-key': {
      const key = rng.pick(['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty']);
      const up = objectAncestor(root, path);
      const target = (up === null ? root : getAt(root, up)) as Record<string, unknown>;
      // `target['__proto__'] = v` runs the Object.prototype setter: it changes
      // the prototype and creates no own property, so `JSON.stringify` drops it
      // and the family named for prototype pollution never emitted a
      // `__proto__` key at all (code review, session 2). Route it through a
      // sentinel key and unquote it afterwards so `JSON.parse` really sees one.
      target[key === '__proto__' ? PROTO_SENTINEL : key] = { polluted: true, ember: 1e9 };
      return at(`proto:${key}`, JSON.stringify(root).split(`"${PROTO_SENTINEL}"`).join('"__proto__"'));
    }
    case 'deep-nest': {
      let v = getAt(root, path);
      const depth = rng.intRange(1, 40);
      for (let i = 0; i < depth; i++) v = [v];
      return at(`${label('nest')}x${depth}`, JSON.stringify(setAt(root, path, v)));
    }
    case 'long-string': {
      const blob = rng.pick(BLOBS).repeat(rng.intRange(1, 2000));
      return at(label('blob'), JSON.stringify(setAt(root, path, blob)));
    }
    case 'version': {
      const v = rng.pick(HOSTILE_VERSIONS);
      (root as Record<string, unknown>).version = v;
      return at(`version=${JSON.stringify(v)}`, unsentinel(JSON.stringify(root)));
    }
    default:
      return at('noop', json);
  }
}

/* ------------------------------------------------------------ invariants */

const SLOTS = ['sigil', 'plate', 'charm'] as const;

/**
 * What must hold of whatever `loadMeta` hands back, however corrupt the save.
 * Every clause was measured against the fuzzer before it was written — see the
 * lane log for the plausible ones that were *not* written, and why.
 */
export function checkMeta(m: unknown): string[] {
  const bad: string[] = [];
  if (m === null || typeof m !== 'object' || Array.isArray(m)) return ['meta is not an object'];
  const meta = m as Record<string, unknown>;

  for (const key of Object.keys(defaultMeta())) {
    if (!(key in meta)) bad.push(`missing field ${key}`);
  }

  const allocated = meta.allocated;
  if (!Array.isArray(allocated)) bad.push('allocated is not an array');
  else {
    if (!allocated.includes(0)) bad.push('allocated does not contain the start node');
    const known = loadContent().treeById;
    for (const id of allocated) {
      if (typeof id !== 'number' || !Number.isFinite(id)) {
        bad.push(`allocated holds a non-number ${JSON.stringify(id)}`);
      } else if (!known.has(id)) bad.push(`allocated holds unknown node ${id}`);
    }
    if (!isConnected(allocated as number[])) bad.push('allocated is not connected to the start node');
  }

  const stash = meta.stash;
  if (!Array.isArray(stash)) bad.push('stash is not an array');
  else {
    for (const [i, r] of stash.entries()) {
      if (r === null || typeof r !== 'object') bad.push(`stash[${i}] is not an object`);
      else if (!Array.isArray((r as Record<string, unknown>).affixes)) {
        bad.push(`stash[${i}].affixes is not an array`);
      }
    }
  }

  const equipped = meta.equipped;
  if (equipped === null || typeof equipped !== 'object' || Array.isArray(equipped)) {
    bad.push('equipped is not an object');
  } else {
    for (const s of SLOTS) if (!(s in equipped)) bad.push(`equipped is missing the ${s} slot`);
  }

  const qp = meta.questProgress;
  if (qp === null || typeof qp !== 'object' || Array.isArray(qp)) bad.push('questProgress is not an object');

  for (const key of ['completedQuests', 'unlockedClasses'] as const) {
    if (!Array.isArray(meta[key])) bad.push(`${key} is not an array`);
  }
  return bad;
}

/**
 * A repaired save has to survive what the Hub does to it, not merely exist.
 * These are the entry points a player reaches by opening the Hub at all: the
 * point count, the stash header, the tree, the relic slots, and the re-save.
 */
export function exerciseHub(m: MetaState): string[] {
  const errs: string[] = [];
  const call = (name: string, fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      errs.push(`${name}: ${(e as Error).message}`);
    }
  };
  call('pointsAvailable', () => pointsAvailable(m));
  call('stashCapacity', () => stashCapacity(m));
  call('accountLevelFor', () => accountLevelFor(m.ember));
  call('canAllocate', () => canAllocate(m, 1));
  call('allocate', () => allocate(m, 1));
  call('refundBlocker', () => refundBlocker(m, 1));
  call('equip', () => equip(m, 'sigil', 1));
  call('discard', () => discard(m, 1));
  call('serializeMeta', () => serializeMeta(m));
  call('reload', () => withSavedRaw(serializeMeta(m), loadMeta));
  return errs;
}

/* ---------------------------------------------------------------- trials */

export type Outcome = 'repaired' | 'rejected' | 'wiped';

export interface Trial extends Mutation {
  /**
   * `repaired` — the repair path returned the account.
   * `rejected` — it threw; `loadMeta` caught and the account is gone.
   * `wiped`    — it *returned* `defaultMeta()` for an account that had content,
   *              which is the same total loss by a route no `catch` can see.
   */
  outcome: Outcome;
  /** What `deserializeMeta` threw, when it did. */
  rejection?: string;
  /**
   * The corruption made an observable difference to what loaded. Without this
   * the census cannot tell a family that finds nothing from a family that does
   * nothing — `loadMeta` catches everything, so no input can make `violations`
   * fire and a corpus of no-ops would read as a clean run (code review, s2).
   */
  changed: boolean;
  violations: string[];
  hubErrors: string[];
  /** True when `loadMeta` itself threw — the one thing that must never happen. */
  crashed: boolean;
  crash?: string;
}

function sameMeta(a: MetaState, b: MetaState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function runTrial(mut: Mutation): Trial {
  const clean = withSavedRaw(mut.base, loadMeta);
  let outcome: Outcome = 'repaired';
  let rejection: string | undefined;
  try {
    const direct = deserializeMeta(mut.json);
    if (sameMeta(direct, defaultMeta()) && !sameMeta(clean, defaultMeta())) outcome = 'wiped';
  } catch (e) {
    outcome = 'rejected';
    rejection = (e as Error).message;
  }
  let loaded: MetaState | undefined;
  let crashed = false;
  let crash: string | undefined;
  try {
    loaded = withSavedRaw(mut.json, loadMeta);
  } catch (e) {
    crashed = true;
    crash = (e as Error).message;
  }
  return {
    ...mut,
    outcome,
    rejection,
    changed: loaded === undefined || !sameMeta(loaded, clean),
    violations: loaded ? checkMeta(loaded) : ['loadMeta threw'],
    hubErrors: loaded ? exerciseHub(loaded) : [],
    crashed,
    crash,
  };
}

export interface FamilyCount {
  total: number;
  repaired: number;
  rejected: number;
  wiped: number;
  /** Trials whose corruption changed what loaded; see `Trial.changed`. */
  changed: number;
}

export interface Census {
  trials: number;
  byFamily: Record<string, FamilyCount>;
  failures: Trial[];
}

/**
 * `n` corruptions of freshly generated valid saves, seeded and reproducible.
 * Roughly a third of the bases are v0.2-shaped, which is what gives the
 * `version` family something the loader actually reads the stamp for.
 */
export function fuzzSaves(seed: number, n: number, only?: Family): Census {
  const rng = new Rng((seed * 0x27d4eb2d + 0x165667b1) >>> 0);
  // `Object.create(null)`, not `{}`: `byFamily[f] ??= ...` on a plain object
  // would silently return `Object` for a family named `constructor`.
  const census: Census = { trials: 0, byFamily: Object.create(null) as Record<string, FamilyCount>, failures: [] };
  for (let i = 0; i < n; i++) {
    const base = rng.chance(0.3) ? legacySave(rng) : validSave(rng);
    const t = runTrial(mutate(base, rng, only ?? rng.pick(FAMILIES)));
    census.trials++;
    const slot = (census.byFamily[t.family] ??= { total: 0, repaired: 0, rejected: 0, wiped: 0, changed: 0 });
    slot.total++;
    slot[t.outcome]++;
    if (t.changed) slot.changed++;
    if (t.crashed || t.violations.length > 0 || t.hubErrors.length > 0) census.failures.push(t);
  }
  return census;
}

/* ------------------------------------------------- the field type matrix */

export const WRONG_TYPES: readonly (readonly [string, unknown])[] = [
  ['string', 'seven'],
  ['number', 7],
  ['bool', true],
  ['null', null],
  ['array', [1, 2]],
  ['object', { a: 1 }],
];

export interface ShapeResult {
  shape: string;
  outcome: Outcome;
  /** The wrong type survived the repair path and is in the loaded meta. */
  laundered: boolean;
  /**
   * The wrong type was silently *converted* into the right shape rather than
   * replaced by the default — `unlockedClasses: "seven"` spreads to
   * `["s","e","v","e","n"]`. Shape-comparison alone calls that clean, which
   * hid five of these (code review, session 2).
   */
  coerced: boolean;
  /**
   * Hub numbers that came back non-finite from the loaded meta — laundering
   * with a consequence a player can see, rather than a type-purity complaint.
   */
  hubNonFinite: string[];
}

/**
 * The numbers the Hub derives the moment a save is loaded. `tierGate` is
 * `src/ui/hub.ts`'s own expression rather than a call, because it is inline
 * there — and it is here because without it a NaN `highestTier` was invisible
 * to the pin whose whole job is catching a NaN in front of the player: the
 * gate below it is `t > maxTier`, which is false for every `t` when `maxTier`
 * is NaN, so every map tier unlocks. (QA, session 2, D7/D8.)
 */
export function hubNumbers(m: MetaState): Record<string, number> {
  return {
    pointsAvailable: pointsAvailable(m),
    stashCapacity: stashCapacity(m),
    accountLevelFor: accountLevelFor(m.ember),
    tierGate: Math.max(1, Math.min(5, m.highestTier)),
  };
}

function shapeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

/**
 * Every `MetaState` field crossed with every wrong JSON type: small, total and
 * deterministic, which is what makes it usable as a *pin*. The random fuzz
 * above finds new families; this says exactly which shapes are broken today.
 */
export function fieldMatrix(): ShapeResult[] {
  const base = defaultMeta();
  const out: ShapeResult[] = [];
  for (const key of Object.keys(base)) {
    for (const [name, value] of WRONG_TYPES) {
      const save = JSON.parse(serializeMeta(base)) as { meta: Record<string, unknown> };
      save.meta[key] = value;
      const shape = `${key}=${name}`;
      let loaded: MetaState;
      try {
        loaded = deserializeMeta(JSON.stringify(save));
      } catch {
        out.push({ shape, outcome: 'rejected', laundered: false, coerced: false, hubNonFinite: [] });
        continue;
      }
      const want = (base as unknown as Record<string, unknown>)[key];
      const got = (loaded as unknown as Record<string, unknown>)[key];
      const laundered = shapeOf(got) !== shapeOf(want);
      out.push({
        shape,
        outcome: 'repaired',
        laundered,
        // Right shape, wrong provenance: the junk was converted rather than
        // replaced. `name` is the junk's shape, `shapeOf(want)` the default's.
        coerced: !laundered && name !== shapeOf(want) && JSON.stringify(got) !== JSON.stringify(want),
        hubNonFinite: Object.entries(hubNumbers(loaded))
          .filter(([, v]) => !Number.isFinite(v))
          .map(([k, v]) => `${k}=${v}`),
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------- CLI */

function usage(msg: string): never {
  console.error(`fuzz-save: ${msg}`);
  console.error('usage: npx tsx tools/fuzz-save.ts [--n <positive int>] [--seed <int>] [--family <name>]');
  console.error(`families: ${FAMILIES.join(', ')}`);
  process.exit(2);
}

function intArg(argv: string[], flag: string, dflt: number, positive: boolean): number {
  const i = argv.indexOf(flag);
  if (i < 0) return dflt;
  const raw = argv[i + 1];
  if (raw === undefined) usage(`${flag} needs a value`);
  const v = Number(raw);
  if (raw.trim() === '' || !Number.isInteger(v)) usage(`${flag} must be an integer, got ${JSON.stringify(raw)}`);
  if (positive && v <= 0) usage(`${flag} must be > 0, got ${v}`);
  return v;
}

function main(argv: string[]): void {
  const n = intArg(argv, '--n', 5000, true);
  const seed = intArg(argv, '--seed', 1, false);
  const fi = argv.indexOf('--family');
  let family: Family | undefined;
  if (fi >= 0) {
    const raw = argv[fi + 1];
    if (raw === undefined) usage('--family needs a value');
    if (!(FAMILIES as readonly string[]).includes(raw)) usage(`unknown family ${JSON.stringify(raw)}`);
    family = raw as Family;
  }

  const census = fuzzSaves(seed, n, family);
  console.log(`save fuzz  seed=${seed}  trials=${census.trials}  saveVersion=${SAVE_VERSION}`);
  console.log(`  ${'family'.padEnd(16)}${'n'.padStart(7)}  ${'repaired'.padStart(8)} ${'wiped'.padStart(6)} ${'rejected'.padStart(8)} ${'effective'.padStart(9)}`);
  for (const [fam, s] of Object.entries(census.byFamily).sort()) {
    const pct = ((s.changed / s.total) * 100).toFixed(0);
    console.log(
      `  ${fam.padEnd(16)}${String(s.total).padStart(7)}  ${String(s.repaired).padStart(8)} ${String(s.wiped).padStart(6)}` +
        ` ${String(s.rejected).padStart(8)} ${`${pct}%`.padStart(9)}`,
    );
  }

  const matrix = fieldMatrix();
  const list = (f: (r: ShapeResult) => boolean) => matrix.filter(f).map((r) => r.shape).join(', ') || 'none';
  console.log('\nfield x wrong-type matrix:');
  console.log(`  rejected  (repair path throws, whole account lost): ${list((r) => r.outcome === 'rejected')}`);
  console.log(`  laundered (wrong type kept in the loaded meta)    : ${list((r) => r.laundered)}`);
  console.log(`  coerced   (wrong type converted, not replaced)    : ${list((r) => r.coerced)}`);
  console.log(
    `  non-finite Hub number                            : ${
      matrix
        .filter((r) => r.hubNonFinite.length > 0)
        .map((r) => `${r.shape} -> ${r.hubNonFinite.join(',')}`)
        .join('; ') || 'none'
    }`,
  );

  if (census.failures.length > 0) {
    console.log(`\n${census.failures.length} FAILURES:`);
    for (const f of census.failures.slice(0, 20)) {
      console.log(`  [${f.family}] ${f.label}`);
      for (const v of f.violations) console.log(`      invariant: ${v}`);
      for (const h of f.hubErrors) console.log(`      hub: ${h}`);
      if (f.crash) console.log(`      CRASH: ${f.crash}`);
    }
    process.exit(1);
  }
  console.log('\nok — no crash, no broken invariant, no Hub error');
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('tools/fuzz-save.ts');
if (invokedDirectly) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`fuzz-save: ${message.replace(/\s+/g, ' ').trim()}`);
    process.exitCode = 1;
  }
}
