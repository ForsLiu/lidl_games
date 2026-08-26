/**
 * The tower panel exists so a player can answer "what does this actually do,
 * and is the upgrade worth it" without reading /data. That is only true if the
 * numbers it prints are the numbers the sim fires with, so these tests check
 * the model against the sim's own helpers rather than against literals.
 */

import { describe, expect, it } from 'vitest';

import { World } from '../src/sim/world';
import { updateProjectiles } from '../src/sim/combat';
import { loadContent } from '../src/sim/content';
import { dotOutstanding, spawnEnemy } from '../src/sim/enemies';
import {
  buildTower,
  maxLevel,
  sellTower,
  towerCost,
  towerDamage,
  updateTowers,
  upgradeCost,
  upgradeTower,
} from '../src/sim/towers';
import { structureArmor } from '../src/sim/upgrades';
import type { Structure } from '../src/sim/types';
import { towerInfo } from '../src/ui/tower-info';
import { cfg } from './helpers';

function world(): World {
  return new World(cfg());
}

/** A tile next to the Warden, so build-range checks pass. */
function freeTileNear(w: World): { tx: number; ty: number } {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const tx = Math.floor(w.warden.x) + dx;
      const ty = Math.floor(w.warden.y) + dy;
      if (w.grid.passable(tx, ty) && !w.structureAt(tx, ty)) return { tx, ty };
    }
  }
  throw new Error('no free tile near the Warden');
}

const content = loadContent();

describe('tower info model', () => {
  it('describes every tower in the game, attack or not', () => {
    const w = world();
    for (const def of content.towers.towers) {
      const info = towerInfo(w, def);
      expect(info.name, def.key).toBe(def.name);
      expect(info.attackText.length, def.key).toBeGreaterThan(0);
      expect(info.maxTier, def.key).toBe(maxLevel(def));
      // Every tower says something concrete: a stat, or that placement is
      // the point. Palisades legitimately have no attack.
      if (def.attack) expect(info.stats.length, def.key).toBeGreaterThan(0);
    }
  });

  it('quotes the same build cost the sim charges', () => {
    const w = world();
    for (const def of content.towers.towers) {
      expect(towerInfo(w, def).buildCost, def.key).toBe(towerCost(w, def));
    }
  });

  it('an unbuilt tower has no sell value and no upgrade quote', () => {
    const w = world();
    const def = content.towerByKey.get('arrow_spire')!;
    const info = towerInfo(w, def);
    expect(info.sellValue).toBeNull();
    expect(info.upgrade).toBeNull();
    expect(info.tier).toBe(1);
  });

  it('a placed tower quotes the real upgrade cost and sell value', () => {
    const w = world();
    const def = content.towerByKey.get('arrow_spire')!;
    const { tx, ty } = freeTileNear(w);
    w.gold = 9999;
    expect(buildTower(w, def.id, tx, ty).ok).toBe(true);
    const s = w.structureAt(tx, ty)!;

    const info = towerInfo(w, def, s);
    expect(info.tier).toBe(1);
    expect(info.buildCost).toBeNull();
    expect(info.upgrade).toEqual({ toTier: 2, cost: upgradeCost(w, def) });
    // SPEC-V3 §4: half of what this structure was actually charged.
    expect(info.sellValue).toBe(Math.round(s.spent * content.towers.sellRefund));

    // And the quoted sell value is what selling actually pays out.
    const before = w.gold;
    expect(sellTower(w, tx, ty)).toBe(true);
    expect(w.gold - before).toBe(info.sellValue);
  });

  it('reports no upgrade once a tower is at max tier', () => {
    const w = world();
    const def = content.towerByKey.get('arrow_spire')!;
    const { tx, ty } = freeTileNear(w);
    w.gold = 9999;
    buildTower(w, def.id, tx, ty);
    while (w.structureAt(tx, ty)!.tier < maxLevel(def)) {
      w.gold = 9999;
      expect(upgradeTower(w, tx, ty)).toBe(true);
    }
    const info = towerInfo(w, def, w.structureAt(tx, ty)!);
    expect(info.tier).toBe(maxLevel(def));
    expect(info.upgrade).toBeNull();
  });

  // m20c gave eight of the ten towers a non-zero defense band, which turned on
  // a branch of the "Blocks path" line that had been dead since it was written
  // (every tower was defense 0 before). QA filed it as shipping untested.
  it('quotes the defense a banded tower actually has, and nothing for a `none` one', () => {
    const w = world();
    const bands = w.content.towers.defenseBands;
    const armour = (key: string, s?: Structure) =>
      towerInfo(w, w.content.towerByKey.get(key)!, s).stats.find((x) => x.label === 'Blocks path')!.value;

    expect(armour('ballista'), 'a medium tower at level 1').toContain(`${bands.medium} defense`);
    expect(armour('mortar'), 'a low tower at level 1').toContain(`${bands.low} defense`);
    // The Palisade and the Sprout are `none`: no defense clause at all, rather
    // than a "0 defense" the player has to read past.
    expect(armour('palisade')).not.toContain('defense');
    expect(armour('harvest_sprout')).not.toContain('defense');

    // And it follows the track, like the HP beside it — the panel must quote
    // the structure standing there, not the def's level-1 sheet.
    const def = content.towerByKey.get('ballista')!;
    const { tx, ty } = freeTileNear(w);
    w.gold = 9999;
    expect(buildTower(w, def.id, tx, ty).ok).toBe(true);
    w.gold = 9999;
    expect(upgradeTower(w, tx, ty)).toBe(true);
    const s = w.structureAt(tx, ty)!;
    expect(armour('ballista', s)).toContain(`${Math.round(structureArmor(w, s) * 10) / 10} defense`);
    expect(structureArmor(w, s)).toBeGreaterThan(def.defense);
  });

  // SPEC-V3 §4: an upgrade step buys HP, Attack and Defense — **not** range,
  // which V2's x1.1-per-tier used to grow. The panel must quote both truthfully.
  it('shows what an upgrade step buys: damage up, range flat', () => {
    const w = world();
    const def = content.towerByKey.get('ballista')!;
    const damage = towerInfo(w, def).stats.find((s) => s.label === 'Damage')!;
    const range = towerInfo(w, def).stats.find((s) => s.label === 'Range')!;
    expect(Number(damage.next)).toBeGreaterThan(Number(damage.value.split(' ')[0]));
    expect(range.next, 'no "next" column for a stat the upgrade cannot move').toBeUndefined();
  });

  // QA, m20a: three panel lines outlived the rules they described. Each is
  // asserted against the sim's own answer rather than a re-typed string.
  it('describes an attack the way the sim actually resolves it', () => {
    const w = world();
    const def = content.towerByKey.get('tesla_coil')!;
    const level1 = towerInfo(w, def).attackText;
    const { tx, ty } = freeTileNear(w);
    w.gold = 99999;
    buildTower(w, def.id, tx, ty);
    while (w.structureAt(tx, ty)!.tier < maxLevel(def)) {
      w.gold = 99999;
      expect(upgradeTower(w, tx, ty)).toBe(true);
    }
    const maxed = towerInfo(w, def, w.structureAt(tx, ty)!).attackText;
    // m20b: §4 still spends no step on an arc *count* — Electric arcs because
    // of one milestone at step 3, and the panel says so exactly there and not
    // before. The old assertion was that the sentence never changed at all,
    // which was true only while the milestone was unimplemented.
    expect(level1, 'nothing arcs on a freshly built coil').not.toMatch(/arcs/);
    expect(maxed, 'the milestone is described where it lands').toMatch(/electric half then arcs/);
    expect(maxed).not.toMatch(/per tier/);
    const milestone = def.upgrades.specials[0];
    const below = towerInfo(w, def, { ...w.structureAt(tx, ty)!, tier: milestone.at }).attackText;
    expect(below, 'and not one step early').toBe(level1);
  });

  // QA, m20b: the panel quoted the *authored* damage, so it understated an
  // Arrow at level 6 by exactly 2x (two projectiles), a Tesla at 4 by a third
  // (the electric half lands twice) and said nothing about a Venom Spore's
  // poison, which is most of what it deals. Measured against the fire loop
  // rather than against `towerDamage`, at every level of every track, so no
  // milestone the panel forgets can pass.
  it('quotes what one attack actually does to an enemy, at every level', () => {
    for (const def of content.towers.towers) {
      if (!def.attack) continue;
      for (let tier = 1; tier <= maxLevel(def); tier++) {
        const w = new World(cfg());
        w.gold = 1e6;
        const { tx, ty } = freeTileNear(w);
        expect(buildTower(w, def.id, tx, ty).ok, def.key).toBe(true);
        for (let i = 1; i < tier; i++) {
          w.gold = 1e6;
          expect(upgradeTower(w, tx, ty), `${def.key} step ${i}`).toBe(true);
        }
        const s = w.structureAt(tx, ty)!;
        const info = towerInfo(w, def, s);
        const quoted = (label: string) => {
          const line = info.stats.find((x) => x.label === label);
          return line ? Number(line.value.split(' ')[0]) : 0;
        };

        // One attack, fired at a lone enemy, projectiles allowed to land.
        const gap = Math.max((def.attack.minRange ?? 0) + 1, 2);
        const e = spawnEnemy(w, 'husk', tx + 0.5, ty + 0.5 - gap)!;
        e.hp = 1e9;
        e.maxHp = 1e9;
        e.armor = 0;
        e.speed = 0;
        w.rebuildBuckets();
        const before = e.hp;
        updateTowers(w, 1 / 60);
        for (let i = 0; i < 240 && w.projectiles.some((p) => !p.dead); i++) updateProjectiles(w, 1 / 60);
        const impact = before - e.hp;
        const ailment = dotOutstanding(e);

        const cone = def.attack.kind === 'cone';
        const interval = def.attack.interval;
        const where = `${def.key} L${tier}`;
        // The panel prints one decimal, so agreement means agreement to within
        // half of one — tighter than that is an assertion about float order.
        const agrees = (label: string, measured: number, what: string) =>
          expect(Math.abs(quoted(label) - measured), `${where} ${what}: panel ${quoted(label)} vs ${measured}`)
            .toBeLessThanOrEqual(0.051);
        agrees('Damage', cone ? impact / interval : impact, 'impact');
        expect(
          Math.abs(quoted('Ailment per shot') + quoted('Ailment') - ailment),
          `${where} ailment`,
        ).toBeLessThanOrEqual(0.051);
        if (!cone) agrees('Single-target DPS', (impact + ailment) / interval, 'dps');
      }
    }
  });

  it('includes the class affinity bonus in the number it quotes', () => {
    for (const cls of content.classes.classes) {
      const w = new World(cfg({ classKey: cls.key }));
      for (const def of content.towers.towers) {
        if (!def.attack || def.attack.damageRatio) continue;
        const { tx, ty } = freeTileNear(w);
        w.gold = 99999;
        expect(buildTower(w, def.id, tx, ty).ok, def.key).toBe(true);
        const s = w.structureAt(tx, ty)!;
        const line = towerInfo(w, def, s).stats.find((x) => x.label === 'Damage')!;
        const quoted = Number(line.value.split(' ')[0]);
        const real = towerDamage(w, s, def.attack.damage);
        const perShot = def.attack.kind === 'cone' ? real / def.attack.interval : real;
        expect(quoted, `${cls.key}/${def.key}`).toBeCloseTo(Math.round(perShot * 10) / 10, 6);
        w.removeStructure(s);
      }
    }
  });

  it('spells out the terrain a tower petrifies into', () => {
    const w = world();
    const brazier = towerInfo(w, content.towerByKey.get('ember_brazier')!);
    expect(brazier.terrainText).toMatch(/explodes/);
    const obelisk = towerInfo(w, content.towerByKey.get('frost_obelisk')!);
    expect(obelisk.terrainText).toMatch(/Frost/);
  });

  it('a Beacon reports its aura, and the aura grows with tier', () => {
    const w = world();
    const def = content.towerByKey.get('beacon_totem')!;
    const { tx, ty } = freeTileNear(w);
    w.gold = 9999;
    buildTower(w, def.id, tx, ty);
    const s = w.structureAt(tx, ty)!;
    const t1 = towerInfo(w, def, s).stats.find((x) => x.label === 'Aura')!.value;
    w.gold = 9999;
    upgradeTower(w, tx, ty);
    const t2 = towerInfo(w, def, w.structureAt(tx, ty)!).stats.find((x) => x.label === 'Aura')!.value;
    expect(t2).not.toBe(t1);
  });
});
