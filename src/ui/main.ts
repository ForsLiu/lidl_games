/**
 * Browser entry point. Owns the wall-clock loop and the input mapping, and
 * feeds the sim exactly one TickInput per fixed 60 Hz step.
 *
 * The sim never sees wall-clock time: we accumulate real elapsed time and
 * advance whole ticks, so a laggy frame replays identically to a smooth one.
 */

import './style.css';

import { Run } from '../sim/run';
import { FIXED_DT, emptyInput, type Command, type MetaState, type RunConfig, type TickInput } from '../sim/types';
import { TILE } from '../sim/grid';
import { Renderer, type ViewState } from '../render/canvas';
import { Hud } from './hud';
import { Hub } from './hub';
import { applyRunResult, defaultMeta, loadMeta, saveMeta } from '../meta/meta';

const MAX_CATCHUP_TICKS = 8;

class Game {
  private root!: HTMLElement;
  private run: Run | null = null;
  private renderer!: Renderer;
  private hud!: Hud;
  private view: ViewState = { selectedTower: 0, cursorX: 0, cursorY: 0, shake: 0, showRanges: false };
  private keys = new Set<string>();
  private pending: Command[] = [];
  private dashQueued = false;
  private acc = 0;
  private last = 0;
  private meta: MetaState = defaultMeta();
  private resultBanked = false;
  private inputBound = false;

  start(rootEl: HTMLElement): void {
    this.root = rootEl;
    this.meta = loadMeta();
    this.showHub();
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  private showHub(): void {
    this.run = null;
    const seed = (Math.random() * 0xffffffff) >>> 0;
    const hub = new Hub(this.root, this.meta, seed, {
      onStart: (cfg) => this.startRun(cfg),
      onMetaChanged: (meta) => {
        this.meta = meta;
        saveMeta(meta);
      },
    });
    hub.show();
  }

  private startRun(cfg: RunConfig): void {
    this.root.innerHTML = '';
    this.hud = new Hud(this.root, {
      onSelectTower: (id) => (this.view.selectedTower = id),
      onCallWave: () => this.pending.push({ k: 'call' }),
      onPickSouls: (keys) => this.pending.push({ k: 'souls', keys }),
      onPickOffer: (index) => this.pending.push({ k: 'pick', index }),
      onReroll: () => this.pending.push({ k: 'reroll' }),
      onRestart: () => this.showHub(),
      onToggleRanges: () => (this.view.showRanges = !this.view.showRanges),
    });
    this.renderer = new Renderer(this.hud.canvas);
    if (!this.inputBound) {
      this.bindGlobalInput();
      this.inputBound = true;
    }
    this.bindCanvasInput();
    this.run = new Run(cfg);
    this.resultBanked = false;
    this.hud.buildTowerBar(this.run.world);
    this.hud.resetModalKey();
    this.view.selectedTower = 0;
    this.pending = [];
    this.acc = 0;
  }

  private bindGlobalInput(): void {
    window.addEventListener('keydown', (e) => {
      if (e.repeat || !this.run) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === ' ') {
        this.dashQueued = true;
        e.preventDefault();
      }
      if (k === 'enter') this.pending.push({ k: 'call' });
      if (k === 'r') this.view.showRanges = !this.view.showRanges;
      if (k === '0') this.hud.clearSelection();
      if (this.run.world.phase === 'levelup' && k >= '1' && k <= '3') {
        this.pending.push({ k: 'pick', index: Number(k) - 1 });
      } else if (k >= '1' && k <= '9') {
        this.hud.selectByIndex(this.run.world, Number(k) - 1);
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private bindCanvasInput(): void {
    const canvas = this.hud.canvas;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.view.cursorX = (((e.clientX - r.left) / r.width) * canvas.width) / TILE;
      this.view.cursorY = (((e.clientY - r.top) / r.height) * canvas.height) / TILE;
    });
    canvas.addEventListener('mousedown', (e) => {
      const tx = Math.floor(this.view.cursorX);
      const ty = Math.floor(this.view.cursorY);
      if (e.button === 2) {
        this.pending.push({ k: 'sell', tx, ty });
      } else if (this.keys.has('u') || e.shiftKey) {
        this.pending.push({ k: 'upgrade', tx, ty });
      } else if (this.view.selectedTower > 0) {
        this.pending.push({ k: 'build', tower: this.view.selectedTower, tx, ty });
      }
    });
  }

  private gatherInput(): TickInput {
    const input = emptyInput();
    const k = this.keys;
    if (k.has('a') || k.has('arrowleft')) input.mx -= 1;
    if (k.has('d') || k.has('arrowright')) input.mx += 1;
    if (k.has('w') || k.has('arrowup')) input.my -= 1;
    if (k.has('s') || k.has('arrowdown')) input.my += 1;
    input.dash = this.dashQueued;
    this.dashQueued = false;
    input.attack = true;
    input.aimX = this.view.cursorX;
    input.aimY = this.view.cursorY;
    input.cmds = this.pending;
    this.pending = [];
    return input;
  }

  private frame = (now: number): void => {
    const dtReal = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    const run = this.run;
    if (!run) {
      requestAnimationFrame(this.frame);
      return;
    }
    this.acc += dtReal;

    let ticks = 0;
    while (this.acc >= FIXED_DT && ticks < MAX_CATCHUP_TICKS) {
      this.acc -= FIXED_DT;
      ticks++;
      run.step(this.gatherInput());
      this.renderer.ingest(run.world, this.view);
    }
    if (ticks === MAX_CATCHUP_TICKS) this.acc = 0;

    const w = run.world;
    this.renderer.update(dtReal, this.view);
    this.renderer.draw(w, this.view);
    this.hud.update(w);

    if (w.outcome !== 'running' && !this.resultBanked) {
      this.resultBanked = true;
      this.meta = applyRunResult(this.meta, run.report(), w);
      saveMeta(this.meta);
    }
    this.hud.syncModal(w);

    requestAnimationFrame(this.frame);
  };
}

const root = document.getElementById('app');
if (root) new Game().start(root);
