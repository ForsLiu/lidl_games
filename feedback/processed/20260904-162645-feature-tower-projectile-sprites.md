[feature] Every tower attack has a visible projectile/beam sprite

What: every tower type gets a distinct attack visual registered in the
VFX registry: Arrow - arrow; Ballista - heavy bolt; Venom Spore - spore
puff projectile with drip trail; Mortar - lobbed shell with arc + impact
crater flash; Electric - instant jagged arc + chain arcs; Ember Brazier
- flame cone sweep; Frost Obelisk - pulse ring; Beacon/Harvest - aura
pulse tick. Projectile sprites travel at the tower's real projectile
speed (so Voltbolt's +100% speed passive is visible); impact marks per
damage type color. Same visuals when the character wields them in VS.
Spec ref: SPEC-FINAL 5, 11, VFX registry.
Done when: all 10 towers have registry entries with fire + travel +
impact visuals; registry test fails for any tower without one; VS
wielded attacks reuse them.
Priority: normal
