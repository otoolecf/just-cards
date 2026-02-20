# TDD Spec: fastmcp-migration

_Status: Complete_  
_Owner: Connor + agents_  
_Date: 2026-02-20_

## 1) Intent

Replace custom MCP transport/protocol glue with FastMCP so the project uses a maintained MCP framework for tools/resources/session handling and transport behavior.  
Keep existing Just Cards gameplay/ruleset primitives and business logic intact; only protocol/server wiring should change.

## 2) In Scope

1. Add FastMCP dependency and edge-compatible MCP server wiring.
2. Register existing MCP tools/resources through FastMCP handlers.
3. Expose FastMCP transport endpoints for streamable HTTP and legacy SSE-path compatibility.
4. Keep existing auth behavior (shared token + OAuth JWT) through middleware.
5. Keep existing `chat/actions` endpoint behavior using the same underlying `JustCardsMcpServer` domain logic.

## 3) Out of Scope

1. Rewriting domain gameplay/rules/scoring engines.
2. Building OAuth provider flows (token issuance/login).
3. UI changes.

## 4) Expected Outcomes

1. MCP protocol handling runs through FastMCP rather than homegrown JSON-RPC transport code.
2. Existing MCP tools/resources remain available and produce equivalent results.
3. Existing tests for MCP auth + actions still pass with the new transport layer.

## 5) Acceptance Criteria

- [x] FastMCP is installed and used for MCP transport routes.
- [x] `/api/mcp` streamable endpoint is available and functional.
- [x] `/api/mcp/sse` compatibility endpoint redirects clients to `/api/mcp`.
- [x] OAuth/shared-token auth is enforced before FastMCP handlers execute.
- [x] `npm run test`, `npm run check`, and `npm run build` pass.

## 6) Data and Rules

- Rule/data inputs:
  - existing `JustCardsMcpServer` tool/resource definitions
  - MCP auth env vars from `auth.ts`
  - FastMCP transport requests
- Key invariants:
  - tool names and argument contracts stay unchanged
  - resources preserve URI contract
  - auth decisions remain centralized in `auth.ts`

## 7) Test Plan (Red -> Green)

### Unit Tests (expected to fail first)

- [x] `fastmcp_bridge_tools_list_matches_domain_tools`
- [x] `fastmcp_bridge_resources_list_and_read_match_domain_resources`

### Integration/Behavior Tests (expected to fail first)

- [x] `mcp_streamable_http_initialize_and_tools_list_roundtrip`
- [x] `mcp_sse_compat_endpoint_redirects_to_streamable_http_transport`
- [x] existing auth/api tests still green

## 8) Implementation Notes

- Planned files:
  - `/Users/ConnorO/git_repos/just-cards/src/lib/mcp/fastmcp-server.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/mcp/fastmcp-server.test.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/routes/api/mcp/+server.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/routes/api/mcp/sse/+server.ts`
  - remove/retire custom transport glue where no longer needed
- Constraints:
  - edge/runtime compatibility with SvelteKit + Cloudflare adapter
  - avoid changing tool semantics or ruleset storage contracts

## 9) Verification Checklist

- [x] Tests written before implementation
- [x] Tests fail first (red)
- [x] Implementation added (green)
- [x] Refactor performed without changing behavior
- [x] `npm run check` passes
- [x] `npm run build` passes

## 10) Rollback Plan

1. Revert FastMCP routes to prior custom MCP handlers.
2. Keep auth + domain server unchanged so rollback is isolated to transport files.
