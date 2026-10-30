# TDD Spec: scorekeeper-mode-persistence

## Intent

Scorekeeper mode selection should be session truth, not just local UI state. A user who creates a session with a specific mode (for example `Rummy`) should see that mode again when the session is reloaded or joined from another screen/device. This keeps scoring behavior and UI labels aligned with the same ruleset.

## In Scope

- Persist `scoreModeId` in session config at session creation.
- Return persisted mode metadata from session `GET` responses.
- Hydrate scoring page mode selection from session state after create/join/load.
- Keep score derivation server-authoritative from session rule pack config.

## Out of Scope

- AI-driven rule generation or ingestion pipeline.
- New game-rule authoring UI/editor.

## Expected Outcomes

1. Creating a session with a selected mode persists that mode in session state.
2. Rejoining an existing session restores the mode in the scorekeeper UI.
3. Displayed mode label matches the active session’s scoring configuration.

## Acceptance Criteria

- [x] Session state view includes persisted `scoreModeId`.
- [x] Rejoining a session hydrates `selectedModeId` from session state.
- [x] Scorekeeper summary shows the persisted mode after join/reload.

## Data and Rules

- Inputs:
  - `POST /api/sessions` with `config.scoreModeId`.
  - `GET /api/sessions/{sessionId}` returning persisted mode metadata.
- Invariants:
  - Mode metadata reflects the rule pack selected at session creation.
  - Totals remain derived from event log + server-side rule pack.

## Test Plan (Red -> Green)

### Unit Tests (before implementation)

- [x] `session_store_view_includes_score_mode_id`: mode id is returned in session state view config.

### Integration/Behavior Tests (before implementation)

- [ ] `scorekeeper_mode_is_restored_when_joining_existing_session`: selecting a different local mode then joining restores the persisted mode.

## Implementation Notes

- Planned files:
  - `src/lib/session/session-store.ts`
  - `src/lib/session/session-store.test.ts`
  - `src/lib/session/score-session-api.ts`
  - `src/routes/+page.svelte`
  - `tests/e2e/scorekeeper.spec.ts`
- Constraints:
  - Keep API and state contracts backward-compatible where possible.
  - Keep UI mode display based on persisted session metadata when session is active.

## Rollback Plan

- Stop hydrating `selectedModeId` from session view and fall back to local UI default.
- Remove `scoreModeId` from session state view while leaving rule-pack scoring behavior unchanged.
