# TDD Spec: mcp-apps-widget-interactions

## Intent

The current MCP Apps widgets render state but are mostly static. Users should be able to interact directly with the play widget (draw/move cards) and see state update without manual re-calls. This spec adds in-widget tool invocation (`submit_move`) and automatic refresh loops for live-ish state updates.

## In Scope

- Play-table widget action wiring:
  - select hand card
  - tap quick target to move selected card
  - tap draw controls to draw from eligible zones
- Polling refresh loop in play-table widget.
- Polling refresh loop in leaderboard widget.

## Out of Scope

- True streaming transport subscriptions in widget.
- Multiplayer websocket synchronization in widget.
- Host-specific visual theming beyond existing widget styles.

## Expected Outcomes

1. Widget scripts call MCP tools through `openai.callTool` when available.
2. Play widget can submit move events then fetch refreshed render state.
3. Leaderboard widget auto-refreshes by repeatedly invoking render tool.

## Acceptance Criteria

- [x] Play-table UI resource includes `openai.callTool('submit_move', ...)` for card/draw actions.
- [x] Play-table UI resource includes periodic refresh invoking `render_game_table`.
- [x] Score leaderboard UI resource includes periodic refresh invoking `render_score_leaderboard`.
- [x] Existing MCP tests remain green.

## Data and Rules

- Rule/data inputs:
  - `render_game_table` payload with game identity and surface cards.
  - `render_score_leaderboard` payload with session identity and standings.
- Key invariants:
  - Interactions are no-op when `openai.callTool` is unavailable.
  - Widget never mutates state locally as source of truth; it re-renders from tool results.

## Test Plan (Red -> Green)

### Unit Tests (expected to fail first)

- [ ] `mcp_apps_play_table_resource_exposes_submit_move_and_refresh_hooks`
- [ ] `mcp_apps_score_leaderboard_resource_exposes_refresh_hook`

### Integration/Behavior Tests (expected to fail first)

- [ ] Re-run MCP suite to ensure no regressions in existing tool/resource APIs.

## Implementation Notes

- Planned files:
  - `src/lib/mcp/fastmcp-server.test.ts`
  - `src/lib/mcp/server.ts`
- Constraints:
  - Keep widget logic self-contained in UI resource HTML.
  - Preserve compatibility fallback when no Apps bridge is present.

## Rollback Plan

- Revert widget scripts to render-only templates.
- Keep render tools and data/query tools intact.
