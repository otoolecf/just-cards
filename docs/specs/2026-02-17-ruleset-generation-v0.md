# TDD Spec: ruleset-generation-v0

## Intent

The app can store and render rulesets but cannot yet generate them directly from user-provided rule sources. This feature adds an end-to-end generation path from either a rules URL or free-form prose to a persisted `runtime-bundle/v1` ruleset draft. It provides a deterministic, testable scaffold that can be upgraded to LLM-backed extraction later without changing storage/runtime contracts.

## In Scope

- Add backend generation pipeline from inputs (`url` or `text`) to `runtime-bundle/v1` draft.
- Introduce `RuleFacts v0` intermediate extraction shape.
- Add deterministic extraction heuristics for common card-rule prose.
- Add API endpoint: `POST /api/rulesets/generate`.
- Validate + persist generated bundle through existing `RulesetService`.

## Out of Scope

- Calling external commercial AI providers.
- Cloudflare Queue/D1 production orchestration.
- Full universal rule understanding across every card game variation.

## Expected Outcomes

1. Users can submit either a URL or prose text and receive a stored ruleset draft.
2. Generated rulesets always conform to `runtime-bundle/v1` and `ui-profile/v0` contracts.
3. Six-card-golf-style source text compiles into a playable low-score golf-oriented ruleset profile.
4. When extraction confidence is low, pipeline still emits a safe generic playable bundle with diagnostics.

## Acceptance Criteria

- [x] `RuleFacts v0` types exist with extraction diagnostics.
- [x] Generator supports `url` and `text` source modes.
- [x] `POST /api/rulesets/generate` returns created ruleset record and diagnostics.
- [x] Generated bundle persists through `RulesetService.createDraft` validation path.
- [x] Tests cover website-like source text and stream-of-consciousness source text.

## Data and Rules

- Rule/data inputs:
  - URL source content (HTML/text)
  - free-form prose text
- Key invariants:
  - Generated output must be `runtime-bundle/v1`.
  - `uiProfile` quick targets must align with gameplay target zones.
  - Pipeline must never bypass existing bundle validation before persistence.

## Test Plan (Red -> Green)

### Unit Tests (expected to fail first)

- [x] `extract_rule_facts_detects_six_card_golf_signals`: detects game name, players, scoring style, and zones from bicycle-like text.
- [x] `extract_rule_facts_handles_stream_of_consciousness_input`: builds normalized facts from informal prose.
- [x] `compile_rule_facts_to_bundle_returns_runtime_bundle_v1`: compiler emits valid runtime + ui profile shape.

### Integration/Behavior Tests (expected to fail first)

- [x] `ruleset_generate_api_creates_ruleset_from_text_input`: endpoint stores and returns generated draft.
- [x] `ruleset_generate_api_rejects_invalid_payload`: endpoint enforces required source fields.

## Implementation Notes

- Planned files:
  - `src/lib/rulesets/generator.ts`
  - `src/lib/rulesets/generator.test.ts`
  - `src/routes/api/rulesets/generate/+server.ts`
  - `src/lib/rulesets/generate-api.test.ts`
- Constraints:
  - Keep pipeline deterministic and side-effect free except final store call.
  - Avoid hardcoding one-off game runtime branches in UI components.

## Rollback Plan

- Disable `POST /api/rulesets/generate` route and keep manual ruleset creation route only.
- Preserve generated module behind internal API boundary so it can be iterated offline.
