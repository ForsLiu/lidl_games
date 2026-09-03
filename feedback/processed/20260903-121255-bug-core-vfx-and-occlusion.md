[bug] Core attack effects missing/weak; Core text hidden behind towers

Where: Corpse Core (and any Core with an active function), TD phase.
Steps: run Corpse Core with towers built near the Core; let it execute.
Expected: (1) every Core function that acts (Corpse execution/auto-fire,
Plant devour/spit) has a clear visual - beam/bite/projectile plus an
impact mark; (2) Core overlay text (store meter, digestion count, stacks)
always renders ABOVE structures and enemies (top z-layer, slight backdrop
for readability), never occluded.
Actual: execution barely reads; the Corpse store/count text is blocked by
towers built beside the Core.
Priority: top
