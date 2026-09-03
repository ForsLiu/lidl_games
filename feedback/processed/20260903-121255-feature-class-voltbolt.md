[feature] New class #14: Voltbolt (SPEC-FINAL 4.2 addition, visible roster)

Kind: class. Owner text authoritative; [designer note] marks
interpretations the owner may veto. Unstated numbers are bands per
BALANCE.md. Add to the VISIBLE roster.

Bands: range long (high) · damage medium · attack speed medium · AoE no
· movement high. Basic attack is HITSCAN: hits instantly like a
lightning strike (no projectile travel), normal damage type [designer
note: kept normal, not Electric, to honor "no AoE"; Electric would add
its inherent r0.8 splash - veto if you want Electric].

Passive - "Arc": every basic attack chains one more time at 25% damage,
applying all on-hit effects. The chain targets the nearest enemy within
r3 of the struck enemy that has not already been hit by this attack; if
none, it strikes the original target again. The chain lands 0.1 s after
the first hit (chain-like visual).

Active1 - "Lightning Ball" [designer note: cooldown 8 s ⚖]: throws a
ball toward the cursor position; it travels in that direction to the
cursor's point and lives 2.5 s total [designer note: reaches the point
and hovers there for the remainder; cursor beyond basic range clamps to
range]. While alive it fires the character's basic attack (including
the passive chain, or the Overdrive chain while Overdrive is active) at
the character's TOTAL attack speed, and its damage is boosted by the
character's total movement-speed bonus at 25% efficiency (e.g. +40%
move -> +10% damage).

Active2 - "Overdrive": cooldown 10 s; enters Overdrive for 5 s: the
passive chains TWO more times at 12.5% damage each (three chains
total: 25%, 12.5%, 12.5%), all applying on-hit effects; every basic
attack during Overdrive adds +2.5% attack speed and +2.5% movement
speed, stacking, ADDITIVE within this one source per SPEC-FINAL 2
[designer note: stacks reset when Overdrive ends]. At the end of the
duration: a burst of normal damage around the character [designer note:
base damage medium-high band, base radius 3 ⚖]; burst damage x (1 +
total movement-speed bonus), burst radius x (1 + total attack-speed
bonus).

Tower passive - "Lightning Accelerate": tower projectile speed +100%;
towers also gain attack speed equal to 50% of the character's total
attack-speed bonus, and bonus damage equal to 50% of the character's
total movement-speed bonus [designer note: the owner text says "0.5%
of character's total attack speed" - read as 50% efficiency conversion
(e.g. character +30% attack speed -> towers +15% attack speed); if the
literal 0.5% was intended, say so - it would be negligible].

VFX: instant lightning bolt line, delayed chain arcs, crackling ball,
Overdrive aura that intensifies with stacks, ring burst on expiry.
Interacts: Stormcaller-style electric towers' wires; on-hit equipment
(Plague Flask poison rides every chain); density orders make chains
richer.
Unlock [designer-fill]: 300 chain hits in one run.
Housekeeping: roster becomes 14 - update SPEC-FINAL 4.2/13 census,
class-diversity gate (>=11 of 14), Codex, dev profile, class-select
screen (visible), attack-sprite registry.

Done when: full kit per above; tests for chain targeting (nearest
unhit within r3, fallback to original), 0.1 s chain delay, Lightning
Ball firing at total attack speed with 25%-efficiency move bonus,
Overdrive's three-chain pattern, additive stacking and reset, burst
damage/radius scaling, tower projectile speed and conversion; replay
determinism; hitscan basic has no travel time.
Priority: normal
