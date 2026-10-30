# TDD Spec: gameplay-draw-resolve-policy

## Intent

Generated rulesets for draw/discard games need a generalized turn-flow primitive so players cannot chain multiple draws before resolving a card play/discard. Six Card Golf exposed two gaps: repeated draws were allowed and some discard moves failed when visibility tags changed. This change introduces a data-driven draw-then-resolve policy in `gameplay/v0`, fixes card identity matching by stable card id (`cid:*`), and wires generated rulesets/UI to enforce the flow.

## In Scope

- Add optional `turnActionPolicy` primitive to `gameplay/v0` for draw-then-resolve turn flow.
- Enforce policy in gameplay engine validation/application.
- Fix `zone_move` card matching to use stable `cid:*` identity when provided, so face/tag transforms still move correctly.
- Emit draw-then-resolve policy from generated rulesets when source text indicates draw-then-play/discard turn flow.
- Add UI guards in play table so blocked actions are not submitted and user feedback is explicit.

## Out of Scope

- Multi-step server-authoritative room action protocol.
- Full per-game custom action scripting beyond draw-then-resolve.
- New visual theme/styling changes.

## Expected Outcomes

1. In draw-then-resolve games (e.g. Six Card Golf), a player cannot draw again until resolving a hand-to-target move.
2. Optional `requireDrawBeforeResolve` blocks hand resolve actions before a draw in that turn phase.
3. Discard/swap moves with changed face tags still remove the source card and update the target zone correctly.
4. Generated Six Card Golf bundles include a turn-action policy that enforces draw once then resolve.

## Acceptance Criteria

- [x] `GameplayRulePack` supports optional `turnActionPolicy` with draw/resolution zone allowlists and phase gating.
- [x] Gameplay engine reports deterministic validation issues for second draw before resolve and resolve before draw.
- [x] `zone_move` removal supports `cid:*` identity matching (not only full object deep-equality).
- [x] Generated Six Card Golf facts/bundle encode draw-then-resolve turn intent.
- [x] Play table disables/blocks invalid draw/resolve actions under active draw-then-resolve policy.

## Data and Rules

- Rule/data inputs:
  - `GameplayRulePack.turnActionPolicy`
  - `GameEvent.type = zone_move`
  - card tags including `cid:*`, `face:down`, `face:up`
  - generated `RuleFactsV0.turn`
- Key invariants:
  - If `requireResolveAfterDraw = true`, second draw before resolve is invalid.
  - If `requireDrawBeforeResolve = true`, resolve move before draw is invalid.
  - Card identity with matching `cid:*` is considered the same card even if visibility tags differ.

## Test Plan (Red -> Green)

### Unit Tests (expected to fail first)

- [x] `zone_move_draw_policy_blocks_second_draw_before_resolve`
- [x] `zone_move_draw_policy_blocks_resolve_before_draw`
- [x] `zone_move_matches_by_cid_when_tags_change`
- [x] `extract_rule_facts_detects_draw_then_resolve_turns`
- [x] `compile_rule_facts_to_bundle_sets_turn_action_policy_when_detected`

### Integration/Behavior Tests (expected to fail first)

- [x] play table source contract includes draw/resolve action gating hooks.

## Implementation Notes

- Planned files:
  - `src/lib/gameplay/engine.ts`
  - `src/lib/gameplay/engine.test.ts`
  - `src/lib/rulesets/generator.ts`
  - `src/lib/rulesets/generator.test.ts`
  - `src/lib/rulesets/llm-agent.ts`
  - `src/lib/components/play-table.svelte`
  - `src/lib/components/play-table-style-contract.test.ts`
  - `docs/gameplay-v0.md`
  - `docs/primitives-kb-v0.md`
- Constraints:
  - Keep behavior rules data-driven and reusable across games.
  - Preserve existing UI primitive/touch target contracts.

## Rollback Plan

- Remove `turnActionPolicy` enforcement and generated-policy emission.
- Revert to previous zone-move identity matching if regression appears in legacy events.
