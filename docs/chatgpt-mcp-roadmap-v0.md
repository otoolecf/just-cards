# ChatGPT + MCP Roadmap v0

This document defines the implementation roadmap for a ChatGPT-integrated Just Cards experience using MCP tools/resources and MCP sampling.

## Objective

Enable users to:

1. provide a rules URL or prose in chat,
2. generate auditable `runtime-bundle/v1` rulesets from that input,
3. open and play those rulesets in the existing Just Cards play surface,
4. optionally play against an AI seat with server-validated moves.

## Architecture Split

1. `just-cards web app`
- owns rendering, mobile UX, score/play screens, and room/game state UI.

2. `just-cards backend`
- owns ruleset persistence, gameplay validation, scoring, and authoritative move application.

3. `just-cards-mcp server`
- exposes tools and resources so chat agents can use backend capabilities.

4. `chat model runtime (MCP sampling)`
- performs extraction/repair/ranking using the in-session model/version.

## Skills vs MCP vs MCP Sampling

1. Skills (policy/orchestration)
- define workflow strategy and quality bars:
  - extraction sequence,
  - retry/repair logic,
  - ambiguity handling,
  - confidence acceptance thresholds.
- should not perform side effects directly.

2. MCP (capabilities/data bridge)
- exposes executable tools and readable resources.
- is the only layer that performs side effects (create ruleset, start game, submit move).

3. MCP sampling (model reasoning)
- uses the current in-session model by default for candidate generation and repair loops.
- consumes primitives/docs/schema context from MCP resources.

## User-Facing Modes

1. Web-first
- user generates rulesets and plays directly in Just Cards UI.

2. ChatGPT-first
- user asks ChatGPT app to ingest rules and create game.
- ChatGPT calls MCP tools, then returns deep links to Just Cards routes.

3. BYO-chatbot MCP
- user runs another MCP-capable client against `just-cards-mcp`.

## MCP Tool Set (Target)

1. `generate_ruleset`
2. `validate_ruleset`
3. `list_rulesets`
4. `get_ruleset`
5. `start_game`
6. `get_game_state`
7. `submit_move`
8. `suggest_move`

### Model Source Policy

`generate_ruleset` should support:

1. `model_source: "session"` (default)
- use MCP sampling and the current in-session model/version.

2. `model_source: "server"` (fallback)
- use backend-configured models (current nano/mini pipeline) when session sampling is unavailable or explicitly requested.

## MCP Resource Set (Target)

1. primitives KB docs (`rulepack`, `gameplay`, `ui-profile`)
2. JSON schema artifacts
3. golden/eval fixture summaries
4. stored ruleset records
5. live game snapshots

## Remaining work

See [TODO](../TODO.md#follow-up-development) for the active integration backlog.
MCP transport, authentication, generation, suggestions and render tools are
implemented. Shared-room gameplay integration remains separate from the prototype
MCP game store; the implementation below describes the existing interfaces.

## Success Criteria

1. Generated rulesets render with game-appropriate visibility/flow on mobile without manual rule edits.
2. ChatGPT can generate and open playable rulesets from URL/prose with explainable diagnostics.
3. AI-assisted move suggestions are always validated by server gameplay rules before state mutation.

## MCP implementation

Delivered endpoints:

1. FastMCP transport endpoints (auth-aware):
- `POST /api/mcp` (MCP streamable HTTP / JSON-RPC ingress)
- `DELETE /api/mcp` (session lifecycle support)
- `GET /api/mcp` (transport-managed behavior)

2. Compatibility MCP endpoints (auth-aware):
- `GET /api/mcp/sse` (compatibility redirect to `/api/mcp`)
- `POST /api/mcp/messages?sessionId=...` (legacy path passthrough)
- `GET /api/mcp/tools`, `GET /api/mcp/resources`, `POST /api/mcp/call` remain available for custom client workflows.

3. OAuth protected resource metadata:
- `GET /.well-known/oauth-protected-resource`
- returns `resource`, `authorization_servers`, `scopes_supported`, and bearer metadata for MCP resource discovery.

4. Chat action endpoint (auth-aware):
- `POST /api/chat/actions`
- actions:
  - `create_from_url`
  - `explain_rules`
  - `open_playable_table`
  - `ask_next_move`

5. AI seat + hardening primitives:
- `start_game` supports optional `ai_seats`
- `get_game_state` returns `aiSeats`
- `suggest_move` supports `mode` (`coach|opponent|dealer_narrator`) and returns legal suggestions only
- generation budget controls: `maxSourceChars`, `maxServerRetries`, `maxToolCallsPerTrace`
- trace IDs on tool/action execution, structured server logs, and `just-cards://audit/recent` audit resource

6. MCP Apps render surfaces:
- render tools:
  - `render_game_table` (cards/hands/seats/table zones from live game state)
  - `render_score_leaderboard` (ranked standings from score session state)
- UI resources:
  - `ui://just-cards/apps/play-table/v1`
  - `ui://just-cards/apps/score-leaderboard/v1`
- FastMCP edge bridge injects Apps metadata into `tools/list` for render tools (`_meta.ui.resourceUri`, `_meta["openai/outputTemplate"]`) while preserving existing query/explore tools.

Environment controls:

1. `JUST_CARDS_MCP_AUTH_TOKEN` (when set, MCP/action routes require bearer token)
2. OAuth JWT mode:
- `JUST_CARDS_MCP_OAUTH_ISSUER` (enables OAuth JWT validation mode)
- `JUST_CARDS_MCP_OAUTH_JWKS_URL` (optional, defaults to `{issuer}/.well-known/jwks.json`)
- `JUST_CARDS_MCP_OAUTH_AUDIENCE` (optional expected `aud`)
- `JUST_CARDS_MCP_OAUTH_REQUIRED_SCOPES` (defaults to `mcp:tools mcp:resources`)
- `JUST_CARDS_MCP_OAUTH_REALM` (optional bearer challenge realm)
3. `JUST_CARDS_MCP_MAX_SOURCE_CHARS` (default `24000`)
4. `JUST_CARDS_MCP_MAX_SERVER_RETRIES` (default `1`)
5. `JUST_CARDS_MCP_MAX_TOOL_CALLS_PER_TRACE` (default `32`)
