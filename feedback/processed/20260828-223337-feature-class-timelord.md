[feature] New class #12: Time Lord (SPEC-FINAL §4.2 addition)

Kind: class. Owner text authoritative; [designer note] marks interpretations
the owner may veto. All unstated numbers are bands per BALANCE.md.

Bands: range medium · damage medium · attack speed medium · AoE no ·
movement medium.

Passive — "Time Flow": all damage TO the character is converted into a DoT
on the character over 4 seconds [designer note: armor applies first, the
mitigated amount then ticks over 4 s and is not mitigated again; lethal
only when a tick brings HP to 0]. Second clause — "all DoT damage from the
character on enemies is 100% faster" — is authored but DORMANT: implement
as a data flag that ships disabled, reserved for a future unique equipment
effect. Do not activate it.

Active1 — "Time": 3 charges, each recharges in 6 s, no cast cooldown.
On cast, every enemy within r7 advances one time-mark stage:
- unmarked → "past": teleport the enemy back to its position of 3 seconds
  ago and apply a high DoT for 6 s. [designer note: sim keeps a rolling
  3 s position history per enemy]
- "past" → "present": stun-lock 3 s and apply a high DoT for 6 s.
- "present" → "future": −20% attack and movement speed for 3 s (if the
  enemy is stun-locked or frozen, the slow's countdown starts when that
  ends) and apply a DoT equal to the enemy's remaining HP over 6 s.
- "future" → executed: instantly kill; elites and bosses instead lose 50%
  of current HP [designer note: reading of "insta kill them, half
  elite&boss's HP"; execute counts as normal damage of that amount for
  on-kill/lifesteal purposes only if it lands as damage — log final choice
  to QUESTIONS.md].
Marks persist until consumed by the next stage [designer note: no decay].

Active2 — "Time Lock": 2 charges, each recharges in 10 s, no cast
cooldown. Creates an area at the mouse cursor [designer note: radius band
medium ⚖] for 5 s: enemies may enter but cannot leave; Time's rewind
cannot pull them out (clamped to the border). Enemies inside take a high
DoT over 10 s [designer note: applied on being inside at cast or on first
entry]. If a previous Time Lock area still exists when casting a new one:
teleport every enemy from the old area into the new one and detonate ALL
their remaining DoT damage (of every type) as one instant burst; the old
area is consumed.

Tower passive: every 2 TD waves, all towers gain one free bonus level
automatically; each bonus level grants +10% attack range and +10% AoE
area [designer note: bonus levels sit on top of the purchasable track, do
not consume steps or trigger milestone specials, and are uncapped].

Interacts: remaining-HP DoT + Time Lock's detonation = the execute combo;
Time Flow smooths burst damage; pairs naturally with the Time Core.
Unlock [designer-fill]: win a run using the Time Core.
Housekeeping: roster becomes 12 classes — update SPEC-FINAL §4.2/§13
census, class-diversity gates (G8 band, fingerprint count), Codex, and the
dev profile.

Done when: full kit implemented per above; each Active1 stage has a unit
test (including the rewind position, the deferred slow timer, and the
elite half-HP branch); Time Lock's no-exit clamp, rewind interaction, and
DoT detonation each tested; dormant passive flag exists and is off; VFX +
indicators per the skill-vfx registry (mark icons above enemies for
past/present/future); gates updated for a 12-class roster.
Priority: normal
