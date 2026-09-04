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

import type { ClassDef, ClassEffect } from '../sim/content';
import { formatPct, modLinesHtml, numericFieldListHtml, trimNum } from './info-format';

export interface ClassLiveContext {
  /** `w.derived.cdr` — the fraction every Active's cooldown is reduced by. */
  cdr: number;
  /** `w.derived.atkFlat` — equipment's flat "Atk" column, added before the power multiplier. */
  atkFlat: number;
  /** `classAttackPowerMul(w, cls)` (classes.ts) — Power plus Blood Frenzy's phase-dependent swing. */
  damageMul: number;
  /**
   * `active2CdrFactor(w)` (classes.ts) — Active2's real cooldown/recharge
   * reduction: the general `cdr` stat *and* the §6.3 "Active2 cooldown" skill
   * card every one of the 12 classes has, which `cdr` alone does not cover
   * (qa-playtester finding, fb026: Active2's tooltip showed the unreduced
   * number once a run had any rank in that card). Optional because Active1's
   * and the basic attack's blocks never read it — only `activeSkillMarkup`'s
   * `'active2'` branch does, falling back to plain `1 - cdr` if a caller ever
   * omits it.
   */
  active2CdrFactor?: number;
}

function liveOverrides(fields: Record<string, unknown>, live?: ClassLiveContext, cooldownFactor?: number): Record<string, number> {
  if (!live) return {};
  const factor = cooldownFactor ?? 1 - live.cdr;
  const overrides: Record<string, number> = {};
  if (typeof fields.cooldownSeconds === 'number') {
    overrides.cooldownSeconds = fields.cooldownSeconds * factor;
  }
  // A `maxCharges > 1` Active (fb013 Time Lord, both Actives) is gated by
  // `rechargeSeconds`, not `cooldownSeconds`, once it has spent a charge
  // (`tickAmmoRecharge`, classes.ts) — the same CDR factor applies to
  // whichever field is the real gate for this effect.
  if (typeof fields.rechargeSeconds === 'number') {
    overrides.rechargeSeconds = fields.rechargeSeconds * factor;
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

function effectBlock(title: string, fields: Record<string, unknown>, live?: ClassLiveContext, cooldownFactor?: number): string {
  return `<div class="sw-effectblock">
    <b>${title}</b>
    ${numericFieldListHtml(fields, liveOverrides(fields, live, cooldownFactor))}
  </div>`;
}

/** fb063: the same `(value + atkFlat) * damageMul` formula `liveOverrides` applies to the `damage`/`dps` field names, for a sentence template's other per-kind damage fields (Circle Slash's `minDamage`, Time's per-stage DoT `dps`s). */
function liveDamageValue(value: number, live?: ClassLiveContext): number {
  return live ? (value + live.atkFlat) * live.damageMul : value;
}

/** Same idea as `liveDamageValue`, for a cooldown/recharge number outside the two field names `liveOverrides` covers. */
function liveCooldownValue(value: number, live?: ClassLiveContext, cooldownFactor?: number): number {
  return live ? value * (cooldownFactor ?? 1 - live.cdr) : value;
}

function circleSlashSentence(eff: ClassEffect, live?: ClassLiveContext, cooldownFactor?: number): string {
  const minDamage = liveDamageValue(eff.minDamage ?? 0, live);
  const damage = liveDamageValue(eff.damage, live);
  const cd = liveCooldownValue(eff.cooldownSeconds, live, cooldownFactor);
  return `Hold to charge a self-centered nova: release immediately to hit everything within ${trimNum(eff.minRadius ?? 0)} tiles for ${trimNum(minDamage)} damage, or hold up to ${trimNum(eff.chargeCapSeconds ?? 0)}s for a ${trimNum(eff.radius)}-tile hit dealing ${trimNum(damage)} damage and knocking enemies back ${trimNum(eff.knockback ?? 0)} tiles. Cooldown ${trimNum(cd)}s.`;
}

function dashSlashSentence(eff: ClassEffect, live?: ClassLiveContext, cooldownFactor?: number): string {
  const damage = liveDamageValue(eff.damage, live);
  const cd = liveCooldownValue(eff.cooldownSeconds, live, cooldownFactor);
  return `Dash ${trimNum(eff.dashRange ?? 0)} tiles toward the cursor, slashing every enemy in a ${trimNum(eff.dashWidth ?? 0)}-tile-wide line for ${trimNum(damage)} damage. Usable mid-Circle-Slash-charge: the charge's own range and damage merge into this one hit instead of firing separately. Cooldown ${trimNum(cd)}s.`;
}

function poisonBarrelSentence(eff: ClassEffect, live?: ClassLiveContext, cooldownFactor?: number): string {
  const dps = liveDamageValue(eff.damage, live);
  const cd = liveCooldownValue(eff.cooldownSeconds, live, cooldownFactor);
  return `Drops a ${trimNum(eff.radius)}-tile poison cloud dealing ${trimNum(dps)} damage/s for ${trimNum(eff.groundDurationSeconds ?? 0)}s. Cooldown ${trimNum(cd)}s.`;
}

function poisonBoostSentence(eff: ClassEffect, live?: ClassLiveContext, cooldownFactor?: number): string {
  const cd = liveCooldownValue(eff.cooldownSeconds, live, cooldownFactor);
  return `Instantly doubles the remaining damage of every poison tick currently active on every enemy on the field. Cooldown ${trimNum(cd)}s.`;
}

/**
 * `markEliteExecuteFraction`/`groundDurationSeconds`/`zoneDotSeconds`'s `?? `
 * fallbacks below match `classes.ts`'s own fallback literals for the same
 * fields (`fireTimeLock`'s `?? 5`/`?? 10`, `advanceTimeMark`'s `?? 0.5`) —
 * dead paths today, since `REQUIRED_EFFECT_FIELDS` (content.ts) already makes
 * every one of them mandatory for `time_mark`/`time_lock` and the loader
 * rejects a row missing one, but kept aligned rather than defaulting to 0 in
 * case that required-field list is ever pared down independently of this file.
 */
function timeMarkSentence(eff: ClassEffect, live?: ClassLiveContext, cooldownFactor?: number): string {
  const pastDps = liveDamageValue(eff.markPastDotDps ?? 0, live);
  const presentDps = liveDamageValue(eff.markPresentDotDps ?? 0, live);
  const recharge = liveCooldownValue(eff.rechargeSeconds ?? 0, live, cooldownFactor);
  return (
    `Pulses ${trimNum(eff.radius)} tiles, advancing every enemy hit one stage of a 4-stage mark. ` +
    `Unmarked: rewinds to its position from ${trimNum(eff.markRewindSeconds ?? 0)}s ago and takes ${trimNum(pastDps)} damage/s for ${trimNum(eff.markPastDotSeconds ?? 0)}s. ` +
    `Past: stun-locked and takes ${trimNum(presentDps)} damage/s for ${trimNum(eff.markPresentDotSeconds ?? 0)}s. ` +
    `Present: slowed ${formatPct(eff.markFutureSlowAmount ?? 0)} for ${trimNum(eff.markFutureSlowSeconds ?? 0)}s and takes its current HP as damage over ${trimNum(eff.markFutureDotSeconds ?? 0)}s. ` +
    `Future: executed outright — elites and bosses instead lose ${formatPct(eff.markEliteExecuteFraction ?? 0.5)} of current HP. ` +
    `${eff.maxCharges ?? 1} charges, ${trimNum(recharge)}s to recharge each.`
  );
}

function timeLockSentence(eff: ClassEffect, live?: ClassLiveContext, cooldownFactor?: number): string {
  const dps = liveDamageValue(eff.damage, live);
  const recharge = liveCooldownValue(eff.rechargeSeconds ?? 0, live, cooldownFactor);
  return (
    `Traps every enemy within ${trimNum(eff.radius)} tiles for ${trimNum(eff.groundDurationSeconds ?? 5)}s — they cannot leave and are immune to Time's rewind-pull — dealing ${trimNum(dps)} damage/s for ${trimNum(eff.zoneDotSeconds ?? 10)}s to each. ` +
    `Re-casting while a zone is active teleports its enemies into the new one and detonates all of their remaining DoT damage at once. ` +
    `${eff.maxCharges ?? 1} charges, ${trimNum(recharge)}s to recharge each.`
  );
}

/**
 * fb063: a hand-authored sentence per Active `kind`, covering the 3
 * normal-profile classes' 6 Actives (SPEC-FINAL §4, fb058's roster) —
 * every kind not listed here (including `burst_damage`, the framework's
 * original single-target/AoE hit kind several hidden classes still use)
 * keeps `effectBlock`'s bare numeric-field fallback (`activeSkillMarkup`
 * below) rather than a wrong or absent tooltip; the fallback earns its own
 * backlog item once a hidden class becomes normal-profile-visible (fb057/
 * fb059), the same "kept honest, not blocked on total coverage" precedent
 * the file header's `atkFlat`/`damageMul`-only live-field scope already
 * sets for numeric fields with no live equivalent.
 */
const ACTIVE_SENTENCES: Partial<
  Record<ClassEffect['kind'], (eff: ClassEffect, live?: ClassLiveContext, cooldownFactor?: number) => string>
> = {
  charge_nova: circleSlashSentence,
  dash_line: dashSlashSentence,
  ground_poison: poisonBarrelSentence,
  poison_boost: poisonBoostSentence,
  time_mark: timeMarkSentence,
  time_lock: timeLockSentence,
};

/**
 * fb026: the single-skill slice of `classAbilitiesMarkup`, for the bottom
 * bar's per-icon hover tooltip — the same live-resolved numbers, scoped to
 * just the Active being hovered rather than the whole class. Active2 reads
 * `live.active2CdrFactor` rather than the plain `1 - live.cdr` Active1 uses
 * (see `ClassLiveContext`'s own doc comment).
 *
 * fb063: a written sentence-form description with the numbers embedded in
 * running text, not a bare field list, for every `kind` `ACTIVE_SENTENCES`
 * authors one for; see that table's own comment for the fallback.
 */
export function activeSkillMarkup(cls: ClassDef, which: 'active1' | 'active2', live?: ClassLiveContext): string {
  const eff = which === 'active1' ? cls.active1 : cls.active2;
  const label = which === 'active1' ? 'Q, Active 1' : 'E, Active 2';
  const cooldownFactor = live ? (which === 'active1' ? 1 - live.cdr : live.active2CdrFactor ?? 1 - live.cdr) : undefined;
  const sentence = ACTIVE_SENTENCES[eff.kind];
  if (sentence) {
    return `<div class="sw-effectblock">
      <b>${eff.name} (${label})</b>
      <p class="sw-note">${sentence(eff, live, cooldownFactor)}</p>
    </div>`;
  }
  return effectBlock(`${eff.name} (${label})`, eff, live, cooldownFactor);
}

/** fb026: the passive's own block, standalone for the bottom bar's passive-icon tooltip. */
export function passiveSkillMarkup(cls: ClassDef): string {
  return `<div class="sw-effectblock">
      <b>${cls.passive.name} (Passive)</b>
      <p class="sw-note">${cls.passive.description}</p>
      ${numericFieldListHtml(cls.passive)}
      ${modLinesHtml(cls.passive.mods)}
    </div>`;
}

/** fb058: the tower passive's own block, standalone for the class-select screen's fourth hover entry. */
export function towerPassiveSkillMarkup(cls: ClassDef): string {
  return `<div class="sw-effectblock">
      <b>${cls.towerPassive.name} (Tower Passive)</b>
      <p class="sw-note">${cls.towerPassive.description}</p>
      ${numericFieldListHtml(cls.towerPassive)}
      ${modLinesHtml(cls.towerPassive.mods)}
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
    activeSkillMarkup(cls, 'active1', live),
    activeSkillMarkup(cls, 'active2', live),
    passiveSkillMarkup(cls),
    towerPassiveSkillMarkup(cls),
  ].join('');
}
