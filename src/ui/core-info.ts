/**
 * fb022 (SPEC-FINAL §5.5/§11): a Core's TD effect, VS effect, current upgrade
 * step and next-step preview, with numbers — shared by the Hub's Core screen
 * (`hub.ts`, base `effects` + every `upgrade.steps` entry, no run in
 * progress) and the in-run Core tooltip (`hud.ts`, the live `World.core`
 * `CoreState` plus `World.coreStep`).
 *
 * `CORE_FIELD_PHASE` is the one hand-authored table this module needs: which
 * of a Core's `effects`/step/`CoreState` fields are read from a TD-only code
 * path, a VS-only one, or both, per `src/sim/cores.ts`'s own gates
 * (`w.huntsWarden`/`!w.huntsWarden`) — grepped field-by-field rather than
 * guessed, see the per-field comments below. A field this table has never
 * seen defaults to "both" (shown in both lists) rather than silently dropped
 * from one of them.
 */

import type { Content, CoreDef } from '../sim/content';
import { computeCoreState, emptyCoreState, type CoreState } from '../sim/cores';
import { fieldLabel, fieldValueText } from './info-format';

type Phase = 'td' | 'vs' | 'both';

/**
 * Field-by-field TD/VS classification, cross-referenced against `cores.ts`:
 * - TD: `applyTowerLifesteal`/`vampireMissingHpBuffMul` (Structure-only),
 *   `updatePlantDevour`/`updateCorpse`/`updateTimeDecay` (each gated
 *   `!w.huntsWarden`), `updateCoreEffects`'s structure-heal loop.
 * - VS: `coreAttackSpeedMul`/`coreMoveSpeedMul`/`updatePlantVolley` (each
 *   gated `w.huntsWarden`), Corpse's `vsXpGainPct` (file header: "VS instead
 *   gets the flat xpGain bonus").
 * - both: `updateCoreEffects`'s `goldPerSecond` tick (every phase),
 *   `applyHealing`'s `healingReceivedMul`/`overhealGoldRatio` (shared by
 *   `applyHealingToWarden` — VS — and `applyHealingToStructure` — TD).
 */
const CORE_FIELD_PHASE: Record<string, Phase> = {
  towerLifestealPct: 'td',
  towerLifestealBonus: 'td',
  missingHpBuffPerPct: 'td',
  missingHpBuffCap: 'td',
  towerOverhealConverts: 'td',
  hpRegenPerSecond: 'td',
  tdSlowRadius: 'td',
  tdSlowPct: 'td',
  devourRadius: 'td',
  devourCooldown: 'td',
  devourEliteDamage: 'td',
  devourCoreHeal: 'td',
  devourRangeBonus: 'td',
  devourCooldownReduction: 'td',
  corpseStoreRatio: 'td',
  storeRatio: 'td',
  corpseExecuteInterval: 'td',
  corpseExecuteExplode: 'td',
  executeExplode: 'td',
  corpseExplodeRadius: 'td',
  corpseAutoFireInterval: 'td',
  autoFireInterval: 'td',
  decayRadius: 'td',
  decayMult: 'td',
  coreHpBonus: 'td',

  vsLifestealPct: 'vs',
  vsSpeedPct: 'vs',
  poisonVolleyInterval: 'vs',
  poisonStacksPerBullet: 'vs',
  poisonVolleyCap: 'vs',
  poisonBulletDamage: 'vs',
  vsXpGainPct: 'vs',

  overhealGoldRatio: 'both',
  goldPerSecond: 'both',
  healingReceivedPct: 'both',
  healingReceivedMul: 'both',
};

function phaseOf(key: string): Phase {
  return CORE_FIELD_PHASE[key] ?? 'both';
}

interface Row {
  key: string;
  text: string;
}

function rowsFor(obj: Record<string, unknown>, overrides: Record<string, number>): Row[] {
  const rows: Row[] = [];
  for (const [key, raw] of Object.entries(obj)) {
    if (typeof raw === 'boolean') {
      if (raw) rows.push({ key, text: `${fieldLabel(key)}: Yes` });
      continue;
    }
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    const value = key in overrides ? overrides[key] : raw;
    if (value === 0) continue;
    rows.push({ key, text: `${fieldLabel(key)}: ${fieldValueText(key, value)}` });
  }
  return rows;
}

function splitByPhase(rows: Row[]): { td: Row[]; vs: Row[] } {
  const td: Row[] = [];
  const vs: Row[] = [];
  for (const r of rows) {
    const p = phaseOf(r.key);
    if (p === 'td' || p === 'both') td.push(r);
    if (p === 'vs' || p === 'both') vs.push(r);
  }
  return { td, vs };
}

function phaseListsHtml(rows: Row[]): string {
  const { td, vs } = splitByPhase(rows);
  const tdHtml =
    td.length > 0
      ? `<p class="sw-note dim sw-phase-td">TD effect</p><ul class="sw-statlist">${td.map((r) => `<li>${r.text}</li>`).join('')}</ul>`
      : '';
  const vsHtml =
    vs.length > 0
      ? `<p class="sw-note dim sw-phase-vs">VS effect</p><ul class="sw-statlist">${vs.map((r) => `<li>${r.text}</li>`).join('')}</ul>`
      : '';
  if (!tdHtml && !vsHtml) return '<p class="sw-note dim">No effect at this step.</p>';
  return tdHtml + vsHtml;
}

/**
 * The Hub's Core screen (pre-run): base `effects` (live from the moment the
 * Core is chosen, §5.5) plus every `upgrade.steps` entry as a numbered
 * preview — `coreStep` does not exist yet outside a run (`World.coreStep`
 * starts at 0 each run), so this always reads step 0's baseline.
 */
export function coreDetailMarkup(def: CoreDef): string {
  const baseRows = rowsFor(def.effects ?? {}, {});
  const stepsHtml = (def.upgrade.steps ?? [])
    .map((step, i) => {
      const rows = rowsFor(step, {});
      return `<div class="sw-effectblock">
        <b>Step ${i + 1} of ${def.upgrade.count} (${def.upgrade.stepCost} gold)</b>
        ${phaseListsHtml(rows)}
      </div>`;
    })
    .join('');
  return `<div class="sw-effectblock">
      <b>${def.name} — base</b>
      <p class="sw-note">${fieldLabel('baseHp')}: ${fieldValueText('baseHp', def.baseHp)}</p>
      ${phaseListsHtml(baseRows)}
    </div>
    ${stepsHtml}`;
}

/**
 * The in-run Core tooltip: `state` is `World.core` (already the live fold of
 * every step bought, `World.recomputeCore()`) diffed against
 * `emptyCoreState()` so a field still sitting at its "nothing bought"
 * baseline (`decayMult`'s 1.2, `healingReceivedMul`'s 1) is not shown as if
 * it were an active bonus — the same zero-is-unobservable convention
 * `Stats.add` already uses, generalised to a non-zero identity value.
 */
export function coreLiveMarkup(
  content: Content,
  coreKey: string,
  coreStep: number,
  state: CoreState,
  coreHp: number,
  coreMaxHp: number,
  /** fb027 (§5.5): the account's current gold, so the panel's own Upgrade button can price and gray itself — no Sell, per the item's own spec. */
  gold: number,
  /**
   * fb027 (code-reviewer finding): the same phase/build-range gate
   * `upgradeCore` (cores.ts) enforces itself — `gold` alone isn't enough, or
   * the button reads live and green with the Warden clear across the map
   * and silently no-ops when pressed. Defaults `true` for
   * `coreLiveMarkupFromContent`'s existing (no-World) callers.
   */
  canAct = true,
): string {
  const def = content.coreByKey.get(coreKey);
  if (!def) return '';
  const baseline = emptyCoreState();
  const diffObj: Record<string, number | boolean> = {};
  for (const key of Object.keys(state) as (keyof CoreState)[]) {
    const value = state[key];
    if (value !== baseline[key]) diffObj[key] = value;
  }
  const rows = rowsFor(diffObj, {});
  const stepCount = def.upgrade.count;
  const next = coreStep < stepCount ? def.upgrade.steps?.[coreStep] : undefined;
  const nextHtml = next
    ? (() => {
        const afford = gold >= def.upgrade.stepCost;
        const enabled = afford && canAct;
        return `<div class="sw-effectblock">
        <b>Next step (${coreStep + 1} of ${stepCount})</b>
        ${phaseListsHtml(rowsFor(next, {}))}
        <button class="sw-actbtn" data-act="upgrade-core" ${enabled ? '' : 'disabled'}><span>Upgrade</span><b class="${
          afford ? 'gold' : 'poor'
        }">${def.upgrade.stepCost}g</b></button>
      </div>`;
      })()
    : `<p class="sw-note dim">Fully upgraded (${stepCount}/${stepCount}).</p>`;
  return `<h3>${def.name} <small>step ${coreStep}/${stepCount}</small></h3>
    <div class="sw-effectblock">
      <b>Core HP</b>
      <p class="sw-note">${Math.ceil(coreHp)} / ${Math.round(coreMaxHp)}</p>
    </div>
    <div class="sw-effectblock">
      <b>Current effect</b>
      ${phaseListsHtml(rows)}
    </div>
    ${nextHtml}`;
}

/** Recomputes what `coreLiveMarkup` needs from just (content, key, step) — used where no live `World.core` is at hand (tests, or a future non-run preview). */
export function coreLiveMarkupFromContent(
  content: Content,
  coreKey: string,
  coreStep: number,
  coreHp: number,
  coreMaxHp: number,
  gold: number,
): string {
  return coreLiveMarkup(content, coreKey, coreStep, computeCoreState(content, coreKey, coreStep), coreHp, coreMaxHp, gold);
}
