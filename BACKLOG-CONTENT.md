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

- [ ] (c002) [balance] **SKIPPED 2026-09-03, blocked on the Q161 owner
      verdict. Control half measured in session 2 (see the Log); the tune
      half is not started, and this item's own premise needs revisiting
      first.** G8's diversity clause has no item scoped to it.
      STATUS.md: "top damage source is still only 2 distinct keys
      (`ballista`/`spreading_plague`) across all 12 classes, far under the
      >=9/12 the gate asks for", and win-rate retunes (p10s) moved nothing
      because towers, not kits, do the winning. Raise kit damage share in
      `data/classes.json` only (the win-rate half is main-lane p10r).
      Acceptance: a lane-owned test measures the top damage source per class
      over >=12 seeds and reports the distinct-key count before and after, as
      a control-run pair per CLAUDE.md's measurement rules; the count rises
      and no class leaves the 35-70% band it is already in - refs: §14 G8, §4.

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

- [ ] (fb062) [feat] normal priority: pin down and enforce Poison Barrel's
      every-second poison mechanic regardless of current code: every 1s
      tick, every enemy inside gets one Poison application seeded by the
      skill's `damage` field (120% of `damage` over 3s, stacking cap 3,
      refresh-shortest per SPEC-FINAL §3); the barrel deals zero direct
      damage of its own (ignores armor, no lifesteal, counts as character
      DoT for Spreading Plague and Poison Boost's doubling); entering
      mid-duration applies at the next tick, leaving stops new
      applications but running stacks finish normally; cadence stays 1s
      across `fb061`'s charge-duration range. Acceptance: a unit test
      places one enemy in the barrel for its full duration and asserts one
      application per second, stack cap 3, total damage matching the
      formula; a second test asserts zero normal damage/lifesteal from the
      barrel; a tooltip text test matches the owner's sentence-form
      wording with live numbers — refs: SPEC-FINAL §4.1 (Plaguebringer),
      §3 (Poison), owner feedback `feature-poison-barrel-mechanic`.

### Recently completed

- (c041) [polish] **DONE 2026-09-07** — c018/c019's summon-cooldown headroom numbers (Engineer
- (c040) [balance] **DONE 2026-09-07** — `c033` measured only the **damage-source** half of
- (c039) [balance] **DONE 2026-09-07, negative result, no `/data` change** — `c033`'s pairwise fingerprint measurement (2026-09-07,
- (c038) [polish] **DONE 2026-09-07** — the roster size (12 classes) is a **hardcoded
- (c037) [bug] **DONE 2026-09-07** — `c036`'s same-stat-key stacking check has a twin gap on the
- (c036) [bug] **DONE 2026-09-07** — equipment-sourced and class-tower-passive-sourced bonuses on the same stat
- (c035) [bug] **DONE 2026-09-07** — the three Swordsman-locked equipment items' off-class fallbacks are proven
- (c034) [bug] **DONE 2026-09-07** — `p12a`'s kit re-anchor (up to x3 on absolute kit-damage magnitudes) was
- (c033) [balance] **DONE 2026-09-06** — G8's diversity clause was rewritten by BALANCE DIRECTION v2 §D (owner
- (c032) [bug] **DONE 2026-09-06** — `kitPowerMul`'s reach across the kit is asserted nowhere in this lane, for the

Full text for these and all earlier completions: `docs/BACKLOG-DONE.md`.
