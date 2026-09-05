/**
 * c028 — the spec-ledger device's own self-tests, moved here with the device.
 *
 * Every case is a mutation that got past an earlier draft of the reader, in
 * `tests/equip-spec-numbers.test.ts` where it was born (`c022`). They are
 * exercised on **synthetic source** rather than on whatever the suite happens
 * to contain today: the reader's job is to survive a reformat and refuse a
 * swallow, and only fabricated input puts those two side by side. Without
 * them, a reader that ran past its closing brace would make every `reads`
 * check pass by reading a neighbouring block, and nothing in the real files
 * would reveal it.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  blankNonCode,
  blockBodyIn,
  decoyKeys,
  defaultReads,
  killEntries,
  pointerProblems,
  positiveLines,
  readsStat,
  sourceOf,
} from './equip-spec-ledger';

const TESTS_DIR = fileURLToPath(new URL('.', import.meta.url));

describe('c028: the spec-ledger device, on synthetic source', () => {
  it('the block reader stops at its own block, on synthetic source', () => {
    // Exercised on fabricated text rather than only on the suite: if the
    // reader ran past its closing brace, every `reads` check above would pass
    // by swallowing a neighbouring block, and nothing in the real files would
    // reveal it.
    const text = [
      "describe('outer', () => {",
      "  it('the covered one', () => {",
      '    expect(w.derived.towerCostMul).toBe(0.8);',
      '  });',
      '',
      "  it('the neighbour', () => {",
      '    expect(w.derived.goldFindMul).toBe(2);',
      '  });',
      '});',
    ].join('\n');
    const hit = blockBodyIn(text, /the covered one/);
    expect(hit.matches).toBe(1);
    expect(hit.body).toContain('towerCostMul');
    expect(hit.body).not.toContain('goldFindMul');
    // The title line is not the body: a `reads` check may not be satisfied by
    // the anchor's own words.
    expect(hit.body).not.toContain('the covered one');
    expect(hit.ancestors).toEqual(["describe('outer', () => {"]);
    // Zero and two matches are reported, not thrown or silently taken.
    expect(blockBodyIn(text, /no such title/).matches).toBe(0);
    expect(blockBodyIn(text, /the (covered one|neighbour)/).matches).toBe(2);
    // An unterminated block is a failure, not a swallow.
    expect(() => blockBodyIn("  it('ragged', () => {\n    expect(1).toBe(1);", /ragged/)).toThrow(/cannot find the end/);
    // The two closer shapes this repo already uses, both of which the old
    // exact-`});` scan walked straight past into the next sibling — QA's
    // finding, reproduced here as the regression test it asked for.
    const closers = [
      "describe('outer', () => {",
      "  it('timeout closer', () => {",
      '    expect(w.derived.towerCostMul).toBe(0.8);',
      '  }, 20000);',
      '',
      "  it('commented closer', () => {",
      '    expect(w.derived.hpRegen).toBe(1);',
      '  }); // p10s re-measurement',
      '',
      "  it('the neighbour', () => {",
      '    expect(w.derived.goldFindMul).toBe(2);',
      '  });',
      '});',
    ].join('\n');
    const timeout = blockBodyIn(closers, /timeout closer/);
    expect(timeout.body).toContain('towerCostMul');
    expect(timeout.body, 'the timeout closer let the body swallow its neighbours').not.toContain('goldFindMul');
    const commented = blockBodyIn(closers, /commented closer/);
    expect(commented.body).toContain('hpRegen');
    expect(commented.body, 'the commented closer let the body swallow its neighbour').not.toContain('goldFindMul');

    // And a line back at the block's own column that is *not* a closer is an
    // error, not a swallow — the reader must never guess its way past one.
    const ragged = ["  it('never closes', () => {", '    expect(1).toBe(1);', "  const stray = 1;", '  });'].join('\n');
    expect(() => blockBodyIn(ragged, /never closes/)).toThrow(/does not close/);

    // A comment is not a read: `// luck` inside a block must not cover a row
    // moved onto `luck` (QA's mutation 4).
    const commentOnly = ["  it('comment only', () => {", '    // luck', '    expect(1).toBe(1);', '  });'].join('\n');
    expect(blockBodyIn(commentOnly, /comment only/).body).not.toContain('luck');
  });

  it('the `reads` default binds the stat on the left and the owner as well', () => {
    // Code review measured both halves. As a bare substring `atkFlat` was
    // satisfied by `towerAtkFlat` and `armor` by the item key
    // `swordsman_armor` — §7's Atk and Def columns, which is the
    // character-vs-tower pair a ledger most needs to keep apart. The right
    // side stays open so a derived factor named after its stat still counts.
    const [stat, owner] = defaultReads('atkFlat', 'greatsword');
    expect('const flat = w.derived.towerAtkFlat;').not.toMatch(stat);
    expect('const flat = w.derived.atkFlat;').toMatch(stat);
    expect("worldWith({ equipment: ['greatsword'] })").toMatch(owner);
    expect("worldWith({ equipment: ['sleeve_sword'] })").not.toMatch(owner);
    expect('expect(w.derived.areaMul).toBe(1.1)', 'a derived factor no longer satisfies its own stat').toMatch(
      readsStat('area'),
    );
    expect("worldWith({ equipment: ['swordsman_armor'] })").not.toMatch(readsStat('armor'));
  });

  it('a negative control may name a decoy; a positive assertion may not', () => {
    // QA added "the discount must not leak into gold find" to a covering block
    // — exactly the control a ledger asks for elsewhere — and the decoy check
    // reddened. A rule that punishes strengthening a block is a rule that gets
    // deleted the first time someone strengthens one.
    const body = [
      '    expect(wWith.derived.towerCostMul).toBeCloseTo(0.8, 9);',
      '    expect(wWith.derived.goldFindMul).toBeCloseTo(wNone.derived.goldFindMul, 9);',
      '    expect(wWith.derived.luck).not.toBe(wNone.derived.luck);',
    ].join('\n');
    expect(positiveLines(body)).toContain('towerCostMul');
    expect(positiveLines(body)).not.toContain('goldFind');
    expect(positiveLines(body)).not.toContain('luck');
  });

  it('the decoy roster is derived, so an authored key simply leaves it', () => {
    const all = ['towerCost', 'goldFind', 'towerDamage', 'wallHp'] as const;
    const exempt = { towerDamage: 'towers.ts exports a function of the same name' };
    expect(decoyKeys(all, new Set(['towerCost']), exempt)).toEqual(['goldFind', 'wallHp']);
    // The acceptance mutation itself authors `goldFind`; it must leave the
    // roster rather than fail a precondition, which is what a hardcoded roster
    // did — the right answer for the wrong reason.
    expect(decoyKeys(all, new Set(['towerCost', 'goldFind']), exempt)).toEqual(['wallHp']);
  });

  it('pointerProblems reports each of its five rules, and none of them vacuously', () => {
    // The rules are the device; until c027 they were exercised only by two
    // ledgers passing, and c027 changed one of them (code review).
    const ok = ["  it('cover', () => {", '    expect(w.derived.towerCostMul).toBe(0.8);', '  });'].join('\n');
    expect(pointerProblems(blockBodyIn(ok, /cover/), [readsStat('towerCost')])).toEqual([]);
    // A one-line cover is a complete cover — §4's are frequently a single
    // `expect(signal.x(...)).toBeGreaterThan(0)` — so the emptiness rule is
    // "asserts nothing", not "is short".
    expect(pointerProblems(blockBodyIn(ok, /cover/), [/towerCostMul/])).toEqual([]);
    // ...and "asserts nothing" is not satisfied by the word `expect` in a
    // string, which QA reached with `['expect(x)'].join('')`.
    const quoted = ["  it('quoted', () => {", "    const f = ['expect(x)'].join('');", '    signal.towerHpUp(c);', '  });'].join('\n');
    expect(pointerProblems(blockBodyIn(quoted, /quoted/), [/signal\.towerHpUp/])).toEqual([
      'the anchored block asserts nothing',
    ]);
    // Zero matches, and two.
    expect(pointerProblems(blockBodyIn(ok, /nothing like this/), [])).toEqual(['0 blocks match this anchor, expected 1']);
    // A `reads` the body does not satisfy.
    expect(pointerProblems(blockBodyIn(ok, /cover/), [/goldFind/])[0]).toMatch(/never reads goldFind/);
    // A skipped ancestor.
    const skipped = ["describe.skip('outer', () => {", "  it('cover', () => {", '    expect(1).toBe(1);', '  });', '});'].join('\n');
    expect(pointerProblems(blockBodyIn(skipped, /cover/), [])[0]).toMatch(/skipped describe/);
    // An enclosing describe is not a cover: its body is every block under it,
    // so anchoring at a file's wrapper satisfies any `reads` at all (QA
    // re-pointed all thirteen §4 rows at one wrapper and stayed green).
    const wrapper = [
      "describe('all the passives', () => {",
      "  it('one', () => {",
      '    expect(signal.a(c)).toBe(1);',
      '  });',
      "  it('two', () => {",
      '    expect(signal.b(c)).toBe(1);',
      '  });',
      '});',
    ].join('\n');
    expect(pointerProblems(blockBodyIn(wrapper, /all the passives/), [/signal\.a/])[0]).toMatch(/nested it\/describe/);
  });

  it('killEntries splits a KILLS table by braces over blanked source', () => {
    const table = [
      'const KILLS: readonly Kill[] = [',
      "  { name: 'A', classKey: 'swordsman', measure: signal.a, mutate: (r) => void delete r.towerPassive.mods.towerAttackSpeed },",
      '  {',
      "    name: 'B',",
      "    classKey: 'paladin',",
      '    measure: signal.b,',
      '    mutate: (r) => {',
      '      delete r.towerPassive.mods.towerHp;',
      '    },',
      '  },',
      '];',
    ].join('\n');
    expect(killEntries(table)).toEqual([
      { name: 'A', classKey: 'swordsman', slot: 'towerPassive', key: 'towerAttackSpeed', measure: 'a' },
      { name: 'B', classKey: 'paladin', slot: 'towerPassive', key: 'towerHp', measure: 'b' },
    ]);
    // A `]` in a comment used to end the scan two entries in, and four ledger
    // rows went red blaming `/data` (QA). A brace in a `name` did the same.
    const commented = table.replace('const KILLS: readonly Kill[] = [', 'const KILLS: readonly Kill[] = [\n  // ordered as the its above, so KILLS[0] is the Swordsman\'s');
    expect(killEntries(commented), 'a comment containing `]` still ends the scan').toHaveLength(2);
    const braced = table.replace("name: 'A'", "name: 'A { odd }'");
    expect(killEntries(braced), 'a brace inside a name still merges entries').toHaveLength(2);
    // A merged entry is a named failure, not a mis-pairing: two entries whose
    // separating brace is gone parse as one, and the per-entry regexes would
    // otherwise pair the first row's class with the second row's deletion.
    const merged = table.replace(
      "  { name: 'A', classKey: 'swordsman', measure: signal.a, mutate: (r) => void delete r.towerPassive.mods.towerAttackSpeed },",
      "  { name: 'A', classKey: 'swordsman', measure: signal.a, mutate: (r) => void delete r.towerPassive.mods.towerAttackSpeed,",
    );
    expect(() => killEntries(merged)).toThrow(/never closes/);
    // ...and the other merge shape, where the entries do close but as one:
    // two `classKey` fields in a single entry, which is what would let the
    // regexes pair one row's class with another row's deletion.
    const twoKeys = table.replace("  {\n    name: 'B',", "    name: 'B',");
    expect(() => killEntries(twoKeys)).toThrow(/classKey fields/);
    expect(() => killEntries('const other = [];')).toThrow(/no `const KILLS/);
  });

  it('blankNonCode preserves length and blanks only what is not code', () => {
    const src = "const a = 'x]y'; // ]\n/* } */ const b = `t}`;\n";
    const out = blankNonCode(src);
    expect(out.length, 'offsets would shift').toBe(src.length);
    expect(out).not.toContain(']');
    expect(out).not.toContain('}');
    expect(out, 'code was blanked too').toContain('const a = ');
    expect(out.split('\n').length, 'newlines are kept so line numbers survive').toBe(src.split('\n').length);
    // An escaped quote inside a string does not end it.
    expect(blankNonCode("const s = 'a\\'] b'; const t = 1;")).toContain('const t = 1;');
  });

  it('blankNonCode has one blind spot, and it is written down rather than discovered again', () => {
    // A regex literal containing a quote desyncs the state machine — measured
    // on `src/ui/hub.ts:111` (`.replace(/'/g, '&#39;')`), where 362 lines came
    // back blanked and a scan over them saw nothing. Pinned as a *known
    // limitation* so the next caller reads it here instead of finding it the
    // way c031's reviewer did: by checking whether a mutation that should be
    // red is green.
    const desync = "const a = 1;\nx.replace(/'/g, '&#39;');\nconst visible = 2;\n";
    expect(blankNonCode(desync)).toContain('const a = 1;');
    expect(blankNonCode(desync), 'blankNonCode learned about regex literals — update its header and c031').not.toContain(
      'const visible = 2;',
    );
    // Everything else it claims, it does.
    expect(blankNonCode("const a = 1; // '\nconst b = 2;")).toContain('const b = 2;');
    expect(blankNonCode("const s = 'a/*b*/c'; const t = 3;")).toContain('const t = 3;');
  });

  it('the device has exactly one home', () => {
    // c028's own reason for existing. A ledger that hand-copies the reader
    // keeps whichever of the rules above the copier noticed, which is the
    // `c014` failure (six copies of one board) in another file.
    //
    // Two things code review broke in the first draft of this check, both
    // measured: it read `tests/` **non-recursively**, so an identical copy in
    // `tests/helpers/ledger2.ts` — exactly where a shared helper would land —
    // passed; and it matched on the **function names**, so a copy renamed
    // `readBlock` passed too, which is what a §4 copier adapting the device
    // would actually produce. So the sweep recurses and looks for the reader's
    // own *structure* as well as its names.
    const FINGERPRINTS: readonly RegExp[] = [
      /function blockBodyIn\s*\(/,
      /function defaultReads\s*\(/,
      // The lookbehind boundary and the title scan: a rename-copy carries
      // both, and no other test file in this repo contains either.
      /\(\?<!\[A-Za-z0-9_\]\)/,
      /\^\\s\*\(it\|describe\)\\\(/,
    ];
    const mine = ['equip-spec-ledger.ts', 'equip-spec-ledger.test.ts'];
    const copies: string[] = [];
    for (const f of readdirSync(TESTS_DIR, { recursive: true, encoding: 'utf8' })) {
      if (!f.endsWith('.ts') || mine.includes(f)) continue;
      const src = readFileSync(join(TESTS_DIR, f), 'utf8');
      if (FINGERPRINTS.some((re) => re.test(src))) copies.push(f);
    }
    expect(copies, 'a second private copy of the spec-ledger device').toEqual([]);
    // The sweep has to be able to see a copy, or "no copies" means "no files
    // read". Positive control: the module itself carries every fingerprint.
    const self = readFileSync(join(TESTS_DIR, 'equip-spec-ledger.ts'), 'utf8');
    for (const re of FINGERPRINTS) expect(self, `the sweep looks for ${re.source}, which the module does not have`).toMatch(re);
    // And the one home is really imported by the ledger that needs it, so the
    // check above cannot pass by the device having no users at all.
    expect(sourceOf('tests/equip-spec-numbers.test.ts')).toMatch(/from '\.\/equip-spec-ledger';/);
  });
});
