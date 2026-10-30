# TDD Spec: play-mobile-layout-and-zone-profiles

## Intent

The play interface must remain readable and actionable on phones without content being obscured by hand controls. Desktop should avoid a fixed full-width hand dock that competes with board content. Zone naming/visibility must be profile-driven so each game can present clear semantics beyond generic labels.

## In Scope

- Make hand controls mobile-first with dynamic spacing based on dock height.
- Use non-overlapping hand panel behavior on larger screens.
- Add profile-driven zone metadata (label/hint/visible) for play surfaces.

## Out of Scope

- Multiplayer realtime transport changes.
- Persisting UI profiles server-side.

## Expected Outcomes

1. Mobile play content is not hidden behind fixed controls.
2. Desktop play shows board and hand without overlay conflicts.
3. Zone labels/hints/visibility are resolved from profile data, not hardcoded copy.

## Acceptance Criteria

- [x] Play route calculates bottom spacing from measured hand dock height on mobile.
- [x] Desktop hand panel no longer overlays core board area.
- [x] Zone profile utilities provide visible-zone filtering and label/hint maps.
- [x] Play route uses zone profile output to render only configured zones.

## Data and Rules

- Rule/data inputs:
  - Play surface profile (zone ids, labels, hints, visibility)
  - Gameplay derived state (`GameplayState`)
- Key invariants:
  - Hidden zones are not rendered.
  - Zone ids remain primitive identifiers even when labels change.

## Test Plan (Red -> Green)

### Unit Tests (expected to fail first)

- [x] `visible_zones_exclude_hidden_entries`
- [x] `zone_label_and_hint_maps_are_derived_from_profile`

### Integration/Behavior Tests (expected to fail first)

- [x] Existing gameplay/play-surface tests remain green.

## Implementation Notes

- Planned files:
  - `src/lib/gameplay/play-surface-profiles.ts`
  - `src/lib/gameplay/play-surface-profiles.test.ts`
  - `src/routes/play/+page.svelte`
- Constraints:
  - Keep mobile-first interaction fast and touch-friendly.
  - Preserve existing score route behavior.

## Rollback Plan

- Restore prior hand-dock positioning.
- Revert to static zone config in play route.
