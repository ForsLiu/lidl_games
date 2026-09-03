[feature] Random terrain generation each run + player-chosen Core position

What: each run generates a terrain layout from the run seed. This is an
epic - split into sub-items as needed.

Tile types (data-driven, collision stays square-grid):
- normal: walkable + buildable (today's ground)
- rough/empty: walkable, NOT buildable
- rock/wall: NOT walkable, NOT buildable (blocks enemies and pathing;
  the character still passes per fb002's pass-through rule [designer
  note: character flies over; veto if rocks should block the character])
- high ground: buildable; towers on it CANNOT be attacked directly by
  ground melee enemies [designer note: ground enemies cannot step onto
  high tiles and cannot melee what is on them; ranged enemies (Spitter),
  fliers, and the bosses' special attacks still can; Burrowers cannot
  surface on high ground]

Core placement: at run start, before wave 1, the player clicks any legal
normal tile to place the 2x2 Core (legal = normal ground, not within 3
tiles of a spawn gate, reachable from every gate). A default suggested
spot is pre-highlighted; confirm to begin.

Generation constraints (property-tested across 1000 seeds):
- every spawn gate open and never enclosed
- >= 60% ⚖ of the map is walkable; >= 45% ⚖ buildable normal ground
- all gates connect to >= 80% ⚖ of the walkable area
- legal Core positions form a large set (>= 15% ⚖ of normal tiles) -
  terrain must not usually pre-seal or encircle the Core options
- no forced corridor narrower than 2 tiles on gate-to-open-area mains
- deterministic from the run seed; hashed
Rendering: organic-looking shapes (marching-squares style edges, texture
variation) drawn over the square collision grid.
Interactions to cover: pathing/flow-field costs, sealing rules unchanged
on buildable ground, path indicators (fb) render around terrain, Tuner
gets a terrain page (density/ratios editable), Training Grounds keeps a
flat arena.
Spec ref: NEW - append as SPEC-FINAL 10.5; gates: add generation
property tests + determinism to G2's scope.
Done when: seeds produce varied legal maps meeting every constraint;
Core placement flow works; high-ground protection rules tested; a
degenerate-seed fallback regenerates deterministically (seed+1) rather
than shipping an illegal map.
Priority: normal
