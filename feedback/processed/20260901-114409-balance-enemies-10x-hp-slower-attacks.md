[balance] OWNER ORDER: enemies 10x tankier, slower overall attack speed, enemy HP bar option

Observation: fights end too fast; the owner wants long, readable combat.
Order (scoped exception to any tuning freeze; supersedes the earlier
x1.4 HP order): 
1. Enemy HP x10 globally (per-enemy ratios kept).
2. Overall attack speed slower: apply x0.7 to all attackers - towers,
   character basic and wielded attacks, class skills' hit cadence, and
   enemies (tunable).
3. Options menu: "Enemy HP bars" toggle (default ON) drawing a small HP
   bar under every enemy, with the pending-DoT segment.
4. Rewrite BALANCE.md TTK bands to the new intent: fodder 6-12 hits,
   elite 40-60 s focused, bosses 3-6 min; P10 tunes FROM these values.
Re-pin affected tests with logged reasons; record before/after sweeps.
Done when: multipliers in /data, toggle works, BALANCE.md updated,
test:fast green, sweep deltas recorded in PROGRESS.md.
Priority: top
