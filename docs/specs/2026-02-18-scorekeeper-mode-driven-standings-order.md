# TDD Spec: scorekeeper-mode-driven-standings-order

## Intent

The score leaderboard currently always sorts high-to-low, which is incorrect for low-score-wins games like Six Card Golf. Users need standings order to follow game rule intent so the top row always reflects the current leader according to that game mode. This change makes standings order mode-driven from score mode primitives (`high_wins` vs `low_wins`) instead of a single hardcoded order.

## In Scope

- Add a score-mode primitive for win direction (`high_wins` or `low_wins`).
- Add deterministic standings sort helper that uses win direction.
- Update score page standings rendering to use mode-driven sorting.

## Out of Scope

- Changes to score math primitives themselves.
- Additional game mode creation.

## Expected Outcomes

1. Six Card Golf sessions show lowest total at the top of leaderboard.
2. 500 Rummy/Standard/Cribbage keep highest total at the top.
3. Unknown mode ids fail safe to high-wins behavior.

## Acceptance Criteria

- [x] `ScoreModeOption` carries win direction metadata.
- [x] Standings sort helper orders totals based on mode win direction.
- [x] Score page standings are rendered via the mode-driven helper.
- [x] Unit tests verify high-wins, low-wins, and unknown-mode fallback ordering.

## Data and Rules

- Rule/data inputs:
  - `sessionState.config.scoreModeId`
  - `sessionState.state.totalsByPlayer`
  - `SCORE_MODE_OPTIONS`
- Key invariants:
  - Sort ties alphabetically by player id.
  - Unknown or missing mode id defaults to `high_wins`.

## Test Plan (Red -> Green)

### Unit Tests (expected to fail first)

- [x] `score_mode_presets_include_win_direction`: verifies mode metadata includes correct direction for golf and rummy.
- [x] `sort_standings_by_mode_orders_high_wins`: verifies descending score sort.
- [x] `sort_standings_by_mode_orders_low_wins`: verifies ascending score sort.
- [x] `sort_standings_by_mode_unknown_mode_defaults_high_wins`: verifies safe fallback.

### Integration/Behavior Tests (expected to fail first)

- [x] score page contract includes use of `sortStandingsByMode` helper.

## Implementation Notes

- Planned files:
  - `src/lib/session/score-session-commands.ts`
  - `src/lib/session/score-session-commands.test.ts`
  - `src/routes/+page.svelte`
  - `src/routes/score-page-contract.test.ts`
- Constraints:
  - Keep rule behavior data-driven and mode-based, not game-id hardcoded.
  - Preserve existing score page layout and control interactions.

## Rollback Plan

- Revert score page to previous static descending sort.
- Remove win-direction metadata and helper exports.
