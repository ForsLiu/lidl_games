/**
 * fb085 (QUALITY.md BETA localization-readiness bar, SPEC-FINAL §11): the
 * lint/test half of the `data/strings.json` mechanism — a migrated
 * *surface* must never let one of its own already-migrated values sneak
 * back in as a raw literal. `src/ui/hud.ts`'s pause card (`showPause`) is
 * the first converted surface (fb135); this file is the rule's own proof
 * case, not a hud.ts-specific test.
 *
 * Scoped to the converted method's own body, not the whole file: `hud.ts`
 * is 2000+ lines of unconverted UI text, and several `pause.*` values are
 * short, ordinary words ("Cancel", "Options") that legitimately appear
 * elsewhere in the file for unrelated, un-migrated controls (the bug-report
 * box's own "Cancel" button) or inside identifiers ("Paused" inside
 * `setPaused`) — a whole-file scan would flag those as false positives.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import strings from '../data/strings.json';
import { findReintroducedLiterals } from '../src/ui/strings';

/** Extracts one method's `{ ... }` body by brace-balancing from its signature line. */
function extractMethodBody(source: string, signature: string): string {
  const sigStart = source.indexOf(signature);
  if (sigStart === -1) throw new Error(`signature not found: ${signature}`);
  const braceStart = source.indexOf('{', sigStart);
  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(braceStart, i + 1);
    }
  }
  throw new Error(`unbalanced braces for signature: ${signature}`);
}

/** Converted surfaces: a file plus the exact signature of the method that owns the migrated text. */
const CONVERTED_SURFACES = [{ file: 'src/ui/hud.ts', signature: 'private showPause(w: World): void {' }];

const PAUSE_VALUES = Object.entries(strings)
  .filter(([key]) => key.startsWith('pause.'))
  .map(([, value]) => value);

describe('fb085: strings.json reintroduction guard', () => {
  it('every converted surface is free of its own migrated pause.* literals', () => {
    for (const { file, signature } of CONVERTED_SURFACES) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      const body = extractMethodBody(source, signature);
      expect(findReintroducedLiterals(body, PAUSE_VALUES)).toEqual([]);
    }
  });

  it('the rule is not vacuous: it catches a literal reintroduced as a bare text node', () => {
    const buggySource = `this.modal.innerHTML = '<h2>Abandon run?</h2>';`;
    expect(findReintroducedLiterals(buggySource, PAUSE_VALUES)).toContain('Abandon run?');
  });

  it('the rule also catches a literal reintroduced inside a `${...}` interpolation, not just bare text', () => {
    // an earlier, reverted attempt's own note: scanning only text nodes and
    // `title=` attributes misses a literal placed back inside an
    // interpolation, e.g. a lazy revert of a ternary branch.
    const buggySource = 'const html = `<p>${true ? "Level-ups pause the run for your choice." : t(\'x\')}</p>`;';
    expect(findReintroducedLiterals(buggySource, PAUSE_VALUES)).toContain('Level-ups pause the run for your choice.');
  });

  it('extractMethodBody finds the real showPause body (sanity: not accidentally empty or the whole file)', () => {
    const source = readFileSync(join(process.cwd(), 'src/ui/hud.ts'), 'utf8');
    const body = extractMethodBody(source, 'private showPause(w: World): void {');
    expect(body).toContain('this.openModal()');
    expect(body).toContain("t('pause.title')");
    expect(body.length).toBeLessThan(source.length / 2);
  });
});
