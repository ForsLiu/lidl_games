/** DOM chrome around the canvas: HUD, tower bar, and the modal choice screens. */

import type { World } from '../sim/world';
import { towerCost } from '../sim/towers';
import type { Offer } from '../sim/types';
import { TOWER_COLORS, projectileStyle } from '../render/theme';
import { towerInfo, weaponInfo, type TowerInfo, type WeaponInfo } from './tower-info';
import { runProgress, type RunProgress } from './progress';
import type { DevOp } from '../sim/types';

export interface HudCallbacks {
  onSelectTower(id: number): void;
  onCallWave(): void;
  onPickSouls(keys: string[]): void;
  onPickOffer(index: number): void;
  onReroll(): void;
  onRestart(): void;
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
  private selectedWeapon = '';
  private cb: HudCallbacks;
  private selected = 0;
  private lastModalKey = '';
  private paused = false;

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
            <button class="sw-ctl" data-act="ranges" title="Show tower ranges (R)">Ranges</button>
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
            <b>0</b> clear &middot; <b>Enter</b> call wave &middot; <b>R</b> ranges &middot;
            <b>F</b> speed &middot; <b>Esc</b> pause
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
        if (el.dataset.dev === 'invuln') el.classList.toggle('on');
      });
    }
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
    const towers = w.content.towers.towers.filter(
      (t) => !t.classLock || t.classLock === w.cfg.classKey,
    );
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
    const towers = w.content.towers.towers.filter(
      (t) => !t.classLock || t.classLock === w.cfg.classKey,
    );
    const t = towers[index];
    if (t) this.select(t.id);
  }

  clearSelection(): void {
    this.selected = 0;
    for (const el of this.bar.querySelectorAll('.sw-tower')) el.classList.remove('sel');
    this.cb.onSelectTower(0);
  }

  update(w: World, cursor?: { x: number; y: number }): void {
    const d = w.derived;
    const hpPct = Math.max(0, (w.warden.hp / d.maxHp) * 100);

    this.stats.innerHTML = `
      <div class="sw-row"><span>Warden</span><b>${Math.ceil(w.warden.hp)} / ${Math.round(d.maxHp)}</b></div>
      <div class="sw-meter"><i style="width:${hpPct}%"></i></div>
      ${
        w.sundered
          ? `<div class="sw-row"><span>Level</span><b>${w.level}</b></div>
             <div class="sw-row"><span>Kills</span><b>${w.kills}</b></div>`
          : `<div class="sw-row"><span>Core</span><b>${Math.ceil(w.coreHp)} / ${w.coreMaxHp}</b></div>
             <div class="sw-meter core"><i style="width:${Math.max(0, (w.coreHp / w.coreMaxHp) * 100)}%"></i></div>
             <div class="sw-row"><span>Gold</span><b class="gold">${w.gold}</b></div>`
      }
      <div class="sw-row"><span>Dash</span><b>${w.warden.dashCharges}/${d.dashCharges}</b></div>
      ${
        w.weapons.length > 0
          ? `<div class="sw-sub">Weapons</div>` +
            w.weapons
              .map(
                (x) =>
                  `<div class="sw-row small"><span>${w.content.weaponByKey.get(x.key)?.name ?? x.key}${
                    x.awakened ? ' ★' : ''
                  }</span><b>Lv ${x.level}${x.damageBonus > 0 ? ` +${Math.round(x.damageBonus * 100)}%` : ''}</b></div>`,
              )
              .join('')
          : ''
      }
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
    this.bar.classList.toggle('hidden', w.sundered);
    this.progressEl.innerHTML = progressMarkup(runProgress(w));
    this.renderTowerInfo(w, cursor);
  }

  /**
   * After the Sundering there is no tower bar, and the HUD said only "Lv 6".
   * The same panel now carries the bound weapon: what it does, its real numbers
   * at this level, what the next level buys, and the Awakening it can reach.
   */
  private renderWeaponInfo(w: World): void {
    const ws = w.weapons.find((x) => x.key === this.selectedWeapon) ?? w.weapons[0];
    if (!ws) {
      if (this.lastInfoKey !== 'noweapons') {
        this.lastInfoKey = 'noweapons';
        this.towerInfoEl.innerHTML = '';
      }
      return;
    }
    const key = `w:${ws.key}:${ws.level}:${ws.awakened}:${w.weapons.length}`;
    if (key === this.lastInfoKey) return;
    this.lastInfoKey = key;
    this.towerInfoEl.innerHTML = weaponInfoMarkup(weaponInfo(w, ws), w.weapons.map((x) => x.key));
    for (const el of this.towerInfoEl.querySelectorAll<HTMLElement>('[data-weapon]')) {
      el.addEventListener('click', () => {
        this.selectedWeapon = el.dataset.weapon!;
        this.lastInfoKey = '';
        this.renderWeaponInfo(w);
      });
    }
  }

  /**
   * The tower panel: what is under the cursor if that is a structure, otherwise
   * whatever tower is selected on the bar. Re-rendered only when something the
   * panel shows has actually changed, since update() runs every frame.
   */
  private renderTowerInfo(w: World, cursor?: { x: number; y: number }): void {
    if (w.sundered) {
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
    this.lastModalKey = '';
    if (paused) this.showPause();
    else this.syncModal(w);
  }

  private showPause(): void {
    this.openModal();
    this.modal.innerHTML = `
      <div class="sw-card">
        <h2>Paused</h2>
        <p>The Vale holds its breath.</p>
        <div class="sw-pausebuttons">
          <button class="sw-go" data-act="resume">Resume</button>
          <button class="sw-reroll" data-act="quit">Abandon run</button>
        </div>
        <p class="sw-note">Esc resumes · abandoning returns to the Hub and keeps nothing.</p>
      </div>`;
    this.modal
      .querySelector('[data-act="resume"]')
      ?.addEventListener('click', () => this.cb.onResume());
    this.modal
      .querySelector('[data-act="quit"]')
      ?.addEventListener('click', () => this.cb.onQuitToHub());
  }

  /** Modal screens: soul picker, level-up, results. */
  syncModal(w: World): void {
    if (this.paused) return;
    const key = `${w.phase}:${w.offers.length}:${w.soulCandidates.join(',')}:${w.outcome}:${w.level}`;
    if (key === this.lastModalKey) return;
    this.lastModalKey = key;

    if (w.phase === 'soulpick') {
      this.showSoulPicker(w);
    } else if (w.phase === 'levelup') {
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

  private showSoulPicker(w: World): void {
    const slots = w.derived.weaponSlots;
    const chosen = new Set<string>();
    this.openModal();
    const render = () => {
      this.modal.innerHTML = `
        <div class="sw-card wide">
          <h2>The Sundering</h2>
          <p>Your towers petrify. Choose <b>${slots}</b> souls to bind.</p>
          <div class="sw-souls">
            ${w.soulCandidates
              .map((k) => {
                const def = w.content.weaponByKey.get(k)!;
                const src = w.content.towerByKey.get(def.source);
                return `<button class="sw-soul ${chosen.has(k) ? 'on' : ''}" data-k="${k}">
                  <b>${def.name}</b><small>from ${src?.name ?? def.source}</small>
                  <span>${def.desc}</span></button>`;
              })
              .join('')}
          </div>
          <button class="sw-go" ${chosen.size === 0 ? 'disabled' : ''}>Bind ${chosen.size}/${slots}</button>
        </div>`;
      for (const el of this.modal.querySelectorAll<HTMLElement>('.sw-soul')) {
        el.addEventListener('click', () => {
          const k = el.dataset.k!;
          if (chosen.has(k)) chosen.delete(k);
          else if (chosen.size < slots) chosen.add(k);
          render();
        });
      }
      this.modal.querySelector('.sw-go')?.addEventListener('click', () => {
        this.cb.onPickSouls([...chosen]);
      });
    };
    render();
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
                <small>${o.kind === 'awakening' ? 'AWAKENING' : o.kind.toUpperCase()}</small>
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
          <div><span>Survived</span><b>${mm(w.act2Time)}</b></div>
          <div><span>Level</span><b>${w.level}</b></div>
          <div><span>Kills</span><b>${w.kills}</b></div>
          <div><span>Towers built</span><b>${w.towersBuilt}</b></div>
          <div><span>Relics</span><b>${w.relicsFound.length}</b></div>
          <div><span>Orbs</span><b>${w.orbsFound.length}</b></div>
          <div><span>Ember</span><b>${w.emberEarned}</b></div>
        </div>
        ${w.practiceUsed ? '<p class="sw-note">Practice run — nothing was banked.</p>' : ''}
        <button class="sw-go">New run</button>
      </div>`;
    this.modal.querySelector('.sw-go')?.addEventListener('click', () => this.cb.onRestart());
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
  const tierText = placed ? `Tier ${info.tier} / ${info.maxTier}` : 'Tier 1 when placed';

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
      `<div class="sw-row"><span>Upgrade to T${info.upgrade.toTier}</span><b class="${
        gold >= info.upgrade.cost ? 'gold' : 'poor'
      }">${info.upgrade.cost}g</b></div>`,
    );
  } else if (placed) {
    money.push('<div class="sw-row"><span>Upgrade</span><b>at max tier</b></div>');
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
    ${
      info.soul
        ? `<div class="sw-sub">Soul &mdash; ${info.soul.name}</div><p class="sw-note">${info.soul.desc} Its level at the Sundering is this tower's highest tier.</p>`
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

/** The practice tool's buttons, in the order a tester reaches for them. */
export const PRACTICE_BUTTONS: { op: DevOp; amount: number; label: string; title: string }[] = [
  { op: 'kill_all', amount: 0, label: 'Kill all', title: 'Kills every enemy except the boss; bounty and gems still drop' },
  { op: 'gold', amount: 500, label: '+500 gold', title: 'Adds gold' },
  { op: 'xp', amount: 500, label: '+500 XP', title: 'Act II only' },
  { op: 'heal', amount: 0, label: 'Full heal', title: 'Warden and Core to full' },
  { op: 'invuln', amount: 0, label: 'Invulnerable', title: 'Toggles Warden damage off' },
  { op: 'skip_wave', amount: 0, label: 'Skip wave', title: 'Ends the build phase, or clears the running wave' },
  { op: 'fast_forward', amount: 60, label: '+1 min', title: 'Advances the Nightfall clock by a minute' },
  { op: 'summon_boss', amount: 0, label: 'Summon boss', title: 'Jumps the clock to the Warden-Eater' },
];

/** The Act II weapon card, with a tab strip for the other bound souls. */
export function weaponInfoMarkup(info: WeaponInfo, all: string[]): string {
  const colour = projectileStyle(info.key).color;
  const tabs = all
    .map(
      (k) =>
        `<button class="sw-wtab ${k === info.key ? 'on' : ''}" data-weapon="${k}"
                 style="--wc:${projectileStyle(k).color}"></button>`,
    )
    .join('');

  const stats = info.stats
    .map(
      (line) =>
        `<div class="sw-row small"><span>${line.label}</span><b>${line.value}${
          line.next ? `<i class="sw-next"> &rarr; ${line.next}</i>` : ''
        }</b></div>`,
    )
    .join('');

  return `
    <div class="sw-wtabs">${tabs}</div>
    <h3 style="color:${colour}">${info.name}${info.awakened ? ' ★' : ''}
      <small>Lv ${info.level} / ${info.maxLevel}</small></h3>
    <p class="sw-note">${info.attackText}</p>
    ${stats}
    <p class="sw-note dim">${info.sourceText}</p>
    ${
      info.awakening
        ? `<div class="sw-sub">Awakening — ${info.awakening.name}</div>
           <p class="sw-note">${info.awakening.desc}</p>
           <p class="sw-hint">Needs ${info.awakening.needs}.</p>`
        : info.awakened
          ? '<p class="sw-hint">Awakened.</p>'
          : ''
    }`;
}
