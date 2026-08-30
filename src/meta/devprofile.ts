/**
 * Dev profile (SPEC-V3 §10 T3): in development, start with everything open so
 * the game can be exercised without grinding for it.
 *
 * Gate C8 has two halves. "Dev build has everything unlocked" is
 * `applyDevProfile`. "`npm run build` output has devMode off" is `isDevBuild()`.
 *
 * Two rules this module holds to, both from QA on this item:
 *
 * 1. **The profile is a view, never a write.** It is applied in memory at
 *    startup and never saved. A developer who has actually played keeps their
 *    real account, and the "clean profile" setting genuinely produces a clean
 *    profile on the next reload rather than merely declining to re-apply
 *    unlocks that were already burned into the save.
 * 2. **The unsafe direction is off.** `isDevBuild()` requires positive proof
 *    that this is a dev build. An earlier version returned `true` when the env
 *    was missing or unpopulated, so a bundler whose constant-folding differed
 *    would have shipped a production build with the profile live.
 */

import { loadContent, type DevConfig } from '../sim/content';
import { MAX_TIER } from '../sim/tiers';
import type { MetaState } from '../sim/types';

/**
 * True only where the toolchain says so: Vite sets `import.meta.env.DEV` in a
 * dev server and Vitest sets it under test. Anything else — a production
 * bundle, plain Node, an unpopulated env object — is **not** a dev build.
 *
 * Defaulting to false is the point. The dev profile unlocks everything, so the
 * failure mode of guessing wrong in this direction is a shipped god-mode build.
 */
export function isDevBuild(): boolean {
  return isDevEnv((import.meta as unknown as { env?: { DEV?: unknown } }).env);
}

/**
 * The predicate itself, exported so it can be tested directly. A bundler folds
 * `import.meta.env.DEV` to a literal in a production build, which means an
 * executed-bundle test cannot tell a safe default from an unsafe one — only a
 * direct call can.
 */
export function isDevEnv(env: { DEV?: unknown } | undefined): boolean {
  return env?.DEV === true;
}

/** The authored config from `data/dev.json`. */
export function devConfig(): DevConfig {
  return loadContent().dev;
}

/**
 * Whether the dev profile should be applied: authored on *and* a build that
 * allows it. This is the single predicate the rest of the app asks.
 */
export function devProfileActive(config: DevConfig = devConfig()): boolean {
  return resolveDevMode(config.devMode, isDevBuild());
}

/**
 * The C8 rule as a pure function, so it can be tested without a build: a
 * production bundle is never in dev mode, whatever the data file says.
 */
export function resolveDevMode(authored: boolean, devBuild: boolean): boolean {
  return authored && devBuild;
}

/**
 * What a startup should do with the account it loaded. Extracted from the game
 * loop so the rule is testable: the returned meta is for display and play only,
 * and `persist` is always false — the caller must not save it.
 */
export function startupProfile(
  loaded: MetaState,
  opts: { devActive: boolean; cleanProfile: boolean },
): { meta: MetaState; persist: false } {
  const apply = opts.devActive && !opts.cleanProfile;
  return { meta: apply ? applyDevProfile(loaded) : loaded, persist: false };
}

/**
 * Opens up an account for development. Pure — returns a new state, so the
 * "clean profile" setting is just declining to call this.
 *
 * Never *reduces* anything: a real account that already has more skill
 * points, a higher tier or more unlocks than the profile grants keeps what
 * it had.
 */
export function applyDevProfile(meta: MetaState, config: DevConfig = devConfig()): MetaState {
  const content = loadContent();
  const out: MetaState = {
    ...meta,
    allocated: meta.allocated.slice(),
    equipmentStash: { ...meta.equipmentStash },
    equippedEquipment: { ...meta.equippedEquipment },
    questProgress: { ...meta.questProgress },
    completedQuests: meta.completedQuests.slice(),
    unlockedClasses: meta.unlockedClasses.slice(),
    unlockedCores: meta.unlockedCores.slice(),
  };

  if (config.unlockAllClasses) {
    out.unlockedClasses = content.classes.classes.map((c) => c.key);
  }
  if (config.unlockAllCores) {
    out.unlockedCores = content.cores.cores.map((c) => c.key);
  }
  if (config.unlockAllTiers) {
    out.highestTier = Math.max(out.highestTier, MAX_TIER);
  }
  if (config.completeAllQuests) {
    const done = new Set([...out.completedQuests, ...content.quests.quests.map((q) => q.key)]);
    out.completedQuests = [...done];
  }
  // p7d (§8.3): skill points are the tree's only currency now, so the T3
  // request is granted directly rather than through an Ember-derived account
  // level (QUESTIONS Q53's 60-point cap died with that level).
  out.skillPoints = Math.max(out.skillPoints, config.skillPoints);
  // fb015 (§7): "dev profile pre-stashes all 12 items" — gated on the
  // equipment stash being empty so a developer who has genuinely earned
  // equipment keeps it.
  if (config.fillStash && Object.keys(out.equipmentStash).length === 0) {
    out.equipmentStash = allEquipmentOnce();
  }
  return out;
}

/** One of every `data/equipment.json` item — fb015's dev-profile pre-stash. */
function allEquipmentOnce(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of loadContent().equipment.items) out[item.key] = 1;
  return out;
}
