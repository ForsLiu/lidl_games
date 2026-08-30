[feature] Surface detailed numbers everywhere the player looks

What: the game should tell the player exactly what everything does, with
live numbers from /data and the character's current stats:
- Class screen + in-run character panel: each active and passive with its
  full effect text AND current numbers (cooldown, charges, radius, damage
  bands resolved to values, scaling applied).
- Core: selection screen and in-run Core tooltip show its TD effect, VS
  effect, current upgrade step, and next-step preview with numbers.
- Constellation: a summary view listing every allocated node's effect and
  the combined totals per stat (works with auto-max).
- Equipment: every item shows full stats and effect text in its tooltip,
  including conditional lines with an active/inert indicator for the
  current class, and equipped-vs-candidate compare.
All text generated from /data + the stats engine — no hand-written
duplicate strings that can drift.
Spec ref: SPEC-FINAL §11; extends fb004 character panel and the Codex.
Done when: each of the four surfaces shows live numbers; a test asserts
panel numbers equal the sim's derived values; changing a /data value
changes the displayed text without code edits.
Priority: normal
