/**
 * fb038's real CLI end-to-end run, split out of tests/fb038-status.test.ts
 * (fb048, QUESTIONS Q156): `tools/status.ts`'s balance snapshot now defaults
 * `cfgFor`'s `allocated` to the full Constellation tree (the real Hub-started
 * shape, `src/meta/meta.ts`'s `TREE_AUTO_MAX`) instead of `[]`, which fb039
 * measured at ~180x the per-run wall-clock cost (~90ms -> ~16,500ms) because
 * runs actually play out instead of dying at wave 2-3. Even cut to
 * `BALANCE_SEEDS = [1, 2]` (`tools/status.ts`), the 44-cell snapshot (10
 * policies + 12 classes x2 tiers + 5 Cores x2 tiers) measured ~856s-1194s
 * (~14-20 min) across independent live runs on this host — past both this
 * suite's ~60s fast-tier ceiling (vitest.fast.config.ts) and the old 120s CLI
 * timeout the rest of fb038-status.test.ts's fast unit tests never needed.
 * Split into its own file so only this one real-sim test moves to the
 * full-suite-only tier; the parsing/rendering unit tests in
 * fb038-status.test.ts stay fast and unaffected. Timeout below is set to
 * 1800s (30 min), well past the ~20 min worst case measured so far, to
 * absorb host-load variance rather than flake at the margin.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { STATUS_PATH } from '../tools/status';
import { REPO_ROOT } from '../tools/gate-audit';

describe('fb038: `npm run status` CLI end to end', () => {
  it('writes a real STATUS.md with every top-level section', () => {
    execFileSync('npx', ['tsx', 'tools/status.ts'], {
      cwd: REPO_ROOT,
      shell: true,
      stdio: 'pipe',
      timeout: 1_800_000,
    });
    const out = readFileSync(STATUS_PATH, 'utf8');
    expect(out).toContain('# STATUS.md');
    expect(out).toContain('## Gate table (SPEC-FINAL §14)');
    expect(out).toContain('## Balance snapshot');
    expect(out).toContain('## Content census (SPEC-FINAL §13)');
    expect(out).toContain('## Feedback ledger');
    expect(out).toContain('## Pending QUESTIONS.md entries');
  }, 1_810_000);
});
