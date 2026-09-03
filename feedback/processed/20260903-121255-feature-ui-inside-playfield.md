[feature] All UI overlays inside the play screen; maximize playfield

What: the game canvas fills the window; every UI element (bottom bar,
side panels, DPS panel, counters, wave info) floats OVER the playfield as
semi-transparent overlays at the edges - no opaque gutters or sidebars
that shrink the playable view. Panels auto-collapse to edge tabs; the
map/camera uses the full window area.
Spec ref: SPEC-FINAL 11 - layout rule.
Done when: canvas is window-sized; no layout element reserves horizontal
space outside it; ui-audit scenes re-captured; overlap checks still pass.
Priority: normal
