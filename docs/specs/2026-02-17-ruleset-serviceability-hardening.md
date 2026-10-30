# TDD Spec: ruleset-serviceability-hardening

## Intent

Tighten rule generation quality so golden fixtures produce serviceable scoring behavior, not just shape-valid bundles.

## In Scope

- Expand scoring extraction to support natural-language phrases.
- Raise golden expectations for Six Card Golf score overrides.
- Add direct unit coverage for natural-language score parsing.

## Out of Scope

- Full semantic parsing for every scoring edge case.
- LLM integration.

## Expected Outcomes

1. `RuleFacts` captures key Golf card scoring overrides from real page prose.
2. Golden suite fails if those overrides regress.
3. Confidence suite remains green after parser changes.

## Acceptance Criteria

- [x] Natural-language scoring lines map to rank overrides (`A`, `2`, `J`, `Q`, `K`).
- [x] Golden golf case requires and validates these overrides.
- [x] Targeted generator/golden/confidence tests pass.

## Test Plan (Red -> Green)

- [x] `extract_rule_facts_detects_natural_language_rank_scoring_overrides`
- [x] `golden_suite_passes_required_checks_for_all_cases` (with stricter Golf scoring expectations)
