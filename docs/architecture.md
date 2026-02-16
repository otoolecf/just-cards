# Just Cards Architecture (Planning Draft)

_Last updated: February 16, 2026_

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
- Broadcasts updates over WebSocket.
- Persists checkpoints/events to D1 for recovery/history.

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

Current scaffolding exposes an in-memory backend API for this flow at:
`/api/sessions` and `/api/sessions/{sessionId}`.

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

Example mappings:

- Rummy meld gating (set/run minimum length) belongs to `Validator`.
- Cribbage pairs/runs/fifteens belong to `PatternDetector` + `Scorer`.
- Bridge-style partnerships score to `team` targets.
- Crib/kitty scores can accrue to a `pool` target, then settle to dealer/team on trigger.

Canonical Rule IR details are documented in:
`/Users/ConnorO/git_repos/just-cards/docs/rulepack-v0.md`

## Future Rule Ingestion Pipeline

High-level flow:

1. Input rules URL.
2. Fetch and extract readable content.
3. LLM transforms text into `RulePack`.
4. Validate against strict JSON schema from `src/lib/scorekeeper/rulepack-schema.json`.
5. Run simulation checks/tests for obvious contradictions.
6. Save as draft rule pack for user review/publish.

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
