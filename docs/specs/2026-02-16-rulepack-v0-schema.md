# TDD Spec: rulepack-v0-schema

_Status: Complete_
_Owner: Connor + agents_
_Date: 2026-02-16_

## 1) Intent

Define a canonical, typed Rule IR for score evaluation so parser outputs and engine behavior remain deterministic and versioned. This should enable richer scoring operations, explicit routing/settlement, and explainability without introducing per-game hardcoded branches.

## 2) In Scope

- RulePack metadata (`schemaVersion`, `capabilities`).
- Operation algebra for value modifiers (`set`, `add`, `multiply`, clamps).
- Modifier resolution modes (`last_match_wins`, `first_match_wins`).
- Context-aware predicate support (`context_has_tag`).
- Traceable pipeline stages in score derivation.

## 3) Out of Scope

- Full `canPlay` validator engine.
- Full pattern detector/combo engine.
- Parser ingestion from external sites.
- UI rendering of explanation traces.

## 4) Expected Outcomes

1. Engine accepts and validates `rulepack/v0` consistently.
2. Modifier operations can express common nonlinear transforms.
3. Routing/settlement remains compatible with player/team/pool targets.
4. Trace output explains how scores were derived by stage.

## 5) Acceptance Criteria

- [x] RulePack includes schema/version and capability metadata.
- [x] Validation flags capability/schema mismatches.
- [x] Operation algebra is executable in scoring path.
- [x] Resolution mode changes deterministic result where expected.
- [x] Trace output includes stage-level entries.

## 6) Data and Rules

- Rule/data inputs:
  - `RulePack` (`rulepack/v0`)
  - `ScoreEvent[]` (`add_round`, `settle_pool`, `undo`, `redo`)
  - optional `RuleEvalContext`
- Key invariants:
  - Derivation is deterministic for identical event/rule/context input.
  - Target totals are derived from replayed event log.

## 7) Test Plan (Red -> Green)

### Unit Tests (fail first, then pass)

- [x] operation algebra (`add` + `multiply`) works in sequence
- [x] clamp operations produce bounded values
- [x] `context_has_tag` predicate affects scoring only when present
- [x] `first_match_wins` changes evaluation behavior
- [x] validation catches missing op-algebra capability

### Integration/Behavior Tests

- [x] route/settle still works with player/team/pool targets
- [x] derive pipeline emits trace entries when enabled

## 8) Implementation Notes

- Touched files:
  - `/Users/ConnorO/git_repos/just-cards/src/lib/scorekeeper/engine.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/scorekeeper/engine.test.ts`
  - `/Users/ConnorO/git_repos/just-cards/docs/rulepack-v0.md`
- Approach:
  - Keep backward compatibility for existing `value` modifier shorthand.
  - Add strict typed operations and validation.

## 9) Verification Checklist

- [x] Tests written for new behavior
- [x] Tests passing
- [x] `npm run check` passes
- [x] `npm run build` passes

## 10) Rollback Plan

- Revert to previous engine commit with value-only modifiers.
- Keep docs/spec for future re-introduction in smaller slices.

