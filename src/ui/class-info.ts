/**
 * fb022 (SPEC-FINAL §11, extends fb004): a class's full active/passive effect
 * text with numbers — shared by the Hub's Class screen (`hub.ts`, base /data
 * numbers only, no run in progress yet) and the in-run character panel
 * (`hud.ts`/`character-panel.ts`, which passes a `ClassLiveContext` so
 * `cooldownSeconds` and `damage`/`dps` resolve through the same formulas the
 * sim itself uses — `w.derived.cdr`, `classAttackPowerMul`/`characterDamage`,
 * classes.ts). Every other field (radius, knockback, summon counts, ...) has
 * no live sim equivalent to resolve through, so it falls back to the plain
 * authored /data number — the file header's own stated rule.
 */

import type { ClassDef } from '../sim/content';
import { modLinesHtml, numericFieldListHtml } from './info-format';

export interface ClassLiveContext {
  /** `w.derived.cdr` — the fraction every Active's cooldown is reduced by. */
  cdr: number;
  /** `w.derived.atkFlat` — equipment's flat "Atk" column, added before the power multiplier. */
  atkFlat: number;
  /** `classAttackPowerMul(w, cls)` (classes.ts) — Power plus Blood Frenzy's phase-dependent swing. */
  damageMul: number;
}

function liveOverrides(fields: Record<string, unknown>, live?: ClassLiveContext): Record<string, number> {
  if (!live) return {};
  const overrides: Record<string, number> = {};
  if (typeof fields.cooldownSeconds === 'number') {
    overrides.cooldownSeconds = fields.cooldownSeconds * (1 - live.cdr);
  }
  if (typeof fields.damage === 'number') {
    overrides.damage = (fields.damage + live.atkFlat) * live.damageMul;
  }
  if (typeof fields.dps === 'number') {
    // `characterDamage` (classes.ts) adds `atkFlat` to a per-hit damage
    // amount, not to a per-second rate — the sim's own basic-attack call site
    // (`classBasicAttack`) computes `characterDamage(w, cls, dps * interval)`
    // and treats that as the damage one attack deals, `interval` seconds
    // apart. Dividing back by `interval` (when present) keeps this override
    // an actual per-second figure instead of double-counting `atkFlat` at a
    // 1-per-second rate regardless of the real attack cadence.
    const interval = typeof fields.interval === 'number' && fields.interval > 0 ? fields.interval : 1;
    overrides.dps = ((fields.dps * interval + live.atkFlat) * live.damageMul) / interval;
  }
  return overrides;
}

function effectBlock(title: string, fields: Record<string, unknown>, live?: ClassLiveContext): string {
  return `<div class="sw-effectblock">
    <b>${title}</b>
    ${numericFieldListHtml(fields, liveOverrides(fields, live))}
  </div>`;
}

/**
 * The full active/passive/tower-passive/basic-attack effect text for one
 * class (SPEC-FINAL §4). `opts.live` is omitted entirely on the Hub's
 * pre-run Class screen — both surfaces call the same function, only the
 * second argument differs. Remaining-cooldown
 * countdown text is deliberately not duplicated here: the HUD's own
 * `activeRow`/`Hud.activeSkillRow` (hud.ts) already renders it every frame
 * off `w.warden.active1Cooldown`/`active2Cooldown`, outside this panel's
 * `w.stats.revision`-gated re-render — folding a per-tick countdown into a
 * cache key gated on `Stats` changes would only reintroduce the same kind of
 * staleness `renderCharacterPanel`'s Blood Frenzy fix (fb022 code review) had
 * to add `w.huntsWarden` for.
 */
export function classAbilitiesMarkup(cls: ClassDef, opts: { live?: ClassLiveContext } = {}): string {
  const { live } = opts;
  return [
    `<div class="sw-effectblock">
      <b>Basic attack</b>
      ${numericFieldListHtml(cls.basicAttack, liveOverrides(cls.basicAttack, live))}
    </div>`,
    effectBlock(`${cls.active1.name} (Q, Active 1)`, cls.active1, live),
    effectBlock(`${cls.active2.name} (E, Active 2)`, cls.active2, live),
    `<div class="sw-effectblock">
      <b>${cls.passive.name} (Passive)</b>
      <p class="sw-note">${cls.passive.description}</p>
      ${numericFieldListHtml(cls.passive)}
      ${modLinesHtml(cls.passive.mods)}
    </div>`,
    `<div class="sw-effectblock">
      <b>${cls.towerPassive.name} (Tower Passive)</b>
      <p class="sw-note">${cls.towerPassive.description}</p>
      ${numericFieldListHtml(cls.towerPassive)}
      ${modLinesHtml(cls.towerPassive.mods)}
    </div>`,
  ].join('');
}
