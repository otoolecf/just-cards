# TDD Spec: session-event-log

_Status: Implemented_
_Owner: Connor + agents_
_Date: 2026-02-16_

## 1) Intent

Create a minimal backend session primitive that stores score events in an append-only log
and derives current state by replay. Add a thin adapter so gameplay-layer scoring commands
can map into scorekeeper events without forcing UI coupling.

## 2) In Scope

- In-memory session creation and lookup.
- Append-only event log storage for scorekeeper sessions.
- State derivation by replaying score events through `deriveState`.
- Gameplay-scoring command adapter for:
  - `score_cards` / `score_round` -> `add_round`
  - `score_patterns` -> `add_pattern_round`
- API boundary endpoints to create sessions and append events for backend integration.

## 3) Out of Scope

- Durable Object persistence.
- D1-backed long-term storage or reconnection recovery.
- Full gameplay action validation pipeline.

## 4) Expected Outcomes

1. A session can accept both direct scorekeeper events and gameplay-mapped score commands.
2. Session score state is deterministic from the current event log.
3. Undo/redo behavior remains available because stored events are replayed through existing scorekeeper engine logic.

## 5) Acceptance Criteria

- [x] Session store stores event log and replays into scorekeeper state.
- [x] Gameplay scoring commands are converted into scorekeeper event types.
- [x] Session append endpoint accepts both direct and gameplay-mapped score payloads.
- [x] Unknown session IDs return errors through API/service surface.

## 6) Data and Rules

- Inputs:
  - Session config with score rule pack.
  - Session append payload (`scorekeeper` or `gameplay` command form).
- Key invariants:
  - Replaying the same event list must produce the same derived state.
  - Replay should preserve existing `undo` / `redo` behavior of scorekeeper events.

## 7) Test Plan (Red -> Green)

### Unit Tests

- [x] `creates a session and derives scores from direct scorekeeper events`
- [x] `adapts gameplay scoring commands into card-value score events`
- [x] `adapts gameplay pattern commands into pattern score events`
- [x] `supports undo replay through event log derivation`
- [x] `throws when appending to or reading missing session`

### Integration/Behavior Tests

- [ ] API endpoint smoke test (deferred until API test harness is introduced).

## 8) Implementation Notes

- Planned files:
  - `src/lib/session/score-event-adapter.ts`
  - `src/lib/session/session-store.ts`
  - `src/routes/api/sessions/+server.ts`
  - `src/routes/api/sessions/[sessionId]/+server.ts`
- Constraints:
  - Minimal in-memory store only in this phase (Cloudflare-friendly shape for future upgrade to DO/D1).
  - Keep adapter layer narrow and explicit.

## 9) Verification Checklist

- [x] Tests written before implementation
- [x] `npm test` passes
- [x] `npm run check` passes
- [x] `npm run build` passes

## 10) Rollback Plan

- Bypass session API by writing scorekeeper events directly to `deriveState` for local tools if service instability appears.
