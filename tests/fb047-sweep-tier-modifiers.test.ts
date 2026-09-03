/**
 * fb047 — verify `tools/sweep.ts`'s `--tier` flag applies the tier scalars to
 * every bot policy path (QUESTIONS additional ORDER, 2026-09-01 verdict
 * batch; p10p flagged, not filed, that kite/rush/walloff's T3 win rates
 * measured suspiciously close to their T1 numbers).
 *
 * Root cause, confirmed by reading rather than guessing: `RunConfig.tier`
 * alone feeds only reward-multiplier math (`src/sim/tiers.ts`'s
 * `rewardMultiplier`) and reporting (`run.ts`'s `buildReport`). Every actual
 * difficulty knob — enemy HP/speed, elite/rift/boss multipliers, extra
 * gates/waves, Core HP — lives entirely in `RunConfig.modifiers`, which the
 * real Hub UI drafts per tier (`src/sim/tiers.ts`'s `modifierDraft`) before a
 * human ever plays a run. `tools/sweep.ts`'s `--tier N` set `cfg.tier` but
 * left `cfg.modifiers` at `[]` unless `--mods` was passed by hand, so a
 * `--tier 3` sweep was mechanically identical to `--tier 1` for *every*
 * policy, not just the three p10p happened to be looking at.
 * `tools/handoff-metrics.ts` already drew this line correctly
 * (`tier > 1 ? autoDraft(...) : []`); this pins the same fix, exported from
 * `tools/sweep.ts` as `resolveModifiers`/`buildRunConfig` and reused by
 * `tools/status.ts`'s `cfgFor`, which had the identical defect in its own
 * T1-vs-T3 per-class/per-Core balance snapshot (shipped this same session at
 * fb038, before this bug was found).
 */
import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';
import { Run } from '../src/sim/run';
import { buildRunConfig, resolveModifiers, runOne, type Options } from '../tools/sweep';
import { cfgFor } from '../tools/status';
import '../src/bots';

const content = loadContent();
const MAX_TICKS = 60 * 60 * 45;

function options(over: Partial<Options> = {}): Options {
  return {
    seeds: 1,
    seedStart: 1,
    policies: ['kite'],
    classKey: 'engineer',
    tier: 1,
    modifiers: [],
    allocated: [],
    json: false,
    maxTicks: MAX_TICKS,
    ...over,
  };
}

describe('fb047: resolveModifiers', () => {
  it('drafts nothing at tier 1', () => {
    expect(resolveModifiers(content, 1, 1, [])).toEqual([]);
  });

  it('drafts real modifiers at tier > 1, deterministic per seed+tier', () => {
    const a = resolveModifiers(content, 1, 3, []);
    const b = resolveModifiers(content, 1, 3, []);
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
    // A different seed at the same tier is free to draft a different set
    // (the draft pool RNG is seeded), but must still draft *something*.
    expect(resolveModifiers(content, 2, 3, []).length).toBeGreaterThan(0);
  });

  it('an explicit --mods list always wins, at any tier', () => {
    const explicit = [content.modifiers.modifiers[0].key];
    expect(resolveModifiers(content, 1, 3, explicit)).toEqual(explicit);
    expect(resolveModifiers(content, 1, 1, explicit)).toEqual(explicit);
  });
});

describe('fb047: tools/sweep.ts buildRunConfig actually reaches World difficulty', () => {
  it('a --tier 3 CLI config drafts non-empty modifiers; --tier 1 does not', () => {
    const t1 = buildRunConfig(options({ tier: 1 }), content, 1);
    const t3 = buildRunConfig(options({ tier: 3 }), content, 1);
    expect(t1.modifiers).toEqual([]);
    expect(t3.modifiers.length).toBeGreaterThan(0);
  });

  it('an explicit --mods flag survives buildRunConfig regardless of --tier', () => {
    const explicit = [content.modifiers.modifiers[0].key];
    const built = buildRunConfig(options({ tier: 3, modifiers: explicit }), content, 1);
    expect(built.modifiers).toEqual(explicit);
  });

  it('tier 3 raises the World ModifierEffects over tier 1 for the same seed', () => {
    const seed = 1;
    const t1 = new Run(buildRunConfig(options({ tier: 1 }), content, seed)).world;
    const t3 = new Run(buildRunConfig(options({ tier: 3 }), content, seed)).world;
    // Whatever the drafted modifiers happen to be, a tier that buys nothing
    // in World state is a tier that buys nothing at all.
    expect(t3.mods).not.toEqual(t1.mods);
  });

  // fb025 (this same session, earlier item) multiplied enemy HP x10 across
  // the board, which independently drove every bot's T1 win rate to 0% by
  // wave 2-3 (documented in PROGRESS.md's fb025 entry) — kite/rush/walloff
  // included, confirmed live below. That pre-existing, already-flagged P10
  // problem means a *win-rate* T1-vs-T3 comparison for these three bots is
  // currently floored at zero on both sides and cannot show a tier delta —
  // not because `--tier` is broken again, but because Act I already ends
  // every run before a VS-block-scoped modifier (elite/rift/ghost/boss) gets
  // a chance to matter. Seed 3's real draft (`autoDraft` is seeded by
  // seed+tier only, so it is identical across policies) includes `cracked`
  // (Core -150 HP), which *does* reach Act I — proving the wiring with a
  // continuous, non-binary metric (time-to-defeat) rather than a win/loss
  // count that the fb025 floor has made structurally unable to move.
  // b080 (2026-09-03): `data/towers.json`'s solo-viability retune (fixing
  // `tests/a4-single-type.test.ts`) also lifted the fb025 Act I floor this
  // test pinned as a symptom, not as this file's own subject — kite/rush/
  // walloff can now win T1 (confirmed live: at least one of the 9 policy x
  // seed cells now returns 'victory'). This test's premise is gone, not its
  // conclusion; the fix it exists to prove (`--tier` reaches World
  // difficulty) is unaffected and still covered by the three
  // `describe('fb047: resolveModifiers'...)`/`buildRunConfig` tests above.
  // Needs a redesign now that T1 is winnable rather than floored, not a
  // value tweak — filed as a known issue, not chased further here.
  it.skip('T1 win rate is currently 0% for all three (fb025s Act I floor, not a --tier regression)', () => {
    for (const policy of ['kite', 'rush', 'walloff']) {
      for (const seed of [1, 2, 3]) {
        const t1cfg = buildRunConfig(options({ tier: 1 }), content, seed);
        expect(runOne(t1cfg, policy, MAX_TICKS).outcome).not.toBe('victory');
      }
    }
  });

  // b080 (2026-09-03): same root cause as the test above — seed 3's T1 run
  // is no longer a guaranteed loss under the retuned towers, so the
  // defeat-time-proxy comparison this test built specifically to work around
  // that floor no longer holds either. Same redesign need, same disposition.
  it.skip('seed 3 drafts a Core-HP modifier at T3 that measurably shortens every one of the three bots run, proving the wiring', () => {
    const seed = 3;
    for (const policy of ['kite', 'rush', 'walloff']) {
      const t1cfg = buildRunConfig(options({ tier: 1 }), content, seed);
      const t3cfg = buildRunConfig(options({ tier: 3 }), content, seed);
      expect(t3cfg.modifiers).toContain('cracked'); // pins the exact draft this regression depends on
      const t1 = runOne(t1cfg, policy, MAX_TICKS);
      const t3 = runOne(t3cfg, policy, MAX_TICKS);
      expect(t1.outcome).not.toBe('victory');
      expect(t3.outcome).not.toBe('victory');
      // Harder Core-HP-reduced T3 dies measurably sooner than T1 for every
      // one of the three bots the pre-fix bug hid this from — a win/loss
      // count could not show this today (see the test above), but wall-clock
      // time-to-defeat still can.
      expect(t3.totalSeconds).toBeLessThan(t1.totalSeconds);
    }
  });
});

describe('fb047: tools/status.ts cfgFor draws the same tier-modifier line', () => {
  it('applies drafted modifiers when a tier override is given, not just at tier 1', () => {
    const t1 = cfgFor({ tier: 1 }, 1, content);
    const t3 = cfgFor({ tier: 3 }, 1, content);
    expect(t1.modifiers).toEqual([]);
    expect(t3.modifiers.length).toBeGreaterThan(0);
  });
});
