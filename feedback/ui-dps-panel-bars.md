[feature] DPS panel: whole-run totals only, segmented bar per source

What: the DPS panel shows only whole-run damage (no per-wave view):
total damage at the top, then one horizontal bar per source (each tower
type, each wielded attack, each class active, basic attack, Core), each
bar segmented by damage TYPE in the damage-type colors, with the source's
total number printed at the right end of its bar; sorted by total. Hover
a segment: that type's amount and percent. Panel keeps the docked,
semi-transparent side style.
Done when: bars render from the run report; numbers reconcile with the
sim's damage ledger (test); colors from data/damagetypes.json.
Priority: normal
