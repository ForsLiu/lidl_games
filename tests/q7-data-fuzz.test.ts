/**
 * q7 — content-data loader fuzz. Drives `tools/fuzz-data.ts` against the real
 * `loadContent()` through a mocked `/data` import seam.
 *
 * Read `tools/fuzz-data.ts`'s header first; it explains the two censuses and why
 * the *accepted* column is the artefact. This file is the driver, the pins and
 * the bug reports.
 *
 * The seam: every `data/*.json` module is replaced by a stable holder object
 * whose contents are swapped per trial. Two consequences shape the driver.
 *
 *   - `loadContent()` memoises into a module-level `cached`, so a trial that is
 *     *accepted* poisons the module and the next one needs `vi.resetModules()`
 *     (~10 ms). A *rejected* trial leaves `cached` null and can be run against
 *     the warm module (~0.2 ms). The driver tracks that with `dirty`, which is
 *     the only reason a 5,700-case census costs ~20 s instead of 60.
 *   - `wardenBase` is parsed at module scope, so a warden mutation is invisible
 *     to a warm module. Warden always re-imports, and
 *     `a warm module cannot see a warden edit` pins the hazard rather than
 *     trusting the comment.
 *
 * Depth: the census is exhaustive and fixed-size, so there is nothing to turn
 * up. `Q7_REPORT=1 npx vitest run tests/q7-data-fuzz.test.ts` prints it;
 * `Q7_RECORD=1` prints a fresh `tests/q7-loader-holes.ts` to paste.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  DATA_FILES,
  FAMILIES,
  GARBAGE,
  INFINITE,
  IMPORT_TIME_FILES,
  allStringSites,
  census,
  errorLine,
  filesOnDisk,
  mutate,
  pristine,
  refVerdict,
  report,
  scanContent,
  summarize,
  tallyRefs,
  type DataFile,
  type Family,
  type JsonValue,
  type Outcome,
  type RefVerdict,
  type Trial,
} from '../tools/fuzz-data';
import { ACCEPTED, INEFFECTIVE, REF_VERDICTS } from './q7-loader-holes';

/* -------------------------------------------------------------- the seam */

/**
 * One stable object per `/data` module. The factory captures the reference
 * once, so the driver swaps *contents* rather than the object — replacing the
 * value would leave the loader holding the old one, which is the trap that made
 * the first three attempts at this file silently fuzz nothing.
 *
 * The names are spelled out rather than derived from `DATA_FILES`: `vi.mock` is
 * hoisted above every import, so nothing imported can be named here.
 */
const holders = vi.hoisted(() => {
  const names = [
    'vsupgrades', 'classes', 'cores', 'damagetypes', 'dev', 'enemies', 'equipment',
    'modifiers', 'quests', 'spawns', 'towers', 'tree', 'warden', 'waves',
  ];
  const h: Record<string, Record<string, unknown>> = {};
  for (const n of names) h[n] = {};
  return h;
});

vi.mock('../data/vsupgrades.json', () => ({ default: holders.vsupgrades }));
vi.mock('../data/classes.json', () => ({ default: holders.classes }));
vi.mock('../data/cores.json', () => ({ default: holders.cores }));
vi.mock('../data/damagetypes.json', () => ({ default: holders.damagetypes }));
vi.mock('../data/dev.json', () => ({ default: holders.dev }));
vi.mock('../data/enemies.json', () => ({ default: holders.enemies }));
vi.mock('../data/equipment.json', () => ({ default: holders.equipment }));
vi.mock('../data/modifiers.json', () => ({ default: holders.modifiers }));
vi.mock('../data/quests.json', () => ({ default: holders.quests }));
vi.mock('../data/spawns.json', () => ({ default: holders.spawns }));
vi.mock('../data/towers.json', () => ({ default: holders.towers }));
vi.mock('../data/tree.json', () => ({ default: holders.tree }));
vi.mock('../data/warden.json', () => ({ default: holders.warden }));
vi.mock('../data/waves.json', () => ({ default: holders.waves }));

/** Every file pristine, except `overrideFile` which gets `override`. */
function install(overrideFile: DataFile | null, override: JsonValue | null): void {
  for (const f of DATA_FILES) {
    const h = holders[f];
    for (const k of Object.keys(h)) delete h[k];
    Object.assign(h, f === overrideFile ? (override as object) : (pristine(f) as object));
  }
}

/**
 * `/data`'s hashes before a single mutation has been built, captured at module
 * scope so the no-writes pin brackets the whole file rather than one test.
 */
const DISK_AT_START = filesOnDisk();

interface ContentMod {
  loadContent(): unknown;
}

interface LoadResult {
  outcome: Outcome;
  error: string;
  content: unknown;
}

let mod: ContentMod | null = null;
/** True when the warm module has a populated `cached` and must be thrown away. */
let dirty = true;

async function freshModule(): Promise<void> {
  vi.resetModules();
  mod = (await import('../src/sim/content')) as ContentMod;
  dirty = false;
}

/** Install one mutated file over pristine data and ask `loadContent` about it. */
async function load(file: DataFile, root: JsonValue): Promise<LoadResult> {
  install(file, root);
  if (dirty || IMPORT_TIME_FILES.includes(file) || !mod) {
    try {
      await freshModule();
    } catch (e) {
      // A file parsed at module scope (`warden`) fails here, not in loadContent.
      dirty = true;
      return { outcome: 'rejected', error: errorLine(e), content: null };
    }
  }
  const warm = mod;
  if (!warm) throw new Error('q7: no content module after freshModule() resolved');
  try {
    const content = warm.loadContent();
    dirty = true;
    return { outcome: 'accepted', error: '', content };
  } catch (e) {
    return { outcome: 'rejected', error: errorLine(e), content: null };
  }
}

/* ----------------------------------------------------------- the censuses */

interface CensusA {
  trials: Trial[];
  ineffective: string[];
}

let censusA: CensusA | null = null;

/**
 * Run once and share: the census is deterministic, so a second run would be 14 s
 * spent proving `===`. `the census is deterministic` re-runs a slice instead.
 */
async function runCensusA(): Promise<CensusA> {
  if (censusA) return censusA;
  const trials: Trial[] = [];
  const ineffective: string[] = [];
  for (const c of census()) {
    const root = pristine(c.site.file);
    const before = JSON.stringify(root);
    const moved = mutate(root, c.site, c.family);
    if (!moved || JSON.stringify(root) === before) {
      ineffective.push(c.key);
      continue;
    }
    const r = await load(c.site.file, root);
    trials.push({
      key: c.key,
      file: c.site.file,
      path: c.site.path,
      family: c.family,
      outcome: r.outcome,
      error: r.error,
      complaints: r.outcome === 'accepted' ? scanContent(r.content) : [],
    });
  }
  censusA = { trials, ineffective };
  return censusA;
}

let censusB: Record<string, RefVerdict> | null = null;
let censusBCounts: Record<string, { total: number; accepted: number }> | null = null;

async function runCensusB(): Promise<Record<string, RefVerdict>> {
  if (censusB) return censusB;
  const rows: { path: string; outcome: Outcome }[] = [];
  for (const s of allStringSites()) {
    const root = pristine(s.file);
    if (!mutate(root, s, 'to-string')) continue;
    const r = await load(s.file, root);
    rows.push({ path: s.path, outcome: r.outcome });
  }
  const counts = tallyRefs(rows);
  censusBCounts = counts;
  const out: Record<string, RefVerdict> = {};
  for (const [p, c] of Object.entries(counts)) out[p] = refVerdict(c);
  censusB = out;
  return out;
}

function groupAccepted(trials: Trial[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const t of trials) {
    if (t.outcome !== 'accepted') continue;
    (out[t.path] ??= []).push(t.family);
  }
  return out;
}

/* ------------------------------------------------------- seam is alive */

describe('q7 — the /data import seam', () => {
  it('loads pristine data cleanly, which is the control every other case reads against', async () => {
    install(null, null);
    await freshModule();
    const content = mod!.loadContent() as { towers: { towers: unknown[] } };
    dirty = true;
    expect(content.towers.towers.length).toBeGreaterThan(0);
    expect(scanContent(content)).toEqual([]);
  });

  it('carries an edit through to the loader, so a mutation is not fuzzing a copy', async () => {
    const root = pristine('towers') as { towers: { key: string; name: string }[] };
    root.towers[0].name = 'Q7 Sentinel';
    const r = await load('towers', root as unknown as JsonValue);
    expect(r.outcome).toBe('accepted');
    const towers = (r.content as { towers: { towers: { name: string }[] } }).towers.towers;
    expect(towers[0].name).toBe('Q7 Sentinel');
  });

  it('rejects a hand-aimed bad value, so "rejected" is a verdict and not a stuck default', async () => {
    const root = pristine('towers') as { towers: { hp: unknown }[] };
    root.towers[0].hp = 'not a number';
    const r = await load('towers', root as unknown as JsonValue);
    expect(r.outcome).toBe('rejected');
    expect(r.error.length).toBeGreaterThan(0);
  });

  it('mocks exactly the files src/sim/content.ts imports', () => {
    const src = readFileSync('src/sim/content.ts', 'utf8');
    const imported = new Set<string>();
    for (const m of src.matchAll(/from '\.\.\/\.\.\/data\/([a-z]+)\.json'/g)) imported.add(m[1]);
    expect([...imported].sort()).toEqual([...DATA_FILES].sort());
  });

  it('a warm module cannot see a warden edit, which is why warden always re-imports', async () => {
    // The hazard this pins: `wardenBase` is parsed at module scope, so with a
    // warm module the mutation is a no-op and every warden trial would score
    // "accepted" for the wrong reason. `load()` special-cases it; this proves
    // the special case is load-bearing rather than defensive.
    install(null, null);
    await freshModule();
    const warm = mod!;
    mod!.loadContent();
    dirty = true;

    const authored = (pristine('warden') as { maxHp: number }).maxHp;
    const bad = pristine('warden') as { maxHp: unknown };
    bad.maxHp = 'not a number';
    install('warden', bad as unknown as JsonValue);
    // Warm module, no re-import: the bad sheet is simply not read, and the
    // module still holds the number it parsed at import. No `?? undefined`
    // escape hatch here — if the export goes away this must go red, because a
    // vanished `wardenBase` is exactly the change that would move where the
    // warden sheet is validated.
    const stale = (warm as unknown as { wardenBase: { maxHp: number } }).wardenBase;
    expect(stale.maxHp).toBe(authored);

    // With the re-import the driver actually does, it is rejected at import.
    const r = await load('warden', bad as unknown as JsonValue);
    expect(r.outcome).toBe('rejected');
  });

  it('scanContent fires, and is silent on a world that is fine', async () => {
    install(null, null);
    await freshModule();
    const good = mod!.loadContent();
    dirty = true;
    expect(scanContent(good)).toEqual([]);

    // A duplicated tower row (eleven rows, ten keys) is b013/E4's own case —
    // the loader now refuses it outright, so `scanContent` never sees it via
    // `loadContent()` any more. `scanContent`'s collision detector is unit
    // tested directly, on a hand-built fixture, so its own logic stays
    // covered independent of whether the loader still lets one through.
    const dup = pristine('towers') as { towers: JsonValue[] };
    dup.towers.push(dup.towers[0]);
    const r = await load('towers', dup as unknown as JsonValue);
    expect(r.outcome).toBe('rejected');

    const row = { key: 'dup', cost: 10, hp: 100, attack: null };
    const fixture = {
      towers: { towers: [row, row] },
      enemies: { enemies: [] },
      towerByKey: new Map([['dup', row]]),
      towerById: new Map([[0, row]]),
      enemyByKey: new Map(),
      enemyById: new Map(),
      tree: { nodes: [] },
      treeById: new Map(),
    };
    expect(scanContent(fixture).join('\n')).toMatch(/rows collapse to/);
  });

  it('the effectiveness predicate can be false, so the ineffective count is not decoration', () => {
    // The guard `runCensusA` uses, run against a mutation that moves nothing.
    const root = pristine('towers');
    const before = JSON.stringify(root);
    const inertSite = { file: 'towers' as DataFile, path: 'towers.towers', pointer: ['towers'], kind: 'array' as const, inArray: false };
    const moved = mutate(root, inertSite, 'flip-bool');
    expect(moved).toBe(false);
    expect(JSON.stringify(root)).toBe(before);

    const real = pristine('towers');
    expect(mutate(real, inertSite, 'empty-array')).toBe(true);
    expect(JSON.stringify(real)).not.toBe(before);
  });
});

/* -------------------------------------------------------------- census A */

describe('q7 — every field, every wrong shape', () => {
  it('runs the census and reports it', async () => {
    const { trials, ineffective } = await runCensusA();
    const s = summarize(trials);
    if (process.env.Q7_REPORT) console.log(report(s));
    if (process.env.Q7_RECORD) {
      const acc = groupAccepted(trials);
      console.log('=== ACCEPTED ===');
      for (const p of Object.keys(acc).sort()) console.log(`  '${p}': [${acc[p].map((f) => `'${f}'`).join(', ')}],`);
      console.log('=== INEFFECTIVE ===');
      for (const k of ineffective) console.log(`  '${k}',`);
    }
    expect(s.trials).toBeGreaterThan(4000);
    // A corpus that shrank is a corpus that stopped covering something.
    expect(s.trials + ineffective.length).toBe(census().length);
  }, 300_000);

  it('accepts nothing outside the recorded holes', async () => {
    const { trials } = await runCensusA();
    const unrecorded: string[] = [];
    for (const t of trials) {
      if (t.outcome !== 'accepted') continue;
      if (!(ACCEPTED[t.path] ?? []).includes(t.family)) unrecorded.push(t.key);
    }
    // A new hole in /data's door — a field added without a guard, or a guard
    // removed — lands here, named, on the next run.
    expect(unrecorded).toEqual([]);
  }, 300_000);

  it('records no hole that has since been closed', async () => {
    const { trials } = await runCensusA();
    const live = new Set(trials.filter((t) => t.outcome === 'accepted').map((t) => t.key));
    const stale: string[] = [];
    for (const [path, families] of Object.entries(ACCEPTED)) {
      for (const f of families) if (!live.has(`${path} | ${f}`)) stale.push(`${path} | ${f}`);
    }
    // Not a failure of /src: it means main fixed something and this record owes
    // an update. Listed by name so the update is a deletion, not an audit.
    expect(stale).toEqual([]);
  }, 300_000);

  it('runs exactly the recorded set of ineffective cases', async () => {
    const { ineffective } = await runCensusA();
    expect([...ineffective].sort()).toEqual([...INEFFECTIVE].sort());
  }, 300_000);

  it('refuses a wrong *type* everywhere — b013/E5 closed the last two unschemad fields', async () => {
    const { trials } = await runCensusA();
    const TYPE_FAMILIES: Family[] = ['to-null', 'to-number', 'to-bool', 'to-array', 'to-object'];
    const accepted = trials
      .filter((t) => t.outcome === 'accepted' && TYPE_FAMILIES.includes(t.family))
      .map((t) => t.path);
    // `tree.nodes[].angle` and `.ring` are now named on `TreeNodeSchema` (E5),
    // so every wrong-type trial in the whole census is refused.
    expect([...new Set(accepted)].sort()).toEqual([]);
  }, 300_000);

  it('has no numeric range guard worth the name — this is the headline (E2)', async () => {
    const { trials } = await runCensusA();
    const rate = (f: Family): number => {
      const rows = trials.filter((t) => t.family === f);
      return rows.filter((t) => t.outcome === 'accepted').length / rows.length;
    };
    // Measured 2026-08-26 (pre-b013): negative 0.93, zero 0.97, infinite 0.95,
    // fractional 0.95. b013 (E2/E3) added a shared `.finite()` on every /data
    // number plus targeted `.positive()`/`.nonnegative()` guards, so the floor
    // that fell hardest is `infinite` — measured 2026-08-30 at exactly 0, since
    // every numeric field in every file routes through the one `num` alias.
    // `negative`/`zero`/`fractional` fell more modestly (0.88/0.93/0.96 —
    // `positive()`/`nonnegative()` only cover the handful of fields this item's
    // acceptance named) and stay pinned as floors for the same reason as before:
    // this test *falls* again the next time someone adds a guard.
    expect(rate('negative')).toBeGreaterThan(0.8);
    expect(rate('zero')).toBeGreaterThan(0.85);
    expect(rate('infinite')).toBe(0);
    expect(rate('fractional')).toBeGreaterThan(0.9);
  }, 300_000);

  it('builds unpayable worlds from data it accepted', async () => {
    const { trials } = await runCensusA();
    const bad = trials.filter((t) => t.outcome === 'accepted' && t.complaints.length > 0);
    // b013 closed every complaint kind `scanContent` knows how to name (finite,
    // id/key collisions, tower/enemy hp/interval/range/cost) at the loader
    // itself, so nothing accepted is unpayable by this scan's own definition
    // any more. Pinned at exactly 0 rather than deleted, on the same "a floor
    // that falls is the fix working" precedent as the rate test above — a
    // regression here means one of those guards quietly stopped firing.
    expect(bad.length).toBe(0);
  }, 300_000);

  it('writes nothing to /data', async () => {
    // Cheap to state, and the only thing standing between an in-memory fuzzer
    // and a tool that rewrites the game's tuning.
    //
    // The "before" is `DISK_AT_START`, taken at module scope, *not* a hash taken
    // inside this test: `runCensusA()` memoises, so by the time this test runs
    // the 5,747 mutations have already happened and a before/after pair taken
    // here would bracket nothing at all. Same shape as the `checked === 600`
    // slip q3's review caught — the counter that counts the wrong interval.
    const { trials } = await runCensusA();
    expect(trials.length).toBeGreaterThan(4000);
    expect(filesOnDisk()).toEqual(DISK_AT_START);
  }, 300_000);

  it('is deterministic: no RNG, so a slice re-runs identically', async () => {
    const { trials } = await runCensusA();
    const slice = census().slice(0, 40);
    const again: string[] = [];
    for (const c of slice) {
      const root = pristine(c.site.file);
      const before = JSON.stringify(root);
      if (!mutate(root, c.site, c.family) || JSON.stringify(root) === before) continue;
      const r = await load(c.site.file, root);
      again.push(`${c.key}=${r.outcome}`);
    }
    const first = trials.filter((t) => again.some((a) => a.startsWith(`${t.key}=`)));
    expect(again).toEqual(first.map((t) => `${t.key}=${t.outcome}`));
  }, 300_000);
});

/* -------------------------------------------------------------- census B */

describe('q7 — cross-file references, row by row', () => {
  it('matches the recorded verdict for every string field', async () => {
    const observed = await runCensusB();
    if (process.env.Q7_REPORT && censusBCounts) {
      for (const [p, c] of Object.entries(censusBCounts)) {
        console.log(`  ${refVerdict(c).padEnd(8)} ${c.accepted}/${c.total} ${p}`);
      }
    }
    if (process.env.Q7_RECORD) {
      console.log('=== REF_VERDICTS ===');
      for (const p of Object.keys(observed).sort()) console.log(`  '${p}': '${observed[p]}',`);
    }
    expect(Object.keys(observed).sort()).toEqual(Object.keys(REF_VERDICTS).sort());
    const changed = Object.keys(observed).filter((p) => observed[p] !== REF_VERDICTS[p]);
    // A `checked` field that slips to `partial` or `open` is a cross-file guard
    // that stopped guarding — the exact regression `validateOnHit` and the
    // integrity block exist to prevent.
    expect(changed).toEqual([]);
  }, 300_000);

  it('still cross-checks every reference the loader claims to check', async () => {
    const observed = await runCensusB();
    const checked = Object.keys(observed).filter((p) => observed[p] === 'checked');
    // Not a floor on the count: the named list, so losing one is legible.
    expect(checked.sort()).toEqual(
      Object.keys(REF_VERDICTS)
        .filter((p) => REF_VERDICTS[p] === 'checked')
        .sort(),
    );
    expect(checked.length).toBeGreaterThan(15);
  }, 300_000);

  it('checks references one way only, so an unreferenced row can be renamed (E1)', async () => {
    const observed = await runCensusB();
    // The three primary-key fields that scored `partial`: some rows are
    // pointed at from another file and caught, and the rest are not checked
    // at all. This is *why* the canonical census over-reports — and why E1
    // exists.
    //
    // Post-merge deltas from the 2026-08-26 recording: `boons.boons[].key`
    // *left* this list for the wrong reason — `weapons.awakenings[].boon` was
    // the only /data reference to any boon key, so deleting the soul-weapon
    // system left every boon key `open`, checked by nothing.
    //
    // p7a: `classes.classes[].key` *left* this list too, but for the opposite
    // reason — it moved to fully `checked`, not to `open`. `content.ts`'s
    // loader now cross-references every class's key twice over:
    // `vsupgrades.json`'s `skillCards` must have an entry for every class
    // (`classes.classes[].key` -> `vsupgrades.skillCards.<key>`) and every
    // `skillCards` key must name a real class (the reverse direction) — so
    // all 12 rows are caught now, not 9 of 12 through `affinity.json` (itself
    // deleted at p6f, which is why this row read `open` in between).
    //
    // p7e: three `quests.quests[]` fields *joined* this list. `content.ts`
    // now cross-references a non-free class's `unlockQuest` against a real
    // quest whose `reward` names that exact class (§8.4) — but only 9 of the
    // 10 class-rewarding quests are any class's `unlockQuest` (`maze_master`
    // is a standalone achievement, unlinked to any class), so `key`/
    // `reward.kind`/`reward.value` are each caught on some rows and open on
    // the rest.
    //
    // p7h: `cores.cores[].key` *joined* this list too — the same shape as
    // p7e's class rule, applied to Cores: a non-default Core's `unlockQuest`
    // is now cross-referenced against a quest whose `reward` names that exact
    // Core (§5.5), but only 4 of 5 Core keys are ever any quest's
    // `reward.value` (the default `stone_heart` has no unlock quest to name
    // it), so `cores.cores[].key` is caught on 4 rows and open on the 5th.
    const partial = Object.keys(observed).filter((p) => observed[p] === 'partial');
    expect(partial.sort()).toEqual([
      'cores.cores[].key',
      'damagetypes.types[].key',
      'enemies.enemies[].key',
      'quests.quests[].key',
      'quests.quests[].reward.kind',
      'quests.quests[].reward.value',
      'towers.towers[].key',
    ]);
  }, 300_000);
});

/* ------------------------------------------------- unpayable-world probes */

/**
 * The census says "accepted". These say what "accepted" costs, by building the
 * world and running a bot in it. Six mutations, each one drawn from a recorded
 * hole above, each asserted against what was *measured* today — not against
 * what ought to happen, which is what the skipped regressions below are for.
 */
interface Probe {
  name: string;
  file: DataFile;
  edit: (root: never) => void;
}

interface ProbeResult {
  threw: string;
  ticks: number;
  done: boolean;
  worldViolations: string[];
  reportViolations: string[];
}

async function probe(p: Probe): Promise<ProbeResult> {
  const root = pristine(p.file);
  p.edit(root as never);
  install(p.file, root);
  vi.resetModules();
  mod = null;
  dirty = true;
  const out: ProbeResult = { threw: '', ticks: 0, done: false, worldViolations: [], reportViolations: [] };
  try {
    const sim = await import('../src/sim');
    const scan = await import('../tools/fuzz-input');
    const { makePolicy } = await import('../src/bots');
    const run = new sim.Run({
      seed: 3,
      classKey: 'engineer',
      tier: 1,
      modifiers: [],
      allocated: [],
      policy: 'greedy',
      cycles: 1,
      practice: false,
    });
    const policy = makePolicy('greedy');
    // Six simulated minutes: long enough for the bot to build, for waves to
    // arrive and for a bad number to propagate; short enough to run six of these
    // inside the suite's budget.
    const LIMIT = 60 * 60 * 6;
    while (!run.done && out.ticks < LIMIT) {
      run.step(policy.act(run.world));
      out.ticks++;
    }
    out.done = run.done;
    out.worldViolations = scan.scanWorld(run.world);
    out.reportViolations = scan.scanReport(sim.buildReport(run.world));
  } catch (e) {
    out.threw = errorLine(e);
  }
  return out;
}

describe('q7 — what used-to-be-accepted data now does at load (b013 closed E1/E2/E3/E6)', () => {
  // Every probe below used to build a running game out of one of these six
  // mutations and document what broke *downstream*. b013 closes the loader
  // hole each one rode in on, so the interesting fact changed: the mutation
  // no longer reaches `new sim.Run(...)` at all. Kept as regressions (not
  // deleted) so a future loosening of the schema is caught here first,
  // before it is caught by a bot crashing three minutes into a run.

  it('a renamed tower key is now refused at load (E1)', async () => {
    // Was: `src/bots/policies.ts:271`'s `towerByKey.get('harvest_sprout')!`
    // threw `Cannot read properties of undefined` once the greedy policy's
    // opening build reached it. Now: `REQUIRED_TOWER_KEYS` (content.ts)
    // refuses the rename before the run is ever constructed.
    const r = await probe({
      name: 'harvest_sprout renamed',
      file: 'towers',
      edit: (root) => {
        const towers = (root as unknown as { towers: { key: string }[] }).towers;
        towers.find((t) => t.key === 'harvest_sprout')!.key = 'money_plant';
      },
    });
    expect(r.threw).toMatch(/harvest_sprout/);
    expect(r.done).toBe(false);
  }, 120_000);

  it('an Infinity tower damage is now refused at load (E3)', async () => {
    // Was: reached `report.damageTotal` (b008 already caught the hit itself,
    // but not the load). Now: the shared `num` alias is `.finite()`.
    const r = await probe({
      name: 'arrow_spire damage Infinity',
      file: 'towers',
      edit: (root) => {
        const towers = (root as unknown as { towers: { key: string; attack: { damage: number } }[] }).towers;
        towers.find((t) => t.key === 'arrow_spire')!.attack.damage = INFINITE;
      },
    });
    expect(r.threw.length).toBeGreaterThan(0);
    expect(r.reportViolations).toEqual([]);
    expect(r.worldViolations).toEqual([]);
  }, 120_000);

  it('an Infinity enemy sheet is now refused at load (E3)', async () => {
    const r = await probe({
      name: 'husk hp Infinity',
      file: 'enemies',
      edit: (root) => {
        const enemies = (root as unknown as { enemies: { key: string; hp: number }[] }).enemies;
        enemies.find((e) => e.key === 'husk')!.hp = INFINITE;
      },
    });
    expect(r.threw.length).toBeGreaterThan(0);
    expect(r.done).toBe(false);
    expect(r.worldViolations).toEqual([]);
  }, 120_000);

  it('an Infinity Warden sheet is now refused at load (E3)', async () => {
    const r = await probe({
      name: 'warden maxHp Infinity',
      file: 'warden',
      edit: (root) => {
        (root as unknown as { maxHp: number }).maxHp = INFINITE;
      },
    });
    expect(r.threw.length).toBeGreaterThan(0);
    expect(r.worldViolations).toEqual([]);
  }, 120_000);

  it('a zero attack interval is now refused at load (E2)', async () => {
    const r = await probe({
      name: 'arrow_spire interval 0',
      file: 'towers',
      edit: (root) => {
        const towers = (root as unknown as { towers: { key: string; attack: { interval: number } }[] }).towers;
        towers.find((t) => t.key === 'arrow_spire')!.attack.interval = 0;
      },
    });
    expect(r.threw.length).toBeGreaterThan(0);
    expect(r.worldViolations).toEqual([]);
    expect(r.reportViolations).toEqual([]);
  }, 120_000);

  it('a stat key /data invents is now refused at load, not silently no-op (E6)', async () => {
    const root = pristine('tree') as { nodes: { id: number; stats: Record<string, number> }[] };
    const node = root.nodes.find((n) => Object.keys(n.stats).length > 0)!;
    const key = Object.keys(node.stats)[0];
    node.stats[`${key}${GARBAGE}`] = node.stats[key];
    delete node.stats[key];

    const r = await load('tree', root as unknown as JsonValue);
    expect(r.outcome).toBe('rejected');
  }, 120_000);

  it('a stat value far past real content range is now refused at load (b022)', async () => {
    // `num` alone (`.finite()`) happily accepts `1.5e308` — legal JSON, no
    // overflow yet. b022 found that two such values, on unrelated sources,
    // overflow `Stats.total`'s summation to `Infinity`. `statRecord`'s value
    // schema now bounds any single stat contribution well clear of real
    // content's max (150, tree.json's Core HP node) so the /data-authored
    // route into that overflow is refused before it ever reaches `Stats`.
    const root = pristine('tree') as { nodes: { id: number; stats: Record<string, number> }[] };
    const node = root.nodes.find((n) => Object.keys(n.stats).length > 0)!;
    const key = Object.keys(node.stats)[0];
    node.stats[key] = 1.5e308;

    const r = await load('tree', root as unknown as JsonValue);
    expect(r.outcome).toBe('rejected');
  }, 120_000);

  it('a zero-hp enemy sheet is now refused at load (E2)', async () => {
    const r = await probe({
      name: 'husk hp 0',
      file: 'enemies',
      edit: (root) => {
        const enemies = (root as unknown as { enemies: { key: string; hp: number }[] }).enemies;
        enemies.find((e) => e.key === 'husk')!.hp = 0;
      },
    });
    expect(r.threw.length).toBeGreaterThan(0);
    expect(r.worldViolations).toEqual([]);
  }, 120_000);
});

/* ------------------------------------------------------------ bug reports */

/**
 * Regression tests for the `/src` defects this census found, written to the
 * *fixed* behaviour and skipped: this lane may not edit `/src`, so skipping is
 * the only way to leave the suite green. Every one was confirmed to fail today
 * by unskipping it. Unskip with the fix. Full write-ups: BACKLOG-QUALITY.md Log.
 */
describe('q7 — filed defects (unskip with the fix)', () => {
  it('E1 — the loader refuses a content key that /src names by string literal', async () => {
    // Originally pinned on `palisade`, which classes.json now references and
    // the loader now refuses — so the pin moves to `harvest_sprout`, still
    // accepted today and still read by literal at src/bots/policies.ts:271.
    const root = pristine('towers') as { towers: { key: string }[] };
    root.towers.find((t) => t.key === 'harvest_sprout')!.key = 'money_plant';
    const r = await load('towers', root as unknown as JsonValue);
    expect(r.outcome).toBe('rejected');
  });

  it('E2 — the loader refuses a non-positive interval, range, hp or cost', async () => {
    const cases: [string, (t: Record<string, never>) => void][] = [
      ['interval 0', (t) => void ((t as unknown as { attack: { interval: number } }).attack.interval = 0)],
      ['range 0', (t) => void ((t as unknown as { attack: { range: number } }).attack.range = 0)],
      ['hp 0', (t) => void ((t as unknown as { hp: number }).hp = 0)],
      ['cost negative', (t) => void ((t as unknown as { cost: number }).cost = -50)],
    ];
    for (const [name, edit] of cases) {
      const root = pristine('towers') as { towers: { key: string }[] };
      edit(root.towers.find((t) => t.key === 'arrow_spire') as unknown as Record<string, never>);
      const r = await load('towers', root as unknown as JsonValue);
      expect(r.outcome, name).toBe('rejected');
    }
  });

  it('E3 — the loader refuses a non-finite number anywhere in /data', async () => {
    const root = pristine('towers') as { towers: { key: string; attack: { damage: number } }[] };
    root.towers.find((t) => t.key === 'arrow_spire')!.attack.damage = INFINITE;
    const r = await load('towers', root as unknown as JsonValue);
    expect(r.outcome).toBe('rejected');
  });

  it('E4 — the loader refuses duplicate ids and keys instead of collapsing them', async () => {
    const root = pristine('towers') as { towers: JsonValue[] };
    root.towers.push(root.towers[0]);
    const r = await load('towers', root as unknown as JsonValue);
    expect(r.outcome).toBe('rejected');
  });

  it('E5 — tree.json authors angle and ring, so TreeNodeSchema names them', async () => {
    const root = pristine('tree') as { nodes: { angle?: unknown; ring?: unknown }[] };
    root.nodes[0].angle = 'not a number';
    const r = await load('tree', root as unknown as JsonValue);
    expect(r.outcome).toBe('rejected');
  });

  it('E6 — a stat key /data invents is a load error, not a silent no-op', async () => {
    // Several authoring paths write into a `z.record(num)` whose keys are read
    // by name against `STAT_KEYS`. `tree.nodes[].stats` is the one asserted
    // here; `classes[].mods`, `boons[].stat`, `equipment[].mods` and
    // `modifiers[].effect` are the same shape.
    const root = pristine('tree') as { nodes: Record<string, JsonValue>[] };
    const node = root.nodes.find((n) => Object.keys(n.stats as object).length > 0)!;
    const stats = node.stats as Record<string, JsonValue>;
    const key = Object.keys(stats)[0];
    stats[`${key}${GARBAGE}`] = stats[key];
    delete stats[key];
    const r = await load('tree', root as unknown as JsonValue);
    expect(r.outcome).toBe('rejected');
  });

  it('E7 — the loader refuses an empty roster, wave list, tree or quest log', async () => {
    for (const [file, key] of [['waves', 'waves'], ['tree', 'nodes'], ['quests', 'quests']] as const) {
      const root = pristine(file) as Record<string, JsonValue>;
      root[key] = [];
      const r = await load(file, root as JsonValue);
      expect(r.outcome, `${file}.${key}`).toBe('rejected');
    }
  });
});

/* ------------------------------------------------------------- self-check */

describe('q7 — the harness itself', () => {
  it('offers a family for every site kind and only families that can move it', () => {
    // A family listed for a kind it cannot change would inflate `ineffective`
    // silently; a kind with no families would drop that field from the census.
    const kinds = new Set(census().map((c) => c.site.kind));
    expect([...kinds].sort()).toEqual(['array', 'boolean', 'null', 'number', 'object', 'string']);
    for (const f of FAMILIES) {
      expect(census().some((c) => c.family === f), `family ${f} is never used`).toBe(true);
    }
  });

  it('uses a garbage string that appears nowhere in /data', () => {
    for (const f of DATA_FILES) expect(readFileSync(`data/${f}.json`, 'utf8')).not.toContain(GARBAGE);
  });

  it('reaches Infinity the way a hand-edited file would, and never NaN', () => {
    // `1e999` is legal JSON; `NaN` has no JSON spelling, so it cannot be
    // authored and is deliberately not a family here.
    expect(Number.isFinite(INFINITE)).toBe(false);
    expect(Number.isNaN(INFINITE)).toBe(false);
    expect(JSON.parse('1e999')).toBe(INFINITE);
  });
});
