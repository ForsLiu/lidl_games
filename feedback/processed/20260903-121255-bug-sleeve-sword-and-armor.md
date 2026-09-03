[bug] Sleeve Sword behavior + Swordsman Armor conditional missing/unclear

1. Sleeve Sword - change the rule: Circle Slash stays a CHARGE skill
   (hold/release flow preserved, Dash Slash during charge still combos),
   but the charge is at MAX from the moment the key is pressed; release
   any time = max-charge effect. Update text + tests.
2. Swordsman Armor - the tooltip does not show its second conditional
   line ("with Sleeve Sword equipped, Circle Slash damage is boosted by
   attack speed instead"), and the effect is not defined precisely.
   Define and implement: 
   - Base line: Circle Slash charge fills faster in proportion to the
     character's attack-speed multiplier (charge rate x atkSpeedMul).
   - With Sleeve Sword equipped (charge is instant, so charge rate is
     moot): instead, Circle Slash damage x atkSpeedMul (same factor as
     attack speed, e.g. x1.32 at +32% attack speed).
   Tooltip shows both lines in sentence form with live numbers and
   active/inert markers; each line has a unit test.
Where: equipment tooltips + Swordsman kit.
Priority: top
