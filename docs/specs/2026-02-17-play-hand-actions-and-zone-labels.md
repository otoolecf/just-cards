# TDD Spec: play-hand-actions-and-zone-labels

_Status: Complete_
_Owner: Codex_
_Date: 2026-02-17_

## 1) Intent

The play UI currently requires selecting a hand card and then navigating to a separate action area to play it, which is awkward on mobile. Zone names like `board` and `discard` are also too generic for many games. This feature brings play actions directly into the hand dock and adds configurable zone labels so game-specific wording is possible.

## 2) In Scope

- Add one-tap hand-dock play targets for selected cards.
- Make rendered zone labels configurable per game surface config.
- Keep existing gameplay primitives/events unchanged.

## 3) Out of Scope

- Ruleset-driven server persistence of UI label dictionaries.
- Drag-and-drop interaction model changes.

## 4) Expected Outcomes

1. Selecting a card immediately reveals play targets near the hand.
2. Users can play selected cards without using a separate action panel.
3. Surface labels are game-configurable and can avoid ambiguous generic terms.

## 5) Acceptance Criteria

- [x] Hand dock exposes play-target buttons when a card is selected.
- [x] Per-zone labels can be supplied to the play surface model and are rendered.
- [x] Existing score and gameplay derivation behavior remains unchanged.

## 6) Data and Rules

- Rule/data inputs:
  - `PlaySurfaceView` derivation options
  - `GameEvent.zone_move` for card movement
- Key invariants:
  - label override changes display text only, not zone IDs.
  - selected-card move emits same primitive shape as before.

## 7) Test Plan (Red -> Green)

### Unit Tests (expected to fail first)

- [x] `build_play_surface_view_applies_zone_label_overrides`: zone and hand labels come from optional label map.

### Integration/Behavior Tests (expected to fail first)

- [x] existing play surface model tests remain green.

## 8) Implementation Notes

- Planned files:
  - `/Users/ConnorO/git_repos/just-cards/src/lib/gameplay/play-surface-model.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/gameplay/play-surface-model.test.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/routes/play/+page.svelte`
- Constraints:
  - keep route mobile-first and touch-friendly.
  - keep score page unchanged beyond existing mode links.

## 9) Verification Checklist

- [x] Tests written before implementation
- [x] Tests fail first (red)
- [x] Implementation added (green)
- [x] `npm run check` passes
- [x] `npm run build` passes

## 10) Rollback Plan

- Revert hand-dock quick targets and use actions panel only.
- Remove label override option and default to generated labels.
