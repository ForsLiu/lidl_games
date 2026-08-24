# STONEWAKE — Game Design Spec

**Version:** 0.1 (first complete draft) · **Doc owner:** Design · **Status:** for review
**Genre:** Tower Defense → Survivors-like hybrid, run-based, with ARPG (PoE-style) meta progression
**Platform/Scope v1:** PC web/desktop, single player, keyboard (WASD) + mouse, one map, ~25 min runs

> **Number convention:** every number in this doc is an initial value. Numbers marked ⚖ are free to tune to hit the targets in §10. Numbers **not** marked ⚖ are design constraints — change only with a spec revision.

---

## 1. Concept

**One-liner:** Build a tower-defense fortress by day. At nightfall your towers petrify into terrain and their souls bind to you as auto-firing weapons — the game becomes a Vampire-Survivors-style horde fight inside the maze you built. Your TD build *is* your Survivors build.

**Core loop (one run, ~25 min):**

```
Pick class + map tier
   → ACT I  "Daywatch"  — Tower Defense, 10 waves (~12 min)
   → SUNDERING          — towers petrify, souls become weapons (~1 min, interactive)
   → ACT II "Nightfall" — Survivors phase, 10 min + final boss
   → Results — Ember (meta XP), Relics, Orbs → meta screens → next run
```

**Design pillars:**

1. **One build, two games.** Every Act I decision (which towers, where, what tier) deterministically defines Act II (which weapons, what terrain, which auras). No decision is spent on only half the game.
2. **Placement is destiny.** The maze that routes enemies in Act I is the arena you kite through in Act II. Chokepoints become corridors; buff towers become shrines you fight around.
3. **Fast runs, deep meta.** Runs are disposable; the PoE-style layer (passive constellation, relic crafting, map tiers) is the long game — 局外成长.
4. **Deterministic and machine-testable.** Headless simulation, seeded RNG, fixed timestep. Every balance claim in §10 is an automated test. (Required for AI-driven iterative development.)

**Failure / victory:**
- Act I: Core HP reaches 0 → run ends (defeat, 40% ⚖ of accumulated rewards kept).
- Act II: Warden HP reaches 0 → run ends (defeat, rewards scaled by survival time).
- Victory: kill the final boss after the 10:00 survival timer → full rewards × map-tier multiplier.

---

## 2. Shared foundations

### 2.1 The Warden (player avatar, both acts)

One character, one stat sheet, powering both halves:

| Stat | Base | Effect (both acts unless noted) |
|---|---|---|
| Max HP | 100 ⚖ | Warden health. In Act I, enemies ignore the Warden unless blocked by them (they target the Core), but AoE/spitters can hit them. |
| HP Regen | 0.5/s ⚖ | Out-of-combat only in Act I; always in Act II. |
| Armor | 0 | Flat mitigation with diminishing returns: `reduction = armor / (armor + 50)` ⚖ |
| Move Speed | 4.5 tiles/s ⚖ | |
| Power | +0% | **Multiplies tower damage in Act I and weapon damage in Act II.** The unifying scaler. |
| Attack Speed | +0% | Tower fire rate (Act I) and weapon fire rate (Act II). |
| Area | +0% | Tower AoE radius and weapon AoE/size. |
| Cooldown Reduction | 0% (cap 40%) | Pulse/lob weapon cooldowns, dash cooldown. |
| Pickup Radius | 1.5 tiles ⚖ | Gold (Act I) and XP gems (Act II). |
| Luck | 0 | Rarity weighting for relic drops and level-up offers. |

- **Dash:** 1 charge, 4-tile ⚖ blink-step, 3 s ⚖ cooldown, brief (0.15 s) i-frames. Available in both acts.
- **Manual attack (Act I only):** weak class attack (~8 dps ⚖) so the Warden can personally plug a leak. Disabled in Act II (replaced by soul weapons).

### 2.2 Classes (3 at v1; 2 locked behind quests §8.4)

| Class | Trait | Signature tower (only this class can build it) | Manual attack |
|---|---|---|---|
| **Engineer** | Towers cost −10% ⚖; build range +1 | Tesla Coil | Thrown spanner |
| **Pyromancer** | Burn damage +15% ⚖; burns can spread (1 hop) | Ember Brazier | Firebolt |
| **Frost Warden** | Slows 10% ⚖ stronger; chilled enemies deal −10% ⚖ damage | Frost Obelisk | Frost jab |

### 2.3 Map (v1: one layout, "The Bastion Vale")

- Grid **36 × 20 tiles**, tile = 32 px. **3 spawn gates** (west, north, east edges), **Core (2×2)** near the east-center.
- Buildable tiles: all except gates, Core footprint, and a 1-tile border.
- Difficulty variety comes from **map tiers + modifiers** (§8.3), not extra layouts (v2).

---

## 3. ACT I — Daywatch (Tower Defense)

### 3.1 Rules

- Enemies spawn at gates in waves and path to the Core via **flow-field pathfinding**. Towers and walls **block movement** — mazing is intended and central (the maze becomes the Act II arena).
- **Path guarantee rule:** a placement that would leave any gate with no path to the Core is rejected (red ghost). *(Not ⚖ — core rule.)*
- **Counter-turtling enemies** exist: Burrowers tunnel under structures; Wraiths phase through them briefly (§6). A pure wall-off is never fully safe.
- The Warden walks the field. **Building/upgrading/selling only within 4 tiles ⚖ of the Warden** — positioning matters even in Act I. Build/sell is instant; sell refund 70% ⚖.
- Core: 500 HP ⚖. Leaked enemy deals damage = its Core-damage stat, then dies.
- **10 waves.** Between waves: 20 s build phase; pressing "Call next wave early" grants `2 gold × seconds skipped` ⚖.

### 3.2 Economy (Act I)

- Start: **250 gold** ⚖. Income: kill bounties (§6 table) + wave-clear bonus `50 + 10 × wave#` ⚖ + Harvest Sprouts.
- Gold is Act-I-only (does not carry to Act II; leftover gold converts to Ember at 10 : 1 ⚖ at results).

### 3.3 Towers (10 types)

Three tiers each. Upgrade costs: T2 = 75% of base cost, T3 = 125% of base ⚖. Per tier: +60% damage, +10% range ⚖ unless noted. Footprint 1×1 unless noted.

| # | Tower | Cost ⚖ | Act I behavior (T1 values ⚖) | Notes |
|---|---|---|---|---|
| 1 | **Palisade** | 10 | Wall. 300 HP, no attack. Enemies attack blocking walls. | The mazing tool. No tier upgrades. |
| 2 | **Arrow Spire** | 50 | Single target, 12 dps, range 5. | Bread-and-butter. |
| 3 | **Ballista** | 90 | Piercing bolt, 20 dps, range 8, pierces 3. | Anti-line. |
| 4 | **Ember Brazier** | 70 | Cone, 10 dps + burn 6 dps/3 s, range 3.5. | Pyromancer signature. |
| 5 | **Frost Obelisk** | 80 | Aura r3: slow 25%; pulse 6 dps. | Frost Warden signature. |
| 6 | **Tesla Coil** | 120 | Chain lightning, 18 dps, chains to 3, range 5. | Engineer signature. |
| 7 | **Mortar** | 130 | AoE lob r1.5, 35 dmg/2.5 s, range 4–10 (min range 4: dead zone up close). | |
| 8 | **Venom Spore** | 75 | Applies poison 8 dps/4 s, stacks ×3, range 4.5. | DoT engine. |
| 9 | **Beacon Totem** | 60 | Aura r3: towers +20% attack speed. No attack. | Support. |
| 10 | **Harvest Sprout** | 40 | No attack. +5 gold ⚖ per wave per tier. | Economy; pays off again in Act II (§4.3). |

### 3.4 Waves (initial table, all ⚖; enemy IDs in §6)

Enemy HP scales `× 1.18^(wave−1)`; counts below are per gate unless "total".

| Wave | Composition | Teaching intent |
|---|---|---|
| 1 | 8 Husk | Basics |
| 2 | 10 Husk, 3 Sprinter | Speed threat |
| 3 | 12 Husk, 4 Spitter | Ranged threat (can hit Warden/towers) |
| 4 | 6 Bulwark, 8 Husk | Armor — need focused dps |
| 5 | 14 Sprinter, 1 **Colossus (elite)** total | First elite; drops a Relic |
| 6 | 10 Husk, 6 Gale Imp (flying: ignores maze) | Anti-maze pressure |
| 7 | 8 Bulwark, 4 Mender | Healers — target priority |
| 8 | 16 Swarm Rat, 6 Splitling | Horde preview |
| 9 | 6 Burrower, 8 Spitter, 4 Wraith | Counter-turtle wave |
| 10 | **Gatebreaker (boss)** + escort trickle | Boss: 3,000 HP, slow, smashes walls (2× dmg vs structures). Drops Relic + Orb. |

---

## 4. THE SUNDERING (transition, ~60 s, interactive)

Triggered when wave 10 clears. Sequence:

1. **Dusk (15 s):** free repositioning; last-chance build/sell at half refund.
2. **Petrification:** every tower transforms in place per the conversion table (§4.2). The Core detonates safely: its 2×2 plus a ring of radius 2 is force-cleared of structures (guaranteed open arena pocket) and becomes the **Heartstone** — a shrine healing the Warden 5 HP/s ⚖ within r3.
3. **Soul binding (choice screen):** each weapon-granting tower type present offers its soul as a weapon card showing derived level & bonuses (§4.1). The Warden has **6 weapon slots**. If more than 6 types qualify, the player picks 6. Palisades and Harvest Sprouts grant passives, not weapons, and never consume slots.

### 4.1 Weapon inheritance (the central formula)

For each tower type built:

```
WeaponLevel(type)  = highest tier of that type on the field        (1–3)
DamageBonus(type)  = +8% ⚖ per additional tower of that type beyond the first, cap +40% ⚖
```

Weapons can later grow to **Lv 6** via Act II level-ups (§5.3). So Act I investment = a Lv 1–3 head start plus a permanent % bonus — TD play is never wasted, but Act II still has room to grow everything.

### 4.2 Conversion table (tower → terrain + soul)

Petrified terrain blocks the Warden **and** ground enemies (fliers/burrowers ignore it, §6).

| Tower | Petrified terrain (residual effect ⚖) | Soul weapon (Act II behavior ⚖) |
|---|---|---|
| Palisade | Stone wall. Passive: **+1 Armor per wall, cap +15**. | — |
| Arrow Spire | Plain pillar. | **Arrow Volley** — 3 shots/s at nearest enemy, 10 dmg. |
| Ballista | Plain pillar. | **Piercing Bolt** — every 1.5 s toward largest cluster, pierces all, 22 dmg. |
| Ember Brazier | Burning brazier: adjacent enemies take 5 dps. | **Flame Cone** — continuous cone in movement direction, 14 dps + burn. |
| Frost Obelisk | Ice monolith: slow aura 25%, r2. | **Frost Nova** — pulse every 4 s, r3.5, 12 dmg + slow 35%/2 s. |
| Tesla Coil | Conductive spire: **arcs to other spires within 6 tiles (max 2 links each); enemies crossing a beam take 10 dps.** Placement in Act I literally draws the Act II laser grid. | **Chain Lightning** — every 1.2 s, 16 dmg, chains 4. |
| Mortar | Rubble mound (plain). | **Mortar Lob** — every 2.5 s at densest cluster, r2, 40 dmg. |
| Venom Spore | Spore cloud r1.5: 4 dps poison. | **Toxic Trail** — poison puddles along the Warden's path, 8 dps/3 s. |
| Beacon Totem | **Shrine: Warden within r2.5 gains +15% attack speed.** | — (instead: each totem grants a permanent +4% attack speed, cap +12%.) |
| Harvest Sprout | **Gem Bloom: emits 1 XP gem (value 3) every 8 s, max 4 waiting.** | — |

**Design intent:** braziers/obelisks/spires make *staying near your old maze* rewarding; open-field kiting is always possible but gives up the residuals. Terrain must be a net positive when built sanely (tested — §10).

---

## 5. ACT II — Nightfall (Survivors phase)

### 5.1 Rules

- Free movement (WASD + dash). All weapons auto-fire per their behavior. No manual aiming. *(Not ⚖.)*
- **Duration 10:00**, then the final boss spawns; killing it wins the run. Elites spawn every 90 s ⚖. **Rift events** at 3:00, 6:00, 9:00: a collapsed gate tears open and burst-spawns a surge.
- Enemies spawn just outside the camera edge and converge on the **Warden** (not the Core). Same enemy roster as Act I with a stat overlay: **HP × 0.6, speed × 1.2, Core-damage → contact damage**, plus time scaling `HP × 1.10^minute` ⚖.
- Spawn director: every 10 s, spend a budget of `30 × 1.15^minute` ⚖ points on the enemy weight table (§6). Alive cap **350** ⚖ (performance budget).

### 5.2 XP & level-ups

- Kills drop gems (values 1/3/8/25 ⚖ by enemy grade), attracted within Pickup Radius.
- `XP to reach level n = 5n + n²` ⚖ (L2 = 14, L3 = 24, L4 = 36, L5 = 50 …).
- On level-up, pause and pick **1 of 3** cards: a weapon upgrade (one owned weapon +1 Lv, to max 6) or a **Boon**. Luck weights card rarity; 1 free reroll per level ⚖.

### 5.3 Weapon levels & Awakenings

- Each weapon has a 6-step track (Lv 4/5/6 defined per weapon: more projectiles, bigger area, extra chains…). Initial track values ⚖, listed in `data/weapons.json`.
- **Awakened forms (3 at v1):** at weapon Lv 6 + a specific Boon at rank ≥ 3, the next level-up offers the awakening:
  - *Storm Avatar* — Chain Lightning: constant auto-arcing to 3 nearest enemies.
  - *Phoenix Ring* — Flame Cone: adds a permanent orbiting fire ring.
  - *Meteor Barrage* — Mortar Lob: 3 simultaneous lobs, +50% area.

### 5.4 Boons (12, each rankable ×5 ⚖ per rank)

Power +8% · Haste (atk spd) +8% · Reach (area) +8% · Swift (move) +5% · Vitality (Max HP) +15 · Plating (Armor) +6 · Magnet (pickup) +25% · Leech 1% of damage as HP (cap 3/s) · Focus (CDR) +6% · Greed (gold/Ember find) +10% · Fortune (Luck) +10 · Second Wind — once per run, survive a killing blow at 30% HP (1 rank only).

### 5.5 Final boss — **The Warden-Eater**

15,000 HP × tier multiplier ⚖. Three phases: (1) telegraphed line charges that **shatter petrified terrain** it hits; (2) summons Wraith adds + ground-slam rings; (3) enrage at 30%: +30% speed, arena-edge fire closes in, forcing engagement. Drops: guaranteed Rare relic + 1 Orb + Ember jackpot.

---

## 6. Enemy roster (20, shared across both acts)

Grades: **F** fodder / **S** special / **E** elite / **B** boss. Bounty = Act I gold; gem = Act II XP value. Base stats at wave 1 / minute 0, all ⚖.

| ID | Name | Grade | HP | Spd (t/s) | Core dmg | Bounty/Gem | Behavior |
|---|---|---|---|---|---|---|---|
| 1 | Husk | F | 20 | 2.0 | 5 | 4 / 1 | Walker. |
| 2 | Sprinter | F | 12 | 3.6 | 3 | 4 / 1 | Fast. |
| 3 | Swarm Rat | F | 8 | 3.0 | 2 | 2 / 1 | Spawns in packs of 4. |
| 4 | Bulwark Beetle | S | 70 | 1.4 | 10 | 8 / 3 | 30% flat damage reduction. |
| 5 | Spitter | S | 25 | 1.8 | 4 | 7 / 3 | Ranged (r4); can hit Warden & towers. |
| 6 | Gale Imp | S | 18 | 2.6 | 4 | 7 / 3 | **Flying: ignores maze/terrain.** |
| 7 | Mender | S | 30 | 2.0 | 0 | 9 / 3 | Heals nearby 8 HP/s; priority target. |
| 8 | Splitling | S | 26 | 2.2 | 4 | 6 / 3 | Splits into 2 Husks on death. |
| 9 | Shellback | S | 45 | 1.6 | 8 | 8 / 3 | Frontal shield: −70% damage from the front. |
| 10 | Bomber | S | 22 | 2.4 | 20 | 8 / 3 | Explodes on contact (r1.5, 25 dmg). |
| 11 | Warlock | S | 35 | 1.8 | 5 | 10 / 3 | Buffs allies +20% speed, r3. |
| 12 | Burrower | S | 30 | 2.0 | 8 | 9 / 3 | **Tunnels under structures/terrain** (surfaces near target). |
| 13 | Charger | S | 40 | 1.6→5.0 | 8 | 9 / 3 | Winds up, then dashes in a line. |
| 14 | Frostkin | S | 28 | 2.2 | 5 | 8 / 3 | Immune to slow/chill. |
| 15 | Cinderling | S | 28 | 2.2 | 5 | 8 / 3 | Immune to burn; leaves fire trail in Act II. |
| 16 | Wraith | S | 30 | 2.4 | 6 | 10 / 3 | **Phases through structures/terrain for 2 s every 6 s.** |
| 17 | Colossus | E | 400 | 1.2 | 40 | 40 / 25 | Elite frame; stomp AoE; drops Relic. |
| 18 | Herald | E | 300 | 2.0 | — | 40 / 25 | Act II elite; aura empowers fodder; drops Relic. |
| 19 | Gatebreaker | B | 3,000 | 1.0 | 100 | 150 / — | Act I boss (§3.4). |
| 20 | Warden-Eater | B | 15,000 | var | — | — | Final boss (§5.5). |

Act II spawn weights per minute live in `data/spawns.json` (⚖, tuned by sim).

---

## 7. Relics (in-run RPG gear, PoE-lite)

- 3 slots: **Sigil / Plate / Charm**. Sources: elites, bosses, rare wave drops. Picked up in either act; equip from a pause menu (or auto-equip if slot empty).
- Rarity: Normal (implicit only) / Magic (1–2 affixes) / Rare (3 affixes). Implicits by slot: Sigil +6% Power · Plate +20 Max HP · Charm +5% Move Speed ⚖.
- **Affix pool (12, shared, values ⚖):** Power 4–10% · Attack Speed 4–10% · Area 4–10% · Max HP 10–30 · Armor 4–12 · Move 3–8% · CDR 3–8% · Pickup 10–30% · Luck 5–15 · Gold/Ember find 8–20% · Burn/Poison/Chill potency 8–20% · Tower cost −3–8% (Act I only).
- **Relics persist to the Stash** (24 slots v1) and are crafted between runs with Orbs (§8.2). This — plus the tree — is the 局外成长 backbone.

---

## 8. Meta progression (局外成长, PoE-style)

### 8.1 The Constellation (passive tree)

- Account level 1–60 ⚖ via **Ember** (earned per run: `base 100 × completion% × tier multiplier` ⚖). **1 passive point per level.**
- Tree v1: **120 nodes**, three branches from a central start:
  - **Bastion** (TD): small nodes = tower damage/range/cost, Core HP. Notables e.g. *Overseer* (Beacon auras +1 radius), *Deep Foundations* (walls 2× HP), *Toll of War* (+1 gold per kill).
  - **Slayer** (VS): small nodes = Power/Haste/Area/Leech. Notables e.g. *Soul Furnace* (start Nightfall with your best weapon +1 Lv), *Gravekeeper* (residual terrain effects +50% potency), *Stampede* (+10% move, dash +1 charge).
  - **Wanderer** (hybrid/economy): pickup, Luck, Ember find, relic drop rate. Notables e.g. *Prospector* (Sprouts +50%), *Cartographer* (map modifiers grant +10% more reward each), *Tinkerer* (1 free Orb of Turning per run).
- **Keystones (3, build-defining trade-offs):**
  - **Last Stand Sundering** — if the Core would die in Act I, the Sundering triggers immediately instead; all weapons −1 Lv and rewards −30%. *(Opt-in fail-softener.)*
  - **Glass Arsenal** — +2 weapon slots (8 total); Max HP −30%.
  - **Deep Roots** — petrified residual effects +100% potency and Tesla spires link at 3 links; weapon slots −1 (5 total).
- Respec: 5 Ember per node ⚖.

### 8.2 Orbs (crafting currency, drop in runs)

| Orb | Effect |
|---|---|
| Orb of Whetting | Reroll the numeric values of a relic's affixes. |
| Orb of Turning | Reroll one random affix into another from the pool. |
| Orb of Ascension | Upgrade rarity: Normal → Magic → Rare (adds affixes). |

Drop rates ⚖ (target: ~2–4 orbs per victorious run).

### 8.3 Map tiers (endgame ladder)

- **T1–T5.** Winning tier N unlocks N+1. Tier N applies **N−1 modifiers** (drafted: pick 1 of 2 offered per slot before the run) and rewards `× (1 + 0.35 × (N−1))` ⚖.
- **Modifier pool (12, ⚖):** enemies +25% HP · +20% speed · +1 gate active · waves +2 · players −20% pickup radius · towers petrify with −50% residuals · elite count ×2 · Rift events ×2 · Burrower/Wraith weight ×3 · boss +50% HP · build phase 10 s · Core −150 HP. Rewards scale with modifier count.

### 8.4 Unlock quests (8 at v1)

Examples: *Win a run* → unlock Pyromancer · *Build 40 Frost Obelisks lifetime* → unlock Frost Warden · *Win with only 4 weapon slots used* → unlock keystone respec · *Kill Warden-Eater under 90 s* → cosmetic Heartstone skin · *(4 more defined in `data/quests.json`.)*

---

## 9. Determinism & testability (build requirement, not optional)

1. **Sim/render split.** Headless deterministic core (fixed 60 Hz timestep, no wall-clock, no `Math.random`); renderer reads sim state only.
2. **Seeded RNG**, separate streams: `waves`, `spawns`, `drops`, `offers`, `ai`. A run = `seed + input log`; replays must reproduce end-state hash exactly.
3. **All content is data**: `data/towers.json`, `weapons.json`, `enemies.json`, `waves.json`, `spawns.json`, `boons.json`, `relics.json`, `tree.json`, `modifiers.json` — schema-validated.
4. **Headless CLI:** `sim --seed N --build build.json --policy [turtle|kite|hybrid|idle] --until end` → JSON report (survival time, dps shares, gold curve, deaths). Bot policies are simple scripted heuristics, good enough for balance sweeps.
5. Milestone gates in §11 are enforced by tests in CI (`npm test` must stay green).

---

## 10. Balance targets & acceptance criteria (each becomes an automated test)

| # | Criterion (T1 map, mid-tree account unless noted) |
|---|---|
| A1 | Median victorious full run = **24–28 min** over 200 seeded sims. |
| A2 | `idle` policy (no towers built): Core dies on **wave 3–4** — towers are mandatory. |
| A3 | `no-move` policy in Act II (stand at Heartstone): dead by **3:00** — movement is mandatory. |
| A4 | Every single-tower-type build (each of the 8 weapon towers + walls) **clears Act I at T1** but **fails at T3** — all types viable, none solo-dominant. |
| A5 | Across top-10 sim builds at minute 8 of Act II: **no weapon > 35% of total damage dealt**. |
| A6 | Terrain value: stripping petrified terrain from a sane `hybrid` build reduces Act II survival rate by **≥ 20%** — placement must matter after the Sundering. |
| A7 | Turtle check: full-perimeter wall-off with `turtle` policy still leaks ≥ 15% of wave 9 (Burrower/Wraith/Imp wave) — mazing is strong, never absolute. |
| A8 | Sundering head start: a 6-slot, all-T3 Act I build clears Act II with **≥ 70%** win rate vs **≤ 25%** for a minimal-towers rush build (same bot policy) — Act I investment must pay. |
| A9 | Economy: Harvest-heavy opening (4 Sprouts by wave 3) beats greedless play in total gold by wave 8 but has < 50% survival at T2 without tree support — greed is a real risk. |
| A10 | Performance: 350 enemies + 8 weapons + terrain ≥ 60 fps on a mid laptop; a full headless run sims in ≤ 5 s. |
| A11 | Determinism: same seed + input log → identical end-state hash, 100/100 runs. |

---

## 11. Build order (milestones for the AI pipeline)

M0 Sim skeleton: loop, seeded RNG, grid, ECS, headless CLI, determinism test (A11).
M1 Act I core: pathing + path-guarantee, 3 towers (Arrow/Palisade/Frost), 5 enemies, 5 waves, economy.
M2 Act II core: movement, dash, 3 weapons, spawn director, XP/level-ups, 10-min survival.
M3 **The Sundering**: conversion table, weapon inheritance, slot picker, Heartstone. First full-loop playable. Tests A2, A3, A6.
M4 Full content pass 1: all 10 towers/weapons, 20 enemies, waves 1–10, Gatebreaker, boons, elites.
M5 RPG + meta: relics + stash + orbs, Constellation (120 nodes), classes ×3, quests, map tiers + modifiers.
M6 Boss + Awakenings + Rift events.
M7 Balance sweeps vs §10; retune data files until green.
M8 Feel & ship: hit flash, damage numbers, screenshake, SFX hooks, save/load, settings, results screen.

---

## 12. Out of scope (v2 parking lot)

Co-op · additional map layouts · endless mode after boss · leagues/seasonal modifiers · controller & mobile · pet/summon towers · trading.

## 13. Open decisions (defaults chosen — confirm or override)

1. **Core death = run over** (default). Alternative "always sunder early on Core death" exists only as the opt-in keystone — keeps Act I stakes real.
2. **Build only near the Warden** (4 tiles) vs build-anywhere cursor. Default: near — it unifies the control feel across acts.
3. **6 weapon slots** (8 towers compete for 6) — forces a real Sundering choice. Confirm the number.
4. **Relics persist + Orb crafting** (default yes) — this is the main PoE texture beyond the tree; cutting it removes most of the stash/crafting scope if you want a leaner v1.
5. **One map layout at v1**, variety via tiers/modifiers — confirm this trade of breadth for depth.
