/**
 * @vitest-environment jsdom
 *
 * fb063 (SPEC-FINAL §11, amends fb026/fb028, owner feedback
 * `feature-skill-icons-hover-only`): the bottom bar's passive/Active1/
 * Active2/tower-passive icons are hover-only (no click, no sticky panel) and
 * their tooltips are written sentence-form text with live numbers embedded,
 * not a bare field list.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { characterDamage, classAttackPowerMul } from '../src/sim/classes';
import { dotDpsFor } from '../src/sim/damagetypes';
import { active1PotencyMul } from '../src/sim/progression';
import { World } from '../src/sim/world';
import { Hud, type HudCallbacks } from '../src/ui/hud';
import { cfg } from './helpers';

// fb057: Madness King is the fourth normal-profile class.
const NORMAL_PROFILE_CLASSES = ['swordsman', 'plaguebringer', 'time_lord', 'madness_king'] as const;

function mountHud(overrides: Partial<HudCallbacks> = {}): { root: HTMLElement; hud: Hud; cb: HudCallbacks } {
  const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app') as HTMLElement;
  const cb: HudCallbacks = {
    onSelectTower: vi.fn(),
    onCallWave: vi.fn(),
    onPickOffer: vi.fn(),
    onReroll: vi.fn(),
    onRetry: vi.fn(),
    onNewRun: vi.fn(),
    onToggleRanges: vi.fn(),
    onToggleAutoPick: vi.fn(),
    onToggleCharacterPanel: vi.fn(),
    onEquipItem: vi.fn(),
    onToggleDpsPanel: vi.fn(),
    onResume: vi.fn(),
    onPause: vi.fn(),
    onCycleSpeed: vi.fn(),
    onSetSpeed: vi.fn(),
    onDev: vi.fn(),
    onQuitToHub: vi.fn(),
    onHoverSkill: vi.fn(),
    onUpgradeStructure: vi.fn(),
    onSellStructure: vi.fn(),
    onUpgradeCore: vi.fn(),
    ...overrides,
  };
  const hud = new Hud(root, cb);
  return { root, hud, cb };
}

describe('fb063: bottom bar skill icons are hover-only', () => {
  it('clicking any of the 4 icons (passive/tower passive/active1/active2) calls no callback', () => {
    const w = new World(cfg({ classKey: 'swordsman' }));
    const { root, hud, cb } = mountHud();
    hud.buildTowerBar(w);
    hud.update(w);

    const ids = ['#sw-bb-passive', '#sw-bb-towerpassive', '#sw-bb-active1', '#sw-bb-active2'];
    for (const id of ids) {
      const el = root.querySelector(id) as HTMLElement;
      expect(el).toBeTruthy();
      el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    }
    for (const fn of Object.values(cb)) {
      expect(fn as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    }
  });

  it('exposes exactly 4 bottom-bar skill icons', () => {
    const w = new World(cfg({ classKey: 'swordsman' }));
    const { root, hud } = mountHud();
    hud.buildTowerBar(w);
    hud.update(w);
    expect(root.querySelectorAll('.sw-bb-skill').length).toBe(4);
  });
});

describe('fb063: bottom bar tooltips are sentence-form with live numbers', () => {
  for (const key of NORMAL_PROFILE_CLASSES) {
    it(`${key}: passive/tower-passive tooltips contain the class-info.ts description sentence`, () => {
      const w = new World(cfg({ classKey: key }));
      const cls = w.content.classByKey.get(key)!;
      const { root, hud } = mountHud();
      hud.buildTowerBar(w);
      hud.update(w);
      const passiveTip = root.querySelector('#sw-bb-passive-tip') as HTMLElement;
      const towerTip = root.querySelector('#sw-bb-towerpassive-tip') as HTMLElement;
      expect(passiveTip.innerHTML).toContain(cls.passive.name);
      expect(passiveTip.innerHTML).toContain(cls.passive.description);
      expect(towerTip.innerHTML).toContain(cls.towerPassive.name);
      expect(towerTip.innerHTML).toContain(cls.towerPassive.description);
    });
  }

  it("swordsman: Circle Slash's tooltip embeds live-resolved (atkFlat/damageMul-scaled) damage numbers, not the raw /data ones", () => {
    const w = new World(cfg({ classKey: 'swordsman' }));
    w.derived.atkFlat = 10;
    w.derived.powerMul = 1.5;
    const cls = w.content.classByKey.get('swordsman')!;
    const { root, hud } = mountHud();
    hud.buildTowerBar(w);
    hud.update(w);
    const tip = root.querySelector('#sw-bb-a1-tip') as HTMLElement;

    const damageMul = classAttackPowerMul(w, cls);
    const liveDamage = (cls.active1.damage + w.derived.atkFlat) * damageMul;
    const liveMinDamage = ((cls.active1.minDamage ?? 0) + w.derived.atkFlat) * damageMul;
    const rawDamage = cls.active1.damage;

    expect(liveDamage).not.toBe(rawDamage);
    expect(tip.innerHTML).toContain('Hold to charge a self-centered nova');
    expect(tip.innerHTML).toContain(`${String(liveMinDamage)} damage`);
    expect(tip.innerHTML).toContain(`${String(liveDamage)} damage`);
    expect(tip.innerHTML).not.toContain(`${String(rawDamage)} damage`);
  });

  it("plaguebringer: Poison Barrel's tooltip embeds the live per-application poison total (fb062: the owner's per-application wording, which replaced the flat damage/s)", () => {
    const w = new World(cfg({ classKey: 'plaguebringer' }));
    w.derived.atkFlat = 4;
    w.derived.powerMul = 2;
    // fb062 (code review): the Active1 potency card the sim multiplies in.
    w.skillCardRanks['plaguebringer_active1_potency'] = 2;
    const cls = w.content.classByKey.get('plaguebringer')!;
    const { root, hud } = mountHud();
    hud.buildTowerBar(w);
    hud.update(w);
    const tip = root.querySelector('#sw-bb-a1-tip') as HTMLElement;
    // Exactly what `firePoisonBarrel` seeds each application with.
    const poison = w.content.damageTypeByKey.get('poison')!;
    const seed = characterDamage(w, cls, cls.active1.damage) * active1PotencyMul(w);
    expect(active1PotencyMul(w)).toBeGreaterThan(1);
    const perApplication = dotDpsFor(poison, seed) * poison.duration!;
    expect(tip.innerHTML).toContain('poison cloud');
    expect(tip.innerHTML).toContain(`each application deals ${String(Math.round(perApplication * 100) / 100)} poison damage over ${poison.duration}s`);
    expect(classAttackPowerMul(w, cls)).toBe(2);
  });

  it("time_lord: Time's tooltip embeds live-resolved per-stage DoT numbers and the CDR-scaled recharge", () => {
    const w = new World(cfg({ classKey: 'time_lord' }));
    w.derived.atkFlat = 6;
    w.derived.powerMul = 1.25;
    w.derived.cdr = 0.5;
    const cls = w.content.classByKey.get('time_lord')!;
    const { root, hud } = mountHud();
    hud.buildTowerBar(w);
    hud.update(w);
    const tip = root.querySelector('#sw-bb-a1-tip') as HTMLElement;
    const damageMul = classAttackPowerMul(w, cls);
    const livePastDps = ((cls.active1.markPastDotDps ?? 0) + w.derived.atkFlat) * damageMul;
    const livePresentDps = ((cls.active1.markPresentDotDps ?? 0) + w.derived.atkFlat) * damageMul;
    const liveRecharge = (cls.active1.rechargeSeconds ?? 0) * (1 - w.derived.cdr);
    const rawRecharge = cls.active1.rechargeSeconds ?? 0;

    expect(liveRecharge).not.toBe(rawRecharge);
    expect(tip.innerHTML).toContain('4-stage mark');
    expect(tip.innerHTML).toContain(`${String(livePastDps)} damage/s`);
    expect(tip.innerHTML).toContain(`${String(livePresentDps)} damage/s`);
    expect(tip.innerHTML).toContain(`${String(liveRecharge)}s to recharge each`);
    expect(tip.innerHTML).not.toContain(`${String(rawRecharge)}s to recharge each`);
    // code-reviewer finding (fb063): the charge count must read `maxCharges`
    // off /data, not a hardcoded literal that could silently desync from a
    // future balance-only retune.
    expect(tip.innerHTML).toContain(`${cls.active1.maxCharges} charges`);
  });

  it("time_lord: Time Lock's tooltip charge count reads maxCharges, not a hardcoded literal", () => {
    const w = new World(cfg({ classKey: 'time_lord' }));
    const cls = w.content.classByKey.get('time_lord')!;
    const { root, hud } = mountHud();
    hud.buildTowerBar(w);
    hud.update(w);
    const tip = root.querySelector('#sw-bb-a2-tip') as HTMLElement;
    expect(tip.innerHTML).toContain(`${cls.active2.maxCharges} charges`);
  });

  it("madness_king: Mind Manipulation's tooltip reads maxCharges, the CDR-scaled recharge and the elite branch's /data shape", () => {
    const w = new World(cfg({ classKey: 'madness_king' }));
    w.derived.cdr = 0.5;
    const cls = w.content.classByKey.get('madness_king')!;
    const { root, hud } = mountHud();
    hud.buildTowerBar(w);
    hud.update(w);
    const tip = root.querySelector('#sw-bb-a1-tip') as HTMLElement;
    const liveRecharge = (cls.active1.rechargeSeconds ?? 0) * (1 - w.derived.cdr);
    const rawRecharge = cls.active1.rechargeSeconds ?? 0;
    expect(liveRecharge).not.toBe(rawRecharge);
    expect(tip.innerHTML).toContain(cls.active1.name);
    expect(tip.innerHTML).toContain(`${cls.active1.maxCharges} charges`);
    expect(tip.innerHTML).toContain(`${String(liveRecharge)}s to recharge each`);
    expect(tip.innerHTML).not.toContain(`${String(rawRecharge)}s to recharge each`);
    expect(tip.innerHTML).toContain(`${cls.active1.eliteConvertTicks} times`);
    expect(tip.innerHTML).toContain(`slowed ${String((cls.active1.eliteConvertSlowAmount ?? 0) * 100)}%`);
  });

  it("madness_king: Spreading Madness's tooltip reads the CDR-scaled cooldown and the authored madness duration", () => {
    const w = new World(cfg({ classKey: 'madness_king' }));
    w.derived.cdr = 0.5;
    const cls = w.content.classByKey.get('madness_king')!;
    const { root, hud } = mountHud();
    hud.buildTowerBar(w);
    hud.update(w);
    const tip = root.querySelector('#sw-bb-a2-tip') as HTMLElement;
    const liveCd = cls.active2.cooldownSeconds * (1 - w.derived.cdr);
    expect(tip.innerHTML).toContain(cls.active2.name);
    expect(tip.innerHTML).toContain(`Cooldown ${String(liveCd)}s`);
    expect(tip.innerHTML).toContain(`mad for ${String(cls.active2.madnessDurationSeconds)}s`);
  });
});
