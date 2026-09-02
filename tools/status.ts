/**
 * `npm run status` (BACKLOG fb038): writes STATUS.md at the repo root from
 * live data — a gate table (SPEC-FINAL §14's G1-G23, sourced from
 * `tools/gate-audit.ts`'s coverage map plus HANDOFF.md's own hand-measured
 * health line, the freshest "is it actually green" text this repo keeps), a
 * balance snapshot (a real `tools/sweep.ts` run: policy comparison, per-class
 * and per-Core T1/T3 win rates, wielded-type damage share, boon pick rates,
 * mean run length, timeout count), a content census against SPEC-FINAL §13
 * (`tools/content-census.ts`), a feedback ledger (every `feedback/processed/`
 * file matched to the BACKLOG item that closed it) and the still-pending
 * QUESTIONS.md entries (any `- **Qn.` block with no `(owner verdict:` yet).
 *
 * Gate health is read from HANDOFF.md rather than re-measured here on
 * purpose: several of the gates' own test files are 20+ minutes each
 * (`p6e-class-diversity.test.ts` alone is ~1h — see vitest.fast.config.ts's
 * exclude list) and re-running them on every `npm run status` invocation
 * would make the "every 20 iterations" cadence the item asks for impossible.
 * HANDOFF.md's own regeneration rule (CLAUDE.md §1.4) already keeps that text
 * fresh at every phase boundary; this tool trusts it the same way a human
 * skimming both files would, and falls back to gate-audit's bare
 * covered/hole/UNTRACKED status when a gate has no HANDOFF row yet.
 *
 * The balance snapshot *is* measured fresh every run, via `tools/sweep.ts`'s
 * own `runOne` (real sim, no shortcuts). `cfgFor` defaults `allocated` to the
 * full Constellation tree (fb048, QUESTIONS Q156 — see the comment above
 * `cfgFor` for the seed-count tradeoff this forced).
 *
 *   npx tsx tools/status.ts
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { REPO_ROOT, SPEC_PATH, parseGates, auditGates, type GateAuditRow } from './gate-audit';
import { census, type CensusRow } from './content-census';
import { resolveAllocated, resolveModifiers, runOne } from './sweep';
import type { Content } from '../src/sim/content';
import type { RunConfig, RunReport } from '../src/sim/types';
import { policyNames } from '../src/bots/policy';
import '../src/bots';

export const HANDOFF_PATH = resolve(REPO_ROOT, 'HANDOFF.md');
export const QUESTIONS_PATH = resolve(REPO_ROOT, 'QUESTIONS.md');
export const BACKLOG_PATH = resolve(REPO_ROOT, 'BACKLOG.md');
export const FEEDBACK_PROCESSED_DIR = resolve(REPO_ROOT, 'feedback', 'processed');
export const STATUS_PATH = resolve(REPO_ROOT, 'STATUS.md');

const MAX_TICKS = 60 * 60 * 45; // 45 sim-minutes, same cap tools/handoff-metrics.ts uses.

// fb048 (QUESTIONS Q156): a full-tree run costs ~16.5s wall-clock (measured
// live via `tools/sweep.ts --seeds 3 --policies hybrid`), ~180x the ~90ms an
// empty-tree run cost — 5 seeds/cell across this snapshot's 44 cells (10
// policies + 12 classes x2 tiers + 5 Cores x2 tiers) at the old default would
// run ~60 minutes, blowing both this tool's own budget and
// tests/fb038-status-cli.test.ts's CLI timeout. Cut from 5 to 2 seeds/cell
// (not 1: code review of this item's first pass correctly flagged that a
// single seed makes every cell's "win rate" a pure 0-or-1 coin flip, and
// folds a 45-min timeout in identically to a real loss with no way to tell
// the two apart — CLAUDE.md's own measurement rules single out exactly this
// kind of single-sample non-evidence. 2 still isn't gate-grade evidence, but
// it at least distinguishes "won", "lost", "split" and stops silently
// reporting a coin flip as a rate). Measured live, real end-to-end
// `npx tsx tools/status.ts` runs at 2 seeds/cell: ~856s-1194s (~14-20 min)
// across three independent runs on this host, not the ~504s (8.4 min) an
// earlier 1-seed measurement suggested — timeout-cell runs (45-min cap) cost
// far more wall-clock than a typical ~35-38 min win, and 2 seeds/cell means
// more of the 44 cells land on the cap than at 1 seed. See PROGRESS.md's
// fb048 entry.
export const BALANCE_SEEDS = [1, 2];

/* ------------------------------------------------------------- gate table */

export type Health = 'GREEN' | 'RED' | 'PARTIAL' | 'UNKNOWN';

/** `| G8 (...) | **Red, measured...** |` rows out of HANDOFF §4's own gate table. */
export function parseHandoffGateTable(text: string): Map<string, string> {
  const map = new Map<string, string>();
  const rowRe = /^\|\s*(G\d+)\s*\([^)]*\)\s*\|\s*(.+?)\s*\|\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(text))) map.set(m[1], m[2].trim());
  return map;
}

export function classifyHealth(cell: string | undefined): Health {
  if (!cell) return 'UNKNOWN';
  const lead = /^\*\*(Green|Red|Partial)\b/i.exec(cell)?.[1]?.toLowerCase();
  if (lead === 'green') return 'GREEN';
  if (lead === 'red') return 'RED';
  if (lead === 'partial') return 'PARTIAL';
  return 'UNKNOWN';
}

export interface GateRow {
  id: string;
  spec: string;
  health: Health;
  detail: string;
  files: string[];
}

export function buildGateTable(): GateRow[] {
  const specText = readFileSync(SPEC_PATH, 'utf8');
  const gates = parseGates(specText);
  const rows: GateAuditRow[] = auditGates(gates);
  let handoffRows = new Map<string, string>();
  try {
    handoffRows = parseHandoffGateTable(readFileSync(HANDOFF_PATH, 'utf8'));
  } catch {
    // HANDOFF.md missing/unreadable — every gate falls back to gate-audit's own status below.
  }
  return rows.map((r) => {
    const handoffCell = handoffRows.get(r.id);
    if (handoffCell) return { id: r.id, spec: r.text, health: classifyHealth(handoffCell), detail: handoffCell, files: r.files };
    if (r.status === 'covered') return { id: r.id, spec: r.text, health: 'UNKNOWN', detail: r.note ?? r.files.join(', '), files: r.files };
    if (r.status === 'hole') return { id: r.id, spec: r.text, health: 'RED', detail: r.note ?? 'no test yet', files: [] };
    return { id: r.id, spec: r.text, health: 'RED', detail: 'UNTRACKED — no test, no recorded hole', files: [] };
  });
}

/* --------------------------------------------------------- balance sweep */

// fb047: a `tier` override with no explicit `modifiers` must draft real ones
// (the same line `tools/sweep.ts`'s `resolveModifiers` draws) — otherwise a
// T3 comparison here is mechanically identical to T1, the exact bug p10p
// flagged for `sweep.ts`'s own `--tier` flag, reproduced independently in
// this tool's per-class/per-Core snapshot.
//
// fb048 (QUESTIONS Q156): `allocated` now defaults to the full Constellation
// tree via the same `resolveAllocated` fb039 gave `tools/sim.ts`/
// `tools/sweep.ts`/`tools/handoff-metrics.ts` (`src/meta/meta.ts`'s
// `TREE_AUTO_MAX`, what every real Hub-started run feeds in) instead of the
// stale `allocated: []` this tool alone kept — fb039 measured that flip alone
// costs ~180x per run here (~90ms -> ~16,500ms) because runs actually play
// out instead of dying at wave 2-3, which is why fb039 deliberately left this
// file out of its own scope pending this item's seed-count redesign (see
// `BALANCE_SEEDS` above). No cell here takes an explicit `allocated`
// override today, so every cell now measures against the real full-tree
// shape a player actually plays with.
export function cfgFor(overrides: Partial<RunConfig>, seed: number, content: Content): RunConfig {
  const allocated = resolveAllocated(content, overrides.allocated ?? null);
  const base: RunConfig = { seed, classKey: 'engineer', tier: 1, modifiers: [], ...overrides, allocated };
  base.modifiers = resolveModifiers(content, seed, base.tier, base.modifiers);
  return base;
}

function reportsFor(overrides: Partial<RunConfig>, policy: string, seeds: number[], content: Content): RunReport[] {
  return seeds.map((seed) => runOne(cfgFor(overrides, seed, content), policy, MAX_TICKS));
}

function winRate(reports: RunReport[]): number {
  return reports.filter((r) => r.outcome === 'victory').length / reports.length;
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function round(v: number, dp = 3): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

export interface BalanceSnapshot {
  policyComparison: { policy: string; winRate: number; meanMinutes: number }[];
  perClass: { classKey: string; t1: number; t3: number }[];
  perCore: { coreKey: string; t1: number; t3: number }[];
  damageShare: { key: string; share: number }[];
  boonPicks: { key: string; totalRanks: number }[];
  meanRunMinutes: number;
  timeoutCount: number;
  totalRuns: number;
}

async function measureBalance(): Promise<BalanceSnapshot> {
  const { loadContent } = await import('../src/sim/content');
  const content: Content = loadContent();
  const pool: RunReport[] = [];

  const policyComparison = policyNames()
    .filter((p) => p !== 'idle')
    .map((policy) => {
      const reports = reportsFor({ tier: 1 }, policy, BALANCE_SEEDS, content);
      pool.push(...reports);
      return { policy, winRate: round(winRate(reports)), meanMinutes: round(mean(reports.map((r) => r.totalSeconds / 60)), 1) };
    });

  const perClass = content.classes.classes.map((c) => {
    const t1 = reportsFor({ classKey: c.key, tier: 1 }, 'hybrid', BALANCE_SEEDS, content);
    const t3 = reportsFor({ classKey: c.key, tier: 3 }, 'hybrid', BALANCE_SEEDS, content);
    pool.push(...t1, ...t3);
    return { classKey: c.key, t1: round(winRate(t1)), t3: round(winRate(t3)) };
  });

  const perCore = content.cores.cores.map((c) => {
    const t1 = reportsFor({ core: c.key, tier: 1 }, 'hybrid', BALANCE_SEEDS, content);
    const t3 = reportsFor({ core: c.key, tier: 3 }, 'hybrid', BALANCE_SEEDS, content);
    pool.push(...t1, ...t3);
    return { coreKey: c.key, t1: round(winRate(t1)), t3: round(winRate(t3)) };
  });

  const damage = new Map<string, number>();
  const boonRanks = new Map<string, number>();
  for (const r of pool) {
    for (const [k, v] of Object.entries(r.damageByWeapon)) damage.set(k, (damage.get(k) ?? 0) + v);
    for (const [k, v] of Object.entries(r.boons)) boonRanks.set(k, (boonRanks.get(k) ?? 0) + v);
  }
  const damageTotal = [...damage.values()].reduce((a, b) => a + b, 0);
  const damageShare = [...damage.entries()]
    .map(([key, v]) => ({ key, share: damageTotal > 0 ? round(v / damageTotal, 4) : 0 }))
    .sort((a, b) => b.share - a.share);
  const boonPicks = [...boonRanks.entries()]
    .map(([key, totalRanks]) => ({ key, totalRanks }))
    .sort((a, b) => b.totalRanks - a.totalRanks);

  return {
    policyComparison,
    perClass,
    perCore,
    damageShare,
    boonPicks,
    meanRunMinutes: round(mean(pool.map((r) => r.totalSeconds / 60)), 2),
    timeoutCount: pool.filter((r) => r.outcome === 'running').length,
    totalRuns: pool.length,
  };
}

/* --------------------------------------------------------------- ledger */

export interface FeedbackLedgerRow {
  file: string;
  status: string;
}

export function feedbackLedger(
  processedDir: string = FEEDBACK_PROCESSED_DIR,
  backlogPath: string = BACKLOG_PATH,
): FeedbackLedgerRow[] {
  let files: string[] = [];
  try {
    files = readdirSync(processedDir).filter((f) => f.endsWith('.md')).sort();
  } catch {
    return [];
  }
  const backlogLines = readFileSync(backlogPath, 'utf8').split('\n');

  function bulletFor(lineIdx: number): { id: string; done: boolean } | null {
    for (let i = lineIdx; i >= 0; i--) {
      const m = /^- \[([ xX])\] \((\S+?)\)/.exec(backlogLines[i]);
      if (m) return { done: m[1].toLowerCase() === 'x', id: m[2] };
    }
    return null;
  }

  return files.map((file) => {
    const slug = file.replace(/^\d{8}-\d{6}-/, '').replace(/\.md$/, '');
    if (slug.startsWith('verdicts-')) {
      return { file, status: 'QUESTIONS verdict batch — applied to QUESTIONS.md, archived' };
    }
    // Section headers can cite the same slug the bullet below them cites
    // (e.g. "### Owner verdict batch (... + `feature-status-report`)"),
    // which would make `bulletFor` walk back into the *previous* section's
    // last bullet instead of the item that actually names this file —
    // headers are excluded so only a real bullet's own citation counts.
    const hitLine = backlogLines.findIndex((l) => l.includes('`' + slug + '`') && !l.trim().startsWith('#'));
    if (hitLine === -1) return { file, status: 'no BACKLOG citation found' };
    const bullet = bulletFor(hitLine);
    if (!bullet) return { file, status: 'cited, but no enclosing BACKLOG item found' };
    return { file, status: `${bullet.id} — ${bullet.done ? 'done' : 'queued'}` };
  });
}

/* ---------------------------------------------------------- pending Q's */

export interface PendingQuestion {
  id: string;
  snippet: string;
}

export function pendingQuestions(questionsPath: string = QUESTIONS_PATH): PendingQuestion[] {
  const text = readFileSync(questionsPath, 'utf8');
  const blocks = text.split(/\n(?=- \*\*Q\d+\.)/);
  const pending: PendingQuestion[] = [];
  for (const b of blocks) {
    const m = /^- \*\*Q(\d+)\.\s*([\s\S]+?)\*\*/.exec(b);
    if (!m) continue;
    // qa-playtester (fb038): checking the whole block let a `(owner verdict:`
    // appearing as literal prose *inside* the bold title itself (discussing
    // the marker, not applying it) falsely mark a genuinely-open question as
    // resolved. Only text after the bold title's own closing `**` can be a
    // real verdict annotation.
    if (b.slice(m[0].length).includes('(owner verdict:')) continue;
    const snippet = m[2].replace(/\s+/g, ' ').trim();
    pending.push({ id: `Q${m[1]}`, snippet: snippet.length > 220 ? snippet.slice(0, 220) + '…' : snippet });
  }
  return pending;
}

/**
 * A currently-GREEN, win-rate/liveness-shaped gate (matched off the gate's
 * own SPEC-FINAL §14 text, not a hand-copied id list — the same "derive from
 * the live document" convention `parseGates` already follows) whose claim is
 * directly contradicted by *this run's own* freshly-measured balance
 * snapshot showing zero wins anywhere. Found by code review: `buildGateTable`
 * trusts HANDOFF.md's hand-written health verbatim (by design — the gate
 * tests are 20+ minutes each), which goes stale the moment a balance change
 * lands without a HANDOFF regeneration (fb025's enemy-HP/attack-speed pass
 * did exactly this) — without this check, STATUS.md's own "20 green" summary
 * would flatly contradict its own "0% win rate everywhere" balance section
 * a few paragraphs later, with nothing pointing that out.
 */
const WIN_RATE_GATE_TEXT = /win rate|victorious run|liveness/i;

export function staleGateWarnings(gates: GateRow[], balance: BalanceSnapshot): string[] {
  const zeroWinsMeasured =
    balance.totalRuns > 0 &&
    balance.policyComparison.every((p) => p.winRate === 0) &&
    balance.perClass.every((c) => c.t1 === 0 && c.t3 === 0) &&
    balance.perCore.every((c) => c.t1 === 0 && c.t3 === 0);
  if (!zeroWinsMeasured) return [];
  return gates.filter((g) => g.health === 'GREEN' && WIN_RATE_GATE_TEXT.test(g.spec)).map((g) => g.id);
}

/* --------------------------------------------------------------- render */

export function renderStatus(
  gates: GateRow[],
  balance: BalanceSnapshot,
  censusRows: CensusRow[],
  ledger: FeedbackLedgerRow[],
  pending: PendingQuestion[],
): string {
  const lines: string[] = [];
  lines.push('# STATUS.md — generated by `npm run status` (BACKLOG fb038)');
  lines.push('');
  lines.push(
    'Regenerate before relying on this file — it is a snapshot, not a live view. ' +
      'Gate health is HANDOFF.md\'s own measured text; the balance numbers below are ' +
      'measured fresh on every run via `tools/sweep.ts`.',
  );
  lines.push('');

  const stale = staleGateWarnings(gates, balance);
  if (stale.length > 0) {
    lines.push('## ⚠ Staleness warning');
    lines.push('');
    lines.push(
      `This run's fresh balance snapshot measured **zero wins** across every policy/class/Core cell ` +
        `(see Balance snapshot below), which directly contradicts HANDOFF.md's currently-GREEN health for: ` +
        `${stale.join(', ')}. HANDOFF.md was likely last regenerated before a balance change landed that has not ` +
        `been re-measured against these gates. Treat their GREEN status in the table below as stale until ` +
        `HANDOFF.md is regenerated and these gates are re-run for real.`,
    );
    lines.push('');
  }

  lines.push('## Gate table (SPEC-FINAL §14)');
  lines.push('');
  const counts = { GREEN: 0, RED: 0, PARTIAL: 0, UNKNOWN: 0 } as Record<Health, number>;
  for (const g of gates) counts[g.health]++;
  lines.push(
    `${counts.GREEN} green, ${counts.RED} red, ${counts.PARTIAL} partial, ${counts.UNKNOWN} unknown, of ${gates.length} gates parsed live from SPEC-FINAL.md.`,
  );
  lines.push('');
  lines.push('| Gate | Health | Detail |');
  lines.push('|---|---|---|');
  for (const g of gates) {
    const detail = g.detail.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
    const health = stale.includes(g.id) ? `${g.health} ⚠ STALE` : g.health;
    lines.push(`| ${g.id}: ${g.spec.replace(/\|/g, '\\|')} | ${health} | ${detail} |`);
  }
  lines.push('');

  lines.push('## Balance snapshot');
  lines.push('');
  lines.push(
    `Measured this run: ${balance.totalRuns} sim runs (${BALANCE_SEEDS.length} seed${BALANCE_SEEDS.length === 1 ? '' : 's'}/cell), \`hybrid\` bot for ` +
      `per-class/per-Core cells. Mean run length ${balance.meanRunMinutes} min; ${balance.timeoutCount} of ` +
      `${balance.totalRuns} runs hit the 45-min cap without resolving (timeouts).`,
  );
  lines.push('');
  lines.push('### Policy comparison (T1, engineer, default core)');
  lines.push('');
  lines.push('| Policy | Win rate | Mean minutes |');
  lines.push('|---|---|---|');
  for (const p of balance.policyComparison) lines.push(`| ${p.policy} | ${p.winRate} | ${p.meanMinutes} |`);
  lines.push('');
  lines.push('### Per-class win rate (`hybrid` bot, default core)');
  lines.push('');
  lines.push('| Class | T1 | T3 |');
  lines.push('|---|---|---|');
  for (const c of balance.perClass) lines.push(`| ${c.classKey} | ${c.t1} | ${c.t3} |`);
  lines.push('');
  lines.push('### Per-Core win rate (`hybrid` bot, engineer)');
  lines.push('');
  lines.push('| Core | T1 | T3 |');
  lines.push('|---|---|---|');
  for (const c of balance.perCore) lines.push(`| ${c.coreKey} | ${c.t1} | ${c.t3} |`);
  lines.push('');
  lines.push('### Wielded-type damage share (whole pool, `damageByWeapon`)');
  lines.push('');
  lines.push('| Source | Share |');
  lines.push('|---|---|');
  for (const d of balance.damageShare.slice(0, 15)) lines.push(`| ${d.key} | ${d.share} |`);
  lines.push('');
  lines.push('### Boon pick rates (total ranks taken, whole pool)');
  lines.push('');
  if (balance.boonPicks.length === 0) {
    lines.push('No run in this pool reached a boon offer (Act II).');
  } else {
    lines.push('| Boon | Total ranks |');
    lines.push('|---|---|');
    for (const b of balance.boonPicks.slice(0, 15)) lines.push(`| ${b.key} | ${b.totalRanks} |`);
  }
  lines.push('');

  lines.push('## Content census (SPEC-FINAL §13)');
  lines.push('');
  lines.push('| Category | Actual | Target | Met |');
  lines.push('|---|---|---|---|');
  for (const r of censusRows) lines.push(`| ${r.label} | ${r.actual} | ${r.target} | ${r.met ? 'yes' : 'no'} |`);
  lines.push('');

  lines.push('## Feedback ledger (`feedback/processed/`)');
  lines.push('');
  lines.push('| File | Status |');
  lines.push('|---|---|');
  for (const f of ledger) lines.push(`| ${f.file} | ${f.status} |`);
  lines.push('');

  lines.push('## Pending QUESTIONS.md entries (no `(owner verdict:` yet)');
  lines.push('');
  if (pending.length === 0) {
    lines.push('None — every logged question already carries an owner verdict.');
  } else {
    for (const p of pending) lines.push(`- **${p.id}.** ${p.snippet}`);
  }
  lines.push('');

  return lines.join('\n');
}

/* ------------------------------------------------------------------- CLI */

async function main(): Promise<void> {
  try {
    const gates = buildGateTable();
    const balance = await measureBalance();
    const { loadContent } = await import('../src/sim/content');
    const censusRows = census(loadContent());
    const ledger = feedbackLedger();
    const pending = pendingQuestions();

    const out = renderStatus(gates, balance, censusRows, ledger, pending);
    writeFileSync(STATUS_PATH, out, 'utf8');
    console.log(`status: wrote ${STATUS_PATH}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`status: ${message.replace(/\s+/g, ' ').trim()}`);
    process.exitCode = 1;
  }
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('tools/status.ts');
if (invokedDirectly) main();
