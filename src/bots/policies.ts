/**
 * The scripted policies (SPEC 9.4). These are heuristics, not good play: they
 * only need to be consistent enough to make balance sweeps meaningful.
 *
 * Everything here is deterministic — any randomness comes from the world's
 * `ai` RNG stream, never from Math.random.
 */

import { registerPolicy, type BotPolicy } from './policy';
import { emptyInput, type TickInput } from '../sim/types';
import type { World } from '../sim/world';
import { GRID_H, GRID_W, coreCenter } from '../sim/grid';
import { checkBuild, towerCost, upgradeCost } from '../sim/towers';
import { dist2 } from '../sim/math';

interface Site {
  tx: number;
  ty: number;
  score: number;
}

/** Matches the pocket the Core detonation clears (SPEC 4, step 2). */
const POCKET_CLEAR_RADIUS = 3.2;

export interface BuilderOptions {
  /** Tower keys the bot is willing to build, in priority order. */
  towerKeys: string[];
  /** Fraction of placements spent on Palisades. */
  wallRatio: number;
  /** Hard cap on structures. */
  maxStructures: number;
  /** Upgrade existing towers once this many are standing. */
  upgradeAfter: number;
  /**
   * Spend on tiers before placing anything new, once `upgradeAfter` towers are
   * standing. Produces the maxed Act I build SPEC A8 compares against.
   */
  upgradeFirst: boolean;
  /** Act II behaviour. */
  act2: 'kite' | 'hold' | 'none';
  /** Call the next wave early once the plan is exhausted. */
  rushWaves: boolean;
}

const DEFAULTS: BuilderOptions = {
  towerKeys: ['arrow_spire'],
  wallRatio: 0,
  maxStructures: 40,
  upgradeAfter: 8,
  upgradeFirst: false,
  act2: 'kite',
  rushWaves: true,
};

export class BuilderPolicy implements BotPolicy {
  readonly name: string;
  private opts: BuilderOptions;
  private plan: { towerId: number; tx: number; ty: number }[] = [];
  private planWave = -1;
  private buildOverride: { towerKeys?: string[]; maxStructures?: number } | null = null;

  constructor(name: string, opts: Partial<BuilderOptions>) {
    this.name = name;
    this.opts = { ...DEFAULTS, ...opts };
  }

  /** Used by `sim --build file.json`. */
  setBuild(script: unknown): void {
    if (script && typeof script === 'object') {
      this.buildOverride = script as { towerKeys?: string[]; maxStructures?: number };
      if (this.buildOverride.towerKeys) this.opts.towerKeys = this.buildOverride.towerKeys;
      if (this.buildOverride.maxStructures !== undefined) {
        this.opts.maxStructures = this.buildOverride.maxStructures;
      }
    }
  }

  reset(): void {
    this.plan = [];
    this.planWave = -1;
  }

  act(w: World): TickInput {
    switch (w.phase) {
      case 'act1_build':
      case 'act1_wave':
        return this.act1(w);
      case 'dusk':
        return emptyInput();
      case 'soulpick':
        return { ...emptyInput(), cmds: [{ k: 'souls', keys: this.pickSouls(w) }] };
      case 'levelup':
        return { ...emptyInput(), cmds: [{ k: 'pick', index: this.pickOffer(w) }] };
      case 'act2':
        return this.act2(w);
      default:
        return emptyInput();
    }
  }

  /* ------------------------------------------------------------- Act I */

  private act1(w: World): TickInput {
    const input = emptyInput();
    if (this.planWave !== w.wave || this.plan.length === 0) this.replan(w);

    const live = w.structures.filter((s) => !s.dead).length;
    if (live >= this.opts.maxStructures) this.plan.length = 0;

    // Prune anything that became illegal (someone else took the tile).
    while (this.plan.length > 0) {
      const p = this.plan[0];
      if (w.grid.buildable(p.tx, p.ty)) break;
      this.plan.shift();
    }

    // Tier-first bots bank gold into upgrades before widening the maze.
    if (this.opts.upgradeFirst) {
      const up = this.pickUpgrade(w);
      if (up) {
        const r = w.derived.buildRange;
        if (dist2(w.warden.x, w.warden.y, up.tx + 0.5, up.ty + 0.5) <= r * r) {
          input.cmds.push({ k: 'upgrade', tx: up.tx, ty: up.ty });
        } else {
          steerTo(input, w, up.tx + 0.5, up.ty + 0.5);
        }
        input.attack = true;
        return input;
      }
    }

    if (this.plan.length > 0) {
      const p = this.plan[0];
      const def = w.content.towerById.get(p.towerId)!;
      if (w.gold >= towerCost(w, def)) {
        const reason = checkBuild(w, p.towerId, p.tx, p.ty);
        if (reason === null) {
          input.cmds.push({ k: 'build', tower: p.towerId, tx: p.tx, ty: p.ty });
          this.plan.shift();
        } else if (reason === 'out_of_range') {
          steerTo(input, w, p.tx + 0.5, p.ty + 0.5);
        } else {
          this.plan.shift();
        }
        input.attack = true;
        return input;
      }
    }

    // Nothing left to place: spend spare gold on upgrades near the Warden.
    const up = this.pickUpgrade(w);
    if (up) {
      const reason = dist2(w.warden.x, w.warden.y, up.tx + 0.5, up.ty + 0.5);
      const r = w.derived.buildRange;
      if (reason <= r * r) {
        input.cmds.push({ k: 'upgrade', tx: up.tx, ty: up.ty });
      } else {
        steerTo(input, w, up.tx + 0.5, up.ty + 0.5);
      }
      input.attack = true;
      return input;
    }

    if (this.opts.rushWaves && w.phase === 'act1_build' && w.buildTimer > 0.5) {
      input.cmds.push({ k: 'call' });
    }
    // Sit near the Core and plug leaks by hand.
    const c = coreCenter();
    steerTo(input, w, c.x - 2, c.y);
    input.attack = true;
    return input;
  }

  private pickUpgrade(w: World): { tx: number; ty: number } | null {
    const live = w.structures.filter((s) => !s.dead && !s.petrified);
    if (live.length < this.opts.upgradeAfter) return null;
    let best: { tx: number; ty: number } | null = null;
    let bestTier = 99;
    for (const s of live) {
      const def = w.content.towerById.get(s.towerId)!;
      if (!def.attack && !def.economy && !def.buffAura) continue;
      if (s.tier >= def.maxTier) continue;
      if (w.gold < upgradeCost(w, def, s.tier + 1)) continue;
      if (s.tier < bestTier) {
        bestTier = s.tier;
        best = { tx: s.tx, ty: s.ty };
      }
    }
    return best;
  }

  private replan(w: World): void {
    this.planWave = w.wave;
    this.plan = [];
    const sites = rankSites(w);
    const keys = this.opts.towerKeys.filter((k) => {
      const def = w.content.towerByKey.get(k);
      return def && (!def.classLock || def.classLock === w.cfg.classKey);
    });
    if (keys.length === 0) return;
    const palisade = w.content.towerByKey.get('palisade')!;
    const budget = Math.max(0, this.opts.maxStructures - w.structures.filter((s) => !s.dead).length);
    let ki = 0;
    for (let i = 0; i < sites.length && this.plan.length < budget; i++) {
      const s = sites[i];
      const useWall = this.opts.wallRatio > 0 && i % Math.max(2, Math.round(1 / this.opts.wallRatio)) === 0;
      const def = useWall ? palisade : w.content.towerByKey.get(keys[ki++ % keys.length])!;
      this.plan.push({ towerId: def.id, tx: s.tx, ty: s.ty });
    }
  }

  /* ------------------------------------------------------- the Sundering */

  private pickSouls(w: World): string[] {
    // Prefer the weapons whose towers were most invested in.
    const scored = w.soulCandidates.map((key) => {
      const weapon = w.content.weaponByKey.get(key);
      const src = weapon ? w.content.towerByKey.get(weapon.source) : undefined;
      let score = 0;
      if (src) {
        for (const s of w.structures) {
          if (s.dead || s.towerId !== src.id) continue;
          score += s.tier * 10 + 1;
        }
      }
      return { key, score };
    });
    scored.sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : 1));
    return scored.slice(0, w.derived.weaponSlots).map((s) => s.key);
  }

  private pickOffer(w: World): number {
    // Weapon upgrades first, then whatever boon is offered.
    for (let i = 0; i < w.offers.length; i++) {
      if (w.offers[i].kind === 'awakening') return i;
    }
    for (let i = 0; i < w.offers.length; i++) {
      if (w.offers[i].kind === 'weapon') return i;
    }
    return 0;
  }

  /* ------------------------------------------------------------ Act II */

  private act2(w: World): TickInput {
    const input = emptyInput();
    if (this.opts.act2 === 'hold') {
      const c = coreCenter();
      steerTo(input, w, c.x, c.y);
      return input;
    }
    if (this.opts.act2 === 'none') return input;
    return kiteInput(w);
  }
}

/* ------------------------------------------------------------- steering */

function steerTo(input: TickInput, w: World, x: number, y: number): void {
  const dx = x - w.warden.x;
  const dy = y - w.warden.y;
  input.mx = Math.abs(dx) > 0.25 ? (dx > 0 ? 1 : -1) : 0;
  input.my = Math.abs(dy) > 0.25 ? (dy > 0 ? 1 : -1) : 0;
  input.aimX = x;
  input.aimY = y;
}

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

const THREAT_RADIUS = 8;
const GEM_RADIUS = 7;
/** How far ahead each heading is evaluated, in tiles. */
const PROBE_STEPS = [1.2, 2.6, 4.0];

/**
 * Kiting. For each of the eight headings we walk a short probe line and score
 * where it would put the Warden: threat from the horde (weighted by how soon
 * each enemy could close the gap), how much open floor lies that way, how many
 * XP gems are in that direction, and how close the arena edge is.
 *
 * Gems matter as much as safety: they fade if uncollected, so a Warden that
 * only runs away starves for levels.
 */
export function kiteInput(w: World): TickInput {
  const input = emptyInput();
  const wd = w.warden;
  const near = w.enemiesInRadius(wd.x, wd.y, THREAT_RADIUS).slice();

  let closest = Infinity;
  for (const e of near) {
    const d = dist2(wd.x, wd.y, e.x, e.y);
    if (d < closest) closest = d;
  }

  const gems: { x: number; y: number; v: number }[] = [];
  for (const g of w.gems) {
    if (g.dead) continue;
    const d2 = dist2(g.x, g.y, wd.x, wd.y);
    if (d2 <= GEM_RADIUS * GEM_RADIUS) gems.push({ x: g.x, y: g.y, v: g.value });
  }

  let best: readonly [number, number] | null = null;
  let bestScore = -Infinity;
  for (const [dx, dy] of DIRS) {
    const len = dx !== 0 && dy !== 0 ? 0.7071067811865475 : 1;
    let score = 0;
    let blocked = false;
    let reached = 0;

    for (const step of PROBE_STEPS) {
      const px = wd.x + dx * len * step;
      const py = wd.y + dy * len * step;
      if (!walkableAt(w, px, py)) {
        blocked = true;
        break;
      }
      reached = step;
      const weight = 1 / step; // nearer probe points matter more
      for (const e of near) {
        const d = Math.sqrt(dist2(px, py, e.x, e.y));
        score -= (10 / (d * d + 0.5)) * weight;
        if (d < 1.3) score -= 25 * weight;
      }
      const edge = Math.min(px, py, GRID_W - px, GRID_H - py);
      if (edge < 3.5) score -= (3.5 - edge) * 7 * weight;
    }

    if (reached === 0) continue;
    // Reward headings that stay open: a blocked lane is a trap.
    score += reached * 2.5;
    if (blocked) score -= 8;

    for (const g of gems) {
      const gx = g.x - wd.x;
      const gy = g.y - wd.y;
      const gd = Math.sqrt(gx * gx + gy * gy) || 1;
      const align = (gx / gd) * dx * len + (gy / gd) * dy * len;
      if (align > 0.3) score += (align * g.v * 1.4) / (gd + 1);
    }

    if (dx === Math.round(wd.fx) && dy === Math.round(wd.fy)) score += 2;
    if (score > bestScore) {
      bestScore = score;
      best = [dx, dy];
    }
  }

  if (!best) {
    // Fully enclosed: dash straight at the arena centre.
    const cx = GRID_W / 2 - wd.x;
    const cy = GRID_H / 2 - wd.y;
    input.mx = Math.abs(cx) > 0.3 ? (cx > 0 ? 1 : -1) : 0;
    input.my = Math.abs(cy) > 0.3 ? (cy > 0 ? 1 : -1) : 0;
    input.dash = true;
    return input;
  }

  input.mx = best[0];
  input.my = best[1];
  input.dash = closest < 2.0 && w.warden.dashCharges > 0;
  input.aimX = wd.x + input.mx;
  input.aimY = wd.y + input.my;
  return input;
}

function walkableAt(w: World, x: number, y: number): boolean {
  return w.grid.passable(Math.floor(x), Math.floor(y));
}

/* ---------------------------------------------------- build-site ranking */

/**
 * Candidate tiles are those next to the lanes enemies actually walk, scored by
 * lane adjacency and proximity to the Core.
 */
export function rankSites(w: World): Site[] {
  const lanes = laneTiles(w);
  const core = coreCenter();
  const seen = new Set<number>();
  const sites: Site[] = [];
  for (const li of lanes) {
    const lx = li % GRID_W;
    const ly = (li / GRID_W) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = lx + dx;
        const ty = ly + dy;
        if (!w.grid.buildable(tx, ty)) continue;
        const key = ty * GRID_W + tx;
        if (seen.has(key)) continue;
        seen.add(key);
        let adjacency = 0;
        for (let ay = -1; ay <= 1; ay++) {
          for (let ax = -1; ax <= 1; ax++) {
            if (lanes.has((ty + ay) * GRID_W + (tx + ax))) adjacency++;
          }
        }
        const d = Math.sqrt(dist2(tx + 0.5, ty + 0.5, core.x, core.y));
        // Anything inside the Sundering blast pocket is force-cleared at dusk
        // (SPEC 4), so building there throws the investment away.
        const doomed = d <= POCKET_CLEAR_RADIUS ? 40 : 0;
        sites.push({ tx, ty, score: adjacency * 4 - d - doomed });
      }
    }
  }
  sites.sort((a, b) => b.score - a.score || a.ty - b.ty || a.tx - b.tx);
  return sites;
}

/** Tiles on the flow-field route from each gate to the Core. */
export function laneTiles(w: World): Set<number> {
  const out = new Set<number>();
  w.grid.refresh();
  for (const g of w.gates) {
    let tx = g.tx;
    let ty = g.ty;
    let guard = 0;
    while (guard++ < 400) {
      out.add(ty * GRID_W + tx);
      const step = w.grid.stepFrom(tx, ty);
      if (!step) break;
      [tx, ty] = step;
      if (w.grid.distAt(tx, ty) === 0) {
        out.add(ty * GRID_W + tx);
        break;
      }
    }
  }
  return out;
}

/* -------------------------------------------------------------- registry */

const HYBRID_BUILD: Partial<BuilderOptions> = {
  towerKeys: ['arrow_spire', 'ballista', 'frost_obelisk', 'venom_spore', 'mortar', 'beacon_totem'],
  wallRatio: 0.25,
  maxStructures: 55,
  upgradeAfter: 12,
  rushWaves: false,
};

/**
 * The A3 control case: an ordinary hybrid build that never moves in Act II, so
 * the only variable against `hybrid` is movement itself.
 */
export class NoMovePolicy implements BotPolicy {
  readonly name = 'no-move';
  private inner = new BuilderPolicy('no-move', { ...HYBRID_BUILD, act2: 'none' });
  act(w: World): TickInput {
    const input = this.inner.act(w);
    if (w.phase === 'act2') {
      input.mx = 0;
      input.my = 0;
      input.dash = false;
    }
    return input;
  }
}

registerPolicy('no-move', () => new NoMovePolicy());

registerPolicy(
  'turtle',
  () =>
    new BuilderPolicy('turtle', {
      towerKeys: ['arrow_spire', 'frost_obelisk'],
      wallRatio: 0.55,
      maxStructures: 90,
      upgradeAfter: 20,
      act2: 'hold',
      rushWaves: false,
    }),
);

registerPolicy(
  'kite',
  () =>
    new BuilderPolicy('kite', {
      towerKeys: ['arrow_spire'],
      wallRatio: 0,
      maxStructures: 10,
      upgradeAfter: 4,
      act2: 'kite',
      rushWaves: true,
    }),
);

registerPolicy('hybrid', () => new BuilderPolicy('hybrid', { ...HYBRID_BUILD, act2: 'kite' }));

/**
 * SPEC A8's two arms. `maxbuild` invests everything into a wide, fully upgraded
 * Act I board; `rush` builds only enough to survive Act I and banks nothing.
 * Both kite identically in Act II, so the only variable is the Sundering
 * head start each earns.
 */
registerPolicy(
  'maxbuild',
  () =>
    new BuilderPolicy('maxbuild', {
      towerKeys: [
        'arrow_spire',
        'ballista',
        'venom_spore',
        'mortar',
        'tesla_coil',
        'frost_obelisk',
        'ember_brazier',
        'beacon_totem',
      ],
      wallRatio: 0.2,
      maxStructures: 46,
      upgradeAfter: 14,
      upgradeFirst: true,
      act2: 'kite',
      rushWaves: false,
    }),
);

registerPolicy(
  'rush',
  () =>
    new BuilderPolicy('rush', {
      towerKeys: ['arrow_spire'],
      wallRatio: 0.25,
      maxStructures: 36,
      upgradeAfter: 30,
      act2: 'kite',
      rushWaves: true,
    }),
);
