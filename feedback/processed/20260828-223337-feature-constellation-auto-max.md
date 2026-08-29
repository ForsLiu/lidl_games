[feature] Constellation fully upgraded automatically (for now)

What: every constellation/tree node counts as allocated for all runs —
no point spending, no allocation UI needed. Keep the tree data and the
skill-point reward counter intact (points still accumulate and display)
so the system can be re-enabled later; log to QUESTIONS.md whether this
is dev-only or the intended live behavior for 1.0 (default: applies in
dev AND normal play until owner says otherwise).
Spec ref: SPEC-FINAL §8.3 — temporary supersede.
Done when: a fresh profile plays with all node effects active; skill
points still accrue and show; tree screen shows everything allocated;
gates that measured point economies are skipped with this reason.
Priority: normal
