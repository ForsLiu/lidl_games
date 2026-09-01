[feature] Bottom HUD bar: HP, gold, passive, two actives with MOBA-style cooldowns

What: a persistent bar at the bottom of the screen showing: HP bar with
numbers, gold, the class passive icon, Active1 (Q) and Active2 (E) icons.
- Hover any icon: tooltip with full effect text, current numbers, charges,
  stacks, durations; the skill's range/area indicator draws on the map
  while hovering.
- Cooldowns: clockwise gray radial sweep over the icon (MOBA style) with
  remaining seconds; charge count badge for multi-charge skills; ready
  flash when available.
- Passive shows its live state (e.g. Wrath stored, Digestion, marks).
Spec ref: SPEC-FINAL 11 - new HUD element.
Done when: bar visible in both phases; tooltips + indicators work for all
12 classes; cooldown sweep matches sim cooldown exactly (test); scales
with resolution/DPR setting.
Priority: top
