/**
 * fb085 (QUALITY.md BETA localization-readiness bar): a typed loader over
 * `data/strings.json`, the seed of a "zero user-facing string literals
 * outside `data/strings.json`" convention. Not wired through `src/sim/
 * content`'s zod schemas on purpose — these are presentation strings, not
 * sim-affecting tuning, so they don't need `contentHash()` coverage or a
 * replay-breaking-change guard.
 */
import raw from '../../data/strings.json';

export type StringKey = keyof typeof raw;

export function t(key: StringKey): string {
  return raw[key];
}

/**
 * code-reviewer (fb135): does not understand string literals, so a `//`
 * embedded inside an actual quoted value (e.g. a URL) ahead of a
 * reintroduced literal on the same source line would be silently treated
 * as a line comment and strip the rest of that line — a false *negative*,
 * the worse failure mode for a regression guard. No `pause.*` value or the
 * `showPause` body contains `//` today, so this doesn't misfire yet; flag
 * it before a future migrated surface's values start containing URLs/paths.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * fb085: the reintroduction guard a "converted" file's own lint test runs
 * against itself. A migrated literal is checked by *value*, not by AST
 * position — `t('pause.title')` only ever writes the *key* into source, so
 * once a value is migrated away, it should never appear in that file's
 * source again at all. Deliberately a plain substring search rather than a
 * quote-adjacency regex: a template literal embeds a value between HTML
 * tags (`` `<h2>${value}</h2>` `` becoming `` `<h2>Abandon run?</h2>` `` if
 * someone reverts it), not between quote characters, and the same value can
 * just as easily reappear inside a `${...}` interpolation (e.g. a reverted
 * ternary branch) — both are the gap a reverted earlier attempt's
 * text-node/`title=`-only scan missed. Comments are stripped first so a
 * doc comment that merely *mentions* a migrated value (as this file's own
 * history did) isn't a false positive; a letter-and-digit-and-underscore
 * boundary check (not full `\b`, which treats a leading `?`/`.` as its own
 * boundary and would still false-positive) keeps a short value like "Back"
 * from matching inside an unrelated identifier (`onResume`, `sw_Back2`).
 */
export function findReintroducedLiterals(source: string, values: string[]): string[] {
  const code = stripComments(source);
  return values.filter((value) => {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`);
    return pattern.test(code);
  });
}
