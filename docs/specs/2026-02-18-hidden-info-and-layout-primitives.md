# TDD Spec: Hidden-Info And Layout Primitives

## Intent

Generated rulesets need to express both card arrangement and information visibility, so games like Six Card Golf are playable and auditable without game-specific hardcoding. Current behavior leaks stock draws in feedback and does not expose opponent face-up layout context in a structured way. This change adds reusable primitives for layout and draw visibility and wires them through generation, play state, and UI rendering.

## In Scope

- Extend `ui-profile/v0` primitives with:
  - card layout metadata (`hand` + optional seat public cards)
  - draw visibility policy per table zone
- Extend deterministic extraction/compile pipeline to emit these primitives from source text (Six Card Golf case).
- Extend play-surface model to expose player public card layouts and stable slot ordering.
- Update play UI to render seat public layouts and honor draw visibility policy (no hidden card leakage in feedback).

## Out of Scope

- Multiplayer server-authoritative sync model changes.
- Full game-specific legality automation for all golf turn nuances.
- New scoring engine semantics beyond existing rulepack primitives.

## Expected Outcomes

1. Six Card Golf generated rulesets include layout metadata (2x3) and stock draw visibility policy.
2. Play screen shows opponent layout cards (face-up/face-down masked as applicable).
3. Drawing from stock in hidden-information mode no longer reveals rank/suit in feedback.

## Acceptance Criteria

- [x] `UiProfileV0` supports optional layout + seat public-card primitives and `drawVisibility` zone policy.
- [x] `extractRuleFacts` and `compileRuleFactsToBundle` emit six-card setup semantics (`cardsPerPlayer`, `initialFaceUp`, 2x3 layout, stock preserve visibility).
- [x] `buildPlaySurfaceView` supports seat public card views and slot-ordered rendering.
- [x] `play-table` uses draw visibility policy and does not leak hidden stock draws in feedback.
- [x] `npm run test`, `npm run check`, and `npm run build` pass.

## Data and Rules

- Rule/data inputs:
  - source prose/URL extraction output (`RuleFactsV0`)
  - `face:down`/`face:up` tags
  - slot tags for layout ordering
  - `ui-profile/v0` hand/table/seat metadata
- Key invariants:
  - Hidden cards remain hidden in player-visible labels and draw feedback when visibility mode is preserve.
  - Layout primitives are optional and backward-compatible.
  - Existing bundles without layout/visibility fields still render.

## Test Plan (Red -> Green)

### Unit Tests (expected to fail first)

- [x] `ui_profile_validation_accepts_layout_and_draw_visibility`: validates extended ui-profile shape.
- [x] `extract_rule_facts_detects_six_card_setup_primitives`: extraction captures cards-per-player/layout/initial-face-up/stock visibility.
- [x] `compile_rule_facts_to_bundle_maps_setup_to_ui_profile`: compiled bundle includes hand layout, seat public layout, and stock draw visibility.
- [x] `build_play_surface_view_exposes_seat_public_cards_with_layout`: seat views include public cards and layout metadata.
- [x] `build_ruleset_play_events_assigns_layout_slots`: setup cards get stable slot tags for grid ordering.

### Integration/Behavior Tests (expected to fail first)

- [x] Playwright mobile audit for generated Six Card Golf shows seat layout cards and hidden stock draw feedback.

## Implementation Notes

- Planned files:
  - `src/lib/ui/ui-profile.ts` (+ tests)
  - `src/lib/rulesets/generator.ts` (+ tests)
  - `src/lib/rulesets/llm-agent.ts` (normalization/prompt fields)
  - `src/lib/gameplay/play-surface-model.ts` (+ tests)
  - `src/lib/gameplay/play-surface-profiles.ts`
  - `src/lib/components/play-table.svelte`
  - docs: `ui-profile-v0.md`, `gameplay-v0.md`, `primitives-kb-v0.md`
- Constraints:
  - Keep rule-driven and generic (no game-name UI branches).
  - Preserve backward compatibility for existing stored bundles.

## Rollback Plan

- Revert ui-profile extension fields and play-table usage.
- Revert setup/layout extraction if it causes non-golf regressions.
