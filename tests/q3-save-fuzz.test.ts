/**
 * q3 — save fuzzer.
 *
 * QUALITY.md ALPHA: "corrupted-save (truncated/bit-flipped) loads into repair
 * path, never a crash; version migration test". SPEC-FINAL §14 G18 says the
 * same thing as a gate clause: "save round-trip + corrupt-save repair +
 * version migration".
 *
 * The harness is `tools/fuzz-save.ts`; deeper soaks than a suite should pay for
 * are `npx tsx tools/fuzz-save.ts --n 200000 --seed 7`.
 *
 * Three outcomes are tracked separately, because "never a crash" cannot tell
 * them apart and two of them are total data loss:
 *
 *   repaired — `deserializeMeta` returned the account.
 *   rejected — it threw, `loadMeta` caught, the account is silently gone.
 *   wiped    — it *returned* `defaultMeta()` for an account that had content,
 *              which is the same loss by a route no `catch` can observe.
 *
 * A fourth number, `changed`, is the one that keeps this file honest.
 * `loadMeta` wraps its whole body in `catch`, so **no input can make the crash
 * contract fail**; a corpus of no-op mutations would look exactly like a clean
 * run. Every family therefore has to prove it still moves the loaded state.
 *
 * Where the repair path loses data today it is pinned below and filed as a
 * `/src` defect in BACKLOG-QUALITY.md's Log. This lane's Scope (that file, §Scope)
 * allows `tests/**`, `tools/**` and `bench/**` only, so the regression tests for
 * those defects are written to the fixed behaviour and skipped, ready to unskip
 * with the fix. Each was confirmed to fail today.
 */

import { describe, expect, it } from 'vitest';

import {
  FAMILIES,
  type Family,
  checkMeta,
  exerciseHub,
  fieldMatrix,
  fuzzSaves,
  legacySave,
  mutate,
  runTrial,
  validMeta,
  validSave,
  withSavedRaw,
} from '../tools/fuzz-save';
import {
  SAVE_VERSION,
  defaultMeta,
  deserializeMeta,
  loadMeta,
  pointsAvailable,
  serializeMeta,
} from '../src/meta/meta';
import { SETTINGS_KEY, defaultSettings, loadSettings, saveSettings } from '../src/ui/settings';
import { Rng } from '../src/sim/rng';
import type { MetaState } from '../src/sim/types';

/** 20k trials cost ~2 s; three describe blocks want them, so run them once. */
let cached: ReturnType<typeof fuzzSaves> | null = null;
const bigCensus = () => (cached ??= fuzzSaves(7, 20_000));

/** Fails with the corruption that caused it, not with `expected 3 to be 0`. */
function expectClean(census: ReturnType<typeof fuzzSaves>): void {
  const report = census.failures
    .slice(0, 8)
    .map(
      (f) =>
        `  [${f.family}] ${f.label}\n${[...f.violations, ...f.hubErrors, f.crash ?? '']
          .filter(Boolean)
          .map((x) => `      ${x}`)
          .join('\n')}`,
    )
    .join('\n');
  expect(census.failures.length, `${census.failures.length}/${census.trials} bad loads:\n${report}`).toBe(0);
}

describe('q3 save fuzz: the crash contract', () => {
  it('survives 20,000 corrupted saves across all fifteen families', () => {
    const census = bigCensus();
    expectClean(census);
    expect(Object.keys(census.byFamily).sort()).toEqual([...FAMILIES].sort());
  });

  it.each(FAMILIES)('survives 1,500 corruptions of family %s', (family: Family) => {
    // Uniform random over families leaves each one with ~1/15 of the corpus and
    // no floor. Driving each family explicitly is what makes "all fifteen" true
    // of every run rather than of the average run.
    expectClean(fuzzSaves(11, 1_500, family));
  });

  it('survives every truncation of a real save, exhaustively', () => {
    const save = validSave(new Rng(4));
    let parsed = 0;
    for (let n = 0; n <= save.length; n++) {
      const t = runTrial({ family: 'truncate', label: `truncate@${n}`, json: save.slice(0, n), base: save });
      expect(t.crashed, `truncate@${n}: ${t.crash}`).toBe(false);
      expect(t.violations, `truncate@${n}`).toEqual([]);
      expect(t.hubErrors, `truncate@${n}`).toEqual([]);
      if (t.outcome !== 'rejected') parsed++;
    }
    // Only the untruncated save parses: JSON has no valid proper prefixes here.
    // Worth stating as an assertion because it is also the answer to what
    // QUALITY ALPHA means by "truncated saves load into the repair path" — by
    // this file's vocabulary, none of them do; they are all rejected, and the
    // player gets a fresh account rather than a crash. See the lane Log.
    expect(parsed, 'exactly one prefix of a save is itself a save').toBe(1);
  });

  it('survives every single-bit flip of a real save, exhaustively', () => {
    const save = validSave(new Rng(5));
    let repaired = 0;
    let rejected = 0;
    for (let i = 0; i < save.length; i++) {
      for (let bit = 0; bit < 7; bit++) {
        const json = save.slice(0, i) + String.fromCharCode(save.charCodeAt(i) ^ (1 << bit)) + save.slice(i + 1);
        const t = runTrial({ family: 'bitflip', label: `bitflip@${i}^${bit}`, json, base: save });
        expect(t.crashed, `bitflip@${i}^${bit}: ${t.crash}`).toBe(false);
        expect(t.violations, `bitflip@${i}^${bit}`).toEqual([]);
        expect(t.hubErrors, `bitflip@${i}^${bit}`).toEqual([]);
        if (t.outcome === 'rejected') rejected++;
        else repaired++;
      }
    }
    // Both branches are exercised by a single-bit flip, which is what makes
    // this sweep worth its ~800 ms: a flip inside a string value is absorbed,
    // a flip in the structure is not.
    expect(repaired).toBeGreaterThan(100);
    expect(rejected).toBeGreaterThan(100);
  });

  it('never crashes on the degenerate inputs a fuzzer will not reach', () => {
    const nasty = [
      '',
      ' ',
      'null',
      '0',
      '[]',
      '{}',
      '"save"',
      'undefined',
      '{"version":2}',
      '{"meta":{}}',
      '\u0000',
      '{'.repeat(500),
      '['.repeat(50_000),
    ];
    for (const raw of nasty) {
      expect(() => withSavedRaw(raw, loadMeta), JSON.stringify(raw)).not.toThrow();
      expect(checkMeta(withSavedRaw(raw, loadMeta)), JSON.stringify(raw)).toEqual([]);
    }
    // No save at all is the new-account path, not a corruption.
    expect(withSavedRaw(null, loadMeta)).toEqual(defaultMeta());
  });
});

describe('q3 save fuzz: the corpus is not degenerate', () => {
  /**
   * The load-bearing test of this file. `loadMeta` catches everything, so the
   * crash contract above cannot be violated by any input — a fuzzer that
   * quietly stopped corrupting anything would stay green forever. Each family
   * must therefore still change what loads. Floors are set well under the
   * measured rates, so this fails on a family going inert rather than on
   * ordinary drift.
   *
   * p7d re-measurement: `MetaState` shrank from ten-plus fields (several of
   * them large — the old procedurally-rolled relic `stash`, its `affixes`
   * arrays) down to a handful of small ones, so `validMeta` (`tools/
   * fuzz-save.ts`) now has far fewer bytes for a random-JSON-path family
   * (retype, drop-key, extreme-number, empty-container, grow-array,
   * proto-key, deep-nest, long-string) to land a no-op mutation in — every one
   * of those measured *higher* than before. `version` moved hard the other
   * way, from 63.2% to ~13.5%: the old `validMeta` always carried `ember`/
   * `accountLevel`/`stash`/`equipped`, so a hostile version stamp almost
   * always visibly stripped something; the new one carries none of those
   * fields at all (they no longer exist on the type), so only the ~30% of
   * the corpus built from `legacySave` — which now synthesises them back on
   * — has anything version-gated to strip in the first place. `rename-key`
   * and the byte-level families (truncate/bitflip/delete-span/duplicate-span/
   * insert-junk, which do not target a JSON path) also rose with the smaller
   * surface. Measured with this file's own seed/n: truncate 100, bitflip
   * 98.7, delete-span 99.5, duplicate-span 98.4, insert-junk 95.5, retype
   * 92.2, drop-key 75.0, rename-key 98.5, extreme-number 87.2,
   * empty-container 91.1, grow-array 91.7, proto-key 96.6, deep-nest 93.7,
   * long-string 93.7, version 13.5 (all %).
   *
   * p7f re-measurement: `migrate` no longer copies an unrecognised key into
   * `out` at all (it is built field-by-field from the known `MetaState`
   * shape, not a `{...base, ...meta}` spread), so a mutation whose only
   * effect was to plant a stray key at the *root* of `meta` stopped being
   * observable through `loadMeta`'s output. Two families lost most of their
   * effectiveness this way: `proto-key` (it plants `__proto__`/`constructor`/
   * etc. on a random object node — the root `meta` object is one of only a
   * handful of plain-object nodes in the tree, so a large share of hits used
   * to round-trip as a visible junk key and now do not) fell from 96.6% to
   * 34.7%, and `version` (whose only remaining version-gated effect is the
   * Ember->skillPoints conversion, now that the retired-key strip this
   * comment used to describe is gone) fell from 13.5% to 7.4%. Both drops are
   * the fix working as intended, not drift — a mutation that used to "succeed"
   * only because the bug let junk survive is now correctly a no-op more often.
   */
  const FLOOR: Partial<Record<Family, number>> = {
    version: 0.05,
    'proto-key': 0.3,
    'drop-key': 0.65,
    'extreme-number': 0.75,
  };
  it.each(FAMILIES)('family %s still changes what loads', (family: Family) => {
    const floor = FLOOR[family] ?? 0.85;
    const s = fuzzSaves(11, 1_500, family).byFamily[family];
    expect(s.total).toBe(1_500);
    expect(s.changed / s.total, `${family} effectiveness`).toBeGreaterThanOrEqual(floor);
  });

  it('the effectiveness counter itself can be false', () => {
    // QA, session 2: hard-coding `changed: true` in the harness left all
    // fifteen floors above passing. The one number that keeps this file honest
    // needs its own control, or the anti-vacuity guard is itself vacuous.
    const same = validSave(new Rng(31));
    expect(runTrial({ family: 'version', label: 'no-op', json: same, base: same }).changed).toBe(false);

    const meta = validMeta(new Rng(31));
    const other = serializeMeta({ ...meta, skillPoints: meta.skillPoints + 1 });
    expect(runTrial({ family: 'retype', label: 'real', json: other, base: serializeMeta(meta) }).changed).toBe(true);
  });

  it('the Hub exercise actually fires', () => {
    // Same hole on the other component: `exerciseHub` records only thrown
    // exceptions, and nothing any family produces can make one throw, so
    // stubbing the whole function out left the suite green (QA, session 2).
    const honest = validMeta(new Rng(29));
    expect(exerciseHub(honest)).toEqual([]);

    // A meta `loadMeta` cannot produce, but the Hub calls are real: `allocated`
    // holding a non-array breaks every tree entry point (`pointsAvailable`,
    // `canAllocate`, `allocate`, `refundBlocker` all read it) and nothing else.
    const broken = { ...honest, allocated: 5 } as unknown as MetaState;
    const errs = exerciseHub(broken);
    expect(errs.join(' | ')).toMatch(/pointsAvailable:/);
    expect(errs.join(' | ')).toMatch(/canAllocate:/);
  });

  it('the legacy bases carry something the version stamp is read for', () => {
    // p7f superseded the mechanism this test used to pin: `migrate` no longer
    // spreads `meta` wholesale, so all six retired keys (`orbs` plus the five
    // Ember-economy fields) are now stripped unconditionally, at every
    // version — see the dedicated p7f coverage in tests/meta.test.ts and
    // t6c-save-migration.test.ts for that. What the version stamp still
    // gates, and the only thing left for the `version` family to move, is the
    // one-time Ember->skillPoints conversion (`ECONOMY_RETIRED_AT`).
    const rng = new Rng(23);
    for (let i = 0; i < 20; i++) {
      const legacy = JSON.parse(legacySave(rng)) as { version: number; meta: Record<string, unknown> };
      expect(legacy.version).toBe(1);
      const retired = Object.keys(legacy.meta).filter((k) => !(k in defaultMeta()));
      expect(retired.length, 'a legacy base must carry every retired key').toBe(6);
      // Every retired key is stripped regardless of the stamp...
      const asV1 = deserializeMeta(JSON.stringify(legacy)) as unknown as Record<string, unknown>;
      const asNow = deserializeMeta(
        JSON.stringify({ version: SAVE_VERSION, meta: legacy.meta }),
      ) as unknown as Record<string, unknown>;
      for (const key of retired) {
        expect(asV1[key], key).toBeUndefined();
        expect(asNow[key], key).toBeUndefined();
      }
      // ...but the Ember conversion still depends on it: v1 converts, current
      // does not (the raw `ember` value round-trips into skillPoints only
      // below `ECONOMY_RETIRED_AT`).
      const ember = legacy.meta.ember as number;
      const base = legacy.meta.skillPoints as number;
      expect((asV1 as unknown as MetaState).skillPoints).toBe(base + Math.floor(ember / 100));
      expect((asNow as unknown as MetaState).skillPoints).toBe(base);
    }
  });

  it('reaches every outcome, so no branch is untested', () => {
    const census = bigCensus();
    const sum = (k: 'repaired' | 'rejected' | 'wiped') =>
      Object.values(census.byFamily).reduce((a, s) => a + s[k], 0);
    // Well clear of the boundaries: the point is that a change which sent every
    // save down one branch would be visible here, not that these exact ratios
    // are meaningful.
    expect(sum('repaired')).toBeGreaterThan(2_000);
    expect(sum('rejected')).toBeGreaterThan(2_000);
    // b012/D5: fixing `deserializeMeta` to throw on a damaged *wrapper*
    // (rather than silently returning `defaultMeta()`) reclassified most of
    // what used to land here as `rejected` instead — measured (seed 7) 27,
    // down from >50 pre-fix. What is left is the genuine article: a *valid*
    // but entirely-emptied `meta` object (`empty-container`/`retype-to-{}`
    // landing on the `meta` key itself), which has no wrapper damage to
    // reject and legitimately repairs to `defaultMeta()`. Floor set at 15,
    // under every seed measured (23-34), same "still reached, not the exact
    // ratio" spirit as the other two clauses.
    expect(sum('wiped'), 'the silent-wipe path is reached; see D5').toBeGreaterThan(15);
  });

  it('generates saves that are genuinely valid before they are corrupted', () => {
    // Without this the whole file could pass by the generator emitting garbage
    // that always lands on the `defaultMeta()` fallback.
    const rng = new Rng(9);
    for (let i = 0; i < 200; i++) {
      const meta = validMeta(rng);
      expect(checkMeta(meta)).toEqual([]);
      const loaded = withSavedRaw(serializeMeta(meta), loadMeta);
      expect(loaded).toEqual(meta);
      expect(loaded).not.toEqual(defaultMeta());
    }
    // ...and the v0.2-shaped bases, which are what give the `version` family
    // something the loader reads the stamp for, are valid too — minus the
    // retired key, which is the whole point of them.
    for (let i = 0; i < 50; i++) {
      const loaded = withSavedRaw(legacySave(rng), loadMeta) as unknown as Record<string, unknown>;
      expect(checkMeta(loaded)).toEqual([]);
      expect(loaded.orbs).toBeUndefined();
      expect(loaded).not.toEqual(defaultMeta());
    }
  });

  it('repairs rather than resets: a parseable corruption keeps the rest of the account', () => {
    const rng = new Rng(13);
    let effective = 0;
    for (let i = 0; i < 300; i++) {
      const meta = validMeta(rng);
      // These two families never break the JSON *and* never rewrite a
      // `MetaState` field — `version` touches the stamp, `proto-key` adds a
      // key — so every one of them must come back with the account intact.
      // (`grow-array` and `retype` belong to the census, not here: they change
      // the very fields this would be asserting the preservation of.)
      for (const family of ['version', 'proto-key'] as const) {
        const mut = mutate(serializeMeta(meta), rng, family);
        const loaded = withSavedRaw(mut.json, loadMeta);
        expect(loaded.skillPoints, mut.label).toBe(meta.skillPoints);
        expect(loaded.completedQuests, mut.label).toEqual(meta.completedQuests);
        if (mut.json !== mut.base) effective++;
      }
    }
    // Counting calls would pass with 600 no-ops; count corruptions instead.
    expect(effective).toBeGreaterThan(400);
  });

  it('has an invariant scan that actually fires', () => {
    // Twelve hand-broken metas, each of which must be named by `checkMeta`. Q2's
    // first cut shipped a scan clause that could not fire; this is the guard
    // that stops that recurring here.
    const good = validMeta(new Rng(2));
    const poison: [string, (m: Record<string, unknown>) => void, RegExp][] = [
      ['missing field', (m) => delete m.skillPoints, /missing field skillPoints/],
      ['allocated not an array', (m) => void (m.allocated = 5), /allocated is not an array/],
      ['allocated without start', (m) => void (m.allocated = [1]), /does not contain the start node/],
      ['allocated non-number', (m) => void (m.allocated = [0, 'x']), /holds a non-number/],
      ['allocated unknown node', (m) => void (m.allocated = [0, 999_999]), /holds unknown node 999999/],
      ['allocated disconnected', (m) => void (m.allocated = [0, 40]), /is not connected/],
      ['questProgress not an object', (m) => void (m.questProgress = []), /questProgress is not an object/],
      ['completedQuests not an array', (m) => void (m.completedQuests = 'a'), /completedQuests is not an array/],
    ];
    for (const [name, breakIt, want] of poison) {
      const copy = JSON.parse(JSON.stringify(good)) as Record<string, unknown>;
      breakIt(copy);
      expect(checkMeta(copy).join(' | '), name).toMatch(want);
    }
    // ...and the unpoisoned control is clean, so the scan is not simply loud.
    expect(checkMeta(good)).toEqual([]);
    expect(checkMeta(null)).toEqual(['meta is not an object']);
    expect(checkMeta([])).toEqual(['meta is not an object']);
  });

  it('is reproducible from its seed', () => {
    const label = (c: ReturnType<typeof fuzzSaves>) => JSON.stringify(c.byFamily);
    expect(label(fuzzSaves(3, 800))).toBe(label(fuzzSaves(3, 800)));
    // ...and the seed is actually used, so the equality above is not vacuous.
    expect(label(fuzzSaves(3, 800))).not.toBe(label(fuzzSaves(4, 800)));

    // Family counts alone would still pass if only the family choice were
    // seeded, so compare the corruptions themselves.
    const corpus = (seed: number) => {
      const rng = new Rng(seed);
      return Array.from({ length: 60 }, () => mutate(validSave(rng), rng).json).join('');
    };
    expect(corpus(21)).toBe(corpus(21));
    expect(corpus(21)).not.toBe(corpus(22));
  });
});

describe('q3 save fuzz: version migration', () => {
  // p7d: `< ECONOMY_RETIRED_AT` (4) coerces exactly like `< retiredIn` used to
  // for the (now-removed, p7f) retired-key strip — `null`/`true`/`'3'`/`[]`
  // all land under 4 and convert the Ember balance, `{v: 4}` coerces to NaN
  // and does not. Since p7f, `ember`/`accountLevel` themselves are dropped
  // unconditionally at every stamp (they are not `MetaState` fields); only
  // the *conversion into skillPoints* stays version-gated.
  const ECONOMY_STAMPS: [unknown, boolean][] = [
    [0, true], [1, true], [2, true], [3, true], [4, false], [999, false], [-1, true],
    [1.5, true], ['3', true], [null, true], [true, true], [[], true], [{ v: 4 }, false],
  ];

  it.each(ECONOMY_STAMPS)('loads a save stamped version %p through the repair path', (version, convertsEmber) => {
    const meta = { ...validMeta(new Rng(6)), ember: 500, accountLevel: 7 };
    const loaded = withSavedRaw(JSON.stringify({ version, meta }), loadMeta) as unknown as Record<string, unknown>;
    expect(checkMeta(loaded)).toEqual([]);
    expect(loaded.ember, `version ${JSON.stringify(version)}`).toBeUndefined();
    expect(loaded.accountLevel, `version ${JSON.stringify(version)}`).toBeUndefined();
    expect((loaded as unknown as MetaState).skillPoints, `version ${JSON.stringify(version)}`).toBe(
      meta.skillPoints + (convertsEmber ? 5 : 0),
    );
    expect((loaded as unknown as MetaState).completedQuests).toEqual(meta.completedQuests);
  });

  it('loads a save with no version key at all', () => {
    const meta = validMeta(new Rng(6));
    const loaded = withSavedRaw(JSON.stringify({ meta }), loadMeta);
    expect(checkMeta(loaded)).toEqual([]);
    expect(loaded.skillPoints).toBe(meta.skillPoints);
  });

  it('p7f: strips an unknown key under any version stamp, hostile or honest', () => {
    // Before p7f this pinned that `orbs` only stripped on one side of
    // `migrate`'s `version < retiredIn` comparison — a real gap, since the
    // comparison coerces oddly under a hostile stamp (`null`/`true`/`[]` land
    // below 2 and strip, `'2'` and `{v:2}` do not). Since `migrate` no longer
    // reads `version` to decide whether to *carry* an unknown key at all — it
    // is built field-by-field from the known `MetaState` shape — `orbs` is
    // absent from the output under every stamp here, honest or not. The
    // version value can still be reached by `<` coercion for other purposes
    // (the Ember conversion above), just not this one any more.
    const meta = validMeta(new Rng(8));
    const withOrbs = { ...meta, orbs: { whetting: 3 } };
    const hostileVersions: unknown[] = [
      -1, 0, 1, 1.5, null, true, false, [], 2, 3, 999, '2', { v: 2 },
    ];
    for (const version of hostileVersions) {
      const out = deserializeMeta(JSON.stringify({ version, meta: withOrbs })) as unknown as Record<string, unknown>;
      expect(out.orbs, `version ${JSON.stringify(version)}`).toBeUndefined();
      expect((out as unknown as MetaState).skillPoints, `version ${JSON.stringify(version)}`).toBe(meta.skillPoints);
    }
  });

  it('a save this client wrote reloads byte-identically', () => {
    // The round-trip half of G18, and the fixed point t6c asks for: a save must
    // not rewrite itself on every load.
    const rng = new Rng(15);
    for (let i = 0; i < 100; i++) {
      const once = serializeMeta(validMeta(rng));
      expect(serializeMeta(withSavedRaw(once, loadMeta))).toBe(once);
      expect((JSON.parse(once) as { version: number }).version).toBe(SAVE_VERSION);
    }
  });
});

/**
 * The field x wrong-type matrix. Small, total, deterministic — which is what
 * makes it a pin rather than a sample. The lists are **subset** assertions on
 * purpose: a new hole turns this red, and fixing an old one does not.
 */
describe('q3 save fuzz: the pinned holes in the repair path', () => {
  /**
   * Repair path throws; `loadMeta` falls back and the account is lost.
   * p7g: `allocated`/`unlockedClasses`/`completedQuests` used to spread with
   * `[...x]` and no `Array.isArray` guard, so a number/bool/object value threw
   * out of `migrate()` (filed as D1 below, now un-skipped). All nine now carry
   * the same guard `unlockedCores` already had, so nothing is left rejected.
   */
  const KNOWN_REJECTED: string[] = [];
  /**
   * Wrong type spread straight through `migrate` into the live meta. p7d
   * (`accountLevel`/`ember`/`nextRelicId` retired) and fb023 (`stash`/
   * `equipped` retired) shrank this list to the one field left with no
   * type guard at all.
   */
  const KNOWN_LAUNDERED = [
    'highestTier=string', 'highestTier=bool', 'highestTier=null', 'highestTier=array', 'highestTier=object',
  ];
  /**
   * Right shape, wrong provenance: the spread *converted* the junk instead of
   * replacing it, so `unlockedClasses: "seven"` becomes five one-letter class
   * names and `questProgress: "seven"` becomes five string-valued metrics.
   * Shape comparison alone calls these clean, which hid all six.
   */
  const KNOWN_COERCED = [
    // fb012: not a real repair-path hole — `autoPickLevelUps` is the first
    // boolean-typed MetaState field, and `fieldMatrix`'s coerced heuristic
    // compares `WRONG_TYPES`' own label `'bool'` against `typeof` value
    // `'boolean'`, which never match for *any* correctly-typed boolean, valid
    // or not. `migrate` keeps a real boolean (guarded, like `unlockedCores`)
    // rather than converting it, so there is nothing here to fix.
    'autoPickLevelUps=bool',
    // p7g closed the other four: `unlockedClasses`/`completedQuests` gained
    // the same `Array.isArray` guard `unlockedCores` already had, and
    // `questProgress` gained the same object-typeof guard `equipmentStash`
    // already had — a string or array value is now replaced outright rather
    // than spread character-by-character/index-by-index into junk keys.
  ];
  /**
   * Laundering with a consequence on screen. The `highestTier` three arrived
   * only after `hubNumbers` was widened to include the Hub's own tier-gate
   * expression — the pin existed to catch exactly this and could not see it
   * (QA, session 2, D7/D8). p7d dropped `hubNumbers`' `accountLevel`/
   * `stashCapacity` entries along with the fields/function themselves.
   */
  const KNOWN_HUB_NAN = ['highestTier=string', 'highestTier=array', 'highestTier=object'];

  const shapes = (pick: (r: ReturnType<typeof fieldMatrix>[number]) => boolean) =>
    fieldMatrix().filter(pick).map((r) => r.shape);

  it('no new field type crashes the repair path', () => {
    expect(shapes((r) => r.outcome === 'rejected').filter((s) => !KNOWN_REJECTED.includes(s))).toEqual([]);
  });

  it('no new field type launders through the repair path', () => {
    expect(shapes((r) => r.laundered).filter((s) => !KNOWN_LAUNDERED.includes(s))).toEqual([]);
  });

  it('no new field type is coerced instead of replaced', () => {
    expect(shapes((r) => r.coerced).filter((s) => !KNOWN_COERCED.includes(s))).toEqual([]);
  });

  it('no new field type puts a non-finite number in front of the player', () => {
    expect(shapes((r) => r.hubNonFinite.length > 0).filter((s) => !KNOWN_HUB_NAN.includes(s))).toEqual([]);
  });

  it('the pins are still describing something real', () => {
    // A subset assertion passes trivially once the sets empty out. This says
    // the lists have not silently gone stale as *descriptions*, and points at
    // the skipped regression tests below when they do.
    const matrix = fieldMatrix();
    const counts = {
      rejected: matrix.filter((r) => r.outcome === 'rejected').length,
      laundered: matrix.filter((r) => r.laundered).length,
      coerced: matrix.filter((r) => r.coerced).length,
      hubNaN: matrix.filter((r) => r.hubNonFinite.length > 0).length,
    };
    expect(counts, 'a hole closed — re-measure the KNOWN_* lists and unskip the matching regression test').toEqual({
      rejected: KNOWN_REJECTED.length,
      laundered: KNOWN_LAUNDERED.length,
      coerced: KNOWN_COERCED.length,
      hubNaN: KNOWN_HUB_NAN.length,
    });
  });
});

/**
 * Regression tests for confirmed `/src` defects, written to the behaviour the
 * repair path *should* have and skipped because this lane's Scope
 * (BACKLOG-QUALITY.md §Scope) forbids `/src` edits. The bug reports are in
 * that file's Log, 2026-08-26 session 2, as D1-D9. Each one was confirmed to
 * fail today for the reason in its comment; unskip it with the fix.
 *
 * p7d retired the whole subject of D2/D3/D6/D7/D9 — `accountLevel`, `ember`,
 * `accountLevelFor`, and `nextRelicId` no longer exist, and `hubNumbers` no
 * longer derives a tier gate from any of them the way it used to for D7 —
 * so those five are deleted outright (MIGRATION.md's retirement rule: a
 * `.skip` stays alive only until the code it covers is deleted, and that
 * code is gone in this same commit). D1/D4/D5 survive, updated for the
 * current field set (no `stash`, `skillPoints` in place of `ember`).
 */
describe('q3 save fuzz: filed /src defects', () => {
  // D1. `migrate` spreads `[...meta.allocated]` without an `Array.isArray`
  // check, so a save whose array field holds a number, a bool or an object
  // throws out of the repair path entirely and `loadMeta` replaces the whole
  // account with `defaultMeta()`. The defaults for every one of these fields
  // are already in `base` — the repair is a one-line guard per field, and the
  // data loss is total without it.
  it('D1: an array field of the wrong type falls back to its default, not the whole account', () => {
    const meta = validMeta(new Rng(1));
    const base = defaultMeta() as unknown as Record<string, unknown>;
    for (const key of ['allocated', 'unlockedClasses', 'completedQuests']) {
      for (const junk of [7, true, { a: 1 }]) {
        const where = `${key}=${JSON.stringify(junk)}`;
        const loaded = withSavedRaw(
          JSON.stringify({ version: SAVE_VERSION, meta: { ...meta, [key]: junk } }),
          loadMeta,
        ) as unknown as Record<string, unknown>;
        expect(checkMeta(loaded), where).toEqual([]);
        // The broken field falls back to its own default...
        expect(loaded[key], where).toEqual(base[key]);
        // ...and the rest of the account is still the player's.
        expect(loaded.skillPoints, where).toBe(meta.skillPoints);
        expect(loaded.completedQuests, where).toEqual(key === 'completedQuests' ? base[key] : meta.completedQuests);
      }
    }
  });

  // D4. `pointsAvailable` counts `allocated.filter(id => id !== 0).length`, so
  // a save holding the same node id three times spends three points on one
  // node. `isConnected` passes it because it works on a Set. Deduping in the
  // repair path is the fix; the assertion is written against that.
  it('D4: a duplicated node id in `allocated` costs one point, not three', () => {
    const loaded = withSavedRaw(
      JSON.stringify({ version: SAVE_VERSION, meta: { ...defaultMeta(), allocated: [0, 1, 1, 1] } }),
      loadMeta,
    );
    expect(loaded.allocated).toEqual([0, 1]);
    expect(pointsAvailable(loaded)).toBe(pointsAvailable({ ...loaded, allocated: [0, 1] }));
  });

  // D5. `deserializeMeta` returns `defaultMeta()` for `!parsed.meta` instead of
  // throwing, so a save whose *wrapper* is damaged — `meta` renamed, set to a
  // scalar, or dropped — is discarded without any error at all. It never
  // reaches `loadMeta`'s `catch`, so no log, telemetry sink or "your save could
  // not be read" dialogue could ever be hung off it. The fuzzer reaches this on
  // ~1.5% of trials, mostly through `rename-key`.
  it('D5: a damaged save wrapper is distinguishable from having no save', () => {
    const meta = validMeta(new Rng(3));
    for (const raw of [
      JSON.stringify({ version: SAVE_VERSION, meta_: meta }),
      JSON.stringify({ version: SAVE_VERSION, meta: 0 }),
      JSON.stringify({ version: SAVE_VERSION, META: meta }),
      JSON.stringify({ version: SAVE_VERSION }),
      // D10's companion case: a *string* `meta` passes the `!parsed.meta`
      // guard, spreads into `{"0":"a","1":"b","2":"c"}` plus the defaults, and
      // those index keys then round-trip into every future save forever.
      '{"version":2,"meta":"abc"}',
    ]) {
      expect(() => deserializeMeta(raw), raw.slice(0, 40)).toThrow();
      // ...and the game still opens, on a fresh account, via the catch.
      expect(checkMeta(withSavedRaw(raw, loadMeta)), raw.slice(0, 40)).toEqual([]);
    }
  });
});

/**
 * The settings blob is the other thing read out of storage at boot, and it is
 * loaded the same way. It is here because it is the counter-example the bug
 * reports above lean on: `loadSettings` runs its parse through `sanitize`, and
 * as a result there is nothing to file against it.
 */
describe('q3 save fuzz: the settings blob', () => {
  /** Nothing like the defaults, so "survived" and "was reset" look different. */
  function customSettings(): ReturnType<typeof defaultSettings> {
    return {
      masterVolume: 0.25,
      sfxVolume: 0.5,
      shake: 0,
      damageNumbers: false,
      showRanges: true,
      showGrid: true,
      showEnemyHpBars: false,
      showPathIndicators: false,
      accessiblePalette: true,
      reducedFlash: true,
      cleanProfile: true,
      maxDamageNumbers: 137,
    };
  }

  it('round-trips real settings, so the assertions below are not just sanitize', () => {
    // Without this the whole block passes against `loadSettings = () =>
    // defaultSettings()`, which would be total loss of settings persistence.
    const custom = customSettings();
    const raw = withSavedRaw('', () => {
      saveSettings(custom);
      return globalThis.localStorage!.getItem(SETTINGS_KEY)!;
    }, SETTINGS_KEY);
    expect(withSavedRaw(raw, loadSettings, SETTINGS_KEY)).toEqual(custom);
  });

  it('sanitises every corruption into usable settings', () => {
    const rng = new Rng(17);
    const dflt = defaultSettings();
    const base = JSON.stringify(customSettings());
    let untouchedSurvived = 0;
    for (let i = 0; i < 3_000; i++) {
      const mut = mutate(base, rng);
      let s: ReturnType<typeof loadSettings> | undefined;
      expect(() => {
        s = withSavedRaw(mut.json, loadSettings, SETTINGS_KEY);
      }, mut.label).not.toThrow();
      const got = s!;
      expect(Object.keys(got).sort(), mut.label).toEqual(Object.keys(dflt).sort());
      for (const key of ['masterVolume', 'sfxVolume', 'shake'] as const) {
        expect(Number.isFinite(got[key]), `${mut.label} ${key}`).toBe(true);
        expect(got[key], `${mut.label} ${key}`).toBeGreaterThanOrEqual(0);
        expect(got[key], `${mut.label} ${key}`).toBeLessThanOrEqual(1);
      }
      expect(Number.isInteger(got.maxDamageNumbers), mut.label).toBe(true);
      expect(got.maxDamageNumbers, mut.label).toBeGreaterThanOrEqual(0);
      expect(got.maxDamageNumbers, mut.label).toBeLessThanOrEqual(400);
      for (const key of ['damageNumbers', 'showRanges', 'showGrid', 'reducedFlash', 'cleanProfile'] as const) {
        expect(typeof got[key], `${mut.label} ${key}`).toBe('boolean');
      }
      // A one-field corruption must not reset the other seven.
      if (got.maxDamageNumbers === 137 && got.masterVolume === 0.25) untouchedSurvived++;
    }
    // Sanitising is not the same as resetting, and most corruptions here are
    // parseable: the untouched fields have to come back.
    expect(untouchedSurvived).toBeGreaterThan(1_000);
  });
});
