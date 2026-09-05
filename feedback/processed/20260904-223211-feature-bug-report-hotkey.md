[feature] In-game bug report hotkey: replay-attached, straight into the inbox

What: press F8 at any moment in a run (dev mode). A small box opens for a
one-line note; on confirm the game writes, via the dev-server endpoint
(same pattern as the Tuner's save), a bug file into D:\lidl_inbox named
bug-<timestamp>.md containing: the note; class, Core, tier, wave/phase,
sim tick; the run seed and the full input log (or a path to a saved
replay file under /replays); the content hash; and a screenshot PNG path
captured from the canvas at that moment. The loop treats it as a normal
[bug] file and the qa/dev agent reproduces it by replaying to that tick.
Prod builds: F8 downloads the same bundle as a file instead.
Spec ref: SPEC-FINAL 11/12 (determinism, dev tooling).
Done when: F8 produces the file + screenshot + replay; a test replays a
saved bundle to the recorded tick with matching hash; the CLAUDE.md
feedback rule mentions replay bundles as first-class repros.
Priority: top
