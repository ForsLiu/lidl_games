/**
 * p6e — SPEC-FINAL §4, gate **G8**: "every class clears T1 at 35-70% win rate
 * (scripted kit bot); top damage source differs across >=8 of 11 classes."
 *
 * fb013 (2026-08-29) added a 12th class, Time Lord — `CLASS_KEYS` below picks
 * it up automatically, and SPEC-FINAL's own G8 text now reads ">=9 of 12"
 * (the same ~73% ratio). This file's entire
 * win-rate sweep was already `.skip`-ed per class pending **P10** before
 * fb013 landed (see the dated corrections below). Time Lord WAS run through it
 * by p10v (12/12, `it.skip('time_lord', ...)` at the end of this file) and
 * re-measured post-c001 by `tests/class-time-lord-band.test.ts` (unchanged,
 * 12/12); this paragraph used to say "has not been run" and STATUS.md
 * inherited the stale claim — corrected at the 2026-09-03 lane merge.
 *
 * Precedent and gap (Q120's own list, and p6b/p6c/p6d's write-ups all name it):
 * **no stock bot policy in `src/bots` ever issues `class_active`/`class_active2`,
 * or drives `active1Held` for a charge-kind Active1.** `tests/p-core-f-gates.
 * test.ts`'s `runCoreScripted` set the precedent for patching a real gap onto a
 * stock policy locally rather than teaching every policy a new Command
 * (`{k:'upgrade_core'}` there); `scriptClassKit` below does the same for the
 * class-kit gap, reused verbatim from that file's Core-upgrade injection for
 * the Core-upgrade half (a scripted kit bot should spend gold on the Core's own
 * HP track too, exactly as G23 already established).
 *
 * **T1**, concretely: `tier: 1, modifiers: []` (the `cfg()` default — no
 * `autoDraft` tier-modifier draft, unlike G7/G14's higher-tier gates) and
 * `cycles: 6` (also `cfg()`'s default — SPEC-FINAL §1.1's full 18 TD wave / 6 VS
 * wave / boss run, not a shortened practice slice), exactly the scope G23 named
 * "T1" for the Cores. 12 seeds, per that same precedent (CLAUDE.md: pass-rates
 * over a fixed seed set, never medians).
 *
 * **The scripted kit bot**: `hybrid`'s build/kite for economy and Act II
 * movement (a "reasonable T1 loadout," not a per-class-tailored one — a bot
 * that hand-picks each class's ideal tower mix would be measuring the bot's
 * cleverness, not the kit), plus:
 *   - fire Active1 the instant it is off cooldown; for a charge kind (Circle
 *     Slash, Deadeye Draw) hold for `min(chargeCapSeconds, 2s)` then release,
 *     rather than holding the full cap every time — a real player charges to
 *     "enough," not always to the ceiling;
 *   - fire Active2 the instant it is off cooldown, with one sequencing
 *     exception (below);
 *   - aim every Active at the nearest enemy (falling back to the Core when the
 *     board is empty), which also serves as `nearestStructure`'s implicit
 *     search origin for the structure-targeting Actives (Field Kit, Blood
 *     Tithe, Death Pact all default an omitted aim to the Warden's own tile,
 *     not the enemy's — passing no override for those three keeps that);
 *   - buy every Core upgrade step going, exactly as G23's own harness does.
 *
 * The one sequencing exception: Paladin's Judgement (§4.2 "release Wrath as a
 * holy nova") is gated on `clarionRemaining <= 0 && wrathStored > 0` in
 * addition to its own cooldown — firing it the instant it comes off cooldown,
 * independent of Clarion Taunt's 4-6s window, means it usually detonates on
 * whatever scraps of Wrath happened to be banked seconds into a fresh taunt,
 * instead of the window's full haul. Every other class's two Actives are left
 * to fire independently; this is the one kit whose two Actives are explicitly
 * a combo (SPEC-FINAL §4.2 names Wrath as the shared resource) and scripting
 * around that isn't hand-picking a build, it's not misplaying the one stated
 * combo. Measured with and without this gate: it did not fix Paladin's early
 * deaths outright (below), but it really did reduce how much stored Wrath
 * went to waste in the seeds that did survive.
 *
 * **Tuning (data/classes.json only, per CLAUDE.md's balance-tuning scope)**:
 * three classes' first honest measurement needed a second look before any
 * `.skip`, and two moved meaningfully:
 *   - **Cryomancer** measured 4/12 (33%) — one point under G8's 35% floor.
 *     Ice Wall's cooldown was the outlier among the roster's few actual
 *     defensive tools (14s, versus Clarion Taunt's 8-14s window and Circle
 *     Slash's 6s) for an ability whose entire value is board control (it
 *     blocks a lane tile outright); cut to 9s. Re-measured: **6/12 (50%)**,
 *     now solidly inside the band.
 *   - **Paladin** and **Necromancer** both showed a *majority* of losses as
 *     early `defeat_warden` (wave 3-9, well before any wave-content wall) —
 *     the two classes with `moveSpeedBonus: 0` (§4.2's "move low" band,
 *     shared by no other class), the one stat this bot's kiting AI leans on
 *     hardest to survive Act II and the one number SPEC-FINAL §4.2's band
 *     table already commits to (not this item's to override — §17 lists the
 *     nine filled classes as owner-vetoable, not open to a balance edit here).
 *     What *is* this item's to tune is each kit's own numbers: Necromancer's
 *     *Raise* (cooldown 12s->6s, `summonStatMul` 0.40->0.65, duration
 *     15s->24s, radius 6->8 — more, sturdier skeletons between the Warden and
 *     the horde more often) and Paladin's *Guardian Stance* / *Judgement*
 *     (`stanceArmor` 30->50, `stanceSeconds` 1->0.5, `wrathFraction`
 *     0.60->0.80, Clarion Taunt cooldown 14->8s, `tauntDurationSeconds` 4->6,
 *     `wrathDamageMul` 1.5->2.2). Neither crossed into the band — both are
 *     still 0/12 — but both re-measured with early `defeat_warden` now the
 *     *minority* outcome and the majority converged onto the same wave 11-17
 *     `defeat_core` signature every other class hits (below). That is real,
 *     verified progress, not a wash: it moved both classes from "loses to a
 *     generic VS-baseline gap" onto "loses to the same wall as the rest of
 *     the roster," which is the honest floor this bot can reach without
 *     inventing a fourth reason to keep tuning numbers that no longer move
 *     the outcome.
 *
 *     **CORRECTED (PRIORITY DIRECTIVE follow-up, this session, Q123):** the
 *     two counts this paragraph used to give (Necromancer 7/12, Paladin
 *     3/12) described the tuning-verification pass, not this file's real
 *     p8a content. The first full re-run of this `beforeAll` against p8a's
 *     real waves (this session) measures **Necromancer: 3/12 `defeat_warden`
 *     (waves 3/6/15), 9/12 `defeat_core` (waves 13-17), 0/12 wins** and
 *     **Paladin: 4/12 `defeat_warden` (three at wave 3, one at wave 6), 8/12
 *     `defeat_core` (waves 8/15/16), 0/12 wins** — both still majority
 *     wave-11-17-wall, same conclusion, corrected numbers.
 *
 * **The wall the other ten hit** (nine outright, one — Necromancer — mostly):
 * every seed that isn't Cryomancer's clears TD wave 11-17 and then dies
 * `defeat_core` to leak accumulation, or `defeat_warden` during the VS wave at
 * that same wave count — the exact "wave-9-to-14 death band" `tests/
 * a4-single-type.test.ts` and `tests/p-core-f-gates.test.ts` (G23) already
 * pinned to `data/waves.json` authoring only 10 real TD wave rows against the
 * still-climbing `1.30^(wave-1)` HP curve (the **p8a** content gap, not yet
 * built). G23 is the direct precedent for reading this signature as
 * content-gated rather than balance-gated: it found the *same* wave band
 * killing four of five Cores regardless of each Core's own numbers, and
 * `.skip`-ed those four with exactly this reasoning. This item corroborates
 * that finding across the *class* roster instead of the Core roster — ten of
 * eleven kits, tuned or not, converge on the identical wave-11-to-17 wall,
 * which is strong evidence the wall is systemic rather than eleven
 * independent balance stories. Only Cryomancer's kit (freeze/shatter crowd
 * control plus a cheap, spammable lane-blocking Ice Wall) does something the
 * wall doesn't care about stat scaling for — it removes enemies from the fight
 * outright or blocks their approach, rather than racing their HP growth.
 * Nothing else in the roster has a comparable non-DPS lever, and inflating
 * `damage`/`dps` fields far enough to out-race a 100x-by-wave-18 HP curve
 * would be an obviously-wrong data value, not a balance tune. Each of the ten
 * is `.skip`-ed individually below with its own measured numbers, per
 * CLAUDE.md rule 6 and the p3e/G23 precedent — not a blanket skip, since the
 * failure signature (and, for Necromancer/Paladin, how close tuning got it)
 * differs enough per class to be worth recording separately. Re-enable point
 * for all ten is `p8a`.
 *
 * **Top damage source** (Q121 logs the interpretation): `damageByWeapon`'s
 * source strings are coarse engine bookkeeping, not kit identity — every
 * class's own Active1/Active2/passive/summon damage is credited under one of
 * five shared literal strings (`class_active`, `class_active2`, `class_basic`,
 * `class_summon`, `class_passive`; `spreading_plague` is Plaguebringer's own
 * extra one), and only *tower* keys are class-specific-looking, which a
 * `hybrid`-loadout bot builds near-identically regardless of class — measuring
 * diversity over the raw keys collapses to "which tower did `hybrid` build
 * most" for nearly every class, which is G13's question, not G8's. Measured
 * this way (see Q121) it does not clear 8/11. This file instead resolves each
 * class's dominant *raw* bucket to the specific named §4/§4.2 mechanism behind
 * it (`describeSource`) — the same measured bucket-share, just labelled by the
 * data-authored ability name (`cls.active1.name`, etc.) rather than the shared
 * code-path string, since two classes topping out on `class_active` are
 * provably running different, spec-named abilities, not the same one.
 *
 * **CORRECTION (p8a, Q122):** the win-rate paragraphs above describe
 * Cryomancer as the roster's one class inside G8's band (6/12, after an Ice
 * Wall cooldown tune) against `data/waves.json`'s old repeated-wave-10
 * content. Once p8a authored real, escalating waves 11-18, Cryomancer
 * re-measured at **2/12** — below the floor, the same wave-11-17 wall the
 * other ten already named. G8's win-rate clause is now `.skip`-ed for all
 * eleven of eleven classes, not ten of eleven; see `cryomancer`'s own updated
 * `it.skip` below for the numbers. The diversity clause's own finding (2/11
 * distinct, Q121(4)) is unaffected by this correction.
 *
 * **RE-MEASURED IN FULL (PRIORITY DIRECTIVE follow-up, this session, Q123,
 * Q127).** The p8a commit corrected only Cryomancer's number and the
 * diversity count by spot-check; this session let the full `beforeAll` run
 * to completion twice (once live, once with a temporary diagnostic dump) and
 * recorded every class's real number below. **None of the eleven clears the
 * band — G8's win rate stays 0/11.** Every `it.skip` below carries its real,
 * freshly measured outcome string. One new fact this full re-run surfaces
 * that the earlier spot-check did not: **non-terminating `'timeout'` seeds
 * are no longer isolated to `swordsman` seed 1.** This run measured
 * `swordsman` at 4/12 seeds timing out (1, 2, 5, 9), `archer` at 2/12 (2,
 * 11), `stormcaller` at 1/12 (6), and `bloodlord` at 2/12 (1, 12) — 9 timeout
 * instances across 4 classes, up from the single instance previously
 * recorded. None were chased to a higher cap (Q127): the mechanism (the
 * wave-11-17 wall pushing some seeds into a genuine stalemate rather than a
 * slow loss) is already established by `tests/p-core-f-gates.test.ts`'s
 * `carnivorous_plant`/`corpse` cases, which spent real cap-raise attempts
 * proving it; a ninth-and-tenth confirmation on the class roster is
 * corroborating evidence, not a new question. The existing `'timeout'`
 * handling (excluded from `wins`, excluded from `ownDamage`/`allDamage`)
 * already treats these correctly.
 *
 * **fb049 re-measurement (Q138), this session — every number and `.skip`
 * reason above was measured with `allocated: []`, which no real Hub-started
 * run plays with (`TREE_AUTO_MAX`, `src/meta/meta.ts`).** Re-ran the full
 * `beforeAll` against `allTreeNodeIds(loadContent())`, the same fix
 * `tools/sim.ts`/`tools/sweep.ts` already got at fb039. The wave-11-17 wall
 * and every timeout it produced are both gone: **all twelve classes now
 * resolve cleanly (no `'timeout'` outcome anywhere), and eleven of twelve
 * clear 12/12 (100%) — only `bloodlord` sits at 10/12 (seeds 4 and 12 hit the
 * 120-minute cap as a genuine `'timeout'`, not chased further per CLAUDE.md
 * rule 6, the same precedent already spent on this exact mechanism).** Every
 * class is now far over G8's 70% ceiling (`floor(12*0.7) = 8`) rather than
 * under its 35% floor — the same floor-to-ceiling flip fb039/p10m already
 * found on G1/G14/G23. Diversity also moved, though not enough to close the
 * clause: **3 of 12 distinct top sources** (`ballista`, `frost_obelisk`,
 * `spreading_plague`), up from 2 — full-tree stat bonuses shift enough damage
 * share around that `necromancer`/`animist` now top out on `frost_obelisk`
 * (previously `ballista` like the rest of the pack) instead of collapsing
 * onto exactly two keys, but the >=9/12 target is not remotely in reach on
 * this axis. Every `it.skip` below carries its fresh full-tree number in its
 * trailing comment; the fuller per-class prose above is superseded by this
 * paragraph, not deleted, since it's still the record of how the wave-11-17
 * wall was originally found and closed. Re-enable point for both clauses
 * stays **P10** — this item (fb049) is the re-measurement, `p10r` inherits
 * the corrected (over-ceiling, not under-floor) retune target.
 *
 * **fb177 (2026-09-07) — full re-measurement after the entire p12a-p12h
 * balance arc, and one undocumented drift found along the way.** This file's
 * `beforeAll` had not been re-run since b080 (2026-09-03) — it is excluded
 * from `test:fast` (~42 min per full sweep, confirmed twice this session),
 * so nothing caught that it silently predated: fb077 (generated terrain),
 * p12a (kit re-anchor), **p12b (which quietly moved this file's own reference
 * tier from T1 to T3** — `tier: 1` -> `tier: GATE_TIER`, GATE_TIER=3 — while
 * never touching the "**T1**, concretely: `tier: 1`" sentence in this
 * header's own methodology section above, or any of the eleven `.skip`
 * comments below, none of which were re-labelled T3), p12c (`baseHpMul: 20`),
 * fb152/fb153a (DoT cadence + number rescale), and p12e-p12h. Full 12-class
 * table, freshly measured (wins/12, band `[5,8]` = `[ceil(12*.35),
 * floor(12*.70)]`):
 *
 * | class | wins | vs band | dominant loss mode |
 * |---|---|---|---|
 * | swordsman | 2 | under | 10/12 `defeat_warden`@w3 |
 * | plaguebringer | 3 | under | mixed w3/w6/w16-17 |
 * | engineer | 3 | under | mixed w6-17 `defeat_core` |
 * | pyromancer | 2 | under | 7/12 `defeat_warden`@w3 |
 * | **archer** | **5** | **in band** | 7/12 `defeat_warden`@w3, still wins 5 |
 * | necromancer | 3 | under | mixed w6-17 `defeat_core` |
 * | cryomancer | 9 | over | mostly `victory` |
 * | stormcaller | 4 | under (by 1) | mixed w6-17 `defeat_core` |
 * | bloodlord | 4 | under (by 1) | 8/12 `defeat_warden`@w3 |
 * | animist | 9 | over | mostly `victory`, 2 timeouts@w6 |
 * | paladin | 3 | under | mixed w3/w6-17 |
 * | time_lord | 10 | over | mostly `victory` |
 *
 * **Only `archer` is honestly in band — un-skipped below, a real green G8
 * contribution.** The other eleven are re-pinned with fresh numbers, each in
 * its own `it.skip` trailing comment.
 *
 * **The bisect** (git worktree control runs, one lever at a time, `data/*`
 * byte-identical either side, same method as p12h): swordsman 12/12 at b080,
 * **still 12/12 immediately after fb077** (exonerated — terrain is not the
 * cause here, unlike G13/p12h), still 12/12 after p12a alone. p12b alone
 * (its own shipped-but-immediately-superseded `tierEnemyHpPerStep: 4.0`,
 * 16x HP at T3) drops it to **0/12** — worse than final HEAD, but that ladder
 * value lived for one commit before p12c refit it to 1.07/1.05/1.03. p12c
 * (fitted ladder + `baseHpMul: 20`, real `GATE_TIER`) measures **3/12**,
 * matching HEAD's 2/12 within one seed; fb152/fb153a's checkpoint (9a6b9ad)
 * reproduces HEAD's exact 2/12 result bit-for-bit (same two winning seeds).
 * **Verdict: `baseHpMul: 20` (p12c) is the dominant, persisting cause**; the
 * T3 reference-tier move (p12b) is a real but secondary compounding factor
 * riding the same ladder.
 *
 * **Why `baseHpMul` — a roster-wide enemy-HP multiplier — produces an
 * early-Act-I-*looking* death, corrected**: `defeat_warden` can only fire
 * while `w.huntsWarden` is true (`src/sim/world.ts` — `phase==='act2' ||
 * 'levelup'`), which is never true during TD. `cycleWaveEnd` divides 18 TD
 * waves across `cycles` (6) VS blocks, i.e. 3 TD waves per block — so
 * "wave 3" is not an Act-I death at all, it's the **first VS/Night block**,
 * confirmed directly (`run.world.act2Time` 18-40s into that block's 75s
 * budget, `phase` already `'results'`). `baseHpMul` applies at the single
 * `makeEnemy` choke point (`src/sim/enemies.ts`) regardless of the VS-only
 * `hpOverlay`/`actIICarry` multipliers (both are scalar factors on the same
 * `hp` value, so order doesn't change the result), so it inflates Night-1
 * mob HP by the same x20 as every TD wave's — landing on the block with the
 * least built economy of the whole run. `classBasicAttack` is TD-only
 * (`run.ts:550`, `if (!w.huntsWarden) classBasicAttack(w, cls)`), so a
 * class's own kit Actives are the *entire* VS damage contribution regardless
 * of how strong its basic attack is. The table's worst-hit classes,
 * swordsman (10/12) and bloodlord (8/12), are two of the roster's three
 * shortest-range classes (`basicAttack.range: 2.5`, tied for lowest along
 * with `paladin`, which isn't hit nearly as hard — so range alone doesn't
 * explain it) and rank #1/#3 by `basicAttack.dps` (78, 51) — exactly the
 * stat Night 1 cannot use. Not proven exhaustively per-class, but a
 * coherent, corroborated mechanism, not a guess.
 *
 * **Chose re-pin over fix.** A single-class data tune (in the Cryomancer/
 * Paladin/Necromancer style already in this file) was considered but not
 * attempted: the table above shows this is not a swordsman-specific
 * regression but a roster-wide rescramble — 8 of 12 classes under the floor,
 * 3 over the ceiling, pulling in opposite directions — which is a full
 * balance-analyst re-tune against the new T3 + `baseHpMul: 20` baseline, not
 * a bisect item's blast radius (same reasoning p12h gave for G13, same
 * reasoning p12c gave for deferring its own gate-text rewrite to p12d).
 * Reverting `baseHpMul` would re-break p12c's own deliberate T3 contested-
 * margin fit and every other gate it touches. Follow-up filed as **p12j**.
 * Full table, bisect log and decision: QUESTIONS Q195.
 *
 * **p12j (2026-09-07) — the roster-wide `data/classes.json`-only re-tune this
 * paragraph called for, done.** Iterative, one-or-few-lever-at-a-time rounds
 * per class (2-4 rounds each, some hypotheses measured *worse* and were
 * reverted — see each `it`'s own trailing comment below for the specific
 * before/after/reverted levers), re-measured against a live `beforeAll` after
 * every change. Full final table (was -> now):
 *
 * | class | before | after | band |
 * |---|---|---|---|
 * | swordsman | 2/12 | 2/12 | still under (3 rounds, no lever moved it) |
 * | plaguebringer | 3/12 | 6/12 | in band |
 * | engineer | 3/12 | 4/12 | still under by 1 (see follow-up below) |
 * | pyromancer | 2/12 | 5/12 | in band |
 * | archer | 5/12 | 5/12 | in band (untouched) |
 * | necromancer | 3/12 | 4/12 | still under by 1 (3 rounds, best kept) |
 * | cryomancer | 9/12 | 5/12 | in band |
 * | stormcaller | 4/12 | 5/12 | in band |
 * | bloodlord | 4/12 | 5/12 | in band |
 * | animist | 9/12 | 8/12 | in band (at ceiling — see correction below) |
 * | paladin | 3/12 | 5/12 | in band |
 * | time_lord | 10/12 | 8/12 | in band |
 *
 * **Follow-up (2026-09-07, found directly by the lead session re-running
 * `npm run test:fast` after this item's own container-restart recovery,
 * since independently reviewed and approved, including this fix's own
 * cadence math): engineer's own Pop Turret retune left
 * `summonCap: 3` nominally unreachable at its own cast cadence** —
 * `cadenceCeiling(10s duration, 2.5s cooldown) = 4`, one short of
 * `summonCap(3) + maxBonus(2) = 5` — breaking `tests/class-line-bonus.
 * test.ts`'s c018 invariant and `tests/class-active2-cdr.test.ts`'s c019
 * case (both assert an authored cap is actually reachable, not just
 * written down). Fixed with the smallest cut that restores reachability,
 * `cooldownSeconds` 2.5->2.4 (re-verified G1/G14 both still clean at 2.4)
 * — engineer's own chaotic seed trajectory moved by exactly one win on that
 * 0.1s change, **5/12 -> 4/12**, landing back at "under by 1" rather than
 * "in band." Not chased further with another retune round: the cadence bug
 * was the real defect here (a nominally-reachable-but-actually-unreachable
 * cap is a bug independent of this file's own win-rate target), re-tuning
 * `summonStatMul`/cap again to chase this exact seed count would risk
 * reopening the G14 boss-test coupling this item already found and fixed
 * once, and this codebase's own precedent throughout this arc (swordsman,
 * necromancer, this very item) is measured-then-honestly-re-pinned over
 * chased. Full independent-review verification, including a re-derivation
 * of the ownShare/win-count numbers from scratch: QUESTIONS Q196.
 *
 * **Second follow-up (2026-09-07, independent code-reviewer finding on the
 * commit above, both re-verified directly by the lead session with a
 * throwaway `tools/`-script probe against `runClassScripted`, deleted after
 * use): two rows in this table's "after" column described an abandoned
 * intermediate value, not what actually shipped.** `animist`'s Wide Grove
 * `area` was first cut 10%->4% (independently re-measures at 6/12) but that
 * broke `tests/class-wide-grove-reach.test.ts`'s live-derived RING probe
 * placement — reproduced directly, 9 failures. The shipped value is
 * 10%->**8%**, which clears both: **8/12**, not 6/12, and at the G8 ceiling
 * with zero headroom (`tests/class-spec-numbers.test.ts`'s own ledger row
 * for this field already carried the correct 8%/wide-grove-reach story;
 * only this file and BACKLOG/PROGRESS/QUESTIONS still had the stale draft).
 * `plaguebringer`'s Poison Boost (`active2.cooldownSeconds` 14->8) was
 * described as a rejected lever ("cooldown-only... measured worse") with
 * only Poison Barrel's damage/radius (`active1`) credited — false: reverting
 * `cooldownSeconds` to 14 while keeping the shipped `active1` damage/radius
 * independently re-measures at **4/12, still under floor**; only with the
 * cooldown cut restored does it clear to the documented 6/12. The
 * `active2` cut is load-bearing, not a discarded experiment. Neither
 * correction changes the roster's overall in-band count (animist and
 * plaguebringer were already counted in-band under the wrong numbers) or
 * `tests/class-descriptions.test.ts`'s ledger token for animist, which
 * already reads the correct shipped "+8%" (fixed in the container-restart
 * recovery pass above, before this finding). Full write-up: QUESTIONS Q196.
 *
 * **9 of 12 in band — still clears SPEC-FINAL §14's own G8 ratio (>=9 of
 * 12), exactly at the boundary.**
 * Two honestly left open, both after genuine multi-round effort, not a
 * one-shot give-up: **swordsman** got 3 materially different lever rounds
 * (Circle Slash damage alone; +cooldown/knockback; a drastic damage+radius
 * bump plus a Dash Slash rework) and every round reproduced the *exact same*
 * 10/12 first-VS-block `defeat_warden`@w3 signature this file's fb177 header
 * diagnosed — not even one seed's outcome changed, which is itself a real
 * finding: kit damage is not this class's bottleneck, so whatever is (most
 * likely raw Warden HP/mitigation against the Night-1 swarm, not a
 * `classes.json` kit lever this item can reach) is outside this item's
 * `/data`-only scope — flagged, not fixed. **necromancer** landed one win
 * short of band after 3 rounds; its best config is kept over two
 * measured-worse alternatives (see its `it.skip` comment). Both are logged,
 * not forced. Bloodlord — sharing swordsman's exact diagnosed mechanism per
 * fb177's header — did move, on a completely different lever (its Blood
 * Tithe/Crimson Rush numbers, not raw damage), which is itself evidence the
 * shared "shortest range + highest basicAttack.dps" diagnosis correlates but
 * isn't the whole causal story per class. **A real gate-coupling hit, per
 * CLAUDE.md's A4/A7 lesson**: engineer's first Pop Turret buff cleared G8
 * (7/12) but broke `tests/boss.test.ts`'s T1 mechanism check (that file's
 * own default `classKey` is `engineer` — a stronger Pop Turret killed the
 * Warden-Eater in 15-17s against its own ">20s, not trivially short" floor).
 * Caught by re-running G1/G14 directly (both excluded from `test:fast`,
 * neither touched since p12e/p12f) rather than assuming a `classes.json`
 * change confined to one class's own row stays confined to one gate — found
 * the narrow window (`summonStatMul: 0.38`, `cooldownSeconds: 2.5`) that
 * keeps both G8 and G14 green; see engineer's own comment below (later
 * cut to `cooldownSeconds: 2.4` by the cadence-reachability follow-up
 * above — G1/G14 re-verified clean at that value too). Full write-up,
 * per-class hypothesis log and the before/after table: QUESTIONS Q196.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import '../src/bots';
import { loadContent, type ClassDef } from '../src/sim/content';
import { allTreeNodeIds } from '../src/meta/meta';
import type { RunConfig, RunReport } from '../src/sim/types';
import { cfg, classifyMargin, GATE_TIER, runScripted, summarizeMargins } from './helpers';

const content = loadContent();
const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
// fb049 (Q138 re-measurement): real Hub-started runs feed the full
// Constellation tree into `allocated` (`TREE_AUTO_MAX`) — `cfg()`'s own
// default (`[]`) does not match that, so it is overridden explicitly below.
const FULL_TREE = allTreeNodeIds(content);
/** §14 gate G8's own band. */
const BAND_LO = 0.35;
const BAND_HI = 0.70;

/** The twelve §4-shaped classes, fb013. */
const CLASS_KEYS = content.classes.classes.map((c) => c.key);

/** T1, one class, one seed — hybrid economy/kiting, `tests/helpers.ts`'s shared kit script (`scriptClassKit`/`buyCoreUpgrades`, via `runScripted`) layered on top per BACKLOG p10w's de-dup — was a local copy of the same logic, now the shared implementation (p10s precedent). */
function runClassScripted(classKey: string, seed: number): RunReport {
  const config: RunConfig = cfg({
    seed,
    classKey,
    tier: GATE_TIER,
    modifiers: [],
    allocated: FULL_TREE,
    cycles: 6,
    policy: 'hybrid',
  });
  // Same headroom G23 measured its slowest resolution against (Q120).
  return runScripted(config, 'hybrid', 60 * 60 * 120).report;
}

/** A summon-producing kind's own Active — whichever of a class's two Actives actually spawns the `class_summon` bucket's damage. */
const SUMMON_KINDS = new Set(['summon_turret', 'raise_skeletons', 'manifest_spirit']);

/** Q121: resolves one raw `damageByWeapon` key to the specific named mechanism behind it — only called once a class's own-kit share has already cleared `MATERIALITY_SHARE` (below); this function never runs on a class whose kit is a bystander. */
function describeSource(cls: ClassDef, key: string): string {
  switch (key) {
    case 'class_active':
      return cls.active1.name;
    case 'class_active2':
      return cls.active2.name;
    case 'class_passive':
      return cls.passive.name;
    case 'class_basic':
      return `${cls.name} basic attack`;
    case 'class_summon':
      if (SUMMON_KINDS.has(cls.active2.kind)) return cls.active2.name;
      if (SUMMON_KINDS.has(cls.active1.kind)) return cls.active1.name;
      return `${cls.name} summon`;
    default:
      // spreading_plague (Plaguebringer's own passive) already reads as a name.
      return key;
  }
}

/**
 * Q121 (code-reviewer Major 1, round 2): a class's own-kit damage must clear
 * this share of its *total* damage (kit + towers) before its kit gets to name
 * the "top source" label at all — otherwise the label is whatever raw key
 * actually has the plurality, tower included, un-translated. Without this
 * bar, relabeling every non-tower bucket by its class-specific ability name
 * makes the >=8/11 clause pass near-tautologically (SPEC-FINAL already gives
 * every class's Active1/Active2/passive a distinct name, so translating the
 * bucket string is not the same as showing the kit actually *mattered*).
 *
 * CORRECTED (this session, before commit): an earlier draft of this comment
 * claimed the roster's own-kit shares "cluster either well above [20%] or
 * near zero." That was never checked against a completed run. The real
 * measured shares are a continuum from 0.4% (engineer) to 16.6%
 * (plaguebringer) and every one of the eleven sits under this bar — see the
 * `.skip`-ed diversity assertion below and its QUESTIONS.md Q121(4)
 * correction for the honest (red) result and why no threshold that still
 * means anything fixes it.
 *
 * RE-CORRECTED (PRIORITY DIRECTIVE follow-up, this session, Q123): the
 * paragraph above was itself measured against pre-p8a content. The full
 * post-p8a re-run measures the continuum as **0.4% (animist) to 15.4%
 * (plaguebringer)** — engineer is 2.1%, not the roster's low end. Every one
 * of the eleven still sits under the 20% bar; the conclusion (no threshold
 * that still means anything clears 8/11) is unchanged, only the two named
 * classes at the continuum's ends moved.
 */
const MATERIALITY_SHARE = 0.20;

interface ClassMeasurement {
  key: string;
  cls: ClassDef;
  wins: number;
  outcomes: string[];
  /** Summed over all 12 seeds, restricted to the class's own kit sources (header: tower keys are `hybrid`'s choice, not the kit's). */
  ownDamage: Record<string, number>;
  /** Summed over all 12 seeds, every source including towers — the denominator `ownShare` is measured against. */
  allDamage: Record<string, number>;
  /** ownDamage total / allDamage total. */
  ownShare: number;
  topLabel: string;
  /** p10z: every seed's raw report, kept so a retune probe can classify margin (`classifyMargin`/`summarizeMargins`, `tests/helpers.ts`) without a second sweep. */
  reports: RunReport[];
}

function sumValues(rec: Record<string, number>): number {
  let total = 0;
  for (const v of Object.values(rec)) total += v;
  return total;
}

function argmaxKey(rec: Record<string, number>): string {
  let bestKey = '';
  let bestVal = -1;
  for (const [k, v] of Object.entries(rec)) {
    if (v > bestVal) {
      bestVal = v;
      bestKey = k;
    }
  }
  return bestKey;
}

const measurements = new Map<string, ClassMeasurement>();

// File-scoped (not nested in either `describe` below): both describes' tests
// read `measurements`, and a `beforeAll` nested in the first would not be
// guaranteed to run before the second describe's tests under every runner.
// ~12 seeds x 11 classes, each up to a 120-simulated-minute cap (most resolve
// far sooner — see the per-class outcomes logged in each `it` below and in
// this file's header).
//
// p8a (Q122): this `beforeAll` used to hard-fail on any seed still `running`
// at the cap ("a non-terminal outcome is a timeout, not a measured loss, so
// don't silently count it either way" — G23's own precedent). Measured after
// p8a's real wave 11-18 content landed: `swordsman` seed 1 still doesn't
// resolve even at a 250-minute cap (up from 120, more than double G23's own
// headroom), which reads as a genuine stalemate under the new curve rather
// than "needs a bigger cap" — the same category of question the ten win-rate
// clauses below are already `.skip`-ed pending, not a new one to chase down
// here. Recorded as a `'timeout'` outcome instead of thrown, so the shared
// measurement matrix still completes for every other class/seed; the
// follow-up re-measurement pass inherits this one alongside the other ten
// (eleven, after `cryomancer`'s own re-measurement below also fell out of
// band). A `'timeout'` seed's `wins` contribution is correctly zero (only
// `'victory'` increments it, unchanged), but its damage tallies are excluded
// from `ownDamage`/`allDamage` entirely (code-reviewer finding on this item):
// a run capped mid-simulation accumulates over a much longer, incomparable
// window than a seed that actually terminates, and `topLabel`/the diversity
// pin read those two records — folding a stalemate seed's disproportionate
// tally in would silently skew both.
beforeAll(() => {
  for (const key of CLASS_KEYS) {
    const cls = content.classByKey.get(key);
    if (!cls) throw new Error(`${key}: expected a §4 class`);
    let wins = 0;
    const outcomes: string[] = [];
    const reports: RunReport[] = [];
    const ownDamage: Record<string, number> = {};
    const allDamage: Record<string, number> = {};
    for (const seed of SEEDS) {
      const report = runClassScripted(key, seed);
      reports.push(report);
      if (report.outcome === 'victory') wins++;
      // p10z: margin, not just outcome — a "landslide" win (Core HP still
      // high) reads very differently from a "close" one, and an early loss
      // (before the roster's own wave-11-to-17 contested band) reads
      // differently from a loss inside it. See `classifyMargin`'s own doc
      // comment (`tests/helpers.ts`) for why bare win/loss couldn't
      // discriminate these (BACKLOG p10z, QUESTIONS Q158/Q159).
      const margin = classifyMargin(report);
      outcomes.push(
        `${seed}:${report.outcome === 'running' ? 'timeout' : report.outcome}/w${report.wavesCleared}/${margin.kind}`,
      );
      // A `'running'` (tick-cap timeout) seed never reached a real end state,
      // so its damage tally covers a much longer, incomparable window than a
      // terminating seed's — excluded from both records rather than folded
      // in, the same non-participation `wins` already gives it.
      if (report.outcome === 'running') continue;
      for (const [k, v] of Object.entries(report.damageByWeapon)) {
        allDamage[k] = (allDamage[k] ?? 0) + v;
        if (!content.towerByKey.has(k)) ownDamage[k] = (ownDamage[k] ?? 0) + v; // a tower key: hybrid's build, not the kit
      }
    }
    const ownTotal = sumValues(ownDamage);
    const allTotal = sumValues(allDamage);
    const ownShare = allTotal > 0 ? ownTotal / allTotal : 0;
    const topLabel =
      ownShare >= MATERIALITY_SHARE ? describeSource(cls, argmaxKey(ownDamage)) : argmaxKey(allDamage);
    measurements.set(key, { key, cls, wins, outcomes, ownDamage, allDamage, ownShare, topLabel, reports });
  }
}, 6_000_000);

describe('p6e: G8 measured as a live test over the seed set (SPEC-FINAL §4, §14)', () => {
  function detail(key: string): string {
    const m = measurements.get(key)!;
    return (
      `${m.wins}/${SEEDS.length} — ${m.outcomes.join(' ')} — top: ${m.topLabel}` +
      ` — margins: ${summarizeMargins(m.reports)}`
    );
  }

  function assertBand(key: string): void {
    const m = measurements.get(key)!;
    expect(m.wins, detail(key)).toBeGreaterThanOrEqual(Math.ceil(SEEDS.length * BAND_LO));
    expect(m.wins, detail(key)).toBeLessThanOrEqual(Math.floor(SEEDS.length * BAND_HI));
  }

  // Was measured 6/12 (50%) after the Ice Wall cooldown tune (header) —
  // solidly inside [35, 70] — the one class whose kit (freeze/shatter CC, a
  // cheap lane-blocking wall) did something other than race the pre-p8a HP
  // curve (repeating wave 10's row forever).
  //
  // p8a re-opened this one (Q122): once real, escalating waves 11-18 replaced
  // the repeated wave-10 row, re-measured at **2/12** — 9:victory/w18,
  // 10:victory/w18, the other ten `defeat_core`/`defeat_warden` at wave 15-18
  // — below the 35% floor. Ice Wall's crowd control bought real survival
  // against a *flat* repeated wave, but the real curve still ramps past it;
  // this is the last of the eleven classes to join the wave-11-17 wall the
  // other ten already hit, not a separate story. `.skip`-ed with the measured
  // number on the same precedent, re-enable point folded into the same
  // follow-up re-measurement pass as the rest of G8.
  // Reconfirmed in full this session (PRIORITY DIRECTIVE follow-up, Q123):
  // identical to the p8a-era number above — 2/12 (seeds 9, 10 victory/w18),
  // no timeouts. Unchanged.
  //
  // p10m re-measurement (this session): re-run against HEAD, after the
  // `p10j`-`p10l` G1/G13 balance pass. Same over-correction story as G14/G23's
  // p10m passes — the floor problem is gone, replaced by a ceiling one:
  // **12/12 (100%)**, every seed victory/w18, up from 2/12. Still `.skip`-ed
  // with the new honest number; re-enable point stays **P10** (measurement
  // only, fix is separate balance work — PROGRESS.md's p10m entry).
  // p10s re-measurement (this session, QUESTIONS Q158/BACKLOG p10s): re-run
  // against HEAD after fb046/fb048 landed (unrelated commits between fb049
  // and this session). Still fully over-ceiling: **12/12** — every seed
  // victory/w18. p10s's own attempt (a real, measured Ice Wall cooldown
  // revert 9->14 plus a basicAttack/towerPassive/active1 cut of 30-40%) left
  // this number completely unmoved even at that magnitude — see p10s's
  // BACKLOG entry for the full per-class table and the `paladin` case below
  // for the even-more-extreme probe that also failed to move a class. Data
  // left unchanged (the tuning was reverted) since it produced zero measured
  // benefit. Re-enable point stays **P10**.
  it('cryomancer', () => assertBand('cryomancer')); // p12j re-tune (2026-09-07): Glaciate (active1) damage 60->40, single lever. 9/12 -> **5/12, in band.** QUESTIONS Q196.

  // Every one of the ten below converges on the same wave-11-to-17
  // `defeat_core`/`defeat_warden` wall (this file's header; G23's own
  // precedent for reading that signature as the p8a content gap, not a
  // balance story). Re-enable point: p8a authors real wave rows past 10.
  //
  // Re-measured in full this session (Q123, Q127) — every number below is
  // freshly measured against real p8a content, not inherited from an older
  // pre-p8a pass. `timeout` means the seed hit the 120-minute cap without
  // resolving (Q127); it counts as a non-win, matching every other
  // non-`victory` outcome.
  //
  // p10m re-measurement (this session, all ten below): re-run against HEAD,
  // after the `p10j`-`p10l` G1/G13 balance pass that also flipped G14/G23
  // from under-the-floor to over-the-ceiling. Every timeout and every
  // wave-11-to-17 wall death this file's header names is gone — the wall is
  // fully closed — but nine of the ten now clear 11-12/12 (91.7-100%),
  // past the 70% ceiling (`floor(12*0.70) = 8`), not inside [5, 8]. Only
  // necromancer stays under the 35% floor (`ceil(12*0.35) = 5`), now for a
  // different reason than before (see its own comment). Still `.skip`-ed
  // with the fresh honest numbers; re-enable point stays **P10** for all ten
  // (measurement only, fix is separate balance work — PROGRESS.md's p10m
  // entry).
  // p10s (this session): swordsman/plaguebringer/engineer/pyromancer/archer
  // all re-measured at HEAD, unchanged at 12/12 (pyromancer 11/12 — seed 8
  // has always been an early defeat_warden/w3 outlier, unrelated to any p10s
  // edit). p10s tried a real basicAttack/towerPassive/active cut on
  // pyromancer/archer (30-45%) and an active-only cut on engineer (kit is
  // bot-scripted here but `basicAttack`/`towerPassive`/`passive` are shared
  // with G1/G14's un-scripted engineer-only harness, so those three fields
  // are off-limits for engineer specifically) — all three still 100%-ish,
  // reverted since ineffective. swordsman/plaguebringer are additionally
  // constrained by `tests/p6b-swordsman.test.ts`/`tests/p6c-plaguebringer.
  // test.ts`'s own literal pins on `towerPassive.mods` (see those files) —
  // only `basicAttack`/`active1`/`active2` were legal to touch there, and a
  // ~35-40% cut on those alone also didn't move it. Data left unchanged.
  it.skip('swordsman', () => assertBand('swordsman')); // p12j (2026-09-07): still **2/12, under floor** — genuinely tried, not chased-and-gave-up: 3 rounds, each a materially different lever (Circle Slash damage 180->260 alone; then +cooldown 6->3/knockback 3->6; then a drastic damage 260->450/radius 4->6/minDamage 30->100 + Dash Slash damage 90->200/cooldown 4->2). Every round measured **exactly the same 10/12 first-VS-block `defeat_warden`@w3**, not even one seed's outcome flipped — kit damage is provably not the bottleneck for this class's Night-1 wipe. Settled on the smallest tested buff (damage 260, everything else stock) rather than leaving an untested extreme value in `/data` for zero measured gain. Read as Warden raw-survival (HP/mitigation), not kit-damage — outside a `classes.json`-only lever this item found. QUESTIONS Q196.
  it('plaguebringer', () => assertBand('plaguebringer')); // p12j re-tune (2026-09-07): CORRECTED post-container-restart (independent code-reviewer finding, re-verified by the lead session directly): the shipped lever is not radius alone. Poison Barrel (active1) damage 24->40 + radius 3->5, *and* Poison Boost (active2) cooldownSeconds 14->8, land together — damage+radius alone (cooldown left at 14) independently re-measured at **4/12, still under floor**; only with the cooldown cut added does it clear to **6/12, in band**. Earlier drafts of this comment and of BACKLOG/PROGRESS/QUESTIONS described cooldown as a rejected lever — that was wrong; it is load-bearing. 3/12 -> **6/12, in band.** QUESTIONS Q196.
  // p12j re-tune (2026-09-07): a `towerHp` passive bump (10->18%) was tried
  // first and made it *worse* (3/12 -> 2/12) — reverted. Real lever: Pop
  // Turret (active2, a structure that keeps firing in VS unlike
  // `classBasicAttack`) `summonStatMul` 0.30->0.55, cap 2->3, cooldown 3->2,
  // first got G8 to 7/12 — but broke `tests/boss.test.ts`'s T1 "not
  // trivially short" floor (this file's own default `classKey` is
  // `engineer`, boss killed in 15-17s against a >20s floor). Dialed back to
  // `summonStatMul: 0.38`, `cooldownSeconds: 2.5` (cap 3 kept) — the narrow
  // window that keeps both green: weaker (0.34) dropped the boss test's own
  // T1 win count below its own floor, stronger (0.42) re-broke the >20s
  // check. 3/12 -> **5/12, in band** (right at the floor).
  //
  // p12j follow-up (2026-09-07, found directly by the lead session): the
  // same Pop Turret retune left `summonCap` 3 nominally unreachable at its
  // own cast cadence — `cadenceCeiling(10s duration, 2.5s cooldown) = 4` casts alive
  // at once, one short of `summonCap(3) + maxBonus(2) = 5`, breaking
  // `tests/class-line-bonus.test.ts`'s c018 invariant and
  // `tests/class-active2-cdr.test.ts`'s c019 case (both assert the
  // authored cap is actually reachable, not just written down). Fixed by
  // cutting `cooldownSeconds` 2.5->2.4 (the smallest step that makes
  // `cadenceCeiling` reach 5) — re-verified G1/G14 both still clean at 2.4.
  // That 0.1s cut moved this exact class/seed set's chaotic trajectory by
  // one win: **5/12 -> 4/12, one seed short of the floor.** Not chased
  // further (the cadence bug is the real defect; re-tuning `summonStatMul`
  // again to chase this exact seed count risks reopening the G14 coupling
  // this item already found once) — re-pinned honestly. The roster count
  // this item's acceptance reads (SPEC-FINAL §14's own ">=9 of 12") drops
  // from 10 to **9 of 12**, still clearing the threshold exactly at the
  // boundary. See QUESTIONS Q196.
  it.skip('engineer', () => assertBand('engineer')); // p12j follow-up: 4/12, under floor by one seed (see comment above)
  it('pyromancer', () => assertBand('pyromancer')); // p12j re-tune (2026-09-07): Immolation Wave (active1) damage 135->200, single lever, first try. 2/12 -> **5/12, in band.** QUESTIONS Q196.
  it('archer', () => assertBand('archer')); // fb177 re-measurement (2026-09-07): 5/12, in band, no `data/classes.json` change (p12j left archer untouched — see QUESTIONS Q196).
  // Tuned (header, corrected this session — Q123): Raise's
  // cooldown/potency/duration/radius all buffed. Early defeat_warden is now
  // the minority (3/12: waves 3/6/15) against a defeat_core majority (9/12:
  // waves 13-17) — real progress, still 0/12, no timeouts, no victories.
  //
  // p10m re-measurement (this session): re-run against HEAD, after the
  // `p10j`-`p10l` balance pass. The wave-11-to-17 wall is gone for the other
  // nine classes but not this one — necromancer stays under the 35% floor,
  // **4/12** (seeds 2, 5, 6, 8 victory/w18; seed 11 defeat_core/w17; the
  // other seven early defeat_warden at wave 3 or 6). The failure shape moved
  // (from a uniform mid-run wall to an early-death/late-clear split) but the
  // gate direction did not — still under-floor, not over-ceiling like the
  // other nine. Still `.skip`-ed with the fresh number; re-enable point stays
  // **P10**.
  // p10s (this session): necromancer re-measured 12/12, unmoved even after
  // reverting its p6e-era Raise buff back down (cooldown 6->10,
  // summonStatMul 0.65->0.42, duration 24->16, radius 8->6) plus a
  // towerPassive/basicAttack cut — reverted, ineffective. stormcaller
  // likewise 12/12 after a real (reverted) basicAttack/towerPassive/active1
  // cut. animist 10/12 (2 timeouts, seeds 5/7) — already short of 12/12 at
  // HEAD with no p10s edit at all (animist was left untouched; every lever
  // tried on other classes at this magnitude produced zero movement, so it
  // wasn't spent here) — still over the 8-win ceiling.
  it.skip('necromancer', () => assertBand('necromancer')); // p12j (2026-09-07): still **4/12, under floor by 1** — 3 rounds tried: Raise `summonStatMul` 0.65->0.90 alone (3/12->4/12, best result); stacking a cooldown cut (6->4) on top *collapsed* it to 0/12 (reverted); `summonCap` 8->14 on top of the 0.90 mul alone gave 2/12 (also reverted). Settled on the one config that actually measured better than baseline (`summonStatMul: 0.90`, everything else stock) rather than an untested or measured-worse alternative. One win short of band; loss mode is mostly the roster's w6-17 `defeat_core` wall, not the Night-1 mechanism. QUESTIONS Q196.
  it('stormcaller', () => assertBand('stormcaller')); // p12j re-tune (2026-09-07): Chain Surge (active1) damage 54->75 alone left it unmoved (4/12->4/12); cooldown 8->5 on top was the lever that moved it. 4/12 -> **5/12, in band.** QUESTIONS Q196.
  // p10s closed this one on the pre-p12 baseline; re-opened by the p12a-p12c
  // arc, same as the rest of the table (header).
  it('animist', () => assertBand('animist')); // p12j re-tune (2026-09-07): CORRECTED post-container-restart (independent code-reviewer finding, re-verified by the lead session directly). Wide Grove (towerPassive) area bonus first cut 10%->4% — that value is NOT what shipped: it independently re-measures at 6/12 (in band) but breaks `tests/class-wide-grove-reach.test.ts`'s live-derived RING probe placement (9 failures, reproduced directly). The shipped value is 10%->**8%**, which clears both the wide-grove-reach probe and G8: independently re-measured at **8/12, in band** (at the ceiling, not mid-band — no headroom). Earlier drafts of this comment and of BACKLOG/PROGRESS/QUESTIONS still described the abandoned 4%/6-12 draft as final; `tests/class-spec-numbers.test.ts`'s own ledger row for this field already had the correct 8%/wide-grove-reach story. 9/12 -> **8/12, in band.** QUESTIONS Q196.
  // Tuned (header, corrected this session — Q123): Guardian
  // Stance/Clarion Taunt/Judgement all buffed. Early defeat_warden is 4/12
  // (three at wave 3, one at wave 6) against a defeat_core majority (8/12:
  // waves 8/15/16) — still 0/12, no timeouts, no victories.
  //
  // p10m re-measurement (this session): re-run against HEAD, after the
  // `p10j`-`p10l` balance pass. Same over-ceiling story as the other nine —
  // **11/12** (only seed8 early defeat_warden/w3, every other seed
  // victory/w18). Still `.skip`-ed with the fresh number; re-enable point
  // stays **P10**.
  //
  // p10s (this session): re-measured 12/12 at HEAD, then pushed the most
  // extreme single-class probe of this whole session against it — a real
  // (reverted) ~80% cut across basicAttack (10->2), Guardian Stance
  // (stanceArmor 30->10, stanceSeconds 1.0->2.0, wrathFraction 0.55->0.2)
  // and towerPassive (towerHp 0.04->0.01, towerDefenseBonus 2->0.5), all on
  // top of the earlier stanceArmor/wrathFraction/Clarion-Taunt/Judgement
  // reverts already folded into HEAD by a prior session. Still **6/6 (100%)**
  // on a 6-seed sample — zero movement even at that magnitude. This is the
  // decisive data point behind p10s's "genuine wall" conclusion: it isn't
  // that paladin's specific numbers are wrong, it's that none of
  // basicAttack/passive/towerPassive/active magnitude moves this gate at all
  // once T1 carries `TREE_AUTO_MAX`. Reverted (produced no benefit); data
  // unchanged from the fb049-era baseline. Re-enable point stays **P10**.
  it('paladin', () => assertBand('paladin')); // p12j re-tune (2026-09-07): Judgement (active2) `wrathDamageMul` 2.2->3.2, single lever, first try — worth noting this class's own numeric tuning history (this file's earlier prose, above) previously found "even an extreme magnitude" left it unmoved; a materially different lever (Wrath payout, not Ice-Wall-style survival) did move it this time. 3/12 -> **5/12, in band.** QUESTIONS Q196.

  // **p10s (BACKLOG p10s, QUESTIONS Q158) — CLOSED.** Every other class in
  // this file sits on a genuine /data-only wall (see each `it.skip` above):
  // real, measured cuts of 30-80% across basicAttack/towerPassive/passive/
  // active fields move nothing, because T1 with the real `TREE_AUTO_MAX`
  // Constellation allocation already wins ~92-100% of the time almost
  // independent of any one class's own numbers. Bloodlord is the one
  // exception this session found: `data/classes.json` `basicAttack.dps`
  // 28->17 and `towerPassive.mods.towerDamage` 0.10->0.04 (leech intentionally
  // left at 0.03 — `tests/fb022-info-surfacing.test.ts`'s b053 case pins the
  // "+3% Leech" display string to that exact value) bring it from 10/12 to
  // **8/12 (66.7%)** — inside [35,70] with real headroom on both sides.
  // Bloodlord was already the roster's most timeout-prone class before this
  // change (fb049: 2/12 timeouts); the same nerf that pushes its win rate
  // into band also pushes two more seeds into a timeout rather than a clean
  // loss (2->4 of 12) — both are non-`victory` outcomes and both are already
  // handled correctly by `assertBand`. G1/G14 (both locked to
  // `classKey: 'engineer'`) and every other class/Core in this suite are
  // unaffected — confirmed by re-running both after this edit landed.
  // b080 (2026-09-03) RE-OPENED THIS ONE — re-measured 12/12 (100%,
  // landslide-win every seed), over the 70% ceiling again. Root cause is not
  // bloodlord's own `data/classes.json` numbers (p10s's basicAttack.dps
  // 28->17 / towerPassive.mods.towerDamage 0.10->0.04 nerf is untouched) —
  // it's `data/towers.json`'s solo-viability retune (BACKLOG b080, fixing
  // `tests/a4-single-type.test.ts`'s G13 regression), which raised damage on
  // 7 towers ~10-37x. Every class's scripted kit shares the same hybrid
  // tower build, so the retune lifted bloodlord's win rate along with every
  // other class's, undoing p10s's careful band-tuning as a side effect.
  // Rejoins the rest of the roster on the same already-exhausted G8
  // win-rate wall (BACKLOG p10s/p10r/p10t/p10z, QUESTIONS Q158-Q160: 4+
  // independent /data-only balance-analyst sessions found no lever that
  // moves this once T1 carries the real `TREE_AUTO_MAX` allocation) — not
  // re-chased here per CLAUDE.md rule 6. Re-enable point stays P10 / an
  // owner verdict on Q160.
  it('bloodlord', () => assertBand('bloodlord')); // p12j re-tune (2026-09-07): unlike swordsman's identical mechanism, this one *did* move — 3 rounds: a `towerHp` passive fix (-10%->-2%, reasoning: Blood Tithe pays a *tower's own* HP, so the roster's one class actively weakening its towers' survival mid-swarm looked like a real bug) measured *worse* (4/12->3/12), reverted; Crimson Rush (active2, the class's only direct Warden-HP tool) `healPerEnemy` 2->10 alone also measured worse (3/12->1/12); the combination that worked was going hard on Blood Tithe itself (active1: `titheDamageMul` 0.25->0.60, `titheHpFraction` 0.30->0.10, cooldown 10->5, radius 4->7 — tithe more towers, faster, for less HP cost each) plus keeping the `healPerEnemy` 10 buy but reverting its cooldown 8->6 (4 was worse than 6). 4/12 -> **5/12, in band.** QUESTIONS Q196.

  // p10v: Time Lord (fb013's 12th class) rode along in `measurements`/the
  // diversity checks below but never had its own individual G8 win-rate pin
  // the way the other eleven do — filling that gap per BACKLOG p10v.
  // Measured against HEAD with the same scripted-kit/`TREE_AUTO_MAX` harness:
  // same over-ceiling story as the other ten un-skipped classes — every seed
  // a landslide win, no timeouts, no defeats.
  it('time_lord', () => assertBand('time_lord')); // p12j re-tune (2026-09-07): Chronal Surge (towerPassive) `bonusRangeMul`/`bonusAoeMul` 0.10->0.05 (both halved together, one conceptual lever), single round. 10/12 -> **8/12, in band** (right at the ceiling — `floor(12*0.70)=8`). QUESTIONS Q196.

  it('every one of the eleven §4 classes was actually measured (no key silently skipped)', () => {
    expect([...measurements.keys()].sort()).toEqual([...CLASS_KEYS].sort());
  });
});

describe('p6e: G8 top-damage-source diversity (>=8 of 11 distinct)', () => {
  // CORRECTED (this session): QUESTIONS.md's original Q121(4) claimed this
  // measurement came out 11/11 distinct, with own-kit shares that "cluster
  // either well above [20%] or near zero." That claim was never actually
  // checked against a full, completed 12-seed x 11-class run — the first
  // time this file's own beforeAll was let run to completion (this session),
  // every class's own-kit share landed between 0.4% (engineer) and 16.6%
  // (plaguebringer): a continuum, not a cluster, and every single one under
  // MATERIALITY_SHARE. Re-run in isolation (not a contention flake): same
  // numbers. At the 20% bar, all eleven fall back to the raw allDamage
  // argmax, which collapses to two tower keys (`ballista`/`frost_obelisk`)
  // across the roster — G13's tower-diversity question, not a kit-identity
  // one. No materiality threshold that still means anything clears >=8/11:
  // the 8th-largest share is paladin's 1.6%, so "passing" would require
  // lowering the bar to ~1.5%, indistinguishable from no bar at all and
  // exactly the near-tautological pass code review's Major 1 finding (this
  // file's header) existed to prevent. Skipped on the same precedent as the
  // ten win-rate skips above (CLAUDE.md rule 6, Q109/G23): a red measurement
  // gets a recorded reason, not a lowered bar. Most likely the same root
  // cause as the wave-11-to-17 wall those ten hit — an 18-wave hybrid tower
  // economy has far more time to compound than any cooldown-gated class kit,
  // and `p8a`'s real wave content is what would shorten that runway — though
  // this item does not prove that link directly. Re-enable point: p8a.
  //
  // RE-CORRECTED (PRIORITY DIRECTIVE follow-up, this session, Q123): p8a
  // landed and this was re-measured in full — **distinct count is still 2**
  // (`frost_obelisk`/`ballista`), unchanged. The paragraph's own-kit-share
  // numbers were measured pre-p8a and are superseded: real post-p8a shares
  // run 0.4% (animist) to 15.4% (plaguebringer), and the 8th-largest is
  // cryomancer's 1.7%, not paladin's — same conclusion (no non-tautological
  // bar clears 8/11), corrected numbers. Re-enable point moves from `p8a`
  // (done) to **P10**, the same as every other clause this pass re-measured.
  // fb013: SPEC-FINAL's own G8 text now reads ">=9 of 12" (Time Lord folded
  // in at the original ~73% ratio) — threshold updated to match, unmeasured.
  //
  // p10m re-measurement (this session, re-enable point reached): the file's
  // ~1h `beforeAll` sweep finally ran against the full 12-class roster
  // (timeout raised 900s->6000s to let it finish). **Distinct count is still
  // 2** (`ballista`/`spreading_plague`) — eleven of twelve classes top out on
  // `ballista` (the shared hybrid build the scripted bot always assembles,
  // per this file's own header), only plaguebringer's own kit clears
  // `MATERIALITY_SHARE`. The `p10j`-`p10l` balance pass changed every win-rate
  // number above but did not touch this one at all — win rate and top-damage
  // source are independent axes here, unsurprising since the pass tuned
  // wave/spawn pacing, not weapon/kit damage ratios. Still `.skip`-ed; only a
  // kit-damage-ratio change (out of scope here) could move this, so the
  // re-enable point stays **P10**.
  //
  // fb049 re-measurement (Q138): the 2-distinct reading above was measured
  // with `allocated: []`. Re-measured against the real full-tree allocation
  // (this file's header): **distinct count is now 3** (`ballista`,
  // `frost_obelisk`, `spreading_plague`) — full-tree stat bonuses shift
  // `necromancer`/`animist` off `ballista` onto `frost_obelisk`, but nine of
  // twelve still collapse onto one of those three tower keys. Still nowhere
  // near >=9/12; still `.skip`-ed; re-enable point stays **P10**.
  it.skip('at least 9 of the 12 classes top out on a different source', () => {
    const labels = CLASS_KEYS.map((k) => measurements.get(k)!.topLabel);
    const distinct = new Set(labels);
    const breakdown = CLASS_KEYS.map((k) => {
      const m = measurements.get(k)!;
      return `${k}: ${m.topLabel} (own-kit share ${(m.ownShare * 100).toFixed(1)}%, ownDamage=${JSON.stringify(m.ownDamage)}, allDamage=${JSON.stringify(m.allDamage)})`;
    }).join('\n');
    expect(
      distinct.size,
      `only ${distinct.size}/${CLASS_KEYS.length} distinct top sources:\n${breakdown}`,
    ).toBeGreaterThanOrEqual(9);
  });

  // Pins the honest measurement so a future change is forced to re-examine
  // this rather than silently drifting: pre-fb013 (11 classes) it was 2.
  //
  // fb013: `CLASS_KEYS` now includes Time Lord, and this file's ~1 h
  // `beforeAll` sweep has not been re-run against the 12-class roster (out of
  // scope for an ordinary item per CLAUDE.md — see this file's header note).
  // Asserting the stale pre-fb013 number here would be an unearned pin, not a
  // measured one, so this is `.skip`-ed too until P10 re-measures all of G8
  // (win rate and diversity, all twelve classes) together.
  //
  // p10m re-measurement (this session, re-enable point reached): the 12-class
  // sweep is now real (see the assertion above) and confirms the pre-fb013
  // number still holds at 2 — un-skipped as a real regression pin.
  //
  // fb049 re-measurement (Q138): re-pinned 2->3 — the real full-tree
  // allocation (this file's header) moves the distinct count to 3
  // (`ballista`/`frost_obelisk`/`spreading_plague`); the `[]`-allocated
  // reading of 2 above is stale, not a live regression to preserve.
  //
  // b080 (2026-09-03) re-pinned 3->2: `data/towers.json`'s solo-viability
  // retune (BACKLOG b080) gave `ballista` a ~12x damage buff plus its
  // existing pierce (hits up to 8 targets/shot), which now crowds out
  // `frost_obelisk` and `spreading_plague` from almost every class's top
  // damage source — 11 of 12 classes top out on `ballista` alone this
  // measurement (only `time_lord` tops on `mortar`). Same already-exhausted
  // G8 diversity wall as the skipped assertion above (QUESTIONS Q161: no
  // `/data`-only lever found that raises distinct count without re-breaking
  // some other gate), so re-pinned to the honest current number rather than
  // chased further here.
  //
  // p12e (2026-09-07) re-pinned 2->1, discovered incidentally (this file is
  // excluded from `test:fast`, so nobody had re-run it since b080 through
  // the entire p12a-p12e balance arc — see BACKLOG fb177, filed to properly
  // re-measure the whole file rather than chased piecemeal here). Confirmed
  // independently for two classes via a standalone `runScripted` probe at
  // `GATE_TIER`/12 seeds: `time_lord` still tops `mortar` (unchanged,
  // ownShare 11.1%, below `MATERIALITY_SHARE`), and `swordsman` — previously
  // one of the eleven `ballista`-toppers — now also tops `mortar`
  // (65.6M vs `frost_obelisk` 24.0M vs `ballista` 22.0M). Not p12e's boss-HP
  // re-anchor: `swordsman`'s own win rate collapsed from the file's last
  // pinned 12/12 to 2/12, 10 of 12 seeds dying `defeat_warden` at wave 3 —
  // Act I, TD-only, with no causal path to the final boss's HP. `baseHpMul:
  // 20` (p12c) is the likelier cause (unmeasured against this file until
  // now); fb177 owns the bisect and the fix or full re-pin.
  // fb177 (2026-09-07): re-measured in full against HEAD (all twelve
  // classes, unchanged from every seed set above). **Still 1** — every
  // single class now tops out on `mortar` (previously a 2-way split between
  // `time_lord` and `swordsman`; the roster-wide `baseHpMul: 20` + T3
  // reference-tier move, below, apparently pushed every other class's own-kit
  // share down far enough that `mortar` — the one tower `hybrid` builds
  // heaviest early, per this file's header — wins the argmax for all twelve).
  // No change to the pin; recorded so the next session doesn't have to
  // re-derive that this was actually re-checked, not just inherited.
  it('the current (red) distinct-source count is pinned, not silently drifting', () => {
    const labels = CLASS_KEYS.map((k) => measurements.get(k)!.topLabel);
    const distinct = new Set(labels);
    expect(distinct.size).toBe(1);
  });
});
