/**
 * CLI-crash coverage census (BACKLOG-QUALITY q47): automates the
 * "which `tools/*.ts` files are CLI-invocable and crash-unprotected" audit
 * that q37, q41 and q46 each independently re-derived by hand-grepping
 * `tools/*.ts`, three sessions running — the same repeated-manual-
 * re-derivation shape q10's `gate-audit.ts` and q14's mutation smoke already
 * exist to prevent for their own domains.
 *
 * Every `tools/*.ts` file is classified on three *computed* static properties
 * — not hand-curated, so a new file is picked up automatically the moment it
 * exists on disk:
 *
 *   (b) does it transitively **value**-import `src/sim/content.ts`? A `type`
 *       import is erased by esbuild and never triggers module evaluation, so
 *       it cannot reach `loadContent()`'s zod parse or the transform-time
 *       crash on a `/data` JSON syntax error either — only a value import
 *       (static or a `await import(...)`) counts.
 *   (c) does the file contain a `catch` anywhere? A cheap, deliberately
 *       column-blind text check, the same "don't parse the AST, the file's
 *       own convention is what carries the signal" call `gate-audit.ts`'s
 *       `hasLiveTopLevelDescribe` makes. Reported for context; it does not
 *       decide status below, because this lane learned the hard way (q45's
 *       fix landing a `catch` that only guards the *schema*-violation crash,
 *       not the *syntax*-error one a same-named test still pins as expected-
 *       red behaviour) that "has a catch" and "is actually tested" are
 *       different claims — trusting the former to imply the latter is
 *       exactly the "note overstates coverage" trap this lane's log has hit
 *       four separate times (q10, q17, q25 session log).
 *   (d) does it read a `/data/*.json` file directly — `readFileSync` (with
 *       an inline literal, a `const`-bound literal, or a `join('data', ...)`/
 *       `path.join('data', ...)` call mentioning `.json`, code review's own
 *       finding against `tools/fuzz-data.ts` while landing this check) —
 *       followed by `JSON.parse` anywhere in the file — bypassing
 *       `loadContent()` entirely (q54, generalizing q53's hand-found bug in
 *       `tools/m20d-price-probe.ts`)? This is deliberately guard-agnostic,
 *       same reasoning as (c): a file that currently wraps the parse in a
 *       `try` still needs a named pin, or a future guard regression falls
 *       silently back to "safe" — the exact way q53 itself went unnoticed
 *       until a hand-read found it.
 *
 * (a) "is this file meant to be invoked directly as a CLI" is not mechanical
 * — a worker-thread entry point or a pure exported-function library can have
 * top-level executable code (or none) without being a CLI a human would run
 * — so it is a short, named, hand-curated exemption list (`NOT_INVOCABLE`),
 * the same shape as `gate-audit.ts`'s `KNOWN_HOLES`: every entry names its
 * reason, and anything *not* on the list defaults to "yes, invocable," which
 * is the safe default — a new file defaults to being checked, not exempted.
 *
 * Every file that is invocable and imports content but has no named test
 * pinning its crash behaviour (`PIN_COVERAGE`) is a `gap`. `PIN_COVERAGE`
 * is the one part of this file that cannot be computed — "which test file
 * covers this" is exactly the fact `gate-audit.ts`'s `GATE_COVERAGE` also
 * has to curate — but it is small, named, and the whole point of this tool
 * is that a file with no entry here is loud about it rather than silent.
 *
 *   npx tsx tools/cli-crash-coverage.ts
 *   npx tsx tools/cli-crash-coverage.ts --json
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const TOOLS_DIR = resolve(REPO_ROOT, 'tools');
export const CONTENT_PATH = resolve(REPO_ROOT, 'src/sim/content.ts');

/** Every `tools/*.ts` file, repo-relative (`tools/x.ts`), sorted. Recomputed live so a new file is picked up automatically — `.mjs`/non-`.ts` siblings (e.g. `gen-tree.mjs`) are out of scope, same as q47's own count. */
export function listToolFiles(dir: string = TOOLS_DIR): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => `tools/${f}`)
    .sort();
}

/** Cheap, deliberately imprecise text check — see file doc comment for why this is informational, not decisive. */
export function hasCatch(absPath: string): boolean {
  return /\bcatch\s*[({]/.test(readFileSync(absPath, 'utf8'));
}

/** A `/data/*.json`-shaped relative path literal — `data/x.json`, `./data/x/y.json`, `../data/x.json`. Anchored full-match against an already-unquoted string. */
const DATA_JSON_PATH_RE = /^(?:\.\.?\/)?data\/[\w.-]+(?:\/[\w.-]+)*\.json$/;

/** Strips one matching pair of leading/trailing `'` or `"` if present; otherwise returns the trimmed input unchanged. */
function unquote(s: string): string {
  const trimmed = s.trim();
  const m = trimmed.match(/^(['"])(.*)\1$/);
  return m ? m[2] : trimmed;
}

/**
 * Strips `//` and `/* *\/` comments only — unlike
 * `stripCommentsAndBacktickStrings`, every string/template literal is
 * copied through untouched (content and delimiters both), because
 * `READFILESYNC_JOIN_DATA_RE` below needs to see inside a template literal's
 * static text. Comment-start sequences inside any quoted string (including
 * a backtick's `${...}` interpolation, which cannot itself contain an
 * unescaped backtick) are correctly left alone because the scan tracks
 * quote state before checking for `//`/`/*`.
 */
function stripComments(text: string): string {
  let out = '';
  let i = 0;
  const n = text.length;
  let quote: string | null = null;
  while (i < n) {
    const c = text[i];
    if (quote) {
      out += c;
      if (c === '\\' && i + 1 < n) {
        out += text[i + 1];
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      out += c;
      i++;
      continue;
    }
    if (c === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i = Math.min(i + 2, n);
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * A `readFileSync(join('data', ...))` / `readFileSync(path.join('data', ...))`
 * call whose `join`'s first literal argument is exactly `data` or
 * `data/...` and whose remaining arguments mention `.json` — covers both a
 * plain string second argument and a template literal like
 * `` `${file}.json` ``. Found live in `tools/fuzz-data.ts` by q54 code
 * review: the plain-literal-path check in `readsDataJsonDirectly` below
 * cannot see it, because that check runs on
 * `stripCommentsAndBacktickStrings`'s output, which drops template-literal
 * contents entirely to dodge the q47 fixture-string false positive. This
 * regex instead runs on `stripComments`'s output (comments only stripped,
 * strings/templates left intact), so it can see the `.json` inside the
 * template. Deliberately narrow, matched non-greedily up to `join`'s own
 * closing paren — an argument containing an unbalanced `)` (a nested call
 * more elaborate than a literal or simple template) can defeat it; that is
 * no worse than every other regex heuristic in this file, and an
 * undetected case just falls back to whatever this file would have said
 * before this check existed.
 */
const READFILESYNC_JOIN_DATA_RE =
  /\breadFileSync\s*\(\s*(?:path\s*\.\s*)?join\s*\(\s*(['"])data(?:\/[\w.-]+)*\1\s*,([\s\S]*?)\)\s*[,)]/g;

/**
 * A `readFileSync(\`data/x.json\`)`-shaped call: a *non-interpolated*
 * (no `${`) template literal passed directly as `readFileSync`'s first
 * argument, no `join()` wrapper. Runs on `stripComments`'s output for the
 * same reason `READFILESYNC_JOIN_DATA_RE` does — `stripCommentsAndBacktickStrings`
 * drops backtick contents entirely, so `text` below has nothing left to
 * match once this shape's backticks are stripped (b025). Anchored to the
 * literal sitting immediately after `readFileSync(`'s open paren, so a
 * `join(\`data/x.json\`)` call (already covered by the regex above) is
 * never double-matched here.
 *
 * Known limitation (code-reviewer, b025): a bare (no `join()`) *interpolated*
 * template literal, e.g. `` readFileSync(`data/${file}.json`) ``, is not
 * flagged — deliberately excluded by the `$`-guard, since the segment
 * matching `${` makes the runtime path only partially static. This is
 * inconsistent with `READFILESYNC_JOIN_DATA_RE` above, which does flag the
 * same interpolated shape once it's `join()`-wrapped (it only checks the
 * remaining arguments for `.json`, interpolation and all) — narrowing that
 * asymmetry is left for a future session if a live file ever needs it; no
 * `tools/*.ts` file uses either shape today (checked).
 */
const READFILESYNC_TEMPLATE_LITERAL_RE = /\breadFileSync\s*\(\s*`([^`$]*)`/g;

/**
 * Un-quotes and concatenates a `'a' + "b" + 'c'`-shaped string-concatenation
 * expression into the literal value it evaluates to at runtime — e.g.
 * `'data/' + 'x.json'` becomes `data/x.json`. Any non-literal, non-`+`
 * content between the quoted segments (a variable, a function call) breaks
 * the pairwise adjacency `CONCAT_ARG_RE` requires, so this only ever runs on
 * text `CONCAT_ARG_RE` already confirmed is a pure literal chain.
 */
function concatLiteralValue(expr: string): string {
  let out = '';
  for (const m of expr.matchAll(/(['"])([^'"]*)\1/g)) out += m[2];
  return out;
}

/**
 * A `readFileSync('data/' + 'x.json')`-shaped call: two or more
 * single/double-quoted literals joined by `+`, passed directly as
 * `readFileSync`'s first argument (b025). Runs on `text`
 * (`stripCommentsAndBacktickStrings`'s output) since this shape never
 * involves a backtick.
 */
const CONCAT_ARG_RE = /\breadFileSync\s*\(\s*((?:['"][^'"]*['"]\s*\+\s*)+['"][^'"]*['"])\s*[,)]/g;

/**
 * True when `absPath` reads a hardcoded `/data/*.json` path directly via
 * `readFileSync` — an inline string literal argument, a `const NAME =
 * '...'`-bound one, a `join('data', ...)`/`path.join('data', ...)` call
 * whose arguments mention `.json` (q54 code review's `tools/fuzz-data.ts`
 * finding), a bare non-interpolated template literal, or a string-
 * concatenation chain (b025, both QA-filed) — and calls `JSON.parse`
 * anywhere in the file. The q53 crash shape: this bypasses
 * `loadContent()`'s zod guard entirely, so `importsContentTransitively`
 * alone cannot see it. Reuses `stripCommentsAndBacktickStrings` for the same
 * false-positive reasons `importsContentTransitively` does (q47's
 * `mutation-probe.ts` fixture-string regression), except for the checks that
 * need to see inside a template literal's static text, which need
 * `stripComments`'s gentler stripping instead (see those regexes' doc
 * comments). Guard-agnostic on purpose — see file doc comment (d).
 *
 * Known limitations (code review + qa-playtester, q54), same standard as
 * this file's other documented regex gaps: the `const`-binding scan requires
 * a semicolon-terminated single/double-quoted literal (`const FILE =
 * 'data/x.json';`) — a `let`-bound constant, one relying on ASI (no trailing
 * `;`), or a backtick-bound literal path is not recognized as a bound
 * variable. And `READFILESYNC_JOIN_DATA_RE` requires `'data'`/`'data/...'`
 * to be `join`'s *first* argument — `join(dirname(__dirname), 'data',
 * 'x.json')` is not detected, because the literal sits in a later position.
 * Neither shape exists in `tools/*.ts` today (checked).
 *
 * A further false-positive, not a false-negative (qa-playtester verifying
 * b025, filed as b063): `stripCommentsAndBacktickStrings` deliberately
 * copies single/double-quoted string *contents* through untouched (a real
 * import specifier and the `const`-binding literal above both need to
 * survive it), so a `readFileSync('data/x.json')`-shaped call sitting only
 * as the *text* of a single/double-quoted fixture string — e.g. `const
 * fixtureLine = "const d = JSON.parse(readFileSync('data/x.json', 'utf8'));"`
 * — is scanned as if it were real code and flags the file, the same class of
 * gap this file already accepts for a backtick-quoted fixture (q47's
 * `tools/mutation-probe.ts` precedent, `stripCommentsAndBacktickStrings`'s
 * own doc comment), just on the single/double-quote side instead of the
 * backtick side. Distinguishing "inside a string literal used as data" from
 * "real code" would need tracking string-nesting depth this function
 * deliberately doesn't (see that function's doc comment on why quoted
 * content is left untouched); latent today — no live `tools/*.ts` file
 * embeds a `readFileSync('data/...json')`-shaped fixture in a single/
 * double-quoted string (`tools/mutation-probe.ts`'s own fixtures are
 * backtick-quoted, already excluded by the existing gap above; checked).
 */
export function readsDataJsonDirectly(absPath: string): boolean {
  if (!existsSync(absPath)) return false;
  const raw = readFileSync(absPath, 'utf8');
  const text = stripCommentsAndBacktickStrings(raw);
  if (!/\bJSON\.parse\s*\(/.test(text)) return false;

  const boundVars = new Set<string>();
  for (const m of text.matchAll(/\bconst\s+(\w+)\s*=\s*(['"][^'"]*['"])\s*;/g)) {
    if (DATA_JSON_PATH_RE.test(unquote(m[2]))) boundVars.add(m[1]);
  }

  for (const m of text.matchAll(/\breadFileSync\s*\(\s*([^,)]+)/g)) {
    const arg = m[1].trim();
    if (boundVars.has(arg) || DATA_JSON_PATH_RE.test(unquote(arg))) return true;
  }

  for (const m of text.matchAll(CONCAT_ARG_RE)) {
    if (DATA_JSON_PATH_RE.test(concatLiteralValue(m[1]))) return true;
  }

  const commentsStripped = stripComments(raw);
  for (const m of commentsStripped.matchAll(READFILESYNC_JOIN_DATA_RE)) {
    if (/\.json\b/.test(m[2])) return true;
  }
  for (const m of commentsStripped.matchAll(READFILESYNC_TEMPLATE_LITERAL_RE)) {
    if (DATA_JSON_PATH_RE.test(m[1])) return true;
  }
  return false;
}

/** Matches a relative `import`/`export ... from '...'`, a dynamic `import('...')` call (a target module starts evaluating the instant `import(...)` runs, whether or not the result is `await`ed — code review caught the regex requiring a literal `await` first, which missed a fire-and-forget or `.then()`-chained dynamic import), or a bare side-effect `import '...'` (no `from` clause) — value imports only; `import type { X } from '...'` is excluded on purpose (see file doc comment). A bare side-effect import still evaluates its target module, so it counts. The import branch's clause (between `import` and `from`) is captured separately so the per-specifier `{ type X, type Y }` form (q51) can be filtered out below — this regex alone cannot distinguish it from a real named import. */
const VALUE_IMPORT_RE =
  /^\s*import\s+(?!type\s)([^;]*?)\bfrom\s+['"](\.[^'"]+)['"]|^\s*export\s+(?!type\s)[^;]*?\bfrom\s+['"](\.[^'"]+)['"]|\bimport\(\s*['"](\.[^'"]+)['"]\s*\)|^\s*import\s+['"](\.[^'"]+)['"]\s*;/gm;

/**
 * True when an `import`-branch clause (the text between `import` and `from`)
 * is a braced named-imports list where **every** specifier is individually
 * marked `type` (q51) — e.g. `{ type Foo, type Bar }` or `{ type Foo as F }`.
 * Erased by esbuild/tsx exactly like a leading `import type { ... }`, so it
 * must not count as a value import even though `VALUE_IMPORT_RE`'s
 * `(?!type\s)` lookahead — which only rejects a *leading* `type` right after
 * `import` — lets it through.
 *
 * A clause with a default or namespace binding (`Def, { type X }`, `* as ns`)
 * is not this shape — a real value is bound — so it returns false, same as an
 * empty-braces or otherwise-unrecognized clause (fail open toward "value
 * import," this file's existing default for anything ambiguous).
 *
 * Known limitations, accepted rather than solved (code review, q51), same
 * standard as the ones above `stripCommentsAndBacktickStrings`: a specifier
 * of the exact shape `type as X` (no name between `type` and `as`) is real TS
 * grammar for a *value* import of a binding literally named `type`, aliased
 * to `X` — the `/^type\s/` check misreads it as the type-only modifier and
 * would false-negative. And `VALUE_IMPORT_RE`'s `export { ... } from '...'`
 * branch never gained this clause-capture treatment, so a type-only
 * re-export (`export { type Foo } from '../src/sim/content'`) still
 * false-positives symmetrically to the bug this function fixes. Neither
 * shape appears in `tools/*.ts` or `src/sim/*.ts` today (checked).
 */
function isTypeOnlyNamedImportClause(clause: string): boolean {
  const m = clause.trim().match(/^\{([^}]*)\}$/);
  if (!m) return false;
  const specifiers = m[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (specifiers.length === 0) return false;
  return specifiers.every((s) => /^type\s/.test(s));
}

/**
 * Strips `//` and `/* *\/` comments and backtick template-literal contents
 * before the import scan runs, in one context-tracking pass — not two
 * independent regex sweeps. `tools/mutation-probe.ts` embeds real source
 * lines — including `await import('../src/sim/content')` and a `//` line
 * comment — as *string data* inside backtick `find`/`replace` fields, all
 * on one physical line (`\n` is an escape sequence there, not a real
 * newline); a two-pass sweep (strip `//`-to-end-of-line first, then
 * backticks) treats that embedded `//` as a real comment start and eats the
 * rest of the physical line, including the closing backtick — corrupting
 * every backtick pairing after it and producing wrong answers *elsewhere*
 * in the file (caught live while fixing this: the first two-pass attempt
 * broke three unrelated assertions, not just the one it was meant to fix).
 * A single left-to-right scan that treats a backtick as "consume to the
 * next unescaped backtick, unconditionally, no comment logic inside" first
 * avoids the ordering problem entirely.
 *
 * Single/double-quoted strings are copied through untouched (not scanned
 * for comment-like content, not stripped) — a real import specifier is
 * always single/double-quoted, and `VALUE_IMPORT_RE` has to still see it
 * after this runs. The one exception: a backslash-newline line-continuation
 * escape is *not* copied through as a literal newline (q50) — that would
 * leave a real `\n` inside a string's contents for `VALUE_IMPORT_RE`'s
 * `^`-anchored match to false-positive on.
 *
 * Known limitations, accepted rather than solved (code review, q47): this
 * does not distinguish a `/` division operator from a regex-literal
 * delimiter, so a regex literal containing an unescaped `//`-shaped pattern
 * immediately before a real import could still misfire. A backtick-quoted
 * import specifier (e.g. `` import(`../src/sim/content`) ``, no `${}`
 * interpolation, just backtick quoting) is also invisible — this function
 * drops backtick contents unconditionally before `VALUE_IMPORT_RE` ever
 * runs, so there is no quoted string left for it to capture. Neither shape
 * appears in `tools/*.ts` today (checked); a full tokenizer would close
 * both gaps but this repo's own `hasLiveTopLevelDescribe` precedent
 * (gate-audit.ts) is the same trade — text-based and column-anchored rather
 * than a real parser, because the domain is this codebase's own small
 * `tools/*.ts` set, not arbitrary JS.
 *
 * Two more (code review, q47): the bare-side-effect-import alternative in
 * `VALUE_IMPORT_RE` requires a trailing `;`, so an ASI-style import with no
 * semicolon would be silently invisible — checked, every `tools/*.ts` and
 * `src/sim/*.ts` import today uses one. And `resolveRelativeImport` only
 * follows specifiers starting with `.`; a route to `content.ts` through
 * `tsconfig.json`'s `@/*` alias (unused today, checked) would silently
 * classify as `no-content-import` rather than surfacing as a `gap`. Both
 * fail silent rather than raising a false alarm, and neither is live —
 * accepted for the same reason as the two above.
 *
 * One more (code review, q50): the line-continuation fix above only
 * special-cases `\` + `\n` and `\` + `\r\n`. A bare `\r` line terminator
 * (old Mac-style) or `\` followed by the Unicode line separators
 * (U+2028, U+2029) are also valid JS line-continuation targets and would
 * reproduce the same false-positive class — checked, no `tools/*.ts` file
 * uses either today (git/editors normalize them away) — accepted for the
 * same reason as the others above.
 */
function stripCommentsAndBacktickStrings(text: string): string {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '/' && next === '/') {
      while (i < n && text[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i = Math.min(i + 2, n);
      continue;
    }
    if (c === '`') {
      i++;
      while (i < n && text[i] !== '`') i += text[i] === '\\' ? 2 : 1;
      i++; // consume the closing backtick; drop the whole template literal
      continue;
    }
    if (c === "'" || c === '"') {
      const quote = c;
      out += c;
      i++;
      while (i < n && text[i] !== quote) {
        if (text[i] === '\\' && i + 1 < n) {
          // A backslash immediately followed by a real line terminator is a
          // JS line-continuation escape: the newline contributes nothing to
          // the string's value. Copying it through as a literal newline (the
          // old behaviour) leaves a real `\n` inside `out`, which is exactly
          // what VALUE_IMPORT_RE's `^`-anchored, multiline match looks for —
          // a following physical line that happens to start with
          // `import ... from '...'` false-positives even though it is pure
          // string data, never evaluated as an import (q50).
          if (text[i + 1] === '\n') {
            i += 2;
          } else if (text[i + 1] === '\r' && text[i + 2] === '\n') {
            i += 3;
          } else {
            out += text[i] + text[i + 1];
            i += 2;
          }
        } else {
          out += text[i];
          i++;
        }
      }
      if (i < n) {
        out += text[i];
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** An import specifier that already names its own `.ts`/`.tsx` extension (e.g. `from './foo.ts'`) resolves to a real file directly — trying `${base}.ts` first would look for the nonexistent `foo.ts.ts`. Everything else tries the usual `.ts`/`.tsx`/`index.ts` candidates. */
function resolveRelativeImport(fromAbsFile: string, spec: string): string | null {
  const base = resolve(dirname(fromAbsFile), spec);
  const candidates = /\.tsx?$/.test(spec)
    ? [base]
    : [`${base}.ts`, `${base}.tsx`, resolve(base, 'index.ts')];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Does `absPath` reach `contentPath` through a chain of value imports (static or dynamic)? Real static analysis, not a curated list — the automation q47 exists to deliver. */
export function importsContentTransitively(
  absPath: string,
  contentPath: string = CONTENT_PATH,
  seen: Set<string> = new Set(),
): boolean {
  if (seen.has(absPath)) return false;
  seen.add(absPath);
  if (absPath === contentPath) return true;
  if (!existsSync(absPath)) return false;
  const text = stripCommentsAndBacktickStrings(readFileSync(absPath, 'utf8'));
  for (const m of text.matchAll(VALUE_IMPORT_RE)) {
    if (m[1] !== undefined && isTypeOnlyNamedImportClause(m[1])) continue;
    const spec = m[2] ?? m[3] ?? m[4] ?? m[5];
    if (!spec) continue;
    const resolved = resolveRelativeImport(absPath, spec);
    if (resolved && importsContentTransitively(resolved, contentPath, seen)) return true;
  }
  return false;
}

/**
 * (a)'s exemption list: files with no real standalone CLI use, named with
 * why, checked against the live source at the time each was added (q47).
 * Absence from this list is the safe default — a new file is invocable
 * (and therefore checked) unless a human names a reason it isn't.
 */
export const NOT_INVOCABLE: Record<string, string> = {
  'tools/fuzz-data.ts':
    'library only — no `main()`, no `invokedDirectly`/`process.argv[1]` guard, no top-level executable ' +
    'statement; every export is a pure function consumed by other tools (`fuzz-input.ts` and q7\'s data-fuzz ' +
    'probes). Reads `/data` files directly with `readFileSync`, never through `loadContent()`, so it does not ' +
    'import `src/sim/content.ts` either — doubly exempt.',
  'tools/invariants.ts':
    'library only — extracted from `tools/fuzz-input.ts` (q11) so `scanWorld`/`scanReport` have one definition; ' +
    'no top-level executable statement, every export is a pure function. It does transitively value-import ' +
    'content.ts (`STAT_KEYS` from `./stats`, which imports `wardenBase` from `./content`) — (b) is true — but ' +
    'there is no CLI entry point here for a `/data` failure to crash.',
  'tools/fuzz-command-domain-worker.ts':
    'a `node:worker_threads` Worker entry point, spawned only via `new Worker(...)` with a `workerData` payload ' +
    'by `tools/fuzz-command-domain.ts` — never a standalone CLI a human runs with `npx tsx`. It does have top-' +
    'level executable code (`if (!parentPort) throw ...`) and does transitively value-import content.ts through ' +
    'its sibling, so (a) and (b) both read true by the raw check; the exemption is the "not really a CLI" ' +
    'judgment call, the same shape `gate-audit.ts` makes by hand in `KNOWN_HOLES`.',
};

/**
 * Named test files pinning each invocable, content-importing tool's crash
 * behaviour — curated the same way `gate-audit.ts`'s `GATE_COVERAGE` is,
 * because "which test covers this" is not a fact static analysis can derive.
 * Verified against the live suite at the time this was written (q47,
 * 2026-08-27): every file below is named in a `describe`/`describe.each`
 * block in at least the first test listed.
 */
export const PIN_COVERAGE: Record<string, string[]> = {
  'tools/content-census.ts': ['tests/q33-cli-json-syntax-error.test.ts'],
  'tools/phase-coverage.ts': ['tests/q33-cli-json-syntax-error.test.ts'],
  'tools/soak.ts': ['tests/q33-cli-json-syntax-error.test.ts'],
  'tools/sim.ts': ['tests/q37-cli-json-syntax-error-siblings.test.ts'],
  'tools/sweep.ts': ['tests/q37-cli-json-syntax-error-siblings.test.ts'],
  'tools/p10k-sweep.ts': ['tests/q37-cli-json-syntax-error-siblings.test.ts'],
  'tools/handoff-metrics.ts': ['tests/q37-cli-json-syntax-error-siblings.test.ts'],
  'tools/perf-ratio.ts': [
    'tests/q41-cli-json-syntax-error-siblings-2.test.ts',
    'tests/q45-cli-schema-violation.test.ts',
  ],
  'tools/a4probe.ts': [
    'tests/q41-cli-json-syntax-error-siblings-2.test.ts',
    'tests/q45-cli-schema-violation.test.ts',
  ],
  'tools/a5probe.ts': [
    'tests/q41-cli-json-syntax-error-siblings-2.test.ts',
    'tests/q45-cli-schema-violation.test.ts',
  ],
  'tools/fuzz-input.ts': [
    'tests/q41-cli-json-syntax-error-siblings-2.test.ts',
    'tests/q45-cli-schema-violation.test.ts',
  ],
  'tools/fuzz-save.ts': [
    'tests/q41-cli-json-syntax-error-siblings-2.test.ts',
    'tests/q45-cli-schema-violation.test.ts',
  ],
  'tools/fuzz-weapon-boundary.ts': [
    'tests/q41-cli-json-syntax-error-siblings-2.test.ts',
    'tests/q45-cli-schema-violation.test.ts',
  ],
  'tools/fuzz-command-domain.ts': [
    'tests/q41-cli-json-syntax-error-siblings-2.test.ts',
    'tests/q45-cli-schema-violation.test.ts',
  ],
  'tools/m20d-run-a4.ts': [
    'tests/q46-cli-json-syntax-error-siblings-3.test.ts',
    'tests/q45-cli-schema-violation.test.ts',
  ],
  'tools/m20d-swarm.ts': [
    'tests/q46-cli-json-syntax-error-siblings-3.test.ts',
    'tests/q45-cli-schema-violation.test.ts',
  ],
  'tools/probe-boss.ts': [
    'tests/q46-cli-json-syntax-error-siblings-3.test.ts',
    'tests/q45-cli-schema-violation.test.ts',
  ],
  // q54: tools/m20d-price-probe.ts reads data/towers.json directly
  // (readsDataJsonDirectly, not importsContent) — this is the pin for that
  // axis, not the content-import one; q53's fix is what this test covers.
  'tools/m20d-price-probe.ts': ['tests/q53-price-probe-json-crash.test.ts'],
};

export type ClassificationStatus =
  | 'not-invocable'
  | 'no-content-import'
  | 'pinned'
  | 'gap'
  | 'unguarded-data-read';

export interface ToolClassification {
  file: string;
  importsContent: boolean;
  hasCatch: boolean;
  readsDataJsonDirectly: boolean;
  status: ClassificationStatus;
  reason: string;
  testFiles: string[];
}

export function classifyTool(
  file: string,
  absPath: string,
  opts: { contentPath?: string; notInvocable?: Record<string, string>; pinCoverage?: Record<string, string[]> } = {},
): ToolClassification {
  const contentPath = opts.contentPath ?? CONTENT_PATH;
  const notInvocable = opts.notInvocable ?? NOT_INVOCABLE;
  const pinCoverage = opts.pinCoverage ?? PIN_COVERAGE;

  const importsContent = importsContentTransitively(absPath, contentPath);
  const catches = hasCatch(absPath);
  const readsDataJson = readsDataJsonDirectly(absPath);

  const notInvocableReason = notInvocable[file];
  if (notInvocableReason !== undefined) {
    return {
      file,
      importsContent,
      hasCatch: catches,
      readsDataJsonDirectly: readsDataJson,
      status: 'not-invocable',
      reason: notInvocableReason,
      testFiles: [],
    };
  }
  if (!importsContent && !readsDataJson) {
    return {
      file,
      importsContent,
      hasCatch: catches,
      readsDataJsonDirectly: readsDataJson,
      status: 'no-content-import',
      reason: 'does not transitively value-import src/sim/content.ts and does not read a /data/*.json file directly — a /data load failure cannot reach this file',
      testFiles: [],
    };
  }
  const pin = pinCoverage[file];
  if (pin) {
    return {
      file,
      importsContent,
      hasCatch: catches,
      readsDataJsonDirectly: readsDataJson,
      status: 'pinned',
      reason: `pinned by ${pin.join(', ')}`,
      testFiles: pin,
    };
  }
  if (readsDataJson && !importsContent) {
    return {
      file,
      importsContent,
      hasCatch: catches,
      readsDataJsonDirectly: readsDataJson,
      status: 'unguarded-data-read',
      reason:
        'reads a /data/*.json file directly (readFileSync + JSON.parse, bypassing loadContent()) but no test in PIN_COVERAGE names its crash behaviour (q54)',
      testFiles: [],
    };
  }
  return {
    file,
    importsContent,
    hasCatch: catches,
    readsDataJsonDirectly: readsDataJson,
    status: 'gap',
    reason: readsDataJson
      ? 'invocable, imports src/sim/content.ts, and also reads a /data/*.json file directly, but no test in PIN_COVERAGE names its crash behaviour'
      : 'invocable and imports src/sim/content.ts, but no test in PIN_COVERAGE names its crash behaviour',
    testFiles: [],
  };
}

export function classifyAll(files: string[] = listToolFiles(), root: string = REPO_ROOT): ToolClassification[] {
  return files.map((f) => classifyTool(f, resolve(root, f)));
}

/** Every `gap` or `unguarded-data-read` row, the state this tool exists to make loud rather than silently missed. */
export function gaps(rows: ToolClassification[]): ToolClassification[] {
  return rows.filter((r) => r.status === 'gap' || r.status === 'unguarded-data-read');
}

/* ------------------------------------------------------------------- CLI */

function main(argv: string[]): void {
  const json = argv.includes('--json');
  const rows = classifyAll();
  const found = gaps(rows);

  if (json) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    console.log(`cli-crash-coverage — ${rows.length} tools/*.ts files classified`);
    const w = Math.max(...rows.map((r) => r.file.length), 'file'.length) + 2;
    const sw = Math.max(...rows.map((r) => r.status.length), 'status'.length) + 2;
    console.log('file'.padEnd(w) + 'status'.padEnd(sw) + 'reason');
    for (const r of rows) console.log(r.file.padEnd(w) + r.status.padEnd(sw) + r.reason);
    if (found.length > 0) {
      console.log(
        `\nGAPS (invocable, imports content or reads /data/*.json directly, no named test): ${found.map((r) => r.file).join(', ')}`,
      );
    }
  }

  if (found.length > 0) process.exitCode = 1;
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('tools/cli-crash-coverage.ts');
if (invokedDirectly) main(process.argv.slice(2));
