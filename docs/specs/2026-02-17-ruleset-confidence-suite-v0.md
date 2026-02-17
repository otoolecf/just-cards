# TDD Spec: ruleset-confidence-suite-v0

_Status: Complete_
_Owner: Codex_
_Date: 2026-02-17_

## 1) Intent

Increase pre-LLM confidence by validating not only extraction signals, but also runtime and UI compatibility of generated/stored bundles.

## 2) In Scope

- Add bundle-level confidence evaluator for `runtime-bundle/v1`.
- Add runtime smoke simulation checks.
- Add UI/profile consistency checks tied to play-surface primitives.
- Integrate bundle confidence checks into golden eval suite output.

## 3) Out of Scope

- End-to-end browser screenshot baselines.
- LLM inference quality scoring.

## 4) Expected Outcomes

1. Confidence checks can evaluate any runtime bundle independently of source ingestion.
2. Golden cases fail when runtime/UI primitives drift from compatibility guarantees.
3. Failures are structured and actionable.

## 5) Acceptance Criteria

- [x] `evaluateRulesetBundleConfidence` exists and returns structured checks.
- [x] Runtime smoke sim validates no gameplay/score validation issues.
- [x] UI checks validate profile + play-surface model compatibility.
- [x] Golden suite includes confidence checks in case pass/fail.

## 6) Test Plan (Red -> Green)

### Unit/Behavior Tests (expected to fail first)

- [x] `bundle_confidence_passes_for_generated_fixture_bundle`
- [x] `bundle_confidence_flags_invalid_ui_profile`
- [x] `golden_suite_includes_bundle_confidence_checks`

## 7) Verification Checklist

- [x] Tests written before implementation
- [x] Tests fail first (red)
- [x] Implementation added (green)
- [x] Refactor performed without changing behavior
- [x] `npm run check` passes
- [x] `npm run build` passes
