# TDD Spec: llm-ruleset-agent-v0

_Status: Complete_
_Owner: Codex_
_Date: 2026-02-18_

## 1) Intent

The current ruleset generation pipeline is deterministic-only. We need a production-oriented LLM/SLM agent layer that can take minimal input (ideally only a rules URL) and produce a stronger `RuleFacts v0` extraction before compiling into existing primitives. The system should default to `gpt-5-nano`, automatically escalate to `gpt-5-mini` when nano output is unusable, and safely fall back to deterministic extraction if model output is low quality.

## 2) In Scope

- Add an LLM-backed rules extraction agent on top of the existing deterministic pipeline.
- Add prompt templates and structured parsing for `RuleFacts v0` candidate output.
- Add an agentic multi-step loop:
  1. baseline deterministic extraction
  2. LLM extraction attempt
  3. local compile/confidence validation
  4. optional LLM repair pass
  5. model escalation (`gpt-5-nano` -> `gpt-5-mini`) if needed
  6. deterministic fallback if still not serviceable
- Wire `POST /api/rulesets/generate` to use this agent when `OPENAI_API_KEY` is present.
- Preserve compatibility with existing `runtime-bundle/v1` + `ui-profile/v0` contracts.

## 3) Out of Scope

- Full autonomous web crawler for multi-page rulebooks.
- Fine-tuning/training custom SLMs.
- Paid-model optimization or cost dashboards.

## 4) Expected Outcomes

1. URL-only input can trigger LLM-assisted extraction and produce a stored playable/scorable ruleset draft.
2. Generation remains stable without API keys via deterministic fallback.
3. Pipeline explicitly reports what model/path was used (nano/mini/deterministic fallback) for auditability.
4. Known source styles (Bicycle `six-card-golf`, Bicycle `500-rum`) are handled by tests through deterministic fixtures + mocked LLM outputs.

## 5) Acceptance Criteria

- [x] New LLM agent module exists with configurable primary/fallback model settings.
- [x] Primary model defaults to `gpt-5-nano`; fallback defaults to `gpt-5-mini`.
- [x] If primary model output is unparsable or low-quality, pipeline attempts repair/escalation.
- [x] If all model attempts fail, deterministic output is still produced.
- [x] API route uses LLM agent when key is available and remains backward compatible without it.
- [x] Unit tests verify success path, model escalation path, and no-key deterministic path.

## 6) Data and Rules

- Input:
  - URL content fetched via existing ingestion path
  - optional free-form text
- Intermediate:
  - deterministic `RuleFacts v0` baseline
  - LLM candidate `RuleFacts v0` (sanitized)
- Output:
  - validated `runtime-bundle/v1` draft persisted through `RulesetService`

## 7) Test Plan (Red -> Green)

### Unit Tests (expected red first)

- [x] `llm_agent_uses_primary_model_when_output_is_valid`
- [x] `llm_agent_escalates_to_fallback_model_when_primary_output_is_unusable`
- [x] `llm_agent_falls_back_to_deterministic_when_no_api_key`

### Integration/Behavior Tests

- [x] `ruleset_generate_api_prefers_llm_agent_when_api_key_present`
- [x] existing generate API tests remain green without API keys

## 8) Implementation Notes

- Planned files:
  - `/Users/ConnorO/git_repos/just-cards/src/lib/rulesets/llm-agent.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/rulesets/llm-agent.test.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/routes/api/rulesets/generate/+server.ts`
  - `/Users/ConnorO/git_repos/just-cards/docs/ruleset-generation-v0.md`
- Constraints:
  - keep compile/validate/persist contracts unchanged
  - keep model-specific calls isolated behind one module
  - avoid committing secrets

## 9) Verification Checklist

- [x] Tests written before implementation
- [x] Tests fail first (red)
- [x] Implementation added (green)
- [x] Refactor performed without changing behavior
- [x] `npm run check` passes
- [x] `npm run build` passes

## 10) Rollback Plan

- Route-level flag to disable LLM path and revert to deterministic generator only.
- Keep LLM module isolated so rollback is one import/path change.
