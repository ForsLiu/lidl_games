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
    'modifiers', 'quests', 'relics', 'spawns', 'towers', 'tree', 'warden', 'waves',
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
vi.mock('../data/relics.json', () => ({ default: holders.relics }));
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

    // A duplicated tower row: eleven rows, ten keys — the earlier one is gone.
    const dup = pristine('towers') as { towers: JsonValue[] };
    dup.towers.push(dup.towers[0]);
    const r = await load('towers', dup as unknown as JsonValue);
    expect(r.outcome).toBe('accepted');
    expect(scanContent(r.content).join('\n')).toMatch(/rows collapse to/);
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

  it('refuses a wrong *type* almost everywhere — the exceptions are two unschemad fields', async () => {
    const { trials } = await runCensusA();
    const TYPE_FAMILIES: Family[] = ['to-null', 'to-number', 'to-bool', 'to-array', 'to-object'];
    const accepted = trials
      .filter((t) => t.outcome === 'accepted' && TYPE_FAMILIES.includes(t.family))
      .map((t) => t.path);
    // `tree.nodes[].angle` and `.ring` are authored in /data and absent from
    // `TreeNodeSchema`, which is not `.strict()` — so zod drops them and every
    // shape is "fine". Filed as E5. Everything else in 1,900-odd wrong-type
    // trials is refused, which is the half of the loader that works.
    expect([...new Set(accepted)].sort()).toEqual(['tree.nodes[].angle', 'tree.nodes[].ring']);
  }, 300_000);

  it('has no numeric range guard worth the name — this is the headline (E2)', async () => {
    const { trials } = await runCensusA();
    const rate = (f: Family): number => {
      const rows = trials.filter((t) => t.family === f);
      return rows.filter((t) => t.outcome === 'accepted').length / rows.length;
    };
    // Measured 2026-08-26: negative 0.93, zero 0.97, infinite 0.95, fractional
    // 0.95. Pinned as floors, not equalities, so this test *falls* when someone
    // starts adding guards — at which point the recorded holes above name every
    // field still missing one.
    expect(rate('negative')).toBeGreaterThan(0.85);
    expect(rate('zero')).toBeGreaterThan(0.85);
    expect(rate('infinite')).toBeGreaterThan(0.85);
    expect(rate('fractional')).toBeGreaterThan(0.85);
  }, 300_000);

  it('builds unpayable worlds from data it accepted', async () => {
    const { trials } = await runCensusA();
    const bad = trials.filter((t) => t.outcome === 'accepted' && t.complaints.length > 0);
    const kinds = new Set(bad.flatMap((t) => t.complaints.map((c) => c.replace(/^.*?(is not finite|rows collapse to \d+ keys|is not > 0|is negative)$/, '$1'))));
    expect(bad.length).toBeGreaterThan(250);
    expect([...kinds].some((k) => k === 'is not finite')).toBe(true);
    expect([...kinds].some((k) => k.startsWith('rows collapse to'))).toBe(true);
    expect([...kinds].some((k) => k === 'is not > 0')).toBe(true);
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
    const partial = Object.keys(observed).filter((p) => observed[p] === 'partial');
    expect(partial.sort()).toEqual(['damagetypes.types[].key', 'enemies.enemies[].key', 'towers.towers[].key']);
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
      relics: [],
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

describe('q7 — what accepted data does to a running game', () => {
  it('a renamed tower key loads clean and then crashes the engine (E1)', async () => {
    // This probe originally renamed `palisade`, which is now *caught*: P6's
    // classes.json points Cryomancer's Ice Wall at it via `active2.towerKey`,
    // so the loader rejects the rename ("classes.json: cryomancer.Ice Wall
    // refs ..."). The hole itself is still open — census B scores
    // `towers.towers[].key` partial (3/10 rows accepted) — so the probe moves
    // to `harvest_sprout`: referenced by no other /data file, yet
    // `src/bots/policies.ts:271` does `towerByKey.get('harvest_sprout')!` and
    // the greedy policy (openingSprouts: 4) reads `.id` off the undefined.
    const r = await probe({
      name: 'harvest_sprout renamed',
      file: 'towers',
      edit: (root) => {
        const towers = (root as unknown as { towers: { key: string }[] }).towers;
        towers.find((t) => t.key === 'harvest_sprout')!.key = 'money_plant';
      },
    });
    expect(r.threw).toMatch(/Cannot read properties of undefined/);
  }, 120_000);

  it('an Infinity in /data reaches the end report (E3)', async () => {
    const r = await probe({
      name: 'arrow_spire damage Infinity',
      file: 'towers',
      edit: (root) => {
        const towers = (root as unknown as { towers: { key: string; attack: { damage: number } }[] }).towers;
        towers.find((t) => t.key === 'arrow_spire')!.attack.damage = INFINITE;
      },
    });
    expect(r.threw).toBe('');
    // G18 asks a run to be reproducible from its report; a report carrying
    // Infinity is one no telemetry sink can hold and no sweep can average.
    expect(r.reportViolations.join('\n')).toMatch(/report\.damageTotal=Infinity/);
  }, 120_000);

  it('an Infinity enemy sheet makes the wave unkillable and ends the run (E3)', async () => {
    const r = await probe({
      name: 'husk hp Infinity',
      file: 'enemies',
      edit: (root) => {
        const enemies = (root as unknown as { enemies: { key: string; hp: number }[] }).enemies;
        enemies.find((e) => e.key === 'husk')!.hp = INFINITE;
      },
    });
    expect(r.threw).toBe('');
    expect(r.done).toBe(true);
    expect(r.worldViolations.join('\n')).toMatch(/enemy#\d+\.hp=Infinity/);
  }, 120_000);

  it('an Infinity Warden sheet makes the Warden unkillable (E3)', async () => {
    const r = await probe({
      name: 'warden maxHp Infinity',
      file: 'warden',
      edit: (root) => {
        (root as unknown as { maxHp: number }).maxHp = INFINITE;
      },
    });
    expect(r.threw).toBe('');
    expect(r.worldViolations.join('\n')).toMatch(/derived\.maxHp=Infinity/);
  }, 120_000);

  it('a zero attack interval is accepted and fires every tick, but breaks no invariant (E2)', async () => {
    const r = await probe({
      name: 'arrow_spire interval 0',
      file: 'towers',
      edit: (root) => {
        const towers = (root as unknown as { towers: { key: string; attack: { interval: number } }[] }).towers;
        towers.find((t) => t.key === 'arrow_spire')!.attack.interval = 0;
      },
    });
    // Recorded exactly, because the tempting write-up is wrong: `updateTowers`
    // has no inner loop, so interval 0 is one shot per tick — a 90x-rate tower,
    // not a hang and not a NaN. The defect is the missing guard, not a crash.
    // Post-merge, the §6.1 wielded set (VS attacks derived from the live board)
    // recomputes from the same authored interval, and `tools/invariants.ts`'s
    // wielded scan names it — the one trace the zero leaves in a 6-minute run.
    expect(r.threw).toBe('');
    expect(r.worldViolations).toEqual(['wielded.arrow_spire.interval=0 is not positive']);
    expect(r.reportViolations).toEqual([]);
  }, 120_000);

  it('a stat key /data invents loads clean and then buys nothing (E6)', async () => {
    // The failure `SPECIAL_KEYS` was made an enum to prevent — "a typo is a load
    // error instead of a step that silently buys nothing, which is the failure
    // m19a's orphaned shredArmor shipped as" (src/sim/content.ts) — is still
    // open on every `z.record(num)` whose keys are stat names.
    const root = pristine('tree') as { nodes: { id: number; stats: Record<string, number> }[] };
    const node = root.nodes.find((n) => Object.keys(n.stats).length > 0)!;
    const key = Object.keys(node.stats)[0];
    node.stats[`${key}${GARBAGE}`] = node.stats[key];
    delete node.stats[key];

    const r = await load('tree', root as unknown as JsonValue);
    expect(r.outcome).toBe('accepted');

    // It reached the engine — this is not a mutation zod quietly dropped...
    const loaded = (r.content as { treeById: Map<number, { stats: Record<string, number> }> }).treeById.get(node.id)!;
    expect(Object.keys(loaded.stats)).toContain(`${key}${GARBAGE}`);

    // ...and `Stats.addAll` skips every key not in `STAT_KEYS`, so the node now
    // grants nothing. Read from the module rather than restated, so a rename in
    // `src/sim/stats.ts` cannot leave this assertion true and meaningless.
    const stats = await import('../src/sim/stats');
    expect(stats.STAT_KEYS as readonly string[]).toContain(key);
    expect(stats.STAT_KEYS as readonly string[]).not.toContain(`${key}${GARBAGE}`);
  }, 120_000);

  it('a zero-hp enemy sheet is accepted and breaks no invariant either (E2)', async () => {
    const r = await probe({
      name: 'husk hp 0',
      file: 'enemies',
      edit: (root) => {
        const enemies = (root as unknown as { enemies: { key: string; hp: number }[] }).enemies;
        enemies.find((e) => e.key === 'husk')!.hp = 0;
      },
    });
    expect(r.threw).toBe('');
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
  it.skip('E1 — the loader refuses a content key that /src names by string literal', async () => {
    // Originally pinned on `palisade`, which classes.json now references and
    // the loader now refuses — so the pin moves to `harvest_sprout`, still
    // accepted today and still read by literal at src/bots/policies.ts:271.
    const root = pristine('towers') as { towers: { key: string }[] };
    root.towers.find((t) => t.key === 'harvest_sprout')!.key = 'money_plant';
    const r = await load('towers', root as unknown as JsonValue);
    expect(r.outcome).toBe('rejected');
  });

  it.skip('E2 — the loader refuses a non-positive interval, range, hp or cost', async () => {
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

  it.skip('E3 — the loader refuses a non-finite number anywhere in /data', async () => {
    const root = pristine('towers') as { towers: { key: string; attack: { damage: number } }[] };
    root.towers.find((t) => t.key === 'arrow_spire')!.attack.damage = INFINITE;
    const r = await load('towers', root as unknown as JsonValue);
    expect(r.outcome).toBe('rejected');
  });

  it.skip('E4 — the loader refuses duplicate ids and keys instead of collapsing them', async () => {
    const root = pristine('towers') as { towers: JsonValue[] };
    root.towers.push(root.towers[0]);
    const r = await load('towers', root as unknown as JsonValue);
    expect(r.outcome).toBe('rejected');
  });

  it.skip('E5 — tree.json authors angle and ring, so TreeNodeSchema names them', async () => {
    const root = pristine('tree') as { nodes: { angle?: unknown; ring?: unknown }[] };
    root.nodes[0].angle = 'not a number';
    const r = await load('tree', root as unknown as JsonValue);
    expect(r.outcome).toBe('rejected');
  });

  it.skip('E6 — a stat key /data invents is a load error, not a silent no-op', async () => {
    // Six authoring paths write into a `z.record(num)` whose keys are read by
    // name against `STAT_KEYS`. `tree.nodes[].stats` is the one asserted here;
    // `classes[].mods`, `boons[].stat`, `relics.affixes[].stat`,
    // `relics.implicits.*.stat` and `modifiers[].effect` are the same shape.
    const root = pristine('tree') as { nodes: Record<string, JsonValue>[] };
    const node = root.nodes.find((n) => Object.keys(n.stats as object).length > 0)!;
    const stats = node.stats as Record<string, JsonValue>;
    const key = Object.keys(stats)[0];
    stats[`${key}${GARBAGE}`] = stats[key];
    delete stats[key];
    const r = await load('tree', root as unknown as JsonValue);
    expect(r.outcome).toBe('rejected');
  });

  it.skip('E7 — the loader refuses an empty roster, wave list, tree or quest log', async () => {
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
