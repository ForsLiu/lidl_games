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
import { contentHash, loadContent } from '../sim/content';
import { emptyInput, type Command, type MetaState, type RunConfig, type TickInput } from '../sim/types';
import { bindCanvasInput, clearKeysForPause, gatherInput, makeKeyDownHandler } from './input';
import { clearPersistedRun, loadPersistedRun, savePersistedRun } from './runpersist';
import { makeSelectHandler, selectedStructure, sweepSelection } from './selection';
import { Renderer, type ViewState } from '../render/canvas';
import { Hud } from './hud';
import { Hub } from './hub';
import { applyRunResult, defaultMeta, loadMetaWithNotice, saveMeta } from '../meta/meta';
import { devProfileActive, startupProfile } from '../meta/devprofile';
import { loadSettings, saveSettings, type Settings } from './settings';
import { loadKeyBindings, saveKeyBindings, type KeyBindings } from './keybindings';
import { Sfx } from '../render/sfx';
import { Pacer } from './pacer';
import { installAuditHook, type AuditBridge } from './audit-hook';

export class Game {
  private root!: HTMLElement;
  private run: Run | null = null;
  private renderer!: Renderer;
  private hud!: Hud;
  private settings: Settings = loadSettings();
  private keyBindings: KeyBindings = loadKeyBindings();
  private sfx = new Sfx();
  private view: ViewState = {
    selectedTower: 0,
    cursorX: 0,
    cursorY: 0,
    shake: 0,
    showRanges: false,
    selection: null,
    settings: this.settings,
    hoveredSkill: null,
    hoveredWieldedTower: null,
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
  /**
   * fb074: every `TickInput` this run has stepped with, in order — the "input
   * log" half of the seed+input-log reproducibility architecture rule 2
   * already requires, kept live so a refresh mid-run can persist and later
   * replay it. Reset to empty on a fresh `startRun`; pre-seeded from a
   * successful resume.
   */
  private inputLog: TickInput[] = [];
  /** fb074: `inputLog.length` as of the last `persistRun()` call, so the throttle survives a multi-tick fast-forward frame jumping past an exact multiple of 60. */
  private lastPersistedLen = 0;
  /**
   * fb074 (code-reviewer finding): a random id generated once per `beginRun`
   * call (fresh or resumed alike), stamped onto every `savePersistedRun`
   * write for this run. Two tabs/windows sharing the one browser-profile-wide
   * `runpersist.ts` localStorage key otherwise either fight over it forever
   * (each blindly overwriting the other's progress every throttle window) or
   * a tab that never started a run of its own wipes another tab's active
   * checkpoint the moment it reaches its own Hub. `null` whenever this
   * instance owns no run-in-progress slot.
   */
  private runSessionId: string | null = null;
  /** fb074: the `sessionId` this instance itself last *successfully* wrote — not necessarily `runSessionId` if a write ever failed. `null` until the first successful persist of the current run. */
  private lastWrittenSessionId: string | null = null;
  /**
   * fb074 (code-reviewer finding): once a persist attempt fails (localStorage
   * quota exceeded or unavailable), the input log this session would keep
   * trying to write only ever grows — retrying every throttle window would
   * just re-fail forever at rising cost. Stops retrying for the rest of this
   * run; reset on the next `beginRun`. A known, accepted limitation for a
   * session long/eventful enough to fill the quota: resume-on-refresh simply
   * stops holding past that point, same tradeoff class as fb067/fb068/fb069's
   * own documented ones. fb087: this lapses well within a *normal* run's
   * length, not just an unusually long one (measured: a full T1 victory run
   * crosses the quota ~38% in), so `persistRun()` now fires a one-time
   * `hud.say()` toast the moment this first flips true, rather than lapsing
   * with zero in-game signal.
   */
  private persistDisabled = false;

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
    if (!this.tryResumePersistedRun()) this.showHub();
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  /**
   * fb074: QUALITY.md BETA's "no progress loss on refresh" bar. A persisted
   * in-progress run (`runpersist.ts`) whose content hash no longer matches the
   * live `/data` is discarded rather than replayed — the `/data` it was
   * recorded against is gone, and `World`'s constructor would otherwise throw
   * on the mismatch instead of failing softly back to the Hub. Returns
   * whether a run was actually resumed, so `start()` knows whether it still
   * owes the player a Hub.
   *
   * The replay loop itself is wrapped in try/catch (code-reviewer finding):
   * `loadPersistedRun` only checks that `config`/`inputLog`/`sessionId` exist
   * with the right *outer* shape, not that every individual `TickInput`/
   * `Command` inside the log is well-formed — a hand-edited or corrupted
   * localStorage entry with a malformed entry (e.g. a `cmds` array missing
   * from one recorded input) would otherwise throw straight out of `start()`
   * with nothing above it to catch it, leaving the very refresh this feature
   * exists to protect against a blank page instead of the pre-fb074 Hub
   * fallback.
   */
  private tryResumePersistedRun(): boolean {
    const persisted = loadPersistedRun();
    if (!persisted) return false;
    const content = loadContent();
    if (contentHash(content) !== persisted.config.contentHash) {
      clearPersistedRun();
      return false;
    }
    let run: Run;
    try {
      run = new Run(persisted.config, content);
      for (let t = 0; t < persisted.inputLog.length && !run.done; t++) {
        run.step(persisted.inputLog[t] ?? emptyInput());
      }
    } catch {
      clearPersistedRun();
      return false;
    }
    // A persisted log that already ran its recorded run to completion (e.g. a
    // tab closed right on the victory/defeat tick, before the outcome-change
    // handler's own clear could fire) has nothing live left to resume into.
    if (run.done) {
      clearPersistedRun();
      return false;
    }
    this.beginRun(persisted.config, run, persisted.inputLog.slice(0, run.world.tick));
    return true;
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
    // fb074: every path back to the Hub — abandon, defeat/victory's own Retry/
    // New Run/Hub buttons, boot with nothing to resume — means "this instance
    // has no run in progress," so whatever it itself persisted (if anything)
    // must not outlive it. Ownership-gated (code-reviewer finding): an
    // instance that never started/resumed a run of its own (this boots to the
    // Hub the first time too) must not blindly wipe a *different* tab's still-
    // active checkpoint just because this tab happened to reach its Hub.
    this.clearOwnPersistedRun();
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
      keyBindings: this.keyBindings,
      // `bindGlobalInput` runs at most once (`inputBound`) and hands
      // `makeKeyDownHandler` this exact `this.keyBindings` object, which it
      // closes over for the rest of the session — reassigning the field to a
      // *new* object here would leave that already-bound `onKeyDown` closure
      // aliasing the stale one, so a rebind made from the Hub between runs
      // would stop taking effect for every keydown-dispatched action (Q/E,
      // R/F/C/P/V/U/X, digits) the moment a second run started. Mutating the
      // same object in place keeps every existing alias (this callback,
      // `bindCanvasInput`'s per-run rebuild, the per-tick `gatherInput` call)
      // pointed at current values instead.
      onKeyBindingsChanged: (kb) => {
        Object.assign(this.keyBindings, kb);
        saveKeyBindings(this.keyBindings);
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
    // fb074: no explicit clear of whatever a *previous* run left persisted —
    // every path that reaches `startRun` (Retry/New Run/Hub "Start") already
    // passed through `showHub()` or the outcome-finished block first, both of
    // which clear this instance's own persisted slot via
    // `clearOwnPersistedRun()`. Leaving it implicit rather than clearing
    // again here means a *different* tab/window's still-active checkpoint —
    // which this instance never owned in the first place — isn't wiped just
    // because this tab started a run of its own (code-reviewer finding);
    // this run's own first `persistRun()` write ~1s in claims the slot for
    // itself regardless, same as it would for a brand-new key.
    this.beginRun(cfg, new Run(cfg), []);
  }

  /**
   * fb074: the shared tail of both a fresh `startRun` and a boot-time resume
   * (`tryResumePersistedRun`) — everything that wires up the Hud/renderer/
   * input bindings and the world-dependent UI sync calls, parameterized over
   * how `run` and its `inputLog` history came to exist rather than always
   * constructing a brand-new `Run`.
   */
  private beginRun(cfg: RunConfig, run: Run, priorInputLog: TickInput[]): void {
    this.root.innerHTML = '';
    this.lastCfg = cfg;
    // fb074: a fresh id per run (fresh *or* resumed alike) — see the
    // `runSessionId` field doc for why this exists.
    this.runSessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    this.lastWrittenSessionId = null;
    this.persistDisabled = false;
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
        // b030: `run.world.cfg.autoPickLevelUps` only updates when a queued
        // Command is actually applied inside `run.step`, which never runs
        // while paused (`frame` returns early) — reading it here as the
        // "current" value went stale across two paused clicks in a row, so
        // both pushed the same `on` instead of alternating. `this.meta.
        // autoPickLevelUps` is updated synchronously by this same callback
        // (below) regardless of pause state, so it's the source of truth.
        const on = !this.meta.autoPickLevelUps;
        this.pending.push({ k: 'set_autopick', on });
        // fb012: the profile remembers the last-chosen value, so the next run
        // (from any of the three doors onto this toggle) starts with it.
        this.meta = { ...this.meta, autoPickLevelUps: on };
        saveMeta(this.meta);
        // b069: `lastCfg` is the config Retry/New Run replay verbatim (New Run
        // only spreads a fresh seed over it) — without this, a mid-run toggle
        // updated `meta` and the live sim but left `lastCfg` pinned to
        // whatever the run started with, so Retry/New Run silently reverted
        // the setting a player had just changed.
        if (this.lastCfg) this.lastCfg = { ...this.lastCfg, autoPickLevelUps: on };
        // b065: `hud.update` (the only other caller of `syncAutoPickToggle`)
        // is skipped entirely by `frame` while paused, so the sidebar
        // button's own aria-pressed/.on state would otherwise freeze at its
        // pre-pause value across paused clicks even though `on` here is
        // already alternating correctly.
        this.hud.syncAutoPickToggle(on);
      },
      onEquipItem: (slot, item) => this.pending.push({ k: 'equip_item', slot, item }),
      onToggleCharacterPanel: () => this.hud.toggleCharacterPanel(this.run!.world),
      onToggleDpsPanel: () => this.hud.toggleDpsPanel(this.run!.world),
      onToggleVsPanel: () => this.hud.toggleVsPanel(this.run!.world),
      onResume: () => this.setPaused(false),
      onPause: () => this.setPaused(true),
      onCycleSpeed: () => this.hud.setSpeed(this.pacer.cycle()),
      onSetSpeed: (speed) => this.hud.setSpeed(this.pacer.setSpeed(speed)),
      onDev: (op, amount, enemyKey) => this.pending.push({ k: 'dev', op, amount, enemyKey }),
      onQuitToHub: () => this.showHub(),
      onHoverSkill: (which) => (this.view.hoveredSkill = which),
      onHoverWieldedTower: (key) => (this.view.hoveredWieldedTower = key),
      onUpgradeStructure: (tx, ty) => this.pending.push({ k: 'upgrade', tx, ty }),
      onSellStructure: (tx, ty) => this.pending.push({ k: 'sell', tx, ty }),
      onUpgradeCore: () => this.pending.push({ k: 'upgrade_core' }),
    });
    this.renderer = new Renderer(this.hud.canvas);
    if (!this.inputBound) {
      this.bindGlobalInput();
      this.inputBound = true;
    }
    this.bindCanvasInput();
    this.run = run;
    this.inputLog = priorInputLog;
    this.lastPersistedLen = priorInputLog.length;
    this.resultBanked = false;
    this.paused = false;
    this.hud.buildTowerBar(this.run.world);
    this.hud.showPracticeTools(cfg.practice === true, this.run.world);
    this.hud.resetModalKey();
    this.hud.closeCharacterPanel();
    this.hud.closeDpsPanel();
    this.hud.closeVsPanel();
    this.view.selectedTower = 0;
    this.view.selection = null;
    this.pending = [];
    this.pacer.reset();
    this.hud.setSpeed(this.pacer.speed);
    this.hud.setShowRanges(this.view.showRanges);
    // b068 (code-reviewer finding): a fresh `Hud` defaults its cached
    // `autoPickOn` to false until the first `syncAutoPickToggle` call, which
    // otherwise only happens on an unpaused frame or a click — so a returning
    // player whose carried-over `cfg.autoPickLevelUps` is true and who pauses
    // before the first tick would see the Options checkbox disagree with the
    // setting that actually applies on resume. Seed it here the same way
    // `setSpeed`/`setShowRanges` above seed their own presentation state.
    this.hud.syncAutoPickToggle(cfg.autoPickLevelUps === true);
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
    // `dashQueued` (fb077) is a one-shot "intent" flag armed by a Space keydown,
    // not a member of `this.keys`, so `clearKeysForPause` can't reach it — left
    // alone it would fire a stale dash on the first post-resume tick regardless
    // of how long the pause lasted or whether Space was released mid-pause.
    if (paused) {
      clearKeysForPause(this.keys, this.keyBindings);
      this.dashQueued = false;
    } else this.pacer.clearBacklog();
    this.hud.setPaused(paused, this.run.world);
  }

  private bindGlobalInput(): void {
    const onKeyDown = makeKeyDownHandler({
      keys: this.keys,
      bindings: this.keyBindings,
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
      toggleVsPanel: () => {
        if (this.run) this.hud.toggleVsPanel(this.run.world);
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
      upgradeSelection: () => this.hotkeyUpgradeSelection(),
      sellSelection: () => this.hotkeySellSelection(),
    });
    window.addEventListener('keydown', (e) => {
      if (!this.run) return;
      // fb078: mirrors `makeKeyDownHandler`'s own `if (e.repeat) return;` —
      // without it, a browser key-repeat event for a Space the player never
      // released (including one held through an Esc/blur pause) re-arms
      // `dashQueued` with no fresh physical press behind it.
      if (e.key.toLowerCase() === this.keyBindings.dash && !this.paused && !e.repeat) this.dashQueued = true;
      onKeyDown(e);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    // fb071: losing window/tab focus mid-run (alt-tab, switching apps) used to
    // only drop held keys, leaving the sim running unattended against a dead
    // Core. Auto-pause on blur, same state transition as Esc; deliberately not
    // a `togglePause()` call, which would *resume* if the player had already
    // paused manually before tabbing away. A later `focus` does not
    // auto-resume — matches Esc's manual-resume convention and avoids racing
    // the player back into combat before they've looked at the screen.
    window.addEventListener('blur', () => {
      // `clearKeysForPause`, not a blanket `.clear()`: a blur mid-charge (`q`
      // held for a Circle-Slash-style Active1) must preserve `q` exactly like
      // an Esc-pause does, or the very next `gatherInput()` reads a release
      // with no player intent — the same bug `clearKeysForPause`'s own doc
      // comment already documents for Esc, reachable here too since this ran
      // an unconditional `.clear()` before `setPaused`'s own call could help.
      clearKeysForPause(this.keys, this.keyBindings);
      if (this.run && this.run.world.outcome === 'running' && !this.paused) this.setPaused(true);
    });
    // fb065: `Renderer.resize()` now sizes the backing store off `.sw-stage`'s
    // actual laid-out box (canvas.ts), not a fixed constant, so a live window
    // resize has to re-run it or the canvas would stay pinned at whatever
    // size the window happened to be at the last run start/dpr change.
    // `bindGlobalInput` runs once, after the first `this.renderer` assignment
    // (`startRun`, guarded by `inputBound`), and every later Retry/New Run
    // reassigns `this.renderer` before this closure fires again — so
    // `this.renderer` here is always the live instance, never the original.
    // rAF-coalesced: a mouse-drag resize fires the native event dozens of
    // times/sec, and each call reassigns `canvas.width`/`height` (clearing the
    // backing store) — collapsing bursts to one resize per painted frame.
    let resizeQueued = false;
    window.addEventListener('resize', () => {
      if (resizeQueued) return;
      resizeQueued = true;
      requestAnimationFrame(() => {
        resizeQueued = false;
        this.renderer.resize();
      });
    });
  }

  /** fb027: `U` upgrades whatever the panel is currently showing (tower or Core) — a no-op with nothing selected. */
  private hotkeyUpgradeSelection(): void {
    const w = this.run?.world;
    const sel = this.view.selection;
    if (!w || !sel) return;
    if (sel.kind === 'tower') {
      const s = selectedStructure(w, sel);
      if (s) this.pending.push({ k: 'upgrade', tx: s.tx, ty: s.ty });
    } else if (sel.kind === 'core') {
      this.pending.push({ k: 'upgrade_core' });
    }
  }

  /** fb027: `X` sells the selected tower. The Core has no sell command (§5.5). */
  private hotkeySellSelection(): void {
    const w = this.run?.world;
    const sel = this.view.selection;
    if (!w || !sel || sel.kind !== 'tower') return;
    const s = selectedStructure(w, sel);
    if (s) this.pending.push({ k: 'sell', tx: s.tx, ty: s.ty });
  }

  private bindCanvasInput(): void {
    bindCanvasInput({
      canvas: this.hud.canvas,
      view: this.view,
      keys: this.keys,
      bindings: this.keyBindings,
      queue: { push: (cmd) => this.pending.push(cmd) },
      isBlocked: () => this.paused || this.hud.modalOpen,
      // The handler lives in `selection.ts` so the tests drive the shipped
      // code rather than a copy of it.
      onSelect: makeSelectHandler(this.view, () => this.run?.world ?? null),
    });
  }

  /**
   * fb074 (code-reviewer finding): writes the current run's persisted
   * checkpoint, but backs off rather than fighting forever once a *different*
   * `runSessionId` shows up in the slot this instance itself last wrote to —
   * a second tab/window that resumed the same on-disk checkpoint independently
   * claimed it since. That instance keeps playing fine in memory either way;
   * this just stops it from clobbering a session it no longer owns every
   * throttle window. Also backs off (once, permanently for this run) the
   * first time a write actually fails — e.g. localStorage quota exceeded by
   * an unusually long session's ever-growing input log — logging once via
   * `console.warn` and, since fb087 measured a normal T1 victory run crossing
   * the quota well before finishing (not just an "unusually long" one), also
   * surfacing a one-time `hud.say()` toast so the player has some in-game
   * signal resume protection just lapsed, instead of nothing at all. The
   * cross-tab backoff above stays silent: that is a different, working-as-
   * intended handoff (a second tab is actively keeping *a* checkpoint alive),
   * not this instance's own persistence failing outright.
   */
  private persistRun(): void {
    if (!this.lastCfg || !this.runSessionId || this.persistDisabled) return;
    const current = loadPersistedRun();
    if (this.lastWrittenSessionId && current && current.sessionId !== this.lastWrittenSessionId) {
      this.persistDisabled = true;
      return;
    }
    const ok = savePersistedRun({ config: this.lastCfg, inputLog: this.inputLog, sessionId: this.runSessionId });
    if (!ok) {
      this.persistDisabled = true;
      console.warn(
        'fb074: failed to persist the in-progress run (localStorage full or unavailable) — ' +
          'resume-on-refresh is disabled for the rest of this run.',
      );
      this.hud.say('Resume protection off for this run (storage full)', 1);
      return;
    }
    this.lastWrittenSessionId = this.runSessionId;
  }

  /**
   * fb074 (code-reviewer finding): only clears the persisted slot when this
   * instance is the one that last wrote to it (or never persisted anything
   * at all, in which case there is nothing of this instance's own to clear).
   * A plain `clearPersistedRun()` here would let a tab/window that never
   * started a run of its own — this fires on every `showHub()`, including
   * the very first boot — silently erase a *different* tab's active
   * checkpoint just by being open.
   */
  private clearOwnPersistedRun(): void {
    if (this.runSessionId) {
      const current = loadPersistedRun();
      if (!current || current.sessionId === this.lastWrittenSessionId) clearPersistedRun();
    }
    this.runSessionId = null;
    this.lastWrittenSessionId = null;
    this.persistDisabled = false;
  }

  private gatherInput(): TickInput {
    const input = gatherInput(
      this.keys,
      this.pending,
      this.view.cursorX,
      this.view.cursorY,
      this.dashQueued,
      this.keyBindings,
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
      const input = this.gatherInput();
      run.step(input);
      this.inputLog.push(input);
      this.renderer.ingest(run.world, this.view);
      this.sfx.emit(run.world.fx, this.settings);
      this.hud.ingestFx(run.world.fx);
    }
    // fb074: throttled to roughly once per simulated second (not per frame —
    // fast-forward can run dozens of ticks in one frame) so a refresh never
    // loses more than ~1s of otherwise-unrecoverable progress. Skipped once
    // the run has already finished: the outcome-change block below clears the
    // persisted entry outright rather than freezing it at a finished state.
    if (run.world.outcome === 'running' && this.inputLog.length - this.lastPersistedLen >= 60) {
      this.lastPersistedLen = this.inputLog.length;
      this.persistRun();
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
      // fb074: a finished run has nothing left to resume into; leaving the
      // last-persisted mid-run snapshot on disk would let a refresh on the
      // Results screen replay it right back into a dead Core/Warden.
      // Ownership-gated the same way `showHub()` is (code-reviewer finding).
      this.clearOwnPersistedRun();
    }
    this.hud.syncModal(w);

    requestAnimationFrame(this.frame);
  };
}

const root = document.getElementById('app');
if (root) new Game().start(root);
