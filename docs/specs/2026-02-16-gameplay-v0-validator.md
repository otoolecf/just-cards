# TDD Spec: gameplay-v0-validator

## Intent

Add a reusable validation primitive for gameplay actions so card games can enforce move legality without hardcoding rules per game.
Examples include:

- Rummy: a hand play is legal only if it is a run or a set.
- Golf/other games: a play may require a minimum card count and specific rank constraints.
- Optional context gates (phase/actor) without coupling to one game.

## In Scope

- Validate proposed play actions (`cards` + `actionType` + `actor`) against a validator rule pack.
- Support composable match semantics (`all`, `any`) over:
  - card count constraints
  - same-rank runs (sets)
  - same-suit / run constraints with rank-order mapping
  - contains constraints
- Strict vs non-strict schema behavior.
- Return stable validation issues for failed actions.

## Out of Scope

- Score calculation (`scorekeeper` module).
- Multiplayer transport/persistence.
- Complex wild-card / jokers / trump-specific modifiers (future extension).

## Expected Outcomes

1. Gameplay actions can be validated against game-specific declarative rules.
2. OR-able rules (for example `set OR run`) are supported.
3. Validation diagnostics are deterministic and versioned.

## Acceptance Criteria

- [ ] Empty rule pack defaults to permissive validation.
- [ ] Same-rank (set) rule accepts/rejects based on card shape and min/max count.
- [ ] Run rule accepts/rejects based on rank order and optional suit coupling.
- [ ] OR composition works (`any`).
- [ ] Rule selection by phase works.
- [ ] Strict mode throws on malformed schema.
- [ ] Non-strict mode returns issues without throwing.

## Data and Rules

Inputs:

- `PlayAction`
- `ValidatorRulePack` (`schemaVersion: validator/v0`)
- Optional `ValidationContext` (`currentPlayerId`, `phase`)

Invariants:

- Same action+pack should produce stable pass/fail and issue ordering.
- Validation should not mutate cards or external state.

## Test Plan (Red -> Green)

### Unit Tests (expected to fail first)

- [x] `permissive_validation_when_no_rules_are_defined`
- [x] `validates_same_rank_sets_with_min_max_counts`
- [x] `validates_runs_using_rank_order`
- [x] `supports_suit_restricted_runs`
- [x] `supports_any_composition_for_alternatives_such_as_set_or_run`
- [x] `uses_phase_predicates_to_gate_rule_application`
- [x] `filters_by_action_type_predicate`
- [x] `forces_strict_mode_to_throw_on_schema_mismatch`
- [x] `returns_schema_issues_without_throwing_by_default`

### Integration/Behavior Tests (expected to fail first)

- [x] `returns_an_issue_when_capabilities_are_missing_for_used_matches`
- [x] `supports_actor_gated_rules_via_context`

## Implementation Notes

- New modules:
  - `src/lib/gameplay/validator.ts`
  - `src/lib/gameplay/validator.test.ts`
- Keep card predicates pure (no gameplay state mutation).

## Rollback Plan

- Keep validator disabled via config and rely on permissive gameplay engine mode while hardening rule expressions.
