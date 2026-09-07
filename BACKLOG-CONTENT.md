# BACKLOG-CONTENT.md — lane: content (branch `lane/content`)

Split out of BACKLOG.md on 2026-09-03; ids unchanged. Same item format,
working rules, verification tier (targeted tests + `npm run test:fast`) and
loop-mode contract as BACKLOG.md, plus CLAUDE.md's lane rule: up to TWO
items per iteration when both are small ([bug]/[polish] or data-only).
Everything touching shared sim core (balance orders, dash, density,
pathing, damage rules) belongs in BACKLOG.md, not here.

## Scope (hard boundary)

May create/edit ONLY:
- `src/sim/classes.ts` — class kits/tuning (note: the repo has no
  `src/sim/classes/` directory today; all kit code lives in this one file.
  Splitting it into a `src/sim/classes/**` directory is allowed, and that
  directory is then in scope)
- new files under `src/sim/` named for this lane's classes (e.g.
  `src/sim/madness-king.ts`, `src/sim/voltbolt.ts`)
- `data/classes.json`, `data/equipment.json`
- `tests/class-*`, `tests/equip-*`
- this file
- `PROGRESS.md` — not a lane file, but CLAUDE.md working rule 4 requires it be
  updated "at every phase gate and before any stop", which every lane loop hits.
  Named here so the next loop does not re-adjudicate it (code review, c014).

Read anything. Everything else is read-only: an out-of-scope need is
written into this file (a new dated Queue subsection) and becomes
main-lane (or other-lane) work at the merge — never edited from this lane.

## Queue

> **Completed work has moved.** Done items and fully-closed historical
> sections now live in `docs/BACKLOG-DONE.md` (append-only, one section per
> backlog file, in original order). Read it when an item references old
> history; day-to-day work only needs the open items below plus the last 10
> completions. `tools/status.ts`'s feedback ledger reads the archive too, so
> nothing drops off STATUS.md's ledger.

### Actionable in this lane

- [x] (fb180) [polish] **DONE 2026-09-07.** token economy (fb178, main lane):
      this file was well past the 400-line budget fb178 set for live backlog
      files. Every `[x]` item from the Queue (c001-c041, all Done/Skipped/
      Blocked by the time this ran) plus the entire `## Log` section moved
      verbatim, in original order, to `docs/BACKLOG-DONE.md` under a new
      `## BACKLOG-CONTENT.md` heading — the same treatment fb178 itself gave
      `BACKLOG.md`. Kept live, full text unchanged: the `## Scope` section;
      the three still-blocked/skipped in-lane items (`c004`, `c002`,
      `c010`) and the five still-blocked owner items (`fb056`, `fb057`,
      `fb059`, `fb061`, `fb062`); a new `### Recently completed` list of
      the last 10 done ids (`c032`-`c041`) as one-liners.
      `tools/status.ts`'s `backlogPaths()` already reads
      `docs/BACKLOG-DONE.md` (fb178), so every feedback-ledger citation for
      an id now living in the archive still resolves — verified via
      `npx vitest run tests/fb038-status.test.ts`. No `/src` or `/data`
      change — refs: feedback/feature-token-economy.md, BACKLOG.md fb178.

- [ ] (c004) [bug] **BLOCKED out of Scope 2026-09-03 — see the Log.** Animist's passive is missing half its SPEC-FINAL §4.2
      clause. §4.2's Animist row reads "aura effects also affect summons;
      **summon cap +1**"; `data/classes.json`'s Kinship row authors only the
      aura half (`"description": "Aura effects also affect summons."`,
      `mods: {}`), and the three summon-cap sites in `classes.ts` add only
      `classLineBonus`. Acceptance: a regression test spawns Animist spirits
      past the authored `summonCap` and asserts the live cap is
      `summonCap + 1` for the Animist and unchanged for Engineer/Necromancer;
      the +1 is expressed on the passive in `/data` rather than a class-key
      check in code - refs: SPEC-FINAL §4.2 (Animist).

- [ ] (c010) [balance] **BLOCKED out of Scope 2026-09-04 — see the Log.**
      Stormcaller *Conduction* is authored on the wrong row.
      The passive names a rule about electric damage *generally* ("+20% per
      jump, compounding, cap 8 jumps"), but its two numbers live only on
      `active1` (`chainGrowth`/`chainCap`), leaving the passive row prose with
      `mods: {}` and no `kind` — so Chain Surge is the only electric thing
      that compounds, and *Live Wire*'s "+10% of their damage as extra
      Electric" and the VS electric wire grid get none of it. Acceptance: the
      two numbers move onto the passive row in `data/classes.json` and
      `fireChainSurge` reads them from there (architecture rule 4: content
      shapes live in `/data`); G11's x3.6 ceiling
      (`tests/p6d-nine-classes.test.ts`) is re-measured unchanged as a
      control-run pair; whether *tower* electric should also compound is
      **logged for the main lane**, not implemented from here (`towers.ts`/
      `vsspecials.ts` are out of Scope) - refs: SPEC-FINAL §4.2, §14 G11.

### Blocked out of Scope (owner items, unchanged order)

- [ ] (fb056) [feat] top priority: add 15 class-specific equipment items to
      `data/equipment.json` and the loot table per the owner's full table
      (Plaguebringer set of 6: Plague Flask/Miasma Robe/Carrier's Boots/
      Ring of Contagion/Pestilent Locket/Blightweaver Band; Time Lord set
      of 6: Hourglass Scepter/Chronomail/Sandals of the Second Hand/Loop
      Ring/Pendulum Pendant/Bracer of Overlap; Swordsman set completion,
      3 more: Ring of a Thousand Cuts/Duelist's Pendant/Bracer of the
      Whirlwind) — full stat lines and effects as specified in the owner
      feedback file, each with an "if not <class>" basic-stat compensation
      line. Acceptance: all 15 items load, drop from the loot table, and
      equip; every effect line (including each set's headline synergy
      interaction and one "if not class" fallback per set) has a unit
      test; tooltips show sentence-form descriptions with live numbers;
      the Codex lists all 15 — refs: SPEC-FINAL §7 (equipment table, append
      rows), §8.1 (loot table), owner feedback
      `feature-class-equipment-sets`.

- [ ] (fb057) [feat] normal priority: new class #13, Madness King (visible
      roster, 4th alongside Swordsman/Plaguebringer/Time Lord) — full kit
      per the owner feedback file: Passive "Whispers" (3s madness on hit,
      cap 5 concurrent from the passive), Active1 "Mind Manipulation" (3
      charges, converts non-elite/boss targets to fight for the character
      until death/wave-clear, keeps a converted target's stacked
      speed/attack-speed madness bonus permanently; elite/boss branch: 3
      ticks of (their attack + character basic-attack) damage over 1s plus
      90% slow instead), Active2 "Spreading Madness" (r4 ⚖ AoE 10s
      madness), Tower passive "Frenzied Aim" (linear attack-speed ramp by
      proximity, max bonus = character's total attack-speed bonus +10% at
      point-blank). Madness status: mad enemy attacks nearest other enemy
      in r3 (or self + random-walk in r1 if none), +10%/+10% atk-speed/
      move-speed per madness attack, stacking, lost at expiry; elites
      never gain the movement change and keep normal pathing. Housekeeping:
      roster becomes 13 (SPEC-FINAL §4.2/§13 census, G8 diversity clause
      ->=10/13, Codex, dev profile, class-select, attack-sprite registry).
      Acceptance: tests per the feedback's "Done when" list (passive cap
      then-expiry, conversion fight/death/permanent-bonus-keep, elite
      3-tick+slow branch, Active2 targeting + self-attack fallback +
      stacking reset + elite movement exception, tower passive scaling
      formula, VFX registry entries for teammate/self attacks with visible
      ramp, replay determinism) — refs: SPEC-FINAL §4.2 (designer-fill
      addition), §13 (census), §14 (G8), owner feedback
      `feature-class-madness-king`.

- [ ] (fb059) [feat] normal priority: new class #14, Voltbolt (visible
      roster) — hitscan basic attack (normal damage type, no travel time);
      Passive "Arc" (basic attacks chain once more at 25% damage to the
      nearest not-yet-hit enemy in r3, applying on-hit effects, 0.1s
      delayed chain visual); Active1 "Lightning Ball" (thrown to cursor,
      lives 2.5s, fires the character's basic attack incl. passive/
      Overdrive chains at total attack speed, damage boosted by 25%
      efficiency of total move-speed bonus); Active2 "Overdrive" (5s: 3
      total chains at 25%/12.5%/12.5%, each basic attack during it adds
      +2.5%/+2.5% atk-speed/move-speed stacking additively per SPEC-FINAL
      §2, reset at expiry; end-of-duration normal-damage burst around the
      character scaled by move-speed bonus for damage and attack-speed
      bonus for radius); Tower passive "Lightning Accelerate" (+100%
      tower projectile speed; towers gain 50%-efficiency conversions of
      the character's total attack-speed and move-speed bonuses). Roster
      becomes 14 (G8 diversity ->=11/14, SPEC-FINAL §4.2/§13 census, Codex,
      dev profile, class-select, attack-sprite registry). Acceptance:
      tests per the feedback's "Done when" list (chain targeting/fallback,
      0.1s chain delay, Lightning Ball's attack-speed/move-speed-efficiency
      math, Overdrive's 3-chain pattern + additive stacking + reset, burst
      damage/radius scaling, tower projectile-speed/stat-conversion
      formulas, replay determinism, hitscan has zero travel time) — refs:
      SPEC-FINAL §4.2 (designer-fill addition), §13 (census), §14 (G8),
      owner feedback `feature-class-voltbolt`.

- [ ] (fb061) [feat] normal priority: Plaguebringer's Active1 Poison
      Barrel becomes a charge skill (same hold/release model as Circle
      Slash): hold up to 2s ⚖ charge, scaling cloud radius x1->x2 ⚖ and
      duration from a base 8s (up from 5s) to a 14s ⚖ max; poison per
      second unchanged; Active2 Poison Boost stays instant. Interacts with
      `fb062`'s cadence pin (must stay 1s regardless of charge level).
      Acceptance: hold/release works with a charge indicator ring; radius
      and duration scale with charge level per test; numbers land in
      `/data` only — refs: SPEC-FINAL §4.1 (Plaguebringer, amends), owner
      feedback `feature-plaguebringer-charge`.

### Closed 2026-09-07 — c002 superseded by BALANCE DIRECTION v2 §D

- **(c002) [balance] SUPERSEDED, not executed as written.** c002 was
  "SKIPPED 2026-09-03, blocked on the Q161 owner verdict" — QUESTIONS.md's
  Q161 entry now carries that verdict: "approved as evidence — resolved by
  BALANCE DIRECTION v2 §A/§D: kit-growth multiplier + re-anchored kit
  numbers close the own-kit-share wall this entry found, and G8's diversity
  clause is rewritten per §D to the own-kit-share target plus a pairwise
  fingerprint-distance check rather than the unreachable >=9/12
  distinct-top-source bar." c002's own acceptance text ("the top damage
  source per class... the distinct-key count rises") measures exactly the
  `>=9/12` clause the verdict retired — there is no live gate left for that
  metric to move. The `c032`-`c041` arc already did the real work the
  verdict's replacement clauses needed (own-kit-share target: `c032`/`c034`;
  fingerprint-distance check and its measurement method: `c033`/`c039`/
  `c040`; Bloodlord's specific wall: `c039`). Closed as superseded rather
  than executed — refs: QUESTIONS Q161, BALANCE DIRECTION v2 §D, c032-c041.

### Filed 2026-09-07 — fb062 cross-lane findings (not this lane's to fix)

- **Tooltip text (main-lane/UI-lane follow-up).** `fb062`'s third acceptance
  clause ("a tooltip text test matches the owner's sentence-form wording")
  cannot close from this lane: the sentence lives in `poisonBarrelSentence`
  (`src/ui/class-info.ts`), and `src/ui/**` is not in this lane's Scope. The
  shipped sentence ("Drops a 3-tile poison cloud dealing 2.4 damage/s for
  5s. ... Cooldown 7s.") names a flat continuous rate, not the real
  per-application/3s-window/3-stack-cap mechanic the fix below makes exact.
  `tests/class-poison-barrel-mechanic.test.ts` carries an `it.skip`
  documenting the exact current (wrong) string as the UI lane's repro.
- **`tests/p6e-class-diversity.test.ts` (main lane) — two live exact-count
  pins measured against the pre-fix, 2.5x-overshooting Poison Barrel; found
  by code-reviewer on the fix below.** Plaguebringer's own-kit VS-share
  count (pinned `0`, `:673`) is very unlikely to move — Plaguebringer was
  already measured far under the 35% floor (15.4%, per that file's own
  comment) and this fix only *shrinks* one of its two Actives' damage, which
  cannot newly cross a floor from below. The fingerprint-distance failure
  count (pinned `16/66`, `:711`) has no such margin visible and plausibly
  moved: Poison Barrel is one of Plaguebringer's two damage-share vector
  components, now ~40% of its former size. Re-measure both (or at least the
  second) the next time that excluded, ~100-minute suite actually runs,
  per CLAUDE.md's "a deferral is a measurement with an expiry date" rule —
  not re-run from here per working rule 8 (no gate/full-suite re-measurement
  outside a `[balance]` item or one whose acceptance is a gate
  re-measurement).

### Recently completed

- (fb062) [feat] **DONE 2026-09-07 (in-lane portion; tooltip filed above for
  the UI lane).** pin down and enforce Poison Barrel's every-second poison
  mechanic. Found and fixed a real bug while scoping it: `firePoisonBarrel`
  (`classes.ts`) seeded each application's dps with the raw character-scaled
  `damage` directly; since `combat.ts`'s `updateAreas` feeds that straight
  into a fixed 3s `applyPoison` stack, this delivered `seed x 3` per
  application instead of SPEC-FINAL §3's `seed x 1.2` (120% over 3s) — a
  2.5x overshoot. Fixed by routing the seed through `dotDpsFor`
  (`damagetypes.ts`), the exact conversion `cores.ts`'s Corpse-poison call
  site and `applyDamageType`'s own dot branch already use. New
  `tests/class-poison-barrel-mechanic.test.ts`: the corrected formula
  end-to-end through the real zone (regression-tested red pre-fix, measured
  36.0 vs the correct 14.4), the 1s cadence and 3-stack cap, zero direct
  damage/no lifesteal (both already true, now pinned), and one `.skip`-ed
  tooltip case documenting the UI-lane blocker above. code-reviewer
  REQUEST-CHANGES (one Major — the `p6e` staleness risk above, filed rather
  than fixed; one Minor — a stray scratch probe script deleted before
  commit; one Nit — the `poisonDef` fallback, confirmed dead code by QA
  since `content.ts`'s `REQUIRED_DAMAGE_TYPE_KEYS` makes the row mandatory
  at load). qa-playtester PASS: independently re-derived the magnitude from
  raw `/data`, confirmed Poison Boost/`active1PotencyMul`/Spreading Plague
  all interact correctly with the corrected (smaller) magnitude, and
  confirmed the zero/`poisonDef`-undefined edge cases are handled cleanly.
  `npx tsc --noEmit` clean; `tests/class-*`/`equip-*` (29 files, 1012 tests)
  and `npm run test:fast` green apart from the two pre-existing unrelated
  `q15`/`q45` failures — refs: SPEC-FINAL §4.1 (Plaguebringer), §3 (Poison),
  owner feedback `feature-poison-barrel-mechanic`.
- (c041) [polish] **DONE 2026-09-07** — c018/c019's summon-cooldown headroom numbers (Engineer
- (c040) [balance] **DONE 2026-09-07** — `c033` measured only the **damage-source** half of
- (c039) [balance] **DONE 2026-09-07, negative result, no `/data` change** — `c033`'s pairwise fingerprint measurement (2026-09-07,
- (c038) [polish] **DONE 2026-09-07** — the roster size (12 classes) is a **hardcoded
- (c037) [bug] **DONE 2026-09-07** — `c036`'s same-stat-key stacking check has a twin gap on the
- (c036) [bug] **DONE 2026-09-07** — equipment-sourced and class-tower-passive-sourced bonuses on the same stat
- (c035) [bug] **DONE 2026-09-07** — the three Swordsman-locked equipment items' off-class fallbacks are proven
- (c034) [bug] **DONE 2026-09-07** — `p12a`'s kit re-anchor (up to x3 on absolute kit-damage magnitudes) was
- (c033) [balance] **DONE 2026-09-06** — G8's diversity clause was rewritten by BALANCE DIRECTION v2 §D (owner

Full text for these and all earlier completions: `docs/BACKLOG-DONE.md`.
