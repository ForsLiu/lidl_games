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
import { Hasher } from '../src/sim/hash';
import { applyOffer, openLevelUpIfPending, rerollOffers, rollOffers, takeOffer } from '../src/sim/progression';
import { applyCommand, hashWorld } from '../src/sim/run';
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

  describe("finding: applyOffer's 'boon' case stores a forged toLevel with zero validation (ported q30)", () => {
    // progression.ts:148-158: `w.boonRanks[b.key] = offer.toLevel` — no
    // clamp, no integer check, no finite check. The measured consequence
    // splits by what `buildOfferPool`'s `rank >= b.maxRank` re-offer cap
    // (progression.ts:109) does with the poisoned value when it reads it
    // back.
    it('toLevel=Infinity: stored illegally, but buildOfferPool legitimately excludes it — Infinity >= maxRank is sound', () => {
      const w = newWorld();
      applyOffer(w, { kind: 'boon', key: PROBE_BOON, name: 'x', desc: 'x', toLevel: Infinity });
      expect(w.boonRanks[PROBE_BOON]).toBe(Infinity);
      w.phase = 'levelup';
      for (let i = 0; i < 25; i++) {
        const offers = rollOffers(w);
        expect(offers.some((o) => o.kind === 'boon' && o.key === PROBE_BOON)).toBe(false);
      }
    });

    it('toLevel=Infinity: hashWorld distinguishes it from a legitimately-maxed boon, but only because 0 is unreachable, not because Infinity has a distinct hash contribution', () => {
      // hash.ts:12-20's Hasher.int(v) does `v | 0` (JS ToInt32), which
      // coerces NaN, +Infinity, -Infinity AND an explicit 0 to the IDENTICAL
      // hash contribution — measured directly here, not assumed. hashWorld
      // (run.ts:903-904) hashes boonRanks through h.int, so it only "sees"
      // the Infinity poisoning because no legitimate applyOffer call ever
      // stores 0 in boonRanks (every real offer is rank + 1 >= 1) — the
      // poisoned state collides with an unreachable rank, not with anything
      // a real run could produce.
      const legit = newWorld();
      applyOffer(legit, { kind: 'boon', key: PROBE_BOON, name: 'x', desc: 'x', toLevel: 5 }); // legitimate max rank
      const poisoned = newWorld();
      applyOffer(poisoned, { kind: 'boon', key: PROBE_BOON, name: 'x', desc: 'x', toLevel: Infinity });
      expect(hashWorld(legit)).not.toBe(hashWorld(poisoned));

      const h = new Hasher();
      h.str(PROBE_BOON).int(Infinity);
      const hZero = new Hasher();
      hZero.str(PROBE_BOON).int(0);
      expect(h.value).toBe(hZero.value); // the actual collision this claim rests on
    });

    it("toLevel=NaN: stored illegally, and defeats the ENTIRE draw's weighting, not just its own re-offer cap", () => {
      // NaN >= maxRank is false, so the offer stays in the pool with a NaN
      // rollOffers weight (`8 * (1 + luckBias * NaN)`, progression.ts:89).
      // Rng.weightedIndex (rng.ts:65-75) sums weights into a NaN total,
      // which makes every `r < 0` scan comparison false and falls through to
      // `return weights.length - 1` — deterministically the LAST remaining
      // pool entry, every draw, regardless of the RNG stream. The poisoned
      // boon happens not to be last in this content's pool order, so it
      // never surfaces — but every other offer in the same call is no longer
      // a fair weighted pick either, proven here by the draw becoming fully
      // reproducible across repeated calls that would otherwise advance the
      // RNG stream and vary the result.
      const w = newWorld();
      applyOffer(w, { kind: 'boon', key: PROBE_BOON, name: 'x', desc: 'x', toLevel: NaN });
      expect(w.boonRanks[PROBE_BOON]).toBeNaN();
      w.phase = 'levelup';
      const first = rollOffers(w).map((o) => `${o.kind}:${o.key}`);
      const second = rollOffers(w).map((o) => `${o.kind}:${o.key}`);
      expect(second).toEqual(first); // a fair weighted draw would vary as the RNG stream advances
      expect(first.includes(`boon:${PROBE_BOON}`)).toBe(false);
    });

    it('toLevel=-5: stored illegally, and the boon keeps re-surfacing — a real, unbounded stat-stacking exploit', () => {
      // -5 >= maxRank is false, but -5 / maxRank is finite, so the weight
      // stays finite and the draw's fairness is undisturbed: the corrupted
      // boon keeps winning a real share of draws. Each re-pick re-runs
      // `stats.addAll('boon:haste', ...)` (progression.ts:154), which sums
      // under the same source key with no cap of its own — so climbing the
      // ladder back from -5 stacks perRank far past what maxRank allows.
      // The re-picks below go through the REAL surface (rollOffers ->
      // takeOffer with the rolled offer's own index), not hand-built offers.
      const w = newWorld();
      const haste = w.content.boonByKey.get(PROBE_BOON)!;
      applyOffer(w, { kind: 'boon', key: PROBE_BOON, name: 'x', desc: 'x', toLevel: -5 });
      expect(w.boonRanks[PROBE_BOON]).toBe(-5);
      let picks = 0;
      for (let i = 0; i < 400 && (w.boonRanks[PROBE_BOON] ?? 0) < haste.maxRank; i++) {
        w.phase = 'levelup';
        w.offers = rollOffers(w);
        const idx = w.offers.findIndex((o) => o.kind === 'boon' && o.key === PROBE_BOON);
        if (idx < 0) continue;
        expect(takeOffer(w, idx)).toBe(true);
        picks++;
      }
      // The full ladder back from -5 to maxRank 5 is 10 legitimate-looking
      // picks — double what a clean run could ever grant.
      expect(picks).toBe(2 * haste.maxRank);
      const attackSpeedTotal = w.stats.total(haste.stat as StatKey);
      // One addAll per applyOffer call: the forged -5 seed plus each re-pick.
      expect(attackSpeedTotal).toBeCloseTo(haste.perRank * (picks + 1), 5);
      expect(attackSpeedTotal).toBeGreaterThan(haste.perRank * haste.maxRank);
    });

    it('the legitimate case (a real boon-rank offer) applies and stays in-domain — this is not a general applyOffer failure', () => {
      const w = newWorld();
      applyOffer(w, { kind: 'boon', key: PROBE_BOON, name: 'x', desc: 'x', toLevel: 1 });
      expect(w.boonRanks[PROBE_BOON]).toBe(1);
      w.phase = 'levelup';
      expect(() => rollOffers(w)).not.toThrow();
    });

    it('not reachable through the real Command surface: rollOffers only ever emits toLevel = rank + 1, capped by maxRank', () => {
      const w = newWorld();
      w.phase = 'levelup';
      for (let i = 0; i < 25; i++) {
        const offers = rollOffers(w);
        for (const o of offers) {
          expect(o.kind).toBe('boon');
          const rank = w.boonRanks[o.key] ?? 0;
          expect(o.toLevel).toBe(rank + 1);
          expect(o.toLevel).toBeLessThanOrEqual(w.content.boonByKey.get(o.key)!.maxRank);
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

    it('rerollsLeft=NaN: NaN <= 0 is false, so the guard passes forever — 10/10 forged rerolls accepted', () => {
      // Defense-in-depth: the counter is only ever written from
      // `content.boons.rerollsPerLevel`, so this needs corrupted World
      // state, not a live Command exploit — same caveat as the forged-offer
      // holes.
      const w = newWorld();
      w.phase = 'levelup';
      w.offers = rollOffers(w);
      w.rerollsLeft = NaN;
      for (let i = 0; i < 10; i++) expect(rerollOffers(w)).toBe(true);
      expect(w.rerollsLeft).toBeNaN(); // NaN - 1 never reaches the guard
    });
  });

  describe('finding: an exhausted boon pool softlocks the levelup phase — reachable through legitimate play (sim bug, pinned not fixed)', () => {
    // With all 12 boons at maxRank (level 57+: 11 x 5 ranks + Second Wind's
    // 1), buildOfferPool is empty, yet openLevelUpIfPending
    // (progression.ts:30-36) still enters 'levelup' with offers = [].
    // takeOffer finds no offer at any index; rerollOffers "succeeds" into
    // another empty list; nothing on the Command surface leaves the phase.
    function maxAllBoons(w: ReturnType<typeof newWorld>): void {
      for (const b of w.content.boons.boons) {
        for (let rank = 1; rank <= b.maxRank; rank++) {
          applyOffer(w, { kind: 'boon', key: b.key, name: 'x', desc: 'x', toLevel: rank });
        }
      }
    }

    it('openLevelUpIfPending enters levelup with zero offers', () => {
      const w = newWorld();
      maxAllBoons(w);
      w.phase = 'act2';
      w.pendingLevelUps = 1;
      openLevelUpIfPending(w);
      expect(w.phase).toBe('levelup');
      expect(w.offers).toEqual([]);
    });

    it('no pick and no reroll can leave the phase', () => {
      const w = newWorld();
      maxAllBoons(w);
      w.phase = 'act2';
      w.pendingLevelUps = 1;
      openLevelUpIfPending(w);
      for (const index of [0, 1, 2]) applyCommand(w, { k: 'pick', index });
      expect(w.phase).toBe('levelup');
      applyCommand(w, { k: 'reroll' }); // spends the reroll on another empty list
      expect(w.offers).toEqual([]);
      for (const index of [0, 1, 2]) applyCommand(w, { k: 'pick', index });
      expect(w.phase).toBe('levelup'); // softlocked
    });

    it('negative control: one boon short of the cap still offers it, so the lock needs the full cap', () => {
      const w = newWorld();
      maxAllBoons(w);
      const power = w.content.boonByKey.get('power')!;
      w.boonRanks.power = power.maxRank - 1;
      w.phase = 'act2';
      w.pendingLevelUps = 1;
      openLevelUpIfPending(w);
      expect(w.phase).toBe('levelup');
      expect(w.offers.length).toBeGreaterThan(0);
      expect(w.offers.every((o) => o.key === 'power')).toBe(true);
      applyCommand(w, { k: 'pick', index: 0 });
      expect(w.phase).toBe('act2'); // escape works while any offer exists
    });
  });

  describe('finding: a NaN Structure.tier makes the wielded damage NaN, leaving the enemy immortal and damageTotal NaN (ported inheritance + damageBonus findings)', () => {
    // §6.1's formula reads tier through upgradeStatMul's
    // `Math.max(0, Math.min(level, maxLevel) - 1)` clamp, which propagates
    // NaN (`Math.pow(mul, NaN)` is NaN) exactly the way the deleted
    // `soulLevelFor` clamp did. The NaN damage never crashes — it is never
    // an array index — and `damageEnemy`'s `e.dead || amount <= 0` guard
    // (enemies.ts:219) does not catch NaN (`NaN <= 0` is false), so
    // `e.hp -= NaN` sets hp to NaN forever: `hp <= 0` is also always false
    // from then on, the enemy can never die again, and `w.damageTotal` goes
    // NaN for the rest of the run. Not reachable through the real Command
    // surface: buildTower/upgradeTower only ever produce integer tiers.
    it('tier=NaN: wielded damage is NaN, one tick corrupts hp and damageTotal, a second tick cannot recover it', () => {
      const w = newWorld();
      forcePlace(w, 'arrow_spire', 5, 5, NaN);
      const [arrow] = wieldedAttacks(w);
      expect(arrow.damage).toBeNaN();
      const e = spawnEnemy(w, 'husk', w.warden.x + 1, w.warden.y, { overlay: false })!;
      w.rebuildBuckets();
      updateWieldedAttacks(w, 1 / 60);
      expect(e.hp).toBeNaN();
      expect(e.dead).toBe(false); // NaN <= 0 is false: it can never die again
      expect(w.damageTotal).toBeNaN();
      updateWieldedAttacks(w, 1 / 60);
      expect(e.hp).toBeNaN();
      expect(e.dead).toBe(false);
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
