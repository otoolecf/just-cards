# TDD Spec: play-mobile-layout-and-zone-profiles

_Status: Complete_
_Owner: Codex_
_Date: 2026-02-17_

## 1) Intent

The play interface must remain readable and actionable on phones without content being obscured by hand controls. Desktop should avoid a fixed full-width hand dock that competes with board content. Zone naming/visibility must be profile-driven so each game can present clear semantics beyond generic labels.

## 2) In Scope

- Make hand controls mobile-first with dynamic spacing based on dock height.
- Use non-overlapping hand panel behavior on larger screens.
- Add profile-driven zone metadata (label/hint/visible) for play surfaces.

## 3) Out of Scope

- Multiplayer realtime transport changes.
- Persisting UI profiles server-side.

## 4) Expected Outcomes

1. Mobile play content is not hidden behind fixed controls.
2. Desktop play shows board and hand without overlay conflicts.
3. Zone labels/hints/visibility are resolved from profile data, not hardcoded copy.

## 5) Acceptance Criteria

- [x] Play route calculates bottom spacing from measured hand dock height on mobile.
- [x] Desktop hand panel no longer overlays core board area.
- [x] Zone profile utilities provide visible-zone filtering and label/hint maps.
- [x] Play route uses zone profile output to render only configured zones.

## 6) Data and Rules

- Rule/data inputs:
  - Play surface profile (zone ids, labels, hints, visibility)
  - Gameplay derived state (`GameplayState`)
- Key invariants:
  - Hidden zones are not rendered.
  - Zone ids remain primitive identifiers even when labels change.

## 7) Test Plan (Red -> Green)

### Unit Tests (expected to fail first)

- [x] `visible_zones_exclude_hidden_entries`
- [x] `zone_label_and_hint_maps_are_derived_from_profile`

### Integration/Behavior Tests (expected to fail first)

- [x] Existing gameplay/play-surface tests remain green.

## 8) Implementation Notes

- Planned files:
  - `/Users/ConnorO/git_repos/just-cards/src/lib/gameplay/play-surface-profiles.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/gameplay/play-surface-profiles.test.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/routes/play/+page.svelte`
- Constraints:
  - Keep mobile-first interaction fast and touch-friendly.
  - Preserve existing score route behavior.

## 9) Verification Checklist

- [x] Tests written before implementation
- [x] Tests fail first (red)
- [x] Implementation added (green)
- [x] `npm run check` passes
- [x] `npm run build` passes

## 10) Rollback Plan

- Restore prior hand-dock positioning.
- Revert to static zone config in play route.
