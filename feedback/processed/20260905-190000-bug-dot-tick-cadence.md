[bug] DoT ticks too fast (Time Lord's converted self-damage) - cap tick rate

Where: all DoTs, most visible on Time Lord's Time Flow.
Expected: a DoT ticks at most once per 0.25 s per DoT instance; each
tick delivers the damage accrued for that interval (total over duration
unchanged). Applies to enemy DoTs and the character's converted damage.
Actual: some DoTs (Time Flow) tick every sim frame, spraying numbers and
firing per-tick effects far too often.
Fix note: keep exact totals (clip the last tick); update tick-driven
effects (armor shred, lifesteal-on-DoT) to the new cadence; regression
test with a 4 s DoT asserting <= 16 ticks and exact total.
Priority: top
