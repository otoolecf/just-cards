# MCP integration

Just Cards exposes MCP tools and resources for ruleset generation, inspection,
prototype gameplay and score rendering. The web app remains the shared-table UI;
its authoritative rooms are separate from the prototype MCP game store.

## Implemented

| Capability | Interface |
| --- | --- |
| Generate, validate and inspect rulesets | `generate_ruleset`, `validate_ruleset`, `list_rulesets`, `get_ruleset` |
| Prototype game snapshots and validated moves | `start_game`, `get_game_state`, `submit_move` |
| Legal move suggestions and optional AI-seat metadata | `suggest_move`; `ai_seats` on `start_game` |
| Render prototype tables or physical score standings | `render_game_table`, `render_score_leaderboard` |

FastMCP handles JSON-RPC through `/api/mcp`, including transport session lifecycle.
Compatibility routes provide `/api/mcp/sse`, `/api/mcp/messages`, `/api/mcp/tools`,
`/api/mcp/resources` and `/api/mcp/call`. The protected-resource discovery endpoint
is `/.well-known/oauth-protected-resource`.

`POST /api/chat/actions` offers `create_from_url`, `explain_rules`,
`open_playable_table` and `ask_next_move` for custom clients. Tools return structured
state and identifiers/deep links. The server validates accepted moves; a model
suggestion or widget interaction cannot replace gameplay validation.

## Generation and resources

Generation accepts URL or text input and uses the same extraction, review,
behavioral validation and stored readiness reports as the website. See the
[generation contract](./ruleset-generation-v0.md). `model_source: "session"`
requests an injected session sampler; `"server"` requests the configured provider.
The default server does not install a session sampler, so session requests fall
back transparently to the server pipeline. There is no assumption that the hosting
chat application's current model is automatically available to the backend.

MCP resources include primitive documentation, schemas, stored rulesets, game
snapshots and trace diagnostics. Resource data and imported rule text are untrusted
input. Generated rule data is schema-checked; no generated code is executed.

## Authentication and budgets

MCP/chat routes require owner authorization in addition to MCP bearer-token or
OAuth authentication. Sign in at `/owner` for browser use; non-browser clients
supply the owner key as documented in [authentication setup](./mcp-oauth-setup.md).
Unconfigured protected access stays disabled.

The main configuration inputs are:

- `JUST_CARDS_MCP_AUTH_TOKEN`, or the `JUST_CARDS_MCP_OAUTH_*` issuer, JWKS,
  audience, scope and algorithm settings described in the authentication guide.
- `JUST_CARDS_MCP_MAX_SOURCE_CHARS` (default 24,000).
- `JUST_CARDS_MCP_MAX_SERVER_RETRIES` (default 1).
- `JUST_CARDS_MCP_MAX_TOOL_CALLS_PER_TRACE` (default 32).
- Server model credentials/settings described in the generation guide.

HTTP admission, provider limits and trace/tool limits are distinct. JSON-RPC batches
can contain multiple generation calls while consuming one HTTP admission unit.
Configure provider budgets; the HTTP allowance is not a token-spend ceiling.
See [security operations](./security-deployment.md) for unresolved limitations.

## Rendering

The render tools use `ui://just-cards/apps/play-table/v1` and
`ui://just-cards/apps/score-leaderboard/v1`. The FastMCP bridge supplies Apps metadata
on render tools while leaving structured query tools available. Hosts without
widget support can consume structured responses and open the web routes.

Widget HTML still needs safe text/attribute construction for untrusted names,
labels and messages. Host sandbox behavior is not a substitute for fixing that
rendering path. Prefer structured tools with untrusted data until this is resolved.
Detailed input/output and interaction contracts are in [MCP Apps](./mcp-apps-v0.md).

## Planned

Connect `start_game`, state reads, moves and suggestions to authoritative shared
rooms, including room admission and per-seat privacy. The existing prototype tools
do not join, control or inherit the real-time lifecycle of family rooms.

Automatic play by AI seats in shared rooms is not delivered by storing prototype
AI-seat metadata. Further work must preserve server validation, consent and private
projections. The prioritized integration work is tracked in [TODO](../TODO.md).
