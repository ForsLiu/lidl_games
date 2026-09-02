/**
 * fb037 — VS side panel data model (SPEC-FINAL §6.2 lineage-panel extension,
 * owner feedback `feature-vs-wielded-side-panel`). The acceptance criterion
 * is that the panel's numbers equal the sim's own derivation, so these tests
 * check `vsPanelRows` directly against the same helpers `fireWielded`
 * (`sim/vswield.ts`) fires with, not against a re-derived expectation.
 */

import { describe, expect, it } from 'vitest';

import { loadContent, type TowerDef } from '../src/sim/content';
import { damageEnemy, spawnEnemy } from '../src/sim/enemies';
import { buildTower, upgradeTower } from '../src/sim/towers';
import { typeMasteryMul } from '../src/sim/progression';
import { wieldedAoeFor, wieldedAttacks, wieldedPierceFor, wieldedRangeFor } from '../src/sim/vswield';
import { World } from '../src/sim/world';
import { damageTypeText, vsPanelRows } from '../src/ui/vs-panel';
import { cfg } from './helpers';

const content = loadContent();
const ARROW = content.towerByKey.get('arrow_spire')!;
const BALLISTA = content.towerByKey.get('ballista')!;
const MORTAR = content.towerByKey.get('mortar')!;
const VENOM = content.towerByKey.get('venom_spore')!;

/** Free, buildable tiles that never collide with each other. */
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

function build(w: World, def: TowerDef, tx: number, ty: number, steps = 0) {
  w.warden.x = tx + 0.5;
  w.warden.y = ty + 0.5;
  w.gold = 1e6;
  expect(buildTower(w, def.id, tx, ty).ok).toBe(true);
  for (let i = 0; i < steps; i++) {
    w.gold = 1e6;
    expect(upgradeTower(w, tx, ty)).toBe(true);
  }
}

describe('fb037 — VS panel data model', () => {
  it('is empty with nothing built', () => {
    const w = new World(cfg(), content);
    expect(vsPanelRows(w)).toEqual([]);
  });

  it('a wall (no attack) wields nothing, matching wieldedAttacks', () => {
    const w = new World(cfg(), content);
    const [t1] = tiles(w, 1);
    build(w, content.towerByKey.get('palisade')!, t1.tx, t1.ty);
    expect(vsPanelRows(w)).toEqual([]);
  });

  it('a single-kind tower (Arrow) reports damage/range/pierce equal to the sim\'s own derivation', () => {
    const w = new World(cfg(), content);
    const [t1] = tiles(w, 1);
    build(w, ARROW, t1.tx, t1.ty);

    const rows = vsPanelRows(w);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    const wielded = wieldedAttacks(w)[0];
    const def = w.content.towerById.get(wielded.towerId)!;

    expect(row.key).toBe('arrow_spire');
    expect(row.name).toBe(ARROW.name);
    expect(row.count).toBe(1);
    expect(row.perTowerAverage).toBeCloseTo(wielded.perTowerAverage, 6);
    // The exact multiplication `fireWielded` fires with — Power and Type
    // Mastery folded in at read time, not stored on `WieldedAttack` itself.
    expect(row.damage).toBeCloseTo(
      wielded.damage * w.derived.powerMul * typeMasteryMul(w, wielded.towerKey),
      6,
    );
    expect(row.interval).toBe(wielded.interval);
    expect(row.range).toBeCloseTo(wieldedRangeFor(w, def.attack!), 6);
    expect(row.pierce).toBe(wieldedPierceFor(def.attack!, wielded.profile));
    expect(row.aoe).toBe(wieldedAoeFor(w, def, def.attack!));
    // Arrow is all-Normal damage with no ratio authored.
    expect(row.damageTypeText).toBe('100% Normal');
  });

  it('a pierce-kind tower (Ballista) reports the wielded pierce bonus, not the raw profile pierce', () => {
    const w = new World(cfg(), content);
    const [t1] = tiles(w, 1);
    build(w, BALLISTA, t1.tx, t1.ty);
    const row = vsPanelRows(w)[0];
    const wielded = wieldedAttacks(w)[0];
    // `wieldedPierceFor` adds the wield-only bonus on top of the profile's
    // own pierce for the `pierce` kind — asserting against the raw profile
    // value here would catch a regression that dropped the bonus silently.
    expect(row.pierce).toBeGreaterThan(wielded.profile.pierce);
    expect(row.pierce).toBe(wieldedPierceFor(BALLISTA.attack!, wielded.profile));
    // The special text must quote the same wield-scaled number, not the raw
    // profile pierce — a code-reviewer finding on this item's first draft,
    // where the special text silently disagreed with the row's own `pierce`.
    expect(row.special).toBe(`pierce ${row.pierce}`);
  });

  it('a lob-kind tower (Mortar) reports a nonzero AoE equal to the wielded (not TD) formula', () => {
    const w = new World(cfg(), content);
    const [t1] = tiles(w, 1);
    build(w, MORTAR, t1.tx, t1.ty);
    const row = vsPanelRows(w)[0];
    const wielded = wieldedAttacks(w)[0];
    const def = w.content.towerById.get(wielded.towerId)!;
    expect(row.aoe).toBeGreaterThan(0);
    expect(row.aoe).toBeCloseTo(wieldedAoeFor(w, def, def.attack!), 6);
    // Same drift check as the Ballista pierce case above, for AoE.
    expect(row.special).toBe(`splash r${Math.round(row.aoe * 10) / 10}`);
  });

  it('a poison-kind tower with an authored damage ratio splits by damage type, summing to 100%', () => {
    const w = new World(cfg(), content);
    const [t1] = tiles(w, 1);
    build(w, VENOM, t1.tx, t1.ty);
    const row = vsPanelRows(w)[0];
    expect(row.damageTypeText).not.toBe('100% Normal');
    // Every percentage token in the text sums to 100 — a generic assertion
    // that survives the ratio's exact split changing in `/data`.
    const pcts = [...row.damageTypeText.matchAll(/(\d+)%/g)].map((m) => Number(m[1]));
    expect(pcts.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('damageTypeText always sums to exactly 100%, even for an unevenly-rounding 3-way split (qa-playtester finding)', () => {
    const w = new World(cfg(), content);
    // 1/1/1 independently rounds to 33+33+33 = 99 — the bug this guards.
    const text = damageTypeText(w, { normal: 1, electric: 1, poison: 1 });
    const pcts = [...text.matchAll(/(\d+)%/g)].map((m) => Number(m[1]));
    expect(pcts).toHaveLength(3);
    expect(pcts.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('rows sort by name and every row carries a nonempty special-effect phrase', () => {
    const w = new World(cfg(), content);
    const [t1, t2] = tiles(w, 2);
    build(w, MORTAR, t1.tx, t1.ty);
    build(w, ARROW, t2.tx, t2.ty);
    const rows = vsPanelRows(w);
    expect(rows.map((r) => r.name)).toEqual([...rows.map((r) => r.name)].sort((a, b) => a.localeCompare(b)));
    for (const r of rows) expect(r.special.length).toBeGreaterThan(0);
  });

  it('"this wave" damage/DPS reconciles with the DPS panel\'s own wave window', () => {
    const w = new World(cfg(), content);
    const [t1] = tiles(w, 1);
    build(w, ARROW, t1.tx, t1.ty);
    // Fresh run, nothing fired yet: the row must not silently omit itself.
    let row = vsPanelRows(w).find((r) => r.key === 'arrow_spire')!;
    expect(row.waveDamage).toBe(0);
    expect(row.waveDps).toBe(0);

    const e = spawnEnemy(w, 'husk', 3, 3)!;
    w.tick = 60;
    damageEnemy(w, e, 42, 'arrow_spire', { type: 'normal' });
    row = vsPanelRows(w).find((r) => r.key === 'arrow_spire')!;
    expect(row.waveDamage).toBe(42);
    expect(row.waveDps).toBeCloseTo(42 / (w.tick / 60), 6);
  });
});
