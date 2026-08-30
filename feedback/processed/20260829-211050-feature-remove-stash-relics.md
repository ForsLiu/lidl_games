[feature] Remove stash and relic windows; equipment lives in one screen

What: the old relic system's UI and the separate stash window are
obsolete now that SPEC-FINAL 7 equipment exists. Remove both. Supersedes
the "stash holds earned items" line in the equipment-realize item.
- One Equipment screen (Hub + in-run via character panel): six slot
  boxes, plus the owned-items list beside them; click an owned item to
  equip/swap into its slot; no separate stash window, no relic tabs.
- Delete relic UI remnants everywhere (windows, tooltips, results
  screens, quest text); relic data structures may remain internally only
  if saves need them for migration.
- Save migration: items in old stash saves appear in the new owned list;
  old relics are dropped with a one-time notice.
Spec ref: SPEC-FINAL 7, 11 - supersedes stash references.
Done when: no stash or relic window is reachable; equipping works from
the Equipment screen in Hub and mid-run; migration test covers an old
save; grep-level test proves no relic-window code paths remain.
Priority: normal
