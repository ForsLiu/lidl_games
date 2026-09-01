/**
 * Persistent bottom HUD bar data model (SPEC-FINAL §11, owner feedback
 * `feature-bottom-bar-hud`, BACKLOG.md fb026).
 *
 * Pure presentation math off `World` — no DOM here, so the cooldown-sweep
 * fraction this computes can be asserted directly against `Warden`'s own
 * cooldown fields in a test without touching jsdom.
 */

import { active2CdrFactor } from '../sim/classes';
import type { ClassDef } from '../sim/content';
import type { World } from '../sim/world';

type ClassSkillDef = ClassDef['active1'];

export interface SkillIconState {
  key: 'active1' | 'active2';
  hotkey: 'Q' | 'E';
  name: string;
  /** Seconds left before this Active (or, for a multi-charge Active, its next charge) is usable. */
  cooldownRemaining: number;
  /** The cooldown `cooldownRemaining` counts down from — CDR-reduced, matching the sim's own gate. */
  maxCooldown: number;
  /**
   * MOBA convention: 1 right after use, shrinking clockwise to 0 at ready.
   * `cooldownRemaining / maxCooldown`, clamped — the same fraction the sim's
   * own gate compares `cooldownRemaining <= 0` against zero.
   */
  sweepFraction: number;
  /** True once usable — `cooldownRemaining <= 0` for a single-charge Active, `current > 0` for a multi-charge one. */
  ready: boolean;
  /** Only set for a `maxCharges > 1` Active (Time Lord's "Time"/"Time Lock", fb013); null for every other class. */
  charges: { current: number; max: number } | null;
}

export interface PassiveBarState {
  name: string;
  /** A short live-value readout when this class's passive carries visible warden-side state; '' otherwise. */
  stateText: string;
}

export interface BottomBarData {
  hp: { current: number; max: number };
  gold: number;
  passive: PassiveBarState;
  active1: SkillIconState;
  active2: SkillIconState;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function skillState(w: World, eff: ClassSkillDef, which: 'active1' | 'active2'): SkillIconState {
  const wd = w.warden;
  const hotkey = which === 'active1' ? 'Q' : 'E';
  const maxCharges = eff.maxCharges ?? 1;
  // Active2's real cooldown gate (`updateWarden`/`tickAmmoRecharge`, classes.ts)
  // is reduced by `active2CdrFactor` — the general `cdr` stat *and* the §6.3
  // "Active2 cooldown" skill card every one of the 12 classes has — not the
  // plain `1 - cdr` Active1 uses. Using the wrong factor here would desync
  // the sweep from the sim's own gate the moment a run has any rank in that
  // card (code-reviewer finding, fb026).
  const factor = which === 'active1' ? 1 - w.derived.cdr : active2CdrFactor(w);
  if (maxCharges > 1) {
    // fb013 ammo-style Active (Time Lord's *Time*/*Time Lock*, both actives):
    // the sweep tracks recharge progress toward the *next* charge, not a
    // single cooldown gate.
    const ammo = which === 'active1' ? wd.active1Ammo : wd.active2Ammo;
    const ammoCooldown = which === 'active1' ? wd.active1AmmoCooldown : wd.active2AmmoCooldown;
    const maxCooldown = (eff.rechargeSeconds ?? 0) * factor;
    const sweepFraction = ammo < maxCharges && maxCooldown > 0 ? clamp01(ammoCooldown / maxCooldown) : 0;
    return {
      key: which,
      hotkey,
      name: eff.name,
      cooldownRemaining: ammo < maxCharges ? ammoCooldown : 0,
      maxCooldown,
      sweepFraction,
      ready: ammo > 0,
      charges: { current: ammo, max: maxCharges },
    };
  }
  const cooldownRemaining = which === 'active1' ? wd.active1Cooldown : wd.active2Cooldown;
  const maxCooldown = eff.cooldownSeconds * factor;
  const sweepFraction = maxCooldown > 0 ? clamp01(cooldownRemaining / maxCooldown) : 0;
  return {
    key: which,
    hotkey,
    name: eff.name,
    cooldownRemaining: Math.max(0, cooldownRemaining),
    maxCooldown,
    sweepFraction,
    ready: cooldownRemaining <= 0,
    charges: null,
  };
}

/**
 * The passive's live warden-side state, where one clearly exists on `Warden`
 * itself. Most classes' passives have no single live number worth a badge
 * (they're always-on stat mods, or their state lives on the *enemy* they hit,
 * like Cryomancer's `frostHitStacks`) — those show the name alone, same as
 * every icon shows at minimum.
 */
function passiveStateText(w: World, cls: ClassDef): string {
  const wd = w.warden;
  switch (cls.passive.kind) {
    case 'guardian_stance':
      return wd.wrathStored > 0 ? `Wrath ${Math.round(wd.wrathStored)}` : '';
    case 'time_flow':
      return wd.dots.length > 0 ? `Stored ${wd.dots.length}` : '';
    case 'corpse_drop':
      return w.corpses.length > 0 ? `Corpses ${w.corpses.length}` : '';
    default:
      return '';
  }
}

export function bottomBarData(w: World): BottomBarData {
  const cls = w.content.classByKey.get(w.cfg.classKey);
  const d = w.derived;
  const hp = { current: Math.max(0, w.warden.hp), max: d.maxHp };
  if (!cls) {
    const empty: SkillIconState = {
      key: 'active1',
      hotkey: 'Q',
      name: '',
      cooldownRemaining: 0,
      maxCooldown: 0,
      sweepFraction: 0,
      ready: true,
      charges: null,
    };
    return { hp, gold: w.gold, passive: { name: '', stateText: '' }, active1: empty, active2: { ...empty, key: 'active2', hotkey: 'E' } };
  }
  return {
    hp,
    gold: w.gold,
    passive: { name: cls.passive.name, stateText: passiveStateText(w, cls) },
    active1: skillState(w, cls.active1, 'active1'),
    active2: skillState(w, cls.active2, 'active2'),
  };
}
