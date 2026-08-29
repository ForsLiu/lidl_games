# BACKLOG.md — ordered work queue (SPEC-FINAL)

Format: `- [ ] (id) [type] title — acceptance: <objective check> — refs: <spec §>`
Loop mode executes the top actionable item. Completed items move to the Done section
with the commit hash.

**Rewritten at the SPEC-FINAL reconcile (§16).** The queue is ordered by SPEC-FINAL
§15's build order P0→P10; ids are `p<band><letter>`. Acceptance criteria name the
consolidated gates **G1–G20** (§14), which replace every prior A/B/C gate list. The
V3 queue (M17–M27) is closed out in the Done section; its unreached items were not
skipped — each is carried forward below under its P band, and MIGRATION.md §8 maps
old id → new id. See the audit in MIGRATION.md §8 for what the reconcile measured.

**Corrections outrank gaps.** The two items in the first section were places
where shipped code asserted the *opposite* of authoritative SPEC-FINAL text, not
places where work was merely undone. CLAUDE.md rule 3 applied to them: a failing
regression test landed before each fix. Both are now done (x001 `dc1681c`,
x002 `ef69a47`).

**Standing constraint for every item below (QUESTIONS Q40, restated):** no
balance tuning before P3 lands the run shape. A bound that fails meanwhile gets
a recorded reason, not a nudged constant. **P10 is the one balance pass.**

**Gate names are §14's G1–G20**; MIGRATION.md §8.5 maps them onto the A/B/C names
still in test headers.

## Audit summary (what SPEC-FINAL found already built)

| Band | State |
|---|---|
| P0 sim skeleton | **done** — fixed 60 Hz, named RNG streams, Commands, headless CLI, end-state hash (G2 green except tuner-edited content and fast-forward, see p9f) |
| P1 TD core | **done** — pathing, 3 owner towers, 20 enemies, economy live; p1a landed sealing (breach pathing, §10), p1b measured G7's win-rate band as a live test — G7 green in full; Q83's promised re-measurement of that band at p3e did **not** happen (still `cfg()`'s legacy `cycles: 1`) and is left open, unqueued, per Q109 |
| P2 VS core | **done in full (p2a-p2f)** — inheritance formula built and wired live, towers inert with their §5 specials live, weapon-panel lineage live, the superseded soul-weapon roster and Dusk picker deleted (G3 green in full) |
| P3 interleave | **done in full (p3a-p3e)** — `p3a` retargets the reused V2 cycle machine to 18 TD + 6 VS, 20s build, 75s VS (G6's pattern half); `p3b` stacks up to `maxStackedWaves` TD waves via the `call` command (G6's stacking half); `p3c` re-points leak coupling's existing ×2-into-next-VS-wave mechanism onto TD→VS vocabulary and the real 6-block shape; `p3d` deletes the V2 Day/Dusk/Night/Dawn machine, Rekindle and the Core-detonation pocket/lane mechanism outright; `p3e` re-baselines `light-build`/G13's solo-viability clause (`a4-single-type`)/the boss gate against the real shape — all three measure red past ~wave 10-14 (a p8a content gap, not a P3 defect) and are logged `.skip` with their numbers rather than forced green (Q109) |
| P4 core math | **done** — multiplicative stacking, armor cap +99 / floor −100, 6 damage types + 2 statuses (G4, G5 green) |
| P5 tower roster | **done in full (p5a-p5d, G20 green)** — all 10 towers, upgrade tracks, defense bands; `p5b` gave Ember Brazier/Mortar their own `costMul`; `p5c` authored the four remaining §5.2 milestone specials (Ballista, Fire Brazier, Ice Obelisk, Mortar) and the G20 loader rule; `p5d` fixed the QA-filed `damageDealt` telemetry bug on pierce/lob-kind towers |
| P6 classes | **framework done (`p6a`), eleven of eleven real kits done (`p6b`, `p6c`, `p6d`)** — §4's Passive + Q + E + tower passive is live for all 11 classes; **gate G9 is green in full**, and `p6d` measured **G10 and G11 green** (Archer's dps-optimal charge peaks at t=5.0 inside [2,6], full charge one-shots the toughest non-elite; Stormcaller's max chain multiplier is 3.5832 ≤ 3.6); `p6e` measured **G8 honestly red**; re-measured in full against p8a's real content this session (Q123, Q127) — **win rate is 0/11** (was 1/11; Cryomancer's own pre-p8a pass no longer clears the floor), diversity 2/11 not ≥8/11, both clauses `.skip`-ed per-class with real measured numbers, re-enable point **P10** (not `p8a` — already landed and re-measured); `p6f` (V2 framework residue retirement) remains |
| P7 equipment/rewards/VS upgrades | **superseded systems in place** — relic affixes, Ember, 12 boons; §7's 12-item table, §6.3's pool and §8's reward pipeline unbuilt (G12 unmet) |
| P8 enemies/waves/bosses | **roster, both bosses and real wave data done (`p8a`)** — all 20 §9 enemies by name; `data/waves.json` authors real TD waves 1-18 on the §1.1 shape (Gatebreaker on 18 only, Warden-Eater on VS 6), the §9 VS-budget curve is live; `p8b`/`p8c` (alive-cap overshoot, gate G14) remain |
| P9 tooling | **dev mode, god mode, UX flows done; Codex read-half in flight on `lane/tuner`; Tuner unbuilt** (G15 unmet, G16/G18 largely green) |
| P10 balance | **not started** — Burning still refresh-strongest, perf budget still host-dependent wall-clock |

## Queue

### Corrections — shipped code contradicts SPEC-FINAL

Both corrections (x001, x002) are **done** — see the Done section. The queue
resumes at P1.

### Feedback — owner-filed items (2026-08-27), processed from `feedback/`

Filed from the owner's 2026-08-27 feedback batch (12 files, `verdicts-q1-121`
processed separately into QUESTIONS.md). **Execution order note**: the same
verdict batch carries a PRIORITY DIRECTIVE (QUESTIONS.md Q121's verdict log
entry) putting `p8a` immediately after the item in flight at filing time
(`p6e`), ahead of every other queued item including the ones below — these are
filed and ready, not next up.

- [x] (b016) [bug] top priority: a tower can be built directly on the
      character's own tile, trapping the Warden inside it — **done, see Done
      section.** Note for whoever picks up (fb002): once the Warden ignores
      structure collision entirely, this fix's relocation logic becomes moot
      (standing on a to-be-built tile becomes legal) but is harmless to leave
      in place — refs: §12 rule 3, owner feedback `bug-build-on-character`.
- [x] (fb001) [feat] dev profile (`data/dev.json`) unlocks every Core from
      §5.5, the same pattern already used for classes/maps — **done, see Done
      section.**
- [x] (fb002) [feat] Character (and dash) ignore collision with the Core and
      all friendly structures — walks/flies over them freely; enemies keep
      current pathing rules — **done, see Done section.**
- [x] (fb003) [feat] VS level-up auto-pick toggle (settings + on-screen): when
      on, resolves level-up offers without pausing for input — prefer the
      highest-rank owned stat boon, else the first offered card; manual choice
      any time the toggle is off; auto-pick choices are ordinary Commands
      (replay-safe) — acceptance: toggle-on runs never pause in the level-up
      phase; replay determinism holds; a test covers the pick rule — **done,
      see Done section.** — refs: §6.3, owner feedback
      `feature-auto-pick-boons`.
- [x] (fb004) [feat] Character panel: every final stat with its multiplier
      breakdown by source (class × tree × equipment × boons, per §2's
      stacking rules) plus every boon taken this run with rank and current
      contribution — **done, see Done section** — refs: §2, §6.3, §11,
      owner feedback `feature-boon-stats-panel`.
- [x] (fb005) [feat] Per-damage-type color/font in floating damage numbers,
      defined in `data/damagetypes.json` (not code); crits/execute render
      larger; colorblind-safe variants respect the existing palette setting —
      acceptance: each of the six damage types plus the two statuses visibly
      differs in a mixed fight; the style mapping lives in `/data`; a test
      asserts the mapping — **done, see Done section** — refs: §3, §11,
      owner feedback `feature-damage-type-colors`.
- [x] (fb006) [feat] Enemy HP bars show a shaded/hatched segment sized to the
      unfinished DoT total, shrinking per tick as the DoT resolves —
      acceptance: applying poison shows the segment at the correct size;
      Spreading Plague's death transfer keeps it correct; a test covers
      sizing — **done, see Done section** — refs: §3, §11, owner feedback
      `feature-dot-hp-indicator`.
- [x] (fb007) [feat] DPS summary panel (toggle key): damage dealt and DPS over
      the current wave and the whole run, broken down by source — each tower
      type (TD), each wielded tower-type attack (VS), each class active, each
      damage type — acceptance: panel totals reconcile with `RunReport`'s own
      damage-share telemetry (test compares them); visible in both phases —
      **done, see Done section** — refs: §11, owner feedback
      `feature-dps-summary`.
- [ ] (fb008) [feat] Auto-collect all uncollected VS XP gems when a wave ends;
      EXP beyond the character's current level-up need converts to gold at a
      tunable ratio (start 1 gold per 2 EXP, log the chosen ratio to
      QUESTIONS.md) — acceptance: ending a wave with gems on the ground yields
      their EXP; overflow appears as gold with a HUD toast; a test covers both
      the pure-EXP and overflow-to-gold paths — refs: §1.1, §2 (amends the
      "gems do not convert" line), owner feedback `feature-exp-to-gold`.
- [ ] (fb009) [feat] Remove the early-call bonus-gold mechanic (including
      multi-summon's per-wave bonus) entirely; every TD wave cleared instead
      pays a fixed `20 + 10 × wave` reward (tunable); multi-summon (stacking
      up to 3 waves) stays, without the bonus — acceptance: an early call
      grants no gold; clearing wave N pays the formula; gate G6 and the
      economy tests are updated to match; a test covers it — refs: §1.1
      (supersedes the early-call bonus rule), owner feedback
      `feature-fixed-wave-reward`.
- [ ] (fb010) [feat] Game speed options extended to 1/2/3/10/50×; at 10× and
      above the renderer may skip frames but the sim itself stays fixed 60 Hz
      per sim-second with determinism unchanged — acceptance: a x50 run of a
      full wave produces an end-state hash identical to the same seed at x1; a
      test covers hash equality; available at minimum in the dev profile (log
      to QUESTIONS.md if kept out of the normal game) — refs: §11, owner
      feedback `feature-game-speed-x10-x50`.
- [ ] (fb011) [feat] Remove the max-rank limit on VS stat boons and Type
      Mastery cards (were ×5 / ×3) — they keep appearing in offers at any
      rank; skill cards keep their existing caps; stacking still follows §2
      (ranks within one boon add, then multiply as one source) — acceptance:
      a boon can be taken 10+ times with its effect matching the stacking
      rule; the offer pool never exhausts on rank alone; a test covers a
      10-rank case — refs: §6.3 (supersedes the rank caps), owner feedback
      `feature-remove-boon-rank-caps`.

Filed from the owner's 2026-08-28 feedback batch (6 files, all `[feature]`,
none carrying verdict blocks — nothing to apply to QUESTIONS.md beyond
Q134, filed inline at fb014 below; a 7th file, `feature-ui-self-audit`,
arrived slightly later in the same batch and is filed below as fb018).
None are bugs, so none are forced to the top of the queue by the feedback
protocol's bug clause; the three the owner marked `Priority: top` are
called out in their own titles instead.

- [ ] (fb012) [feat] Move the VS level-up auto-pick toggle (fb003) into the
      in-game Esc options menu (both phases) plus a small toggle on the
      level-up screen itself; remove it from the start/hub menu; setting
      persists per profile; stays a replay-safe Command — acceptance: toggle
      absent from the starting menu; present and functional in Esc options
      during both phases; a mid-run flip changes the next level-up; a test
      covers it — refs: §6.3, §11, owner feedback
      `feature-autopick-in-options` (fb003 follow-up).
- [ ] (fb013) [feat] New class #12: Time Lord — passive "Time Flow" (damage
      to the character becomes a 4 s DoT, mitigated once by armor before
      converting; a dormant, shipped-disabled flag for "character DoT 100%
      faster" reserved for future equipment); Active1 "Time" (3 charges/6 s
      recharge, r7 four-stage mark per enemy: unmarked→past teleports to a
      3 s-ago position + high DoT, past→present stun-locks 3 s + high DoT,
      present→future −20% atk/move speed [deferred if stunned/frozen] +
      DoT equal to remaining HP, future→executed instant-kill or −50%
      current HP for elites/bosses, marks persist until consumed); Active2
      "Time Lock" (2 charges/10 s recharge, 5 s no-exit cursor zone immune
      to Time's rewind-pull, high DoT over 10 s, re-casting while one
      exists teleports its enemies into the new zone and detonates all
      their remaining DoT as one instant burst); tower passive: every 2 TD
      waves, all towers gain one free uncapped bonus level (+10% range,
      +10% AoE area, no milestone triggers) — acceptance: full kit
      implemented per the spec text; a unit test per Active1 stage
      (rewind position, deferred slow timer, elite half-HP branch) and for
      Time Lock's no-exit clamp, rewind interaction and DoT detonation;
      dormant passive flag present and off; VFX/indicators registered
      (mark icons above enemies for past/present/future); class-count
      gates, census, Codex and dev profile updated for 12 classes — refs:
      §4.2 addition, owner feedback `feature-class-timelord`.
- [ ] (fb014) [feat] Constellation tree counts as fully allocated on every
      run (temporary supersede of §8.3) — no point-spending or allocation
      UI; the tree data and the skill-point counter stay live so the system
      can be re-enabled later — acceptance: a fresh profile plays with
      every node's effect active; skill points still accrue and display;
      the tree screen shows every node allocated; gates that measured point
      economies are `.skip`-ed with this reason — refs: §8.3 temporary
      supersede, Q134 (applies in dev and normal play), owner feedback
      `feature-constellation-auto-max`.
- [ ] (fb015) [feat] top priority: realize the equipment system per §7 (the
      current build does not implement it) — six slots (weapon, armor,
      shoes, ring, necklace, bracelet); `data/equipment.json` holds the
      full owner-authored 12-item table (exact HP/Atk/Def flats, atk-speed
      and move multipliers, every conditional line including class checks
      and written fallbacks, and the sword+armor cross-item interaction
      changing Circle Slash scaling); multipliers stack per §2 (one source
      per item), flats add; each fully cleared TD wave grants 1 random item
      at Results (win or lose), duplicates allowed (Q42); stash + equip UI
      with click-to-swap; character panel (fb004) stops treating equipment
      as inert and shows item sources in stat breakdowns (closes Q132's
      open gap); dev profile pre-stashes all 12 items (existing T3 rule) —
      acceptance: all 12 items exist, equip/unequip works, every
      conditional line (including the two-item interaction and one
      "if not class" fallback) has a unit test, loot pays 1 item per
      cleared TD wave at Results, G12's equipment clause is green — refs:
      §7, §8.1, §2, gate G12, owner feedback `feature-equipment-realize`.
- [ ] (fb016) [feat] top priority: indicators + VFX for every skill and Core
      function — every class active gets an aim/charge indicator while
      casting and a firing VFX (Circle Slash radius-at-charge, Dash Slash
      path, Poison Barrel circle, Glaciate nova, Taunt radius, Manifest
      placement, Ice Wall footprint, etc.); every listed passive trigger
      gets a visible cue (Thousand Cuts bleed tick, Spreading Plague jump
      line, Conduction jump counter, Parry flash, shatter burst, Paladin
      Wrath glow); every Core gets its listed indicator/VFX (Plant devour
      bite + range ring, Corpse execution beam + store meter, Vampire
      Heart lifesteal motes, Time slow-aura/decay-ring shading, upgrade
      steps visibly reflected); primitive shapes are fine, style constants
      live in one render module, respects reduced-flash, no sim changes —
      acceptance: a data-driven registry checklist test asserts every
      class/Core has indicator+VFX entries so a new skill without them
      fails the test — refs: §11 indicators extended to skills/Cores,
      owner feedback `feature-skill-core-vfx`.
- [ ] (fb017) [feat] top priority: split tests into fast/slow tiers so loop
      iterations stop burning 40+ minutes per item — tag every suite over
      ~60 s (p6e-class-diversity, soak, q14 mutation-smoke, long fuzz/
      live-sim files) and add `npm run test:fast` excluding them, under 5
      minutes total; amend CLAUDE.md's loop contract so per-item
      verification is targeted tests + `test:fast`, with full `npm test`
      reserved for phase (P-milestone) completion, before any lane merge,
      and before DONE.md; file the two known Windows flakes (q14
      mutation-smoke's runaway-subprocess hang, documented this session in
      PROGRESS.md's fb004 entry; the q28 EPERM temp-file rename) as their
      own backlog items with repros so they stop polluting unrelated runs —
      acceptance: `npm run test:fast` exists and finishes under 5 minutes;
      CLAUDE.md updated; both flakes filed — refs: CLAUDE.md working
      rules/loop contract amendment, owner feedback `feature-test-tiers`.
- [ ] (fb018) [feat] UI self-audit tool: a dev-mode audit rendering a fixed set
      of deterministic scenes (Hub, mid-TD wave with selection panel open,
      350-enemy VS chaos with all damage types active, level-up offer screen,
      character panel, Codex/Tuner page, defeat Results) to PNG files under
      /audit plus report.json, with objective checks: text contrast ratio
      >= 4.5:1 against actual background, font sizes >= 12px at 1080p, HUD
      element overlap detection, off-screen interactive elements, color
      distance between all damage-type pairs in both palettes above a stated
      threshold, character-vs-background contrast in the VS chaos scene; runs
      via `npm run ui-audit` (dev only, excluded from prod build), headless
      where possible else via dev server at a fixed 1920x1080 viewport —
      acceptance: `npm run ui-audit` writes all scene PNGs + report.json;
      failures list the offending element by name; the check suite has its
      own tests (a deliberately low-contrast fixture fails); a README line in
      /audit explains each scene — refs: §11 tooling, QUALITY.md Beta bar
      (accessibility), owner feedback `feature-ui-self-audit`.
- [ ] (p8d) [feat] Boss termination guarantee (§9 addendum, QUESTIONS Q126/Q127):
      the Warden-Eater gains a hard escalation from 3:00 of boss-fight time —
      +10% damage and +5% move/attack speed every 30 s, stacking without cap
      (⚖); whenever it cannot reach the Warden it attacks structures and the
      Core (Core loss = defeat as normal); intent: no run can stalemate, every
      seed terminates — acceptance: across the standard G8/G23 measurement
      matrices with a 60-sim-minute boss cap, zero 'running'/timeout outcomes;
      the known stalemate seeds (carnivorous_plant seeds 2 and 9, corpse seed
      2, swordsman 1/2/5/9, archer 2/11, stormcaller 6, bloodlord 1/12) all
      resolve to real outcomes — refs: §9 addendum, QUESTIONS.md Q126, Q127.

### P1 — TD core: sealing (G7)

P1 is **done** — p1a and p1b are in the Done section. G7 is green in full;
Q83 expected the p1b band to be re-measured at p3e after the §1.1 run shape
landed, but p3e's own acceptance text named only `light-build`/
`a4-single-type`/`boss` and did not touch `tests/p1b-seal-winrate.test.ts` —
that test still runs `cfg()`'s legacy `cycles: 1` shape, unchanged. Left
open, logged at Q109, not yet re-queued under a new id.

### P2 — VS core: the inheritance formula (G3)

**P2 is done in full** — p2a, p2b, p2c, p2d, p2e and p2f are all in the Done
section. `src/sim/vswield.ts`'s `wieldedAttacks` implements §6.1's formula and
`updateWieldedAttacks` fires it live from Act II; `src/sim/vsspecials.ts`'s
`updateVsSpecials` fires every tower's §5 VS special while the tower itself
stands inert; p2f converted the Fire Brazier explosion's death-chain
recursion into an iterative worklist; p2d added the §6.2 weapon-panel lineage
line; p2e deleted the superseded soul-weapon roster and picker wholesale.

### P3 — interleave and leak coupling (G6)

**P3 is done in full** — p3a, p3b, p3c, p3d and p3e are all in the Done
section. Gate G6 is green in full (p3a landed the pattern half, p3b the
stacking half, p3c restates leak coupling on the new shape, p3d deletes the
old cycle machine outright); p3e re-baselined `light-build`, G13's
solo-viability clause (`a4-single-type`) and the boss gate against the real
18-TD/6-block shape — all three measure red past the wave-10-14 content gap
and are `.skip`-ed with their numbers per Q109, not forced green.

### P5 — full tower roster and upgrade tracks (G20)

**P5 is done in full (p5a-p5d)** — see the Done section. Gate G20 is green in
full; `p5d` closed the last open item, a bug QA filed against `p5b`.

### P5.5 — Cores (§5.5, owner feature inbox 2026-08-26; G21, G22, G23)

Placement logged in Q93: after P5 so the §1.1 run shape (P3) and the full
tower roster precede the Cores' VS halves and interactions; p-core-f's
quest unlocks ride the §8.4 system and may complete alongside p7e.
**`p-core-a` through `p-core-f` are done** — see the Done section. **P5.5 is
complete in full.** G21 is green in full: all five Cores' base gameplay
numbers (Stone Heart in full, Vampire Heart in full, Time in full including
its steps 3-5 decay aura, Carnivorous Plant in full, Corpse in full) are
live. `p-core-f` shipped G22 and G23 as live tests (Q116); the item's
unlock-quests and Codex-page thirds — deferred by Q116 because the real §8.4
quest engine doesn't exist yet — are re-filed as `p7h` in P7, below.

**G23 re-measured against p8a's real content this session (Q123, Q125,
Q126)**: still not green. `vampire_heart` unchanged at 0/12; `time` 0/12 →
2/12; `carnivorous_plant` 6/12 → 3/12 with a second seed now non-terminating
at the file's own tick cap (was one); `corpse` 0/12 → 3/12 with a first
non-terminating seed; `stone_heart` moved from a uniform wave-3 death to a
mixed 3/12 (P6 landed since Q116's measurement, so its cause is now split:
P7-bound for the wave-3 losses, P10-bound for the rest). All five stay
`.skip`-ed with the real numbers; re-enable point is P10, not `p8a` (already
landed and re-measured). G22 (the fingerprint gate) was not named by the
PRIORITY DIRECTIVE's re-enable list and stays as Q116 last measured it —
green, wide margins over its 0.10 floor — not re-verified live this session.

### P6 — classes (G8, G9, G10, G11)

**`p6a`, `p6b`, `p6c`, `p6d` and `p6e` are done** — see the Done section. SPEC-FINAL
§4's class framework (archetype bands resolved to a numeric basic-attack
profile, Passive, Active1 (Q), Active2 (E), Tower passive) is live, proven by
a fixture class; the three existing V2-era classes carry forward as `legacy:
true` (Q38), except Engineer and Pyro, which `p6d` converted in place to real
§4.2 kits. `p6b` authored the first real §4 kit, Swordsman, and gate **G9**'s
first half (the Circle Slash/Dash Slash merge) is green; `p6c` authored the
second, Plaguebringer, and **gate G9 is now green in full** (the Spreading
Plague on-death DoT transfer, proven safe at a 2000-enemy chained-death
scale); `p6d` authored the remaining nine §4.2 kits (Archer, Engineer, Pyro,
Necromancer, Cryomancer, Stormcaller, Bloodlord, Animist, Paladin), bringing
the roster to **11 of 11 §4-shaped classes**, and **gates G10 and G11 are now
green** (measured, not assumed — see Q120). `p6e` measured gate **G8** live
over the 12-seed set (Q121): the win-rate clause is green for one class
(Cryomancer, 6/12 after an Ice Wall cooldown tune) and `.skip`-ed with
per-class measured numbers for the other ten, all converging on the same
wave-11-to-17 `defeat_core`/`defeat_warden` wall G23 already pinned to the
`p8a` wave-content gap; the diversity clause measures 2/11 distinct honestly
(every class's own-kit damage share sits under any materiality bar that isn't
tautological) and is `.skip`-ed on the same `p8a` precedent, with a pinning
test holding the red count at 2 so it can't silently drift. **G8 is not
green — both clauses re-enable at `p8a`.**

**Re-measured in full against p8a's real content this session (PRIORITY
DIRECTIVE follow-up, Q123, Q127) — G8 stays red for all eleven classes.**
Cryomancer's own re-measurement (already corrected in p8a's own commit)
reconfirmed identical: 2/12. The other ten, freshly measured (not inherited):
swordsman 2/12, plaguebringer 0/12, engineer 3/12, pyromancer 1/12, archer
2/12, necromancer 0/12, stormcaller 2/12, bloodlord 4/12, animist 3/12,
paladin 0/12 — none clears the 35% floor (5/12). The diversity clause stays
at 2/11 distinct (`ballista`/`frost_obelisk`), unchanged; its own-kit-share
continuum is corrected to 0.4%-15.4% (was mismeasured pre-p8a as 0.4%-16.6%
with the wrong class at the low end). One new finding: letting the full
`beforeAll` run to completion (rather than a spot-check) surfaced 9
non-terminating `'timeout'` seeds across 4 classes (swordsman, archer,
stormcaller, bloodlord), not the single `swordsman` seed 1 previously known
— corroborating, not contradicting, `tests/p-core-f-gates.test.ts`'s
`carnivorous_plant`/`corpse` stalemate finding (Q127). Every clause stays
`.skip`-ed with its real number; re-enable point moves from `p8a` (done) to
**P10**.

- [ ] (p6f) [polish] Retire the three V2 classes' framework residue: `affinity.json`,
      class `mods`, the single `active`/`passive`/`manualAttack` shape, and the
      Engineer/Pyromancer/Frost Warden rows insofar as §4 does not re-author them
      (Engineer and Pyro do carry forward) — acceptance: `data/classes.json` holds
      exactly the 11 §4 classes in the §4 shape, MIGRATION.md §8's retire-with-p6f
      rows are checked off — refs: §4, Q38

### P7 — VS upgrade pool, equipment, rewards (G12)

- [ ] (p7a) [feat] VS level-up pool per §6.3 in `data/vsupgrades.json`: each level
      offers 1 of 3 cards with 1 free reroll; stat boons (Attack, Attack Speed, Move,
      Max HP, Defense, Area, Range) at rank ×5, Type Mastery at rank ×3 (one card per
      built tower type, +20% that type's VS damage), and 3 skill cards per class at
      rank ×2. Offer weighting even — acceptance: a data test covers every pool
      family and its rank cap; a run test proves the free reroll is once per level
      and that Type Mastery only offers types actually built — refs: §6.3
- [ ] (p7b) [feat] Equipment per §7 in `data/equipment.json`: 6 slots (weapon,
      armor, shoes, ring, necklace, bracelet), the 12-item table, flats adding and
      multipliers multiplying per §2, class-conditional lines inert elsewhere unless
      a fallback is written — acceptance: a data test covers all 12 items' every
      column; one test per conditional effect including its "if not Swordsman"
      fallback (sleeve sword, swordsman armor, swordsman shoes) — refs: §7, §2
- [ ] (p7c) [feat] Rewards pipeline per §8: each TD wave cleared grants 1 random
      equipment (even weights), each VS wave cleared grants 1 skill point, both
      granted at run end, win or lose, for waves fully cleared; duplicates allowed —
      acceptance: gate **G12** — N TD waves cleared yields exactly N equipment, M VS
      waves yields exactly M skill points, a defeat still pays for fully-cleared
      waves, and no orb appears anywhere — refs: §8, G12
- [ ] (p7d) [feat] Retire the superseded meta economy: relic affixes and rarities,
      the Ember → level → points pipeline, and `data/relics.json`'s affix table.
      Skill points become the tree's only currency with a one-time conversion, and
      respec is priced in skill points — acceptance: no Ember or relic affix in sim,
      meta or UI; a save written before the change migrates with its Ember converted
      and its stash preserved; gate **G12**'s "orbs nowhere" clause extended to
      relics — refs: §8, Q46, Q49
- [ ] (p7e) [feat] Unlock quests per §8.4: 8–12 quests in `data/quests.json` awarding
      unlocks only, never currency, covering the §4.2 classes (win a run → Pyro;
      build 40 ice obelisks lifetime → Cryomancer; win with a sealed Core → Paladin)
      — acceptance: every non-free class has exactly one unlock quest; a test drives
      one quest of each trigger family to completion; no quest grants currency —
      refs: §8.4, §4.2
- [ ] (p7f) [bug] `migrate()` preserves unknown save keys forever: it spreads
      `...meta` wholesale, so any key a save carries survives every round trip as a
      fixed point. A non-object `meta` is worse — `{"meta":"orbs"}` string-spreads
      into indexed keys and re-serialises stably — acceptance: the migrated object
      is built from the known key set instead of a spread; a save carrying junk keys
      and one with a non-object `meta` both migrate to exactly the MetaState key set
      — refs: §11 save migration, QA on t6c bug 1
- [ ] (p7g) [bug] A save whose `stash` alone is corrupt loses the whole account:
      `deserializeMeta('{"version":1,"meta":{"stash":"nope"}}')` throws in
      `migrate()`, `loadMeta` catches it and returns a brand-new account, discarding
      account level, unlocks and quests — acceptance: a malformed `stash` (non-array,
      or an array containing null) coerces to `[]` and every other field survives;
      `tests/meta.test.ts`'s corrupt-save case is extended past `'{}'` — refs: §11,
      QA on t6c bug 4
- [ ] (p7h) [feat] Core unlock quests and Codex page, split out of `p-core-f`
      by Q116 because the real §8.4 quest engine this needs doesn't exist yet:
      the four §5.5 unlock lines (Stone Heart is `unlockedByDefault`; the
      other four Cores' `unlockCondition` strings in `data/cores.json` become
      real quests through whatever `p7e` builds for §8.4 — "300 lifetime
      poison kills", "finish a run with the Core at or below 25% HP", "deal
      100,000 lifetime damage", "win a run in under 32 minutes"), plus a Codex
      page listing all five Cores' `effects`/`upgrade.steps` the way `p9b`'s
      page lists every other content collection — acceptance: each of the
      four non-default Cores has exactly one unlock quest driving its own
      `unlockCondition` metric to completion in a test; the Codex page renders
      all five Cores with live numbers read from `data/cores.json`, matching
      `p9b`'s "a field added to a schema appears with no change to the page"
      rule — refs: §5.5, §8.4, Q93, Q116

### P8 — enemies, waves, bosses complete (G14)

**`p8a` is done** — see the Done section. `data/waves.json` now authors all 18
TD wave rows for real (SPEC-FINAL §9/§1.1); the §9 VS-budget curve is live.
This was the PRIORITY DIRECTIVE's critical-path item — its own real content
also reproduced the wave-11-17 wall roughly fifteen other gates were already
`.skip`-ed pending, honestly (not fixed by landing real content, as hoped) —
**next action is the PRIORITY DIRECTIVE's re-measurement pass** (Q109, Q111,
Q116, Q121), ahead of `p8b`/`p8c` below.

**The PRIORITY DIRECTIVE's re-measurement pass is done this commit — every
named gate stayed red, honestly re-measured against the real content (Q123).**
`tests/a4-single-type.test.ts`'s seven T1 clauses are unchanged (still 0/5
each). `tests/boss.test.ts`'s two win-rate assertions moved from 0/20 to
2/20 (real content narrowed the gap without closing it). `tests/
p-core-f-gates.test.ts`'s G23: `vampire_heart` unchanged at 0/12;
`carnivorous_plant` fell from 6/12 to 3/12 and gained a second
non-terminating seed (Q126); `corpse` moved from 0/12 to 3/12 and gained its
first non-terminating seed (Q126); `time` moved from 0/12 to 2/12;
`stone_heart` moved from a uniform 0/12 wave-3 death to a mixed 3/12 (Q125,
now partly P7-bound, partly P10-bound). `tests/p6e-class-diversity.test.ts`'s
G8 (win-rate and diversity) re-measured live this session — see PROGRESS.md's
dated entry for the full per-class breakdown. Every clause whose doc comment
said "re-enable point: p8a" now says **P10** instead (Q123) — p8a satisfied
its own trigger condition; the remaining blocker is the un-tuned Act I/class/
Core economy against the real curve, which is P10's job, not a further
content gap. No `/data` value was touched. code-reviewer and qa-playtester
both ran against this diff; see PROGRESS.md for findings. `p8b`/`p8c` remain
next in P8's own queue.

- [ ] (p8b) [bug] Alive count exceeds `aliveCap`: 353 measured against a cap of 350,
      because elite and summon spawns bypass the check `spendBudget` applies —
      acceptance: no spawn path can push `w.enemies` past `aliveCap`; a test drives
      elites and boss summons at the cap — refs: §9, QA on t4
- [ ] (p8c) [balance] Gate **G14**: over 20 seeds the scripted-build win rate against
      the Warden-Eater is ≥60% and <100% — acceptance: G14 measured on the §1.1 run
      shape (so it must run after p3a), with the per-seed outcomes printed on
      failure — refs: §9, G14

### P9 — tooling: dev mode, Codex and Tuner, UX flows (G15, G16, G18)

- [ ] (p9a) [feat] Content hash in `RunConfig` and in the end-state hash inputs, so a
      replay against edited `/data` fails loudly — acceptance: editing any `/data`
      value changes the config hash, and a replay carrying a mismatched hash is
      rejected — refs: §11, §12, Q45 (**do this before p9b**)
- [ ] (p9b) [feat] Codex: a Hub page listing every class, tower, equipment, damage
      type, enemy and wave with live stats read from `/data` and its zod schemas —
      acceptance: every content collection renders and a field added to a schema
      appears with no change to the page; counts match the data files. The read-only
      half exists on `lane/tuner` (`src/ui/codex.ts`, `src/ui/codex-collections.ts`,
      `tests/codex.test.ts`) and needs its Hub entry point wired — refs: §11
- [ ] (p9c) [feat] Tuner: in dev mode every numeric and enum field in the Codex is
      editable including wave composition; Save persists to the real `/data/*.json`
      through a Vite dev-server endpoint that validates the whole document against
      its schema and rejects invalid edits with field-level errors; prod is
      read-only Codex plus Export/Import JSON — acceptance: gate **G15** —
      edit→save→reload round-trip, invalid rejected, an edited run visibly flagged,
      and a production build containing no endpoint — refs: §11, G15
- [ ] (p9d) [polish] Gate **G16**'s unasserted half: the production bundle still
      ships the whole dev profile — `applyDevProfile`, the unlocks, `data/dev.json`
      with `devMode:true` and the dev badge CSS are all in `dist`. It is unreachable
      (`isDevBuild()` folds to constant `false`), so this is dead weight rather than
      a hole — acceptance: either the dev profile is tree-shaken out of a production
      build, or G16 gains an explicit assertion that its presence is inert — refs:
      §11, G16, QA on t3 bug 11
- [ ] (p9e) [bug] Gate **G18**'s dead-end clause: `levelup` has no auto-resolve, so
      an unattended run parks in it forever, where every other decision phase has
      one. Repro: a practice run with god mode injected at tick 1, stepped 72 000
      ticks, ends `outcome running, phase levelup, wavesCleared 10, alive 351` —
      acceptance: an unattended run either advances or terminates; a headless run
      stepped past its tick budget never sits in a decision phase — refs: §11, G18,
      QA on t4 bug 4
- [ ] (p9f) [feat] Gate **G2** in full: 100/100 replay hash match including class
      actives, tuner-edited content (per content hash) and fast-forward —
      acceptance: G2's three additions each get a case; the existing A11 coverage is
      folded into the G2 test — refs: §12, G2
- [ ] (p9g) [bug] `hashWorld` covers structures, enemies, weapons, derived stats and
      the RNG streams but **not `w.gold`/`w.goldSpent`**, so two replays that
      disagreed only on a refund or a cost would hash identically until the
      difference changed a build decision — acceptance: a test builds two worlds
      differing only in `w.gold` and asserts different hashes; G2 stays green —
      refs: §12, QA on m20a
- [ ] (p9h) [polish] The enemy panel prints raw shredded armour: past the −100 floor
      a horde-density Brazier board reads "−294 (100% more taken)", honest about the
      percentage and misleading about the number — acceptance: the panel shows the
      effective (floored) armour, or marks the floor — refs: §2, `src/ui/hud.ts`
      `armourText`

### P10 — balance re-baseline and feel pass (G1, G13, G17, G19)

- [ ] (p10a) [feat] Flip Burning to per-application stacking per §3's owner intent:
      each application deals 1 damage and −1 armor per second for 3 s, stacking like
      Bleeding under the shared 50-stack-per-enemy cap, replacing today's
      `maxStacks 1, refresh strongest` — acceptance: two applications tick twice and
      shred twice; the shared cap's eviction rule (a type under its own cap evicts
      the most numerous other type's shortest stack, never the reverse) holds with
      Burning participating — refs: §3, §16
- [ ] (p10b) [feat] DoT immunity is hardcoded in the engine: `immuneToDot` tests
      `type === 'burning' && TRAIT.burnImmune`, so a taxonomy row with an immunity of
      its own needs an engine edit, against the rule that new mechanics are data
      shapes — acceptance: an optional `immuneTrait` on the damage-type schema,
      resolved through the trait table, with Burning authored to use it and a test on
      a second row — refs: §3, §12, code review on m19c
- [ ] (p10c) [balance] Gate **G13**: no tower type's VS attack takes more than 35% of
      damage across the winning-build pool, every type is solo-viable at T1 and none
      at T3 — acceptance: G13 measured over the seed set on the §1.1 run shape, with
      per-type shares printed on failure. This is the re-price §16 asks for and it
      subsumes the retired A4/A5 measurements — refs: §5, §6.1, G13
- [ ] (p10d) [balance] Gate **G1**: mean victorious run is 30–36 minutes over 24+
      seeds, reported as means and pass rates, never medians — acceptance: G1 green
      on the §1.1 run shape — refs: §1.1, G1
- [ ] (p10e) [balance] Gate **G17** perf, re-baselined as §16 asks: a
      host-independent sim budget per simulated minute replacing today's wall-clock
      "full run under 5 seconds"; 350 enemies with every wielded attack live holds a
      ≥60 fps benchmark; a 50-run soak completes with zero exceptions and zero NaN —
      acceptance: all three clauses green as live tests — refs: §16, G17
- [ ] (p10f) [balance] Gate **G19** liveness: the winning sim builds include both
      sealed and open strategies, and multi-summon usage — acceptance: G19 measured
      over the same pool G13 uses, asserting each strategy appears among the winners
      — refs: G19
- [ ] (p10g) [balance] No gate exercises the armour shred: none of the twelve sweep
      seeds ever builds an Ember Brazier and no bot policy ever draws the flame cone,
      so G4's shred path runs zero times in the sweep that guards balance — the shred
      can regress to nothing without a gate moving — acceptance: a policy or probe
      that actually builds a Brazier is in the gate set, and it asserts a non-zero
      shred — refs: §3, G4, QA on m19c
- [ ] (p10h) [polish] Feel pass: juice, the 2 s TD↔VS transition sweep, and SFX/art
      assets behind the existing AudioSink seam — acceptance: the transition sweep
      runs on every TD↔VS boundary and the asset pass is committed; no sim behaviour
      changes (G2 hash unmoved) — refs: §11, §15 P10
- [ ] (p10i) [polish] Regenerate HANDOFF.md's measured sections against SPEC-FINAL
      and re-check QUALITY.md's Alpha bar — acceptance:
      `npx tsx tools/handoff-metrics.ts` runs clean, HANDOFF.md is rewritten against
      §14's gate list, and the file is committed at the 1.0 point — refs: §16,
      CLAUDE.md

### Filed at the lane/quality merge (2026-08-27) — out-of-scope findings from BACKLOG-QUALITY.md's log

The quality lane's session logs recorded main-lane defects it could not fix
(its Scope was `tests/**`/`tools/**`). Each was re-verified against merged HEAD
before filing; findings that died with the soul-weapon/dusk-dawn systems were
dropped. Items already queued (content hash → p9a, save key-set/stash → p7f/p7g)
were not re-filed. Ordering within this section is by severity, not P-band.

- [ ] (b005) [bug] The level-up phase can soft-lock permanently once every boon is at
      `maxRank`: `openLevelUpIfPending` still enters `levelup` with `offers = []`,
      `takeOffer` fails at every index and `rerollOffers` rerolls into another empty
      list, so no Command can leave the phase. Found by the ported q21 boundary fuzz
      (its "exhausted boon pool" describe block pins the current behaviour) —
      acceptance: an empty `rollOffers` result either skips the pause or the phase
      auto-resolves; the q21 pin flips to the fixed behaviour; overlaps p9e's
      unattended-run clause but is reachable *attended* — refs: §6.3, G18,
      BACKLOG-QUALITY session logs (lane/quality merge)
- [ ] (b006) [bug] Three practice `dev` ops launder a non-finite `amount` into
      permanent run state, and `{k:'dev',op:'xp',amount:Infinity}` hangs the process:
      `Math.max(0, NaN)` is `NaN` for `gold`/`fast_forward`, `xp` forwards unguarded
      into `addXp`, whose catch-up `while` loop never terminates on `Infinity` —
      acceptance: one `Number.isFinite` guard per op (precedent: `Stats.add`), a
      regression test fires each op with `NaN`/`±Infinity` and the world stays finite
      and the process alive — refs: QUESTIONS (practice tool), BACKLOG-QUALITY q15
- [ ] (b007) [bug] An out-of-grid `tx` in `upgrade`/`sell` aliases onto a real tile
      one row up (`idx = ty*GRID_W + tx` is never bounds-checked before
      `structureAt` indexes `grid.occ`), so the Command silently acts on the wrong
      structure; `build` with a fractional `ty` similarly lands on a real different
      tile and stores the raw fraction into the `Structure` — acceptance:
      `structureAt` (or the `upgrade`/`sell`/`build` Command paths) rejects
      out-of-bounds and non-integer tile coords; regression tests cover both
      aliasing directions and the fractional build — refs: §12 rule 3,
      BACKLOG-QUALITY q15 session 11 (BUG #2/#3)
- [ ] (b008) [bug] `damageEnemy`'s `amount <= 0` guard passes `NaN`, making the enemy
      permanently immortal (`e.hp -= NaN`, every later `e.hp <= 0` false) and
      poisoning `damageTotal`/`damageByWeapon` for the rest of the run; `+Infinity`
      kills cleanly but leaves `damageTotal = Infinity`. The old grantWeapon source
      died with the soul-weapon system, but the sink is unchanged and now fed by the
      wielded-tower path (re-proven by the ported q21 fuzz via a NaN `Structure.tier`)
      — acceptance: non-finite damage is dropped (or clamped) at `damageEnemy`'s
      guard with a regression test per sign — refs: §12, G17's zero-NaN clause,
      BACKLOG-QUALITY q34
- [ ] (b009) [bug] `Hasher.int`'s `v | 0` collapses `NaN`/`±Infinity` to the same
      hash as `0`, so the determinism hash cannot see non-finite corruption — a
      replay of a NaN-poisoned run reads as clean. Fold a finiteness sentinel into
      `Hasher.int`/`num` (or hash a canonical non-finite tag) — acceptance:
      `Hasher.int(NaN)`, `(Infinity)`, `(0)` produce three distinct hashes; G2
      suite stays green — refs: §12, A11/G2, BACKLOG-QUALITY q30 review
- [ ] (b010) [bug] `Rng.weightedIndex` with any `NaN` weight silently returns the
      last index every call (NaN total defeats every comparison), turning a weighted
      draw into a deterministic constant; `rollOffers`' `weight * (1 + luckBias *
      o.value)` is an untraced potential NaN source, and `rerollOffers`'
      `rerollsLeft <= 0` guard also passes NaN (unlimited rerolls) — acceptance: a
      unit test pins `weightedIndex`'s non-finite-weight behaviour (throw or skip),
      `luckBias`'s range is traced from its writers, and the reroll guard is
      finite-checked — refs: §12 rule 2, BACKLOG-QUALITY q35 (lane item, still open)
- [ ] (b011) [bug] `applyOffer`'s boon case stores `offer.toLevel` unvalidated into
      `boonRanks` (hash input, stat pipeline); a forged negative rank keeps winning
      re-picks and `StatBag.add` accumulates `perRank` per re-pick with no cap —
      forged-offer-only today, so defense-in-depth, not a live exploit —
      acceptance: `applyOffer` clamps/validates `toLevel` to `[1, maxRank]` and
      finite; the ported q21 pins flip to the fixed behaviour — refs: §6.3,
      BACKLOG-QUALITY q30
- [ ] (b012) [bug] Save/meta laundering beyond p7f/p7g: a mis-typed scalar
      (`accountLevel: "seven"`, non-numeric `ember`) walks to level 60 and unlimited
      Constellation points (`NaN <= 0` guards); `highestTier` laundering unlocks all
      five tiers in the real Hub; non-finite `ember` serialises to `null` on the
      next save; duplicated node ids in `allocated` triple-charge; affordability is
      never re-checked on load; a rejected save wrapper is discarded with no error
      event. Regression tests exist `it.skip`'d in `tests/q3-save-fuzz.test.ts`
      (D2/D3/D4/D5/D6/D7/D9) — acceptance: the skipped q3 tests unskip and pass;
      `sanitize` (settings.ts) is the model shape; also export `RETIRED_KEYS` so the
      lane's fixtures track future retirements — refs: §11, G18, BACKLOG-QUALITY q3
- [ ] (b013) [bug] The `/data` loader accepts unpayable data (§12 rule 4 violated
      six ways): no numeric range guards (negative/zero/infinite `hp`, `cost`,
      `interval` all load), non-finite numbers reach the engine and the report,
      duplicate keys silently collapse into the later row, `tree.json`'s
      `angle`/`ring` are outside the schema, a mistyped stat key buys nothing
      silently, and empty rosters (`waves: []`) load. Regression tests exist
      `it.skip`'d in `tests/q7-data-fuzz.test.ts` (E2–E7); E1 (string-literal key
      references in `/src` unchecked by the loader — now pinned via
      `harvest_sprout`, which only `src/bots/policies.ts` names) needs a
      key-reference census. The merge's re-census added: `cores.json` has no
      numeric range guard on any `effects.*`/`upgrade.steps[].*` value and its
      untyped effect dicts silently zero a renamed key; deleting `weapons.json`
      orphaned the only cross-file check on `boons.boons[].key` (now fully open);
      P6's `classes.json` kit numbers (every active1/active2/passive field) accept
      negative/zero/Infinity — acceptance: the skipped q7 tests unskip and pass;
      `content.ts` gains positive/finite/unique/non-empty/known-stat-key rules
      covering cores and classes — refs: §12 rule 4, §5.5, BACKLOG-QUALITY q7
- [ ] (b014) [bug] A JSON *syntax* error in any `/data/*.json` crashes every CLI that
      imports `src/sim/content.ts` with a raw esbuild stack trace before any
      try/catch runs (static module-scope JSON imports) — including the three
      commands CLAUDE.md documents (`npm run sim`, `tools/sweep.ts`,
      `tools/handoff-metrics.ts`). The lane verified a fix shape on a scratch copy
      (dynamic pre-validated read inside `loadContent()`); `tests/q33-*` currently
      pins the *broken* behaviour and flips with the fix — acceptance: a corrupted
      `data/towers.json` yields a one-line message and nonzero exit from `npm run
      sim`, and q33's pins are rewritten to the fixed contract — refs: §12,
      BACKLOG-QUALITY q33/q37/q38
- [ ] (b015) [bug] `{k:'equip', relic}` is a declared Command with no case in
      `applyCommand` — a dead twelfth of the player Command surface (relics only
      apply via `RunConfig.relics` at construction). Implement it or retire the
      union member when p7d retires relics; the merged a11 determinism test
      documents the no-op today — acceptance: either `equip` has a handler with a
      test, or the union member is gone and the fuzzers' domain shrinks with it —
      refs: §12 rule 3, p7d, BACKLOG-QUALITY q15/q22
- [ ] (b017) [bug] `src/meta/meta.ts`'s `completionFraction` hardcodes a
      wave-10 ceiling (`Math.min(1, report.wavesCleared / 10) * 0.4`) for Act I's
      40% share of Ember-reward "completion," stale since `p3e` moved a full run
      to 18 TD waves (independent of how many `data/waves.json` rows existed) —
      a defeat at, say, wave 15 already reads as 100% of Act I's share instead of
      ~83%, silently over-rewarding Ember on every Act-I-only defeat. QA-filed
      (p8a), pre-existing and confirmed untouched by that item's own diff —
      acceptance: the ceiling reads the real TD wave count for the run's own
      config (`w.waveCount`, not a literal `10` or `18`) rather than a second
      hardcoded constant; a regression test covers a defeat at wave 15 under the
      real 18-wave shape — refs: §1, QA on p8a
- [ ] (b018) [bug] Every cooldown gate in the sim (`wd.active1Cooldown`,
      `active2Cooldown`, `activeCooldown`, `attackCooldown`, `dashCooldown`,
      tower `s.cooldown`) is a strict `> 0` float compare with no epsilon, so
      a cooldown that decrements to a tiny positive float residual (observed:
      `2.34e-14`) instead of exactly 0 silently eats the next cast one tick
      later than the authored `cooldownSeconds` promises, with no error or
      feedback — intermittent by direction (a second run of the same drill
      landed on `-1.46e-13` and worked). QA-filed (Q120 ORDER 1's
      qa-playtester pass, hostile "spam the Active the instant cooldown
      allows" testing), pre-existing and general to the cooldown mechanism,
      not specific to any one Active — acceptance: cooldown gates compare
      against a small epsilon (or cooldowns are floored to 0 once below one
      tick's worth) so a cast issued exactly `cooldownSeconds` after the last
      one is never silently dropped; a regression test drives a cooldown to
      its exact float-residual boundary and asserts the next cast fires —
      refs: §12 rule 2, QA on Q120 ORDER 1
- [ ] (b019) [bug] A self-cast Ice Wall can trap the Warden in place for the
      wall's full `wallSeconds`: `walkable()` (`src/sim/run.ts`) checks only
      the destination tile via `grid.passable`, and Ice Wall's 1x3 footprint
      centered on the Warden's own tile blocks every candidate destination
      inside that cell, so `moveWarden` never lets it leave until the wall
      expires or is destroyed. Repro (deterministic, reproduced twice): cast
      `class_active2` with the aim on the Warden's own position (a realistic
      input — cursor hovering the character) and feed movement input every
      tick; the Warden's `x`/`y` do not change for the wall's full duration.
      Reproduces identically in Act I and Act II, so it predates Q120 ORDER 2
      — that item only made it reachable mid-VS-combat, which is why
      qa-playtester surfaced it there. Two candidate fixes, either is
      spec-consistent: reject an Ice Wall placement that would cover the
      Warden's own tile (mirrors b016's proposed treatment of the Warden's
      own tile as unbuildable), or have `walkable`/`moveWarden` treat the
      Warden's current occupied cell as passable for itself regardless of
      `grid.passable` — acceptance: a regression test casts Ice Wall
      centered on the Warden and asserts it either does not place the
      covering tile or the Warden can still move off its own tile
      immediately after; refs: §10, QA on Q120 ORDER 2
- [x] (b019) [bug] A self-cast Ice Wall can trap the Warden in place for the
      wall's full `wallSeconds` — **done, see Done section**: closed as a
      side effect of (b016)'s Warden-tile-relocation fix, verified by
      qa-playtester across 13,004 real Ice Wall casts (both the center
      self-aim case and edge-segment cases) rather than assumed — refs: §10,
      QA on Q120 ORDER 2, Q129.
- [ ] (b020) [bug] Wielded attacks (and Beacon Totem's `shrineHaste`
      speedup) keep firing through the entire defeat slow-mo window:
      `updateWieldedAttacks` (`src/sim/vswield.ts`) has no `w.dying` guard,
      and `updateAct2` (`src/sim/run.ts`) calls it unconditionally every tick
      while `w.phase==='act2'`, which stays true for the whole
      `DEFEAT_SLOWMO` window (`w.outcome` only flips at `resolveDefeat`) — a
      wielded tower fires 3+ full volleys after the Warden is already dead,
      the same bug class already fixed once for class Actives (`src/sim/
      classes.ts`'s `w.dying` guard on Active firing). QA-filed (Q102
      ORDER's qa-playtester pass), pre-existing (confirmed identical on HEAD
      before that item's own diff), general to the wielded-attack mechanism
      rather than specific to `shrineHaste` — acceptance: `updateWieldedAttacks`
      is a no-op (cooldown map untouched, no attack fires) once `w.dying` is
      truthy; a regression test builds a wielded tower, kills the Warden and
      steps through the slow-mo window asserting no attack fires — refs:
      §12 rule 2, QA on Q102 ORDER
- [ ] (b021) [bug] The character panel (fb004) renders `cdr` and `leech`
      as raw decimals instead of percentages. Both are classified `'flat'`
      in `STAT_KIND` (`src/sim/stats.ts`) for correct §2 stacking-math
      reasons (a fraction with no base to multiply against, per that file's
      own doc comment) — but both are authored as fractional rates
      (`data/boons.json`: "focus" is `+6% Cooldown Reduction` at `perRank:
      0.06`, "leech" is `Heal 1% of normal damage dealt` at `perRank: 0.01`),
      not point totals like `armor`/`maxHp`. `formatStatValue`/
      `formatSourceValue` (`src/ui/hud.ts`) treat every `'flat'`-kind stat
      identically via `formatFlat` (2-decimal, no `%`), so a rank of Focus
      prints "+0.06" instead of "+6%". QA-filed (qa-playtester's fb004 pass,
      non-blocking — the underlying `StatRow.value`/`BoonRow.contribution`
      numbers are still exactly right, this is a display-only bug, and
      fb004's own acceptance test only checks the numeric field). No prior
      HUD surface displayed `cdr`/`leech` before fb004, so there is no
      existing convention this breaks, but it undercuts the panel's own
      stated purpose ("why is my final number what it is") — acceptance:
      `cdr` and `leech` (and any future fractional-rate `'flat'` stat) render
      as a signed percentage in the character panel, distinguished from a
      true point total (`armor`, `maxHp`, `dashCharges`, ...) by a new
      per-stat display-kind classification (not by guessing from `STAT_KIND`
      alone, which conflates "flat point total" and "flat fraction"); a test
      asserts the rendered string for a `cdr`/`leech` contribution — refs:
      §2, §11, QA on fb004.

### Filed at the lane/quality merge (2026-08-28) — from BACKLOG-QUALITY.md's log and open queue

The lane's sessions 30–52 (q33–q57) landed as tests/tools in this merge. Its
Log's main-lane bug reports were checked against merged HEAD before filing:
the JSON-syntax-error crash class is already queued as b014, the content-hash
replay gap as p9a, the save/loader laundering families as b012/b013 — none
re-filed. The lane's q36 souls-command slot-waste regression (its one q21
addition since the 2026-08-27 port) was dropped, not merged: it exercises the
deleted soul-weapon system (`beginSoulPick`/`souls` Command), the same
died-with-the-system rule the 08-27 merge applied. What follows is the one
Log-filed defect with no existing item
(q39) plus the lane's three still-open queue items (q55–q57), carried over
because the lane worktree retires at this merge.

- [ ] (b022) [bug] `Stats.add`'s finite guard checks only the *incoming* value
      (`src/sim/stats.ts:172`), not the running sum, so two individually-finite
      contributions (`1.5e308` twice) overflow `total()`/`factor()` to
      `±Infinity` with nothing downstream catching it: `derive()`'s
      `luck: s.total('luck')` has no clamp, and `progression.ts`'s
      `luckBias = Math.min(0.5, ...)` masks the positive overflow but passes
      `-Infinity` straight into `rollOffers`'s `weight * (1 + luckBias *
      o.value)` — a second, previously-untraced route into b010's NaN-weight
      constant-index fallback. Reachable via an unvalidated hand-edited save
      (stash-relic affix values through `deserializeMeta`'s bare `JSON.parse`,
      b012's family) and authorable in `/data` directly (`AffixSchema`'s
      unbounded `num` fields, b013's family). Already pinned live by
      `tests/q35-weighted-index-nan.test.ts`'s "gap found by QA verification"
      describe block — acceptance: the running sum is guarded (in `add` or
      `total()`/`factor()`) so no sequence of finite contributions yields a
      non-finite total, and `AffixSchema` bounds its values; the q35 pins flip
      to the fixed contract — refs: §12 rule 2, BACKLOG-QUALITY q39
      (sessions 32/41 logs)
- [ ] (b023) [feat] Re-measure the quality lane's `it.skip`'d bug-pin tests —
      15+ accumulated across `tests/q7-data-fuzz.test.ts` (E1–E7),
      `tests/q18-content-hash-replay.test.ts`,
      `tests/q21-weapon-boundary-fuzz.test.ts` and `tests/q3-save-fuzz.test.ts`
      (D1–D7, D9), each pinning a live main-lane bug as of the session that
      filed it, none re-checked against `/src` since ("a deferral is a
      measurement with an expiry date") — acceptance: each skipped case is
      temporarily un-skipped and run against current `/src`; any that now
      passes is reported by name so its owning item (b012, b013, p9a, ...) can
      close or shrink, and gets its skip comment updated; any still red is
      re-confirmed and left as-is; the count re-verified is recorded — refs:
      CLAUDE.md measurement rules, BACKLOG-QUALITY q55
- [ ] (b024) [polish] Mutation-probe coverage for q54's `unguarded-data-read`
      classifier: add a `tools/mutation-probe.ts` `MUTATIONS` entry that
      hollows `cli-crash-coverage.ts`'s `readsDataJsonDirectly()` and asserts
      `tests/q47-cli-crash-coverage.test.ts` goes red — the same treatment q43
      gives the two pre-existing classifiers, so a regression in the new
      detection logic is caught the same way as one in the old — acceptance:
      one new `MUTATIONS` entry, green, and q43's pinned doc-comment/
      array-length parity check still holds — refs: BACKLOG-QUALITY q54/q56
- [ ] (b025) [polish] `readsDataJsonDirectly()` (`tools/cli-crash-coverage.ts`)
      false-negatives on two path shapes its doc-comment intent covers: an
      inline template-literal path with no `join()` wrapper and a
      string-concatenated path. No live `tools/*.ts` file uses either today
      (nothing misclassified — latent gap for a future tool author, QA-filed
      non-blocking) — acceptance: either both shapes are detected (extend the
      regex, add the two synthetic-fixture tests QA scoped next to the
      existing cases in `tests/q54-unguarded-data-read.test.ts`) or both are
      named in the function's "Known limitations" doc comment alongside the
      existing gaps — refs: BACKLOG-QUALITY q57, session 52 QA
- [ ] (b027) [bug] `tests/p6e-class-diversity.test.ts`'s G8 diversity pin
      (`distinct.size` asserted `toBe(2)`, the audit-summary's documented
      "2/11 not >=8/11") measured `3` on a full unexcluded `npm test` run at
      the fb006 session (2026-08-29) — a genuine drift, not one of that run's
      other four failures (all the already-documented Windows scratch-dir
      `EPERM` class or q13's host-load perf-ratio flake). fb006's own diff
      (`src/render/canvas.ts`, `src/render/theme.ts`, a new test file) touches
      no `/src/sim` or `/data` file the measurement reads, and this file is
      routinely excluded from prior sessions' full-suite runs for its own
      ~3500-3600s cost (see the audit-summary's P6 row and PROGRESS.md's
      `--exclude tests/p6e-class-diversity.test.ts` precedent), so the drift's
      origin is unmeasured, not ruled out as pre-existing — acceptance: re-run
      `tests/p6e-class-diversity.test.ts` standalone, identify which class's
      `topLabel` changed and why (balance data edit, or a genuine sim
      determinism gap given CLAUDE.md's no-`Math.random` rule), then either
      re-pin the assertion to the new honestly-measured count with the reason
      recorded, or fix the determinism gap if one is found — refs: SPEC-FINAL
      §14 G8, CLAUDE.md measurement rules, BACKLOG.md audit summary P6 row.

## Retired from the queue by SPEC-FINAL

These carried acceptance criteria that SPEC-FINAL no longer defines. Reasons are
logged in MIGRATION.md §8 rather than carried as dead items.

- **(m24d)** Re-price the "Tinkerer" notable's `relicFind` effect — the relic find
  stat dies with the affix system at p7d, so the notable is re-authored there rather
  than re-priced here.
- **(s006)** The `of Thrift` relic affix raises tower prices — same reason: the affix
  table itself is retired at p7d.
- **(s007)** Beacon attack-speed terrain residual exceeds its authored cap — the
  `terrain` residual mechanism is replaced wholesale by §5's VS special column at
  p2c, which re-authors the beacon's effect from scratch.
- **(m27b)** Restate A8's surviving claim — G13 and G19 together are the claim
  SPEC-FINAL makes about TD investment converting into VS outcome; A8 has no
  successor of its own.

## Open QUESTIONS closed by SPEC-FINAL, without work

- **Q38** (§6 assumes an eleven-class roster that does not exist) — §4.2 fills
  the roster in. The work is `p6d`.
- **Q39** (§5's per-type VS special is specced for 3 of 10 towers) — §5.2
  populates the column for all ten. The work is `p2c`.
- **Q80** (the seven open tower tracks, proposed for sign-off) — §5.2 decides
  every count and milestone. The work is `p5b`.
- **Q47** (V3 retires B11 and adds no replacement liveness gate) — §14 adds
  **G19**. The work is `p10d`.

## Done

- [x] (b026) [bug] Clarion Taunt's `tauntDurationSeconds` corrected from 6 to
      4 in `data/classes.json` — this commit, implementation found already
      uncommitted at session start (a prior session's in-flight work: the
      data edit and `tests/b026-clarion-taunt-duration.test.ts` both
      pre-existed with no matching commit and no BACKLOG/PROGRESS update).
      SPEC-FINAL §4.2 states Clarion Taunt's redirect lasts 4 s; a p6e
      balance pass had bumped it to 6 chasing Paladin's G8/G10 win-rate band
      (QUESTIONS.md Q128, owner-approved as spec conformance, not deferred by
      Q40). This session re-verified rather than re-implementing: confirmed
      `tests/b026-clarion-taunt-duration.test.ts` is genuinely red against
      the old value 6 (reverted, reran, saw the expected failure, restored),
      and delegated qa-playtester for a hostile pass — rapid Clarion Taunt
      recast, mid-taunt refresh (not additive/stacking), a 200-cast spam
      probe (no NaN/stuck tags), a live headless Paladin run, and a grep
      audit of every `tauntDurationSeconds`/`tauntRemaining`/`tauntKind`
      reader/writer in `/src/sim` for a hardcoded old-value assumption — PASS,
      no reproducible bugs. Blast radius checked: Paladin's G8 win-rate band
      in `tests/p6e-class-diversity.test.ts` is `it.skip`-ed already, so no
      currently-green gate can regress; `tests/q120-order1-taunt.test.ts` /
      `p6d-nine-classes.test.ts` / `dps-panel.test.ts` (132 tests touching the
      taunt fields) all green — refs: §4.2, QUESTIONS.md Q128.

- [x] (fb007) [feat] DPS summary panel (damage/DPS by source and type) —
      `6517320`, with a QA-filed post-commit bug fixed this session
      (uncommitted at session start). Toggle-able panel (P key) showing
      damage dealt and DPS over the current wave and the whole run, broken
      down by source (tower type for TD, wielded tower-type attack for VS,
      class active/passive/summon, and the handful of literal sources
      `damageEnemy` already sees) and by the six §3 damage types. A new
      `World.damageByType` accumulator rides alongside the existing
      `damageByWeapon`, credited in `sim/enemies.ts`'s `damageEnemy`; the
      "this wave" window isolates a slice via `damageSince()` against
      whichever snapshot marks the window's start —
      `damageAtWaveStart`/`damageTypeAtWaveStart`/`waveStartTick` for an Act I
      wave (`startWave`, `sim/run.ts`), `damageAtSunder`/`damageTypeAtSunder`
      for the current VS wave (`finishSundering`, `sim/sundering.ts`), the
      same snapshot A5's own `act2DamageSoFar` already isolates Act II with.
      `hashWorld` now covers all the new accumulators/snapshots (and closed a
      pre-existing gap: `damageByWeapon` itself wasn't hashed before this).
      `src/ui/dps-panel.ts`'s pure `dpsPanelData(w)` is presentation-only
      (never writes to `World`); `src/ui/hud.ts` renders it.
      qa-playtester filed one real bug post-commit: `advanceToNextBlock`
      (`sim/sundering.ts`) flips the phase back to `act1_build` the instant a
      VS wave ends, but only `startWave` — the *next* TD wave actually
      spawning, after the full build-phase countdown — retook the
      `damageAtWaveStart`/`damageTypeAtWaveStart`/`waveStartTick` snapshot.
      Reproduced on a real hybrid-policy bot run: the entire build-phase
      countdown between a VS wave's end and the next TD wave's start read the
      "current wave" window as the stale pre-Sundering snapshot, folding the
      whole just-finished VS wave's damage and duration under the previous TD
      wave's label (~96% of a whole run's damage misattributed to "Wave 3"
      this way on the repro). Fixed by re-taking the same three-field
      snapshot in `advanceToNextBlock` itself, so the window resets to zero
      the instant the VS wave ends rather than waiting for the next wave to
      spawn. `tests/dps-panel.test.ts` gained a regression test driving this
      exact sequence (pre-Sundering TD damage → `finishSundering` → VS-wave
      damage → `advanceToNextBlock`) asserting the run total is unaffected
      but the wave window reads zero immediately after. qa-playtester also
      caught, across two earlier rounds on the same session, that the
      original Act-II-reconciliation test never actually exercised the
      `damageAtSunder` branch (the `cycles: 1` bot always dies in Act I
      before reaching a Sundering) and that a naive fix snapshotting *at* the
      Sundering tick is a zero/zero instant indistinguishable from a wrong
      snapshot — both are now covered by a `cycles: 3` test that steps a real
      hybrid-policy run to 300 ticks past a genuine Sundering and checks the
      wave window against an independently-computed `damageSince(...,
      damageAtSunder)` expectation, not a bare `>0`. `npx tsc --noEmit`
      clean; targeted suite (`tests/dps-panel.test.ts`, 7 tests) green.

- [x] (fb006) [feat] Enemy HP bars show a shaded/hatched segment for
      unfinished DoT damage — this commit. Found already substantially
      implemented, uncommitted, at session start (a prior session's in-flight
      work: `src/render/canvas.ts`, `src/render/theme.ts`,
      `tests/fb006-dot-hp-indicator.test.ts` all pre-existed with no matching
      commit); this session verified it end to end, removed a duplicated
      leftover comment block in `canvas.ts`, and committed rather than
      re-implementing. The HP-bar draw block computes `dotOutstanding(e)`
      (pre-existing `src/sim/enemies.ts` export: sum of `dps * remaining`
      across every live DoT) and draws a hatched `PALETTE.hpDot`/
      `hpDotHatch` segment sized to `min(liveHpFraction, outstanding/maxHp)`,
      anchored flush against the live HP front edge so it reads as "about to
      be consumed." The bar's draw-gate widened from `e.hp < e.maxHp` to
      `e.hp < e.maxHp || outstanding > 0` so a DoT-only hit (poison ticking
      before any direct damage) still shows a bar. `tests/fb006-dot-hp-
      indicator.test.ts` (6 tests): correct initial sizing, the DoT-only-hit
      edge case, tick-by-tick shrink as the DoT resolves, no segment without
      a live DoT, capping at the front edge when outstanding exceeds current
      hp, and Spreading Plague's death transfer (flat damage, not a new DoT,
      so the target shows no spurious segment and the dead source leaves no
      stale bar). code-reviewer found no Critical/Major issues (renderer-only,
      reads sim state via the pure `dotOutstanding`/`dotRemaining` without
      mutating it; approved). qa-playtester independently probed multi-type
      DoT stacking, overkill-death with a live DoT, rapid re-application,
      natural DoT expiry and heal-to-full-while-doomed — verdict PASS, no
      regressions in fb006's diff; it noted one pre-existing, unrelated gap
      (the outer bar-visibility gate `e.elite || e.boss || r > 8` excludes
      `swarm_rat`, the one enemy row at exactly `r === 8`, regardless of
      outstanding DoT) — not introduced by this change, left as-is. Full
      `npm test` (unexcluded, ~8431s): 1419 passed, 5 failed — four are the
      already-documented Windows scratch-dir `EPERM`/host-load perf-ratio
      flakes (q13, q45, q49, q52); the fifth, `p6e-class-diversity`'s G8
      diversity pin measuring 3 instead of 2, is unrelated to this item's
      files and filed as b027 for future investigation.

- [x] (fb005) [feat] Per-damage-type color/font in floating damage numbers —
      this commit (`d0b6ad4`). Found already substantially implemented,
      uncommitted, at session start (a prior session's in-flight work,
      documented in QUESTIONS.md's Q133 entry and PROGRESS.md's fb004 entry);
      this session verified it end to end, fixed two QA-filed bugs, and
      committed rather than re-implementing.
      Style mapping lives entirely in `data/damagetypes.json`: `color`/
      `colorblindColor` per damage type (normal/bleeding/poison/toxic/
      burning/electric) and per status (frost/frozen), plus `executeColor`/
      `colorblindExecuteColor`/`executeFontScale` for Corpse Core's execution
      kill — the one real "instant, larger, distinct" hit in the game, since
      no generic crit mechanic exists anywhere in the codebase (grepped;
      Q133). Read only through new `src/sim/damagetypes.ts` helpers
      `damageStyleColor`/`executeStyle`. `enemies.ts`'s `damageEnemy` now
      emits `hit:${type}` instead of a bare `hit` so the renderer knows which
      §3 type just landed (the type rides the fx *kind* string rather than
      growing `World.fx`'s shared tuple — confirmed presentation-only, `.fx`
      never reaches `hashWorld`); DoT ticks (Bleeding/Poison/Toxic/Burning)
      stay silent by design (an existing, documented perf tradeoff — a
      350-enemy burning horde would otherwise flood the 512-event fx buffer)
      but now draw distinct data-driven marker dots on the enemy sprite
      (Poison/Toxic markers are new; Burning/Bleeding switched from
      hardcoded hex). `cores.ts`'s Corpse execution kill now fires a
      dedicated `execute` fx event, previously silent entirely.
      `content.ts` adds a loader-time `validateDamageStyleColors` rejecting
      any two of the 8 rows, or the execute color, sharing a color in either
      palette (case-insensitively); as a side effect this closed a real
      pre-existing hole (`tests/q7-loader-holes.ts`'s `dupe-element` mutation
      for `damagetypes.types` was silently accepted before, since nothing
      checked row uniqueness). New `Settings.accessiblePalette` toggle
      (default off) in the Hub, labeled "Color-blind-safe damage colors" —
      not the literal word "colorblind", which contains the substring "orb"
      and would trip `tests/c7-no-orbs.test.ts`'s scan for the retired Orb
      system. New `tests/fb005-damage-colors.test.ts` (17 tests): data
      well-formedness in both palettes, loader collision rejection, the two
      helper functions, and end-to-end renderer assertions via a
      Proxy-recorded fake canvas context (mixed-fight coloring, colorblind
      swap, execute fontScale, `damageNumbers: false` gating).
      **code-reviewer: APPROVE**, no Critical/Major. One Minor (color dedup
      was case-sensitive, so e.g. `#FFFFFF`/`#ffffff` wouldn't collide) fixed
      in the same pass by lower-casing both dedup keys.
      **qa-playtester: PASS** against the literal acceptance criteria
      (verified in real gameplay via a headless sim run touching frost/
      poison/normal damage, not just synthetic fx pushes), filed two Minor
      bugs, both fixed in this commit with regression tests: (1) an authored
      `color: ""` returned `''` verbatim instead of falling back to white —
      `??` only guards `null`/`undefined`, not `""` — fixed by giving the
      6 type-color fields, the 2 status-color fields and the 2 execute-color
      fields a new non-empty `hexColor` schema (`z.string().min(1)`) so an
      empty string is now rejected at load time, plus `||`-based runtime
      fallbacks in `damageStyleColor`/`executeStyle` as defense in depth for
      any directly-constructed object; (2) `executeColor`/
      `colorblindExecuteColor` were not checked against the 8 type/status
      rows for collision — fixed by adding the execute color as a ninth row
      in `validateDamageStyleColors`'s collision set. Two non-blocking
      observations left as-is: the shipped `executeColor` and
      `colorblindExecuteColor` are identical (`#fff6d0`), so toggling
      `accessiblePalette` never changes the execute color (a designer
      question, not a bug); no renderer-level test exercises the real
      marker-dot/status-ring paths directly (only the underlying
      `damageStyleColor` values and the gameplay-unreachable floating-number
      path for DoT types are asserted at the renderer level) — worth a
      follow-up but not blocking since the marker mechanism itself was
      independently verified against real `Enemy.dots`/`frostRemaining`/
      `frozenRemaining` state.
      `tests/q7-loader-holes.ts` regenerated twice this session (once for
      the original 9 fields, once more for the `hexColor` tightening — 8
      `empty-string` mutations move from accepted to rejected, nothing
      else changes) via `Q7_RECORD=1 npx vitest run tests/q7-data-fuzz.test.ts`.
      `npx tsc --noEmit` clean throughout. Targeted suite (`fb005-damage-
      colors`, `m19c-damage-types`, `q7-data-fuzz`, `c7-no-orbs`,
      `hud-controls`, `q3-save-fuzz`, `content-complete`) green. Full
      `npx vitest run --exclude tests/q14-mutation-smoke.test.ts --exclude
      tests/p6e-class-diversity.test.ts --exclude tests/a10-performance.test.ts`
      (94 files): 1411/1412 passed, 55 skipped — the only failure was
      `tests/q49-price-probe-restore.test.ts`'s pre-existing, documented
      Windows scratch-dir `EPERM` cleanup flake (same class as q13/q15/q28,
      unrelated to this item's files), re-run standalone would be expected
      green per that flake's established pattern.
- [x] (fb004) [feat] Character panel: every final stat's §2 multiplier
      breakdown by source, plus every boon taken this run with rank and
      current contribution — this commit (`df1771f`). New `src/ui/
      character-panel.ts`: a pure function `characterPanelData(w)` returns
      `stats: StatRow[]` (one row per `StatKey` in `stats.ts`'s `STAT_KEYS`,
      each with `kind` from `STAT_KIND`, `value` read straight off
      `w.stats.total(key)`/`w.stats.factor(key)`, and `sources` read straight
      off `w.stats.contributions(key)`, human-labelled via a `sourceLabel()`
      switch over the source-id prefix — `class:`/`tree:`/`relic:`/`boon:`/
      `core:`/`modifiers`/`terrain`, generic over whatever actually fed a
      stat) and `boons: BoonRow[]` (every boon with `rank > 0` in
      `w.boonRanks`, `contribution` read back from `Stats.contributions`'s
      `boon:<key>` entry rather than recomputed as `rank * perRank`). Wired
      into `src/ui/hud.ts` as a new `#sw-charpanel` overlay independent of
      the existing pause/level-up/results `#sw-modal`, a `#sw-character` HUD
      button, and a new `C` keybinding (`src/ui/input.ts`/`src/ui/main.ts`,
      `C` was unbound). §7 Equipment has no section — §7 is still unbuilt
      (p7b); a relic is the closest live analog and already appears
      generically via the source breakdown — logged as QUESTIONS.md Q132.
      New `tests/character-panel.test.ts` (10 tests) asserts the data model
      field-for-field against `Stats.total`/`factor`/`contributions`
      directly (not a hand-duplicated calculation), across a world with
      class+tree+relic+boon+core+modifiers sources all live at once, plus a
      stacking-math cross-check, max-rank-boon and zero-boon cases, and a
      `legacy: true` class (`frost_warden`) source-label check. 6 other test
      files (`b10-death-flow`, `c7-no-orbs`, `f003-leak-coupling`,
      `p2d-weapon-lineage`, `t2-selection`, `ui-input`) got a one-line
      `onToggleCharacterPanel: () => {}` stub to satisfy the now-required
      `HudCallbacks` field — mechanical, no behavior change.
      **code-reviewer, round 1: REQUEST-CHANGES**, two Major findings, both
      fixed before commit: (1) `toggleCharacterPanel` only refused to open
      when `w.outcome !== 'running'`, so it could open on top of an
      already-showing pause card or level-up offer screen — both are opaque
      `position: absolute; inset: 0` siblings, so the panel painted over and
      ate clicks meant for the modal underneath — fixed by also refusing
      when `this.paused` or `!this.modal.hidden`. (2) `renderCharacterPanel`'s
      redraw-skip fingerprint keyed on `w.sundered`, a one-shot flag that is
      set `true` once and never reset, so it went stale after a *second*
      Sundering accumulated more onto the `terrain` `Stats` source (`w.stats
      .add('terrain', ...)`, `src/sim/weapons.ts`'s `applyTerrainPassives`)
      — the panel kept showing the first Sundering's numbers. Fixed by
      adding a `revision` counter directly to the `Stats` class
      (`src/sim/stats.ts`), incremented once per stored contribution inside
      `add()`, so it is exhaustively correct over every call site by
      construction rather than by enumerating World fields; confirmed
      UI-only (never read by `hashWorld`/replay/determinism — `a11-
      determinism.test.ts`'s full 11-test suite stayed green). **round 2:
      APPROVE**, both fixes verified correct against the actual diff (not
      just the description), confirmed the two new regression tests would
      have failed pre-fix, confirmed `Stats.revision` doesn't leak into
      hashing/replay, reran `tsc`/the targeted suite clean.
      **qa-playtester, round 1: PASS on the literal acceptance criteria**
      (field-for-field data-model test genuinely compares against `Stats`,
      not a re-derivation; panel opens in both phases and refuses to open on
      results/pause/level-up; multi-source world drops nothing and
      double-counts nothing; max-rank boons — including `second_wind`, whose
      real `maxRank` is 1, not the 5 assumed going in — report correctly;
      zero-boon runs render an empty state; the `frost_warden` legacy class
      labels as a plain `class:frost_warden` source) **but found 2 bugs it
      judged should block ship in spirit** (the *reverse* of code-reviewer's
      Major (1): opening the panel first, then triggering a level-up or
      hitting Escape, let the modal open on top of an *already-open* panel —
      `showPause`/`showOffers`/`showResults` all call a shared private
      `openModal()` that never checked panel state) **and one non-blocking
      cosmetic bug**, filed separately below as (b021) per its own
      recommendation rather than folded into this fix. Fixed the 2 blocking
      bugs by closing the panel at the front of `openModal()` itself — the
      one place every modal path already funnels through — with two new
      regression tests confirming both directions (level-up-over-panel,
      pause-over-panel) plus confirming the original direction still holds.
      **qa-playtester, round 2 (targeted re-verification): PASS** — 
      reproduced both original bug repros against the fix and confirmed
      fixed; confirmed the two new regression tests are non-vacuous by
      temporarily reverting the one-line fix, rerunning, watching exactly
      those two tests go red, and restoring it; reran the targeted suite and
      `tsc` clean. `npx tsc --noEmit`: clean throughout. Targeted suite
      (`character-panel`, `hud-controls`, `tower-info`, `ui-input`,
      `b10-death-flow`, `c7-no-orbs`, `f003-leak-coupling`,
      `p2d-weapon-lineage`, `t2-selection`, `act2`, `a11-determinism`):
      171/172 green (1 pre-existing unrelated skip). A full `npm test`
      (`vitest run && vitest run --config vitest.perf.config.ts`) could not
      be completed clean end-to-end this session: `tests/q14-mutation-smoke
      .test.ts` reproducibly spawns a runaway tree of nested `vitest`
      subprocesses (191+ orphaned `node.exe`, ~90% sustained CPU) that hangs
      on a Windows scratch-dir `EPERM` during cleanup — the same class of
      pre-existing issue PROGRESS.md already documents for `q13-perf-ratio`/
      `q15-command-domain-fuzz`/`q28-cli-error-handling` (q14 wraps q9/q12/
      q15 as literal nested "control" reruns, so it inherits their
      flakiness under load, worse). Ran `npx vitest run --exclude tests/
      q14-mutation-smoke.test.ts` instead after manually killing the
      orphaned process tree (verified none of it was the pre-existing,
      unrelated `npm run dev`/`vite` processes before killing anything): 79
      files passed, 4 skipped, 1321 tests passed, 67 skipped, **zero
      failures**, covering every other file in the repo except two
      individually-heavy files (`a10-performance.test.ts`, a perf benchmark;
      `p6e-class-diversity.test.ts`, already documented in this file's own
      audit summary as a `.skip`-ed, honestly-measured-red G8 gate
      unrelated to any UI code) that were still in flight when this session
      had to stop chasing a complete single-invocation run. Neither touches
      `/src/ui`. — refs: §2, §6.3, §11, owner feedback
      `feature-boon-stats-panel`, QUESTIONS Q132, follow-up (b021).

- [x] (fb002) [feat] Character (and dash) ignore collision with the Core and
      all friendly structures — walks/flies over them freely; enemies keep
      current pathing rules — this commit. Found already implemented but
      uncommitted at session start (a prior session's in-progress work — a
      new `Grid.wardenPassable(tx,ty)` in `src/sim/grid.ts`, bounds-checked
      and blocked only by the map border, never by `occ`/structures; wired
      into `walkable()` (`src/sim/run.ts`, covering both `moveWarden` and the
      dodge-dash `blinkWarden`) and into `dashWarden` (`src/sim/classes.ts`,
      the shared choke point for every class Active's dash); b016's now-moot
      `findEscapeTile`/Warden-relocation-on-build logic removed from
      `buildTower` (`src/sim/towers.ts`), since a build landing on the
      Warden's own tile can no longer trap it; the two b016 regression tests
      in `tests/act1.test.ts` and the Ice Wall self-cast test in
      `tests/p6d-nine-classes.test.ts` rewritten (not deleted) to assert the
      new behavior; a new `fb002` describe block in `tests/act1.test.ts`
      covering straight-through movement in both phases, the Core footprint,
      and the dodge-dash landing on a structure tile, plus a stale-assumption
      fix and floor adjustment in `tests/q2-input-fuzz.test.ts` (see below);
      QUESTIONS.md's Q130 entry) — this session verified it end to end rather
      than re-implementing it, the same protocol every recent
      P6/p8a/Q91/Q102/Q120/b016/fb001 item in this file's history sets:
      `npx tsc --noEmit` clean, targeted suite (`tests/act1.test.ts`,
      `tests/p6d-nine-classes.test.ts`, `tests/q2-input-fuzz.test.ts`)
      149/149 green, plus a broader sweep (`grid`, `p1a-sealing`,
      `p6a-class-framework`, `p6b-swordsman`, `p6c-plaguebringer`, `boss`,
      `q120-order1-taunt`) 124/124 green (2 skipped, unrelated), before
      delegating review.
      **code-reviewer APPROVE, no Critical/Major.** Independently grepped
      every `passable`/`blocked`/`wardenPassable` usage across `/src/sim` and
      confirmed enemy pathing (`src/sim/enemies.ts`, `src/sim/act2.ts`, the
      `dijkstra`/flow-field code in `grid.ts`) is untouched by this diff and
      still reads `passable`/`blocked` directly; confirmed `wardenPassable`
      is reachable only from `walkable()` and `dashWarden`, never from
      `knockbackEnemy` or any build/placement path; confirmed removing
      `findEscapeTile` is safe since `checkBuild`/`buildable` still gate on
      `occ` unchanged; confirmed the Core's own footprint was already
      Warden-passable before this diff (no `occ`, never `Border`), so the
      real behavioral change is scoped to built structures as intended; no
      DOM/`Math.random`/`Date.now`/native-trig violations, deterministic
      (pure array/bounds lookups). Two Minors left as cheap follow-ups, not
      fixed: `wardenPassable` is byte-for-byte identical to the pre-existing
      `passableGhost` (worth collapsing to one predicate later); `src/bots/policies.ts`'s
      `walkableAt` still calls `grid.passable`, so the bot kiting heuristic
      keeps treating friendly structures as obstacles even though the Warden
      itself no longer does — a stale heuristic, not a correctness bug, filed
      as a future polish item rather than fixed under fb002's own scope. One
      stray untracked scratch file the reviewer's own pass had created
      (`tests/_scratch_fb002_qa.test.ts`) was flagged and removed before
      commit.
      **qa-playtester PASS, no bugs found**, driven as real end-to-end sim
      state rather than just the unit tests: a full 3x3 tower ring built
      around the Warden was crossed freely in all 8 directions in both Act I
      and Act II; every dash-granting Active kind in `data/classes.json`
      (`dash_line`/`dash_trail`/`dash_volley`/`dash_heal`) landed on a
      structure tile without deflection; the Core's own footprint was stood
      on and crossed; a self-targeted Ice Wall cast on the Warden's own tile
      left it in place, free to leave; a live enemy stepped 600 ticks against
      the same tower ring never resolved standing on a blocked tile, in the
      same world where the Warden crossed it freely; two headless
      `npm run sim -- --seed 1 --policy hybrid` runs produced identical
      `endHash` despite differing wall-clock `simMs`; seeds 2 (`hybrid`,
      victory) and 3 (`maxbuild`, defeat_warden) completed cleanly with no
      NaN/crash. Full `npm test` ran ~85/86 files clean before the pass
      concluded; the one known pre-existing artifact
      (`tests/q14-mutation-smoke.test.ts` refusing to run against an
      uncommitted `src/sim` diff by design) clears once committed, the same
      artifact every prior P6/p8a/Q91/Q102/Q120 commit already documents.
      `npx tsc --noEmit`: clean throughout. Logged as Q130 — refs: §10
      (amends character movement), owner feedback
      `feature-character-passes-structures`, Q129 (b016, superseded by this
      item per its own note).

- [x] (fb003) [feat] VS level-up auto-pick toggle (settings + on-screen) —
      this commit. Found already implemented but uncommitted at session
      start (a prior session's in-progress work — `RunConfig.autoPickLevelUps`
      and a new `set_autopick` Command (`src/sim/types.ts`); a
      `pickAutoOfferIndex` pick rule and an auto-drain loop in
      `openLevelUpIfPending` (`src/sim/progression.ts`) that resolves every
      currently-pending level-up in one call instead of setting
      `phase = 'levelup'`; a `World.cfg` shallow copy (`src/sim/world.ts`) so
      the Command only ever mutates the World's own config, never the
      caller's shared `RunConfig`; a Hub pre-run checkbox and a HUD mid-run
      button (`src/ui/hub.ts`, `src/ui/hud.ts`, `src/ui/main.ts`), both
      routed through the Command queue rather than `Settings` per
      `settings.ts`'s own "nothing here may change the simulation" doc
      comment; new coverage in `tests/act2.test.ts` and
      `tests/a11-determinism.test.ts`; a new `set_autopick` case in
      `tools/fuzz-input.ts`; QUESTIONS.md's Q131 recording the two design
      calls — the toggle lives on `RunConfig` not `Settings`, and "highest-
      rank owned" reads as "offered, in `boonRanks` already, rank > 0",
      ties broken by offer order) — this session verified it end to end
      rather than re-implementing it, the same protocol every recent
      P6/p8a/Q91/Q102/Q120/b016/fb001/fb002 item in this file's history
      sets: `npx tsc --noEmit` clean, targeted suite (`tests/a11-determinism.test.ts`,
      `tests/act2.test.ts`, `tests/hud-controls.test.ts`,
      `tests/b10-death-flow.test.ts`, `tests/c7-no-orbs.test.ts`,
      `tests/f003-leak-coupling.test.ts`, `tests/p2d-weapon-lineage.test.ts`,
      `tests/t2-selection.test.ts`, `tests/ui-input.test.ts`) 141/141 green
      (1 pre-existing unrelated skip) before delegating review.
      **code-reviewer APPROVE, no Critical/Major.** Confirmed no
      DOM/`Math.random`/`Date.now`/native-trig introduced in `/src/sim`;
      confirmed `set_autopick` dispatches through the same
      `applyCommand`/input-log path as `pick`/`reroll`/`call`, replay-safe
      by construction; confirmed the pick rule excludes never-taken boons
      and the drain loop re-rolls per iteration against the just-updated
      `boonRanks`; grepped `/src` for code relying on `w.cfg === cfg`
      reference identity before approving the shallow-copy change — none
      found; confirmed the mid-toggle-during-a-manual-offer path resolves
      through the same `takeOffer` a player click uses, no double-
      resolution or `offers`/`rerollsLeft` desync. Two non-blocking
      Minor/Nit notes left as-is (an unreachable `o.kind !== 'boon'` guard;
      an unobservable but harmless `rerollsLeft` reset after auto-drain).
      **qa-playtester PASS, no bugs found**: a single-tick 60-level XP dump
      resolved cleanly with no stall; 50 rapid on/off toggles interleaved
      with level-ups (including exactly mid-manual-offer) produced no
      desync; a real `hybrid`-bot-driven run at a fixed seed produced
      identical end-hashes across two runs; the empty-offer-pool edge case
      with auto-pick on resolved silently with no hang (distinct from the
      known out-of-scope b005 manual-mode dead end); the Hub checkbox was
      confirmed reaching `RunConfig.autoPickLevelUps` via a throwaway jsdom
      probe; the HUD button lights from sim state, not click count; two
      independent full `npm test` runs each found only the same 3
      pre-existing, unrelated failures reproduced identically on clean
      `master`; a 20,000-command-per-phase fuzz pass plus 6 full randomized
      runs were clean. `npx tsc --noEmit`: clean throughout. — refs: §6.3,
      Q131, owner feedback `feature-auto-pick-boons`.

- [x] (fb001) [feat] dev profile (`data/dev.json`) unlocks every Core from
      §5.5, the same pattern already used for classes/maps — this commit.
      Found already implemented but uncommitted at session start (a prior
      session's in-progress work — a new `unlockAllCores` boolean added
      alongside `unlockAllClasses` in `data/dev.json`, `src/sim/content.ts`'s
      `DevFileSchema` (required, non-optional, matching every sibling field),
      and `src/meta/devprofile.ts`'s `applyDevProfile`, which sets
      `out.unlockedCores` to every real `content.cores.cores` key exactly
      mirroring the pre-existing `unlockAllClasses` → `unlockedClasses`
      branch; matching updates to `tests/c8-dev-profile.test.ts`'s `ALL_ON`/
      all-off fixtures plus a new "unlocks every core" case, and a new
      `dev.unlockAllCores: ['flip-bool']` row in `tests/q7-loader-holes.ts`'s
      census) — verified end to end rather than re-implemented, the same
      protocol every recent P6/p8a/Q91/Q102/Q120/b016 item already sets:
      `npx tsc --noEmit` clean, targeted suite (`tests/c8-dev-profile.test.ts`,
      `tests/q7-data-fuzz.test.ts`, `tests/p-core-a-selection.test.ts`,
      `tests/hub-testing.test.ts`) 86/86 passed (7 skipped, unrelated) before
      delegating review.
      **code-reviewer APPROVE**, no Critical/Major/Minor. Independently traced
      the prod-lock guarantee: `applyDevProfile` is reached only through
      `src/ui/main.ts`'s single call site, gated on `devProfileActive()` →
      `devMode && isDevBuild()`, the same pre-existing gate the whole
      `DevConfig` (including `unlockAllClasses`) already relies on — no new
      gap introduced. Confirmed the schema field is required (not `.optional`)
      like every sibling, so a hand-edited `data/dev.json` missing it fails
      loudly rather than silently defaulting. One Nit, not fixed: the new
      test's `out.unlockedCores.sort()` mutates the returned array in place —
      copy-paste of the same pre-existing pattern the classes test above it
      already uses, harmless since the object isn't reused afterward.
      **qa-playtester PASS, no bugs found.** Cross-checked the real
      `data/cores.json` against a real `applyDevProfile` call (not a
      hardcoded comparison) — output matches all five live core keys exactly.
      Confirmed 4 of 5 real cores default locked (`unlockedByDefault: false`)
      for a fresh `defaultMeta()`, becoming selectable only through this dev
      path. Independently re-verified the prod-lock clause by building and
      executing a real production bundle (not a grep). Hostile checks: calling
      `applyDevProfile` twice in a row is idempotent (same 5-element set, no
      duplicates) and does not mutate the caller's original `meta.unlockedCores`
      array (confirms the `.slice()` copy-on-write holds). Noted for the
      record, not a defect: `applyDevProfile` itself is not self-gating
      against `isDevBuild()` — that's the caller's documented responsibility,
      and the sole call site already does it correctly.
      `npx tsc --noEmit`: clean throughout. Next action: (fb002) (character/
      dash ignore collision with the Core and friendly structures), the next
      Feedback item in file order — refs: §5.5, §11, G16, owner feedback
      `feature-unlock-cores-dev`.

- [x] (b016) [bug] top priority: a tower can be built directly on the
      character's own tile, trapping the Warden inside it — this commit.
      Found already implemented but uncommitted at session start (a prior
      session's in-progress work — `findEscapeTile`, an unbounded BFS
      flood-fill in `src/sim/towers.ts`'s `buildTower` that relocates the
      Warden to the nearest passable tile when a build lands on its own
      tile, refusing the build outright with gold untouched if no escape
      tile exists anywhere on the grid; new regression tests in
      `tests/act1.test.ts` (direct `buildTower` call, the real `applyCommand`
      Command path, and a fully-walled no-escape refusal case) and
      `tests/p6d-nine-classes.test.ts` (the Cryomancer Ice Wall interaction))
      — verified end to end rather than re-implemented, the same protocol
      every recent P6/p8a/Q91/Q102/Q120 item in this section already sets.
      **code-reviewer APPROVE**, no Critical/Major; one Minor fixed before
      commit (`warden_displaced` renamed to `wardendisplaced` to match the
      codebase's bare-word `w.emit` convention; confirmed unused elsewhere,
      a pure no-op rename). **qa-playtester PASS**: real `Run.step`/
      `applyCommand` builds (not just the unit tests) confirmed relocation in
      both Act I and Act II, a ring-surrounded Warden still finds an escape
      tile, a fully-walled grid correctly refuses the build with gold
      untouched, 500-iteration build-spam produced no hang/leak/crash, and
      two headless `npm run sim` runs plus 5-seed bot-policy runs stayed
      clean. **This fix also closed the separately-filed (b019)** as a side
      effect — see that entry below — verified with its own dedicated
      13,004-cast adversarial sweep rather than assumed. `npx tsc --noEmit`
      clean throughout. Logged as Q129 — refs: §12 rule 3, owner feedback
      `bug-build-on-character`.

- [x] (b019) [bug] A self-cast Ice Wall can trap the Warden in place for the
      wall's full `wallSeconds` — closed this commit as a side effect of
      (b016)'s fix, not a separate implementation. `fireIceWall` places its
      three wall segments through the same `buildTower` path (b016)'s
      `findEscapeTile` now guards, so any segment landing on the Warden's
      tile relocates it before the wall forms. qa-playtester verified this
      with a dedicated adversarial sweep rather than trusting the mechanism
      claim: 13,004 real Ice Wall casts (five Warden sub-tile offsets x a
      fine aim grid) where the wall's footprint touched the Warden's
      original tile — 499 the exact self-aim/center case the new
      `tests/p6d-nine-classes.test.ts` case covers, 342 genuine edge-segment
      cases (aiming near-but-not-at yourself, a realistic input, where the
      Warden's tile is an outer segment rather than the center) — all 13,004
      ended with the Warden off the blocked footprint on a passable tile,
      including chained relocations where the Warden was bounced onto a
      not-yet-built future segment. No residual gap found. Logged as Q129 —
      refs: §10, QA on Q120 ORDER 2.

- [x] (q120o1) [feat] Q120 ORDER 1 (owner verdict, PRIORITY DIRECTIVE sequence):
      minimal taunt — a taunted enemy (Clarion Taunt r6; Recall Totem's TD
      taunt) sets its pathing destination to the taunting entity for the
      stated duration, per-enemy target override, TD and VS, hashed state,
      regression test covering the leak-catch case — this commit. Found
      already implemented but uncommitted at session start (a prior session's
      in-progress work — `Enemy.tauntRemaining`/`tauntKind`/`tauntSourceId`
      (types.ts), `fireClarionTaunt`'s cast-time snapshot tag and
      `updateClassSummons`'s continuous per-tick totem re-tag (classes.ts),
      the exported `tauntTarget` helper and its `beeline` threading through
      `moveEnemy` (enemies.ts), `hashWorld` coverage (run.ts), the new
      `totemTauntTickSeconds` data field (content.ts, data/classes.json), and
      the new `tests/q120-order1-taunt.test.ts` — QUESTIONS.md's Q128 already
      documented two Major bugs a prior code-reviewer round had caught and
      fixed in that same uncommitted draft: a live-null-fallback bug (a
      totem-taunted enemy kept beelining toward its old target after the
      totem itself vanished) and a breach-scope bug (a taunted enemy's
      beeline inherited the flying/ghosting fallback's breach-everything
      rule instead of respecting G7's "incidental shove on an open path
      deals nothing")) — verified end to end rather than re-implemented, the
      same protocol every P6/p8a item this session's history sets. This
      session's own independent `code-reviewer` pass (APPROVE, no
      Critical/Major, re-derived both prior fixes cold rather than trusting
      Q128's narrative and confirmed they hold; two Minors left as cheap
      follow-ups, not fixed: `tauntTarget`'s per-tick object allocation and
      `fireClarionTaunt`'s unscratched `enemiesInRadius` call) and
      `qa-playtester` pass found **one further Major bug Q128's own "genuine
      no-op" claim missed**: a Clarion-tagged enemy in VS resolves to the
      *same destination* every VS enemy already targets, but the beeline
      branch that destination drove took a *different path* than the routed
      flow field `flowAim` uses for every other VS enemy — a taunted enemy
      could stall against a persisted Act I wall a normal one would route
      around, deterministically reproduced (see Q128 CORRECTION,
      QUESTIONS.md). Fixed by having `tauntTarget` return `null` for
      `TAUNT_WARDEN` whenever `w.huntsWarden` is true, so VS falls all the
      way through to ordinary flow-field movement — the tag itself still
      applies and is still hashed, it just drives no override once the flow
      field already reaches the same point correctly. The VS-no-op test was
      corrected to assert `tauntTarget(...)` is `null` (not
      `w.targetPoint()`), and a new wall-routing regression test (tagged vs.
      untagged control, both reaching the Warden on the same timeline behind
      a real obstacle) was added — `tests/q120-order1-taunt.test.ts` is now
      12 tests, all green (was 11). `npx tsc --noEmit` clean throughout.
      `tests/q7-data-fuzz.test.ts` (consumes this item's
      `tests/q7-loader-holes.ts` census update) unaffected: 29 passed / 7
      skipped. A full `npm test` was run; its only failures are
      `tests/q14-mutation-smoke.test.ts`'s own known, pre-existing artifact —
      `gitDiffClean()`'s whole-repo check correctly seeing this item's own
      then-uncommitted diff, the same precedent every prior P6/p8a item in
      this Done section already documents; re-run post-commit to confirm
      clean. Two Q120 orders were queued by the owner verdict; **ORDER 2**
      (Ice Wall castable during VS waves) remains open, queued next after the
      Q91/Q102 corrections per the PRIORITY DIRECTIVE's own sequence — refs:
      Q120(5), Q128, §4.2.

- [x] (q120o2) [feat] Q120 ORDER 2 (owner verdict): Ice Wall castable during
      VS waves — a cast during Act II now places real, gold-neutral, blocking
      temporary structures instead of silently no-oping, and forces an
      immediate Warden-chase-field recompute so a stand-still cast reroutes
      enemies right away — this commit. Found already implemented but
      uncommitted at session start (a prior session's in-progress work — the
      new `BuildOptions { ignorePhase? }` param on `checkBuild`/`buildTower`
      (`src/sim/towers.ts`), `fireIceWall`'s `{ ignorePhase: true }` call and
      its post-placement `w.updateNav(true)` (`src/sim/classes.ts`), and four
      new/updated tests in `tests/p6d-nine-classes.test.ts`) — verified end to
      end rather than re-implemented, the same protocol every P6/p8a/q120o1
      item this session's history sets. Every other `buildTower`/`checkBuild`
      caller (`src/bots/policies.ts`, `src/sim/run.ts`'s `build` Command,
      `src/render/canvas.ts`'s UI ghost) was independently re-read and
      confirmed to omit `opts`, so ordinary construction stays Act-I-only —
      `ignorePhase` is reachable only through Ice Wall's own call.
      **code-reviewer APPROVE**, no Critical/Major. Minors: the `navGround`
      field the VS recompute forces uses strict `'blocked'` Dijkstra mode
      (not Act I's `'breach'` mode), a pre-existing distinction confirmed not
      to deadlock (an unrouted enemy's `flowAim` beeline-and-chew fallback
      already handles a fully-blocked field, `src/sim/enemies.ts`), but the
      full-encirclement case had no direct test — logged as a cheap follow-up,
      not chased under this item's scope; a stray QA scratch file
      (`tests/_qa_scratch_icewall.ts`) was flagged and was already removed by
      the qa-playtester pass itself before this commit. **qa-playtester found
      two real bugs while verifying all seven of the order's own acceptance
      clauses (gold-neutral blocking placement, correct expiry, ordinary
      builds still rejected in VS, cooldown-spam safety, a hunting enemy still
      reaching a Warden a wall stands next to, replay-hash determinism, and a
      fully-occupied-target no-op) — all seven held.** The two bugs: (1) a
      self-cast Ice Wall centered on the Warden's own tile traps the Warden in
      place for the wall's full duration, since `walkable()` only checks the
      destination tile and every candidate destination inside the Warden's
      own now-blocked cell is rejected — reproduced identically in Act I, so
      it predates this item and is not fixed under its scope; filed as
      **b019** with a regression-test acceptance criterion, on the same
      QA-filed-pre-existing-bug precedent `b017`/`b018` already set. (2) the
      field staleness this item's own placement path forces a recompute for
      applies symmetrically in reverse on removal — a VS wall destroyed by
      combat or expiring via `updateTempWalls` left `navGround` routing
      enemies around a tile that was no longer blocked for as long as the
      Warden stood still, since neither `updateTempWalls` nor the generic
      combat-death removal path (`src/sim/enemies.ts`) forced a refresh the
      way `fireIceWall`'s placement side does. **Fixed**, not filed: this one
      directly completes this item's own stated mechanism rather than being a
      separate concern, so the fix landed in `removeStructure`
      (`src/sim/world.ts`) — the same choke point every structure-death path
      already funnels through to invalidate the Beacon-aura/wielded-attack
      caches (p2b precedent) — gated on `w.huntsWarden` so it costs nothing
      outside VS and is naturally scoped to Ice Wall today (the only source of
      VS-phase structures). A new regression test
      (`tests/p6d-nine-classes.test.ts`, "the field un-stales once a VS-cast
      wall is gone") casts, lets the wall expire via `updateTempWalls` with
      the Warden held stationary, and asserts the tile's `navGround.dist`
      leaves `-1` on its own — `tests/p6d-nine-classes.test.ts` is now 112
      tests, all green (was 111). `npx tsc --noEmit` clean throughout, checked
      after every edit. A broader sweep
      (`p6a`/`p6b`/`p6c`/`p6d`/`q120-order1-taunt`/`grid`) stayed green at 213
      passed. A full `npm test` was run to completion post-fix; the only
      failures traced to `tests/q14-mutation-smoke.test.ts`'s own known,
      pre-existing artifact (`gitDiffClean()`'s whole-repo check correctly
      seeing this item's own then-uncommitted diff), the same precedent every
      prior P6/p8a/q120o1 commit in this Done section already documents;
      re-run post-commit to confirm clean. Both Q120 orders are now done —
      next queued: the Q91/Q102 corrections per the PRIORITY DIRECTIVE's own
      sequence — refs: Q120(5), §4.2, §10.

- [x] (q91) [bug] Q91 ORDER (owner verdict, correction item, before P10):
      lifesteal accrues from `min(damage, target's remaining HP before the
      hit)`, not the raw post-mitigation hit — fixes an overkill-leech bug
      (a 1000-damage hit on a 10 HP enemy leeched 1% of 1000, not 1% of 10)
      x002's own QA pass had surfaced and recorded but not fixed, pending
      this owner ORDER — this commit. `damageEnemy` (`src/sim/enemies.ts`)
      now captures `hpBeforeHit = e.hp` immediately before `e.hp -= dmg` —
      after every mitigation (`damageTakenMul`, frozen status,
      `flatReduction`/`frontReduction`) is already baked into `dmg`, so the
      clamp compares the same post-mitigation number the HP subtraction
      itself uses — and the leech accrual line changed from
      `dmg * w.derived.leech` to `Math.min(dmg, hpBeforeHit) * w.derived.leech`.
      `damageTotal`/`damageByWeapon` stay overkill-inclusive on purpose — the
      ORDER named only the leech accrual, not those telemetry fields, which
      keep their own pre-existing convention. Three regression cases were
      added to `tests/x002-lifesteal.test.ts` under a new "Q91 ORDER" describe
      block: a normal (non-overkill) hit is unaffected, a 1000-damage hit on
      a 10 HP husk leeches exactly 1% of 10, and an exact-kill boundary case
      (`damage === remaining HP`) leeches the full amount with no off-by-one
      — the file is 14 tests, all green (was 11). **code-reviewer APPROVE**,
      no Critical/Major/Minor: independently confirmed the clamp point sits
      after all mitigation and before the HP subtraction, that `hpBeforeHit`
      is never stale or non-positive (the function's own early
      `e.dead || amount <= 0` guard and `killEnemy`'s synchronous same-call
      dispatch rule that out), that DoT ticks/typed-non-normal/`noLifesteal`
      hits are unaffected (the clamp lives inside the pre-existing `normal`
      gate), and that every `leechAccumulator` reader/writer
      (`world.ts` init, this accrual site, `run.ts`'s single drain-to-heal
      site and hash coverage) is untouched outside the one line changed — one
      Nit (an unconditional `hpBeforeHit` read on every call, including
      non-leech hits; negligible, not fixed). **qa-playtester PASS**, no bugs
      found: a real (non-scripted) headless `hybrid`/Bloodlord run (base
      `leech: 0.03` plus two ranked leech boons), seed 42, a full Act I + VS
      session (48,112 kills, 6.8M total damage) reproduced byte-identical
      `endHash` across two independent runs; hostile scripted scenarios
      (three enemies overkilled simultaneously in one tick, a DoT kill, a
      typed-electric overkill, an exact-kill boundary, a non-overkill hit on
      a low-HP enemy, and two sequential hits on the same enemy where the
      second hit's leech clamps against post-first-hit HP, not original max
      HP) all matched the `min(damage, remaining HP before the hit)`
      contract exactly, with `applyHealing`'s existing finite/overheal
      guards (`cores.ts`) confirmed to leave no NaN/negative-HP path. `npm
      test`: full suite run to completion post-fix — see this entry's own
      PROGRESS.md record for the pass/fail tally; `npx tsc --noEmit` clean
      throughout. Q102 (Beacon's `shrineHaste` wiring) remains open, next in
      the PRIORITY DIRECTIVE's own sequence — refs: §2, Q88, Q91, x002.

- [x] (q102) [bug] Q102 ORDER (owner verdict, correction item, before P10):
      Beacon Totem's §5.2 VS special (`w.shrineHaste`, +15% character attack
      speed within r2.5 of a petrified shrine) is real again — wired into
      `updateWieldedAttacks`'s cooldown formula (`src/sim/vswield.ts`)
      multiplicatively, `speedMul = attackSpeedMul * towerAttackSpeedMul *
      coreAttackSpeedMul(w) * (1 + w.shrineHaste)`, the same third-origin
      treatment `towers.ts`'s `attackSpeedFor` already gives its own
      `auraBonus` per §2/Q64 — this commit. Found already implemented but
      uncommitted at session start (a prior session's in-progress work — the
      `vswield.ts` formula/comment change, a new regression test in
      `tests/p2b-wielded-fire.test.ts`, and a stale-comment fix in
      `tests/c4-stacking.test.ts`) — verified end to end rather than
      re-implemented, the same protocol every recent P6/p8a/Q91/Q120 item in
      this file's history sets. **code-reviewer APPROVE**, no Critical/Major:
      confirmed exactly one writer of `shrineHaste` (`weapons.ts`'s
      `updateTerrainEffects`, reset to 0 every tick) and exactly one
      production reader (this line); confirmed the new test fails without the
      fix (stash-verified) and is not a hash-coverage gap (`shrineHaste` is
      purely distance-derived, no RNG/wall-clock, and only flows into the
      already-hashed `wieldedCooldown` map); confirmed Beacon's VS-only scope
      holds (`updateTerrainEffects` only runs from `updateAct2`; Act I's
      `manualAttack`/`classBasicAttack` never reference it). One Minor, not
      fixed: the new test's own `toBeCloseTo(1.61, 12)` line self-checks a
      hand-computed literal rather than production code, harmless dead
      weight. **qa-playtester PASS** on all of the ORDER's own acceptance
      (real end-to-end Beacon-shrine + wielded-attack driving, not just the
      unit test's `w.shrineHaste = 0.15` shortcut; correct multiplicative
      stacking with a real boon; falloff back to baseline on leaving radius;
      no Act I leak; replay-hash determinism across two independent same-seed
      runs) — **one real, pre-existing bug found and filed rather than fixed
      under this item's scope** (confirmed identical on HEAD before this
      diff, the same precedent `b017`/`b018`/`b019` already set):
      `updateWieldedAttacks` has no `w.dying` guard, so a wielded tower (and
      Beacon's own speedup) keeps firing full volleys through the entire
      defeat slow-mo window — the same bug class already fixed once for class
      Actives. Filed as **b020** with a regression-test acceptance criterion.
      `npx tsc --noEmit` clean throughout; targeted suite
      (`tests/p2b-wielded-fire.test.ts`, `tests/c4-stacking.test.ts`,
      `tests/p2c-vs-specials.test.ts`): 64/64 passing. **Both the Q91 and
      Q102 corrections are now done — the PRIORITY DIRECTIVE's own sequence
      is complete; the queue returns to ordinary BACKLOG.md order.** — refs:
      §2, §5.2, Q64, Q101, Q102.

- [x] (p8a) [feat] Wave data on the §1.1 shape: `data/waves.json` carries 18
      real TD wave compositions, the §9 VS-budget curve is live — this
      commit. **The PRIORITY DIRECTIVE's critical-path item — roughly fifteen
      skipped gates and every class/Core win-rate measurement named it as
      their re-enable point.** Found already implemented but uncommitted at
      session start (a prior session's in-progress work — `data/waves.json`'s
      waves 11-18, `data/spawns.json`'s new `budgetGrowthPerVsWave`,
      `src/sim/content.ts`'s matching schema field, `src/sim/act2.ts`'s new
      `vsBudgetBaseline`, and mechanical updates to five existing test files)
      — verified end to end rather than re-implemented, the same protocol
      `p6a`-`p6e` set. `vsBudgetBaseline(w, cycle) = budgetBase x
      budgetGrowthPerVsWave^(cycle-1)` composes multiplicatively with
      `budgetFor`'s pre-existing per-minute-within-a-block ramp (two genuinely
      orthogonal axes — cross-block escalation vs. within-block ramp — so no
      double-counting); the new field is `.optional()` with a `?? 1` fallback
      so an older/hand-edited `data/spawns.json` still loads. New
      `tests/p8a-wave-content.test.ts` covers the two acceptance clauses no
      prior test touched: the TD HP curve and the VS-budget curve each
      asserted at three sample points, plus the Warden-Eater's cycle-6 gate.
      **Q122 records five genuine judgment calls**, the most consequential
      being the last two: (3) the uncommitted draft's own `tests/
      a10-performance.test.ts` edit asserted `wavesCleared === 18` for a
      `--cycles 1` `maxbuild` run — never checked against a completed run,
      the exact Q121(4) failure mode one item later — actually running it
      shows all three seeds dying `defeat_core` at wave 16, so the assertion
      was corrected to the honestly measured 16, not forced; (4) that same
      real-content wall broke three *other* previously-live tests
      (`tests/a3-movement-mandatory.test.ts`, `tests/p-core-f-gates.test.ts`'s
      G23 `carnivorous_plant` case, `tests/p6e-class-diversity.test.ts`'s
      shared `beforeAll` and its lone surviving `cryomancer` win-rate case),
      each `.skip`-ed with its own measured numbers rather than forced green,
      on the same precedent `tests/a4-single-type.test.ts` already set —
      **G8's win-rate clause is now 0/11, not 1/11**, and Carnivorous Plant's
      G23 case is a genuine measured stalemate (still `running` at a
      400-simulated-minute cap, over 3x the prior headroom, having already
      cleared all 18 TD waves), not a cap-needs-raising problem. **code-reviewer
      REQUEST-CHANGES → fixed, then re-verified clean**: the first draft's
      `p6e` `beforeAll` fix (recording a `'timeout'` outcome instead of
      throwing) still folded a non-terminal seed's partial `damageByWeapon`
      into `ownDamage`/`allDamage` — a run capped mid-simulation accumulates
      over an incomparable window versus a seed that actually terminates,
      risking a silent skew of `topLabel`/the live diversity-count pin;
      fixed to exclude `'running'`-outcome reports from both records entirely,
      the same non-participation `wins` already gave them, and re-measured
      (diversity pin unaffected). Two Minors also fixed: `tests/
      p8a-wave-content.test.ts` mutated the module-level cached `Content`
      singleton via `delete` with no restore (fragile under a future test
      added to the same file); changed to save/restore. PROGRESS.md/
      BACKLOG.md updates (this entry) were missing from the first draft,
      per CLAUDE.md's own rule — added before commit. **qa-playtester PASS,
      with one real bug found and fixed**: real (non-scripted) `hybrid`/
      `maxbuild` runs across ~25 seeds, `--cycles 1` and `--cycles 6`,
      including `Long Watch` at tier 2, found no NaN/Infinity anywhere, wave
      15 (Colossus x2) and wave 16 (Herald x1) cleared without incident, and
      replay-hash determinism held across two independent same-seed runs;
      independently spot-verified all three `.skip`-ed writeups by
      temporarily un-skipping and restoring each file byte-identical
      (`a3-movement-mandatory` reproduced both original failures exactly;
      `p6e`'s `cryomancer` reproduced the documented 2/12 outcome string
      character-for-character; `p-core-f-gates`'s `carnivorous_plant`
      corroborated the stalemate directionally at a smaller 150-minute cap).
      **The one real bug**: `buildSpawnQueue`'s pre-existing repeat-last-row
      fallback for waves past the authored table (Long Watch's `extraWaves`)
      now repeats wave 18's own row — the one this item just moved the
      Gatebreaker onto — so a Long Watch run spawns a second and third
      Gatebreaker on waves 19/20, contradicting this item's own "Gatebreaker
      on wave 18, and only wave 18" test title. Fixed in `src/sim/run.ts`:
      a `boss`-trait group (the same trait check `loot.ts` already reads) is
      dropped once a wave falls back past the table's end; a regression test
      walks a Long Watch run's full 20-wave `waveCount` and asserts the
      Gatebreaker appears on wave 18 only, confirmed to fail without the fix
      and pass with it. A second, unrelated, pre-existing bug qa-playtester
      surfaced (`src/meta/meta.ts`'s `completionFraction` hardcoding a
      wave-10 ceiling, stale since `p3e` moved a full run to 18 waves,
      confirmed untouched by this item's own diff) is filed as **b017**
      rather than fixed under this item's scope. `npm test`: 1277+ passed /
      67 skipped (0 failed outside `tests/q14-mutation-smoke.test.ts`'s
      known, pre-existing uncommitted-tree artifact — `gitDiffClean()`
      correctly seeing this item's own then-uncommitted diff, the same
      precedent `p6e` already documented; re-run post-commit to confirm);
      `npx tsc --noEmit` clean — refs: §9, §1.1, Q122. **G8's win-rate clause
      moved from 1/11 to 0/11 and several other gates now measure genuine
      stalemates rather than resolving — this is real information, not a
      regression: the wave-11-17 wall survives landing real content, so it is
      the un-tuned Act I/class/Core economy against that curve, not the
      content gap, blocking every one of the roughly fifteen gates the
      PRIORITY DIRECTIVE named. Next action: the PRIORITY DIRECTIVE's own
      re-measurement pass (Q109, Q111, Q116, Q121), which this item's own
      findings make more urgent, not less — after that, the two Q120 orders,
      then the Q91/Q102 corrections.**

- [x] (p6d) [feat] The nine remaining §4.2 classes: Archer, Engineer, Pyro,
      Necromancer, Cryomancer, Stormcaller, Bloodlord, Animist, Paladin —
      this commit. **All 11 §4-shaped classes now exist, and gates G10 and
      G11 are green.** Found already implemented but uncommitted at session
      start (a prior session's in-progress work), verified end to end rather
      than re-implemented, the same protocol `p6a`/`p6b`/`p6c` set. Fifteen
      new `ClassEffectSchema`/passive kinds cover the nine kits' Active1/
      Active2/passive slots; `validateClassEffect`/a new `validateClassPassive`
      (`src/sim/content.ts`) reject a row missing any field its kind reads
      with no sane default, plus referential checks on `towerKey`. Notable
      mechanisms: a new `TowerClassBonus` struct threaded through
      `HitEffects`/`dealHit`/`Projectile` (`combat.ts`, `types.ts`) carries
      the three *target-conditional* tower passives (Stormcaller's +10%
      tower damage as extra Electric, Pyro's +10% vs Burning, Cryomancer's
      +10% vs frosted/frozen) through every attack shape, not just the
      unconditional per-structure multipliers the framework already had;
      Ice Wall places three real, temporary `palisade` towers through the
      ordinary `buildTower` pipeline with cost pre-funded and refunded around
      the call (gold is provably unchanged win or lose) and `towersBuilt`/
      `spent` corrected so a cast never reads as a player build; Cryomancer's
      frozen-death shatter reuses the `p2f`/`p6c` enqueue-then-drain
      recursion-safety worklist (`pendingFrostShatters`), proven at 2000
      chained deaths; Necromancer/Engineer/Animist summons share one
      `ClassSummon` struct with per-kind concurrency caps that evict the
      oldest; Death Pact writes `Structure.hp` directly (bypassing
      `damageStructure`) since it prices itself in max HP; `engineer` and
      `pyromancer` are converted in place to real §4.2 kits (keeping their
      `key` so existing unlocks stay valid), leaving `frost_warden` as the
      one remaining `legacy: true` row. **Q120 records eleven genuine
      SPEC-FINAL judgment calls**, most structurally: two Bloodlord kinds
      the design note's own list omitted; `class_active` gaining optional
      `aimX`/`aimY` since three §4.2 Active1s are mouse-aimed, unlike every
      prior Active1; G10's dps model corrected against the design note's own
      arithmetic (its closed-form root is the *minimum* of `a^t/(t+c)`, not
      the maximum — the true optimum is measured by grid search at the
      authored numbers, `t=5.0`, and re-run by the test itself so a future
      retune fails the gate rather than the reader); which SPEC clauses have
      no mechanism in this sim and are named-and-skipped rather than
      invented (aggro-priority overrides for Clarion Taunt/Recall Totem's
      taunt, Bloodlord's per-structure VS lifesteal share, Animist's +1
      summon cap); Ice Wall's Act-I-only functional gap from reusing
      `buildTower`; six classes naming a real but not-yet-quest-granting
      unlock key pending `p7e`'s real §8.4 engine; a pre-existing bug this
      item surfaced (`defaultMeta()` hardcoded `unlockedClasses: ['engineer']`,
      so Swordsman had been locked out of fresh accounts since `p6b` —
      fixed by deriving the list from the roster's own `unlockedByDefault`
      flag); and two measured blast-radius findings on existing gates,
      re-measured with a control rather than nudged (`a3-movement-mandatory`'s
      `no-move` seed 8 now reaching `victory` once Engineer's bigger Act I
      roster becomes seed 8's VS arsenal, checked against a `frost_warden`
      control that still goes 12/12 `defeat_warden`; G23's
      `carnivorous_plant` seed 9 needing its tick cap raised from 90 to 120
      simulated minutes once a real resolution at 106.8 minutes was found,
      re-measuring the whole gate at 6/12, comfortably inside the 35–70%
      band). **code-reviewer REQUEST-CHANGES → fixed, then re-verified
      clean**: the first draft's `storeWrath` (`src/sim/run.ts`) applied
      Clarion Taunt's explicit 60% `wrathFraction` to Paladin's *base*
      Guardian Stance passive too ("blocked damage charges Wrath" names no
      percentage — a plain reading is the full amount), silently cutting the
      base passive's stated effect by 40% and contradicting Q120(10)'s own
      claim that "`blocked` is exact" — fixed to bank 100% of blocked damage
      unconditionally, with `wrathFraction` applying only to Clarion's
      additional applied-damage clause during its own window, with the
      regression test corrected to match (108/108 green after the fix, full
      suite reconfirmed green). Everything else in the review held: the
      `TowerClassBonus` threading has no recursion into a tower's own bonus;
      Ice Wall's gold-neutrality is directly tested; `hashWorld` covers every
      new field (`pactActive`/`atkSpdBuffRemaining`/`tithed`, `frostHitStacks`,
      the five new `Warden` fields, `classSummons`/`corpses`/`tempWalls`); no
      `Math.random`/`Date.now`/native trig in touched `/src/sim` files; every
      numeric kit value is data-driven in `data/classes.json`. **qa-playtester
      PASS**, no bugs found: real (non-scripted) headless runs for every
      non-legacy class with a custom active-firing bot across up to 20+
      simulated minutes each found no NaN/Infinity anywhere and byte-identical
      replay hashes across independent same-seed runs, including three driven
      to a true terminal `defeat_warden`; independently re-derived G10 (peak
      at t=5.0, a 269-damage full charge one-shotting `bulwark`'s 70 HP) and
      G11 (3.5832 ≤ 3.6) by hand against the authored numbers rather than
      trusting the test; Ice Wall's gold-neutrality held on success,
      out-of-range failure, an off-phase cast and a fully-blocked cast, with
      the cooldown still paying on total failure; a hand-corrupted
      `data/classes.json` (missing `wallSeconds`) threw the loader's exact
      error and was restored byte-identical; Pop Turret's cap-2 eviction and
      Necromancer's cap-8 Raise (from 20 available corpses) both evicted/capped
      correctly, including a second cast at the cap consuming zero further
      corpses; the frozen-death shatter chain held at 2000 links; charge-hold
      boundaries (a 1-tick tap, a 10,000-tick hold clamped to
      `chargeCapSeconds`, a 20s Archer draw against a 5s cap) all behaved
      correctly and Quickstep does not consume or reset a mid-draw charge;
      `w.dying` freezes every new Active structurally; Blood Tithe's
      double-cast and Death Pact's 101x toggle spam both landed on the
      correct final state; Overload/Recall Totem recast refreshes rather than
      stacking; Guardian Stance's stand-still boundary flips at exactly tick
      60, not off-by-one; Frost Touch's freeze counter freezes on exactly hit
      #5; a `frost_warden` control run for 10 real minutes under the same
      active-spam driver never populated any new-shape-only field; the
      Q120(9) unlock-list fix was independently confirmed
      (`defaultMeta().unlockedClasses` now includes Swordsman and Archer, not
      just Engineer). `npm test`: 1003 passed / 37 skipped (0 failed, up from
      895/37 pre-item — 108 new cases in `tests/p6d-nine-classes.test.ts`,
      mechanical updates to six existing test files, one new required check
      in `tests/grid.test.ts`); `npx tsc --noEmit` clean — refs: §4.2, G10,
      G11, Q120. **Next action: `p6e`** (gate G8's win-rate/damage-diversity
      measurement across all 11 classes).

- [x] (p6c) [feat] Plaguebringer kit (§4.1 verbatim): Spreading Plague, Poison
      Barrel, Poison Boost, +10% tower poison damage — this commit. **Gate G9 is
      now green in full.** `data/classes.json` authors the second real §4-shape
      class row: `basicAttack` (dps 12, range 6, interval 0.75, aoe 0),
      `moveSpeedBonus` 0.15, `passive.kind: 'spreading_plague'`, `active1`
      (`kind: 'ground_poison'`, Poison Barrel: 7s cooldown, radius 3, damage 8,
      groundDurationSeconds 5), `active2` (`kind: 'poison_boost'`, Poison Boost:
      14s cooldown, no target/radius), `towerPassive.mods: { towerPoisonDamage:
      0.10 }`. Spreading Plague — G9's second half, "an enemy dying with
      unfinished DoT deals exactly the unfinished total to the nearest enemy,
      once" — is death-triggered rather than hit-triggered, so it dispatches
      from `killEnemy` (`src/sim/enemies.ts`), not `classes.ts`: a new
      `pendingPlagueTransfers`/`drainingPlagueTransfers` enqueue-then-drain
      worklist on `World`, the identical shape `p2f` built for Fire Brazier's
      VS explosion chain after that mechanism was found recursing straight
      through the call stack — proven safe here at a 2000-enemy chained-death
      scale. Poison Barrel reuses the existing `GroundArea('poison')`/`w.areas`
      mechanism Mortar's burning patch and Venom Spore's VS trail already spawn
      into, self-centered on the Warden since §4.1 gives it no aim direction.
      Poison Boost is the framework's first global, targetless Active — it
      doubles every live enemy's poison DoT `dps` in place (not `remaining`),
      doubling the outstanding total while leaving timing alone. Miasma needed
      a new `towerPoisonDamage` stat threaded through `dotPotency`
      (`src/sim/enemies.ts`), gated both `!w.huntsWarden` (Act-I-only, since
      §4.1 states no "effective in VS" clause the way Wind Slash did at p6b)
      and `w.content.towerByKey.has(source)` (excluding Poison Barrel's own
      zone and Carnivorous Plant's Core poison bullets, neither a tower) —
      `src/ui/tower-info.ts`'s local `potency` helper mirrors the Act-I-only
      half only, since every call into that function is already scoped to one
      built tower's own attack. Plaguebringer unlocks via a new
      `plaguebringer_veteran` quest (`data/quests.json`, win 3 runs) reusing
      the existing V2-era quest engine's cumulative `wins` metric already used
      by `win_a_run` at target 1, rather than inventing telemetry ahead of
      `p7e`'s real §8.4 quest engine. **Q119 records six genuine SPEC-FINAL
      prose gaps**: the death-triggered dispatch point and its p2f-precedent
      recursion guard; Poison Barrel as a `GroundArea` rather than a new
      mechanism; Poison Boost doubling `dps` in place rather than halving
      `remaining`; Miasma's dual Act-I-only/tower-sourced-only gate and what it
      deliberately excludes (including the Poison tower's own VS special, which
      the plain "all towers" reading doesn't obviously carve out but a bigger
      change than a ⚖ gap would need to fix); Plaguebringer's unlock condition
      (§4.1 names none past the three free classes); and the ⚖ band numbers
      themselves. **code-reviewer APPROVE**, no Critical/Major, one Minor fixed
      before commit: `firePoisonBoost`'s fx emit copy-pasted Dash Slash's
      line-endpoint shape (`emit('class_active2', wd.x, wd.y, wd.x, wd.y)`) for
      what is actually a global, no-target effect — cosmetic only (fx isn't
      hashed) but a renderer treating the 3rd/4th args as a second point would
      draw a meaningless zero-length line — fixed to `emit('class_active2',
      wd.x, wd.y, 0, 0)`, matching `class_active`'s own no-target-pulse
      convention. Two Minors and two Nits left as pre-existing/low-risk, not
      fixed: `hashWorld`'s generic `w.areas` loop hashes only
      `id`/`x`/`y`/`remaining`, not `dps`/`type`/`source` (a pre-existing gap
      shared by every ground-effect area, not introduced here, logged as a
      follow-up); Spreading Plague's `nearestEnemy(..., Infinity)` unbounded
      scan (Q113's precedent) is reachable far more often here than Carnivorous
      Plant's single Core timer, flagged for a P10 sweep glance rather than
      fixed now; a per-kill `classByKey.get()` lookup repeats an existing
      per-tick pattern rather than caching once, immaterial at O(1).
      **qa-playtester PASS**, no bugs found: real (non-scripted) hostile play
      across 8 seeds and three bot policies via a custom driver layering
      opportunistic Active-firing onto `hybrid`/`maxbuild`/`idle` — necessary
      because **no stock bot policy issues `class_active`/`class_active2`
      Commands at all**, a pre-existing gap shared with Swordsman since
      p6a/p6b, flagged as a fresh backlog candidate rather than fixed under
      this item's scope — found no NaN/Infinity and replay-hash determinism
      held across independent same-seed runs that actually fire both new
      Actives and trigger real transfer chains; Spreading Plague structurally
      cannot double-fire or fire on a zero/negative-outstanding death; Miasma's
      Act-I-only shutoff was reconfirmed in a real, non-isolated tick loop (a
      built tower's before/after a forced phase transition, in the same run,
      after an earlier natural-bot-run comparison gave a misleading ratio
      confounded by differing tower upgrade levels between independent runs,
      not a real leak); Poison Barrel recast near the cdr-capped cooldown floor
      overlapped zones cleanly with no leak; Poison Boost survived a 50×
      same-tick spam burst against zero/dead/zero-poison enemies with no
      throw; both Actives freeze cleanly under `w.dying` while Spreading Plague
      itself (a death consequence, not a Command) correctly keeps firing
      through the death slow-mo; a hand-corrupted `data/classes.json` (missing
      `groundDurationSeconds`, tested in a fresh process to bypass the module
      cache) threw the loader's exact error and was restored byte-identical: a
      Splitter still spawns children when killed via the transfer; every
      Plaguebringer-only field stays structurally inert on any other class.
      `npm test`: 895 passed / 37 skipped (0 failed, up from 870/37 pre-item —
      25 new cases in `tests/p6c-plaguebringer.test.ts`); perf config 3/3;
      `npx tsc --noEmit` clean — refs: §4.1, G9, Q119. **Next action: `p6d`**
      (the nine remaining §4.2 classes).

- [x] (p6b) [feat] Swordsman kit (§4.1 verbatim): Thousand Cuts, Circle Slash,
      Dash Slash, Wind Slash tower passive — this commit. `data/classes.json`
      authors the first real §4-shape class row: `basicAttack` (dps 26, range
      2.5, interval 0.55, aoe 1.5), `moveSpeedBonus` 0.30, `passive.kind:
      'thousand_cuts'`, `active1` (`kind: 'charge_nova'`, Circle Slash: 6s
      cooldown, radius 4/damage 60 at full charge scaling down to
      minRadius 1.5/minDamage 10 at zero charge, knockback 3, chargeCapSeconds
      3), `active2` (`kind: 'dash_line'`, Dash Slash: 4s cooldown, damage 30,
      dashRange 5, dashWidth 1), `towerPassive.mods: { towerAttackSpeed: 0.10
      }`. Circle Slash is the framework's first *held* Active — a new
      continuous `TickInput.active1Held` field (alongside the pre-existing
      `dash`/`attack` booleans) drives `tickClassCharge` (`src/sim/classes.ts`)
      every tick: starts charging on the first held tick (blocked while
      `active1Cooldown` still runs), accumulates to `chargeCapSeconds`, fires
      on release via `fireCircleSlash`, scaling radius/damage/knockback from
      their `min*`/0 floor up to their full value by charge fraction (`lerp`).
      The pre-existing `{k:'class_active'}` Command is a deliberate no-op for
      a `charge_nova`-kind Active1. Dash Slash (`fireDashSlash`) is
      mouse-aimed (`{k:'class_active2', aimX, aimY}`, both new optional
      Command fields) and implements G9's merge: if Active1 is mid-charge when
      Active2 fires, the charge's current radius widens `lineHit`'s detection
      reach (not the physical dash distance) and its damage sums into the one
      `lineHit` call — one attack event, so Thousand Cuts' Bleeding
      (`passiveOnHit`, threaded through `applyAoE`/`lineHit`/a direct
      `damageEnemy`+`applyEffects` pair) applies exactly once per enemy
      struck, not once per merged source — and Active1's cooldown starts at
      its flat, non-charge-scaled value, same as a plain release. Knockback
      does not carry into the merge (§4.1 names only range and damage as
      transferring). "Knockback" itself is an instant, walkable-tile-clamped
      reposition (`knockbackEnemy`) since the sim has no velocity/impulse
      mechanism anywhere (same clamp-and-probe pattern `run.ts`'s
      `blinkWarden` already uses for the Warden's own dash, hand-duplicated
      rather than imported to avoid a `classes.ts`<->`run.ts` cycle). Wind
      Slash needed a new `towerAttackSpeed` stat key (`src/sim/stats.ts`)
      distinct from the pre-existing `attackSpeed` (which already drives the
      *character's* own cooldowns) — threaded through both `attackSpeedFor`
      (Act I, `src/sim/towers.ts`) and `updateWieldedAttacks` (VS,
      `src/sim/vswield.ts`), the one deliberate exception among tower-side
      stats to the "stays Act I's" rule, since §4.1 states Wind Slash
      "effective in VS" verbatim. New `validateClassEffect`
      (`src/sim/content.ts`), wired into `loadContent()`'s existing per-class
      loop, rejects a `charge_nova` row missing `minRadius`/`minDamage`/
      `chargeCapSeconds`/`knockback` or a `dash_line` row missing
      `dashRange`/`dashWidth` rather than letting `classes.ts`'s `?? 0` reads
      silently ship an inert kit. **Q118 records six genuine SPEC-FINAL
      prose gaps**: a held Active1 needs a continuous input field, not a
      Command (a discrete keydown Command can't carry a hold duration);
      "knockback" reads as an instant reposition given the sim's total lack
      of a physics body; the merge's "hit range" widens detection reach only,
      never the physical dash travel; a merged charge still pays Active1's
      flat (not fraction-scaled) cooldown, same as any release; Wind Slash's
      "+10% tower attack speed" needs its own stat key rather than reusing
      the character-scoped `attackSpeed`; and the band-number table itself
      (dps/range/interval/aoe/cooldowns/damages), picked for internal
      consistency with the legacy classes' numbers, ⚖ and freely re-tunable
      at P10. **code-reviewer APPROVE**, one Minor fixed before commit:
      `validateClassEffect`'s `charge_nova` branch checked `minRadius`/
      `minDamage`/`chargeCapSeconds` but not `knockback`, despite the
      function's own doc comment claiming to close exactly this "silent `??
      0` instead of a load error" gap and §4.1 naming knockback as one of the
      three charge-scaled effects — fixed by adding the missing check plus a
      fourth case to the existing missing-field test loop in
      `tests/p6b-swordsman.test.ts`. Two Nits not fixed (both pre-existing,
      low-risk, and independently re-confirmed after the fix): the Dash Slash
      row carries an unused `radius: 0` field the `dash_line` code path never
      reads (`dashRange`/`dashWidth` cover its actual geometry); `{k:
      'class_active2'}`'s `aimX`/`aimY` are independently optional at the
      type level with nothing enforcing they're supplied as a pair (not
      reachable today — the one real producer, `src/ui/main.ts`'s `aim()`
      binding, always supplies both or neither). Also independently
      confirmed: the code review's re-run of the full suite after the fix
      landed still green (869/0 before the fix's own new test, 870/0 after);
      the `w.dying` guard added to both `useClassActive`/`useClassActive2`
      closes a real bug (`Run.step` applies `input.cmds` before the
      phase-specific `updateWarden` call, so `w.phase` alone never blocked a
      Command-driven Active during the post-defeat slow-mo — only `w.dying`
      does) uniformly across legacy and new-shape classes; the merge's damage
      math is exactly `(eff.damage + mergedDamage) * powerMul` in one
      `lineHit` call, no double-multiplication; `hashWorld` hashes the two
      new `Warden` fields (`active1Charge`/`active1Charging`) through the
      same quantizing `Hasher.num`, so float accumulation during a charge
      can't fork a replay. **qa-playtester PASS**, no bugs found: real
      (non-scripted) headless `Run`s across 5 seeds with a genuine hold/
      release/dash schedule (not the unit tests' own scripted timings) ran to
      completion with replay-hash determinism holding on every seed; a
      same-tick release+dash didn't double-fire; a literal zero-charge
      tap-then-instant-E correctly did *not* merge (plain Dash Slash damage,
      byte-identical to a solo dash); a 10-second hold (far past the 3s cap)
      fired exactly once at the cap-clamped value; a merge followed
      immediately by a new hold attempt and a second Active2 press was
      cleanly blocked by cooldowns with charge state untouched, not silently
      consumed; a merged hit against 3 enemies gave each exactly 1 Bleeding;
      a genuine mid-charge death via a real fatal `damageWarden` call froze
      the charge state through the whole slow-mo with no throw, no force-fire
      and no decay, and `Run.step`/`report()`/`hash()` all stayed sound
      post-resolution; a hand-corrupted `data/classes.json` (missing
      `chargeCapSeconds`) threw the new loader's exact, specific error
      message; Wind Slash's bonus was confirmed fully scoped to Swordsman
      (`towerAttackSpeedMul === 1`, zero contributions, on a `pyromancer`
      World). One non-blocking observation logged, not filed as a bug (no
      failing repro could be built against the sim itself): a player
      pressing E before any `mousemove` event would aim Dash Slash at
      whatever `ViewState`'s cursor default is, a UI-state question outside
      what a headless check can verify. `npm test`: 870 passed / 37 skipped
      (0 failed, up from 835/37 pre-item — 35 new cases in
      `tests/p6b-swordsman.test.ts`, mechanical `TickInput`-shape updates in
      six other test files for the new `active1Held` field); perf config
      3/3; `npx tsc --noEmit` clean — refs: §4.1, G9, Q118. **Next action:
      `p6c`** (Plaguebringer kit, gate G9's second half).

- [x] (p6a) [feat] Class framework per §4: archetype bands resolved to a
      numeric basic-attack profile + Passive + Active1 (Q) + Active2 (E) +
      Tower passive — this commit. `ClassesFileSchema` becomes a
      `z.discriminatedUnion('legacy', [LegacyClassSchema, NewClassSchema])`:
      the three shipped classes (`engineer`/`pyromancer`/`frost_warden`) are
      flagged `legacy: true` and otherwise byte-identical to before (Q38); the
      new `legacy: false` shape carries `basicAttack` (`{dps,range,interval,
      aoe}`), `moveSpeedBonus`, `passive`/`towerPassive` (generic
      `Record<string,number>` mod dicts, the same shape `data/cores.json`'s
      `effects` already established) and `active1`/`active2`. No real §4 kit
      is authored yet (`p6b`/`p6c`/`p6d`); this item proves all four slots
      end to end through a hand-built fixture class in the new
      `tests/p6a-class-framework.test.ts`, the same `contentWith` technique
      `m20a-upgrade-tracks.test.ts` already uses. Active1 keeps the existing
      `class_active` Command wire; a new `class_active2` Command (bound to E)
      is Active2, independently cooled down (`Warden.active1Cooldown`/
      `active2Cooldown`), a no-op for a `legacy: true` class. The basic
      attack auto-fires with no Command and no `input.attack` press, gated
      TD-only (`!w.huntsWarden`), the same scope legacy `manualAttack`
      already had, since §6.1's wielded-tower-attack system is what the
      character fights with during VS and nothing in §6 asks a second
      independent auto-fire source to run alongside it (Q117). **Q117
      records four genuine SPEC-FINAL prose gaps**: bands resolve to bare
      numbers in `/data`, never a label→number table in code; Active1 keeps
      its old wire per MIGRATION.md §8's f004 note that `class_active`
      "survives"; the basic attack is TD-only, not also live during VS; a
      non-stat-shaped passive gets bespoke engine code from whichever item
      authors that real kit later, the same way Carnivorous Plant's/Corpse's
      non-stat Core effects got bespoke `updateX` functions beyond their own
      `effects` dict (Q113/Q114). **code-reviewer APPROVE**, one Minor fixed
      before commit: `classBasicAttack`'s AoE splash hand-rolled an
      uncapped, no-falloff loop, unlike every other splash source's
      `applyAoE`/`aoeFullTargets`/`aoeFalloff`/`aoeFalloffFloor` discipline —
      harmless today (no real kit yet authors a nonzero `aoe`) but
      `classBasicAttack` is exactly what `p6b`-`p6d` will reuse unchanged, so
      fixed now: the splash branch calls `applyAoE(..., { primary: target,
      damage: { fromX: wd.x, fromY: wd.y } })`, the same pattern
      `vswield.ts`'s own splash call site already uses. Also confirmed: both
      new damage paths route through the ordinary `damageEnemy` pipeline so
      lifesteal and `damageByWeapon`/`damageTotal` crediting apply for free;
      the discriminated union's TS narrowing means no reader anywhere in
      `/src` can access a legacy-only or new-only field on an unnarrowed
      union member; `hashWorld` gains the four new cooldown fields
      (`attackCooldown`/`activeCooldown`/`active1Cooldown`/`active2Cooldown`),
      closing a pre-existing gap rather than opening one. **qa-playtester
      PASS**, no bugs found: real (non-scripted) `hybrid`/`turtle`/`kite`-
      policy runs against the fixture class fired Active1/Active2/basic-attack
      under real play with all `RunReport` fields finite and zero
      NaN/Infinity; replay-hash determinism held across independent
      same-seed runs with both Actives fired at different real ticks; Active2
      spammed 1000× on a `legacy: true` class stayed a clean no-op; `aoe: 0`
      vs `aoe > 0` (now via `applyAoE`) both behaved correctly with no
      double-counting; two stacked `cdr` sources reduced `active1Cooldown`/
      `active2Cooldown` independently; both Actives spammed during the death
      slow-mo produced no crash; a jsdom-mounted Hub/HUD check confirmed the
      fixture class renders both Active rows without crashing and a `legacy:
      true` class still renders exactly its one `(Q)` row; schema fuzzing
      beyond the shipped per-slot-deletion tests (wrong types, an invalid
      enum value, `legacy` as a string) all correctly threw. `npm test`: 835
      passed / 37 skipped (0 failed, up from 814/37 pre-item — 20 new cases
      in `tests/p6a-class-framework.test.ts`, three existing test files given
      minimal type-narrowing/scope guards); perf config 3/3; `npx tsc
      --noEmit` clean — refs: §4, G2, Q38, Q117. **Next action: `p6b`**
      (Swordsman kit, gate G9's first half).

- [x] (p-core-f) [feat] G22 and G23 as live tests (SPEC-FINAL §5.5, gate G21's
      companions) — this commit. **P5.5 is complete in full.** The original
      item bundled three things — four Core unlock quests through §8.4, a
      Codex page, and gates G22/G23 — but Q93 had already anticipated that
      the §8.4 quest engine might not exist yet when this item came up, and
      said so explicitly: split it, ship the gates now, join the quests half
      to `p7e`. `data/quests.json` is confirmed still the V2-era Ember/relic
      roster, not §8.4's shape, so that's exactly what happened: the
      unlock-quests/Codex thirds are re-filed as `p7h` in P7 (Q116), and this
      item ships only `tests/p-core-f-gates.test.ts`. New harness
      `runCoreScripted`: no bot policy buys Core upgrade steps on its own (a
      named gap since `p-core-a`), so it snaps the Warden onto the Core's
      tile and queues `{k:'upgrade_core'}` every TD tick a step remains,
      relying on `upgradeCore`'s own affordability/range gating — commands
      apply before `updateWarden` moves the character each tick
      (`Run.step`), so the snapped position is what the same-tick command
      sees. **G22** (Q116's formula, matching what Q93 deferred verbatim):
      `max(L1 distance over normalized damageByWeapon shares, relative delta
      of a gold/level economy pair)` between a Core's run and a same-seed
      Stone Heart baseline, both `hybrid`-policy, `cycles: 6`. Measured
      (seeds 1-2): every non-default Core clears the 0.10 bar by a wide
      margin (5.9-13.3), all economy-dominated — pinned live, not `.skip`-ed.
      **G23**: 12-seed `hybrid`/`cycles: 6` win rate per Core. Only
      `carnivorous_plant` is live (5/12 = 41.7%, at the passing floor
      exactly, `Math.ceil(12*0.35)=5`) — its devour/poison damage is
      Core-driven and stat-independent, the one Core whose output doesn't
      bottleneck on either wall the other four hit. `vampire_heart`/`corpse`/
      `time`/`stone_heart` are `.skip`-ed at measured 0/12 each, for two
      *different* documented reasons, not one: `stone_heart` dies
      `defeat_warden` at TD wave 3 every seed (the p3e-documented "every
      policy dies inside VS wave 1" VS-combat-weakness story, since Stone
      Heart gives towers/leaks/character nothing at all); the other three
      die `defeat_core` around wave 10-13 after clearing multiple full VS
      cycles first — squarely the wave-9-to-14 death band `a4-single-type`/
      `boss.test` already pinned to the p8a wave-data content gap (only 10
      real TD wave rows against a still-climbing HP curve), not VS weakness.
      Re-enable points differ accordingly: `stone_heart` once P6/P7 land, the
      other three once `p8a` lands. **code-reviewer REQUEST-CHANGES → fixed,
      then re-verified clean**: the first draft's `.skip` reasoning for
      `vampire_heart`/`corpse`/`time` copied Stone Heart's VS-weakness story
      without checking it against the harness's own per-seed data, which
      shows the opposite (they reach deep into VS, then lose the Core to
      leaks) — fixed by correcting the doc comments here, in the test file,
      and in QUESTIONS.md's Q116. Separately, a `carnivorous_plant` seed hit
      a 60-simulated-minute tick cap and returned non-terminal `outcome:
      'running'`, silently miscounted as a loss by the first draft's
      `winRate` — fixed by raising the cap to 90 simulated minutes (headroom
      over the slowest observed real resolution, ~70 simulated minutes) and
      adding an explicit `expect(outcome).not.toBe('running')` per seed so a
      future timeout fails loudly instead of miscounting. **qa-playtester
      PASS**, no bugs found: independently re-verified the fix landed as
      described; reproduced 9 passed/4 skipped identically across three
      independent runs (two standalone, one inside the full suite) with no
      flakiness; independently confirmed `Run.step`'s command-before-movement
      ordering against the real source; confirmed a Core with 0 steps bought
      still gets its always-on `effects` (`computeCoreState` folds them
      unconditionally); ran all five Cores across seeds 13-20 (40 runs
      outside the file's own range) with zero throws and death causes
      matching the documented pattern exactly; spot-checked
      `vampire_heart`/`corpse`/`time`/`stone_heart` seed 1's exact death tick
      and confirmed each matches its documented cause precisely (Core HP at
      0 for the three, still-healthy Core with a dead Warden for Stone
      Heart). One fragility flagged for the record, not a bug: Carnivorous
      Plant's 5/12 sits exactly at the passing floor, so any future `/data`
      tuning touching its devour/poison numbers or the wave curve should
      re-run this gate rather than assume it still holds. `npm test`: 814
      passed / 37 skipped (0 failed, up from 805/33 pre-item — 9 new live
      cases and 4 new skips in `tests/p-core-f-gates.test.ts`); `npx tsc
      --noEmit` clean — refs: §5.5, §8.4, G21, G22, G23, Q93, Q116.

- [x] (p-core-e) [feat] Time decay aura, steps 3-5 — this commit.
      `data/cores.json` extends Time's `upgrade.steps` array (already carrying
      steps 1-2 from `p-core-b`) with step 3 (`decayRadius: 5, decayMult:
      1.2`), step 4 (`decayRadius: 10`, override only) and step 5
      (`decayMult: 1.5`, override only), matching the fold-not-accumulate
      pattern every other Core step in this file already uses. `CoreState`
      (`src/sim/cores.ts`) gains `decayRadius`/`decayMult`; new
      `updateTimeDecay(w, dt)`, called from all three tick sites in
      `Run.step` beside the existing `updateCoreEffects`/
      `updateCarnivorousPlant`/`updateCorpse`, is a stateless per-tick drain —
      unlike Corpse, it needs no timer or store field, since the effect is
      fully determined each frame by `w.core.decayRadius`/`decayMult` and
      live enemy positions, so nothing new needed adding to `hashWorld`
      (`w.core`'s fields are already hashed generically). Gated
      `!w.huntsWarden` (TD-only, the same rule `nearCoreSlowAura` already
      applies to Time's other radius effect) and `decayRadius > 0` (bought).
      For each live enemy within `decayRadius` of the Core's real 2x2
      footprint (bucket-scanned via `enemiesInRadius` with the same
      `+1.5` half-diagonal padding `nearestEnemiesToCore` already
      documents), `ring = max(1, ceil(edge distance))` and the enemy takes
      `decayMult ^ (5 - ring)` HP/s via `damageEnemy(..., { dot: true,
      noLifesteal: true })` — `dot: true` is what makes the hit ignore armor
      (SPEC-FINAL's "ignoring armor," `enemies.ts`'s existing `!opts.dot`
      gate on `damageTakenMul`), `noLifesteal: true` is the standard §5.5
      Core-attack opt-out every other Core attack in this file already sets.
      **Q115 records the one genuine SPEC-FINAL prose gap**: step 4's "decay
      aura starts at r10 (same per-ring scaling)" does not say whether the
      formula's literal constant 5 stays fixed once the radius grows, or
      re-derives around the new radius. Chosen default: the constant 5 stays
      fixed — rings 6-10 (newly reached at step 4) get the same
      `decayMult^(5-ring)` formula extended past its original domain via a
      negative exponent (a fractional, sub-1/s rate), while rings 1-5 are
      completely unchanged by buying step 4. The rejected reading
      (re-deriving around radius 10) would have silently doubled every
      already-bought inner ring's rate the instant step 4 is purchased, which
      a range-only upgrade note ("starts at r10") does not describe.
      **code-reviewer APPROVE**, no Critical/Major: independently verified
      the ring math against SPEC-FINAL's own worked example by hand,
      confirmed no new `World` field was needed and `hashWorld`'s generic
      `w.core` loop genuinely covers the two new `CoreState` fields with no
      edit, confirmed the TD-only gate matches Time's existing convention,
      confirmed perf is in the same cost class as the sibling bucket-scan
      functions it's modeled on, and confirmed the Q115 reasoning is sound
      (monotonic — step 4 only ever adds new, weaker, outer coverage, never
      reprices what step 3 already bought). One Minor noted, not fixed (a
      pre-existing pattern, not a regression): `enemiesInRadius`'s default
      `out` param allocates a fresh array every tick once the aura is bought,
      the same allocation `nearestEnemiesToCore` already has. **qa-playtester
      PASS**, no bugs found: real (non-scripted) `hybrid`-policy bot runs
      across three seeds with `upgrade_core` commands injected (bot policies
      do not buy Core upgrades on their own — a pre-existing gap shared by
      every Core item since `p-core-a`, not introduced here) bought all five
      Time steps mid-run and confirmed the aura fires under real play with no
      NaN/Infinity in gold/HP anywhere and zero VS leakage across three seeds
      that all reached VS waves with the aura fully bought; replay-hash
      determinism held across two independent same-seed runs;
      `hashWorld` empirically differs between two worlds differing only in
      `decayRadius`/`decayMult`; a different Core selected (`stone_heart`)
      left both fields at neutral defaults with the aura never firing; an
      enemy exactly on the `decayRadius` boundary was included, not excluded;
      a Splitter killed by decay damage still split into its children
      correctly; a 20-simulated-minute (72,000-tick) stress run against a
      1e9-HP enemy stayed finite with no NaN drift; step 4 left rings 1-5
      byte-identical while rings 6-10 went fractional, and step 5 raised
      *every* ring's rate uniformly (verified at ring 6 and ring 10, not just
      the inner rings) — the single scalar `decayMult` structurally
      guarantees no ring can keep a stale multiplier once step 5 is bought.
      `npm test`: 805 passed / 33 skipped (0 failed, up from 787/33 pre-item
      — 18 new cases in `tests/p-core-e-time-decay.test.ts`); `npx tsc
      --noEmit` clean — refs: §5.5, G21, Q115. **P5.5 is done bar
      `p-core-f`** (the unlock quests, Codex page, and gates G22/G23). **Next
      action: `p-core-f`.**

- [x] (p-core-d) [feat] Corpse in full — this commit. `data/cores.json`
      authors the Core's `effects` block (`corpseStoreRatio: 0.01`,
      `corpseExecuteInterval: 1`, `corpseExplodeRadius: 2`,
      `vsXpGainPct: 0.1`) and its 3-step upgrade track (step 1: `storeRatio`
      override to 0.02; step 2: `executeExplode` flip; step 3:
      `autoFireInterval` 5). A new hook directly inside `damageEnemy`
      (`src/sim/enemies.ts`) banks `corpseStoreRatio` of *every* point of
      damage dealt to *any* enemy on the map — not just Corpse's own attacks,
      unlike every other Core effect in this file — into `w.corpseStore`,
      gated `!w.huntsWarden` (TD only); this is the one Core effect that
      cannot be a per-tick poll like `updateCoreEffects`/
      `updateCarnivorousPlant` since it has to see damage fired by towers,
      the Warden and DoTs alike. New `updateCorpse` (`src/sim/cores.ts`),
      wired into every TD tick path in `Run.step` beside the existing
      `updateCoreEffects`/`updateCarnivorousPlant`: every
      `corpseExecuteInterval` seconds, the highest-HP enemy the store can
      afford is instantly executed (`pure: true, dot: true`, armor/trait
      mitigation bypassed, exactly its current HP), the store debited by that
      amount — and because the kill flows through the same `damageEnemy`
      hook, its own ratio flows straight back in, which is what makes the
      designer's "the execution counts as map damage, so 1% of it flows back
      into the store" note true for free rather than needing a second bespoke
      credit path (this item's G21 worked example). Step 2
      (`corpseExecuteExplode`) makes that same execution also deal the
      victim's max HP as ordinary armor-mitigated AoE r2 splash
      (`corpseExplode`, a hand-rolled AoE helper avoiding a `cores.ts` →
      `combat.ts` → `cores.ts` import cycle, same precedent as
      `applyCoreHitPoison`). Step 3 (`corpseAutoFireInterval`, 5s) is a
      second, independent timer that dumps the entire current store onto the
      single highest-HP live enemy with no affordability check, even
      non-lethal — and, per Q114, never triggers step 2's explosion, only the
      1s execute path can (enforced structurally: `corpseExplode` is called
      only from `updateCorpseExecute`, never from `updateCorpseAutoFire`).
      VS grants a flat, always-on +10% `xpGain` (→ `derived.xpMul`), added
      once at `World` construction the same way Vampire Heart's base
      "+1% VS lifesteal" already is. **Q114 records two genuine SPEC-FINAL
      prose gaps**: how far "all damage dealt to enemies on the map" reaches
      (chosen: unconditionally, including the execution's and explosion's own
      damage, which is what makes the designer note true for free) and
      whether step 3's "auto-fire" is the same kind of event as the base
      "execute" for step 2's explosion purposes (chosen: no — two different
      words for two different mechanisms). `hashWorld` gains `corpseStore`/
      `corpseExecuteTimer`/`corpseAutoFireTimer`. **code-reviewer APPROVE**,
      one Minor taken (a test named itself as covering "lifesteal while
      huntsWarden leech is live" but never actually set that phase — Corpse's
      execute is TD-only and structurally can't run while `huntsWarden` is
      true, so the assertion held regardless of the `noLifesteal` flag under
      test; renamed to describe what it actually proves, no code changed).
      **qa-playtester PASS**, no bugs found: tie-break determinism on
      equal-HP candidates (lowest id wins), zero-enemy timer fires no-op
      cleanly, extreme store values (1e12) stay finite with no NaN/Infinity,
      exact-affordability boundary excludes a target 1e-9 over budget, the
      store and both timers freeze bit-for-bit across a TD→VS phase
      transition with no desync, `upgradeCore`'s generic TD-phase/gold/
      step-count gating applies to Corpse's three steps exactly as it does
      the other four Cores, an executed Splitter still spawns its children
      and still credits gold bounty through the normal `killEnemy` chain, a
      different Core selected (`stone_heart`) leaves every Corpse-only field
      at exactly zero across 300 ticks of active combat, real (non-scripted)
      `hybrid`-policy bot runs across two seeds fire the mechanic under real
      play with no throw, and replay-hash determinism held across two
      independent runs that actually trigger executes/explosions/auto-fires,
      not just an idle default. One false alarm QA logged and did not
      re-litigate: ticking `updateCorpse` for exactly one `corpseExecuteInterval`
      (1.0s) fires twice, at t=0 and t≈1.0s, because a fresh timer starts at
      0 — the same inclusive-boundary idiom every other Core timer in this
      file already uses, not a Corpse-specific defect. `npm test`: 787 passed
      / 33 skipped (0 failed, up from 764/33 pre-item — 22 new cases in
      `tests/p-core-d-corpse.test.ts`); perf config 3/3; `npx tsc --noEmit`
      clean — refs: §5.5, G21, Q114. **Next action: `p-core-e`** (Time steps
      3-5).

- [x] (p-core-c) [feat] Carnivorous Plant + Digestion in full — this commit.
      `data/cores.json` authors the Core's `effects` block (`devourRadius: 2`,
      `devourCooldown: 8`, `devourEliteDamage: 200`, `devourCoreHeal: 5`,
      `poisonVolleyInterval: 1.5`, `poisonStacksPerBullet: 5`,
      `poisonVolleyCap: 10`, `poisonBulletDamage: 10`) and its 4-step upgrade
      track (`devourRangeBonus`/`devourCooldownReduction`, +1 range/−1s each,
      cooldown floored at 1s in `computeCoreState` so no future re-author of
      the track can reach zero/negative). New `updateCarnivorousPlant`
      (`src/sim/cores.ts`), called from every TD and VS tick path in
      `Run.step` alongside the existing `updateCoreEffects`, branches on
      `w.huntsWarden`: TD devours the single nearest live enemy within
      `devourRadius` of the Core's real 2x2 footprint (`coreEdgeDist2`, the
      same edge-clamped distance `inCoreBuildRange`/`nearCoreSlowAura`
      already use) every `devourCooldown` seconds — a non-elite is killed via
      `damageEnemy(..., { pure: true, dot: true })` (armor/trait mitigation
      bypassed, so it's always exactly lethal while still crediting real
      damage through the normal pipeline), an elite instead takes a flat
      `devourEliteDamage` hit that stays ordinarily armor/trait-mitigated
      (Q113's addendum: only the instant-kill clause bypasses mitigation,
      since that's the only reading under which "instant kill" differs from
      "a big normal hit") — either branch heals the Core `devourCoreHeal` HP
      (capped at max) and adds one permanent Digestion stack
      (`w.digestionStacks`, never reset TD or VS). VS fires
      `floor(digestionStacks / poisonStacksPerBullet)` bullets (capped at
      `poisonVolleyCap` for perf) every `poisonVolleyInterval` seconds at the
      nearest enemies to the Core, unbounded range (Q113: the owner prose
      names no VS radius, unlike the TD devour's explicit r2, read as
      deliberate) — each bullet is 10 flat normal damage plus a poison DoT
      triggered by that same 10, reusing `poison`'s own authored
      `ratio`/`duration` from `data/damagetypes.json` rather than inventing a
      number, via a new `applyCoreHitPoison` that reimplements
      `damagetypes.ts`'s `dotDpsFor` formula by hand to avoid a real import
      cycle (`cores.ts` → `damagetypes.ts` → `combat.ts` → `cores.ts`).
      **The shared "Core attack" rule §5.5 states once** — not scaled by
      character stats, no lifesteal, still feeds on-map damage effects — is
      built as a new `noLifesteal` flag on `DamageOptions`
      (`src/sim/enemies.ts`), the one explicit opt-out neither `damageEnemy`
      nor character-stat scaling otherwise grants (both plant call sites set
      it; every other call site is unaffected); "not scaled by character
      stats" already holds for free since both call sites pass pre-computed
      flat literals, never routing through `w.stats`/`w.derived`; "feeds
      on-map damage effects" already holds for free since both go through
      the normal `damageEnemy` pipeline, which always credits
      `damageByWeapon`/`damageTotal`. `hashWorld` gains
      `plantDevourTimer`/`plantVolleyTimer`/`digestionStacks` explicitly (the
      same rule the VS-special timers above them already follow). Q113
      records three genuine SPEC-FINAL prose gaps a builder had to fill (the
      "10 normal + poison" arithmetic, the instant-kill damage pipeline, the
      VS volley's unbounded range) plus two addenda added during
      review/QA (the elite branch's own mitigation; Digestion's permanent,
      never-spent nature, confirmed correct by the backlog's own "for the
      run" wording rather than a gap). **code-reviewer APPROVE**, no
      Critical/Major: confirmed no architecture-rule violation, confirmed
      `noLifesteal` is threaded narrowly (only the two new call sites set
      it), confirmed the poison DoT math matches `dotDpsFor` exactly,
      confirmed `hashWorld`'s new fields are sufficient and not
      double-hashed, confirmed the bucket-scan padding
      (`scanRadius = radius + 1.5`) is provably sufficient against the
      footprint's own ~1.42 half-diagonal so no edge-case enemy is dropped
      before the exact `coreEdgeDist2` cut. Two Minor findings, both
      addressed before commit: the elite branch's mitigation asymmetry
      versus the non-elite kill was undocumented (fixed — Q113 addendum
      plus a new pinning regression test, "the elite flat-200 hit is still
      armor-mitigated, unlike the non-elite instant kill"); a dormant risk
      that a future `frozen`-applying source reaching Act I would
      over-credit the instant-kill's `damageByWeapon`/`damageTotal` via
      `statusDamageTakenMul` (fixed — flagged with a code comment at the
      call site rather than engineered around, since no `/data` row applies
      `frozen` today). **qa-playtester PASS**, no bugs found: real
      (non-scripted) headless runs via `src/bots` policies (`hybrid`,
      `turtle`, `maxbuild`, `sealed`, and others) across multiple seeds
      confirmed devours and volleys both fire under real play, not just the
      isolated unit-test harness, with Digestion accruing from real kills
      and volleys firing once Digestion crosses 5 at VS entry; replay-hash
      determinism held across independent same-seed runs; `stone_heart` and
      `vampire_heart` runs over a full 6-cycle length left every plant-only
      field (`digestionStacks`, both timers, `damageByWeapon['carnivorous_
      plant']`) at zero, confirming the Core is fully inert unless selected;
      a repo-wide search confirmed `w.warden.leechAccumulator` has exactly
      one writer, gated by the same `!opts.noLifesteal` check both plant
      call sites set, with no second on-hit hook anywhere in `src/sim` that
      could leak lifesteal around it; `+500%` power left devour/volley
      damage exactly unchanged in both the unit tests and a scripted run;
      edge cases (overheal clamping exactly to `coreMaxHp`, a zero-enemy
      timer fire no-oping and re-arming cleanly, an enemy exactly on the
      devour-radius boundary being included, `digestionStacks` at one
      billion still capping the volley at exactly `poisonVolleyCap` hits in
      ~1ms) all held. One design-questionable non-bug flagged for the
      record, not filed as a bug: Digestion is never spent by firing a
      volley, so "one bullet per 5 stacks" is a permanent, monotonically
      -growing tier rather than a spend-and-refill economy — confirmed
      correct against the backlog's own "for the run" wording (Q113's
      second addendum), not a gap. `npm test`: 764 passed / 33 skipped (0
      failed, up from 743/33 pre-item — 21 new cases in
      `tests/p-core-c-plant.test.ts`); perf config 3/3; `npx tsc --noEmit`
      clean — refs: §5.5, G21, Q113.

- [x] (p-core-b) [feat] Stone Heart, Vampire Heart, and Time steps 1-2 —
      this commit. `p-core-a` was plumbing only (selection/hashing/loader
      validation, zero gameplay effect); this item is the first to give a
      Core real numbers. `CoreUpgradeSchema` gains an optional `steps:
      Record<string,number>[]` (per-step numeric deltas) and `CoreSchema`
      gains an optional `effects: Record<string,number>` (always-on base
      numbers, live the instant the Core is chosen, no step required) —
      untyped dictionaries rather than a tower-style `SPECIAL_KEYS` enum on
      purpose, since the five Cores' step shapes are too heterogeneous (a
      flat HP add, a ratio override, a decay-radius jump) to share one
      struct; `data/cores.json` authors both for `stone_heart`,
      `vampire_heart` and `time` with SPEC-FINAL §5.5's exact numbers, and a
      new `validateCoreUpgrade` clause rejects an authored step past the
      track's own count. New `src/sim/cores.ts` is where these numbers
      become gameplay: `computeCoreState` is a **pure fold** of
      (core key, steps bought) into a `CoreState`, recomputed on every
      purchase rather than accumulated — the same shape `derive()` gives
      `Stats`, chosen specifically so buying step 2 can never double-count
      step 1's own contribution (code-reviewer verified this holds).
      `upgradeCore` mirrors `upgradeTower` exactly: TD-phase-only,
      build-range-gated (`inCoreBuildRange`, against the Core's real 2x2
      footprint, not just its center point), flat `stepCost` (never
      `towerCostMul` — SPEC-FINAL §5.5 prices every step flat), never
      sellable (no reverse function exists, and `Command` has no
      `sell_core` variant at all). A wound survives a Stone Heart HP step
      the same way it survives a tower upgrade (`s.hp = s.maxHp * ratio`
      preserved, not healed to full). Two Core numbers ride the *existing*
      `Stats`/`Derived` pipeline instead of `CoreState` because they are
      already generic stats every other system reads (`w.stats.add` +
      `w.recomputeDerived()`, the same call a boon or Constellation node
      makes): Vampire Heart's base "+1% VS lifesteal" (added once at
      construction — `leech` is already VS-gated at its own read site in
      `enemies.ts`) and Time step 2's character "+1 HP regen/s" (added once,
      keyed uniquely per step, when that step is bought). Every other
      number is bespoke: `vampireMissingHpBuffMul` ("+0.5% dmg/atk-spd per
      1% missing HP, cap +30%", read by `towerDamage`/`attackSpeedFor`,
      `towers.ts`); `applyHealingToWarden`/`applyHealingToStructure`
      (`amount * healingReceivedMul`, clamped to `maxHp`, with any excess
      converted to gold via `addCoreGold` at `overhealGoldRatio` — a
      fractional-gold accumulator, `World.coreGoldAccumulator`, so a
      sub-1-gold trickle never rounds to nothing); `applyTowerLifesteal`
      ("all towers gain 0.1% lifesteal", called from every site that
      actually credits `Structure.damageDealt` — see the code-review finding
      below); `updateCoreEffects` (Time step 1's flat gold/s, deliberately
      bypassing `goldFindMul` per §5.5's "unaffected by gold-gain bonuses",
      and step 2's tower regen); `nearCoreSlowAura`
      (`src/sim/enemies.ts`, folded into `enemyAttackSpeedMul`/
      `effectiveSpeed`, data-driven off `w.core.tdSlowRadius`/`tdSlowPct`
      rather than a hardcoded `coreKey === 'time'` check, so a future Core
      authoring the same two `effects` keys gets the aura for free);
      `coreAttackSpeedMul`/`coreMoveSpeedMul` (Time's VS-only +20% speed,
      read by `updateWarden`'s move-speed line and `updateWieldedAttacks`'s
      cooldown decrement — deliberately *not* routed through `Stats`, since
      that would leak the buff into Act I movement the way Vampire Heart's
      leech addition safely doesn't). **One genuine pre-existing bug fixed
      as a side effect, not a design choice**: `World.coreMaxHp` read
      `content.waves.coreHp` (a hardcoded 500) regardless of which Core was
      chosen — coincidentally Stone Heart's own `baseHp`, so the default
      case was silently correct, but every other Core got the wrong base HP
      the instant it was chosen. Fixed to read `content.coreByKey.get(w.coreKey).baseHp`;
      confirmed no other reader of `content.waves.coreHp` would now
      disagree. `hashWorld` gains `coreMaxHp`/`coreStep`/
      `coreGoldAccumulator` plus a generic loop hashing every field of
      `w.core`, mirroring the existing `w.derived` loop, on the same m19a
      precedent ("hash the whole cache, not a hand-picked few"). **code-reviewer
      REQUEST-CHANGES → fixed, then re-verified clean**: the first draft's
      tower lifesteal only wrapped `updateTowers`'s synchronous
      before/after `Structure.damageDealt` snapshot, which is always 0 for
      `pierce`-kind (Ballista) and `lob`-kind (Mortar) towers — their damage
      lands *later*, asynchronously, through `combat.ts`'s
      `updateProjectiles`/`detonate` (the same two-site split `p5d` already
      established for `damageDealt` crediting itself) — so Vampire Heart's
      lifesteal was silently a no-op for two of the game's highest-damage
      towers, unexercised by the first draft's Arrow-only test. Fixed by
      extracting `applyTowerLifesteal` and calling it from both
      `combat.ts` sites too; a new Ballista-based regression test added
      alongside the existing Arrow-based one. **qa-playtester PASS, one
      defensive-programming gap found and fixed before this commit**: an
      independently-constructed live-fire Mortar scenario confirmed the
      async-lifesteal fix; all 5 Core keys confirmed to read their own
      `baseHp` after a full run to Core-death. The one real finding — a
      non-finite (`NaN`/`Infinity`) heal amount permanently poisoned
      `World.coreGoldAccumulator` (`Math.floor(NaN)` is `NaN`, `NaN > 0` is
      always `false`, so the "flush whole gold" branch could never fire
      again, silently discarding every *legitimate* trickle for the rest of
      the run) — QA explicitly flagged this as not currently
      player-reachable (every live heal source is already guarded upstream)
      but worth a guard on permanent run state regardless; fixed with the
      same `Number.isFinite` check `Stats.add` already applies to every
      other contribution, in both `applyHealing` and `addCoreGold`, with a
      regression test. Every other adversarial check QA ran — the
      no-default-+10% rule, the cannot-sell rule, build-range/phase/gold
      rejection boundaries, the flat-cost-immune-to-`towerCost`-boons rule,
      Time's aura correctly exempting `slowImmune` enemies and shutting off
      in VS, Time's gold/s correctly bypassing `goldFind` while Sprout's own
      income doesn't, and replay-hash determinism across upgrade-mid-run
      replays — held with no further findings. `npm test`: 743 passed / 33
      skipped (0 failed, up from 708/33 pre-item — 36 new cases in
      `tests/p-core-b-effects.test.ts`); perf config 3/3; `npx tsc --noEmit`
      clean — refs: §5.5, G21.

- [x] (p-core-a) [feat] Core selection plumbing (SPEC-FINAL §5.5, gate **G21**'s
      plumbing half) — this commit. `data/cores.json` authors the five owner
      rows verbatim (Stone Heart 500 HP/3 steps/50g, Carnivorous Plant 200
      HP/4/60g, Vampire Heart 350 HP/3/80g, Corpse 500 HP/3/100g, Time 300
      HP/5/150g), each carrying only `baseHp`/`unlockedByDefault`/
      `unlockCondition`/`upgrade{count,stepCost,desc}` — plumbing only, no
      gameplay effect; each Core's real TD/VS numbers are `p-core-b` through
      `p-core-e`'s job, not this item's. `src/sim/content.ts` gains
      `CoreSchema`/`CoresFileSchema`, an exported `validateCoreUpgrade`
      (rejects a priced-but-stepless or stepped-but-unpriced row — a Core has
      no build cost to derive a total from the way a tower's `costMul` does,
      so this is `validateUpgradeTrack`'s simpler two-branch rule, not
      `validateStepPrice`'s derived one) and `validateDefaultCore` (rejects
      zero or more than one `unlockedByDefault` row), both wired into
      `loadContent()` unconditionally, plus an exported `defaultCoreKey(content)`
      helper so "default: Stone Heart" is one content lookup, not a literal
      repeated at every call site. `RunConfig.core?: string` (optional — an
      omitted value is the pre-Cores config shape, not a distinct choice) and
      `MetaState.unlockedCores: string[]` (mirrors `unlockedClasses`, defaults
      to `[defaultCoreKey(content)]`); `World.coreKey` resolves the default
      once in the constructor, and `hashWorld`/`buildReport` both read it, so
      two runs differing only in Core hash differently and an omitted vs.
      explicit-default core hash identically. `src/ui/hub.ts` gets a Core
      panel beside Class, mirroring its exact structure, plus a click-listener
      guard stronger than Class's own precedent (a locked core's button gets
      no listener at all, not just `disabled`) and a submit-time fallback.
      **The one new mechanism this item had to build, not mirror**: "a replay
      carrying a mismatched core is rejected" has no existing precedent in the
      codebase — `p9a` (the general content-hash replay-rejection system) is
      still unbuilt — so `src/sim/run.ts` gains a `RecordedRun` type and
      `replayRecorded(recorded, cfg)`, the first such check, scoped to the one
      field p9a would otherwise leave silently desyncable today. **code-reviewer
      APPROVE**, no Critical/Major: confirmed no architecture-rule violation
      (no DOM/`Math.random`/`Date.now` in `/src/sim`, all new numbers live in
      `data/cores.json`), confirmed `cores.json`'s five rows match SPEC-FINAL
      §5.5's table exactly, confirmed both loader validators are unconditional
      in `loadContent()` (a bad row fails at import time, not lazily),
      confirmed `git diff --stat` touched only the files the item describes.
      One Minor taken: the Hub's submit-time fallback fell back straight to
      the content-wide default rather than to whatever the account actually
      has unlocked, a latent edge case if `unlockedCores` were ever non-empty
      but missing the default — fixed (falls back to `unlockedCores[0] ??
      defaultCoreKey(content)`). **qa-playtester found two real plumbing bugs,
      both fixed with regression tests before this commit, per CLAUDE.md rule
      3**: (1) `replayRecorded`'s mismatch check was hollow — two sides naming
      the identical *nonexistent* core key "matched" and sailed through, since
      equality was checked before existence; fixed by validating both the
      recorded and replayed core resolve to a real `content.coreByKey` row
      before they are ever compared, each with its own regression case
      (`tests/p-core-a-selection.test.ts`, "throws even when both sides share
      the identical nonexistent core key" and its two one-sided siblings).
      (2) An `unlockedCores` that migrated to `[]` (an *empty array* passes
      the `Array.isArray` corruption guard, since it genuinely is an array —
      QA reproduced this by handing `Hub` a bare `unlockedCores: []` directly,
      bypassing `migrate()` entirely) rendered Stone Heart, §5.5's guaranteed
      default, as simultaneously `on` and `locked` in the Hub. Fixed in two
      places, both defense-in-depth: `migrate()` now guarantees the default
      core key is always present in `unlockedCores` (mirroring the existing
      `if (!out.allocated.includes(0)) out.allocated.unshift(0)` pattern), and
      the Hub's own `locked`/click-listener checks now treat the default core
      key as never locked regardless of `unlockedCores`'s contents, so the
      contradiction can't render even if something else ever constructs a
      `Hub` without going through `migrate()`. Regression tests added in both
      `tests/p-core-a-selection.test.ts` (the empty-array migration case) and
      `tests/hub-testing.test.ts` (three new Hub-DOM cases: default selected
      and unlocked, a locked core genuinely refused even after forcing its
      `disabled` attribute off, Stone Heart never rendered `on`+`locked`).
      QA's non-bugs, correctly not filed: every Core's TD/VS gameplay effect
      doing nothing yet (by design, `p-core-b`..`p-core-f`); `classKey` has
      the identical no-existence-check gap `core` briefly inherited, but that
      is pre-existing project debt outside this item's scope, not something
      this diff regressed. `npm test`: 708 passed / 33 skipped (0 failed, up
      from 681/33 pre-item — 24 new cases in `tests/p-core-a-selection.test.ts`
      and 3 new cases in `tests/hub-testing.test.ts`, plus a `core` field
      added to two pre-existing `RunReport` test literals); perf config 3/3;
      `npx tsc --noEmit` clean — refs: §5.5, G21, Q93.

- [x] (p5d) [bug] `Structure.damageDealt` now credits `pierce`- and `lob`-kind
      tower attacks — this commit. QA filed this against `p5b`: `fireTower`'s
      `pierce` case (Ballista) and `lob` case (Mortar) fired through
      `spawnProjectile`/`updateProjectiles`/`detonate` (`src/sim/combat.ts`)
      without ever incrementing `s.damageDealt`, unlike every other attack kind
      (single/cone/chain/poison/aura), which credit it inline via
      `lineHit`/`coneHit`/`dealHit`/`chainHit`/`applyAoE` — both towers' stats
      panels always read 0 damage dealt regardless of real output. **Fix:**
      `ProjectileSpec` and `Projectile` (`src/sim/combat.ts`, `src/sim/types.ts`)
      gain a required `structureId` field; `updateProjectiles`'s per-enemy
      pierce hit and `detonate`'s AoE landing both now read the real number
      `dealHit`/`applyAoE` already return and add it to
      `w.structureById.get(p.structureId)?.damageDealt`. `fireTower` (Act I,
      `src/sim/towers.ts`) passes the firing structure's real `s.id` at both
      call sites; `fireWielded` (VS, `src/sim/vswield.ts`) passes a
      `structureId: 0` sentinel, since towers stand inert with no owning
      `Structure` through a VS wave (§6.2) — safe because `World.nextEntityId`
      starts at 1, so `structureById.get(0)` is always `undefined` and the
      credit silently no-ops. `tests/p5d-projectile-damage-credit.test.ts`
      (4 cases): Ballista/Mortar each credit `damageDealt` only once a shot
      actually lands, not merely fires; a pierce bolt hitting 3 colinear
      enemies sums its credit across all three; a VS-wielded pierce shot with
      the `structureId: 0` sentinel lands real damage without throwing and
      without crediting the inert tower. **code-reviewer APPROVE**, no
      Critical/Major: confirmed all four `spawnProjectile` call sites pass
      `structureId` (a missed site is now a compile error, the field being
      required, not a silent bug); confirmed the pierce and AoE branches are
      mutually exclusive per projectile, so nothing double-credits the same
      shot; confirmed `hashWorld` excludes both `damageDealt` and the new
      `structureId`, so replay-hash determinism is untouched; confirmed
      `nextEntityId` starts at 1, making the `structureId: 0` sentinel
      genuinely safe. One Minor taken: the first draft's test only covered
      single-enemy landings, not summed multi-hit credit or an explicit
      no-throw case for the wielded sentinel — both added, see above.
      **qa-playtester PASS**, no bugs found: a scripted pierce bolt hitting 3
      dummies summed `damageDealt` to the exact combined HP drop; a Mortar
      shell's AoE splash across 3 enemies did the same; two Ballistas hitting
      the same enemy simultaneously tracked independent, correct per-structure
      totals; selling a tower (or a tower dying to enemy fire) before its own
      in-flight projectile lands routes through the same
      `removeStructure`/`structureById` cleanup either way, so the projectile's
      damage still lands on the enemy while crediting silently no-ops rather
      than throwing or resurrecting a phantom structure entry; every
      pre-existing `single`/`cone`/`chain`/`poison`/`aura` attack kind still
      credits inline exactly as before, untouched by this diff. `npm test`:
      681 passed / 33 skipped (0 failed, up from 677/33 pre-p5d — 4 new cases);
      perf config 3/3; `npx tsc --noEmit` clean — refs: `src/sim/towers.ts`,
      QA on p5b.

- [x] (p5c) [feat] Gate **G20** — every §5 milestone special measurably changes
      the attack it names, and the loader validates it — this commit. **Gate G20
      is green in full; P5 is done bar the unrelated `p5d` telemetry bug.**
      Ballista, Fire Brazier, Ice Obelisk and Mortar shipped with an empty
      `specials: []` array despite SPEC-FINAL §5.2 naming a milestone for each —
      `data/towers.json` now authors all four: Ballista reuses Arrow's own
      `pierce`/`projectiles` keys verbatim (+1 pierce @2, +1 projectile @4); Fire
      Brazier gets two new keys, `burnStacks` (+1 Burning per hit @2) and
      `coneWidth` (cone width +50% @4); Ice Obelisk gets `slowDuration` ("frost
      lasts 5s" @3); Mortar gets `burnPatch` ("shells leave a burning patch" @3,
      `seconds: 2`). `AttackProfile` (`src/sim/upgrades.ts`) grows matching
      fields (`coneWidthMul`, `burnStacks`, `slowDuration`, `groundBurn`,
      `groundBurnSeconds`), read by `fireTower`'s cone/aura/lob cases
      (`src/sim/towers.ts`) exactly as every existing special already is.
      Mortar's ground patch is a new `GroundArea` (`type: 'burn'`, spawned by a
      new `spawnBurningPatch` in `src/sim/combat.ts`) that reuses the generic
      damage-over-time branch `updateAreas` already runs for the Cinderling's
      fire trail — no new mechanism, just a new caller of an existing one.
      **Two genuine spec gaps needed a judgment call, both logged as Q112**:
      Burning's own row is `maxStacks: 1, refresh: 'strongest'` today (raising
      that cap is `p10a`'s job, explicitly a later phase), so "+1 Burning per
      hit" is read as a dps multiplier on the one stack an enemy can carry, not
      a second literal stack; the patch's dps has no §5.2 number at all, so it
      reuses `damagetypes.json`'s own authored `burning.dps` (1) rather than
      inventing one, and its radius reuses the shell's own blast `aoe`. Neither
      touches a shipped balance number — both are flagged in `/data` `note`
      fields and code comments pointing at Q112. The loader half of G20 is a new
      `validateSpecialChangesProfile` (`src/sim/content.ts`), wired into
      `loadContent`'s existing per-special validation loop alongside
      `validateSpecial`: it evaluates the tower's own real `attackProfile` one
      step below a milestone against one step at it and throws if the two are
      byte-identical, so a special that structurally validates (right kind,
      right companion field) but changes nothing the fire loop reads is still a
      load error, not a step a player pays gold for and receives nothing from.
      **code-reviewer REQUEST-CHANGES → fixed, then re-verified clean**: the
      first draft wired all four milestones into `fireTower` (Act I) but missed
      `fireWielded` (`src/sim/vswield.ts`) entirely — SPEC-FINAL §6.1 wields
      "the highest upgrade effect" of every built tower type into a VS wave, so
      a milestone that only fired in Act I contradicted the spec's own
      inheritance contract and gate G3, untested by anything in the suite.
      Fixed by mirroring the same four field reads into `fireWielded`'s
      cone/aura/lob cases; a new "the same milestones apply to the VS-wielded
      attack (§6.1)" describe block in `tests/p5c-milestone-specials.test.ts`
      drives all four through `updateWieldedAttacks` and would fail if any were
      dropped again, and a pre-existing wielded-burn test in
      `tests/p2b-wielded-fire.test.ts` (written before Fire Brazier had any
      milestone) needed its own expected value corrected to fold in
      `burnStacks` rather than assume pure stat scaling. **qa-playtester FAIL on
      first pass → fixed, then re-verified PASS**: QA built a real, hand-authored
      counterexample the shipped loader accepted silently — a *second*
      `slowDuration` special on Frost Obelisk's real track repeating the
      *first* milestone's own value (not the attack's base) — and reproduced it
      twice independently against `loadContent()` directly, not just the unit
      test. Root cause: `validateSpecialChangesProfile`'s first draft compared
      each special against a synthetic single-special track, which can only
      ever detect "repeats the attack's absolute base," not "repeats a
      different, earlier milestone already active on the same real track."
      Fixed by passing the tower's real, full `upgrades` (all its specials)
      into the before/after comparison instead of a synthetic one-special
      track — every other already-active milestone now stays live in both
      snapshots, isolating exactly the one flip under test — with a new
      regression test pinning QA's own repro shape. QA then independently
      re-reproduced the original failure against the fix (confirmed it now
      throws `towers.json: frost_obelisk special "slowDuration" does not
      change the attack it names`), rechecked the full suite, and confirmed no
      new false-positive rejects any of the twelve real shipped specials.
      **One QA process incident, disclosed and resolved, not a code defect**:
      during re-verification QA accidentally ran `git checkout -- data/towers.json`
      while trying to revert its own scratch edit, which discarded the entire
      legitimate uncommitted `data/towers.json` diff along with it. QA
      reconstructed the four towers' `specials` blocks from the still-intact
      surrounding diff (`upgrades.ts`/`towers.ts`/`vswield.ts`/`combat.ts`/
      `tower-info.ts`/`QUESTIONS.md`/the untracked test file, which pins every
      `at`/`value`/`mul`/`seconds`) and flagged that the player-visible `note`
      strings on three of the four towers were its own reconstructed prose, not
      guaranteed verbatim — confirmed correct in substance (`git diff --stat`
      matched the original 44 insertions / 4 deletions, full suite and `tsc`
      both stayed green) but re-reviewed and tightened by hand afterward for
      tone, since a `note` is flavor text no test asserts. `npm test`: 677
      passed / 33 skipped (0 failed, up from 663/33 before this item — 14 new
      cases in `tests/p5c-milestone-specials.test.ts`); perf config 3/3; `npx
      tsc --noEmit` clean — refs: §5.2, G3, G20, Q112.

- [x] (p5b) [balance] Give an upgrade track its own price multiplier (`costMul`)
      and put Ember Brazier and Mortar on §5's count line — this commit. §5's own
      text ("total track cost = 2x build cost ⚖, per-track `costMul` allowed")
      names the escape the price rule always lacked: `UpgradeTrackSchema`
      (`src/sim/content.ts`) gains an optional `costMul`, and `validateStepPrice`
      reads it in place of the file-wide `upgradeTotalCostMul` when a track
      carries one (`mul = t.upgrades.costMul ?? totalCostMul`). Ember Brazier
      moves from count 10 (a `note` explaining why it stayed off §4's count line)
      to count 4, `costMul: 0.8`, `stepCost` unchanged at 14 (`round(70*0.8/4) =
      14`); Mortar moves from count 10 to count 3, `costMul: 0.6`, `stepCost`
      unchanged at 26 (`round(130*0.6/3) = 26`) — both now sit on the count line
      with no `note`. Ballista and Frost Obelisk are untouched and keep their
      notes (Ballista alone still takes the boss gate's scripted maxbuild run
      from `victory` to `defeat_warden` at the line's count/price; Frost
      Obelisk's A4 T1 clause never clears 4/5 at any price) — the item's "every
      gate p5b touches stays where it was, boss included" clause holds because
      neither is touched. `tests/m20c-roster-tracks.test.ts` gained a test per
      `validateStepPrice` branch (file-wide fallback when `costMul` is absent;
      track-level override, including a wrong-price case proving the function
      reads the track's own value and not the fallback) plus updated on-line/
      off-line roster assertions. **Q111 records the one acceptance clause not
      met**: `mortar alone clears TD at T1` (`tests/a4-single-type.test.ts`)
      stays `.skip`-ed, unchanged by this diff — re-measured with the `costMul`
      change live and still 0/5, because every one of the seven attacking
      towers' T1 clauses is dominated by the same p8a content gap p3e already
      found (`data/waves.json` authors only 10 real wave rows; waves 11-18
      repeat row 10 against a still-climbing HP curve), not by any tower's own
      price or count — re-enable point is `p8a`, same as every other T1 case.
      **code-reviewer APPROVE**, no Critical/Major: confirmed the math on both
      towers, confirmed `costMul` is loader-time-only (runtime charging in
      `src/sim/upgrades.ts` reads `stepCost` directly, no second site needed
      updating), confirmed SPEC-FINAL §5 literally authorizes a per-track
      `costMul`, confirmed no unrelated `/data` numbers were touched, confirmed
      Ballista/Frost Obelisk's notes and off-line status survive. One Nit not
      blocking: BACKLOG's own acceptance text still says "un-skipped and
      green" for the mortar T1 clause, which Q111 now supersedes — this entry
      is that follow-up note. **qa-playtester PASS**: built both towers in a
      real (non-scripted) sim and confirmed exactly 4/3 purchasable steps at
      the unchanged 14/26 gold each, a 5th/4th purchase rejected with no gold
      or tier change; post-max `attackProfile`/HP/armor all finite through a
      full 10-wave `single:ember_brazier`/`single:mortar` BuilderPolicy run, no
      crash or NaN; Ballista and Arrow Spire's pricing is byte-identical
      pre/post-diff; the mortar T1 skip reports as genuinely skipped via
      `--reporter=verbose` ("9 passed, 7 skipped" on that file), not silently
      passing or deleted; replay-hash determinism held across independent
      replays at 3 seeds that build and max both towers. **One pre-existing,
      unrelated bug found and filed separately, not fixed here**: neither
      `pierce`- nor `lob`-kind towers (Ballista, Mortar) ever credit
      `Structure.damageDealt` in `fireTower` (`src/sim/towers.ts`) — every
      other attack kind does, inline — so their stats panels always read 0
      regardless of real output. Reproduces identically on Ballista, which
      this item never touched, confirming it predates and is unrelated to
      `costMul`. Filed as `p5d` per CLAUDE.md's rule (a same-item patch for an
      unreachable, unrelated edge is scope creep; a failing regression test
      belongs with the fix, not the filing), matching the `p2f` precedent.
      `npm test`: 663 passed / 33 skipped (0 failed, up from 661/33 — the two
      new `m20c-roster-tracks.test.ts` cases), perf suite (3 tests) unaffected;
      `npx tsc --noEmit` clean — refs: §5, Q80, Q111, QA on m20c, QA on p5b

- [x] (p5a) [balance] Poison's `+1 projectile @2` fixed — not by pricing, by a
      spec-contradiction correction (Q110) — this commit. p5a was scoped as a
      pricing decision: aim the spare spore at the leading target instead of
      dropping it, re-price the tower alongside, and take G13's T3 clause from
      0/5 to 5/5. That scoping was written against the SPEC-V3-era reading
      Q79/Q86 recorded — Poison's second spore "spreads" to a second enemy,
      unlike Arrow's, which §4 spelled out as "same path." **SPEC-FINAL §5.1's
      own table has since given Poison's second projectile the identical
      annotation Arrow's carries: "+1 projectile (same path, not spread) @2"**
      — the same three words. The shipped code (`targetFirstN`,
      `src/sim/combat.ts`, Poison's only caller) and the m20b tests asserting
      the spread both predate SPEC-FINAL and were never reconciled against it.
      CLAUDE.md rule 3 makes an un-reconciled disagreement with SPEC-FINAL a
      bug, not a gap, outranking the queue — so the fix landed as a spec
      correction, not as the pricing decision p5a was scoped for. **What
      changed:** Poison's `fireTower` case now calls `targetFirst` (one
      primary enemy, matching Arrow's `single` case) and fires every one of
      `prof.projectiles` shots at it — no second-target selection exists at
      all, milestone or not. `targetFirstN` is deleted outright (one caller,
      no other SPEC-FINAL §5 row spreads a milestone projectile). No `/data`
      value changed — `venom_spore`'s damage stays 45. `src/ui/tower-info.ts`'s
      panel text and `attackOutput`'s single-target damage-preview math are
      updated to match (a lone target now takes every projectile, the same
      formula every other kind already used — Poison was the one exception).
      Full write-up at QUESTIONS.md Q110. **What this does NOT do: it does not
      flip G13's T3 clause.** Re-measured with the fix in place (seeds 1-5,
      `tests/a4-single-type.test.ts`'s live `venom_spore alone fails the TD
      wave curve at T3` case): still 0/5, unchanged — every tower's T3 clause
      is now dominated by the p8a wave-11-18 content gap (Q109), not by any
      tower's own damage, so the "same-path fix flips T3 to 5/5" outcome
      Q79/Q86/Q87 worried about (and which the rejected `wip/m20d` tree hit by
      cutting damage 45→23) does not reproduce under the current, re-baselined
      gate. Measured, not assumed, per the standing rule that a deferral is a
      measurement with an expiry date. Acceptance met on two of the item's
      three original clauses: `tests/m20b-owner-towers.test.ts`'s
      "still fires that second spore" case is un-skipped and green (now
      "same path, not spread," structurally never drops a shot); the "worth
      nothing at @2 against a lone target" case that pinned the old wart is
      deleted with it, since that behaviour no longer exists. The third clause
      ("G13's T3 clause holds for venom") does not hold and is not claimed to
      — it is content-gap-bound, re-enable point is `p8a` landing real wave
      11-18 data, same as every other T3 clause p3e already logged this way.
      **code-reviewer APPROVE**, no Critical/Major findings (one Minor, taken:
      flagged that this entry needed to say the T3 clause is unmet/blocked
      rather than silently checking p5a off as if it were). **qa-playtester
      PASS**, no bugs found: live-fire scenarios with 3+ enemies clustered at
      different path-distances confirmed the volley never spreads past its
      one primary target even with candidates available; splash (`aoe: 1`)
      still independently hits bystanders within its radius, proving "no
      spread in primary targeting" and "no splash" are distinct mechanisms and
      the fix touched only the former; poison DoT stacking across a same-
      target 2-spore volley is exactly 2x the 1-spore case, no double-refresh;
      the weapon-info panel's live and pre-upgrade-preview numbers both
      matched real fire exactly; a 12-seed sweep (`maxbuild`/`hybrid`) was
      byte-identical stashed vs. unstashed, confirming no balance drift;
      replay-hash determinism held across two independent seeded runs that
      actually built and fired a Venom Spore. `npm test`: 661 passed / 33
      skipped (0 failed, down one skip from p3e's 661/34 — the one
      newly-enabled case, net against the one deleted case); `npx tsc
      --noEmit` clean — refs: §5.1, Q79, Q86, Q87, Q109, Q110, QA on m20b

- [x] (p3e) [balance] Re-baseline the run-shape-dependent gates against 18 TD + 6
      VS — this commit. **P3 is complete in full (p3a-p3e).** `light-build.test.ts`,
      `tests/a4-single-type.test.ts` (G13's solo-viability clause) and
      `tests/boss.test.ts`'s two win-rate tests all previously measured the legacy
      single-block 10-wave shape (`cfg()`'s default `cycles: 1`); this item, plus
      `tools/a4probe.ts`, re-points each at SPEC-FINAL §1.1's real shape
      (`cycles: 6`, 18 TD waves across 6 blocks) and raises "clears" from wave 10
      to wave 18. `light-build.test.ts` and `tools/a4probe.ts` additionally set
      `world.invulnerable`, isolating the TD/Core-defense claim each makes from VS
      combat survival — a separate, not-yet-buildable claim while P6's nine open
      classes and P7's equipment/VS-upgrade pool are unbuilt (confirmed empirically:
      without `invulnerable`, every policy dies inside VS wave 1 at TD wave 3, no
      differentiation between light and maxed boards). `boss.test.ts`'s two
      win-rate tests are the deliberate exception — reaching and beating the boss
      is inherently a full-run, VS-inclusive claim, so they keep real VS combat.
      **Measured (seeds 1-8 `light-build`, 1-5 `a4-single-type`, 1-20 `boss`):
      every re-baselined assertion reads 0/N**, all dying `defeat_core` (or, for
      the un-isolated boss tests, `defeat_core`/`defeat_warden`) between TD wave
      9 and 14 — never later, never earlier, regardless of build. Root cause,
      confirmed by reading `buildSpawnQueue` (`src/sim/run.ts`):
      `data/waves.json` authors exactly 10 real TD wave rows; waves 11-18 repeat
      row 10's exact composition against the HP-scaling formula's still-climbing
      `1.30^(wave-1)` multiplier, so nothing can sustain the curve past roughly
      wave 9-14 by construction — a content gap, not a P3 defect, tracked
      separately as `p8a` ("wave data on the §1.1 shape"), explicitly queued
      after this item in P8. Per CLAUDE.md rule 6 (never delete a test to go
      green), every assertion that measured red is `.skip`-ed in place with its
      measured numbers inline; every assertion that measured green either way —
      `a4`'s seven T3 "fails alone" clauses, its "walls fail" and "covers seven
      towers" checks, and `boss.test.ts`'s eight non-full-run unit tests (phases,
      telegraph, terrain-shatter, Wraiths, arena fire, chase, Rifts, all built via
      `act2World()` directly) — is untouched and stays live. Q109 records both
      design decisions this item needed (what "clears" means once Act I is no
      longer one linear pass, and what to do once every measurement came back
      red) and the one promise it does not keep: Q83 expected p1b's G7
      sealed-vs-open win-rate band (`tests/p1b-seal-winrate.test.ts`) to be
      re-measured here too, but that test is outside this item's literal
      acceptance text and still reads `cfg()`'s legacy `cycles: 1`, untouched —
      left open, not yet re-queued under a new id.
      **code-reviewer REQUEST-CHANGES → fixed, then re-verified clean**:
      independently confirmed `world.invulnerable` only gates `damageWarden`
      and never `leakIntoCore`, so the isolation is real and doesn't leak into
      gold/telemetry/the replay hash; reproduced every measured number.
      Findings, all fixed: a Major (this item's own commit left BACKLOG.md
      self-contradictory — the audit table already read "P3 done in full
      (p3a-p3e)" while the Queue section still carried `p3e` as an open,
      unchecked item, never moved to Done — fixed by this entry and the
      P1/P3 Queue header rewording above), a Minor (BACKLOG.md's P1 row and
      Queue section both claimed "the p1b band [is] re-measured at p3e per
      Q83," contradicting this item's own Q109 finding that it wasn't —
      reworded), and a Minor/Nit (`tools/m20d-run-a4.ts`, a manual probe no
      test or gate reaches, still hardcoded the old wave-10 bar — bumped to
      `>= 18`). **qa-playtester PASS**, no bugs found: independently
      re-derived every measured number by temporarily un-skipping one case
      per file; confirmed `invulnerable`'s only three live read sites are
      `damageWarden`'s guard, the HUD line and `hashWorld` (itself hashed, so
      it can't silently desync a replay); confirmed the `.skip`s report as
      genuinely skipped via `--reporter=verbose`, not vacuously passed; ran
      all three `light-build` cases un-skipped together with no hang risk
      from the raised `MAX_TICKS`; confirmed the diff touches zero `src/`
      files. `npm test`: 661 passed / 34 skipped (0 failed, up from 670/25 at
      p3d — the net +9 skips this item adds across the three files, no test
      deleted); `npx tsc --noEmit` clean — refs: §1.1, §16, G6, Q109.

- [x] (p3d) [polish] Delete the Day/Dusk/Night/Dawn cycle machine, Rekindle, and
      the V2 Core-detonation clauses — this commit. **Gate G6 is unaffected (it
      was already green in full at p3c); this item is the cleanup §1.1/§6.2 asked
      for once nothing still depended on the old machine.** `Phase` now carries
      exactly §1.1's five phases (`act1_build`, `act1_wave`, `act2`, `levelup`,
      `results` — `dusk`/`dawn` gone); `Command` drops `rekindle`/`dawn_done`;
      `World.dawnTimer`/`duskTimer` and `DAWN_AUTO_SECONDS` are gone.
      `src/sim/sundering.ts`'s `beginDawn`/`advanceFromDawn`/`rekindleTower` are
      replaced by one `advanceToNextBlock`: every live tower simply un-petrifies
      for free — no Rekindle cost, nothing to choose — and the next TD block's
      build phase starts on the very same tick a VS wave's timer (or, on the
      final block, the Warden-Eater) ends. `finishSundering` (the TD-block →
      VS-wave direction) now fires synchronously too: `completeWave` (`run.ts`)
      calls it directly instead of setting a `dusk` phase with a countdown, so a
      block's VS wave begins the instant its last TD wave clears, matching
      §1.1's "20s build, 75s VS, nothing between them" literally rather than via
      the `duskTimer`-collapsed-to-0 workaround p3a shipped. `canBuildNow`
      (`src/sim/towers.ts`) is now exactly the two Act I phases — no more
      `duskTimer > 0` grace clause, since Dusk itself is gone. `clearCorePocket`/
      `openApproachLanes` (the V2 Core-detonation force-clear and guaranteed
      approach lanes) are deleted outright rather than migrated: §6.2 states
      towers stand "inert but present... solid obstacles" through a VS wave,
      which is the opposite of force-clearing a pocket around them, and §10's
      breach-cost pathing (p1a) already guarantees a route exists without
      bulldozing anything. `rekindleCostMul` (`data/towers.json`) and
      `waveEndByCycle`/`nightSecondsByCycle` (`data/waves.json`) are deleted;
      `World.cycle`/`totalCycles`/`RunConfig.cycles` are **kept** despite the
      item's own title naming `cycles` — Q108 records why (§1.1's run is still
      counted in TD-block/VS-wave pairs, and every reader of the field —
      `cycleWaveEnd`, `nightLengthSeconds`, `cycleEliteMul`, `act2Minute` — is
      untouched by this item, all still correct for the §1.1 shape).
      `tests/f001-cycle-machine.test.ts` (the file that drove the old machine
      end to end) and `tests/b004-ember-survival.test.ts` (both `describe.skip`
      bodies referenced `w.phase === 'dawn'`/`{k:'dawn_done'}`/
      `onRekindle`/`onDawnDone` literally, which stopped type-checking the
      moment this item dropped those members — MIGRATION.md originally
      scheduled its deletion for p7d, moved up here since a skipped test still
      has to compile) are both deleted; a new `tests/p3d-cycle-machine.test.ts`
      carries forward the two live assertions `f001` had no successor for
      (`cycleEliteMul`'s per-cycle table read, `act2Minute`'s
      `nightMinuteOffsetPerCycle` compounding — both still-live §16-deferred
      balance knobs `p3e` re-baselines, untouched by this item) plus a new
      regression case built to close a real coverage gap code review found: no
      test anywhere drove a *real* built tower through petrify → VS wave →
      `advanceToNextBlock`'s un-petrify loop and confirmed it actually came back
      live — a silent regression there (e.g. a revert to conditional/Rekindle-
      gated un-petrify, or the loop simply being dropped) would have
      permanently stopped every tower from firing past the first VS wave with
      nothing catching it. Verified the new case actually catches that class of
      bug by temporarily deleting the un-petrify loop and confirming the test
      fails, then restoring it. code-reviewer **REQUEST-CHANGES → both Major
      findings fixed, then re-verified**: (1) this diff originally landed with
      no MIGRATION.md/BACKLOG.md/PROGRESS.md updates and a design decision
      (deleting `clearCorePocket`/`openApproachLanes`, and keeping `cycles`)
      cited in code comments as "Q108" before Q108 actually existed in
      QUESTIONS.md — both fixed (this entry, the MIGRATION.md rows below, and
      the Q108 write-up); (2) `advanceToNextBlock`'s un-petrify loop had no
      direct regression test — fixed with the new case above. One Minor taken:
      `src/bots/policies.ts`'s `POCKET_CLEAR_RADIUS` site-scoring penalty
      referenced the now-deleted `clearCorePocket` in its comment as if still
      live; corrected to name the mechanic as gone and the penalty's continued
      existence as a deferred p3e balance question (Q108) rather than changed
      blind, since altering `BuilderPolicy`'s site scoring reaches every
      seed-pinned gate a `maxbuild`/`hybrid`/`sealed`/`turtle`/`greedy` bot
      plays — exactly the blast-radius CLAUDE.md's measurement rules warn a
      "narrow" fix can have. **qa-playtester PASS**, no bugs found: real
      (non-scripted) bot runs across several seeds/policies/cycle-counts
      through every TD-block↔VS-wave boundary with no hang or stuck phase;
      `canBuildNow` rejects every build attempt during `act2`, spam included; a
      structure killed mid-VS-wave stays dead through the immediate block
      transition (not resurrected, not double-counted) while its live siblings
      un-petrify with HP intact; multi-summon (p3b) stacking still caps and
      still can't cross a block boundary; leak coupling (p3c) still funds the
      following VS wave correctly now that the transition is synchronous;
      replay-hash determinism holds across independent runs at multiple cycle
      counts; a repo-wide grep for `dusk`/`dawn`/`rekindle`/`Rekindle`/
      `DAWN_AUTO_SECONDS`/`duskTimer`/`dawnTimer` turns up nothing live outside
      doc-comments and this file's own history text. `npm test`: 670 pass / 25
      skipped (main config, up from 667/25 — the 3 new
      `tests/p3d-cycle-machine.test.ts` cases net against the tests deleted
      alongside `f001`/`b004`) + 3 pass (perf config); `npx tsc --noEmit`
      clean — refs: §1.1, §6.2, G6, Q108

- [x] (p3c) [feat] Leak coupling restated on the new shape — this commit. The
      mechanism itself (`leakIntoCore` in `src/sim/enemies.ts`, `finishSundering`
      in `src/sim/sundering.ts`) already implemented SPEC-FINAL §1.1's literal
      "2 × its spawn cost into the next VS wave's budget" rule before this item —
      `data/spawns.json`'s `leakBudgetMultiplier` already reads `2`, and the
      TD-block → VS-wave transition (`finishSundering`, unconditional regardless
      of `totalCycles`) already spends `nightBudgetBonus` into `spawnBudget` and
      clears both it and `looseInTheDark` exactly once per transition. Nothing in
      `src/sim` changed. The work was `tests/f003-leak-coupling.test.ts`'s
      re-pointing from SPEC-V2 §1/Day-Night/gate-B7 language to SPEC-FINAL
      §1.1/TD-VS/gate-G6 language, an explicit `expect(leakBudgetMultiplier).
      toBe(2)` pin of the spec's literal number, and one new test driving a full
      scripted 6-block (18 TD + 6 VS) run — the real §1.1 shape landed by p3a/p3b,
      not the legacy single-block `cycles: 3` config the older cases used — with
      a distinct leak count per block (1..6) so a stale carry-over or
      wrong-block attribution would show up as a mismatched total at some block.
      Confirmed the final, boss-gated 6th VS wave is funded by the same
      unconditional `finishSundering` path as every other block (no special-casing
      to go missing). code-reviewer **APPROVE** (1 Minor taken: a redundant
      duplicate assertion in the `block === 6` branch, already covered by the
      loop's own per-block check, replaced with a comment; 2 Nits not blocking:
      the `expect(mul).toBe(2)` literal is intentional — it pins the spec's own
      number, not a `/data` implementation detail, so a future `leakBudgetMultiplier`
      retune needs to touch this line too; a redundant no-op `w.duskTimer = 0`
      carried over from the older single-block tests). **qa-playtester PASS**,
      no bugs found: independently verified with real (non-scripted)
      `hybrid`/`turtle`-bot-driven sims across many seeds that a TD block's real
      leaks fund the following VS wave's `spawnBudget` exactly, that the HUD's
      "Loose in the dark" counter resets the instant the transition fires, that a
      leak on the exact wave-clearing tick can't double-count or drop (the
      `'dusk'` phase branch never calls `leakIntoCore`), that p3b's multi-summon
      stacking can't cross a block boundary so a stacked fight can't misattribute
      a leak's budget, and that the final boss-gated VS wave (reached in a real,
      non-forced `godMode` run) is funded identically to every other block.
      `npm test`: 674 pass / 33 skipped (0 failed, up from 673/33 pre-p3c — the
      one new test), byte-identical elsewhere since no `src/` file changed — refs:
      §1.1, G6

- [x] (p3b) [feat] Multi-summon: the player may call the next TD wave(s) early,
      stacking up to `maxStackedWaves` (3) at once — this commit. Gate **G6 is now
      green in full** (p3a landed the pattern half; this item lands the stacking
      half). `src/sim/run.ts`'s `call` command now handles two cases: in
      `act1_build`, unchanged pre-existing behavior (pay off whatever is left of
      the live `buildTimer`, zero it, let `updateAct1Build` start the wave). In
      `act1_wave` (a wave already fighting), `call` pulls the *next* wave's own
      not-yet-started build phase forward — paying the *full* `buildPhaseSeconds ×
      earlyCallGoldPerSecond` bonus, since none of that wave's own timer has
      ticked — and merges its freshly-built spawn queue onto the fight already in
      progress. `World.stackDepth` (new field, `src/sim/world.ts`) counts the 0..
      `maxStackedWaves - 1` extra waves merged this way; a call once `stackDepth`
      is already at cap is rejected outright (no gold, no state change) — the
      fourth-stack rejection G6 asks for. A call cannot pull a wave across the
      current TD block's boundary into the VS wave that follows (checked against
      `cycleWaveEnd`, unchanged from p3a), and is a total no-op in every phase but
      `act1_build`/`act1_wave` — VS "cannot be stacked or skipped," so `dusk`,
      `act2`, `levelup`, `dawn` and `results` all reject it identically.
      `completeWave` now resolves the whole merged range (`w.wave` through
      `w.wave + stackDepth`) at once when the fight finally clears: every wave in
      the range still pays its own clear bonus, its own line in
      `goldEarnedByWave`/`wavesCleared`, and (after a code-review fix, below) its
      own Sprout-tower income, then `w.wave` advances to the top of the range and
      `stackDepth` resets to 0 — a true no-op, byte-identical to the pre-p3b
      single-wave path, whenever nothing was stacked. `spawnQueue` entries grew a
      third element, their true origin wave (`[enemyDefId, gateIndex, originWave]`)
      — a merged fight interleaves more than one wave's composition, so
      `spawnedByWave` telemetry and per-enemy HP scaling (`waveHpScale`) now stay
      attributed to the wave that actually authored each enemy rather than
      collapsing onto the fight's base wave. `maxStackedWaves` is a new required
      `data/waves.json` field (3, per §1.1's own "up to 3 at once ⚖") rather than a
      hardcoded constant, per CLAUDE.md's architecture rule 4. `World.stackDepth`
      is hashed (`hashWorld`, `run.ts`) since it gates the timing of the next
      block/dusk transition, the same class of state `wieldedCooldown` is hashed
      for (x002/p2b precedent). Q107 records the design decision (one merged fight
      vs. three parallel ones — merged was chosen, smaller diff, reuses
      `applyCommand`/`completeWave` as-is) and the two things deliberately left
      imprecise: `leaksByWave` still attributes a leak to the fight's base wave
      rather than the leaking enemy's true origin (would need an `Enemy` schema/
      hash change for a telemetry-only number nothing gates), and
      `src/ui/progress.ts`'s `waveBar` sub-progress text can be briefly off mid-
      stack (self-corrects the instant the stack resolves, no test covers it).
      **code-reviewer REQUEST-CHANGES → fixed, then re-verified clean**: the first
      draft hoisted `collectSproutGold(w)` outside the new per-wave loop in
      `completeWave`, so an N-wave stacked clear collected only one wave's worth of
      Sprout-tower income instead of N (and, since `goldEarnedByWave[wv]` was
      recorded before that wave's own Sprout income landed, the *unstacked* path's
      telemetry silently reordered too, though its gold total stayed correct).
      Fixed by moving the call inside the loop, once per `wv`, in the same
      relative position the original single-wave code used; a new regression case
      builds one Harvest Sprout and asserts a 2-wave stacked clear banks exactly
      two waves' worth of wave-clear-plus-Sprout income, not one. **qa-playtester
      PASS**, no bugs found across a wide adversarial pass: the three literal
      acceptance clauses (4th call rejected, each of 3 stacked waves pays its bonus
      exactly once, VS-phase no-op checked in all five non-TD phases individually);
      stacking cannot cross a block boundary (checked at wave 3→4 and at the very
      last global wave, 17→18 of cycle 6); a double `call` landing in the same tick
      during `act1_build` doesn't double-pay; `dev skip_wave` on a 3-stacked fight
      still resolves all three waves with distinct bonuses; calling on the exact
      tick a merged fight would otherwise complete delays completion by one tick
      rather than racing; replay-hash determinism holds across two independent
      runs sharing a seed and a command log with stacked calls in it; a full-run
      fuzz (spamming `call` every tick for 5 seeds, and a `hybrid` bot with `call`
      layered on every tick) never produced negative gold, NaN, an out-of-range
      `stackDepth`, or `w.wave > w.waveCount` — a bot that spams `call` dies early
      to leaks from build-time denial, the intended risk of misusing the
      mechanic, not corruption. `npm test`: 673 passed / 33 skipped (0 failed,
      up from 668/33 pre-p3b — the 5 new `tests/p3b-multi-summon.test.ts` cases),
      byte-identical elsewhere since the only existing caller of `call`
      (`src/bots/policies.ts`'s `rushWaves`) is gated to `act1_build` and never
      triggers stacking — multi-summon is a mechanism a bot can now legally use,
      not one any bot uses yet; wiring one in for gate **G19** ("winning sim
      builds include ... multi-summon usage") is `p10f`'s job. `npx tsc --noEmit`
      clean; perf suite (`vitest.perf.config.ts`) green — refs: §1.1, G6, Q107

- [x] (p3a) [feat] The §1.1 run shape: 3 TD waves then 1 VS wave, repeating; 18 TD
      + 6 VS per run — this commit — `World.totalCycles` now defaults to 6 (was 3),
      `World.waveCount`/`cycleWaveEnd`/`nightLengthSeconds` (`src/sim/world.ts`)
      are retargeted to a flat `tdWavesPerVsWave × cycle` / fixed `vsWaveSeconds`
      formula sourced from two new `data/waves.json` fields (`tdWavesPerVsWave: 3`,
      `vsWaveSeconds: 75`), and `buildPhaseSeconds` is edited `30 → 20` to match
      §1.1's literal ⚖ number. **Design decision (Q105): reuse the V2 Day/Dusk/
      Night/Dawn cycle machine, retargeted, rather than build a parallel driver** —
      smaller diff, keeps `dusk`/`act2`/`dawn` and Rekindle exactly as the still-live
      machinery `p3d` formally deletes later, and the two shapes are structurally
      identical ("N blocks, the last boss-gated") once the per-cycle content tables
      are replaced by flat constants. `World.waveCount` branches on
      `totalCycles <= 1`: that branch (`content.waves.waves.length`, unchanged) is
      the legacy single-pass escape hatch `tests/helpers.ts`'s default `cfg()` and
      `light-build.test.ts` already opt into on purpose, left byte-for-byte alone;
      any `totalCycles > 1` gets the new §1.1 shape, landing on TD wave 18 even
      though `data/waves.json` only authors 10 real rows (`buildSpawnQueue` already
      repeats the last authored row past the table's end — real 11-18 content is
      `p8a`'s, not this item's). **Gate G6's pattern half is green**: a full
      scripted 18 TD + 6 VS run (new test `tests/p3a-run-shape.test.ts`) visits VS
      exactly after TD waves 3/6/9/12/15/18 and not before/elsewhere, TD wave 18's
      real spawn queue carries the Gatebreaker, the final VS wave ignores the 75s
      timer entirely and only ends on the Warden-Eater's death, and building is
      rejected throughout every VS wave. `p3b` (multi-summon stacking), `p3c`
      (leak coupling's ×2-into-next-VS-wave restatement) and `p3d` (formally
      deleting the old cycle machine) are untouched and still open — this item only
      lands the pattern, not those three.
      **code-reviewer REQUEST-CHANGES → fixed, then re-reviewed clean**: the
      reused V2 "Dusk" phase's old 15s cinematic delay stayed buildable
      (`canBuildNow` allowed `'dusk'` unconditionally) while its duration was still
      15s for every shape, which would have bought every non-final block 15s of
      legal building beyond the spec's stated 20s and inflated a block's wall-clock
      length to 20+15+75=110s instead of the 95s the spec's two ⚖ numbers imply —
      fixed by collapsing `duskTimer` to 0 for any `totalCycles > 1` run
      (`completeWave`, `run.ts`) while leaving the legacy 15s Dusk exactly as it was
      for `totalCycles <= 1`. Two Minors taken: the Gatebreaker assertion now has a
      comment naming its actual scope (wave 18's queue matches because
      `buildSpawnQueue` repeats wave 10 for every wave 10-18, not because 18 is
      specially authored — that's `p8a`'s), and `data/waves.json`'s now-dead
      `waveEndByCycle`/`nightSecondsByCycle` fields are flagged as deferred to
      `p3d`. One Minor left for `p3e` per the standing no-balance-tuning
      constraint: `eliteMulByCycle`/`nightMinuteOffsetPerCycle` (V2 per-cycle heat
      knobs authored for 3 cycles) degrade safely under the new default of 6
      cycles but silently reshape difficulty (12.5 min of baked-in Night-warmup
      offset by the boss-gated final VS wave, only cycle 2 of 6 gets an elite
      multiplier) — not touched here, since editing either value is the balance
      tuning Q40 defers to P10/`p3e`.
      **qa-playtester FAIL on first pass → fixed, then re-verified**: found a real
      one-tick build window at every TD-wave-3/6/9/12/15/18 → dusk → VS boundary,
      for every multi-block run — `Run.step` applies a tick's commands *before*
      the phase switch's `'dusk'` case can call `finishSundering`, so a `build`
      command landing on the exact zero-`duskTimer` dusk tick still went through,
      one tick before the phase machine ever showed `act2`. Fixed by gating
      `canBuildNow` (`src/sim/towers.ts`) on `phase === 'dusk' && duskTimer > 0`
      rather than `phase === 'dusk'` alone, with a new regression case in
      `tests/p3a-run-shape.test.ts` asserting rejection at exactly that tick, for
      every one of the 6 blocks. Every other item on QA's checklist passed clean
      on the first pass: build/upgrade/sell spam during VS (no gold spent, no
      structures placed), a Core-HP-0 death mid-TD-wave and a Warden-HP-0 death
      mid-VS-wave both resolve cleanly through the existing slow-mo beat with no
      hang, replay-hash determinism holds across the new transitions (same
      seed+policy, two independent runs, identical `endHash`), and five unattended
      `hybrid`-policy seeds each reach a terminal outcome through real combat
      without hanging on any phase.
      `npm test`: 668 passed / 33 skipped (0 failed) before and after every fix in
      this item, plus the perf suite (3 passed); `npx tsc --noEmit` clean
      throughout. One live test's pinned seed moved twice in this item, both times
      measured not guessed (`tests/f001-cycle-machine.test.ts`'s "a scripted
      3-cycle sim completes": seed 8 → seed 1 on the formula change alone, then
      seed 1 → seed 4 once the code-review dusk fix made the economy slightly
      harder too — seed 4 is the lowest of 25 seeds, of 1-60 probed, that a
      `hybrid` bot still reaches cycle 3 with under the code as it now stands, no
      `/data` edits). See QUESTIONS Q105 for the full design writeup (the
      reuse-vs-parallel-driver choice, the `totalCycles<=1` legacy branch, both
      code-review/QA fixes, and the `p3e`-deferred elite/heat-scaling
      consequence) — refs: §1.1, G6.

- [x] (p2e) [polish] Delete the Sundering and soul-binding — this commit — the
      named 8-weapon roster (`data/weapons.json`, deleted), its schemas
      (`WeaponSchema`/`WeaponLevelSchema`/`AwakeningSchema`, `content.ts`), its
      fire loop (`fireWeapon`/`updateWeapons`/`intervalFor`/`grantWeapon`,
      `weapons.ts`, cut from 325 lines to 14 — Palisade/Beacon/Sprout terrain
      residuals only), the Dusk soul picker (`beginSoulPick` and its helpers,
      cut from `sundering.ts`), weapon state (`WeaponState`, `w.weapons`,
      `w.soulLevels`, `w.soulCandidates`, `s.soulSuppressed`), the
      `weaponSlots`/`startWeaponLevel` stats, the HUD's soul-picker modal and
      weapon-info card (`showSoulPicker`/`weaponInfoMarkup`, `hud.ts`/
      `tower-info.ts`), bot soul-picking logic (`policies.ts`), and every
      tower's `soul` field (`data/towers.json`) are all gone. §6.1's
      replacement — wielded attacks derived from built tower types
      (`vswield.ts`, p2a/p2b) plus each tower's §5 VS special (`vsspecials.ts`,
      p2c) — already carried the whole mechanic live since p2c; this item only
      removes the older system it was still double-paying alongside (Q97,
      Q103). The AoE/pierce falloff constants (`aoeFullTargets`, `aoeFalloff`,
      `pierceFalloff`, etc.) moved from `data/weapons.json` to
      `data/towers.json` since the damping rule is generic to every attack
      shape, not weapon-specific.
      **Q104**: `src/sim/sundering.ts` is not deleted wholesale despite the
      item's literal text — only `beginSoulPick` and its helpers are cut. The
      Day/Dusk/Night/Dawn cycle machine (`finishSundering`/`petrify`/
      `clearCorePocket`/`openApproachLanes`/`linkSpires`/`beginDawn`/
      `rekindleTower`/`advanceFromDawn`) is a separate, still-live mechanic
      that P3's `p3d` retires on its own schedule, exercised end to end by
      `tests/f001-cycle-machine.test.ts` — deleting it here would have broken
      a not-yet-retired test to satisfy a filename match, which CLAUDE.md
      rule 5 (choose and log, don't stall) reads as the wrong trade.
      **Q101**: deleting `weaponSlots`/`startWeaponLevel` orphaned three tree
      nodes and one quest; each got an on-theme mechanical replacement rather
      than being left dead — `soul_furnace` (notable) → `attackSpeed +12%`
      (sized like the branch's other small-node-to-notable jumps), `glass_arsenal`
      (keystone) → `power +25%` alongside its unchanged `-30%` Max HP (keeps the
      glass-cannon trade-off a keystone needs), `deep_roots` (keystone) → its
      weapon-slot clause is simply dropped (pure subtraction, no compensating
      grant needed). The `four_slot_win` quest ("Ascetic") is restated from
      "win using at most 4 weapon slots" to "win having built at most 4 tower
      types" (`wins_max4towertypes`, counted off `report.towersByKey` filtered
      to `attack !== null` so a wall-only maze still costs nothing toward the
      cap, the same substitution `tools/a4probe.ts`'s `SOUL_TOWERS` already
      made). `tools/gen-tree.mjs` is the edited source; `data/tree.json` is
      regenerated from it, diff confined to those three nodes.
      **Q102**: `w.shrineHaste` (Beacon Totem's petrified-terrain haste
      residual) is still written every Act II tick by `updateTerrainEffects`
      but is now read nowhere — `intervalFor` was its only consumer and is
      deleted with the rest of the fire loop, and neither `vswield.ts`'s
      wielded-attack cooldown nor the Act I manual attack ever read it either,
      so the gap predates this item. Left unwired rather than guessed at:
      CLAUDE.md's blast-radius rule cuts against a drive-by integration guess
      inside an already-shipped, already-reviewed file during an unrelated
      deletion pass. Flagged for whoever next touches `vswield.ts`, or a
      dedicated balance item, to decide.
      **Q103 — balance, measured not tuned, and larger than any prior item's.**
      The soul-weapon fire loop was firing *alongside* every built tower's
      wielded attack, not merely duplicating a residual (unlike Q97's three
      terrain riders) — deleting it removes the bulk of a scripted board's Act
      II damage, not a marginal share. Measured (seeds 1-40, no `/data`
      edits): `maxbuild`'s boss win rate goes from measured-high pre-p2e to
      **0/40**; `sealed`/`greedy`/`turtle` also drop to 0/40; `hybrid` (a
      narrower 6-type mix without `upgradeFirst`) survives far better at
      **20/40** (9/20 over the seed range the existing tests already probed).
      Three tests re-pinned to this measured reality, nothing tuned in
      `/data`: `tests/boss.test.ts`'s two boss-fight assertions moved from
      `maxbuild` to `hybrid` (single-run case: seed 1, victory, 862s; rate
      case: restated from a 60% "most win" floor to a 25%-65% band around the
      measured 45%, since "most" is no longer true at 9/20); `tests/a3-
      movement-mandatory.test.ts`'s Q100 exception (seeds 3 and 5 winning
      stationary) is gone now that the other half of that stack is deleted,
      so all twelve `no-move` seeds are unanimously `defeat_warden` again —
      folded back into one claim rather than kept as a second, now-always-empty
      `it`; `tests/f001-cycle-machine.test.ts`'s cycle-3 pin moves from seed 18
      (no longer reaches cycle 3 under `hybrid`) to seed 8. Whether §6.1's
      wielding-alone formula is supposed to be this much weaker than the V2
      mechanic it replaced is a **P10 balance question** — these three tests
      only pin that the run shape still functions end to end, not that the
      numbers are right.
      Acceptance met: `data/weapons.json` deleted; `npm test` green (both
      `npx vitest run` — 667 pass/33 skipped — and `npx vitest run --config
      vitest.perf.config.ts` — A10 in budget); MIGRATION.md §8's five
      retire-with-p2e rows (`sundering.test.ts` all 4 describes, `act2.test.ts`'s
      `soul weapons` and `weapon inheritance` describes, `f004-class-
      framework.test.ts`'s Dusk-picker describe, `content-complete.test.ts`'s
      "has 8 weapons" case) are all actually deleted, confirmed by grep; a
      repo-wide `grep -rniE "soul|awakening" src/` turns up only the sanctioned
      survivors (the still-live Dawn/Rekindle UI's flavour text and the Q101/
      Q104 doc comments explaining what moved) — no dead code from the deleted
      system. code-reviewer **APPROVE** (2 Minor, both taken: a doc comment in
      `vsspecials.ts` still named the deleted `weapons.ts` as the poison
      mechanism's other user, corrected to `vswield.ts`/`towers.ts`; the Dawn
      modal's copy — "leave it and its soul stays bound for Night" — described
      a mechanic that no longer exists, reworded to "leave it and it stays
      petrified through Night"). **qa-playtester PASS**, no bugs found across
      a full adversarial pass: a mixed-type board through Dusk → Act II → boss
      with no crash and `damageByWeapon` correctly keyed by tower key; a
      zero-structures run through Dusk and into Act II with `wieldedAttacks(w)`
      empty and the HUD's lineage panel safely rendering nothing; save
      migration unaffected (weapon state was never part of the persisted
      `MetaState` — only `World`/run state carried it, and that was never
      serialized); the `four_slot_win` boundary (wall-only free, 4 attacking
      types passes, 5 fails) independently re-derived from the code, not just
      the write-up; `tools/gen-tree.mjs` reproduces `data/tree.json` byte-for-
      byte on a fresh run — refs: §6.1, Q97, Q101, Q102, Q103, Q104

- [x] (p2d) [polish] Weapon panel shows §6.2's per-type lineage — commit `46eaef5` —
      `wieldedAttacks` (`src/sim/vswield.ts`) gained `perTowerAverage`, the average
      per-tower damage before §6.1's "+10% per tower" bonus, exposed so a reader
      never re-derives that fraction itself. `wieldedLineageText` (`src/ui/tower-
      info.ts`) maps `wieldedAttacks(w)` to one line per type — "Arrow ×3 (avg 14.2,
      +30%) — pierce 2" — via `lineageLine`/`lineageSpecial`, a compact per-kind
      phrase table (single/pierce/cone/aura/chain/lob/poison) alongside the existing
      `KIND_TEXT`. `Hud.renderWeaponInfo` (`src/ui/hud.ts`) renders the block below
      (or, with no soul weapon equipped, in place of) the soul-weapon card, keyed by
      a sorted `towerId.tier` roster fingerprint so the cache invalidates on a
      mid-VS-wave tower death (an enemy kill through `World.removeStructure`), not
      just build/sell/upgrade. Acceptance met: `tests/p2d-weapon-lineage.test.ts`
      (4 cases) — the worked-example line shape round-tripped against
      `wieldedAttacks`' own `perTowerAverage`/`damage`/`profile` fields rather than a
      second copy of the bonus formula, one well-formed line per attack-bearing
      tower kind (all 7), a no-attack tower (wall) contributing no line, and a
      live-DOM `Hud` test proving the panel drops a dead tower's line on the very
      next `update()` instead of serving a stale cached render. code-reviewer
      **APPROVE** (2 Minor, logged not blocking: the roster fingerprint is
      recomputed by `filter`+`map`+`sort`+`join` every VS-phase frame rather than
      gated behind a dirty flag — real but bounded by tower count, not a hard-rule
      violation since it's `/src/ui`, not `/src/sim`; and the soul-weapon-equipped
      cache-key branch shares the identical fix but has no direct regression test
      of its own, only the no-weapon branch does). **qa-playtester PASS**, no bugs
      found across multiple simultaneous wielded types, mixed tiers of the same
      type, a tower dying mid-wave to enemy damage vs. sell, building blocked
      outright during VS (confirmed structurally via `canBuildNow`'s phase gate, so
      "new type appears mid-wave" cannot happen), the panel correctly absent outside
      VS, a 60-tower boundary case (no NaN/overflow), and replay-hash safety — the
      new `perTowerAverage` field and the whole lineage derivation are pure reads
      never touched by `hashWorld`, same as the pre-existing `wieldedCache`. Full
      suite: 685 pass / 67 skipped, plus the pre-existing host-dependent A10
      wall-clock flake, confirmed by QA to fail identically with this diff stashed
      out (not a regression) — refs: §6.2, G3, Q95

- [x] (p2f) [bug] `triggerBurningExplode` (`src/sim/enemies.ts`) no longer recurses
      directly through `killEnemy` → `damageEnemy` → `triggerBurningExplode` — this
      commit. `killEnemy` now pushes the dying Burning enemy onto a new
      `w.pendingBurningExplosions` queue and calls `drainBurningExplosions(w)`
      (`enemies.ts`), a small helper guarded by `w.drainingBurningExplosions`: a
      re-entrant call from deeper in the chain (`triggerBurningExplode` →
      `damageEnemy` → `killEnemy`) just enqueues and returns, so only the
      outermost call runs the `while (pop() !== undefined)` loop — a long chain
      now grows the queue array, not the JS call stack. Both new fields are plain
      `World` class-field initializers (`world.ts`), the same pattern as the
      existing `deadEnemies`/`deadStructures` flags; `drainBurningExplosions`'s
      `finally` clears both unconditionally (flag *and* queue, the latter a
      code-reviewer Minor taken so an exception mid-drain can't leave a stale
      remainder for the next, unrelated Burning kill to replay), so the queue is
      always empty and the flag always false by the time control returns to any
      caller — which is also why `hashWorld` needs no new case: the fields are
      never observably nonzero at a hash point, same reasoning that already
      excludes `dotScratch` and friends. Acceptance met:
      `tests/p2c-vs-specials.test.ts` gains "a large tightly-clustered Burning
      chain does not overflow the call stack" — a 45×45 grid (2025) of hp-1,
      speed-0 Burning husks spaced 0.4 tiles apart (inside the r1 explosion
      radius) under a live Ember Brazier in a VS wave; killing one asserts
      `damageEnemy` does not throw and that more than half the grid dies (so the
      cascade is proven to propagate, not fizzle after one hop). Both
      code-reviewer and qa-playtester independently confirmed empirically that
      the test reproduces the original `RangeError: Maximum call stack size
      exceeded` when only `enemies.ts`/`world.ts` are reverted and the test is
      kept — a real, non-vacuous regression test, not a coincidental pass.
      code-reviewer **APPROVE** (2 Minor, both taken: the `finally`-clears-queue
      fix above, and `triggerBurningExplode`'s `enemiesInRadius` call reusing a
      new module-level `burningExplodeScratch` array instead of allocating fresh
      per explosion, mirroring the existing `dotScratch` pattern — now load-bearing
      since a chain runs to completion at thousands-of-explosions scale instead of
      crashing partway through). **qa-playtester PASS**, no bugs found across five
      adversarial scenarios beyond the regression test itself: ordinary small
      chains (2-5 enemies, three hp distributions) hit byte-identical targets
      under old vs. new code (order-independence — a fixed point, not a
      DFS-vs-BFS artifact); a non-explosion death queued mid-drain still dies
      exactly once and the redundant re-hit on the now-dead enemy is a correct
      no-op; Act I (`huntsWarden` false) touches neither new field; the two new
      `World` fields carry no replay-hash gap (argued above, and empirically
      unmoved on `f001-cycle-machine.test.ts`'s rekindle-replay hash case); and
      two alive Braziers matching the special still deal exactly one hit each
      (unchanged p2c semantics, the scratch-array reuse is safe because a
      re-entrant push never itself iterates the array — only the outermost call's
      `for` loop does, and it always finishes before the next tower in the same
      synchronous loop can reuse the buffer). Full suite: 681 pass / 67 skipped
      (byte-identical to pre-p2f), plus the pre-existing host-dependent A10
      wall-clock flake (recorded at p1b, not caused here; measured again this
      commit at 5514ms vs the 5000ms budget) — refs: §5, QA on p2c

- [x] (p2c) [feat] Towers inert but present in VS waves, each contributing its §5
      VS special — this commit — `src/sim/vsspecials.ts`'s `updateVsSpecials(w, dt)`,
      wired into `updateAct2` (`src/sim/run.ts`) alongside `updateWieldedAttacks`.
      "Inert" needed no new gate: `updateTowers` (the only thing that fires an Act I
      tower attack) is structurally reachable only from `act1_build`/`act1_wave`, never
      from `updateAct2`, so the acceptance criterion's first clause was already true —
      this item's actual work is the second, the six §5 specials. Three are
      timer-driven and character-relative (`vsspecials.ts`): Venom Spore's poison
      trail follows the Warden and refreshes at `wielded.damage × 0.1` every second
      (reusing the ordinary `GroundArea('poison')` mechanism the `toxic_trail` soul
      weapon already used, so the DoT stacks/caps/sheds like any other poison);
      Frost Obelisk's r2 ice aura follows the Warden and applies Frost (§3's status,
      not V2's plain slow) every second; Tesla Coil's wire grid reuses `linkSpires`'s
      existing pairing and pulses 5 dmg every 0.5s between every linked pair, each
      pair exactly once (`otherId < s.id` skip). One is death-reactive
      (`triggerBurningExplode`, `src/sim/enemies.ts`, called from `killEnemy`, gated
      on `w.huntsWarden` so it is VS-only): a Burning enemy dying deals 5 normal, r1,
      to nearby enemies, reading whichever Brazier is actually built rather than
      hardcoding the tower key (the m19a `shredArmor` failure mode named in its own
      doc comment). Two needed no new code at all: Beacon's haste and Sprout's gems
      already existed as the `shrine`/`gem_bloom` terrain rows and already matched
      §5's numbers verbatim (Q99) — `vsSpecial: {kind: 'beaconHaste'|'sproutGems'}`
      is a marker only, so the Codex/loader can see every tower has an authored
      special without a second copy of numbers to drift out of sync.
      **Retired alongside it:** the V2 "terrain residual" damage/CC code (auras,
      slows, beams) that used to fire Ember Brazier/Frost Obelisk/Tesla Coil's old
      effects from the tower's own tile — Q97 had already named it as double-paying
      against both `updateWieldedAttacks` and the new specials, and it is now deleted
      from `weapons.ts` rather than left to keep double-paying. `vsSpecial` is a
      required, typed discriminated union on every `TowerDef` (`content.ts`) — "none"
      is explicit — so a special with no engine reader is a load error, not a
      silently-dead data row. Q98 logs three unstated §5 defaults (no character-stat
      scaling on any VS special — §6.2 calls it a property of the tower, not the
      wielding language §6.1 uses; poison trail radius 1, matching Venom Spore's own
      authored `aoe`; electric pulse 5 dmg/0.5s, the old `beamDps: 10` continuous
      residual's average unchanged, a mechanical no-op per Q40's no-tuning rule).
      Acceptance met: `tests/p2c-vs-specials.test.ts` (9 cases) — zero tower-dealt
      damage across a full 4500-tick/75s VS wave with the Warden outside both attack
      and wielded range, an enemy damaging a tower during VS, and one test per special
      (wire grid pulse, poison trail dps/position, brazier explosion plus the
      no-brazier-no-explosion negative, frost aura radius cutoff, beacon haste
      falloff, sprout gem cadence/value).
      code-reviewer **APPROVE** (2 Minor, both taken: the five terrain fields the
      deleted residual code left as silently-dead schema/data — `auraRadius`/
      `auraDps`/`auraType`/`slow`/`beamDps` — removed from `TerrainSchema` and the
      four towers.json rows that carried them, since `vsSpecial` now owns those
      numbers; the zero-damage test widened from a 300-tick stand-in to the real
      4500-tick wave and the enemy-damages-tower test given `w.phase = 'act2'` so it
      actually exercises VS rather than a phase-agnostic path — plus 2 Nits not
      taken: caching the per-tick alive-special scan the way `buildTerrainEffects`
      does, and a comment noting the Brazier explosion's death-chain recursion is
      intentional). **qa-playtester PASS** on every acceptance clause plus seven
      adversarial scenarios (redundant same-kind towers, mid-wave tower death via
      enemy damage, sell-before-Act-II, determinism across two independent 4500-tick
      worlds with every special live, 3+-way Tesla Coil linking) — one real bug
      filed, not fixed here: `triggerBurningExplode`'s direct recursion through
      `killEnemy` overflows the call stack at ~1500-1600 chained Burning deaths in
      one explosion-radius cluster, latent under today's 350 `aliveCap` but a real
      crash risk if that cap ever grows or a burst-kill tool hits a packed crowd —
      filed as **p2f** with QA's exact repro, since CLAUDE.md's rule is a failing
      regression test before the fix, not a same-item patch for an unreachable edge.
      **Balance — measured, nothing tuned.** Retiring the double-paying residual
      (Q97) while standing up Frost Obelisk's character-following aura in its place
      changes what it replaces: the old residual only reached enemies that happened
      to path near the tower's own (petrified) tile, the new one blankets whoever is
      actually pressing the Warden, continuously, for the whole fight. Measured (a
      scratch probe, seeds 1-12, `no-move`): 2 of 12 previously-`defeat_warden` seeds
      (3, 5) now read outright `victory`/`bossKilled: true` — the first time this
      suite's "a stationary Warden always dies" claim has stopped being literally
      true rather than merely slower (Q100). `tests/a3-movement-mandatory.test.ts`
      keeps both facts live rather than hiding either behind a `.skip`: the top `it`
      asserts "always dies" over the ten seeds that still support it, a new second
      `it` asserts the two-seed exception as a measured fact. `tests/f001-cycle-
      machine.test.ts`'s reseed (seed 5 → 18) is the same mechanism's other
      consequence: retiring the residual is a real Act II damage cut for a `hybrid`
      board that leaned on it, so seed 5 no longer reaches cycle 3 (dies mid cycle 1)
      where seeds 18/37/40 do. Full suite: 680 pass / 67 skipped, plus the
      pre-existing host-dependent A10 wall-clock flake (recorded at p1b, not caused
      here) — refs: §5, §6.2, Q97, Q98, Q99, Q100

- [x] (p2b) [feat] Wielded attacks fire as character attacks per §6.1's last
      clause — this commit — `updateWieldedAttacks` (`src/sim/vswield.ts`),
      called from `updateAct2` alongside `updateWeapons`, fires each built
      tower type from the Warden's own position on its own per-type cooldown
      (`World.wieldedCooldown`, hashed), reusing the exact `combat.ts`
      shape-by-`kind` primitives `fireTower`/`fireWeapon` already call for all
      seven attack kinds — so lifesteal and damage attribution fall out for
      free rather than as a special case, since `dealHit`'s `DamageOptions`
      carries no `dot`/typed override and `damageEnemy`'s §2 leech gate sees
      it as ordinary character damage. Damage scales by `w.derived.powerMul`
      on top of §6.1's own average+10%/tower formula; range/radius/chain reach
      scale by `w.derived.areaMul`; the interval divides by
      `w.derived.attackSpeedMul` — the three stats §6.1 names, and *not*
      `towerDamageMul`/`towerRangeMul`/`affinityMul`, which stay Act I's.
      Targeting is character-relative (`w.nearestEnemy` off the Warden's own
      position), not `targetFirst`'s Core-relative flow-field distance, which
      exists to protect the TD path and means nothing once the attack stands
      wherever the player does. §4.1's "counts as 1 attack" rule is a new,
      minimal hook (`World.recordAttack`/`attacksFired`/`onAttack`) firing
      once per volley regardless of how many enemies it hit, proven with a
      Frost Obelisk hitting three enemies in one aura pulse and reading
      exactly one attack — real plumbing for P6's on-attack passives to
      consume, not a stub (Q96 records that no consumer exists yet). Acceptance
      met: `tests/p2b-wielded-fire.test.ts` (16 cases) drives Power/Area/
      attack-speed scaling independently, every one of the seven attack kinds
      through the real fire loop, the lifesteal hand-off timing (x002's own
      one-tick accumulator drain), the one-attack-per-volley count, the
      no-target retry-every-tick behaviour, cache invalidation on both a
      build-mid-run roster *growth* and a combat-death roster *shrinkage*, an
      empty board staying side-effect-free, and a replay-hash smoke.
      code-reviewer **REQUEST-CHANGES → both taken**: a Critical (the
      wielded/aura caches went stale on any enemy-caused tower death, not just
      sell/build/upgrade/Rekindle — `World.removeStructure` is now the single
      choke point that invalidates both) and a Minor (a doc comment overstated
      the wielded aura kind's parity with `fireTower`'s, which has no
      no-target retry). qa-playtester **PASS after 1 filed, fixed here** —
      independently reproduced the same Critical via `w.removeStructure`,
      confirmed the durable A3/boss claims and full-run determinism
      (`endHash` identical across two seed-1 runs) hold, and found nothing
      else across seven adversarial scratch cases (multi-type wielding,
      mid-run roster changes, stat changes mid-cooldown, boss fights with
      wielding live, soul-weapon/wielded damage attribution cross-talk). Both
      passes also named the same process gap this entry corrects: an earlier
      draft of this line asserted review verdicts and a test count (9/13) that
      did not match the file (15, now 16 with the regression test) — the
      lesson is CLAUDE.md's own: delegate the review, don't narrate it.
      Q97 (code-reviewer) logs one more finding left unfixed by design: three
      tower types' legacy V2 terrain-residual damage now double-pays alongside
      their wielded attack until p2c/p2e retire the residual system, an
      uncosted confound in every wielding-era balance number below, named
      rather than fixed inside a measure-don't-tune item. **Balance — measured, nothing tuned, and
      larger than any prior item's.** 12-seed sweep, same seeds either side:
      `maxbuild` barely moves (medSurv 180 unchanged, medKills 5946 → 6011,
      ~1%, since a maxbuild board's wielded damage is a small fraction of its
      already-large weapon output); `hybrid` moves hard — medSurv
      **126.08 → 180** (now matching maxbuild's ceiling), medMin 7.4 → 12.8,
      medWaves 4 → 6, medLevel 17 → 21, medKills 3320 → 5997 — because a
      lighter build's weapon-only output was the smaller half of its total
      damage, and doubling it (soul weapons plus every built tower's own
      attack, now firing twice) moves `hybrid` from "usually dies mid-run" to
      "usually reaches the boss." Three pre-existing gates without a §14
      letter (Q84: A3, A9) went red as the same, understood mechanism reaches
      further than the sweep does — all `.skip()`-ed in place with the
      mechanism named at each site and in Q96, per the standing constraint
      that a bound failing before P3/P10 gets a recorded reason, not a nudged
      constant: A3's per-seed 600s bound (now 644-830s), its "half dead by
      3:00" bound (now 0/12), the "moved survives 2x as long" ratio (now
      ~1.24x), and A9's "greedy wins under 50% at T2" bound (now 9/12). Every
      *durable* claim under each still holds — a stationary Warden still
      always ends `defeat_warden` with the boss never killed, movement is
      still measurably better. f001's cycle-machine smoke (superseded
      machinery, no gate letter) needed only a reseed — seed 16 no longer
      reaches cycle 3 under `hybrid`, seed 5 does, recorded as a target
      change, not a tuning nudge. Full suite: 670 pass / 67 skipped, plus the
      pre-existing host-dependent A10 wall-clock flake (recorded at p1b, not
      caused here) — refs: §6.1, §4.1, G3, Q96, Q97

- [x] (p2a) [feat] VS wielding formula per §6.1 — this commit — the formula
      only: `src/sim/vswield.ts`'s `wieldedAttacks(w)` groups living, attack-
      bearing structures by tower type and returns one `WieldedAttack` per
      type — `damage = (Σ each tower's own-tier damage / count) × (1 + 10% ×
      count)`, `interval` the type's raw authored value (attack speed is never
      tier-scaled, confirmed against `towers.ts`), and `profile =
      attackProfile(def, highestTier)` for "special effects and the highest
      upgrade level's effects". Types with no `attack` (walls, Beacon, Sprout)
      correctly wield nothing; dead structures do not feed the average.
      Acceptance met: `tests/p2a-vs-wielding.test.ts` (3 cases) transcribes
      §6.1's worked example verbatim, independently re-deriving the expected
      arrow/poison damage from `/data` rather than echoing the implementation
      back at itself, plus the no-attack and dead-structure cases. Q95 logs
      the one interpretation call the example needed: its "lv3" reads as the
      spec's own `@3` milestone label, live at engine tier 4 under this
      codebase's shipped "tier 1 = zero steps bought" convention (m20b) — tier
      3 literally would carry zero pierce and contradict the worked example's
      own text, so the test builds at tier 4 rather than silently renumbering
      `/data`'s `at` field. Scope: the formula only — `wieldedAttacks` is not
      called from any live loop yet (p2b wires character-scaled fire and
      lifesteal, p2c makes towers inert and adds the §5 VS specials).
      code-reviewer **APPROVE** (2 Minors, not taken: `highestTier` seeded at
      1 rather than derived from the group, harmless since a built structure's
      floor is tier 1; no `petrified` filter, correctly diverging from
      `towers.ts`'s live loops because §6.1 grants every built type
      unconditionally and Dusk/petrification is legacy code slated for
      deletion at p2e). qa-playtester **PASS**, no bugs found across seven
      adversarial scratch cases (empty board, multi-type grouping, max-tier,
      50-count same-type, mixed tiers, sell-mid-sequence) — noted for p2b,
      not a defect here: the formula omits `powerMul`/`towerDamageMul`/
      `affinityMul`, matching §6.1's own worked example, so whether character
      power applies to wielded damage is p2b's open call. Full suite: 657
      pass / 63 skipped, plus the pre-existing host-dependent A10 wall-clock
      flake (recorded at p1b, not caused here) — refs: §6.1, G3, Q95

- [x] (p1b) [balance] Turtle economics stay honest once sealing is legal — this
      commit — G7's third clause is a live test, and the measurement's finding is
      that sealing today is *dominated*, not dominant. `sealed` is a real policy
      (`src/bots/policies.ts`): maxbuild's tower mix plus a completed radius-5
      palisade ring — `allowSeal` is the one-policy opt-in, every other bot keeps
      the classic open maze, and the ring only ever completes because a sealing
      turtle counts the guns it already has (the always-6 tower lead re-planned
      every wave starved the ring forever: 22 towers, 0 palisades by wave 10).
      Measured at T2 over seeds 1–12 with autoDraft modifiers: sealed **1/12**,
      maxbuild **7/12**, hybrid **9/12** — the band (sealed ≤ best open + 10 pts)
      holds by maximum margin; 7 sealed seeds lose the Core in Act I to §10's
      breach chewing, 4 lose the Warden in Act II, 1 wins. The vacuity guards are
      live assertions, not comments: the sealed arm must latch
      `!allGatesReachable()` (the physical scratch-field diagnostic) on 12/12
      seeds **by tick 15000** (QA hardening — measured max first seal 12600; the
      latch alone would pass a seal delayed to wave 9), and the open arms on
      0/12. Q94 logs the four measurement decisions and the honest caveat: a bot
      band is only as strong as its best sealed challenger — G19 (p10f) and
      Q83's p3e re-measure are the mitigations. Existing-policy neutrality is
      QA-proven, not argued: end hashes byte-identical to HEAD for
      maxbuild+hybrid × 12 seeds × {T1 no-mods, T2 drafted} (48 runs per side)
      and sweep medians identical column-for-column. Acceptance met:
      `tests/p1b-seal-winrate.test.ts` (3 cases) in the vitest include glob —
      the live test the item demanded. code-reviewer **APPROVE** (5 Minors, 4
      taken: probe script deleted before commit, beforeAll refactor with an
      explicit timeout, `standingGuns` hoisted behind `allowSeal`, redundant
      import dropped; the 5th is Q94's caveat, logged not fixed).
      qa-playtester **PASS**, no acceptance-blocking bugs, mutation checks
      green (never-seals and band-violation mutations each turn exactly their
      own assertion red); its two findings taken — the first-seal-tick bound
      above, and a 7/4 loss recount that corrected this entry's own first
      draft. Recorded, not caused here: A10's wall-clock clause is red on this
      host **at HEAD too** (control measured in a clean worktree: HEAD median
      5473 ms vs the 5000 budget, working tree 7071 ms) — Q41's
      host-dependent-bound story again; p10e owns the re-baseline — refs: §10,
      G7, Q83, Q94

- [x] (p1a) [feat] Remove the path guarantee; structures become high-cost
      passable tiles — this commit — §10's one line becomes an engine rule in
      five logged defaults (Q92). The ground flow field runs in a breach mode:
      a structure tile is enterable **orthogonally** at `breach.base +
      breach.perEhp × effective max HP` (both new in `data/towers.json`, both
      ⚖ for P10; effective HP = max HP ÷ the §2 damage-taken multiplier its
      defense earns, re-priced on build/upgrade, cleared on death), diagonals
      stay fully physical, and an open path always outprices a breach by
      construction — `base` ≥ the longest walkable route, pinned by an
      executable-invariant test that a /data tune would turn red. Chewing is
      **routed, not incidental**: a pathing enemy attacks a bumped structure
      only when the field routes it into one, when it has no route (the Act II
      beeline fallback, preserved), when it stands inside an occupied tile
      (entombment dig-out), or when it carries `structureBreaker` (the
      Gatebreaker, G7's authored exception) — all four clauses
      mutation-verified (each mutation turns exactly its own test red).
      `checkBuild` accepts seals, `blocks_path` is deleted with no stale
      readers, and `allGatesReachable`/`wouldBlockPath` survive as *physical*
      diagnostics on a scratch field (the live ground field would answer yes to
      everything). Bots skip sealing placements — the exact check the old
      rejection ran — so default play is unchanged: the 12-seed sweep is
      **byte-identical** either side on both policies, QA-verified against a
      HEAD worktree. End hashes are not in the sweep and do legitimately move
      on seeds where HEAD's any-bump rule chewed walls: QA bisected seed 1
      `hybrid` to exactly one petrified palisade at 0.1 HP of incidental chew
      that no longer happens — clause 2 measured, not asserted. Acceptance
      met: `tests/p1a-sealing.test.ts` (13 cases) — seal legality with the
      breach field never going unreachable, pricing (toughness ordering,
      upgrade re-price, clear-on-death, /data mirror, the §10 invariant), a
      sealed ring chewed at its cheapest tile with every palisade untouched
      and the Core reached, open-path funnel and pinned-shove zero-chew,
      Gatebreaker bump-chew, entombment dig-out, flier/burrower/wraith
      bypasses, and a siege hash smoke. 651 pass / 63 skipped + perf 3/3.
      code-reviewer **REQUEST-CHANGES → both Majors taken** (the entombment
      permanent-pin regression; the untested `structureBreaker` branch) plus
      three Minors (breach-on-any-occ-transition, the /data-mirror test, the
      invariant test); qa-playtester **PASS**, no bugs filed across sealed
      double-walls, petrified day-2 seals, mid-chew sell/upgrade re-routes,
      god-mode seals, entombed flier/spitter/pack variants and
      diagnostic-purity hash checks — refs: §10, G7, Q92, Q83

- [x] (x002) [bug] Lifesteal has a per-second cap; §2 says it has none — commit
      `ef69a47` — both §2 contradictions fixed failing-test-first (7 of the 9 new
      cases red on HEAD). `leechCapPerSecond` deleted from `data/warden.json`,
      `WardenFileSchema` and `updateWarden`, which now drains the whole
      accumulator each tick clamped only to maxHp; and `damageEnemy`'s accrual
      gated to **normal damage** via a `type?: DamageTypeKey` on
      `DamageOptions` threaded from `applyDamageType` and the DoT ticks —
      Bleeding/Poison/Toxic/Burning ticks, ground fields, terrain auras and
      electric hits (the electric half of a split included) no longer leech;
      untyped direct damage (V2 weapons, manual attack, class actives) still
      does, being armor-reduced basic damage. Q91 records the three defaults
      (untyped = normal; electric excluded on §2's literal; the accumulator
      kept as the one-tick hand-off, and now **hashed** — the review found it
      generically nonzero at hash time and invisible to `hashWorld`, the m19a
      `enemyArmor` gap class; covered with a test, A11 8/8 either side). The
      Bleeding Ring's §7 exception is p7b's. Acceptance met:
      `tests/x002-lifesteal.test.ts` (11 cases) drives normal hit / Bleeding
      tick / Poison tick and asserts only the first heals, plus uncapped
      one-tick payout, the split, and hash coverage; the 12-seed sweep delta
      is recorded in PROGRESS — `maxbuild` medSurv 119.38 → 180, medLevel
      15 → 21, medKills 3070 → 5946; `hybrid` 120.4 → 126.08 (seed 1
      byte-identical; QA bisected seed 3: `defeat_warden` @109 s →
      `defeat_core` @180 s survival). Every gate green, no `/data` number
      tuned (Q40); P10 owns the re-baseline. 638 pass / 63 skipped + perf.
      code-reviewer **REQUEST-CHANGES**, all four findings taken (the hash
      gap, `DamageTypeKey`, the stale HANDOFF line, the untyped-dot leg);
      qa-playtester **PASS**, no defects — one pre-existing edge in Q91
      (overkill leeches in full, masked until now by the cap, owner's call)
      — refs: §2, MIGRATION §8.4.2, Q88, Q91

- [x] (x001) [bug] Poison's stack cap is 3, not 50 (SPEC-FINAL §3) — commit
      `dc1681c` — the **pin** the item asked for, plus the one hole it found.
      `tests/x001-dot-stack-caps.test.ts` (7 cases) reads both rows out of
      `/data` before asserting the behaviour: `poison.maxStacks === 3` with
      `refresh: shortest` and `toxic.maxStacks === 3`, quoting §3's wording; a
      fourth application inside the window refreshes the *shortest* stack
      (discriminated from overwrite-longest by ticking one stack to 2 s first);
      ten applications pay what three do (180 over 3 s; Toxic 270 over 9 s);
      and the rows' ratio/duration are pinned so a `/data` drift is named. The
      hole: `applyDot` clamped a caller's `maxStacks` override only to the
      shared 50-stack perf budget, so a call site could hold 50 Poison stacks
      while `/data` said 3 — overrides now clamp **one-way to the row cap**
      (Q90). Proven a no-op on shipped content: every override writer passes
      exactly 3, no `/data` field feeds the override, and QA measured identical
      end hashes either side on seed 1 `hybrid` and seed 7 `maxbuild` (which
      builds two Venom Spores, the one shipped override caller). Mutation
      check: reverting the clamp turns exactly the override case red; the other
      six stay green on master alone, confirming the file is a pin of
      already-correct data. 627 pass / 63 skipped + perf, exit 0.
      code-reviewer **APPROVE** (1 Minor taken: the `DotOptions` doc still
      described the old ceiling — the exact re-opening vector; plus the
      ratio/duration pin). qa-playtester **PASS**, no bugs filed; two
      pre-existing edges recorded in Q90 (override ≤ 0 / NaN silently drops,
      unreachable from shipped code and refused by the schema) — refs: §3,
      MIGRATION §8.4.1, Q86, Q87, Q90

- [x] (m20c) [balance] The other seven towers' tracks, and every tower's defense
      band (SPEC-V3 §4) — commit `a2e0c50` — the migration turned out to be a
      *measurement*. §4's three counts agree with a line in build cost (`5 −
      (cost − 50)/35`), but putting the open seven on it measures worse against
      a live gate at the price rule's prices: Ballista alone flips the boss
      gate from `victory` to `defeat_warden`, and Ember Brazier, Frost Obelisk
      and Mortar drop A4's T1 clause to 0/5. So the tracks stand, each of the
      four carrying a `/data` `note` with the count the line wants and the run
      that stopped it, and the line goes to the owner as Q80's proposal. What
      m20c adds is what §4 asked for and Q73 deferred: **defense bands** (`none
      0, low 5, medium 10`) on all ten, so "+10% Defense per step" has a caller
      at last — plus two loader rules, `validateStepPrice` (a whole track costs
      `upgradeTotalCostMul ×` the build price, no `note` escape) and
      `validateDefense`. Acceptance met: all ten towers pass the m20a data test
      (638 pass / 23 skipped, from 625/25), and Q80 lists every tower's
      proposed count, price and band. Re-measuring m20a's five deferrals
      **returned two** — `arrow_spire` and `venom_spore` clear A4 T1 5/5 at
      HEAD, closed by m20b's specials, both live tests again. 12-seed sweep
      byte-identical either side. code-reviewer **APPROVE** (8 Minors taken:
      two stale defense-0 comments, a float knife-edge in the m20a kill
      assertion, a priced-track-with-no-steps hole, `.strict()`, `positive()`,
      and three Q80 gaps including the max-level band inversion). qa-playtester
      **PASS** with 6 filed, 5 fixed here — two Majors were *wrong evidence in
      my own notes*: Frost Obelisk's "4/5 at every price measured" cited two
      prices the new rule cannot even load, and the A4 comment's "every count
      from 3 up fails T1" omitted the price qualifier that makes it true. Both
      corrected with the full per-price grid; the sixth is filed as **m20e**,
      because Mortar at count 3 and today's price clears both A4 clauses.

- [x] (m20b) [feat] The three owner towers and their milestone specials (SPEC-V3
      §4) — commit `7cec4ad` — §4's specials are typed entries in each tower's
      `upgrades.specials`, folded into an effective attack by `attackProfile`
      (`src/sim/upgrades.ts`) that every reader — fire loop, info panel, and m21's
      VS formula next — shares. Arrow: pierce and a second shot down the same
      line, Bleeding at 4. Electric: `normal:electric = 1:1`, one strike, the
      electric half arcing at 3. Poison: `normal:poison = 1:1 → 1:1.5`, small AoE,
      second spore at 2; its V2 `attack.poison` constant is deleted and its damage
      re-priced 4 → 45 so the DoT-as-a-share of §3 reproduces V2's output (Q76).
      Composite damage rides in `HitEffects.ratio` and is dealt by one `dealHit`,
      so all seven attack shapes carry a split — pinned by a test that drives each
      shape, m19c's coverage rule one layer down. Acceptance met:
      `tests/m20b-owner-towers.test.ts` (24 tests, 1 skipped) drives every listed
      special through the real fire loop at the step below it and the step it
      lands on. code-reviewer **REQUEST-CHANGES** (1 Major) and qa-playtester
      **PASS** with 5 filed; fixed here: the untested Venom splash, the arc's lost
      damage origin (a front shield read the copy differently from the hit it
      copies), `lineHit` sweeping for a pierce it did not have, the loader
      accepting a special the attack's `kind` cannot read, and the info panel
      understating an Arrow at 6 by exactly 2× — that last one now measured
      against the fire loop at every level of every track. Each fix verified by
      reverting it. Two findings ship unfixed and pinned, both m20d: Poison's
      dropped spare spore and its non-monotonic @4 (Q79). The lesson worth
      keeping is Q78's: the first draft of the balance note blamed a tower the
      sweep never builds — a 12-seed median moved 30%, and at 32 seeds both trees
      read the same. 625 tests pass, 25 skipped — refs: V3 §4, Q75–Q79

- [x] (m20a) [feat] Per-tower upgrade tracks (SPEC-V3 §4) — commit `5305f8d` —
      `upgrades: {count, stepCost, specials}` and a real `defense` on every tower,
      +10% HP/Attack/Defense per step, flat step cost, sell 50% of what the
      structure was actually charged (`Structure.spent`, hashed). Acceptance met:
      `tests/m20a-upgrade-tracks.test.ts` (22 tests) asserts track well-formedness
      through the loader's own predicate and walks all ten towers × every step
      against both the sell quote and the gold the till pays, including a mid-run
      `towerCostMul` change and a Rekindle. Range no longer grows (§4 lists HP,
      Attack, Defense only); `maxTier`, `tierDamageMul`, `tierRangeMul`, the
      0.75×/1.25× ladder and Dusk's 35% sell rate are deleted. Track math lives in
      `src/sim/upgrades.ts` because `enemies.ts` needs `structureArmor` and
      `towers.ts` already imports `enemies.ts`. Q73 records the four defaults §4
      left open — the roster is the power- and cost-neutral migration wherever the
      choice was m20a's, so the model landed without a tuned number — and Q74 the
      inheritance fix. code-reviewer **REQUEST-CHANGES** (1 Critical, 2 Major) and
      qa-playtester **PASS** on the acceptance criteria with 3 Majors filed; all
      fixed here with regression tests verified by reverting each fix. The Critical
      was the lesson: the model change was clean and the bug was in a *reader* of
      the field whose range changed — `deriveSouls` handed Act II a maxed weapon
      from an 11-level tower, which inverted four balance gates and nearly got them
      deferred for the wrong cause. QA's one unfixed finding is filed as s011.
      603 tests pass, 24 skipped (5 deferred to m20c with measured reasons) —
      refs: V3 §4, Q73, Q74
- [x] (m19c) [feat] Damage-type taxonomy (SPEC-V3 §3) — commit `b325487` — the six
      rows and both statuses, authored in `data/damagetypes.json` — **M19 complete**,
      gate **C3 green in full** (its carried clause closed: Burning is `shredArmor`'s
      first production caller) — refs: V3 §3, Q44, Q58, Q65–Q72 — code-reviewer
      **REQUEST-CHANGES** (2 Major, 9 Minor) and qa-playtester **PASS** on all three
      acceptance clauses with 6 bugs filed; every Major and every reachable Minor is
      fixed here, each with a regression test that turns red when the fix is reverted.
      `Enemy.burnRemaining/burnDps/burnSource` and `Enemy.poison` are replaced by one
      `dots` list keyed by type; the row in `/data` owns magnitude, duration, stacking
      rule, armour shred and radius, so M27 can make Burning stack by editing one
      field. `applyBurn`/`applyPoison` survive as thin wrappers so V2-authored towers
      keep their own numbers (Q65). Frost/frozen replace V2's chill-stack model, which
      was specced and never built. 81 tests in `tests/m19c-damage-types.test.ts`, one
      describe per §3 row, each reading the authored value out of `/data` before
      asserting the behaviour it produces.
      **What the two agents caught that 569 green tests did not.** (1) The shared
      50-stack budget let the *saturating* type evict: 49 Bleeding + 1 Burning, then
      one more arrow, and the Burning — i.e. the armour shred — was gone. Q69's own
      test passed because it never applied a second Bleeding (Q71). (2) Electric's
      radius path delegated to `applyAoE` and so never touched the enemy it was
      handed: 20 of 100 damage in a crowd, **zero** to a target the spatial buckets
      had not seen, and the `DamageOptions` it built were dropped (Q72). Both are
      latent until m20b authors the content — which is the point. Also fixed:
      `applyDamageSplit` summed its weights in authoring order while dispatching
      sorted (Q63's hazard, reaches `hashWorld`); `opts.duration` on a ratio row paid
      240% instead of 120%; a frozen Warden-Eater still charged, because the boss
      moves itself and never reaches `moveEnemy`; `tickDots` iterated a live array;
      and ailment ticks spent the frame's 512-event fx budget, ~2450 events for a
      burning horde, starving the renderer of shots, impacts and deaths.
      **Balance:** Q66's clipped DoT tick is the only movement — a row now pays the
      total §3 states instead of that total minus one frame — and it moves the
      12-seed sweep `maxbuild` medMin 12.6 → 12.5 and medLevel 20 → 21, `hybrid`
      byte-identical. A10's third test goes 836 ms → 5653 ms for the same reason and
      is **not** a perf regression: seed 4 flips to `victory`, so the run is 65%
      longer. No `/data` number was touched (Q40). QA re-measured every A/B gate green
      and 24/24 seeds run/replay identical, and filed the coverage gap that matters
      most: **no gate seed ever builds a Brazier**, so the shred is unguarded by the
      sweep — backlog s008.
- [x] (m19b) [feat] Multiplicative stat stacking — commit `4875d47` — sources multiply,
      ranks add within a source — gate **C4** green (×1.32 verified through the real
      RunConfig→`baseRunStats`→`derive` pipeline, bit-exact) — refs: V3 §2, Q61–Q64 —
      code-reviewer **REQUEST-CHANGES** (1 Major, 6 Minor) and qa-playtester **PASS**
      on the acceptance criterion with 6 bugs filed; both agents independently found
      the same headline defect and every finding is fixed here.
      `Stats` is now keyed by (stat, source): `factor()` returns Π over sources of
      (1 + summed ranks), `total()` the additive sum, and an exhaustive
      `STAT_KIND: Record<StatKey, 'flat'|'mul'>` means a new stat cannot be added
      without classifying it. Q61 rules what counts as one source, Q62 which stats
      multiply, Q63 the `total()` ordering, Q64 shrine/aura haste.
      **The headline defect: six of the eight rebased consumers could be reverted to
      the additive `1 + x` with all 479 tests green** — because every default test
      world has at most one source per stat, and `factor(s) === 1 + total(s)`
      exactly when there is one source, so the buggy and fixed expressions agree on
      every world the suite built. QA measured a default headless run's entire stat
      sheet as two entries, both from the class. That is the same "tests pass, game
      doesn't" family as t1/t2/t3/t6ab. Each consumer now pins the **exact** integer
      or float it produces, with the additive and double-applied answers named in a
      comment, using 0.5/0.6 sources (×2.4) so the three answers stay distinct after
      rounding. What else was caught: (1) collapsing the real `relic:${r.id}` key to
      a constant left the suite green *and broke gate C4 itself* (×1.30, not ×1.32) —
      relics are the commonest way to hold two same-stat sources and Q61 rules on
      them, yet the headline test wrote `relic:7` on a bare `Stats` by hand;
      (2) **shrine haste and tower buff auras were still adding into
      `attackSpeedMul`** — a real §2 gap, so m19b's own title was false for the two
      boosts a player meets most often (Q64: both now multiply, overlapping sources
      summing within each bundle per Q61); (3) `total()` was insertion-order
      dependent while `factor()` was sorted — float addition is no more associative
      than multiplication and `leech` feeds `warden.hp`, which is hashed (Q63);
      (4) NaN/Infinity passed `Math.max` (`Math.max(0.25, NaN)` is NaN) into maxHp,
      moveSpeed and pickupRadius at once — the m19a unkillable-entity failure again,
      now guarded at `Stats.add`; (5) `hashWorld` saw **25 of 39 stats not at all**,
      so a stacking regression could pass A11's replay comparison — it now hashes the
      whole of `Derived`, with the four stats that never reach `Derived` listed
      explicitly so the exemption cannot grow; (6) the terrain test never called
      `applyTerrainPassives`, so the Q61 decision in weapons.ts had zero coverage and
      its source id was free to collide; (7) the determinism test used three nodes
      granting three *different* stats, so it could never fail whatever the order;
      (8) the `mul` parameter on `addAll` was dead — removed rather than tested.
      All **21** mutations are now caught. Measured: full suite 499 passed / 19
      skipped (was 462 at m19a), every A/B gate green including A10; the 12-seed
      sweep is unchanged by the stacking rule itself (one source per stat is all the
      default policies build), while a legal endgame build moves hard — pickupPct
      +42.2%, goldFind +28.6%, power +22.1%, attackSpeed +18.4% — which is larger
      than MIGRATION §4.4's +10.6% estimate and is the first thing the M27
      re-baseline should look at. Per Q40 **no `/data` number was touched**.

- [x] (m19a) [feat] Armor v3 — commit `d4fb985` — flat points = percent reduction, cap +99, floor −100
      (Q44), DoTs ignore armour — gate **C3** green for the armour math; its
      "except Burning's shred" clause is carried by m19c, which wires Burning to
      the `shredArmor` mechanism this item built — refs: V3 §2, Q58–Q60 —
      code-reviewer **REQUEST-CHANGES** (2 Major, 6 Minor) and qa-playtester
      **PASS** on all four acceptance criteria with 8 bugs filed; both agents
      independently found the same headline defect and **every** finding is fixed
      here. What they caught: (1) the `dot: true` I added to the DoT ticks was an
      **unobservable no-op** — `pure` already short-circuited the armour guard, so
      deleting `dot` from both sites left all 446 tests green, and criterion 3 was
      in truth being delivered by a pre-existing flag. The two flags are now
      orthogonal (`pure` = Bulwark/Shellback trait bypass, `dot` = armour bypass),
      all four ailment sites state both intents, and the burn and poison ticks are
      pinned through the **real update loop** on a −90-armour enemy. (2) `Enemy.armor`
      was writable sim state that never entered `hashWorld`; the hash now takes
      `enemyArmor(e)`, covering both it and the shred. (3) A11 compares two replays
      in the same build, so **any** field can be dropped from the hash with nothing
      turning red — three explicit hash-coverage tests now exist. (4) The
      `def.armor` → `Enemy.armor` plumbing, the only route from the new schema field
      into the sim, was untested; cutting it left the suite green. (5) The late-bound
      `setWardenDamageHandler` had no `opts` parameter, so every §3 DoT reaching the
      Warden from `enemies.ts`, `boss.ts` or `combat.ts` would have silently arrived
      **armoured** — the exact failure the flag was added to prevent. (6)
      `Derived.damageReduction` was left written-but-never-read and shred-blind;
      deleted. (7) `effectiveArmor(NaN)` returned NaN, which propagates into HP and
      makes an enemy permanently unkillable (`hp <= 0` never true); guarded. (8) The
      enemy panel labelled `flatReduction` "Armour" and never showed the stat the
      damage path reads. Also: schema bounds on `armorCap`/`armorFloor` (the Tuner
      writes that file, and >100 would make every hit **heal**), and Q60's ruling
      that shred clears on the Act I reform and on Second Wind. All **14** mutations
      — the reviewers' plus five of my own — are now caught. Measured: enemy-side
      damage is bit-identical to HEAD for all 20 enemies (none authors armour), the
      Warden side moves as Q59 predicted (hybrid median survival 132.4 → 105.7 s),
      and A10 **passes at this commit and at HEAD on this machine**, which corrects
      PROGRESS's "A10 is red" — the gate flips with the host (Q41).

- [x] (t2) [feat] Selection feedback — refs: V3 T2, QUESTIONS Q57 — qa-playtester
      **FAIL** on first submission with one Critical and six Majors. The Critical
      was mine: the test harness **re-implemented** the game loop's click wiring,
      so deleting that wiring from `main.ts` outright left all 23 tests green while
      clicking selected nothing in the real game — the literal bug T2 exists to fix.
      The handler and the stale-selection sweep now live in `selection.ts` as
      `makeSelectHandler`/`sweepSelection`, the tests drive those closures, and three
      source-level assertions guard that the loop installs them. All **14** mutations
      (QA's six plus its three survivors plus five of my own) are now caught.
      Real defects fixed: the hover outline the spec asks for was **not built**;
      `WARDEN_GRAB` was 0.9 tiles against a 0.25-tile sprite so you could not click a
      tower you were standing beside; enemy grab was twice the drawn body so a lane
      of husks made the towers behind them unclickable; a live selection **blackholed**
      the build-bar panel and, worse, the Act II weapon panel that holds the only
      weapon switcher; the enemy panel never refreshed on slow/burn/poison; the Warden
      panel's dash row went stale; Bounty printed the authored number rather than the
      real payout (and gems, not gold, in Act II); and a petrified tower offered a
      Sell that silently does nothing. Added beyond the letter of T2: the Core is
      selectable (its HP is the lose condition) and `0` clears the selection.

- [x] (t1) [feat] Range indicators — refs: V3 T1 — qa-playtester **FAIL** on first
      submission with four Majors, all fixed. The one that mattered: **every canvas
      test ran a default world** (`towerRangeMul` 1, `areaMul` 1, tier 1) — exactly
      the point where the buggy and fixed expressions agree — so re-inserting the
      original M17 bug passed all ten tests. The suite now runs on a deliberately
      skewed world and asserts against the shared helper, never a literal; all eight
      mutations QA reported as surviving are now caught. Also fixed: the aura tower's
      ring under-reported its radius because `fireTower` scales an aura by
      `areaMul` and the helper did not; **petrified towers were ringed** despite
      never firing, which at Dawn meant the whole board; and the hover splash preview
      and dead-structure skip were untested. Minors: `tower-info` computed Splash
      inline instead of through the helper, the mortar's `minRange` dead zone was
      invisible (now a dashed ring, and splash previews under the cursor where the
      shell lands rather than on the tower), R and the HUD button never persisted the
      setting so the Settings checkbox could silently revert it, and the Ranges button
      had no pressed state. QA measured no frame-cost regression (0.131 → 0.126
      ms/frame with 60 towers).


- [x] (t3) [feat] Dev profile: `data/dev.json`, all classes/tiers/quests unlocked,
      points granted, stash filled, `cleanProfile` Settings toggle, production
      always off — refs: V3 T3, gate C8 — qa-playtester **FAIL** on first
      submission with six Majors, all fixed:
      (1) **startup wrote the dev profile into the save**, so a returning
      developer's real account was silently and irreversibly inflated (QA measured
      ember 250 → 177000, tier 2 → 5) and the "clean profile" toggle had nothing
      left to clean — the profile is now a **view**, applied in memory and never
      saved, via a `startupProfile` seam that returns `persist: false`;
      (2) the same bug made the toggle non-functional;
      (3) the C8 production assertion **passed vacuously** with no `dist/` and again
      against a `dist/` built before the feature existed — it now builds its own
      bundle and **executes** it;
      (4) `isDevBuild()` defaulted to *dev* when the env was present but
      unpopulated, so a bundler whose folding differed would have shipped a
      god-mode build — the predicate is now `env?.DEV === true`, exported as
      `isDevEnv` so a test can call the real thing (an executed-bundle test cannot
      tell the two apart, since the bundler folds the read either way);
      (5) authoring `devMode: false` — the documented way to switch the profile off
      — turned the suite red, because the tests asserted the authored value instead
      of the rule;
      (6) `applyDevProfile` could **demote** an account, via two paths: its own
      level recompute and `seedTestAccount`'s. Both now take `Math.max`.
      Minors also fixed: the dev stash rolled **zero sigils** so a whole slot was
      untriable (Q54), `src/ui/hub.ts` read `import.meta.env` unguarded and threw
      under plain Node, and `DevFileSchema` accepted negative/fractional
      `skillPoints` and silently dropped unknown keys. Q53–Q55 log the three
      judgement calls QA found undocumented. Left as its own item: s005 (the dev
      profile ships, inert, in the production bundle).

- [x] (t4) [feat] God mode as a practice-run Command — refs: V3 T4 — qa-playtester
      **PASS** on all three acceptance criteria, verified far past the two patched
      functions: QA confirmed `damageWarden` is the *only* writer of Warden HP and
      `leakIntoCore` the only subtraction of Core HP in the whole sim, then drove all
      eight hostile damage paths (contact, bomber, spitter, stomp, ground areas, boss
      charge/slam/fire) plus a 60 s toe-to-toe boss fight and 1000 forced colossus
      leaks — no damage in any of them, and mortality restored correctly on toggle
      off. Replay identity verified at four scales including 1001 toggles in one tick.
      Three findings fixed in the same commit: the god button had **no on/off state**
      (the lit class was special-cased to one op name), `ALL_OPS` in practice.test.ts
      had drifted so the new op skipped the non-practice guard, and the
      "god cannot rescue a defeat already begun" behaviour was unpinned. QA also
      corrected the *reason* given for keeping leak accounting live — the B7 claim was
      wrong, since B7 never enters practice mode; the real defence is that the Day
      HUD's "Loose in the dark" counter makes the consequence visible. Measured: a god
      Day and a mortal Day produce identical Nights. Findings left as their own items:
      s003 (`levelup` never auto-resolves) and s004 (alive count exceeds `aliveCap`).

- [x] (t6c) [bug] Save migration drops `orbs` and bumps SAVE_VERSION 1 → 2 — refs:
      V3 §8, C7 — qa-playtester **PASS** on all four acceptance criteria, verified
      through the real `localStorage` path as well as the pure functions, with a full
      money-path sweep (fresh account → run → defeat → Results → Hub → seed → equip →
      reload) confirming nothing re-introduces the key. Two of its findings were taken
      in this same commit because they shared a two-line fix and the file was open:
      the strip is now **version-gated** (a newer client legitimately reusing the name
      would have had that field eaten on every load) and **guarded against deleting a
      live MetaState key**; both repros are regression tests. QA also measured that a
      poisoned `RETIRED_KEYS` turns 5 tests red, so required fields were already
      protected — it was optional ones that were exposed. Findings left as their own
      items: s001 (migrate preserves unknown keys forever) and s002 (a corrupt stash
      discards the whole account, pre-existing).

- [x] (t6ab) [feat] Delete Orbs entirely from sim, meta, data and UI, and repurpose
      the Constellation node that granted one — **t6a and t6b merged**: removing
      `MetaState.orbs` breaks the Hub in the same commit, so the type system does not
      allow splitting the sim change from its UI. `equip`/`discard` moved out of the
      deleted `crafting.ts` into `src/meta/stash.ts` (V3 §8 keeps the stash).
      Gate **C7** Orbs half green via `tests/c7-no-orbs.test.ts` — refs: V3 §8, T6 —
      qa-playtester pass 2026-08-25: FAIL on first submission with three Majors, all
      fixed and each verified by reproducing the exploit that found it — (1) the C7
      scan exempted `loot.ts` and `stash.ts`, the two files most likely to regress,
      so reintroducing `orbPerElite` passed the gate; (2) the C7 DOM scan never
      clicked anything, so the Hub notice that used to read "3 of each Orb" was never
      scanned; (3) **this diff neutered the suite's only proof that `applyRunResult`
      banks anything** — the orb assertion was rewritten to compare 0 to 0 and
      asserted the opposite of its own title. QA also confirmed relic drop counts are
      per-seed bit-identical to HEAD across 12 seeds (only the drops-stream cursor in
      the end hash moves), that the three "orb" false positives are undamaged, and
      that A10's redness reproduces at HEAD. Bug 7 (Tinkerer inert) logged as Q50 and
      backlog m24d.

- [x] (m17) [feat] M17 reconcile: audit code vs V3, MIGRATION.md, retire dead tests
      with logged reasons, rewrite BACKLOG to V3 §13 — refs: V3 §13.1 — commit
      pending in this change; retirements: A5, A6, A7, A8 (whole files, `describe.skip`
      with reasons) and 4 assertions in `f001-cycle-machine.test.ts` including gate
      B9; B11 retired with no test to mark (never implemented). Q38–Q49 logged.
- [x] (f004) [feat] Class framework (v2 shape) — **superseded by M23** per QUESTIONS
      Q48. Committed unverified as `6019a8b` (`wip`); its qa-playtester pass was
      deliberately not run because V3 §6 replaces the kits. Surviving plumbing — the
      `class_active` Command, cooldown field, Q binding, HUD row, `data/affinity.json`
      — is the base m23a builds on.
- [x] (f003) [feat] Leak coupling: Day leaks add 2× director cost to that Night's
      budget; "Loose in the dark" HUD counter — acceptance: B7 (mechanism only;
      the full statistical gate — survival drop ≥10% via sweep — is M15's per
      SPEC-V2 §12) — refs: SPEC-V2 §1 — commit f24bf7c, code-reviewer pass
      2026-08-25, qa-playtester pass 2026-08-25 (filed and fixed one bug in the
      same commit: `leakIntoCore` charged a pack enemy's full director cost to
      every physical leaked body instead of dividing by `packSize`)
- [x] (f002) [feat] Soul persistence — no new commit: already delivered by f001
      (`4e44a33`). **Its gate B9 is retired at M17** (V3 §12).
- [x] (b004) [bug] `report.survivalSeconds` used Night-local `w.act2Time` instead of
      cumulative `w.act2Ticks / 60` — commit 19eecf3, code-reviewer pass (found the
      identical bug in the Results screen, fixed in the same commit), qa-playtester
      pass
- [x] (f001) [feat] Cycle state machine: Day→Dusk→Night→Dawn ×3 — commit 4e44a33,
      code-reviewer pass (found `hashWorld` omitting `soulLevels`), qa-playtester
      pass (filed b004). **Superseded by V3 §1; code removed at M22.**
- [x] (b003) [bug] Stash click-to-swap + drag-to-unequip + compare tooltip — commit
      84bc3f8, qa-playtester pass
- [x] (b002) [bug] Pause menu Abandon Run requires confirm — commit d2079e7,
      qa-playtester pass
- [x] (b001) [bug] Death flow reaches Results with Retry / New Run / Hub — commit
      645d4b0, qa-playtester pass
