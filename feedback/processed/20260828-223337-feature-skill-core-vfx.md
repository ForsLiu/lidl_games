[feature] Indicators + visual effects for every skill and Core function

What: every class active/passive and every Core function gets (a) a
range/area indicator and (b) a visible effect when it fires. Concretely:
- Actives: aim indicators while casting/charging (Circle Slash radius at
  current charge, Dash Slash path, Poison Barrel circle, Glaciate nova,
  Taunt radius, Manifest placement, Ice Wall footprint, etc.) and a firing
  VFX (slash arc, dash trail, nova ring, taunt pulse).
- Passives: a visible cue when they trigger (Thousand Cuts bleed tick mark,
  Spreading Plague jump line, Conduction jump counter, Parry flash,
  shatter burst, Wrath charge glow on the Paladin).
- Cores: devour bite + range ring (Plant), digestion stack counter on the
  Core, execution beam + store meter (Corpse), lifesteal motes flowing to
  the Core/character (Vampire Heart), slow-aura ring and decay-ring
  shading by radius (Time), upgrade-step change visibly reflected.
- All primitive-shape art is fine (circles/lines/flashes); style constants
  in one render module; respects reduced-flash setting; no sim changes.
Spec ref: SPEC-FINAL §11 (indicators) — extend to skills and Cores.
Done when: every active shows an aim indicator; every listed trigger has a
visible effect; a checklist test asserts each class/Core has indicator +
vfx entries registered (data-driven registry, so a new skill without them
fails the test).
Priority: top
