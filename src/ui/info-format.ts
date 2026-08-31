/**
 * fb022 (owner feedback `feature-info-surfacing`, SPEC-FINAL §11, extends
 * fb004/the Codex p9b): one shared, generic formatter for every "what does
 * this actually do, with numbers" surface — the Hub's class/Core screens, the
 * in-run character panel, the Constellation summary and the equipment stash.
 *
 * The whole point of putting this in one module is architecture rule 4
 * ("content and numbers live in /data, never in code"): every function here
 * reads whatever numeric/boolean fields are actually present on a /data
 * object and turns the *key name* into a label and the *value* into text —
 * it never hard-codes a class's or a Core's own numbers as prose. A field
 * this module has never seen before still renders (through the camelCase
 * fallback label and the suffix/magnitude value heuristic below) instead of
 * silently vanishing, which is what "changing a /data value changes the
 * displayed text with no code edit" requires: adding a new numeric field to
 * an active/passive/Core row needs no change here to show up.
 *
 * Presentation only — nothing here reads or writes `World` state; the two
 * call sites that need a "live" number (the in-run character panel's active
 * cooldown/damage, the in-run Core tooltip) pass already-resolved numbers in
 * from `w.derived`/`w.core` rather than this module reaching for them itself.
 */

import { STAT_DISPLAY, type StatKey, type StatDisplay } from '../sim/stats';
import { statLabel } from './character-panel';

/* ------------------------------------------------------------- formatting */

function trimNum(n: number, decimals = 2): string {
  const r = Math.round(n * 10 ** decimals) / 10 ** decimals;
  // "-0" reads worse than "0", and a whole number should not carry ".00".
  return Object.is(r, -0) ? '0' : String(r);
}

/**
 * A handful of the most player-facing field names get a nicer label than the
 * generic camelCase split below would produce (`aoe` -> "AoE radius" rather
 * than "Aoe"). Anything not listed here still renders — see `fieldLabel`.
 */
const FIELD_LABELS: Record<string, string> = {
  cooldownSeconds: 'Cooldown',
  radius: 'Radius',
  damage: 'Damage',
  dps: 'DPS',
  range: 'Range',
  interval: 'Attack interval',
  aoe: 'AoE radius',
  minRadius: 'Min radius',
  minDamage: 'Min damage',
  knockback: 'Knockback',
  chargeCapSeconds: 'Max charge time',
  dashRange: 'Dash range',
  dashWidth: 'Dash width',
  groundDurationSeconds: 'Ground duration',
  baseHp: 'Base Core HP',
  coreHpBonus: 'Core HP bonus',
  devourRadius: 'Devour radius',
  devourCooldown: 'Devour cooldown',
  devourEliteDamage: 'Devour elite damage',
  devourCoreHeal: 'Devour Core heal',
  poisonVolleyInterval: 'Poison volley interval',
  poisonBulletDamage: 'Poison bullet damage',
  towerLifestealPct: 'Tower lifesteal',
  vsLifestealPct: 'Character lifesteal',
  overhealGoldRatio: 'Overheal-to-gold ratio',
  goldPerSecond: 'Gold per second',
  hpRegenPerSecond: 'Tower HP regen',
  tdSlowRadius: 'TD slow aura radius',
  tdSlowPct: 'TD slow aura potency',
  vsSpeedPct: 'VS speed bonus',
  corpseStoreRatio: 'Damage stored',
  corpseExecuteInterval: 'Execute interval',
  corpseExplodeRadius: 'Explosion radius',
  corpseAutoFireInterval: 'Auto-fire interval',
  decayRadius: 'Decay aura radius',
  decayMult: 'Decay aura multiplier',
};

/** camelCase -> "Camel case", capitalised once at the front. */
function splitCamel(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  const lower = spaced.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** A human label for any /data field name — known ones read naturally, unknown ones fall back to a split. */
export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? splitCamel(key);
}

/**
 * A value's display text, from its *key name* and magnitude alone — no
 * per-field table of "this one is a percent, this one is a multiplier": a
 * `...Seconds` field is a duration, a `...Pct`/`...Fraction`/`...Potency`
 * field or a `...Mul`/`...Mult` field is scaled/prefixed accordingly, and
 * anything else that reads as a bare fraction (0 < |value| < 1) is shown as a
 * percent — the same "a fraction under 1 is probably a percent" heuristic
 * `hub.ts`'s own `statIsPct` already falls back to for an affix with no
 * pool-declared `pct` flag.
 */
export function fieldValueText(key: string, value: number): string {
  if (/Seconds$/.test(key)) return `${trimNum(value)}s`;
  // code-reviewer (fb022): every `...Cooldown`/`...Interval`/plain `interval`
  // field in /data (devourCooldown, poisonVolleyInterval, the basic-attack
  // shape's own `interval`, ...) is a duration in seconds too, just spelled
  // without the `Seconds` suffix `cooldownSeconds` uses — case-insensitive so
  // the bare `interval` key (lowercase i) matches the same way.
  if (/(cooldown|interval)$/i.test(key)) return `${trimNum(value)}s`;
  if (/Mul(t)?$/.test(key)) return `×${trimNum(value)}`;
  if (/(Pct|Fraction|Potency)$/.test(key)) return `${trimNum(value * 100, 1)}%`;
  if (Math.abs(value) > 0 && Math.abs(value) < 1) return `${trimNum(value * 100, 1)}%`;
  if (key === 'dps') return `${trimNum(value)}/s`;
  return trimNum(value);
}

export interface FieldRow {
  key: string;
  label: string;
  /** The value actually shown — `overrides[key]` when supplied, else the raw /data number. */
  value: number;
  text: string;
}

/**
 * Every numeric (or `true` boolean) field on a /data effect object, each
 * turned into a label + display text. Zero (and `false`) are skipped — same
 * convention `Stats.add` already uses for "unobservable, would only add
 * noise." `overrides` lets a caller substitute a sim-resolved number (e.g.
 * `cooldownSeconds` after CDR) for the raw authored one on a field-by-field
 * basis, without needing a second formatter.
 */
export function numericFieldRows(
  obj: Record<string, unknown> | null | undefined,
  overrides: Record<string, number> = {},
): FieldRow[] {
  if (!obj) return [];
  const rows: FieldRow[] = [];
  for (const [key, raw] of Object.entries(obj)) {
    if (typeof raw === 'boolean') {
      if (raw) rows.push({ key, label: fieldLabel(key), value: 1, text: 'Yes' });
      continue;
    }
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    const value = key in overrides ? overrides[key] : raw;
    if (value === 0) continue;
    rows.push({ key, label: fieldLabel(key), value, text: fieldValueText(key, value) });
  }
  return rows;
}

export function numericFieldListHtml(
  obj: Record<string, unknown> | null | undefined,
  overrides: Record<string, number> = {},
): string {
  const rows = numericFieldRows(obj, overrides);
  if (rows.length === 0) return '';
  return `<ul class="sw-statlist">${rows.map((r) => `<li>${r.label}: ${r.text}</li>`).join('')}</ul>`;
}

/* ------------------------------------------------------ Stats-shaped mods */

/** `statLabel` (character-panel.ts) for a known `StatKey`; the same camelCase fallback as `fieldLabel` for anything else (a class tower-passive's bespoke, non-`Stats` key like `towerDamageVsBurning`). */
export function modFieldLabel(key: string): string {
  const known = statLabel(key as StatKey);
  return known !== key ? known : splitCamel(key);
}

/** Whether a `mods`-shaped value reads as a percent: `STAT_DISPLAY` when the key is a real `StatKey` (b021 — the display-intent classification, not `STAT_KIND`'s stacking-mechanism one), else the same "fraction under 1" fallback `fieldValueText` uses. */
export function modIsPct(key: string, value: number): boolean {
  const display = (STAT_DISPLAY as Partial<Record<string, StatDisplay>>)[key];
  if (display) return display === 'percent';
  return Math.abs(value) > 0 && Math.abs(value) < 1;
}

export interface ModLine {
  key: string;
  label: string;
  value: number;
  pct: boolean;
  text: string;
}

/**
 * A `Record<StatKey-ish, number>` (a class passive's `mods`, an equipment
 * item's `mods`) as signed, labelled lines — `+10% Tower Attack Speed`,
 * `+5 Armour`. Shared by the class-detail and equipment surfaces so a stat
 * bag never gets formatted two different ways.
 */
export function modLines(mods: Record<string, number> | null | undefined): ModLine[] {
  if (!mods) return [];
  const out: ModLine[] = [];
  for (const [key, value] of Object.entries(mods)) {
    if (typeof value !== 'number' || value === 0) continue;
    const pct = modIsPct(key, value);
    const sign = value > 0 ? '+' : '';
    const text = pct ? `${sign}${trimNum(value * 100, 1)}%` : `${sign}${trimNum(value, 2)}`;
    out.push({ key, label: modFieldLabel(key), value, pct, text: `${text} ${modFieldLabel(key)}` });
  }
  return out;
}

export function modLinesHtml(mods: Record<string, number> | null | undefined): string {
  const lines = modLines(mods);
  if (lines.length === 0) return '';
  return `<ul class="sw-statlist">${lines.map((l) => `<li>${l.text}</li>`).join('')}</ul>`;
}
