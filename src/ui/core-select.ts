/**
 * fb117 (SPEC-FINAL §5.5, §11, owner feedback
 * `feature-core-select-ui.md`): the Hub's Core-select screen, redesigned to
 * mirror fb058's Class-select layout — a horizontal row of tall Core cards
 * (`.sw-classcard`/`.sw-classrow`, reused verbatim rather than duplicated:
 * both are generic "row of tall option cards" layouts with nothing
 * class-specific in the CSS), a compact base-HP/upgrade-track summary for the
 * selected Core, and hover-only entries for its TD effect, VS effect and each
 * upgrade step — the sentence-form text itself is `core-info.ts`'s existing
 * fb022 machinery, this file only shapes it into fb058's hover-tooltip
 * layout (`.sw-cs-skill`/`.sw-cs-tip`, also reused verbatim).
 */

import type { CoreDef } from '../sim/content';
import { coreBaseEffectMarkup, coreStepEffectMarkup } from './core-info';
import { fieldLabel, fieldValueText } from './info-format';

/** The bottom panel's always-visible summary: base HP and the upgrade track's shape (not its per-step numbers — those are hover-only below). */
export function coreSelectSummaryMarkup(def: CoreDef): string {
  const stepWord = def.upgrade.count === 1 ? 'step' : 'steps';
  return `<div class="sw-effectblock">
    <b>${def.name}</b>
    <p class="sw-note">${fieldLabel('baseHp')}: ${fieldValueText('baseHp', def.baseHp)}</p>
    <p class="sw-note">Upgrade track: ${def.upgrade.count} ${stepWord}, ${def.upgrade.stepCost}g each — ${def.upgrade.desc}</p>
  </div>`;
}

/**
 * The hover-only entries (TD effect / VS effect / each upgrade step): a
 * short always-visible label, with `core-info.ts`'s sentence-form effect
 * text (base /data numbers — no run in progress on this screen) revealed on
 * hover/focus via the same `.sw-cs-tip` CSS fb058's class skills use.
 */
export function coreSelectEffectsMarkup(def: CoreDef): string {
  const entries: { label: string; body: string }[] = [
    { label: 'TD effect', body: coreBaseEffectMarkup(def, 'td') },
    { label: 'VS effect', body: coreBaseEffectMarkup(def, 'vs') },
    ...(def.upgrade.steps ?? []).map((_, i) => ({
      label: `Step ${i + 1} of ${def.upgrade.count} (${def.upgrade.stepCost}g)`,
      body: coreStepEffectMarkup(def, i),
    })),
  ];
  return `<div class="sw-classskills">
    ${entries
      .map(
        (e) => `<div class="sw-cs-skill" tabindex="0">
          <span class="sw-cs-label">${e.label}</span>
          <div class="sw-cs-tip">${e.body}</div>
        </div>`,
      )
      .join('')}
  </div>`;
}
