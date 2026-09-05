/**
 * c028 — the **spec-ledger device**, owned once.
 *
 * **On the name.** The module is ledger-generic — `c027` uses it on the §4
 * ledger, which is about classes, not equipment — and it is called
 * `equip-spec-ledger` only because the content lane's Scope allows new test
 * files under `tests/class-*` and `tests/equip-*` and nothing else. An
 * acceptance clause this lane wrote for itself cannot widen its own Scope
 * (code review, c028), and of the two legal prefixes `equip-` is the safe one:
 * `tests/class-board.test.ts` registry-checks every `tests/class-*.test.ts`.
 * The rename to `tests/spec-ledger.ts` is logged as a one-line main-lane
 * follow-up.
 *
 * `c008` and `c012` built ledgers that hold SPEC-FINAL's stated numbers to
 * `/data` (§4's on `data/classes.json`, §7's on `data/equipment.json`). `c022`
 * added the half a number-ledger cannot state on its own: a row can carry the
 * right figure on a stat the spec never mentions, and audit that instead — QA
 * moved §7's "tower upgrade cost −20%" onto `goldFind`, in `/data` *and* in the
 * ledger row, and the whole file stayed green. The answer was a **behavioural
 * pointer**: an anchored `describe`/`it` whose body reads the row's own stat.
 *
 * That device is ~100 lines and every one of them was earned by a mutation
 * that got past an earlier draft. It is extracted here before `c027` copies it
 * onto the §4 ledger, because a hand-copy loses whichever of these the copier
 * does not notice — the exact shape `c014` spent an item undoing for six copies
 * of one board:
 *
 *   - **The block ends by indentation, not by matching `<indent>});`.** An
 *     exact-string scan walks straight past a per-test timeout closer
 *     (`}, 20000);`, which 20 files here use) or a closer with a trailing
 *     comment, and stops at the *next sibling's* — so the body silently
 *     swallows a neighbouring block, and a row re-pointed at a stat that
 *     neighbour reads goes green.
 *   - **The title line is not the body.** Most anchors name their stat in the
 *     title, so including it makes `reads` self-satisfying: a claim about the
 *     row's own declared string rather than about code.
 *   - **Comments are stripped.** A bare `// luck` inside a block was enough to
 *     "cover" a row moved onto `luck`.
 *   - **`reads` is closed on the left by an identifier boundary.** As a bare
 *     substring, `atkFlat` is satisfied by `towerAtkFlat` and `armor` by the
 *     item key `swordsman_armor` — the two pairs a §7 ledger most needs to keep
 *     apart. It stays open on the right so a derived factor named after its
 *     stat (`areaMul`, `towerRangeMul`, `leechAccumulator`) still counts.
 *   - **The pointer binds the item as well as the stat**, or a row for one item
 *     covers itself with a block that equips another.
 *   - **A `describe.skip` above the block disarms it**, and `.skip` is a
 *     sanctioned move here (CLAUDE.md working rule 6), so ancestors are
 *     reported and refused.
 *   - **The decoy roster is derived**, never listed: a hardcoded roster carries
 *     the precondition "no row authors this key", which the acceptance mutation
 *     itself breaks.
 *
 * Everything here is pure in its input except `sourceOf`, so
 * `tests/equip-spec-ledger.test.ts` exercises the reader on synthetic source rather
 * than only on whatever the suite happens to contain today.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** A row's behavioural pointer: which block proves this row's stat does anything. */
export interface Behaviour {
  /** The test file holding the covering block, repo-relative. */
  coveredBy: string;
  /** The `describe`/`it` title that covers this row. Must match exactly one title in `coveredBy`. */
  anchor: RegExp;
  /**
   * What the anchored block's **body** must contain. Defaults to the row's own
   * stat key and item key (`defaultReads`). An override must come with a
   * `why` — it is the one way this check can be loosened, so it is a visible
   * edit, and each ledger declares its own roster of rows allowed to use it.
   */
  reads?: readonly RegExp[];
  why: string;
}

export interface Block {
  /** The matched `it`/`describe` line, trimmed. Empty when `matches !== 1`. */
  title: string;
  /** The block's body: comments stripped, title line excluded. */
  body: string;
  /**
   * The body with **string literals** blanked as well. Used for "does this
   * block assert anything?", which QA satisfied with `['expect(x)'].join('')`
   * — a quoted sample of an assertion is not an assertion. `body` keeps its
   * strings because a §7 pointer's owner binding is an item key, and item keys
   * only ever appear quoted (`equipment: ['normal_necklace']`).
   */
  codeBody: string;
  /** The enclosing `describe`/`it` lines, innermost first — where a `.skip` would hide. */
  ancestors: string[];
  /** How many titles the anchor matched. Anything but 1 leaves the other fields empty. */
  matches: number;
}

const SOURCES = new Map<string, string>();

/** A repo-relative file's text, read once per process. */
export function sourceOf(file: string): string {
  const cached = SOURCES.get(file);
  if (cached !== undefined) return cached;
  const text = readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), 'utf8');
  SOURCES.set(file, text);
  return text;
}

/** Strips comments so prose about a stat never counts as reading it. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Blanks string and template literals, keeping the quotes so offsets read sanely. */
export function stripStrings(text: string): string {
  return text
    .replace(/`(?:[^`\\]|\\[\s\S])*`/g, '``')
    .replace(/'(?:[^'\\\n]|\\[\s\S])*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\[\s\S])*"/g, '""');
}

/**
 * The body of the `describe`/`it` an anchor names. Pure in its input; see the
 * header for why each of these rules exists.
 */
export function blockBodyIn(text: string, anchor: RegExp): Block {
  const ls = text.split('\n');
  const hits = ls.map((l, i) => [l, i] as const).filter(([l]) => /^\s*(it|describe)\(/.test(l) && anchor.test(l));
  if (hits.length !== 1) return { title: '', body: '', codeBody: '', ancestors: [], matches: hits.length };
  const [line, i] = hits[0];
  const indent = /^\s*/.exec(line)![0];
  // The end is the first line back at the block's own indentation, whatever it
  // says — and anything at that column that is not a closer is an error rather
  // than a swallow.
  let end = -1;
  for (let j = i + 1; j < ls.length; j++) {
    if (ls[j].trim() === '') continue;
    if (/^\s*/.exec(ls[j])![0].length > indent.length) continue;
    if (!/^\s*\}/.test(ls[j])) {
      throw new Error(
        `spec-ledger: the block at line ${i + 1} does not close - line ${j + 1} is back at its indentation ` +
          `but is not a closer: "${ls[j].trim()}"`,
      );
    }
    end = j;
    break;
  }
  if (end < 0) throw new Error(`spec-ledger: cannot find the end of the block at line ${i + 1} - "${line.trim()}"`);

  const ancestors: string[] = [];
  let want = indent.length;
  for (let j = i - 1; j >= 0 && want > 0; j--) {
    if (ls[j].trim() === '') continue;
    const w = /^\s*/.exec(ls[j])![0].length;
    if (w < want && /^\s*(describe|it)[.(]/.test(ls[j])) {
      ancestors.push(ls[j].trim());
      want = w;
    }
  }
  const body = stripComments(ls.slice(i + 1, end + 1).join('\n'));
  return { title: line.trim(), body, codeBody: stripStrings(body), ancestors, matches: 1 };
}

/** The same, against a repo-relative file. */
export function blockBody(file: string, anchor: RegExp): Block {
  return blockBodyIn(sourceOf(file), anchor);
}

/** Escapes a literal for use inside a `RegExp`. */
export function escapeForRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * What a pointer must find in its block when its row declares no `reads`: the
 * row's own stat key, bounded on the left, and its own item/class key.
 */
export function defaultReads(stat: string, owner: string): readonly RegExp[] {
  return [readsStat(stat), new RegExp(escapeForRegex(owner))];
}

/**
 * One name, matched the way `reads` matches a stat: closed on the left by an
 * identifier boundary, open on the right. The boundary is written **once**, in
 * the module whose whole point is one home — an earlier draft had it in two
 * places, which is exactly how the two would come to disagree.
 */
export function readsStat(stat: string): RegExp {
  return new RegExp(`(?<![A-Za-z0-9_])${escapeForRegex(stat)}`);
}

/**
 * The decoy roster: every stat key the ledger's own `/data` file authors
 * nowhere, minus the names a covering block reads for some other reason (a
 * function `/src` exports under the same word). Derived rather than listed —
 * see the header.
 */
export function decoyKeys<K extends string>(
  all: readonly K[],
  authored: ReadonlySet<string>,
  exempt: Readonly<Record<string, string>>,
): readonly K[] {
  return all.filter((k) => !authored.has(k) && exempt[k] === undefined);
}

/**
 * Lines of a block a `reads` match could plausibly come from: negative
 * controls are excluded, because proving a decoy *unaffected* is exactly the
 * kind of assertion a ledger asks for elsewhere and must not be punished for.
 *
 * `control` is a parameter and not a constant because the second shape is a
 * **naming convention, not a language rule**: §7's covers name their control
 * world `wNone`, so `toBeCloseTo(wNone.derived…)` reads as a control there.
 * Code review surveyed the §4 suites and found their control operands are
 * `full.`, `poison.`, `plain.`, `both.`, `BASE.`, `f.`, `c.` — not one starts
 * with `w`. Baking §7's convention into the shared module would hand `c027`
 * the false red this filter exists to prevent. Widening the default instead
 * (`toBeCloseTo\(\s*[A-Za-z_]`) would swallow §7's own *positive* rows, so the
 * caller says which shape means "control" in its own files.
 */
export function positiveLines(body: string, control: RegExp = /toBeCloseTo\(w[A-Za-z]*\./): string {
  return body
    .split('\n')
    .filter((l) => !l.includes('.not.') && !control.test(l))
    .join('\n');
}

/**
 * The five rules a behavioural pointer must satisfy, as a list of problems —
 * empty when the pointer holds. Each is a mutation that got past an earlier
 * draft, which is why they travel together: a ledger that re-implements the
 * loop keeps whichever ones its author noticed.
 *
 * The caller supplies the block (so it chooses the file and anchor) and the
 * `reads` it expects, and keeps its own row identity in the failure message.
 */
export function pointerProblems(block: Block, reads: readonly RegExp[]): string[] {
  const out: string[] = [];
  // Zero means the covering block was deleted or renamed — the property the
  // anchor exists for. Two means the pointer is ambiguous, and the `reads`
  // check below would then be reading a coin flip.
  if (block.matches !== 1) {
    out.push(`${block.matches} blocks match this anchor, expected 1`);
    return out;
  }
  // "Asserts nothing", not "is short". A line count was the first draft's rule
  // and c027 found it wrong in kind: §4's covers are frequently a single
  // `expect(signal.x(...)).toBeGreaterThan(0)`, which is a complete cover, and
  // a body padded to four lines of setup with no assertion is not.
  if (!/\bexpect\(/.test(block.codeBody)) out.push('the anchored block asserts nothing');
  // **A `describe` is not a cover.** The title scan accepts `describe(` as well
  // as `it(` — deliberately, since a two-`it` describe is sometimes the right
  // unit — but an *enclosing* describe's body is every block under it, so
  // anchoring at a file's wrapper satisfies any `reads` at all. QA re-pointed
  // all thirteen §4 rows at one wrapper describe and the ledger stayed green.
  if (/^\s+(?:it|describe)\(/m.test(block.codeBody)) {
    out.push('the anchored block contains nested it/describe blocks — anchor the block that does the covering');
  }
  // A cover inside a skipped ancestor is not a cover. `it.skip(` is caught by
  // the scan itself; a `describe.skip(` above it is not, and would disarm
  // every row pointing into the file while the ledger stayed green.
  for (const a of block.ancestors.filter((x) => /\.(skip|todo)\(/.test(x))) {
    out.push(`its covering block sits inside a skipped describe: ${a}`);
  }
  for (const r of reads) {
    if (!r.test(block.body)) out.push(`the block "${block.title}" never reads ${r.source}`);
  }
  return out;
}

/* ------------------------------------------- c027: reading a KILLS table */

/**
 * A length-preserving blank of everything that is not code: comments and the
 * insides of string/template literals become spaces, so a brace or bracket in
 * a comment or a name cannot steer a scan while every offset still lines up
 * with the original text.
 *
 * A regex pass cannot do this safely — blanking `//...` first eats the `//`
 * inside a string, blanking strings first eats a quote inside a comment — so
 * it is one left-to-right state machine.
 *
 * **Known blind spot, measured, not theoretical: regex literals.** There is no
 * regex-literal state here, and telling `/` division from `/`-a-regex needs
 * real parsing. So a quote inside a regex — `src/ui/hub.ts:111`'s
 * `.replace(/'/g, '&#39;')` — opens string mode and never closes it: **362
 * non-comment lines of that file come back blanked** (code review on c031).
 * Callers that scan `/src` must therefore keep a raw-text cross-check for the
 * thing they are counting; `tests/equip-hasequipment-roster.test.ts` carries
 * one, and its comment says why. Callers that scan `/tests` KILLS tables
 * (`killEntries`) are unexposed today — those files contain no regex literal
 * inside the table — and the same caution applies if that changes.
 */
export function blankNonCode(src: string): string {
  const out: string[] = [];
  let mode: 'code' | 'line' | 'block' | "'" | '"' | '`' = 'code';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (mode === 'code') {
      if (ch === '/' && next === '/') {
        mode = 'line';
        out.push(' ');
        continue;
      }
      if (ch === '/' && next === '*') {
        mode = 'block';
        out.push(' ');
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') {
        mode = ch;
        out.push(ch);
        continue;
      }
      out.push(ch);
      continue;
    }
    if (mode === 'line') {
      if (ch === '\n') {
        mode = 'code';
        out.push(ch);
        continue;
      }
      out.push(' ');
      continue;
    }
    if (mode === 'block') {
      if (ch === '*' && next === '/') {
        out.push(' ', ' ');
        i++;
        mode = 'code';
        continue;
      }
      out.push(ch === '\n' ? '\n' : ' ');
      continue;
    }
    // inside a string literal
    if (ch === '\\') {
      out.push(' ', ' ');
      i++;
      continue;
    }
    if (ch === mode) {
      mode = 'code';
      out.push(ch);
      continue;
    }
    out.push(ch === '\n' ? '\n' : ' ');
  }
  return out.join('');
}

/** One parsed entry of a liveness file's `KILLS` table. */
export interface KillEntry {
  name: string;
  classKey: string;
  /** The `/data` slot the entry deletes from, e.g. `towerPassive`. */
  slot: string;
  /** The `mods` key it deletes. */
  key: string;
  /** The `signal.<name>` it measures. */
  measure: string;
}

const KILLS_MARKER = 'const KILLS: readonly Kill[] = [';

/** Where a file's `KILLS` array starts and ends, so a search can exclude it. */
export function killRegion(src: string): { start: number; end: number } {
  const start = src.indexOf(KILLS_MARKER);
  if (start < 0) throw new Error(`spec-ledger: no \`${KILLS_MARKER}\` to parse`);
  const end = src.indexOf('\n];', start);
  if (end < 0) throw new Error('spec-ledger: the KILLS array never closes');
  return { start, end: end + 3 };
}

/**
 * Every `mods`-deleting entry of a `KILLS` table.
 *
 * **Split by brace depth over blanked source, not by one regex over the file**,
 * and both halves of that are earned. A windowed regex between `classKey` and
 * `mutate` crossed entry boundaries whenever the entries in between deleted a
 * `kind` rather than a `mods` key, pairing one row's class with another row's
 * deletion. And scanning raw characters let a `]` inside a *comment* end the
 * array two entries in — QA wrote one, and four ledger rows went red with a
 * message blaming `/data`.
 */
export function killEntries(src: string): KillEntry[] {
  const scan = blankNonCode(src);
  if (scan.length !== src.length) throw new Error('spec-ledger: the blank pass changed the source length');
  const { start } = killRegion(src);
  const out: KillEntry[] = [];
  let depth = 0;
  let from = -1;
  for (let i = start + KILLS_MARKER.length; i < scan.length; i++) {
    const ch = scan[i];
    if (ch === '{') {
      if (depth === 0) from = i;
      depth++;
    }
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        const entry = src.slice(from, i + 1);
        const keys = (blankNonCode(entry).match(/classKey:/g) ?? []).length;
        if (keys !== 1) {
          throw new Error(
            `spec-ledger: a KILLS entry parsed with ${keys} classKey fields — the brace scan merged or split ` +
              `entries: "${entry.replace(/\s+/g, ' ').slice(0, 90)}"`,
          );
        }
        const name = /name: (['"`])(.+?)\1,/.exec(entry);
        const classKey = /classKey: (['"`])([^'"`]+)\1,/.exec(entry);
        const del = /delete r\.(\w+)\.mods\.(\w+)/.exec(entry);
        const measure = /measure: signal\.(\w+)/.exec(entry);
        if (name && classKey && del && measure) {
          out.push({ name: name[2], classKey: classKey[2], slot: del[1], key: del[2], measure: measure[1] });
        }
      }
    }
    if (depth === 0 && ch === ']') break;
  }
  // An entry whose closing brace is gone swallows the rest of the array and
  // the scan runs off the end at depth > 0 — which returned an **empty list**
  // in the first draft, the quietest possible failure for a parser whose
  // callers ask "is this key anybody's mutation target?". Both shapes throw.
  if (depth !== 0) throw new Error(`spec-ledger: a KILLS entry never closes (depth ${depth} at end of file)`);
  if (out.length === 0) throw new Error('spec-ledger: the KILLS table parsed to zero entries');
  return out;
}
