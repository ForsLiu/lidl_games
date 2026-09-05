[feature] Swordsman combo: show the swept area during Dash Slash + Circle Slash

What: when Dash Slash is cast during a Circle Slash charge, draw the
full effective hit region for the merged attack: the charged circle
sweeping along the dash path (a capsule/stadium shape = circle radius
along the whole line), shown as the aim indicator while charging + moving
the cursor, and as a brief afterimage on release so the player sees what
was hit. The merged attack's actual detection must equal that shape.
Spec ref: SPEC-FINAL 4.1 (Swordsman combo), 11 (indicators).
Done when: indicator renders the capsule from current charge radius and
cursor direction; test asserts hit detection region == indicator region;
afterimage respects reduced-flash.
Priority: normal
