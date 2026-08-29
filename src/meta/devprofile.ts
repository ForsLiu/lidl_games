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
import { accountLevelFor, seedTestAccount } from './meta';

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
 * Never *reduces* anything: a real account that already has more Ember, a
 * higher tier or more unlocks than the profile grants keeps what it had.
 */
export function applyDevProfile(meta: MetaState, config: DevConfig = devConfig()): MetaState {
  const content = loadContent();
  let out: MetaState = {
    ...meta,
    stash: meta.stash.slice(),
    allocated: meta.allocated.slice(),
    equipped: { ...meta.equipped },
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
  if (config.skillPoints > 0) {
    // Skill points arrive at M24 (SPEC-V3 §8). Until then the Constellation is
    // still priced in Ember, so the request is granted as the Ember that buys
    // that many points — capped by the tree's own account-level ceiling, which
    // is why a dev account gets 60 points rather than 999 (QUESTIONS Q53).
    //
    // `Math.max` on both figures: `refund()` spends Ember without recomputing
    // the level, so `{level: 5, ember: 0}` is a reachable real state and a bare
    // recompute would demote it.
    out.ember = Math.max(out.ember, emberForPoints(config.skillPoints));
    out.accountLevel = Math.max(out.accountLevel, accountLevelFor(out.ember));
  }
  if (config.fillStash && out.stash.length === 0) {
    out = fillDevStash(out);
  }
  // fb015 (§7): "dev profile pre-stashes all 12 items" — the existing T3 rule,
  // reusing `fillStash` rather than a second flag. Gated on the equipment
  // stash itself being empty (not `out.stash`, the relic one) so a developer
  // who has genuinely earned equipment keeps it.
  if (config.fillStash && Object.keys(out.equipmentStash).length === 0) {
    out = { ...out, equipmentStash: allEquipmentOnce() };
  }
  return out;
}

/** One of every `data/equipment.json` item — fb015's dev-profile pre-stash. */
function allEquipmentOnce(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of loadContent().equipment.items) out[item.key] = 1;
  return out;
}

/**
 * Seeds a stash that covers every equipment slot. `seedTestAccount` alone is
 * seeded deterministically and happens to roll no sigils at all, which left a
 * whole slot untriable on a dev account — the opposite of what T3 is for.
 */
function fillDevStash(meta: MetaState): MetaState {
  // `seedTestAccount` grants Ember and recomputes the account level from it, which
  // demotes an account whose level is ahead of its Ember (reachable via
  // `refund()`). Keep whichever level is higher.
  const seeded = seedTestAccount(meta);
  let out: MetaState = {
    ...seeded,
    accountLevel: Math.max(meta.accountLevel, seeded.accountLevel),
    ember: Math.max(meta.ember, seeded.ember),
  };
  const slots = loadContent().relics.slots;
  const missing = slots.filter((slot) => !out.stash.some((r) => r.slot === slot));
  for (const slot of missing) {
    // Re-slot a spare rather than rolling more, so the stash stays the size the
    // seeding advertised.
    const spare = [...out.stash]
      .reverse()
      .find((r) => out.stash.filter((o) => o.slot === r.slot).length > 1);
    if (!spare) break;
    out = {
      ...out,
      stash: out.stash.map((r) => (r.id === spare.id ? { ...r, slot } : r)),
    };
  }
  return out;
}

/** Ember needed to reach `points` Constellation points, at 100 x level per level. */
function emberForPoints(points: number): number {
  const tree = loadContent().tree;
  const levels = Math.min(tree.maxAccountLevel, Math.ceil(points / tree.pointsPerLevel));
  let ember = 0;
  for (let level = 1; level < levels; level++) ember += 100 * level;
  return ember;
}
