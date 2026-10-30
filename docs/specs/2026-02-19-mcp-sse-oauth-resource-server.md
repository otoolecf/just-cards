# TDD Spec: mcp-sse-oauth-resource-server

## Intent

The current MCP exposure is custom JSON HTTP plus shared bearer-token auth, which is enough for local testing but not ideal for remote MCP clients and managed OAuth flows.
This change adds standards-aligned MCP SSE transport and OAuth-style bearer-token validation so remote clients can connect using session-based SSE message flow with resource-server authorization semantics.

## In Scope

1. Add remote MCP SSE transport endpoints (`GET` stream + `POST` messages by session id).
2. Add MCP JSON-RPC method handling for initialize/tools/resources/call flow over SSE sessions.
3. Add auth mode routing to support:
- existing shared-token mode,
- OAuth JWT bearer validation mode with issuer/audience/scope checks,
- unauthenticated local mode when no auth env is configured.
4. Add OAuth protected-resource metadata endpoint for discovery.
5. Preserve existing `/api/mcp/tools|resources|call` and `/api/chat/actions` behavior while upgrading auth handling.

## Out of Scope

1. Full OAuth authorization-server implementation (login/consent/token issuance).
2. Cloudflare-specific OAuth product wiring and production secret management rollout.
3. Replacing existing custom MCP HTTP endpoints.

## Expected Outcomes

1. Remote clients can establish SSE sessions and receive JSON-RPC responses/events for MCP methods.
2. OAuth bearer tokens are validated with explicit 401/403 semantics and `WWW-Authenticate` headers.
3. Existing local/shared-token usage remains backward-compatible.

## Acceptance Criteria

- [x] `GET /api/mcp/sse` creates a session stream and emits a message endpoint containing `sessionId`.
- [x] `POST /api/mcp/messages?sessionId=...` accepts JSON-RPC and emits responses via SSE for tools/resources calls.
- [x] OAuth mode enforces bearer token presence, token validity, and required scope checks.
- [x] Unauthorized/invalid/insufficient-scope requests return correct HTTP statuses and bearer challenge headers.
- [x] Existing MCP HTTP and chat action routes continue to function with shared-token mode.

## Data and Rules

- Rule/data inputs:
  - env auth settings (`JUST_CARDS_MCP_AUTH_TOKEN`, OAuth issuer/jwks/audience/scope envs)
  - JSON-RPC requests (`initialize`, `tools/list`, `resources/list`, `resources/read`, `tools/call`, `ping`)
  - MCP tool/resource outputs from `JustCardsMcpServer`
- Key invariants:
  - Side effects only occur through existing MCP tool calls.
  - SSE session ids are server-generated and required for message posting.
  - OAuth validation never logs or returns raw secrets/tokens.

## Test Plan (Red -> Green)

### Unit Tests (expected to fail first)

- [x] `mcp_auth_oauth_validates_jwt_and_required_scope`: valid JWT accepted in OAuth mode.
- [x] `mcp_auth_oauth_returns_invalid_token_challenge`: missing/invalid token receives 401 + bearer challenge.
- [x] `mcp_auth_oauth_returns_insufficient_scope`: valid token missing required scope receives 403.

### Integration/Behavior Tests (expected to fail first)

- [x] `mcp_sse_session_establish_and_tools_list_roundtrip`: SSE session + messages endpoint returns tools list response.
- [x] `mcp_oauth_protected_resource_metadata_exposes_server_expectations`: metadata endpoint returns resource + auth server details.

## Implementation Notes

- Planned files:
  - `src/lib/mcp/auth.ts`
  - `src/lib/mcp/auth.test.ts`
  - `src/lib/mcp/sse-transport.ts`
  - `src/lib/mcp/jsonrpc.ts`
  - `src/lib/mcp/sse-api.test.ts`
  - `src/routes/api/mcp/sse/+server.ts`
  - `src/routes/api/mcp/messages/+server.ts`
  - `src/routes/.well-known/oauth-protected-resource/+server.ts`
  - existing MCP/chat route handlers for auth helper adoption
- Constraints:
  - Keep auth behavior deterministic in tests (stub JWKS fetch).
  - Keep transport implementation in-memory and lightweight for local/runtime parity.

## Rollback Plan

1. Disable OAuth envs to fall back to shared-token mode.
2. Stop using SSE endpoints and continue with existing `/api/mcp/call` style endpoints.
3. Revert to prior auth helper implementation if compatibility issues arise.
