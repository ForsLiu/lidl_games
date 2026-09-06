/**
 * fb140 — the CI workflow, checked as a file rather than trusted as prose
 * (owner feedback `feature-ci-workflow`).
 *
 * `act` is not available in this environment, so this is a **structural
 * check**, not a parse: no YAML parser is resolvable in this tree, and calling
 * it one would let a green run be misread as "GitHub will accept this file"
 * (code review). What it pins is the set of decisions a future edit could undo
 * silently: which tier runs on which trigger, the two budgets, the two lines
 * the nightly's push depends on, that every command is one `package.json`
 * defines, and that the browser-skip escape hatch is closed in CI (a UI suite
 * that skips itself on a runner is coverage loss, not a pass — QUESTIONS Q178).
 *
 * Every assertion below was checked by mutation: the first version of this file
 * passed unchanged when the push trigger was narrowed to `master`, the timeouts
 * were cut to 3 minutes, and the nightly's `permissions`/`ref` lines were
 * deleted. Those are the edits that break CI silently, so those are the ones
 * that are pinned now.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from '../tools/gate-audit';

const WORKFLOW = join(REPO_ROOT, '.github', 'workflows', 'ci.yml');
const text = readFileSync(WORKFLOW, 'utf8');
const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

/** The block of one top-level job, so a `fast` assertion cannot pass on `nightly`'s text. */
function job(name: string): string {
  const start = text.indexOf(`\n  ${name}:\n`);
  expect(start, `no job "${name}"`).toBeGreaterThan(-1);
  const rest = text.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}\w[\w-]*:\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

describe('fb140 — the CI workflow', () => {
  it('parses as the two-job shape the item specifies', () => {
    expect(text).toMatch(/^name: CI$/m);
    expect(text).toMatch(/^jobs:$/m);
    expect(text).toMatch(/^ {2}fast:$/m);
    expect(text).toMatch(/^ {2}nightly:$/m);
    // Indentation is the whole of YAML's structure: a tab would parse as an
    // error on GitHub and as nothing here.
    expect(text.includes('\t'), 'the workflow contains a tab').toBe(false);
  });

  it('runs the fast tier on every push and pull request, all branches', () => {
    // Scoped to each trigger's own block: a greedy `on:[\s\S]*push:` regex is
    // satisfied by the *other* trigger's branch line, so narrowing `push` to
    // `[master]` used to pass (code review).
    const trigger = (name: string): string => {
      const start = text.indexOf(`\n  ${name}:\n`);
      expect(start, `no trigger "${name}"`).toBeGreaterThan(-1);
      const rest = text.slice(start + 1);
      const next = rest.slice(1).search(/\n {2}\w[\w-]*:/);
      return next === -1 ? rest : rest.slice(0, next + 1);
    };
    expect(trigger('push')).toContain("branches: ['**']");
    expect(trigger('pull_request')).toContain("branches: ['**']");
    const fast = job('fast');
    expect(fast).toContain('npm run test:fast');
    expect(fast).toContain('npm run build');
    // The 40-minute suite must not ride on a push.
    expect(fast).not.toMatch(/run: npm test\b/);
  });

  it('runs the full suite and STATUS on a nightly schedule only', () => {
    expect(text).toMatch(/schedule:\s*\n\s*#[^\n]*\n\s*- cron: '0 3 \* \* \*'/);
    const nightly = job('nightly');
    expect(nightly).toMatch(/run: npm test\b/);
    expect(nightly).toContain('npm run status');
    expect(nightly).toContain("if: github.event_name == 'schedule'");
    // ...and commits STATUS.md only when it moved.
    expect(nightly).toContain('git diff --quiet -- STATUS.md');
  });

  it('every npm script it invokes exists in package.json', () => {
    const invoked = [...text.matchAll(/npm run ([a-z:]+)/g)].map((m) => m[1]);
    expect(invoked.length, 'the workflow invokes no npm scripts').toBeGreaterThan(2);
    for (const s of new Set(invoked)) {
      expect(pkg.scripts[s], `the workflow runs "npm run ${s}", which package.json does not define`).toBeTypeOf(
        'string',
      );
    }
  });

  it('closes the browser-skip escape hatch, so a UI suite cannot pass by skipping', () => {
    expect(text).toMatch(/STONEWAKE_REQUIRE_BROWSER: '1'/);
    expect(text).toContain('playwright install --with-deps chromium');
  });

  it('bounds both jobs at the budgets the item names, and cancels superseded runs', () => {
    // The literal numbers: a timeout cut to 3 minutes is a job that never
    // finishes the tier, and reads as "bounded" to a regex that only checks the
    // key exists.
    expect(job('fast')).toContain('timeout-minutes: 30');
    expect(job('nightly')).toContain('timeout-minutes: 180');
    expect(text).toMatch(/concurrency:[\s\S]*cancel-in-progress: \$\{\{ github\.event_name != 'schedule' \}\}/);
  });

  it('keeps the token read-only except where the nightly has to write', () => {
    // Two lines the nightly's push depends on, and whose silent loss turns it
    // into an opaque 403 (code review).
    expect(text).toMatch(/^permissions:\n {2}contents: read$/m);
    expect(job('nightly')).toContain('contents: write');
    expect(job('nightly')).toContain("'master' || github.ref");
  });

  it('publishes STATUS.md only from a run that passed', () => {
    // `always()` would commit a snapshot measured on a red — or cancelled —
    // tree, onto the file that is this repo's canonical measured report.
    const nightly = job('nightly');
    expect(nightly).not.toContain('if: always()');
    // Steps whose *name* is about STATUS.md — not merely any step whose body
    // mentions it (the full-suite step's comment does).
    const statusSteps = nightly.split('- name: ').filter((b) => /^[^\n]*STATUS\.md/.test(b));
    expect(statusSteps.length, 'no STATUS.md steps found').toBeGreaterThan(1);
    for (const step of statusSteps) expect(step).toContain('if: success()');
    // ...and survives master moving under a three-hour job.
    expect(nightly).toContain('git push origin HEAD:master');
    expect(nightly).toContain('git rebase origin/master');
  });

  it('caps the fast tier\'s workers, because CI forces the load-sensitive suites to run', () => {
    expect(job('fast')).toMatch(/--poolOptions\.threads\.maxThreads=\d+/);
  });

  it('is documented, and the doc points at the workflow it documents', () => {
    const doc = readFileSync(join(REPO_ROOT, 'docs', 'CI.md'), 'utf8');
    expect(doc).toContain('.github/workflows/ci.yml');
    expect(doc).toContain('test:fast');
    expect(doc).toContain('badge.svg');
  });
});
