/**
 * The between-runs hub (SPEC 8): choose a class and map tier, draft the tier's
 * modifiers, and spend Constellation points.
 *
 * Presentation only — every rule lives in /src/meta and /src/sim.
 */

import { defaultCoreKey, loadContent, type Content, type EquipmentItem } from '../sim/content';
import type { MetaState, RunConfig } from '../sim/types';
import {
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
import { defaultSettings, sanitize, type Settings } from './settings';
import {
  ACTION_ORDER,
  defaultKeyBindings,
  keyLabel,
  rebindKey,
  reservedKeyLabel,
  UNBINDABLE_KEYS,
  type ActionId,
  type KeyBindings,
} from './keybindings';
import { NORMAL_PROFILE_CLASS_KEYS, classBandStatsMarkup, classSelectSkillsMarkup } from './class-select';
import { coreDetailMarkup } from './core-info';
import { modLines, modLinesHtml } from './info-format';
import { equipmentFallbackMarkup, equipmentSpecialNoteMarkup } from './equipment-info';
import { STAT_KIND, type StatKey } from '../sim/stats';
import { mountCodex } from './codex';
import { hasUnsavedTunerEdits } from './tuner-state';

type Tab = 'run' | 'tree' | 'equipment' | 'codex' | 'settings';

export interface HubCallbacks {
  settings: Settings;
  onStart(cfg: RunConfig): void;
  onMetaChanged(meta: MetaState): void;
  onSettingsChanged(settings: Settings): void;
  /** fb073: key remapping. Optional so a caller not yet wired to it still gets working defaults. */
  keyBindings?: KeyBindings;
  onKeyBindingsChanged?(bindings: KeyBindings): void;
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
  private keyBindings: KeyBindings;
  /** fb073: which action's button is waiting for the next keydown, if any. */
  private listeningAction: ActionId | null = null;
  private rebindConflict = '';
  /** fb075: first click arms the destructive "reset settings" confirm step; second click commits it. */
  private settingsResetArmed = false;
  /** Transient one-line feedback under the tab bar. */
  private notice = '';
  /**
   * Points spent in this Hub visit. They have not been taken into a run yet, so
   * taking one back is an undo rather than a respec, and costs no skill points.
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
    this.keyBindings = cb.keyBindings ?? defaultKeyBindings();
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
    // fb073: leaving the Settings tab mid-rebind must not leave a stray
    // document-level keydown listener armed against a control no longer on
    // screen.
    if (this.tab !== 'settings' && this.listeningAction) this.stopListeningForRebind();
    // fb075: leaving the Settings tab mid-confirm must not leave the reset
    // button armed for a stray second click on return.
    if (this.tab !== 'settings') this.settingsResetArmed = false;
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
        ${(['run', 'tree', 'equipment', 'codex', 'settings'] as Tab[])
          .map(
            (t) =>
              `<button data-tab="${t}" class="${this.tab === t ? 'on' : ''}">${
                { run: 'Run', tree: 'Constellation', equipment: 'Equipment', codex: 'Codex', settings: 'Settings' }[t]
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
    else if (this.tab === 'codex') this.renderCodex(body);
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
    // p9c/G15: unsaved Tuner edits get treated like practice — the run isn't
    // played against whatever is actually saved to `/data`, so its outcome
    // shouldn't be bankable. `hasUnsavedTunerEdits()` is always false in a
    // production build (the Tuner's editable half never mounts there).
    const unsavedTunerEdits = hasUnsavedTunerEdits();

    // fb058: normal profile shows only the SPEC-FINAL §4 3-class roster; the
    // dev "show hidden classes" setting (only offered when the dev profile is
    // active — same gate as DEV_BADGE) reveals the rest. Sim gates always read
    // `content.classes.classes` directly, never this filtered view.
    const showHiddenClasses = DEV_BUILD && devProfileActive() && this.settings.showHiddenClasses;
    const visibleClasses = content.classes.classes.filter(
      (c) => showHiddenClasses || NORMAL_PROFILE_CLASS_KEYS.includes(c.key),
    );
    // Selecting a *locked* visible class is intentional (lets a player
    // preview its band stats/skills before it's unlocked, same as the
    // `locked` card still rendering its full art/name) — only reassigned when
    // the current selection drops out of the filtered set entirely (e.g. the
    // dev "show hidden classes" toggle just turned off). `beginRun()` below
    // is where an actual run start is gated on unlock status, not here.
    if (!visibleClasses.some((c) => c.key === this.classKey)) {
      this.classKey = visibleClasses[0]?.key ?? this.classKey;
    }
    const selectedClass = visibleClasses.find((c) => c.key === this.classKey) ?? visibleClasses[0];

    body.innerHTML = `
      <div class="sw-panel wide">
        <h2>Class</h2>
        <div class="sw-classrow">
          ${visibleClasses
            .map((c) => {
              const locked = !this.meta.unlockedClasses.includes(c.key);
              const quest = content.quests.quests.find((q) => q.key === c.unlockQuest);
              return `<button class="sw-classcard ${this.classKey === c.key ? 'on' : ''} ${
                locked ? 'locked' : ''
              }" data-class="${c.key}" ${locked ? 'disabled' : ''}>
                <div class="sw-classcard-art"><span>${c.name.charAt(0)}</span></div>
                <b>${c.name}</b>
                ${locked ? `<small>Locked — ${quest?.desc ?? 'complete a quest'}</small>` : ''}
              </button>`;
            })
            .join('')}
        </div>
        ${
          selectedClass
            ? `<div class="sw-classdetail">
                ${classBandStatsMarkup(selectedClass)}
                ${classSelectSkillsMarkup(selectedClass)}
              </div>`
            : ''
        }
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
            ? 'The in-run tool is on: kill the board, add gold, skip a wave, summon the boss, spawn any enemy on demand. Nothing is banked — no skill points, no equipment, no quest progress.'
            : unsavedTunerEdits
              ? 'Unsaved Tuner edits are live in this session. This run will be treated as a practice run and nothing will be banked — save or reload to play for real.'
              : 'A normal run. Everything you earn is kept.'
        }</p>
        <button class="sw-go" id="sw-start">${
          this.practice || unsavedTunerEdits ? 'Begin practice run' : 'Begin the Daywatch'
        }</button>
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
      // Same belt-and-suspenders as `core` above, now that fb058's render-time
      // fallback (this.classKey reassignment a few lines up) makes `classKey`
      // reachable from something other than a direct unlocked-card click.
      const classKey = this.meta.unlockedClasses.includes(this.classKey)
        ? this.classKey
        : (this.meta.unlockedClasses[0] ?? content.classes.classes[0].key);
      this.cb.onStart({
        seed: this.seed,
        classKey,
        core,
        tier: this.tier,
        modifiers,
        // fb014 (Q134): §8.3 supersede — every node's effect is live in an
        // actual run regardless of what's really allocated on the account.
        allocated: TREE_AUTO_MAX ? allTreeNodeIds(content) : this.meta.allocated,
        equipment: equippedEquipmentList(this.meta),
        // fb023: a snapshot of owned counts so the in-run Equipment section
        // (character panel) can validate a mid-run `equip_item` swap without
        // the sim ever reaching back into `MetaState`.
        ownedEquipment: { ...this.meta.equipmentStash },
        practice: practiceOverride ?? (this.practice || unsavedTunerEdits),
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
        this.notice = free ? 'Point returned.' : `Node refunded for ${cost} skill point${cost === 1 ? '' : 's'}.`;
        this.show();
      },
      onRefuse: (message) => {
        this.notice = message;
        this.show();
      },
    });
  }

  /* ------------------------------------------------------------- codex tab */

  /**
   * p9b: the read-only Codex's Hub entry point. `mountCodex` owns its own nav
   * and content DOM entirely within `body`, so it needs no wiring back into
   * Hub state — `show()` tearing down `body` on every tab switch is enough
   * cleanup, the same way every other tab here works.
   */
  private renderCodex(body: HTMLElement): void {
    mountCodex(body);
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
        ${TOGGLES.filter((row) => !row.devOnly || (DEV_BUILD && devProfileActive()))
          .map(
            (row) => `<label class="sw-setting">
            <span>${row.label}</span>
            <input type="checkbox" data-toggle="${row.key}" ${s[row.key] ? 'checked' : ''} />
          </label>`,
          )
          .join('')}
        <label class="sw-setting">
          <span>Max damage numbers</span>
          <input type="range" min="0" max="200" value="${s.maxDamageNumbers}" data-count="1" />
          <b data-out="maxDamageNumbers">${s.maxDamageNumbers}</b>
        </label>
        <button class="sw-reroll danger" id="sw-settings-reset">
          ${this.settingsResetArmed ? 'Click again to confirm reset' : 'Reset settings to defaults'}
        </button>
      </div>

      <div class="sw-panel">
        <h2>Controls</h2>
        <p class="sw-note">Click a binding, then press the key to use instead.</p>
        ${
          this.rebindConflict
            ? `<p class="sw-note sw-error" id="sw-keybind-conflict">${this.rebindConflict}</p>`
            : ''
        }
        <div class="sw-keybindlist">
          ${ACTION_ORDER.map(
            (a) => `<label class="sw-setting">
              <span>${a.label}</span>
              <button type="button" class="sw-keybind ${this.listeningAction === a.id ? 'listening' : ''}"
                      data-rebind="${a.id}">
                ${this.listeningAction === a.id ? 'Press a key…' : keyLabel(this.keyBindings[a.id])}
              </button>
            </label>`,
          ).join('')}
        </div>
        <button class="sw-reroll" id="sw-keybind-reset">Restore default controls</button>
      </div>

      <div class="sw-panel">
        <h2>Testing</h2>
        <p class="sw-note">
          Fills the account so Equipment and the Constellation can be tried without
          playing for them: a few of every equipment item and 20 skill points.
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
      // fb075: any other Settings-tab action that re-renders the panel must
      // disarm a pending reset-confirm — otherwise the button's redrawn
      // "Reset settings to defaults" text silently lies about the armed
      // state, and the very next click executes the reset with no second
      // confirm ever shown.
      this.settingsResetArmed = false;
      const next = seedTestEquipment(seedTestAccount(this.meta));
      this.commit(next);
      this.notice = 'Seeded equipment and 20 skill points.';
      this.show();
    });
    body.querySelector('#sw-wipe')?.addEventListener('click', () => {
      this.settingsResetArmed = false; // fb075: see #sw-seed's comment above.
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

    body.querySelector('#sw-settings-reset')?.addEventListener('click', () => {
      if (!this.settingsResetArmed) {
        this.settingsResetArmed = true;
        this.show();
        return;
      }
      this.settingsResetArmed = false;
      this.settings = sanitize(defaultSettings());
      this.cb.onSettingsChanged(this.settings);
      this.show();
    });

    for (const el of body.querySelectorAll<HTMLElement>('[data-rebind]')) {
      el.addEventListener('click', () => this.startListeningForRebind(el.dataset.rebind as ActionId));
    }
    body.querySelector('#sw-keybind-reset')?.addEventListener('click', () => {
      this.settingsResetArmed = false; // fb075: see #sw-seed's comment above.
      this.stopListeningForRebind();
      this.keyBindings = defaultKeyBindings();
      this.rebindConflict = '';
      this.cb.onKeyBindingsChanged?.(this.keyBindings);
      this.show();
    });
  }

  /* -------------------------------------------------------- key remapping */

  /** fb073: a rebind button was clicked — arm the next keydown to capture it. */
  private startListeningForRebind(action: ActionId): void {
    this.settingsResetArmed = false; // fb075: see #sw-seed's comment in renderSettings.
    this.listeningAction = action;
    this.rebindConflict = '';
    document.addEventListener('keydown', this.onRebindKeyDown, true);
    this.show();
  }

  private stopListeningForRebind(): void {
    document.removeEventListener('keydown', this.onRebindKeyDown, true);
    this.listeningAction = null;
  }

  /**
   * Bound once (arrow-function class field) so add/removeEventListener target
   * the same function reference across renders — `show()` rebuilds the DOM
   * every call, but this listener lives on `document`, outside that subtree.
   */
  private onRebindKeyDown = (e: KeyboardEvent): void => {
    const action = this.listeningAction;
    if (!action) return;
    e.preventDefault();
    this.stopListeningForRebind();
    const k = e.key.toLowerCase();
    if (k === 'escape') {
      this.show();
      return;
    }
    if (UNBINDABLE_KEYS.has(k)) {
      this.rebindConflict = `"${keyLabel(k)}" is reserved for movement and cannot be reassigned.`;
      this.show();
      return;
    }
    const reserved = reservedKeyLabel(action, k);
    if (reserved) {
      this.rebindConflict = `"${reserved}" is reserved and cannot be reassigned.`;
      this.show();
      return;
    }
    const result = rebindKey(this.keyBindings, action, e.key);
    if (result.ok) {
      this.keyBindings = result.bindings;
      this.rebindConflict = '';
      this.cb.onKeyBindingsChanged?.(this.keyBindings);
    } else {
      const label = ACTION_ORDER.find((a) => a.id === result.conflictWith)?.label ?? result.conflictWith;
      this.rebindConflict = `"${keyLabel(e.key.toLowerCase())}" is already bound to ${label}.`;
    }
    this.show();
  };

  /* --------------------------------------------------------- equipment tab */

  private renderEquipment(body: HTMLElement): void {
    const content = loadContent();
    const selectedItem = this.selectedEquipment ? content.equipmentByKey.get(this.selectedEquipment) ?? null : null;
    // fb052 (qa-playtester finding): mirrors `hud.ts`'s `runEquipmentContext` —
    // without a real `equippedKeys`, `equipmentSpecialNoteMarkup`'s cross-item
    // line (Swordsman Armor + Sleeve Sword) can never read (active) here, no
    // matter what the Hub's own loadout actually has equipped.
    const eqCtx = {
      classKey: this.classKey,
      equippedKeys: Object.values(this.meta.equippedEquipment).filter((k): k is string => k !== null),
    };

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
                    return `<button class="sw-lootitem ${isEquipped ? 'equipped' : ''} ${
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
            ? `<div class="sw-itemdetail">
                 <b>${selectedItem.name}</b>
                 ${modLinesHtml(selectedItem.mods)}
                 ${equipmentFallbackMarkup(content, eqCtx, selectedItem)}
                 ${equipmentSpecialNoteMarkup(selectedItem, eqCtx)}
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
        // Right-click selects an item for the detail/compare panel without equipping it.
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

const TOGGLES: { key: keyof Settings; label: string; devOnly?: boolean }[] = [
  { key: 'damageNumbers', label: 'Damage numbers' },
  { key: 'dotNumbers', label: 'DoT numbers' },
  { key: 'accessiblePalette', label: 'Color-blind-safe damage colors' },
  { key: 'reducedFlash', label: 'Reduced flash (dims skill & Core effect flashes)' },
  { key: 'showRanges', label: 'Show tower ranges' },
  { key: 'showGrid', label: 'Show grid' },
  { key: 'showEnemyHpBars', label: 'Enemy HP bars' },
  { key: 'showPathIndicators', label: 'TD path indicators' },
  // SPEC-V3 T3. Presentation-adjacent rather than presentation-only: it decides
  // whether the dev profile is applied at startup, so it takes effect on reload.
  { key: 'cleanProfile', label: 'Clean profile (ignore dev unlocks, needs reload)' },
  // fb058: only meaningful (and only shown) in a dev build with the dev
  // profile active — same gate as the DEV PROFILE badge (`DEV_BADGE` above).
  { key: 'showHiddenClasses', label: 'Show hidden classes (Class select)', devOnly: true },
];

/* ----------------------------------------------------------------- helpers */

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
    ${html || '<div class="sw-modline">No stat difference.</div>'}
  </div>`;
}


/**
 * The account counters, each saying what it is for. A number that reads zero
 * and explains nothing is the thing the playtest called out.
 */
export function accountMarkup(meta: MetaState): string {
  const points = pointsAvailable(meta);
  const cells: { label: string; value: string; cls?: string; help: string }[] = [
    {
      label: 'Skill Points',
      value: String(meta.skillPoints),
      cls: 'gold',
      help: 'Earned 1 per VS wave cleared, win or lose. The Constellation’s only currency — also pays for respecs.',
    },
    {
      label: 'Points',
      value: String(points),
      help:
        points > 0
          ? TREE_AUTO_MAX
            ? `${points} unspent. Every Constellation node is active regardless (temporary — see the Constellation tab).`
            : `${points} unspent — spend them on the Constellation tab.`
          : 'All spent. Clear more VS waves for more.',
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
