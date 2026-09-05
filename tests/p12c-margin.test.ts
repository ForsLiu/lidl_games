/**
 * BACKLOG p12c (BALANCE DIRECTION v2 §C): the **margin** instrument the
 * balance items are graded on — win rate, close-win share and median Core HP
 * at victory — over the G1/G8 harness (engineer, scripted kit bot, full
 * Constellation tree, `modifiers: []` so only the levers under test vary).
 *
 * Win rate alone cannot see what §C asks for. From `baseHpMul` 1 to 12 the
 * scripted bot's win rate stays ~100% while its median Core HP at victory
 * falls 100% -> 84%: it wins *untouched* right up until it starts losing
 * outright, and only the margin shows that happening.
 *
 * **Cost, and why the sweep is opt-in.** One tier-seed is a full T1 run;
 * 24 seeds is ~15 minutes. The sweep runs only under `P12C_MEASURE=1`; the
 * fast tier sees only the cheap invariants at the bottom.
 *
 *   P12C_MEASURE=1 npx vitest run tests/p12c-margin.test.ts
 *   P12C_MEASURE=1 P12C_TIER=3 P12C_SEEDS=24 npx vitest run tests/p12c-margin.test.ts
 *   P12C_MEASURE=1 P12C_TIER=3 P12C_CAP_MIN=120 P12C_SEEDS=24 npx vitest run ...
 *
 * `P12C_CAP_MIN` matters more than it looks. At G1's own 45-minute cap six of
 * T3's 24 seeds are censored, and they are disproportionately *wins* — worth
 * 25 points of win rate (37.5% censored against 62.5% at 120 minutes). Any
 * rate read off the default cap is a lower bound. That is **p12e**'s to fix,
 * and it is the blocker for the whole p12 arc (QUESTIONS Q177).
 *
 * -- RECORDED (2026-09-05, shipped `baseHpMul: 20`, ladder 1.07/1.05/1.03) --
 *
 *   tier  n   win rate   close-win   median Core HP@victory   timeouts
 *   T1    24  66.7%      33%         53.8%                    1
 *   T2    12  41.7%      33%         42.6%                    0
 *   T3    24  37.5%      21%         40.1%                    6
 *   T4    12  33.3%      33%         21.8%                    0
 *   T5    24  20.8%      13%         47.3%                    1
 *   T3    24  62.5%      38%         40.1%                    0   (120-min cap)
 *
 * T1 meets all three of §C's targets. T3 is inside §B's [35%,70%] on both
 * readings. T5 sits *at* the [5%,20%] ceiling rather than inside it.
 *
 * Two caveats on reading that as a curve. **`n` is not uniform** — T2 and T4
 * are 12 seeds against the others' 24, so they carry roughly twice the
 * standard error (T4 re-measured at n=24 also gives 33.3%, so the ordering
 * survives, but the rows are not equally trustworthy). And **the margin
 * column is non-monotone**: T5's median (47.3%) is *higher* than T4's
 * (21.8%) — the few builds that win at T5 win comfortably. That is a thin
 * median over 5 wins, not a difficulty inversion, and it is why the bands are
 * read off the win-rate column rather than the margin one.
 */
import { describe, expect, it } from 'vitest';

import '../src/bots';
import { loadContent } from '../src/sim/content';
import { allTreeNodeIds } from '../src/meta/meta';
import type { RunReport } from '../src/sim/types';
import { classifyMargin, runScripted, summarizeMargins } from './helpers';

const content = loadContent();
const FULL_TREE = allTreeNodeIds(content);

const MEASURE = process.env.P12C_MEASURE === '1';
const TIER = Number(process.env.P12C_TIER ?? 1);
const CAP_MIN = Number(process.env.P12C_CAP_MIN ?? 45);
const SEED_COUNT = Number(process.env.P12C_SEEDS ?? 24);
const SEEDS = Array.from({ length: SEED_COUNT }, (_, i) => i + 1);

/** §C's three targets for T1. */
const WIN_BAND = [0.55, 0.9] as const;
const MIN_CLOSE_WIN_SHARE = 0.25;
const MEDIAN_CORE_HP_BAND = [0.3, 0.6] as const;

interface Margins {
  winRate: number;
  closeWinShare: number;
  medianCoreHpAtVictory: number;
  detail: string;
}

let measured: Margins | null = null;

function measure(): Margins {
  const reports: RunReport[] = SEEDS.map(
    (seed) =>
      runScripted(
        { seed, classKey: 'engineer', tier: TIER, modifiers: [], allocated: FULL_TREE },
        'hybrid',
        60 * 60 * CAP_MIN,
      ).report,
  );
  const wins = reports.filter((r) => r.outcome === 'victory');
  const closeWins = reports.filter((r) => classifyMargin(r).kind === 'close-win').length;
  const fracs = wins.map((r) => classifyMargin(r).coreHpFrac).sort((a, b) => a - b);
  return {
    winRate: wins.length / reports.length,
    closeWinShare: closeWins / reports.length,
    medianCoreHpAtVictory: fracs.length > 0 ? fracs[Math.floor(fracs.length / 2)] : NaN,
    detail: `T${TIER} n=${SEED_COUNT} cap=${CAP_MIN}m: ${wins.length}/${SEED_COUNT} wins — ${summarizeMargins(reports)}`,
  };
}

describe.skipIf(!MEASURE)('p12c: margin measurement (opt-in)', () => {
  it('meets §C’s three T1 targets', () => {
    measured ??= measure();
    const m = measured;
    // Only T1 is what §C bands; at any other tier this case is a recorder.
    if (TIER !== 1) {
      console.log(
        `\n[p12c] ${m.detail}\n  winRate ${(m.winRate * 100).toFixed(1)}%` +
          `  closeWin ${(m.closeWinShare * 100).toFixed(0)}%` +
          `  medianCoreHp@victory ${(m.medianCoreHpAtVictory * 100).toFixed(1)}%\n`,
      );
      expect(m.winRate).toBeGreaterThanOrEqual(0);
      return;
    }
    expect(m.winRate, m.detail).toBeGreaterThanOrEqual(WIN_BAND[0]);
    expect(m.winRate, m.detail).toBeLessThanOrEqual(WIN_BAND[1]);
    expect(m.closeWinShare, m.detail).toBeGreaterThanOrEqual(MIN_CLOSE_WIN_SHARE);
    expect(m.medianCoreHpAtVictory, m.detail).toBeGreaterThanOrEqual(MEDIAN_CORE_HP_BAND[0]);
    expect(m.medianCoreHpAtVictory, m.detail).toBeLessThanOrEqual(MEDIAN_CORE_HP_BAND[1]);
  }, 60 * 60 * 1000);
});

describe('p12c: the anchor the sweep landed on (fast tier)', () => {
  it('`baseHpMul` is authored, positive, and the identity is 1', () => {
    // Pinned because every number in this file's header — and BALANCE.md's
    // whole "T1 re-anchor (p12c)" section — was measured at this value. A
    // silent edit invalidates all of them, so it fails here first.
    expect(content.enemies.baseHpMul).toBe(20);
    expect(content.enemies.baseHpMul).toBeGreaterThan(0);
  });

  it('refuses a `baseHpMul` that spawns enemies at Infinity HP', () => {
    // qa-playtester: `.positive()` alone took `1e308` and produced literally
    // unkillable enemies. Architecture rule 4 — a loader rule that refuses
    // unpayable data beats a comment saying the data must be valid.
    expect(() => loadContent({ enemies: { ...content.enemies, baseHpMul: 1e308 } })).toThrow();
    expect(() => loadContent({ enemies: { ...content.enemies, baseHpMul: 0 } })).toThrow();
    expect(() => loadContent({ enemies: { ...content.enemies, baseHpMul: -1 } })).toThrow();
    expect(() => loadContent({ enemies: { ...content.enemies, baseHpMul: 20 } })).not.toThrow();
  });

  it('§C’s own bands are stated as constants, not buried in prose', () => {
    expect(WIN_BAND).toEqual([0.55, 0.9]);
    expect(MIN_CLOSE_WIN_SHARE).toBe(0.25);
    expect(MEDIAN_CORE_HP_BAND).toEqual([0.3, 0.6]);
  });
});
