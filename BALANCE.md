# BALANCE.md — enemy pacing intent (fb020)

## Origin

Owner-filed feedback `feedback/processed/20260829-211050-balance-enemies-slower-tankier.md`:
enemies felt too fast and too flimsy; fights should be slower-paced with
meatier targets. This is a scoped, owner-granted exception to CLAUDE.md's
"no tuning before P10" freeze — same standing as the QUESTIONS.md Q79
precedent — applied by the balance analyst directly to `/data`, not `/src`.

## Multipliers applied (fb020)

In `data/enemies.json`, every **non-boss** entry (`grade` F, S, or E) got:

- `speed` × 0.8
- `hp` × 1.4

Both `gatebreaker` and `warden_eater` (`grade: "B"`) are unscaled — the
feedback explicitly calls out "bosses unchanged." Every non-boss value was
scaled by the same flat factor, so per-enemy identity ratios are preserved
automatically (Sprinter is still the fastest fodder, Colossus is still the
tankiest elite, etc.) — no individual enemy was hand-tuned beyond the global
multiplier.

## TTK (time-to-kill) intent

These are the pacing bands the multipliers are aiming at, not hard guarantees
measured per-enemy yet:

- **Fodder** (grade F: husk, sprinter, swarm_rat) — roughly **2–4 hits** from
  a representative early-game tower/weapon to kill.
- **Elite** (grade E: colossus, herald) — roughly **12–20 s** of focused
  damage from a representative mid-game build to kill.
- **Bosses** (grade B: gatebreaker, warden_eater) — **unchanged**, both stats
  and TTK expectations.
- Grade S (the "standard" mid-tier enemies) sit between fodder and elite by
  construction (HP roughly 1.5–2× fodder up to elite scale) — no separate
  band is called out by the owner feedback, so none is asserted here.

## Status

This is a **starting point**, not a final fit. Both multipliers, and the TTK
bands above, are tunable going forward. The real balance re-fit happens at
P10 (SPEC-FINAL §15) using the full sweep/gate machinery — and per the
owner's order, that re-fit tunes **from** these values, not back to the
pre-fb020 numbers.
