/**
 * SPEC 9.1 is a build requirement, not a convention, so it gets a test:
 * /src/sim must contain zero DOM access, zero Math.random, zero wall-clock,
 * and zero native trig (implementation-defined, so it would break A11).
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SIM_DIR = join(process.cwd(), 'src', 'sim');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (entry.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Strips block and line comments so prose about a rule never trips it. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const FORBIDDEN: { name: string; re: RegExp }[] = [
  { name: 'Math.random', re: /\bMath\s*\.\s*random\b/ },
  { name: 'Date.now', re: /\bDate\s*\.\s*now\b/ },
  { name: 'new Date', re: /\bnew\s+Date\b/ },
  { name: 'performance.now', re: /\bperformance\s*\.\s*now\b/ },
  { name: 'document', re: /\bdocument\s*\./ },
  { name: 'window', re: /\bwindow\s*\./ },
  { name: 'localStorage', re: /\blocalStorage\b/ },
  { name: 'Math.sin', re: /\bMath\s*\.\s*sin\b/ },
  { name: 'Math.cos', re: /\bMath\s*\.\s*cos\b/ },
  { name: 'Math.tan', re: /\bMath\s*\.\s*tan\b/ },
  { name: 'Math.atan2', re: /\bMath\s*\.\s*atan2\b/ },
  { name: 'Math.hypot', re: /\bMath\s*\.\s*hypot\b/ },
  { name: 'setTimeout', re: /\bsetTimeout\b/ },
  { name: 'setInterval', re: /\bsetInterval\b/ },
];

describe('sim purity (SPEC 9.1)', () => {
  const files = sourceFiles(SIM_DIR);

  it('finds the sim sources', () => {
    expect(files.length).toBeGreaterThan(8);
  });

  for (const { name, re } of FORBIDDEN) {
    it(`never uses ${name}`, () => {
      const offenders: string[] = [];
      for (const f of files) {
        const src = stripComments(readFileSync(f, 'utf8'));
        if (re.test(src)) offenders.push(f.replace(process.cwd(), ''));
      }
      expect(offenders, `${name} found in: ${offenders.join(', ')}`).toEqual([]);
    });
  }

  it('never imports from the renderer or the UI', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      // `(\.\.\/)+`: `src/sim/terrain/` is nested one level deeper, so its
      // imports read `'../../render/...'` — a single `../` missed them (fb064a).
      if (/from\s+'(\.\.\/)+(render|ui|meta|bots)\//.test(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
