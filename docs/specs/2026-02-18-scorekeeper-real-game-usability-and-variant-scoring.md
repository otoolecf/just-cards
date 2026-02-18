# TDD Spec: scorekeeper-real-game-usability-and-variant-scoring

_Status: Complete_
_Owner: Connor + agents_
_Date: 2026-02-18_

## 1) Intent

The score page currently mixes setup, ruleset generation, and active scoring controls in a way that makes single-operator live scoring harder than necessary. We need a clearer score-first layout and deterministic scoring helpers for real card-game variants so one scorer can run physical-table games (or mirror in-browser games) without manual math mistakes. This pass adds variant-aware scoring-assist primitives and updates the score page UX to prioritize quick entry and clarity.

## 2) In Scope

- Reorganize score-page layout so session setup/active scoring is primary and ruleset generation is secondary.
- Add add-round entry modes for manual deltas and variant scoring assists.
- Add deterministic scoring-assist primitives for:
  - 500 Rummy net round (`table points - hand points`)
  - Six Card Golf hole scoring (2x3 layout with same-column pair zero rule)
- Wire score-page submit flow to post `add_delta` events for assist-driven rounds.
- Add backend unit tests proving card/value primitive correctness for these rule examples.

## 3) Out of Scope

- Full multiplayer real-time scoring workflow changes.
- Automatic gameplay-to-score synchronization for every play action.
- Exhaustive rules coverage for all Rummy/Golf house variants.

## 4) Expected Outcomes

1. The score page is easier to scan for a lay scorer: start/join and active scoring controls are prominent, and optional ruleset tools are visually secondary.
2. A scorer can submit per-player manual point deltas without entering cards.
3. A scorer can submit a 500 Rummy net round by entering table cards and hand cards.
4. A scorer can submit a Six Card Golf hole by entering a 2x3 card layout and using deterministic column-pair logic.
5. Deterministic tests verify these primitives against known example outcomes.

## 5) Acceptance Criteria

- [x] Score page keeps the primary scoring flow above optional tools.
- [x] Add-round supports `rows`, `text`, `delta`, `rummy-net`, and `golf-hole` entry modes.
- [x] `delta` mode posts `add_delta` with per-player signed points.
- [x] `rummy-net` mode computes per-player delta as `sum(tableCards) - sum(handCards)` using 500 Rummy card values.
- [x] `golf-hole` mode computes per-player hole score using Six Card Golf values and column pair-zero rule in a 2x3 layout.
- [x] Unit tests cover both assists and mode presets; tests are red before implementation and green after.

## 6) Data and Rules

- Rule/data inputs:
  - Existing `rulepack/v0` card value primitives from `scorekeeper/engine`.
  - `add_delta` events as canonical manual/assist score ingestion.
  - Parsed card text inputs from score page.
- Key invariants:
  - Session totals remain derived from server event log (`deriveState`), never client-authored totals.
  - Variant assists are deterministic functions from parsed cards to signed deltas.
  - Six Card Golf helper requires exactly 6 cards in row-major 2x3 order.

## 7) Test Plan (Red -> Green)

### Unit Tests (expected to fail first)

- [x] `rummy_mode_preset_matches_500_rummy_value_rules`: mode preset card values match A=15, 2-10 face value, J/Q/K=10.
- [x] `build_add_delta_event_posts_player_targets`: helper produces valid `add_delta` payload.
- [x] `calculate_rummy_500_net_round_delta_from_table_minus_hand`: deterministic delta output for sample round.
- [x] `calculate_six_card_golf_hole_scores_column_pair_zero`: deterministic pair-in-column zero behavior.
- [x] `calculate_six_card_golf_hole_requires_exactly_six_cards`: helper validates shape.

### Integration/Behavior Tests (expected to fail first)

- [x] Score-page source contract includes new add-round mode labels and helper section copy.

## 8) Implementation Notes

- Planned files:
  - `/Users/ConnorO/git_repos/just-cards/src/lib/session/score-session-commands.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/session/score-session-commands.test.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/routes/+page.svelte`
  - `/Users/ConnorO/git_repos/just-cards/src/routes/score-page-contract.test.ts` (new)
  - `/Users/ConnorO/git_repos/just-cards/docs/specs/2026-02-18-scorekeeper-real-game-usability-and-variant-scoring.md`
- Constraints:
  - Keep mobile-first touch targets >= 44px.
  - Use existing semantic token classes/variables (`--jc-*`, `jc-*`), no ad-hoc theme drift.

## 9) Verification Checklist

- [x] Tests written before implementation
- [x] Tests fail first (red)
- [x] Implementation added (green)
- [x] Refactor performed without changing behavior
- [x] `npm run check` passes
- [x] `npm run build` passes

## 10) Rollback Plan

- Remove new add-round assist modes from score page and keep existing rows/text flow.
- Keep helper functions internal and unused, preserving current event-log behavior.
