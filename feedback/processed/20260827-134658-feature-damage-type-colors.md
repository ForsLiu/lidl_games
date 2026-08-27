[feature] Distinct color/font per damage type in damage numbers

What: damage numbers render in a per-type style, defined in
data/damagetypes.json (e.g. normal white, bleeding dark red, poison green,
toxic dark green, burning orange, electric yellow; crits/execute larger).
Colorblind-safe variants respected by the existing palette setting.
Spec ref: SPEC-FINAL §3, §11.
Done when: each type visibly differs in a mixed fight; style comes from
/data not code; test asserts the mapping.
Priority: normal
