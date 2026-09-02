/**
 * q21 — level-up-offer / VS-wielding boundary fuzz (ported).
 *
 * Originally a boundary fuzz of the V2/V3 soul-weapon roster (grantWeapon/
 * levelStats/bindSouls/awakenings). SPEC-FINAL deleted that system: §6.1's
 * "every built tower type wields automatically" (src/sim/vswield.ts) and the
 * boon-only offer screen (src/sim/progression.ts) are the successors, and
 * this port retargets every original boundary category at them — see
 * `tools/fuzz-weapon-boundary.ts`'s header for the old->new mapping.
 *
 * `tools/fuzz-weapon-boundary.ts` carries the harness and its own design
 * comment. This file is the assertions: the full census against the pinned
 * recorded maps (`tests/q21-weapon-boundary-fuzz.ts`, q7's multi-const
 * idiom), named reproductions of the findings, and sanity checks that the
 * surrounding "handled correctly" cases really are.
 */
import { describe, expect, it } from 'vitest';

import { spawnEnemy } from '../src/sim/enemies';
import { applyOffer, openLevelUpIfPending, rerollOffers, rollOffers, takeOffer } from '../src/sim/progression';
import { applyCommand } from '../src/sim/run';
import type { StatKey } from '../src/sim/stats';
import { updateWieldedAttacks, wieldedAttacks } from '../src/sim/vswield';
import {
  ATTACK_TOWER_KEYS,
  ATTACKLESS_TOWER_KEYS,
  type BoundaryCase,
  boonKeyBoundaryCases,
  boonRankBoundaryCases,
  forcePlace,
  newWorld,
  pickIndexBoundaryCases,
  poolExhaustedCases,
  PROBE_BOON,
  rerollBoundaryCases,
  runCensus,
  wieldRosterCases,
  wieldTierBoundaryCases,
} from '../tools/fuzz-weapon-boundary';
import {
  BOON_KEY_HOLES,
  BOON_RANK_HOLES,
  PICK_INDEX_HOLES,
  POOL_HOLES,
  REROLL_HOLES,
  WIELD_ROSTER_HOLES,
  WIELD_TIER_HOLES,
} from './q21-weapon-boundary-fuzz';

function toHoleMap(cases: BoundaryCase[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of cases) {
    if (c.verdict !== 'ok') out[c.id] = c.verdict;
  }
  return out;
}

describe('q21 offer/wielding boundary fuzz', () => {
  it('runs 9 boonRank + 4 boonKey + 7 pickIndex + 4 reroll + 1 pool + 6 wieldTier + 6 wieldRoster cases, one each', () => {
    const census = runCensus();
    expect(census.length).toBe(37);
    expect(census.filter((c) => c.category === 'boonRank').length).toBe(9);
    expect(census.filter((c) => c.category === 'boonKey').length).toBe(4);
    expect(census.filter((c) => c.category === 'pickIndex').length).toBe(7);
    expect(census.filter((c) => c.category === 'reroll').length).toBe(4);
    expect(census.filter((c) => c.category === 'pool').length).toBe(1);
    expect(census.filter((c) => c.category === 'wieldTier').length).toBe(6);
    expect(census.filter((c) => c.category === 'wieldRoster').length).toBe(6);
    const seen = new Set(census.map((c) => `${c.category}:${c.id}`));
    expect(seen.size).toBe(census.length);
  });

  it('boon-rank census matches the recorded holes exactly', () => {
    expect(toHoleMap(boonRankBoundaryCases())).toEqual(BOON_RANK_HOLES);
  });

  it('boon-key census matches the recorded holes exactly', () => {
    expect(toHoleMap(boonKeyBoundaryCases())).toEqual(BOON_KEY_HOLES);
  });

  it('pick-index census matches the recorded holes exactly', () => {
    expect(toHoleMap(pickIndexBoundaryCases())).toEqual(PICK_INDEX_HOLES);
  });

  it('reroll census matches the recorded holes exactly', () => {
    expect(toHoleMap(rerollBoundaryCases())).toEqual(REROLL_HOLES);
  });

  it('exhausted-pool census matches the recorded holes exactly', () => {
    expect(toHoleMap(poolExhaustedCases())).toEqual(POOL_HOLES);
  });

  it('wield-tier census matches the recorded holes exactly', () => {
    expect(toHoleMap(wieldTierBoundaryCases())).toEqual(WIELD_TIER_HOLES);
  });

  it('wield-roster census matches the recorded holes exactly', () => {
    expect(toHoleMap(wieldRosterCases())).toEqual(WIELD_ROSTER_HOLES);
  });

  it('everything not in a recorded hole is cleanly ok', () => {
    for (const c of runCensus()) {
      const holes =
        c.category === 'boonRank'
          ? BOON_RANK_HOLES
          : c.category === 'boonKey'
            ? BOON_KEY_HOLES
            : c.category === 'pickIndex'
              ? PICK_INDEX_HOLES
              : c.category === 'reroll'
                ? REROLL_HOLES
                : c.category === 'pool'
                  ? POOL_HOLES
                  : c.category === 'wieldTier'
                    ? WIELD_TIER_HOLES
                    : WIELD_ROSTER_HOLES;
      if (c.id in holes) continue;
      expect(c.verdict, `${c.category}:${c.id} — ${c.detail}`).toBe('ok');
    }
  });

  /* ---------------------------------------------------- named findings */

  describe("finding CLOSED at p7a: applyOffer's 'boon' case used to store a forged toLevel with zero validation (ported q30, BACKLOG b011)", () => {
    // progression.ts's `clampRank` now runs every offer kind's `toLevel`
    // through `[1, maxRank]` (non-finite collapses to rank 1) before it is
    // stored — these cases pin the fixed behavior for exactly the forged
    // inputs the old exploit chain used.
    // fb041 (Q144(1) OVERRIDE) made `haste` (`PROBE_BOON`) one of the
    // uncapped stat boons, so `Infinity` no longer clamps to its authored
    // `maxRank: 5` — it clamps to `UNCAPPED_RANK_CEILING` (progression.ts),
    // and keeps being re-offered rather than stopping, exactly as fb041
    // intends. What still must hold, and is the point of this test post-
    // code-reviewer-finding: the store stays a *finite* integer (not
    // `Infinity` itself), so nothing downstream (`romanRank`'s numeral
    // string-building loop, most notably) ever sees an unbounded rank.
    it('toLevel=Infinity clamps to a finite ceiling, not stored as Infinity, and keeps being re-offered (uncapped)', () => {
      const w = newWorld();
      applyOffer(w, { kind: 'boon', key: PROBE_BOON, name: 'x', desc: 'x', toLevel: Infinity });
      expect(w.boonRanks[PROBE_BOON]).toBeGreaterThan(0);
      expect(Number.isFinite(w.boonRanks[PROBE_BOON])).toBe(true);
      w.phase = 'levelup';
      let reoffered = false;
      for (let i = 0; i < 25 && !reoffered; i++) {
        const offers = rollOffers(w);
        if (offers.some((o) => o.kind === 'boon' && o.key === PROBE_BOON)) reoffered = true;
      }
      expect(reoffered).toBe(true);
    });

    it('toLevel=NaN clamps to rank 1 (the non-finite fallback), and a normal weighted draw still varies', () => {
      const w = newWorld();
      applyOffer(w, { kind: 'boon', key: PROBE_BOON, name: 'x', desc: 'x', toLevel: NaN });
      expect(w.boonRanks[PROBE_BOON]).toBe(1);
      w.phase = 'levelup';
      const first = rollOffers(w).map((o) => `${o.kind}:${o.key}`);
      const second = rollOffers(w).map((o) => `${o.kind}:${o.key}`);
      // A real (non-NaN) weight lets the RNG stream actually vary the draw —
      // the old bug made every draw identical regardless of the stream.
      let sawDifference = false;
      for (let i = 0; i < 25 && !sawDifference; i++) {
        if (rollOffers(w).map((o) => `${o.kind}:${o.key}`).join(',') !== first.join(',')) sawDifference = true;
      }
      expect(second).toBeDefined();
      expect(sawDifference).toBe(true);
    });

    it('toLevel=-5 clamps to rank 1, not stored as a negative seed — no unbounded stat-stacking exploit', () => {
      const w = newWorld();
      const haste = w.content.boonByKey.get(PROBE_BOON)!;
      applyOffer(w, { kind: 'boon', key: PROBE_BOON, name: 'x', desc: 'x', toLevel: -5 });
      expect(w.boonRanks[PROBE_BOON]).toBe(1);
      let picks = 1; // the forged pick above already landed at rank 1
      for (let i = 0; i < 400 && (w.boonRanks[PROBE_BOON] ?? 0) < haste.maxRank; i++) {
        w.phase = 'levelup';
        w.offers = rollOffers(w);
        const idx = w.offers.findIndex((o) => o.kind === 'boon' && o.key === PROBE_BOON);
        if (idx < 0) continue;
        expect(takeOffer(w, idx)).toBe(true);
        picks++;
      }
      // The clean ladder from rank 1 to maxRank 5 is exactly maxRank picks —
      // no doubling from a poisoned negative seed.
      expect(picks).toBe(haste.maxRank);
      const attackSpeedTotal = w.stats.total(haste.stat as StatKey);
      expect(attackSpeedTotal).toBeCloseTo(haste.perRank * haste.maxRank, 5);
    });

    it('the legitimate case (a real boon-rank offer) applies and stays in-domain — unaffected by the fix', () => {
      const w = newWorld();
      applyOffer(w, { kind: 'boon', key: PROBE_BOON, name: 'x', desc: 'x', toLevel: 1 });
      expect(w.boonRanks[PROBE_BOON]).toBe(1);
      w.phase = 'levelup';
      expect(() => rollOffers(w)).not.toThrow();
    });

    it('rollOffers only ever emits toLevel = rank + 1, capped by maxRank, across all 3 pool families', () => {
      const w = newWorld();
      w.phase = 'levelup';
      for (let i = 0; i < 25; i++) {
        const offers = rollOffers(w);
        for (const o of offers) {
          if (o.kind === 'boon') {
            const rank = w.boonRanks[o.key] ?? 0;
            expect(o.toLevel).toBe(rank + 1);
            expect(o.toLevel).toBeLessThanOrEqual(w.content.boonByKey.get(o.key)!.maxRank);
          } else if (o.kind === 'type_mastery') {
            const rank = w.typeMasteryRanks[o.key] ?? 0;
            expect(o.toLevel).toBe(rank + 1);
            expect(o.toLevel).toBeLessThanOrEqual(w.content.boons.typeMastery.maxRank);
          } else {
            const rank = w.skillCardRanks[o.key] ?? 0;
            expect(o.toLevel).toBe(rank + 1);
            expect(o.toLevel).toBeLessThanOrEqual(w.content.skillCardByKey.get(o.key)!.maxRank);
          }
        }
      }
    });
  });

  describe("finding: takeOffer's index domain — every out-of-range 'pick' payload is rejected without a state change", () => {
    // The 'pick' Command's payload lands in `takeOffer(w, index)` unchecked;
    // `w.offers[index]` (undefined for -1, past-end, NaN, fractional,
    // Infinity) is the only gate — and it holds. Driven through the real
    // `applyCommand` surface, the same way a forged input log would arrive.
    it.each([[-1], [3], [100], [NaN], [0.5], [Infinity]])('pick index=%p is a no-op', (index) => {
      const w = newWorld();
      w.phase = 'levelup';
      w.offers = rollOffers(w);
      expect(w.offers.length).toBe(3);
      applyCommand(w, { k: 'pick', index });
      expect(w.phase).toBe('levelup');
      expect(w.offers.length).toBe(3);
      expect(Object.keys(w.boonRanks)).toEqual([]);
    });

    it('positive control: a legal pick applies its offer and returns to act2', () => {
      const w = newWorld();
      w.phase = 'levelup';
      w.offers = rollOffers(w);
      const chosen = w.offers[0];
      applyCommand(w, { k: 'pick', index: 0 });
      expect(w.phase).toBe('act2');
      expect(w.boonRanks[chosen.key]).toBe(chosen.toLevel);
    });
  });

  describe('finding: the reroll counter holds at its real ends but a corrupted counter grants unlimited rerolls', () => {
    it('exactly rerollsPerLevel rerolls are granted per level-up, then the guard closes', () => {
      const w = newWorld();
      w.phase = 'act2';
      w.pendingLevelUps = 1;
      openLevelUpIfPending(w);
      expect(w.phase).toBe('levelup');
      expect(w.rerollsLeft).toBe(w.content.boons.rerollsPerLevel);
      for (let i = 0; i < w.content.boons.rerollsPerLevel; i++) expect(rerollOffers(w)).toBe(true);
      expect(rerollOffers(w)).toBe(false);
      expect(w.rerollsLeft).toBe(0);
    });

    it('a reroll outside the levelup phase is refused', () => {
      const w = newWorld();
      w.rerollsLeft = 3;
      expect(rerollOffers(w)).toBe(false); // phase is act1_build
    });

    it('rerollsLeft=NaN: CLOSED at b010 — the guard now finite-checks rerollsLeft, 0/10 forged rerolls accepted', () => {
      // Defense-in-depth: the counter is only ever written from
      // `content.boons.rerollsPerLevel`, so this needs corrupted World
      // state, not a live Command exploit — same caveat as the forged-offer
      // holes. Before b010, `NaN <= 0` being `false` let the phase-and-
      // counter guard pass forever (`NaN - 1` never reaches 0 either), so a
      // corrupted counter granted unlimited rerolls. `rerollOffers`
      // (`src/sim/progression.ts`) now also rejects a non-finite
      // `rerollsLeft` as a clean no-op.
      const w = newWorld();
      w.phase = 'levelup';
      w.offers = rollOffers(w);
      w.rerollsLeft = NaN;
      for (let i = 0; i < 10; i++) expect(rerollOffers(w)).toBe(false);
      expect(w.rerollsLeft).toBeNaN(); // rejected outright, never decremented
    });
  });

  describe('finding: an exhausted level-up pool used to softlock the levelup phase — CLOSED at p9e (G18)', () => {
    // With every stat boon and every one of the run class's 3 skill cards at
    // maxRank (Type Mastery never contributes here — no tower is ever built
    // in this probe), buildOfferPool used to be empty. openLevelUpIfPending's
    // manual branch used to still enter 'levelup' with offers = [] regardless
    // — a permanent softlock, since takeOffer finds no offer at any index and
    // rerollOffers "succeeds" into another empty list. p9e made the manual
    // branch mirror the autopick branch's own pre-existing empty-pool guard:
    // an exhausted pool now just consumes the pending level-up in place,
    // same as "b011 closed" below documents for the boon-rank holes.
    //
    // fb041 (Q144(1) OVERRIDE) made "every stat boon at maxRank" no longer
    // mean "no stat boon is offered" — they're uncapped now, so real content
    // can never actually exhaust `buildOfferPool` on its own (a class always
    // has 7 stat boons to keep offering). The guard this describe block
    // exists for is still real — it is just no longer reachable through real
    // `/data`, only through a deliberately emptied pool — so the two
    // dead-end tests below force that directly by emptying
    // `w.content.boons.statBoons` (restored in `finally`, since `w.content`
    // is `loadContent()`'s process-wide memoised object — see
    // `tests/p9e-levelup-idle.test.ts` for the same pattern), and a new first
    // test pins the fb041 behavior itself: real-content maxing no longer
    // triggers the guard at all.
    function maxAllBoons(w: ReturnType<typeof newWorld>): void {
      for (const b of w.content.boons.statBoons) {
        for (let rank = 1; rank <= b.maxRank; rank++) {
          applyOffer(w, { kind: 'boon', key: b.key, name: 'x', desc: 'x', toLevel: rank });
        }
      }
      for (const card of w.content.boons.skillCards[w.cfg.classKey] ?? []) {
        for (let rank = 1; rank <= card.maxRank; rank++) {
          applyOffer(w, { kind: 'skill_card', key: card.key, name: 'x', desc: 'x', toLevel: rank });
        }
      }
    }

    /** Empties the real stat-boon pool and restores it after `fn`, the only
     * way left (fb041) to construct a genuinely exhausted offer pool. */
    function withEmptyStatBoons(w: ReturnType<typeof newWorld>, fn: () => void): void {
      const real = w.content.boons.statBoons;
      w.content.boons.statBoons = [];
      try {
        fn();
      } finally {
        w.content.boons.statBoons = real;
      }
    }

    it('fb041: maxing every family via real content no longer exhausts the pool — stat boons stay uncapped', () => {
      const w = newWorld();
      maxAllBoons(w);
      w.phase = 'act2';
      w.pendingLevelUps = 1;
      openLevelUpIfPending(w);
      expect(w.phase).toBe('levelup');
      expect(w.offers.length).toBeGreaterThan(0);
      expect(w.offers.every((o) => o.kind === 'boon')).toBe(true);
    });

    it('openLevelUpIfPending no longer enters levelup with zero offers — it consumes the pending level-up and stays in act2', () => {
      const w = newWorld();
      withEmptyStatBoons(w, () => {
        maxAllBoons(w);
        w.phase = 'act2';
        w.pendingLevelUps = 1;
        openLevelUpIfPending(w);
        expect(w.phase).toBe('act2');
        expect(w.pendingLevelUps).toBe(0);
        expect(w.offers).toEqual([]);
      });
    });

    it('never sits in the phase in the first place, so pick/reroll have nothing to escape', () => {
      const w = newWorld();
      withEmptyStatBoons(w, () => {
        maxAllBoons(w);
        w.phase = 'act2';
        w.pendingLevelUps = 1;
        openLevelUpIfPending(w);
        expect(w.phase).toBe('act2');
        for (const index of [0, 1, 2]) applyCommand(w, { k: 'pick', index });
        expect(w.phase).toBe('act2');
        applyCommand(w, { k: 'reroll' });
        expect(w.phase).toBe('act2');
      });
    });

    it('negative control: stat boons alone (not emptied) are enough to keep the pool open, so the guard needs every family gone', () => {
      const w = newWorld();
      // Only the stat-boon family is emptied by maxAllBoons/withEmptyStatBoons
      // in the tests above; here nothing is emptied at all, so even with
      // every skill card at max the 7 stat boons alone still offer.
      for (const card of w.content.boons.skillCards[w.cfg.classKey] ?? []) {
        for (let rank = 1; rank <= card.maxRank; rank++) {
          applyOffer(w, { kind: 'skill_card', key: card.key, name: 'x', desc: 'x', toLevel: rank });
        }
      }
      w.phase = 'act2';
      w.pendingLevelUps = 1;
      openLevelUpIfPending(w);
      expect(w.phase).toBe('levelup');
      expect(w.offers.length).toBeGreaterThan(0);
      expect(w.offers.every((o) => o.kind === 'boon')).toBe(true);
      applyCommand(w, { k: 'pick', index: 0 });
      expect(w.phase).toBe('act2'); // escape works while any offer exists
    });
  });

  describe('finding CLOSED at b008: a NaN Structure.tier makes the wielded damage NaN, but damageEnemy now drops non-finite damage instead of corrupting hp/damageTotal', () => {
    // §6.1's formula reads tier through upgradeStatMul's
    // `Math.max(0, Math.min(level, maxLevel) - 1)` clamp, which propagates
    // NaN (`Math.pow(mul, NaN)` is NaN) exactly the way the deleted
    // `soulLevelFor` clamp did. The NaN damage never crashes — it is never
    // an array index — but it used to defeat `damageEnemy`'s
    // `e.dead || amount <= 0` guard (`NaN <= 0` is false), setting `e.hp` to
    // NaN forever (`hp <= 0` also always false from then on — permanently
    // immortal) and poisoning `w.damageTotal`/`damageByWeapon` for the rest
    // of the run. b008 added a `!Number.isFinite(amount)` clause to that
    // guard (enemies.ts), so the non-finite hit is now dropped at the choke
    // point instead of ever reaching `e.hp -=`. Not reachable through the
    // real Command surface: buildTower/upgradeTower only ever produce
    // integer tiers.
    it('tier=NaN: wielded damage is NaN, but damageEnemy drops it — hp and damageTotal stay clean across repeated ticks', () => {
      const w = newWorld();
      forcePlace(w, 'arrow_spire', 5, 5, NaN);
      const [arrow] = wieldedAttacks(w);
      expect(arrow.damage).toBeNaN();
      const e = spawnEnemy(w, 'husk', w.warden.x + 1, w.warden.y, { overlay: false })!;
      w.rebuildBuckets();
      const hpBefore = e.hp;
      updateWieldedAttacks(w, 1 / 60);
      expect(e.hp).toBe(hpBefore);
      expect(e.dead).toBe(false);
      expect(w.damageTotal).toBe(0);
      updateWieldedAttacks(w, 1 / 60);
      expect(e.hp).toBe(hpBefore);
      expect(w.damageTotal).toBe(0);
    });

    it('every tier the real build/upgrade path could approach clamps cleanly: 0, negative, absurdly high', () => {
      const content = newWorld().content;
      const def = content.towerByKey.get('arrow_spire')!;
      for (const tier of [0, -5, 1e9]) {
        const w = newWorld(content);
        forcePlace(w, 'arrow_spire', 5, 5, tier);
        const [arrow] = wieldedAttacks(w);
        expect(Number.isFinite(arrow.damage), `tier=${tier}`).toBe(true);
        // One tower: damage = per-tower value x 1.1, and the per-tower value
        // stays inside the [tier 1, tier maxLevel] stat track.
        const lo = def.attack!.damage * 1.1;
        const hi = def.attack!.damage * Math.pow(content.towers.upgradeStepMul, def.upgrades.count) * 1.1;
        expect(arrow.damage, `tier=${tier}`).toBeGreaterThanOrEqual(lo - 1e-9);
        expect(arrow.damage, `tier=${tier}`).toBeLessThanOrEqual(hi + 1e-9);
      }
    });
  });

  /* ------------------------------------------------- roster invariants */

  describe('§6.1 roster invariants hold at every boundary (ported souls-vs-slots census)', () => {
    it('duplicates of one type collapse into a single averaged entry — the ported duplicate-key check (q32)', () => {
      const w = newWorld();
      for (let i = 0; i < 5; i++) forcePlace(w, 'arrow_spire', 4 + i, 4, 1);
      const list = wieldedAttacks(w);
      expect(list.length).toBe(1);
      expect(list[0].count).toBe(5);
      const base = w.content.towerByKey.get('arrow_spire')!.attack!.damage;
      expect(list[0].damage).toBeCloseTo(base * (1 + 0.1 * 5), 9);
    });

    it('attackless types (wall, totem, sprout) wield nothing, alone or alongside attackers', () => {
      const w = newWorld();
      ATTACKLESS_TOWER_KEYS.forEach((k, i) => forcePlace(w, k, 4 + i, 4, 1));
      expect(wieldedAttacks(w)).toEqual([]);
      forcePlace(w, 'arrow_spire', 4, 6, 1);
      const list = wieldedAttacks(w);
      expect(list.map((a) => a.towerKey)).toEqual(['arrow_spire']);
    });

    it('all 7 attack-bearing types wield exactly one finite entry each', () => {
      const w = newWorld();
      ATTACK_TOWER_KEYS.forEach((k, i) => forcePlace(w, k, 4 + i, 4, 1));
      const list = wieldedAttacks(w);
      expect(list.map((a) => a.towerKey).sort()).toEqual([...ATTACK_TOWER_KEYS].sort());
      for (const a of list) {
        expect(Number.isFinite(a.damage)).toBe(true);
        expect(a.damage).toBeGreaterThan(0);
        expect(a.interval).toBeGreaterThan(0);
        expect(a.count).toBe(1);
      }
    });
  });
});
