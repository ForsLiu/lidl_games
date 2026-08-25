/**
 * The between-runs hub (SPEC 8): choose a class and map tier, draft the tier's
 * modifiers, spend Constellation points, and craft relics with Orbs.
 *
 * Presentation only — every rule lives in /src/meta and /src/sim.
 */

import { loadContent } from '../sim/content';
import { Rng } from '../sim/rng';
import type { MetaState, Relic, RunConfig } from '../sim/types';
import {
  accountLevelFor,
  allocate,
  pointsAvailable,
  refund,
  stashCapacity,
} from '../meta/meta';
import { craft, discard, equip, type OrbKey } from '../meta/crafting';
import { modifierDraft } from '../sim/tiers';
import { renderTreeView } from './tree-view';
import { sanitize, type Settings } from './settings';

type Tab = 'run' | 'tree' | 'stash' | 'settings';

export interface HubCallbacks {
  settings: Settings;
  onStart(cfg: RunConfig): void;
  onMetaChanged(meta: MetaState): void;
  onSettingsChanged(settings: Settings): void;
}

export class Hub {
  private root: HTMLElement;
  private cb: HubCallbacks;
  private meta: MetaState;
  private tab: Tab = 'run';
  /** Practice runs enable the in-run tool and bank nothing. */
  private practice = false;
  private classKey: string;
  private tier = 1;
  private picks: number[] = [];
  private seed: number;
  private selectedRelic: number | null = null;
  private settings: Settings;
  /** Transient one-line feedback under the tab bar. */
  private notice = '';
  /**
   * Points spent in this Hub visit. They have not been taken into a run yet, so
   * taking one back is an undo rather than a respec, and costs no Ember.
   */
  private readonly spentThisVisit = new Set<number>();

  constructor(root: HTMLElement, meta: MetaState, seed: number, cb: HubCallbacks) {
    this.root = root;
    this.meta = meta;
    this.cb = cb;
    this.seed = seed;
    this.classKey = meta.unlockedClasses[0] ?? 'engineer';
    this.settings = cb.settings;
  }

  /** Switches tab and re-renders. Also the seam tests use to reach a tab. */
  openTab(tab: Tab): void {
    this.tab = tab;
    this.show();
  }

  show(): void {
    this.root.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'sw-hub';
    el.innerHTML = `
      <header>
        <h1>Stonewake</h1>
        <div class="sw-account">
          <span>Level <b>${this.meta.accountLevel}</b></span>
          <span>Ember <b class="gold">${this.meta.ember}</b></span>
          <span>Points <b>${pointsAvailable(this.meta)}</b></span>
          <span>Orbs <b>${this.meta.orbs.whetting}/${this.meta.orbs.turning}/${this.meta.orbs.ascension}</b></span>
        </div>
      </header>
      <nav>
        ${(['run', 'tree', 'stash', 'settings'] as Tab[])
          .map(
            (t) =>
              `<button data-tab="${t}" class="${this.tab === t ? 'on' : ''}">${
                { run: 'Run', tree: 'Constellation', stash: 'Stash', settings: 'Settings' }[t]
              }</button>`,
          )
          .join('')}
      </nav>
      ${this.notice ? `<p class="sw-notice">${this.notice}</p>` : ''}
      <section id="sw-hub-body"></section>`;
    this.root.appendChild(el);
    for (const b of el.querySelectorAll<HTMLElement>('nav button')) {
      b.addEventListener('click', () => {
        this.tab = b.dataset.tab as Tab;
        this.show();
      });
    }
    const body = el.querySelector('#sw-hub-body') as HTMLElement;
    if (this.tab === 'run') this.renderRun(body);
    else if (this.tab === 'tree') this.renderTree(body);
    else if (this.tab === 'stash') this.renderStash(body);
    else this.renderSettings(body);
  }

  private commit(meta: MetaState): void {
    this.notice = '';
    this.meta = meta;
    this.cb.onMetaChanged(meta);
    this.show();
  }

  /* --------------------------------------------------------------- run tab */

  private renderRun(body: HTMLElement): void {
    const content = loadContent();
    const maxTier = Math.max(1, Math.min(5, this.meta.highestTier));
    if (this.tier > maxTier) this.tier = maxTier;
    const draft = modifierDraft(content, this.seed, this.tier);
    if (this.picks.length !== draft.length) this.picks = draft.map(() => 0);

    body.innerHTML = `
      <div class="sw-panel">
        <h2>Class</h2>
        <div class="sw-choices">
          ${content.classes.classes
            .map((c) => {
              const locked = !this.meta.unlockedClasses.includes(c.key);
              const quest = content.quests.quests.find((q) => q.key === c.unlockQuest);
              return `<button class="sw-choice ${this.classKey === c.key ? 'on' : ''} ${
                locked ? 'locked' : ''
              }" data-class="${c.key}" ${locked ? 'disabled' : ''}>
                <b>${c.name}</b><span>${c.trait}</span>
                ${locked ? `<small>Locked — ${quest?.desc ?? 'complete a quest'}</small>` : ''}
              </button>`;
            })
            .join('')}
        </div>
      </div>

      <div class="sw-panel">
        <h2>Map tier</h2>
        <div class="sw-tiers">
          ${[1, 2, 3, 4, 5]
            .map(
              (t) =>
                `<button class="sw-tier ${this.tier === t ? 'on' : ''}" data-tier="${t}" ${
                  t > maxTier ? 'disabled' : ''
                }>T${t}</button>`,
            )
            .join('')}
        </div>
        <p class="sw-note">Tier ${this.tier} applies ${this.tier - 1} modifier${
          this.tier === 2 ? '' : 's'
        } and pays ×${(1 + content.modifiers.tierRewardPerStep * (this.tier - 1)).toFixed(2)} rewards.</p>
        ${
          draft.length === 0
            ? '<p class="sw-note">No modifiers at tier 1.</p>'
            : draft
                .map(
                  (slot, i) => `<div class="sw-draft">
                    ${slot.options
                      .map(
                        (m, j) =>
                          `<button class="sw-mod ${this.picks[i] === j ? 'on' : ''}" data-slot="${i}" data-opt="${j}">
                            <b>${m.name}</b><span>${m.desc}</span><small>+${Math.round(
                              m.rewardBonus * 100,
                            )}% reward</small>
                          </button>`,
                      )
                      .join('')}
                  </div>`,
                )
                .join('')
        }
      </div>

      <div class="sw-panel">
        <h2>Loadout</h2>
        <div class="sw-equipped">
          ${content.relics.slots
            .map((slot) => {
              const id = this.meta.equipped[slot as 'sigil'];
              const relic = this.meta.stash.find((r) => r.id === id);
              return `<div class="sw-slot"><span>${slot}</span><b>${
                relic ? relic.name : '—'
              }</b></div>`;
            })
            .join('')}
        </div>
        <label class="sw-setting practice">
          <span>Practice run</span>
          <input type="checkbox" id="sw-practice" ${this.practice ? 'checked' : ''} />
        </label>
        <p class="sw-note">${
          this.practice
            ? 'The in-run tool is on: kill the board, add gold, skip a wave, summon the boss. Nothing is banked — no Ember, no relics, no Orbs, no quest progress.'
            : 'A normal run. Everything you earn is kept.'
        }</p>
        <button class="sw-go" id="sw-start">${this.practice ? 'Begin practice run' : 'Begin the Daywatch'}</button>
      </div>`;

    for (const b of body.querySelectorAll<HTMLElement>('[data-class]')) {
      b.addEventListener('click', () => {
        this.classKey = b.dataset.class!;
        this.show();
      });
    }
    for (const b of body.querySelectorAll<HTMLElement>('[data-tier]')) {
      b.addEventListener('click', () => {
        this.tier = Number(b.dataset.tier);
        this.picks = [];
        this.show();
      });
    }
    for (const b of body.querySelectorAll<HTMLElement>('[data-slot]')) {
      b.addEventListener('click', () => {
        this.picks[Number(b.dataset.slot)] = Number(b.dataset.opt);
        this.show();
      });
    }
    body.querySelector('#sw-practice')?.addEventListener('change', () => {
      this.practice = !this.practice;
      this.show();
    });
    body.querySelector('#sw-start')?.addEventListener('click', () => {
      const modifiers = draft.map((slot, i) => slot.options[this.picks[i] ?? 0].key);
      this.cb.onStart({
        seed: this.seed,
        classKey: this.classKey,
        tier: this.tier,
        modifiers,
        allocated: this.meta.allocated,
        relics: equippedRelics(this.meta),
        practice: this.practice,
      });
    });
  }

  /* -------------------------------------------------------------- tree tab */

  private renderTree(body: HTMLElement): void {
    renderTreeView(body, {
      meta: () => this.meta,
      isFreeUndo: (id) => this.spentThisVisit.has(id),
      onAllocate: (id) => {
        this.spentThisVisit.add(id);
        this.commit(allocate(this.meta, id));
      },
      onRefund: (id, free) => {
        this.spentThisVisit.delete(id);
        const cost = loadContent().tree.respecCostPerNode;
        this.meta = refund(this.meta, id, { free });
        this.cb.onMetaChanged(this.meta);
        // Set after commit-equivalent work: commit() clears the notice.
        this.notice = free ? 'Point returned.' : `Node refunded for ${cost} Ember.`;
        this.show();
      },
      onRefuse: (message) => {
        this.notice = message;
        this.show();
      },
    });
  }


  /* ---------------------------------------------------------- settings tab */

  private renderSettings(body: HTMLElement): void {
    const s = this.settings;
    body.innerHTML = `
      <div class="sw-panel">
        <h2>Settings</h2>
        <p class="sw-note">Presentation only — none of these change the simulation.</p>
        ${SLIDERS.map(
          (row) => `<label class="sw-setting">
            <span>${row.label}</span>
            <input type="range" min="0" max="100" value="${Math.round((s[row.key] as number) * 100)}"
                   data-slider="${row.key}" />
            <b data-out="${row.key}">${Math.round((s[row.key] as number) * 100)}%</b>
          </label>`,
        ).join('')}
        ${TOGGLES.map(
          (row) => `<label class="sw-setting">
            <span>${row.label}</span>
            <input type="checkbox" data-toggle="${row.key}" ${s[row.key] ? 'checked' : ''} />
          </label>`,
        ).join('')}
        <label class="sw-setting">
          <span>Max damage numbers</span>
          <input type="range" min="0" max="200" value="${s.maxDamageNumbers}" data-count="1" />
          <b data-out="maxDamageNumbers">${s.maxDamageNumbers}</b>
        </label>
      </div>`;

    const commit = () => {
      this.settings = sanitize(this.settings);
      this.cb.onSettingsChanged(this.settings);
    };
    for (const el of body.querySelectorAll<HTMLInputElement>('[data-slider]')) {
      el.addEventListener('input', () => {
        const key = el.dataset.slider as 'masterVolume';
        this.settings = { ...this.settings, [key]: Number(el.value) / 100 };
        const out = body.querySelector(`[data-out="${key}"]`);
        if (out) out.textContent = `${el.value}%`;
        commit();
      });
    }
    for (const el of body.querySelectorAll<HTMLInputElement>('[data-toggle]')) {
      el.addEventListener('change', () => {
        const key = el.dataset.toggle as 'damageNumbers';
        this.settings = { ...this.settings, [key]: el.checked };
        commit();
      });
    }
    const count = body.querySelector<HTMLInputElement>('[data-count]');
    count?.addEventListener('input', () => {
      this.settings = { ...this.settings, maxDamageNumbers: Number(count.value) };
      const out = body.querySelector('[data-out="maxDamageNumbers"]');
      if (out) out.textContent = count.value;
      commit();
    });
  }

  /* ------------------------------------------------------------- stash tab */

  private renderStash(body: HTMLElement): void {
    const content = loadContent();
    const cap = stashCapacity(this.meta);
    const selected = this.meta.stash.find((r) => r.id === this.selectedRelic) ?? null;

    body.innerHTML = `
      <div class="sw-panel">
        <h2>Stash <small>${this.meta.stash.length}/${cap}</small></h2>
        <div class="sw-stash">
          ${
            this.meta.stash.length === 0
              ? '<p class="sw-note">Empty. Relics drop from elites and bosses.</p>'
              : this.meta.stash
                  .map(
                    (r) =>
                      `<button class="sw-relic ${r.rarity} ${
                        this.selectedRelic === r.id ? 'on' : ''
                      }" data-relic="${r.id}">
                        <b>${r.name}</b><small>${r.slot} · ${r.rarity}</small>
                      </button>`,
                  )
                  .join('')
          }
        </div>
      </div>
      <div class="sw-panel">
        <h2>Relic</h2>
        ${
          selected
            ? `<div class="sw-relicdetail">
                 <b>${selected.name}</b>
                 <div class="sw-affix implicit">${implicitLine(selected)}</div>
                 ${selected.affixes
                   .map((a) => {
                     const def = content.relics.affixes.find((d) => d.key === a.key)!;
                     return `<div class="sw-affix">${def.name} — ${formatStat(a.stat, a.value, def.pct)}</div>`;
                   })
                   .join('')}
                 <div class="sw-craftrow">
                   ${(['whetting', 'turning', 'ascension'] as OrbKey[])
                     .map(
                       (o) =>
                         `<button data-orb="${o}" ${this.meta.orbs[o] <= 0 ? 'disabled' : ''}>
                            ${content.relics.orbs.find((x) => x.key === o)!.name} (${this.meta.orbs[o]})
                          </button>`,
                     )
                     .join('')}
                 </div>
                 <div class="sw-craftrow">
                   <button data-equip="1">Equip to ${selected.slot}</button>
                   <button data-discard="1" class="danger">Discard</button>
                 </div>
               </div>`
            : '<p class="sw-note">Select a relic.</p>'
        }
      </div>`;

    for (const el of body.querySelectorAll<HTMLElement>('[data-relic]')) {
      el.addEventListener('click', () => {
        this.selectedRelic = Number(el.dataset.relic);
        this.show();
      });
    }
    if (!selected) return;
    for (const el of body.querySelectorAll<HTMLElement>('[data-orb]')) {
      el.addEventListener('click', () => {
        const orb = el.dataset.orb as OrbKey;
        // Crafting is seeded off the account so a reload cannot reroll a result.
        const rng = new Rng((this.meta.ember * 2654435761 + selected.id * 97 + orb.length) >>> 0);
        const res = craft(this.meta, orb, selected.id, rng);
        if (res.ok) this.commit(res.meta);
      });
    }
    body.querySelector('[data-equip]')?.addEventListener('click', () => {
      this.commit(equip(this.meta, selected.slot, selected.id));
    });
    body.querySelector('[data-discard]')?.addEventListener('click', () => {
      this.selectedRelic = null;
      this.commit(discard(this.meta, selected.id));
    });
  }
}

/* ---------------------------------------------------------- settings tab */

const SLIDERS: { key: keyof Settings; label: string }[] = [
  { key: 'masterVolume', label: 'Master volume' },
  { key: 'sfxVolume', label: 'Effects volume' },
  { key: 'shake', label: 'Screen shake' },
];

const TOGGLES: { key: keyof Settings; label: string }[] = [
  { key: 'damageNumbers', label: 'Damage numbers' },
  { key: 'showRanges', label: 'Show tower ranges' },
  { key: 'showGrid', label: 'Show grid' },
];

/* ----------------------------------------------------------------- helpers */

export function equippedRelics(meta: MetaState): Relic[] {
  const out: Relic[] = [];
  for (const slot of ['sigil', 'plate', 'charm'] as const) {
    const id = meta.equipped[slot];
    if (id === null) continue;
    const r = meta.stash.find((x) => x.id === id);
    if (r) out.push(r);
  }
  return out;
}

function implicitLine(relic: Relic): string {
  const imp = loadContent().relics.implicits[relic.slot];
  if (!imp) return '';
  return `${formatStat(imp.stat, imp.value, imp.value < 1)} (implicit)`;
}

function formatStat(stat: string, value: number, pct: boolean): string {
  const label = stat.replace(/([A-Z])/g, ' $1').toLowerCase();
  return pct ? `+${Math.round(value * 1000) / 10}% ${label}` : `+${value} ${label}`;
}


export { accountLevelFor };
