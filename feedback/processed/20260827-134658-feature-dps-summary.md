[feature] DPS summary: towers and character attack sources

What: a panel (toggle key) showing damage dealt and DPS over the current
wave and the whole run, broken down by source: each tower type (TD), each
wielded tower-type attack (VS), each class active, each damage type.
Spec ref: SPEC-FINAL §11; reuse the sim's damage-share telemetry.
Done when: numbers reconcile with the sim report (test compares panel
totals to the run report); visible in both phases.
Priority: normal
