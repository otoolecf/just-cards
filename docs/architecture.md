# Just Cards architecture

Just Cards supports physical-card scorekeeping and shared virtual tables for
casual, in-person games. Rules are versioned data; server-side services validate
commands and own accepted state. Mobile clients submit actions and display the
resulting scores or viewer-specific table projections.

## Runtime and storage

The frontend and HTTP APIs use SvelteKit and TypeScript with
`@sveltejs/adapter-cloudflare`. The supported production runtime is Cloudflare
Workers. Pure game/scoring code is independent of host bindings; the
[code boundaries guide](./code-boundaries.md) maps modules and adapter interfaces.

| Responsibility | Vite development | Worker runtime |
| --- | --- | --- |
| Ruleset catalog | Node SQLite through RulesetStore | D1 through RulesetStore |
| Shared rooms and score sessions | Local SQLite adapters | CardRoom Durable Object SQLite |
| Capacity and resource admission | Local admission storage | RoomAdmission Durable Object |
| Table updates | HTTP polling | Authenticated WebSockets with polling fallback |
| Preferences and offline score outbox | Browser storage | Browser storage |

Built-in rule presets ship in code and are combined with the stored catalog.
Rooms retain immutable rule snapshots. D1 holds the catalog, not room event logs.
Local databases and simulated Wrangler bindings are separate; deployment does not
upload local games. Missing production bindings fail explicitly.

Queues and Workers AI are not required by the current deployment. Optional ruleset
generation calls an external model API. See [deployment](./deployment.md) for
bindings, provisioning and secrets, and [storage](./ruleset-storage-v0.md) for the
persistence contract.

## Physical-card scoring

Score events are the source of truth; totals, standings and undo/redo results are
derived from the log. The `/api/sessions` endpoints persist rosters, configuration
and events through SessionRepository. Manual points, guided card entry and supported
result-entry forms use the same event model.

The browser keeps an event-derived snapshot and offline outbox. Idempotent sync,
event-count conflict detection and cross-tab coordination protect reconnects.
Conflicts offer explicit copy recovery. Server state is authoritative after sync.
The service worker caches the score shell and assets, excluding private room pages
and APIs. See [scorekeeper rules](./scorekeeper-rules.md).

## Shared virtual tables

CardRoom serializes accepted room commands, persists history and manages sockets
and presence alarms. Each seat receives an explicit private/public projection;
other players' hands are never sent for client-side masking. Host/seat changes,
pause/resume, recovery and undo are server-validated operations. Single-use recovery
capabilities rotate seat credentials and revoke old sockets.

RoomAdmission coordinates resource registration, creation budgets and active-room
reservations across rooms. Idle games release active capacity while remaining
saved. Saved-data retention is a separate concern. See [shared tables](./shared-table-v1.md)
and [public rooms](./public-rooms.md) for gameplay, privacy and lifecycle contracts.

## Rules and UI contracts

The canonical stored payload is `runtime-bundle/v1`: `runtimeRulePack` plus
`uiProfile`, with optional explainability and validation metadata. UI selection
follows declared capabilities rather than game-name branches.

- [RulePack](./rulepack-v0.md) defines values, patterns, scorers, triggers and policies.
- [Gameplay primitives](./gameplay-v0.md) describe the reusable state/action model.
- [UI profiles](./ui-profile-v0.md) describe zones, visibility, labels and actions.
- [UI primitives](./ui-primitives-v0.md) define shared tokens, contrast and touch targets.
- [Primitive authoring reference](./primitives-kb-v0.md) documents supported rule inputs.

Shared table policies cover grid, meld, patience, shedding, contract and tile
capabilities. Pure scoring helpers can serve both table play and physical scoring;
[mahjong](./mahjong.md) documents the tile-specific conventions. Older prototype
runtime events and MCP previews remain separate from authoritative shared rooms.

## Ruleset import and review

The website and MCP generation share the `rule-extraction/v1` pipeline. URL/text
input is extracted into a strict schema, compiled, reviewed against its source and
checked through actual-engine behavioral scenarios. The stored `rule-validation/v1`
report records evidence, assumptions, blockers and the validated policy snapshot.
Ready candidates can start rooms. Supported drafts requiring review must be
explicitly accepted and revalidated; blocked candidates cannot be waived.

Without a model, heuristic extraction produces visibly unreviewed drafts.
Supported house-rule edits create immutable variants through RulesetStore;
existing rooms and score sessions retain their snapshots. Per-import behavioral
validation currently supports fewer families than curated built-in play.
See [generation](./ruleset-generation-v0.md), [explainability](./ruleset-explainability-v0.md)
and [confidence checks](./ruleset-confidence-v0.md).

## Access and integration boundaries

Family scoring/play does not require an account. Catalog management, AI imports
and MCP/chat entry points require owner authorization; MCP also enforces its bearer
or OAuth configuration. APIs bound request bodies, accepted scoring work and stored
history. These controls do not replace provider budgets or operator edge settings.
Current protections and limitations are in [security operations](./security-deployment.md).

[MCP integration](./chatgpt-mcp-roadmap-v0.md) exposes generation, query, prototype
play and rendering tools. Connecting prototype MCP gameplay to shared rooms remains
planned. [TODO](../TODO.md) is the central backlog; this document describes current
architecture rather than a delivery timeline.
