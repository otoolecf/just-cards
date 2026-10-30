# TDD Spec: scorekeeper-round-entry

## Intent

Enable players to track card-game scores without pen and paper, with minimal manual math. The system should apply base card values plus ordered rule modifiers (including game-specific overrides), compute round totals, and maintain standings. It must also support undo/redo to recover from entry mistakes quickly.

## In Scope

- Rule-driven card value resolution for number cards and face cards.
- Round scoring for multiple players from a set of cards.
- Round scoring to generalized targets (`player`, `team`, `pool`) for pair/pool games.
- Derived standings from an event stream.
- Undo and redo for the most recent score events.

## Out of Scope

- Any UI beyond existing app scaffold.
- Multiplayer sync, networking, or persistence layers (D1/Durable Objects).
- Full game-rule parsing from external text/web pages.
- Play legality validation (`canPlay`) and pattern detection (`whatPatternsExist`) beyond card-value scoring.

## Expected Outcomes

1. Given round card input, the engine returns per-player round totals and cumulative standings.
2. Card values are controlled by the active `RulePack` (e.g., face cards as `10` or `11/12/13`, ace low or high).
3. Undo/redo modifies derived standings predictably without mutating historical events.

## Acceptance Criteria

- [ ] Rule pack supports configurable per-rank values (including face cards and ace).
- [ ] Applying one round updates standings for all players in that round.
- [ ] Applying one round updates totals for addressed scoring targets (player/team/pool).
- [ ] Undo removes the latest applied scoring change from derived standings.
- [ ] Redo reapplies the last undone change and restores prior standings.

## Data and Rules

- Rule/data inputs:
  - `RulePack` with base rank values and ordered modifiers.
  - `ScoreEvent` stream with `add_round`, `undo`, `redo`.
  - Per-player round cards (`A,2..10,J,Q,K`) with optional designator tags.
- Key invariants:
  - Standings are derived from events, not manually mutated totals.
  - Undo/redo affect only derivation state and preserve prior events.

## Test Plan (Red -> Green)

List tests before implementation.

### Unit Tests (expected to fail first)

- [ ] `card_value_face_cards_are_10`: verifies `J/Q/K` resolve to `10`.
- [ ] `card_value_modifier_can_set_non_face_cards_to_5`: verifies modifier-based non-face override.
- [ ] `card_value_modifier_can_set_face_cards_to_10`: verifies modifier-based face-card override.
- [ ] `card_value_modifier_allows_specific_override_after_general_override`: verifies ordered overrides (example: rank 2 => -2).
- [ ] `card_value_modifier_allows_designator_tags`: verifies tag-based override (example: ace_high tag).
- [ ] `card_value_numeric_cards_match_rank`: verifies numeric ranks map directly.
- [ ] `add_round_updates_player_totals`: verifies one round updates cumulative standings.
- [ ] `undo_reverts_last_round_effect`: verifies undo removes last round impact.
- [ ] `redo_reapplies_last_undone_round`: verifies redo restores last undone round.

### Integration/Behavior Tests (expected to fail first)

- [ ] `derive_standings_from_event_log`: verifies event stream order controls final standings.
- [ ] `derive_standings_with_alternate_modifiers`: verifies same events derive differently under a different modifier set.
- [ ] `derive_standings_with_per_card_designator_tags`: verifies tag-driven card overrides in a single event.

## Implementation Notes

Keep short and concrete. Include touched files/modules and why.

- Planned files:
  - `src/lib/scorekeeper/engine.ts`
  - `src/lib/scorekeeper/engine.test.ts`
- Constraints:
  - Keep logic pure and deterministic with no network/storage dependencies.
  - Keep API minimal so later D1/DO adapters can wrap it.

## Rollback Plan

If behavior fails in real usage, how to disable/revert safely?

- Disable scorekeeper engine integration points and use manual entry fallback.
- Revert to previous known-good scoring engine commit while preserving specs/tests.
