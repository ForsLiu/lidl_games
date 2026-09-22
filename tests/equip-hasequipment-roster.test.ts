/**
 * c031 (BACKLOG-CONTENT, lane `content`) — **the `hasEquipment` roster.**
 *
 * SPEC-FINAL §7's three non-stat mechanics — Sleeve Sword's no-charge Circle
 * Slash, Swordsman Armor's charge-rate rule and its cross-item damage swap,
 * Swordsman Shoes' doubled Dash Slash — are gated in `src/sim/classes.ts` on
 * `hasEquipment(w, '<item key>')`. Every other §7 line is a `mods` entry that
 * `Stats` folds generically, which is why these are the only ones.
 *
 * So the real contract between `data/equipment.json` and `/src` for those
 * three items is **a set of string literals no test enumerates**. Three things
 * follow, and `c023` measured the first:
 *
 *   - `equipment.items[].effectKey` — the `/data` field that *looks* like it
 *     carries this contract — is read by nothing. `c023` set `sleeve_sword`'s
 *     to `"none"` and seven suites stayed green. So the field a reader would
 *     grep for is documentation, and the binding lives in these literals.
 *   - Renaming an item key in `/data` silently turns its mechanic off. The
 *     loader validates slots and `classFallback.notClassKey` against the class
 *     roster (`content.ts`, fb015) and has nothing to say about these.
 *   - `fb056` appends **fifteen** items to that file, several with mechanics
 *     of their own, which is when a fourth and fifth literal appear and when a
 *     rename is least affordable.
 *
 * This file is the barrier, and it is a measurement only: the `effectKey` /
 * `effectNums` decision is main-lane (`c023`'s Log entry), because it moves
 * `src/sim/content.ts`.
 *
 * **fb085 update:** the main-lane decision landed — `effectKey` opened from
 * the closed 4-member enum this file used to scrape into a validated open
 * registry (`KNOWN_EQUIPMENT_EFFECT_KEYS`, content.ts), and a new
 * `equipmentEffectNum` helper (`sim/equipment.ts`) gates three more items'
 * (Ring of Contagion/Chronomail/Bracer of Overlap) engine hooks the same
 * `hasEquipment`-by-item-key way, just not via a direct `hasEquipment(w,
 * '<literal>')` call `CALL_SITES` would pick up (see the raw-cross-check
 * below). The three-item roster this file is actually about — the ones
 * `classes.ts` gates directly — is unchanged.
 *
 * refs: SPEC-FINAL §7, c012, c022, c023, fb056.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';
import { blankNonCode, sourceOf } from './equip-spec-ledger';

const content = loadContent();

const SRC_ROOT = fileURLToPath(new URL('../src', import.meta.url));

/** A repo-relative path, sliced from the scan root rather than from the first `/src/` in it. */
function rel(full: string): string {
  return `src/${full.slice(SRC_ROOT.length + 1)}`;
}

/** Every `/src` file, so the scan does not depend on a hand-listed set of files. */
const SRC_FILES = (() => {
  const root = SRC_ROOT;
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.ts')) out.push(full);
    }
  };
  walk(root);
  return out.sort();
})();

const CLASSES_TS = SRC_FILES.find((f) => f.endsWith('/sim/classes.ts'))!;
const CONTENT_TS = SRC_FILES.find((f) => f.endsWith('/sim/content.ts'))!;

/**
 * Whether `raw` names `key` as a **string literal in code** — not in a
 * comment, and not by accident.
 *
 * `blankNonCode` blanks a literal's *contents* while keeping its quotes and
 * its length, so a naive `blanked.includes("'sleeve_sword'")` can never match
 * anything and the check that uses it is vacuously green. The offsets are what
 * make the pair usable: a quote in the blanked text at the same index as one
 * in the raw text is a real string literal; inside a comment both are blanked.
 */
function namesKeyInCode(raw: string, key: string): boolean {
  const code = blankNonCode(raw);
  const needle = `'${key}'`;
  for (let i = raw.indexOf(needle); i >= 0; i = raw.indexOf(needle, i + 1)) {
    if (code[i] === "'" && code[i + needle.length - 1] === "'") return true;
  }
  return false;
}

/** One `hasEquipment(w, '<key>')` call site: the file it is in, and the key it names. */
interface CallSite {
  file: string;
  key: string;
}

const CALL_SITES: readonly CallSite[] = SRC_FILES.flatMap((full) => {
  // Comments and strings blanked *except* the literal we are reading, so a
  // `hasEquipment` mentioned in a doc comment is not a call site. The keys are
  // recovered from the raw text at the same offsets, which `blankNonCode`
  // guarantees by preserving length.
  const raw = readFileSync(full, 'utf8');
  const code = blankNonCode(raw);
  const out: CallSite[] = [];
  // `blankNonCode` preserves length, so a blanked literal reads `'   '` — the
  // quotes stay and the contents become spaces. That is what makes it safe to
  // recover the key from the raw text at the same offset.
  // The receiver is `[^,)]+`, not `\w+`, and either quote style is accepted:
  // `hasEquipment(this.w, …)` and a double-quoted key are both call sites, and
  // a scan that cannot see them is a barrier with a hole in it (code review).
  for (const m of code.matchAll(/hasEquipment\(\s*[^,)]+,\s*(?:' *'|" *")/g)) {
    // .split(str, 1) always returns at least one element.
    const line = raw.slice(m.index!).split('\n', 1)[0] ?? '';
    const key = /hasEquipment\(\s*[^,)]+,\s*(['"])([^'"]+)\1/.exec(line);
    if (!key) throw new Error(`c031: cannot read the item key at ${full}:${m.index}`);
    // Group 2 is non-optional in the pattern, so a successful match always
    // populates it.
    const itemKey = key[2];
    if (itemKey === undefined) throw new Error(`c031: unreachable — group 2 is required at ${full}:${m.index}`);
    out.push({ file: rel(full), key: itemKey });
  }
  return out;
});

/**
 * The roster: every item §7 gives a mechanic that is not stat-shaped, and the
 * §7 Effect clause that authorises the literal. A call site naming a key that
 * is not here is a mechanic nobody's spec sentence asked for.
 */
const AUTHORISED: readonly { key: string; clause: string; why: string }[] = [
  {
    key: 'sleeve_sword',
    clause: 'Circle Slash needs no charge and fires at max-charge effect',
    why: 'A charge-state rule, not a magnitude: `useClassActive1` starts the hold at `cap`.',
  },
  {
    key: 'swordsman_armor',
    clause: 'Circle Slash charging speed = original × attack speed',
    why:
      'A rate stated in terms of another stat, plus the cross-item swap in the same cell ' +
      '("if sleeve sword equipped, Circle Slash damage is boosted by attack speed instead").',
  },
  {
    key: 'swordsman_shoes',
    clause: 'double Dash Slash distance',
    why:
      'The one §7 figure that is a `/src` literal rather than a `/data` row — `mods` has no stat ' +
      "key meaning \"scale one Active's range\". `equip-spec-numbers`'s `in_code` row pins the 2.",
  },
];

/** §7's own text, so a clause cannot be invented here. */
const SPEC_7_TEXT = (() => {
  const spec = readFileSync(fileURLToPath(new URL('../SPEC-FINAL.md', import.meta.url)), 'utf8');
  const start = spec.indexOf('## 7. Equipment');
  const end = spec.indexOf('## 8. Rewards');
  if (start < 0 || end < 0) throw new Error('c031: cannot locate SPEC-FINAL §7');
  return spec.slice(start, end).replace(/\r\n/g, '\n');
})();

describe('c031 — every hasEquipment literal is a §7 mechanic, and every key it names exists', () => {
  it('the scan found the call sites it is reading', () => {
    // A regex that silently matched nothing would make every row below
    // vacuous. Exact, not a floor: a call site that disappears is as
    // interesting as one that appears.
    // Nine, not five: three lines in classes.ts carry two calls each (the
    // cross-item rule asks about both items in one condition), plus fb148's
    // read of swordsman_shoes in class-live.ts for the bottom-bar/character
    // panel Dash Slash tooltip.
    expect(CALL_SITES.length, 'the hasEquipment scan found a different number of call sites').toBe(9);
    // **The raw cross-check, and it is not belt-and-braces.** `blankNonCode`
    // has no regex-literal state, so a quote inside a regex desyncs it — code
    // review measured 362 lines of `src/ui/hub.ts` coming back blanked because
    // of one `.replace(/'/g, ...)`. A call site in a region like that is
    // invisible to the blanked scan, which is exactly the mutation this file
    // must catch. Counting the raw text cannot go blind that way.
    const rawCalls = SRC_FILES.reduce((n, f) => n + (readFileSync(f, 'utf8').match(/hasEquipment\(/g) ?? []).length, 0);
    expect(
      rawCalls,
      'a `hasEquipment(` in /src that the blanked scan did not see — check blankNonCode’s known blind spot',
    ).toBe(CALL_SITES.length + 4); // +4: the `export function` in sim/equipment.ts,
    // fb148's doc comment in class-info.ts quoting the class-live.ts call verbatim, and
    // (fb085) `equipmentEffectNum`'s own internal `hasEquipment(w, itemKey)` call in the
    // same file — a *parameterized* gate (no string literal), so `CALL_SITES` correctly
    // does not carry it, but the raw scan still sees the substring — and (fb056)
    // `classEquipmentActive`'s own parameterized `hasEquipment(w, itemKey)`, the gate
    // every §7.1 class-set hook reads through, for the same reason.
    // Per key, so a lost call site names the item rather than arriving as a
    // bare arity mismatch.
    const perKey: Record<string, number> = {};
    for (const c of CALL_SITES) perKey[c.key] = (perKey[c.key] ?? 0) + 1;
    expect(perKey, 'the per-item call-site census moved').toEqual({
      sleeve_sword: 4,
      swordsman_armor: 3,
      swordsman_shoes: 2,
    });
    // classes.ts still holds the gate; fb148's class-live.ts reads the same
    // flag (read-only, for the tooltip) rather than inventing a second gate —
    // both are accounted for below, so a *third* file appearing is still caught.
    expect(new Set(CALL_SITES.map((c) => c.file)), 'an unaccounted-for file now gates on an item key').toEqual(
      new Set(['src/sim/classes.ts', 'src/ui/class-live.ts']),
    );
    // And the scan can see a call site at all — the positive control, since
    // "no unauthorised keys" is trivially true of an empty list.
    expect(new Set(CALL_SITES.map((c) => c.key)).size).toBe(3);
    // And no *unaccounted* roster elsewhere: sleeve_sword and swordsman_armor
    // are named nowhere but classes.ts and the enum copy; swordsman_shoes is
    // additionally read (not gated) by class-live.ts's tooltip builder.
    for (const a of AUTHORISED) {
      const elsewhere = SRC_FILES.filter((f) => f !== CLASSES_TS && namesKeyInCode(readFileSync(f, 'utf8'), a.key));
      const expected =
        a.key === 'swordsman_shoes'
          ? ['src/sim/content.ts', 'src/ui/class-live.ts']
          : ['src/sim/content.ts'];
      expect(
        elsewhere.map(rel).sort(),
        `${a.key} is named in /src somewhere this item has not accounted for`,
      ).toEqual(expected);
    }
    // **And that second home is the finding, not an exemption.** `content.ts`
    // repeats all three keys in its `effectKey` registry (fb085: opened from
    // a closed zod enum into `KNOWN_EQUIPMENT_EFFECT_KEYS`, still not itself
    // a runtime dispatch key — `c023`'s point survives the opening). So the
    // roster is written twice: once where it is load-bearing (`classes.ts`)
    // and once where it is decoration, and the decoration is the copy a
    // reader finds first. The two
    // copies are held to each other in the last row of this file.
  });

  it('every literal names an item data/equipment.json actually authors', () => {
    // The failure `c023` makes possible: rename an item key in `/data` and its
    // mechanic silently stops firing. The loader checks slots and
    // `classFallback.notClassKey` and has nothing to say about these.
    for (const c of CALL_SITES) {
      expect(
        content.equipmentByKey.get(c.key),
        `${c.file}: gates on "${c.key}", which data/equipment.json does not author`,
      ).toBeDefined();
    }
  });

  it('every literal is authorised by a §7 Effect clause, quoted verbatim', () => {
    const keys = [...new Set(CALL_SITES.map((c) => c.key))].sort();
    expect(keys, 'a hasEquipment literal that no §7 mechanic authorises — or one that vanished').toEqual(
      AUTHORISED.map((a) => a.key).sort(),
    );
    for (const a of AUTHORISED) {
      expect(SPEC_7_TEXT, `${a.key}: §7 does not contain "${a.clause}"`).toContain(a.clause);
      // The clause has to be in *that item's own* Effect cell, or a mechanic
      // could be authorised by somebody else's sentence.
      const row = SPEC_7_TEXT.split('\n').find((l) => l.startsWith('|') && l.includes(a.clause));
      expect(row, `${a.key}: "${a.clause}" is not in a §7 table row`).toBeDefined();
      // The row's **first cell**, not a substring of the whole row: Swordsman
      // Armor's Effect cell names `sleeve sword` in its cross-item clause, so
      // a `toContain` here passes for the one mis-pairing §7 most needs kept
      // apart (code review measured it).
      const name = content.equipmentByKey.get(a.key)!.name.toLowerCase();
      const firstCell = row!.split('|')[1];
      if (firstCell === undefined) throw new Error(`${a.key}: the §7 row has no first cell`);
      expect(firstCell.trim().toLowerCase(), `${a.key}: the clause is in another item's row`).toBe(name);
      expect(a.why.trim().length, `${a.key}: no reason given`).toBeGreaterThan(20);
    }
  });

  it('c023 still holds: the literals are the binding, and the field that looks like it is not', () => {
    // Deliberately **not** a second `.effectKey` census — that is
    // `tests/equip-effectkey-reach.test.ts`'s (c023), which also asserts the
    // two allowed mentions are still *present*, the positive control a bare
    // `toEqual([])` here would lack. What this row adds is the pointer: if
    // that file stops measuring it, c031's premise is unwatched.
    expect(
      sourceOf('tests/equip-effectkey-reach.test.ts'),
      "c023's effectKey measurement is gone — c031's premise (the field is dead, the literals are live) is unwatched",
    ).toMatch(/effectKey/);
    // And the one thing c023 does not say: the three keys `classes.ts` gates
    // on are still all present in the decoration, so the decoration and the
    // binding have not drifted apart while both were unwatched.
    //
    // fb085: the closed 4-member `effectKey: z.enum(...)` this row used to
    // scrape is gone — `effectKey` opened into a validated *registry*
    // (`KNOWN_EQUIPMENT_EFFECT_KEYS`, content.ts) so fb056's remaining
    // bespoke items don't each need a schema edit. That registry is no
    // longer a plain list of "the three keys classes.ts gates on": it also
    // carries the three fb085(d) hook keys (Ring of Contagion/Chronomail/
    // Bracer of Overlap), which `hasEquipment` never gates on directly (they
    // route through `equipmentEffectNum` instead — see the raw-cross-check
    // comment above). So this is now a subset check, not an exact-set one —
    // c023's own point (the registry is decoration, not the binding) still
    // holds; the binding is still exactly `CALL_SITES`.
    const registryBlock = readFileSync(CONTENT_TS, 'utf8').match(
      /const KNOWN_EQUIPMENT_EFFECT_KEYS = new Set<string>\(\[([\s\S]*?)\]\);/,
    );
    expect(registryBlock, 'the effectKey registry moved — c023 and c031 both describe it').toBeDefined();
    // Group 1 is non-optional in the pattern, so a successful match always
    // populates it.
    const registryBody = registryBlock![1];
    if (registryBody === undefined) throw new Error('unreachable: group 1 is required');
    const listed = [...registryBody.matchAll(/'([a-z_]+)'/g)]
      .map((m) => m[1])
      .filter((k): k is string => k !== undefined && k !== 'none');
    for (const key of new Set(CALL_SITES.map((c) => c.key))) {
      expect(listed, `${key} is gated in classes.ts but missing from the effectKey registry`).toContain(key);
    }
  });
});
