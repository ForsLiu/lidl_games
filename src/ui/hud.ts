/** DOM chrome around the canvas: HUD, tower bar, and the modal choice screens. */

import type { World } from '../sim/world';
import { towerCost } from '../sim/towers';
import type { Offer } from '../sim/types';
import { ENEMY_COLORS, PALETTE, TOWER_COLORS } from '../render/theme';
import { dotRemaining, dotStacks, effectiveSpeed, enemyArmor } from '../sim/enemies';
import { wardenArmor } from '../sim/run';
import { armorReduction } from '../sim/stats';
import type { Enemy } from '../sim/types';
import { towerInfo, wieldedLineageText, type TowerInfo } from './tower-info';
import { runProgress, type RunProgress } from './progress';
import type { DevOp } from '../sim/types';
import { selectedEnemy, selectedStructure, type Selection } from './selection';

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
  onResume(): void;
  onPause(): void;
  /** Fast-forward: cycles 1x / 2x / 3x. */
  onCycleSpeed(): void;
  /** Practice tool; only reachable in a run started with practice on. */
  onDev(op: DevOp, amount: number): void;
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
  private lastInfoKey = '';
  private cb: HudCallbacks;
  private selected = 0;
  private lastModalKey = '';
  private paused = false;
  private confirmingAbandon = false;

  constructor(root: HTMLElement, cb: HudCallbacks) {
    this.root = root;
    this.cb = cb;
    root.innerHTML = `
      <div class="sw-shell">
        <div class="sw-stage">
          <canvas id="sw-canvas"></canvas>
          <div class="sw-modal sw-off" id="sw-modal" hidden></div>
          <div class="sw-toast" id="sw-toast"></div>
        </div>
        <div class="sw-side">
          <div class="sw-controls" id="sw-controls">
            <button class="sw-ctl" data-act="speed" id="sw-speed" title="Fast-forward (F)">1x</button>
            <button class="sw-ctl" data-act="ranges" id="sw-ranges" aria-pressed="false" title="Show tower ranges (R)">Ranges</button>
            <button class="sw-ctl" data-act="pause" title="Pause (Esc)">Pause</button>
          </div>
          <div class="sw-practice" id="sw-practice" hidden></div>
          <div class="sw-progress" id="sw-progress"></div>
          <div class="sw-stats" id="sw-stats"></div>
          <div class="sw-towerinfo" id="sw-towerinfo"></div>
          <div class="sw-bar" id="sw-bar"></div>
          <div class="sw-help">
            <b>WASD</b> move &middot; <b>Space</b> dash &middot; <b>LMB</b> build &middot;
            <b>RMB</b> sell &middot; <b>U</b>+click upgrade &middot; <b>1-9</b> pick tower &middot;
            <b>0</b> clear &middot; <b>Enter</b> call wave &middot; <b>Q</b> class active &middot;
            <b>R</b> ranges &middot; <b>F</b> speed &middot; <b>Esc</b> pause
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
    this.wireControls();
  }

  private wireControls(): void {
    const controls = this.root.querySelector('#sw-controls');
    controls?.querySelector('[data-act="speed"]')?.addEventListener('click', () => this.cb.onCycleSpeed());
    controls?.querySelector('[data-act="ranges"]')?.addEventListener('click', () => this.cb.onToggleRanges());
    controls?.querySelector('[data-act="pause"]')?.addEventListener('click', () => this.cb.onPause());
  }

  /**
   * Shows the practice tool. Called once at run start; a run that did not opt
   * in never sees the panel, and the sim ignores the commands anyway.
   */
  showPracticeTools(on: boolean): void {
    this.practiceEl.hidden = !on;
    if (!on) {
      this.practiceEl.innerHTML = '';
      return;
    }
    this.practiceEl.innerHTML =
      '<div class="sw-sub">Practice tool</div>' +
      '<p class="sw-note">This run banks nothing.</p>' +
      '<div class="sw-devgrid">' +
      PRACTICE_BUTTONS.map(
        (b) => `<button class="sw-ctl" data-dev="${b.op}" data-amount="${b.amount}" title="${b.title}">${b.label}</button>`,
      ).join('') +
      '</div>';
    for (const el of this.practiceEl.querySelectorAll<HTMLElement>('[data-dev]')) {
      el.addEventListener('click', () => {
        this.cb.onDev(el.dataset.dev as DevOp, Number(el.dataset.amount));
      });
    }
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

  /** Reflects the pacer's speed; the pacer itself owns the cycling. */
  setSpeed(speed: number): void {
    this.speedBtn.textContent = `${speed}x`;
    this.speedBtn.classList.toggle('on', speed > 1);
  }

  /** True while any overlay owns input, so clicks must not reach the canvas. */
  get modalOpen(): boolean {
    return !this.modal.hidden;
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
      b.innerHTML = `<span class="sw-swatch" style="background:${TOWER_COLORS[t.key] ?? '#888'}"></span>
        <span class="sw-tname">${i + 1}. ${t.name}</span>
        <span class="sw-tcost" data-cost="${t.id}"></span>
        <span class="sw-tdesc">${t.desc}</span>`;
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

  /**
   * SPEC-V2 §2's single class Active (Q), for `legacy: true` classes; SPEC-FINAL
   * §4's Active1 (Q) + Active2 (E), for `legacy: false` classes — which drop
   * the Day-use/Night-use tooltip text SPEC-V2 §2 required (MIGRATION.md §8.3).
   */
  private activeRow(w: World): string {
    const cls = w.content.classByKey.get(w.cfg.classKey);
    if (!cls) return '';
    if (cls.legacy) {
      const tip = `Day: ${cls.active.dayUse} Night: ${cls.active.nightUse}`;
      return Hud.activeSkillRow(cls.active.name, 'Q', w.warden.activeCooldown, tip);
    }
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
        Math.round(e.hp),
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

    const key = `sel:warden:${Math.round(w.warden.hp)}:${w.level}:${w.warden.dashCharges}`;
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
    this.lastModalKey = '';
    if (paused) this.showPause();
    else this.syncModal(w);
  }

  private showPause(): void {
    this.openModal();
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
          <button class="sw-reroll" data-act="quit">Abandon run</button>
        </div>
        <p class="sw-note">Esc resumes · abandoning returns to the Hub and keeps nothing.</p>
      </div>`;
    if (this.confirmingAbandon) {
      this.modal
        .querySelector('[data-act="cancel"]')
        ?.addEventListener('click', () => {
          this.confirmingAbandon = false;
          this.showPause();
        });
      this.modal
        .querySelector('[data-act="confirm"]')
        ?.addEventListener('click', () => this.cb.onQuitToHub());
    } else {
      this.modal
        .querySelector('[data-act="resume"]')
        ?.addEventListener('click', () => this.cb.onResume());
      this.modal
        .querySelector('[data-act="quit"]')
        ?.addEventListener('click', () => {
          this.confirmingAbandon = true;
          this.showPause();
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

  private openModal(): void {
    this.modal.hidden = false;
    this.modal.classList.remove('sw-off');
  }

  private showOffers(w: World, offers: Offer[]): void {
    this.openModal();
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
        <button class="sw-reroll" ${w.rerollsLeft <= 0 ? 'disabled' : ''}>Reroll (${w.rerollsLeft})</button>
      </div>`;
    for (const el of this.modal.querySelectorAll<HTMLElement>('.sw-offer')) {
      el.addEventListener('click', () => this.cb.onPickOffer(Number(el.dataset.i)));
    }
    this.modal.querySelector('.sw-reroll')?.addEventListener('click', () => this.cb.onReroll());
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
          <div><span>Relics</span><b>${w.relicsFound.length}</b></div>
          <div><span>Ember</span><b>${w.emberEarned}</b></div>
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
  const pct = Math.round(armorReduction(armor) * 100);
  const suffix = pct < 0 ? `${-pct}% more taken` : `${pct}% off`;
  return `${Math.round(armor)} (${suffix})`;
}

/** SPEC-V3 T2: the character's own stats. */
export function wardenInfoMarkup(w: World): string {
  const d = w.derived;
  const rows = [
    row('Health', `${Math.ceil(w.warden.hp)} / ${Math.round(d.maxHp)}`),
    row('Regen', `${round1(d.hpRegen)} / s`),
    row('Armour', armourText(wardenArmor(w))),
    row('Move speed', `${round1(d.moveSpeed)} tiles/s`),
    row('Power', `+${Math.round((d.powerMul - 1) * 100)}%`),
    row('Attack speed', `+${Math.round((d.attackSpeedMul - 1) * 100)}%`),
    row('Area', `+${Math.round((d.areaMul - 1) * 100)}%`),
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
