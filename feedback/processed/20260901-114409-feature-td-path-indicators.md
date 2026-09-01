[feature] TD path indicators from every spawn gate

What: during TD build phases and waves, draw each spawn gate's current
enemy path to the Core (dashed line or arrows, one color per gate),
updating live as towers/walls are placed or sold, including breach
routes when the Core is sealed (dashed red through structures). Toggle
in options (default ON).
Spec ref: SPEC-FINAL 10 (pathing); 11 (indicators).
Done when: paths render for all gates, update on placement within one
tick, breach route shown when sealed; test asserts drawn path equals the
pathing system's route.
Priority: normal
