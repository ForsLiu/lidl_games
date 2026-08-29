/**
 * fb018 UI self-audit dev bridge. Exposes a narrow, typed surface on
 * `window.__stonewakeAudit` so `tools/ui-audit.ts` (a Playwright script run
 * only via `npm run ui-audit`) can drive the real running game into each of
 * the audit's seven fixed scenes deterministically, without depending on
 * real-time play or pointer-event geometry.
 *
 * Gated on `isDevBuild()` exactly like `startupProfile`'s dev-profile guard
 * (`src/meta/devprofile.ts`) — never weakened or duplicated here, just
 * reused, so gate G16 ("a production build has no dev surface") stays true
 * with no second place to keep in sync.
 *
 * Deliberately privileged in a few spots ordinary UI code never is: jumping
 * straight to the VS phase via `finishSundering`, forcing a status effect
 * onto an enemy, and zeroing an HP field to reach defeat all reach past the
 * Command surface into World state directly. That is fine here and would not
 * be fine anywhere else — this module exists only to pose the running game
 * for a screenshot, is never reachable from a production build, and none of
 * it is replayed, logged or hashed. Every other action funnels through the
 * same Commands a real player's input produces (`build`, `dev`, `call`,
 * `pick`), so the screens the audit captures are screens a player could
 * actually reach.
 */

import type { Command, DevOp, Phase, RunConfig, RunOutcome } from '../sim/types';
import type { World } from '../sim/world';
import { GRID_H, GRID_W, TILE } from '../sim/grid';
import { finishSundering } from '../sim/sundering';
import { applyDot, applyFrost, applyFrozen } from '../sim/enemies';
import { pickAt, type Selection } from './selection';
import { mountCodex } from './codex';
import { isDevBuild } from '../meta/devprofile';

/** The slice of `Game` (main.ts) the hook needs — kept narrow and typed on purpose. */
export interface AuditBridge {
  world(): World | null;
  showHub(): void;
  startRun(cfg: RunConfig): void;
  pushCommand(cmd: Command): void;
  setSelection(sel: Selection): void;
  toggleCharacterPanel(): void;
  toggleDpsPanel(): void;
}

export interface StonewakeAuditApi {
  readonly ready: true;
  /** Starts a practice run (banks nothing) with a fixed, screenshot-friendly default loadout. */
  startPracticeRun(opts?: { classKey?: string; core?: string; seed?: number }): void;
  showHub(): void;
  /** Same surface a real player's practice-tool clicks use (`applyDevCommand`, run.ts). */
  dev(op: DevOp, amount: number, enemyKey?: string): void;
  /** Queues a real `build` Command; consumed on the next sim tick like any player input. */
  build(tower: number, tx: number, ty: number): void;
  /** Selects whatever `pickAt` finds at a tile — the same query a real click resolves. */
  selectTile(tx: number, ty: number): void;
  clearSelection(): void;
  toggleCharacterPanel(): void;
  toggleDpsPanel(): void;
  callWave(): void;
  /** Queues a real `pick` Command (the level-up offer screen's own click path). */
  pickOffer(index: number): void;
  /** Dev-only shortcut: jumps straight from a TD block into its VS wave (`finishSundering`). */
  forceVsPhase(): void;
  /** Grants Act II XP via the real `dev:'xp'` Command; a levelup offer opens on the next tick if not auto-picked. */
  forceLevelUpOffer(xp: number): void;
  /** Applies one of each persistent status (Bleeding/Poison/Toxic/Burning/Frost/Frozen) to distinct live enemies. */
  forceStatusShowcase(): void;
  /**
   * Zeroes Core HP so the ordinary defeat path (`checkDefeat`/`beginDefeat`/
   * `resolveDefeat`, run.ts) runs its own course. Core-only: a Warden-HP
   * equivalent would need `beginDefeat` itself, which is private to run.ts
   * and only reachable today from the real damage-application path
   * (`run.ts:604`) — none of the audit's seven scenes need it, so it is not
   * built here rather than faked with a direct `outcome`/`phase` write.
   */
  forceDefeat(kind: 'core'): void;
  /** Mounts the standalone Codex renderer (`src/ui/codex.ts`) as a full-viewport overlay — see QUESTIONS.md: p9b (the Hub nav entry point) is unbuilt, but the Codex itself is real, tested code. */
  mountCodexOverlay(): void;
  unmountCodexOverlay(): void;
  phase(): Phase | null;
  outcome(): RunOutcome | null;
  offersOpen(): boolean;
  /**
   * World tile coordinates to viewport (CSS/screenshot) pixel coordinates, via
   * the `#sw-canvas` element's own bounding box — the sim/renderer use a fixed
   * 1:1 `TILE`-pixel grid with no camera scroll in either Act. This ignores
   * `render/canvas.ts`'s transient screen-shake translate, so it can be a few
   * px off the actual painted position right after a hit; the audit scenes
   * settle briefly before screenshotting, which decays shake to ~0, but a
   * pixel sample taken at this exact point is a close approximation, not a
   * guarantee.
   */
  worldToScreen(x: number, y: number): { x: number; y: number } | null;
  /** `worldToScreen` applied to the Warden's current position. */
  wardenScreenPoint(): { x: number; y: number } | null;
}

export function installAuditHook(bridge: AuditBridge): void {
  if (!isDevBuild()) return;

  let codexHandle: { destroy(): void } | null = null;

  const api: StonewakeAuditApi = {
    ready: true,
    startPracticeRun(opts = {}) {
      bridge.startRun({
        seed: opts.seed ?? 1,
        classKey: opts.classKey ?? 'engineer',
        core: opts.core ?? 'stone_heart',
        tier: 1,
        modifiers: [],
        allocated: [],
        relics: [],
        equipment: [],
        practice: true,
        autoPickLevelUps: false,
      });
    },
    showHub() {
      bridge.showHub();
    },
    dev(op, amount, enemyKey) {
      bridge.pushCommand({ k: 'dev', op, amount, enemyKey });
    },
    build(tower, tx, ty) {
      bridge.pushCommand({ k: 'build', tower, tx, ty });
    },
    selectTile(tx, ty) {
      const w = bridge.world();
      if (!w) return;
      bridge.setSelection(pickAt(w, tx + 0.5, ty + 0.5));
    },
    clearSelection() {
      bridge.setSelection(null);
    },
    toggleCharacterPanel() {
      bridge.toggleCharacterPanel();
    },
    toggleDpsPanel() {
      bridge.toggleDpsPanel();
    },
    callWave() {
      bridge.pushCommand({ k: 'call' });
    },
    pickOffer(index) {
      bridge.pushCommand({ k: 'pick', index });
    },
    forceVsPhase() {
      const w = bridge.world();
      if (!w || w.phase === 'act2' || w.phase === 'levelup' || w.phase === 'results') return;
      finishSundering(w);
    },
    forceLevelUpOffer(xp) {
      bridge.pushCommand({ k: 'dev', op: 'xp', amount: xp });
    },
    forceStatusShowcase() {
      const w = bridge.world();
      if (!w) return;
      const live = w.enemies.filter((e) => !e.dead);
      if (live.length === 0) return;
      const pick = (i: number) => live[i % live.length];
      const LONG = 30;
      applyDot(w, pick(0), 'bleeding', 20, LONG, 'audit');
      applyDot(w, pick(1), 'poison', 20, LONG, 'audit');
      applyDot(w, pick(2), 'toxic', 20, LONG, 'audit');
      applyDot(w, pick(3), 'burning', 20, LONG, 'audit');
      applyFrost(w, pick(4));
      applyFrozen(w, pick(5));
    },
    forceDefeat(_kind) {
      const w = bridge.world();
      if (!w) return;
      w.coreHp = 0;
    },
    mountCodexOverlay() {
      if (codexHandle) return;
      const el = document.createElement('div');
      el.id = 'sw-audit-codex';
      el.style.position = 'fixed';
      el.style.inset = '0';
      el.style.zIndex = '99999';
      el.style.background = '#0d1016';
      el.style.color = '#e8edf5';
      el.style.overflow = 'auto';
      el.style.font = '14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif';
      document.body.appendChild(el);
      codexHandle = mountCodex(el);
    },
    unmountCodexOverlay() {
      codexHandle?.destroy();
      document.getElementById('sw-audit-codex')?.remove();
      codexHandle = null;
    },
    phase() {
      return bridge.world()?.phase ?? null;
    },
    outcome() {
      return bridge.world()?.outcome ?? null;
    },
    offersOpen() {
      const w = bridge.world();
      return !!w && w.phase === 'levelup' && w.offers.length > 0;
    },
    worldToScreen(x, y) {
      const canvas = document.querySelector('#sw-canvas') as HTMLCanvasElement | null;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width / (GRID_W * TILE);
      const scaleY = rect.height / (GRID_H * TILE);
      return { x: rect.left + x * TILE * scaleX, y: rect.top + y * TILE * scaleY };
    },
    wardenScreenPoint() {
      const w = bridge.world();
      if (!w) return null;
      return api.worldToScreen(w.warden.x, w.warden.y);
    },
  };

  (window as unknown as { __stonewakeAudit: StonewakeAuditApi }).__stonewakeAudit = api;
}
