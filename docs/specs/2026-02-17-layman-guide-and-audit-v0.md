# TDD Spec: layman-guide-and-audit-v0

## Intent

Make generated rulesets understandable to lay users by default through an explainable, auditable guide surface in Play mode.

## In Scope

- Add optional bundle explainability payload (`ruleset-explain/v0`).
- Generate explainability payload from extracted rule facts.
- Add a guide model builder for UI-friendly content.
- Surface guide/audit content in Play UI (new tab).
- Add tests enforcing explainability presence and content for generated bundles.

## Out of Scope

- Rich multimedia tutorials.
- Full natural-language legalese auditing.

## Expected Outcomes

1. Generated rulesets include clear objective, turn flow, zones, and scoring highlights.
2. Play UI includes an easy “Guide” tab with learning + audit sections.
3. Golden suite confirms explainability payload exists and is coherent.

## Acceptance Criteria

- [x] `RuntimeRulesetBundle` supports optional `explain` payload.
- [x] Generator emits `ruleset-explain/v0` for URL/prose generation.
- [x] Guide model unit tests pass.
- [x] Play UI renders guide and audit details from ruleset bundle.
- [x] Golden and confidence tests enforce explainability checks.

## Test Plan (Red -> Green)

- [x] `generator_outputs_explainability_payload`
- [x] `guide_model_uses_bundle_explainability`
- [x] `golden_suite_validates_explainability`
