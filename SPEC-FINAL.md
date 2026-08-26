# STONEWAKE — SPEC-FINAL (complete game design, v1.0)

**This document supersedes SPEC.md, SPEC-V2.md and SPEC-V3.md.** It is
self-contained: the whole game can be built from zero against it, and the
existing repo migrates to it (§16). Owner workbook text is authoritative and
appears verbatim. Sections marked **[designer-fill]** were missing from the
workbook and use the simplest design that makes the whole system work — the
owner may veto any of them via an inbox verdict. ⚖ = tune against §14 gates.
All content and numbers live in `/data/*.json`, never in code.

---

## 1. Game overview

Tower-defense / survivors hybrid. The player is a character on the field who
builds towers. **TD waves**: enemies path to the Core; towers fight; the
character builds, fights weakly, and plugs leaks. **VS waves**: enemies swarm
the character; towers stand inert as obstacles; the character auto-wields
every built tower's attack. RPG layer: classes with skills, equipment, and a
persistent skill tree.

### 1.1 Run structure
- Pattern: **3 TD waves, then 1 VS wave, repeating** (owner rule). A run =
  **18 TD + 6 VS waves** ⚖; VS after TD waves 3/6/9/12/15/18.
- TD wave 18 ends with the **Gatebreaker** miniboss; the final VS wave ends
  with the **Warden-Eater** boss — killing it wins the run.
- **Multi-summon**: the player may call the next TD wave(s) early, stacking
  up to 3 at once ⚖; early-call bonus = `2 gold × that wave's un-elapsed
  build seconds`, paid once per wave against its own timer. VS waves cannot
  be stacked or skipped.
- Build phase between waves: 20 s ⚖. Building disabled during VS waves.
- VS wave length: 75 s ⚖ (final VS wave: until the boss dies).
- **Leak coupling**: each enemy reaching the Core in TD adds `2 × its spawn
  cost` ⚖ to the next VS wave's budget, shown as a "Loose in the dark: N"
  HUD counter.
- Defeat: Core HP 0 (TD) or character HP 0 (any wave) → defeat Results
  screen (Retry same seed / New Run / Hub). Rewards for waves fully cleared
  are kept.
- Run length target: 30–36 min ⚖ (gate G1).

## 2. Core math (owner rules, verbatim intent)

| Stat | Rule |
|---|---|
| HP | HP = 0 then die. |
| Attack | Damage of each attack. |
| Defense (armor) | Reduces each **normal** damage: flat points = percent. Capped at **+99** (99% reduction); **uncapped negative**: −90 armor = +90% incoming normal damage (engineering floor −100 ⚖ = max ×2). DoT damage ignores armor; Burning's shred lowers armor itself. |
| Attack speed | Attacks per second. |
| Movement speed | Distance per second. |
| Range | Attack distance. |
| Area | Effect radius from center; **applies to every attack, active, and effect**. |
| EXP | **Only gained in VS waves**; every level gives an upgrade choice (§6.3). |
| Life regen | HP per second. |
| Lifesteal | Heals from **normal damage** dealt, no per-second cap. VS tower attacks count as character attacks, so they lifesteal. |

**Stacking**: all boosts from **different sources multiply** (10% + 20% atk
speed → ×1.1 × 1.2). A source = the thing acquired as a unit (one class
trait, one tree node, one equipment item, one VS boon, all standing-terrain
effects together); ranks within a source add before multiplying. Flat,
base-less stats (armor points, +1 pierce, charges) add. An exhaustive
`STAT_KIND` map classifies every stat `mul` or `flat` at compile time.

## 3. Damage types & status (owner table, verbatim; in `data/damagetypes.json`)

| Type | Rule |
|---|---|
| Normal | Basic damage, no effect; reduced by armor. |
| Bleeding | Each application: 1 dmg/s for 5 s. **Stacks per application** (shared perf cap 50 stacks/enemy ⚖; a type under its own cap evicts the most numerous other type's shortest stack, never the reverse). |
| Poison | DoT totalling **120% of the triggering damage over 3 s**; cap 3 stacks, refresh shortest ⚖. |
| Toxic | DoT totalling **180% over 9 s**; cap 3 stacks ⚖. |
| Burning | Each application: 1 dmg **and −1 armor** per second for 3 s; both effects AoE r1 ⚖ around the victim (effects spread, the Burning itself does not; overlapping victims' spreads add; immunities checked on both paths). **Owner intent: stacks per application like Bleeding** — flip the data field at the balance pass (§16), refresh-strongest until then. |
| Electric | Deals its damage in a small AoE (r0.8 ⚖) inherently. |

Composite attacks split by ratio (e.g. `normal:electric = 1:1`). DoT ticks
clip to remaining time so stated totals pay exactly. Final partial rules:
frost/frozen respect `slowImmune`; frozen's +30% damage taken applies to
all damage; statuses affect the character only when a source is authored.

**Status** — frozen: cannot move 3 s, +30% damage taken. frost: −30% attack
speed and movement speed for 3 s.

## 4. Characters (11 classes)

Framework: each class = archetype bands (low/medium/high, mapped to numbers
in `data/classes.json` ⚖) + **Passive** + **Active1 (Q)** + **Active2 (E)**
+ **Tower passive** (always on; effective in VS where it says so). Actives
may be mouse-aimed and may combo; all are sim Commands. Basic attack: every
class auto-attacks the nearest enemy with its band profile.

### 4.1 Owner classes (verbatim)

**Swordsman** — range low, dmg high, spd high, AoE yes, move high.
Passive *Thousand Cuts*: each attack (including active attacks; each damage
instance from an active counts as 1 attack) applies 1 Bleeding.
Active1 *Circle Slash*: charging a self-centered circle slash; the longer
the charge the larger the damage, range and knockback; effect has a limit
but charge time is unlimited (cap = 3 s-equivalent ⚖).
Active2 *Dash Slash*: dash in the mouse direction slashing everything on the
path; usable during Circle Slash charging — the hit range expands by the
current charge radius and the damages sum into **one** attack.
Tower passive *Wind Slash*: all towers +10% attack speed, effective in VS.

**Plaguebringer (Poison)** — range high, dmg low, spd medium, AoE no, move
medium. Passive *Spreading Plague*: if any DoT on an enemy is unfinished
when it dies, deal the total unfinished damage to the nearest enemy once.
Active1 *Poison Barrel*: a circle of poison on the ground for 5 s, applying
poison damage every second.
Active2 *Poison Boost*: double the remaining poison damage on all enemies.
Tower passive: all towers +10% poison damage.

### 4.2 Remaining classes **[designer-fill — owner template applied]**

| Class | Bands (rng/dmg/spd/AoE/move) | Passive | Active1 (Q) | Active2 (E) | Tower passive |
|---|---|---|---|---|---|
| **Archer** | high/med/med/no/med | *Long Draw*: Deadeye damage has no cap; +1 pierce per full second charged | *Deadeye Draw*: hold to charge, +40%/s compounding ⚖, move −40% while drawing; release a piercing shot | *Quickstep*: short dash toward mouse firing 3 arrows at nearest enemies; usable while drawing without losing charge | all towers +10% range |
| **Engineer** | med/low/med/no/med | builds & upgrades cost −10%; build range +2 | *Field Kit*: repair target structure 40% max HP + overclock +50% atk spd 6 s | *Pop Turret*: deploy a mini arrow turret (30% stats) 10 s, cap 2 | all towers +10% HP |
| **Pyro** | med/med/med/yes/med | *Contagious Flame*: Burning enemies deal 2 dmg/s ⚖ to enemies touching them | *Immolation Wave*: r4 burst applying 3 Burning | *Flame Road*: dash leaving a burning trail 3 s | all towers +10% damage vs Burning enemies |
| **Necromancer** | med/low/low/no/low | kills leave corpses 6 s | *Raise*: skeletons from corpses (cap 8, 15 s, 40% of char attack) | *Death Pact* (toggle per tower): +45% dmg +30% atk spd, tower −2% max HP/s; a pact tower that dies leaves a Bone Pylon (weak free turret) | all towers +15% damage while below full HP |
| **Cryomancer** | high/low/med/small/med | attacks apply frost; an enemy hit 5 times while frosted freezes; frozen enemies shatter on death (r1.5, 20 normal ⚖) | *Glaciate*: r4 nova applying frost; already-frosted enemies freeze | *Ice Wall*: temporary 1×3 wall at mouse, 5 s (blocks paths; enemies attack it) | all towers +10% damage vs frosted/frozen |
| **Stormcaller** | high/med/med/small/med | *Conduction*: electric damage +20% per jump, compounding, cap 8 jumps | *Chain Surge*: chain bolt, 6 jumps | *Overload*: 5 s — electric effects jump +2; electric-tower wires pulse at double rate | all towers deal +10% of their damage as extra Electric |
| **Bloodlord** | low/high/med/small/high | 3% lifesteal on normal damage; +10% attack in VS waves, −5% in TD waves | *Blood Tithe* (target tower): tower pays 30% current HP once → permanently +25% dmg; its share of VS attacks lifesteals +1% | *Crimson Rush*: dash through enemies, +2 HP per enemy passed | all towers +10% damage, −10% max HP |
| **Animist** | med/low/med/no/med | aura effects also affect summons; summon cap +1 | *Manifest*: summon a walking spirit of any built tower type (30% of its stats at highest upgrade), 20 s, cap 3 | *Recall Totem*: place a totem — character & summons near it +15% atk spd; in TD it taunts nearby enemies | all towers +10% area |
| **Paladin** | low/med/low/yes/low | +30 defense after standing still 1 s; blocked damage charges Wrath | *Clarion Taunt*: enemies in r6 target the Paladin 4 s; 60% of damage taken stores into Wrath | *Judgement*: release Wrath as a holy nova (stored ×1.5 as normal damage) | all towers +10% HP and +5 defense |

Unlocks: Swordsman, Archer, Engineer free; others via quests (§8.4).

## 5. Towers (10; `data/towers.json`)

Model (owner rules): each upgrade = **+10% HP, Attack, Defense unless a
milestone special is listed** (the special replaces the bump); **upgrade
cost is flat per step and does not grow** (total track cost = 2× build cost
⚖, per-track `costMul` allowed); **sell refunds 50% of everything spent**.
Bands map in `/data` ⚖. Defense bands: none 0 / low 5 / medium 10.

### 5.1 Owner towers (verbatim)

| Tower | dmg | rng | spd | pierce | AoE | type | proj | HP | def | steps | Milestones | cost | VS special |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **arrow** | low | high | high | 1 | no | normal | 1 | med | med | 5 | +1 pierce @3 · apply 1 Bleeding @4 · +1 projectile (same path, not spread) @5 | low | none |
| **electric** | med | high | med | 1 | no | normal:electric = 1:1 | 1 | med | med | 3 | @3: the same electric damage applies to another nearest enemy (chain visual, no normal damage in the chain); if no other enemy, applies twice to the first | high | **all electric towers are wired to each other; enemies on any wire take normal damage every 0.5 s** |
| **poison** | low | high | high | 1 | small | normal:poison = 1:1 | 1 | med | low | 4 | +1 projectile (same path, not spread) @2 · poison ratio → 1:1.5 @4 | low | **character leaves a poison trail every second dealing 0.1× the tower's attack** |

### 5.2 Remaining towers **[designer-fill]**

| Tower | dmg | rng | spd | pierce | AoE | type | HP | def | steps | Milestones | cost | VS special |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **wall** | — no attack — | | | | | | high | med | 3 | (+10% only) | very low | none (obstacle) |
| **ballista** | high | high | low | 3 | no | normal | med | med | 4 | +1 pierce @2 · +1 projectile (same path) @4 | med | none |
| **fire brazier** | med | low | high | 0 | cone | normal, applies 1 Burning per hit | med | low | 4 | +1 Burning per hit @2 · cone width +50% @4 | med | **Burning enemies explode on death: 5 normal, r1** |
| **ice obelisk** | low | med | 1 pulse/s | — | aura r3 | normal, applies frost | med | med | 3 | @3: frost from this tower lasts 5 s | med | **an ice aura r2 follows the character, applying frost each second** |
| **mortar** | high | high (min 3) | low | 0 | r1.8 | normal | med | low | 3 | @3: shells leave a burning patch 2 s | high | none |
| **beacon totem** | — no attack; aura r3: towers +20% atk spd — | | | | | | med | low | 2 | +25% aura per step (linear) | low | **standing within r2.5 of a beacon: character +15% atk spd** |
| **harvest sprout** | — no attack; +5 gold per TD wave per level — | | | | | | low | none | 2 | +5 gold/wave per step | low | **emits 1 XP gem (value 3) every 8 s during VS waves** |

### 5.5 Cores (`data/cores.json`) **[owner feature — inbox 2026-08-26]**

The Core is chosen at run start (Hub, beside class select). Owner content
below is authoritative; **[designer note]** marks interpretations the owner
may veto via a later verdict file.

Rules:
- Pick 1 Core per run. Default: Stone Heart. Others unlock via quests.
- Core keeps all existing Core rules (TD target, HP 0 in TD = defeat).
  Enemies still ignore the Core during VS waves.
- Core upgrades are bought by interacting at the Core (build-range rule),
  flat cost per step; steps grant ONLY the listed effect (no default +10%).
  The Core cannot be sold.
- Core-sourced attacks (Plant bullets, Corpse executions) are Core attacks:
  not scaled by character stats, no lifesteal, but they do feed on-map
  damage effects. All numbers ⚖.

**Stone Heart** — Base 500 HP. No effects. Upgrade: 3 steps, 50 g — +100
Core HP per step. Unlock: default.

**Carnivorous Plant** — Base 200 HP.
TD: devours 1 enemy within r2 every 8 s (non-elite: instant kill; elite:
200 dmg) and heals the Core 5 HP. Each devour = +1 Digestion stack for the
run.
VS: spits poison bullets every 1.5 s — one bullet per 5 Digestion stacks
[designer note: perf cap 10 bullets/volley], each 10 normal + poison,
targeting nearest enemies to the Core.
Upgrade: 4 steps, 60 g — +1 devour range and −1 s cooldown per step.
Interacts: rewards funnel-mazes past the Core; feeds Spreading Plague.
Unlock: 300 lifetime poison kills.

**Vampire Heart** — Base 350 HP.
TD: all towers gain 0.1% lifesteal; a tower below full HP gains +0.5%
damage and attack speed per 1% HP missing (cap +30%).
VS: character +1% lifesteal; overhealing converts to gold at 20:1.
Upgrade: 3 steps, 80 g — step 1: tower overheal also converts 20:1;
step 2: both conversions become 10:1; step 3: tower lifesteal 0.3%.
Interacts: sealed bases that soak hits; Bloodlord tithe.
Unlock: finish a run with the Core at or below 25% HP.

**Corpse** — Base 500 HP.
TD: 1% of all damage dealt to enemies on the map is stored. Every 1 s, if
the store covers the current HP of an enemy, the Core executes the
highest-HP enemy it can afford, spending that much store [designer note:
"that damage is also stored" read as: the execution counts as map damage,
so 1% of it flows back into the store].
VS: enemies drop +10% EXP.
Upgrade: 3 steps, 100 g — step 1: store ratio 2%; step 2: executions also
explode, dealing the victim's max HP as AoE r2 to nearby enemies; step 3:
the Core auto-fires every 5 s at the highest-HP enemy, spending up to the
full store as damage even when not lethal.
Interacts: scales with total board DPS; strongest anti-elite Core.
Unlock: deal 100,000 lifetime damage.

**Time** — Base 300 HP.
TD: enemies within r3 have attack and movement speed −20%.
VS: character attack and movement speed +20%.
Upgrade: 5 steps, 150 g —
step 1: passive income +1 gold/s [designer note: flat, unaffected by
gold-gain bonuses];
step 2: towers and character +1 HP regen/s and healing received +20%
[designer note: interpreted from "+1/s then +20%"];
step 3: decay aura — enemies within r5 lose `1 × 1.2^(5 − ring)` HP/s
ignoring armor (r5→r4: 1/s, r4→r3: 1.2/s, r3→r2: 1.44/s, …);
step 4: decay aura starts at r10 (same per-ring scaling);
step 5: decay multiplier 1.2 → 1.5.
Interacts: the turtle Core — pairs with sealing and Frost/ice builds.
Unlock: win a run in under 32 minutes.

## 6. VS stage

### 6.1 Tower-attack inheritance (owner formula, verbatim)
When in VS mode, the character has all the built towers' attacks. Without
specifying, the attack has the same attack speed, special effects, and
highest upgrade effect; the attack damage is the **average among that type
(considering the different upgrade attack), boosted by 10% for each tower of
that type**. Towers are not attacking. Example: 1×lv1 arrow + 2×lv3 arrow +
1×lv1 poison → arrow VS damage = `(1×lv1 + 2×lv3)/3 × (1 + 10%×3)`, with
the @3 upgrade's +1 pierce; poison computed the same way. **The attacks are
counted as attacks from the character** (they scale with character stats and
trigger lifesteal and on-attack passives). Ships as a verbatim unit test.

### 6.2 Towers during VS waves
Inert but present: solid obstacles, keep HP (enemies may attack them),
contribute their VS special (§5 last column). Weapon panel shows lineage:
"Arrow ×3 (avg 14.2, +30%) — pierce 2".

### 6.3 VS level-up upgrades **[designer-fill — fills the empty workbook sheet]**
Each VS level: pick **1 of 3** cards; 1 free reroll per level. Pool
(`data/vsupgrades.json`):
- **Stat boons** (rank ×5 each ⚖): Attack +10% · Attack Speed +10% ·
  Move +10% · Max HP +15 · Defense +5 · Area +10% · Range +10%.
- **Type Mastery** (one card per built tower type, rank ×3): that type's VS
  attack +20% damage.
- **Skill cards** (3 per class, rank ×2, defined per class in `/data`):
  Active1 potency +25% · Active2 cooldown −25% · a class line (e.g.
  Swordsman: Thousand Cuts applies 2 Bleeding; Plaguebringer: Spreading
  Plague hits 2 nearest; Stormcaller: jump cap +2 …).
- Offer weighting even; Luck-style modifiers may weight later ⚖.

## 7. Equipment (owner table, verbatim; `data/equipment.json`)

Slots: **weapon, armor, shoes, ring, necklace, bracelet** (one each).
Multipliers multiply per §2; flats add. Class-conditional lines are inert
elsewhere unless a fallback is written.

| Item | Slot | HP | Atk | Def | AtkSpd | Move | Effect |
|---|---|---|---|---|---|---|---|
| greatsword | weapon | 0 | 10 | 5 | ×0.9 | ×1 | none |
| sleeve sword | weapon | 0 | 5 | 0 | ×1.2 | ×1 | Circle Slash needs no charge and fires at max-charge effect; if not Swordsman: atk speed ×1.2 (so 1.2×1.2) |
| normal armor | armor | 10 | 0 | 10 | ×1 | ×1 | none |
| swordsman armor | armor | 5 | 5 | 5 | ×1.1 | ×1 | Circle Slash charging speed = original × attack speed; if sleeve sword equipped, Circle Slash damage is boosted by attack speed instead; if not Swordsman: atk speed ×1.5 (so 1.1×1.5) |
| normal shoes | shoe | 5 | 0 | 5 | ×1 | ×1.5 | none |
| swordsman shoes | shoe | 3 | 3 | 3 | ×1.1 | ×2 | double Dash Slash distance; if not Swordsman: ×1.1 movement |
| normal ring | ring | 1 | 1 | 1 | ×1 | ×1 | life regen +1 |
| bleeding ring | ring | 0 | 2 | 1 | ×1 | ×1 | +0.01% lifesteal; lifesteal now also applies to Bleeding damage |
| normal necklace | necklace | 1 | 1 | 1 | ×1 | ×1 | EXP +20%; tower upgrade cost −20% |
| builder's necklace | necklace | 1 | 0 | 2 | ×1 | ×1 | all towers +1 flat attack (boostable by upgrades / VS count multiplier) |
| normal bracelet | bracelet | 1 | 1 | 1 | ×1 | ×1 | character and tower **area** +10% |
| sniper bracelet | bracelet | 2 | 1 | 0 | ×1 | ×1 | character and tower **range** +10% |

Expansion hook: future workbook rows drop straight into the table. Parked
idea (owner): classes wearing multiple items of one slot.

## 8. Rewards & meta

1. **Each TD wave cleared → 1 random equipment** (even weights ⚖), granted
   at run end, win or lose, for waves fully cleared. Duplicates allowed.
2. **Each VS wave cleared → 1 skill point**, granted at run end.
3. **Skill tree** (as built): 120-node Constellation, three branches
   (tower / character / economy), adjacency allocation, respec 1 point per
   node. Growth to ~200 nodes is a later content pass.
4. **Unlock quests** (8–12, `data/quests.json`): win a run → Pyro; build 40
   ice obelisks lifetime → Cryomancer; win with a sealed Core → Paladin;
   etc. Quests award unlocks only, never currency.
5. Orbs/crafting: **removed**. Stash holds equipment; click-to-swap equip.

## 9. Enemies & waves (roster as built; `data/enemies.json`)

20 enemies, grades fodder/special/elite/boss: Husk, Sprinter, Swarm Rat,
Bulwark Beetle, Spitter, Gale Imp (flying — ignores structures), Mender
(heals; **interrupted by any hit ≥ 25** ⚖), Splitling, Shellback (front
shield; **+100% damage from behind; pierce ignores the shield**), Bomber
(explodes; **3× damage vs structures**), Warlock (buff aura; **takes +50%
from single-target attacks**), Burrower (tunnels under structures,
untargetable until surfacing), Charger, Frostkin (slow-immune), Cinderling
(burn-immune, fire trail), Wraith (phases through structures 2 s every 6 s),
Colossus (elite), Herald (elite), Gatebreaker (TD boss, 2× vs structures),
Warden-Eater (final boss, 3 phases, shatters structures it charges through).

TD scaling: `hp × 1.30^(wave−1)` ⚖; composition curve in `data/waves.json`
(editable in the Tuner). VS budget per wave: `150 × 1.21^(waveIndex)` ⚖ with
75 s warmup rules as built; alive cap 350; leak coupling per §1.1.

## 10. Map & pathing

- One map: 36×20 tiles, 3 gates (W/N/E), Core 2×2 east-center; tiers T1–T5
  with drafted modifiers as built (no gate may depend on a modifier).
- **Sealing the Core is allowed**: structures are high-cost passable tiles
  (cost ∝ HP × toughness ⚖). Open path exists → enemies walk it (classic).
  Fully sealed → enemies take the cheapest breach route and attack the
  structures in the way until they reach the Core. Fliers/Burrowers/Wraiths
  keep their bypasses.
- Character: move WASD, dash (4 tiles, 3 s cd, brief i-frames), build within
  4 tiles of self, instant build/sell.

## 11. Tooling, dev mode, UX (all as previously specced and largely built)

Range/AoE placement ghosts and selection rings; click-select anything with
stats panel; god mode + practice tools (replay-safe, bank nothing); dev
profile (everything unlocked, memory-only, prod off); **Codex & Tuner**
(in-game wiki of every entity from `/data`; in dev mode every number and
wave editable, saved to the real files via dev-server, content-hashed into
RunConfig; prod = read-only + export/import); fast-forward 1/2/3×; defeat →
Results → Retry/New/Hub everywhere; Esc pause + Abandon Run; save/load with
versioned migration; stash click-to-swap; per-type VS lineage labels; 2 s
TD↔VS transition sweep; SFX behind an AudioSink seam (asset pass later).

## 12. Engineering requirements (unchanged, non-negotiable)

Sim/render split; fixed 60 Hz; no `Math.random`/`Date.now`/native trig in
`/src/sim`; named RNG streams; run = seed + input log, end-state hashed;
all actions (incl. class actives) are Commands; headless CLI + bot policies
(`idle`, `kite`, `turtle`, `hybrid`, `maxbuild`, …); zod-validated `/data`;
content hash in RunConfig; `npm test` green gates every commit.

## 13. Content totals at 1.0

11 classes · 10 towers · 12+ equipment · 6 damage types + 2 statuses ·
20 enemies · 18+6 waves · 120-node tree · 8–12 quests · T1–T5 · 2 bosses ·
VS upgrade pool per §6.3 · Codex & Tuner.

## 14. Acceptance gates (consolidated; replaces all prior A/B/C lists)

| # | Gate |
|---|---|
| G1 | Mean victorious run 30–36 min (24+ seeds; means/pass-rates, never medians). |
| G2 | Determinism: 100/100 replay hash match, incl. actives, tuner-edited content (per content hash), fast-forward. |
| G3 | VS inheritance unit tests incl. §6.1's worked example verbatim. |
| G4 | Armor edges: +99→99%, clamp above, −90→×1.9, floor −100; DoTs ignore armor; Burning shred lowers it. |
| G5 | Stacking: two different-source 10%/20% boosts = exactly ×1.32; same-source ranks add. |
| G6 | Interleave: TD×3→VS pattern; multi-summon ≤3 with per-wave bonus; VS unstackable. |
| G7 | Sealing: sealed Core → structures damaged en route; open path → no structure-chewing by pathing; sealed-build win rate ≤ open-build +10 pts at T2. |
| G8 | Every class clears T1 at 35–70% win rate (scripted kit bot); top damage source differs across ≥8 of 11 classes. |
| G9 | Swordsman combo: Dash during charge = one merged attack, widened range, exactly 1 Bleeding per enemy struck. Plaguebringer: unfinished DoT transfers once to nearest. |
| G10 | Archer: dps-optimal charge finite (2–6 s); full charge one-shots any non-elite at mid scaling. |
| G11 | Stormcaller: max chain multiplier ≤ ×3.6. |
| G12 | Rewards: N TD waves → N equipment; M VS waves → M skill points; orbs nowhere. |
| G13 | No tower type's VS attack >35% of damage across the winning-build pool; every type solo-viable at T1, none at T3. |
| G14 | Boss: 20 seeds, scripted-build win rate ≥60% and <100%. |
| G15 | Tuner: edit→save→reload round-trip; invalid rejected; edited runs flagged; prod has no endpoint. |
| G16 | Dev profile fully unlocked in dev; `npm run build` has dev mode off, god mode unreachable. |
| G17 | Perf: sim budget per simulated minute (host-independent) ⚖; 350 enemies + all weapons ≥60 fps benchmark; 50-run soak, zero exceptions/NaN. |
| G18 | UI flows: defeat→Results→Hub from every phase; stash swap never dead-ends; save round-trip + corrupt-save repair + version migration. |
| G19 | Liveness: winning sim builds include both sealed and open strategies, and multi-summon usage. |
| G20 | Every §5 milestone special measurably changes the attack it names (loader-validated). |
| G21 | Core choice is in RunConfig and hashed; each Core's TD and VS effects have unit tests with §5.5's numbers (incl. the Time decay ring table and a Corpse execute-and-restore worked example). |
| G22 | Each Core shifts the run fingerprint (damage-source or economy vector) by ≥0.10 vs Stone Heart on the same seed/build. |
| G23 | Every Core clears T1 at a 35–70% win rate with the scripted bot. |

## 15. Build order 0→100 (fresh build)

P0 sim skeleton (loop, RNG, grid, Commands, CLI, G2) · P1 TD core (pathing
+ sealing, 3 owner towers, 8 enemies, economy) · P2 VS core (movement, dash,
inheritance formula G3, spawn director, XP) · P3 interleave + leak coupling
(G6) · P4 core math + damage types (G4, G5) · P5 full tower roster + upgrade
tracks (G20) · P6 classes: framework + Swordsman + Plaguebringer (G9), then
the other nine (G8) · P7 VS upgrade pool + equipment + rewards (G12) ·
P8 enemies/waves/bosses complete (G14) · P9 tooling: dev mode, Codex &
Tuner, UX flows (G15, G16, G18) · P10 balance re-baseline all gates + feel
pass (juice, transition sweep, SFX/art assets) → 1.0.

## 16. Migration of the existing repo (recommended path)

Built through M20 already ≈ P0–P5 plus most of P9's tooling. One reconcile
milestone: audit code vs SPEC-FINAL, map every gap to a backlog item in P
order, retire superseded tests with logged reasons, then continue the loop.
The pending balance re-baseline (old M27) becomes P10 and additionally:
flip Burning to per-application stacking (§3), re-price against G13, and
re-baseline perf as G17's per-sim-minute budget.

## 17. Owner review list (veto via inbox verdicts)

§4.2 nine filled classes · §5.2 seven filled towers · §6.3 VS upgrade pool ·
Burning stack timing (§3) · armor floor −100 (§2) · VS wave 75 s (§1.1) ·
quest list (§8.4) · §5.5's [designer note] interpretations (inbox 2026-08-26).
