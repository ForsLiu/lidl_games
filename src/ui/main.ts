/**
 * Browser entry point. Owns the wall-clock loop and the input mapping, and
 * feeds the sim exactly one TickInput per fixed 60 Hz step.
 *
 * The sim never sees wall-clock time: we accumulate real elapsed time and
 * advance whole ticks, so a laggy frame replays identically to a smooth one.
 */

import './style.css';

import { Run } from '../sim/run';
import { FIXED_DT, type Command, type MetaState, type RunConfig, type TickInput } from '../sim/types';
import { bindCanvasInput, gatherInput, makeKeyDownHandler } from './input';
import { Renderer, type ViewState } from '../render/canvas';
import { Hud } from './hud';
import { Hub } from './hub';
import { applyRunResult, defaultMeta, loadMeta, saveMeta } from '../meta/meta';
import { loadSettings, saveSettings, type Settings } from './settings';
import { Sfx } from '../render/sfx';

const MAX_CATCHUP_TICKS = 8;

class Game {
  private root!: HTMLElement;
  private run: Run | null = null;
  private renderer!: Renderer;
  private hud!: Hud;
  private settings: Settings = loadSettings();
  private sfx = new Sfx();
  private view: ViewState = {
    selectedTower: 0,
    cursorX: 0,
    cursorY: 0,
    shake: 0,
    showRanges: false,
    settings: this.settings,
  };
  private keys = new Set<string>();
  private pending: Command[] = [];
  private dashQueued = false;
  private acc = 0;
  private last = 0;
  private meta: MetaState = defaultMeta();
  private resultBanked = false;
  private inputBound = false;
  private paused = false;

  start(rootEl: HTMLElement): void {
    this.root = rootEl;
    this.meta = loadMeta();
    this.view.settings = this.settings;
    this.view.showRanges = this.settings.showRanges;
    this.showHub();
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  private showHub(): void {
    this.run = null;
    this.paused = false;
    const seed = (Math.random() * 0xffffffff) >>> 0;
    const hub = new Hub(this.root, this.meta, seed, {
      settings: this.settings,
      onSettingsChanged: (s) => {
        this.settings = s;
        this.view.settings = s;
        this.view.showRanges = s.showRanges;
        saveSettings(s);
      },
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
      onResume: () => this.setPaused(false),
      onQuitToHub: () => this.showHub(),
    });
    this.renderer = new Renderer(this.hud.canvas);
    if (!this.inputBound) {
      this.bindGlobalInput();
      this.inputBound = true;
    }
    this.bindCanvasInput();
    this.run = new Run(cfg);
    this.resultBanked = false;
    this.paused = false;
    this.hud.buildTowerBar(this.run.world);
    this.hud.resetModalKey();
    this.view.selectedTower = 0;
    this.pending = [];
    this.acc = 0;
  }

  /** Esc toggles pause; a finished run cannot be paused. */
  private togglePause(): void {
    if (!this.run || this.run.world.outcome !== 'running') return;
    this.setPaused(!this.paused);
  }

  private setPaused(paused: boolean): void {
    if (!this.run) return;
    this.paused = paused;
    // Movement keys held when pausing must not carry through to the resume.
    if (paused) this.keys.clear();
    this.hud.setPaused(paused, this.run.world);
  }

  private bindGlobalInput(): void {
    const onKeyDown = makeKeyDownHandler({
      keys: this.keys,
      queue: { push: (cmd) => this.pending.push(cmd) },
      onAnyKey: () => this.sfx.resume(),
      togglePause: () => this.togglePause(),
      toggleRanges: () => (this.view.showRanges = !this.view.showRanges),
      clearSelection: () => this.hud.clearSelection(),
      isChoosing: () => this.run?.world.phase === 'levelup',
      pickOffer: (i) => this.pending.push({ k: 'pick', index: i }),
      selectTowerByIndex: (i) => {
        if (this.run) this.hud.selectByIndex(this.run.world, i);
      },
    });
    window.addEventListener('keydown', (e) => {
      if (!this.run) return;
      if (e.key === ' ' && !this.paused) this.dashQueued = true;
      onKeyDown(e);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private bindCanvasInput(): void {
    bindCanvasInput({
      canvas: this.hud.canvas,
      view: this.view,
      keys: this.keys,
      queue: { push: (cmd) => this.pending.push(cmd) },
      isBlocked: () => this.paused || this.hud.modalOpen,
    });
  }

  private gatherInput(): TickInput {
    const input = gatherInput(
      this.keys,
      this.pending,
      this.view.cursorX,
      this.view.cursorY,
      this.dashQueued,
    );
    this.dashQueued = false;
    this.pending = [];
    return input;
  }

  private frame = (now: number): void => {
    const dtReal = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    this.sfx.tick(dtReal);
    const run = this.run;
    if (!run) {
      requestAnimationFrame(this.frame);
      return;
    }
    // Paused: keep rendering the frozen frame, but step nothing. The sim never
    // sees wall-clock time, so a paused run resumes bit-identically.
    if (this.paused) {
      this.renderer.update(dtReal, this.view);
      this.renderer.draw(run.world, this.view);
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
      this.sfx.emit(run.world.fx, this.settings);
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
