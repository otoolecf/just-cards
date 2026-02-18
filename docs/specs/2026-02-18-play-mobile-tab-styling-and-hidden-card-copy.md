# TDD Spec: Play Mobile Tab Styling And Hidden Card Copy

_Status: Complete_
_Owner: Codex_
_Date: 2026-02-18_

## 1) Intent

Mobile play currently shows browser-default tab controls for Bits UI tabs because scoped Svelte CSS is not applying to generated tab DOM nodes. Hidden cards also show as `??` in action copy, which is unclear to casual players. This pass makes tab styling deterministic and improves hidden-card language without changing core rules runtime behavior.

## 2) In Scope

- Ensure tab controls/content classes applied via Bits UI are styled using global selectors.
- Replace `Play ??` / `Moved ??` copy with human-friendly hidden-card wording.
- Keep existing gameplay primitives and move logic unchanged.

## 3) Out of Scope

- New gameplay rules or turn legality enforcement.
- Broad visual redesign outside the tab styling/copy fix.

## 4) Expected Outcomes

1. Mobile tab strip uses designed rounded/brand styles instead of browser default buttons.
2. Selecting a face-down card shows `Play hidden card to:`.
3. Moving a face-down card reports `Moved hidden card ...` in feedback.

## 5) Acceptance Criteria

- [x] `Tabs.List` / `Tabs.Trigger` / `Tabs.Content` styling classes are defined with global selectors.
- [x] Hidden-card action/feedback copy does not display `??`.
- [x] `npm run test`, `npm run check`, and `npm run build` pass.

## 6) Data and Rules

- Rule/data inputs:
  - `PlayCardView.isFaceDown`
  - Bits UI class names: `surface-tab-list`, `surface-tab`, `surface-content`
- Key invariants:
  - Card state remains unchanged by copy formatting.
  - Existing class names remain stable for current markup/tests.

## 7) Test Plan (Red -> Green)

### Unit Tests (expected to fail first)

- [x] `play-table-copy_hidden_cards_use_human_label`: hidden cards label as `hidden card`.
- [x] `play-table-styles_bits_ui_classes_are_global`: stylesheet includes global selectors for tab elements.

### Integration/Behavior Tests (expected to fail first)

- [x] Playwright manual screenshot audit shows styled tabs and hidden-card copy.

## 8) Implementation Notes

- Planned files:
  - `src/lib/components/play-table-copy.ts`
  - `src/lib/components/play-table-copy.test.ts`
  - `src/lib/components/play-table-style-contract.test.ts`
  - `src/lib/components/play-table.svelte`
- Constraints:
  - Keep changes localized to play table presentation layer.
  - Avoid adding new dependencies.

## 9) Verification Checklist

- [x] Tests written before implementation
- [x] Tests fail first (red)
- [x] Implementation added (green)
- [x] Refactor performed without changing behavior
- [x] `npm run check` passes
- [x] `npm run build` passes

## 10) Rollback Plan

- Revert `play-table.svelte` styling and copy changes.
- Remove new helper/tests if they cause instability.
