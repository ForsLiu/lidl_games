/**
 * c003 (BACKLOG-CONTENT, lane `content`) — §14 gate **G8**'s win-rate clause,
 * "every class clears T1 at 35-70% win rate (scripted kit bot)", for Time
 * Lord, the twelfth class (fb013).
 *
 * **CORRECTION, and what this file actually is.** c003 was written against
 * `tests/p6e-class-diversity.test.ts`'s *header* ("Time Lord has not been run
 * through it") and STATUS.md's "11 of 12 classes measured". Both are stale:
 * main-lane **p10v** (commit `17f852d`, an ancestor of this lane's HEAD)
 * already added `it.skip('time_lord', () => assertBand('time_lord'))` at
 * p6e's line 580 and recorded **12/12 — every seed victory/w18/
 * landslide-win**. The gap c003 names was closed before this lane branched;
 * p6e's own header, 560 lines above that case, simply never got updated.
 *
 * What is *not* stale, and is why this file still earns its place: **p10v's
 * measurement predates `c001`** (commit `80538e9`, this lane's HEAD), which
 * routed sixteen class-effect radii through `classArea` and so changed the
 * effective footprint of every one of the 24 Actives — Time's r7 mark and
 * Time Lock's zone included. c001's own write-up measured its blast radius
 * on six classes x three seeds and on G8's single un-skipped diversity pin,
 * but on no class's win-rate band. This file is the **post-c001
 * re-measurement** of Time Lord's band under exactly p10v's harness, and the
 * answer is that the number did not move.
 *
 * **Harness**: byte-for-byte p6e's `runClassScripted` — T1 (`tier: 1`,
 * `modifiers: []`), `cycles: 6` (the full 18 TD / 6 VS / boss run), the full
 * Constellation tree (`allTreeNodeIds`, fb049/Q138: what a real Hub-started
 * run allocates, which `cfg()`'s `[]` default does not match), the `hybrid`
 * policy with `tests/helpers.ts`'s shared scripted kit bot layered on
 * (`runScripted` -> `scriptClassKit` + `buyCoreUpgrades`), and G23's
 * 120-simulated-minute cap. Seeds 1-12, per CLAUDE.md's "pass-rates over a
 * fixed seed set, never medians". The band arithmetic matches too: a `rate`
 * in [0.35, 0.70] over 12 seeds is p6e's `wins` in
 * [ceil(12*0.35), floor(12*0.70)] = [5, 8].
 *
 * One divergence worth stating rather than leaving implicit: p6e measures
 * Time Lord inside a same-process 12-class sweep, this file measures it
 * alone. The sim is deterministic from seed + input log (architecture rule
 * 2), so those should agree — and the seed-for-seed agreement with p10v's
 * number is the evidence that they do, not an assumption.
 *
 * **Cost**: twelve full T1 runs, ~8 s each on the reference host — over the
 * fast tier's ~60 s per-file budget, so since the 2026-09-03 lane merge this
 * file sits in `vitest.fast.config.ts`'s exclude list and the sweep runs
 * under the FULL `npm test`. A standalone run can opt out of the sweep:
 *
 *   TIME_LORD_MEASURE=0 npx vitest run tests/class-time-lord-band.test.ts
 *
 * The band assertion below is `.skip`-ed and carries its measured number,
 * exactly as p6e's twelve cases do — c003's acceptance says so in as many
 * words ("rather than forcing a tune"), and per Q160 / Q161 no `/data`-only
 * lever has been found that moves any class into this band; `p10r` (main
 * lane) owns the roster-wide retune.
 *
 * -- RECORDED (2026-09-03, this lane, `TIME_LORD_MEASURE=1`, seeds 1-12,
 * against commit `80538e9` = c001) --
 *
 *   time_lord: 12/12 (100%) — every seed `victory` at wave 18, every one
 *   classified `landslide-win` (`classifyMargin`, p10z). Margins:
 *   landslide-win:12. No `timeout`, no `defeat_core`, no `defeat_warden`.
 *
 * Identical to p10v's pre-c001 number, seed for seed: **c001 did not move
 * Time Lord's G8 band.** The reading is over G8's 70% ceiling, not under its
 * 35% floor — the same place fb049/Q138 re-measured the rest of the roster
 * into once `allocated` was corrected from `[]` to the full Constellation
 * tree. No tune is landed here: a twelfth-class-only tune against a uniform
 * roster-wide result would be a fragile local fix, against CLAUDE.md's
 * measurement rules and against Q160's four-session finding.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import '../src/bots';
import { loadContent } from '../src/sim/content';
import { allTreeNodeIds } from '../src/meta/meta';
import type { RunConfig, RunReport } from '../src/sim/types';
import { cfg, classifyMargin, runScripted, summarizeMargins } from './helpers';

const content = loadContent();
const FULL_TREE = allTreeNodeIds(content);

/** §14 gate G8's own band, the two constants p6e reads it from. */
const BAND_LO = 0.35;
const BAND_HI = 0.7;

// Lane merge 2026-09-03: the env gate is dropped — this file is in
// `vitest.fast.config.ts`'s exclude list, so the sweep runs under the FULL
// `npm test` only. `TIME_LORD_MEASURE=0` opts a standalone run out.
const MEASURE = process.env.TIME_LORD_MEASURE !== '0';
const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);

function runTimeLord(seed: number): RunReport {
  const config: RunConfig = cfg({
    seed,
    classKey: 'time_lord',
    tier: 1,
    modifiers: [],
    allocated: FULL_TREE,
    cycles: 6,
    policy: 'hybrid',
  });
  return runScripted(config, 'hybrid', 60 * 60 * 120).report;
}

let wins = 0;
let outcomes: string[] = [];
let reports: RunReport[] = [];

beforeAll(() => {
  if (!MEASURE) return;
  // Reset rather than append: a watch-mode re-execution or a retry runs this
  // hook again against the same module instance.
  wins = 0;
  outcomes = [];
  reports = [];
  for (const seed of SEEDS) {
    const report = runTimeLord(seed);
    reports.push(report);
    if (report.outcome === 'victory') wins++;
    // p6e's own outcome string shape: seed, outcome (a tick-cap `running` is a
    // timeout, not a measured loss), waves cleared, and p10z's margin class.
    outcomes.push(
      `${seed}:${report.outcome === 'running' ? 'timeout' : report.outcome}/w${report.wavesCleared}/${classifyMargin(report).kind}`,
    );
  }
  console.log(
    `\n[c003] time_lord T1 scripted-kit band: ${wins}/${SEEDS.length}` +
      ` (${((wins / SEEDS.length) * 100).toFixed(1)}%) — ${outcomes.join(' ')}` +
      ` — margins: ${summarizeMargins(reports)}\n`,
  );
}, 6_000_000);

describe('c003: G8 win-rate clause, Time Lord — post-c001 re-measurement', () => {
  /**
   * Measured 2026-09-03 (this lane, `TIME_LORD_MEASURE=1`): **12/12 (100%),
   * all twelve `victory`/w18/`landslide-win`**, identical to p10v's pre-c001
   * number. Over the 70% ceiling, so this assertion is red as written
   * (`1 > 0.7`). `.skip`-ed with its measurement, the same disposition p6e
   * gives all twelve of its cases — see this file's header and Q160/Q161.
   * Re-enable point is `p10r` (main lane), alongside the rest of the roster.
   */
  it.skip('clears T1 at a 35-70% win rate under the scripted kit bot', () => {
    // Without the sweep `wins` is 0, and this case would report a confident
    // 0% — a wrong number in the opposite direction from the measured truth,
    // which is exactly the mis-tune signal the file exists to prevent.
    expect(MEASURE, 'set TIME_LORD_MEASURE=1 — this case needs the live sweep').toBe(true);
    const rate = wins / SEEDS.length;
    const detail = `${wins}/${SEEDS.length} — ${outcomes.join(' ')}`;
    expect(rate, detail).toBeGreaterThanOrEqual(BAND_LO);
    expect(rate, detail).toBeLessThanOrEqual(BAND_HI);
  });

  it.skipIf(!MEASURE)('resolves every seed to a real end state, with no tick-cap timeout', () => {
    expect(outcomes).toHaveLength(SEEDS.length);
    // A `running` seed never reached an end state, so it is neither a win nor
    // a measured loss — p6e excludes those from its tallies entirely. None
    // occurred here; if that changes, the number recorded above is no longer a
    // clean 12-seed pass-rate and needs re-recording, not silent inheriting.
    expect(
      outcomes.filter((o) => o.includes('timeout')),
      outcomes.join(' '),
    ).toHaveLength(0);
  });

  /**
   * The cheap half, which does run in the fast tier: the class this file
   * exists to measure is on the roster and still carries the fb013 kit the
   * harness scripts. A roster or kit edit that dropped either would otherwise
   * leave the recorded measurement above silently describing something else.
   * Deliberately not a roster-*count* pin — three of those already exist
   * (`fb013-timelord`, `grid`, `p6d-nine-classes`) and this lane's own queued
   * fb057/fb059 will have to move them all.
   */
  it('time_lord is on the roster with its fb013 kit intact', () => {
    const cls = content.classByKey.get('time_lord');
    expect(cls, 'time_lord missing from data/classes.json').toBeDefined();
    expect(cls!.active1.kind).toBe('time_mark');
    expect(cls!.active2.kind).toBe('time_lock');
  });
});
