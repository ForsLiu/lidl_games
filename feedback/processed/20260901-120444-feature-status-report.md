[feature] STATUS.md — regenerating balance and state snapshot for the owner

What: a tool `npm run status` that writes STATUS.md at the repo root with:
- Gate table: every G gate with pass / fail / skipped and its measured
  number (win rates, shares, run length) and the re-enable pointer.
- Balance snapshot: per class and per Core T1/T3 win rates (latest sweep),
  wielded-type damage shares, boon pick rates, mean run length, timeout
  count.
- Content census vs SPEC-FINAL 13 (built / missing).
- Feedback ledger: every owner inbox file with its item id and status
  (done / queued / superseded).
- Open owner decisions: QUESTIONS entries still pending.
Run it automatically at every phase completion and every 20 iterations;
commit the result.
Done when: `npm run status` produces the file from live data; it is
committed and current as of the latest gate measurements.
Priority: top
