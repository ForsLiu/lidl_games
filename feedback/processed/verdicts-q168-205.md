[verdicts] Owner verdicts for pending entries Q168–Q205 (+ BALANCE DIRECTION v3 adjustments)

General rule: every pending entry not named below is APPROVED as its
chosen default. Record each verdict in its entry and in the Verdict log,
then apply the orders. Q176's withdrawal and Q177's retraction are
accepted as recorded.

Q168: approved (additive shape). fb124's full-charge-only variant is NOT
wanted — close fb124.
Q169, Q170: approved.
Q171: approved, all nine, including "rock and high ground stop the
Warden". The two open items: (a) Act II high-ground residual — accepted
as a non-issue: towers are inert during VS waves and enemies hunt the
Warden, so an uncontestable inert tower changes nothing; log and close.
(b) Burrower's widened untargetable window — cap it at 3 s ⚖ per
surfacing; small item.
Q172: ORDER fb128 — carry the sub-tick cooldown remainder (control run
required, low priority) so small attack-speed steps are never inert.
Q173: approved. Q174: approved; fb118's global renumbering stays queued
at low priority; the "next free id across all four files" rule stands.
Q175 and Q193: approved as evidence; DECISION (amends BALANCE DIRECTION
v2 §A): the 35% own-kit-share target fought the owner's own VS design
(the character wields every tower, so wielded damage is supposed to
dominate). Restate: own-kit VS share target = 15% ⚖ from TD wave 12, a
BALANCE.md target (not a G8 clause), measured for the nine classes whose
kit has a damaging VS Active; bloodlord, engineer and animist are exempt
(identity via lifesteal/tithe and summons) and are measured for the
record only. Keep kitPowerMul and kitBuildMul as shipped; do not pursue
route (b) (no cuts to wielded scaling). G8 = T3 win-rate band + pairwise
fingerprint distance (§D) only.
Q177: approved (baseHpMul 20, T1 re-anchor).
Q178, Q179, Q185, Q186, Q187, Q188, Q189, Q189a, Q190: approved.
Q180 and Q191: OVERRIDE — option (b), scoped narrowly. A character sheet
reading "10 max HP" and equipment "+0.1 HP" is not acceptable. Split the
factor: `numberScale` applies only to economy A (enemy HP and damage
dealt to enemies: tower/kit/wielded/Core attacks); economy B (enemy
damage output, character/Core/structure HP, equipment flats, regen) is
NOT scaled. The five crossing constants (lifesteal, Blood Tithe, Wrath,
Corpse store, Vampire Heart overheal) take the inverse factor so their
outputs are unchanged; verify each with the existing cross-scale
invariant test shape (as done for overhealGoldRatio), one control pair
each. Revert fb164's prose re-anchoring for economy B numbers. Normal
priority, one item.
Q181: approved; ORDER the cheap closer — loader refuses unknown
top-level keys in modifiers.json.
Q182, Q183, Q184: approved (final boss spawns at a gate; round-robin
cursor; censoring recorded, p12e resolved via Q192).
Q192: approved — the /data re-anchor of warden_eater.hp.
Q194, Q195: approved.
Q196: approved — p12j's 9/12 stands. ORDER (new item, before any further
G8 re-tune): per-class survivability bands. Add `maxHpMul` and
`defenseBonus` fields to data/classes.json (engine reads them at
derive), authored ⚖: swordsman x1.6 / +10, bloodlord x1.4 / +5,
paladin x1.5 / +10 (on top of Guardian Stance), necromancer x1.2 / +5,
all other classes x1.0 / +0. Rationale: Night-1 melee wipes are a
survivability problem, not a damage problem (three damage rounds moved
nothing). Then re-measure G8 for swordsman, necromancer and engineer;
engineer may be re-tuned within the G14 >20 s boss-fight floor.
Q197: approved.
Q199, Q200, Q202, Q203, Q204, Q205: approved.
Q201 (fb162 merge): approved — master's unconditional overkill clamp
stands; designed executes book at most the target's remaining HP.
Q201 (p12i): approved — censored runs excluded and named.

PRIORITY DIRECTIVE after these verdicts, in order: (1) the survivability
item; (2) the economy-split item; (3) the kit-share target restatement
in BALANCE.md and tests; (4) the queued content-lane items (equipment
sets fb056, Madness King fb057, Voltbolt fb059, Plaguebringer charge
fb061, poison-barrel pin fb062) — and check why lane-content's routine
has delivered nothing since Sep 3: if its overlap guard is tripping on
a stale branch or PR, close that branch/PR and note the fix in
BACKLOG-CONTENT.md's Log; (5) everything else in queue order.

Record every verdict, apply the orders, then continue from the top.
