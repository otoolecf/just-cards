# Stable scorekeeper rows

Keep Current score in the same roster order as score entry, across rounds, reloads and undo. Compute rank separately using the configured win direction. Show ordinal ranks; tied totals share rank (1st, 1st, 3rd) and explicitly say Tied. Highlight all leaders, not the first row. Preserve score math, events and the existing sorted helper for other callers. Before any scores, retain the empty state; once scoring starts, unscored roster players have zero.

Tests first: low/high wins, changing leaders without moving rows, ties, absent totals and ordinal suffixes. Run full suite, check and build. No deployment.
