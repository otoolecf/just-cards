# TDD Spec: ruleset-generation-v0

_Status: Complete_
_Owner: Codex_
_Date: 2026-02-17_

## 1) Intent

The app can store and render rulesets but cannot yet generate them directly from user-provided rule sources. This feature adds an end-to-end generation path from either a rules URL or free-form prose to a persisted `runtime-bundle/v1` ruleset draft. It provides a deterministic, testable scaffold that can be upgraded to LLM-backed extraction later without changing storage/runtime contracts.

## 2) In Scope

- Add backend generation pipeline from inputs (`url` or `text`) to `runtime-bundle/v1` draft.
- Introduce `RuleFacts v0` intermediate extraction shape.
- Add deterministic extraction heuristics for common card-rule prose.
- Add API endpoint: `POST /api/rulesets/generate`.
- Validate + persist generated bundle through existing `RulesetService`.

## 3) Out of Scope

- Calling external commercial AI providers.
- Cloudflare Queue/D1 production orchestration.
- Full universal rule understanding across every card game variation.

## 4) Expected Outcomes

1. Users can submit either a URL or prose text and receive a stored ruleset draft.
2. Generated rulesets always conform to `runtime-bundle/v1` and `ui-profile/v0` contracts.
3. Six-card-golf-style source text compiles into a playable low-score golf-oriented ruleset profile.
4. When extraction confidence is low, pipeline still emits a safe generic playable bundle with diagnostics.

## 5) Acceptance Criteria

- [x] `RuleFacts v0` types exist with extraction diagnostics.
- [x] Generator supports `url` and `text` source modes.
- [x] `POST /api/rulesets/generate` returns created ruleset record and diagnostics.
- [x] Generated bundle persists through `RulesetService.createDraft` validation path.
- [x] Tests cover website-like source text and stream-of-consciousness source text.

## 6) Data and Rules

- Rule/data inputs:
  - URL source content (HTML/text)
  - free-form prose text
- Key invariants:
  - Generated output must be `runtime-bundle/v1`.
  - `uiProfile` quick targets must align with gameplay target zones.
  - Pipeline must never bypass existing bundle validation before persistence.

## 7) Test Plan (Red -> Green)

### Unit Tests (expected to fail first)

- [x] `extract_rule_facts_detects_six_card_golf_signals`: detects game name, players, scoring style, and zones from bicycle-like text.
- [x] `extract_rule_facts_handles_stream_of_consciousness_input`: builds normalized facts from informal prose.
- [x] `compile_rule_facts_to_bundle_returns_runtime_bundle_v1`: compiler emits valid runtime + ui profile shape.

### Integration/Behavior Tests (expected to fail first)

- [x] `ruleset_generate_api_creates_ruleset_from_text_input`: endpoint stores and returns generated draft.
- [x] `ruleset_generate_api_rejects_invalid_payload`: endpoint enforces required source fields.

## 8) Implementation Notes

- Planned files:
  - `/Users/ConnorO/git_repos/just-cards/src/lib/rulesets/generator.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/rulesets/generator.test.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/routes/api/rulesets/generate/+server.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/rulesets/generate-api.test.ts`
- Constraints:
  - Keep pipeline deterministic and side-effect free except final store call.
  - Avoid hardcoding one-off game runtime branches in UI components.

## 9) Verification Checklist

- [x] Tests written before implementation
- [x] Tests fail first (red)
- [x] Implementation added (green)
- [x] Refactor performed without changing behavior
- [x] `npm run check` passes
- [x] `npm run build` passes

## 10) Rollback Plan

- Disable `POST /api/rulesets/generate` route and keep manual ruleset creation route only.
- Preserve generated module behind internal API boundary so it can be iterated offline.
