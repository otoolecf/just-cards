# Engine, storage, and hosting boundaries

The supported production host is Cloudflare. Much of the game logic is ordinary
TypeScript, but a different production host still needs a server implementation.

| Layer | Responsibility | Main code |
| --- | --- | --- |
| Rules and engine | Apply game commands, validate legal moves, evaluate hands, derive scores and per-viewer projections | [gameplay engine](../src/lib/gameplay/table-engine.ts), [score engine](../src/lib/scorekeeper/engine.ts), [runtime](../src/lib/runtime/game-runtime.ts) |
| Room orchestration | Manage seats, host privileges, revisions, pause/recovery and room operations | [room service](../src/lib/server/room-service.ts), [ManagedRoom](../src/lib/server/managed-room.ts) |
| Storage contracts | Persist rule bundles, room records and score-session event logs behind interfaces | [RulesetStore](../src/lib/rulesets/store.ts), [RoomStorage](../src/lib/server/room-storage.ts), [SessionRepository](../src/lib/session/session-store.ts) |
| Hosting adapters | Select storage, route requests, coordinate rooms, maintain sockets and alarms | [dispatch](../src/lib/server/room-dispatch.ts), [CardRoom](../src/lib/server/card-room.ts), [RoomAdmission](../src/lib/server/room-admission-object.ts) |
| UI and API | Render capability-driven controls; submit commands and display server projections | [Svelte routes](../src/routes/play/+page.svelte), [shared table](../src/lib/components/shared-table.svelte) |

## Rules and scores

The canonical rule payload is `runtime-bundle/v1`: `runtimeRulePack` plus
`uiProfile`, with optional explainability and validation metadata. Game policies
select reusable capabilities; the core does not need a Cloudflare binding to
calculate a legal move or score. See [RulePack](./rulepack-v0.md).

Score events are the source of truth. Totals and undo/redo results are derived
from the log. Multiplayer clients receive projections of authoritative room
state; they do not decide the accepted shared state or receive everyone else's
private hands. Browser-only display preferences, such as hand ordering, remain local.

## Where data lives

| Data | Vite development | Cloudflare Worker (including Wrangler locally) |
| --- | --- | --- |
| Custom ruleset catalog | Node SQLite, normally `.local/rulesets.sqlite` | D1 via `RULESETS_DB` and the RulesetStore adapter |
| Shared rooms | Node SQLite at `.local/rooms.sqlite` | Durable Object SQLite in CardRoom |
| Physical score sessions | Node SQLite at `.local/scores.sqlite` | Durable Object SQLite through SessionRepository |
| Room admission/capacity | Node SQLite at `.local/admission.sqlite` | Separate RoomAdmission Durable Object |
| Preferences/offline scoring outbox | Browser storage | Browser storage, reconciled with authoritative server state |

Built-in presets are shipped in code and composed with the stored catalog.
Each active room keeps its own rule snapshot. D1 is not the game-room event store.
Wrangler simulates its bindings under `.wrangler/`; it does not reuse Vite's
`.local/` databases. No local data is automatically uploaded on deployment.

## What Durable Objects supply

CardRoom is addressed by room identity and owns persisted room state, authenticated
WebSocket connections, viewer-specific broadcasts, and presence alarms.
RoomAdmission coordinates installation-wide capacity across rooms. This gives the
app one authoritative place to process each room's commands.

Vite uses a local manager with polling. The built Worker uses Durable Objects and
WebSockets, with polling fallback. Missing production storage bindings fail
explicitly rather than silently switching to memory.

## What another host would require

The engine and rule contracts can be reused. The current production build uses
`@sveltejs/adapter-cloudflare`; there is no supported Docker/VPS deployment today.
A new host needs a compatible SvelteKit adapter and implementations of persistence,
atomic room updates, multi-process coordination, admission leases, authenticated
WebSockets and disconnect/presence handling. Matching database SQL alone does not
replace that coordination. Existing local SQLite adapters are development support,
not a complete alternative production server.

Queues and Workers AI appear in the planning architecture, but are not required
bindings for the current deployment. Optional generation currently calls an
external model API. See the [deployment guide](./deployment.md) and
[storage contract](./ruleset-storage-v0.md) for operational details.
