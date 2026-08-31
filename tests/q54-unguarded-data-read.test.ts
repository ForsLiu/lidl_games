/**
 * q54 — generalize `tools/cli-crash-coverage.ts`'s census (q47) to detect
 * q53's crash class: a `tools/*.ts` file that reads a `/data/*.json` file
 * directly (`readFileSync` + `JSON.parse`, bypassing `loadContent()`) —
 * as its own named `unguarded-data-read` status, distinct from
 * `no-content-import`'s current meaning ("safe, never touches content.ts").
 *
 * Detection is deliberately guard-agnostic (see cli-crash-coverage.ts's file
 * doc comment (d)): a file that currently wraps the `JSON.parse` in a `try`
 * still needs a named `PIN_COVERAGE` entry, or a future guard regression
 * (someone narrows the `try` again) falls silently back to "safe" the same
 * way q53's own bug went unnoticed for however many sessions this file
 * existed. So `readsDataJsonDirectly` reports the *shape*, not the guard
 * state; `classifyTool` is what turns "shape present, no pin" into a loud
 * `unguarded-data-read` result.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  classifyAll,
  classifyTool,
  gaps,
  listToolFiles,
  readsDataJsonDirectly,
  REPO_ROOT,
} from '../tools/cli-crash-coverage';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRATCH_ROOT = path.join(ROOT, 'bench', '.tmp', 'q54-unguarded-data-read-scratch');
const RM_RETRY = { recursive: true, force: true, maxRetries: 5, retryDelay: 200 } as const;

function scratchPath(name: string): string {
  return path.join(SCRATCH_ROOT, `${name}-${process.pid}-${Math.random().toString(36).slice(2)}`);
}

describe('q54 — unguarded-data-read census', () => {
  it('tools/m20d-price-probe.ts and tools/fuzz-data.ts are the two live positive cases for readsDataJsonDirectly today', () => {
    // tools/fuzz-data.ts reads via readFileSync(join('data', `${file}.json`), 'utf8')
    // — the join()+template-literal shape code review found live while this
    // check was landing (see readsDataJsonDirectly's doc comment). It never
    // shows up in classifyAll() as unguarded-data-read because it is also in
    // NOT_INVOCABLE, checked separately below.
    const flagged = listToolFiles().filter((f) => readsDataJsonDirectly(path.join(REPO_ROOT, f)));
    expect(flagged).toEqual(['tools/fuzz-data.ts', 'tools/m20d-price-probe.ts']);
  });

  it('tools/m20d-price-probe.ts classifies as pinned (post-q53-fix), not unguarded-data-read or no-content-import', () => {
    const row = classifyTool('tools/m20d-price-probe.ts', path.join(REPO_ROOT, 'tools/m20d-price-probe.ts'));
    expect(row.importsContent).toBe(false);
    expect(row.readsDataJsonDirectly).toBe(true);
    expect(row.status).toBe('pinned');
    expect(row.testFiles).toEqual(['tests/q53-price-probe-json-crash.test.ts']);
  });

  it('no other one of the 23 tools/*.ts files is newly flagged unguarded-data-read by this census', () => {
    const rows = classifyAll();
    const flagged = rows.filter((r) => r.status === 'unguarded-data-read');
    expect(flagged).toEqual([]);
  });

  it('tools/fuzz-data.ts classifies as not-invocable, not unguarded-data-read, even though readsDataJsonDirectly is true for it (NOT_INVOCABLE short-circuits before the new check runs)', () => {
    const row = classifyTool('tools/fuzz-data.ts', path.join(REPO_ROOT, 'tools/fuzz-data.ts'));
    expect(row.readsDataJsonDirectly).toBe(true);
    expect(row.status).toBe('not-invocable');
  });

  it('a synthetic tool matching tools/fuzz-data.ts\'s real shape — readFileSync(join(\'data\', `${file}.json`)) — is detected via the join()+template-literal path', () => {
    const dir = scratchPath('join-template-literal');
    try {
      mkdirSync(path.join(dir, 'tools'), { recursive: true });
      writeFileSync(
        path.join(dir, 'tools', 'new-tool.ts'),
        [
          "import { readFileSync } from 'node:fs';",
          "import { join } from 'node:path';",
          "function pristineText(file) {",
          "  return readFileSync(join('data', `${file}.json`), 'utf8');",
          "}",
          "function pristine(file) {",
          "  return JSON.parse(pristineText(file));",
          "}",
          'pristine("towers");',
          '',
        ].join('\n'),
      );
      const absPath = path.join(dir, 'tools', 'new-tool.ts');
      expect(readsDataJsonDirectly(absPath)).toBe(true);
      const row = classifyTool('tools/new-tool.ts', absPath, { notInvocable: {}, pinCoverage: {} });
      expect(row.status).toBe('unguarded-data-read');
    } finally {
      rmSync(dir, RM_RETRY);
    }
  });

  it('a synthetic tool using readFileSync(path.join(\'data\', \'x.json\')) — a plain string second argument, no template literal — is also detected', () => {
    const dir = scratchPath('join-plain-string');
    try {
      mkdirSync(path.join(dir, 'tools'), { recursive: true });
      writeFileSync(
        path.join(dir, 'tools', 'new-tool.ts'),
        [
          "import fs from 'node:fs';",
          "import path from 'node:path';",
          "const d = JSON.parse(fs.readFileSync(path.join('data', 'enemies.json'), 'utf8'));",
          'console.log(d);',
          '',
        ].join('\n'),
      );
      const absPath = path.join(dir, 'tools', 'new-tool.ts');
      expect(readsDataJsonDirectly(absPath)).toBe(true);
    } finally {
      rmSync(dir, RM_RETRY);
    }
  });

  it('a synthetic tool using join() on a non-"data" first argument is not flagged (the join-shape check is anchored to a literal "data"/"data/..." first argument, not any join() call)', () => {
    const dir = scratchPath('join-non-data');
    try {
      mkdirSync(path.join(dir, 'tools'), { recursive: true });
      writeFileSync(
        path.join(dir, 'tools', 'new-tool.ts'),
        [
          "import { readFileSync } from 'node:fs';",
          "import { join } from 'node:path';",
          "const raw = readFileSync(join('config', `${file}.json`), 'utf8');",
          'const d = JSON.parse(raw);',
          'console.log(d);',
          '',
        ].join('\n'),
      );
      expect(readsDataJsonDirectly(path.join(dir, 'tools', 'new-tool.ts'))).toBe(false);
    } finally {
      rmSync(dir, RM_RETRY);
    }
  });

  it('a synthetic tool matching the shape (readFileSync of a const-bound data/*.json literal + JSON.parse), already wrapped in a try, is still detected — guard-agnostic by design', () => {
    const dir = scratchPath('guarded-shape');
    try {
      mkdirSync(path.join(dir, 'tools'), { recursive: true });
      writeFileSync(
        path.join(dir, 'tools', 'new-tool.ts'),
        [
          "import fs from 'node:fs';",
          "const FILE = 'data/towers.json';",
          'function measure() {',
          "  const raw = fs.readFileSync(FILE, 'utf8');",
          '  try {',
          '    const d = JSON.parse(raw);',
          '    return d;',
          '  } finally {',
          '    fs.writeFileSync(FILE, raw);',
          '  }',
          '}',
          'measure();',
          '',
        ].join('\n'),
      );
      const absPath = path.join(dir, 'tools', 'new-tool.ts');
      expect(readsDataJsonDirectly(absPath)).toBe(true);
      const row = classifyTool('tools/new-tool.ts', absPath, { notInvocable: {}, pinCoverage: {} });
      expect(row.importsContent).toBe(false);
      expect(row.readsDataJsonDirectly).toBe(true);
      expect(row.status).toBe('unguarded-data-read');
    } finally {
      rmSync(dir, RM_RETRY);
    }
  });

  it('a synthetic tool matching the pre-q53-fix shape (JSON.parse sitting outside any try) is also detected', () => {
    const dir = scratchPath('unguarded-shape');
    try {
      mkdirSync(path.join(dir, 'tools'), { recursive: true });
      writeFileSync(
        path.join(dir, 'tools', 'new-tool.ts'),
        [
          "import fs from 'node:fs';",
          "const FILE = 'data/towers.json';",
          "const raw = fs.readFileSync(FILE, 'utf8');",
          'const d = JSON.parse(raw);',
          'console.log(d);',
          '',
        ].join('\n'),
      );
      const absPath = path.join(dir, 'tools', 'new-tool.ts');
      expect(readsDataJsonDirectly(absPath)).toBe(true);
      const row = classifyTool('tools/new-tool.ts', absPath, { notInvocable: {}, pinCoverage: {} });
      expect(row.status).toBe('unguarded-data-read');
    } finally {
      rmSync(dir, RM_RETRY);
    }
  });

  it('a synthetic tool that reads an inline data/*.json literal directly (no const binding) is also detected', () => {
    const dir = scratchPath('inline-literal');
    try {
      mkdirSync(path.join(dir, 'tools'), { recursive: true });
      writeFileSync(
        path.join(dir, 'tools', 'new-tool.ts'),
        [
          "import { readFileSync } from 'node:fs';",
          "const d = JSON.parse(readFileSync('data/enemies.json', 'utf8'));",
          'console.log(d);',
          '',
        ].join('\n'),
      );
      const absPath = path.join(dir, 'tools', 'new-tool.ts');
      expect(readsDataJsonDirectly(absPath)).toBe(true);
    } finally {
      rmSync(dir, RM_RETRY);
    }
  });

  it('a synthetic tool that reads an inline data/*.json template literal directly (no join() wrapper, no interpolation) is also detected (b025)', () => {
    const dir = scratchPath('template-literal-no-join');
    try {
      mkdirSync(path.join(dir, 'tools'), { recursive: true });
      writeFileSync(
        path.join(dir, 'tools', 'new-tool.ts'),
        [
          "import { readFileSync } from 'node:fs';",
          'const d = JSON.parse(readFileSync(`data/enemies.json`, \'utf8\'));',
          'console.log(d);',
          '',
        ].join('\n'),
      );
      const absPath = path.join(dir, 'tools', 'new-tool.ts');
      expect(readsDataJsonDirectly(absPath)).toBe(true);
      const row = classifyTool('tools/new-tool.ts', absPath, { notInvocable: {}, pinCoverage: {} });
      expect(row.status).toBe('unguarded-data-read');
    } finally {
      rmSync(dir, RM_RETRY);
    }
  });

  it('a synthetic tool that reads a string-concatenated data/*.json path (\'data/\' + \'x.json\') is also detected (b025)', () => {
    const dir = scratchPath('concat-literal');
    try {
      mkdirSync(path.join(dir, 'tools'), { recursive: true });
      writeFileSync(
        path.join(dir, 'tools', 'new-tool.ts'),
        [
          "import { readFileSync } from 'node:fs';",
          "const d = JSON.parse(readFileSync('data/' + 'enemies.json', 'utf8'));",
          'console.log(d);',
          '',
        ].join('\n'),
      );
      const absPath = path.join(dir, 'tools', 'new-tool.ts');
      expect(readsDataJsonDirectly(absPath)).toBe(true);
      const row = classifyTool('tools/new-tool.ts', absPath, { notInvocable: {}, pinCoverage: {} });
      expect(row.status).toBe('unguarded-data-read');
    } finally {
      rmSync(dir, RM_RETRY);
    }
  });

  it('a synthetic tool that reads a bare (no join()) *interpolated* template literal is not flagged — the $-guard excludes it since the path is only partially static (b025 known limitation)', () => {
    const dir = scratchPath('template-literal-interpolated');
    try {
      mkdirSync(path.join(dir, 'tools'), { recursive: true });
      writeFileSync(
        path.join(dir, 'tools', 'new-tool.ts'),
        [
          "import { readFileSync } from 'node:fs';",
          'function read(file) {',
          '  return JSON.parse(readFileSync(`data/${file}.json`, \'utf8\'));',
          '}',
          'read("enemies");',
          '',
        ].join('\n'),
      );
      expect(readsDataJsonDirectly(path.join(dir, 'tools', 'new-tool.ts'))).toBe(false);
    } finally {
      rmSync(dir, RM_RETRY);
    }
  });

  it('a synthetic tool that string-concatenates a non-data path is not flagged (the concat check still anchors to DATA_JSON_PATH_RE, not any concatenation)', () => {
    const dir = scratchPath('concat-non-data');
    try {
      mkdirSync(path.join(dir, 'tools'), { recursive: true });
      writeFileSync(
        path.join(dir, 'tools', 'new-tool.ts'),
        [
          "import { readFileSync } from 'node:fs';",
          "const d = JSON.parse(readFileSync('logs/' + 'x.json', 'utf8'));",
          'console.log(d);',
          '',
        ].join('\n'),
      );
      expect(readsDataJsonDirectly(path.join(dir, 'tools', 'new-tool.ts'))).toBe(false);
    } finally {
      rmSync(dir, RM_RETRY);
    }
  });

  it('a synthetic tool embedding a readFileSync(\'data/x.json\')-shaped call only as the text of a double-quoted fixture string false-positives (b063 known limitation — the single/double-quote-side twin of the q47 backtick-fixture gap)', () => {
    const dir = scratchPath('quoted-fixture-string');
    try {
      mkdirSync(path.join(dir, 'tools'), { recursive: true });
      writeFileSync(
        path.join(dir, 'tools', 'new-tool.ts'),
        [
          'const fixtureLine = "const d = JSON.parse(readFileSync(\'data/x.json\', \'utf8\'));";',
          'console.log(fixtureLine);',
          '',
        ].join('\n'),
      );
      expect(readsDataJsonDirectly(path.join(dir, 'tools', 'new-tool.ts'))).toBe(true);
    } finally {
      rmSync(dir, RM_RETRY);
    }
  });

  it('a tool that reads a /data/*.json path but never calls JSON.parse is not flagged (reading raw text is not the crash shape)', () => {
    const dir = scratchPath('no-parse');
    try {
      mkdirSync(path.join(dir, 'tools'), { recursive: true });
      writeFileSync(
        path.join(dir, 'tools', 'new-tool.ts'),
        [
          "import { readFileSync } from 'node:fs';",
          "const raw = readFileSync('data/towers.json', 'utf8');",
          'console.log(raw.length);',
          '',
        ].join('\n'),
      );
      expect(readsDataJsonDirectly(path.join(dir, 'tools', 'new-tool.ts'))).toBe(false);
    } finally {
      rmSync(dir, RM_RETRY);
    }
  });

  it('a tool that reads a non-/data path and JSON.parses it is not flagged (QUESTIONS_PATH/BACKLOG_PATH-shaped reads, e.g. tools/sim.ts reading a user-supplied --build script, must not false-positive)', () => {
    const dir = scratchPath('non-data-path');
    try {
      mkdirSync(path.join(dir, 'tools'), { recursive: true });
      writeFileSync(
        path.join(dir, 'tools', 'new-tool.ts'),
        [
          "import { readFileSync } from 'node:fs';",
          'const buildPath = process.argv[2];',
          "const script = JSON.parse(readFileSync(buildPath, 'utf8'));",
          'console.log(script);',
          '',
        ].join('\n'),
      );
      expect(readsDataJsonDirectly(path.join(dir, 'tools', 'new-tool.ts'))).toBe(false);
    } finally {
      rmSync(dir, RM_RETRY);
    }
  });

  it("gaps() includes unguarded-data-read rows alongside gap rows — the status this tool exists to make loud", () => {
    const rows = [
      {
        file: 'tools/x.ts',
        importsContent: false,
        hasCatch: false,
        readsDataJsonDirectly: true,
        status: 'unguarded-data-read' as const,
        reason: 'r',
        testFiles: [],
      },
      {
        file: 'tools/y.ts',
        importsContent: true,
        hasCatch: false,
        readsDataJsonDirectly: false,
        status: 'gap' as const,
        reason: 'r',
        testFiles: [],
      },
      {
        file: 'tools/z.ts',
        importsContent: false,
        hasCatch: false,
        readsDataJsonDirectly: false,
        status: 'no-content-import' as const,
        reason: 'r',
        testFiles: [],
      },
    ];
    expect(gaps(rows).map((r) => r.file)).toEqual(['tools/x.ts', 'tools/y.ts']);
  });
});
