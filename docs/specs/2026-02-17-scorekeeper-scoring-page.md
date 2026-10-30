# TDD Spec: scorekeeper-scoring-page

## Intent

Build a mobile-first scorekeeper page that supports a single operator entering and correcting rounds quickly.
The page should be usable for live physical games where hands are visible, while keeping scoring state derived from `/api/sessions/{sessionId}`.

## In Scope

- Session setup for scorekeeper flow: game mode selection, player count, and player names.
- Session creation and session join by id.
- Round entry with card inputs in either:
  - per-player card text row mode
  - free text mode using `name: cards` syntax
- Undo/redo controls.
- Optional pattern round entry using:
  - target player
  - cards
  - pattern pack selection
  - pattern scoring map input
- Polling-based refresh loop for derived state (`GET /api/sessions/{sessionId}`).
- Standings and recent event preview from derived session response.
- Validation issue list display.

## Out of Scope

- Real-time multiplayer synchronization via WebSockets.
- Gameplay inference and advanced rule engine UI for live card play.
- Complex pattern editor tooling (only packaged presets and pasted JSON-like scoring map are in scope).

## Expected Outcomes

1. A user can create or join a session from the scoring page.
2. Add-round, undo, and redo events update standings from the GET endpoint response.
3. A pattern round can be submitted and reflected in derived standings.
4. All visible state (totals, issue list, events) is derived from session GET responses.

## Acceptance Criteria

- [x] User can configure game mode and players, then create a session.
- [x] User can join an existing session id and interact with live state.
- [x] Add round submits an `add_round` payload and refreshes standings immediately.
- [x] Undo and redo submit the correct event types and reflect derived totals.
- [x] Pattern round submits `add_pattern_round` and shows effect in totals when valid.
- [x] Validation issues render clearly with per-issue messages.
- [x] Event count and latest events render from GET payload.
- [x] Polling keeps a simple view updated when multiple devices update the same session.

## Data and Rules

- Inputs:
  - `POST /api/sessions` with game-mode-specific score rule pack config.
  - `POST /api/sessions/{sessionId}` with score keeper commands.
  - `GET /api/sessions/{sessionId}` for derived standings and event logs.
- Invariant:
  - UI state never writes totals directly; all scores come from server response.

## UI Implementation Decisions

- Use `bits-ui` for structured controls:
  - `Select.Root` / `Select.Trigger` / `Select.Content` / `Select.Item`.
- Centralize text and textarea entry via `src/lib/components/score-input.svelte` to keep spacing, hit target size, and disabled/hover/focus behavior consistent.
- Keep styles tokenized in the page styles rather than utility-heavy per-element overrides.
- Keep mobile-first layout and interactions:
  - Touch-friendly hit-size rules and compact panel spacing.
  - Native-like form labels plus explicit control labels for scanable screen-reader order.
- Keep behavior polling-based until websocket/live-multi-player UI is introduced.

## Test Plan (Red -> Green)

### Unit Tests (before implementation)

- [ ] `parseCardsFromText` parses mixed card formats with spaces and suits.
- [ ] `parseNamedRoundText` extracts per-player card lines from free text.
- [ ] `parsePatternScoringText` parses `patternId: points` entries.
- [ ] Event builders output valid score events.

### Integration/Behavior Tests (future)

- [ ] Create session, append add_round, verify GET-derived standings.
- [ ] Append undo/redo and verify derived totals.
- [ ] Append pattern round and verify issue/scoring behavior.

## Implementation Notes

- Keep UI small, mobile-first, and touch-friendly.
- Keep polling as interval-based refresh until WS is added.
- Keep parse/submit helpers typed and unit tested.

- Planned files:
  - `src/lib/session/score-session-api.ts`
  - `src/lib/session/score-session-commands.ts`
  - `src/lib/session/score-session-commands.test.ts`
  - `src/routes/+page.svelte`

## Rollback Plan

- Remove scoring page and revert to the repository default homepage if behavior becomes unstable.
- Keep `session` API unchanged; if needed, stop polling and disable write actions.
