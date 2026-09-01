[feature] Game speed control becomes a dropdown with 0.25 and 0.5

What: replace the cycling speed button with a dropdown: 0.25x, 0.5x, 1x,
2x, 3x, 10x, 50x. Sub-1x speeds run the sim at fixed 60 Hz with slower
wall-clock (determinism unchanged). Current speed shown on the control.
Spec ref: SPEC-FINAL 11 (fast-forward) - extend.
Done when: all seven speeds selectable; hash-identical end state across
speeds on the same seed (test).
Priority: normal
