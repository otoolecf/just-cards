# TDD Spec: ruleset-golden-evals-v0

_Status: Complete_
_Owner: Codex_
_Date: 2026-02-17_

## 1) Intent

Before integrating paid LLM generation, we need deterministic confidence checks against known real-world rule pages. This feature adds a golden eval harness using three source links:

1. `https://bicyclecards.com/how-to-play/six-card-golf`
2. `https://bicyclecards.com/how-to-play/cribbage`
3. `https://www.pagat.com/beating/shithead.html`

The harness should verify extraction + compile behavior and fail loudly on regressions.

## 2) In Scope

- Add offline fixture snapshots sourced from the three URLs.
- Add golden eval primitives (`case definition`, `check results`, `suite summary`).
- Add tests that enforce expected extracted facts and successful bundle compilation.
- Add docs and a dedicated npm script for running only golden evals.

## 3) Out of Scope

- LLM provider integration.
- Auto-refreshing fixtures in CI.
- Perfect extraction for all rule pages on the internet.

## 4) Expected Outcomes

1. We can run a repeatable golden test suite offline.
2. Suite validates practical signals per game (name, player range, zones, turn affordances, scoring hints).
3. `runtime-bundle/v1` compilation is proven for each golden case.
4. Failures are diagnosable via per-check output.

## 5) Acceptance Criteria

- [x] Three fixture snapshots exist and map to the exact links above.
- [x] Golden eval module returns structured pass/fail checks per case.
- [x] Golden test suite asserts all required checks pass.
- [x] `npm run test:golden` exists and runs the suite.

## 6) Test Plan (Red -> Green)

### Unit/Behavior Tests (expected to fail first)

- [x] `golden_suite_includes_requested_sources`
- [x] `golden_suite_passes_required_checks_for_all_cases`
- [x] `golden_case_compiles_runtime_bundle_v1`

## 7) Verification Checklist

- [x] Tests written before implementation
- [x] Tests fail first (red)
- [x] Implementation added (green)
- [x] Refactor performed without changing behavior
- [x] `npm run check` passes
- [x] `npm run build` passes
