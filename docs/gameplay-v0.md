# Gameplay v0 (Hand State)

This document defines the gameplay-state primitive that tracks:

- player roster
- visible/private zone state (`hand`, `table`, `discard`, `meld`, etc.)
- turn order and dealer progression
- phase sequencing
- simple undo/redo behavior for game-state events

`gameplay/v0` is intentionally narrow: it tracks state, order, and legal move scaffolding.
Action legality is handled by the gameplay validator (`src/lib/gameplay/validator.ts`).
Scoring remains separate and is handled by the score primitives in `scorekeeper`.
When needed, `deriveGameState` can enforce validator rules for `zone_move` via
`DeriveGameplayStateOptions.playValidation`.

## Inputs

- `GameEvent[]` with event types:
  - `init_game`
  - `start_round`
  - `set_phase`
  - `deal_cards`
  - `zone_move`
  - `advance_turn`
  - `end_round`
  - `undo` / `redo`
- `GameplayRulePack`
- Optional derive options:
  - `playValidation.rulePack` (`validator/v0`)
  - `playValidation.zoneMoveActionType` (example: `meld`)

## Core Behaviors

1. **Replayable state derivation**
   - `deriveGameState(events, rulePack)` reproduces current state from the event log.
2. **Zone movement**
   - `zone_move` moves card objects between zones with source availability checks and policy checks.
3. **Turn and phase enforcement**
   - Move actions can be constrained to `phase` and active actor by rule pack policy.
4. **Round progression**
   - `start_round` can rotate dealer and set the next phase when round mode is enabled.
5. **Validation-first**
   - Invalid events are reported via `validationIssues` and skipped from mutation.
6. **Undo/redo**
   - `undo` and `redo` replay the event log cursor for deterministic state rehydration.

## Rule-Driven Options

### Zones and Turns

- `zoneMovePolicy`:
  - allowed phases
  - actor must be current player
  - source ownership enforcement
  - allowed source/target zones
  - min/max card counts
- `turnPolicy.direction`: supports forward (`1`) and reverse (`-1`) turn order.

### Round model

- `roundPolicy.enabled`:
  - `false` disables `start_round` events (they return validation issues).
  - `true` enables round lifecycle events.
- `roundPolicy.rotateDealerBetweenRounds`:
  - rotate dealer every `start_round` when enabled.
- `roundPolicy.clearTableZonesOnRoundStart`:
  - list of table zones that reset when a round starts.

## Invariants

- The same event list must derive to the same state every time.
- A source zone must contain requested cards to execute `zone_move`.
- Card movement does not mutate untouched player zones.
- `validationIssues` should remain stable and explain reasons for each skipped operation.

## Cross-Reference

- Scoring abstraction: [`scorekeeper-rules.md`](./scorekeeper-rules.md)
- Gameplay plan: [`specs/2026-02-16-gameplay-v0-hand-state.md`](./specs/2026-02-16-gameplay-v0-hand-state.md)
- Runtime schema checks: [`specs/2026-02-16-rulepack-runtime-schema-validation.md`](./specs/2026-02-16-rulepack-runtime-schema-validation.md)
- Validator behavior: [`specs/2026-02-16-gameplay-v0-validator.md`](./specs/2026-02-16-gameplay-v0-validator.md)
- Canonical primitive catalog: [`primitives-kb-v0.md`](./primitives-kb-v0.md)
