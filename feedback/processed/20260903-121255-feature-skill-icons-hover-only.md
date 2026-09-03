[feature] Skill icons: hover-only tooltips, written descriptions, include tower passive

What: bottom-bar passive/active icons are NOT clickable - no sticky
panels; tooltip shows on hover and hides on leave. Tooltip content is a
written effect description with the numbers embedded in sentences (e.g.
"Slash all enemies within 2.5 tiles for 34 damage, knocking them back"),
not bare raw numbers. Add the class TOWER PASSIVE as a fourth icon on the
bar with the same hover behavior. Range/area indicator still draws while
hovering.
Spec ref: SPEC-FINAL 11; amends the bottom-bar HUD item.
Done when: no click behavior on icons; hover shows sentence-form text with
live numbers for passive, both actives, and tower passive on all visible
classes; test asserts numbers in the text equal sim values.
Priority: normal
