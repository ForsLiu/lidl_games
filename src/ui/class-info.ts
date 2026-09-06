/**
 * fb022 (SPEC-FINAL §11, extends fb004): a class's full active/passive effect
 * text with numbers — shared by the Hub's Class screen (`hub.ts`, base /data
 * numbers only, no run in progress yet) and the in-run character panel
 * (`hud.ts`/`character-panel.ts`, which passes a `ClassLiveContext` so
 * `cooldownSeconds` and `damage`/`dps` resolve through the same formulas the
 * sim itself uses — `w.derived.cdr`, `classAttackPowerMul`/`characterDamage`,
 * classes.ts) — and, since fb148, `dashRange`, which every `dash_*` kind
 * scales by current move speed (`dashDistance`/`classDashDuration`, fb053).
 * Every other field (radius, knockback, summon counts, ...) has no live sim
 * equivalent to resolve through, so it falls back to the plain authored /data
 * number — the file header's own stated rule.
 */

import type { ClassDef, ClassEffect } from '../sim/content';
import {
  AOE_FALLOFF_CLAUSE,
  LINE_FALLOFF_CLAUSE,
  PATCH_FALLOFF_CLAUSE,
  formatPct,
  modLinesHtml,
  numericFieldListHtml,
  trimNum,
} from './info-format';
import { defaultKeyBindings, keyLabel, type KeyBindings } from './keybindings';

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
  /**
   * fb148 (qa-playtester finding during fb112 verification): the factor the
   * sim applies to a `dash_*` effect's authored `dashRange`.
   *
   * Every class dash scales with move speed (fb053): `fireDashSlash` and its
   * three siblings feed `dashDistance(currentMoveSpeed(w), duration)` with
   * `duration = classDashDuration(eff.dashRange, classBaseMoveSpeed(cls))`,
   * which reduces to `dashRange * currentMoveSpeed / classBaseMoveSpeed`. The
   * sentences printed the authored number, so a Warden with any move-speed
   * source was told a distance it had not dashed since the buff landed.
   *
   * Optional because the Hub's pre-run Class screen has no run to read and
   * legitimately shows the authored base, same as every other number there.
   */
  dashRangeMul?: number;
  /**
   * fb148: whether `swordsman_shoes` is equipped. Mirrors `fireDashSlash`'s
   * own hardcoded `hasEquipment(w, 'swordsman_shoes') ? 2 : 1`
   * (`src/sim/classes.ts`), which is applied by that one function and no
   * other dash — hence a separate flag rather than folding it into
   * `dashRangeMul`, which every `dash_*` kind reads.
   */
  swordsmanShoes?: boolean;
}

/**
 * fb148: an effect's authored `dashRange` as the sim will really dash it —
 * every `dash_*` kind's shared move-speed scaling. `dashSlashSentence` adds
 * `fireDashSlash`'s own Shoes doubling on top; no other kind may.
 */
function liveDashRange(eff: ClassEffect, live?: ClassLiveContext): number {
  return (eff.dashRange ?? 0) * (live?.dashRangeMul ?? 1);
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
  // fb148: the generic field-list fallback (`effectBlock`) is unreachable for
  // every shipped kind since fb108's sentence table, but it is where a fifth
  // `dash_*` kind would land before anyone wrote its sentence — and printing
  // the authored number there is the exact defect fb108/fb112/fb146/fb148
  // have now each fixed once. Carries the move-speed scaling only:
  // `fireDashSlash`'s Shoes doubling is one function's, not a field's, so it
  // has no place in a per-field override.
  if (typeof fields.dashRange === 'number') {
    overrides.dashRange = fields.dashRange * (live.dashRangeMul ?? 1);
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
  return `Hold to charge a self-centered nova: release immediately to hit everything within ${trimNum(eff.minRadius ?? 0)} tiles for ${trimNum(minDamage)} damage, or hold up to ${trimNum(eff.chargeCapSeconds ?? 0)}s for a ${trimNum(eff.radius)}-tile hit dealing ${trimNum(damage)} damage and knocking enemies back ${trimNum(eff.knockback ?? 0)} tiles.${AOE_FALLOFF_CLAUSE} Cooldown ${trimNum(cd)}s.`;
}

/**
 * fb112: `fireDashSlash` (classes.ts) passes `eff.dashWidth` straight into
 * `lineHit`'s parameter literally named `halfWidth`, and `lineHit`
 * (`src/sim/combat.ts`) rejects an enemy on `perp > halfWidth + e.radius` —
 * a half-corridor, so the line's true full width is `2 * dashWidth`. Same
 * bug class fb108 fixed in `dashTrailSentence`/`dashHealSentence` above;
 * this sentence (Swordsman's Circle Slash, the only normal-profile
 * `dash_line` kit) showed players half the real corridor.
 */
function dashSlashSentence(eff: ClassEffect, live?: ClassLiveContext, cooldownFactor?: number): string {
  const damage = liveDamageValue(eff.damage, live);
  const cd = liveCooldownValue(eff.cooldownSeconds, live, cooldownFactor);
  // fb150 (qa-playtester, fb112 verification): the old wording ("the
  // charge's own range and damage merge into this one hit") read as "you
  // keep the nova's coverage too" — `fireDashSlash` (classes.ts) spends the
  // charge into `hitRange = dashRange + mergedRadius` (extra LINE length,
  // not an area) and adds `mergedDamage` to this one line hit; the nova
  // itself never fires on this path. A player reading the old text as
  // "still get the nova" could whiff completely (charge behind them, dash
  // ahead) while paying a full Active1 cooldown for nothing.
  return `Dash ${trimNum(liveDashRange(eff, live) * (live?.swordsmanShoes ? 2 : 1))} tiles toward the cursor, slashing every enemy in a ${trimNum(2 * (eff.dashWidth ?? 0))}-tile-wide line for ${trimNum(damage)} damage.${LINE_FALLOFF_CLAUSE} Usable mid-Circle-Slash-charge: the charge's radius extends this line's reach and its damage is added to this hit — the nova itself does not fire. Cooldown ${trimNum(cd)}s.`;
}

function poisonBarrelSentence(eff: ClassEffect, live?: ClassLiveContext, cooldownFactor?: number): string {
  const dps = liveDamageValue(eff.damage, live);
  const cd = liveCooldownValue(eff.cooldownSeconds, live, cooldownFactor);
  return `Drops a ${trimNum(eff.radius)}-tile poison cloud dealing ${trimNum(dps)} damage/s for ${trimNum(eff.groundDurationSeconds ?? 0)}s.${AOE_FALLOFF_CLAUSE} Cooldown ${trimNum(cd)}s.`;
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

/** `summon_turret`/`ice_wall`: turns a `/data` tower key like `arrow_spire` into "Arrow Spire" — no tower-lookup table is threaded into this file, so this is a display-name approximation, not a `content.towerByKey` name. */
function humanizeKey(key: string): string {
  return key
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * `burst_damage`'s own `fireEffect` (classes.ts) deals `eff.damage *
 * w.derived.powerMul`, never `characterDamage`'s `(+ atkFlat) * damageMul`
 * formula `liveDamageValue` models — and `burnDps` is passed straight to
 * `applyBurn` with no live scaling of any kind. Both stay plain authored
 * numbers here rather than a fabricated live-resolved one (code-review
 * finding, fb108).
 */
function burstDamageSentence(eff: ClassEffect, live?: ClassLiveContext, cooldownFactor?: number): string {
  const cd = liveCooldownValue(eff.cooldownSeconds, live, cooldownFactor);
  return `Deals ${trimNum(eff.damage)} damage to everything within ${trimNum(eff.radius)} tiles, burning them for ${trimNum(eff.burnDps ?? 0)} damage/s for ${trimNum(eff.burnDuration ?? 0)}s. Cooldown ${trimNum(cd)}s.`;
}

function repairHealSentence(eff: ClassEffect, live?: ClassLiveContext, cooldownFactor?: number): string {
  const cd = liveCooldownValue(eff.cooldownSeconds, live, cooldownFactor);
  return `Repairs the nearest structure within ${trimNum(eff.radius)} tiles for ${formatPct(eff.repairFraction ?? 0)} of its max HP and grants it ${formatPct(eff.overclockAtkSpdMul ?? 0)} bonus attack speed for ${trimNum(eff.overclockSeconds ?? 0)}s. Cooldown ${trimNum(cd)}s.`;
}

function summonTurretSentence(eff: ClassEffect, live?: ClassLiveContext, cooldownFactor?: number): string {
  const cd = liveCooldownValue(eff.cooldownSeconds, live, cooldownFactor);
  const towerName = eff.towerKey ? humanizeKey(eff.towerKey) : 'a copied tower';
  return `Deploys a turret cloned from ${towerName} at ${formatPct(eff.summonStatMul ?? 0)} of its damage (full range and attack speed) at your position for ${trimNum(eff.summonDurationSeconds ?? 0)}s, up to ${trimNum(eff.summonCap ?? 0, 0)} standing at once. Cooldown ${trimNum(cd)}s.`;
}

/**
 * `fireFlameRoad` (classes.ts) pushes each trail patch as a `GroundArea`
 * with `radius: eff.dashWidth` — `dashWidth` is a radius, not a full width,
 * so the patch's true diameter ("how wide it is") is `2 * dashWidth`
 * (code-reviewer finding, fb108).
 */
function dashTrailSentence(eff: ClassEffect, live?: ClassLiveContext, cooldownFactor?: number): string {
  const dps = liveDamageValue(eff.damage, live);
  const cd = liveCooldownValue(eff.cooldownSeconds, live, cooldownFactor);
  return `Dash ${trimNum(liveDashRange(eff, live))} tiles toward the cursor, leaving ${trimNum(eff.trailSegments ?? 0, 0)} fire patches (${trimNum(2 * (eff.dashWidth ?? 0))} tiles wide) along the path, each dealing ${trimNum(dps)} damage/s for ${trimNum(eff.groundDurationSeconds ?? 0)}s.${PATCH_FALLOFF_CLAUSE} Cooldown ${trimNum(cd)}s.`;
}

/**
 * `fireDeadeyeDraw` (classes.ts) computes `characterDamage(w, cls, eff.damage
 * * (1+compoundPerSecond)^held)` — the compounding multiplies the raw /data
 * base *before* `atkFlat`/`damageMul` are folded in, not after. Displaying a
 * live (atkFlat-inclusive) damage number next to the compounding rate would
 * read as "this number grows by that rate," which overstates the real total
 * once `atkFlat > 0` (qa-playtester finding, fb108) — so this only shows the
 * live number for the release-now (0s-held) case, where the two formulas
 * coincide exactly, and calls the growth out as applying before bonuses.
 */
function chargePierceSentence(eff: ClassEffect, live?: ClassLiveContext, cooldownFactor?: number): string {
  const damage = liveDamageValue(eff.damage, live);
  const cd = liveCooldownValue(eff.cooldownSeconds, live, cooldownFactor);
  return `Hold to draw a piercing shot, up to ${trimNum(eff.chargeCapSeconds ?? 0)}s: damage compounds ${formatPct(eff.compoundPerSecond ?? 0)}/s of charge before your own bonuses are added, dealing ${trimNum(damage)} damage if released immediately. Gains +1 enemy pierced (cap ${trimNum(eff.pierceCap ?? 0, 0)}) per full second charged, while moving at ${formatPct(eff.moveMulWhileCharging ?? 0)} speed.${LINE_FALLOFF_CLAUSE} Cooldown ${trimNum(cd)}s between shots.`;
}

function dashVolleySentence(eff: ClassEffect, live?: ClassLiveContext, cooldownFactor?: number): string {
  const damage = liveDamageValue(eff.damage, live);
  const cd = liveCooldownValue(eff.cooldownSeconds, live, cooldownFactor);
  return `Dash ${trimNum(liveDashRange(eff, live))} tiles toward the cursor, firing ${trimNum(eff.volleyShots ?? 0, 0)} arrows at the nearest enemies within ${trimNum(eff.radius)} tiles for ${trimNum(damage)} damage each. Usable while charging a piercing shot without losing the charge. Cooldown ${trimNum(cd)}s.`;
}

function raiseSkeletonsSentence(eff: ClassEffect, live?: ClassLiveContext, cooldownFactor?: number): string {
  const cd = liveCooldownValue(eff.cooldownSeconds, live, cooldownFactor);
  return `Raises corpses within ${trimNum(eff.summonRadius ?? 0)} tiles into skeletons (${formatPct(eff.summonStatMul ?? 0)} of your basic attack) for ${trimNum(eff.summonDurationSeconds ?? 0)}s, up to ${trimNum(eff.summonCap ?? 0, 0)} standing at once. Cooldown ${trimNum(cd)}s.`;
}

function deathPactSentence(eff: ClassEffect, live?: ClassLiveContext, cooldownFactor?: number): string {
  const cd = liveCooldownValue(eff.cooldownSeconds, live, cooldownFactor);
  return `Toggles a pact on the nearest tower within ${trimNum(eff.radius)} tiles: while active it deals ${formatPct(eff.pactDamageMul ?? 0)} more damage and attacks ${formatPct(eff.pactAtkSpdMul ?? 0)} faster, but loses ${formatPct(eff.pactDrainPerSecond ?? 0)} of its max HP per second. If the drain kills it, a Bone Pylon (${trimNum(eff.pylonDps ?? 0)} damage/s within ${trimNum(eff.pylonRange ?? 0)} tiles) rises in its place. Cooldown ${trimNum(cd)}s.`;
}

function frostNovaSentence(eff: ClassEffect, live?: ClassLiveContext, cooldownFactor?: number): string {
  const damage = liveDamageValue(eff.damage, live);
  const cd = liveCooldownValue(eff.cooldownSeconds, live, cooldownFactor);
  return `Deals ${trimNum(damage)} damage to everything within ${trimNum(eff.radius)} tiles, applying Frost — an already-Frosted enemy freezes solid instead. Cooldown ${trimNum(cd)}s.`;
}

function iceWallSentence(eff: ClassEffect, live?: ClassLiveContext, cooldownFactor?: number): string {
  const cd = liveCooldownValue(eff.cooldownSeconds, live, cooldownFactor);
  const towerName = eff.towerKey ? humanizeKey(eff.towerKey) : 'a temporary wall';
  return `Raises a temporary 1×3 wall of ${towerName}s facing your aim for ${trimNum(eff.wallSeconds ?? 0)}s, blocking enemy paths. Cooldown ${trimNum(cd)}s.`;
}

function chainLightningSentence(eff: ClassEffect, live?: ClassLiveContext, cooldownFactor?: number): string {
  const damage = liveDamageValue(eff.damage, live);
  const cd = liveCooldownValue(eff.cooldownSeconds, live, cooldownFactor);
  return `Bolts the nearest enemy within ${trimNum(eff.radius)} tiles for ${trimNum(damage)} damage, chaining to up to ${trimNum(eff.chainCount ?? 0, 0)} enemies total, each jump dealing ${formatPct(eff.chainGrowth ?? 0)} more (compounding, capped at jump ${trimNum(eff.chainCap ?? 0, 0)}). Cooldown ${trimNum(cd)}s.`;
}

function overloadSentence(eff: ClassEffect, live?: ClassLiveContext, cooldownFactor?: number): string {
  const cd = liveCooldownValue(eff.cooldownSeconds, live, cooldownFactor);
  return `For ${trimNum(eff.overloadSeconds ?? 0)}s, Chain Surge gains ${trimNum(eff.overloadExtraChains ?? 0, 0)} extra jumps and electric towers' wire pulses fire twice as fast. Cooldown ${trimNum(cd)}s.`;
}

function bloodTitheSentence(eff: ClassEffect, live?: ClassLiveContext, cooldownFactor?: number): string {
  const cd = liveCooldownValue(eff.cooldownSeconds, live, cooldownFactor);
  return `Pays ${formatPct(eff.titheHpFraction ?? 0)} of the nearest untithed tower's current HP (within ${trimNum(eff.radius)} tiles) for a permanent ${formatPct(eff.titheDamageMul ?? 0)} damage bonus. Cooldown ${trimNum(cd)}s.`;
}

/**
 * `fireCrimsonRush` (classes.ts) names its own local copy of `eff.dashWidth`
 * `half` and tests `Math.abs(cross) > half + e.radius` — a half-width, so the
 * corridor's true full width is `2 * dashWidth` (code-reviewer finding,
 * fb108, same bug class as `dashTrailSentence` above).
 */
function dashHealSentence(eff: ClassEffect, live?: ClassLiveContext, cooldownFactor?: number): string {
  const cd = liveCooldownValue(eff.cooldownSeconds, live, cooldownFactor);
  return `Dash ${trimNum(liveDashRange(eff, live))} tiles toward the cursor, healing ${trimNum(eff.healPerEnemy ?? 0)} HP for each enemy passed through (${trimNum(2 * (eff.dashWidth ?? 0))} tiles wide). Cooldown ${trimNum(cd)}s.`;
}

function manifestSpiritSentence(eff: ClassEffect, live?: ClassLiveContext, cooldownFactor?: number): string {
  const cd = liveCooldownValue(eff.cooldownSeconds, live, cooldownFactor);
  return `Summons a spirit of the nearest built attack tower within ${trimNum(eff.summonRadius ?? 0)} tiles at ${formatPct(eff.summonStatMul ?? 0)} of its damage at max upgrade (full range and attack speed) for ${trimNum(eff.summonDurationSeconds ?? 0)}s, up to ${trimNum(eff.summonCap ?? 0, 0)} standing at once. Cooldown ${trimNum(cd)}s.`;
}

function recallTotemSentence(eff: ClassEffect, live?: ClassLiveContext, cooldownFactor?: number): string {
  const cd = liveCooldownValue(eff.cooldownSeconds, live, cooldownFactor);
  return `Places a totem for ${trimNum(eff.totemDurationSeconds ?? 0)}s: you and your summons within ${trimNum(eff.radius)} tiles attack ${formatPct(eff.auraAtkSpdMul ?? 0)} faster. In Tower Defense it also taunts nearby enemies toward it. Cooldown ${trimNum(cd)}s.`;
}

function clarionTauntSentence(eff: ClassEffect, live?: ClassLiveContext, cooldownFactor?: number): string {
  const cd = liveCooldownValue(eff.cooldownSeconds, live, cooldownFactor);
  return `Forces every enemy within ${trimNum(eff.radius)} tiles to target you for ${trimNum(eff.tauntDurationSeconds ?? 0)}s; damage you take during it banks more strongly into Wrath. Cooldown ${trimNum(cd)}s.`;
}

function judgementSentence(eff: ClassEffect, live?: ClassLiveContext, cooldownFactor?: number): string {
  const cd = liveCooldownValue(eff.cooldownSeconds, live, cooldownFactor);
  return `Releases all stored Wrath as a holy nova within ${trimNum(eff.radius)} tiles, dealing ${trimNum(eff.wrathDamageMul ?? 0)}× the stored amount as damage.${AOE_FALLOFF_CLAUSE} Cooldown ${trimNum(cd)}s.`;
}

/**
 * fb063 (extended fb108): a hand-authored sentence per Active `kind` — every
 * one of the 24 kinds `data/classes.json` actually authors an Active with,
 * not just the 3 normal-profile classes' 6 fb063 originally covered. A kind
 * with no entry here would fall through to `effectBlock`'s bare numeric-field
 * list (`activeSkillMarkup` below); fb108's own regression test asserts that
 * fallback is now unreachable for every real `kind`.
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
  burst_damage: burstDamageSentence,
  repair_heal: repairHealSentence,
  summon_turret: summonTurretSentence,
  dash_trail: dashTrailSentence,
  charge_pierce: chargePierceSentence,
  dash_volley: dashVolleySentence,
  raise_skeletons: raiseSkeletonsSentence,
  death_pact: deathPactSentence,
  frost_nova: frostNovaSentence,
  ice_wall: iceWallSentence,
  chain_lightning: chainLightningSentence,
  overload: overloadSentence,
  blood_tithe: bloodTitheSentence,
  dash_heal: dashHealSentence,
  manifest_spirit: manifestSpiritSentence,
  recall_totem: recallTotemSentence,
  clarion_taunt: clarionTauntSentence,
  judgement: judgementSentence,
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
export function activeSkillMarkup(
  cls: ClassDef,
  which: 'active1' | 'active2',
  live?: ClassLiveContext,
  keyBindings: KeyBindings = defaultKeyBindings(),
): string {
  const eff = which === 'active1' ? cls.active1 : cls.active2;
  const key = keyLabel(keyBindings[which]);
  const label = which === 'active1' ? `${key}, Active 1` : `${key}, Active 2`;
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
export function classAbilitiesMarkup(
  cls: ClassDef,
  opts: { live?: ClassLiveContext; keyBindings?: KeyBindings } = {},
): string {
  const { live, keyBindings = defaultKeyBindings() } = opts;
  return [
    `<div class="sw-effectblock">
      <b>Basic attack</b>
      ${numericFieldListHtml(cls.basicAttack, liveOverrides(cls.basicAttack, live))}
    </div>`,
    activeSkillMarkup(cls, 'active1', live, keyBindings),
    activeSkillMarkup(cls, 'active2', live, keyBindings),
    passiveSkillMarkup(cls),
    towerPassiveSkillMarkup(cls),
  ].join('');
}
