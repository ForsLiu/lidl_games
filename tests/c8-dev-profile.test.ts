/**
 * @vitest-environment jsdom
 *
 * Gate C8 (SPEC-V3 §12): "Dev mode: dev build has everything unlocked;
 * `npm run build` output has devMode off."
 *
 * The production half is the hard one, and QA broke two earlier attempts at it:
 * grepping `dist/` passed with no `dist/` at all, and passed again against a
 * `dist/` built before the feature existed. It also showed that the shipped
 * answer came out of Rollup's constant folding rather than the source's own
 * logic — so a bundler change could ship a god-mode build while the grep stayed
 * green.
 *
 * So this builds its own bundle into a temp dir and **executes** it. That is
 * slower, but it is the only version that actually tests the claim.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  applyDevProfile,
  devConfig,
  devProfileActive,
  isDevBuild,
  isDevEnv,
  resolveDevMode,
  startupProfile,
} from '../src/meta/devprofile';
import { defaultMeta, pointsAvailable } from '../src/meta/meta';
import { loadContent } from '../src/sim/content';
import { MAX_TIER } from '../src/sim/tiers';
import { defaultSettings } from '../src/ui/settings';
import type { DevConfig } from '../src/sim/content';

const content = loadContent();

/** Every switch on, so the tests drive the rule rather than the authored file. */
const ALL_ON: DevConfig = {
  devMode: true,
  skillPoints: 999,
  unlockAllClasses: true,
  unlockAllCores: true,
  unlockAllTiers: true,
  completeAllQuests: true,
  fillStash: true,
};

describe('C8: the dev profile unlocks everything', () => {
  it('data/dev.json is schema-validated and complete', () => {
    // Deliberately does NOT assert `devMode === true`: the file is the switch,
    // and authoring it off must not turn the suite red.
    const cfg = devConfig();
    expect(typeof cfg.devMode).toBe('boolean');
    expect(Number.isInteger(cfg.skillPoints)).toBe(true);
    expect(cfg.skillPoints).toBeGreaterThanOrEqual(0);
  });

  it('unlocks every class', () => {
    const out = applyDevProfile(defaultMeta(), ALL_ON);
    expect(out.unlockedClasses.sort()).toEqual(content.classes.classes.map((c) => c.key).sort());
    expect(defaultMeta().unlockedClasses.length).toBeLessThan(out.unlockedClasses.length);
  });

  it('unlocks every core', () => {
    const out = applyDevProfile(defaultMeta(), ALL_ON);
    expect(out.unlockedCores.sort()).toEqual(content.cores.cores.map((c) => c.key).sort());
    expect(defaultMeta().unlockedCores.length).toBeLessThan(out.unlockedCores.length);
  });

  it('unlocks every tier and completes every quest', () => {
    const out = applyDevProfile(defaultMeta(), ALL_ON);
    expect(out.highestTier).toBe(MAX_TIER);
    expect(out.completedQuests.sort()).toEqual(content.quests.quests.map((q) => q.key).sort());
  });

  it('grants Constellation points to spend, at the full 999 T3 asked for (p7d: no account-level cap left)', () => {
    const out = applyDevProfile(defaultMeta(), ALL_ON);
    expect(pointsAvailable(out)).toBeGreaterThan(pointsAvailable(defaultMeta()));
    expect(out.skillPoints).toBe(999);
    expect(pointsAvailable(out)).toBe(999);
  });

  it('fills an equipment stash that covers every equipment slot', () => {
    const out = applyDevProfile(defaultMeta(), ALL_ON);
    expect(Object.keys(out.equipmentStash).length).toBeGreaterThan(0);
    for (const slot of content.equipment.slots) {
      expect(
        content.equipment.items.some((it) => it.slot === slot && (out.equipmentStash[it.key] ?? 0) > 0),
        `no ${slot} in the dev equipment stash`,
      ).toBe(true);
    }
  });

  it('never overwrites an equipment stash that already has items', () => {
    const owned = { ...defaultMeta(), equipmentStash: { greatsword: 3 } };
    const out = applyDevProfile(owned, ALL_ON);
    expect(out.equipmentStash).toEqual({ greatsword: 3 });
  });

  it('never reduces an account, at any skillPoints setting', () => {
    const played = { ...defaultMeta(), skillPoints: 5, highestTier: 4 };
    for (const skillPoints of [0, 1, 2, 50, 999]) {
      const out = applyDevProfile(played, { ...ALL_ON, skillPoints });
      expect(out.skillPoints, `skillPoints ${skillPoints}`).toBeGreaterThanOrEqual(played.skillPoints);
      expect(out.highestTier, `skillPoints ${skillPoints}`).toBeGreaterThanOrEqual(played.highestTier);
    }
  });

  it('is pure — the account it was given is untouched', () => {
    const before = defaultMeta();
    const snapshot = JSON.stringify(before);
    applyDevProfile(before, ALL_ON);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('respects a config with everything switched off', () => {
    const off: DevConfig = {
      devMode: true,
      skillPoints: 0,
      unlockAllClasses: false,
      unlockAllCores: false,
      unlockAllTiers: false,
      completeAllQuests: false,
      fillStash: false,
    };
    expect(applyDevProfile(defaultMeta(), off)).toEqual(defaultMeta());
  });
});

describe('C8: startup applies the profile as a view, never a write', () => {
  it('never asks the caller to persist', () => {
    for (const devActive of [true, false]) {
      for (const cleanProfile of [true, false]) {
        expect(startupProfile(defaultMeta(), { devActive, cleanProfile }).persist).toBe(false);
      }
    }
  });

  it('applies the unlocks when dev is active and the profile is not clean', () => {
    const out = startupProfile(defaultMeta(), { devActive: true, cleanProfile: false }).meta;
    expect(out.highestTier).toBe(MAX_TIER);
  });

  it('a clean profile really is clean, even on a machine that ran dev before', () => {
    // QA's repro: the old code saved the profile, so the account was already
    // god-mode and the toggle had nothing left to clean.
    const saved = defaultMeta();
    startupProfile(saved, { devActive: true, cleanProfile: false });
    const clean = startupProfile(saved, { devActive: true, cleanProfile: true }).meta;
    expect(clean).toEqual(defaultMeta());
  });

  it('a real account passes through a dev launch unchanged in the save', () => {
    const played = { ...defaultMeta(), skillPoints: 250, highestTier: 2 };
    const snapshot = JSON.stringify(played);
    startupProfile(played, { devActive: true, cleanProfile: false });
    expect(JSON.stringify(played), 'startup must not mutate the loaded account').toBe(snapshot);
  });
});

describe('C8: a production build has the dev profile off', () => {
  it('the rule itself: a production build overrides the data file', () => {
    expect(resolveDevMode(true, false)).toBe(false);
    expect(resolveDevMode(false, false)).toBe(false);
    expect(resolveDevMode(false, true)).toBe(false);
    expect(resolveDevMode(true, true)).toBe(true);
  });

  it('is active under Vitest, which is a dev build', () => {
    expect(isDevBuild()).toBe(true);
    expect(devProfileActive({ ...ALL_ON, devMode: true })).toBe(true);
    expect(devProfileActive({ ...ALL_ON, devMode: false })).toBe(false);
  });

  it('a real production bundle reports the profile off when executed', () => {
    // Not a grep: QA showed a grep passes with no dist/ and with a stale dist/,
    // and that the safe answer came from the bundler rather than the source.
    // Build fresh, run it, read the answer.
    // The entry lives inside the repo so its relative import resolves; the
    // output goes to a temp dir. Both are cleaned up in afterAll.
    const entry = join(process.cwd(), '.c8-probe-entry.ts');
    writeFileSync(
      entry,
      [
        "import { isDevBuild, devProfileActive, devConfig, startupProfile } from './src/meta/devprofile';",
        "import { defaultMeta } from './src/meta/meta';",
        'const fresh = defaultMeta();',
        // p9d: main.ts's exact startup call, run inside the executed production
        // bundle rather than assumed from the predicate alone.
        'const started = startupProfile(fresh, { devActive: devProfileActive(), cleanProfile: false }).meta;',
        'console.log(JSON.stringify({',
        '  isDevBuild: isDevBuild(),',
        '  active: devProfileActive(),',
        '  authoredDevMode: devConfig().devMode,',
        '  authoredUnlockAllClasses: devConfig().unlockAllClasses,',
        '  defaultHighestTier: fresh.highestTier,',
        '  startedHighestTier: started.highestTier,',
        '}));',
      ].join('\n'),
    );
    // Output inside the repo too: an SSR build externalises `zod`, so the
    // bundle only resolves its imports from somewhere under this node_modules.
    const outDir = join(process.cwd(), '.c8-probe-out');
    execFileSync(
      'npx',
      ['vite', 'build', '--mode', 'production', '--ssr', entry, '--outDir', outDir, '--logLevel', 'error'],
      {
        cwd: process.cwd(),
        shell: true,
        stdio: 'pipe',
        // Vitest sets NODE_ENV=test, and Vite derives `import.meta.env.DEV`
        // from it as much as from --mode. Inheriting it would build a bundle
        // that still calls itself a dev build, and this test would fail for a
        // reason that has nothing to do with the shipped product.
        env: { ...process.env, NODE_ENV: 'production' },
      },
    );
    const built = join(outDir, '.c8-probe-entry.js');
    const answer = execFileSync('node', [built], { encoding: 'utf8' });
    const parsed = JSON.parse(answer.trim()) as {
      isDevBuild: boolean;
      active: boolean;
      authoredDevMode: boolean;
      authoredUnlockAllClasses: boolean;
      defaultHighestTier: number;
      startedHighestTier: number;
    };
    expect(parsed.isDevBuild, 'a production bundle must not report itself as a dev build').toBe(false);
    expect(parsed.active, 'the dev profile must be off in production').toBe(false);
    // p9d (G16's unasserted half): `data/dev.json` and `applyDevProfile` are
    // not tree-shaken out of a production bundle — the generic `/data` loader
    // that ships every legitimate content file ships this one too (CLAUDE.md
    // rule 4: content loading stays generic, no per-file special-casing). So
    // the authored config really is present and "on" inside this exact
    // executed bundle...
    expect(parsed.authoredDevMode, 'data/dev.json ships with devMode on, even in prod — that is expected').toBe(true);
    expect(parsed.authoredUnlockAllClasses, 'the dev unlock config ships in prod — that is expected').toBe(true);
    // ...and yet running main.ts's real startup call against it, in this same
    // production bundle, produces no effect: presence, proven inert.
    expect(parsed.startedHighestTier, 'a production startup must not apply the dev unlocks').toBe(
      parsed.defaultHighestTier,
    );
  }, 120_000);

  it('fb018: the real client bundle has no audit-hook dev surface', () => {
    // Same "build fresh, then check the real artifact" discipline as the SSR
    // probe above, but for `src/ui/audit-hook.ts` (fb018's UI self-audit
    // bridge) rather than the dev-profile unlock: this is the actual
    // `index.html`-entry client build `npm run build` produces, not a
    // synthetic probe entry, since the audit hook is only ever reached via
    // `main.ts`'s real bootstrap. A later change that hoists the hook's
    // `window.__stonewakeAudit` assignment above its `isDevBuild()` guard, or
    // that adds a second unguarded call site, must fail this test.
    const outDir = join(process.cwd(), '.c8-probe-client-out');
    execFileSync('npx', ['vite', 'build', '--mode', 'production', '--outDir', outDir, '--logLevel', 'error'], {
      cwd: process.cwd(),
      shell: true,
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'production' },
    });
    const bundle = readdirSync(join(outDir, 'assets'))
      .filter((f) => f.endsWith('.js'))
      .map((f) => readFileSync(join(outDir, 'assets', f), 'utf8'))
      .join('\n');
    // The bridge's window property plus its three privileged, Command-bypassing
    // shortcuts (see audit-hook.ts's header comment) — any one of these
    // surviving into the bundle means the dev surface is reachable in prod.
    for (const marker of ['__stonewakeAudit', 'stonewakeAudit', 'forceStatusShowcase', 'forceDefeat', 'forceVsPhase']) {
      expect(bundle.includes(marker), `production bundle must not contain "${marker}"`).toBe(false);
    }
    // p9d: unlike the audit hook above, the dev profile's *data and logic* are
    // not expected to disappear from this real client bundle (the generic
    // `/data` loader ships every content file, dev.json included) — this
    // confirms the premise this item is about is still true, rather than
    // asserting a stale one. `DevConfig`'s own field names are used nowhere
    // else in the app, so their presence is specific to the dev profile.
    for (const marker of ['unlockAllClasses', 'unlockAllCores', 'unlockAllTiers', 'completeAllQuests', 'fillStash']) {
      expect(bundle.includes(marker), `expected the dev profile's "${marker}" to still ship in prod`).toBe(true);
    }
    // The dev badge *markup* — the `'<span class="sw-devbadge"...>DEV PROFILE</span>'`
    // string hub.ts would concatenate into the DOM — is guarded by
    // `DEV_BUILD && ...` with `DEV_BUILD` folded to the literal `false` in a
    // production build. The minifier proves that ternary branch unreachable
    // and drops the string entirely. Pinned here so a change that makes the
    // badge reachable some other way (losing the fold) is caught the moment
    // it stops disappearing.
    expect(bundle.includes('sw-devbadge'), 'the dev badge markup should be dead code, folded out of prod').toBe(
      false,
    );
    // The CSS *rule* for `.sw-devbadge` (src/ui/style.css) is a different
    // story: Vite/esbuild does not purge unused CSS selectors, so the rule
    // itself ships into dist/assets/*.css unconditionally, unlike the JS-side
    // markup string above. That is fine, not a hole to close — a selector
    // with no matching element does nothing — and the assertion just above is
    // exactly the proof that it can never match anything: if the literal
    // `"sw-devbadge"` class name string is absent from every shipped .js file,
    // no runtime code path can ever assign that class to a DOM element, so an
    // orphaned CSS rule for it is inert by construction. Asserted directly
    // here rather than left as an inference, so a future PurgeCSS-style build
    // step that starts stripping it doesn't silently invalidate this reasoning.
    const css = readdirSync(join(outDir, 'assets'))
      .filter((f) => f.endsWith('.css'))
      .map((f) => readFileSync(join(outDir, 'assets', f), 'utf8'))
      .join('\n');
    expect(css.includes('sw-devbadge'), 'expected the (inert) .sw-devbadge CSS rule to still ship in prod').toBe(
      true,
    );
  }, 120_000);

  it('the source logic is safe on its own, without a bundler folding it', () => {
    // The failure mode QA found: an env object that exists but is unpopulated
    // used to answer "dev build". It must answer "not a dev build".
    // Calls the real predicate, not a copy of it: a bundler folds
    // `import.meta.env.DEV` to a literal, so the executed-bundle test above
    // cannot tell a safe default from an unsafe one. Only this can.
    expect(isDevEnv(undefined)).toBe(false);
    expect(isDevEnv({})).toBe(false);
    expect(isDevEnv({ DEV: false })).toBe(false);
    expect(isDevEnv({ DEV: 'true' })).toBe(false);
    expect(isDevEnv({ DEV: 1 })).toBe(false);
    expect(isDevEnv({ DEV: true })).toBe(true);
  });
});

describe('C8: the Hub dev badge', () => {
  it('renders when the dev profile is active (this suite runs under a dev build with devMode on)', async () => {
    // p9d: the production-build tests above prove the badge markup is dead
    // code once folded away; nothing previously proved the other direction —
    // that it is live, reachable markup under the conditions it is meant for,
    // not simply unreachable everywhere. Vitest is a dev build (`isDevBuild()`
    // true) and the authored `data/dev.json` ships with `devMode: true`, so
    // `devProfileActive()` is true here with no mocking needed.
    //
    // This does mean the test is coupled to that authored value, unlike the
    // `ALL_ON`-injected tests above — deliberately: `vi.mock('../src/meta/
    // devprofile')` would swap the module for this whole file, contaminating
    // the real-config tests elsewhere in it (see tests/p9c-tuner-prod-ui.test.ts's
    // header comment on that trade-off). If `data/dev.json` is ever authored
    // with `devMode: false`, this assertion fails first and names the real
    // cause, rather than the badge query failing confusingly underneath it.
    expect(devProfileActive()).toBe(true);
    const { Hub } = await import('../src/ui/hub');
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.getElementById('app') as HTMLElement;
    const hub = new Hub(root, defaultMeta(), 1, {
      settings: defaultSettings(),
      onSettingsChanged: () => {},
      onStart: () => {},
      onMetaChanged: () => {},
    });
    hub.show();
    expect(root.querySelector('.sw-devbadge')).not.toBeNull();
  });
});

describe('C8: the clean-profile escape hatch', () => {
  it('is off by default', () => {
    expect(defaultSettings().cleanProfile).toBe(false);
  });

  it('is offered in the Settings tab', async () => {
    const { Hub } = await import('../src/ui/hub');
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.getElementById('app') as HTMLElement;
    const hub = new Hub(root, defaultMeta(), 1, {
      settings: defaultSettings(),
      onSettingsChanged: () => {},
      onStart: () => {},
      onMetaChanged: () => {},
    });
    hub.openTab('settings');
    expect(root.querySelector('[data-toggle="cleanProfile"]')).not.toBeNull();
  });
});

const tmpRoot = mkdtempSync(join(tmpdir(), 'stonewake-c8-'));
afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
  rmSync(join(process.cwd(), '.c8-probe-entry.ts'), { force: true });
  rmSync(join(process.cwd(), '.c8-probe-out'), { recursive: true, force: true });
  rmSync(join(process.cwd(), '.c8-probe-client-out'), { recursive: true, force: true });
});

// Referenced so the import is not dead when the build test is the only user.
void readFileSync;
