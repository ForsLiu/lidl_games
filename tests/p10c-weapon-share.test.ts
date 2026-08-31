/**
 * Gate G13's damage-share clause (SPEC-FINAL §14, measured at p10c): across
 * the winning-build pool, no tower type's VS attack takes more than 35% of
 * damage dealt.
 *
 * Successor to the retired `tests/a5-weapon-share.test.ts` (SPEC A5, deleted
 * at p2e — see MIGRATION.md §2.3/§5 and QUESTIONS.md): same question, restated
 * against SPEC-FINAL's real §1.1 run shape (18 TD + 6 VS waves, `cycles: 6`)
 * via the rebuilt `tools/a5probe.ts` (p10c), which accumulates VS-phase
 * damage across every wave of a run rather than reading a single-cycle
 * "minute 8" snapshot that shape makes unreachable. See that file's own
 * header for the full accounting.
 *
 * **p10c/p10d history: the cap was `.skip`-ed, measured not met.** Two
 * rounds of balance-analyst retuning moved `frost_obelisk`'s share from
 * 51.1% to 42.7% purely through `data/towers.json`, but bisection on every
 * field found its solo-TD economy sits only ~9-10% above the T1 failure line
 * — roughly 4-6x short of the cut its VS share would need. The mechanism was
 * structural: `frost_obelisk`'s `aura` and `ember_brazier`'s `cone` wielded
 * attacks (`src/sim/vswield.ts`) hit every enemy in range each interval,
 * while `single`/`pierce`/`chain`/`lob`/`poison` hit only what's in one
 * line/arc/handful of targets, so no data-only tune could make them out-share
 * an omnidirectional attacker. Filed as BACKLOG p10j.
 *
 * **p10j fix (this session): an engine-side crowd allowance for the five
 * directional kinds** (`src/sim/vswield.ts`'s `WIELD_*` constants) —
 * `single` cleaves a fraction of its damage to nearby enemies (via the new
 * `wieldSplash`, which deliberately does *not* re-strike the primary target,
 * since routing it back through `applyAoE`'s own primary slot double-applied
 * `fx.onHit` — e.g. Arrow Spire's Bleeding — for a target that already took
 * its full hit), `pierce` cuts a few bodies deeper, `lob`'s blast radius
 * widens, and `poison`'s spore volley reaches a couple more targets.
 * `chain` is deliberately left at 0: `tests/a4-single-type.test.ts` showed
 * Tesla Coil sitting at exactly zero T1 margin — even the smallest possible
 * nonzero chain-jump bonus flips one of the five fixed seeds through the
 * same VS-kills-feed-`powerMul` coupling documented below, and the other
 * four directional kinds already close the gate without it.
 *
 * Every magnitude was re-measured against both this file's pool *and*
 * `tests/a4-single-type.test.ts`'s 5/5 T1 / 0/5 T3 bar for all seven towers
 * — the coupling trap is real: VS kills feed the character's XP →
 * Power-boon pipeline and `towerDamage()` (`src/sim/towers.ts`) applies
 * `w.derived.powerMul` to TD firing too, so no VS-only field is actually
 * TD-free once it changes kill rate. Final settings measured frost_obelisk
 * 29.9%, ballista 22.4%, ember_brazier 18.5%, mortar 16.0%, arrow_spire
 * 5.7%, venom_spore 3.1%, tesla_coil 2.4% — cap holds, gate un-skipped below.
 */

import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';
import { BUILDS, aggregateShares, collect, topTen } from '../tools/a5probe';

const SEEDS = [1, 2, 3, 4, 5];
const CAP = 0.35;

describe('G13 no tower type dominates VS damage across the winning-build pool', () => {
  const results = collect(SEEDS);
  const top = topTen(results);
  const towerKeys = new Set(loadContent().towers.towers.map((t) => t.key));
  const shares = aggregateShares(top, towerKeys);
  const readable = shares.map((s) => `${s.key} ${(s.share * 100).toFixed(1)}%`).join(', ');

  it('has enough builds banking all 18 TD waves to measure', () => {
    expect(BUILDS.length).toBeGreaterThanOrEqual(10);
    expect(top.length, readable).toBeGreaterThanOrEqual(4);
  });

  // Measured green (p10j session): frost_obelisk 29.9%, ballista 22.4%,
  // ember_brazier 18.5%, mortar 16.0%, arrow_spire 5.7%, venom_spore 3.1%,
  // tesla_coil 2.4% — see the file header for the engine-side mechanism.
  it('gives no tower type more than 35% of the winning-pool VS damage', () => {
    const worst = shares[0];
    expect(worst, readable).toBeDefined();
    expect(worst.share, readable).toBeLessThanOrEqual(CAP);
  });

  it('spreads damage across several tower types rather than one or two', () => {
    const meaningful = shares.filter((s) => s.share >= 0.05);
    expect(meaningful.length, readable).toBeGreaterThanOrEqual(3);
  });
});
