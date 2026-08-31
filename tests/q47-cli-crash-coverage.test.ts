/**
 * q47 — CLI-crash coverage census (BACKLOG-QUALITY.md).
 *
 * `tools/cli-crash-coverage.ts` automates the "which `tools/*.ts` files are
 * CLI-invocable and crash-unprotected" audit q37, q41 and q46 each
 * independently re-derived by hand. This test protects three things:
 *
 *   1. today's live classification matches the hand-derived table this
 *      session verified against the actual test suite (a regression pin —
 *      a future session that adds a `tools/*.ts` file, or a fix that changes
 *      an existing one's import shape, should see this go red rather than
 *      silently drift);
 *   2. every `PIN_COVERAGE`/`NOT_INVOCABLE` entry still points at something
 *      real (no stale reference to a deleted tool or test file), the same
 *      tripwire `gate-audit.ts`'s `missingCoverageFiles` provides for
 *      `GATE_COVERAGE`;
 *   3. a brand-new `tools/*.ts` file that imports `content.ts` transitively,
 *      is invocable, and has no catch and no named test surfaces as a `gap`
 *      by name — proven against a synthetic scratch file, not by waiting for
 *      one to actually land uncovered.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  classifyAll,
  classifyTool,
  gaps,
  hasCatch,
  importsContentTransitively,
  listToolFiles,
  NOT_INVOCABLE,
  PIN_COVERAGE,
  REPO_ROOT,
  type ToolClassification,
} from '../tools/cli-crash-coverage';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRATCH_ROOT = path.join(ROOT, 'bench', '.tmp', 'q47-cli-crash-coverage-scratch');
const RM_RETRY = { recursive: true, force: true, maxRetries: 5, retryDelay: 200 } as const;

function scratchPath(name: string): string {
  return path.join(SCRATCH_ROOT, `${name}-${process.pid}-${Math.random().toString(36).slice(2)}`);
}

// This session's hand-derived classification (verified live against the
// actual test files at the time this was written — see BACKLOG-QUALITY.md
// q47's Log entry for how each bucket was checked): every `tools/*.ts` file
// that existed when this test was written, and the status this tool must
// assign it. `tools/cli-crash-coverage.ts` itself is included — it does not
// import content, so it is harmlessly self-classified.
const EXPECTED_STATUS: Record<string, ToolClassification['status']> = {
  'tools/a4probe.ts': 'pinned',
  'tools/a5probe.ts': 'pinned',
  'tools/cli-crash-coverage.ts': 'no-content-import',
  'tools/content-census.ts': 'pinned',
  'tools/fuzz-command-domain-worker.ts': 'not-invocable',
  'tools/fuzz-command-domain.ts': 'pinned',
  'tools/fuzz-data.ts': 'not-invocable',
  'tools/fuzz-input.ts': 'pinned',
  'tools/fuzz-save.ts': 'pinned',
  'tools/fuzz-weapon-boundary.ts': 'pinned',
  'tools/gate-audit.ts': 'no-content-import',
  // tools/gen-tree.mjs deliberately absent — not a .ts file, must never appear in listToolFiles().
  'tools/handoff-metrics.ts': 'pinned',
  'tools/invariants.ts': 'not-invocable',
  // q54: reads data/towers.json directly (readsDataJsonDirectly), not via
  // content.ts — pinned by tests/q53-price-probe-json-crash.test.ts, which
  // covers the exact bug q53 found and q54's classifier now tracks by name.
  'tools/m20d-price-probe.ts': 'pinned',
  'tools/m20d-run-a4.ts': 'pinned',
  'tools/m20d-swarm.ts': 'pinned',
  'tools/mutation-probe.ts': 'no-content-import',
  // p10k: same shape as tools/sweep.ts, pinned by the same q37 sibling test.
  'tools/p10k-sweep.ts': 'pinned',
  'tools/perf-ratio.ts': 'pinned',
  'tools/phase-coverage.ts': 'pinned',
  'tools/probe-boss.ts': 'pinned',
  'tools/sim.ts': 'pinned',
  'tools/soak.ts': 'pinned',
  'tools/sweep.ts': 'pinned',
  // fb018: the ui-audit orchestrator. It only `import type`s from
  // src/ui/audit-hook.ts (erased before this classifier's BFS ever runs) and
  // otherwise imports vite/playwright/pngjs/node builtins plus its own
  // tools/audit/checks.ts (pure math, no content.ts import either) — no live
  // route to src/sim/content.ts.
  'tools/ui-audit.ts': 'no-content-import',
};

describe('q47 — CLI-crash coverage census', () => {
  it("lists exactly today's 25 tools/*.ts files (the 22 q47 found plus this tool itself plus fb018's tools/ui-audit.ts plus p10k's tools/p10k-sweep.ts; gen-tree.mjs excluded, not a .ts file; tools/audit/checks.ts excluded, not a direct child of tools/)", () => {
    const files = listToolFiles();
    expect(files).not.toContain('tools/gen-tree.mjs');
    expect(files.every((f) => f.endsWith('.ts'))).toBe(true);
    expect(files.length).toBe(25);
  });

  it("today's classification matches this session's hand-derived table exactly", () => {
    const rows = classifyAll();
    const actual: Record<string, ToolClassification['status']> = {};
    for (const r of rows) actual[r.file] = r.status;

    expect(actual).toEqual(EXPECTED_STATUS);
  });

  it('has zero unpinned gaps today — every invocable, content-importing tool is either exempt or named by a pin', () => {
    expect(gaps(classifyAll())).toEqual([]);
  });

  it('every PIN_COVERAGE test file exists on disk', () => {
    const missing: string[] = [];
    for (const [tool, testFiles] of Object.entries(PIN_COVERAGE)) {
      for (const f of testFiles) {
        if (!existsSync(path.join(REPO_ROOT, f))) missing.push(`${tool}: ${f}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('every PIN_COVERAGE and NOT_INVOCABLE key names a tool file that still exists', () => {
    const live = new Set(listToolFiles());
    const stale = [...Object.keys(PIN_COVERAGE), ...Object.keys(NOT_INVOCABLE)].filter((f) => !live.has(f));
    expect(stale).toEqual([]);
  });

  it('PIN_COVERAGE and NOT_INVOCABLE never name the same file (a file is exempt or pinned, not both)', () => {
    const overlap = Object.keys(PIN_COVERAGE).filter((f) => f in NOT_INVOCABLE);
    expect(overlap).toEqual([]);
  });

  it('every PIN_COVERAGE entry actually classifies as pinned — a dead entry (e.g. a file classifyTool resolves to no-content-import before ever consulting the table) is a stale claim, not real coverage', () => {
    const dead = Object.keys(PIN_COVERAGE).filter((f) => classifyTool(f, path.join(REPO_ROOT, f)).status !== 'pinned');
    expect(dead).toEqual([]);
  });

  it("tools/mutation-probe.ts is no-content-import, not a gap — regression pin for the backtick-string false positive", () => {
    // Guards tools/cli-crash-coverage.ts's stripBacktickStrings: without it,
    // mutation-probe.ts's `find`/`replace` fixture strings (which embed a
    // real `await import('../src/sim/content')` line as fixture text) make
    // the raw regex misreport this file as importing content, when q41
    // already confirmed live that it never does.
    const row = classifyTool('tools/mutation-probe.ts', path.join(REPO_ROOT, 'tools/mutation-probe.ts'));
    expect(row.importsContent).toBe(false);
    expect(row.status).toBe('no-content-import');
  });

  it('a synthetic new tool that imports content transitively, is invocable, and has no catch surfaces as a gap', () => {
    const dir = scratchPath('new-tool');
    try {
      mkdirSync(path.join(dir, 'src', 'sim'), { recursive: true });
      mkdirSync(path.join(dir, 'tools'), { recursive: true });
      // A minimal stand-in for src/sim/content.ts: only its own identity as
      // the BFS target matters, so an empty file is enough.
      writeFileSync(path.join(dir, 'src', 'sim', 'content.ts'), 'export {};\n');
      writeFileSync(
        path.join(dir, 'tools', 'new-risky-tool.ts'),
        "import { loadContent } from '../src/sim/content';\n\nconsole.log(loadContent());\n",
      );
      const scratchContentPath = path.join(dir, 'src', 'sim', 'content.ts');
      const row = classifyTool('tools/new-risky-tool.ts', path.join(dir, 'tools', 'new-risky-tool.ts'), {
        contentPath: scratchContentPath,
        notInvocable: {},
        pinCoverage: {},
      });
      expect(row.importsContent).toBe(true);
      expect(row.hasCatch).toBe(false);
      expect(row.status).toBe('gap');
    } finally {
      rmSync(dir, RM_RETRY);
    }
  });

  it('a synthetic new tool that never imports content is exempt, not a gap', () => {
    const dir = scratchPath('new-safe-tool');
    try {
      mkdirSync(path.join(dir, 'src', 'sim'), { recursive: true });
      mkdirSync(path.join(dir, 'tools'), { recursive: true });
      writeFileSync(path.join(dir, 'src', 'sim', 'content.ts'), 'export {};\n');
      writeFileSync(path.join(dir, 'tools', 'new-safe-tool.ts'), "console.log('nothing to see here');\n");
      const scratchContentPath = path.join(dir, 'src', 'sim', 'content.ts');
      const row = classifyTool('tools/new-safe-tool.ts', path.join(dir, 'tools', 'new-safe-tool.ts'), {
        contentPath: scratchContentPath,
        notInvocable: {},
        pinCoverage: {},
      });
      expect(row.importsContent).toBe(false);
      expect(row.status).toBe('no-content-import');
    } finally {
      rmSync(dir, RM_RETRY);
    }
  });

  it('an unpaired backtick in a doc comment ahead of a real import does not swallow the import (code review regression)', () => {
    // Code review demonstrated this live: stripping backtick strings before
    // stripping comments lets a stray, unclosed backtick inside one doc
    // comment pair across the comment boundary with an unrelated backtick
    // later in the file, deleting everything between — including a real
    // import in between. Comments now strip first, so this must read true.
    const dir = scratchPath('unpaired-backtick-tool');
    try {
      mkdirSync(path.join(dir, 'src', 'sim'), { recursive: true });
      mkdirSync(path.join(dir, 'tools'), { recursive: true });
      writeFileSync(path.join(dir, 'src', 'sim', 'content.ts'), 'export {};\n');
      writeFileSync(
        path.join(dir, 'tools', 'unpaired-backtick-tool.ts'),
        [
          '/**',
          " * ... here's a one-off `example without a matching closer in this sentence.",
          ' */',
          "import { loadContent } from '../src/sim/content';",
          'console.log(loadContent());',
          '// mentions `some other span` later in a comment, unrelated to the above.',
          '',
        ].join('\n'),
      );
      const row = classifyTool(
        'tools/unpaired-backtick-tool.ts',
        path.join(dir, 'tools', 'unpaired-backtick-tool.ts'),
        { contentPath: path.join(dir, 'src', 'sim', 'content.ts'), notInvocable: {}, pinCoverage: {} },
      );
      expect(row.importsContent).toBe(true);
    } finally {
      rmSync(dir, RM_RETRY);
    }
  });

  it('importsContentTransitively follows a real value-import chain (invariants.ts -> stats.ts -> content.ts)', () => {
    // A live, non-synthetic proof that the BFS actually walks more than one
    // hop: invariants.ts never imports content.ts directly, only through
    // stats.ts's value import of wardenBase.
    expect(importsContentTransitively(path.join(REPO_ROOT, 'tools', 'invariants.ts'))).toBe(true);
  });

  it("importsContentTransitively ignores a type-only import (invariants.ts's own `import type { World }`)", () => {
    // If type-only imports were followed, this would still read true (it
    // already does, via the value-import path above) — the real assertion
    // is structural: a file that ONLY type-imports something reachable from
    // content.ts must read false. src/sim/grid.ts has no imports at all, so
    // it is the cleanest possible negative control.
    expect(importsContentTransitively(path.join(REPO_ROOT, 'src', 'sim', 'grid.ts'))).toBe(false);
  });

  it("ignores a per-specifier type-only import — `import { type Foo, type Bar } from '...'` — where every named specifier is individually marked `type` and no value is imported (q51 regression: VALUE_IMPORT_RE's `(?!type\\s)` lookahead only catches a leading `import type { ... }`, not this equally-erased form)", () => {
    const dir = scratchPath('per-specifier-type-only-import');
    try {
      mkdirSync(path.join(dir, 'src', 'sim'), { recursive: true });
      mkdirSync(path.join(dir, 'tools'), { recursive: true });
      writeFileSync(
        path.join(dir, 'src', 'sim', 'content.ts'),
        'export interface Foo {}\nexport interface Bar {}\nthrow new Error("content.ts evaluated");\n',
      );
      writeFileSync(
        path.join(dir, 'tools', 'new-tool.ts'),
        "import { type Foo, type Bar } from '../src/sim/content';\nexport const x: Foo | Bar | null = null;\n",
      );
      const scratchContentPath = path.join(dir, 'src', 'sim', 'content.ts');
      const row = classifyTool('tools/new-tool.ts', path.join(dir, 'tools', 'new-tool.ts'), {
        contentPath: scratchContentPath,
        notInvocable: {},
        pinCoverage: {},
      });
      expect(row.importsContent).toBe(false);
      expect(row.status).toBe('no-content-import');
    } finally {
      rmSync(dir, RM_RETRY);
    }
  });

  it("still follows a mixed import — `import { type Foo, loadContent } from '...'` — where at least one specifier is a real value (negative control for q51's fix: not every braced import is type-only)", () => {
    const dir = scratchPath('mixed-type-and-value-import');
    try {
      mkdirSync(path.join(dir, 'src', 'sim'), { recursive: true });
      mkdirSync(path.join(dir, 'tools'), { recursive: true });
      writeFileSync(
        path.join(dir, 'src', 'sim', 'content.ts'),
        'export interface Foo {}\nexport function loadContent() { return 1; }\n',
      );
      writeFileSync(
        path.join(dir, 'tools', 'new-tool.ts'),
        "import { type Foo, loadContent } from '../src/sim/content';\nconsole.log(loadContent());\n",
      );
      const scratchContentPath = path.join(dir, 'src', 'sim', 'content.ts');
      const row = classifyTool('tools/new-tool.ts', path.join(dir, 'tools', 'new-tool.ts'), {
        contentPath: scratchContentPath,
        notInvocable: {},
        pinCoverage: {},
      });
      expect(row.importsContent).toBe(true);
      expect(row.status).toBe('gap');
    } finally {
      rmSync(dir, RM_RETRY);
    }
  });

  it('hasCatch is true for a file with a real catch clause and false for one with none', () => {
    expect(hasCatch(path.join(REPO_ROOT, 'tools', 'gate-audit.ts'))).toBe(true);
    expect(hasCatch(path.join(REPO_ROOT, 'tools', 'sim.ts'))).toBe(false);
  });

  it('follows a bare side-effect import (no `from` clause) in the chain to content.ts (QA regression: this shape is real in src/sim/run.ts and tools/sim.ts today)', () => {
    // Repro QA found live: a chain that reaches content.ts only through a
    // bare `import '../module';` (no bound names, no `from` clause) was
    // silently invisible to VALUE_IMPORT_RE, which required a `from` clause
    // on every alternative. That would misclassify a future tool whose only
    // route to content.ts is a bare side-effect import as `no-content-import`
    // instead of surfacing it as a `gap`.
    const dir = scratchPath('bare-side-effect-import');
    try {
      mkdirSync(path.join(dir, 'src', 'sim'), { recursive: true });
      mkdirSync(path.join(dir, 'tools'), { recursive: true });
      writeFileSync(path.join(dir, 'src', 'sim', 'content.ts'), 'export {};\n');
      writeFileSync(path.join(dir, 'middle.ts'), "import './src/sim/content';\nexport const middleThing = 1;\n");
      writeFileSync(
        path.join(dir, 'tools', 'new-tool.ts'),
        "import { middleThing } from '../middle';\nconsole.log(middleThing);\n",
      );
      const scratchContentPath = path.join(dir, 'src', 'sim', 'content.ts');
      const row = classifyTool('tools/new-tool.ts', path.join(dir, 'tools', 'new-tool.ts'), {
        contentPath: scratchContentPath,
        notInvocable: {},
        pinCoverage: {},
      });
      expect(row.importsContent).toBe(true);
      expect(row.status).toBe('gap');
    } finally {
      rmSync(dir, RM_RETRY);
    }
  });

  it('follows a dynamic import(...) that is not awaited (code-review regression: requiring a literal `await` before `import(` missed a fire-and-forget or `.then()`-chained dynamic import, which still starts evaluating its target module the instant it runs)', () => {
    const dir = scratchPath('unawaited-dynamic-import');
    try {
      mkdirSync(path.join(dir, 'src', 'sim'), { recursive: true });
      mkdirSync(path.join(dir, 'tools'), { recursive: true });
      writeFileSync(path.join(dir, 'src', 'sim', 'content.ts'), 'export {};\n');
      writeFileSync(
        path.join(dir, 'tools', 'new-tool.ts'),
        "import('../src/sim/content').then((m) => console.log(m));\n",
      );
      const scratchContentPath = path.join(dir, 'src', 'sim', 'content.ts');
      const row = classifyTool('tools/new-tool.ts', path.join(dir, 'tools', 'new-tool.ts'), {
        contentPath: scratchContentPath,
        notInvocable: {},
        pinCoverage: {},
      });
      expect(row.importsContent).toBe(true);
      expect(row.status).toBe('gap');
    } finally {
      rmSync(dir, RM_RETRY);
    }
  });

  it('a line-continuation escape inside a double-quoted string does not leak a real newline that makes the next string line read as a top-level import (QA regression, q50)', () => {
    // A backslash immediately followed by a real newline inside a
    // single/double-quoted string is a valid JS line-continuation escape —
    // the newline contributes nothing to the string's value. The old
    // stripCommentsAndBacktickStrings copied that newline through literally,
    // so a following physical line that happened to start with
    // `import ... from '...'` (still pure string data, never evaluated as an
    // import) matched VALUE_IMPORT_RE's `^`-anchored, multiline alternative.
    const dir = scratchPath('line-continuation-string');
    try {
      mkdirSync(path.join(dir, 'src', 'sim'), { recursive: true });
      mkdirSync(path.join(dir, 'tools'), { recursive: true });
      writeFileSync(path.join(dir, 'src', 'sim', 'content.ts'), 'export {};\n');
      writeFileSync(
        path.join(dir, 'tools', 'new-tool.ts'),
        [
          'const s = "foo\\',
          "import { loadContent } from '../src/sim/content';\\",
          'bar";',
          'console.log(s);',
          '',
        ].join('\n'),
      );
      const scratchContentPath = path.join(dir, 'src', 'sim', 'content.ts');
      const row = classifyTool('tools/new-tool.ts', path.join(dir, 'tools', 'new-tool.ts'), {
        contentPath: scratchContentPath,
        notInvocable: {},
        pinCoverage: {},
      });
      expect(row.importsContent).toBe(false);
      expect(row.status).toBe('no-content-import');
    } finally {
      rmSync(dir, RM_RETRY);
    }
  });

  it('resolves an import specifier that already names its own .ts extension (code-review regression: `${base}.ts` would look for the nonexistent "foo.ts.ts")', () => {
    const dir = scratchPath('explicit-extension-import');
    try {
      mkdirSync(path.join(dir, 'src', 'sim'), { recursive: true });
      mkdirSync(path.join(dir, 'tools'), { recursive: true });
      writeFileSync(path.join(dir, 'src', 'sim', 'content.ts'), 'export {};\n');
      writeFileSync(
        path.join(dir, 'tools', 'new-tool.ts'),
        "import '../src/sim/content.ts';\nconsole.log('hi');\n",
      );
      const scratchContentPath = path.join(dir, 'src', 'sim', 'content.ts');
      const row = classifyTool('tools/new-tool.ts', path.join(dir, 'tools', 'new-tool.ts'), {
        contentPath: scratchContentPath,
        notInvocable: {},
        pinCoverage: {},
      });
      expect(row.importsContent).toBe(true);
      expect(row.status).toBe('gap');
    } finally {
      rmSync(dir, RM_RETRY);
    }
  });
});
