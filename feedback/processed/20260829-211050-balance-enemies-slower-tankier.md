[balance] OWNER ORDER: enemies overall slower and tankier (apply now)

Observation: enemies feel too fast and too flimsy; fights should be
slower-paced with meatier targets.
Order (scoped exception to the tuning freeze, like Q79): balance-analyst
applies global enemy multipliers now — start at movement speed x0.8 and
HP x1.4 (both then tunable) across all enemies; per-enemy identity ratios
stay (Sprinter still fastest, etc.).
Update BALANCE.md TTK bands to match the new intent: fodder 2-4 hits,
elite 12-20 s focused, bosses unchanged. Re-pin affected tests with
logged reasons; the full re-fit at P10 tunes FROM these values, not back
to the old ones.
Done when: multipliers live in /data, BALANCE.md bands updated, test:fast
green, a sweep report before/after is recorded in PROGRESS.md.
Priority: top
