/** DOM chrome around the canvas: HUD, tower bar, and the modal choice screens. */

import type { World } from '../sim/world';
import { GRID_H, GRID_W } from '../sim/grid';
import { canBuildNow, towerCost } from '../sim/towers';
import { inCoreBuildRange } from '../sim/cores';
import type { Offer } from '../sim/types';
import { ENEMY_COLORS, PALETTE, TOWER_COLORS } from '../render/theme';
import { dotRemaining, dotStacks, effectiveSpeed, enemyArmor, enemyCoreDamage } from '../sim/enemies';
import { wardenArmor } from '../sim/run';
import { armorReduction, effectiveArmor } from '../sim/stats';
import type { Enemy } from '../sim/types';
import { towerInfo, wieldedLineageText, type TowerInfo } from './tower-info';
import { runProgress, type RunProgress } from './progress';
import type { DevOp } from '../sim/types';
import { selectedEnemy, selectedStructure, type Selection } from './selection';
import { characterPanelData, type CharacterPanelData } from './character-panel';
import { dpsPanelData, type DpsPanelData, type DpsWindow } from './dps-panel';
import { vsPanelRows, type VsPanelRow } from './vs-panel';
import { STAT_DISPLAY, type StatDisplay } from '../sim/stats';
import { active2CdrFactor, characterBasicRange, classAttackPowerMul } from '../sim/classes';
import { longestWieldedRange } from '../sim/vswield';
import { SPEEDS } from './pacer';
import {
  activeSkillMarkup,
  classAbilitiesMarkup,
  passiveSkillMarkup,
  towerPassiveSkillMarkup,
  type ClassLiveContext,
} from './class-info';
import { bottomBarData, type SkillIconState } from './bottom-bar';
import { coreLiveMarkup } from './core-info';
import { formatPct, trimNum } from './info-format';
import { equipmentEffectMarkup, type EquipmentEffectContext } from './equipment-info';
import { defaultSettings, type Settings } from './settings';
import { devProfileActive, isDevBuild } from '../meta/devprofile';
import { defaultKeyBindings, keyLabel, type KeyBindings } from './keybindings';

/**
 * fb102: mirrors of `style.css`'s `.sw-rail`/`.sw-bossbar` box-model numbers,
 * duplicated here (same tradeoff `syncStageOverlayGeometry`'s own doc comment
 * already accepts for the letterboxing math) so the boss banner's max-width
 * can be computed against the rails' actual worst-case (fully expanded)
 * footprint instead of drifting out of sync with a plain CSS percentage that
 * can't see the rails at all.
 */
const RAIL_WIDTH_PX = 300; // `.sw-rail`'s `width: 300px`
const RAIL_WIDE_MAX_FRACTION = 0.32; // `.sw-rail`'s base `max-width: 32%`
const RAIL_NARROW_MAX_FRACTION = 0.55; // `.sw-rail`'s `@media (max-width: 1180px)` `max-width: 55%`
const RAIL_NARROW_BREAKPOINT_PX = 1180; // the same media query's breakpoint
const RAIL_EDGE_GAP_PX = 8; // `.sw-rail-left`/`.sw-rail-right`'s `calc(var(--cv-left/right, 0px) + 8px)`
const BOSSBAR_WIDTH_PX = 360; // `.sw-bossbar`'s `width: 360px`
const BOSSBAR_MIN_GAP_PX = 10; // minimum breathing room kept between the boss bar and a rail
// fb109: below this, the boss name/HP text stops being legible — floor
// `--bossbar-maxw` here instead of letting it degrade toward 0 (or negative,
// pre-clamp) as the stage keeps shrinking past both rails' combined footprint.
const BOSSBAR_MIN_WIDTH_PX = 120;

/** fb084: which one-time first-run tutorial prompt is showing. */
export type OnboardingKey = 'build' | 'dusk' | 'dawn';

/**
 * fb084 (QUALITY.md BETA first-run onboarding): the three contextual prompts
 * named by the checklist — first TD build phase, first Dusk->Night VS wave,
 * first Dawn return-to-build.
 */
function onboardingText(key: OnboardingKey, kb: KeyBindings): string {
  if (key === 'build') {
    return (
      "Build phase: pick a tower from the panel on the left and place it along the enemies' path, " +
      'then call the wave (Enter) when your defenses are ready.'
    );
  }
  if (key === 'dusk') {
    return (
      `Night falls — you now control the Warden directly. ${keyLabel(kb.moveUp)}${keyLabel(kb.moveLeft)}` +
      `${keyLabel(kb.moveDown)}${keyLabel(kb.moveRight)} to move, ${keyLabel(kb.dash)} to dash, and ` +
      `${keyLabel(kb.active1)}/${keyLabel(kb.active2)} for your class actives while the horde closes in.`
    );
  }
  return 'Dawn breaks. Spend your gold on new towers and upgrades before the next wave begins.';
}

export interface HudCallbacks {
  onSelectTower(id: number): void;
  onCallWave(): void;
  onPickOffer(index: number): void;
  onReroll(): void;
  /** Results screen: same seed, same config, straight back in. */
  onRetry(): void;
  /** Results screen: same config, a fresh seed, straight back in. */
  onNewRun(): void;
  onToggleRanges(): void;
  /** SPEC-FINAL §6.3, owner feedback `feature-auto-pick-boons`: flips level-up auto-pick mid-run. */
  onToggleAutoPick(): void;
  /** SPEC-FINAL §2/§6.3/§11, owner feedback `feature-boon-stats-panel`: opens/closes the character panel. */
  onToggleCharacterPanel(): void;
  /** fb023 (SPEC-FINAL §7): swap an owned item into (or `null` out of) an equipment slot, mid-run, from the character panel. */
  onEquipItem(slot: string, item: string | null): void;
  /** SPEC-FINAL §11, owner feedback `feature-dps-summary`: opens/closes the DPS summary panel. */
  onToggleDpsPanel(): void;
  /**
   * SPEC-FINAL §6.2, owner feedback `feature-vs-wielded-side-panel` (fb037):
   * opens/closes the wielded-attacks side panel. Optional (unlike its DPS/
   * Character panel siblings) so the many existing `Hud` test constructors
   * that predate this panel do not all need updating for a presentation-only
   * addition — a missing callback simply means the panel's own control is
   * wired to nothing, exactly as harmless in a test as an unclicked button.
   */
  onToggleVsPanel?(): void;
  onResume(): void;
  onPause(): void;
  /** fb026: hovering an Active icon on the bottom bar; `null` on mouseleave. Drives the map's skill-range ring. */
  onHoverSkill(which: 'active1' | 'active2' | null): void;
  /** fb037: hovering a wielded-attack row in the VS side panel; `null` on mouseleave. Drives that attack's range ring. */
  onHoverWieldedTower?(towerKey: string | null): void;
  /** fb027: the selection panel's Upgrade button, or the `U` hotkey on a selected tower. */
  onUpgradeStructure(tx: number, ty: number): void;
  /** fb027: the selection panel's Sell button, or the `X` hotkey on a selected tower. */
  onSellStructure(tx: number, ty: number): void;
  /** fb027 (SPEC-FINAL §5.5): the Core panel's Upgrade button, or the `U` hotkey with the Core selected. */
  onUpgradeCore(): void;
  /** Fast-forward: cycles through the declared speeds (`SPEEDS`). */
  onCycleSpeed(): void;
  /** fb035: the speed dropdown — jumps directly to a declared speed (`SPEEDS`). */
  onSetSpeed(speed: number): void;
  /** Practice tool; only reachable in a run started with practice on. `enemyKey` is only meaningful for the `'spawn'` op. */
  onDev(op: DevOp, amount: number, enemyKey?: string): void;
  onQuitToHub(): void;
  /**
   * fb084: a first-run onboarding prompt was dismissed — persist that it's
   * seen so it never shows again. Optional so the many pre-existing `Hud`
   * test constructors that predate this feature don't all need updating.
   */
  onOnboardingSeen?(key: OnboardingKey): void;
}

export class Hud {
  readonly root: HTMLElement;
  private bar: HTMLElement;
  private stats: HTMLElement;
  private modal: HTMLElement;
  private toast: HTMLElement;
  private toastPriority = -Infinity;
  private toastTimer: number | null = null;
  private toastQueue: Array<{ text: string; priority: number }> = [];
  private speedSel: HTMLSelectElement;
  private towerInfoEl: HTMLElement;
  private progressEl: HTMLElement;
  private practiceEl: HTMLElement;
  private charPanelEl: HTMLElement;
  private bossBarEl: HTMLElement;
  private bossBarNameEl: HTMLElement;
  private bossBarFillEl: HTMLElement;
  private onboardingEl: HTMLElement;
  private onboardingTextEl: HTMLElement;
  /** fb084: the prompt currently armed to show (post-modal-close), or `null` once dismissed/never triggered. */
  private onboardingActive: { key: OnboardingKey; text: string } | null = null;
  /** fb084: a prompt that fired while another was still showing — see `triggerOnboarding`'s doc comment. */
  private onboardingQueue: OnboardingKey[] = [];
  /** fb084: `update()` only ever checks for the first-build-phase prompt once per `Hud` instance (i.e. once per run). */
  private onboardingBuildChecked = false;
  private stageEl: HTMLElement | null;
  private dpsPanelEl: HTMLElement;
  private dpsDockEl: HTMLElement;
  private vsPanelEl: HTMLElement;
  private vsDockEl: HTMLElement;
  private lastInfoKey = '';
  private cb: HudCallbacks;
  /**
   * fb084: read for the three onboarding-seen flags. fb104 (owner feedback,
   * qa-playtester finding on fb086) also reads `reducedFlash` to gate the
   * bottom-bar skill-ready ripple (`renderSkillIcon`) — it's a brief
   * skill-fire flash, the exact surface `reducedFlash`'s own doc comment
   * names, not `reducedMotion`'s ambient-motion-jitter target.
   */
  private settings: Settings;
  /** fb107: a construction-time snapshot, same tradeoff `settings`' own doc comment above accepts — no in-run Controls panel exists to go stale mid-run. */
  private keyBindings: KeyBindings;
  private selected = 0;
  private lastModalKey = '';
  private lastCharPanelKey = '';
  private paused = false;
  private confirmingAbandon = false;
  /** fb012: the pause card's "Options" sub-screen, holding the auto-pick toggle. */
  private showingOptions = false;
  private charPanelOpen = false;
  private dpsPanelOpen_ = false;
  /** fb024: the panel's own close button docks to a small tab instead of vanishing. */
  private dpsPanelDocked_ = false;
  private vsPanelOpen_ = false;
  /** fb037: reuses fb024's dock pattern — the panel's own close button docks rather than vanishing. */
  private vsPanelDocked_ = false;
  /** b035: the practice tool panel is tall enough to push `#sw-towerinfo` past the fold; collapsed by default. */
  private practiceCollapsed = true;
  /**
   * fb065: the player's own open/closed preference for the right info rail,
   * set only by its handle button. `syncRailVisibility` combines this with
   * `dpsPanelOpen_`/`vsPanelOpen_` — both dock to the same right edge
   * (`.sw-dock`, style.css) the rail does, so the two would otherwise paint
   * on top of each other exactly like the character/DPS/VS panels already
   * refuse to stack on top of one another elsewhere in this file.
   */
  private railRightUserOpen = true;
  /** fb026: the bottom HUD bar's element refs, cached once at construction — see `renderBottomBar`. */
  private bb!: {
    root: HTMLElement;
    hpNum: HTMLElement;
    hpFill: HTMLElement;
    goldNum: HTMLElement;
    passiveState: HTMLElement;
    passiveTip: HTMLElement;
    towerPassiveTip: HTMLElement;
    a1Sweep: HTMLElement;
    a1Charge: HTMLElement;
    a1Cd: HTMLElement;
    a1Tip: HTMLElement;
    a1Icon: HTMLElement;
    a2Sweep: HTMLElement;
    a2Charge: HTMLElement;
    a2Cd: HTMLElement;
    a2Tip: HTMLElement;
    a2Icon: HTMLElement;
  };
  /** fb026: previous frame's ready state per Active, so a false->true edge gets a one-shot "ready" flash. */
  private prevSkillReady: { active1: boolean; active2: boolean } = { active1: true, active2: true };

  constructor(
    root: HTMLElement,
    cb: HudCallbacks,
    settings: Settings = defaultSettings(),
    keyBindings: KeyBindings = defaultKeyBindings(),
  ) {
    this.root = root;
    this.cb = cb;
    this.settings = settings;
    this.keyBindings = keyBindings;
    // fb094: dev-profile-only, same gate hub.ts's `DEV_BADGE` uses
    // (`DEV_BUILD && devProfileActive()`) — computed once here since the
    // control markup below is built into the constructor's one-shot
    // `innerHTML` template, not re-rendered per tick.
    const devMode = isDevBuild() && devProfileActive();
    root.innerHTML = `
      <div class="sw-shell">
        <div class="sw-stage">
          <canvas id="sw-canvas"></canvas>
          <div class="sw-modal sw-off" id="sw-modal" hidden></div>
          <div class="sw-modal sw-off" id="sw-charpanel" hidden></div>
          <div class="sw-bossbar sw-off" id="sw-bossbar" hidden>
            <div class="sw-bossbar-name" id="sw-bossbar-name"></div>
            <div class="sw-meter sw-bossbar-meter"><i id="sw-bossbar-fill"></i></div>
          </div>
          <div class="sw-onboarding sw-off" id="sw-onboarding" hidden>
            <span class="sw-onboarding-text" id="sw-onboarding-text"></span>
            <button class="sw-onboarding-close" id="sw-onboarding-close" title="Dismiss" aria-label="Dismiss">&times;</button>
          </div>
          <div class="sw-dock sw-off" id="sw-dpspanel" hidden></div>
          <button class="sw-dpsdock sw-off" id="sw-dpsdock" hidden title="Reopen DPS summary (${keyLabel(keyBindings.toggleDpsPanel)})">DPS &#9656;</button>
          <div class="sw-dock sw-off" id="sw-vspanel" hidden></div>
          <button class="sw-vsdock sw-off" id="sw-vsdock" hidden title="Reopen wielded attacks (${keyLabel(keyBindings.toggleVsPanel)})">VS &#9656;</button>
          <div class="sw-toast" id="sw-toast"></div>
          <div class="sw-bottombar" id="sw-bottombar">
            <div class="sw-bb-vital sw-bb-hp">
              <span class="sw-bb-vlabel">HP</span>
              <b class="sw-bb-vnum" id="sw-bb-hp-num"></b>
              <div class="sw-meter sw-bb-vmeter"><i id="sw-bb-hp-fill"></i></div>
            </div>
            <div class="sw-bb-vital sw-bb-gold">
              <span class="sw-bb-vlabel">Gold</span>
              <b class="sw-bb-vnum gold" id="sw-bb-gold-num"></b>
            </div>
            <div class="sw-bb-skill sw-bb-passive" id="sw-bb-passive" data-skill="passive" tabindex="0">
              <div class="sw-bb-icon"><span class="sw-bb-icontext">P</span></div>
              <div class="sw-bb-under" id="sw-bb-passive-state"></div>
              <div class="sw-bb-tip" id="sw-bb-passive-tip"></div>
            </div>
            <div class="sw-bb-skill sw-bb-passive" id="sw-bb-towerpassive" data-skill="towerpassive" tabindex="0">
              <div class="sw-bb-icon"><span class="sw-bb-icontext">T</span></div>
              <div class="sw-bb-tip" id="sw-bb-towerpassive-tip"></div>
            </div>
            <div class="sw-bb-skill" id="sw-bb-active1" data-skill="active1" tabindex="0">
              <div class="sw-bb-icon">
                <span class="sw-bb-key">${keyLabel(keyBindings.active1)}</span>
                <div class="sw-bb-sweep" id="sw-bb-a1-sweep"></div>
                <span class="sw-bb-charge" id="sw-bb-a1-charge"></span>
              </div>
              <div class="sw-bb-under" id="sw-bb-a1-cd"></div>
              <div class="sw-bb-tip" id="sw-bb-a1-tip"></div>
            </div>
            <div class="sw-bb-skill" id="sw-bb-active2" data-skill="active2" tabindex="0">
              <div class="sw-bb-icon">
                <span class="sw-bb-key">${keyLabel(keyBindings.active2)}</span>
                <div class="sw-bb-sweep" id="sw-bb-a2-sweep"></div>
                <span class="sw-bb-charge" id="sw-bb-a2-charge"></span>
              </div>
              <div class="sw-bb-under" id="sw-bb-a2-cd"></div>
              <div class="sw-bb-tip" id="sw-bb-a2-tip"></div>
            </div>
          </div>
          <!--
            fb065: the two old .sw-side columns are now floating rails
            anchored to .sw-stage's own left/right edges (.sw-rail,
            style.css) - semi-transparent overlays over the canvas rather than
            an opaque gutter reserving layout space beside it. Ids/classes on
            every child are unchanged from .sw-side's markup, so every
            existing querySelector/test selector below and elsewhere in this
            file keeps working untouched; only the two wrapping containers and
            their handle buttons are new.
          -->
          <div class="sw-rail sw-rail-left" id="sw-rail-left">
            <button class="sw-railhandle" id="sw-rail-left-handle" title="Toggle build panel">&#9776; Build</button>
            <div class="sw-railbody">
              <div class="sw-controls" id="sw-controls">
                <select class="sw-ctl" data-act="speed" id="sw-speed" title="Game speed (${keyLabel(keyBindings.cycleSpeed)} cycles)">
                  ${SPEEDS.map((s) => `<option value="${s}">${s}x</option>`).join('')}
                </select>
                <button class="sw-ctl" data-act="ranges" id="sw-ranges" aria-pressed="false" title="Show tower ranges (${keyLabel(keyBindings.toggleRanges)})">Ranges</button>
                <button class="sw-ctl" data-act="autopick" id="sw-autopick" aria-pressed="false" title="Resolve level-ups automatically">Auto-pick</button>
                <button class="sw-ctl" data-act="character" id="sw-character" aria-pressed="false" title="Character stats (${keyLabel(keyBindings.toggleCharacterPanel)})">Character</button>
                <button class="sw-ctl" data-act="dps" id="sw-dps" aria-pressed="false" title="Damage/DPS summary (${keyLabel(keyBindings.toggleDpsPanel)})">DPS</button>
                <button class="sw-ctl" data-act="vs" id="sw-vs" aria-pressed="false" title="Wielded attacks (${keyLabel(keyBindings.toggleVsPanel)})">VS</button>
                ${devMode ? '<button class="sw-ctl" data-act="screenshot" id="sw-screenshot" title="Export the current canvas frame as a PNG (dev)">Screenshot</button>' : ''}
                <button class="sw-ctl" data-act="pause" title="Pause (Esc)">Pause</button>
              </div>
              <div class="sw-practice" id="sw-practice" hidden></div>
              <!--
                b032: the build bar sits right after the controls/practice
                tools, in its own rail separate from progress/stats/towerinfo/
                help (fb065 split them into two rails) so its own row count
                never depends on how tall the info panels get.
              -->
              <div class="sw-bar" id="sw-bar"></div>
            </div>
          </div>
          <div class="sw-rail sw-rail-right" id="sw-rail-right">
            <button class="sw-railhandle" id="sw-rail-right-handle" title="Toggle info panel">&#9432; Info</button>
            <div class="sw-railbody">
              <div class="sw-progress" id="sw-progress"></div>
              <div class="sw-stats" id="sw-stats"></div>
              <div class="sw-towerinfo" id="sw-towerinfo"></div>
              <div class="sw-help">
                <b>${keyLabel(keyBindings.moveUp)}${keyLabel(keyBindings.moveLeft)}${keyLabel(keyBindings.moveDown)}${keyLabel(keyBindings.moveRight)}</b> move &middot;
                <b>${keyLabel(keyBindings.dash)}</b> dash &middot; <b>LMB</b> build/select &middot;
                <b>RMB</b> sell &middot; <b>${keyLabel(keyBindings.upgradeSelection)}</b>/<b>${keyLabel(keyBindings.sellSelection)}</b> upgrade/sell &middot; <b>1-9</b> pick tower &middot;
                <b>${keyLabel(keyBindings.clearSelection)}</b> clear &middot; <b>Enter</b> call wave &middot; <b>${keyLabel(keyBindings.active1)}</b> class active &middot;
                <b>${keyLabel(keyBindings.toggleRanges)}</b> ranges &middot; <b>${keyLabel(keyBindings.cycleSpeed)}</b> speed &middot; <b>${keyLabel(keyBindings.toggleCharacterPanel)}</b> character &middot; <b>${keyLabel(keyBindings.toggleDpsPanel)}</b> DPS &middot;
                <b>${keyLabel(keyBindings.toggleVsPanel)}</b> wielded attacks &middot; <b>Esc</b> pause
              </div>
            </div>
          </div>
        </div>
      </div>`;
    this.bar = root.querySelector('#sw-bar') as HTMLElement;
    this.stats = root.querySelector('#sw-stats') as HTMLElement;
    this.modal = root.querySelector('#sw-modal') as HTMLElement;
    this.toast = root.querySelector('#sw-toast') as HTMLElement;
    this.speedSel = root.querySelector('#sw-speed') as HTMLSelectElement;
    this.towerInfoEl = root.querySelector('#sw-towerinfo') as HTMLElement;
    this.progressEl = root.querySelector('#sw-progress') as HTMLElement;
    this.practiceEl = root.querySelector('#sw-practice') as HTMLElement;
    this.charPanelEl = root.querySelector('#sw-charpanel') as HTMLElement;
    this.stageEl = root.querySelector('.sw-stage') as HTMLElement;
    this.bossBarEl = root.querySelector('#sw-bossbar') as HTMLElement;
    this.bossBarNameEl = root.querySelector('#sw-bossbar-name') as HTMLElement;
    this.bossBarFillEl = root.querySelector('#sw-bossbar-fill') as HTMLElement;
    this.onboardingEl = root.querySelector('#sw-onboarding') as HTMLElement;
    this.onboardingTextEl = root.querySelector('#sw-onboarding-text') as HTMLElement;
    this.dpsPanelEl = root.querySelector('#sw-dpspanel') as HTMLElement;
    this.dpsDockEl = root.querySelector('#sw-dpsdock') as HTMLElement;
    this.vsPanelEl = root.querySelector('#sw-vspanel') as HTMLElement;
    this.vsDockEl = root.querySelector('#sw-vsdock') as HTMLElement;
    this.bb = {
      root: root.querySelector('#sw-bottombar') as HTMLElement,
      hpNum: root.querySelector('#sw-bb-hp-num') as HTMLElement,
      hpFill: root.querySelector('#sw-bb-hp-fill') as HTMLElement,
      goldNum: root.querySelector('#sw-bb-gold-num') as HTMLElement,
      passiveState: root.querySelector('#sw-bb-passive-state') as HTMLElement,
      passiveTip: root.querySelector('#sw-bb-passive-tip') as HTMLElement,
      towerPassiveTip: root.querySelector('#sw-bb-towerpassive-tip') as HTMLElement,
      a1Sweep: root.querySelector('#sw-bb-a1-sweep') as HTMLElement,
      a1Charge: root.querySelector('#sw-bb-a1-charge') as HTMLElement,
      a1Cd: root.querySelector('#sw-bb-a1-cd') as HTMLElement,
      a1Tip: root.querySelector('#sw-bb-a1-tip') as HTMLElement,
      a1Icon: root.querySelector('#sw-bb-active1') as HTMLElement,
      a2Sweep: root.querySelector('#sw-bb-a2-sweep') as HTMLElement,
      a2Charge: root.querySelector('#sw-bb-a2-charge') as HTMLElement,
      a2Cd: root.querySelector('#sw-bb-a2-cd') as HTMLElement,
      a2Tip: root.querySelector('#sw-bb-a2-tip') as HTMLElement,
      a2Icon: root.querySelector('#sw-bb-active2') as HTMLElement,
    };
    this.wireControls();
    this.wireBottomBarHover();
    this.wireTowerInfoActions();
    this.wireRails();
    this.onboardingEl.querySelector('#sw-onboarding-close')?.addEventListener('click', () => this.dismissOnboarding());
  }

  /**
   * fb065: each floating rail's handle toggles its own `.collapsed` class —
   * independent per rail (collapsing the build rail doesn't touch the info
   * rail), and both default open so every pre-existing test/interaction that
   * clicks a tower button or reads `#sw-stats` without first expanding
   * anything keeps working unchanged.
   */
  private wireRails(): void {
    const leftHandle = this.root.querySelector('#sw-rail-left-handle') as HTMLElement | null;
    const leftRail = this.root.querySelector('#sw-rail-left') as HTMLElement | null;
    leftHandle?.addEventListener('click', () => leftRail?.classList.toggle('collapsed'));

    const rightHandle = this.root.querySelector('#sw-rail-right-handle') as HTMLElement | null;
    rightHandle?.addEventListener('click', () => {
      // fb076: while an auto-collapse reason (DPS/VS panel open or docked) is
      // independently forcing the rail shut, this click is a no-op visually —
      // don't let it flip `railRightUserOpen` to false, or the rail stays
      // stuck collapsed after the auto-collapse reason later clears.
      if (this.railAutoCollapsed()) return;
      this.railRightUserOpen = !this.railRightUserOpen;
      this.syncRailRightVisibility();
    });
  }

  /** fb076: whether something other than the user's own handle toggle is forcing the right rail shut. */
  private railAutoCollapsed(): boolean {
    return this.dpsPanelOpen_ || this.vsPanelOpen_ || this.dpsPanelDocked_ || this.vsPanelDocked_;
  }

  /**
   * fb065: the right info rail (`#sw-stats`/`#sw-towerinfo`/etc.) and the DPS/
   * VS panels (`toggleDpsPanel`/`toggleVsPanel`) both dock to `.sw-stage`'s
   * right edge — collapses the rail whenever either panel is open *or docked*
   * (code review: the small reopen tab, `.sw-dpsdock`/`.sw-vsdock`, top:8/
   * top:40 right:0, sits in the same top-right corner as this rail's own
   * flex-end-aligned handle, so "docked" is not actually clear of it the way
   * an earlier draft of this comment assumed) so the rail's handle and a
   * dock's reopen tab never compete for the same click. Called every
   * `update()` tick, the same "re-derive presentation state from the live
   * flags every frame" pattern `syncDpsPanelToggle`/`syncVsPanelToggle`
   * already use just above its call site.
   */
  private syncRailRightVisibility(): void {
    const rail = this.root.querySelector('#sw-rail-right') as HTMLElement | null;
    if (!rail) return;
    rail.classList.toggle('collapsed', !this.railRightUserOpen || this.railAutoCollapsed());
  }

  /**
   * fb027: the selection panel's Upgrade/Sell/Upgrade-Core buttons. Delegated
   * on the panel's container rather than bound per-button, because
   * `towerInfoEl.innerHTML` is reassigned wholesale every time its content
   * key changes (`renderSelectionInfo`) — a listener on the button itself
   * would be garbage the moment the panel next re-rendered.
   */
  private wireTowerInfoActions(): void {
    this.towerInfoEl.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-act]') as HTMLButtonElement | null;
      if (!btn || btn.disabled) return;
      const tx = Number(btn.dataset.tx);
      const ty = Number(btn.dataset.ty);
      if (btn.dataset.act === 'upgrade') this.cb.onUpgradeStructure(tx, ty);
      else if (btn.dataset.act === 'sell') this.cb.onSellStructure(tx, ty);
      else if (btn.dataset.act === 'upgrade-core') this.cb.onUpgradeCore();
    });
  }

  /**
   * fb026: hover/focus (keyboard-reachable, `tabindex="0"`) on Active1/Active2
   * both shows that skill's tooltip and tells the renderer to draw its range
   * ring around the Warden; the passive icon only gets the tooltip (it has no
   * targeted range to preview). Leaving clears both.
   */
  private wireBottomBarHover(): void {
    const bind = (el: HTMLElement, which: 'active1' | 'active2' | null) => {
      el.addEventListener('mouseenter', () => this.cb.onHoverSkill(which));
      el.addEventListener('focus', () => this.cb.onHoverSkill(which));
      el.addEventListener('mouseleave', () => this.cb.onHoverSkill(null));
      el.addEventListener('blur', () => this.cb.onHoverSkill(null));
    };
    bind(this.bb.a1Icon, 'active1');
    bind(this.bb.a2Icon, 'active2');
  }

  private wireControls(): void {
    const controls = this.root.querySelector('#sw-controls');
    controls?.querySelector('[data-act="speed"]')?.addEventListener('change', (e) => {
      const sel = e.target as HTMLSelectElement;
      this.cb.onSetSpeed(Number(sel.value));
      // A focused native <select> intercepts the very digit keys (1-9) this
      // always-visible row sits beside — build/level-up hotkeys, not just
      // speed's own — via browser type-ahead, so a player who picks a speed
      // and immediately presses a tower hotkey would silently retarget the
      // dropdown instead. Blurring the moment a choice commits closes that
      // window (code-reviewer finding, fb035).
      sel.blur();
    });
    controls?.querySelector('[data-act="ranges"]')?.addEventListener('click', () => this.cb.onToggleRanges());
    controls?.querySelector('[data-act="autopick"]')?.addEventListener('click', () => this.cb.onToggleAutoPick());
    controls?.querySelector('[data-act="character"]')?.addEventListener('click', () => this.cb.onToggleCharacterPanel());
    controls?.querySelector('[data-act="dps"]')?.addEventListener('click', () => this.cb.onToggleDpsPanel());
    controls?.querySelector('[data-act="vs"]')?.addEventListener('click', () => this.cb.onToggleVsPanel?.());
    controls?.querySelector('[data-act="screenshot"]')?.addEventListener('click', () => this.exportScreenshot());
    controls?.querySelector('[data-act="pause"]')?.addEventListener('click', () => this.cb.onPause());
    this.dpsDockEl.addEventListener('click', () => this.cb.onToggleDpsPanel());
    this.vsDockEl.addEventListener('click', () => this.cb.onToggleVsPanel?.());
  }

  /**
   * Shows the practice tool. Called once at run start; a run that did not opt
   * in never sees the panel, and the sim ignores the commands anyway.
   *
   * `w` supplies the enemy roster for the fb019 Training Grounds spawn panel —
   * omitted only by tests that don't care about the spawn row.
   *
   * b035: the full panel (9 dev buttons + the spawn row) is tall enough that,
   * stacked above `#sw-towerinfo` in the old single-column `.sw-side` (fb065
   * split practice/build into their own rail, separate from towerinfo's), it
   * pushed a populated tower info panel ~230px past the 1080px fold with no
   * way to reach it. Collapsed by default behind a `sw-sub` toggle — the
   * tools are optional, the tower info panel that used to sit below them
   * was not.
   */
  showPracticeTools(on: boolean, w?: World): void {
    this.practiceEl.hidden = !on;
    if (!on) {
      this.practiceEl.innerHTML = '';
      return;
    }
    const enemies = [...(w?.content.enemies.enemies ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    this.practiceEl.innerHTML =
      `<div class="sw-sub sw-practice-toggle" id="sw-practice-toggle" role="button" tabindex="0" ` +
      `aria-expanded="${String(!this.practiceCollapsed)}">Practice tool ` +
      `<span class="sw-practice-chevron">${this.practiceCollapsed ? '▸' : '▾'}</span></div>` +
      `<div class="sw-practice-body${this.practiceCollapsed ? ' collapsed' : ''}" id="sw-practice-body">` +
      '<p class="sw-note">This run banks nothing.</p>' +
      '<div class="sw-devgrid">' +
      PRACTICE_BUTTONS.map((b) =>
        PRACTICE_AMOUNT_OPS.has(b.op)
          ? `<span class="sw-devamount">` +
            `<select class="sw-devamount-select" id="sw-dev-amount-${b.op}">` +
            PRACTICE_AMOUNTS.map(
              (v) => `<option value="${v}"${v === b.amount ? ' selected' : ''}>${v.toLocaleString()}</option>`,
            ).join('') +
            `</select>` +
            `<button class="sw-ctl" data-dev="${b.op}" title="${b.title}">${b.label}</button>` +
            `</span>`
          : `<button class="sw-ctl" data-dev="${b.op}" data-amount="${b.amount}" title="${b.title}">${b.label}</button>`,
      ).join('') +
      '</div>' +
      (enemies.length > 0
        ? '<div class="sw-sub">Spawn enemy</div>' +
          '<div class="sw-spawnrow">' +
          `<select id="sw-spawn-enemy">${enemies
            .map((e) => `<option value="${e.key}">${e.name} (grade ${e.grade})</option>`)
            .join('')}</select>` +
          '<input id="sw-spawn-count" type="number" min="1" max="50" value="1" />' +
          '<button class="sw-ctl" id="sw-spawn-go" title="Spawns the chosen enemy with its real stats">Spawn</button>' +
          '</div>'
        : '') +
      '</div>';
    const toggle = this.practiceEl.querySelector('#sw-practice-toggle') as HTMLElement;
    const body = this.practiceEl.querySelector('#sw-practice-body') as HTMLElement;
    const flip = (): void => {
      this.practiceCollapsed = !this.practiceCollapsed;
      body.classList.toggle('collapsed', this.practiceCollapsed);
      toggle.setAttribute('aria-expanded', String(!this.practiceCollapsed));
      const chevron = toggle.querySelector('.sw-practice-chevron');
      if (chevron) chevron.textContent = this.practiceCollapsed ? '▸' : '▾';
    };
    toggle.addEventListener('click', flip);
    toggle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        flip();
      }
    });
    for (const el of this.practiceEl.querySelectorAll<HTMLElement>('[data-dev]')) {
      el.addEventListener('click', () => {
        const op = el.dataset.dev as DevOp;
        // fb032: gold/xp read their amount from the adjacent dropdown at
        // click time, so a tester can change the selection and re-click
        // without the amount ever being baked into the button itself.
        const amountSelect = this.practiceEl.querySelector<HTMLSelectElement>(`#sw-dev-amount-${op}`);
        const amount = amountSelect ? Number(amountSelect.value) : Number(el.dataset.amount);
        this.cb.onDev(op, amount);
      });
    }
    this.practiceEl.querySelector('#sw-spawn-go')?.addEventListener('click', () => {
      const key = (this.practiceEl.querySelector('#sw-spawn-enemy') as HTMLSelectElement | null)?.value;
      const count = Number((this.practiceEl.querySelector('#sw-spawn-count') as HTMLInputElement | null)?.value ?? 1);
      if (key) this.cb.onDev('spawn', count, key);
    });
  }

  /**
   * Lights the practice tool's toggle buttons from the sim, not from click
   * count. A dropped command or an odd number of clicks would otherwise leave
   * the button disagreeing with the World about whether the tool is on.
   */
  private syncPracticeToggles(w: World): void {
    if (this.practiceEl.hidden) return;
    for (const [op, on] of TOGGLE_STATE(w)) {
      const el = this.practiceEl.querySelector(`[data-dev="${op}"]`);
      el?.classList.toggle('on', on);
    }
  }

  /** Reflects whether range rings are on; the game loop owns the setting. */
  setShowRanges(on: boolean): void {
    const el = this.root.querySelector('#sw-ranges');
    if (!el) return;
    el.setAttribute('aria-pressed', String(on));
    el.classList.toggle('on', on);
  }

  /**
   * Lights the auto-pick button from the sim's own `cfg.autoPickLevelUps`,
   * not from click count, the same reasoning `syncPracticeToggles` uses: the
   * flag can change via a `set_autopick` Command from any source (this
   * button, a bot, a replay), and the button must agree with the World.
   * Public (and takes the resolved boolean, not `World`) so `main.ts` can
   * call it straight from the click handler: `hud.update` — the only other
   * caller — never runs while paused (`Game.frame` returns early), so
   * relying on it alone left the button's `aria-pressed`/`.on` state frozen
   * across paused clicks even though the queued Command and `this.meta`
   * were already alternating correctly (b065).
   *
   * Also the source `showPause`'s Options screen reads for its own checkbox
   * (`this.autoPickOn`, b068): that screen used to read `w.cfg.
   * autoPickLevelUps` directly at render time, which is exactly the stale
   * paused-sim-state class b030 and b065 already fixed for the other two
   * call sites — a paused sidebar toggle followed by opening Options showed
   * the pre-toggle value. `update`'s per-frame call and `onToggleAutoPick`'s
   * per-click call keep it current from then on, but neither fires before
   * the first tick or the first click, so `main.ts`'s `startRun` seeds it
   * from `cfg.autoPickLevelUps` explicitly the same way it seeds
   * `setSpeed`/`setShowRanges` — a fresh `Hud` otherwise briefly disagrees
   * with a returning player's carried-over `true` setting if Options is
   * opened before either fires (code-reviewer finding on this item).
   */
  private autoPickOn = false;

  syncAutoPickToggle(on: boolean): void {
    this.autoPickOn = on;
    const el = this.root.querySelector('#sw-autopick');
    if (!el) return;
    el.setAttribute('aria-pressed', String(on));
    el.classList.toggle('on', on);
  }

  /** True while the character panel is open — presentation state, read by tests and `main.ts`. */
  get characterPanelOpen(): boolean {
    return this.charPanelOpen;
  }

  /**
   * SPEC-FINAL §2/§6.3/§11, owner feedback `feature-boon-stats-panel`
   * (fb004): every final stat's §2 multiplier breakdown by source, plus
   * every boon taken this run with its rank and current contribution.
   *
   * Uses its own DOM element (`#sw-charpanel`) rather than the pause/level-up
   * /results modal (`this.modal`), but the two are not independent overlays
   * once both can be visible: they are siblings painted in the same
   * `position: absolute; inset: 0` stack, so opening this one on top of an
   * already-showing level-up offer screen or pause card would hide it and
   * eat its clicks (code-reviewer finding: reproduced by opening the level-up
   * screen, then this panel, and finding both `hidden === false` at once).
   * Refusing to open while paused or while `this.modal` is showing avoids
   * that entirely, rather than trying to z-index or coordinate two
   * independently-driven overlays. Available "in both phases" (SPEC-FINAL
   * §11) still holds: any `outcome === 'running'` run, Act I or Act II, just
   * not stacked on top of the other overlay `Hud` already owns.
   * `update()` force-closes it once the run ends, since the results screen
   * owns the overlay at that point.
   */
  toggleCharacterPanel(w: World): void {
    if (this.charPanelOpen) {
      this.closeCharacterPanel();
      return;
    }
    if (w.outcome !== 'running' || this.paused || !this.modal.hidden) return;
    // The DPS panel is the same kind of sibling overlay this panel already
    // refuses to stack under `this.modal` for — opening on top of it would
    // hide it and eat its clicks the same way (qa-playtester finding: fb007
    // opened over an already-showing Character panel with neither closing
    // the other). The docked tab (fb024) shares `.sw-stage`'s stacking
    // context and would otherwise float on top of this panel too — check
    // `dpsPanelDocked_` as well, not just the fully-open flag (code-reviewer
    // finding).
    if (this.dpsPanelOpen_ || this.dpsPanelDocked_) this.closeDpsPanel();
    // fb037: the VS panel is the same kind of sibling overlay.
    if (this.vsPanelOpen_ || this.vsPanelDocked_) this.closeVsPanel();
    this.charPanelOpen = true;
    this.renderCharacterPanel(w);
  }

  closeCharacterPanel(): void {
    this.charPanelOpen = false;
    this.lastCharPanelKey = '';
    this.charPanelEl.hidden = true;
    this.charPanelEl.classList.add('sw-off');
    this.charPanelEl.innerHTML = '';
  }

  /**
   * `Stats.revision` (stats.ts) bumps once per stored contribution — a boon
   * pick, a Core step purchase, a Sundering's terrain passives, the
   * once-only map-modifier application — and nothing else, so it is an
   * exhaustively correct "has anything in here changed" signal, unlike a
   * hand-picked list of World fields. `w.sundered` in particular is a
   * one-shot flag that stays `true` across every Sundering after the first,
   * so keying on it (an earlier version of this code did) went stale the
   * moment `terrain` accumulated a second time (code-reviewer finding).
   */
  private renderCharacterPanel(w: World): void {
    // fb022 code-reviewer finding: Blood Frenzy's phase-dependent swing
    // (`classAttackPowerMul`) reads `w.huntsWarden` live but never touches
    // `Stats`, so `w.stats.revision` alone cannot see a TD<->VS transition —
    // folding phase into the key keeps the panel's live damage number from
    // going stale across the Sundering while it is open.
    const key = `char:${w.stats.revision}:${w.huntsWarden}`;
    if (key === this.lastCharPanelKey) return;
    this.lastCharPanelKey = key;
    this.charPanelEl.hidden = false;
    this.charPanelEl.classList.remove('sw-off');
    this.charPanelEl.innerHTML = characterPanelMarkup(characterPanelData(w), w, this.keyBindings);
    this.charPanelEl.querySelector('[data-act="close"]')?.addEventListener('click', () => this.closeCharacterPanel());
    for (const el of this.charPanelEl.querySelectorAll<HTMLElement>('[data-runeqslot]')) {
      const slot = el.dataset.runeqslot!;
      el.addEventListener('click', () => {
        if (w.equippedEquipment[slot]) this.cb.onEquipItem(slot, null);
      });
    }
    for (const el of this.charPanelEl.querySelectorAll<HTMLElement>('[data-runitem]')) {
      const key = el.dataset.runitem!;
      el.addEventListener('click', () => {
        const item = w.content.equipmentByKey.get(key);
        if (!item) return;
        const isEq = w.equippedEquipment[item.slot] === key;
        this.cb.onEquipItem(item.slot, isEq ? null : key);
      });
    }
  }

  private syncCharacterPanelToggle(): void {
    const el = this.root.querySelector('#sw-character');
    if (!el) return;
    el.setAttribute('aria-pressed', String(this.charPanelOpen));
    el.classList.toggle('on', this.charPanelOpen);
  }

  /** True while the DPS panel is open — presentation state, read by tests and `main.ts`. */
  get dpsPanelOpen(): boolean {
    return this.dpsPanelOpen_;
  }

  /** True while the DPS panel's edge tab is showing (docked, not open) — fb024. */
  get dpsPanelDocked(): boolean {
    return this.dpsPanelDocked_;
  }

  /**
   * SPEC-FINAL §11, owner feedback `feature-dps-summary` (fb007): damage
   * dealt and DPS over the current wave and the whole run, by source and by
   * damage type. Same refusal rule as `toggleCharacterPanel` (fb004): kept
   * mutually exclusive with the Character/VS panels so at most one of these
   * independently-driven overlays ever shows at once, even though the panel
   * itself docks to the stage edge (`.sw-dock`, fb051) rather than covering
   * it full-screen.
   */
  toggleDpsPanel(w: World): void {
    if (this.dpsPanelOpen_) {
      this.dockDpsPanel();
      return;
    }
    if (w.outcome !== 'running' || this.paused || !this.modal.hidden) return;
    // See `toggleCharacterPanel`'s matching comment: without this, the two
    // panels could both render at once (qa-playtester finding).
    if (this.charPanelOpen) this.closeCharacterPanel();
    if (this.vsPanelOpen_ || this.vsPanelDocked_) this.closeVsPanel();
    this.dpsPanelDocked_ = false;
    this.dpsDockEl.hidden = true;
    this.dpsDockEl.classList.add('sw-off');
    this.dpsPanelOpen_ = true;
    this.renderDpsPanel(w);
  }

  /**
   * User-initiated close from the panel's own button (owner feedback
   * `bug-dps-panel-close`, fb024): collapses to a small reopenable tab at the
   * stage edge instead of vanishing outright. A forced close (pause, run end,
   * another overlay opening) still goes through `closeDpsPanel`, which hides
   * the tab too — those are system interruptions, not a user "I'm done"
   * signal, so there is nothing worth re-offering a one-click reopen for.
   */
  dockDpsPanel(): void {
    this.dpsPanelOpen_ = false;
    this.dpsPanelEl.hidden = true;
    this.dpsPanelEl.classList.add('sw-off');
    this.dpsPanelDocked_ = true;
    this.dpsDockEl.hidden = false;
    this.dpsDockEl.classList.remove('sw-off');
    this.syncDpsPanelToggle();
  }

  closeDpsPanel(): void {
    this.dpsPanelOpen_ = false;
    this.dpsPanelDocked_ = false;
    this.dpsPanelEl.hidden = true;
    this.dpsPanelEl.classList.add('sw-off');
    this.dpsPanelEl.innerHTML = '';
    this.dpsDockEl.hidden = true;
    this.dpsDockEl.classList.add('sw-off');
  }

  /**
   * Damage keeps changing every tick, unlike the character panel's
   * rarely-changing stats, so this redraws unconditionally on every
   * `update()` call while open. Only `.sw-dps-body` is replaced per tick —
   * the shell (including the Dock button) is built once per open and its
   * element identity left untouched afterward. A full `innerHTML` replace at
   * 60Hz was the actual cause behind owner feedback `bug-dps-panel-close`:
   * a real mouse's mousedown and mouseup land in different animation
   * frames, so a button recreated between them can silently drop the click
   * (jsdom's synchronous `.click()` in tests never straddles a frame, which
   * is why the bug had no failing test before this fix).
   */
  private renderDpsPanel(w: World): void {
    this.dpsPanelEl.hidden = false;
    this.dpsPanelEl.classList.remove('sw-off');
    let body = this.dpsPanelEl.querySelector('.sw-dps-body') as HTMLElement | null;
    if (!body) {
      this.dpsPanelEl.innerHTML = dpsPanelShellMarkup();
      this.dpsPanelEl.querySelector('[data-act="dock"]')?.addEventListener('click', () => this.dockDpsPanel());
      body = this.dpsPanelEl.querySelector('.sw-dps-body') as HTMLElement;
    }
    body.innerHTML = dpsPanelBodyMarkup(dpsPanelData(w));
  }

  private syncDpsPanelToggle(): void {
    const el = this.root.querySelector('#sw-dps');
    if (!el) return;
    el.setAttribute('aria-pressed', String(this.dpsPanelOpen_));
    el.classList.toggle('on', this.dpsPanelOpen_);
  }

  /** True while the VS wielded-attacks panel is open — presentation state, read by tests and `main.ts`. */
  get vsPanelOpen(): boolean {
    return this.vsPanelOpen_;
  }

  /** True while the VS panel's edge tab is showing (docked, not open) — fb037, reusing fb024's pattern. */
  get vsPanelDocked(): boolean {
    return this.vsPanelDocked_;
  }

  /**
   * SPEC-FINAL §6.2, owner feedback `feature-vs-wielded-side-panel` (fb037):
   * one row per wielded tower type — derived damage, attack speed, range,
   * pierce/AoE, damage-type split, active milestone special, and live DPS
   * this wave. Same refusal rule as `toggleCharacterPanel`/`toggleDpsPanel`:
   * kept mutually exclusive so at most one of these panels ever shows at
   * once (see `toggleDpsPanel`'s matching comment on why that no longer
   * means "full-stage").
   *
   * Also refuses outside `w.huntsWarden` (qa-playtester finding): a tower
   * wields nothing until the Sundering — `updateWieldedAttacks` is only ever
   * called from `updateAct2` (`sim/run.ts`) — so opening this pre-Sundering
   * would show a built TD tower's row with the §6.1 wielded formula's numbers
   * (Power/Type Mastery-scaled, +10%-per-tower bonus) and a hover-ring drawn
   * at the Warden, neither of which is what that tower is actually doing
   * right now. The sibling lineage panel this item extends already gates the
   * same way (`renderWeaponInfo`'s own `if (w.huntsWarden)` call site).
   */
  toggleVsPanel(w: World): void {
    if (this.vsPanelOpen_) {
      this.dockVsPanel();
      return;
    }
    if (w.outcome !== 'running' || this.paused || !this.modal.hidden || !w.huntsWarden) return;
    if (this.charPanelOpen) this.closeCharacterPanel();
    if (this.dpsPanelOpen_ || this.dpsPanelDocked_) this.closeDpsPanel();
    this.vsPanelDocked_ = false;
    this.vsDockEl.hidden = true;
    this.vsDockEl.classList.add('sw-off');
    this.vsPanelOpen_ = true;
    this.renderVsPanel(w);
  }

  /** fb024's dock pattern, reused verbatim: the panel's own close button collapses to a reopenable edge tab. */
  dockVsPanel(): void {
    this.vsPanelOpen_ = false;
    this.vsPanelEl.hidden = true;
    this.vsPanelEl.classList.add('sw-off');
    this.vsPanelDocked_ = true;
    this.vsDockEl.hidden = false;
    this.vsDockEl.classList.remove('sw-off');
    // Clears whatever row was hovered when the panel closed — otherwise the
    // range ring it drew would keep drawing with no panel left to explain it
    // (the same reasoning `renderBottomBar` clears `hoveredSkill` for on pause).
    this.cb.onHoverWieldedTower?.(null);
    this.syncVsPanelToggle();
  }

  closeVsPanel(): void {
    this.vsPanelOpen_ = false;
    this.vsPanelDocked_ = false;
    this.vsPanelEl.hidden = true;
    this.vsPanelEl.classList.add('sw-off');
    this.vsPanelEl.innerHTML = '';
    this.vsDockEl.hidden = true;
    this.vsDockEl.classList.add('sw-off');
    this.cb.onHoverWieldedTower?.(null);
  }

  /**
   * Damage/roster numbers keep changing, so this redraws unconditionally on
   * every `update()` call while open — same reasoning as `renderDpsPanel`.
   * Only `.sw-vs-body` is replaced per tick; the shell (Dock button plus the
   * row-hover delegation) is wired once per open and its element identity
   * left untouched afterward (fb024's click-drop lesson).
   */
  private renderVsPanel(w: World): void {
    this.vsPanelEl.hidden = false;
    this.vsPanelEl.classList.remove('sw-off');
    let body = this.vsPanelEl.querySelector('.sw-vs-body') as HTMLElement | null;
    if (!body) {
      this.vsPanelEl.innerHTML = vsPanelShellMarkup();
      this.vsPanelEl.querySelector('[data-act="dock"]')?.addEventListener('click', () => this.dockVsPanel());
      body = this.vsPanelEl.querySelector('.sw-vs-body') as HTMLElement;
      // fb037: hovering (or, since each row carries `tabindex="0"`,
      // keyboard-focusing) a row draws that attack's range ring around the
      // Warden. Delegated on the body container (whose element identity
      // survives every per-tick `innerHTML` replace below), not on the rows
      // themselves, which do not. `focusin`/`focusout` are `focus`/`blur`'s
      // bubbling equivalents — required for delegation, since plain
      // `focus`/`blur` never bubble.
      const enter = (e: Event) => {
        const row = (e.target as HTMLElement).closest<HTMLElement>('[data-vs-key]');
        if (row) this.cb.onHoverWieldedTower?.(row.dataset.vsKey!);
      };
      const leave = (e: FocusEvent | MouseEvent) => {
        const related = (e as MouseEvent).relatedTarget as HTMLElement | null;
        if (!related || !related.closest('[data-vs-key]')) this.cb.onHoverWieldedTower?.(null);
      };
      body.addEventListener('mouseover', enter);
      body.addEventListener('mouseout', leave);
      body.addEventListener('focusin', enter);
      body.addEventListener('focusout', leave);
    }
    body.innerHTML = vsPanelBodyMarkup(vsPanelRows(w));
  }

  private syncVsPanelToggle(): void {
    const el = this.root.querySelector('#sw-vs');
    if (!el) return;
    el.setAttribute('aria-pressed', String(this.vsPanelOpen_));
    el.classList.toggle('on', this.vsPanelOpen_);
  }

  /** Reflects the pacer's speed; the pacer itself owns cycling/direct-set. */
  setSpeed(speed: number): void {
    this.speedSel.value = String(speed);
    this.speedSel.classList.toggle('on', speed !== 1);
  }

  /**
   * True while a full-stage overlay owns input, so clicks must not reach the
   * canvas. fb051 (bug-dps-panel-style): the DPS and VS panels dock to the
   * stage's edge (`.sw-dock`) rather than covering it, so they no longer
   * count here — gameplay stays visible and clickable while either is open.
   */
  get modalOpen(): boolean {
    return !this.modal.hidden || !this.charPanelEl.hidden;
  }

  get canvas(): HTMLCanvasElement {
    return this.root.querySelector('#sw-canvas') as HTMLCanvasElement;
  }

  /**
   * fb094: dev-profile-only canvas capture, reachable without leaving the run
   * (the button is only ever in the markup at all under `devMode`, see the
   * constructor). Same Blob + `URL.createObjectURL` + anchor-click download
   * idiom `tuner.ts`'s "Export JSON" button already uses, guarded the same
   * way against a `URL`-less environment (`typeof URL === 'undefined'`, e.g.
   * a stripped-down test runner) so a missing browser API is a silent no-op,
   * not a thrown error.
   */
  private exportScreenshot(): void {
    const canvas = this.canvas;
    if (typeof canvas.toBlob !== 'function') return;
    canvas.toBlob((blob) => {
      if (!blob || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stonewake-screenshot-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }

  buildTowerBar(w: World): void {
    const towers = w.content.towers.towers;
    this.bar.innerHTML = '';
    towers.forEach((t, i) => {
      const b = document.createElement('button');
      b.className = 'sw-tower';
      b.dataset.id = String(t.id);
      // b032: the description used to render as its own row, doubling every
      // button's height and pushing the last few rows below a 1080-tall
      // viewport; it is one hover away in the title tooltip and repeated in
      // full in the towerinfo panel (`towerInfoMarkup`'s `attackText`).
      b.title = t.desc;
      b.innerHTML = `<span class="sw-swatch" style="background:${TOWER_COLORS[t.key] ?? '#888'}"></span>
        <span class="sw-tname">${i + 1}. ${t.name}</span>
        <span class="sw-tcost" data-cost="${t.id}"></span>`;
      b.addEventListener('click', () => this.select(t.id));
      this.bar.appendChild(b);
    });
  }

  select(id: number): void {
    this.selected = this.selected === id ? 0 : id;
    for (const el of this.bar.querySelectorAll('.sw-tower')) {
      el.classList.toggle('sel', el.getAttribute('data-id') === String(this.selected));
    }
    this.cb.onSelectTower(this.selected);
  }

  selectByIndex(w: World, index: number): void {
    const towers = w.content.towers.towers;
    const t = towers[index];
    if (t) this.select(t.id);
  }

  clearSelection(): void {
    this.selected = 0;
    for (const el of this.bar.querySelectorAll('.sw-tower')) el.classList.remove('sel');
    this.cb.onSelectTower(0);
  }

  update(w: World, cursor?: { x: number; y: number }, selection: Selection = null): void {
    // fb084: checked at most once per `Hud` instance — a fresh `Hud` is
    // constructed every `beginRun`, so this fires once per run, catching a
    // genuinely fresh run's starting phase without re-triggering across the
    // TD<->VS cycle machine's later returns to 'act1_build'.
    if (!this.onboardingBuildChecked) {
      this.onboardingBuildChecked = true;
      if (w.phase === 'act1_build') this.triggerOnboarding('build');
    }
    const d = w.derived;
    const hpPct = Math.max(0, (w.warden.hp / d.maxHp) * 100);

    this.stats.innerHTML = `
      <div class="sw-row"><span>Warden</span><b>${Math.ceil(w.warden.hp)} / ${Math.round(d.maxHp)}</b></div>
      <div class="sw-meter"><i style="width:${hpPct}%"></i></div>
      ${
        w.huntsWarden
          ? `<div class="sw-row"><span>Level</span><b>${w.level}</b></div>
             <div class="sw-row"><span>Kills</span><b>${w.kills}</b></div>`
          : `<div class="sw-row"><span>Core</span><b>${Math.max(0, Math.ceil(w.coreHp))} / ${w.coreMaxHp}</b></div>
             <div class="sw-meter core"><i style="width:${Math.max(0, (w.coreHp / w.coreMaxHp) * 100)}%"></i></div>
             <div class="sw-row"><span>Gold</span><b class="gold">${w.gold}</b></div>
             <div class="sw-row" title="Enemies that reached the Core: they're loose in the dark and will swell tonight's horde"><span>Loose in the dark</span><b>${w.looseInTheDark}</b></div>`
      }
      <div class="sw-row"><span>Dash</span><b>${w.warden.dashCharges}/${d.dashCharges}</b></div>
      ${this.activeRow(w)}
      ${
        Object.keys(w.boonRanks).length > 0
          ? `<div class="sw-sub">Boons</div>` +
            Object.entries(w.boonRanks)
              .map(
                ([k, v]) =>
                  `<div class="sw-row small"><span>${w.content.boonByKey.get(k)?.name ?? k}</span><b>${v}</b></div>`,
              )
              .join('')
          : ''
      }
      ${
        Object.keys(w.typeMasteryRanks).length > 0
          ? `<div class="sw-sub">Type Mastery</div>` +
            Object.entries(w.typeMasteryRanks)
              .map(
                ([k, v]) =>
                  `<div class="sw-row small"><span>${w.content.towerByKey.get(k)?.name ?? k}</span><b>${v}</b></div>`,
              )
              .join('')
          : ''
      }
      ${
        Object.keys(w.skillCardRanks).length > 0
          ? `<div class="sw-sub">Skill Cards</div>` +
            Object.entries(w.skillCardRanks)
              .map(
                ([k, v]) =>
                  `<div class="sw-row small"><span>${w.content.skillCardByKey.get(k)?.name ?? k}</span><b>${v}</b></div>`,
              )
              .join('')
          : ''
      }`;

    for (const el of this.bar.querySelectorAll<HTMLElement>('.sw-tcost')) {
      const id = Number(el.getAttribute('data-cost'));
      const def = w.content.towerById.get(id);
      if (!def) continue;
      const cost = towerCost(w, def);
      el.textContent = `${cost}g`;
      el.classList.toggle('poor', w.gold < cost);
    }
    this.bar.classList.toggle('hidden', w.huntsWarden);
    this.progressEl.innerHTML = progressMarkup(runProgress(w));
    this.syncPracticeToggles(w);
    this.syncAutoPickToggle(w.cfg.autoPickLevelUps === true);
    if (this.charPanelOpen && w.outcome !== 'running') this.closeCharacterPanel();
    else if (this.charPanelOpen) this.renderCharacterPanel(w);
    this.syncCharacterPanelToggle();
    if ((this.dpsPanelOpen_ || this.dpsPanelDocked_) && w.outcome !== 'running') this.closeDpsPanel();
    else if (this.dpsPanelOpen_) this.renderDpsPanel(w);
    this.syncDpsPanelToggle();
    // §6.1's cycle machine can walk `w.huntsWarden` back to false (the next
    // cycle's Day) while the panel sits open from the previous VS wave — a
    // system interruption exactly like the run ending, not a user "I'm done".
    if ((this.vsPanelOpen_ || this.vsPanelDocked_) && (w.outcome !== 'running' || !w.huntsWarden)) this.closeVsPanel();
    else if (this.vsPanelOpen_) this.renderVsPanel(w);
    this.syncVsPanelToggle();
    this.syncRailRightVisibility();
    this.syncStageOverlayGeometry();
    this.renderBottomBar(w);
    this.renderBossBar(w);
    this.renderOnboarding();
    // A selection describes itself — but never at the cost of the panels the
    // player needs to act: a tower queued on the build bar has to show its own
    // stats, and in Act II the weapon panel carries the only weapon switcher
    // (b077: gated on the current-phase `w.huntsWarden`, not the permanent
    // `w.sundered` flag, or every selection panel died forever after the
    // first Sundering, TD and VS alike). The Warden itself is exempted: its
    // own panel (fb029's range/wielded-range rows) is exactly what a VS-phase
    // click on the character is for, and does not compete with the weapon
    // panel the way a tower/enemy/Core selection would.
    const blocking = this.selected > 0 || (w.huntsWarden && selection?.kind !== 'warden');
    if (!blocking && this.renderSelectionInfo(w, selection)) return;
    this.renderTowerInfo(w, cursor);
  }

  /**
   * fb082: the floating rails (fb065) and boss banner (fb072) used to anchor
   * to `.sw-stage`'s own full box via plain CSS (`top/bottom/left/right: 8px`,
   * `left: 50%`), which drifts away from the actual playfield whenever the
   * container's aspect ratio isn't the grid's 36:20 — `Renderer.resize()`
   * (`src/render/canvas.ts`) letterboxes the canvas inside `.sw-stage` rather
   * than filling it, so the stage's box and the canvas's own laid-out rect can
   * differ by a wide margin at an extreme aspect ratio. Re-derives that same
   * letterboxing math (mirrored here rather than read off the canvas element
   * itself, so this works identically under jsdom's `clientWidth`/
   * `clientHeight` mocking idiom `tests/render-fb065-stage-fill.test.ts`
   * already uses — jsdom never runs real layout, so `getBoundingClientRect()`
   * would read all zeros regardless of what's mocked) and publishes the
   * canvas's offset from each stage edge as CSS custom properties the
   * `.sw-rail`/`.sw-bossbar` rules (style.css) key off, falling back to `0px`/
   * `50%` — i.e. exactly the old stage-relative behavior — whenever the stage
   * isn't laid out yet (jsdom, or a not-yet-painted first frame).
   *
   * Called every `update()` tick, but `update()` itself is only reached on an
   * active-run frame that isn't paused (`Game.frame()`, `src/ui/main.ts`) — a
   * window resize while paused would otherwise leave this geometry stale until
   * the run resumes, so `frame()`'s paused branch also calls this directly
   * (this method is `public`, not `private`, for exactly that call site).
   */
  syncStageOverlayGeometry(): void {
    const stage = this.stageEl;
    if (!stage) return;
    const availW = stage.clientWidth;
    const availH = stage.clientHeight;
    if (availW <= 0 || availH <= 0) {
      stage.style.removeProperty('--cv-left');
      stage.style.removeProperty('--cv-right');
      stage.style.removeProperty('--cv-top');
      stage.style.removeProperty('--cv-bottom');
      stage.style.removeProperty('--cv-cx');
      stage.style.removeProperty('--bossbar-maxw');
      return;
    }
    const aspect = GRID_W / GRID_H;
    const cssW = Math.round(Math.min(availW, availH * aspect));
    const cssH = cssW / aspect;
    // qa-playtester (fb082 verification): `Renderer.resize()`'s own `Math.round(cssW)`
    // (mirrored above) can round cssW up enough that the derived cssH exceeds availH
    // by a sub-device-pixel amount for specific availH values, which would otherwise
    // surface here as a tiny negative offset — clamped to 0, since a rail/boss-bar
    // sitting a fraction of a pixel outside the canvas's own box is never intended.
    const left = Math.max(0, (availW - cssW) / 2);
    const right = Math.max(0, availW - cssW - left);
    const top = Math.max(0, (availH - cssH) / 2);
    stage.style.setProperty('--cv-left', `${left}px`);
    stage.style.setProperty('--cv-right', `${right}px`);
    stage.style.setProperty('--cv-top', `${top}px`);
    stage.style.setProperty('--cv-bottom', `${Math.max(0, availH - cssH - top)}px`);
    const cx = left + cssW / 2;
    stage.style.setProperty('--cv-cx', `${cx}px`);
    // fb102: `.sw-bossbar` is centered (`left: var(--cv-cx)`) at a fixed
    // 360px, and each `.sw-rail` at a fixed 300px, with no relationship
    // between the two — at any stage narrow enough that those fixed boxes
    // (plus their edge gaps) don't fit side by side, the centered boss bar
    // overlaps whichever rail is expanded. Computed against each rail's own
    // worst-case (fully expanded) footprint rather than its live collapsed/
    // open state, so the boss bar never has to react to a rail toggling.
    // code-reviewer (fb102): style.css's own breakpoint is a *viewport*-width
    // media query, not a container query on `.sw-stage`, so this substitutes
    // `availW` (the stage's width) as a proxy. Safe in the narrow-only
    // direction that matters here — `.sw-stage` is `flex: 1 1 auto` with no
    // sibling that could widen it past the viewport, so `availW` can never
    // exceed the real viewport width the CSS breakpoint keys off, meaning
    // this can only guess "narrow" (and shrink the boss bar) at least as
    // readily as the real CSS rule, never less.
    const railFraction = availW <= RAIL_NARROW_BREAKPOINT_PX ? RAIL_NARROW_MAX_FRACTION : RAIL_WIDE_MAX_FRACTION;
    const railW = Math.min(RAIL_WIDTH_PX, railFraction * availW);
    const leftRailRightEdge = left + RAIL_EDGE_GAP_PX + railW;
    const rightRailLeftEdge = availW - right - RAIL_EDGE_GAP_PX - railW;
    const maxFromLeft = 2 * (cx - leftRailRightEdge - BOSSBAR_MIN_GAP_PX);
    const maxFromRight = 2 * (rightRailLeftEdge - BOSSBAR_MIN_GAP_PX - cx);
    // code-reviewer (fb109): floor clamped against `availW` too, so a stage
    // narrower than the floor itself (far past any real device/browser
    // minimum) still keeps the boss bar inside the stage's own box instead
    // of spilling past its edges — the floor degrades toward "as wide as the
    // stage allows," never wider.
    const bossMaxW = Math.max(
      Math.min(BOSSBAR_MIN_WIDTH_PX, availW),
      Math.min(BOSSBAR_WIDTH_PX, maxFromLeft, maxFromRight)
    );
    stage.style.setProperty('--bossbar-maxw', `${bossMaxW}px`);
  }

  /**
   * fb072: a fixed-position banner (name + proportional HP-fraction bar) for
   * any live `boss`-trait enemy — the per-enemy HP bar under its sprite
   * (fb025) is illegible at boss HP scales (30k-100k), and G14/G23's
   * boss-clear gates otherwise have no legible HUD read on fight progress.
   * If more than one boss is alive at once, shows the lower-current-HP one
   * (the fight closer to resolving), per acceptance. Hidden behind
   * `this.modalOpen` (pause/level-up/results/character panel) the same way
   * `renderBottomBar` hides `#sw-bottombar` — those overlays are
   * semi-transparent/blurred, not opaque, so without this the name and HP
   * fraction would still read through underneath (qa-playtester, fb072
   * verification).
   */
  private renderBossBar(w: World): void {
    let boss: (typeof w.enemies)[number] | null = null;
    if (w.outcome === 'running' && !this.modalOpen) {
      for (const e of w.enemies) {
        if (e.dead || !e.boss) continue;
        if (!boss || e.hp < boss.hp) boss = e;
      }
    }
    if (!boss) {
      this.bossBarEl.hidden = true;
      this.bossBarEl.classList.add('sw-off');
      return;
    }
    this.bossBarEl.hidden = false;
    this.bossBarEl.classList.remove('sw-off');
    const def = w.content.enemyById.get(boss.defId);
    this.bossBarNameEl.textContent = def?.name ?? String(boss.defId);
    const frac = Math.max(0, Math.min(1, boss.hp / boss.maxHp));
    this.bossBarFillEl.style.width = `${frac * 100}%`;
  }

  /**
   * fb026: the persistent bottom bar — HP/gold with numbers, the passive
   * icon's live state, and Active1(Q)/Active2(E) with a MOBA-style clockwise
   * cooldown sweep, a multi-charge badge and a one-shot ready flash. Visible
   * in both TD and VS phases (unlike the tower bar/build panels, this reads
   * only Warden-side state, none of it TD-specific), so it is never hidden
   * on `w.huntsWarden` the way `this.bar` is.
   *
   * The sweep is a `conic-gradient` mask driven by an inline CSS custom
   * property rather than canvas/SVG math — `data-fraction` carries the same
   * number for tests, so the fraction asserted there is exactly what paints.
   */
  private renderBottomBar(w: World): void {
    // The overlays that are still full-stage sheets (pause/level-up/results,
    // the character panel) hide the bar the same way `openModal`'s own
    // panel-closing calls avoid stacking under them — painting the bar on top
    // would float readable HP/gold numbers over what should be an opaque
    // cover. The docked DPS/VS panels (fb051) are not full-stage, so they
    // leave the bar showing.
    const wasHidden = this.bb.root.classList.contains('sw-off');
    this.bb.root.classList.toggle('sw-off', this.modalOpen);
    if (this.modalOpen) {
      // A browser never fires `mouseleave` on an element hidden out from
      // under the pointer (`display: none` via `.sw-off`) — pausing mid-hover
      // would otherwise leave `view.hoveredSkill` stuck, still drawing that
      // skill's range ring on the map after Resume (code-reviewer finding).
      if (!wasHidden) this.cb.onHoverSkill(null);
      return;
    }
    const data = bottomBarData(w);
    this.bb.hpNum.textContent = `${Math.ceil(data.hp.current)} / ${Math.round(data.hp.max)}`;
    this.bb.hpFill.style.width = `${data.hp.max > 0 ? Math.max(0, (data.hp.current / data.hp.max) * 100) : 0}%`;
    this.bb.goldNum.textContent = `${data.gold}`;

    this.bb.passiveState.textContent = data.passive.stateText;
    const cls = w.content.classByKey.get(w.cfg.classKey);
    if (cls) {
      this.bb.passiveTip.innerHTML = passiveSkillMarkup(cls);
      this.bb.towerPassiveTip.innerHTML = towerPassiveSkillMarkup(cls);
      const live: ClassLiveContext = {
        cdr: w.derived.cdr,
        atkFlat: w.derived.atkFlat,
        damageMul: classAttackPowerMul(w, cls),
        active2CdrFactor: active2CdrFactor(w),
      };
      this.bb.a1Tip.innerHTML = activeSkillMarkup(cls, 'active1', live, this.keyBindings);
      this.bb.a2Tip.innerHTML = activeSkillMarkup(cls, 'active2', live, this.keyBindings);
    }

    this.renderSkillIcon(data.active1, this.bb.a1Sweep, this.bb.a1Charge, this.bb.a1Cd, this.bb.a1Icon, 'active1');
    this.renderSkillIcon(data.active2, this.bb.a2Sweep, this.bb.a2Charge, this.bb.a2Cd, this.bb.a2Icon, 'active2');
  }

  private renderSkillIcon(
    s: SkillIconState,
    sweepEl: HTMLElement,
    chargeEl: HTMLElement,
    cdEl: HTMLElement,
    iconEl: HTMLElement,
    which: 'active1' | 'active2',
  ): void {
    sweepEl.style.setProperty('--sw-bb-frac', String(s.sweepFraction));
    sweepEl.dataset.fraction = s.sweepFraction.toFixed(4);
    cdEl.textContent = s.ready ? 'Ready' : s.cooldownRemaining.toFixed(1) + 's';
    chargeEl.textContent = s.charges ? `${s.charges.current}/${s.charges.max}` : '';
    chargeEl.hidden = !s.charges;
    iconEl.classList.toggle('ready', s.ready);
    if (s.ready && !this.prevSkillReady[which] && !this.settings.reducedFlash) {
      iconEl.classList.remove('sw-bb-flash');
      // Forces a reflow so re-adding the class restarts the CSS animation on
      // a rapid re-ready (multi-charge Actives can flash again within a
      // second) instead of the browser coalescing it into a no-op.
      void iconEl.offsetWidth;
      iconEl.classList.add('sw-bb-flash');
    }
    this.prevSkillReady[which] = s.ready;
  }

  /** One Active's HUD row: name, key binding, and live cooldown state. */
  private static activeSkillRow(name: string, key: string, cd: number, tip: string): string {
    const status = cd > 0 ? `${cd.toFixed(1)}s` : 'Ready';
    return `<div class="sw-row" title="${tip}"><span>${name} (${key})</span><b class="${cd > 0 ? '' : 'ready'}">${status}</b></div>`;
  }

  /** SPEC-FINAL §4's Active1 (Q) + Active2 (E). */
  private activeRow(w: World): string {
    const cls = w.content.classByKey.get(w.cfg.classKey);
    if (!cls) return '';
    return (
      Hud.activeSkillRow(cls.active1.name, keyLabel(this.keyBindings.active1), w.warden.active1Cooldown, cls.active1.name) +
      Hud.activeSkillRow(cls.active2.name, keyLabel(this.keyBindings.active2), w.warden.active2Cooldown, cls.active2.name)
    );
  }

  /**
   * SPEC-FINAL §6.1/§6.2: after the Sundering there is no tower bar, and the
   * only Act II panel is the wielded-tower lineage (p2d).
   */
  private renderWeaponInfo(w: World): void {
    // A cheap proxy for "the built roster changed": build/sell/upgrade only
    // happen between waves, but `!s.dead` also catches a tower an enemy kills
    // mid-VS-wave (the case `removeStructure` exists to invalidate the wielded
    // cache for), so this fingerprint moves exactly when `wieldedAttacks`'s
    // own output would.
    const roster = w.structures
      .filter((s) => !s.dead)
      .map((s) => `${s.towerId}.${s.tier}`)
      .sort()
      .join(',');
    const key = `wielded:${roster}`;
    if (key === this.lastInfoKey) return;
    this.lastInfoKey = key;
    this.towerInfoEl.innerHTML = wieldedLineageMarkup(w);
  }

  /**
   * SPEC-V3 T2: a selected thing gets a stats panel. Returns true when it
   * handled the panel, so the hover path stands down.
   */
  private renderSelectionInfo(w: World, sel: Selection): boolean {
    if (!sel) return false;

    if (sel.kind === 'tower') {
      const s = selectedStructure(w, sel);
      const def = s ? w.content.towerById.get(s.towerId) : undefined;
      if (!s || !def) return false;
      const info = towerInfo(w, def, s);
      // fb027 (code-reviewer findings, confirmed live by qa-playtester as
      // b074/b075): `canAct` (the Upgrade/Sell buttons' live phase/build-
      // range/petrified gate — it moves every tick the Warden does, unlike
      // everything else in this key) and the pact/tithe badges both have to
      // ride the key too, or the panel can sit stale — a badge that never
      // clears once `pactActive` flips back off with `hp`/`tier`/`gold`
      // unchanged, or a button whose disabled state doesn't track the
      // Warden walking out of build range. The HP component itself must use
      // `Math.ceil`, not `Math.round` — `towerInfoMarkup`'s new HP row
      // (tower-info.ts) renders `Math.ceil(existing.hp)`, and a `Math.round`
      // key can hold steady across a real `Math.ceil` bucket change (e.g.
      // hp 10.4 -> 9.9 rounds 10 -> 10 but ceils 11 -> 10), which is exactly
      // the stale-HP bug b074 reproduced.
      const key = `sel:tower:${s.id}:${s.tier}:${Math.ceil(s.hp)}:${w.gold}:${info.canAct}:${s.pactActive}:${s.tithed}`;
      if (key !== this.lastInfoKey) {
        this.lastInfoKey = key;
        this.towerInfoEl.innerHTML = towerInfoMarkup(info, w.gold, true);
      }
      return true;
    }

    if (sel.kind === 'enemy') {
      const e = selectedEnemy(w, sel);
      if (!e) return false;
      // Status effects and speed are in the key: a frost tower slowing an
      // enemy without changing its rounded HP used to leave the panel lying.
      const key = [
        'sel:enemy',
        e.id,
        Math.ceil(e.hp),
        Math.round(e.slowAmount * 100),
        Math.round(e.frostRemaining * 10),
        Math.round(e.frozenRemaining * 10),
        Math.round(dotRemaining(e, 'burning') * 10),
        e.dots.length,
        Math.round(e.buffSpeed * 100),
      ].join(':');
      if (key !== this.lastInfoKey) {
        this.lastInfoKey = key;
        this.towerInfoEl.innerHTML = enemyInfoMarkup(w, e);
      }
      return true;
    }

    if (sel.kind === 'core') {
      // fb022: the Core's own live TD/VS effect text and next-step preview,
      // not the Warden's stat sheet — `w.core` is `World`'s already-resolved
      // `CoreState` (kept in sync by `recomputeCore` on every purchase, see
      // cores.ts), so this reads the exact numbers the sim itself uses.
      // fb027: the affordability boolean and `canAct` (the same phase/
      // build-range gate `upgradeCore` enforces itself, cores.ts) both ride
      // the key, so the Upgrade button's disabled state repaints the instant
      // gold crosses the step's price, or the Warden walks in or out of
      // range, either way (code-reviewer finding, fb027).
      const coreDef = w.content.coreByKey.get(w.coreKey);
      const coreAfford = coreDef && w.coreStep < coreDef.upgrade.count ? w.gold >= coreDef.upgrade.stepCost : true;
      const coreCanAct = canBuildNow(w) && inCoreBuildRange(w);
      const key = `sel:core:${w.coreKey}:${w.coreStep}:${Math.ceil(w.coreHp)}:${Math.round(w.coreMaxHp)}:${coreAfford}:${coreCanAct}`;
      if (key !== this.lastInfoKey) {
        this.lastInfoKey = key;
        this.towerInfoEl.innerHTML = coreLiveMarkup(
          w.content,
          w.coreKey,
          w.coreStep,
          w.core,
          w.coreHp,
          w.coreMaxHp,
          w.gold,
          coreCanAct,
        );
      }
      return true;
    }

    // Every field wardenInfoMarkup renders is in the key, each reduced through
    // the same formatter the row itself uses (not a separately-chosen
    // rounding) so the key can never disagree with what's on screen — the
    // enemy branch above guards the identical staleness class for status
    // effects/speed.
    const wd = w.derived;
    const key = [
      'sel:warden',
      Math.ceil(w.warden.hp),
      Math.round(wd.maxHp),
      w.level,
      w.warden.dashCharges,
      wd.dashCharges,
      round1(wd.hpRegen),
      armourText(wardenArmor(w)),
      round1(wd.moveSpeed),
      formatPercent(wd.powerMul - 1),
      formatPercent(wd.attackSpeedMul - 1),
      formatPercent(wd.areaMul - 1),
      w.huntsWarden ? round1(longestWieldedRange(w)) : round1(characterBasicRange(w)),
    ].join(':');
    if (key !== this.lastInfoKey) {
      this.lastInfoKey = key;
      this.towerInfoEl.innerHTML = wardenInfoMarkup(w);
    }
    return true;
  }

  /**
   * The tower panel: what is under the cursor if that is a structure, otherwise
   * whatever tower is selected on the bar. Re-rendered only when something the
   * panel shows has actually changed, since update() runs every frame.
   */
  private renderTowerInfo(w: World, cursor?: { x: number; y: number }): void {
    if (w.huntsWarden) {
      this.renderWeaponInfo(w);
      return;
    }
    const hovered =
      cursor && w.phase !== 'act2'
        ? w.structureAt(Math.floor(cursor.x), Math.floor(cursor.y))
        : null;
    const def = hovered
      ? w.content.towerById.get(hovered.towerId)
      : this.selected > 0
        ? w.content.towerById.get(this.selected)
        : undefined;

    if (!def) {
      if (this.lastInfoKey !== 'none') {
        this.lastInfoKey = 'none';
        this.towerInfoEl.innerHTML =
          '<p class="sw-note">Pick a tower below, or point at one you have built, to see exactly what it does.</p>';
      }
      return;
    }

    const info = towerInfo(w, def, hovered ?? undefined);
    // fb027: same live gate as the selection-panel branch above — a hovered
    // built tower renders the same live HP row, Upgrade/Sell buttons and
    // pact/tithe badges, so it needs the same key fields (`w.phase` already
    // covered the phase half of `canAct`, but not build-range, live HP, or
    // the pact/tithe flags — before fb027 this branch's only HP-shaped text
    // was the "Blocks path" line's *static* per-tier max HP, never the
    // structure's real live `hp`, so the key never needed to track it).
    const key = [
      def.key,
      hovered ? `built${hovered.id}` : 'plan',
      info.tier,
      w.gold >= (info.buildCost ?? info.upgrade?.cost ?? 0),
      w.phase,
      info.canAct,
      hovered?.pactActive ?? false,
      hovered?.tithed ?? false,
      hovered ? Math.ceil(hovered.hp) : 0,
    ].join(':');
    if (key === this.lastInfoKey) return;
    this.lastInfoKey = key;
    this.towerInfoEl.innerHTML = towerInfoMarkup(info, w.gold, hovered !== null && hovered !== undefined);
  }

  /**
   * Pausing is a presentation state, not a sim one: the loop simply stops
   * stepping, so a paused run resumes bit-identically.
   */
  setPaused(paused: boolean, w: World): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.confirmingAbandon = false;
    this.showingOptions = false;
    this.lastModalKey = '';
    if (paused) this.showPause(w);
    else this.syncModal(w);
  }

  /**
   * fb012: three sub-screens sharing one card slot — the plain pause card, the
   * Abandon confirm, and Options (currently just the auto-pick toggle moved
   * out of the Hub's start menu, replay-safe via the same `set_autopick`
   * Command the level-up screen's toggle and the HUD sidebar button use).
   * Phase-agnostic like the rest of pause (b002): reachable from both Act I
   * and Act II since `togglePause` only gates on `outcome === 'running'`.
   */
  private showPause(w: World): void {
    this.openModal();
    if (this.showingOptions) {
      const on = this.autoPickOn;
      this.modal.innerHTML = `
      <div class="sw-card">
        <h2>Options</h2>
        <label class="sw-setting autopick">
          <span>Auto-pick level-ups</span>
          <input type="checkbox" id="sw-opt-autopick" ${on ? 'checked' : ''} />
        </label>
        <p class="sw-note">${
          on
            ? 'Level-ups resolve themselves: the highest-rank boon you already own, or the first card offered.'
            : 'Level-ups pause the run for your choice.'
        }</p>
        <div class="sw-pausebuttons">
          <button class="sw-reroll" data-act="back">Back</button>
        </div>
      </div>`;
      this.modal.querySelector('#sw-opt-autopick')?.addEventListener('change', () => this.cb.onToggleAutoPick());
      this.modal.querySelector('[data-act="back"]')?.addEventListener('click', () => {
        this.showingOptions = false;
        this.showPause(w);
      });
      return;
    }
    this.modal.innerHTML = this.confirmingAbandon
      ? `
      <div class="sw-card">
        <h2>Abandon run?</h2>
        <p>This ends the run now and returns to the Hub. Nothing from it is kept.</p>
        <div class="sw-pausebuttons">
          <button class="sw-reroll" data-act="cancel">Cancel</button>
          <button class="sw-go" data-act="confirm">Abandon run</button>
        </div>
      </div>`
      : `
      <div class="sw-card">
        <h2>Paused</h2>
        <p>The Vale holds its breath.</p>
        <div class="sw-pausebuttons">
          <button class="sw-go" data-act="resume">Resume</button>
          <button class="sw-reroll" data-act="options">Options</button>
          <button class="sw-reroll" data-act="quit">Abandon run</button>
        </div>
        <p class="sw-note">Esc resumes · abandoning returns to the Hub and keeps nothing.</p>
      </div>`;
    if (this.confirmingAbandon) {
      this.modal
        .querySelector('[data-act="cancel"]')
        ?.addEventListener('click', () => {
          this.confirmingAbandon = false;
          this.showPause(w);
        });
      this.modal
        .querySelector('[data-act="confirm"]')
        ?.addEventListener('click', () => this.cb.onQuitToHub());
    } else {
      this.modal
        .querySelector('[data-act="resume"]')
        ?.addEventListener('click', () => this.cb.onResume());
      this.modal
        .querySelector('[data-act="options"]')
        ?.addEventListener('click', () => {
          this.showingOptions = true;
          this.showPause(w);
        });
      this.modal
        .querySelector('[data-act="quit"]')
        ?.addEventListener('click', () => {
          this.confirmingAbandon = true;
          this.showPause(w);
        });
    }
  }

  /** Modal screens: level-up, results. */
  syncModal(w: World): void {
    if (this.paused) return;
    // fb110: classKey/coreKey are folded in so a `Hud` reused across fresh
    // `World` fixtures without a `resetModalKey()` call (real play always
    // calls it via `startRun`) can't show a stale Results-screen Class/Core
    // from the previous world.
    // fb113: rerollsLeft is folded in too — `rerollOffers` replaces
    // `w.offers` with a fresh array of the same length and decrements this
    // field, so it's the one memo-key-visible signal that a reroll actually
    // happened; without it a reroll was a memo hit and the Level-Up modal
    // kept showing the pre-reroll offer cards.
    const key = `${w.phase}:${w.offers.length}:${w.outcome}:${w.level}:${w.cfg.classKey}:${w.coreKey}:${w.rerollsLeft}`;
    if (key === this.lastModalKey) return;
    this.lastModalKey = key;

    if (w.phase === 'levelup') {
      this.showOffers(w, w.offers);
    } else if (w.phase === 'results') {
      this.showResults(w);
    } else {
      this.hideModal();
    }
  }

  /** Takes the overlay out of the layout; see the `.sw-off` rule in style.css. */
  hideModal(): void {
    this.modal.hidden = true;
    this.modal.classList.add('sw-off');
    this.modal.innerHTML = '';
  }

  /**
   * Every path onto `this.modal` (pause, level-up offers, results) funnels
   * through here, so this is the one place that has to know about the
   * character panel rather than every caller remembering it. `toggleCharacterPanel`
   * already refuses to open a *new* panel on top of an already-showing modal
   * (see its own doc comment) — that only covers panel-then-modal ordering.
   * The reverse (modal-then-panel: open the panel mid-run, then a level-up
   * fires, or the player hits Escape) was not covered and let both opaque,
   * full-stage overlays show at once, the panel on top eating the modal's
   * clicks — a qa-playtester finding on fb004. Closing the panel here
   * handles every current and future `openModal()` caller in one place.
   */
  private openModal(): void {
    if (this.charPanelOpen) this.closeCharacterPanel();
    // The docked tab (fb024) shares `.sw-stage`'s stacking context with
    // `this.modal` and would otherwise float on top of the pause card or a
    // level-up offer screen (code-reviewer finding) — not just the fully-open flag.
    if (this.dpsPanelOpen_ || this.dpsPanelDocked_) this.closeDpsPanel();
    if (this.vsPanelOpen_ || this.vsPanelDocked_) this.closeVsPanel();
    this.modal.hidden = false;
    this.modal.classList.remove('sw-off');
  }

  private showOffers(w: World, offers: Offer[]): void {
    this.openModal();
    // fb012: this screen only ever shows while auto-pick is off (on, it
    // resolves without pausing — see `openLevelUpIfPending`), so the checkbox
    // here is always unchecked. Checking it sends the same `set_autopick`
    // Command every other door onto this setting sends, and `run.ts`'s
    // handler (fb003, deliberately: "never leaving the run parked in
    // levelup") resolves *this* now-showing offer immediately too, the same
    // as it would from the sidebar button or the pause Options screen — the
    // label below says so rather than promising otherwise.
    this.modal.innerHTML = `
      <div class="sw-card">
        <h2>Level ${w.level}</h2>
        <div class="sw-offers">
          ${offers
            .map(
              (o, i) => `<button class="sw-offer ${o.kind}" data-i="${i}">
                <b>${o.name}</b><span>${o.desc}</span>
                <small>${o.kind.toUpperCase()}</small>
              </button>`,
            )
            .join('')}
        </div>
        <button class="sw-reroll" ${!Number.isFinite(w.rerollsLeft) || w.rerollsLeft <= 0 ? 'disabled' : ''}>Reroll (${w.rerollsLeft})</button>
        <label class="sw-setting autopick sw-offer-autopick">
          <span>Auto-pick (this offer too)</span>
          <input type="checkbox" id="sw-offer-autopick" />
        </label>
      </div>`;
    for (const el of this.modal.querySelectorAll<HTMLElement>('.sw-offer')) {
      el.addEventListener('click', () => this.cb.onPickOffer(Number(el.dataset.i)));
    }
    this.modal.querySelector('.sw-reroll')?.addEventListener('click', () => this.cb.onReroll());
    this.modal.querySelector('#sw-offer-autopick')?.addEventListener('change', () => this.cb.onToggleAutoPick());
  }

  private showResults(w: World): void {
    this.openModal();
    const won = w.outcome === 'victory';
    const mm = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    // fb103: falls back to the raw data key for a corrupted-save shape whose
    // classKey/coreKey no longer resolves against loaded content, rather than
    // crashing the results screen a player needs to see regardless.
    const className = w.content.classByKey.get(w.cfg.classKey)?.name ?? w.cfg.classKey;
    const coreName = w.content.coreByKey.get(w.coreKey)?.name ?? w.coreKey;
    this.modal.innerHTML = `
      <div class="sw-card">
        <h2>${won ? 'The Vale holds' : w.outcome === 'defeat_core' ? 'The Core fell' : 'The Warden fell'}</h2>
        <div class="sw-results">
          <div><span>Class</span><b>${className}</b></div>
          <div><span>Core</span><b>${coreName}</b></div>
          <div><span>Waves cleared</span><b>${w.wavesCleared}</b></div>
          <div><span>Survived</span><b>${mm(w.act2Ticks / 60)}</b></div>
          <div><span>Level</span><b>${w.level}</b></div>
          <div><span>Kills</span><b>${w.kills}</b></div>
          <div><span>Towers built</span><b>${w.towersBuilt}</b></div>
          <div><span>Equipment found</span><b>${w.equipmentFound.length}</b></div>
          <div><span>Skill points</span><b>${w.vsWavesCleared}</b></div>
        </div>
        ${w.practiceUsed ? '<p class="sw-note">Practice run — nothing was banked.</p>' : ''}
        <div class="sw-resultbuttons">
          <button class="sw-go" data-act="retry" title="Same seed, run it again">Retry</button>
          <button class="sw-reroll" data-act="newrun" title="Same build, a new seed">New run</button>
          <button class="sw-reroll" data-act="hub">Hub</button>
        </div>
      </div>`;
    this.modal.querySelector('[data-act="retry"]')?.addEventListener('click', () => this.cb.onRetry());
    this.modal.querySelector('[data-act="newrun"]')?.addEventListener('click', () => this.cb.onNewRun());
    this.modal.querySelector('[data-act="hub"]')?.addEventListener('click', () => this.cb.onQuitToHub());
  }

  /**
   * fb089: a toast already showing holds its full window rather than being
   * silently clobbered — a same-or-lower-priority call queues behind it
   * (FIFO), a strictly-higher-priority call preempts it immediately. Default
   * priority 0; fb087's storage-full warning uses a higher priority so a
   * routine `xp_overflow_gold` toast landing in its window can't erase it.
   * A preempting call discards whatever was showing rather than requeuing
   * it — deliberate: today's only preemptor is fb087's one-shot warning,
   * and dropping an in-flight routine gold toast for it is an acceptable
   * trade, not a bug.
   */
  say(text: string, priority = 0): void {
    if (this.toastTimer !== null && priority <= this.toastPriority) {
      this.toastQueue.push({ text, priority });
      return;
    }
    this.showToast(text, priority);
  }

  private showToast(text: string, priority: number): void {
    this.toast.textContent = text;
    this.toast.classList.add('show');
    this.toastPriority = priority;
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastTimer = null;
      const next = this.toastQueue.shift();
      if (next) {
        this.showToast(next.text, next.priority);
      } else {
        this.toast.classList.remove('show');
        this.toastPriority = -Infinity;
      }
    }, 1400);
  }

  /**
   * fb008: one tick's worth of `World.fx` events, scanned for the ones that
   * warrant a toast. Called per-tick from `main.ts`'s frame loop (mirroring
   * `Sfx.emit`'s own per-tick call), not once per rendered frame — `World.fx`
   * is cleared every sim tick, so a once-per-frame read would miss events
   * from earlier ticks during fast-forward.
   */
  ingestFx(fx: readonly { k: string; a: number }[]): void {
    for (const e of fx) {
      if (e.k === 'xp_overflow_gold') this.say(`+${e.a} gold (EXP overflow)`);
      // fb084: 'sweep_to_vs'/'sweep_to_td' (sundering.ts) are the sim's own
      // markers for the Dusk->Night and Dawn transitions the onboarding
      // checklist names — no separate detection logic needed here.
      else if (e.k === 'sweep_to_vs') this.triggerOnboarding('dusk');
      else if (e.k === 'sweep_to_td') this.triggerOnboarding('dawn');
    }
  }

  /**
   * fb084: a later prompt arriving while an earlier one is still showing
   * (realistic — the banner is deliberately non-blocking, so a player who
   * ignores it and keeps playing can easily reach the Dusk transition before
   * ever dismissing the Build one) queues rather than drops — qa-playtester
   * (fb084 verification) found the first draft's "if already showing, just
   * skip it" swallowed the later prompt *permanently*, since nothing but the
   * close button ever cleared `onboardingActive` and the "seen" flag was
   * never set for what got skipped. `dismissOnboarding` pops the queue.
   */
  private triggerOnboarding(key: OnboardingKey): void {
    if (this.onboardingSeen(key)) return;
    if (!this.onboardingActive) {
      this.onboardingActive = { key, text: onboardingText(key, this.keyBindings) };
    } else if (this.onboardingActive.key !== key && !this.onboardingQueue.includes(key)) {
      this.onboardingQueue.push(key);
    }
  }

  private onboardingSeen(key: OnboardingKey): boolean {
    if (key === 'build') return this.settings.onboardingSeenBuild;
    if (key === 'dusk') return this.settings.onboardingSeenDusk;
    return this.settings.onboardingSeenDawn;
  }

  /**
   * fb084: the close button — marks the active prompt seen (persisted via
   * `onOnboardingSeen`) so it never shows again, then immediately shows the
   * next queued prompt (if any) rather than waiting for that prompt's own
   * transition to recur.
   */
  private dismissOnboarding(): void {
    if (!this.onboardingActive) return;
    const key = this.onboardingActive.key;
    const field =
      key === 'build' ? 'onboardingSeenBuild' : key === 'dusk' ? 'onboardingSeenDusk' : 'onboardingSeenDawn';
    // Spread rather than mutate in place: `main.ts` may have moved on to a
    // different `Settings` object since construction (it does this for every
    // other setting), and mutating the stale one here would be silently lost.
    this.settings = { ...this.settings, [field]: true };
    const next = this.onboardingQueue.shift();
    this.onboardingActive = next ? { key: next, text: onboardingText(next, this.keyBindings) } : null;
    this.renderOnboarding();
    this.cb.onOnboardingSeen?.(key);
  }

  /**
   * fb084: non-blocking — unlike `openModal`'s full-stage overlays, this
   * never covers the canvas or bottom bar, so gameplay stays visible and
   * clickable while it shows. Still hidden behind an actual modal (pause/
   * level-up/results/character panel) the same way `renderBossBar` is, so it
   * doesn't bleed through their semi-transparent cover.
   */
  private renderOnboarding(): void {
    if (!this.onboardingActive || this.modalOpen) {
      this.onboardingEl.hidden = true;
      this.onboardingEl.classList.add('sw-off');
      return;
    }
    this.onboardingEl.hidden = false;
    this.onboardingEl.classList.remove('sw-off');
    this.onboardingTextEl.textContent = this.onboardingActive.text;
  }

  resetModalKey(): void {
    this.lastModalKey = '';
  }
}

/**
 * Renders one tower's full detail: what it does, every number it does it with,
 * what a tier costs and buys, and what it leaves behind at the Sundering.
 */
export function towerInfoMarkup(info: TowerInfo, gold: number, placed: boolean): string {
  const colour = TOWER_COLORS[info.key] ?? '#e8edf5';
  // SPEC-V3 §4: a tower walks its own upgrade track, so "Tier 2 / 3" became
  // "Level 2 / 11" — the shared three-tier ladder it named is gone.
  const tierText = placed ? `Level ${info.tier} / ${info.maxTier}` : 'Level 1 when placed';

  const stats = info.stats
    .map(
      (line) =>
        `<div class="sw-row small"><span>${line.label}</span><b>${line.value}${
          line.next ? `<i class="sw-next"> &rarr; ${line.next}</i>` : ''
        }</b></div>`,
    )
    .join('');

  // fb027: §4.2's per-structure class effects, the panel's own "any stacks"
  // clause — both are booleans (see `Structure.pactActive`/`tithed`), so a
  // badge each is all there is to show.
  const badges: string[] = [];
  if (info.pactActive) badges.push('<span class="sw-badge">Death Pact</span>');
  if (info.tithed) badges.push('<span class="sw-badge">Blood Tithe</span>');
  const badgesHtml = badges.length > 0 ? `<p class="sw-note">${badges.join('')}</p>` : '';

  const milestonesHtml =
    info.milestonesOwned.length > 0
      ? `<p class="sw-note dim">Milestones: ${info.milestonesOwned.map((m) => m.text).join(' · ')}</p>`
      : '';

  // Real buttons only for a placed structure with a real tile to target
  // (`info.tx`/`ty`) — an unbuilt bar preview has neither, and keeps the
  // build-cost line as plain text the way it always has.
  const money: string[] = [];
  if (info.buildCost !== null) {
    money.push(
      `<div class="sw-row"><span>Build</span><b class="${gold >= info.buildCost ? 'gold' : 'poor'}">${
        info.buildCost
      }g</b></div>`,
    );
  }
  // fb027 (code-reviewer finding): `disabled` must fold in `info.canAct` —
  // the same phase/build-range/petrified gate `upgradeTower`/`sellTower`
  // enforce themselves — not just affordability, or a tower selected from
  // clear across the map (or mid-Sundering) shows a live, clickable button
  // that silently no-ops when pressed.
  if (info.upgrade && info.tx !== null && info.ty !== null) {
    const afford = gold >= info.upgrade.cost;
    const enabled = afford && info.canAct;
    money.push(
      `<button class="sw-actbtn" data-act="upgrade" data-tx="${info.tx}" data-ty="${info.ty}" ${
        enabled ? '' : 'disabled'
      }><span>Upgrade to Lv ${info.upgrade.toTier}</span><b class="${afford ? 'gold' : 'poor'}">${
        info.upgrade.cost
      }g</b></button>`,
    );
  } else if (placed) {
    money.push('<div class="sw-row"><span>Upgrade</span><b>fully upgraded</b></div>');
  }
  if (info.sellValue !== null && info.tx !== null && info.ty !== null) {
    money.push(
      `<button class="sw-actbtn sw-sell" data-act="sell" data-tx="${info.tx}" data-ty="${info.ty}" ${
        info.canAct ? '' : 'disabled'
      }><span>Sell</span><b>${info.sellValue}g</b></button>`,
    );
  }

  // fb027: the top-level legend (`.sw-help`) already documents `U`/`X`, and
  // the buttons above are self-labeled — the extra reminder line this used to
  // print for `info.upgrade` alone (b036: `.sw-side` has no scroll of its own,
  // so every avoidable line here is a line closer to pushing that legend past
  // the 1080px fold) is gone rather than growing to also cover Sell.
  return `
    <h3 style="color:${colour}">${info.name} <small>${tierText}</small></h3>
    <p class="sw-note">${info.attackText}</p>
    ${badgesHtml}
    ${stats}
    ${milestonesHtml}
    ${money.join('')}
    ${info.terrainText ? `<p class="sw-note dim">${info.terrainText}</p>` : ''}`;
}

function formatFlat(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded > 0 ? '+' : ''}${rounded}`;
}

function formatPercent(fraction: number): string {
  return `${fraction > 0 ? '+' : ''}${formatPct(fraction)}`;
}

/**
 * b021: which stats read as a percent isn't "is this a `mul` stat" — `cdr`
 * and `leech` are `'flat'` in `STAT_KIND` (correct for §2's additive stacking
 * math) yet are authored and meant to display as fractions-of-100, same as a
 * `mul` stat. `STAT_DISPLAY` is the single classification both this and
 * `formatSourceValue` key off, so the two can never disagree.
 *
 * `Stats.total()`/`factor()` (`StatRow.value`, a stat's own final aggregate)
 * for a `mul` stat is a multiplier (`1.32`); the panel reads better as the
 * net percent the sim reports elsewhere (`wardenInfoMarkup`'s `+32%`), so
 * `'percent'` subtracts 1 before formatting *only* when the underlying stat
 * is `mul` — a `flat` percent stat (`cdr`/`leech`) has no such base to
 * subtract, it is already the fraction (0.08 = +8%).
 * A per-source contribution (`StatSourceRow.value`/`BoonRow.contribution`) is
 * always already the raw fraction/point a single source grants, for either
 * shape — no base to subtract there either.
 */
function formatStatValue(display: StatDisplay, isMul: boolean, value: number): string {
  if (display !== 'percent') return formatFlat(value);
  return formatPercent(isMul ? value - 1 : value);
}

function formatSourceValue(display: StatDisplay, value: number): string {
  return display === 'percent' ? formatPercent(value) : formatFlat(value);
}

/**
 * fb022: the class's full active/passive/tower-passive effect text, with
 * `cooldownSeconds` and `damage`/`dps` resolved through the exact live
 * formulas the sim itself uses (`w.derived.cdr`, `classAttackPowerMul`) —
 * everything else (radius, knockback, summon counts, ...) has no live sim
 * equivalent to resolve through, so it falls back to the plain /data number,
 * same as the Hub's pre-run Class screen (`hub.ts`) which calls the same
 * `classAbilitiesMarkup` with no live context at all.
 */
function characterAbilitiesMarkup(w: World, keyBindings: KeyBindings): string {
  const cls = w.content.classByKey.get(w.cfg.classKey);
  if (!cls) return '';
  const live: ClassLiveContext = {
    cdr: w.derived.cdr,
    atkFlat: w.derived.atkFlat,
    // `classAttackPowerMul` only differs from plain `powerMul` for Blood
    // Frenzy's phase-dependent swing.
    damageMul: classAttackPowerMul(w, cls),
    active2CdrFactor: active2CdrFactor(w),
  };
  return classAbilitiesMarkup(cls, { live, keyBindings });
}

/**
 * fb023 (SPEC-FINAL §7): the character panel's Equipment section — six slot
 * boxes plus the owned-items list beside them, the same "click an owned item
 * to equip/swap into its slot" screen the Hub's Equipment tab uses, so a run
 * never has to return to the Hub to change loadout. Reads `w.equippedEquipment`/
 * `w.ownedEquipment` (live sim state, kept in step by the `equip_item`
 * Command) rather than `MetaState` — a run cannot reach back into the meta
 * layer once started (CLAUDE.md architecture rule 3).
 */
/**
 * fb028: `w`'s live equipment-effect context — the same `EquipmentEffectContext`
 * shape `equipmentEffectMarkup` (`equipment-info.ts`) needs to resolve
 * Swordsman Armor's charge-rate note to the real `w.derived.attackSpeedMul`
 * rather than the plain, number-free text the Hub's pre-run screens show.
 * `equippedKeys` reads the live, swappable `w.equippedEquipment` — the same
 * state `hasEquipment` (sim/equipment.ts, b076) now gates every `effectKey`
 * mechanic on — so a cross-item note (Swordsman Armor + Sleeve Sword) stays
 * truthful after a mid-run `equip_item` swap, not just at run start.
 */
function runEquipmentContext(w: World): EquipmentEffectContext {
  return {
    classKey: w.cfg.classKey,
    attackSpeedMul: w.derived.attackSpeedMul,
    equippedKeys: Object.values(w.equippedEquipment).filter((k): k is string => k !== null),
  };
}

function equipmentSectionMarkup(w: World): string {
  const ctx = runEquipmentContext(w);
  const slots = w.content.equipment.slots
    .map((slot) => {
      const key = w.equippedEquipment[slot] ?? null;
      const item = key ? w.content.equipmentByKey.get(key) : null;
      const tip = item ? `<div class="sw-eq-tip">${equipmentEffectMarkup(w.content, item, ctx)}</div>` : '';
      return `<div class="sw-slot sw-runeq-slot" data-runeqslot="${slot}"
                   title="${item ? `Click to unequip ${item.name}.` : ''}">
                <span>${slot}</span><b>${item ? item.name : '—'}</b>${tip}
              </div>`;
    })
    .join('');
  const owned = Object.entries(w.ownedEquipment).filter(([, n]) => n > 0);
  const items =
    owned.length === 0
      ? '<p class="sw-note dim">No equipment owned yet.</p>'
      : owned
          .map(([key, count]) => {
            const item = w.content.equipmentByKey.get(key);
            if (!item) return '';
            const isEq = w.equippedEquipment[item.slot] === key;
            const tip = isEq ? 'Click to unequip.' : `Click to equip to ${item.slot}.`;
            const eqTip = `<div class="sw-eq-tip">${equipmentEffectMarkup(w.content, item, ctx)}</div>`;
            return `<button class="sw-lootitem sw-runeq-item ${isEq ? 'equipped' : ''}" data-runitem="${key}" title="${tip}">
                <b>${item.name}</b><small>${item.slot} · x${count}${isEq ? ' · equipped' : ''}</small>${eqTip}
              </button>`;
          })
          .join('');
  return `<div class="sw-sub">Equipment</div>
    <div class="sw-equipped">${slots}</div>
    <div class="sw-itemstash">${items}</div>`;
}

/**
 * SPEC-FINAL §2/§6.3/§11 (fb004): every final stat with its §2 multiplier
 * breakdown by source, plus every boon taken this run with rank and current
 * contribution, plus (fb022) the class's own active/passive effect text with
 * live numbers, plus (fb023) an Equipment section to swap loadout mid-run.
 * Equipment mods themselves are already folded into the generic Stats
 * sections above too, via fb015's `equipment:<key>` source — the section here
 * is only the equip/swap control surface, not a second source of numbers.
 */
export function characterPanelMarkup(
  data: CharacterPanelData,
  w?: World,
  keyBindings: KeyBindings = defaultKeyBindings(),
): string {
  const boonRows =
    data.boons.length === 0
      ? '<p class="sw-note">No boons taken yet.</p>'
      : data.boons
          .map(
            (b) =>
              `<div class="sw-row small"><span>${b.name} <i>rank ${b.rank}${b.uncapped ? '' : '/' + b.maxRank}</i></span>` +
              `<b>${formatSourceValue(STAT_DISPLAY[b.stat], b.contribution)} ${b.statLabel}</b></div>`,
          )
          .join('');

  const statRows = data.stats
    .map((s) => {
      const sources =
        s.sources.length === 0
          ? '<p class="sw-note dim">Base only — no contributing source.</p>'
          : `<ul class="sw-statlist">${s.sources
              .map((src) => `<li>${src.label}: ${formatSourceValue(STAT_DISPLAY[s.key], src.value)}</li>`)
              .join('')}</ul>`;
      return `<details class="sw-charstat">
          <summary><span>${s.label}</span><b>${formatStatValue(STAT_DISPLAY[s.key], s.kind === 'mul', s.value)}</b></summary>
          ${sources}
        </details>`;
    })
    .join('');

  const abilities = w ? characterAbilitiesMarkup(w, keyBindings) : '';

  return `
    <div class="sw-card sw-charcard wide">
      <h2>Character</h2>
      <p class="sw-note">Every final stat's class &times; tree &times; equipment &times; boon breakdown
        (SPEC-FINAL &sect;2: ranks within one source add, sources multiply).
        Click a stat to see where it comes from.</p>
      ${
        abilities
          ? `<div class="sw-sub">Active &amp; passive effects</div>
             <div class="sw-classdetail">${abilities}</div>`
          : ''
      }
      ${w ? equipmentSectionMarkup(w) : ''}
      <div class="sw-sub">Boons taken</div>
      ${boonRows}
      <div class="sw-sub">Stats</div>
      <div class="sw-charstats">${statRows}</div>
      <button class="sw-reroll" data-act="close">Close</button>
    </div>`;
}

function formatDamage(v: number): string {
  return Math.round(v).toLocaleString();
}

function formatDps(v: number): string {
  return (Math.round(v * 10) / 10).toLocaleString();
}

/** Elapsed-seconds label: rounded, but never thousands-grouped like `formatDps`
 * (a long run's raw tick count would otherwise print "1,245.0s"). */
function formatSeconds(v: number): string {
  return String(Math.round(v * 10) / 10);
}

function dpsRowsMarkup(rows: DpsWindow['bySource']): string {
  if (rows.length === 0) return '<p class="sw-note dim">No damage dealt yet.</p>';
  return `<ul class="sw-statlist">${rows
    .map((r) => `<li>${r.label}: <b>${formatDamage(r.damage)}</b> (${formatDps(r.dps)}/s)</li>`)
    .join('')}</ul>`;
}

function dpsWindowMarkup(win: DpsWindow): string {
  return `<div class="sw-sub">${win.label} <i>(${formatSeconds(win.seconds)}s)</i></div>
    <div class="sw-row small"><span>Total</span><b>${formatDamage(win.damage)} (${formatDps(win.dps)}/s)</b></div>
    <details class="sw-charstat" open>
      <summary><span>By source</span></summary>
      ${dpsRowsMarkup(win.bySource)}
    </details>
    <details class="sw-charstat">
      <summary><span>By damage type</span></summary>
      ${dpsRowsMarkup(win.byType)}
    </details>`;
}

/**
 * SPEC-FINAL §11 (fb007): the DPS panel's static shell, built once per open —
 * `.sw-dps-body` is the only part `renderDpsPanel` replaces on later ticks
 * (fb024: keeps the Dock button's element identity stable across the 60Hz
 * refresh instead of recreating it, which could swallow a real click).
 */
export function dpsPanelShellMarkup(): string {
  return `
    <div class="sw-card sw-charcard">
      <h2>DPS Summary</h2>
      <div class="sw-dps-body"></div>
      <button class="sw-reroll" data-act="dock">Dock</button>
    </div>`;
}

/**
 * SPEC-FINAL §11 (fb007): damage dealt and DPS over the current wave and the
 * whole run, broken down by source and by damage type. See `dps-panel.ts`
 * for why the source rows read correctly in both phases without a separate
 * TD/VS split.
 */
export function dpsPanelBodyMarkup(data: DpsPanelData): string {
  return `${dpsWindowMarkup(data.wave)}${dpsWindowMarkup(data.run)}`;
}

/**
 * SPEC-FINAL §6.2, owner feedback `feature-vs-wielded-side-panel` (fb037):
 * the VS panel's static shell, built once per open — `.sw-vs-body` is the
 * only part `renderVsPanel` replaces on later ticks (fb024's click-drop
 * lesson: the Dock button and the row-hover delegation both need a stable
 * element to stay wired to).
 */
export function vsPanelShellMarkup(): string {
  return `
    <div class="sw-card sw-charcard">
      <h2>Wielded Attacks</h2>
      <div class="sw-vs-body"></div>
      <button class="sw-reroll" data-act="dock">Dock</button>
    </div>`;
}

function vsRowMarkup(r: VsPanelRow): string {
  const aoeText = r.aoe > 0 ? `, AoE r${trimNum(r.aoe, 1)}` : '';
  const pierceText = r.pierce > 0 ? `, pierce ${r.pierce}` : '';
  return `
    <li class="sw-vs-row" data-vs-key="${r.key}" tabindex="0">
      <div class="sw-row"><span>${r.name} &times;${r.count}</span><b>${formatDamage(r.damage)} dmg</b></div>
      <div class="sw-note dim">
        avg ${trimNum(r.perTowerAverage, 1)} &middot; every ${trimNum(r.interval, 2)}s &middot;
        range ${trimNum(r.range, 1)}${pierceText}${aoeText}
      </div>
      <div class="sw-note dim">${r.damageTypeText} &mdash; ${r.special}</div>
      <div class="sw-row small"><span>This wave</span><b>${formatDamage(r.waveDamage)} (${formatDps(r.waveDps)}/s)</b></div>
    </li>`;
}

/**
 * SPEC-FINAL §6.2 (fb037): one row per wielded tower type. Hovering a row
 * (wired in `renderVsPanel`) draws that attack's live range ring around the
 * Warden — `data-vs-key` is the hook the delegated listener reads.
 */
export function vsPanelBodyMarkup(rows: VsPanelRow[]): string {
  if (rows.length === 0) {
    return '<p class="sw-note dim">Nothing wielded yet — towers wield their attacks once the Sundering hits.</p>';
  }
  return `<ul class="sw-statlist sw-vs-list">${rows.map(vsRowMarkup).join('')}</ul>`;
}

/**
 * The stage bar: where the run is in the act, what is scheduled next, and a
 * second bar for the thing that changes minute to minute (the wave in Act I,
 * the level in Act II).
 */
export function progressMarkup(p: RunProgress): string {
  const ticks = p.markers
    .map(
      (m) =>
        `<i class="sw-mark ${m.kind}${m.done ? ' done' : ''}" style="left:${(m.at * 100).toFixed(2)}%" title="${m.label}"></i>`,
    )
    .join('');
  const sub = p.sub
    ? `<div class="sw-row small"><span>${p.sub.label}</span><b>${p.sub.text}</b></div>
       <div class="sw-meter thin"><i style="width:${(p.sub.fraction * 100).toFixed(1)}%"></i></div>`
    : '';
  return `
    <div class="sw-phase">${p.title}</div>
    <div class="sw-track"><i class="sw-fill" style="width:${(p.fraction * 100).toFixed(1)}%"></i>${ticks}</div>
    <p class="sw-note">${p.detail}</p>
    ${sub}`;
}

/**
 * Practice ops that are toggles rather than one-shots, paired with the World
 * flag each one owns. Adding a toggle op means adding it here, or its button
 * will never light up.
 */
export const TOGGLE_STATE = (w: World): [DevOp, boolean][] => [
  ['invuln', w.invulnerable],
  ['god', w.godMode],
  ['toggle_infinite_td', w.infiniteTdWaves],
  ['toggle_infinite_vs', w.infiniteVsWaves],
];

/**
 * fb032: the amount granted by the `gold`/`xp` practice buttons, chosen from
 * an adjacent dropdown at click time rather than fixed at +500.
 */
export const PRACTICE_AMOUNTS = [500, 1000, 2500, 5000, 100000] as const;

/**
 * ops whose practice button is paired with an amount dropdown (fb032)
 * instead of firing its `amount` field directly.
 */
const PRACTICE_AMOUNT_OPS = new Set<DevOp>(['gold', 'xp']);

/** The practice tool's buttons, in the order a tester reaches for them. */
export const PRACTICE_BUTTONS: { op: DevOp; amount: number; label: string; title: string }[] = [
  { op: 'kill_all', amount: 0, label: 'Kill all', title: 'Kills every enemy except the boss; bounty and gems still drop' },
  { op: 'gold', amount: 500, label: '+Gold', title: 'Adds the selected amount of gold' },
  { op: 'xp', amount: 500, label: '+XP', title: 'Adds the selected amount of XP (Act II only)' },
  { op: 'heal', amount: 0, label: 'Full heal', title: 'Warden and Core to full' },
  { op: 'invuln', amount: 0, label: 'Invulnerable', title: 'Toggles Warden damage off' },
  { op: 'god', amount: 0, label: 'God mode', title: 'Warden and Core both take no damage; leaks still count' },
  { op: 'skip_wave', amount: 0, label: 'Skip wave', title: 'Ends the build phase, or clears the running wave' },
  { op: 'fast_forward', amount: 60, label: '+1 min', title: 'Advances the Nightfall clock by a minute' },
  { op: 'summon_boss', amount: 0, label: 'Summon boss', title: 'Jumps the clock to the Warden-Eater' },
  {
    op: 'toggle_infinite_td',
    amount: 0,
    label: 'Infinite TD waves',
    title: 'TD waves never hand off to the VS wave; scaling keeps climbing until toggled off',
  },
  {
    op: 'toggle_infinite_vs',
    amount: 0,
    label: 'Infinite VS waves',
    title: 'The VS wave never hands back to TD or ends by boss kill; scaling keeps climbing until toggled off',
  },
  {
    op: 'max_towers',
    amount: 0,
    label: 'Max towers',
    title: 'Raises every placed tower and the Core to their final upgrade step, free',
  },
];

/** SPEC-FINAL §6.2: every wielded tower type's lineage — the only Act II panel. */
export function wieldedLineageMarkup(w: World): string {
  const lines = wieldedLineageText(w);
  if (lines.length === 0) return '';
  return `<div class="sw-sub">Wielded towers</div>${lines.map((t) => `<p class="sw-note">${t}</p>`).join('')}`;
}

/** SPEC-V3 T2: an enemy's stats, for when the player clicks one. */
export function enemyInfoMarkup(w: World, e: Enemy): string {
  const def = w.content.enemyById.get(e.defId);
  const pct = Math.max(0, Math.round((e.hp / e.maxHp) * 100));
  const traits = def?.traits ?? [];
  const rows: string[] = [
    row('Health', `${Math.ceil(e.hp)} / ${Math.round(e.maxHp)} (${pct}%)`),
    row('Speed', `${round1(effectiveSpeed(w, e))} tiles/s`),
    // p12b: the tier-scaled number, not the authored one — same convention as
    // the bounty row below. At T3 the two differ by the ladder's coreDamage
    // rung, and a panel showing the sheet value would understate what this
    // enemy actually takes off the Core.
    row('Core damage', String(def ? round1(enemyCoreDamage(w, def)) : 0)),
    // The real payout, not the authored number: `killEnemy` scales bounty by
    // gold find and adds gold-per-kill — and in Act II pays gems instead.
    w.huntsWarden
      ? row('XP gem', String(def?.gem ?? 0))
      : row('Bounty', `${Math.round((def?.bounty ?? 0) * w.derived.goldFindMul + w.derived.goldPerKill)}g`),
  ];
  rows.push(row('Armour', armourText(enemyArmor(e))));
  if (def?.flatReduction)
    rows.push(row('Damage reduction', `${Math.round(def.flatReduction * 100)}% off all damage`));
  if (def?.frontReduction) rows.push(row('Front armour', `${Math.round(def.frontReduction * 100)}% from the front`));
  if (e.slowAmount > 0) rows.push(row('Slowed', `${Math.round(e.slowAmount * 100)}%`));
  // SPEC-V3 §3's statuses and its four DoT rows, each named as the table names
  // it — a panel that lumped them into one "ailment" line would hide the very
  // thing the taxonomy exists to distinguish.
  if (e.frozenRemaining > 0) rows.push(row('Frozen', `${round1(e.frozenRemaining)}s left`));
  else if (e.frostRemaining > 0) rows.push(row('Frost', `${round1(e.frostRemaining)}s left`));
  for (const t of ['bleeding', 'poison', 'toxic', 'burning'] as const) {
    const n = dotStacks(e, t);
    if (n === 0) continue;
    const name = w.content.damageTypeByKey.get(t)?.name ?? t;
    rows.push(row(name, `${n} stack${n === 1 ? '' : 's'}, ${round1(dotRemaining(e, t))}s left`));
  }

  return `
    <h3 style="color:${ENEMY_COLORS[def?.key ?? ''] ?? '#e8edf5'}">${def?.name ?? 'Enemy'}
      <small>${e.boss ? 'boss' : e.elite ? 'elite' : `grade ${def?.grade ?? '?'}`}</small></h3>
    ${rows.join('')}
    ${traits.length > 0 ? `<p class="sw-note dim">${traits.join(', ')}</p>` : ''}`;
}

/**
 * SPEC-V3 §2 armour reads as a percentage either way: positive points are
 * damage removed, negative points (Burning's shred) are damage *added*, so the
 * row has to say which — "-30% off" would read as a small benefit.
 */
function armourText(armor: number): string {
  const raw = Math.round(armor);
  const eff = Math.round(effectiveArmor(armor));
  const pct = Math.round(armorReduction(armor) * 100);
  const suffix = pct < 0 ? `${-pct}% more taken` : `${pct}% off`;
  const clampNote = eff > raw ? ' (floor)' : eff < raw ? ' (cap)' : '';
  return `${eff}${clampNote} (${suffix})`;
}

/** SPEC-V3 T2: the character's own stats. */
export function wardenInfoMarkup(w: World): string {
  const d = w.derived;
  const rows = [
    row('Health', `${Math.ceil(w.warden.hp)} / ${Math.round(d.maxHp)}`),
    row('Regen', `${round1(d.hpRegen)} / s`),
    row('Armour', armourText(wardenArmor(w))),
    row('Move speed', `${round1(d.moveSpeed)} tiles/s`),
    row('Power', formatPercent(d.powerMul - 1)),
    row('Attack speed', formatPercent(d.attackSpeedMul - 1)),
    row('Area', formatPercent(d.areaMul - 1)),
    row('Dash', `${w.warden.dashCharges} / ${d.dashCharges}`),
    // fb029: the same numbers the on-select range ring draws, so the ring
    // and the panel can never disagree about what "range" means here.
    w.huntsWarden
      ? row('Wielded range', `${round1(longestWieldedRange(w))} tiles`)
      : row('Range', `${round1(characterBasicRange(w))} tiles`),
  ];
  return `<h3 style="color:${PALETTE.warden}">The Warden <small>level ${w.level}</small></h3>${rows.join('')}`;
}

function row(label: string, value: string): string {
  return `<div class="sw-row small"><span>${label}</span><b>${value}</b></div>`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
