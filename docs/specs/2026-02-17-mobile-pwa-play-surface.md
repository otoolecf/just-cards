# TDD Spec: mobile-pwa-play-surface

_Status: Complete_
_Owner: Codex_
_Date: 2026-02-17_

## 1) Intent

The app needs a mobile-native play surface that can render cards in player hand and shared board zones while staying driven by existing gameplay primitives. This allows us to support many card games without hardcoded one-off UI flows. The UI must feel fast and understandable on phones and keep score workflows available in parallel.

## 2) In Scope

- Add a `Play` surface with visible hand, board zones, turn/dealer indicators, and move actions.
- Keep `Score` workflow available and default-active so scorekeeper flows remain intact.
- Build a typed view-model layer from gameplay state primitives to reusable UI shape.
- Add motion for card/state transitions suitable for mobile interaction.

## 3) Out of Scope

- Multiplayer realtime transport (Durable Objects/WebSockets).
- Full game-specific ruleset authoring UI.

## 4) Expected Outcomes

1. Users can open a play tab and interact with cards (select and move between zones).
2. Hand, board zones, and seat metadata (dealer/current turn) are rendered from primitive state.
3. Score screen remains operational and unchanged in behavior for existing flows.

## 5) Acceptance Criteria

- [x] Root score page exposes mobile `Score`/`Play` mode links for fast switching.
- [x] Play surface renders `hand` and named board zones with visible card counts and cards.
- [x] User can move a selected hand card to at least one table zone with animated transition.
- [x] Seat strip shows dealer and current-turn markers from gameplay state.
- [x] Existing score session flow remains available from score mode/page.

## 6) Data and Rules

- Rule/data inputs:
  - `GameplayState` from `gameplay/v0` engine
  - `GameEvent` mutations (`deal_cards`, `zone_move`, `advance_turn`, `undo`, `redo`)
- Key invariants:
  - UI card rendering keys must be stable for transitions.
  - UI state derives from primitive state/events rather than game-specific hardcoded logic.

## 7) Test Plan (Red -> Green)

List tests before implementation.

### Unit Tests (expected to fail first)

- [x] `build_play_surface_view_marks_seats_and_zones`: derives dealer/current turn and zone summaries from gameplay state.
- [x] `create_hand_move_event_uses_selected_card_and_zone`: emits a valid `zone_move` payload from hand selection.
- [x] `card_view_key_prefers_card_id_tag`: card rendering key uses `cid:<id>` tag when present.

### Integration/Behavior Tests (expected to fail first)

- [x] `play_surface_demo_round_flow`: initial demo gameplay events produce populated hand and board zone summaries.

## 8) Implementation Notes

Keep short and concrete. Include touched files/modules and why.

- Planned files:
  - `/Users/ConnorO/git_repos/just-cards/src/lib/gameplay/play-surface-model.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/gameplay/play-surface-model.test.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/routes/play/+page.svelte`
  - `/Users/ConnorO/git_repos/just-cards/src/routes/+page.svelte`
- Constraints:
  - Preserve current scorekeeper tests/selectors and default flow.
  - Use `bits-ui` primitives for tab and control interactions.

## 9) Verification Checklist

- [x] Tests written before implementation
- [x] Tests fail first (red)
- [x] Implementation added (green)
- [x] Refactor performed without changing behavior
- [x] `npm run check` passes
- [x] `npm run build` passes

## 10) Rollback Plan

If behavior fails in real usage, how to disable/revert safely?

- Remove Play tab content while keeping Score tab default.
- Revert `+page.svelte` and `play-surface-model` module in one commit.
