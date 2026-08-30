/**
 * The between-runs hub (SPEC 8): choose a class and map tier, draft the tier's
 * modifiers, and spend Constellation points.
 *
 * Presentation only — every rule lives in /src/meta and /src/sim.
 */

import { defaultCoreKey, loadContent, type Content, type EquipmentItem } from '../sim/content';
import type { MetaState, Relic, RunConfig } from '../sim/types';
import {
  accountLevelFor,
  defaultMeta,
  seedTestAccount,
  seedTestEquipment,
  allocate,
  allTreeNodeIds,
  pointsAvailable,
  refund,
  TREE_AUTO_MAX,
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
import { equipItem } from '../meta/stash';
import { renderTreeView } from './tree-view';
import { sanitize, type Settings } from './settings';
import { classAbilitiesMarkup } from './class-info';
import { coreDetailMarkup } from './core-info';
import { modLines, modLinesHtml } from './info-format';
import { STAT_KIND, type StatKey } from '../sim/stats';

type Tab = 'run' | 'tree' | 'equipment' | 'settings';

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
  /** SPEC-FINAL §5.5: mirrors `classKey` — chosen beside class select, defaults to Stone Heart. */
  private coreKey: string;
  private tier = 1;
  private picks: number[] = [];
  private seed: number;
  /** fb022: right-click selects an owned item for the Equipment detail panel without equipping it. */
  private selectedEquipment: string | null = null;
  private settings: Settings;
  /** Transient one-line feedback under the tab bar. */
  private notice = '';
  /**
   * Points spent in this Hub visit. They have not been taken into a run yet, so
   * taking one back is an undo rather than a respec, and costs no Ember.
   */
  private readonly spentThisVisit = new Set<number>();

  constructor(root: HTMLElement, meta: MetaState, seed: number, cb: HubCallbacks, initialNotice?: string) {
    this.root = root;
    this.meta = meta;
    this.cb = cb;
    this.seed = seed;
    this.classKey = meta.unlockedClasses[0] ?? 'engineer';
    this.coreKey = meta.unlockedCores[0] ?? 'stone_heart';
    this.settings = cb.settings;
    // fb023: a one-time "your relics were dropped" notice from a save
    // migration, shown on this first Hub screen only — `commit()` clears it
    // exactly like every other transient notice, so it cannot resurface after
    // the next Constellation spend or Equipment swap.
    if (initialNotice) this.notice = initialNotice;
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
        ${(['run', 'tree', 'equipment', 'settings'] as Tab[])
          .map(
            (t) =>
              `<button data-tab="${t}" class="${this.tab === t ? 'on' : ''}">${
                { run: 'Run', tree: 'Constellation', equipment: 'Equipment', settings: 'Settings' }[t]
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
    else if (this.tab === 'equipment') this.renderEquipment(body);
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
        <div class="sw-classdetail">${classAbilitiesMarkup(
          content.classes.classes.find((c) => c.key === this.classKey) ?? content.classes.classes[0],
        )}</div>
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
        <div class="sw-classdetail">${coreDetailMarkup(
          content.cores.cores.find((c) => c.key === this.coreKey) ?? content.cores.cores[0],
        )}</div>
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
          ${content.equipment.slots
            .map((slot) => {
              const key = this.meta.equippedEquipment[slot] ?? null;
              const item = key ? content.equipmentByKey.get(key) : null;
              return `<div class="sw-slot"><span>${slot}</span><b>${
                item ? item.name : '—'
              }</b></div>`;
            })
            .join('')}
        </div>
        <p class="sw-note">Change loadout on the Equipment tab.</p>
        <label class="sw-setting practice">
          <span>Practice run</span>
          <input type="checkbox" id="sw-practice" ${this.practice ? 'checked' : ''} />
        </label>
        <p class="sw-note">${
          this.practice
            ? 'The in-run tool is on: kill the board, add gold, skip a wave, summon the boss, spawn any enemy on demand. Nothing is banked — no Ember, no equipment, no quest progress.'
            : 'A normal run. Everything you earn is kept.'
        }</p>
        <button class="sw-go" id="sw-start">${this.practice ? 'Begin practice run' : 'Begin the Daywatch'}</button>
        <button class="sw-go sw-secondary" id="sw-training" title="The chosen class, Core and equipment, with the practice tool on and every spawn-panel enemy available. Leave any time back to this Hub; nothing is banked.">Enter Training Grounds</button>
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
    const beginRun = (practiceOverride?: boolean): void => {
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
        // fb014 (Q134): §8.3 supersede — every node's effect is live in an
        // actual run regardless of what's really allocated on the account.
        allocated: TREE_AUTO_MAX ? allTreeNodeIds(content) : this.meta.allocated,
        relics: equippedRelics(this.meta),
        equipment: equippedEquipmentList(this.meta),
        // fb023: a snapshot of owned counts so the in-run Equipment section
        // (character panel) can validate a mid-run `equip_item` swap without
        // the sim ever reaching back into `MetaState`.
        ownedEquipment: { ...this.meta.equipmentStash },
        practice: practiceOverride ?? this.practice,
        // fb012: the toggle now lives in the in-run Esc options menu and the
        // level-up screen, not here — a run starts with whatever the profile
        // last had it set to.
        autoPickLevelUps: this.meta.autoPickLevelUps,
      });
    };
    body.querySelector('#sw-start')?.addEventListener('click', () => beginRun());
    // fb019 Training Grounds: a one-click practice entry over the same class/Core/
    // tier/equipment the Run tab already has selected — Q135's "no new game
    // systems invented" default, just a second door into the existing practice
    // run with its spawn panel.
    body.querySelector('#sw-training')?.addEventListener('click', () => beginRun(true));
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
          Fills the account so Equipment and the Constellation can be tried without
          playing for them: a few of every equipment item and 600 Ember.
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
      // fb023: `seedTestAccount` still fills the retired relic stash too (kept
      // internally for save-migration coverage — see meta.ts) — harmless,
      // since nothing shows it — but the button's own job now is the
      // Equipment screen, so `seedTestEquipment` is what the notice reports.
      const next = seedTestEquipment(seedTestAccount(this.meta));
      this.commit(next);
      this.notice = 'Seeded equipment and 600 Ember.';
      this.show();
    });
    body.querySelector('#sw-wipe')?.addEventListener('click', () => {
      this.spentThisVisit.clear();
      this.selectedEquipment = null;
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

  /* --------------------------------------------------------- equipment tab */

  private renderEquipment(body: HTMLElement): void {
    const content = loadContent();
    const selectedItem = this.selectedEquipment ? content.equipmentByKey.get(this.selectedEquipment) ?? null : null;

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
                    const eq = this.meta.equippedEquipment[item.slot]
                      ? content.equipmentByKey.get(this.meta.equippedEquipment[item.slot]!)
                      : null;
                    const tip = isEquipped
                      ? 'Click to unequip.'
                      : eq
                        ? equipmentCompareTitle(this.classKey, item, eq)
                        : `Click to equip to ${item.slot}.`;
                    return `<button class="sw-relic ${isEquipped ? 'equipped' : ''} ${
                      this.selectedEquipment === key ? 'on' : ''
                    }" data-item="${key}" title="${tip}">
                        <b>${item.name}</b><small>${item.slot} · x${count}${isEquipped ? ' · equipped' : ''}</small>
                      </button>`;
                  })
                  .join('')
          }
        </div>
      </div>
      <div class="sw-panel">
        <h2>Equipment item</h2>
        ${
          selectedItem
            ? `<div class="sw-relicdetail">
                 <b>${selectedItem.name}</b>
                 ${modLinesHtml(selectedItem.mods)}
                 ${equipmentFallbackBlock(content, this.classKey, selectedItem)}
                 ${equipmentCompareBlock(content, this.meta, this.classKey, selectedItem)}
                 <div class="sw-craftrow">
                   <button data-equipitem="1">${
                     this.meta.equippedEquipment[selectedItem.slot] === selectedItem.key
                       ? `Unequip from ${selectedItem.slot}`
                       : `Equip to ${selectedItem.slot}`
                   }</button>
                 </div>
               </div>`
            : '<p class="sw-note">Select an owned item (right-click to compare without equipping it).</p>'
        }
      </div>`;

    for (const el of body.querySelectorAll<HTMLElement>('[data-item]')) {
      const key = el.dataset.item!;
      el.addEventListener('click', () => {
        const item = content.equipmentByKey.get(key)!;
        const isEq = this.meta.equippedEquipment[item.slot] === key;
        this.selectedEquipment = key;
        this.commit(equipItem(this.meta, item.slot, isEq ? null : key));
      });
      el.addEventListener('contextmenu', (e) => {
        // Right-click selects an item for the detail/compare panel without equipping it — same convention data-relic already sets.
        e.preventDefault();
        this.selectedEquipment = key;
        this.show();
      });
    }
    for (const el of body.querySelectorAll<HTMLElement>('[data-eqitemslot]')) {
      const slot = el.dataset.eqitemslot!;
      el.addEventListener('click', () => {
        if (this.meta.equippedEquipment[slot]) this.commit(equipItem(this.meta, slot, null));
      });
    }
    if (selectedItem) {
      body.querySelector('[data-equipitem]')?.addEventListener('click', () => {
        const isEq = this.meta.equippedEquipment[selectedItem.slot] === selectedItem.key;
        this.commit(equipItem(this.meta, selectedItem.slot, isEq ? null : selectedItem.key));
      });
    }
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

/**
 * fb022: an equipment item's real, class-dependent stat bag — its `mods`
 * plus `classFallback.mods` when the run's class does not equal
 * `notClassKey`, exactly the condition `baseRunStats` (stats.ts) itself
 * gates the fallback `Stats` source on. Comparing on this rather than on
 * `item.mods` alone is what makes the equipped-vs-candidate compare (and the
 * active/inert indicator) agree with what actually reaches `Stats` for the
 * class currently selected on the Run tab.
 *
 * qa-playtester (fb022): `item.mods` and `item.classFallback.mods` are two
 * *separate* `Stats` sources (`equipment:<key>` / `equipment:<key>:fallback`,
 * `baseRunStats`, stats.ts), so for a `mul`-kind stat (STAT_KIND) they stack
 * the way §2 says every source does — multiplicatively, `(1+base)*(1+fallback)`
 * — not by summing the two raw mod values. Repro: Swordsman Armor's
 * `attackSpeed` is `0.1` base / `0.5` fallback; a non-Swordsman's real
 * `attackSpeedMul` is `1.1 * 1.5 = 1.65` (+65%), not `1 + 0.1 + 0.5 = 1.6`
 * (+60%) a flat sum would show. A `flat`-kind stat has no such base to scale,
 * so it still just adds (§2's "ranks within a source add" extended the
 * obvious way to "un-based point totals add across sources too" — the same
 * reading `Stats.total` already gives every flat stat regardless of source).
 */
function effectiveEquipmentMods(item: EquipmentItem, classKey: string): Record<string, number> {
  const fallbackActive = item.classFallback && item.classFallback.notClassKey !== classKey;
  const out: Record<string, number> = { ...item.mods };
  if (!fallbackActive) return out;
  for (const [k, v] of Object.entries(item.classFallback!.mods)) {
    const kind = STAT_KIND[k as StatKey];
    const base = out[k] ?? 0;
    out[k] = kind === 'mul' ? (1 + base) * (1 + v) - 1 : base + v;
  }
  return out;
}

/** Per-stat delta between two effective mod bags, dropping stats with no difference. */
function equipmentModDelta(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const stat of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const delta = (a[stat] ?? 0) - (b[stat] ?? 0);
    if (delta !== 0) out[stat] = delta;
  }
  return out;
}

function equipmentCompareTitle(classKey: string, candidate: EquipmentItem, equipped: EquipmentItem): string {
  const delta = equipmentModDelta(effectiveEquipmentMods(candidate, classKey), effectiveEquipmentMods(equipped, classKey));
  const lines = modLines(delta);
  return `vs ${equipped.name}: ${lines.length ? lines.map((l) => l.text).join(', ') : 'no stat difference'}`;
}

function equipmentCompareBlock(content: Content, meta: MetaState, classKey: string, selected: EquipmentItem): string {
  const eqKey = meta.equippedEquipment[selected.slot];
  if (!eqKey || eqKey === selected.key) return '';
  const equipped = content.equipmentByKey.get(eqKey);
  if (!equipped) return '';
  const delta = equipmentModDelta(effectiveEquipmentMods(selected, classKey), effectiveEquipmentMods(equipped, classKey));
  const html = modLinesHtml(delta);
  return `<div class="sw-compare">
    <b>vs equipped — ${equipped.name}</b>
    ${html || '<div class="sw-affix">No stat difference.</div>'}
  </div>`;
}

/**
 * fb022: the "if not &lt;class&gt;" line's active/inert indicator for the
 * Hub's currently-selected class — mirrors the exact `notClassKey !==
 * cfg.classKey` gate `baseRunStats` applies at run start (stats.ts). Takes
 * `content` as a param (code-reviewer: consistency with `equipmentCompareBlock`
 * rather than an internal `loadContent()` call of its own).
 */
function equipmentFallbackBlock(content: Content, classKey: string, item: EquipmentItem): string {
  if (!item.classFallback) return '';
  const className = content.classByKey.get(classKey)?.name ?? classKey;
  const active = item.classFallback.notClassKey !== classKey;
  const lines = modLines(item.classFallback.mods);
  const status = active ? '<span class="sw-phase-vs">(active)</span>' : `<span class="dim">(inert for ${className})</span>`;
  return `<div class="sw-affix">If not ${content.classByKey.get(item.classFallback.notClassKey)?.name ?? item.classFallback.notClassKey}: ${
    lines.map((l) => l.text).join(', ')
  } ${status}</div>`;
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
          ? TREE_AUTO_MAX
            ? `${points} banked. Every Constellation node is active regardless (temporary — see the Constellation tab).`
            : `${points} unspent — spend them on the Constellation tab.`
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
