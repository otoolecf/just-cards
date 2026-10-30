# TDD Spec: gameplay-v0-pattern-detector

## Intent

Add a backend pattern-detection primitive that can detect score-relevant card combinations in a collection:

- pairs, trips, and similar rank-based groups,
- sequences/runs with configurable rank order,
- optional suit-restricted runs,
- composition of multiple detection primitives (`all`/`any`) over a shared hand.

`PatternDetector` should return concrete card groups so scorers can remain decoupled.

## In Scope

- New pattern pack type and validator for schema/runtime issues.
- Detection output of deterministic card combinations per rule.
- Composition support (`all`, `any`) and base match primitives:
  - `card_count`
  - `all_same_rank`
  - `all_same_suit`
  - `run`
  - `contains`
- Strict vs non-strict schema mode.
- Optional trace output for diagnosis.

## Out of Scope

- Scoring application / scoring coefficients (handled by separate scorer primitive).
- UI rendering and live multiplayer integration.
- Wildcards/jokers and declarative boolean expression trees.

## Expected Outcomes

- Card lists can be analyzed for named patterns from game-defined rules.
- Runs can be interpreted with default or custom rank order.
- Composition semantics are explicit and stable.
- Detection issues are deterministic and include schema/capability failures.

## Acceptance Criteria

- [ ] Detects same-rank patterns with min/max cardinality and duplicate-card combinations.
- [ ] Detects rank runs by default rank order and with custom ace-high order.
- [ ] Supports suit-restricted runs.
- [ ] Supports `all` and `any` composition.
- [ ] Supports strict mode exception and non-strict issue collection.
- [ ] Missing capability results in explicit issue.
- [ ] Trace captures matcher and rule evaluation steps.

## Data and Rules

Inputs:

- `CardInput[]`
- `PatternRulePack` (`schemaVersion: pattern/v0`)
- options:
  - `trace`
  - `strictValidation`

Invariants:

- Detection is pure and deterministic.
- Returned matches do not mutate inputs.
- Card identity uses stable indices from the input array.

## Test Plan (Red -> Green)

### Unit Tests

- `detects_same_rank_pairs_from_duplicate_cards`
- `respects_max_matches_per_pattern_rule`
- `detects_runs_with_default_and_custom_rank_order`
- `supports_suit_restricted_runs`
- `supports_any_composition_of_pattern_types`
- `supports_all_composition_when_children_are_disjoint`
- `returns_no_matches_when_missing_capability`
- `strict_validation_throws_on_schema_mismatch`
- `non_strict_mode_returns_schema_issues`
- `emits_trace_for_pattern_matching`

### Integration Tests

- `detection_remains_stable_across_identical_inputs`
- `detects_multiple_patterns_from_single_hand`

## Implementation Notes

- Add:
  - `src/lib/gameplay/pattern-detector.ts`
  - `src/lib/gameplay/pattern-detector.test.ts`
- Keep this module data-driven and versioned for reuse by future rule ingestion.
- Use trace stages `rulepack`, `rule`, `match`, and `compose`.

## Rollback Plan

- If behavior is incorrect for a game rule set, disable by requiring default permissive pattern mode per game config and keep detector off until configuration is corrected.
