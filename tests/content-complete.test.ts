/** M4 content pass: every piece of authored content is reachable and behaves. */

import { describe, expect, it } from 'vitest';

import { World } from '../src/sim/world';
import { loadContent } from '../src/sim/content';
import { damageEnemy, dotRemaining, spawnEnemy, updateEnemies } from '../src/sim/enemies';
import { buildTower } from '../src/sim/towers';
import { grantWeapon, updateWeapons } from '../src/sim/weapons';
import type { StatKey } from '../src/sim/stats';
import { handleKillDrops, rollRelic } from '../src/sim/loot';
import { Rng } from '../src/sim/rng';
import { autoDraft, hardestDraft, modifierDraft, rewardMultiplier } from '../src/sim/tiers';
import { cfg } from './helpers';

const content = loadContent();

describe('content completeness', () => {
  it('has all 10 towers with three tiers and a terrain form', () => {
    expect(content.towers.towers).toHaveLength(10);
    for (const t of content.towers.towers) {
      expect(t.terrain.kind, t.key).toBeTruthy();
      expect(t.maxTier, t.key).toBeGreaterThanOrEqual(1);
      if (t.key !== 'palisade') expect(t.maxTier, t.key).toBe(3);
    }
  });

  it('has 8 weapons, each with a full six-level track', () => {
    expect(content.weapons.weapons).toHaveLength(8);
    for (const w of content.weapons.weapons) {
      expect(w.levels, w.key).toHaveLength(6);
      const first = w.levels[0].damage ?? w.levels[0].dps ?? 0;
      const last = w.levels[5].damage ?? w.levels[5].dps ?? 0;
      expect(last, `${w.key} must scale across its track`).toBeGreaterThan(first);
    }
  });

  it('has 20 enemies and every wave references real ones', () => {
    expect(content.enemies.enemies).toHaveLength(20);
    expect(content.waves.waves).toHaveLength(10);
    for (const wave of content.waves.waves) {
      for (const g of wave.groups) expect(content.enemyByKey.has(g.enemy), g.enemy).toBe(true);
    }
  });

  it('introduces the Gatebreaker on wave 10', () => {
    const last = content.waves.waves[9];
    expect(last.groups.some((g) => g.enemy === 'gatebreaker')).toBe(true);
  });

  it('has 12 boons, each mapping to a real stat', () => {
    expect(content.boons.boons).toHaveLength(12);
    const w = new World(cfg());
    for (const b of content.boons.boons) {
      const stat = b.stat as StatKey;
      const before = w.stats.total(stat);
      w.stats.addAll(`boon:${b.key}`, { [b.stat]: b.perRank });
      expect(w.stats.total(stat), b.key).not.toBe(before);
    }
  });

  it('has 12 map modifiers, each with a real effect', () => {
    expect(content.modifiers.modifiers).toHaveLength(12);
    for (const m of content.modifiers.modifiers) {
      expect(Object.keys(m.effect).length, m.key).toBeGreaterThan(0);
      expect(m.rewardBonus, m.key).toBeGreaterThan(0);
    }
  });
});

describe('enemy behaviours', () => {
  it('the Gatebreaker chews structures twice as fast as a Husk', () => {
    const damageTo = (key: string): number => {
      const w = new World(cfg());
      w.gold = 10000;
      w.warden.x = 10.5;
      w.warden.y = 10.5;
      expect(buildTower(w, 1, 10, 10).ok).toBe(true);
      const s = w.structureAt(10, 10)!;
      s.hp = 1e9;
      s.maxHp = 1e9;
      // Park the enemy so its next step walks into the wall.
      const e = spawnEnemy(w, key, 8.5, 10.5, { overlay: false })!;
      e.speed = 6;
      const before = s.hp;
      for (let i = 0; i < 120; i++) {
        w.rebuildBuckets();
        updateEnemies(w, 1 / 60);
      }
      return before - s.hp;
    };
    const husk = damageTo('husk');
    const boss = damageTo('gatebreaker');
    expect(husk).toBeGreaterThan(0);
    // 100 core damage x 2 structure multiplier vs 5 core damage.
    expect(boss / husk).toBeGreaterThan(10);
  });

  it('a Splitling leaves two Husks behind', () => {
    const w = new World(cfg());
    const e = spawnEnemy(w, 'splitling', 10, 10, { overlay: false })!;
    const before = w.enemies.length;
    damageEnemy(w, e, 1e6, 'test');
    expect(w.enemies.filter((x) => !x.dead).length).toBe(before - 1 + 2);
  });

  it('a Shellback takes far less damage from the front', () => {
    const w = new World(cfg());
    const front = spawnEnemy(w, 'shellback', 10, 10, { overlay: false })!;
    front.fx = 1;
    front.fy = 0;
    const back = spawnEnemy(w, 'shellback', 14, 10, { overlay: false })!;
    back.fx = 1;
    back.fy = 0;
    const a = damageEnemy(w, front, 100, 'test', { fromX: 12, fromY: 10 });
    const b = damageEnemy(w, back, 100, 'test', { fromX: 12, fromY: 10 });
    expect(a).toBeCloseTo(30, 5);
    expect(b).toBeCloseTo(100, 5);
  });

  it('a Cinderling ignores burn, a Frostkin ignores slow', () => {
    const w = new World(cfg());
    w.phase = 'act2';
    const cinder = spawnEnemy(w, 'cinderling', 10, 10, { overlay: true })!;
    const frost = spawnEnemy(w, 'frostkin', 11, 10, { overlay: true })!;
    grantWeapon(w, 'flame_cone', 6, 0);
    grantWeapon(w, 'frost_nova', 6, 0);
    w.warden.x = 10;
    w.warden.y = 10;
    w.warden.fx = 1;
    for (let i = 0; i < 120; i++) {
      w.rebuildBuckets();
      updateWeapons(w, 1 / 60);
    }
    expect(dotRemaining(cinder, 'burning')).toBe(0);
    expect(frost.slowAmount).toBe(0);
  });

  it('a Mender heals its neighbours', () => {
    const w = new World(cfg());
    spawnEnemy(w, 'mender', 10, 10, { overlay: false });
    const hurt = spawnEnemy(w, 'bulwark', 10.5, 10.5, { overlay: false })!;
    hurt.hp = 10;
    for (let i = 0; i < 120; i++) {
      w.rebuildBuckets();
      updateEnemies(w, 1 / 60);
    }
    expect(hurt.hp).toBeGreaterThan(10);
  });
});

describe('loot (SPEC 7)', () => {
  it('rolls relics with the right affix counts per rarity', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 300; i++) {
      const r = rollRelic(content, rng, 0, i);
      const rarity = content.relics.rarities.find((x) => x.key === r.rarity)!;
      expect(r.affixes.length).toBeGreaterThanOrEqual(rarity.minAffixes);
      expect(r.affixes.length).toBeLessThanOrEqual(rarity.maxAffixes);
      expect(new Set(r.affixes.map((a) => a.key)).size).toBe(r.affixes.length);
      expect(content.relics.slots).toContain(r.slot);
    }
  });

  it('keeps affix values inside their authored ranges', () => {
    const rng = new Rng(11);
    for (let i = 0; i < 300; i++) {
      for (const a of rollRelic(content, rng, 0, i).affixes) {
        const def = content.relics.affixes.find((d) => d.key === a.key)!;
        expect(a.value).toBeGreaterThanOrEqual(def.pct ? def.min - 0.001 : Math.floor(def.min));
        expect(a.value).toBeLessThanOrEqual(def.pct ? def.max + 0.001 : Math.ceil(def.max));
      }
    }
  });

  it('shifts rarity upward with Luck', () => {
    const rare = (luck: number): number => {
      const rng = new Rng(3);
      let n = 0;
      for (let i = 0; i < 2000; i++) if (rollRelic(content, rng, luck, i).rarity === 'rare') n++;
      return n;
    };
    expect(rare(100)).toBeGreaterThan(rare(0));
  });

  it('always drops a relic from an elite and from the final boss', () => {
    const w = new World(cfg());
    w.phase = 'act2';
    const elite = spawnEnemy(w, 'colossus', 10, 10, { overlay: true })!;
    handleKillDrops(w, elite, content.enemyByKey.get('colossus')!);
    expect(w.relicsFound.length).toBe(1);
    const boss = spawnEnemy(w, 'warden_eater', 12, 10, { overlay: false })!;
    handleKillDrops(w, boss, content.enemyByKey.get('warden_eater')!);
    expect(w.relicsFound.length).toBe(2);
    expect(w.relicsFound[1].rarity).toBe('rare');
  });
});

describe('map tiers (SPEC 8.3)', () => {
  it('offers tier-1 modifiers as N-1 slots of 1-of-2', () => {
    for (let tier = 1; tier <= 5; tier++) {
      const draft = modifierDraft(content, 42, tier);
      expect(draft.length).toBe(tier - 1);
      for (const slot of draft) {
        expect(slot.options.length).toBe(2);
        expect(slot.options[0].key).not.toBe(slot.options[1].key);
      }
    }
  });

  it('never offers the same modifier twice in one draft', () => {
    const picked = modifierDraft(content, 5, 5).flatMap((o) => o.options.map((m) => m.key));
    expect(new Set(picked).size).toBe(picked.length);
  });

  it('auto-drafts and hard-drafts one modifier per slot', () => {
    expect(autoDraft(content, 9, 4)).toHaveLength(3);
    expect(hardestDraft(content, 9, 4)).toHaveLength(3);
  });

  it('scales rewards with tier and with modifier count', () => {
    const t1 = rewardMultiplier(content, 1, []);
    const t3 = rewardMultiplier(content, 3, ['tough', 'fleet']);
    expect(t1).toBeCloseTo(1, 6);
    expect(t3).toBeGreaterThan(1 + 0.35 * 2);
  });
});
