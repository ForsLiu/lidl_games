/** DOM chrome around the canvas: HUD, tower bar, and the modal choice screens. */

import type { World } from '../sim/world';
import { towerCost } from '../sim/towers';
import type { Offer } from '../sim/types';
import { ENEMY_COLORS, PALETTE, TOWER_COLORS } from '../render/theme';
import { dotRemaining, dotStacks, effectiveSpeed, enemyArmor } from '../sim/enemies';
import { wardenArmor } from '../sim/run';
import { armorReduction, effectiveArmor } from '../sim/stats';
import type { Enemy } from '../sim/types';
import { towerInfo, wieldedLineageText, type TowerInfo } from './tower-info';
import { runProgress, type RunProgress } from './progress';
import type { DevOp } from '../sim/types';
import { selectedEnemy, selectedStructure, type Selection } from './selection';
import { characterPanelData, type CharacterPanelData } from './character-panel';
import { dpsPanelData, type DpsPanelData, type DpsWindow } from './dps-panel';
import { STAT_DISPLAY, type StatDisplay } from '../sim/stats';
import { classAttackPowerMul } from '../sim/classes';
import { classAbilitiesMarkup, type ClassLiveContext } from './class-info';
import { coreLiveMarkup } from './core-info';
import { formatPct } from './info-format';

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
  onResume(): void;
  onPause(): void;
  /** Fast-forward: cycles through the declared speeds (`SPEEDS`). */
  onCycleSpeed(): void;
  /** Practice tool; only reachable in a run started with practice on. `enemyKey` is only meaningful for the `'spawn'` op. */
  onDev(op: DevOp, amount: number, enemyKey?: string): void;
  onQuitToHub(): void;
}

export class Hud {
  readonly root: HTMLElement;
  private bar: HTMLElement;
  private stats: HTMLElement;
  private modal: HTMLElement;
  private toast: HTMLElement;
  private speedBtn: HTMLButtonElement;
  private towerInfoEl: HTMLElement;
  private progressEl: HTMLElement;
  private practiceEl: HTMLElement;
  private charPanelEl: HTMLElement;
  private dpsPanelEl: HTMLElement;
  private lastInfoKey = '';
  private cb: HudCallbacks;
  private selected = 0;
  private lastModalKey = '';
  private lastCharPanelKey = '';
  private paused = false;
  private confirmingAbandon = false;
  /** fb012: the pause card's "Options" sub-screen, holding the auto-pick toggle. */
  private showingOptions = false;
  private charPanelOpen = false;
  private dpsPanelOpen_ = false;
  /** b035: the practice tool panel is tall enough to push `#sw-towerinfo` past the fold; collapsed by default. */
  private practiceCollapsed = true;

  constructor(root: HTMLElement, cb: HudCallbacks) {
    this.root = root;
    this.cb = cb;
    root.innerHTML = `
      <div class="sw-shell">
        <div class="sw-stage">
          <canvas id="sw-canvas"></canvas>
          <div class="sw-modal sw-off" id="sw-modal" hidden></div>
          <div class="sw-modal sw-off" id="sw-charpanel" hidden></div>
          <div class="sw-modal sw-off" id="sw-dpspanel" hidden></div>
          <div class="sw-toast" id="sw-toast"></div>
        </div>
        <div class="sw-side">
          <div class="sw-controls" id="sw-controls">
            <button class="sw-ctl" data-act="speed" id="sw-speed" title="Fast-forward (F)">1x</button>
            <button class="sw-ctl" data-act="ranges" id="sw-ranges" aria-pressed="false" title="Show tower ranges (R)">Ranges</button>
            <button class="sw-ctl" data-act="autopick" id="sw-autopick" aria-pressed="false" title="Resolve level-ups automatically">Auto-pick</button>
            <button class="sw-ctl" data-act="character" id="sw-character" aria-pressed="false" title="Character stats (C)">Character</button>
            <button class="sw-ctl" data-act="dps" id="sw-dps" aria-pressed="false" title="Damage/DPS summary (P)">DPS</button>
            <button class="sw-ctl" data-act="pause" title="Pause (Esc)">Pause</button>
          </div>
          <div class="sw-practice" id="sw-practice" hidden></div>
          <!--
            b032: the build bar sits right after the controls/practice tools
            (not after progress/stats/towerinfo, its pre-fix position) so its
            own row count never depends on how tall the info panels above it
            get — at a 1080-tall viewport with Training Grounds' practice tool
            open, the panels below (progress/stats/towerinfo/help) are the
            ones that may run past the fold, and none of them carry an
            interactive control the way the tower buttons do.
          -->
          <div class="sw-bar" id="sw-bar"></div>
          <div class="sw-progress" id="sw-progress"></div>
          <div class="sw-stats" id="sw-stats"></div>
          <div class="sw-towerinfo" id="sw-towerinfo"></div>
          <div class="sw-help">
            <b>WASD</b> move &middot; <b>Space</b> dash &middot; <b>LMB</b> build &middot;
            <b>RMB</b> sell &middot; <b>U</b>+click upgrade &middot; <b>1-9</b> pick tower &middot;
            <b>0</b> clear &middot; <b>Enter</b> call wave &middot; <b>Q</b> class active &middot;
            <b>R</b> ranges &middot; <b>F</b> speed &middot; <b>C</b> character &middot; <b>P</b> DPS &middot; <b>Esc</b> pause
          </div>
        </div>
      </div>`;
    this.bar = root.querySelector('#sw-bar') as HTMLElement;
    this.stats = root.querySelector('#sw-stats') as HTMLElement;
    this.modal = root.querySelector('#sw-modal') as HTMLElement;
    this.toast = root.querySelector('#sw-toast') as HTMLElement;
    this.speedBtn = root.querySelector('#sw-speed') as HTMLButtonElement;
    this.towerInfoEl = root.querySelector('#sw-towerinfo') as HTMLElement;
    this.progressEl = root.querySelector('#sw-progress') as HTMLElement;
    this.practiceEl = root.querySelector('#sw-practice') as HTMLElement;
    this.charPanelEl = root.querySelector('#sw-charpanel') as HTMLElement;
    this.dpsPanelEl = root.querySelector('#sw-dpspanel') as HTMLElement;
    this.wireControls();
  }

  private wireControls(): void {
    const controls = this.root.querySelector('#sw-controls');
    controls?.querySelector('[data-act="speed"]')?.addEventListener('click', () => this.cb.onCycleSpeed());
    controls?.querySelector('[data-act="ranges"]')?.addEventListener('click', () => this.cb.onToggleRanges());
    controls?.querySelector('[data-act="autopick"]')?.addEventListener('click', () => this.cb.onToggleAutoPick());
    controls?.querySelector('[data-act="character"]')?.addEventListener('click', () => this.cb.onToggleCharacterPanel());
    controls?.querySelector('[data-act="dps"]')?.addEventListener('click', () => this.cb.onToggleDpsPanel());
    controls?.querySelector('[data-act="pause"]')?.addEventListener('click', () => this.cb.onPause());
  }

  /**
   * Shows the practice tool. Called once at run start; a run that did not opt
   * in never sees the panel, and the sim ignores the commands anyway.
   *
   * `w` supplies the enemy roster for the fb019 Training Grounds spawn panel —
   * omitted only by tests that don't care about the spawn row.
   *
   * b035: the full panel (9 dev buttons + the spawn row) is tall enough that,
   * stacked above `#sw-towerinfo` in `.sw-side`, it pushed a populated tower
   * info panel ~230px past the 1080px fold with no way to reach it. Collapsed
   * by default behind a `sw-sub` toggle — the tools are optional, the tower
   * info panel below them is not.
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
      PRACTICE_BUTTONS.map(
        (b) => `<button class="sw-ctl" data-dev="${b.op}" data-amount="${b.amount}" title="${b.title}">${b.label}</button>`,
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
        this.cb.onDev(el.dataset.dev as DevOp, Number(el.dataset.amount));
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
    // the other).
    if (this.dpsPanelOpen_) this.closeDpsPanel();
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
    this.charPanelEl.innerHTML = characterPanelMarkup(characterPanelData(w), w);
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

  /**
   * SPEC-FINAL §11, owner feedback `feature-dps-summary` (fb007): damage
   * dealt and DPS over the current wave and the whole run, by source and by
   * damage type. Same refusal rule as `toggleCharacterPanel` (fb004) and the
   * same reason: two independently-driven overlays painted in the same
   * `position: absolute; inset: 0` stack would hide one another and eat its
   * clicks.
   */
  toggleDpsPanel(w: World): void {
    if (this.dpsPanelOpen_) {
      this.closeDpsPanel();
      return;
    }
    if (w.outcome !== 'running' || this.paused || !this.modal.hidden) return;
    // See `toggleCharacterPanel`'s matching comment: without this, the two
    // panels could both render at once (qa-playtester finding).
    if (this.charPanelOpen) this.closeCharacterPanel();
    this.dpsPanelOpen_ = true;
    this.renderDpsPanel(w);
  }

  closeDpsPanel(): void {
    this.dpsPanelOpen_ = false;
    this.dpsPanelEl.hidden = true;
    this.dpsPanelEl.classList.add('sw-off');
    this.dpsPanelEl.innerHTML = '';
  }

  /** Damage keeps changing every tick, unlike the character panel's rarely-changing
   * stats, so this redraws unconditionally on every `update()` call while open rather
   * than gating on a memoized key. */
  private renderDpsPanel(w: World): void {
    this.dpsPanelEl.hidden = false;
    this.dpsPanelEl.classList.remove('sw-off');
    this.dpsPanelEl.innerHTML = dpsPanelMarkup(dpsPanelData(w));
    this.dpsPanelEl.querySelector('[data-act="close"]')?.addEventListener('click', () => this.closeDpsPanel());
  }

  private syncDpsPanelToggle(): void {
    const el = this.root.querySelector('#sw-dps');
    if (!el) return;
    el.setAttribute('aria-pressed', String(this.dpsPanelOpen_));
    el.classList.toggle('on', this.dpsPanelOpen_);
  }

  /** Reflects the pacer's speed; the pacer itself owns the cycling. */
  setSpeed(speed: number): void {
    this.speedBtn.textContent = `${speed}x`;
    this.speedBtn.classList.toggle('on', speed > 1);
  }

  /** True while any overlay owns input, so clicks must not reach the canvas. */
  get modalOpen(): boolean {
    return !this.modal.hidden || !this.charPanelEl.hidden || !this.dpsPanelEl.hidden;
  }

  get canvas(): HTMLCanvasElement {
    return this.root.querySelector('#sw-canvas') as HTMLCanvasElement;
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
    if (this.dpsPanelOpen_ && w.outcome !== 'running') this.closeDpsPanel();
    else if (this.dpsPanelOpen_) this.renderDpsPanel(w);
    this.syncDpsPanelToggle();
    // A selection describes itself — but never at the cost of the panels the
    // player needs to act: a tower queued on the build bar has to show its own
    // stats, and in Act II the weapon panel carries the only weapon switcher.
    const blocking = this.selected > 0 || w.sundered;
    if (!blocking && this.renderSelectionInfo(w, selection)) return;
    this.renderTowerInfo(w, cursor);
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
      Hud.activeSkillRow(cls.active1.name, 'Q', w.warden.active1Cooldown, cls.active1.name) +
      Hud.activeSkillRow(cls.active2.name, 'E', w.warden.active2Cooldown, cls.active2.name)
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
      const key = `sel:tower:${s.id}:${s.tier}:${Math.round(s.hp)}:${w.gold}`;
      if (key !== this.lastInfoKey) {
        this.lastInfoKey = key;
        this.towerInfoEl.innerHTML = towerInfoMarkup(towerInfo(w, def, s), w.gold, true);
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
      const key = `sel:core:${w.coreKey}:${w.coreStep}:${Math.ceil(w.coreHp)}:${Math.round(w.coreMaxHp)}`;
      if (key !== this.lastInfoKey) {
        this.lastInfoKey = key;
        this.towerInfoEl.innerHTML = coreLiveMarkup(w.content, w.coreKey, w.coreStep, w.core, w.coreHp, w.coreMaxHp);
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
    const key = [
      def.key,
      hovered ? `built${hovered.id}` : 'plan',
      info.tier,
      w.gold >= (info.buildCost ?? info.upgrade?.cost ?? 0),
      w.phase,
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
    const key = `${w.phase}:${w.offers.length}:${w.outcome}:${w.level}`;
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
    if (this.dpsPanelOpen_) this.closeDpsPanel();
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
    this.modal.innerHTML = `
      <div class="sw-card">
        <h2>${won ? 'The Vale holds' : w.outcome === 'defeat_core' ? 'The Core fell' : 'The Warden fell'}</h2>
        <div class="sw-results">
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

  say(text: string): void {
    this.toast.textContent = text;
    this.toast.classList.add('show');
    window.setTimeout(() => this.toast.classList.remove('show'), 1400);
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
    }
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

  const money: string[] = [];
  if (info.buildCost !== null) {
    money.push(
      `<div class="sw-row"><span>Build</span><b class="${gold >= info.buildCost ? 'gold' : 'poor'}">${
        info.buildCost
      }g</b></div>`,
    );
  }
  if (info.upgrade) {
    money.push(
      `<div class="sw-row"><span>Upgrade to Lv ${info.upgrade.toTier}</span><b class="${
        gold >= info.upgrade.cost ? 'gold' : 'poor'
      }">${info.upgrade.cost}g</b></div>`,
    );
  } else if (placed) {
    money.push('<div class="sw-row"><span>Upgrade</span><b>fully upgraded</b></div>');
  }
  if (info.sellValue !== null) {
    money.push(`<div class="sw-row"><span>Sell (RMB)</span><b>${info.sellValue}g</b></div>`);
  }

  return `
    <h3 style="color:${colour}">${info.name} <small>${tierText}</small></h3>
    <p class="sw-note">${info.attackText}</p>
    ${stats}
    ${money.join('')}
    ${
      info.upgrade
        ? '<p class="sw-hint">Hold <b>U</b> (or Shift) and click the tower to upgrade it.</p>'
        : ''
    }
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
function characterAbilitiesMarkup(w: World): string {
  const cls = w.content.classByKey.get(w.cfg.classKey);
  if (!cls) return '';
  const live: ClassLiveContext = {
    cdr: w.derived.cdr,
    atkFlat: w.derived.atkFlat,
    // `classAttackPowerMul` only differs from plain `powerMul` for Blood
    // Frenzy's phase-dependent swing.
    damageMul: classAttackPowerMul(w, cls),
  };
  return classAbilitiesMarkup(cls, { live });
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
function equipmentSectionMarkup(w: World): string {
  const slots = w.content.equipment.slots
    .map((slot) => {
      const key = w.equippedEquipment[slot] ?? null;
      const item = key ? w.content.equipmentByKey.get(key) : null;
      return `<div class="sw-slot" data-runeqslot="${slot}"
                   title="${item ? `Click to unequip ${item.name}.` : ''}">
                <span>${slot}</span><b>${item ? item.name : '—'}</b>
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
            return `<button class="sw-lootitem ${isEq ? 'equipped' : ''}" data-runitem="${key}" title="${tip}">
                <b>${item.name}</b><small>${item.slot} · x${count}${isEq ? ' · equipped' : ''}</small>
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
export function characterPanelMarkup(data: CharacterPanelData, w?: World): string {
  const boonRows =
    data.boons.length === 0
      ? '<p class="sw-note">No boons taken yet.</p>'
      : data.boons
          .map(
            (b) =>
              `<div class="sw-row small"><span>${b.name} <i>rank ${b.rank}/${b.maxRank}</i></span>` +
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

  const abilities = w ? characterAbilitiesMarkup(w) : '';

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
 * SPEC-FINAL §11 (fb007): damage dealt and DPS over the current wave and the
 * whole run, broken down by source and by damage type. See `dps-panel.ts`
 * for why the source rows read correctly in both phases without a separate
 * TD/VS split.
 */
export function dpsPanelMarkup(data: DpsPanelData): string {
  return `
    <div class="sw-card sw-charcard wide">
      <h2>DPS Summary</h2>
      ${dpsWindowMarkup(data.wave)}
      ${dpsWindowMarkup(data.run)}
      <button class="sw-reroll" data-act="close">Close</button>
    </div>`;
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
];

/** The practice tool's buttons, in the order a tester reaches for them. */
export const PRACTICE_BUTTONS: { op: DevOp; amount: number; label: string; title: string }[] = [
  { op: 'kill_all', amount: 0, label: 'Kill all', title: 'Kills every enemy except the boss; bounty and gems still drop' },
  { op: 'gold', amount: 500, label: '+500 gold', title: 'Adds gold' },
  { op: 'xp', amount: 500, label: '+500 XP', title: 'Act II only' },
  { op: 'heal', amount: 0, label: 'Full heal', title: 'Warden and Core to full' },
  { op: 'invuln', amount: 0, label: 'Invulnerable', title: 'Toggles Warden damage off' },
  { op: 'god', amount: 0, label: 'God mode', title: 'Warden and Core both take no damage; leaks still count' },
  { op: 'skip_wave', amount: 0, label: 'Skip wave', title: 'Ends the build phase, or clears the running wave' },
  { op: 'fast_forward', amount: 60, label: '+1 min', title: 'Advances the Nightfall clock by a minute' },
  { op: 'summon_boss', amount: 0, label: 'Summon boss', title: 'Jumps the clock to the Warden-Eater' },
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
    row('Core damage', String(def?.coreDamage ?? 0)),
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
  ];
  return `<h3 style="color:${PALETTE.warden}">The Warden <small>level ${w.level}</small></h3>${rows.join('')}`;
}

function row(label: string, value: string): string {
  return `<div class="sw-row small"><span>${label}</span><b>${value}</b></div>`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
