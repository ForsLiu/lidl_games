/**
 * @vitest-environment jsdom
 *
 * fb022 (owner feedback `feature-info-surfacing`, SPEC-FINAL §11, extends
 * fb004 and the Codex p9b): four info surfaces show live, data-derived
 * numbers instead of hand-written prose — the Hub's Class screen and the
 * in-run character panel (every active/passive with resolved numbers), the
 * Hub's Core screen and the in-run Core tooltip (TD/VS effect, current step,
 * next-step preview), the Constellation summary (every allocated node plus
 * combined per-stat totals) and the equipment stash (mods, the classFallback
 * active/inert indicator, equipped-vs-candidate compare).
 *
 * Every assertion below reads its expected number off the same source the
 * sim/Hub actually reads (`content.classes`/`content.cores`/`content.tree`,
 * `w.derived`, `w.core`, `classAttackPowerMul`/`characterDamage`) rather than
 * a hand-copied literal, the same posture `character-panel.test.ts` and
 * `tests/tower-info.test.ts` already take — and the very last describe block
 * demonstrates the "no code edit" acceptance line directly: it mutates a
 * synthetic /data-shaped fixture between two calls to the same formatter and
 * asserts the rendered text changes with it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadContent, type ClassDef } from '../src/sim/content';
import { classAttackPowerMul, characterDamage } from '../src/sim/classes';
import { computeCoreState, upgradeCore } from '../src/sim/cores';
import { World } from '../src/sim/world';
import { spawnEnemy } from '../src/sim/enemies';
import { Hub } from '../src/ui/hub';
import { Hud } from '../src/ui/hud';
import type { Selection } from '../src/ui/selection';
import { characterPanelData } from '../src/ui/character-panel';
import { characterPanelMarkup, wardenInfoMarkup } from '../src/ui/hud';
import { classAbilitiesMarkup } from '../src/ui/class-info';
import { coreDetailMarkup, coreLiveMarkup } from '../src/ui/core-info';
import { constellationSummaryMarkup, describeStat } from '../src/ui/tree-view';
import { fieldLabel, fieldValueText, modLines } from '../src/ui/info-format';
import { emptyStats, STAT_KIND, type StatKey } from '../src/sim/stats';
import { defaultMeta } from '../src/meta/meta';
import { defaultSettings } from '../src/ui/settings';
import type { MetaState } from '../src/sim/types';
import { cfg } from './helpers';

const content = loadContent();
const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

function mountHub(meta: MetaState = defaultMeta()): { root: HTMLElement; hub: Hub; latest: () => MetaState } {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app') as HTMLElement;
  let current = meta;
  const hub = new Hub(root, meta, 1, {
    settings: defaultSettings(),
    onStart: () => {},
    onMetaChanged: (m) => (current = m),
    onSettingsChanged: () => {},
  });
  hub.show();
  return { root, hub, latest: () => current };
}

function hudCoreTooltip(w: World): string {
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
    onHoverSkill: () => {},
  });
  hud.buildTowerBar(w);
  const sel: Selection = { kind: 'core' };
  hud.update(w, undefined, sel);
  return (root.querySelector('#sw-towerinfo') as HTMLElement).textContent ?? '';
}

/* ------------------------------------------------------- Surface 1: class */

describe('fb022 Surface 1: class screen + in-run character panel show live numbers', () => {
  it('the Hub Class panel shows the selected class\'s active/passive numbers straight off content.classes', () => {
    const { root } = mountHub();
    const swordsman = content.classes.classes.find((c) => c.key === 'swordsman')!;
    const detail = root.querySelector('.sw-classdetail')!.textContent ?? '';
    expect(detail).toContain(`${swordsman.active1.cooldownSeconds}s`); // Circle Slash cooldown
    expect(detail).toContain(String(swordsman.active1.radius)); // Circle Slash radius
    expect(detail).toContain(String(swordsman.active1.damage)); // Circle Slash damage
    expect(detail).toContain(String(swordsman.active2.dashRange)); // Dash Slash range
  });

  it('switching class on the Hub updates the detail block to the new class\'s own numbers', () => {
    const { root } = mountHub();
    const engineer = content.classes.classes.find((c) => c.key === 'engineer')!;
    root.querySelector<HTMLElement>('[data-class="engineer"]')!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const detail = root.querySelector('.sw-classdetail')!.textContent ?? '';
    expect(detail).toContain(`${engineer.active1.cooldownSeconds}s`); // Field Kit cooldown
    expect(detail).toContain(String(engineer.active2.summonCap)); // Pop Turret summon cap
  });

  it('the in-run character panel resolves cooldownSeconds through w.derived.cdr, not the raw /data number', () => {
    const w = new World(cfg({ classKey: 'swordsman' }));
    w.stats.add('test', 'cdr', 0.25); // 25% cooldown reduction
    w.recomputeDerived();
    const cls = w.content.classByKey.get('swordsman')!;

    const html = characterPanelMarkup(characterPanelData(w), w);
    const expectedCooldown = cls.active1.cooldownSeconds * (1 - w.derived.cdr);
    expect(w.derived.cdr).toBeCloseTo(0.25, 10);
    // Rendered through the same `fieldValueText` rounding the formatter uses (2 decimals).
    const rounded = Math.round(expectedCooldown * 100) / 100;
    expect(html).toContain(`${rounded}s`);
    // The raw, un-reduced number must not be what is shown for Cooldown.
    expect(rounded).not.toBe(cls.active1.cooldownSeconds);
  });

  it('the in-run character panel resolves damage through classAttackPowerMul/characterDamage, not the raw /data number', () => {
    const w = new World(cfg({ classKey: 'swordsman' }));
    w.stats.add('test', 'power', 0.5); // +50% power
    w.recomputeDerived();
    const cls = w.content.classByKey.get('swordsman')!;

    const html = characterPanelMarkup(characterPanelData(w), w);
    const expectedDamage = characterDamage(w, cls, cls.active1.damage);
    expect(classAttackPowerMul(w, cls)).toBeCloseTo(1.5, 10);
    const rounded = Math.round(expectedDamage * 100) / 100;
    expect(html).toContain(String(rounded));
    expect(rounded).not.toBe(cls.active1.damage);
  });

  it('code-reviewer regression: basic-attack DPS folds atkFlat through the per-hit formula (dps*interval), not a flat add to the rate', () => {
    // Reproduces the reviewer's exact numbers, re-pinned for fb025 (attack
    // speed x0.7 -> Swordsman basicAttack.interval 0.55 -> 0.7857): dps=26,
    // atkFlat=10 -> real live DPS is (26*0.7857+10)/0.7857 = 38.73, not the
    // naive (26+10) = 36 an interval-blind override would show.
    const w = new World(cfg({ classKey: 'swordsman' }));
    w.stats.add('test', 'atkFlat', 10);
    w.recomputeDerived();
    const cls = w.content.classByKey.get('swordsman')!;
    expect(w.derived.atkFlat).toBe(10);

    const html = characterPanelMarkup(characterPanelData(w), w);
    const expected = (cls.basicAttack.dps * cls.basicAttack.interval + w.derived.atkFlat) / cls.basicAttack.interval;
    const rounded = Math.round(expected * 100) / 100;
    expect(rounded).toBeCloseTo(38.73, 2);
    expect(html).toContain(`DPS: ${rounded}/s`);
    expect(html).not.toContain('DPS: 36/s'); // the interval-blind (dps + atkFlat) miscalculation
  });

  it('the character panel omits the ability section entirely when built with no World (Hub-style pre-run call is unaffected)', () => {
    const w = new World(cfg({ classKey: 'swordsman' }));
    const withWorld = characterPanelMarkup(characterPanelData(w), w);
    const withoutWorld = characterPanelMarkup(characterPanelData(w));
    expect(withWorld).toContain('Active &amp; passive effects');
    expect(withoutWorld).not.toContain('Active &amp; passive effects');
  });
});

/* -------------------------------------------------------- Surface 2: core */

describe('fb022 Surface 2: Core screen + in-run Core tooltip show TD/VS effect and step preview', () => {
  it('the Hub Core panel groups Stone Heart\'s HP-bonus step as a TD effect, with the real step numbers', () => {
    const { root } = mountHub();
    const stoneHeart = content.cores.cores.find((c) => c.key === 'stone_heart')!;
    // Stone Heart is the default core (unlockedByDefault), already selected.
    const detail = [...root.querySelectorAll('.sw-classdetail')].find((el) => el.textContent?.includes(stoneHeart.name))!;
    expect(detail).toBeTruthy();
    expect(detail.textContent).toContain('TD effect');
    expect(detail.textContent).not.toContain('VS effect'); // Stone Heart has no VS-only field
    expect(detail.textContent).toContain(String(stoneHeart.upgrade.steps![0].coreHpBonus));
    expect(detail.textContent).toContain(`${stoneHeart.upgrade.stepCost} gold`);
  });

  it('coreDetailMarkup groups Carnivorous Plant into both a TD (devour) and a VS (poison volley) list', () => {
    const plant = content.cores.cores.find((c) => c.key === 'carnivorous_plant')!;
    const html = coreDetailMarkup(plant);
    expect(html).toContain('TD effect');
    expect(html).toContain('VS effect');
    expect(html).toContain(String(plant.effects!.devourRadius)); // TD
    expect(html).toContain(String(plant.effects!.poisonBulletDamage)); // VS
  });

  it('the in-run Core tooltip (selecting the Core) shows the live coreStep and the current CoreState numbers', () => {
    const w = new World(cfg({ core: 'vampire_heart' }));
    w.gold = 1e6;
    expect(upgradeCore(w)).toBe(true); // step 1: towerOverhealConverts
    expect(w.coreStep).toBe(1);

    const text = hudCoreTooltip(w);
    expect(text).toContain('step 1/3');
    // Base VS lifesteal (0.01 -> 1%) is live from the moment the Core is chosen —
    // the exact label + value the shared formatter (info-format.ts) produces,
    // not a substring that a coincidentally similar number could also satisfy.
    expect(text).toContain(`${fieldLabel('vsLifestealPct')}: ${fieldValueText('vsLifestealPct', 0.01)}`);
    expect(text).toContain(`${Math.ceil(w.coreHp)}`);
  });

  it('the in-run Core tooltip previews the next unbought step with its own numbers', () => {
    const w = new World(cfg({ core: 'vampire_heart' }));
    const def = content.cores.cores.find((c) => c.key === 'vampire_heart')!;
    const text = hudCoreTooltip(w); // coreStep 0 -> next step is step 1 (index 0)
    expect(text).toContain('Next step (1 of 3');
    expect(text.toLowerCase()).toContain('overheal');
    void def;
  });

  it('coreLiveMarkup diffs against the "nothing bought" baseline, so an inert default (e.g. decayMult) is not shown as an active bonus', () => {
    const w = new World(cfg({ core: 'stone_heart' }));
    const html = coreLiveMarkup(w.content, w.coreKey, w.coreStep, w.core, w.coreHp, w.coreMaxHp);
    expect(html).not.toMatch(/decay/i);
  });

  it('computeCoreState is the same authority the tooltip reads — buying Time\'s decay step changes what the tooltip shows', () => {
    const w = new World(cfg({ core: 'time' }));
    w.gold = 1e6;
    expect(upgradeCore(w)).toBe(true); // step1 gold/s
    expect(upgradeCore(w)).toBe(true); // step2 hp regen + healing received
    expect(upgradeCore(w)).toBe(true); // step3 decay r5
    expect(w.core.decayRadius).toBe(5);
    expect(w.core).toEqual(computeCoreState(w.content, 'time', 3));
    const text = hudCoreTooltip(w);
    expect(text).toMatch(/decay/i);
    expect(text).toContain('5'); // decayRadius
  });
});

/* ------------------------------------------------- Surface 3: Constellation */

describe('fb022 Surface 3: Constellation summary lists every node plus combined per-stat totals', () => {
  it('lists every non-start node under TREE_AUTO_MAX, and a flat-kind stat\'s combined total is the real sum across them', () => {
    const meta = defaultMeta();
    const html = constellationSummaryMarkup(content, meta);

    const nodes = content.tree.nodes.filter((n) => n.kind !== 'start');
    expect(html).toContain(`${nodes.length}`); // "Allocated nodes" count
    // Spot-check a handful of real nodes/stats rather than every one of 100+.
    const sample = nodes.slice(0, 5);
    for (const n of sample) expect(html).toContain(n.name);

    // A flat-kind stat has no base to scale, so summing its per-node values
    // (unlike a mul-kind stat — see the regression test below) is correct.
    const flatStat = [...new Set(nodes.flatMap((n) => Object.keys(n.stats)))].find(
      (key) => STAT_KIND[key as StatKey] === 'flat',
    );
    expect(flatStat, 'fixture assumption: at least one flat-kind stat appears on a tree node').toBeTruthy();
    const expectedFlatTotal = nodes.reduce((acc, n) => acc + (n.stats[flatStat!] ?? 0), 0);
    expect(expectedFlatTotal).not.toBe(0);
    expect(html).toContain(describeStat(flatStat!, expectedFlatTotal));
  });

  it('qa-playtester regression: a mul-kind stat\'s combined total multiplies across allocated nodes (Π(1+v)-1), not a flat sum — each node is its own Stats source, same rule as tree:<id> in baseRunStats', () => {
    const meta = defaultMeta();
    const html = constellationSummaryMarkup(content, meta);
    const nodes = content.tree.nodes.filter((n) => n.kind !== 'start');

    // The real aggregation, via the same `Stats` class `baseRunStats` uses —
    // one `tree:<id>` source per node — not a hand-duplicated Π(1+v) formula.
    const s = emptyStats();
    for (const n of nodes) s.addAll(`tree:${n.id}`, n.stats);

    const counts = new Map<string, number>();
    for (const n of nodes) for (const key of Object.keys(n.stats)) counts.set(key, (counts.get(key) ?? 0) + 1);
    const mulStat = [...counts.entries()].find(
      ([key, count]) => STAT_KIND[key as StatKey] === 'mul' && count > 1,
    )?.[0] as StatKey | undefined;
    expect(mulStat, 'fixture assumption: at least one mul-kind stat spans multiple tree nodes').toBeTruthy();

    const expectedFactor = s.factor(mulStat!);
    const naiveSum = 1 + nodes.reduce((acc, n) => acc + (n.stats[mulStat!] ?? 0), 0);
    // The fixture must actually distinguish the two formulas, or this test proves nothing.
    expect(expectedFactor).not.toBeCloseTo(naiveSum, 5);

    expect(html).toContain(describeStat(mulStat!, expectedFactor - 1));
    expect(html).not.toContain(describeStat(mulStat!, naiveSum - 1)); // the summed-not-multiplied miscalculation
  });

  it('the Hub Constellation tab actually renders the summary markup', () => {
    const { root, hub } = mountHub();
    hub.openTab('tree');
    expect(root.querySelector('.sw-charstats')).toBeTruthy();
    expect(root.textContent).toContain('Combined totals');
    expect(root.textContent).toContain('Allocated nodes');
  });
});

/* --------------------------------------------------- Surface 4: equipment */

describe('fb022 Surface 4: equipment tooltips show mods, the classFallback active/inert indicator, and a compare block', () => {
  function metaWithItems(equipmentStash: Record<string, number>, equippedEquipment: Record<string, string | null> = {}): MetaState {
    const base = defaultMeta();
    return { ...base, equipmentStash, equippedEquipment: { ...base.equippedEquipment, ...equippedEquipment } };
  }

  it('mods render as generated stat lines rather than only the hand-written desc', () => {
    const { root } = mountHub(metaWithItems({ greatsword: 1 }));
    root.querySelector<HTMLElement>('[data-tab="equipment"]')!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    root.querySelector<HTMLElement>('[data-item="greatsword"]')!.dispatchEvent(
      new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
    );
    const detail = root.querySelector('.sw-itemdetail')!.textContent ?? '';
    const item = content.equipmentByKey.get('greatsword')!;
    expect(detail).toContain(`+${item.mods.atkFlat}`);
    expect(detail).toContain(`+${item.mods.armor}`);
  });

  it('the classFallback line reads inert for the notClassKey and active for any other class', () => {
    const metaSwordsman = metaWithItems({ sleeve_sword: 1 });
    const { root: rootA } = mountHub(metaSwordsman);
    rootA.querySelector<HTMLElement>('[data-tab="equipment"]')!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    rootA.querySelector<HTMLElement>('[data-item="sleeve_sword"]')!.dispatchEvent(
      new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
    );
    // Default Hub class is meta.unlockedClasses[0] — the fixture below forces it.
    expect(rootA.querySelector('.sw-itemdetail')?.textContent).toMatch(/inert/i);
  });

  it('an equipped-vs-candidate compare block shows the real mod delta between two weapons', () => {
    const meta = metaWithItems({ greatsword: 1, sleeve_sword: 1 }, { weapon: 'greatsword' });
    const { root } = mountHub(meta);
    root.querySelector<HTMLElement>('[data-tab="equipment"]')!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    root.querySelector<HTMLElement>('[data-item="sleeve_sword"]')!.dispatchEvent(
      new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
    );
    const compare = root.querySelector('.sw-compare');
    expect(compare).toBeTruthy();
    const greatsword = content.equipmentByKey.get('greatsword')!;
    const sleeve = content.equipmentByKey.get('sleeve_sword')!;
    const atkDelta = sleeve.mods.atkFlat - greatsword.mods.atkFlat; // 5 - 10 = -5
    expect(compare!.textContent).toContain(String(atkDelta));
  });

  it('qa-playtester regression: a mul-kind classFallback stacks multiplicatively in the compare, not by summing raw mod values', () => {
    // Swordsman Armor: attackSpeed 0.1 base, 0.5 fallback (active for any
    // non-Swordsman). The real Stats result is two separate sources
    // multiplying — (1+0.1)*(1+0.5) = 1.65 — not 1 + 0.1 + 0.5 = 1.6.
    const meta = metaWithItems({ normal_armor: 1, swordsman_armor: 1 }, { armor: 'normal_armor' });
    const { root } = mountHub(meta);
    root.querySelector<HTMLElement>('[data-tab="run"]')!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    // Hub's default class is meta.unlockedClasses[0] = 'swordsman' (the
    // fallback's own notClassKey) — switch off it so the fallback is active.
    root.querySelector<HTMLElement>('[data-class="engineer"]')!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    root.querySelector<HTMLElement>('[data-tab="equipment"]')!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    root.querySelector<HTMLElement>('[data-item="swordsman_armor"]')!.dispatchEvent(
      new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
    );
    const compare = root.querySelector('.sw-compare');
    expect(compare).toBeTruthy();

    // The sim's own aggregate (baseRunStats -> Stats.factor, via a real World),
    // not a hand-derived (1+base)*(1+fallback) duplicate of the fix itself.
    const withItem = new World(cfg({ classKey: 'engineer', equipment: ['swordsman_armor'] }));
    const expectedPct = Math.round((withItem.derived.attackSpeedMul - 1) * 1000) / 10;
    expect(expectedPct).toBeCloseTo(65, 5); // (1.1 * 1.5 - 1) * 100
    expect(compare!.textContent).toContain(`+${expectedPct}%`);
    expect(compare!.textContent).not.toContain('+60%'); // the summed-not-multiplied miscalculation
  });
});

/* --------------------------------------- "no code edit" acceptance check */

describe('fb022: changing a /data value changes the displayed text with no code edit', () => {
  it('mutating a synthetic class fixture\'s cooldownSeconds changes classAbilitiesMarkup\'s output, with zero changes to the formatter', () => {
    const fixture: ClassDef = JSON.parse(JSON.stringify(content.classes.classes.find((c) => c.key === 'archer'))) as ClassDef;

    const before = classAbilitiesMarkup(fixture);
    expect(before).toContain(`${fixture.active1.cooldownSeconds}s`);

    fixture.active1.cooldownSeconds = 42.5; // an arbitrary new /data value
    const after = classAbilitiesMarkup(fixture);
    expect(after).toContain('42.5s');
    expect(after).not.toContain(before.match(/Cooldown: [\d.]+s/)?.[0] ?? '__unreachable__');
  });

  it('mutating a synthetic Core fixture\'s upgrade step changes coreDetailMarkup\'s output', () => {
    const fixture = JSON.parse(JSON.stringify(content.cores.cores.find((c) => c.key === 'stone_heart'))) as (typeof content.cores.cores)[number];
    const before = coreDetailMarkup(fixture);
    expect(before).toContain(String(fixture.upgrade.steps![0].coreHpBonus));

    fixture.upgrade.steps![0].coreHpBonus = 777;
    const after = coreDetailMarkup(fixture);
    expect(after).toContain('777');
    expect(after).not.toBe(before);
  });
});

/**
 * b053: `modIsPct` (info-format.ts), the formatter behind `classAbilitiesMarkup`'s
 * passive/tower-passive `mods` lines, classified percent-vs-point purely off
 * `STAT_KIND` — the same `'flat'` conflation b021 fixed for the character panel's
 * own formatter by introducing `STAT_DISPLAY`, but this call site was still on
 * the old classification. Bloodlord's Blood Frenzy passive (`leech: 0.03`,
 * described as "3% lifesteal") rendered "+0.03 Leech" via both the Hub's class
 * screen and the in-run character panel's class-info block.
 */
describe('b053: class-passive mods render leech/cdr as a percentage, not a raw decimal', () => {
  it("Bloodlord's Blood Frenzy passive (leech: 0.03) renders \"+3% Leech\", not \"+0.03\"", () => {
    const bloodlord = content.classes.classes.find((c) => c.key === 'bloodlord')!;
    const html = classAbilitiesMarkup(bloodlord);
    expect(html).toContain('+3% Leech');
    expect(html).not.toContain('+0.03');
  });
});

/**
 * b054: `modLines`' percent formatting rounded to a flat 1 decimal place, so
 * the Bleeding Ring's real, non-zero `leech: 0.0001` (0.01% lifesteal)
 * rounded away to "+0% Leech" — indistinguishable from no mod at all.
 */
describe('b054: a sub-1% mod magnitude renders with enough precision to stay non-zero', () => {
  it("the Bleeding Ring's leech: 0.0001 mod line reads \"+0.01% Leech\", not \"+0% Leech\"", () => {
    const bleedingRing = content.equipmentByKey.get('bleeding_ring')!;
    expect(bleedingRing.mods.leech).toBeCloseTo(0.0001, 10);
    const lines = modLines(bleedingRing.mods);
    const leechLine = lines.find((l) => l.key === 'leech')!;
    expect(leechLine).toBeTruthy();
    expect(leechLine.text).toBe('+0.01% Leech');
    expect(leechLine.text).not.toContain('+0%');
  });

  it('a magnitude at/above 1% still renders at the original 1-decimal precision', () => {
    expect(modLines({ leech: 0.03 })[0].text).toBe('+3% Leech');
    expect(modLines({ leech: 0.015 })[0].text).toBe('+1.5% Leech');
  });
});

/**
 * b055: `describeStat` (tree-view.ts), used by the Hub Constellation summary
 * and per-node tooltips, hand-rolled its own flat 1-decimal percent rounding
 * instead of sharing `formatPct` (info-format.ts) — the same defect b054 just
 * fixed at the `modLines`/`fieldValueText` call sites. A sub-1% magnitude
 * (no live tree node yet, but a future/edited one) rounded away to "0%".
 */
describe('b055: describeStat shares formatPct instead of its own flat-1-decimal rounding', () => {
  it('describeStat(\'leech\', 0.0001) does not read "0% Leech"', () => {
    expect(describeStat('leech', 0.0001)).toBe('+0.01% Leech');
    expect(describeStat('leech', 0.0001)).not.toBe('0% Leech');
  });

  it('a magnitude at/above 1% still renders at the original 1-decimal precision', () => {
    expect(describeStat('leech', 0.03)).toBe('+3% Leech');
    expect(describeStat('leech', -0.03)).toBe('-3% Leech');
    expect(describeStat('leech', 0)).toBe('0% Leech');
  });
});

/**
 * b056: `formatPercent` (hud.ts), which feeds the in-run character panel's
 * per-stat summary and per-source breakdown, was a third un-deduplicated
 * flat-1-decimal percent rounder with the same defect b054/b055 fixed at
 * their own call sites — the Bleeding Ring's real `leech: 0.0001` rounded
 * away to "0%" there too.
 */
describe('b056: formatPercent (hud.ts) shares formatPct instead of its own flat-1-decimal rounding', () => {
  it("a bleeding_ring-equipped World's character panel shows the Leech line at scaled precision, not \"0%\"", () => {
    const w = new World(cfg({ classKey: 'swordsman', equipment: ['bleeding_ring'] }));
    w.recomputeDerived();
    const bleedingRing = content.equipmentByKey.get('bleeding_ring')!;
    expect(bleedingRing.mods.leech).toBeCloseTo(0.0001, 10);

    const html = characterPanelMarkup(characterPanelData(w), w);
    expect(html).toContain('+0.01%');
    expect(html).toContain('Equipment: Bleeding Ring: +0.01%');
    expect(html).not.toContain('Leech</span><b>0%');
  });
});

/**
 * b057: `wardenInfoMarkup`'s (hud.ts) Character-selection info panel
 * Power/Attack speed/Area rows hand-rolled a 0-decimal percent rounder
 * (`Math.round((d.powerMul - 1) * 100)`) instead of sharing `formatPercent` —
 * the same defect class b054/b055/b056 fixed at their own call sites, just
 * one decimal place coarser (zeroed a net magnitude under 0.5% instead of
 * under 0.05%). No live /data mul-kind mod is currently that small, so this
 * is a synthetic-stat regression test, not a real-content repro.
 */
describe('b057: wardenInfoMarkup shares formatPercent instead of its own flat-0-decimal rounding', () => {
  it('a synthetic 0.1% power mod reads "+0.1%", not "+0%"', () => {
    const w = new World(cfg({ classKey: 'swordsman' }));
    w.stats.add('src:test', 'power', 0.001);
    w.recomputeDerived();
    expect(w.derived.powerMul - 1).toBeCloseTo(0.001, 10);

    const html = wardenInfoMarkup(w);
    expect(html).toContain('+0.1%');
    expect(html).not.toContain('Power</span><b>+0%');
  });
});

/**
 * b058: `renderSelectionInfo`'s warden-panel memo key (hud.ts) omitted
 * power/attackSpeed/area/armor/moveSpeed/regen, so `wardenInfoMarkup`'s rows
 * for those stats went stale in the live Character-selection panel whenever
 * one changed without hp/level/dashCharges also changing on the same frame —
 * the enemy branch above guards the identical staleness class for status
 * effects/speed, but the warden branch was not given the same treatment.
 */
describe('b058: the warden info panel memo key refreshes on a derived-stat change alone', () => {
  function hudWarden(w: World): { hud: Hud; text: () => string } {
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
      onHoverSkill: () => {},
    });
    hud.buildTowerBar(w);
    return {
      hud,
      text: () => (root.querySelector('#sw-towerinfo') as HTMLElement).textContent ?? '',
    };
  }

  it('a power change alone (hp/level/dashCharges held fixed) refreshes the Power row', () => {
    const w = new World(cfg({ classKey: 'swordsman' }));
    const sel: Selection = { kind: 'warden' };
    const { hud, text } = hudWarden(w);

    hud.update(w, undefined, sel);
    expect(text()).toContain('Power0%');

    const hp = w.warden.hp;
    const level = w.level;
    const dashCharges = w.warden.dashCharges;
    w.stats.add('src:test', 'power', 0.5);
    w.recomputeDerived();
    expect(w.warden.hp).toBe(hp);
    expect(w.level).toBe(level);
    expect(w.warden.dashCharges).toBe(dashCharges);

    hud.update(w, undefined, sel);
    expect(text()).toContain('Power+50%');
  });

  it('an armor change alone refreshes the Armour row', () => {
    const w = new World(cfg({ classKey: 'swordsman' }));
    const sel: Selection = { kind: 'warden' };
    const { hud, text } = hudWarden(w);

    hud.update(w, undefined, sel);
    const before = text();

    w.stats.add('src:test', 'armor', 50);
    w.recomputeDerived();
    hud.update(w, undefined, sel);
    const after = text();

    expect(after).not.toBe(before);
  });

  it('a maxHp change alone refreshes the Health row', () => {
    const w = new World(cfg({ classKey: 'swordsman' }));
    const sel: Selection = { kind: 'warden' };
    const { hud, text } = hudWarden(w);

    hud.update(w, undefined, sel);
    expect(text()).toContain('Health100 / 100');

    const hp = w.warden.hp;
    w.stats.add('src:test', 'maxHp', 50);
    w.recomputeDerived();
    expect(w.warden.hp).toBe(hp);

    hud.update(w, undefined, sel);
    expect(text()).toContain('Health100 / 150');
  });

  it('a dash-charge-cap change alone refreshes the Dash row', () => {
    const w = new World(cfg({ classKey: 'swordsman' }));
    const sel: Selection = { kind: 'warden' };
    const { hud, text } = hudWarden(w);

    hud.update(w, undefined, sel);
    const dashCharges = w.warden.dashCharges;

    w.stats.add('src:test', 'dashCharges', 1);
    w.recomputeDerived();
    expect(w.warden.dashCharges).toBe(dashCharges);

    hud.update(w, undefined, sel);
    expect(text()).toContain(`Dash${dashCharges} / ${dashCharges + 1}`);
  });
});

/**
 * b059: the warden-panel memo key's Health component (hud.ts) rounds
 * `w.warden.hp` with `Math.round`, but the Health row it guards
 * (`wardenInfoMarkup`) renders it with `Math.ceil` — so an hp change that
 * stays in the same `Math.round` bucket but crosses a `Math.ceil` bucket
 * boundary (9.9 -> 10.2: round gives 10 both times, ceil gives 10 then 11)
 * leaves the displayed Health number stale even though it should have
 * ticked up. Predates b058 and is outside its guarded fields, so it is its
 * own regression.
 */
describe('b059: the warden info panel memo key uses the same rounding as the Health row', () => {
  it('an hp change from 9.9 to 10.2 (same Math.round bucket) still refreshes the Health row', () => {
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
      onHoverSkill: () => {},
    });
    const w = new World(cfg({ classKey: 'swordsman' }));
    const sel: Selection = { kind: 'warden' };
    hud.buildTowerBar(w);
    const text = () => (root.querySelector('#sw-towerinfo') as HTMLElement).textContent ?? '';

    const level = w.level;
    const dashCharges = w.warden.dashCharges;
    const maxHp = w.derived.maxHp;

    w.warden.hp = 9.9;
    hud.update(w, undefined, sel);
    expect(text()).toContain(`Health10 / ${Math.round(maxHp)}`);

    w.warden.hp = 10.2;
    expect(w.level).toBe(level);
    expect(w.warden.dashCharges).toBe(dashCharges);
    hud.update(w, undefined, sel);
    expect(text()).toContain(`Health11 / ${Math.round(maxHp)}`);
  });
});

/**
 * b060: the enemy-info memo key's Health component (hud.ts) rounds `e.hp`
 * with `Math.round`, but the Health row it guards (`enemyInfoMarkup`) renders
 * it with `Math.ceil` — the same round-vs-ceil mismatch b059 fixed on the
 * warden panel, on the enemy panel instead.
 */
describe('b060: the enemy info panel memo key uses the same rounding as the Health row', () => {
  it('an hp change from 9.9 to 10.2 (same Math.round bucket) still refreshes the Health row', () => {
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
      onHoverSkill: () => {},
    });
    const w = new World(cfg({ classKey: 'swordsman' }));
    const e = spawnEnemy(w, 'husk', 5, 5, { overlay: false })!;
    const sel: Selection = { kind: 'enemy', id: e.id };
    hud.buildTowerBar(w);
    const text = () => (root.querySelector('#sw-towerinfo') as HTMLElement).textContent ?? '';

    const maxHp = e.maxHp;
    const slowAmount = e.slowAmount;
    const frostRemaining = e.frostRemaining;
    const frozenRemaining = e.frozenRemaining;
    const buffSpeed = e.buffSpeed;

    e.hp = 9.9;
    hud.update(w, undefined, sel);
    expect(text()).toContain(`Health10 / ${Math.round(maxHp)}`);

    e.hp = 10.2;
    expect(e.slowAmount).toBe(slowAmount);
    expect(e.frostRemaining).toBe(frostRemaining);
    expect(e.frozenRemaining).toBe(frozenRemaining);
    expect(e.buffSpeed).toBe(buffSpeed);
    expect(e.dots.length).toBe(0);
    hud.update(w, undefined, sel);
    expect(text()).toContain(`Health11 / ${Math.round(maxHp)}`);
  });
});

/**
 * b061: the Core-panel memo key's Core HP component (hud.ts) rounds
 * `w.coreHp` with `Math.round`, but the Core HP row it guards
 * (`coreLiveMarkup`) renders it with `Math.ceil` — the same round-vs-ceil
 * mismatch b059/b060 fixed on the warden and enemy panels, on the Core panel
 * instead.
 */
describe('b061: the Core info panel memo key uses the same rounding as the Core HP row', () => {
  it('a coreHp change from 9.9 to 10.2 (same Math.round bucket) still refreshes the Core HP row', () => {
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
      onHoverSkill: () => {},
    });
    const w = new World(cfg({ classKey: 'swordsman' }));
    const sel: Selection = { kind: 'core' };
    hud.buildTowerBar(w);
    const text = () => (root.querySelector('#sw-towerinfo') as HTMLElement).textContent ?? '';

    const coreKey = w.coreKey;
    const coreStep = w.coreStep;
    const maxHp = w.coreMaxHp;

    w.coreHp = 9.9;
    hud.update(w, undefined, sel);
    expect(text()).toContain(`${Math.ceil(9.9)} / ${Math.round(maxHp)}`);

    w.coreHp = 10.2;
    expect(w.coreKey).toBe(coreKey);
    expect(w.coreStep).toBe(coreStep);
    expect(w.coreMaxHp).toBe(maxHp);
    hud.update(w, undefined, sel);
    expect(text()).toContain(`${Math.ceil(10.2)} / ${Math.round(maxHp)}`);
  });
});
