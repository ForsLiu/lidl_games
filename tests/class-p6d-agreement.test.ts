/**
 * c025 — the p6d agreement parser, exercised on synthetic sources.
 *
 * Every case below is a shape QA broke in the first draft of this parser, and
 * the point of testing it on fabricated text rather than only on the shipped
 * p6d is that the shipped p6d is one arrangement of the file. The parser's
 * job is to survive a *reformat* and fail loudly on a *re-aim*, and only
 * synthetic input can put those two side by side.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { P6D_FILE, p6dIceWall, parseP6dIceWall } from './class-p6d-agreement';

/** A miniature p6d: the `castWall()` decoy first, then the occupancy row. */
function synthetic(over: { decoyAim?: string; park?: string; aim?: string; title?: string } = {}): string {
  const title = over.title ?? "  it('still pays its cooldown when no tile could be placed (every target tile already occupied)', () => {";
  return [
    "describe('p6d: Cryomancer Ice Wall — free, real, and temporary', () => {",
    '  function castWall(): { w: World; gold: number } {',
    '    const w = worldWith(\'cryomancer\');',
    '    w.warden.x = 4;',
    '    w.warden.y = 4;',
    `    applyCommand(w, { ${over.decoyAim ?? "k: 'class_active2', aimX: 6, aimY: 4"} });`,
    '    return { w, gold };',
    '  }',
    '',
    title,
    "    const w = worldWith('cryomancer');",
    over.park ?? '    w.warden.x = 10;\n    w.warden.y = 10;',
    '    for (const ty of [9, 10, 11]) {',
    '      expect(buildTower(w, arrow.id, 12, ty).ok).toBe(true);',
    '    }',
    `    applyCommand(w, { ${over.aim ?? "k: 'class_active2', aimX: 12, aimY: 10"} });`,
    '    expect(w.tempWalls).toHaveLength(0);',
    '  });',
    '});',
  ].join('\n');
}

describe('c025: the p6d agreement is read from the row it agrees with', () => {
  it('reads the occupancy test, not the castWall helper above it', () => {
    // The bug QA found: the first aim inside p6d's Ice Wall `describe` belongs
    // to a helper the gold/duration rows use. Re-aiming the *occupancy* row —
    // the one class-kit-whiff mirrors — left the agreement green.
    expect(parseP6dIceWall(synthetic())).toEqual({ parkX: 10, parkY: 10, aimX: 12, aimY: 10 });
    expect(
      parseP6dIceWall(synthetic({ aim: "k: 'class_active2', aimX: 13, aimY: 10" })),
      're-aiming the occupancy cast must move the parsed aim',
    ).toMatchObject({ aimX: 13 });
    // And moving the decoy must not move the answer.
    expect(parseP6dIceWall(synthetic({ decoyAim: "k: 'class_active2', aimX: 99, aimY: 99" }))).toMatchObject({
      aimX: 12,
      aimY: 10,
    });
  });

  it('a reformat is not a re-aim: line breaks, quote style and a one-line park all parse', () => {
    const wrapped = synthetic({
      aim: "\n      k: 'class_active2',\n      aimX: 12,\n      aimY: 10,\n    ",
    });
    expect(parseP6dIceWall(wrapped), 'a prettier-wrapped applyCommand read as a re-aim').toMatchObject({ aimX: 12 });
    expect(parseP6dIceWall(synthetic({ aim: 'k: "class_active2", aimX: 12, aimY: 10' }))).toMatchObject({ aimX: 12 });
    expect(
      parseP6dIceWall(synthetic({ park: '    w.warden.x = 10; w.warden.y = 10;' })),
      'a one-line park fell through to another test',
    ).toMatchObject({ parkX: 10, parkY: 10 });
  });

  it('an unreadable p6d fails as a parse failure, naming itself — never as a re-aim', () => {
    // The false-red QA measured: a reordered p6d reported "p6d's own Ice Wall
    // aim point moved", blaming p6d for something it had not done.
    expect(() => parseP6dIceWall(synthetic({ title: "  it('renamed away', () => {" }))).toThrow(
      /has 0 "every target tile already occupied" tests.*parse failure/s,
    );
    expect(() => parseP6dIceWall(synthetic() + '\n' + synthetic())).toThrow(/has 2 .*parse failure/s);
    const twoParks = synthetic({ park: '    w.warden.x = 10;\n    w.warden.y = 10;\n    w.warden.x = 3;\n    w.warden.y = 3;' });
    expect(() => parseP6dIceWall(twoParks)).toThrow(/states 2 Warden parks.*parse failure/s);
    expect(() => parseP6dIceWall(synthetic({ aim: "k: 'class_active', aimX: 12, aimY: 10" }))).toThrow(
      /states 0 class_active2 aims.*parse failure/s,
    );
  });

  it('nothing is parsed at import: the shipped read happens on first use', () => {
    // The whole reason this is a function. QA renamed p6d's describe and
    // watched `class-kit-whiff` collapse to `Tests no tests` — 58 rows gone,
    // with a green-looking pass count, which `tests/class-board.ts`'s own
    // header calls worse than the failure c014 set out to fix.
    const src = readFileSync(fileURLToPath(new URL('./class-p6d-agreement.ts', import.meta.url)), 'utf8');
    expect(src, 'class-p6d-agreement parses at module scope again').not.toMatch(/^const \w+ = \(\(\) => \{/m);
    expect(src.split('\n').filter((l) => /^\s{0,2}(readFileSync|parseP6dIceWall)\(/.test(l))).toEqual([]);
    // And the lazy read really does resolve the shipped file.
    expect(p6dIceWall()).toEqual({ parkX: 10, parkY: 10, aimX: 12, aimY: 10 });
    expect(p6dIceWall(), 'the memo hands back a different answer on the second call').toEqual(p6dIceWall());
    expect(P6D_FILE).toBe('p6d-nine-classes.test.ts');
  });
});
