/**
 * Mutation smoke probe (BACKLOG-QUALITY q14) — the in-Scope substance of q6.
 *
 * Automates the manual mutation testing qa-playtester has done by hand across
 * the q8 and q9 sessions (PROGRESS.md / BACKLOG-QUALITY.md session logs 4 and
 * 5): apply one named, previously-verified source mutation, run the single
 * test file that originally caught it, and confirm it goes red.
 *
 * Every mutation is applied to a throwaway *copy* of src/tests/tools/data
 * under `bench/.tmp/q14-mutation-scratch/`, never to the real files. That copy
 * lives inside the repo tree on purpose, so Node's own upward node_modules
 * resolution finds the real install without symlinking or reinstalling
 * anything — but the reason it must be a copy at all, rather than mutating
 * the real file and restoring it afterward (which is what q14's acceptance
 * line, written before this was built, originally described), is `npm test`
 * itself: vitest runs many test files concurrently across worker threads, and
 * src/meta/meta.ts, src/sim/run.ts and src/bots/policies.ts — the three files
 * every mutation here touches — are imported by most of the suite. Mutating
 * one of them in place for the ~15-30s a nested vitest run takes, while
 * sibling workers are free to import that same path fresh at any point in the
 * window, would make this file a flake generator for the entire suite rather
 * than a hazard contained to itself. Working on an isolated copy makes that
 * structurally impossible for the *source file itself* instead of merely
 * unlikely: `probeOne` re-checks `git diff --exit-code` against the real file
 * both before and after, so a future edit that "optimizes" this back to
 * in-place mutation trips a clear assertion rather than an intermittent
 * failure two files away. This does not extend to every shared resource — the
 * scratch copies deliberately reuse the real `node_modules` (including its
 * `.vite` dependency-optimization cache) via upward resolution rather than
 * duplicating it, so that cache is genuinely shared, mutable state between a
 * nested probe run and any real `vitest run` happening at the same time. Vite
 * treats concurrent readers/writers of that cache as the normal case (it is
 * multi-process by design), so this has not been observed to cause a failure,
 * but it is not the same "structurally impossible" guarantee as the source
 * files get.
 *
 * The scratch root lives under `bench/`, not `tools/`, for a second, sharper
 * reason found by actually running the full suite rather than reasoning about
 * it: `tests/c7-no-orbs.test.ts` recursively greps every `.ts`/`.json`/`.mjs`
 * file under `src/`, `data/` and `tools/` for leftover Orb-currency
 * vocabulary. A scratch copy of `tests/` sitting under `tools/` while that
 * scan runs concurrently gets walked too, and it legitimately contains the
 * word "orbs" in its own copies of `tests/q3-save-fuzz.test.ts` and
 * `tests/t6c-save-migration.test.ts` (which assert the field is *gone*) and
 * in `tests/c7-no-orbs.test.ts`'s own copied vocabulary list — a real failure
 * this file caused the first time the full suite ran with it in place.
 * `bench/` is outside every directory any shipped scanner walks.
 *
 * A control run (no mutation) against each distinct test file is exported
 * too and is asserted green by the test suite before any mutation's "red" is
 * trusted — otherwise a broken harness (bad cwd, missing config, wrong CLI
 * flag) would make every mutation look "caught" for the wrong reason, the
 * same false-positive shape PROGRESS.md's M18 section warns about ("a
 * positive control rewritten into comparing 0 to 0").
 *
 * Cost, recorded rather than hidden: this now runs 23 nested `npx vitest run`
 * invocations (8 controls, one per distinct `testFile`, + 15 mutations),
 * up from 19 (BACKLOG-QUALITY q40 added an 8th distinct `testFile`,
 * `tests/q28-cli-error-handling.test.ts`, without a `package.json` alias to
 * parallelize any of this) — measure the real number on this host with
 * `npx vitest run tests/q14-mutation-smoke.test.ts` rather than trusting this
 * comment to stay current. That is the price of testing the tests rather
 * than just the code.
 *
 *   npx tsx tools/mutation-probe.ts             # runs every recorded mutation, prints a table
 */

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// Nested under a directory literally named `.tmp` so the repo's existing
// `.gitignore` rule for "throwaway probe scratch from review/QA passes"
// (`.tmp/`, matched at any depth) covers it without a Scope-violating edit
// to `.gitignore` itself.
const SCRATCH_ROOT = path.join(ROOT, 'bench', '.tmp', 'q14-mutation-scratch');
const COPY_DIRS = ['src', 'tests', 'tools', 'data'];
// `tools/gate-audit.ts`'s `SPEC_PATH`/`BACKLOG_PATH` resolve relative to its
// own module URL (`REPO_ROOT`), which inside a scratch copy means
// `<scratchDir>/SPEC-FINAL.md` and `<scratchDir>/BACKLOG-QUALITY.md` — without
// these, both the q10-gate-audit control run and the
// `gate-audit-hasLiveTopLevelDescribe-hollow` mutation (q20) throw ENOENT
// instead of exercising the real assertion. Found by actually running the
// expanded suite, not reasoned out in advance.
const COPY_FILES = ['vitest.config.ts', 'tsconfig.json', 'BACKLOG-QUALITY.md', 'SPEC-FINAL.md'];
/** Exec timeout for the nested vitest run, kept well under the outer `it()` timeout (see the test file) so a genuine hang reports as a timeout, not a false "caught". */
const NESTED_VITEST_TIMEOUT_MS = 150_000;

export interface MutationEdit {
  readonly find: string;
  readonly replace: string;
}

export interface Mutation {
  readonly name: string;
  /** Repo-relative path, e.g. 'src/meta/meta.ts'. */
  readonly file: string;
  /** Applied in order; each `find` must match exactly once in the current file text. */
  readonly edits: readonly MutationEdit[];
  /** Repo-relative path to the single test file that should catch this mutation. */
  readonly testFile: string;
  /** Where this mutation was first found and hand-verified, for provenance. */
  readonly source: string;
}

/**
 * Fifteen mutations. The first six are drawn from the ones qa-playtester
 * actually applied to real `/src` files and reverted while verifying q8 and
 * q9 — not reasoned-about, not synthetic. Each entry's `source` names the
 * session log describing the red count it originally produced.
 *
 * The next four (BACKLOG-QUALITY q20) close the gap q20 itself named:
 * sessions 8, 9, 11 and 12 each hand-verified a further mutation that killed
 * a real test and none of them were in this list. Three of the four are the
 * mutation as originally applied, against a `tools/*` file rather than a
 * `src/*` one — `tools/soak.ts`, `tools/gate-audit.ts` and
 * `tools/fuzz-command-domain.ts` are all inside `COPY_DIRS`, so the scratch
 * copy and the whole-repo `gitDiffClean()` check both already cover them; the
 * fourth (`tools/perf-ratio.ts`) is a **deliberate substitution**: session 9's
 * actual finding — reverting `measureRatioForWorld`'s interleaved timing to
 * the old sequential two-block shape — only fails the ceiling test under real
 * external CPU contention from *other* concurrently-running vitest workers
 * (measured directly: quiet-host sequential readings were ~14,000-27,000,
 * safely under the ceiling; only a genuinely contended host pushed it to
 * ~57,000-78,000). `probeOne` runs one nested, single-file `vitest run` with
 * no sibling contention by design, so that specific mutation would not
 * reliably be "caught" here — it would flake in the exact direction that
 * makes a mutation-smoke suite untrustworthy (a mutation reported as missed
 * when the real defect class is real, just not reproduced by this harness's
 * shape). Session 9's own log already flagged this ("no deterministic
 * (non-timing) test proves the interleaving call order itself... left as a
 * possible future strengthening"). `worstCaseWorld()` hollowed to an empty
 * world is the deterministic mutation session 9's own QA pass verified
 * against the same file and test suite (the anti-vacuity and
 * fixture-reachability tests), so it stands in as this file's automated
 * probe of "perf-ratio's fixture stays a real worst case," while the timing
 * regression itself stays a manual/future concern, recorded here rather than
 * silently dropped.
 *
 * Two more (BACKLOG-QUALITY q31) close q31's own gap for q23/q25's guards;
 * see the inline comment above those two entries below. The final three
 * (BACKLOG-QUALITY q40) close the identical gap one fix-generation later:
 * q28 landed three try/catch-shaped guards (`gate-audit.ts` and
 * `phase-coverage.ts`'s `main()`s, and moving `soak.ts`'s `new Run(cfg)`
 * inside its own `try`) but q31's list only ever covered q23/q25's guards,
 * not q28's — see the inline comment above those three entries below.
 */
export const MUTATIONS: Mutation[] = [
  {
    name: 'meta-drop-ember-on-serialize',
    file: 'src/meta/meta.ts',
    edits: [
      {
        find: `export function serializeMeta(meta: MetaState): string {\n  return JSON.stringify({ version: SAVE_VERSION, meta } satisfies SaveFile);\n}`,
        replace: `export function serializeMeta(meta: MetaState): string {\n  const obj = { version: SAVE_VERSION, meta } satisfies SaveFile;\n  delete (obj.meta as unknown as Record<string, unknown>).ember;\n  return JSON.stringify(obj);\n}`,
      },
    ],
    testFile: 'tests/q8-save-roundtrip.test.ts',
    source:
      'BACKLOG-QUALITY.md session 4 log (q8): "dropping `ember` from `serializeMeta`\'s output" — QA confirmed red on the first generated meta.',
  },
  {
    name: 'meta-reverse-migrate-spread-order',
    file: 'src/meta/meta.ts',
    edits: [
      {
        find: `  const out: MetaState = {\n    ...base,\n    ...meta,\n`,
        replace: `  const out: MetaState = {\n    ...meta,\n    ...base,\n`,
      },
    ],
    testFile: 'tests/q8-save-roundtrip.test.ts',
    source:
      'BACKLOG-QUALITY.md session 4 log (q8): "reversing `migrate`\'s spread order (`{...meta, ...base}`)" — QA confirmed red on the first generated meta.',
  },
  {
    name: 'meta-drop-unlocked-classes-after-merge',
    file: 'src/meta/meta.ts',
    edits: [
      {
        find: `  };\n  if (!out.allocated.includes(0)) out.allocated.unshift(0);`,
        replace: `  };\n  delete (out as unknown as Record<string, unknown>).unlockedClasses;\n  if (!out.allocated.includes(0)) out.allocated.unshift(0);`,
      },
    ],
    testFile: 'tests/q8-save-roundtrip.test.ts',
    source:
      'BACKLOG-QUALITY.md session 4 log (q8): "deleting `unlockedClasses` after the merge" — QA confirmed red on the first generated meta.',
  },
  {
    name: 'run-completeWave-never-enters-dusk',
    file: 'src/sim/run.ts',
    edits: [
      {
        find: `  if (w.wave >= cycleWaveEnd(w, w.cycle)) {\n    w.phase = 'dusk';`,
        replace: `  if (false && w.wave >= cycleWaveEnd(w, w.cycle)) {\n    w.phase = 'dusk';`,
      },
    ],
    testFile: 'tests/q9-phase-coverage.test.ts',
    source:
      'BACKLOG-QUALITY.md session 5 log (q9): "forced `completeWave` in `src/sim/run.ts` to never enter dusk (11/16 red, exactly the dusk/act2/levelup/dawn-dependent tests)".',
  },
  {
    name: 'run-dawn-trigger-fires-immediately',
    file: 'src/sim/run.ts',
    edits: [
      {
        find: `  } else if (!w.dying && w.act2Time >= nightLengthSeconds(w, w.cycle)) {`,
        replace: `  } else if (!w.dying && w.act2Time >= 1) {`,
      },
    ],
    testFile: 'tests/q9-phase-coverage.test.ts',
    source:
      'BACKLOG-QUALITY.md session 5 log (q9): "moved the dawn trigger in `updateAct2` to fire almost immediately so `levelup` is skipped (11/16 red, `levelup` gone and `dawn` appearing where it shouldn\'t)".',
  },
  {
    name: 'policies-hybrid-rebound-to-idle',
    file: 'src/bots/policies.ts',
    edits: [
      {
        find: `import { registerPolicy, type BotPolicy } from './policy';`,
        replace: `import { registerPolicy, IdlePolicy, type BotPolicy } from './policy';`,
      },
      {
        find: `registerPolicy('hybrid', () => new BuilderPolicy('hybrid', { ...HYBRID_BUILD, act2: 'kite' }));`,
        replace: `registerPolicy('hybrid', () => new IdlePolicy());`,
      },
    ],
    testFile: 'tests/q9-phase-coverage.test.ts',
    source:
      'BACKLOG-QUALITY.md session 5 log (q9): "rebound `hybrid`\'s registration in `src/bots/policies.ts` to `IdlePolicy` (exactly 2/16 red — hybrid\'s own floor test and the exact-set test for hybrid only)".',
  },
  {
    name: 'soak-disable-invariant-scan',
    file: 'tools/soak.ts',
    edits: [
      {
        find: `      if (w.tick % scanEvery === 0) problems.push(...scanWorld(w));`,
        replace: `      if (false && w.tick % scanEvery === 0) problems.push(...scanWorld(w));`,
      },
      {
        find: `      problems.push(...scanReport(report));`,
        replace: `      if (false) problems.push(...scanReport(report));`,
      },
    ],
    testFile: 'tests/q12-soak.test.ts',
    source:
      'BACKLOG-QUALITY.md session 8 log (q12): "Disabling both `scanWorld`/`scanReport` calls entirely (`if (false && ...)` / `if (false)`) left all 6 tests passing" — the gap QA found and closed in the same session by adding the `POISONER` anti-vacuity case, which is what makes this mutation catchable today.',
  },
  {
    name: 'gate-audit-hasLiveTopLevelDescribe-hollow',
    file: 'tools/gate-audit.ts',
    edits: [
      {
        find: `export function hasLiveTopLevelDescribe(absPath: string): boolean {\n  const text = readFileSync(absPath, 'utf8');\n  return /^describe\\(/m.test(text);\n}`,
        replace: `export function hasLiveTopLevelDescribe(absPath: string): boolean {\n  const text = readFileSync(absPath, 'utf8');\n  return false;\n}`,
      },
    ],
    testFile: 'tests/q10-gate-audit.test.ts',
    source:
      'BACKLOG-QUALITY.md session 6 log (q10): QA found "G1 and G19 were marked `covered` by files that are entirely `describe.skip`\'d — zero live assertions backing either gate," which is what `hasLiveTopLevelDescribe`/`entirelyRetiredCoverage` were added to catch automatically; hollowing the primitive to always say "not live" is the mutation their own dedicated anti-vacuity tests (q10\'s "tells a live file from an entirely retired one" case) exist to catch.',
  },
  {
    name: 'command-domain-classify-hollow',
    file: 'tools/fuzz-command-domain.ts',
    edits: [
      {
        find: `export function classify(spec: FieldSpec, outcome: Pick<ProbeOutcome, 'threw' | 'problems' | 'digestChanged'>): Verdict {\n  if (outcome.threw) return 'threw';\n  if (spec.category === 'B') return outcome.problems.length > 0 ? 'accepted' : 'rejected';\n  return outcome.digestChanged || outcome.problems.length > 0 ? 'accepted' : 'rejected';\n}`,
        replace: `export function classify(spec: FieldSpec, outcome: Pick<ProbeOutcome, 'threw' | 'problems' | 'digestChanged'>): Verdict {\n  return 'rejected';\n}`,
      },
    ],
    testFile: 'tests/q15-command-domain-fuzz.test.ts',
    source:
      'BACKLOG-QUALITY.md session 11 log (q15): QA "hollowing `classify()` to always return \'rejected\' correctly turned 5 tests red."',
  },
  {
    name: 'perf-ratio-worstCaseWorld-hollow',
    file: 'tools/perf-ratio.ts',
    edits: [
      {
        find: `export function worstCaseWorld(): World {\n  const w = new World(cfg({ seed: 9 }));\n  w.gold = 1e6;\n  const keys = ['arrow_spire', 'ballista', 'venom_spore', 'mortar', 'tesla_coil', 'palisade'];\n  let i = 0;\n  for (let y = 3; y < GRID_H - 3; y += 2) {\n    for (let x = 3; x < GRID_W - 6; x += 2) {\n      w.warden.x = x + 0.5;\n      w.warden.y = y + 0.5;\n      const def = w.content.towerByKey.get(keys[i++ % keys.length])!;\n      buildTower(w, def.id, x, y);\n    }\n  }\n  finishSundering(w, ['arrow_volley', 'piercing_bolt', 'toxic_trail', 'mortar_lob']);\n  for (const def of w.content.weapons.weapons) grantWeapon(w, def.key, 6, 0.4);\n\n  w.act2Time = 540;\n  const cap = w.content.spawns.aliveCap;\n  const pool = ['husk', 'sprinter', 'bulwark', 'spitter', 'wraith', 'bomber', 'charger', 'shellback'];\n  let n = 0;\n  for (let ring = 2; ring < 18 && n < cap; ring++) {\n    for (let k = 0; k < 40 && n < cap; k++) {\n      const x = 1.5 + ((ring * 7 + k * 3) % (GRID_W - 3));\n      const y = 1.5 + ((ring * 3 + k * 5) % (GRID_H - 3));\n      if (spawnEnemy(w, pool[n % pool.length], x, y, { overlay: true })) n++;\n    }\n  }\n  return w;\n}`,
        replace: `export function worstCaseWorld(): World {\n  return new World(cfg({ seed: 9 }));\n}`,
      },
    ],
    testFile: 'tests/q13-perf-ratio.test.ts',
    source:
      'BACKLOG-QUALITY.md session 9 log (q13): QA "Hollowed `worstCaseWorld()` to an empty world before adding anything: both the anti-vacuity test... and the fixture-reachability test... went red." Substituted for the session\'s own "sequential-vs-interleaved timing regression" mutation named in q20 — see the doc comment above `MUTATIONS` for why that one is not a reliable fit for this harness.',
  },
  // The remaining two (BACKLOG-QUALITY q31) close q31's own gap: q23's
  // `soakOne` boundary guards and q25's `content-census.ts` try/catch are
  // both guard-shaped fixes for a recorded-not-filed gap, landed after q20
  // last expanded this list, and neither had a mutation reverting it back to
  // its pre-fix shape — so an accidental revert of either guard (someone
  // "simplifying" the top of `soakOne` or `main()`) would ship silently,
  // caught by neither this suite nor (per q28) any other automated check.
  {
    name: 'soak-remove-boundary-guards',
    file: 'tools/soak.ts',
    edits: [
      {
        find: `  if (!Number.isFinite(maxTicks) || maxTicks <= 0) {\n    throw new Error(\`soakOne: maxTicks must be > 0, got \${maxTicks}\`);\n  }\n  if (!Number.isFinite(scanEvery) || scanEvery <= 0) {\n    throw new Error(\`soakOne: scanEvery must be > 0, got \${scanEvery}\`);\n  }\n`,
        replace: ``,
      },
    ],
    testFile: 'tests/q12-soak.test.ts',
    source:
      'BACKLOG-QUALITY.md q23/q31: reverts `soakOne`\'s `maxTicks <= 0` / `scanEvery <= 0` usage-error guards to their pre-fix shape (silently reporting a fake-clean run instead of throwing), targeting q23\'s own "boundary-input guards" describe block.',
  },
  {
    name: 'content-census-remove-trycatch',
    file: 'tools/content-census.ts',
    edits: [
      {
        find: `  let rows: CensusRow[];\n  try {\n    const { loadContent } = await import('../src/sim/content');\n    rows = census(loadContent());\n  } catch (err) {\n    const message = err instanceof Error ? err.message : String(err);\n    if (json) {\n      console.log(JSON.stringify({ error: message }));\n    } else {\n      // ZodError.message is itself multi-line JSON; collapse to one line so\n      // a /data load failure reads as a clean CLI message, not a second\n      // stack-trace-shaped wall of text.\n      console.error(\`content-census: \${message.replace(/\\s+/g, ' ').trim()}\`);\n    }\n    process.exitCode = 1;\n    return;\n  }`,
        replace: `  const { loadContent } = await import('../src/sim/content');\n  const rows: CensusRow[] = census(loadContent());`,
      },
    ],
    testFile: 'tests/q25-content-census-cli.test.ts',
    source:
      'BACKLOG-QUALITY.md q25/q31/q38: reverts `content-census.ts`\'s `main()` to its pre-q25 shape (no try/catch around the load/census call), so a corrupted `/data` snapshot crashes with a raw, multi-line stack trace instead of the one-line message q25 established. Updated at q38 when `main()` switched to a dynamic `loadContent` import inside the same try.',
  },
  // The final three (BACKLOG-QUALITY q40) close the identical gap one
  // fix-generation later: q28 landed three try/catch-shaped guards
  // (gate-audit.ts's and phase-coverage.ts's `main()`s, plus moving
  // soak.ts's `new Run(cfg)` inside its own `try`) but q31's list above only
  // ever covered q23's and q25's guards, not q28's — so an accidental
  // revert of any of q28's three guards would ship silently, caught by
  // neither this suite (until now) nor any other automated check (q40's own
  // finding, confirmed live this session against tests/q28-cli-error-
  // handling.test.ts's corrupted-/data cases before being added here).
  {
    name: 'gate-audit-remove-main-trycatch',
    file: 'tools/gate-audit.ts',
    edits: [
      {
        find: `function main(argv: string[]): void {\n  const json = argv.includes('--json');\n\n  let rows: GateAuditRow[];\n  let stale: string[];\n  try {\n    const specText = readFileSync(SPEC_PATH, 'utf8');\n    const gates = parseGates(specText);\n    rows = auditGates(gates);\n    stale = staleHoleRefs();\n  } catch (err) {\n    const message = err instanceof Error ? err.message : String(err);\n    if (json) {\n      console.log(JSON.stringify({ error: message }));\n    } else {\n      console.error(\`gate-audit: \${message.replace(/\\s+/g, ' ').trim()}\`);\n    }\n    process.exitCode = 1;\n    return;\n  }\n\n  if (json) {`,
        replace: `function main(argv: string[]): void {\n  const json = argv.includes('--json');\n  const specText = readFileSync(SPEC_PATH, 'utf8');\n  const gates = parseGates(specText);\n  const rows = auditGates(gates);\n  const stale = staleHoleRefs();\n\n  if (json) {`,
      },
    ],
    testFile: 'tests/q28-cli-error-handling.test.ts',
    source:
      'BACKLOG-QUALITY.md q28/q40: reverts `gate-audit.ts`\'s `main()` to its pre-q28 shape (no try/catch around the spec-read/parse/audit call), so a missing SPEC-FINAL.md crashes with a raw, multi-line stack trace instead of the one-line message q28 established. Targets the "gate-audit.ts CLI failure path" describe block\'s missing-spec cases.',
  },
  {
    name: 'phase-coverage-remove-main-trycatch',
    file: 'tools/phase-coverage.ts',
    edits: [
      {
        find: `  let rows: PolicyCensus[];\n  try {\n    rows = census(shippedPolicies(), seeds, seedStart);\n  } catch (err) {\n    const message = err instanceof Error ? err.message : String(err);\n    if (json) {\n      console.log(JSON.stringify({ error: message }));\n    } else {\n      console.error(\`phase-coverage: \${message.replace(/\\s+/g, ' ').trim()}\`);\n    }\n    process.exitCode = 1;\n    return;\n  }`,
        replace: `  const rows: PolicyCensus[] = census(shippedPolicies(), seeds, seedStart);`,
      },
    ],
    testFile: 'tests/q28-cli-error-handling.test.ts',
    source:
      'BACKLOG-QUALITY.md q28/q40: reverts `phase-coverage.ts`\'s `main()` to its pre-q28 shape (no try/catch around the `census()` call), so a corrupted `/data` snapshot crashes with a raw, multi-line ZodError dump instead of the one-line message q28 established. Targets the "phase-coverage.ts CLI failure path" describe block\'s corrupted-data cases.',
  },
  {
    name: 'soak-construction-outside-try',
    file: 'tools/soak.ts',
    edits: [
      {
        find: `  const started = performance.now();\n  let run: Run | undefined;\n  let w: World | undefined;\n  const problems: string[] = [];\n  let threw = false;\n\n  try {\n    const cfg: RunConfig = {\n      seed,\n      classKey: 'engineer',\n      tier: 1,\n      modifiers: [],\n      allocated: [],\n      relics: [],\n      policy: policyName,\n      cycles: 3,\n    };\n    // \`new Run(cfg)\` lives inside this try (not before it) so a \`/data\` load\n    // failure at construction — e.g. a corrupted content file — comes back\n    // through \`SoakResult.threw\` like any other in-run exception, rather\n    // than propagating straight out of \`soakOne\` uncaught (q28).\n    run = new Run(cfg);\n    w = run.world;\n    const policy = makePolicy(policyName);`,
        replace: `  const started = performance.now();\n  const cfg: RunConfig = {\n    seed,\n    classKey: 'engineer',\n    tier: 1,\n    modifiers: [],\n    allocated: [],\n    relics: [],\n    policy: policyName,\n    cycles: 3,\n  };\n  const run: Run = new Run(cfg);\n  const w: World = run.world;\n  const problems: string[] = [];\n  let threw = false;\n\n  try {\n    const policy = makePolicy(policyName);`,
      },
    ],
    testFile: 'tests/q28-cli-error-handling.test.ts',
    source:
      'BACKLOG-QUALITY.md q28/q40: reverts `soak.ts`\'s `soakOne` to its pre-q28 shape (`new Run(cfg)` constructed one line before its own `try`, not inside it), so a `/data` corruption at construction propagates straight out of `soakOne` uncaught instead of coming back as `SoakResult.threw` — q23\'s `maxTicks`/`scanEvery` guards do not cover this path. Targets the "soak.ts CLI failure path" describe block\'s corrupted-data cases (distinguishing signal is `main()` never reaching its own output, not exit code — see that test\'s own doc comment).',
  },
];

export interface ProbeResult {
  readonly name: string;
  readonly testFailed: boolean;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  /**
   * True unless something reached into the real, non-scratch working tree —
   * checked as a *whole-repo* `git diff --exit-code` (not just `m.file`, see
   * `gitDiffClean`'s doc comment for why the narrower check is not enough)
   * plus a check that no new untracked file appeared since the probe started
   * (`hasNewUntrackedFiles`, which `git diff` alone cannot see). Should
   * always be true by construction.
   *
   * Known asymmetry (QA, this item): this catches a real file gaining an
   * edit or a new untracked file appearing, but not a pre-existing untracked
   * file *disappearing* — `populateScratch` opens with a recursive
   * `removeDir(dir)`, so a `scratchPath` computation bug that ever resolved
   * outside `SCRATCH_ROOT` onto a real untracked path would delete it
   * silently, with neither `git diff` (never tracked it) nor
   * `hasNewUntrackedFiles` (checks for arrivals, not departures) noticing.
   * None of the six recorded `MUTATIONS` touches `scratchPath`/`populateScratch`
   * so this does not affect what q14 actually probes today; recorded here so
   * a future extension of this file's public surface doesn't over-trust the
   * guarantee this field name implies.
   */
  readonly realFileUntouched: boolean;
}

/**
 * `pathspec` omitted diffs the whole working tree; passed, it limits the diff
 * to that one path. Exported (and used with no argument for `probeOne`'s
 * post-mutation check) because a file-scoped check has a real blind spot a
 * QA pass on q14 found by injecting a bug into `applyEdits` that also wrote
 * into a real, unrelated tracked file (`BACKLOG-QUALITY.md`): `probeOne`
 * reported `realFileUntouched: true` because it only ever diffed `m.file`,
 * while the actual working tree was dirty elsewhere. `tests/q14-mutation-smoke.test.ts`
 * has a regression test against a dedicated fixture file proving the
 * whole-repo form catches what the file-scoped form misses.
 *
 * `git diff` only ever reports changes to files git already tracks — it says
 * nothing about a brand-new file landing in the real tree, which is exactly
 * the shape a scratch-path computation bug (`scratchPath`, `populateScratch`)
 * could produce if it ever resolved outside `SCRATCH_ROOT` (code review, this
 * item). `hasNewUntrackedFiles`/`snapshotUntracked` below cover that case
 * separately, compared against a baseline taken before the probe runs —
 * not folded into this function, because "zero untracked files anywhere in
 * the repo" is not a precondition this lane's own workflow can promise (this
 * item's own two new files are themselves untracked until the commit that
 * ships them), where "no *new* untracked file appeared since this probe
 * started" is.
 */
export function gitDiffClean(pathspec?: string): boolean {
  const scope = pathspec === undefined ? [] : ['--', pathspec];
  try {
    execFileSync('git', ['diff', '--exit-code', ...scope], { cwd: ROOT, stdio: 'pipe' });
    execFileSync('git', ['diff', '--cached', '--exit-code', ...scope], { cwd: ROOT, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * The set of untracked-and-not-gitignored repo-relative paths right now
 * (`git ls-files --others --exclude-standard`). `--exclude-standard` means a
 * file under an already-ignored path (the scratch root, `bench/.tmp/`
 * generally) never appears here — only something git would list under
 * "Untracked files" in `git status`. Exported so a caller can snapshot a
 * baseline before an operation and diff against it afterward, rather than
 * requiring the whole repo to already be pristine.
 */
export function snapshotUntracked(): Set<string> {
  const out = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: ROOT, stdio: 'pipe' }).toString();
  return new Set(out.split(/\r?\n/).filter((l) => l.length > 0));
}

/** True if any path present now was absent from `baseline` — a genuinely new untracked file, regardless of how many pre-existing ones surround it. */
export function hasNewUntrackedFiles(baseline: ReadonlySet<string>): boolean {
  const now = snapshotUntracked();
  for (const f of now) {
    if (!baseline.has(f)) return true;
  }
  return false;
}

function slug(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, '-');
}

/** A not-yet-created scratch path, computed with no I/O so callers can clean it up even if populating it fails partway. */
function scratchPath(name: string): string {
  return path.join(SCRATCH_ROOT, `${slug(name)}-${process.pid}-${Math.random().toString(36).slice(2)}`);
}

/**
 * Fills `dir` with a fresh, isolated copy of src/tests/tools/data. `dir`
 * lives inside the repo (under `bench/`, not one of the four copied
 * directories) so Node's own node_modules resolution still finds the real
 * install by walking upward, without symlinking or reinstalling anything.
 */
/**
 * `maxRetries`/`retryDelay` make `rmSync` retry on EBUSY/EMFILE/ENFILE/
 * ENOTEMPTY/EPERM instead of throwing immediately — on Windows a just-exited
 * nested `vitest`/esbuild worker process can hold a scratch file's handle
 * open for a few milliseconds after `execFileSync` returns, and under real
 * `npm test`-scale contention (many worker threads, more scheduler noise)
 * that window is long enough to matter: measured directly, a full-suite run
 * hit `EPERM` removing `SCRATCH_ROOT` where the same code standalone did not.
 * Same host-contention lesson as q13's perf-ratio probe (BACKLOG-QUALITY.md
 * session 9 log) — found by actually running under load, not by reasoning
 * about it.
 */
const RM_RETRY = { recursive: true, force: true, maxRetries: 5, retryDelay: 200 } as const;

function removeDir(dir: string): void {
  rmSync(dir, RM_RETRY);
}

function populateScratch(dir: string): void {
  removeDir(dir);
  mkdirSync(dir, { recursive: true });
  for (const d of COPY_DIRS) {
    cpSync(path.join(ROOT, d), path.join(dir, d), { recursive: true });
  }
  for (const f of COPY_FILES) {
    cpSync(path.join(ROOT, f), path.join(dir, f));
  }
}

/** Removes every scratch copy this probe has ever left behind (defensive; normally each call cleans its own). */
export function cleanupAllScratch(): void {
  removeDir(SCRATCH_ROOT);
}

/** Whether any scratch directory is currently on disk — lets a test assert cleanup actually happened, not just that it didn't throw. */
export function scratchRootExists(): boolean {
  return existsSync(SCRATCH_ROOT);
}

function applyEdits(scratchDir: string, file: string, edits: readonly MutationEdit[]): void {
  const full = path.join(scratchDir, file);
  let text = readFileSync(full, 'utf8');
  // Mutation `find`/`replace` templates are authored with plain `\n` for
  // readability; the repo's own source files are checked out with CRLF line
  // endings on this platform, so translate before matching rather than
  // making every template carry `\r\n` by hand.
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  for (const { find, replace } of edits) {
    const f = eol === '\r\n' ? find.replace(/\n/g, eol) : find;
    const r = eol === '\r\n' ? replace.replace(/\n/g, eol) : replace;
    const count = text.split(f).length - 1;
    if (count !== 1) {
      throw new Error(
        `mutation-probe: expected exactly one occurrence of an anchor in ${file}, found ${count}. ` +
          'The source has drifted since this mutation was recorded — update tools/mutation-probe.ts.',
      );
    }
    text = text.replace(f, r);
  }
  writeFileSync(full, text, 'utf8');
}

/**
 * A timed-out or killed child is not a "the mutation was caught" result — it
 * is the harness failing to answer the question at all, and coercing it to a
 * plain nonzero exit code would make it indistinguishable from a real catch.
 * Thrown rather than returned, so a probe never silently reports success.
 */
class NestedVitestTimeout extends Error {}

function runVitest(scratchDir: string, testFile: string): { exitCode: number; stdout: string; stderr: string } {
  try {
    const out = execFileSync('npx', ['vitest', 'run', testFile], {
      cwd: scratchDir,
      shell: true,
      stdio: 'pipe',
      timeout: NESTED_VITEST_TIMEOUT_MS,
      env: { ...process.env },
    });
    return { exitCode: 0, stdout: out.toString(), stderr: '' };
  } catch (err) {
    const e = err as { status?: number | null; signal?: string | null; killed?: boolean; stdout?: Buffer | string; stderr?: Buffer | string };
    if (e.killed || e.signal) {
      throw new NestedVitestTimeout(
        `mutation-probe: nested "npx vitest run ${testFile}" in ${scratchDir} was killed (signal ${e.signal ?? 'unknown'}), ` +
          `most likely the ${NESTED_VITEST_TIMEOUT_MS}ms exec timeout — this is a harness failure, not a caught mutation.`,
      );
    }
    return {
      exitCode: typeof e.status === 'number' ? e.status : 1,
      stdout: e.stdout?.toString() ?? '',
      stderr: e.stderr?.toString() ?? '',
    };
  }
}

/** Runs `testFile` against an unmutated scratch copy — must pass, or the harness itself is broken. */
export function probeControl(testFile: string): ProbeResult {
  const scratchDir = scratchPath(`control-${testFile}`);
  try {
    populateScratch(scratchDir);
    const { exitCode, stdout, stderr } = runVitest(scratchDir, testFile);
    return { name: `control:${testFile}`, testFailed: exitCode !== 0, exitCode, stdout, stderr, realFileUntouched: true };
  } finally {
    removeDir(scratchDir);
  }
}

/** Applies `m` to a scratch copy only, runs its test file there, and proves the real repo file was never touched. */
export function probeOne(m: Mutation): ProbeResult {
  if (!gitDiffClean(m.file)) {
    throw new Error(
      `mutation-probe: refusing to run "${m.name}" — the real ${m.file} already has uncommitted changes; commit or stash them first.`,
    );
  }
  const untrackedBaseline = snapshotUntracked();
  const scratchDir = scratchPath(m.name);
  let exitCode = -1;
  let stdout = '';
  let stderr = '';
  try {
    populateScratch(scratchDir);
    applyEdits(scratchDir, m.file, m.edits);
    ({ exitCode, stdout, stderr } = runVitest(scratchDir, m.testFile));
  } finally {
    removeDir(scratchDir);
  }
  const realFileUntouched = gitDiffClean() && !hasNewUntrackedFiles(untrackedBaseline);
  return { name: m.name, testFailed: exitCode !== 0, exitCode, stdout, stderr, realFileUntouched };
}

export function probeAll(mutations: readonly Mutation[] = MUTATIONS): ProbeResult[] {
  return mutations.map(probeOne);
}

/* --------------------------------------------------------------------- CLI */

function main(): void {
  const testFiles = [...new Set(MUTATIONS.map((m) => m.testFile))];
  let failures = 0;

  // Sweep any orphan left by a prior run that was hard-killed mid-probe
  // (Ctrl+C, CI timeout, OOM) before starting — otherwise nothing reclaims it
  // until the next run reaches its own clean exit. QA (q14) confirmed a
  // killed run does leave one behind on disk.
  cleanupAllScratch();

  try {
    for (const tf of testFiles) {
      const r = probeControl(tf);
      const ok = r.exitCode === 0;
      if (!ok) failures++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} control  ${tf}${ok ? '' : ` (exit ${r.exitCode})`}`);
    }

    for (const m of MUTATIONS) {
      const r = probeOne(m);
      const ok = r.testFailed && r.realFileUntouched;
      if (!ok) failures++;
      console.log(
        `${ok ? 'ok  ' : 'FAIL'} ${m.name.padEnd(38)} test ${r.testFailed ? 'failed (caught)' : 'PASSED (missed!)'}, real file ${
          r.realFileUntouched ? 'untouched' : 'DIRTY'
        }`,
      );
    }
  } finally {
    // Belt-and-suspenders: every probeControl/probeOne call already cleans up
    // its own scratch dir on its own way out, but a thrown NestedVitestTimeout
    // (or anything else escaping the loop above) must not skip this — a stray
    // copy of src/tests/tools/data left on disk is the exact hazard the whole
    // scratch-copy design exists to avoid.
    cleanupAllScratch();
  }
  console.log(`\n${MUTATIONS.length + testFiles.length - failures}/${MUTATIONS.length + testFiles.length} probes green`);
  process.exit(failures === 0 ? 0 : 1);
}

const entry = (process.argv[1] ?? '').replace(/\\/g, '/');
if (entry.endsWith('tools/mutation-probe.ts')) main();
