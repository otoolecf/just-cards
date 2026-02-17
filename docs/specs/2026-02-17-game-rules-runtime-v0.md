# TDD Spec: game-rules-runtime-v0

_Status: Implemented_
_Owner: Connor + agents_
_Date: 2026-02-17_

## 1) Intent

Enable real game-rule execution by composing gameplay state, play validation, scoring triggers, and manual scoring in one declarative backend runtime.
The runtime must remain rules-as-data first, avoid per-game hardcoded logic, and allow scoring workflows both with gameplay events and as standalone/manual score entry.

## 2) In Scope

- Add a runtime orchestrator that consumes mixed gameplay + scoring event streams.
- Add declarative gameplay scoring triggers (event-based, zone/card sourced, scorer primitives).
- Add validator-backed gameplay enforcement for `zone_move` mechanics in gameplay state derivation.
- Add manual score delta primitives that do not require card inputs or gameplay state.
- Keep existing scorekeeper/gameplay modules backward compatible.

## 3) Out of Scope

- Full NLP/LLM rule ingestion pipeline from rule URLs.
- Exhaustive game-authentic implementations for every rule edge case in all card games.
- UI flow changes for new runtime controls.

## 4) Expected Outcomes

1. A data-only game runtime can process gameplay events and emit scoring outcomes via configured trigger primitives.
2. Play legality (`canPlay`) can be enforced during gameplay event application without game-specific hardcoding.
3. Score totals can be entered and derived manually without gameplay events.
4. The same scoring engine can aggregate direct/manual scoring plus gameplay-triggered scoring.

## 5) Acceptance Criteria

- [x] Runtime supports mixed event stream (`gameplay`, `score`, `manual_score`) and returns deterministic state.
- [x] Gameplay `zone_move` can be blocked by validator rule packs when configured.
- [x] Trigger primitives support at least:
  - event cards
  - player-zone cards
  - card-value scoring
  - pattern scoring
  - fixed-point scoring
- [x] Manual score delta events can be undone/redone via scorekeeper event log semantics.
- [x] Runtime proves representative flows for Golf/Cribbage/500 Rummy/Texas Hold'em style scoring and legality patterns via tests.

## 6) Data and Rules

- Rule/data inputs:
  - `GameplayRulePack`
  - `ValidatorRulePack`
  - `RulePack` (score rules)
  - `RuntimeScoringTrigger[]`
  - `RuntimeEvent[]`
- Key invariants:
  - deterministic replay from event logs
  - no hardcoded per-game behavior in runtime
  - gameplay-derived scoring and direct/manual scoring can be used independently

## 7) Test Plan (Red -> Green)

### Unit Tests (expected to fail first)

- [x] `derive_state_supports_add_delta_manual_scoring_events`
- [x] `derive_state_add_delta_respects_undo_redo`
- [x] `derive_game_state_zone_move_can_enforce_validator_pack`

### Integration/Behavior Tests (expected to fail first)

- [x] `runtime_zone_move_trigger_scores_event_cards_to_actor`
- [x] `runtime_end_round_trigger_scores_all_player_hand_zones`
- [x] `runtime_pattern_trigger_scores_detected_matches`
- [x] `runtime_manual_scoring_works_without_gameplay_events`
- [x] `runtime_supports_rummy_style_set_or_run_play_validation`

## 8) Implementation Notes

- Planned files:
  - `/Users/ConnorO/git_repos/just-cards/src/lib/gameplay/engine.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/scorekeeper/engine.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/runtime/game-runtime.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/runtime/game-runtime.test.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/scorekeeper/engine.test.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/gameplay/engine.test.ts`
- Constraints:
  - Keep finite primitives explicit via enums/discriminated unions.
  - Preserve backward compatibility for existing APIs/tests.

## 9) Verification Checklist

- [x] Tests written before implementation
- [x] Tests fail first (red)
- [x] Implementation added (green)
- [x] Refactor performed without behavior drift
- [x] `npm run check` passes
- [x] `npm run build` passes

## 10) Rollback Plan

- Revert runtime module usage and continue using direct `deriveGameState` + `deriveState` independently.
- Keep manual score entry via existing `add_round` path if delta events need temporary disablement.
