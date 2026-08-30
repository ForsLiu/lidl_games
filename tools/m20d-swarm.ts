/**
 * m20d probe: QA's second measurement on the Venom Spore — is the @4 ratio
 * shift (`normal:poison 1:1 → 1:1.5`, §4) an upgrade or a downgrade?
 *
 * One tower, `n` husks parked inside its range, ticked until the last one is
 * dead. Husk HP is swept because that is the whole story: a burst-to-DoT trade
 * only reads as a downgrade in the window where the smaller impact stops
 * one-shotting what the bigger one killed outright.
 *
 *   npx tsx tools/m20d-swarm.ts [count] [hp...]
 */
import { loadContent } from '../src/sim/content';
import { spawnEnemy, updateEnemies } from '../src/sim/enemies';
import { buildTower, maxLevel, updateTowers, upgradeTower } from '../src/sim/towers';
import { updateProjectiles } from '../src/sim/combat';
import { World } from '../src/sim/world';
import type { RunConfig } from '../src/sim/types';

const DT = 1 / 60;

function freeTile(w: World): { tx: number; ty: number } {
  for (let ty = 4; ty < 20; ty++)
    for (let tx = 4; tx < 20; tx++)
      if (w.grid.buildable(tx, ty) && !w.grid.wouldBlockPath([[tx, ty]])) return { tx, ty };
  throw new Error('no buildable tile');
}

try {
  const content = loadContent();
  const VENOM = content.towerByKey.get('venom_spore')!;

  const cfg = (): RunConfig => ({
    seed: 1, classKey: 'engineer', tier: 1, modifiers: [],
    allocated: [], policy: 'hybrid', cycles: 1,
  });

  /** Seconds for one Venom Spore at `level` to kill `n` husks of `hp` each. */
  const clearSeconds = (level: number, n: number, hp: number): number => {
    const w = new World(cfg(), content);
    const { tx, ty } = freeTile(w);
    w.warden.x = tx + 0.5;
    w.warden.y = ty + 0.5;
    w.gold = 1e6;
    buildTower(w, VENOM.id, tx, ty);
    for (let i = 1; i < level; i++) {
      w.gold = 1e6;
      upgradeTower(w, tx, ty);
    }
    // Two ranks either side of the tower, inside range, spaced so the 1-tile
    // splash reaches a neighbour but not the whole rank — the shape a lane of
    // husks actually presents.
    const live = [];
    for (let i = 0; i < n; i++) {
      const e = spawnEnemy(w, 'husk', tx + 0.5 + (i % 2 ? 1.2 : -1.2), ty + 0.5 + (Math.floor(i / 2) % 5) * 0.7 - 1.4);
      if (!e) throw new Error('spawn failed');
      e.hp = hp;
      e.maxHp = hp;
      e.speed = 0;
      live.push(e);
    }
    for (let tick = 0; tick < 60 * 120; tick++) {
      w.rebuildBuckets();
      updateTowers(w, DT);
      updateProjectiles(w, DT);
      updateEnemies(w, DT);
      w.tick++;
      if (live.every((e) => e.dead || e.hp <= 0)) return (tick + 1) / 60;
    }
    return Infinity;
  };

  const n = Number(process.argv[2] ?? 40);
  const hps = process.argv.slice(3).map(Number);
  const list = hps.length ? hps : [20, 25, 30, 40, 60, 90, 140, 220];
  const levels = [maxLevel(VENOM) - 1, maxLevel(VENOM)];
  console.log(`venom_spore, ${n} husks — seconds to clear (L${levels[0]} → L${levels[1]})`);
  for (const hp of hps.length ? hps : list) {
    const a = clearSeconds(levels[0], n, hp);
    const b = clearSeconds(levels[1], n, hp);
    const d = ((b - a) / a) * 100;
    console.log(`hp ${String(hp).padStart(4)}  L${levels[0]} ${a.toFixed(2)}s  L${levels[1]} ${b.toFixed(2)}s  ${d >= 0 ? '+' : ''}${d.toFixed(1)}%`);
  }
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`m20d-swarm: ${message.replace(/\s+/g, ' ').trim()}`);
  process.exitCode = 1;
}
