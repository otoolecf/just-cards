# TDD Spec: primitives-kb-docs

## Intent

Create a clear, canonical knowledge-base document for LLM/SLM rule generation so primitives can be composed into new game rulesets without hardcoded game logic.
The documentation must be implementation-aligned and explicit about finite primitive enums, event shapes, and composition flow.

## In Scope

- Add a canonical primitive catalog document for runtime/gameplay/validator/pattern/scorekeeper primitives.
- Document exact finite enums and discriminated-union shapes used by backend runtime.
- Provide an authoring contract for generated rulesets and runtime bundles.
- Reconcile stale statements in existing docs that conflict with implemented runtime capabilities.
- Add a docs-contract test to ensure critical KB sections stay present.

## Out of Scope

- Rule ingestion model/provider prompting details.
- UI-level documentation.
- Full per-game authored rulesets for all supported games.

## Expected Outcomes

1. A single document can be used as LLM/SLM source-of-truth for primitive composition.
2. Existing docs no longer claim trigger orchestration is fully absent.
3. A test fails if core KB sections/enums are removed accidentally.

## Acceptance Criteria

- [x] `docs/primitives-kb-v0.md` exists and contains sections for:
  - score events
  - gameplay events
  - validator rule pack
  - pattern detector rule pack
  - runtime trigger primitives
  - rule generation output contract
- [x] KB doc includes `add_delta` and `manual_score` primitives.
- [x] KB doc includes finite trigger enum values (`event_cards`, `player_zone`, `card_values`, `pattern`, `fixed`, `actor`, `source_player`, `static`).
- [x] Existing docs updated to align with implemented runtime trigger support.
- [x] Docs-contract test passes.

## Data and Rules

- Rule/data inputs:
  - `RulePack`
  - `GameplayRulePack`
  - `ValidatorRulePack`
  - `PatternRulePack`
  - `RuntimeRulePack`
- Key invariants:
  - docs reflect implemented primitives exactly
  - finite enums are listed explicitly
  - examples avoid hardcoded game-specific logic paths

## Test Plan (Red -> Green)

### Unit Tests (expected to fail first)

- [x] `primitives_kb_doc_includes_required_sections_and_primitives`

### Integration/Behavior Tests (expected to fail first)

- [x] N/A for docs-only feature

## Implementation Notes

- Planned files:
  - `docs/primitives-kb-v0.md`
  - `docs/README.md`
  - `docs/rulepack-v0.md`
  - `docs/scorekeeper-rules.md`
  - `docs/gameplay-v0.md`
  - `src/lib/runtime/primitives-kb-docs.test.ts`

## Rollback Plan

- Revert to prior docs set and remove docs-contract test if it blocks releases.
