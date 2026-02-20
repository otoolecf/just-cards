# MCP Apps v0 (Just Cards)

This document defines how Just Cards uses MCP Apps-compatible UI surfaces alongside regular MCP tooling.

## Goal

Expose chat-native UI surfaces for:

1. play-table state (cards, hands, seats, table zones)
2. score leaderboard state (ranked standings)

without replacing existing query/explore MCP tools.

## Coexistence Model

Just Cards keeps two tool classes:

1. Data/query tools
- `generate_ruleset`
- `validate_ruleset`
- `list_rulesets`
- `get_ruleset`
- `start_game`
- `get_game_state`
- `submit_move`
- `suggest_move`

2. Render tools (MCP Apps surfaces)
- `render_game_table`
- `render_score_leaderboard`

Expected flow:

1. query/explore with data tools
2. render with one render tool when visual context helps
3. continue data tools for follow-up actions

## Render Tool Contracts

### `render_game_table`

Input:

```json
{
  "game_id": "game-...",
  "viewer_player_id": "You"
}
```

Output:

- `viewType: "play_table/v1"`
- game/ruleset identity
- `surface` payload derived from gameplay + UI profile primitives
- zone hints, quick targets, draw-enabled zones
- widget interaction contract:
  - hand-card select + quick target submit via `submit_move`
  - draw-from-zone submit via `submit_move`
  - polling refresh via repeated `render_game_table` calls

### `render_score_leaderboard`

Input:

```json
{
  "session_id": "sess-..."
}
```

Output:

- `viewType: "score_leaderboard/v1"`
- session identity
- `winDirection`
- ranked `standings[]`
- session event/update metadata
- polling refresh via repeated `render_score_leaderboard` calls

Sorting invariant:

- `high_wins`: descending totals
- `low_wins`: ascending totals

## UI Resources

Render tools map to these resources:

- `ui://just-cards/apps/play-table/v1`
- `ui://just-cards/apps/score-leaderboard/v1`

They are listed/readable as MCP resources so hosts can load templates.

## FastMCP Edge Notes

The `EdgeFastMCP` runtime does not natively expose tool `_meta` in tool registration.

Just Cards injects MCP Apps metadata into `tools/list` responses in the bridge layer for render tools:

- `_meta.ui.resourceUri`
- `_meta["openai/outputTemplate"]`
- invocation status text hints

This keeps Cloudflare-edge compatibility while preserving Apps metadata for clients that consume it.

## Fallback

If host UI rendering is unavailable, users can still:

1. call regular data tools for structured state
2. open web routes (`/play/[rulesetId]`, scorekeeper UI) from returned identifiers

No gameplay or scoring authority moves to the widget; server-side validation stays authoritative.
