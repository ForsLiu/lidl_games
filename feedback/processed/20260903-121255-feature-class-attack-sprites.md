[feature] Class basic attacks look like different weapons, not recolors

What: each visible class's basic attack gets a genuinely distinct sprite/
shape and motion, matching its weapon fantasy: Swordsman - sword swing arc
(melee sweep); Plaguebringer - lobbed spore/vial with small splash;
Time Lord - a thrown clock-shard / temporal bolt with a trailing
distortion. (Hidden classes keep whatever they have; upgrade them when
they return to the roster.) Impact effects differ too (slash flash vs
splash vs ripple). All primitive-vector art is fine, but silhouettes must
be distinguishable at a glance in a horde. Registered in the VFX registry
(extends fb021).
Spec ref: SPEC-FINAL 11, VFX registry.
Done when: the three visible classes' basic attacks are visually distinct
in shape AND motion; registry test updated; reduced-flash respected.
Priority: top
