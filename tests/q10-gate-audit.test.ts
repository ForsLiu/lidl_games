/**
 * q10 — gate-coverage audit (BACKLOG-QUALITY.md).
 *
 * `tools/gate-audit.ts` parses SPEC-FINAL §14's gate table directly out of
 * SPEC-FINAL.md and maps every G-id to the test files curated as its
 * coverage, or to a recorded, named reason it has none yet. The property
 * this test protects is narrow and load-bearing: **no gate may be
 * `UNTRACKED`** — silently uncovered and unacknowledged at once. A gate
 * SPEC-FINAL adds tomorrow shows up here as a new row on the next run,
 * because the parse walks the live document rather than a copied list.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  auditGates,
  entirelyRetiredCoverage,
  GATE_COVERAGE,
  hasLiveTopLevelDescribe,
  KNOWN_HOLES,
  missingCoverageFiles,
  parseGates,
  REPO_ROOT,
  SPEC_PATH,
  type Gate,
} from '../tools/gate-audit';

const SPEC_TEXT = readFileSync(SPEC_PATH, 'utf8');

describe('q10 — gate-coverage audit', () => {
  it('SPEC-FINAL.md exists where the tool expects it', () => {
    expect(existsSync(SPEC_PATH)).toBe(true);
    expect(resolve(REPO_ROOT, 'SPEC-FINAL.md')).toBe(SPEC_PATH);
  });

  it('parses at least the twenty gates §14 names today, G1 through G20', () => {
    // Deliberately not an exact-length pin: SPEC-FINAL adding a G21 should
    // surface below as a new row (covered, hole, or UNTRACKED), not fail a
    // count assertion here before it gets the chance to.
    const gates = parseGates(SPEC_TEXT);
    const ids = gates.map((g) => g.id);
    expect(ids.length).toBeGreaterThanOrEqual(20);
    expect(new Set(ids).size).toBe(ids.length); // no gate id parsed twice
    for (let i = 1; i <= 20; i++) expect(ids).toContain(`G${i}`);
  });

  it('has no gate id listed in both GATE_COVERAGE and KNOWN_HOLES', () => {
    const overlap = Object.keys(GATE_COVERAGE).filter((id) => id in KNOWN_HOLES);
    expect(overlap).toEqual([]);
  });

  it('every file GATE_COVERAGE names for a gate exists on disk', () => {
    expect(missingCoverageFiles()).toEqual([]);
  });

  it('every parsed gate is covered or a recorded, named hole — never UNTRACKED', () => {
    const gates = parseGates(SPEC_TEXT);
    const rows = auditGates(gates);
    const untracked = rows.filter((r) => r.status === 'UNTRACKED');
    expect(untracked.map((r) => `${r.id}: ${r.text}`)).toEqual([]);
  });

  it('the recorded split is exactly eight covered and twelve holes at HEAD', () => {
    // Pinned like q9's RECORDED_FLOOR: a gate moving from hole to covered (or
    // the other way) is real news about the P-phase it names — worth a look,
    // not a silent pass. If this drifts, re-derive it against the live suite
    // rather than just widening the pin. (Was ten/ten at first cut; QA found
    // G1 and G19 were `covered` by files that are entirely describe.skip'd —
    // zero live assertions — and they moved to KNOWN_HOLES below.)
    const gates = parseGates(SPEC_TEXT);
    const rows = auditGates(gates).filter((r) => /^G([1-9]|1[0-9]|20)$/.test(r.id));
    const covered = rows.filter((r) => r.status === 'covered').map((r) => r.id).sort();
    const holes = rows.filter((r) => r.status === 'hole').map((r) => r.id).sort();
    expect(covered).toEqual(['G13', 'G14', 'G16', 'G18', 'G2', 'G20', 'G4', 'G5'].sort());
    expect(holes).toEqual(['G1', 'G10', 'G11', 'G12', 'G15', 'G17', 'G19', 'G3', 'G6', 'G7', 'G8', 'G9'].sort());
  });

  it('no `covered` gate is backed only by files that are entirely describe.skip\'d', () => {
    // The actual bug QA found: a gate can be listed as `covered` while its
    // only cited files carry zero live assertions (a fully retired file, its
    // own header saying so). That is UNTRACKED wearing a `covered` label, so
    // it needs to fail loudly rather than needing a human QA pass to catch
    // it a second time.
    expect(entirelyRetiredCoverage()).toEqual([]);
  });

  it('the checker actually flags a gate that is neither covered nor a recorded hole', () => {
    // Anti-vacuity, q9's pattern: a hand-built fixture, not the real
    // SPEC-FINAL table, proves `auditGates` can produce UNTRACKED rather than
    // trusting the live census to ever exercise that branch.
    const fake: Gate[] = [
      { id: 'G1', text: 'has coverage' },
      { id: 'G2', text: 'has a recorded hole' },
      { id: 'G999', text: 'nobody has looked at this one' },
    ];
    const rows = auditGates(fake, { G1: { files: ['tests/a11-determinism.test.ts'] } }, { G2: 'not built yet' });
    expect(rows.find((r) => r.id === 'G1')?.status).toBe('covered');
    expect(rows.find((r) => r.id === 'G2')?.status).toBe('hole');
    expect(rows.find((r) => r.id === 'G999')?.status).toBe('UNTRACKED');
  });

  it('missingCoverageFiles actually fails on a stale path', () => {
    // Same anti-vacuity shape, aimed at the file-existence half of the audit.
    const stale = missingCoverageFiles({ G1: { files: ['tests/does-not-exist-q10.test.ts'] } });
    expect(stale).toEqual(['G1: tests/does-not-exist-q10.test.ts']);
  });

  it('hasLiveTopLevelDescribe tells a live file from an entirely retired one', () => {
    // tests/a1-run-length.test.ts is confirmed entirely describe.skip'd
    // (its own header says RETIRED); tests/a11-determinism.test.ts is live.
    // Both are hand-picked known quantities, not the fixture under test.
    expect(hasLiveTopLevelDescribe(resolve(REPO_ROOT, 'tests/a1-run-length.test.ts'))).toBe(false);
    expect(hasLiveTopLevelDescribe(resolve(REPO_ROOT, 'tests/a11-determinism.test.ts'))).toBe(true);
  });

  it('entirelyRetiredCoverage actually flags a covered gate backed only by a retired file', () => {
    // Anti-vacuity, same shape as the others: a hand-built coverage map,
    // not GATE_COVERAGE, proves the check fires rather than trusting the
    // real map to ever exercise the failing branch again.
    const fakeCoverage = {
      G1: { files: ['tests/a1-run-length.test.ts'] }, // entirely retired — should flag
      G2: { files: ['tests/a1-run-length.test.ts', 'tests/a11-determinism.test.ts'] }, // one live — should not
    };
    expect(entirelyRetiredCoverage(fakeCoverage)).toEqual([
      'G1: none of [tests/a1-run-length.test.ts] has a live top-level describe block',
    ]);
  });

  it('parseGates throws a clear error if SPEC-FINAL loses its "## 14." heading', () => {
    expect(() => parseGates('no §14 heading anywhere in this document')).toThrow(/§14/);
  });

  it('parseGates reads to end-of-document if "## 15." is missing, rather than silently finding nothing', () => {
    // Not a heading it requires — losing the *closing* marker should still
    // parse whatever gate rows are present, not throw and not go quiet.
    const gates = parseGates('## 14. Acceptance gates\n\n| # | Gate |\n|---|---|\n| G1 | only one gate, no §15 |\n');
    expect(gates).toEqual([{ id: 'G1', text: 'only one gate, no §15' }]);
  });

  it('parseGates ignores the header/divider rows and non-gate table rows', () => {
    const gates = parseGates(SPEC_TEXT);
    expect(gates.every((g) => /^G\d+$/.test(g.id))).toBe(true);
    expect(gates.every((g) => g.text.length > 0)).toBe(true);
  });
});
