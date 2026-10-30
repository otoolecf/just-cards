# TDD Spec: scorekeeper-score-priority-ui

## Intent

Score totals should be the most prominent information in an active scorekeeping session. Users adding rounds should immediately see who is leading without scanning to secondary sections. The UI should surface current totals above scoring inputs and events.

## In Scope

- Add a primary "Current score" panel in active-session view.
- Render per-player totals in a high-contrast, glanceable layout.
- Keep existing add-round, pattern, and events flows unchanged.

## Out of Scope

- New scoring rules or score math behavior changes.
- Multiplayer/live sync model changes.

## Expected Outcomes

1. Active session shows a "Current score" section near the top.
2. Totals remain derived from session state and update after add-round events.
3. Add-round UX remains functional.

## Acceptance Criteria

- [x] Active session renders `Current score` heading.
- [ ] At least one score card is visible when totals exist.
- [x] Existing score flow tests remain green.

## Data and Rules

- Inputs:
  - `GET /api/sessions/{sessionId}` derived totals.
- Invariants:
  - Score display reads `sessionState.state.totalsByPlayer`.
  - No client-side manual totals.

## Test Plan (Red -> Green)

### Integration/Behavior Tests (before implementation)

- [x] `active session prioritizes current score panel`: score panel exists and is visible in active mode.

## Implementation Notes

- Planned files:
  - `tests/e2e/scorekeeper.spec.ts`
  - `src/routes/+page.svelte`
- Keep layout mobile-first and avoid dense table UI.

## Rollback Plan

- Revert to previous standings block-only layout.
- Keep score derivation backend unchanged.
