# TDD Spec: scorekeeper-mode-driven-standings-order

_Status: Complete_
_Owner: Connor + agents_
_Date: 2026-02-18_

## 1) Intent

The score leaderboard currently always sorts high-to-low, which is incorrect for low-score-wins games like Six Card Golf. Users need standings order to follow game rule intent so the top row always reflects the current leader according to that game mode. This change makes standings order mode-driven from score mode primitives (`high_wins` vs `low_wins`) instead of a single hardcoded order.

## 2) In Scope

- Add a score-mode primitive for win direction (`high_wins` or `low_wins`).
- Add deterministic standings sort helper that uses win direction.
- Update score page standings rendering to use mode-driven sorting.

## 3) Out of Scope

- Changes to score math primitives themselves.
- Additional game mode creation.

## 4) Expected Outcomes

1. Six Card Golf sessions show lowest total at the top of leaderboard.
2. 500 Rummy/Standard/Cribbage keep highest total at the top.
3. Unknown mode ids fail safe to high-wins behavior.

## 5) Acceptance Criteria

- [x] `ScoreModeOption` carries win direction metadata.
- [x] Standings sort helper orders totals based on mode win direction.
- [x] Score page standings are rendered via the mode-driven helper.
- [x] Unit tests verify high-wins, low-wins, and unknown-mode fallback ordering.

## 6) Data and Rules

- Rule/data inputs:
  - `sessionState.config.scoreModeId`
  - `sessionState.state.totalsByPlayer`
  - `SCORE_MODE_OPTIONS`
- Key invariants:
  - Sort ties alphabetically by player id.
  - Unknown or missing mode id defaults to `high_wins`.

## 7) Test Plan (Red -> Green)

### Unit Tests (expected to fail first)

- [x] `score_mode_presets_include_win_direction`: verifies mode metadata includes correct direction for golf and rummy.
- [x] `sort_standings_by_mode_orders_high_wins`: verifies descending score sort.
- [x] `sort_standings_by_mode_orders_low_wins`: verifies ascending score sort.
- [x] `sort_standings_by_mode_unknown_mode_defaults_high_wins`: verifies safe fallback.

### Integration/Behavior Tests (expected to fail first)

- [x] score page contract includes use of `sortStandingsByMode` helper.

## 8) Implementation Notes

- Planned files:
  - `/Users/ConnorO/git_repos/just-cards/src/lib/session/score-session-commands.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/session/score-session-commands.test.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/routes/+page.svelte`
  - `/Users/ConnorO/git_repos/just-cards/src/routes/score-page-contract.test.ts`
- Constraints:
  - Keep rule behavior data-driven and mode-based, not game-id hardcoded.
  - Preserve existing score page layout and control interactions.

## 9) Verification Checklist

- [x] Tests written before implementation
- [x] Tests fail first (red)
- [x] Implementation added (green)
- [x] Refactor performed without changing behavior
- [x] `npm run check` passes
- [x] `npm run build` passes

## 10) Rollback Plan

- Revert score page to previous static descending sort.
- Remove win-direction metadata and helper exports.
