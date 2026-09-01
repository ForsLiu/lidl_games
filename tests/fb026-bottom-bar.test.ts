/**
 * @vitest-environment jsdom
 *
 * fb026 — persistent bottom HUD bar (SPEC-FINAL §11, owner feedback
 * `feature-bottom-bar-hud`). `bottomBarData` (src/ui/bottom-bar.ts) is a pure
 * function off `World`, so the cooldown-sweep fraction it computes can be
 * asserted directly against `Warden`'s own cooldown fields for all 12
 * classes without touching the DOM; a second block covers the DOM bar
 * itself (visible in both phases, hidden under an overlay, tooltip text).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { bottomBarData } from '../src/ui/bottom-bar';
import { active2CdrFactor } from '../src/sim/classes';
import { loadContent } from '../src/sim/content';
import { World } from '../src/sim/world';
import { Hud } from '../src/ui/hud';
import { fieldValueText } from '../src/ui/info-format';
import { cfg } from './helpers';

const content = loadContent();
const CLASS_KEYS = content.classes.classes.map((c) => c.key);

describe('fb026 bottom bar — sweep fraction matches sim cooldown fields', () => {
  it('covers all 12 classes', () => {
    expect(CLASS_KEYS.length).toBe(12);
  });

  for (const key of CLASS_KEYS) {
    it(`${key}: active1/active2 sweepFraction == cooldownRemaining / effective max cooldown`, () => {
      const w = new World(cfg({ classKey: key }));
      const cls = w.content.classByKey.get(key)!;

      // Half-elapsed cooldowns on both Actives (ammo-style Time Lord included:
      // draining one charge leaves `active1Ammo < maxCharges`, at which point
      // `active1AmmoCooldown` is the field the sweep tracks instead).
      const max1 = cls.active1.maxCharges ?? 1;
      const max2 = cls.active2.maxCharges ?? 1;
      // A multi-charge Active (fb013 Time Lord) is still castable with
      // charges in the bank, so it drains to 0 charges to exercise the
      // "recharging, not ready" half of the sweep the same as a single-
      // cooldown Active's `cooldownRemaining > 0`.
      if (max1 > 1) {
        w.warden.active1Ammo = 0;
        w.warden.active1AmmoCooldown = ((cls.active1.rechargeSeconds ?? 0) * (1 - w.derived.cdr)) / 2;
      } else {
        w.warden.active1Cooldown = (cls.active1.cooldownSeconds * (1 - w.derived.cdr)) / 2;
      }
      // Active2's real cooldown is reduced by `active2CdrFactor` (the general
      // `cdr` stat *and* the §6.3 Active2-cooldown skill card), not the plain
      // `1 - cdr` Active1 uses — both equal 1 on this fresh, card-less `cfg()`
      // run, but using the wrong one here would hide the mismatch the
      // dedicated skill-card test below exercises directly.
      const factor2 = active2CdrFactor(w);
      if (max2 > 1) {
        w.warden.active2Ammo = 0;
        w.warden.active2AmmoCooldown = ((cls.active2.rechargeSeconds ?? 0) * factor2) / 2;
      } else {
        w.warden.active2Cooldown = (cls.active2.cooldownSeconds * factor2) / 2;
      }

      const data = bottomBarData(w);
      expect(data.active1.sweepFraction).toBeCloseTo(0.5, 5);
      expect(data.active1.ready).toBe(false);
      expect(data.active2.sweepFraction).toBeCloseTo(0.5, 5);
      expect(data.active2.ready).toBe(false);

      // Fully recharged reads as ready with a zero sweep, whichever field
      // gates readiness for this class's Active kind.
      if (max1 > 1) w.warden.active1Ammo = max1;
      else w.warden.active1Cooldown = 0;
      if (max2 > 1) w.warden.active2Ammo = max2;
      else w.warden.active2Cooldown = 0;
      const ready = bottomBarData(w);
      expect(ready.active1.sweepFraction).toBe(0);
      expect(ready.active1.ready).toBe(true);
      expect(ready.active2.sweepFraction).toBe(0);
      expect(ready.active2.ready).toBe(true);
    });
  }

  it('active2 sweep tracks the §6.3 Active2-cooldown skill card, not just the general cdr stat', () => {
    // code-reviewer finding: an earlier version of `skillState` computed
    // Active2's `maxCooldown` with the same plain `1 - cdr` factor Active1
    // uses, which desyncs from the sim's own `active2CdrFactor` gate
    // (classes.ts) the moment a run has any rank in this card — every one of
    // the 12 classes has one (data/vsupgrades.json).
    const w = new World(cfg({ classKey: 'swordsman' }));
    const cls = w.content.classByKey.get('swordsman')!;
    w.skillCardRanks['swordsman_active2_cdr'] = 1;
    const realMaxCooldown = cls.active2.cooldownSeconds * active2CdrFactor(w);
    expect(realMaxCooldown).toBeLessThan(cls.active2.cooldownSeconds * (1 - w.derived.cdr));
    w.warden.active2Cooldown = realMaxCooldown / 2;
    const data = bottomBarData(w);
    expect(data.active2.maxCooldown).toBeCloseTo(realMaxCooldown, 5);
    expect(data.active2.sweepFraction).toBeCloseTo(0.5, 5);
  });
});

describe('fb026 bottom bar — DOM', () => {
  const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

  function mountHud(): { root: HTMLElement; hud: Hud } {
    document.head.innerHTML = `<style>${CSS}</style>`;
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.getElementById('app') as HTMLElement;
    const hud = new Hud(root, {
      onSelectTower: () => {},
      onCallWave: () => {},
      onPickOffer: () => {},
      onReroll: () => {},
      onRetry: () => {},
      onNewRun: () => {},
      onToggleRanges: () => {},
      onToggleAutoPick: () => {},
      onToggleCharacterPanel: () => {},
      onEquipItem: () => {},
      onToggleDpsPanel: () => {},
      onResume: () => {},
      onPause: () => {},
      onCycleSpeed: () => {},
      onDev: () => {},
      onQuitToHub: () => {},
      onHoverSkill: () => {}, onUpgradeStructure: () => {}, onSellStructure: () => {}, onUpgradeCore: () => {},
    });
    return { root, hud };
  }

  it('is visible with HP/gold numbers and both Active hotkeys during a TD run', () => {
    const w = new World(cfg());
    const { root, hud } = mountHud();
    hud.buildTowerBar(w);
    hud.update(w);
    const bar = root.querySelector('#sw-bottombar') as HTMLElement;
    expect(bar.classList.contains('sw-off')).toBe(false);
    expect(root.querySelector('#sw-bb-hp-num')?.textContent).toMatch(/\d+ \/ \d+/);
    expect(root.querySelector('#sw-bb-gold-num')?.textContent).toBe(String(w.gold));
    expect(root.querySelector('#sw-bb-active1 .sw-bb-key')?.textContent).toBe('Q');
    expect(root.querySelector('#sw-bb-active2 .sw-bb-key')?.textContent).toBe('E');
  });

  it('stays visible once the Sundering starts a VS run', () => {
    const w = new World(cfg());
    w.phase = 'act2';
    const { root, hud } = mountHud();
    hud.buildTowerBar(w);
    hud.update(w);
    const bar = root.querySelector('#sw-bottombar') as HTMLElement;
    expect(bar.classList.contains('sw-off')).toBe(false);
  });

  it('hides while the pause overlay is showing, matching the character/DPS panel refusal rule', () => {
    const w = new World(cfg());
    const { root, hud } = mountHud();
    hud.buildTowerBar(w);
    hud.setPaused(true, w);
    hud.update(w);
    const bar = root.querySelector('#sw-bottombar') as HTMLElement;
    expect(bar.classList.contains('sw-off')).toBe(true);
  });

  it("sets the sweep element's data-fraction from the sim's cooldown field", () => {
    const w = new World(cfg({ classKey: 'swordsman' }));
    const cls = w.content.classByKey.get('swordsman')!;
    w.warden.active1Cooldown = cls.active1.cooldownSeconds * (1 - w.derived.cdr) * 0.25;
    const { root, hud } = mountHud();
    hud.buildTowerBar(w);
    hud.update(w);
    const sweep = root.querySelector('#sw-bb-a1-sweep') as HTMLElement;
    expect(Number(sweep.dataset.fraction)).toBeCloseTo(0.25, 4);
  });

  it('shows the hovered Active tooltip with the class-specific skill name', () => {
    const w = new World(cfg({ classKey: 'archer' }));
    const { root, hud } = mountHud();
    hud.buildTowerBar(w);
    hud.update(w);
    const tip = root.querySelector('#sw-bb-a1-tip') as HTMLElement;
    const cls = w.content.classByKey.get('archer')!;
    expect(tip.innerHTML).toContain(cls.active1.name);
  });

  it("Active2's tooltip cooldown reflects the §6.3 Active2-cooldown skill card, not just the general cdr stat", () => {
    // qa-playtester finding (Bug 1): `class-info.ts`'s `liveOverrides` used to
    // apply Active1's plain `1 - cdr` factor to Active2's tooltip too, so the
    // tooltip's own "Cooldown" line disagreed with the sweep next to it (and
    // with the sim's real gate, `active2CdrFactor`) the moment a run had any
    // rank in the card.
    const w = new World(cfg({ classKey: 'swordsman' }));
    const cls = w.content.classByKey.get('swordsman')!;
    w.skillCardRanks['swordsman_active2_cdr'] = 1;
    const { root, hud } = mountHud();
    hud.buildTowerBar(w);
    hud.update(w);
    const tip = root.querySelector('#sw-bb-a2-tip') as HTMLElement;
    const real = cls.active2.cooldownSeconds * active2CdrFactor(w);
    const wrong = cls.active2.cooldownSeconds * (1 - w.derived.cdr);
    expect(real).not.toBe(wrong);
    expect(tip.innerHTML).toContain(fieldValueText('cooldownSeconds', real));
    expect(tip.innerHTML).not.toContain(fieldValueText('cooldownSeconds', wrong));
  });

  it("a multi-charge Active's tooltip recharge time reflects CDR, not the raw /data number", () => {
    // qa-playtester finding (Bug 2): Time Lord's Actives gate their real wait
    // on `rechargeSeconds` (`tickAmmoRecharge`, classes.ts) once a charge is
    // spent, but `liveOverrides` only special-cased `cooldownSeconds` — the
    // tooltip showed the true, CDR-reduced number under "Cooldown" and the
    // raw, unreduced one under "Recharge seconds" for the same real wait.
    const w = new World(cfg({ classKey: 'time_lord' }));
    w.derived.cdr = 0.5;
    const cls = w.content.classByKey.get('time_lord')!;
    const { root, hud } = mountHud();
    hud.buildTowerBar(w);
    hud.update(w);
    const tip = root.querySelector('#sw-bb-a1-tip') as HTMLElement;
    const real = (cls.active1.rechargeSeconds ?? 0) * (1 - w.derived.cdr);
    const raw = cls.active1.rechargeSeconds ?? 0;
    expect(real).not.toBe(raw);
    // The class's other numeric fields (several unrelated "N seconds" DoT
    // durations) can coincidentally share the same bare text as the raw,
    // un-CDR'd recharge value — the field label disambiguates.
    expect(tip.innerHTML).toContain(`Recharge seconds: ${fieldValueText('rechargeSeconds', real)}`);
    expect(tip.innerHTML).not.toContain(`Recharge seconds: ${fieldValueText('rechargeSeconds', raw)}`);
  });
});
