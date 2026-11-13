# TDD Spec: Disable round entry at the scoring round limit

## Intent

When a score sheet reaches its configured round count, Add round must be disabled.
Undo must remain available so the scorekeeper can restore and correct the final
round, then submit it again without exceeding the limit.

## In Scope

- Gate the scoring Add round button and its submit handler on existing event-derived
  round completion, including saved and shared sheets.
- Keep Undo and Redo available. Undo re-enables entry; re-adding or redoing the final
  round disables it again. Preserve restored score inputs.
- Explain that undoing the final round allows a correction.
- Continue to allow entry on open-ended and raw score sheets.

## Out of Scope

- Changing gameplay, score storage/API contracts, target-score endings, or round counts.
- Rewriting or removing events from sheets already over their configured limit.

## Expected Outcomes / Acceptance Criteria

- [x] Add round is disabled when completed rounds meet or exceed the configured total.
- [x] Both guided-card and manual-point entry respect the same limit.
- [x] Undo restores inputs and enables correction; resubmission and Redo restore the lock.
- [x] Reload retains the lock; shared viewers still see the correct round count.
- [x] Score sheets without a fixed round count remain editable.

## Data and Rules

Use `scoreRoundProgress` and the saved guided profile/catalog fallback already used
by the round banner. Its active-event replay handles Undo, Redo and corrected branches.
The same metadata applies to any configured total; no game-name or nine-round branch.

## Test Plan (Red -> Green)

- Extend the Golf shared-round browser regression with disabled-button assertions
  at completion, guided/manual tab changes, Undo/Redo, corrected resubmission and reload.
- Existing result-sharing checks cover raw sheets that remain editable after export.
- Run round-progress unit coverage, focused browser regressions, full unit suite,
  `npm run check`, and `npm run build`.

## Implementation Notes

Change the score page's Add round action and handler; retain the current shared
button primitive and disabled styling. Update scorekeeper behavior documentation.

## Rollback Plan

Revert this change. Existing scores and event histories require no migration.

## Verification

- The new browser assertion first failed because Add round remained enabled at nine rounds.
- 603 unit tests and four local browser scenarios passed, including shared completion,
  Undo/Redo, corrected resubmission, reload, sharing and open-ended raw scoring.
- `npm run check` and `npm run build` passed.
