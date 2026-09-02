/**
 * fb038 — `npm run status` writes STATUS.md from live data (gate table via
 * tools/gate-audit.ts, a real tools/sweep.ts-driven balance snapshot, and
 * tools/content-census.ts), plus a feedback ledger and a pending-QUESTIONS
 * list. This file covers the pure/parsing pieces directly, plus the crash
 * behaviour on a broken /data file. The real CLI end-to-end run lives in
 * tests/fb038-status-cli.test.ts (fb048 split it out — see that file's
 * header for why).
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path, { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  BALANCE_SEEDS,
  buildGateTable,
  cfgFor,
  classifyHealth,
  feedbackLedger,
  parseHandoffGateTable,
  pendingQuestions,
  renderStatus,
  staleGateWarnings,
  type BalanceSnapshot,
  type GateRow,
} from '../tools/status';
import { REPO_ROOT } from '../tools/gate-audit';
import type { CensusRow } from '../tools/content-census';
import { loadContent } from '../src/sim/content';
import { allTreeNodeIds } from '../src/meta/meta';

function emptyBalance(overrides: Partial<BalanceSnapshot> = {}): BalanceSnapshot {
  return {
    policyComparison: [],
    perClass: [],
    perCore: [],
    damageShare: [],
    boonPicks: [],
    meanRunMinutes: 0,
    timeoutCount: 0,
    totalRuns: 0,
    ...overrides,
  };
}

describe('fb038: parseHandoffGateTable + classifyHealth', () => {
  const SAMPLE = [
    '### Gate coverage (`npx tsx tools/gate-audit.ts`)',
    '',
    '| Gate | State |',
    '|---|---|',
    '| G1 (30–36 min mean) | **Green in full.** Some detail. |',
    '| G8 (class win rate) | **Red, measured, `.skip`-ed.** Some other detail. |',
    '| G13 (share cap) | **Partial — corrected downward.** Mixed detail. |',
    '',
    '### The over-ceiling inversion',
  ].join('\n');

  it('extracts exactly the gate rows, not the header/divider/prose', () => {
    const map = parseHandoffGateTable(SAMPLE);
    expect(map.size).toBe(3);
    expect(map.get('G1')).toContain('Green in full');
    expect(map.get('G8')).toContain('Red, measured');
    expect(map.get('G13')).toContain('Partial');
  });

  it('classifies the bold lead word', () => {
    expect(classifyHealth('**Green in full.** x')).toBe('GREEN');
    expect(classifyHealth('**Red, measured.** x')).toBe('RED');
    expect(classifyHealth('**Partial.** x')).toBe('PARTIAL');
    expect(classifyHealth('no bold lead at all')).toBe('UNKNOWN');
    expect(classifyHealth(undefined)).toBe('UNKNOWN');
  });
});

describe('fb038: buildGateTable (real SPEC-FINAL.md + HANDOFF.md)', () => {
  it('classifies every parsed gate — none left UNKNOWN', () => {
    // Every gate SPEC-FINAL §14 names has either a HANDOFF.md health row or a
    // gate-audit coverage/hole/UNTRACKED fallback, so `buildGateTable` should
    // never emit an unclassified gate silently — the same "never UNTRACKED"
    // property tests/q10-gate-audit.test.ts pins for coverage, extended to
    // health here.
    const rows = buildGateTable();
    expect(rows.length).toBeGreaterThanOrEqual(20);
    const unknown = rows.filter((r) => r.health === 'UNKNOWN');
    expect(unknown.map((r) => r.id)).toEqual([]);
  });

  it('every gate id is unique and non-empty detail text is attached', () => {
    const rows = buildGateTable();
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of rows) expect(r.detail.length).toBeGreaterThan(0);
  });
});

describe('fb038: feedbackLedger (regression: section headers must not steal a citation)', () => {
  const SCRATCH = join(REPO_ROOT, 'bench', '.tmp', 'fb038-ledger-scratch');

  function scratch(): string {
    const dir = join(SCRATCH, `${process.pid}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(dir, 'feedback', 'processed'), { recursive: true });
    return dir;
  }

  it('a bullet after a same-slug-citing section header is still found, not the previous section', () => {
    const dir = scratch();
    try {
      writeFileSync(
        join(dir, 'feedback', 'processed', '20260901-120444-feature-status-report.md'),
        '# feature request\nBuild a status tool.\n',
      );
      const backlog = [
        '- [x] (fbPREV) [feat] some earlier item, done — refs: nothing',
        '',
        '### Owner verdict batch (2026-09-01, + `feature-status-report`)',
        '',
        '- [ ] (fb038) [feat] top priority: a tool `npm run status` — refs: owner feedback `feature-status-report`.',
      ].join('\n');
      writeFileSync(join(dir, 'BACKLOG.md'), backlog);

      const rows = feedbackLedger(join(dir, 'feedback', 'processed'), join(dir, 'BACKLOG.md'));
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('fb038 — queued');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a verdict-batch file is reported as archived, not searched for a citation', () => {
    const dir = scratch();
    try {
      writeFileSync(join(dir, 'feedback', 'processed', '20260828-225846-verdicts-q122-133.md'), 'verdicts\n');
      writeFileSync(join(dir, 'BACKLOG.md'), '- [x] (unrelated) [feat] x — refs: y');
      const rows = feedbackLedger(join(dir, 'feedback', 'processed'), join(dir, 'BACKLOG.md'));
      expect(rows[0].status).toContain('verdict batch');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a file with no BACKLOG citation is reported honestly rather than mismatched', () => {
    const dir = scratch();
    try {
      writeFileSync(join(dir, 'feedback', 'processed', '20260101-000000-feature-nowhere.md'), 'x\n');
      writeFileSync(join(dir, 'BACKLOG.md'), '- [x] (other) [feat] unrelated — refs: z');
      const rows = feedbackLedger(join(dir, 'feedback', 'processed'), join(dir, 'BACKLOG.md'));
      expect(rows[0].status).toBe('no BACKLOG citation found');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the real repo maps its own filing feedback file to fb038, not a neighboring section', () => {
    // The live regression this test suite exists to pin: before the header-
    // exclusion fix, `feedbackLedger()` matched the "### Owner verdict batch
    // (... + `feature-status-report`)" section header first and walked back
    // into fb037's bullet instead of fb038's own citation.
    const rows = feedbackLedger();
    const row = rows.find((r) => r.file === '20260901-120444-feature-status-report.md');
    expect(row).toBeDefined();
    expect(row?.status.startsWith('fb038')).toBe(true);
  });
});

describe('fb038: pendingQuestions', () => {
  it('only returns Q-blocks with no "(owner verdict:" text', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fb038-q-'));
    try {
      const text = [
        '# QUESTIONS.md',
        '',
        '- **Q1. [M0] Resolved question.** Chosen default: x. — (owner verdict: approved)',
        '- **Q2. [M1] Unresolved question spanning',
        '  two lines with no verdict yet.** Still open.',
        '- **Q3. [M2] Another resolved one.** — (owner verdict: superseded — no successor.)',
      ].join('\n');
      const p = join(dir, 'QUESTIONS.md');
      writeFileSync(p, text);
      const pending = pendingQuestions(p);
      expect(pending.map((q) => q.id)).toEqual(['Q2']);
      expect(pending[0].snippet).toContain('Unresolved question spanning');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the real QUESTIONS.md has no pending entry that actually carries a verdict', () => {
    const text = readFileSync(join(REPO_ROOT, 'QUESTIONS.md'), 'utf8');
    const pending = pendingQuestions();
    for (const q of pending) {
      const idx = text.indexOf(`**${q.id}.`);
      expect(idx).toBeGreaterThanOrEqual(0);
    }
    // Cross-check against an independently-written count so the function's
    // own block-splitting regex can't silently under- or over-count. Mirrors
    // pendingQuestions' own "only after the bold title closes" rule, not a
    // whole-block substring search — see the false-negative regression test
    // below for why that distinction matters.
    const blocks = text.split(/\n(?=- \*\*Q\d+\.)/).filter((b) => /^- \*\*Q\d+\./.test(b));
    const independentPendingCount = blocks.filter((b) => {
      const m = /^- \*\*Q\d+\.\s*[\s\S]+?\*\*/.exec(b);
      return m ? !b.slice(m[0].length).includes('(owner verdict:') : false;
    }).length;
    expect(pending.length).toBe(independentPendingCount);
  });

  it('qa-playtester regression: a bold title that merely discusses the literal "(owner verdict:" marker as prose is not mistaken for a real verdict', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fb038-q-verdict-in-title-'));
    try {
      const text = [
        '- **Q500. [M9] Should we ever write "(owner verdict:" as literal prose inside a title?** Still totally unresolved, no real verdict anywhere in this block.',
        '- **Q501. [M9] A real pending one.** Open.',
      ].join('\n');
      const p = join(dir, 'QUESTIONS.md');
      writeFileSync(p, text);
      expect(pendingQuestions(p).map((q) => q.id)).toEqual(['Q500', 'Q501']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('fb038: renderStatus (smoke)', () => {
  it('renders every required section with the given data', () => {
    const balance: BalanceSnapshot = {
      policyComparison: [{ policy: 'hybrid', winRate: 0.5, meanMinutes: 3.2 }],
      perClass: [{ classKey: 'engineer', t1: 0.4, t3: 0.1 }],
      perCore: [{ coreKey: 'stone_heart', t1: 0.4, t3: 0.1 }],
      damageShare: [{ key: 'ballista', share: 1 }],
      boonPicks: [],
      meanRunMinutes: 3.2,
      timeoutCount: 0,
      totalRuns: 5,
    };
    const censusRows: CensusRow[] = [{ key: 'classes', label: 'Classes', actual: '12', target: '12', met: true }];
    const out = renderStatus(
      [{ id: 'G1', spec: 'test gate', health: 'GREEN', detail: '**Green.** ok', files: ['tests/x.test.ts'] }],
      balance,
      censusRows,
      [{ file: 'a.md', status: 'fb001 — done' }],
      [{ id: 'Q999', snippet: 'an open question' }],
    );
    expect(out).toContain('## Gate table');
    expect(out).toContain('| G1: test gate | GREEN |');
    expect(out).toContain('## Balance snapshot');
    expect(out).toContain('| hybrid | 0.5 | 3.2 |');
    expect(out).toContain('| engineer | 0.4 | 0.1 |');
    expect(out).toContain('No run in this pool reached a boon offer');
    expect(out).toContain('## Content census');
    expect(out).toContain('| Classes | 12 | 12 | yes |');
    expect(out).toContain('## Feedback ledger');
    expect(out).toContain('| a.md | fb001 — done |');
    expect(out).toContain('## Pending QUESTIONS.md entries');
    expect(out).toContain('- **Q999.** an open question');
  });
});

describe('fb048: BALANCE_SEEDS sizing and its rendered wording', () => {
  it('is more than one seed/cell (a single seed folds a 45-min timeout into a real loss with no way to tell them apart)', () => {
    expect(BALANCE_SEEDS.length).toBeGreaterThan(1);
  });

  it('pluralizes "seed(s)/cell" to match BALANCE_SEEDS.length', () => {
    const balance: BalanceSnapshot = {
      policyComparison: [],
      perClass: [],
      perCore: [],
      damageShare: [],
      boonPicks: [],
      meanRunMinutes: 0,
      timeoutCount: 0,
      totalRuns: 0,
    };
    const out = renderStatus([], balance, [], [], []);
    const expected = BALANCE_SEEDS.length === 1 ? '1 seed/cell' : `${BALANCE_SEEDS.length} seeds/cell`;
    expect(out).toContain(expected);
  });
});

describe('fb038: staleGateWarnings (code-review finding: gate table vs. balance snapshot can contradict)', () => {
  const winRateGate: GateRow = {
    id: 'G8',
    spec: 'Every class clears T1 at 35-70% win rate (scripted kit bot)',
    health: 'GREEN',
    detail: '**Green.**',
    files: [],
  };
  const nonWinRateGate: GateRow = {
    id: 'G2',
    spec: 'Determinism: 100/100 replay hash match',
    health: 'GREEN',
    detail: '**Green.**',
    files: [],
  };
  const redWinRateGate: GateRow = { ...winRateGate, id: 'G23', health: 'RED' };

  it('flags a GREEN win-rate gate when the fresh balance snapshot shows zero wins everywhere', () => {
    const balance = emptyBalance({
      policyComparison: [{ policy: 'hybrid', winRate: 0, meanMinutes: 3 }],
      perClass: [{ classKey: 'engineer', t1: 0, t3: 0 }],
      perCore: [{ coreKey: 'stone_heart', t1: 0, t3: 0 }],
      totalRuns: 15,
    });
    expect(staleGateWarnings([winRateGate, nonWinRateGate, redWinRateGate], balance)).toEqual(['G8']);
  });

  it('does not flag anything when at least one cell has a real win', () => {
    const balance = emptyBalance({
      policyComparison: [{ policy: 'hybrid', winRate: 0.2, meanMinutes: 3 }],
      perClass: [{ classKey: 'engineer', t1: 0, t3: 0 }],
      perCore: [{ coreKey: 'stone_heart', t1: 0, t3: 0 }],
      totalRuns: 15,
    });
    expect(staleGateWarnings([winRateGate], balance)).toEqual([]);
  });

  it('does not flag anything when no runs were measured (empty pool, not a real signal)', () => {
    expect(staleGateWarnings([winRateGate], emptyBalance())).toEqual([]);
  });

  it('the real repo currently reproduces this exact contradiction (fb025 balance change vs. stale HANDOFF.md GREEN gates)', () => {
    // Not a bug this item introduced — a pre-existing gap this item's own
    // reconciliation check now surfaces instead of silently shipping a
    // self-contradicting STATUS.md. If this ever comes back empty, either
    // the balance genuinely recovered wins (great — HANDOFF.md still wants a
    // real regeneration to confirm the gates themselves) or the reconciler
    // regressed; either way it is worth a look, not a silent green.
    const gates = buildGateTable();
    const zeroWinBalance = emptyBalance({
      policyComparison: [{ policy: 'hybrid', winRate: 0, meanMinutes: 3 }],
      perClass: [{ classKey: 'engineer', t1: 0, t3: 0 }],
      perCore: [{ coreKey: 'stone_heart', t1: 0, t3: 0 }],
      totalRuns: 15,
    });
    expect(staleGateWarnings(gates, zeroWinBalance).length).toBeGreaterThan(0);
  });
});

describe('fb048: cfgFor defaults allocated to the full Constellation tree', () => {
  it('defaults to allTreeNodeIds when no override is given', () => {
    const content = loadContent();
    const cfg = cfgFor({}, 1, content);
    expect(cfg.allocated).toEqual(allTreeNodeIds(content));
    expect(cfg.allocated.length).toBeGreaterThan(0);
  });

  it('still honors an explicit override (e.g. an empty tree)', () => {
    const content = loadContent();
    const cfg = cfgFor({ allocated: [] }, 1, content);
    expect(cfg.allocated).toEqual([]);
  });
});

describe('fb038: status.ts crash behaviour on a broken /data file (q47 PIN_COVERAGE)', () => {
  // Same shape q37 already documented for tools/sweep.ts, and unsurprising:
  // status.ts imports tools/sweep.ts's `runOne` at the top of the module
  // (static import, not the dynamic `await import(...)` pattern q38 gave
  // content-census.ts), and sweep.ts's own `import { Run } from
  // '../src/sim/run'` chain reaches src/sim/content.ts's static
  // `import towersRaw from '../../data/towers.json'` — a JSON *syntax* error
  // there fails at esbuild transform time, before status.ts's own main()
  // ever gets a chance to run its try/catch. Not fixed here: BACKLOG b045
  // already tracks this exact gap for sweep.ts/handoff-metrics.ts/
  // p10k-sweep.ts, and status.ts inherits it through the same import, not a
  // new defect of its own — this test documents the behaviour so q47's
  // census can point at it (PIN_COVERAGE) instead of flagging it as an
  // unpinned gap.
  const SCRATCH_ROOT = path.join(REPO_ROOT, 'bench', '.tmp', 'fb038-status-crash-scratch');
  const COPY_DIRS = ['src', 'tools', 'data', 'feedback'];
  const COPY_FILES = ['tsconfig.json', 'SPEC-FINAL.md', 'HANDOFF.md', 'BACKLOG.md', 'QUESTIONS.md'];
  const NESTED_TSX_TIMEOUT_MS = 60_000;
  const RM_RETRY = { recursive: true, force: true, maxRetries: 5, retryDelay: 200 } as const;

  function scratchPath(name: string): string {
    return path.join(SCRATCH_ROOT, `${name}-${process.pid}-${Math.random().toString(36).slice(2)}`);
  }

  function populateScratch(dir: string): void {
    rmSync(dir, RM_RETRY);
    mkdirSync(dir, { recursive: true });
    for (const d of COPY_DIRS) cpSync(path.join(REPO_ROOT, d), path.join(dir, d), { recursive: true });
    for (const f of COPY_FILES) cpSync(path.join(REPO_ROOT, f), path.join(dir, f));
  }

  function runCli(dir: string): { exitCode: number; stdout: string; stderr: string } {
    try {
      const out = execFileSync('npx', ['tsx', 'tools/status.ts'], {
        cwd: dir,
        shell: true,
        stdio: 'pipe',
        timeout: NESTED_TSX_TIMEOUT_MS,
        env: { ...process.env },
      });
      return { exitCode: 0, stdout: out.toString(), stderr: '' };
    } catch (err) {
      const e = err as { status?: number | null; stdout?: Buffer | string; stderr?: Buffer | string };
      return {
        exitCode: typeof e.status === 'number' ? e.status : 1,
        stdout: e.stdout?.toString() ?? '',
        stderr: e.stderr?.toString() ?? '',
      };
    }
  }

  it('a JSON-syntax-broken data/towers.json crashes it non-zero (raw, unfixed — same as sweep.ts)', () => {
    const dir = scratchPath('syntax');
    try {
      populateScratch(dir);
      writeFileSync(path.join(dir, 'data', 'towers.json'), '{ not valid json');
      const { exitCode, stderr } = runCli(dir);
      expect(exitCode).not.toBe(0);
      // Documents the current (unfixed) shape: a raw esbuild TransformError,
      // not status.ts's own clean one-line `status: <message>` handler.
      expect(stderr).toContain('TransformError');
    } finally {
      rmSync(dir, RM_RETRY);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);
});
