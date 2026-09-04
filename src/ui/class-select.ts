/**
 * fb058 (SPEC-FINAL §4, §11): the Hub's Class-select screen — a horizontal
 * row of class cards, filtered to the normal-profile roster unless the dev
 * "show hidden classes" setting is on, plus the selected class's band/number
 * stat panel and its four hover-only skill entries (passive, tower passive,
 * Active1, Active2). The sentence-form hover text itself is `class-info.ts`'s
 * existing fb022/fb026 machinery — this file only adds the band table and
 * the markup that wires those pieces into the new layout.
 */

import type { ClassDef } from '../sim/content';
import { activeSkillMarkup, passiveSkillMarkup, towerPassiveSkillMarkup } from './class-info';
import { defaultKeyBindings, keyLabel, type KeyBindings } from './keybindings';

/**
 * SPEC-FINAL §4: only the three owner-verbatim/owner-priority classes show in
 * a normal profile. Every other class stays fully playable (sim gates, quest
 * unlocks, Tuner, dev profile) — this list gates the Hub's Class screen only.
 */
export const NORMAL_PROFILE_CLASS_KEYS: readonly string[] = ['swordsman', 'plaguebringer', 'time_lord'];

export type Band = 'low' | 'medium' | 'high';
export type AoeBand = 'yes' | 'no' | 'small';

export interface ClassBandProfile {
  range: Band;
  dmg: Band;
  spd: Band;
  aoe: AoeBand;
  move: Band;
}

/** SPEC-FINAL §4.1/§4.2's authored bands table, keyed by `data/classes.json`'s `key`. */
export const CLASS_BANDS: Record<string, ClassBandProfile> = {
  swordsman: { range: 'low', dmg: 'high', spd: 'high', aoe: 'yes', move: 'high' },
  plaguebringer: { range: 'high', dmg: 'low', spd: 'medium', aoe: 'no', move: 'medium' },
  archer: { range: 'high', dmg: 'medium', spd: 'medium', aoe: 'no', move: 'medium' },
  engineer: { range: 'medium', dmg: 'low', spd: 'medium', aoe: 'no', move: 'medium' },
  pyromancer: { range: 'medium', dmg: 'medium', spd: 'medium', aoe: 'yes', move: 'medium' },
  necromancer: { range: 'medium', dmg: 'low', spd: 'low', aoe: 'no', move: 'low' },
  cryomancer: { range: 'high', dmg: 'low', spd: 'medium', aoe: 'small', move: 'medium' },
  stormcaller: { range: 'high', dmg: 'medium', spd: 'medium', aoe: 'small', move: 'medium' },
  bloodlord: { range: 'low', dmg: 'high', spd: 'medium', aoe: 'small', move: 'high' },
  animist: { range: 'medium', dmg: 'low', spd: 'medium', aoe: 'no', move: 'medium' },
  paladin: { range: 'low', dmg: 'medium', spd: 'low', aoe: 'yes', move: 'low' },
  time_lord: { range: 'medium', dmg: 'medium', spd: 'medium', aoe: 'no', move: 'medium' },
};

interface BandRow {
  label: string;
  band?: string;
  value: string;
}

/** The bottom panel's "band/number stats" block: SPEC-FINAL §4's five archetype dimensions, each with its authored band and the live /data number behind it. */
export function classBandStatsMarkup(cls: ClassDef): string {
  const band = CLASS_BANDS[cls.key];
  const atkPerSec = cls.basicAttack.interval > 0 ? 1 / cls.basicAttack.interval : 0;
  const rows: BandRow[] = [
    { label: 'Range', band: band?.range, value: `${cls.basicAttack.range} tiles` },
    { label: 'Damage', band: band?.dmg, value: `${cls.basicAttack.dps} dps` },
    { label: 'Attack speed', band: band?.spd, value: `${atkPerSec.toFixed(2)}/s` },
    { label: 'AoE', band: band?.aoe, value: cls.basicAttack.aoe > 0 ? `${cls.basicAttack.aoe} tiles` : 'none' },
    { label: 'Move speed', band: band?.move, value: `+${Math.round(cls.moveSpeedBonus * 100)}%` },
  ];
  return `<div class="sw-classbands">
    ${rows
      .map(
        (r) => `<div class="sw-classband">
          <span class="sw-classband-label">${r.label}</span>
          ${r.band ? `<b class="sw-classband-tier sw-classband-${r.band}">${r.band}</b>` : ''}
          <span class="sw-classband-num">${r.value}</span>
        </div>`,
      )
      .join('')}
  </div>`;
}

/**
 * The four hover-only entries (passive/tower passive/Active1/Active2): a
 * short always-visible label, with `class-info.ts`'s full sentence-form
 * effect text (base /data numbers — no run is in progress on this screen)
 * revealed on hover/focus via `.sw-cs-tip`'s CSS (style.css).
 */
export function classSelectSkillsMarkup(cls: ClassDef, keyBindings: KeyBindings = defaultKeyBindings()): string {
  const entries: { label: string; body: string }[] = [
    { label: `Passive — ${cls.passive.name}`, body: passiveSkillMarkup(cls) },
    { label: `Tower passive — ${cls.towerPassive.name}`, body: towerPassiveSkillMarkup(cls) },
    {
      label: `Active1 (${keyLabel(keyBindings.active1)}) — ${cls.active1.name}`,
      body: activeSkillMarkup(cls, 'active1', undefined, keyBindings),
    },
    {
      label: `Active2 (${keyLabel(keyBindings.active2)}) — ${cls.active2.name}`,
      body: activeSkillMarkup(cls, 'active2', undefined, keyBindings),
    },
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
