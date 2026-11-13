# TDD Spec: Prominent scoring round progress

## Intent

Physical scoring should make the current round as easy to find as virtual play.
Golf should show “Round 1 of 9” before the first score and “Round 2 of 9” after
the first submitted round, for the scorekeeper and everyone watching.

## In Scope

- A prominent, mobile-friendly round banner immediately after the page header.
- Rules-driven round metadata in the guided session snapshot: a fixed total where
  declared, or an open-ended round count for round-based table policies.
- Derive progress from active scoring events, including undo, redo and branching.
- Count manual-point/card-round submissions once each; ignore pattern bonuses and
  pool settlements. A submission is a round even if only one player's score is entered.
- Completion text after the configured final round, without displaying round 10 of 9
  or changing existing score-entry permissions.
- Retain new metadata on reload/offline/shared viewing. Legacy snapshots may recover
  display metadata from the exact matching catalog ruleset; never guess a game ID.
- Verify and deploy to the existing isolated staging site only.

## Out of Scope

- Changing scoring rules, adding round editing, enforcing a game-end lock, or
  adding a round counter to raw calculators, rubber Bridge, Mahjong or Solitaire.

## Expected Outcomes / Acceptance Criteria

- [x] Golf begins at Round 1 of 9 and advances once per submitted round.
- [x] Undo/redo, corrections, reload and shared spectators show matching progress.
- [x] Fixed-round completion is clear; extra accepted entries never show 10 of 9.
- [x] Round-based games without a fixed total show Round N.
- [x] Raw calculators and policies with separate progress systems omit the banner.
- [x] Only semantic tokens are used; mobile layout and accessibility stay intact.

## Data and Rules

Copy display-only `roundProgress: { total?: number }` from executable table rules
into GuidedScoreProfile. Use declared round-end capabilities and scoring.rounds,
not names or IDs. Existing score events remain the source of truth; no mutable
round counter or storage migration is needed. Snapshot metadata takes precedence
over catalog fallback for older sessions.

## Test Plan (Red -> Green)

- Unit: metadata derivation, immutable snapshot serialization, active event replay,
  manual/card input, pattern/settlement exclusion, undo/redo branches, completion,
  unknown totals and absent capabilities.
- Browser: two mobile browsers show Round 1/2 of 9, undo/redo, reload, read-only
  spectator sync, final completion and no overflow. Capture staging screenshots.
- Run unit tests, `npm run check`, `npm run build` and the browser regression.

## Implementation Notes

Reuse the applied-score replay helper and existing semantic panel/type tokens.
Preserve personal offline scoring, shared ownership and gameplay behavior.

## Rollback Plan

Revert this change or redeploy staging's previous version; no event or storage
format migration is required. Do not deploy to production.

## Verification

582 unit tests, `npm run check` and `npm run build` passed. The two-browser mobile
scenario passed locally and against the deployed staging Worker, including all
nine rounds, synchronized undo/redo, reload, read-only viewing and completion.
Staging screenshots, URL/time metadata and the browser report are saved in the
ignored `.output/score-round-evidence/` directory.
