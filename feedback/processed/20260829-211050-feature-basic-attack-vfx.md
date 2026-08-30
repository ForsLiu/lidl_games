[feature] Basic attacks need visual effects too

What: every class's basic auto-attack gets a firing + impact visual,
registered in the same data-driven VFX/indicator registry as skills and
Cores (extends the top-priority VFX item; if that registry item is not
yet done, fold this requirement into it). Per class: a projectile or
swing shape matching the class fantasy (sword arc, arrow, bolt, frost
shard, spore, etc.), an impact flash on the target, and the damage-type
color rules applied. Primitive shapes fine; respects reduced-flash.
Spec ref: SPEC-FINAL §11; the skill/core VFX registry.
Done when: all 12 classes' basic attacks show fire + impact visuals; the
registry checklist test covers basic attacks so a class without one
fails; VS wielded attacks keep their own visuals (unchanged).
Priority: top
