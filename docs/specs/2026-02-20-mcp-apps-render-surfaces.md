# TDD Spec: mcp-apps-render-surfaces

## Intent

Just Cards already exposes MCP tools/resources for ruleset generation and gameplay state, but chat hosts that support MCP Apps need UI-bound tools/resources so users can see structured game visuals directly in-chat. This feature adds MCP Apps-compatible render surfaces for game table state and score leaderboard state while preserving existing query/explore MCP flows. The goal is to let chat users inspect hands/table zones and standings without leaving the chat context.

## In Scope

- Add MCP Apps render tools for:
  - game table surface (cards/hands/table/seats)
  - score leaderboard surface (ranked totals + session metadata)
- Add UI resources (`ui://...`) consumed by those render tools.
- Attach MCP Apps metadata to render tools in the FastMCP bridge.
- Preserve existing MCP tools/resources and compatibility API routes.

## Out of Scope

- Full multiplayer real-time widget syncing.
- Replacing existing web `/play` or scorekeeper pages.
- Adding game-specific hardcoded rendering branches.

## Expected Outcomes

1. MCP Apps-capable clients discover render tools with UI metadata and can load corresponding `ui://` resources.
2. Render tools return deterministic, ruleset-driven view payloads suitable for in-chat display.
3. Existing MCP query/explore tools remain unchanged and operational.

## Acceptance Criteria

- [x] `tools/list` includes render tools for play table and score leaderboard.
- [x] Render tools publish MCP Apps metadata with a `ui://` resource URI.
- [x] `resources/list` includes the UI resources used by those render tools.
- [x] Render game tool output includes hands/table zones and seat metadata from current game state.
- [x] Render leaderboard tool output includes sorted standings (respecting configured win direction).
- [x] Existing MCP tools (`generate_ruleset`, `start_game`, `submit_move`, etc.) still pass tests.

## Data and Rules

- Rule/data inputs:
  - Existing MCP game snapshots (`gameStore`) + ruleset bundles (`RulesetService`)
  - Existing score session state (`session-store`) for leaderboard extraction
- Key invariants:
  - No side-effect write occurs in render tools.
  - Win direction drives leaderboard sort (`high_wins` descending, `low_wins` ascending).
  - Render payloads are serializable and not tied to one game’s custom logic.

## Test Plan (Red -> Green)

List tests before implementation.

### Unit Tests (expected to fail first)

- [ ] `fastmcp_bridge_exposes_mcp_apps_render_tool_metadata`: render tools include MCP Apps metadata and UI URI.
- [ ] `fastmcp_bridge_lists_mcp_apps_ui_resources`: UI resources are listed/readable via `resources/list` + `resources/read`.
- [ ] `mcp_render_game_table_returns_ruleset_driven_surface_payload`: returns seat/hand/table data shape from stored game.
- [ ] `mcp_render_score_leaderboard_sorts_by_win_direction`: leaderboard ranks according to session mode.

### Integration/Behavior Tests (expected to fail first)

- [ ] `mcp_streamable_http_can_call_render_tools`: end-to-end initialize -> tools/call for render tools returns expected payload.

## Implementation Notes

Keep short and concrete. Include touched files/modules and why.

- Planned files:
  - `src/lib/mcp/types.ts`
  - `src/lib/mcp/server.ts`
  - `src/lib/mcp/fastmcp-server.ts`
  - `src/lib/mcp/server.test.ts`
  - `src/lib/mcp/fastmcp-server.test.ts`
  - `src/lib/mcp/fastmcp-api.test.ts`
  - `docs/chatgpt-mcp-roadmap-v0.md`
  - `docs/README.md`
- Constraints:
  - Keep tool output data-driven using existing gameplay/session primitives.
  - Maintain compatibility with existing auth-protected MCP endpoints.

## Rollback Plan

If behavior fails in real usage, how to disable/revert safely?

- Remove render tools from MCP tool registry and FastMCP bridge metadata.
- Keep core query/explore tools unchanged and continue using deep links to web UI.
