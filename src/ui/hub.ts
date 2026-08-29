/**
 * The between-runs hub (SPEC 8): choose a class and map tier, draft the tier's
 * modifiers, and spend Constellation points.
 *
 * Presentation only — every rule lives in /src/meta and /src/sim.
 */

import { defaultCoreKey, loadContent, type Content } from '../sim/content';
import type { MetaState, Relic, RunConfig } from '../sim/types';
import {
  accountLevelFor,
  defaultMeta,
  seedTestAccount,
  allocate,
  pointsAvailable,
  refund,
  stashCapacity,
} from '../meta/meta';
import { modifierDraft } from '../sim/tiers';
import { devProfileActive } from '../meta/devprofile';

/**
 * Referenced directly rather than through a helper so the bundler can fold it:
 * Vite replaces `import.meta.env.DEV` with a literal `false` in a production
 * build, which lets esbuild drop the badge markup entirely. Gate C8 asserts the
 * string is absent from `dist/`, so a helper call here would fail it — the
 * badge would ship, dead but present.
 */
const DEV_BUILD = (import.meta as unknown as { env?: { DEV?: unknown } }).env?.DEV === true;
const DEV_BADGE =
  '<span class="sw-devbadge" title="data/dev.json devMode is on. Production builds always run with this off.">DEV PROFILE</span>';
import { discard, equip, equipItem } from '../meta/stash';
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
  /** SPEC-FINAL §6.3: resolves level-ups without pausing (owner feedback `feature-auto-pick-boons`). */
  private autoPick = false;
  private classKey: string;
  /** SPEC-FINAL §5.5: mirrors `classKey` — chosen beside class select, defaults to Stone Heart. */
  private coreKey: string;
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
    this.coreKey = meta.unlockedCores[0] ?? 'stone_heart';
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
        <div class="sw-account">${accountMarkup(this.meta)}</div>
        ${DEV_BUILD && devProfileActive() ? DEV_BADGE : ''}
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
              // SPEC-FINAL §4 (`legacy: false`) has no single `trait` line or
              // one Active — show the passive's own description and both
              // Active names instead of the SPEC-V2 `trait`/single-Active pair.
              const trait = c.legacy ? c.trait : c.passive.description;
              const activeLine = c.legacy
                ? `Active: ${c.active.name} (Q) &middot; Passive: ${c.passive.name}`
                : `Active: ${c.active1.name} (Q)/${c.active2.name} (E) &middot; Passive: ${c.passive.name}`;
              return `<button class="sw-choice ${this.classKey === c.key ? 'on' : ''} ${
                locked ? 'locked' : ''
              }" data-class="${c.key}" ${locked ? 'disabled' : ''}>
                <b>${c.name}</b><span>${trait}</span>
                <small>${activeLine}</small>
                ${locked ? `<small>Locked — ${quest?.desc ?? 'complete a quest'}</small>` : ''}
              </button>`;
            })
            .join('')}
        </div>
      </div>

      <div class="sw-panel">
        <h2>Core</h2>
        <div class="sw-choices">
          ${content.cores.cores
            .map((core) => {
              // §5.5's default is never itself locked out — guarding here too,
              // not just in `migrate()`, since QA reproduced this by handing
              // the Hub a bare `unlockedCores: []` directly (a malformed-meta
              // shape `migrate()` can't intercept if something else ever
              // constructs a `Hub` without going through it).
              const locked = core.key !== defaultCoreKey(content) && !this.meta.unlockedCores.includes(core.key);
              return `<button class="sw-choice ${this.coreKey === core.key ? 'on' : ''} ${
                locked ? 'locked' : ''
              }" data-core="${core.key}" ${locked ? 'disabled' : ''}>
                <b>${core.name}</b><span>${core.baseHp} HP</span>
                ${locked ? `<small>Locked — ${core.unlockCondition ?? 'complete a quest'}</small>` : ''}
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
            ? 'The in-run tool is on: kill the board, add gold, skip a wave, summon the boss. Nothing is banked — no Ember, no relics, no quest progress.'
            : 'A normal run. Everything you earn is kept.'
        }</p>
        <label class="sw-setting autopick">
          <span>Auto-pick level-ups</span>
          <input type="checkbox" id="sw-autopick" ${this.autoPick ? 'checked' : ''} />
        </label>
        <p class="sw-note">${
          this.autoPick
            ? 'Level-ups resolve themselves: the highest-rank boon you already own, or the first card offered. Can be flipped mid-run from the HUD.'
            : 'Level-ups pause the run for your choice.'
        }</p>
        <button class="sw-go" id="sw-start">${this.practice ? 'Begin practice run' : 'Begin the Daywatch'}</button>
      </div>`;

    for (const b of body.querySelectorAll<HTMLElement>('[data-class]')) {
      b.addEventListener('click', () => {
        this.classKey = b.dataset.class!;
        this.show();
      });
    }
    // "locked cores refused": only a button for an unlocked core gets a
    // listener at all, on top of `disabled` — the same defense-in-depth
    // `data-tier`'s `t > maxTier` disabled check relies on the attribute
    // alone for, but a Core choice flows straight into RunConfig with no
    // further validation before a run starts, so this guard is the one place
    // "locked" is actually enforced rather than merely displayed.
    for (const b of body.querySelectorAll<HTMLElement>('[data-core]')) {
      const key = b.dataset.core!;
      // Mirrors the render-time `locked` computation above exactly (default
      // core always allowed) — otherwise an emptied `unlockedCores` would
      // render Stone Heart as clickable but silently attach no listener.
      const unlocked = key === defaultCoreKey(content) || this.meta.unlockedCores.includes(key);
      if (!unlocked) continue;
      b.addEventListener('click', () => {
        this.coreKey = key;
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
    body.querySelector('#sw-autopick')?.addEventListener('change', () => {
      this.autoPick = !this.autoPick;
      this.show();
    });
    body.querySelector('#sw-start')?.addEventListener('click', () => {
      const modifiers = draft.map((slot, i) => slot.options[this.picks[i] ?? 0].key);
      // Belt-and-suspenders against a locked core reaching RunConfig at all
      // (e.g. `unlockedCores` shrinking between render and click): fall back
      // to whatever the account actually has unlocked, not the content-wide
      // default outright — a save whose `unlockedCores` omits the default row
      // (data-corruption territory `migrate` doesn't produce today, but not
      // structurally impossible) would otherwise still let a submit through
      // for a core nothing on the account actually unlocked.
      const core = this.meta.unlockedCores.includes(this.coreKey)
        ? this.coreKey
        : this.meta.unlockedCores[0] ?? defaultCoreKey(content);
      this.cb.onStart({
        seed: this.seed,
        classKey: this.classKey,
        core,
        tier: this.tier,
        modifiers,
        allocated: this.meta.allocated,
        relics: equippedRelics(this.meta),
        equipment: equippedEquipmentList(this.meta),
        practice: this.practice,
        autoPickLevelUps: this.autoPick,
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
      </div>

      <div class="sw-panel">
        <h2>Testing</h2>
        <p class="sw-note">
          Fills the account so the Stash and the Constellation can be tried without
          playing for them: eight relics (one guaranteed rare) and 600 Ember.
          Practice runs are the matching switch on the Run tab.
        </p>
        <button class="sw-reroll" id="sw-seed">Seed a test account</button>
        <button class="sw-reroll danger" id="sw-wipe">Wipe account</button>
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
    body.querySelector('#sw-seed')?.addEventListener('click', () => {
      const before = this.meta.stash.length;
      const next = seedTestAccount(this.meta);
      this.commit(next);
      this.notice = `Seeded ${next.stash.length - before} relics and 600 Ember.`;
      this.show();
    });
    body.querySelector('#sw-wipe')?.addEventListener('click', () => {
      this.spentThisVisit.clear();
      this.selectedRelic = null;
      this.commit(defaultMeta());
      this.notice = 'Account wiped.';
      this.show();
    });

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
        <h2>Equipment</h2>
        <div class="sw-equipped" id="sw-equipment-equipped">
          ${content.equipment.slots
            .map((slot) => {
              const key = this.meta.equippedEquipment[slot] ?? null;
              const item = key ? content.equipmentByKey.get(key) : null;
              return `<div class="sw-slot" data-eqitemslot="${slot}"
                           title="${item ? `Click to unequip ${item.name}.` : ''}">
                        <span>${slot}</span><b>${item ? item.name : '—'}</b>
                      </div>`;
            })
            .join('')}
        </div>
        <div class="sw-itemstash">
          ${
            Object.entries(this.meta.equipmentStash).filter(([, n]) => n > 0).length === 0
              ? `<p class="sw-note">
                   Empty. Fully clearing a TD wave grants one random equipment item at Results,
                   win or lose. Click an owned item to equip it (click again to unequip).
                 </p>`
              : Object.entries(this.meta.equipmentStash)
                  .filter(([, count]) => count > 0)
                  .map(([key, count]) => {
                    const item = content.equipmentByKey.get(key);
                    if (!item) return '';
                    const isEquipped = this.meta.equippedEquipment[item.slot] === key;
                    return `<button class="sw-relic ${isEquipped ? 'equipped' : ''}" data-item="${key}"
                                title="${item.desc}">
                        <b>${item.name}</b><small>${item.slot} · x${count}${isEquipped ? ' · equipped' : ''}</small>
                      </button>`;
                  })
                  .join('')
          }
        </div>
      </div>
      <div class="sw-panel">
        <h2>Stash <small>${this.meta.stash.length}/${cap}</small></h2>
        <div class="sw-equipped" id="sw-stash-equipped">
          ${content.relics.slots
            .map((slot) => {
              const relic = equippedIn(this.meta, slot);
              return `<div class="sw-slot" data-eqslot="${slot}" draggable="${relic ? 'true' : 'false'}"
                           title="${relic ? `Click, or drag to the Stash below, to unequip ${relic.name}.` : ''}">
                        <span>${slot}</span><b>${relic ? relic.name : '—'}</b>
                      </div>`;
            })
            .join('')}
        </div>
        <div class="sw-stash">
          ${
            this.meta.stash.length === 0
              ? `<p class="sw-note">
                   Empty. Relics drop from elites, from the Warden-Eater, and at the end of a
                   won run; click one to equip it (click again, or drag it here from the slot
                   above, to unequip) and its affixes apply for the whole run — Settings has a
                   button that seeds a test account if you want to try the screen now.
                 </p>`
              : this.meta.stash
                  .map((r) => {
                    const eq = equippedIn(this.meta, r.slot);
                    const isEquipped = eq?.id === r.id;
                    const tip = isEquipped
                      ? 'Click to unequip.'
                      : eq
                        ? compareTitle(content, r, eq)
                        : `Click to equip to ${r.slot}.`;
                    return `<button class="sw-relic ${r.rarity} ${
                      this.selectedRelic === r.id ? 'on' : ''
                    } ${isEquipped ? 'equipped' : ''}" data-relic="${r.id}" title="${tip}">
                        <b>${r.name}</b><small>${r.slot} · ${r.rarity}${isEquipped ? ' · equipped' : ''}</small>
                      </button>`;
                  })
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
                 ${renderCompareBlock(content, this.meta, selected)}
                 <div class="sw-craftrow">
                   <button data-equip="1">${
                     isEquipped(this.meta, selected) ? `Unequip from ${selected.slot}` : `Equip to ${selected.slot}`
                   }</button>
                   <button data-discard="1" class="danger">Discard</button>
                 </div>
               </div>`
            : '<p class="sw-note">Select a relic (right-click to compare without equipping it).</p>'
        }
      </div>`;

    for (const el of body.querySelectorAll<HTMLElement>('[data-item]')) {
      const key = el.dataset.item!;
      el.addEventListener('click', () => {
        const item = content.equipmentByKey.get(key)!;
        const isEq = this.meta.equippedEquipment[item.slot] === key;
        this.commit(equipItem(this.meta, item.slot, isEq ? null : key));
      });
    }
    for (const el of body.querySelectorAll<HTMLElement>('[data-eqitemslot]')) {
      const slot = el.dataset.eqitemslot!;
      el.addEventListener('click', () => {
        if (this.meta.equippedEquipment[slot]) this.commit(equipItem(this.meta, slot, null));
      });
    }
    for (const el of body.querySelectorAll<HTMLElement>('[data-relic]')) {
      const id = Number(el.dataset.relic);
      el.addEventListener('click', () => {
        const relic = this.meta.stash.find((r) => r.id === id)!;
        this.selectedRelic = id;
        this.commit(equip(this.meta, relic.slot, isEquipped(this.meta, relic) ? null : id));
      });
      el.addEventListener('contextmenu', (e) => {
        // Right-click compares against the equipped item without swapping it in.
        e.preventDefault();
        this.selectedRelic = id;
        this.show();
      });
    }
    for (const el of body.querySelectorAll<HTMLElement>('[data-eqslot]')) {
      const slot = el.dataset.eqslot!;
      el.addEventListener('click', () => {
        if (this.meta.equipped[slot as 'sigil' | 'plate' | 'charm']) this.commit(equip(this.meta, slot, null));
      });
      el.addEventListener('dragstart', (e) => {
        (e as DragEvent).dataTransfer?.setData('text/plain', slot);
      });
    }
    const dropTarget = body.querySelector('.sw-stash');
    dropTarget?.addEventListener('dragover', (e) => e.preventDefault());
    dropTarget?.addEventListener('drop', (e) => {
      e.preventDefault();
      const slot = (e as DragEvent).dataTransfer?.getData('text/plain');
      if (slot) this.commit(equip(this.meta, slot, null));
    });
    if (!selected) return;
    body.querySelector('[data-equip]')?.addEventListener('click', () => {
      this.commit(equip(this.meta, selected.slot, isEquipped(this.meta, selected) ? null : selected.id));
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
  { key: 'accessiblePalette', label: 'Color-blind-safe damage colors' },
  { key: 'reducedFlash', label: 'Reduced flash (dims skill & Core effect flashes)' },
  { key: 'showRanges', label: 'Show tower ranges' },
  { key: 'showGrid', label: 'Show grid' },
  // SPEC-V3 T3. Presentation-adjacent rather than presentation-only: it decides
  // whether the dev profile is applied at startup, so it takes effect on reload.
  { key: 'cleanProfile', label: 'Clean profile (ignore dev unlocks, needs reload)' },
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

/** fb015 (§7): the equipped item keys, for `RunConfig.equipment`. */
export function equippedEquipmentList(meta: MetaState): string[] {
  return Object.values(meta.equippedEquipment).filter((k): k is string => k !== null);
}

/** The relic currently equipped in a slot, if any. */
function equippedIn(meta: MetaState, slot: string): Relic | null {
  const id = meta.equipped[slot as 'sigil' | 'plate' | 'charm'];
  if (id === null || id === undefined) return null;
  return meta.stash.find((r) => r.id === id) ?? null;
}

function isEquipped(meta: MetaState, relic: Relic): boolean {
  return meta.equipped[relic.slot as 'sigil' | 'plate' | 'charm'] === relic.id;
}

/** Whether a stat reads as a percentage, preferring the affix pool's own flag over a guess. */
function statIsPct(content: Content, stat: string, value: number): boolean {
  const def = content.relics.affixes.find((d) => d.stat === stat);
  return def ? def.pct : value < 1;
}

/** Implicit + affix stats summed by stat key, for comparing two relics of the same slot. */
function statTotals(content: Content, relic: Relic): Map<string, { value: number; pct: boolean }> {
  const totals = new Map<string, { value: number; pct: boolean }>();
  const imp = content.relics.implicits[relic.slot];
  if (imp) totals.set(imp.stat, { value: imp.value, pct: statIsPct(content, imp.stat, imp.value) });
  for (const a of relic.affixes) {
    const def = content.relics.affixes.find((d) => d.key === a.key);
    const pct = def?.pct ?? false;
    const prev = totals.get(a.stat);
    totals.set(a.stat, { value: (prev?.value ?? 0) + a.value, pct });
  }
  return totals;
}

/** Per-stat delta of `candidate` vs `equipped`, formatted, dropping stats with no difference. */
function compareRelics(content: Content, candidate: Relic, equipped: Relic): string[] {
  const a = statTotals(content, candidate);
  const b = statTotals(content, equipped);
  const lines: string[] = [];
  for (const stat of new Set([...a.keys(), ...b.keys()])) {
    const delta = (a.get(stat)?.value ?? 0) - (b.get(stat)?.value ?? 0);
    if (delta === 0) continue;
    const pct = a.get(stat)?.pct ?? b.get(stat)?.pct ?? false;
    const label = stat.replace(/([A-Z])/g, ' $1').toLowerCase();
    const sign = delta > 0 ? '+' : '';
    const shown = pct ? `${sign}${Math.round(delta * 1000) / 10}%` : `${sign}${delta}`;
    lines.push(`${shown} ${label}`);
  }
  return lines;
}

function compareTitle(content: Content, candidate: Relic, equipped: Relic): string {
  const diff = compareRelics(content, candidate, equipped);
  return `vs ${equipped.name}: ${diff.length ? diff.join(', ') : 'no stat difference'}`;
}

function renderCompareBlock(content: Content, meta: MetaState, selected: Relic): string {
  const eq = equippedIn(meta, selected.slot);
  if (!eq || eq.id === selected.id) return '';
  const diff = compareRelics(content, selected, eq);
  return `<div class="sw-compare">
    <b>vs equipped — ${eq.name}</b>
    ${diff.length ? diff.map((l) => `<div class="sw-affix">${l}</div>`).join('') : '<div class="sw-affix">No stat difference.</div>'}
  </div>`;
}

function implicitLine(relic: Relic): string {
  const content = loadContent();
  const imp = content.relics.implicits[relic.slot];
  if (!imp) return '';
  return `${formatStat(imp.stat, imp.value, statIsPct(content, imp.stat, imp.value))} (implicit)`;
}

function formatStat(stat: string, value: number, pct: boolean): string {
  const label = stat.replace(/([A-Z])/g, ' $1').toLowerCase();
  return pct ? `+${Math.round(value * 1000) / 10}% ${label}` : `+${value} ${label}`;
}

export { accountLevelFor };

/**
 * The account counters, each saying what it is for. A number that reads zero
 * and explains nothing is the thing the playtest called out.
 */
export function accountMarkup(meta: MetaState): string {
  const points = pointsAvailable(meta);
  const cells: { label: string; value: string; cls?: string; help: string }[] = [
    {
      label: 'Level',
      value: String(meta.accountLevel),
      help: 'Account level. Every level is one Constellation point; levels cost 100 x level Ember.',
    },
    {
      label: 'Ember',
      value: String(meta.ember),
      cls: 'gold',
      help: 'Earned from every run, won or lost. Raises your account level and pays for respecs.',
    },
    {
      label: 'Points',
      value: String(points),
      help:
        points > 0
          ? `${points} unspent — spend them on the Constellation tab.`
          : 'All spent. Earn Ember to raise your account level for more.',
    },
  ];
  return cells
    .map(
      (c) =>
        `<span title="${c.help}" class="${points === 0 && c.label === 'Points' ? 'zero' : ''}">${c.label} <b class="${
          c.cls ?? ''
        }">${c.value}</b></span>`,
    )
    .join('');
}
