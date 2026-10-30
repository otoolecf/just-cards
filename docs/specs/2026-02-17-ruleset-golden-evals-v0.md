# TDD Spec: ruleset-golden-evals-v0

## Intent

Before integrating paid LLM generation, we need deterministic confidence checks against known real-world rule pages. This feature adds a golden eval harness using three source links:

1. `https://bicyclecards.com/how-to-play/six-card-golf`
2. `https://bicyclecards.com/how-to-play/cribbage`
3. `https://www.pagat.com/beating/shithead.html`

The harness should verify extraction + compile behavior and fail loudly on regressions.

## In Scope

- Add offline fixture snapshots sourced from the three URLs.
- Add golden eval primitives (`case definition`, `check results`, `suite summary`).
- Add tests that enforce expected extracted facts and successful bundle compilation.
- Add docs and a dedicated npm script for running only golden evals.

## Out of Scope

- LLM provider integration.
- Auto-refreshing fixtures in CI.
- Perfect extraction for all rule pages on the internet.

## Expected Outcomes

1. We can run a repeatable golden test suite offline.
2. Suite validates practical signals per game (name, player range, zones, turn affordances, scoring hints).
3. `runtime-bundle/v1` compilation is proven for each golden case.
4. Failures are diagnosable via per-check output.

## Acceptance Criteria

- [x] Three fixture snapshots exist and map to the exact links above.
- [x] Golden eval module returns structured pass/fail checks per case.
- [x] Golden test suite asserts all required checks pass.
- [x] `npm run test:golden` exists and runs the suite.

## Test Plan (Red -> Green)

### Unit/Behavior Tests (expected to fail first)

- [x] `golden_suite_includes_requested_sources`
- [x] `golden_suite_passes_required_checks_for_all_cases`
- [x] `golden_case_compiles_runtime_bundle_v1`
