# TDD Spec: rulepack-runtime-schema-validation

_Status: Complete_
_Owner: Connor + agents_
_Date: 2026-02-16_

## 1) Intent

The score engine should safely handle untrusted or evolving RulePack inputs before scoring by validating them against a canonical, versioned JSON Schema.
This prevents runtime exceptions during scoring and gives actionable feedback to rule ingestion pipelines.

## 2) In Scope

- Define/import canonical `RulePack v0` JSON Schema as an explicit artifact in source.
- Add runtime validation for schema conformance.
- Expose schema violations through `RulePackValidationIssue`.
- Keep behavior safe when malformed input is supplied:
  - strict mode throws
  - non-strict mode returns diagnostics and skips calculation when schema is invalid

## 3) Out of Scope

- Changing runtime scoring math semantics.
- Full parser/LLM integration.
- Persisting schema versions in user-visible storage.

## 4) Expected Outcomes

1. Invalid schema objects are rejected before scoring.
2. Strict mode halts with a clear validation exception.
3. Non-strict mode records validation issues and returns stable zeroed state.
4. Existing scoring, trace, undo/redo, and settlement tests remain passing.

## 5) Acceptance Criteria

- [x] `RulePack` schema is represented as a versioned JSON schema artifact in code.
- [x] Schema violations generate `schema:*` issue codes.
- [x] `deriveState(..., { strictValidation: true })` throws on schema violations.
- [x] `deriveState` does not crash on malformed packs and returns deterministic empty totals with validation metadata.
- [x] Current score engine tests pass and include new validation coverage.

## 6) Data and Rules

- Inputs:
  - `rulePack` payload (typed or external object)
  - `events` payload (`ScoreEvent[]`)
- Key invariants:
  - No uncaught exceptions from malformed rule packs.
  - Deterministic validation outcomes for canonical `rulepack/v0` payloads.
  - Runtime validation stays bounded to the schema contract.

## 7) Test Plan (Red -> Green)

### Unit Tests (expected to fail first)

- [x] schema rejection for non-object rule pack input.
- [x] schema rejection for wrong `schemaVersion`.
- [x] schema rejection for malformed modifier predicate.
- [x] deriveState returns zeroed state and validation issues for non-strict schema failures.
- [x] deriveState throws in strict mode for schema failures.

### Integration/Behavior Tests (expected to fail first)

- [x] all existing scorekeeper behavior continues to pass with strict, valid packs.
- [x] validation issues are visible in trace output when `trace: true`.

## 8) Implementation Notes

- Touched files:
  - `/Users/ConnorO/git_repos/just-cards/src/lib/scorekeeper/rulepack-schema.json`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/scorekeeper/engine.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/scorekeeper/engine.test.ts`
- Notes:
  - Validation was implemented without adding heavy runtime dependencies.
  - Canonical schema is imported directly by the validator for single-source contract ownership.

## 9) Verification Checklist

- [x] Spec exists
- [x] Tests written before final implementation
- [x] Tests pass
- [x] `npm run check` passes
- [x] `npm run build` passes

## 10) Rollback Plan

- Remove schema-driven path and revert to typed-only validation.
- Keep validation unit tests and reintroduce minimal type-level checks in `deriveState`.
