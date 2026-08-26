/**
 * Canvas renderer (SPEC 9.1). Reads sim state, never writes to it.
 * Everything here is presentation: no rule may live in this file.
 */

import {
  CORE_H,
  CORE_W,
  CORE_X,
  CORE_Y,
  GRID_H,
  GRID_W,
  TILE,
  TileType,
} from '../sim/grid';
import { dotRemaining } from '../sim/enemies';
import { BASE } from '../sim/stats';
import type { World } from '../sim/world';
import {
  checkBuild,
  effectiveTowerAoe,
  effectiveTowerMinRange,
  effectiveTowerRange,
  towerCost,
} from '../sim/towers';
import {
  ENEMY_COLORS,
  PALETTE,
  TERRAIN_COLORS,
  TOWER_COLORS,
  projectileStyle,
  type ProjectileStyle,
} from './theme';
import type { Settings } from '../ui/settings';
import {
  pickAt,
  sameSelection,
  selectedEnemy,
  selectedStructure,
  type Selection,
} from '../ui/selection';

export interface ViewState {
  /** Tower id the player currently has selected for building, 0 = none. */
  selectedTower: number;
  /** Mouse position in tile coordinates. */
  cursorX: number;
  cursorY: number;
  /** Screen shake amplitude in pixels (SPEC M8 feel pass). */
  shake: number;
  showRanges: boolean;
  /** SPEC-V3 T2: what the player has clicked. Presentation only. */
  selection: Selection;
  /** Presentation settings; never read by the sim. */
  settings: Settings;
}

/** A one-shot line effect for an attack that lands instantly (SPEC 3.3). */
export interface Tracer {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  style: ProjectileStyle;
  /** Zig-zags the line, for chain lightning. */
  jagged: boolean;
}

/** A cone of fire, drawn for the tick it was emitted plus a short fade. */
export interface ConeFlash {
  x: number;
  y: number;
  dx: number;
  dy: number;
  life: number;
  style: ProjectileStyle;
}

export interface FloatingNumber {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
}

/** Builds the short-lived line an instant-hit attack leaves behind. */
function tracer(
  e: { k: string; x: number; y: number; a: number; b: number },
  source: string,
  jagged: boolean,
): Tracer {
  return {
    x1: e.x,
    y1: e.y,
    x2: e.a,
    y2: e.b,
    life: jagged ? 0.1 : 0.07,
    style: projectileStyle(source),
    jagged,
  };
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private numbers: FloatingNumber[] = [];
  private flashes = new Map<number, number>();
  private telegraphs: { x: number; y: number; dx: number; dy: number }[] = [];
  private tracers: Tracer[] = [];
  private cones: ConeFlash[] = [];
  private shakeX = 0;
  private shakeY = 0;
  private rngPhase = 0;
  private dpr = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    this.resize();
  }

  /**
   * Sizes the backing store to the device pixel ratio. Without this the canvas
   * is authored at 1152x640 and then upscaled by the display, which is what
   * made the game look soft on a HiDPI screen. The CSS box stays in logical
   * pixels, so every draw call keeps working in tile space.
   */
  resize(dpr = globalThis.devicePixelRatio || 1): void {
    const ratio = Math.max(1, Math.min(3, dpr));
    if (this.dpr === ratio && this.canvas.width > 0) return;
    this.dpr = ratio;
    this.canvas.width = Math.round(GRID_W * TILE * ratio);
    this.canvas.height = Math.round(GRID_H * TILE * ratio);
    // Width only: CSS carries the aspect ratio, so a narrow window shrinks
    // the canvas without stretching it.
    this.canvas.style.width = `${GRID_W * TILE}px`;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  get width(): number {
    return GRID_W * TILE;
  }

  get height(): number {
    return GRID_H * TILE;
  }

  /** Drain this tick's sim events into presentation-only effects. */
  ingest(w: World, view: ViewState): void {
    for (const e of w.fx) {
      switch (e.k) {
        case 'hit':
          this.flashes.set(e.b, 0.12);
          if (e.a >= 1 && view.settings.damageNumbers && this.numbers.length < view.settings.maxDamageNumbers) {
            this.numbers.push({
              x: e.x,
              y: e.y,
              text: String(Math.round(e.a)),
              life: 0.6,
              color: '#ffd9a0',
            });
          }
          break;
        case 'wardenhit':
          view.shake = Math.max(view.shake, Math.min(9, 2 + e.a * 0.25));
          if (view.settings.damageNumbers) {
            this.numbers.push({ x: e.x, y: e.y, text: `-${Math.round(e.a)}`, life: 0.8, color: '#ff8080' });
          }
          break;
        case 'leak':
          view.shake = Math.max(view.shake, 6);
          break;
        case 'boom':
        case 'nova':
        case 'stomp':
          view.shake = Math.max(view.shake, 3);
          break;
        case 'levelup':
          this.numbers.push({ x: e.x, y: e.y, text: 'LEVEL UP', life: 1.2, color: '#9ff' });
          break;
        case 'sunder':
          view.shake = Math.max(view.shake, 14);
          break;
        case 'shot':
          this.tracers.push(tracer(e, w.huntsWarden ? 'arrow_volley' : 'arrow_spire', false));
          break;
        case 'manual':
          this.tracers.push(tracer(e, 'wardens_arrow', false));
          break;
        case 'arc':
          this.tracers.push(tracer(e, w.huntsWarden ? 'chain_lightning' : 'tesla_coil', true));
          break;
        case 'spit':
          this.tracers.push(tracer(e, 'spitter', false));
          break;
        case 'cone':
          this.cones.push({
            x: e.x,
            y: e.y,
            dx: e.a,
            dy: e.b,
            life: 0.1,
            style: projectileStyle(w.huntsWarden ? 'flame_cone' : 'ember_brazier'),
          });
          break;
        case 'bosstelegraph':
          this.telegraphs.push({ x: e.x, y: e.y, dx: e.a, dy: e.b });
          break;
        case 'bossphase':
        case 'bossslam':
          view.shake = Math.max(view.shake, 7);
          break;
        default:
          break;
      }
    }
  }

  update(dt: number, view: ViewState): void {
    this.rngPhase += dt;
    for (const n of this.numbers) {
      n.life -= dt;
      n.y -= dt * 1.2;
    }
    this.numbers = this.numbers.filter((n) => n.life > 0);
    for (const t of this.tracers) t.life -= dt;
    this.tracers = this.tracers.filter((t) => t.life > 0);
    for (const c of this.cones) c.life -= dt;
    this.cones = this.cones.filter((c) => c.life > 0);
    for (const [k, v] of [...this.flashes]) {
      const nv = v - dt;
      if (nv <= 0) this.flashes.delete(k);
      else this.flashes.set(k, nv);
    }
    view.shake = Math.max(0, view.shake - dt * 30);
    const shake = view.shake * view.settings.shake;
    if (shake > 0) {
      // Deterministic wobble; presentation only, so plain trig is fine here.
      this.shakeX = Math.sin(this.rngPhase * 61) * shake;
      this.shakeY = Math.cos(this.rngPhase * 47) * shake;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }
  }

  draw(w: World, view: ViewState): void {
    const ctx = this.ctx;
    const night = w.huntsWarden;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.translate(this.shakeX, this.shakeY);
    ctx.fillStyle = night ? PALETTE.bgNight : PALETTE.bgDay;
    ctx.fillRect(-20, -20, this.width + 40, this.height + 40);

    this.drawTiles(w, night);
    this.drawArenaFire(w);
    this.drawAreas(w);
    this.drawTelegraphs();
    this.drawStructures(w);
    this.drawGems(w);
    this.drawEnemies(w);
    this.drawProjectiles(w);
    this.drawTracers();
    this.drawWarden(w);
    this.drawHover(w, view);
    this.drawSelection(w, view);
    if (!night) this.drawRangeRings(w, view);
    if (!night) this.drawBuildGhost(w, view);
    this.drawNumbers();
    ctx.restore();
  }

  /* ------------------------------------------------------------- layers */

  private drawTiles(w: World, night: boolean): void {
    const ctx = this.ctx;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const t = w.grid.tile[w.grid.idx(x, y)];
        let color = (x + y) % 2 === 0 ? (night ? PALETTE.tileNight : PALETTE.tileDay) : PALETTE.tileAlt;
        if (night && (x + y) % 2 !== 0) color = '#1a2029';
        if (t === TileType.Border) color = PALETTE.border;
        else if (t === TileType.Gate) color = PALETTE.gate;
        ctx.fillStyle = color;
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }

    // Core / Heartstone.
    const cx = CORE_X * TILE;
    const cy = CORE_Y * TILE;
    const cw = CORE_W * TILE;
    const ch = CORE_H * TILE;
    if (night) {
      const g = ctx.createRadialGradient(cx + cw / 2, cy + ch / 2, 4, cx + cw / 2, cy + ch / 2, BASE.heartstoneRadius * TILE);
      g.addColorStop(0, '#7ae2c366');
      g.addColorStop(1, '#7ae2c300');
      ctx.fillStyle = g;
      ctx.fillRect(
        cx + cw / 2 - BASE.heartstoneRadius * TILE,
        cy + ch / 2 - BASE.heartstoneRadius * TILE,
        BASE.heartstoneRadius * TILE * 2,
        BASE.heartstoneRadius * TILE * 2,
      );
      ctx.fillStyle = PALETTE.heartstone;
    } else {
      ctx.fillStyle = PALETTE.core;
    }
    ctx.fillRect(cx + 3, cy + 3, cw - 6, ch - 6);
    if (!night) {
      const frac = Math.max(0, w.coreHp / w.coreMaxHp);
      ctx.fillStyle = PALETTE.hpBack;
      ctx.fillRect(cx, cy - 8, cw, 5);
      ctx.fillStyle = frac > 0.4 ? '#5fe08a' : PALETTE.hpFront;
      ctx.fillRect(cx, cy - 8, cw * frac, 5);
    }
  }

  /** SPEC 5.5 phase 3: everything outside the ring is burning. */
  private drawArenaFire(w: World): void {
    if (!w.arenaFireActive) return;
    const ctx = this.ctx;
    const cx = (GRID_W / 2) * TILE;
    const cy = (GRID_H / 2) * TILE;
    const r = w.arenaFireRadius * TILE;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, this.width, this.height);
    ctx.arc(cx, cy, r, 0, Math.PI * 2, true);
    ctx.fillStyle = '#ff4a1a33';
    ctx.fill();
    ctx.strokeStyle = '#ff7a3a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /** Boss charge telegraphs, drawn for the tick they were emitted. */
  private drawTelegraphs(): void {
    if (this.telegraphs.length === 0) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = '#ff335588';
    ctx.lineWidth = 2.2 * TILE;
    ctx.lineCap = 'round';
    for (const t of this.telegraphs) {
      ctx.beginPath();
      ctx.moveTo(t.x * TILE, t.y * TILE);
      ctx.lineTo((t.x + t.dx * 22) * TILE, (t.y + t.dy * 22) * TILE);
      ctx.stroke();
    }
    ctx.restore();
    this.telegraphs.length = 0;
  }

  private drawAreas(w: World): void {
    const ctx = this.ctx;
    for (const a of w.areas) {
      if (a.dead) continue;
      ctx.globalAlpha = Math.min(0.5, a.remaining * 0.25);
      ctx.fillStyle = a.type === 'poison' ? '#7ac74f' : a.type === 'enemyFire' ? '#ff6a3a' : '#ffaa55';
      ctx.beginPath();
      ctx.arc(a.x * TILE, a.y * TILE, a.radius * TILE, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawStructures(w: World): void {
    const ctx = this.ctx;
    for (const s of w.structures) {
      if (s.dead) continue;
      const def = w.content.towerById.get(s.towerId)!;
      const x = s.tx * TILE;
      const y = s.ty * TILE;
      const color = s.petrified
        ? (TERRAIN_COLORS[def.terrain.kind] ?? '#55585f')
        : (TOWER_COLORS[def.key] ?? '#888');
      ctx.fillStyle = color;
      ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
      ctx.strokeStyle = '#00000066';
      ctx.strokeRect(x + 2.5, y + 2.5, TILE - 5, TILE - 5);

      if (!s.petrified && s.tier > 1) {
        // SPEC-V3 §4 tracks run to eleven levels; a single row of pips at 5px
        // ran off the tile past level six, so they wrap inside it.
        ctx.fillStyle = '#ffffffcc';
        const perRow = Math.floor((TILE - 8) / 5);
        for (let i = 0; i < s.tier - 1; i++) {
          ctx.fillRect(x + 4 + (i % perRow) * 5, y + 4 + Math.floor(i / perRow) * 5, 3, 3);
        }
      }
      if (s.hp < s.maxHp) {
        const frac = Math.max(0, s.hp / s.maxHp);
        ctx.fillStyle = PALETTE.hpBack;
        ctx.fillRect(x + 3, y + TILE - 6, TILE - 6, 3);
        ctx.fillStyle = PALETTE.hpFront;
        ctx.fillRect(x + 3, y + TILE - 6, (TILE - 6) * frac, 3);
      }
      // Conductive spire beams.
      if (s.petrified && s.links.length > 0) {
        ctx.strokeStyle = '#b98cffaa';
        ctx.lineWidth = 2;
        for (const id of s.links) {
          if (id < s.id) continue;
          const o = w.structureById.get(id);
          if (!o || o.dead) continue;
          ctx.beginPath();
          ctx.moveTo(x + TILE / 2, y + TILE / 2);
          ctx.lineTo(o.tx * TILE + TILE / 2, o.ty * TILE + TILE / 2);
          ctx.stroke();
        }
        ctx.lineWidth = 1;
      }
    }
  }

  private drawEnemies(w: World): void {
    const ctx = this.ctx;
    for (const e of w.enemies) {
      if (e.dead) continue;
      const def = w.content.enemyById.get(e.defId)!;
      const px = e.x * TILE;
      const py = e.y * TILE;
      const r = Math.max(3, e.radius * TILE);
      const flash = this.flashes.get(e.id);
      ctx.fillStyle = flash ? '#ffffff' : (ENEMY_COLORS[def.key] ?? '#aaa');
      ctx.globalAlpha = e.ghosting ? 0.45 : 1;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      if (e.elite || e.boss) {
        ctx.strokeStyle = e.boss ? '#ff3355' : '#ffd166';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.lineWidth = 1;
      }
      // SPEC-V3 §3: frozen is a hard stop and reads as a solid rime shell;
      // frost and the generic slow share the thinner ring they always had.
      if (e.frozenRemaining > 0) {
        ctx.fillStyle = '#8fd8ff44';
        ctx.beginPath();
        ctx.arc(px, py, r + 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#cdefff';
        ctx.stroke();
      } else if (e.slowAmount > 0 || e.frostRemaining > 0) {
        ctx.strokeStyle = '#8fd8ffcc';
        ctx.beginPath();
        ctx.arc(px, py, r + 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (dotRemaining(e, 'burning') > 0) {
        ctx.fillStyle = '#ff883355';
        ctx.beginPath();
        ctx.arc(px, py - r, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      if (dotRemaining(e, 'bleeding') > 0) {
        ctx.fillStyle = '#cc224466';
        ctx.beginPath();
        ctx.arc(px - r, py - r, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (e.hp < e.maxHp && (e.elite || e.boss || r > 8)) {
        const frac = Math.max(0, e.hp / e.maxHp);
        ctx.fillStyle = PALETTE.hpBack;
        ctx.fillRect(px - r, py - r - 6, r * 2, 3);
        ctx.fillStyle = PALETTE.hpFront;
        ctx.fillRect(px - r, py - r - 6, r * 2 * frac, 3);
      }
    }
  }

  /**
   * Every projectile is drawn in its source's own shape and colour, so a
   * Ballista bolt, a mortar shell and a spore glob are told apart at a glance.
   */
  private drawProjectiles(w: World): void {
    const ctx = this.ctx;
    for (const p of w.projectiles) {
      if (p.dead) continue;
      const st = projectileStyle(p.source);
      const px = p.x * TILE;
      const py = p.y * TILE;
      const len = Math.hypot(p.vx, p.vy) || 1;
      const ux = p.vx / len;
      const uy = p.vy / len;

      if (st.trail > 0) {
        const tail = st.size * st.trail;
        const g = ctx.createLinearGradient(px, py, px - ux * tail, py - uy * tail);
        g.addColorStop(0, st.color);
        g.addColorStop(1, 'transparent');
        ctx.strokeStyle = g;
        ctx.lineWidth = Math.max(1.5, st.size * 0.6);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - ux * tail, py - uy * tail);
        ctx.stroke();
      }

      ctx.fillStyle = st.color;
      switch (st.shape) {
        case 'bolt': {
          // A long shaft with a bright head: reads as a ballista bolt.
          ctx.strokeStyle = st.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(px - ux * st.size, py - uy * st.size);
          ctx.lineTo(px + ux * st.size, py + uy * st.size);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(px + ux * st.size, py + uy * st.size, 2, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'shell': {
          // An arcing shell: a shadow on the ground and a body lifted above it,
          // highest at the start of its flight. Presentation only - the sim
          // shell travels flat.
          const remaining = Math.hypot(p.tx - p.x, p.ty - p.y);
          const lift = 4 + 10 * Math.max(0, Math.min(1, remaining / 6));
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = '#000000';
          ctx.beginPath();
          ctx.ellipse(px, py, st.size, st.size * 0.45, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.fillStyle = st.color;
          ctx.beginPath();
          ctx.arc(px, py - lift, st.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'glob': {
          ctx.beginPath();
          ctx.ellipse(px, py, st.size, st.size * 0.7, Math.atan2(uy, ux), 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'spark': {
          ctx.beginPath();
          ctx.moveTo(px + ux * st.size, py + uy * st.size);
          ctx.lineTo(px - uy * st.size * 0.6, py + ux * st.size * 0.6);
          ctx.lineTo(px - ux * st.size, py - uy * st.size);
          ctx.lineTo(px + uy * st.size * 0.6, py - ux * st.size * 0.6);
          ctx.closePath();
          ctx.fill();
          break;
        }
        case 'orb': {
          const g = ctx.createRadialGradient(px, py, 0, px, py, st.size * 2);
          g.addColorStop(0, st.color);
          g.addColorStop(1, 'transparent');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(px, py, st.size * 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = st.color;
          ctx.beginPath();
          ctx.arc(px, py, st.size * 0.6, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        default: {
          ctx.beginPath();
          ctx.arc(px, py, st.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  /**
   * Single-target shots, chain arcs and cones hit instantly, so there is no
   * projectile to follow. Without these the busiest towers looked inert.
   */
  private drawTracers(): void {
    const ctx = this.ctx;
    for (const t of this.tracers) {
      ctx.globalAlpha = Math.min(1, t.life * 10);
      ctx.strokeStyle = t.style.color;
      ctx.lineWidth = t.jagged ? 2 : 1.5;
      ctx.beginPath();
      ctx.moveTo(t.x1 * TILE, t.y1 * TILE);
      if (t.jagged) {
        // Three kinked segments read as an arc rather than a beam.
        const steps = 3;
        for (let i = 1; i <= steps; i++) {
          const f = i / steps;
          const nx = t.x1 + (t.x2 - t.x1) * f;
          const ny = t.y1 + (t.y2 - t.y1) * f;
          const off = i < steps ? (i % 2 === 0 ? 4 : -4) : 0;
          ctx.lineTo(nx * TILE + off, ny * TILE - off);
        }
      } else {
        ctx.lineTo(t.x2 * TILE, t.y2 * TILE);
      }
      ctx.stroke();
    }
    for (const c of this.cones) {
      const ang = Math.atan2(c.dy, c.dx);
      const half = 0.6;
      const r = 5 * TILE;
      const cx = c.x * TILE;
      const cy = c.y * TILE;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, c.style.color);
      g.addColorStop(1, 'transparent');
      ctx.globalAlpha = Math.min(0.6, c.life * 6);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, ang - half, ang + half);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawGems(w: World): void {
    const ctx = this.ctx;
    ctx.fillStyle = PALETTE.xp;
    for (const g of w.gems) {
      if (g.dead) continue;
      const s = g.value >= 25 ? 5 : g.value >= 8 ? 4 : 3;
      ctx.fillRect(g.x * TILE - s / 2, g.y * TILE - s / 2, s, s);
    }
  }

  private drawWarden(w: World): void {
    const ctx = this.ctx;
    const wd = w.warden;
    const px = wd.x * TILE;
    const py = wd.y * TILE;
    if (wd.dashIFrames > 0) {
      ctx.strokeStyle = '#ffffffaa';
      ctx.beginPath();
      ctx.arc(px, py, 14, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = PALETTE.warden;
    ctx.beginPath();
    ctx.arc(px, py, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.wardenOutline;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineWidth = 1;
    // Facing pip.
    ctx.fillStyle = '#000000aa';
    ctx.beginPath();
    ctx.arc(px + wd.fx * 6, py + wd.fy * 6, 2.5, 0, Math.PI * 2);
    ctx.fill();
    // Pickup radius hint in Act II.
    if (w.huntsWarden) {
      ctx.strokeStyle = '#7fd4ff22';
      ctx.beginPath();
      ctx.arc(px, py, w.derived.pickupRadius * TILE, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /**
   * SPEC-V3 T1. Two rings, both at the range the tower actually fires at:
   * every built tower when `showRanges` is on, and whichever tower the cursor
   * is over regardless. `showRanges` is toggled by R, a HUD button and a
   * Settings checkbox, and until now the renderer never read it — the toggle
   * had never drawn anything.
   */
  private drawRangeRings(w: World, view: ViewState): void {
    const ctx = this.ctx;
    const hx = Math.floor(view.cursorX);
    const hy = Math.floor(view.cursorY);
    // `Grid.idx` has no bounds check, so an off-board cursor wraps onto the
    // previous row. Harmless today — both wrap columns are border tiles — but
    // cheap to close.
    const hovered = w.grid.inBounds(hx, hy) ? w.structureAt(hx, hy) : null;
    for (const s of w.structures) {
      // `updateTowers` skips dead and petrified structures, so ringing them
      // would advertise a firing radius for a tower that cannot fire. At Dawn
      // every structure is petrified, which made this the whole board.
      if (s.dead || s.petrified) continue;
      const isHovered = hovered !== null && s.id === hovered.id;
      const isSelected = view.selection?.kind === 'tower' && view.selection.id === s.id;
      if (!view.showRanges && !isHovered && !isSelected) continue;
      const def = w.content.towerById.get(s.towerId);
      if (!def?.attack) continue;
      const range = effectiveTowerRange(w, def, s.tier);
      if (range <= 0) continue;
      const cx = (s.tx + 0.5) * TILE;
      const cy = (s.ty + 0.5) * TILE;
      ctx.strokeStyle = isHovered ? (TOWER_COLORS[def.key] ?? PALETTE.ghost) : PALETTE.ghost;
      ctx.lineWidth = isHovered ? 2 : 1;
      ctx.globalAlpha = isHovered ? 0.9 : 0.35;
      ctx.beginPath();
      ctx.arc(cx, cy, range * TILE, 0, Math.PI * 2);
      ctx.stroke();
      if (isHovered) {
        // A lob refuses everything inside `minRange`, so the outer ring alone
        // overstates its coverage by the whole dead zone in the middle.
        const min = effectiveTowerMinRange(w, def);
        if (min > 0) {
          ctx.globalAlpha = 0.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.arc(cx, cy, min * TILE, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        // Splash reads as coverage if drawn on the tower, so it is previewed
        // where the shell would land: under the cursor.
        const aoe = effectiveTowerAoe(w, def);
        if (aoe > 0) {
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          ctx.arc((hx + 0.5) * TILE, (hy + 0.5) * TILE, aoe * TILE, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
  }

  /**
   * SPEC-V3 T2: the selected thing gets a visible marker. Towers already get
   * a range ring from T1, so this adds the "you clicked this" halo that was
   * missing — the report was that clicking had no reaction at all.
   */
  /**
   * SPEC-V3 T2's "hover shows a light outline": a faint marker on whatever a
   * click would pick right now, so the board reads as interactive before you
   * commit to a click.
   */
  private drawHover(w: World, view: ViewState): void {
    if (view.selectedTower > 0) return; // placing a tower, not inspecting
    const hovered = pickAt(w, view.cursorX, view.cursorY);
    if (!hovered || sameSelection(hovered, view.selection)) return;
    const at = selectionAnchor(w, hovered);
    if (!at) return;
    const ctx = this.ctx;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(at.x, at.y, at.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawSelection(w: World, view: ViewState): void {
    const at = selectionAnchor(w, view.selection);
    if (!at) return;
    const ctx = this.ctx;
    const { x, y, r } = at;

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff55';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawBuildGhost(w: World, view: ViewState): void {
    if (view.selectedTower <= 0) return;
    const ctx = this.ctx;
    const tx = Math.floor(view.cursorX);
    const ty = Math.floor(view.cursorY);
    if (!w.grid.inBounds(tx, ty)) return;
    const reason = checkBuild(w, view.selectedTower, tx, ty);
    ctx.fillStyle = reason === null ? PALETTE.ghostGood : PALETTE.ghostBad;
    ctx.fillRect(tx * TILE + 2, ty * TILE + 2, TILE - 4, TILE - 4);

    const def = w.content.towerById.get(view.selectedTower);
    if (def?.attack) {
      // The range it would fire at once placed — tier 1, but with the
      // Constellation's tower-range bonus applied. This used to draw the raw
      // authored `def.attack.range`, which lied whenever that bonus was live.
      const cx = tx * TILE + TILE / 2;
      const cy = ty * TILE + TILE / 2;
      ctx.strokeStyle = '#ffffff66';
      ctx.beginPath();
      ctx.arc(cx, cy, effectiveTowerRange(w, def) * TILE, 0, Math.PI * 2);
      ctx.stroke();
      const aoe = effectiveTowerAoe(w, def);
      if (aoe > 0) {
        ctx.strokeStyle = '#ffd16688';
        ctx.beginPath();
        ctx.arc(cx, cy, aoe * TILE, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // Build-range ring around the Warden.
    ctx.strokeStyle = '#ffffff33';
    ctx.beginPath();
    ctx.arc(w.warden.x * TILE, w.warden.y * TILE, w.derived.buildRange * TILE, 0, Math.PI * 2);
    ctx.stroke();

    if (def) {
      ctx.fillStyle = PALETTE.text;
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(`${def.name}  ${towerCost(w, def)}g`, tx * TILE + TILE + 4, ty * TILE + 12);
    }
  }

  private drawNumbers(): void {
    const ctx = this.ctx;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const n of this.numbers) {
      ctx.globalAlpha = Math.min(1, n.life * 2);
      ctx.fillStyle = n.color;
      ctx.fillText(n.text, n.x * TILE, n.y * TILE);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }
}

/**
 * Where a selection's marker goes, and how big. Shared by the hover outline and
 * the selection highlight so the two cannot disagree about what a click is
 * pointing at — the Warden's halo used to be drawn well inside its own grab
 * radius, which made the hit area feel arbitrary.
 */
function selectionAnchor(
  w: World,
  sel: Selection,
): { x: number; y: number; r: number } | null {
  if (!sel) return null;
  if (sel.kind === 'warden') {
    return { x: w.warden.x * TILE, y: w.warden.y * TILE, r: 12 };
  }
  if (sel.kind === 'core') {
    return {
      x: (CORE_X + CORE_W / 2) * TILE,
      y: (CORE_Y + CORE_H / 2) * TILE,
      r: Math.max(CORE_W, CORE_H) * TILE * 0.8,
    };
  }
  if (sel.kind === 'enemy') {
    const e = selectedEnemy(w, sel);
    return e ? { x: e.x * TILE, y: e.y * TILE, r: e.radius * TILE + 4 } : null;
  }
  const s = selectedStructure(w, sel);
  return s ? { x: (s.tx + 0.5) * TILE, y: (s.ty + 0.5) * TILE, r: TILE * 0.7 } : null;
}
