/**
 * Browser entry point. Owns the wall-clock loop and the input mapping, and
 * feeds the sim exactly one TickInput per fixed 60 Hz step.
 *
 * The sim never sees wall-clock time: the Pacer accumulates real elapsed time
 * and advances whole ticks, so a laggy frame - and a fast-forwarded one -
 * replays identically to a smooth 1x frame.
 */

import './style.css';

import { Run } from '../sim/run';
import type { Command, MetaState, RunConfig, TickInput } from '../sim/types';
import { bindCanvasInput, gatherInput, makeKeyDownHandler } from './input';
import { Renderer, type ViewState } from '../render/canvas';
import { Hud } from './hud';
import { Hub } from './hub';
import { applyRunResult, defaultMeta, loadMeta, saveMeta } from '../meta/meta';
import { devProfileActive, startupProfile } from '../meta/devprofile';
import { loadSettings, saveSettings, type Settings } from './settings';
import { Sfx } from '../render/sfx';
import { Pacer } from './pacer';

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
  private pacer = new Pacer();
  private last = 0;
  private meta: MetaState = defaultMeta();
  private resultBanked = false;
  private inputBound = false;
  private paused = false;
  private lastCfg: RunConfig | null = null;

  start(rootEl: HTMLElement): void {
    this.root = rootEl;
    this.meta = loadMeta();
    // SPEC-V3 T3: a development build starts with everything open, unless the
    // player has asked for a clean profile. A production build never gets here
    // with `devProfileActive()` true (gate C8).
    //
    // Applied in memory and deliberately never saved. Saving it would burn the
    // unlocks into the player's real account, which would inflate a returning
    // developer's progress irreversibly and leave the "clean profile" setting
    // with nothing to clean.
    this.meta = startupProfile(this.meta, {
      devActive: devProfileActive(),
      cleanProfile: this.settings.cleanProfile,
    }).meta;
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
    this.lastCfg = cfg;
    this.hud = new Hud(this.root, {
      onSelectTower: (id) => (this.view.selectedTower = id),
      onCallWave: () => this.pending.push({ k: 'call' }),
      onPickSouls: (keys) => this.pending.push({ k: 'souls', keys }),
      onPickOffer: (index) => this.pending.push({ k: 'pick', index }),
      onReroll: () => this.pending.push({ k: 'reroll' }),
      onRekindle: (structureId) => this.pending.push({ k: 'rekindle', structureId }),
      onDawnDone: () => this.pending.push({ k: 'dawn_done' }),
      onRetry: () => this.startRun(this.lastCfg!),
      onNewRun: () => {
        const seed = (Math.random() * 0xffffffff) >>> 0;
        this.startRun({ ...this.lastCfg!, seed });
      },
      onToggleRanges: () => (this.view.showRanges = !this.view.showRanges),
      onResume: () => this.setPaused(false),
      onPause: () => this.setPaused(true),
      onCycleSpeed: () => this.hud.setSpeed(this.pacer.cycle()),
      onDev: (op, amount) => this.pending.push({ k: 'dev', op, amount }),
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
    this.hud.showPracticeTools(cfg.practice === true);
    this.hud.resetModalKey();
    this.view.selectedTower = 0;
    this.pending = [];
    this.pacer.reset();
    this.hud.setSpeed(this.pacer.speed);
  }

  /** Esc toggles pause; a finished run cannot be paused. */
  private togglePause(): void {
    if (!this.run || this.run.world.outcome !== 'running') return;
    this.setPaused(!this.paused);
  }

  private setPaused(paused: boolean): void {
    if (!this.run) return;
    this.paused = paused;
    // Movement keys held when pausing must not carry through to the resume, and
    // the time banked while frozen must not surge the sim on the first frame.
    if (paused) this.keys.clear();
    else this.pacer.clearBacklog();
    this.hud.setPaused(paused, this.run.world);
  }

  private bindGlobalInput(): void {
    const onKeyDown = makeKeyDownHandler({
      keys: this.keys,
      queue: { push: (cmd) => this.pending.push(cmd) },
      onAnyKey: () => this.sfx.resume(),
      togglePause: () => this.togglePause(),
      cycleSpeed: () => this.hud.setSpeed(this.pacer.cycle()),
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
    // Fast-forward runs more fixed ticks per frame, never a longer tick, so
    // the run stays bit-identical to the same run played at 1x. A defeat's
    // slow-mo beat (SPEC-V2 D1) works the same way: fewer ticks per frame,
    // not a longer one, so it never touches determinism.
    const ticks = this.pacer.plan(run.world.dying ? dtReal * 0.5 : dtReal);
    for (let i = 0; i < ticks; i++) {
      run.step(this.gatherInput());
      this.renderer.ingest(run.world, this.view);
      this.sfx.emit(run.world.fx, this.settings);
    }

    const w = run.world;
    this.renderer.update(dtReal, this.view);
    this.renderer.draw(w, this.view);
    this.hud.update(w, { x: this.view.cursorX, y: this.view.cursorY });

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
