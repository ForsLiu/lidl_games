/**
 * fb028 (SPEC-FINAL §11, extends fb015 §7/fb022): an equipment item's full
 * effect text — its Stats-shaped `mods`, the `classFallback` "if not <class>"
 * conditional stat line (moved here from `hub.ts` so every surface shares
 * one copy), and the three `effectKey`s that are not Stats-shaped at all
 * (Sleeve Sword's charge-free Circle Slash, Swordsman Armor's charge-rate/
 * cross-item swap, Swordsman Shoes' doubled Dash Slash) — shared by the
 * Hub's Equipment tab, the in-run equipment section (`hud.ts`) and the Codex
 * so no surface hand-writes its own copy of what an item actually does.
 *
 * code-reviewer (fb028): an earlier draft of this module hand-authored the
 * three `effectKey` sentences directly in TS — a second, driftable copy of
 * prose `data/equipment.json`'s `desc` field already stated (and one word
 * had already diverged: "fires at max-charge effect" vs. "fires instantly
 * at max-charge effect"). The sentences now live in `/data` too
 * (`EquipmentItem.effectNote`/`effectNoteWith`, content.ts), and this module
 * does pure `{mul}` template substitution — the *number* is always the live
 * sim value a caller passes in, and the *sentence* is always the one the
 * content author wrote once.
 */
import type { Content, EquipmentItem } from '../sim/content';
import { modLines, modLinesHtml, trimNum } from './info-format';

export interface EquipmentEffectContext {
  classKey: string;
  /**
   * `w.derived.attackSpeedMul` — only known in-run. Omitted on the Hub's
   * pre-run screens and the Codex, where `{mul}` resolves to nothing rather
   * than guessing a build's eventual number.
   */
  attackSpeedMul?: number;
  /**
   * The run's actually-equipped item keys (`w.cfg.equipment` — the same
   * field `hasEquipment`, sim/equipment.ts, gates every `effectKey`
   * mechanic on) — resolves an item's `effectNoteWith` cross-item text.
   * Omitted pre-run (Hub, Codex), where a cross-item note never applies.
   */
  equippedKeys?: string[];
}

function withMul(text: string, ctx: EquipmentEffectContext): string {
  const mul = ctx.attackSpeedMul !== undefined ? ` (×${trimNum(ctx.attackSpeedMul)} this run)` : '';
  return text.replace('{mul}', mul);
}

/**
 * `item`'s `effectNote`, or its `effectNoteWith` text when the companion key
 * it names is also in `ctx.equippedKeys` — `{mul}` resolved either way.
 * `undefined` for an item with no `effectNote` at all (`effectKey: 'none'`).
 */
function resolvedNote(item: EquipmentItem, ctx: EquipmentEffectContext): string | undefined {
  if (item.effectNoteWith && ctx.equippedKeys?.includes(item.effectNoteWith.key)) {
    return withMul(item.effectNoteWith.text, ctx);
  }
  if (item.effectNote) return withMul(item.effectNote, ctx);
  return undefined;
}

/**
 * Whether `item`'s primary `effectKey` mechanic is live for `ctx` — the same
 * condition `classFallback.notClassKey !== classKey` gates the *fallback*
 * mods on (stats.ts's `baseRunStats`, run.ts's `equipItemCommand`), inverted:
 * the special mechanic is what the fallback substitutes for, so it is active
 * exactly when the fallback is not. An item with no `classFallback` has no
 * class gate on its `effectKey` either, so the class half reads as always
 * active.
 *
 * qa-playtester (fb028): the class check alone is not the real sim gate —
 * `hasEquipment` (sim/equipment.ts) additionally requires `item.key` to be
 * in the run's *starting* loadout (`w.cfg.equipment`, frozen at run start),
 * not merely equipped right now. An item equipped mid-run from the in-run
 * stash panel (`hud.ts`'s `equipmentSectionMarkup`) that was absent from
 * that starting loadout has its `Stats` mods apply immediately but its
 * `effectKey` mechanic never fires this run — the repro was Swordsman Armor
 * equipped mid-run showing "(active)" while `hasEquipment` already read
 * `false`. `ctx.equippedKeys` (`w.cfg.equipment` — the same field
 * `hasEquipment` reads) closes this: when present (in-run only; the Hub and
 * Codex omit it, since neither has a frozen starting loadout to check
 * against), `item.key` must appear in it or the mechanic reads inert
 * regardless of class.
 *
 * This mirrors content.ts's own note that every `effectKey` "reads straight
 * off `cls.active1`/`active2`'s *kind*, not off a name" — today exactly one
 * class (Swordsman) has the `charge_nova`/`dash_line` kinds these three
 * items key off, so `classFallback.notClassKey` and "the class whose kind
 * this mechanic needs" happen to name the same class. A second class
 * reusing either kind would need this function (and the `classFallback` it
 * reads) to grow a real kind-based check instead of the single class-key
 * comparison below.
 */
function specialActive(item: EquipmentItem, ctx: EquipmentEffectContext): boolean {
  if (ctx.equippedKeys && !ctx.equippedKeys.includes(item.key)) return false;
  return item.classFallback ? item.classFallback.notClassKey === ctx.classKey : true;
}

/**
 * fb022, moved here from `hub.ts`: an item's `classFallback` conditional stat
 * line ("If not Swordsman: +50% attack speed"), marked active/inert for
 * `ctx.classKey` — the exact gate `baseRunStats` applies at run start.
 */
export function equipmentFallbackMarkup(content: Content, ctx: EquipmentEffectContext, item: EquipmentItem): string {
  if (!item.classFallback) return '';
  const className = content.classByKey.get(ctx.classKey)?.name ?? ctx.classKey;
  const active = item.classFallback.notClassKey !== ctx.classKey;
  const lines = modLines(item.classFallback.mods);
  const status = active ? '<span class="sw-phase-vs">(active)</span>' : `<span class="dim">(inert for ${className})</span>`;
  return `<div class="sw-modline">If not ${
    content.classByKey.get(item.classFallback.notClassKey)?.name ?? item.classFallback.notClassKey
  }: ${lines.map((l) => l.text).join(', ')} ${status}</div>`;
}

/** The item's `effectNote`/`effectNoteWith` text, marked active/inert for `ctx.classKey`; empty for an item with neither field. */
export function equipmentSpecialNoteMarkup(item: EquipmentItem, ctx: EquipmentEffectContext): string {
  const note = resolvedNote(item, ctx);
  if (!note) return '';
  const active = specialActive(item, ctx);
  const status = active ? '<span class="sw-phase-vs">(active)</span>' : '<span class="dim">(inert)</span>';
  return `<div class="sw-modline">${note} ${status}</div>`;
}

/** The full effect text for one item against a real class/run context: mods, the fallback conditional line, and the effectKey note. */
export function equipmentEffectMarkup(content: Content, item: EquipmentItem, ctx: EquipmentEffectContext): string {
  return [modLinesHtml(item.mods), equipmentFallbackMarkup(content, ctx, item), equipmentSpecialNoteMarkup(item, ctx)]
    .filter(Boolean)
    .join('');
}

/**
 * The Codex has no run and no selected class or loadout, so there is no
 * "current class"/"currently equipped" to mark active/inert against — every
 * conditional branch is shown plainly, named by class (and, for
 * `effectNoteWith`, by companion item), rather than picking one via
 * `resolvedNote`'s live `ctx.equippedKeys` check (which would always read
 * `undefined` here and silently hide the cross-item branch — qa-playtester
 * fb028: the Codex's Swordsman Armor detail never mentioned Sleeve Sword at
 * all before this).
 */
export function equipmentCodexDetailMarkup(content: Content, item: EquipmentItem): string {
  const parts = [modLinesHtml(item.mods)];
  const noMul: EquipmentEffectContext = { classKey: '' };
  const targetName = item.classFallback
    ? (content.classByKey.get(item.classFallback.notClassKey)?.name ?? item.classFallback.notClassKey)
    : null;
  if (item.effectNote) {
    const line = withMul(item.effectNote, noMul);
    parts.push(`<div class="sw-modline">${targetName ? `If ${targetName}: ` : ''}${line}</div>`);
  }
  if (item.effectNoteWith) {
    const companionName = content.equipmentByKey.get(item.effectNoteWith.key)?.name ?? item.effectNoteWith.key;
    const line = withMul(item.effectNoteWith.text, noMul);
    const prefix = targetName ? `If ${targetName} and ${companionName} also equipped: ` : `With ${companionName} also equipped: `;
    parts.push(`<div class="sw-modline">${prefix}${line}</div>`);
  }
  if (item.classFallback) {
    const fbLines = modLines(item.classFallback.mods);
    parts.push(`<div class="sw-modline">If not ${targetName}: ${fbLines.map((l) => l.text).join(', ')}</div>`);
  }
  return parts.filter(Boolean).join('');
}
