/** DOM chrome around the canvas: HUD, tower bar, and the modal choice screens. */

import type { World } from '../sim/world';
import { towerCost } from '../sim/towers';
import type { Offer } from '../sim/types';
import { TOWER_COLORS } from '../render/theme';

export interface HudCallbacks {
  onSelectTower(id: number): void;
  onCallWave(): void;
  onPickSouls(keys: string[]): void;
  onPickOffer(index: number): void;
  onReroll(): void;
  onRestart(): void;
  onToggleRanges(): void;
}

export class Hud {
  readonly root: HTMLElement;
  private bar: HTMLElement;
  private stats: HTMLElement;
  private modal: HTMLElement;
  private toast: HTMLElement;
  private cb: HudCallbacks;
  private selected = 0;
  private lastModalKey = '';

  constructor(root: HTMLElement, cb: HudCallbacks) {
    this.root = root;
    this.cb = cb;
    root.innerHTML = `
      <div class="sw-shell">
        <div class="sw-stage">
          <canvas id="sw-canvas"></canvas>
          <div class="sw-modal" id="sw-modal" hidden></div>
          <div class="sw-toast" id="sw-toast"></div>
        </div>
        <div class="sw-side">
          <div class="sw-stats" id="sw-stats"></div>
          <div class="sw-bar" id="sw-bar"></div>
          <div class="sw-help">
            <b>WASD</b> move &middot; <b>Space</b> dash &middot; <b>LMB</b> build &middot;
            <b>RMB</b> sell &middot; <b>U</b>+click upgrade &middot; <b>1-9</b> pick tower &middot;
            <b>0</b> clear &middot; <b>Enter</b> call wave &middot; <b>R</b> ranges
          </div>
        </div>
      </div>`;
    this.bar = root.querySelector('#sw-bar') as HTMLElement;
    this.stats = root.querySelector('#sw-stats') as HTMLElement;
    this.modal = root.querySelector('#sw-modal') as HTMLElement;
    this.toast = root.querySelector('#sw-toast') as HTMLElement;
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

  update(w: World): void {
    const d = w.derived;
    const mm = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const phaseLabel: Record<string, string> = {
      act1_build: `Daywatch — build (${Math.ceil(w.buildTimer)}s)`,
      act1_wave: `Daywatch — wave ${w.wave}/${w.waveCount}`,
      dusk: `Dusk (${Math.ceil(w.duskTimer)}s)`,
      soulpick: 'Soul binding',
      act2: `Nightfall ${mm(w.act2Time)}`,
      levelup: 'Level up',
      results: 'Results',
    };
    const hpPct = Math.max(0, (w.warden.hp / d.maxHp) * 100);

    this.stats.innerHTML = `
      <div class="sw-phase">${phaseLabel[w.phase] ?? w.phase}</div>
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
  }

  /** Modal screens: soul picker, level-up, results. */
  syncModal(w: World): void {
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
      this.modal.hidden = true;
      this.modal.innerHTML = '';
    }
  }

  private showSoulPicker(w: World): void {
    const slots = w.derived.weaponSlots;
    const chosen = new Set<string>();
    this.modal.hidden = false;
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
    this.modal.hidden = false;
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
    this.modal.hidden = false;
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
