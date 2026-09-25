/**
 * fb203 (BACKLOG-CONTENT, lane `content`) — §14 gate **G8**'s win-rate clause
 * for Voltbolt (fb059's 14th class), measured at G8's own reference tier
 * (`GATE_TIER` = T3, `tests/helpers.ts`), the tier `tests/p6e-class-
 * diversity.test.ts`'s `it.skip('voltbolt', ...)` names but has never run —
 * that file is out of this lane's Scope (not `tests/class-*`/`tests/equip-*`)
 * so this is a new, in-Scope file that reproduces its exact per-class harness
 * (`runClassScripted`) for Voltbolt alone, following `tests/class-time-lord-
 * band.test.ts`'s precedent (c003) rather than editing the out-of-Scope file.
 *
 * **Why T3, not T1 like `class-time-lord-band.test.ts`.** That file predates
 * `p12b`'s GATE_TIER move to 3 and was deliberately left at its own recorded
 * T1 history. fb203 asks for "Voltbolt's G8 win-rate row" specifically, and
 * G8's live reference tier is T3 (`p6e`'s own `runClassScripted` reads
 * `tier: GATE_TIER`) — so this file measures T3 from the start, matching the
 * gate it reports against exactly, with no tier caveat needed.
 *
 * **Harness**: identical shape to p6e's `runClassScripted` — `tier:
 * GATE_TIER` (3), `modifiers: []`, the full Constellation tree
 * (`allTreeNodeIds`), `cycles: 6` (full 18 TD / 6 VS wave / boss run), the
 * `hybrid` policy with `runScripted`'s shared scripted-kit-bot layer
 * (`scriptClassKit` + `buyCoreUpgrades`), G23's 120-simulated-minute cap.
 * Seeds 1-12, CLAUDE.md's "pass-rates over a fixed seed set, never medians".
 * Band arithmetic matches p6e's: `wins` in [ceil(12*0.35), floor(12*0.70)] =
 * [5, 8] passes.
 *
 * **Cost, and why it is opt-in rather than opt-out.** Twelve full T3 runs —
 * well over the fast tier's ~60 s per-file budget, the same shape as
 * `class-time-lord-band.test.ts` (c003), but that file is opt-out (its
 * sweep runs by default) because it was also added to
 * `vitest.fast.config.ts`'s exclude list in the same commit.
 * `vitest.fast.config.ts` is not in this lane's Scope, so this file cannot
 * add itself to that list — left opt-out it would silently blow up
 * `npm run test:fast`'s budget. It follows `class-kit-fingerprint.test.ts`'s
 * (c033) opt-in convention instead: `MEASURE` defaults to **false**, so the
 * fast tier only pays for the one cheap roster-invariant case at the bottom.
 * Adding this file to the exclude list (so it can flip to opt-out like its
 * T1 sibling) is filed as a Queue follow-up below for main-lane pickup. Run
 * the live sweep directly:
 *
 *   VOLTBOLT_G8_MEASURE=1 npx vitest run tests/class-voltbolt-g8-band.test.ts
 *
 * -- RECORDED (2026-09-25, fb203, seeds 1-12, T3/GATE_TIER, this branch's
 * HEAD, `data/classes.json` unchanged) --
 *
 *   voltbolt: **8/12 (66.7%)** — right at G8's 70% ceiling
 *   (`floor(12*0.70)=8`) but inside it. 1:close-win 3/4/5/6/9/11/12:
 *   landslide-win 2/7/8/10:contested-loss/w12-16. No timeout. Margins:
 *   landslide-win:7 close-win:1 contested-loss:4. **In band** — see fb203's
 *   BACKLOG-CONTENT.md write-up for the full census (fingerprint-distance
 *   pairs) and verdict. Unlike `class-time-lord-band.test.ts`'s T1 reading,
 *   this number is measured at the gate's own live tier, so the band
 *   assertion below is a live, `MEASURE`-gated check rather than a
 *   permanently `.skip`-ed one — it will re-assert honestly on every future
 *   `VOLTBOLT_G8_MEASURE=1` run rather than silently going stale.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import '../src/bots';
import { allTreeNodeIds } from '../src/meta/meta';
import { loadContent } from '../src/sim/content';
import type { RunConfig, RunReport } from '../src/sim/types';
import { cfg, classifyMargin, GATE_TIER, runScripted, summarizeMargins } from './helpers';

const content = loadContent();
const FULL_TREE = allTreeNodeIds(content);

/** §14 gate G8's own band. */
const BAND_LO = 0.35;
const BAND_HI = 0.7;

const MEASURE = process.env.VOLTBOLT_G8_MEASURE === '1';
const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);

function runVoltbolt(seed: number): RunReport {
  const config: RunConfig = cfg({
    seed,
    classKey: 'voltbolt',
    tier: GATE_TIER,
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
  wins = 0;
  outcomes = [];
  reports = [];
  for (const seed of SEEDS) {
    const report = runVoltbolt(seed);
    reports.push(report);
    if (report.outcome === 'victory') wins++;
    outcomes.push(
      `${seed}:${report.outcome === 'running' ? 'timeout' : report.outcome}/w${report.wavesCleared}/${classifyMargin(report).kind}`,
    );
  }
  console.log(
    `\n[fb203] voltbolt T3/GATE_TIER scripted-kit band: ${wins}/${SEEDS.length}` +
      ` (${((wins / SEEDS.length) * 100).toFixed(1)}%) — ${outcomes.join(' ')}` +
      ` — margins: ${summarizeMargins(reports)}\n`,
  );
}, 6_000_000);

describe('fb203: G8 win-rate clause, Voltbolt — first measurement at T3/GATE_TIER', () => {
  it.skipIf(!MEASURE)('clears T3 at a 35-70% win rate under the scripted kit bot', () => {
    expect(MEASURE, 'set VOLTBOLT_G8_MEASURE=1 — this case needs the live sweep').toBe(true);
    const rate = wins / SEEDS.length;
    const detail = `${wins}/${SEEDS.length} — ${outcomes.join(' ')}`;
    expect(rate, detail).toBeGreaterThanOrEqual(BAND_LO);
    expect(rate, detail).toBeLessThanOrEqual(BAND_HI);
  });

  it.skipIf(!MEASURE)('resolves every seed to a real end state, with no tick-cap timeout', () => {
    expect(outcomes).toHaveLength(SEEDS.length);
    expect(
      outcomes.filter((o) => o.includes('timeout')),
      outcomes.join(' '),
    ).toHaveLength(0);
  });

  it('voltbolt is on the roster with its fb059 kit intact', () => {
    const cls = content.classByKey.get('voltbolt');
    expect(cls, 'voltbolt missing from data/classes.json').toBeDefined();
    expect(cls!.active1.kind).toBe('lightning_ball');
    expect(cls!.active2.kind).toBe('overdrive_voltbolt');
  });
});
