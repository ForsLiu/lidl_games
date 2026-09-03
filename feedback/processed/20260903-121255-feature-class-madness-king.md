[feature] New class #13: Madness King (SPEC-FINAL 4.2 addition, visible roster)

Kind: class. Owner text authoritative; [designer note] marks
interpretations the owner may veto. Unstated numbers are bands per
BALANCE.md. Add to the VISIBLE roster (4th alongside Swordsman,
Plaguebringer, Time Lord).

Bands: range long (high) · damage low · attack speed slow · AoE no ·
movement fast (high).

Madness status (shared by Passive and Active2): a mad enemy attacks the
nearest OTHER enemy within r3 until it dies; if no enemy within r3, it
attacks itself and random-walks within r1 of where it went mad. Each
attack it makes grants it +10% attack speed and +10% movement speed,
stacking for the status's duration and lost when madness ends [designer
note: bonus applies to its madness attacks and movement; when a mad
enemy attacks a tower or the character it uses its normal rate - the
bonus never speeds up damage to structures or the character]. Elites:
madness never increases their movement speed and never restricts their
movement - they keep pathing normally, attack a teammate within r3 if
one exists, else self-damage while walking [designer note].
VFX: teammate-attack and self-attack each have their own distinct
sprite/effect, visibly ramping (faster/brighter) as the bonus stacks.

Passive - "Whispers": every basic attack (and each damage instance from
an Active) puts the target into madness for 3 s. Cap: 5 enemies mad
from the passive at once; at the cap, new hits apply nothing until an
old madness expires or that enemy dies. [designer note: Active2's
madness does not count toward the passive's cap.]

Active1 - "Mind Manipulation": 3 charges [designer note: each recharges
in 8 s ⚖, no cast cooldown]. Converts the enemy closest to the cursor
into a teammate: it fights for the character, attacking the nearest
enemy until it dies; when no enemies remain / the wave is cleared, it
dies. If it was in madness when converted, it keeps its currently
stacked attack-speed and movement-speed bonus permanently. Elite/boss
targets cannot be converted; instead, for 1 s they take (their own
attack damage + the character's basic-attack damage) every 0.33 s
(3 ticks) and are slowed 90% for that second.

Active2 - "Spreading Madness": makes every enemy in a circle [designer
note: radius 4 ⚖ at the cursor] go mad for 10 s (madness rules above).

Tower passive - "Frenzied Aim": each tower's attack speed rises the
closer its nearest enemy is: 0% bonus at the tower's max range, scaling
linearly to a maximum bonus at point-blank equal to the character's
total attack-speed bonus +10% (e.g. character at +32% -> towers up to
+42%) [designer note: linear with distance fraction; recomputed each
tick from the nearest enemy in range].

Engine notes: converted enemies become friendly units through the
existing summons framework; enemy-vs-enemy and self damage are new
damage paths (must count for on-kill effects, Spreading Plague, gems,
and quest metrics as character-caused kills [designer note]); madness
is a status with a per-enemy stack counter; the cap of 5 is tracked on
the character. Everything replay-safe and hashed.
Interacts: Time Lord's Time Lock (mad enemies locked together shred each
other); Necromancer corpses from teammate kills; density orders make
madness scale with crowd size.
Unlock [designer-fill]: 200 enemies killed by other enemies (lifetime).
Housekeeping: roster becomes 13 - update SPEC-FINAL 4.2/13 census,
class-diversity gates (>=10 of 13 distinct top damage sources), Codex,
dev profile, class-select screen (visible), attack-sprite registry
(distinct crown/scepter projectile).

Done when: full kit per above; tests for the passive cap (5 then wait),
conversion (fights, dies when wave clears, keeps madness bonus), elite
branch (3 ticks + 90% slow), Active2 madness (teammate targeting in r3,
self-attack + random walk otherwise, stacking bonus reset at expiry,
elite movement exception), tower passive scaling; VFX registry entries
for teammate/self attacks with ramp; determinism holds.
Priority: normal
