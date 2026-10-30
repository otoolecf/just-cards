# Just Cards Architecture (Planning Draft)

_Last updated: September 17, 2026_

## Goal

Build a mobile-first web app for casual, in-person card gaming that supports:

1. Virtual card-table play (real-time, shared room state, visible face-up cards, private hands).
2. Scorekeeping-only mode when players have physical cards but no pen/paper.
3. Rule-driven game support where new games can be added with minimal code.
4. Future rule ingestion pipeline: provide a rules URL, generate a playable/scorable configuration.

## Recommended Stack

- Frontend: `SvelteKit` + `@sveltejs/adapter-cloudflare`
- Runtime/API: `Cloudflare Workers` (TypeScript)
- Real-time room state: `Durable Objects` + WebSockets
- Persistence: `D1`
- Async jobs: `Cloudflare Queues`
- Rule generation AI: `Workers AI` (or external LLM behind AI Gateway)

## Why Cloudflare First

- Fast deploy and simple operations for a small, lightweight project.
- Good fit for room-based real-time state via Durable Objects.
- Edge-hosted full-stack path that works well with SvelteKit.
- Free-tier capacity is enough for early prototyping and small live usage.

## Core Product Modes

## 1) Virtual Play Mode

Users join a room with a short code and see:

- Who they are and who else is in the game.
- Public game zones (face-up cards, discard piles, shared table state).
- Their private hand/deck views.
- Current turn indicators and basic action history.

### Key backend pattern

One Durable Object per game room:

- Owns authoritative room state.
- Validates and applies player actions.
- Streams viewer-specific projections over hibernating WebSockets, with HTTP polling as a fallback.
- Persists room events in Durable Object SQLite. D1 remains planned for broader indexed history.

## 2) Scorekeeper Mode

For physical-card play:

- Set up game + players quickly.
- Enter round events with low/no manual math.
- Apply game rules (example: face cards = 10).
- Undo/redo corrections.
- Show current standings and totals.

### Key data pattern

Event log model:

- `add_round`
- `edit_round`
- `undo`
- `redo`
- `correction`

#### Scorekeeper UI decisions (2026-02-17)

- `bits-ui` is used for select-like interactions and tab-like controls to keep accessible primitives and consistent behavior across form controls:
  - `Select.Root` + `Select.Trigger` + `Select.Content` + `Select.Item`.
- Reusable text/number control wrapper exists as `src/lib/components/score-input.svelte` so native inputs and textareas share one styling contract (`control`, `control-textarea`) and behavior.
- Visual consistency is driven by a shared token set in page-level styles (surface, foreground, muted, line, success/error) for predictable contrast and spacing.
- All scoring flows continue to use event-based server truth:
  - UI posts events to `POST /api/sessions/{sessionId}`.
  - Session and standings always come from `GET /api/sessions/{sessionId}`.

The API at `/api/sessions` and `/api/sessions/{sessionId}` persists config, player
rosters and score events in local SQLite during development and Durable Object
SQLite in the Worker. Totals remain derived from the event log.

Derived standings are recomputed from events, reducing data corruption risk.

Score rule abstraction details and examples live in:
`/Users/ConnorO/git_repos/just-cards/docs/scorekeeper-rules.md`

## Rules-as-Data Foundation

Define a versioned `RulePack` JSON schema with:

- Card values and rank handling.
- Action validation rules (`canPlay`) for legal/illegal moves.
- Pattern detection rules (`whatPatternsExist`) for sets/runs/pairs/etc.
- Scoring rules (`scorePatterns`) that convert detected patterns into point deltas.
- Scoring target model (`player`, `team`, `pool`) and settlement rules.
- Scoring trigger mode (`action-triggered` vs `phase-triggered`).
- Visibility rules (public, private, teammate-visible, etc.).
- Turn/action constraints.
- UI zones and labels needed for rendering.

Complement the runtime rules with a versioned `ui-profile/v0` payload so play UI can be generated from ruleset data (zones, quick targets, action labels, help text) without per-game component branches.

This enables:

- Reuse of core engine logic across multiple games.
- Dynamic game setup without custom per-game hardcoding.
- Future LLM pipeline to generate `RulePack` objects from rule text.

Gameplay-state mechanics are tracked through a separate `gameplay/v0` abstraction:

- player/turn/dealer state
- round and phase sequencing
- hand/table/meld/discard zone transitions

See:
`/Users/ConnorO/git_repos/just-cards/docs/gameplay-v0.md`

### Rule execution primitives

Separate primitives should be modeled explicitly:

1. `Validator`: decides if an action is legal (and why not).
   - Initial match primitives live in `src/lib/gameplay/validator.ts`.
   - Phase/action/actor gating and composition (`all`/`any`) are covered by
     [`specs/2026-02-16-gameplay-v0-validator.md`](./specs/2026-02-16-gameplay-v0-validator.md).
2. `PatternDetector`: finds score-relevant combinations from cards/context.
3. `Scorer`: maps detected patterns to signed score deltas.
4. `Trigger`: decides when scoring runs (on play action, end of hand, end of round, etc.).

`scorekeeper` currently wires `PatternDetector` through `ScoreEvent.type = add_pattern_round` and maps
`patternId` to points with explicit `patternScoring` metadata in `deriveState`.

Runtime orchestration now exists in `src/lib/runtime/game-runtime.ts`:

- mixed event stream support (`gameplay`, `score`, `manual_score`)
- optional validator enforcement on `zone_move` application
- declarative scoring triggers from gameplay events (`event_cards`, `player_zone`)
- scoring execution with `card_values`, `pattern`, and `fixed` scorer primitives
- manual score delta support through `ScoreEvent.type = add_delta`

Example mappings:

- Rummy meld gating (set/run minimum length) belongs to `Validator`.
- Cribbage pairs/runs/fifteens belong to `PatternDetector` + `Scorer`.
- Bridge-style partnerships score to `team` targets.
- Crib/kitty scores can accrue to a `pool` target, then settle to dealer/team on trigger.

Canonical Rule IR details are documented in:
`/Users/ConnorO/git_repos/just-cards/docs/rulepack-v0.md`

Canonical LLM/SLM primitive authoring reference is documented in:
`/Users/ConnorO/git_repos/just-cards/docs/primitives-kb-v0.md`

Ruleset persistence abstraction (local SQLite and a deployed D1 adapter) is documented in:
`/Users/ConnorO/git_repos/just-cards/docs/ruleset-storage-v0.md`

## Future Rule Ingestion Pipeline

High-level flow:

1. Input rules URL.
2. Fetch and extract readable content.
3. LLM transforms text into `RulePack`.
4. LLM transforms text into `ui-profile/v0` (or backend generates defaults from runtime primitives).
5. Validate runtime bundle (`runtime-bundle/v1`) and schema/runtime semantics.
6. Run simulation checks/tests for obvious contradictions.
7. Save as draft rule pack for user review/publish.

Current implementation path for step 6:

- persist via `RulesetStore` abstraction
- local dev/test default: SQLite (`node:sqlite`)
- deployed Worker: D1 adapter behind the same interface; request-scoped binding, no memory fallback
- persisted bundle shape: `runtime-bundle/v1` with `runtimeRulePack + uiProfile`

Current scaffold includes an LLM-aware generator API for this contract:
- `POST /api/rulesets/generate` accepts URL or prose input
- extraction builds deterministic baseline `RuleFacts v0`
- optional LLM agent path (`gpt-5-nano` default, `gpt-5-mini` fallback) improves extraction with repair/escalation loop
- deterministic fallback remains available when key/model output is unavailable
- compiler emits `runtime-bundle/v1` draft and persists via `RulesetService`
- generated bundles include optional `ruleset-explain/v0` payload for layman-facing guide + audit UI

Confidence gates:
- golden fixture eval suite validates extraction + compile behavior against known public rule links
- suite command: `npm run test:golden`
- bundle confidence suite validates runtime/UI primitive compatibility on generated bundles
- suite command: `npm run test:confidence`

Safety requirements:

- Never auto-publish unvalidated rule output.
- Require schema + simulation pass before play.
- Keep human-review mode available for ambiguous rules.

## Mobile-First Requirements

- Touch-first UI patterns (large hit targets, low-precision tolerance).
- Portrait-first layout that scales to tablets/desktop.
- PWA installability and app-like feel.
- Fast reconnect/resume after intermittent network drops.
- Optional offline-first scorekeeper workflow (sync on reconnect).

### PWA and mobile friendliness status

- The built scorekeeper uses `static/manifest.webmanifest` and the automatically registered `src/service-worker.ts` for offline shell/assets. A device score-event outbox supports offline entry and safe reconnect (see the September 17 update below).
- `/play` is the family lobby with a persisted game catalog, URL/text import and recent-room resume. `/play/room/{code}` renders authoritative shared games with live private/public cards.
- `/play/[rulesetId]` loads a persisted bundle. Supported table policies open a shared-game lobby; other bundles remain explicitly labelled draft previews.
- Shared rooms include a rules guide, scoring values/defaults and round history. Draft previews retain their guide/audit tab from bundle explainability data.
- Play surface labels are configurable per zone (`board`, `discard`, etc.) at the view-model layer so future generated games can rename UI semantics without changing gameplay primitive IDs.
- Play surface zone visibility and hints are profile-driven (visible-zone list + label/hint maps), allowing game-specific zone UX without game-specific rendering code branches.
- UI visual design primitives are centralized (shared token layer + contrast tests) to keep Score/Play surfaces consistent as generated game UIs expand:
  - `/Users/ConnorO/git_repos/just-cards/docs/ui-primitives-v0.md`
- Control sizing is normalized for touch:
  - `min-height: 44px` for entry controls and buttons.
  - clear tap-friendly spacing and compact layout breaks at mobile-first breakpoints.
- Shared play uses authenticated WebSockets with per-seat projections and reconnect; polling remains a fallback and the scorekeeper transport.

## Phased Delivery Plan

## Phase 0: Architecture + Contracts

- Finalize `RulePack` schema.
- Define room/session/player domain model.
- Choose first launch games (recommended: Golf + Rummy).

## Phase 1: Scorekeeper MVP

- Room creation/join.
- Player roster.
- Round entry with rule-backed scoring.
- Undo/redo.
- Standings board.

## Phase 2: Virtual Play MVP

- One fully playable game in real-time.
- Public/private card visibility.
- Turn enforcement and action validation.
- Rejoin/reconnect support.

## Phase 3: Rule Ingestion MVP

- URL ingestion job pipeline.
- LLM-to-RulePack generation.
- Schema validation + simulation checks.
- Draft/publish flow.

## Phase 4: Polish + Expansion

- Additional games.
- UX polish and onboarding.
- Performance tuning and observability.

## When to Re-evaluate AWS

Stay on Cloudflare unless one of these appears:

- Strong enterprise networking/compliance requirements not met on Cloudflare.
- AI/data workload scale that exceeds Cloudflare cost or capability targets.
- Need for deeper integrations that are materially easier in AWS.

Otherwise, keep architecture simple and continue on Cloudflare.

## Implemented family play slice (2026-09-17)

See [Shared table v1](./shared-table-v1.md) for executable policy, APIs, privacy,
storage boundaries, verified games, and remaining work. `runtimeRulePack.tableRules`
is optional within `runtime-bundle/v1`; legacy gameplay events and MCP previews remain
compatible. Supported games use shared rooms instead of the client-local demo.

## Structured import validation (2026-09-17)

Website and MCP generation share a strict `rule-extraction/v1` contract and pipeline. Model output includes executable `table-rules/v1`, complete rank values and source evidence. Separate source review and actual-engine behavioral checks produce persisted `rule-validation/v1` metadata. Imported rules require readiness before shared room creation; accepting assumptions reruns validation and saves an immutable copy. See [ruleset generation](./ruleset-generation-v0.md), which supersedes the earlier facts-only extraction scaffold described above.

## Device score outbox and manual variants (2026-09-17)

Physical scoring now has an event-derived device snapshot/outbox with idempotent
sync, event-count conflict detection, cross-tab Web Locks, and explicit conflict
copy recovery. Server state remains authoritative after synchronization. The built
score shell supports offline reload; APIs/private room pages are excluded from SW
caching. See [scorekeeper rules](./scorekeeper-rules.md).

Family house rules are immutable runtime bundles compiled from supported settings,
with parent provenance and fresh behavioral reports, saved through RulesetStore.
The same variants drive new shared rooms and guided scoring. See
[the feature spec](./specs/2026-09-17-offline-and-house-rules.md).


### Library metadata and interrupted rooms (2026-09-20)

RulesetStore now offers compare-and-set metadata updates for shared names/archive
flags. Favorites live in browser preferences; canonical bundles and existing game
snapshots remain immutable. Shared rooms snapshot the roster on each deal, preserve
retired identities for scoring history, and replay command retractions for host undo.
Pause/host/seat controls are authoritative room mutations. Private seat recovery uses
single-use hashed capabilities and rotates the authenticated seat credential. The
Durable Object revokes old sockets and uses presence alarms to pause disconnected
tables. See [Shared table v1](./shared-table-v1.md) and
[Ruleset storage](./ruleset-storage-v0.md) for contracts and user behavior.

### Additional card families (2026-09-20)

`table-engine` dispatches to `additional-table` using mutually exclusive patience,
shedding or contract policies. `contract-scoring` is a pure shared rubber scorer used
by both authoritative Bridge rooms and replayed physical `add_contract` score events.
New state zones are explicitly projected to avoid stock, blind-card and honors leaks.
Policy schemas remain backward compatible with stored Golf/Rummy bundles. Palace
house-rule switches are schema-validated curated variants; AI-imported new-family
policies remain blocked until import-time behavioral review covers those families.

## Public-room admission and owner AI

`RoomAdmission`, a separate singleton Durable Object, grants expiring active-room
reservations atomically. CardRoom remains authoritative for each game's event log.
Idle games release capacity and remain saved; host resume acquires a new slot.
The server hook limits AI generation and MCP/chat entry points to signed owner
sessions or owner-key headers. Family play remains account-free. Configuration,
failure semantics, privacy, and deployment details: [public rooms](./public-rooms.md).

### Tile capabilities (2026-09-27)

An optional `tileMahjong` policy dispatches to the tile engine alongside existing
card capabilities. Tile faces/identities are separate types; old card ranks, stored
policies and command behavior are unchanged. The pure hand evaluator and payment
function serve both authoritative rooms and physical `add_mahjong` events. Explicit
viewer projections expose only a player's own legal responses, never other pending
claims or the wall. No new infrastructure is required. See [mahjong](./mahjong.md).
