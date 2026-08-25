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
import { BASE } from '../sim/stats';
import type { World } from '../sim/world';
import { checkBuild, towerCost } from '../sim/towers';
import { ENEMY_COLORS, PALETTE, TERRAIN_COLORS, TOWER_COLORS } from './theme';

export interface ViewState {
  /** Tower id the player currently has selected for building, 0 = none. */
  selectedTower: number;
  /** Mouse position in tile coordinates. */
  cursorX: number;
  cursorY: number;
  /** Screen shake amplitude in pixels (SPEC M8 feel pass). */
  shake: number;
  showRanges: boolean;
}

export interface FloatingNumber {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private numbers: FloatingNumber[] = [];
  private flashes = new Map<number, number>();
  private shakeX = 0;
  private shakeY = 0;
  private rngPhase = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    canvas.width = GRID_W * TILE;
    canvas.height = GRID_H * TILE;
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
          if (e.a >= 1) {
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
          this.numbers.push({ x: e.x, y: e.y, text: `-${Math.round(e.a)}`, life: 0.8, color: '#ff8080' });
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
    for (const [k, v] of [...this.flashes]) {
      const nv = v - dt;
      if (nv <= 0) this.flashes.delete(k);
      else this.flashes.set(k, nv);
    }
    view.shake = Math.max(0, view.shake - dt * 30);
    if (view.shake > 0) {
      // Deterministic wobble; presentation only, so plain trig is fine here.
      this.shakeX = Math.sin(this.rngPhase * 61) * view.shake;
      this.shakeY = Math.cos(this.rngPhase * 47) * view.shake;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }
  }

  draw(w: World, view: ViewState): void {
    const ctx = this.ctx;
    const night = w.sundered;
    ctx.save();
    ctx.translate(this.shakeX, this.shakeY);
    ctx.fillStyle = night ? PALETTE.bgNight : PALETTE.bgDay;
    ctx.fillRect(-20, -20, this.width + 40, this.height + 40);

    this.drawTiles(w, night);
    this.drawAreas(w);
    this.drawStructures(w);
    this.drawGems(w);
    this.drawEnemies(w);
    this.drawProjectiles(w);
    this.drawWarden(w);
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
        ctx.fillStyle = '#ffffffcc';
        for (let i = 0; i < s.tier - 1; i++) ctx.fillRect(x + 4 + i * 5, y + 4, 3, 3);
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
      if (e.slowAmount > 0) {
        ctx.strokeStyle = '#8fd8ffcc';
        ctx.beginPath();
        ctx.arc(px, py, r + 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (e.burnRemaining > 0) {
        ctx.fillStyle = '#ff883355';
        ctx.beginPath();
        ctx.arc(px, py - r, 3, 0, Math.PI * 2);
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

  private drawProjectiles(w: World): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#ffe9a8';
    for (const p of w.projectiles) {
      if (p.dead) continue;
      ctx.beginPath();
      ctx.arc(p.x * TILE, p.y * TILE, p.aoe > 0 ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
    }
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
    if (w.sundered) {
      ctx.strokeStyle = '#7fd4ff22';
      ctx.beginPath();
      ctx.arc(px, py, w.derived.pickupRadius * TILE, 0, Math.PI * 2);
      ctx.stroke();
    }
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
      ctx.strokeStyle = '#ffffff44';
      ctx.beginPath();
      ctx.arc(tx * TILE + TILE / 2, ty * TILE + TILE / 2, def.attack.range * TILE, 0, Math.PI * 2);
      ctx.stroke();
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
