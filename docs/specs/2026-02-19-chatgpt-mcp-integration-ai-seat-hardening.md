# TDD Spec: chatgpt-mcp-integration-ai-seat-hardening

_Status: Completed_  
_Owner: Connor + agents_  
_Date: 2026-02-19_

## 1) Intent

Complete the remaining MVP path for ChatGPT-first usage by exposing authenticated MCP/action HTTP endpoints, enabling AI-seat move orchestration for "play against ChatGPT", and adding operational hardening primitives (trace IDs, audit logs, budget gates, and retry controls).  
The goal is a deployable, auditable server contract where generated rulesets can be created from chat, explained, opened in play UI, and advanced with legal server-validated moves.

## 2) In Scope

1. Add authenticated HTTP transport endpoints for MCP tool/resource access.
2. Add authenticated ChatGPT action endpoint with flows:
- create from URL,
- explain rules,
- open playable table,
- ask for next move.
3. Extend game/session primitives for AI-seat metadata and role modes:
- `coach`,
- `opponent`,
- `dealer_narrator`.
4. Enforce legal-move-only AI suggestion/apply behavior through the same runtime validator path as human moves.
5. Add hardening primitives:
- trace IDs for tool/action execution,
- audit log entries for key operations,
- budget limits for generation input and tool invocation,
- retry + deterministic fallback behavior for model-based rules generation.

## 3) Out of Scope

1. Cloudflare Durable Object multiplayer migration.
2. Full OAuth/app-store style ChatGPT listing setup.
3. Non-card-game-specific strategy engines beyond runtime-legal move suggestion.

## 4) Expected Outcomes

1. Chat clients can call secure server endpoints to generate/explain/open/advance games.
2. AI seat suggestions are always legal under runtime validation before apply.
3. Server operations are inspectable via trace/audit artifacts and bounded by basic budget controls.

## 5) Acceptance Criteria

- [x] MCP HTTP endpoints require auth token when configured and reject unauthorized requests.
- [x] Chat action endpoint supports `create_from_url`, `explain_rules`, `open_playable_table`, and `ask_next_move`.
- [x] `start_game` supports optional AI-seat metadata and `get_game_state` returns it.
- [x] `suggest_move` returns legal candidates only; `ask_next_move` optional apply path validates via `submit_move`.
- [x] generation path enforces max source length budget and uses retry/fallback semantics.
- [x] trace IDs and audit records are emitted for tool/action calls.

## 6) Data and Rules

- Rule/data inputs:
  - MCP tool args/resource URIs
  - action flow request payloads
  - auth token from environment
- Key invariants:
  - No state mutation without server-side runtime validation.
  - No secret/token values in logs.
  - Deterministic generation fallback remains available when LLM path fails.

## 7) Test Plan (Red -> Green)

### Unit Tests (expected to fail first)

- [x] `mcp_server_start_game_persists_ai_seats_and_get_game_state_returns_them`
- [x] `mcp_suggest_move_returns_legal_event_for_requested_mode`
- [x] `mcp_generate_ruleset_enforces_source_budget_and_retries_then_fallback`
- [x] `mcp_audit_log_records_tool_calls_with_trace_id`

### Integration/Behavior Tests (expected to fail first)

- [x] `mcp_http_endpoints_require_auth_and_execute_tool_calls`
- [x] `chat_actions_create_explain_open_and_next_move_flow_roundtrip`

## 8) Implementation Notes

- Planned files:
  - `/Users/ConnorO/git_repos/just-cards/src/lib/mcp/default-server.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/mcp/audit-log.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/mcp/auth.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/mcp/server.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/mcp/types.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/routes/api/mcp/tools/+server.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/routes/api/mcp/resources/+server.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/routes/api/mcp/call/+server.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/routes/api/chat/actions/+server.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/mcp/server.test.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/mcp/api.test.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/mcp/actions-api.test.ts`
- Constraints:
  - Preserve existing tool names/contracts; extend only with backwards-compatible optional fields.
  - Keep local dev/storage on existing ruleset abstractions.

## 9) Verification Checklist

- [x] Tests written before implementation
- [x] Tests fail first (red)
- [x] Implementation added (green)
- [x] Refactor performed without changing behavior
- [x] `npm run check` passes
- [x] `npm run build` passes

## 10) Rollback Plan

1. Disable new API routes and fall back to direct in-app generation/play routes.
2. Toggle auth token env unset for local-only behavior while keeping previous MCP module untouched.
