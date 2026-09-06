[feature] In-run character panel: compact, important stats only, Details pull-down

What: the in-run character panel is too big and blocks the screen. Rebuild:
- Compact card anchored to a screen edge (no scrolling), close button
  top-right, Esc closes; never covers the bottom bar.
- Remove passive/active entries (the bottom bar already has them).
- Show equipped equipment slots with each item's effect text (read-only:
  equipment CANNOT be changed during a run; changes only in the Hub).
- Important stats always visible: HP (current/max), attack, attack speed,
  defense, movement speed, range, life regen, lifesteal.
- A "Details" pull-down reveals everything else (area, CDR, pickup, luck,
  per-source multiplier breakdowns, active boons and ranks).
Done when: panel fits on a 1080p screen without scrolling; close works;
equipment is read-only in-run with a tooltip explaining why; test asserts
the important-stat set and Details contents match the derived stats.
Priority: top
