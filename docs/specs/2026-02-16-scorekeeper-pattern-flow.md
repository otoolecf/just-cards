# TDD Spec: scorekeeper-pattern-flow

## Intent

Wire the existing pattern detector output into score keeper scoring so a score event can carry pattern rules and a scoring map and produce totals from matched patterns instead of per-card values.

## In Scope

- Add a pattern-aware score event to `deriveState` flow.
- Detect matches from a `PatternRulePack` and map matches to point values by `patternId`.
- Report missing pattern-score mappings as validation issues.
- Keep existing card-based `add_round` behavior unchanged.
- Keep trace output for detect/score/route stages in the same pipeline shape.

## Out of Scope

- Reworking card-predicate modifier algebra.
- Full game-round trigger orchestration (`action_trigger` vs `phase_trigger`) for production game engine orchestration.
- Persisting pattern rule packs outside caller-provided events.

## Expected Outcomes

- A score event can represent a pattern scoring action with explicit `patternPack` and `patternScoring` data.
- Pattern matches are converted to totals through explicit score map (`patternId -> points`).
- Unknown `patternId` mappings produce non-fatal validation issues.
- Existing add-card add_round semantics are preserved.

## Acceptance Criteria

- [x] Pattern-based event contributes score totals based on detected patterns.
- [x] Multiple pattern matches can be awarded if the detector returns multiple matches.
- [x] Unmapped matched pattern IDs are surfaced as validation issues.
- [x] Pattern scoring does not alter add_round semantics or undo/redo semantics.
- [x] Trace emits `detect`, `score`, and `route` stages for pattern flow.

## Data and Rules

- Inputs:
  - `ScoreEvent.type = add_pattern_round`
  - `patternPack: PatternRulePack`
  - `patternScoring: PatternScoringRule[]`
- Invariants:
  - Pattern detection is pure (same cards/pack => same matches).
  - Missing/invalid pattern packs are reported and included in `validationIssues`.

## Test Plan (Red -> Green)

### Unit Tests

- [x] `add_pattern_round_scores_matched_patterns_by_rule_id`
- [x] `add_pattern_round_reports_unmapped_pattern_as_validation_issue`

### Integration/Behavior Tests

- [x] `derive_state_emits_pattern_trace_when_enabled`

## Implementation Notes

- Files touched:
  - `src/lib/scorekeeper/engine.ts`
  - `src/lib/scorekeeper/engine.test.ts`
- Additions:
  - New `ScoreEvent` variant: `add_pattern_round`.
  - New `applyPatternRoundTotals` stage that calls `detectPatterns`.
  - New `PatternScoringRule` interface and pattern mapping logic.

## Rollback Plan

- If pattern flow causes unstable scoring, disable pattern event usage by continuing to use `add_round` events only.
- Keep legacy card-based totals path as the fallback path in mixed events.
