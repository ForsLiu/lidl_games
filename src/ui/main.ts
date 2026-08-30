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
import { bindCanvasInput, clearKeysForPause, gatherInput, makeKeyDownHandler } from './input';
import { makeSelectHandler, sweepSelection } from './selection';
import { Renderer, type ViewState } from '../render/canvas';
import { Hud } from './hud';
import { Hub } from './hub';
import { applyRunResult, defaultMeta, loadMetaWithNotice, saveMeta } from '../meta/meta';
import { devProfileActive, startupProfile } from '../meta/devprofile';
import { loadSettings, saveSettings, type Settings } from './settings';
import { Sfx } from '../render/sfx';
import { Pacer } from './pacer';
import { installAuditHook, type AuditBridge } from './audit-hook';

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
    selection: null,
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
  /**
   * p9a: reused verbatim across Retry, and spread-with-a-new-seed across New
   * Run — both carry forward whatever `contentHash` `World`'s constructor
   * stamped onto it from the first run. Harmless today (nothing edits loaded
   * `/data` at runtime), but p9c's Tuner will make that possible; a Retry
   * after a live Tuner edit would then throw a content-hash mismatch instead
   * of just replaying against the new numbers — p9c's own concern to resolve.
   */
  private lastCfg: RunConfig | null = null;
  /** fb023: a one-time save-migration notice, consumed by the first `showHub()` call after `start()`. */
  private pendingHubNotice: string | null = null;

  start(rootEl: HTMLElement): void {
    this.root = rootEl;
    const loaded = loadMetaWithNotice();
    this.meta = loaded.meta;
    this.pendingHubNotice = loaded.notice;
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
    // fb018: dev-only UI self-audit bridge (`window.__stonewakeAudit`). A
    // no-op in a production build — `installAuditHook` re-checks
    // `isDevBuild()` itself, the same gate `devProfileActive()` above uses.
    this.installAuditHook();
    this.showHub();
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  /** fb018: wires `src/ui/audit-hook.ts` to this instance's private state. */
  private installAuditHook(): void {
    const bridge: AuditBridge = {
      world: () => this.run?.world ?? null,
      showHub: () => this.showHub(),
      startRun: (cfg) => this.startRun(cfg),
      pushCommand: (cmd) => this.pending.push(cmd),
      setSelection: (sel) => {
        this.view.selection = sel;
      },
      toggleCharacterPanel: () => {
        if (this.run) this.hud.toggleCharacterPanel(this.run.world);
      },
      toggleDpsPanel: () => {
        if (this.run) this.hud.toggleDpsPanel(this.run.world);
      },
    };
    installAuditHook(bridge);
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
    }, this.pendingHubNotice ?? undefined);
    this.pendingHubNotice = null;
    hub.show();
  }

  private startRun(cfg: RunConfig): void {
    this.root.innerHTML = '';
    this.lastCfg = cfg;
    this.hud = new Hud(this.root, {
      onSelectTower: (id) => (this.view.selectedTower = id),
      onCallWave: () => this.pending.push({ k: 'call' }),
      onPickOffer: (index) => this.pending.push({ k: 'pick', index }),
      onReroll: () => this.pending.push({ k: 'reroll' }),
      onRetry: () => this.startRun(this.lastCfg!),
      onNewRun: () => {
        const seed = (Math.random() * 0xffffffff) >>> 0;
        this.startRun({ ...this.lastCfg!, seed });
      },
      onToggleRanges: () => this.setShowRanges(!this.view.showRanges),
      onToggleAutoPick: () => {
        const on = !this.run!.world.cfg.autoPickLevelUps;
        this.pending.push({ k: 'set_autopick', on });
        // fb012: the profile remembers the last-chosen value, so the next run
        // (from any of the three doors onto this toggle) starts with it.
        this.meta = { ...this.meta, autoPickLevelUps: on };
        saveMeta(this.meta);
      },
      onEquipItem: (slot, item) => this.pending.push({ k: 'equip_item', slot, item }),
      onToggleCharacterPanel: () => this.hud.toggleCharacterPanel(this.run!.world),
      onToggleDpsPanel: () => this.hud.toggleDpsPanel(this.run!.world),
      onResume: () => this.setPaused(false),
      onPause: () => this.setPaused(true),
      onCycleSpeed: () => this.hud.setSpeed(this.pacer.cycle()),
      onDev: (op, amount, enemyKey) => this.pending.push({ k: 'dev', op, amount, enemyKey }),
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
    this.hud.showPracticeTools(cfg.practice === true, this.run.world);
    this.hud.resetModalKey();
    this.hud.closeCharacterPanel();
    this.hud.closeDpsPanel();
    this.view.selectedTower = 0;
    this.view.selection = null;
    this.pending = [];
    this.pacer.reset();
    this.hud.setSpeed(this.pacer.speed);
    this.hud.setShowRanges(this.view.showRanges);
  }

  /**
   * One place that owns the range toggle. R, the HUD button and the Settings
   * checkbox are three doors onto the same setting, and until T1 the first two
   * wrote only to the view — so the toggle never survived a run and ticking
   * anything in Settings silently reverted it.
   */
  private setShowRanges(on: boolean): void {
    this.view.showRanges = on;
    this.settings = { ...this.settings, showRanges: on };
    this.view.settings = this.settings;
    saveSettings(this.settings);
    this.hud?.setShowRanges(on);
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
    // `q` is the one exception `clearKeysForPause` preserves — see its own doc.
    if (paused) clearKeysForPause(this.keys);
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
      toggleRanges: () => this.setShowRanges(!this.view.showRanges),
      toggleCharacterPanel: () => {
        if (this.run) this.hud.toggleCharacterPanel(this.run.world);
      },
      toggleDpsPanel: () => {
        if (this.run) this.hud.toggleDpsPanel(this.run.world);
      },
      clearSelection: () => {
        this.hud.clearSelection();
        // `0` clears both selections; deselecting used to need bare ground.
        this.view.selection = null;
      },
      isChoosing: () => this.run?.world.phase === 'levelup',
      aim: () => ({ x: this.view.cursorX, y: this.view.cursorY }),
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
      // The handler lives in `selection.ts` so the tests drive the shipped
      // code rather than a copy of it.
      onSelect: makeSelectHandler(this.view, () => this.run?.world ?? null),
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
      this.hud.ingestFx(run.world.fx);
    }

    const w = run.world;
    // Enemies die and towers are sold; a stale selection would keep drawing a
    // highlight over empty ground.
    sweepSelection(this.view, w);
    this.renderer.update(dtReal, this.view);
    this.renderer.draw(w, this.view);
    this.hud.update(w, { x: this.view.cursorX, y: this.view.cursorY }, this.view.selection);

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
