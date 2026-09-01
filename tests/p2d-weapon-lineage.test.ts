/**
 * @vitest-environment jsdom
 *
 * p2d — SPEC-FINAL §6.2's weapon-panel lineage line: "Arrow ×3 (avg 14.2,
 * +30%) — pierce 2". `wieldedLineageText` (`src/ui/tower-info.ts`) is checked
 * against `wieldedAttacks` (`src/sim/vswield.ts`) directly, the same
 * derivation p2a's worked-example test reads its own numbers from, so this
 * panel cannot drift from what `updateWieldedAttacks` (p2b) actually fires.
 * The `Hud`-mounted block below drives the real DOM (the `hud-controls.test.ts`
 * pattern) to cover the cache-key fix a pure `wieldedLineageText` call cannot:
 * code review on this item found the panel had no test proving it refreshes
 * when a tower dies mid-VS-wave rather than serving a stale cached render.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadContent, type TowerDef } from '../src/sim/content';
import { Hud } from '../src/ui/hud';
import { buildTower, upgradeTower } from '../src/sim/towers';
import { World } from '../src/sim/world';
import { wieldedAttacks } from '../src/sim/vswield';
import { wieldedLineageText } from '../src/ui/tower-info';
import { cfg } from './helpers';

const content = loadContent();
const ARROW = content.towerByKey.get('arrow_spire')!;

/** Free, buildable tiles that never collide with each other or the path. */
function tiles(w: World, n: number): { tx: number; ty: number }[] {
  const out: { tx: number; ty: number }[] = [];
  for (let ty = 4; ty < 20 && out.length < n; ty++) {
    for (let tx = 4; tx < 20 && out.length < n; tx++) {
      if (w.grid.buildable(tx, ty) && !w.grid.wouldBlockPath([[tx, ty]])) out.push({ tx, ty });
    }
  }
  if (out.length < n) throw new Error('not enough buildable tiles');
  return out;
}

function build(w: World, def: TowerDef, tx: number, ty: number, steps: number) {
  w.warden.x = tx + 0.5;
  w.warden.y = ty + 0.5;
  w.gold = 1e6;
  expect(buildTower(w, def.id, tx, ty).ok).toBe(true);
  for (let i = 0; i < steps; i++) {
    w.gold = 1e6;
    expect(upgradeTower(w, tx, ty), `${def.key} step ${i + 1}`).toBe(true);
  }
}

const LINE_SHAPE = /^(.+) ×(\d+) \(avg ([\d.]+), \+(\d+)%\) — (.+)$/;

describe('p2d — §6.2 weapon panel lineage', () => {
  it('renders the worked-example shape and re-derives from wieldedAttacks, not a duplicate formula', () => {
    const w = new World(cfg(), content);
    const [a1, a2, a3] = tiles(w, 3);
    build(w, ARROW, a1.tx, a1.ty, 0); // lv1
    build(w, ARROW, a2.tx, a2.ty, 3); // "lv3" milestone tier, +1 pierce
    build(w, ARROW, a3.tx, a3.ty, 3);

    const lines = wieldedLineageText(w);
    expect(lines).toHaveLength(1);
    const m = LINE_SHAPE.exec(lines[0]);
    expect(m, lines[0]).not.toBeNull();
    const [, name, count, avg, bonus, special] = m!;

    const [wielded] = wieldedAttacks(w);
    expect(name).toBe(ARROW.name);
    expect(Number(count)).toBe(wielded.count);
    expect(Number(bonus)).toBe(Math.round(wielded.count * 10));
    // avg is `wielded.perTowerAverage` itself, rounded to the panel's one
    // display decimal (`fmt`'s default), and the printed bonus must
    // round-trip to `wielded.damage` — checked against the sim's own fields,
    // not a second copy of §6.1's bonus fraction.
    expect(Number(avg)).toBeCloseTo(wielded.perTowerAverage, 1);
    expect(Number(bonus)).toBe(Math.round((wielded.damage / wielded.perTowerAverage - 1) * 100));
    expect(special).toBe(`pierce ${wielded.profile.pierce}`);
  });

  it('every attack-bearing tower type produces one well-formed line with a kind-specific special', () => {
    const EXPECTED_SPECIAL: Record<string, RegExp> = {
      arrow_spire: /^(single target|pierce \d+|\d+ shots)$/,
      ballista: /^pierce \d+$/,
      ember_brazier: /^(cone|burn)$/,
      frost_obelisk: /^aura$/,
      tesla_coil: /^chain \d+( \+ arc)?$/,
      mortar: /^splash r[\d.]+$/,
      venom_spore: /^(poison|\d+ spores)$/,
    };
    const attackTowers = content.towers.towers.filter((t) => t.attack);
    // Every kind this test asserts about must actually be present, or the
    // regex table below is silently checking nothing for a missing tower.
    expect(attackTowers.map((t) => t.key).sort()).toEqual(Object.keys(EXPECTED_SPECIAL).sort());

    const w = new World(cfg(), content);
    const spots = tiles(w, attackTowers.length);
    attackTowers.forEach((def, i) => build(w, def, spots[i].tx, spots[i].ty, 0));

    const lines = wieldedLineageText(w);
    expect(lines).toHaveLength(attackTowers.length);
    for (const def of attackTowers) {
      const line = lines.find((l) => l.startsWith(def.name + ' '));
      expect(line, `${def.key} produced no line`).toBeDefined();
      const m = LINE_SHAPE.exec(line!);
      expect(m, line).not.toBeNull();
      expect(m![5], line).toMatch(EXPECTED_SPECIAL[def.key]);
    }
  });

  it('a tower type with no attack (wall) contributes no line', () => {
    const WALL = content.towerByKey.get('palisade')!;
    const w = new World(cfg(), content);
    const [t1] = tiles(w, 1);
    build(w, WALL, t1.tx, t1.ty, 0);
    expect(wieldedLineageText(w)).toEqual([]);
  });
});

describe('p2d — Hud panel reflects the live wielded roster, not a stale cache', () => {
  const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

  function mount(): HTMLElement {
    document.head.innerHTML = `<style>${CSS}</style>`;
    document.body.innerHTML = '<div id="app"></div>';
    return document.getElementById('app') as HTMLElement;
  }

  function makeHud(root: HTMLElement): Hud {
    return new Hud(root, {
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
  }

  it('drops a dead tower from the lineage panel on the very next update, not a stale cached one', () => {
    const root = mount();
    const hud = makeHud(root);
    const w = new World(cfg(), content);
    hud.buildTowerBar(w);

    const [a1] = tiles(w, 1);
    build(w, ARROW, a1.tx, a1.ty, 0);
    const structure = w.structureAt(a1.tx, a1.ty)!;

    // The lineage panel only renders in VS (`renderTowerInfo` routes to
    // `renderWeaponInfo` on `w.huntsWarden`, itself derived from `w.phase`),
    // and only when the player has no soul weapon bound — the exact
    // "noweapons" branch p2d's hud.ts diff touched, alongside the cache-key
    // fix under test.
    w.phase = 'act2';
    hud.update(w);
    expect(root.querySelector('#sw-towerinfo')!.innerHTML).toContain(ARROW.name);

    // An enemy-caused death mid-VS-wave, not a sell — the exact gap
    // `World.removeStructure` was hardened for at p2b's Critical review
    // finding, which this panel's cache key must observe too.
    w.removeStructure(structure);
    hud.update(w);
    expect(root.querySelector('#sw-towerinfo')!.innerHTML).not.toContain(ARROW.name);
  });
});
