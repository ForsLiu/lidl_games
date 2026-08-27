/**
 * q21 — soul-weapon boundary fuzz (BACKLOG-QUALITY.md: PROGRESS.md's P5 audit
 * line names the shipped soul-weapon system — `data/weapons.json`'s 6-level
 * tracks, 6 slots, `src/sim/progression.ts`'s inheritance formula — as never
 * fuzzed at its boundaries).
 *
 * `tools/fuzz-weapon-boundary.ts` carries the harness and its own design
 * comment (why three categories, why `forcePlace`, why the Awakening gate is
 * probed via the real exported `applyOffer` rather than a re-derived copy of
 * the private offer-pool predicate). This file is the assertions: the full
 * census against three pinned recorded maps
 * (`tests/q21-weapon-boundary-fuzz.ts`, q7's multi-const idiom), named
 * reproductions of the three findings, and sanity checks that the
 * surrounding "handled correctly" cases really are.
 */
import { describe, expect, it } from 'vitest';

import { applyOffer, bindSouls, deriveSouls, rollOffers } from '../src/sim/progression';
import { hashWorld } from '../src/sim/run';
import { beginSoulPick } from '../src/sim/sundering';
import { grantWeapon, levelStats, updateWeapons } from '../src/sim/weapons';
import {
  AWAKENING_BOON,
  AWAKENING_KEY,
  AWAKENING_WEAPON,
  type BoundaryCase,
  awakeningGateCases,
  forcePlace,
  inheritanceCases,
  levelBoundaryCases,
  newWorld,
  runCensus,
  WEAPON_OFFER_TARGET,
  weaponOfferBoundaryCases,
  WEAPON_UPDATE_TARGET,
  weaponUpdateBoundaryCases,
} from '../tools/fuzz-weapon-boundary';
import {
  AWAKENING_GATE_HOLES,
  INHERITANCE_HOLES,
  LEVEL_BOUNDARY_HOLES,
  WEAPON_OFFER_HOLES,
  WEAPON_UPDATE_HOLES,
} from './q21-weapon-boundary-fuzz';

function toHoleMap(cases: BoundaryCase[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of cases) {
    if (c.verdict !== 'ok') out[c.id] = c.verdict;
  }
  return out;
}

describe('q21 soul-weapon boundary fuzz', () => {
  it('runs 9 level + 12 inheritance + 4 awakening + 2 weaponOffer + 9 weaponUpdate cases, one each', () => {
    const census = runCensus();
    expect(census.length).toBe(36);
    expect(census.filter((c) => c.category === 'level').length).toBe(9);
    expect(census.filter((c) => c.category === 'inheritance').length).toBe(12);
    expect(census.filter((c) => c.category === 'awakening').length).toBe(4);
    expect(census.filter((c) => c.category === 'weaponOffer').length).toBe(2);
    expect(census.filter((c) => c.category === 'weaponUpdate').length).toBe(9);
    const seen = new Set(census.map((c) => `${c.category}:${c.id}`));
    expect(seen.size).toBe(census.length);
  });

  it('level-boundary census matches the recorded holes exactly', () => {
    expect(toHoleMap(levelBoundaryCases())).toEqual(LEVEL_BOUNDARY_HOLES);
  });

  it('inheritance census matches the recorded holes exactly', () => {
    expect(toHoleMap(inheritanceCases())).toEqual(INHERITANCE_HOLES);
  });

  it('awakening-gate census matches the recorded holes exactly', () => {
    expect(toHoleMap(awakeningGateCases())).toEqual(AWAKENING_GATE_HOLES);
  });

  it('weapon-offer census matches the recorded holes exactly', () => {
    expect(toHoleMap(weaponOfferBoundaryCases())).toEqual(WEAPON_OFFER_HOLES);
  });

  it('weapon-update census matches the recorded holes exactly', () => {
    expect(toHoleMap(weaponUpdateBoundaryCases())).toEqual(WEAPON_UPDATE_HOLES);
  });

  it('everything not in a recorded hole is cleanly ok', () => {
    for (const c of runCensus()) {
      const holes =
        c.category === 'level'
          ? LEVEL_BOUNDARY_HOLES
          : c.category === 'inheritance'
            ? INHERITANCE_HOLES
            : c.category === 'awakening'
              ? AWAKENING_GATE_HOLES
              : c.category === 'weaponOffer'
                ? WEAPON_OFFER_HOLES
                : WEAPON_UPDATE_HOLES;
      if (c.id in holes) continue;
      expect(c.verdict, `${c.category}:${c.id} — ${c.detail}`).toBe('ok');
    }
  });

  /* ---------------------------------------------------- named findings */

  describe('finding: a non-finite or non-integer weapon level crashes the live fire loop', () => {
    // `grantWeapon`/`levelStats` (src/sim/weapons.ts) clamp with
    // `Math.max(1, Math.min(top, level))`, which propagates NaN rather than
    // rejecting it, and clamp to a value that need not be an integer array
    // index. `def.levels[lv - 1]` then misses, `levelStats` returns
    // `undefined`, and every `def.kind` branch in `fireWeapon` dereferences
    // it unconditionally on the very next tick.
    it('level=NaN: grantWeapon stores NaN, the next tick throws', () => {
      const w = newWorld();
      const ws = grantWeapon(w, 'flame_cone', NaN, 0);
      expect(ws.level).toBeNaN();
      expect(() => updateWeapons(w, 1 / 60)).toThrow(/reading 'range'/);
    });

    it('level=2.5 (fractional): grantWeapon stores the fraction, the next tick throws', () => {
      const w = newWorld();
      const ws = grantWeapon(w, 'flame_cone', 2.5, 0);
      expect(ws.level).toBe(2.5);
      expect(() => updateWeapons(w, 1 / 60)).toThrow(/reading 'range'/);
    });

    it('the clamp does hold at every real boundary: 0/negative/-Infinity -> 1, 7/Infinity -> 6', () => {
      for (const [input, expected] of [
        [0, 1],
        [-1, 1],
        [-Infinity, 1],
        [7, 6],
        [Infinity, 6],
      ] as const) {
        const w = newWorld();
        const ws = grantWeapon(w, 'flame_cone', input, 0);
        expect(ws.level, `grantWeapon(level=${input})`).toBe(expected);
        expect(() => updateWeapons(w, 1 / 60)).not.toThrow();
      }
    });
  });

  describe('finding: a corrupted Structure.tier propagates NaN through soul inheritance into the same crash', () => {
    // `soulLevelFor`'s `Math.round(progress * (top - 1))` is exposed to the
    // same NaN-propagation gap once `progress` itself is NaN, and
    // `deriveSouls`/`bindSouls` carry the result straight into a granted
    // `WeaponState.level` with no check in between.
    it('Structure.tier=NaN -> deriveSouls levels it NaN -> bindSouls grants NaN -> the next tick throws', () => {
      const w = newWorld();
      forcePlace(w, 'ember_brazier', 5, 5, NaN);
      const souls = deriveSouls(w);
      expect(souls).toHaveLength(1);
      expect(souls[0].level).toBeNaN();
      expect(() => updateWeapons(w, 1 / 60)).not.toThrow(); // nothing bound yet
      bindSouls(w, souls.map((s) => s.key));
      const ws = w.weapons.find((x) => x.key === 'flame_cone');
      expect(ws?.level).toBeNaN();
      expect(() => updateWeapons(w, 1 / 60)).toThrow(/reading 'range'/);
    });

    it('every real tier the loader/upgrade path can produce clamps cleanly: 0, negative, absurdly high', () => {
      for (const tier of [0, -5, 1e9]) {
        const w = newWorld();
        forcePlace(w, 'ember_brazier', 5, 5, tier);
        const souls = deriveSouls(w);
        expect(souls[0].level, `tier=${tier}`).toBeGreaterThanOrEqual(1);
        expect(souls[0].level, `tier=${tier}`).toBeLessThanOrEqual(3); // inheritMaxLevel
      }
    });
  });

  describe('finding: applyOffer applies an Awakening whose weapon level or boon rank does not meet the gate', () => {
    // The gate is real at offer *generation* time (the private
    // `buildOfferPool`, progression.ts:143-153 checks `ws.level >= maxLevel`
    // and `boonRanks[boon] >= boonRank`) but `applyOffer`'s `'awakening'`
    // case (progression.ts:198-207) only checks the weapon exists — it
    // trusts the offer was legitimately generated rather than re-verifying.
    it.each([
      { level: 6, rank: 0, label: 'level met, rank not' },
      { level: 1, rank: 3, label: 'rank met, level not' },
      { level: 1, rank: 0, label: 'neither met' },
    ])('$label: applyOffer still sets awakened=true', ({ level, rank }) => {
      const w = newWorld();
      const ws = grantWeapon(w, AWAKENING_WEAPON, level, 0);
      w.boonRanks[AWAKENING_BOON] = rank;
      applyOffer(w, { kind: 'awakening', key: AWAKENING_KEY, name: 'x', desc: 'x', toLevel: 1 });
      expect(ws.awakened).toBe(true);
    });

    it('the legitimate case (both met) also applies — this is not a general applyOffer failure', () => {
      const w = newWorld();
      const ws = grantWeapon(w, AWAKENING_WEAPON, 6, 0);
      w.boonRanks[AWAKENING_BOON] = 3;
      applyOffer(w, { kind: 'awakening', key: AWAKENING_KEY, name: 'x', desc: 'x', toLevel: 1 });
      expect(ws.awakened).toBe(true);
    });

    it('not reachable through the real Command surface: rollOffers never generates the offer when the gate is unmet', () => {
      // Negative control on the actual player-facing path, so the "ungated"
      // verdict above reads as a defense-in-depth gap and not a live
      // exploit. `takeOffer` only ever plays back `w.offers[index]`, and
      // `w.offers` is populated exclusively by `rollOffers`. The gate check
      // inside `buildOfferPool` is a plain field comparison with no RNG
      // involved — looping here doesn't add independent trials of the gate
      // itself (one call already proves it), only exercises it across
      // several draws of `w.rng.offers`'s advancing stream, for the same
      // reason the positive control below needs several draws: `rollOffers`
      // only returns 3 of the pool per call.
      const w = newWorld();
      grantWeapon(w, AWAKENING_WEAPON, 1, 0); // level not met
      w.boonRanks[AWAKENING_BOON] = 0; // rank not met
      w.phase = 'levelup';
      for (let i = 0; i < 25; i++) {
        const offers = rollOffers(w);
        expect(offers.some((o) => o.kind === 'awakening' && o.key === AWAKENING_KEY)).toBe(false);
      }
    });

    it('positive control: once the gate is met, the offer really does surface — not just theoretically eligible', () => {
      // Unlike the negative control, repetition matters here: `rollOffers`
      // samples only 3 of the pool per call via `w.rng.offers`'s weighted
      // draw, so a single call could legitimately miss the awakening even
      // when eligible. This proves `buildOfferPool` really includes it *and*
      // its weight (30, the highest in the pool) is enough to surface within
      // a small number of level-ups, not just present-but-unreachable.
      const w = newWorld();
      grantWeapon(w, AWAKENING_WEAPON, 6, 0); // level met
      w.boonRanks[AWAKENING_BOON] = 3; // rank met
      w.phase = 'levelup';
      let seen = false;
      for (let i = 0; i < 25 && !seen; i++) {
        const offers = rollOffers(w);
        seen = offers.some((o) => o.kind === 'awakening' && o.key === AWAKENING_KEY);
      }
      expect(seen).toBe(true);
    });
  });

  describe("finding: applyOffer's 'weapon' case stores a forged toLevel with only an upper-bound clamp", () => {
    // progression.ts:182-186: `ws.level = Math.min(maxLevel, offer.toLevel)`
    // clamps the top of the track but never re-validates the result, unlike
    // `grantWeapon`'s own create-branch clamp
    // (`Math.max(1, Math.min(maxLevel, level))`). The same "trusts the
    // offer's origin" shape as the Awakening gate above, on a different
    // field.
    it('toLevel=NaN: applyOffer stores NaN, the next tick throws', () => {
      const w = newWorld();
      const ws = grantWeapon(w, WEAPON_OFFER_TARGET, 3, 0);
      applyOffer(w, { kind: 'weapon', key: WEAPON_OFFER_TARGET, name: 'x', desc: 'x', toLevel: NaN });
      expect(ws.level).toBeNaN();
      expect(() => updateWeapons(w, 1 / 60)).toThrow(/reading 'range'/);
    });

    it('toLevel=-5: applyOffer stores the negative value, but is latent — levelStats re-floors it on every read', () => {
      const w = newWorld();
      const ws = grantWeapon(w, WEAPON_OFFER_TARGET, 3, 0);
      applyOffer(w, { kind: 'weapon', key: WEAPON_OFFER_TARGET, name: 'x', desc: 'x', toLevel: -5 });
      expect(ws.level).toBe(-5);
      expect(() => updateWeapons(w, 1 / 60)).not.toThrow();
      expect(levelStats(w, ws)).toBe(w.content.weaponByKey.get(WEAPON_OFFER_TARGET)!.levels[0]);
    });

    it('the legitimate case (a real level-up offer) also applies — this is not a general applyOffer failure', () => {
      const w = newWorld();
      const ws = grantWeapon(w, WEAPON_OFFER_TARGET, 3, 0);
      applyOffer(w, { kind: 'weapon', key: WEAPON_OFFER_TARGET, name: 'x', desc: 'x', toLevel: 4 });
      expect(ws.level).toBe(4);
      expect(() => updateWeapons(w, 1 / 60)).not.toThrow();
    });

    it('not reachable through the real Command surface: buildOfferPool only ever emits ws.level + 1', () => {
      const w = newWorld();
      const ws = grantWeapon(w, WEAPON_OFFER_TARGET, 3, 0);
      w.phase = 'levelup';
      for (let i = 0; i < 25; i++) {
        const offers = rollOffers(w);
        for (const o of offers.filter((x) => x.kind === 'weapon' && x.key === WEAPON_OFFER_TARGET)) {
          expect(o.toLevel).toBe(ws.level + 1);
        }
      }
    });
  });

  describe("finding: grantWeapon's update branch has no clamp at all, unlike its own create branch (q29)", () => {
    // weapons.ts:62-66: `existing.level = Math.max(existing.level, level)` on
    // an already-granted weapon skips the create branch's own
    // `Math.max(1, Math.min(maxLevel, level))`. NaN and a fractional value
    // above the existing level still crash the live fire loop the same way
    // the level/inheritance/weaponOffer `nan`/`fractional` holes do; a value
    // past the track's own top (7, Infinity) does NOT crash, because
    // `levelStats`'s read-time clamp still protects the fire loop — but the
    // *stored* `ws.level` is left outside `[1, maxLevel]`, which a raw
    // reader elsewhere in the sim (not levelStats) can observe directly.
    it('update level=NaN: grantWeapon stores NaN, the next tick throws', () => {
      const w = newWorld();
      grantWeapon(w, WEAPON_UPDATE_TARGET, 1, 0);
      const ws = grantWeapon(w, WEAPON_UPDATE_TARGET, NaN, 0);
      expect(ws.level).toBeNaN();
      expect(() => updateWeapons(w, 1 / 60)).toThrow(/reading 'range'/);
    });

    it('update level=2.5 (fractional, above the existing level): grantWeapon stores the fraction, the next tick throws', () => {
      const w = newWorld();
      grantWeapon(w, WEAPON_UPDATE_TARGET, 1, 0);
      const ws = grantWeapon(w, WEAPON_UPDATE_TARGET, 2.5, 0);
      expect(ws.level).toBe(2.5);
      expect(() => updateWeapons(w, 1 / 60)).toThrow(/reading 'range'/);
    });

    it('update level=7 (past the 6-level track top): stored uncapped, but the live fire loop stays clean', () => {
      const w = newWorld();
      grantWeapon(w, WEAPON_UPDATE_TARGET, 1, 0);
      const ws = grantWeapon(w, WEAPON_UPDATE_TARGET, 7, 0);
      expect(ws.level).toBe(7); // the create branch would have clamped this to 6
      expect(() => updateWeapons(w, 1 / 60)).not.toThrow();
      expect(levelStats(w, ws)).toBe(w.content.weaponByKey.get(WEAPON_UPDATE_TARGET)!.levels[5]);
    });

    it('update level=Infinity: same contamination shape as 7, still fires cleanly', () => {
      const w = newWorld();
      grantWeapon(w, WEAPON_UPDATE_TARGET, 1, 0);
      const ws = grantWeapon(w, WEAPON_UPDATE_TARGET, Infinity, 0);
      expect(ws.level).toBe(Infinity);
      expect(() => updateWeapons(w, 1 / 60)).not.toThrow();
    });

    it('the contamination is observable outside the fire loop: the determinism hash treats 7 and the legitimate cap 6 as different states', () => {
      // run.ts:656's hashWorld hashes `wp.level` directly (`h.int(wp.level)`),
      // not through levelStats's read-time clamp — so two worlds that the
      // live fire loop treats identically (both fire as if capped at 6) hash
      // differently, because the stored field itself still disagrees.
      // (buildOfferPool's own `ws.level < maxLevel` cutoff at progression.ts:112
      // is NOT a discriminating consequence here: 6 < 6 and 7 < 6 are both
      // false, so a legitimately-capped weapon and a contaminated one are
      // excluded identically — checked directly below.)
      const atCap = newWorld();
      grantWeapon(atCap, WEAPON_UPDATE_TARGET, 1, 0);
      grantWeapon(atCap, WEAPON_UPDATE_TARGET, 6, 0);
      const contaminated = newWorld();
      grantWeapon(contaminated, WEAPON_UPDATE_TARGET, 1, 0);
      grantWeapon(contaminated, WEAPON_UPDATE_TARGET, 7, 0);
      expect(hashWorld(atCap)).not.toBe(hashWorld(contaminated));
    });

    it('buildOfferPool excludes a legitimately-capped weapon and a contaminated one identically — not a discriminating consequence', () => {
      for (const level of [6, 7]) {
        const w = newWorld();
        grantWeapon(w, WEAPON_UPDATE_TARGET, 1, 0);
        grantWeapon(w, WEAPON_UPDATE_TARGET, level, 0);
        w.phase = 'levelup';
        for (let i = 0; i < 25; i++) {
          const offers = rollOffers(w);
          expect(offers.some((o) => o.kind === 'weapon' && o.key === WEAPON_UPDATE_TARGET), `level=${level}`).toBe(
            false,
          );
        }
      }
    });

    it('the clamp does hold at every value the update branch also leaves in-domain: 0/negative/-Infinity, and the legal top 6', () => {
      for (const [input, expected] of [
        [0, 1],
        [-1, 1],
        [-Infinity, 1],
        [6, 6],
      ] as const) {
        const w = newWorld();
        grantWeapon(w, WEAPON_UPDATE_TARGET, 1, 0);
        const ws = grantWeapon(w, WEAPON_UPDATE_TARGET, input, 0);
        expect(ws.level, `update(level=${input})`).toBe(expected);
        expect(() => updateWeapons(w, 1 / 60)).not.toThrow();
      }
    });

    it('not reachable through the real Command surface: bindSouls never leaves an illegal level, though not via the update branch', () => {
      // bindSouls (progression.ts:288) rebuilds `w.weapons` from scratch
      // every call — filtering to only the slotless innate before granting
      // the chosen souls — so a picked soul (arrow_spire, ballista) always
      // takes the *create* branch here, never update, no matter how many
      // times bindSouls runs. The only thing that actually re-enters the
      // update branch through this path is the slotless innate's own
      // re-grant (`grantWeapon(w, def.key, 1, 0)`), always with the fixed,
      // always-in-domain level 1 — so this real path never reaches the
      // update branch with an out-of-domain input at all; this test pins
      // that fact rather than a defense the update branch itself provides.
      const w = newWorld();
      const keys = ['arrow_spire', 'ballista'];
      keys.forEach((k, i) => forcePlace(w, k, 5 + i, 5, 3));
      const souls = deriveSouls(w);
      for (const s of souls) expect(Number.isInteger(s.level) && s.level >= 1).toBe(true);
      bindSouls(w, souls.map((s) => s.key));
      const firstBind = new Map(w.weapons.map((ws) => [ws.key, ws.level]));
      bindSouls(w, souls.map((s) => s.key)); // rebuilds from scratch again — still create, not update
      for (const ws of w.weapons) {
        expect(Number.isInteger(ws.level) && ws.level >= 1).toBe(true);
        if (firstBind.has(ws.key)) expect(ws.level).toBe(firstBind.get(ws.key));
      }
    });
  });

  /* ------------------------------------------------- fewer souls than slots */

  describe('the "fewer distinct souls than weapon slots" auto-bind path holds at every boundary', () => {
    it('0 distinct souls auto-binds to just the innate weapon', () => {
      const w = newWorld();
      beginSoulPick(w);
      expect(w.phase).toBe('act2');
      expect(w.weapons.map((x) => x.key)).toEqual(['wardens_arrow']);
    });

    it('exactly weaponSlots distinct souls (the <= boundary) still auto-binds', () => {
      const w = newWorld();
      const keys = ['arrow_spire', 'ballista', 'ember_brazier', 'frost_obelisk', 'tesla_coil', 'mortar'];
      expect(keys.length).toBe(w.derived.weaponSlots);
      keys.forEach((k, i) => forcePlace(w, k, 5 + i, 5, 3));
      beginSoulPick(w);
      expect(w.phase).toBe('act2');
      expect(w.weapons.length).toBe(keys.length + 1); // + the innate
    });

    it('one more than weaponSlots does NOT auto-bind — it opens the picker instead', () => {
      const w = newWorld();
      const keys = ['arrow_spire', 'ballista', 'ember_brazier', 'frost_obelisk', 'tesla_coil', 'mortar', 'venom_spore'];
      expect(keys.length).toBe(w.derived.weaponSlots + 1);
      keys.forEach((k, i) => forcePlace(w, k, 5 + i, 5, 3));
      beginSoulPick(w);
      expect(w.phase).toBe('soulpick');
      expect(w.weapons).toEqual([]);
    });
  });
});
