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
7. **Face visibility via card tags**
   - Cards can carry visibility tags for hidden-information games:
     - `face:down`
     - `face:up`
   - `zone_move` preserves tags unless caller intentionally flips state by sending updated card tags.
   - This allows games like Six Card Golf to start with mixed hidden/revealed cards.
8. **Layout slot tagging (optional)**
   - Cards can carry slot tags for stable grid ordering:
     - `slot:r<row>c<col>` (example: `slot:r2c3`)
   - Slot tags are UI-facing metadata; they do not alter legality/score derivation.
   - Useful for games where arrangement affects interpretation (example: Golf column pairs).

## Rule-Driven Options

### Zones and Turns

- `zoneMovePolicy`:
  - allowed phases
  - actor must be current player
  - source ownership enforcement
  - allowed source/target zones
  - min/max card counts
- `turnPolicy.direction`: supports forward (`1`) and reverse (`-1`) turn order.
- `turnActionPolicy` (optional draw/resolve sequencing):
  - `enabled`
  - `allowedPhases`
  - `drawFromZoneAllowlist`
  - `resolveToZoneAllowlist`
  - `requireDrawBeforeResolve`
  - `requireResolveAfterDraw`
  - `drawSourcePolicies?[]`:
    - `zoneId`
    - `minCards`
    - `maxCards?`
    - `requireContiguousFromTop?`
    - `requireResolveIncludesAnchor?`
    - `requiredResolveTargetZoneAllowlist?`

When enabled, `turnActionPolicy` allows rulesets to enforce turn flow such as:
1. draw from stock/discard first
2. resolve to discard/meld/board next
3. prevent repeated draws before resolution

`drawSourcePolicies` allow per-source draw constraints used by discard-pickup games:
1. force draw-card count ranges for a specific source zone,
2. require selected cards to be a contiguous run ending at the top of the source stack,
3. require resolve action to include the picked anchor card from the draw batch.

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
- `zone_move` identity prefers `cid:*` tag matching when present, so face/tag transforms can move the same physical card deterministically.
- When configured, discard-pickup draws must be contiguous top runs and resolve must include required anchor card.
- `validationIssues` should remain stable and explain reasons for each skipped operation.

## Cross-Reference

- Scoring abstraction: [`scorekeeper-rules.md`](./scorekeeper-rules.md)
- Gameplay plan: [`specs/2026-02-16-gameplay-v0-hand-state.md`](./specs/2026-02-16-gameplay-v0-hand-state.md)
- Runtime schema checks: [`specs/2026-02-16-rulepack-runtime-schema-validation.md`](./specs/2026-02-16-rulepack-runtime-schema-validation.md)
- Validator behavior: [`specs/2026-02-16-gameplay-v0-validator.md`](./specs/2026-02-16-gameplay-v0-validator.md)
- Canonical primitive catalog: [`primitives-kb-v0.md`](./primitives-kb-v0.md)

## Authoritative shared play

The legacy event engine described above remains available for draft previews and
MCP scaffolding. Supported family games use the explicit [shared-table/v1
policies and commands](./shared-table-v1.md), implemented in `table-rules.ts` and
`table-engine.ts`. These add atomic positional replacement, turn-preserving melds,
validated suffix pickup, private server projections, and automatic round endings.
Both paths consume `runtime-bundle/v1`; shared play never treats client state as truth.

### Player instructions

`gameplay/play-guide.ts` builds the plain-language play guide from the room's
`TableRules` and actual card values. `components/play-guide.svelte` shares it
between the lobby's selected game and each room's How to play panel. Guides
explain unfamiliar terms alongside button instructions, and only describe enabled
house-rule effects. Existing rooms use their saved rules with the current guide;
extraction diagnostics are not beginner instructions.

For full mobile-browser walkthroughs against an isolated server, see
`tests/browser/play_walkthrough.py --help`. It creates rooms through the UI and
plays through UI controls, using only each player's public/private projected view
to choose cards. It does not inspect the hidden deck or modify existing rooms.
