# TDD Spec: chatgpt-mcp-integration-ai-seat-hardening

## Intent

Complete the remaining MVP path for ChatGPT-first usage by exposing authenticated MCP/action HTTP endpoints, enabling AI-seat move orchestration for "play against ChatGPT", and adding operational hardening primitives (trace IDs, audit logs, budget gates, and retry controls).
The goal is a deployable, auditable server contract where generated rulesets can be created from chat, explained, opened in play UI, and advanced with legal server-validated moves.

## In Scope

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

## Out of Scope

1. Cloudflare Durable Object multiplayer migration.
2. Full OAuth/app-store style ChatGPT listing setup.
3. Non-card-game-specific strategy engines beyond runtime-legal move suggestion.

## Expected Outcomes

1. Chat clients can call secure server endpoints to generate/explain/open/advance games.
2. AI seat suggestions are always legal under runtime validation before apply.
3. Server operations are inspectable via trace/audit artifacts and bounded by basic budget controls.

## Acceptance Criteria

- [x] MCP HTTP endpoints require auth token when configured and reject unauthorized requests.
- [x] Chat action endpoint supports `create_from_url`, `explain_rules`, `open_playable_table`, and `ask_next_move`.
- [x] `start_game` supports optional AI-seat metadata and `get_game_state` returns it.
- [x] `suggest_move` returns legal candidates only; `ask_next_move` optional apply path validates via `submit_move`.
- [x] generation path enforces max source length budget and uses retry/fallback semantics.
- [x] trace IDs and audit records are emitted for tool/action calls.

## Data and Rules

- Rule/data inputs:
  - MCP tool args/resource URIs
  - action flow request payloads
  - auth token from environment
- Key invariants:
  - No state mutation without server-side runtime validation.
  - No secret/token values in logs.
  - Deterministic generation fallback remains available when LLM path fails.

## Test Plan (Red -> Green)

### Unit Tests (expected to fail first)

- [x] `mcp_server_start_game_persists_ai_seats_and_get_game_state_returns_them`
- [x] `mcp_suggest_move_returns_legal_event_for_requested_mode`
- [x] `mcp_generate_ruleset_enforces_source_budget_and_retries_then_fallback`
- [x] `mcp_audit_log_records_tool_calls_with_trace_id`

### Integration/Behavior Tests (expected to fail first)

- [x] `mcp_http_endpoints_require_auth_and_execute_tool_calls`
- [x] `chat_actions_create_explain_open_and_next_move_flow_roundtrip`

## Implementation Notes

- Planned files:
  - `src/lib/mcp/default-server.ts`
  - `src/lib/mcp/audit-log.ts`
  - `src/lib/mcp/auth.ts`
  - `src/lib/mcp/server.ts`
  - `src/lib/mcp/types.ts`
  - `src/routes/api/mcp/tools/+server.ts`
  - `src/routes/api/mcp/resources/+server.ts`
  - `src/routes/api/mcp/call/+server.ts`
  - `src/routes/api/chat/actions/+server.ts`
  - `src/lib/mcp/server.test.ts`
  - `src/lib/mcp/api.test.ts`
  - `src/lib/mcp/actions-api.test.ts`
- Constraints:
  - Preserve existing tool names/contracts; extend only with backwards-compatible optional fields.
  - Keep local dev/storage on existing ruleset abstractions.

## Rollback Plan

1. Disable new API routes and fall back to direct in-app generation/play routes.
2. Toggle auth token env unset for local-only behavior while keeping previous MCP module untouched.
