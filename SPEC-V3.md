# STONEWAKE — SPEC v0.3 "Owner's Systems Pass"

**Status:** for build. **Precedence: SPEC-V3 > SPEC-V2 > SPEC.md.** This version
transcribes the owner's design workbook (lidl_game.xlsx, 2026-08-25) and the owner's
problem list. Where V3 is silent, V2/V1 still apply. ⚖ = tune against §12 gates.
Anything the workbook leaves open is marked **[owner-decision]** — implement the
stated default and log in QUESTIONS.md.

## 0. What V3 supersedes (migration map)

| Area | Was (V1/V2) | Now (V3) |
|---|---|---|
| Run shape | 3 Day/Night cycles, Dusk picker, Dawn Rekindle | **Interleaved waves: 3 TD waves, then 1 VS wave, repeating** (§1). Dusk picker, Rekindle/Leave, soul persistence: **cut**. |
| VS weapon math | Highest tier + 8%/duplicate; Veterancy; Bonds | **Owner's averaged formula** (§5). Veterancy/Bonds: **parked** (QUESTIONS, not built). |
| Armor | `armor/(armor+50)` | **Flat = percent, cap +99, uncapped negative** (§2). |
| Stat stacking | Mixed additive | **All sources multiply** (§2). |
| Ailments | Ad hoc burn/poison/chill | **Damage-type taxonomy** (§3). |
| Towers | 3 tiers, ×1.6 dmg | **Per-tower upgrade tracks, +10% default steps + milestone specials, flat step cost, sell 50%** (§4). |
| Equipment | Sigil/Plate/Charm/Arms/Greaves/Band + 12 uniques | **weapon/armor/shoes/ring/necklace/bracelet + owner's 12-item set** (§7). V2 uniques: parked. |
| Meta currency | Ember→levels→points; 3 Orbs | **Skill point per VS wave cleared; equipment loot per TD wave cleared. Orbs: deleted** (§8). |
| Pathing | Full block rejected (path-guarantee) | **Sealing allowed; enemies breach** (§9). |
| Classes | 1 active + passive + affinity | **Archetype stats + Passive + Active1 + Active2 + Tower-passive; combo rules; mouse-aimed skills** (§6). Swordsman/Plaguebringer replaced by owner kits; other 9 run legacy kits flagged `legacy:true` until redesigned. |

## 1. Run structure — interleaved waves

- Default pattern: **TD, TD, TD, VS — repeating**. A "cycle" = that 4-wave block.
- Run v0.3 ⚖: 18 TD waves + 6 VS waves (VS after waves 3/6/9/12/15/18). Gatebreaker
  = TD wave 18; **final VS wave ends with the Warden-Eater**.
- **Multi-summon:** during a TD wave or build phase the player may call the next TD
  wave(s) early and **stack up to 3 TD waves at once** ⚖. Stacked waves spawn
  concurrently; early-call gold bonus (V1 rule) applies per wave called.
  VS waves cannot be stacked or skipped.
- VS wave: survive **75 s ⚖** (final VS wave: until boss dies). Director budget per
  VS wave scales with wave index and inherits warmup/leak coupling (V2 §1 leak rule
  stays: TD leaks feed the *next* VS wave's budget).
- Between waves: 20 s build phase (unchanged). During VS waves: building disabled;
  towers are inert but present (§5); character moves freely.
- Transitions are instant mode-switches with a 2 s visual sweep — no picker screens.
- XP/level-ups occur **only during VS waves** (owner rule, §2); boons/levels persist
  for the run.

## 2. Core combat math (owner rules)

- **HP** = 0 → death. Character death → defeat Results (V2 D1 flow).
- **Attack** = damage per hit. **Attack speed** = attacks/second. **Movement** =
  distance/second. **Range** = attack distance. **Area**: effect radius multiplier
  applying to *every* attack, active, and effect.
- **Defense (armor):** flat points = percent reduction of normal damage. Cap **+99**
  (=99% reduction). **Uncapped below zero**: −90 armor = +90% normal damage taken.
  Ailment (dot) damage ignores armor unless stated (burning shreds armor, §3).
- **Stacking rule:** all boosts from different sources **multiply** (10% + 20% atk
  speed → ×1.1×1.2). Same-source ranks add within the source, then multiply out ⚖.
- **Lifesteal:** heals from **normal damage** dealt, no per-second cap. (VS tower
  attacks count as character attacks (§5), so they lifesteal.)
- **Life regen** per second. **EXP only in VS waves**; each level = an upgrade choice.

## 3. Damage types & status (owner taxonomy — `data/damagetypes.json`)

| Type | Rule (verbatim intent) |
|---|---|
| Normal | Basic damage; reduced by armor. |
| Bleeding | Each application: 1 dmg/s for 5 s. Applications stack independently ⚖ (perf cap 50 stacks/enemy ⚖). |
| Poison | DoT totalling **120% of the triggering damage over 3 s**. |
| Toxic | DoT totalling **180% of the triggering damage over 9 s**. |
| Burning | Each application: 1 dmg **and −1 armor** per second for 3 s; both effects are AoE around the victim (r1 ⚖). Armor shred exploits §2's uncapped negative armor. |
| Electric | Deals its damage in a small AoE (r0.8 ⚖) inherently. |

Composite attacks may split types, e.g. electric tower `normal:electric = 1:1`,
poison tower `1:1` → `1:1.5` upgraded (§4). Status: **frozen** — cannot move 3 s,
+30% damage taken; **frost** — −30% attack speed and move speed for 3 s.
Owner's V2 chill-stack model is replaced by frost/frozen. [owner-decision: DoT
transfer/refresh rules beyond Plaguebringer's passive — default: independent stacks.]

## 4. Towers v3 (`data/towers.json` rework)

Model: each tower has HP, defense, and its own **upgrade count**; each upgrade =
**+10% HP, Attack, Defense** unless a milestone special is listed; **upgrade cost is
flat per step (does not grow)** ⚖; **sell refunds 50% of total spent** (build +
upgrades). Owner-specced towers (authoritative; migrate the other 7 to this model
with proposed tracks logged to QUESTIONS.md for owner sign-off):

| Tower | Profile | Upgrades | Milestone specials | VS-mode special (§5) |
|---|---|---|---|---|
| **Arrow** | low dmg, high range, high atk speed, pierce 1, no AoE, normal type, 1 projectile, medium HP/def, low cost | 5 | +1 pierce @3 · applies 1 Bleeding @4 · +1 projectile (same path) @5 | none |
| **Electric** | medium dmg, high range, medium speed, `normal:electric = 1:1`, medium HP/def, high cost | 3 | @3: the electric portion chains to the nearest other enemy (visual arc, no normal damage in the chain); if no other target, it applies twice to the first | **All electric towers are wired to each other; enemies crossing any wire take normal damage every 0.5 s** |
| **Poison** | low dmg, high range, high speed, small AoE, `normal:poison = 1:1`, medium HP, low def, low cost | 4 | +1 projectile @2 · poison ratio → 1:1.5 @4 | **Character leaves a poison trail every second dealing 0.1× the tower's attack** |

## 5. VS-stage tower mechanics (owner formula — replaces all prior Sundering math)

During a VS wave the character **wields every built tower type's attack**:
- Fires with that type's **attack speed**, **special effects**, and the **highest
  upgrade level's effects** present among towers of that type.
- Damage = **average damage across that type's towers (each at its own upgrade
  level) × (1 + 10% × tower count of that type)**.
- Worked example (ships verbatim as unit test C2): 1× lv1 arrow + 2× lv3 arrow +
  1× lv1 poison → arrow VS damage = `(1×lv1 + 2×lv3) / 3 × (1 + 10%×3)`, with the
  @3 upgrade's +1 pierce active; poison computed the same way over its own towers.
- **Towers do not attack during VS waves.** They remain on the field as solid
  obstacles, keep their HP (enemies may attack them), and contribute their per-type
  VS special (§4 last column).
- These attacks **count as character attacks**: they scale with character stats
  (Power/atk speed/area per §2 stacking), trigger lifesteal, and count for
  on-attack passives (e.g., Thousand Cuts).
- No weapon-slot cap in v0.3 [owner-decision if type count grows unwieldy].
- UI: weapon panel shows per-type lineage — "Arrow ×3 (avg 14.2, +30%) — pierce 2".

## 6. Classes v3

**Framework:** every class defines an archetype stat block (attack range / damage /
speed / AoE flag / move speed as low·medium·high bands mapped in
`data/classes.json` ⚖), one **Passive**, **Active1** (Q), **Active2** (E), and one
**Tower passive** (always-on aura for towers; explicitly effective during VS waves
where stated). Actives may be **mouse-aimed** (new input path) and may **combo**
(one active usable during another, with defined interaction). All actives remain
sim Commands.

**Swordsman** (owner spec, replaces V2 kit): high dmg/speed/move, low range, AoE
attacks. Passive *Thousand Cuts*: **every attack applies 1 Bleeding — each damage
instance from actives counts as one attack**. Active1 *Circle Slash*: chargeable
self-centered slash; longer charge = more damage, radius, knockback; **effect caps
but charge time is unlimited** ⚖ (cap at 3 s-equivalent). Active2 *Dash Slash*:
dash toward the mouse, slashing everything on the path; **usable during Circle
Slash charging** — the dash's hit range widens by the current charge radius and
both damages merge into **one** attack (one Thousand Cuts application per enemy).
Tower passive *Wind Slash*: all towers +10% attack speed, **effective in VS stage**
(raises his wielded-attack speeds).

**Plaguebringer** (owner "Poison" spec, replaces V2 kit): high range, low dmg,
medium speed/move, no AoE on basic. Passive *Spreading Plague*: **when an enemy
dies with unfinished DoT damage, the total unfinished amount is dealt once to the
nearest enemy**. Active1 *Poison Barrel*: ground circle for 5 s applying poison
damage each second. Active2 *Poison Boost*: **doubles the remaining poison damage
on all enemies**. Tower passive: all towers +10% poison damage.

Other 9 classes: keep current kits, flag `legacy: true`, surface a "legacy kit"
badge. Redesigning them to this template is **owner+designer work, not agent work**
— the agent proposes nothing beyond QUESTIONS.md notes.

## 7. Equipment v3 (`data/equipment.json` rework)

Slots: **weapon, armor, shoes, ring, necklace, bracelet.** Stat columns: HP /
Attack / Defense (flat adds) and attack-speed / move-speed (**multipliers**).
Conditional effects support class checks with fallbacks ("if not Swordsman: …").
Owner's starting set (authoritative, verbatim):

| Item | Slot | HP | Atk | Def | AtkSpd | Move | Effect |
|---|---|---|---|---|---|---|---|
| Greatsword | weapon | 0 | 10 | 5 | ×0.9 | ×1 | — |
| Sleeve Sword | weapon | 0 | 5 | 0 | ×1.2 | ×1 | Circle Slash needs no charge and fires at max-charge effect; if not Swordsman: atk speed ×1.2 again |
| Normal Armor | armor | 10 | 0 | 10 | ×1 | ×1 | — |
| Swordsman Armor | armor | 5 | 5 | 5 | ×1.1 | ×1 | Circle Slash charge speed scales with attack speed; with Sleeve Sword equipped, Circle Slash damage scales with attack speed instead; if not Swordsman: atk speed ×1.5 |
| Normal Shoes | shoes | 5 | 0 | 5 | ×1 | ×1.5 | — |
| Swordsman Shoes | shoes | 3 | 3 | 3 | ×1.1 | ×2 | Dash Slash distance doubled; if not Swordsman: move ×1.1 |
| Normal Ring | ring | 1 | 1 | 1 | ×1 | ×1 | +1 life regen |
| Bleeding Ring | ring | 0 | 2 | 1 | ×1 | ×1 | +0.01% lifesteal; lifesteal now also applies to Bleeding damage |
| Normal Necklace | necklace | 1 | 1 | 1 | ×1 | ×1 | EXP +20%; tower upgrade cost −20% |
| Builder's Necklace | necklace | 1 | 0 | 2 | ×1 | ×1 | All towers +1 flat attack (boostable by upgrades / VS count multiplier) |
| Normal Bracelet | bracelet | 1 | 1 | 1 | ×1 | ×1 | Character and tower **area** +10% |
| Sniper Bracelet | bracelet | 2 | 1 | 0 | ×1 | ×1 | Character and tower **range** +10% |

Parked idea [owner]: classes wearing multiple items of one slot. V2's unique list:
parked. Relic affix generation: parked — v0.3 loot draws from this fixed table ⚖.

## 8. Rewards & meta (owner rules)

- **Each TD wave cleared → 1 random equipment** from §7's table (weighted ⚖),
  granted **at run end** (win or lose ⚖ [owner-decision: default = also on defeat,
  for waves fully cleared]).
- **Each VS wave cleared → 1 skill point** for the Constellation, granted at run
  end. Skill points replace the Ember→level→points pipeline; **Ember is retired**
  [owner-decision: default = existing Ember converts 100:1 to skill points once].
- **Orbs: deleted entirely** — drops, stash tab, crafting UI, quest references.
  Keep relic/equipment persistence and the stash.
- Class/map/tier unlock quests remain but no longer award currency, only unlocks.

## 9. Pathing v3 — sealing the Core is allowed

- Remove the path-guarantee rejection. Structures become **high-cost passable**
  tiles in the enemy cost field (cost ∝ structure HP × toughness ⚖).
- Consequence, matching the owner's description: if any open path exists it is
  cheapest → enemies walk it (old behavior). If the Core is fully sealed, enemies
  take the cheapest breach route and **attack the structures in their way** until
  they reach the Core.
- Fliers/burrowers/wraiths keep their bypasses. Bombers keep 3× vs structures.
- Turtle economics must stay honest: gate C5b — a full-seal build's win rate at T2
  may not exceed the best open-maze build's by more than 10 points.

## 10. Tooling, dev mode & defects (owner problem list)

| # | Item | Requirement |
|---|---|---|
| T1 | **Range indicators** | Placement ghost shows attack-range ring + AoE preview; selected tower shows its ring; character skill ranges (Circle Slash radius at current charge, Dash path, Poison Barrel circle) render while aiming/charging. |
| T2 | **Selection feedback** ("click has no reaction") | Clicking any tower/enemy/character selects it: highlight + range ring + stats panel. Click empty ground deselects. Hover shows a light outline. If this misreads the owner's report, log to QUESTIONS.md and ask. |
| T3 | **Dev profile default** | `data/dev.json` `devMode: true` in development: all classes/maps/tiers unlocked, 999 skill points, stash pre-filled with every §7 item, all quests complete. Settings toggle to switch to a clean profile. Production builds default devMode **off** (QUALITY 1.0 bar). |
| T4 | **God mode** | Practice-run toggle: character and Core take no damage. Ordinary Command, replay-flagged like other practice tools. |
| T5 | **Codex & Tuner** (in-game wiki + parameter editor) | A Hub page listing **every** class, tower, equipment, damage type, enemy, and wave with live stats read from `/data` + schemas. In dev mode every numeric/enum field is **editable**, including wave composition/counts; **Save** persists to the real `/data/*.json` via a Vite dev-server endpoint (dev only — browsers cannot write files in production; prod shows read-only Codex + Export/Import JSON). Edits apply from the next run; a run started after unsaved live edits is flagged like practice. Schema validation on save; invalid edits rejected inline. |
| T6 | **Delete Orbs** | Per §8. Migration removes orbs from saves cleanly. |

## 11. Immersion note

V2 §9 stands, re-aimed: the 2 s TD↔VS sweep, per-type lineage labels (§5), and
class barks stay on the roadmap after systems land.

## 12. Acceptance gates C (add to A/B suite; retire B9, B11, and B-gates tied to the Dusk picker/Rekindle — log each retirement)

| # | Gate |
|---|---|
| C1 | Wave interleave: pattern TD×3→VS holds; multi-summon stacks ≤3 TD waves and pays each early-call bonus; VS waves cannot be stacked. |
| C2 | VS damage formula unit tests, including the owner's worked arrow example verbatim. |
| C3 | Armor math: +99 → 99% reduction; +150 input clamps to 99; −90 → ×1.9 damage taken; DoTs ignore armor except Burning's shred lowers it. |
| C4 | Stacking: two 10%/20% same-stat sources from different origins produce exactly ×1.32. |
| C5 | Sealing: fully sealed Core → enemies breach and damage structures en route (structure damage > 0, Core eventually reached with no towers defended); any open path → zero structure-chewing by pathing (non-Bomber, non-blocked). **C5b** turtle-dominance band per §9. |
| C6 | Tuner round-trip: edit a value in the Tuner → save → reload → sim uses it (config-hash change acknowledged; determinism holds per config). Invalid value rejected. |
| C7 | Rewards: N TD waves cleared → N equipment at Results; M VS waves → M skill points; orbs appear nowhere (grep-level UI test + save migration test). |
| C8 | Dev mode: dev build has everything unlocked; `npm run build` output has devMode off. |
| C9 | Swordsman combo: Dash during charged Circle Slash merges into one attack with widened range; each struck enemy receives exactly one Bleeding application. |
| C10 | Plaguebringer: enemy dying with unfinished DoT deals exactly the unfinished total to the nearest enemy, once. |
| C11 | Legacy classes still complete a run (smoke), badge visible. |

## 13. Migration order (rewrite BACKLOG.md to this)

1. **M17** Reconcile: audit code vs V3, write MIGRATION.md (built / superseded /
   conflicts), retire dead tests with logged reasons, rewrite BACKLOG. 
2. **M18** Quick wins: T6 orbs removal, T3 dev profile, T4 god mode, T1/T2
   indicators & selection. Gates: C7, C8, part of C5-prep.
3. **M19** Combat math + damage types (§2–§3). Gates: C3, C4.
4. **M20** Tower model v3 + the three owner towers; migrate remaining seven with
   QUESTIONS proposals. Gate: data tests.
5. **M21** VS formula + inert-towers-with-specials (§5). Gate: C2.
6. **M22** Interleaved run structure + multi-summon (§1). Gate: C1.
7. **M23** Classes: framework (two actives, mouse aim, combos) + Swordsman +
   Plaguebringer; legacy flags. Gates: C9, C10, C11.
8. **M24** Equipment v3 + rewards pipeline (§7–§8). Gate: C7 full.
9. **M25** Pathing v3 sealing. Gate: C5, C5b.
10. **M26** Codex & Tuner. Gate: C6.
11. **M27** Sweep: all surviving A/B + all C gates green; regenerate HANDOFF;
    QUALITY Alpha re-check.

## 14. Open decisions (defaults live, owner may override)

1. Run totals: 18 TD + 6 VS waves; VS wave 75 s.
2. Defeat still pays loot/points for waves fully cleared.
3. Ember one-time 100:1 conversion, then retired.
4. Bleeding stack cap 50/enemy for performance.
5. V2 systems parked (not deleted): Bonds, Veterancy, uniques list, Dusk picker —
   revisit after v0.3 plays well.
