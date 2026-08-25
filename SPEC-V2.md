# STONEWAKE — SPEC v0.2 "The Long Night" (delta spec)

**Status:** for build. This document **overrides** SPEC.md where they conflict; SPEC.md
remains the base for everything not mentioned here. HANDOFF.md deviations Q1–Q31 are
**ratified as-built** except where this doc says otherwise. Number convention unchanged:
⚖ = tune freely against §11 gates.

**v0.2 goals** (from playtest + HANDOFF §7): (1) rotate the two game halves instead of
playing each once, (2) replace 3 thin classes with 11 deep ones, (3) make equipment and
the tree build-defining, (4) give weapons roles and enemies counters, (5) make the
Sundering care about *how* you played Act I, (6) fix the defect list in §10.

---

## 1. THE CYCLE — Day/Night rotation (replaces one-TD-then-one-VS)

A run is **3 cycles**. Each cycle = **Day** (tower defense) → **Dusk** (Sundering) →
**Night** (survivors) → **Dawn** (reclamation). The Warden-Eater ends Night 3.

| Cycle | Day (waves) | Night length ⚖ | Night capstone |
|---|---|---|---|
| 1 | Waves 1–4 | 3:00 | — |
| 2 | Waves 5–8 | 4:00 | Elite pressure ×2 |
| 3 | Waves 9–10 + Gatebreaker | 5:00 | **Warden-Eater** at night's end |

- **Dusk** (every cycle): 15 s reposition → petrification → soul-bind picker. The
  6-slot pick happens **every Dusk** from all currently available souls.
- **Dawn** (between cycles): for each petrified tower, choose:
  - **Rekindle** — pay 40% ⚖ of base cost: it becomes a live tower again; its soul
    unbinds (weapon unavailable next Night unless another tower of that type stays).
  - **Leave** — it remains terrain (residuals persist and stack up over cycles).
- **Soul persistence:** weapon levels gained at Night are stored **on the soul**
  (per tower type), not the slot. A soul left petrified keeps its level track across
  Nights. This is the core Rekindle-vs-Leave tension: Day power vs Night power.
- **Run-long progression:** Warden XP level, boons, and gear persist across the whole
  run. Gold is Day-only (unchanged). Gems do not convert at Dawn.
- **Leak coupling (Act I failure texture, HANDOFF §7.9):** every enemy that reaches
  the Core in a Day adds `2 × its director cost` ⚖ to **that Night's** budget — it
  escaped into the dark and comes back with friends. Leaks now cost twice: Core HP
  today, horde size tonight. Show a "Loose in the dark: N" counter on the Day HUD.
- Wave HP scaling continues across the run (wave index is global), and the Night
  director inherits HANDOFF's warmup/accrual behavior per Night, with minute = time
  within that Night plus `2.5 × (cycle − 1)` ⚖ so later Nights start hotter.
- Run length target: **28–34 min** (gate B1).
- The old single-cycle flow is removed. Rewrite affected tests; keep the sim capable
  of a `cycles: 1` config for fast test scenarios.

## 2. CLASSES — 11 playable Wardens

**Framework** (new systems, all data-driven):
- Every class has one **Active skill** (default Q; usable both phases; cooldown shown
  on HUD), one **Signature passive**, and an **Affinity** entry.
- **Affinity** replaces v0.1 class-exclusive signature towers (resolves HANDOFF Q13):
  every class can build every tower. Affinity towers get **+20% ⚖ effectiveness** for
  that class plus the listed perk. With 8 souls available to everyone and 6 slots,
  the Dusk picker now always binds.
- **Class kits are dual-phase by design**: every Active must have a stated Day use and
  Night use. Immersion rule: each class also alters one small thing about how its
  petrified world looks/behaves (listed as *Twist*).
- Data shapes: `data/classes.json` (kit numbers), `data/affinity.json`. Class actives
  implemented as sim Commands so bots and replays can use them.

| # | Class | Active (Q) | Signature passive | Affinity + perk | Twist |
|---|---|---|---|---|---|
| 1 | **Swordsman** | *Bladestorm* — hold to charge ≤2.5 s; release: circle slash r2.5, ×1–×4 dmg ⚖ + knockback | *Parry* — every 6 s ⚖ an auto-parry window (0.4 s) negates one hit and **reflects projectiles**; a perfect parry resets Bladestorm | Palisade, Ember Brazier — his walls are **spiked** (attackers take 8 dps ⚖); towers within 2 tiles of him +15% atk speed | Petrified walls keep their spikes |
| 2 | **Archer** | *Deadeye Draw* — hold to charge **with no cap**: damage +40%/s compounding ⚖, move −40% while drawing; release: piercing shot | Charge time also grants pierce count and crit chance | Arrow Spire, Ballista — standing within 2 tiles of their petrified pillars: draw 30% faster (sniper nests) | Her pillars show notched arrows; volley VFX |
| 3 | **Plaguebringer** | *Miasma* — cloud r3, +1 poison stack/s, 6 s | *Nothing Wasted* — when a poisoned enemy dies, its **remaining poison transfers** to up to 3 nearest enemies | Venom Spore — +1 stack cap for her; spore clouds merge with Miasma | Her terrain weeps green; gem blooms sprout fungus |
| 4 | **Engineer** | Day: *Field Kit* — repair a structure 40% max HP + overclock it (+50% atk speed, 6 s). Night: *Reactivate* — one petrified tower fights live for 8 s (cd 25 s ⚖) | Build range +2; salvage refund 85% | Tesla, Mortar, Ballista | Reactivated towers glow with rigged cabling |
| 5 | **Pyro** | *Immolation Wave* — r4 burst applying heavy burn | *Contagious Flame* — **burning enemies deal 6 dps ⚖ to enemies touching them** | Ember Brazier, Mortar — incendiary shells leave fire pools | Braziers never fully gutter; embers drift |
| 6 | **Necromancer** | *Raise* — animate corpses (kills leave 6 s corpses) into skeletons: cap 8, 12 dps, 15 s ⚖ | *Death Pact* (toggle per tower): +45% dmg, +30% atk speed, tower loses **2% max HP/s**; a tower that dies to its pact leaves a **Bone Pylon** (weak free turret terrain) | Venom Spore + any pacted tower | Skeletons persist through Dusk; pylons moan |
| 7 | **Cryomancer** | *Glaciate* — nova applying 3 chill stacks | Chill rework: each stack −8% speed, **+4% damage taken** ⚖; 5 stacks = freeze 1.5 s; frozen enemies **shatter on death** (r1.5, 20 dmg ⚖) | Frost Obelisk — its auras also build stacks | Shatter chains crackle across her monoliths |
| 8 | **Stormcaller** | *Overload* — next 3 chains: double jump range, +4 jumps | *Conduction* — chain hits gain **+20% dmg per jump, compounding** (more enemies = more damage); jump cap 8 (so max ×3.58 base — gate B8) | Tesla — petrified spire beams +50% for her and count as chain sources | Her spire grid hums; arcs jump to her blade |
| 9 | **Bloodlord** | *Blood Tithe* — target tower pays 30% current HP **once**: permanently +25% dmg, and its kills heal the Warden 1 HP ⚖ | 3% lifesteal on all Warden weapon damage; **+10% Power at Night, −5% at Day** | Ember Brazier + every tithed tower | Tithed towers run red; heal motes stream to him |
| 10 | **Animist** (Summoner — proposed implementation, confirm) | *Manifest* — summon a walking **spirit of any tower type built this run**: 30% of that tower's stats at its tier, follows the Warden, 20 s, cap 3 | Beacon auras affect spirits; spirits inherit tower tier | Beacon Totem, Harvest Sprout (her sprite also gathers gems) | Spirits are translucent minis of the towers |
| 11 | **Paladin** | *Clarion Taunt* — enemies in r6 target the Paladin 4 s (Day use: pulls leaks off the Core); while active, **Bulwark** stores 60% of damage taken/prevented; releasing fires a holy nova = stored ×1.5 ⚖ | +30 armor after standing still 1 s | Palisade (+50% HP within 3 tiles of him), Beacon | His walls bear sigils that flare on block |

Class balance gate: B3. Class distinctiveness gate: B5. Unlocks: Swordsman, Archer,
Engineer free; others via quests (extend `data/quests.json` to 12; keep unlock costs
light — this game sells builds, not grind).

## 3. RPG EQUIPMENT v2

- **Six slots:** Sigil, Plate, Charm (existing) + **Arms, Greaves, Band**. Implicits ⚖:
  Arms +8% Attack Speed, Greaves +6% Move, Band +1 Luck & +5% Pickup.
- Affix pool: keep the 12 flat affixes, add **8 interaction affixes** ⚖ (examples:
  +% damage to Chilled, poison duration +40%, on-shatter gain Haste 2 s, chain +1 jump,
  Bulwark stores +15%, spirits +1 duration, burn spreads +1 hop, taunt radius +2).
- **Uniques (12 at v0.2)** — orange tier, boss/T3+ drops, each a rule-changer:
  1. *Widow's Longdraw* (Arms) — Deadeye Draw no longer slows movement, but the shot
     auto-releases at 3 s.
  2. *The Patient Vein* (Band) — lifesteal doubled; all other healing −100%
     (Heartstone included).
  3. *Gravewright Mandate* (Sigil) — Death Pact decay ×3, but Bone Pylons are
     full-strength towers.
  4. *Nine-Jump Coil* (Arms) — chains never end while a new target is in range; each
     jump costs the Warden 1 HP.
  5. *Mother Frost* (Charm) — shatter damage ×3 and spreads 1 chill stack.
  6. *Cinder Court Deed* (Sigil) — all Braziers gain Mortar range, lobbing fire pools.
  7. *The Unfinished Plague* (Charm) — Nothing Wasted jumps to 6 enemies and may
     re-jump once.
  8. *Foreman's Ledger* (Plate) — Reactivate affects all petrified towers in r3;
     cooldown ×2.
  9. *Oath of the Standing Stone* (Plate) — Bulwark storage has no cap; you cannot dash.
  10. *Choirmaster's Beacon* (Sigil) — Beacon shrines empower the Warden at any range;
      all aura radii −50%.
  11. *Splitting Meridian* (Arms) — single-target-role weapons fire twice at 60% damage.
  12. *Hourglass of the Second Dusk* (Charm) — the run has **4 cycles**; rewards +40%.
- Uniques may reference class mechanics; on the wrong class the class-specific line is
  inert (state this on the tooltip). Gate: B6.
- **Stash UX (defect):** clicking a relic while the slot is occupied **swaps** (old
  item returns to stash); drag-to-stash unequips; no dead-end states. Gate B10.

## 4. CONSTELLATION v2

- Grow 120 → **220 nodes** on one shared board with **11 class start locations**
  (PoE-style: your class determines where you begin travelling, not what you may take).
- Rebalance intent (HANDOFF §7.5): small nodes stay small, but **24 notables** become
  build-arounds referencing real mechanics (chill stacks, corpse count, Bulwark,
  charge rate, spirit cap, bond strength, leak forgiveness), not +12% of a stat.
- **Keystones: 8.** Keep Last Stand Sundering, Glass Arsenal, Deep Roots. Add ⚖:
  *The Long Night* (Nights +60 s, each Day one fewer wave; Night rewards +25%),
  *Soul Mason* (+1 weapon slot; Rekindle disabled), *Cold Ledger* (leaked enemies cost
  double Core HP but add nothing to the Night budget), *Second Draw* (Dusk picker may
  also re-pick boons: refund 3 boon ranks each Dusk), *Ossuary Throne* (skeleton cap
  +4; skeletons persist between Nights; Warden −20% Max HP).
- Respec and adjacency rules unchanged. Ember economy gets its first real pass:
  starting Ember back to 0, curve tuned so a new account fills ~25 points in its
  first two won runs ⚖.

## 5. WEAPON ROLES & ENEMY COUNTERS (HANDOFF §7.4/§7.6)

- Every weapon gains `role: crowd | single | control | utility` in `data/weapons.json`.
  Falloff rules attach to role, not ad hoc per weapon. Rebalance so each role is
  necessary: crowd clears fodder, single deletes elites, control makes both possible.
- Enemy counter tags in `data/enemies.json` (data shapes, minimal engine work):
  - Shellback: +100% damage taken from behind; `pierce` ignores the front shield.
  - Mender: heal is **interrupted** by any single hit ≥ 25 ⚖ (burst check).
  - Warlock: takes +50% from `single`-role weapons; his buff aura is dispelled for
    4 s when he is crit.
  - Bulwark: DoT ignores 50% of his damage reduction.
  - Colossus/Herald: −50% damage from `crowd`-role weapons (elites demand single-target).
- **Boons v2:** replace the 12 flat boons with **6 stat boons** (Power, Haste, Vitality,
  Swift, Magnet, Fortune) + **6 synergy boons** ⚖: *Executioner* (single-role +40% vs
  elites), *Crowdbreaker* (crowd-role +2 falloff-free targets), *Warden's Rhythm*
  (control effects +30% duration), *Kindling* (ailments deal +6%/stack), *Gravetide*
  (on-kill effects trigger twice, 10 s cd), *Second Wind* (kept as-is).

## 6. THE SUNDERING CARES HOW YOU PLAYED (HANDOFF §7.1)

Two additions to the binding math (both data-driven):
- **Veterancy:** each tower's Day kills feed its soul: weapon starts the Night with
  bonus XP = `kills × 4` ⚖ toward its level track. A tower that carried the Day
  carries the Night.
- **Bonds:** at petrification, two *different* towers within 2 tiles of each other
  form a Bond if their pair is in `data/bonds.json` (ship 6 pairs ⚖): e.g.
  Frost+Tesla → her chains apply 1 chill; Brazier+Venom → burns tick poison;
  Arrow+Beacon → volley +1 projectile; Mortar+Frost → lob craters slow; Ballista+Tesla
  → bolt leaves a beam 1 s; Sprout+anything → that soul +10% XP gain. Bonds display
  at the Dusk picker. Adjacency finally matters in the soul math, not just geometry.

## 7. TIER LADDER REWORK (HANDOFF live issue #1)

- Per-tier global scalars (new): enemy HP ×`1.25^(N−1)` ⚖, director budget
  ×`1.15^(N−1)` ⚖, elite count +1 per tier from T3.
- Modifiers return to being **flavor on top**, and A4-style gates are tested at fixed
  tier scalars with modifiers excluded — no acceptance gate may depend on a specific
  modifier again.
- Reward pacing: first-clear bonus per tier, and Orb drop weights rise with tier ⚖.
- Gate: B2 (monotonic ladder).

## 8. DIRECTOR & BIMODALITY (HANDOFF live issue #3)

Night difficulty currently coin-flips in the first minute. Add a **rubber-band**: if
the Warden is below level `2 + 3×cycle` ⚖ at a Night's midpoint, gem values +50% until
caught up; if two levels above curve, budget +10%. Gates B1/B3 measure means and pass
rates, not medians, per HANDOFF's advice.

## 9. IMMERSION PASS (cheap, high-yield)

- Class-tinted palettes and idle animations; Dusk gets a 3 s petrification cinematic
  (freeze sim, sweep a shadow across the map); Dawn shows the Rekindle ledger over the
  battlefield; the "Loose in the dark" counter whispers at Dusk.
- Barks: 1-line class quips at Dusk/Dawn/boss (text only, `data/strings.json` —
  localization-ready keys from day one).

## 10. DEFECTS (fix first, M9)

| # | Defect | Required behavior |
|---|---|---|
| D1 | Death in Night phase only shakes the screen; cannot quit | Warden death → 1.5 s slow-mo → **Results screen** (defeat variant: cycle reached, kills, Ember earned) → buttons: Retry (same seed new run), New Run, **Hub**. Same flow for Core death. Esc pause menu gains **Abandon Run** (confirm) everywhere. |
| D2 | Stash unusable without manual unequip | Click-to-swap per §3; add right-click context (Equip/Compare); tooltip compare vs equipped. |
| D3 | (from HANDOFF) 6-slot picker never binds | Resolved by §2 affinity model — verify picker binds for every class. |

## 11. NEW ACCEPTANCE GATES (add to the A-suite; A11 determinism etc. still apply)

| # | Gate |
|---|---|
| B1 | Mean victorious run length 28–34 min; report IQR; no medians. |
| B2 | Win rate strictly decreases T1→T5 for both `maxbuild` and `hybrid`; T1 ∈ [55%, 75%], T5 ∈ [5%, 20%]. |
| B3 | Every class: T1 win rate ∈ [35%, 70%] with the class-generic bot + scripted kit usage. |
| B4 | Archer: dps-optimal Deadeye charge duration is finite and ∈ [2 s, 6 s]; a 6 s charge one-shots any non-elite at Night-2 scaling (fantasy preserved, dominance prevented). |
| B5 | Top damage source differs across ≥8 of 11 classes (minute 6, Night 2, class-default builds). |
| B6 | Each unique shifts the build's damage-share fingerprint by ≥0.15 (L1 distance) vs the same build without it. |
| B7 | +10 leaked Husks in Day 2 → Night 2 budget increases by the specified amount and survival drops ≥10% for the `hybrid` bot. |
| B8 | Stormcaller max single-chain multiplier ≤ ×3.6 base. |
| B9 | Soul weapon levels persist across Nights for petrified-left towers; Rekindled towers' souls do not appear in the next Dusk picker (state test). |
| B10 | UI flow tests: death→Results→Hub works from both phases; stash click-swap never dead-ends. |
| B11 | Strategy liveness: leaving ≥4 towers petrified at Dawn 2 beats full-Rekindle on Night-2 survival by ≥10%; full-Rekindle beats it on Day-3 clear time by ≥10% — both choices must live. |
| B12 | Re-run A5 on the diverse pool with roles live: no weapon >35% share; Piercing Bolt ≤30%. |

## 12. MILESTONES v0.2

- **M9** Defect pass + Cycle skeleton: D1–D3, cycle state machine, Dusk/Dawn flows,
  soul persistence, leak coupling. Gates: B9, B10.
- **M10** Class framework (actives/passives/affinity as data + Commands) + Swordsman,
  Archer, Cryomancer, Stormcaller. Gates: B4, B8.
- **M11** Remaining 7 classes incl. skeletons and spirits systems. Gates: B3, B5.
- **M12** Weapon roles, enemy counters, Boons v2, Veterancy + Bonds. Gate: B12.
- **M13** Equipment v2: slots, interaction affixes, 12 uniques, stash UX. Gate: B6.
- **M14** Constellation 220 + class starts + 8 keystones + Ember economy pass.
  Gate: tree connectivity/respec tests green.
- **M15** Tier ladder scalars + rubber-band + reward pacing. Gates: B2, B7, B11.
- **M16** Full sweep: all A- and B-gates green + QUALITY.md **Alpha bar**. Gate: B1.

## 13. OPEN DECISIONS (defaults chosen — override any time)

1. Animist implementation as specified in §2 (they asked for a proposal).
2. 3 cycles as the run shape; the 4th cycle exists only via the Hourglass unique.
3. Rekindle cost 40% of base; soul-persistence rules as §1.
4. Boons v2 replaces (not extends) the flat twelve.
5. Ember economy reset to a cold start (starting Ember back to 0).
