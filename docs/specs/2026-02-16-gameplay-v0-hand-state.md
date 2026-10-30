# TDD Spec: gameplay-v0-hand-state

## Intent

Define a gameplay primitive for card hand state that supports turn order, round lifecycle, and card zone transitions (`hand`, `meld`, `table`, `discard`) in a deterministic event-log model. This should let us express the gameplay side of games independently from raw point scoring.

## In Scope

- Player roster and table setup.
- Turn order and current turn tracking.
- Game phases and phase transition checks.
- Dealer/round lifecycle.
- Zone-based card movement (`zone_move`) with actor authorization and source-card validation.
- Undo/redo of gameplay mutations.
- Validation diagnostics with strict vs non-strict mode.

## Out of Scope

- Real-time multiplayer transport (Durable Objects/WebSockets).
- Full rule-specific `canPlay` DSL (e.g., trick legality, bidding, meld minimums).
- Persistent storage/API schema integration.

## Expected Outcomes

1. Gameplay state can be derived from an event log independent of scoring state.
2. Only legal actors can move cards during restricted phases.
3. Round/dealer progression is deterministic.
4. Invalid events report issues; strict mode blocks derivation.

## Acceptance Criteria

- [ ] `init_game` initializes players, dealer, and turn cursor.
- [ ] `start_round` advances round and rotates dealer.
- [ ] `zone_move` validates actor authority, source ownership, and card availability.
- [ ] `advance_turn` rotates turn order.
- [ ] Invalid events are surfaced as validation diagnostics.
- [ ] `undo`/`redo` restore gameplay state for action sequencing.

## Data and Rules

Inputs:

- `GameEvent[]`
- `GameplayRulePack` (`schemaVersion: gameplay/v0`)

Invariants:

- Derived state is deterministic for identical events and rules.
- Card movement preserves counts and cannot remove cards not owned by event actor.

## Test Plan (Red -> Green)

### Unit Tests (expected to fail first)

- [x] `init_game_sets_turn_order_and_dealer`
- [x] `deal_cards_populate_player_hands`
- [x] `play_phase_requires_current_actor_to_move_cards`
- [x] `advance_turn_cycles_round_robin`
- [x] `start_round_rotates_dealer_and_starts_new_round`
- [x] `zone_move_rejects_missing_cards_in_source_zone`
- [x] `strict_validation_throws_on_invalid_game_rule_pack`
- [x] `non_strict_mode_collects_validation_issues`
- [x] `undo_and_redo_work_on_replayable_state`
- [x] `trace_records_validation_failures`

### Integration/Behavior Tests (expected to fail first)

- [x] `undo_and_redo_replay_mutating_events`
- [x] `derive_game_state_trace_includes_validation_events`

## Implementation Notes

- New modules:
  - `src/lib/gameplay/engine.ts`
  - `src/lib/gameplay/engine.test.ts`
  - `docs/gameplay-v0.md`
- Keep gameplay engine decoupled from scoring engine; both consume events and produce derived state.

## Rollback Plan

- Restrict implementation to read-only event replay until rules stabilize.
- Keep only phase/turn primitives and remove zone movement expansion if it proves brittle.
