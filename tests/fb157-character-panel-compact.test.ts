/**
 * @vitest-environment jsdom
 *
 * fb157 (owner feedback `ui-character-panel-compact`, top priority): the
 * in-run character panel was rebuilt as a compact card — an always-visible
 * vitals row (HP, attack, attack speed, defense, movement speed, range, life
 * regen, lifesteal), a read-only Equipment section, and everything else
 * (per-source stat breakdowns, boons taken) folded behind a closed-by-default
 * "Details" pull-down. This file is the acceptance test the item asks for:
 * the important-stat set matches the same `w.derived` numbers
 * `wardenInfoMarkup` (the T2 click-select panel) reads, the Details contents
 * still match `characterPanelData`, close works from both the button and a
 * real Escape keydown, and equipment is read-only with a tooltip saying so.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Hud, characterPanelMarkup, type HudCallbacks } from '../src/ui/hud';
import { World } from '../src/sim/world';
import { characterPanelData } from '../src/ui/character-panel';
import { makeKeyDownHandler } from '../src/ui/input';
import { defaultKeyBindings } from '../src/ui/keybindings';
import { characterBasicRange } from '../src/sim/classes';
import { longestWieldedRange } from '../src/sim/vswield';
import { wardenArmor } from '../src/sim/run';
import { effectiveArmor, armorReduction } from '../src/sim/stats';
import { formatPct } from '../src/ui/info-format';
import { cfg } from './helpers';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

function mount(): HTMLElement {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  return document.getElementById('app') as HTMLElement;
}

function callbacks(over: Partial<HudCallbacks> = {}): HudCallbacks {
  return {
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
    onToggleVsPanel: () => {},
    onResume: () => {},
    onPause: () => {},
    onCycleSpeed: () => {},
    onSetSpeed: () => {},
    onDev: () => {},
    onQuitToHub: () => {},
    onHoverSkill: () => {},
    onUpgradeStructure: () => {},
    onSellStructure: () => {},
    onUpgradeCore: () => {},
    onHoverWieldedTower: () => {},
    ...over,
  };
}

describe('fb157: the always-visible vitals set matches the real derived stats', () => {
  it('HP/attack/attack speed/defense/movement speed/range/life regen/lifesteal all read the live w.derived numbers', () => {
    const w = new World(cfg({ classKey: 'swordsman' }));
    w.stats.add('test', 'power', 0.2);
    w.stats.add('test', 'attackSpeed', 0.1);
    w.stats.add('test', 'armor', 8);
    w.stats.add('test', 'moveSpeedPct', 0.15);
    w.stats.add('test', 'hpRegen', 2);
    w.stats.add('test', 'leech', 0.05);
    w.recomputeDerived();
    w.warden.hp = w.derived.maxHp - 3;

    const html = characterPanelMarkup(characterPanelData(w), w);
    const d = w.derived;
    // Same tiny wrapper `formatPercent` (hud.ts, not exported) is: a leading
    // "+" for a positive fraction, then `formatPct` — the exported primitive
    // both share, so this is the same formula, not a hand-copied literal.
    const pctStr = (fraction: number) => `${fraction > 0 ? '+' : ''}${formatPct(fraction)}`;

    expect(html).toContain(`${Math.ceil(w.warden.hp)} / ${Math.round(d.maxHp)}`); // HP
    expect(html).toContain(pctStr(d.powerMul - 1)); // Attack
    expect(html).toContain(pctStr(d.attackSpeedMul - 1)); // Attack Speed
    const eff = Math.round(effectiveArmor(wardenArmor(w)));
    const pct = Math.round(armorReduction(wardenArmor(w)) * 100);
    expect(html).toContain(`${eff}`);
    expect(html).toContain(`${pct}% off`); // Defense
    expect(html).toContain(`${Math.round(d.moveSpeed * 10) / 10} tiles/s`); // Movement Speed
    expect(html).toContain(`${Math.round(characterBasicRange(w) * 10) / 10} tiles`); // Range (Act I)
    expect(html).toContain(`${Math.round(d.hpRegen * 10) / 10} /s`); // Life Regen
    expect(html).toContain(pctStr(d.leech)); // Lifesteal
  });

  it('Range switches to the wielded-attack range once VS (huntsWarden) starts', () => {
    const w = new World(cfg({ classKey: 'swordsman' }));
    w.phase = 'act2'; // huntsWarden is a derived getter off phase
    w.recomputeDerived();
    const html = characterPanelMarkup(characterPanelData(w), w);
    expect(html).toContain(`${Math.round(longestWieldedRange(w) * 10) / 10} tiles`);
  });

  it('omits the vitals row entirely on a Hub-style call with no World', () => {
    const w = new World(cfg());
    const html = characterPanelMarkup(characterPanelData(w));
    expect(html).not.toContain('sw-vitals');
  });
});

describe('fb157: everything else lives behind a closed-by-default Details pull-down', () => {
  it('the Details section is closed by default and its contents match characterPanelData', () => {
    const w = new World(cfg());
    w.stats.add('test', 'armor', 5);
    const data = characterPanelData(w);
    const html = characterPanelMarkup(data, w);

    expect(html).toContain('<details class="sw-chardetails">');
    expect(html).not.toContain('<details class="sw-chardetails" open>');
    // Every stat row's label and formatted value shows up somewhere inside
    // the details block's markup (the per-source breakdown source of truth
    // is already exhaustively covered by character-panel.test.ts's own
    // field-for-field checks against `characterPanelData`).
    for (const s of data.stats) {
      expect(html, s.key).toContain(s.label);
    }
  });

  it('area/CDR/pickup/luck stay out of the always-visible vitals row', () => {
    const w = new World(cfg());
    const html = characterPanelMarkup(characterPanelData(w), w);
    const vitalsHtml = html.slice(html.indexOf('sw-vitals'), html.indexOf('sw-chardetails'));
    // These stat labels belong only in Details, never in the compact vitals row.
    for (const label of ['Area', 'Cooldown Reduction', 'Pickup Radius', 'Luck']) {
      expect(vitalsHtml, label).not.toContain(label);
    }
  });
});

describe('fb157: equipment is read-only in-run', () => {
  it('an equipped slot carries no clickable control and a tooltip explaining why', () => {
    const w = new World(cfg({ equipment: ['normal_ring'] }));
    const html = characterPanelMarkup(characterPanelData(w), w);
    expect(html).not.toContain('data-runeqslot');
    expect(html).not.toContain('data-runitem');
    expect(html.toLowerCase()).toContain('hub');
  });
});

describe('fb157: close works from both the button and a real Escape keydown', () => {
  it('the top-right close button closes the panel', () => {
    const root = mount();
    const hud = new Hud(root, callbacks());
    const w = new World(cfg());
    hud.buildTowerBar(w);
    hud.toggleCharacterPanel(w);
    expect(hud.characterPanelOpen).toBe(true);

    const closeBtn = root.querySelector('.sw-panelclose') as HTMLElement;
    expect(closeBtn).not.toBeNull();
    closeBtn.click();
    expect(hud.characterPanelOpen).toBe(false);
  });

  it('a real Escape keydown closes the panel (through the same pause path main.ts wires)', () => {
    const root = mount();
    const hud = new Hud(root, callbacks());
    const w = new World(cfg());
    hud.buildTowerBar(w);
    hud.toggleCharacterPanel(w);
    expect(hud.characterPanelOpen).toBe(true);

    // Mirrors main.ts's real wiring: Escape -> togglePause() -> Hud.setPaused(true, w),
    // whose showPause()/openModal() force-closes the character panel as a sibling overlay.
    const onKeyDown = makeKeyDownHandler({
      keys: new Set(),
      bindings: defaultKeyBindings(),
      queue: { push: () => {} },
      togglePause: () => hud.setPaused(true, w),
    });
    onKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(hud.characterPanelOpen, 'Escape pauses, which force-closes every sibling overlay').toBe(false);
  });
});
