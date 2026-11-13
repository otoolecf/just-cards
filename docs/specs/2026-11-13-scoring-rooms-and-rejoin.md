# TDD Spec: Score correction, shared scoring rooms and clear rejoin

## Intent

Undo should reopen the scores that were just entered so one correction does not
require entering everyone's scores again. Physical scoring should be watchable
from an invite on another phone, with one scorekeeper at a time. Returning to a
virtual table should present only the next relevant recovery action.

## In Scope

- Restore the latest applied score entry after successful undo, including after
  reload and repeated undo/redo; preserve zero and negative manual points.
- Publish an existing synced score sheet as a shared scoring room with an invite.
- Read-only spectators, server-enforced scorekeeper credentials, explicit release,
  and atomic takeover after 60 seconds without a visible scorekeeper heartbeat.
- Shared writes require a connection and the current event count. Personal sheets
  retain offline scoring; viewers must never queue unauthorized offline changes.
- Show one paused-table recovery action at a time; hide deal actions while paused.
- Deploy only a separate staging Worker with separate D1 and Durable Object data.

## Out of Scope

- Accounts, simultaneous editors, changes to game rules or production deployment.

## Expected Outcomes / Acceptance Criteria

- [x] Undo fills every submitted player's edit boxes, allowing one value to change.
- [x] Invite viewers see roster, totals and history update without editing controls.
- [x] Server rejects spectator and former-keeper writes, including alternate API paths.
- [x] Active keepers cannot be displaced; release or inactivity enables one takeover.
- [x] A returning keeper becomes read-only after another device takes over.
- [x] Paused recovery shows return, resume, takeover or check in priority order;
      unavailable actions are explained as text and deal controls are hidden.
- [x] Staging screenshots and browser checks demonstrate each requested change.

## Data and Rules

Scores remain derived from accepted events. Persist only a hash of the current
scorekeeper capability and its last heartbeat alongside the session, never in public
views or invite URLs. Atomic session repository operations serialize ownership and
score changes. Existing unshared sessions retain their compatibility contract.

## Test Plan (Red -> Green)

- Unit: find the latest applied entry through undo/redo/branching and restore
  manual points/card entries, including zero/negative and omitted players.
- Integration: shared activation, credential privacy, unauthorized append/create,
  heartbeat, release, timeout, competing takeover, stale count, credential revocation.
- Browser: two independent phones, undo correction, read-only live updates, reload,
  takeover and revoked keeper; one rejoin action and no paused deal controls.
- Run relevant regression tests, full unit suite, `npm run check`, `npm run build`.

## Implementation Notes

Reuse SessionRepository and CardRoom SQLite; polling fits the existing scoring
transport. No new services. Reuse semantic UI primitives and 44px controls.

## Rollback Plan

Revert the feature branch or redeploy staging's prior version. Do not modify the
production Worker, production routes, D1 or Durable Object namespaces.

## Verification

- 576 unit tests passed; type/UI checks and production build passed.
- Four deployed staging browser scenarios passed, including a real 60-second
  inactivity takeover, correction after reload, raw card-row restoration, rejected
  spectator writes and one-button rejoin.
- Seven related local browser regressions passed; one environment-specific test
  was skipped. Screenshots, URL/time metadata and the deployed browser report are
  saved in the ignored `.output/staging-evidence/` directory.
