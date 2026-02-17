# TDD Spec: layman-guide-and-audit-v0

_Status: Complete_
_Owner: Codex_
_Date: 2026-02-17_

## 1) Intent

Make generated rulesets understandable to lay users by default through an explainable, auditable guide surface in Play mode.

## 2) In Scope

- Add optional bundle explainability payload (`ruleset-explain/v0`).
- Generate explainability payload from extracted rule facts.
- Add a guide model builder for UI-friendly content.
- Surface guide/audit content in Play UI (new tab).
- Add tests enforcing explainability presence and content for generated bundles.

## 3) Out of Scope

- Rich multimedia tutorials.
- Full natural-language legalese auditing.

## 4) Expected Outcomes

1. Generated rulesets include clear objective, turn flow, zones, and scoring highlights.
2. Play UI includes an easy “Guide” tab with learning + audit sections.
3. Golden suite confirms explainability payload exists and is coherent.

## 5) Acceptance Criteria

- [x] `RuntimeRulesetBundle` supports optional `explain` payload.
- [x] Generator emits `ruleset-explain/v0` for URL/prose generation.
- [x] Guide model unit tests pass.
- [x] Play UI renders guide and audit details from ruleset bundle.
- [x] Golden and confidence tests enforce explainability checks.

## 6) Test Plan (Red -> Green)

- [x] `generator_outputs_explainability_payload`
- [x] `guide_model_uses_bundle_explainability`
- [x] `golden_suite_validates_explainability`

## 7) Verification Checklist

- [x] Tests written before implementation
- [x] Tests fail first (red)
- [x] Implementation added (green)
- [x] Refactor performed without changing behavior
- [x] `npm run check` passes
- [x] `npm run build` passes
