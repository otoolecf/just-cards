# TDD Spec: ui-polish-pass-2

## Intent

After introducing shared color primitives, the UI still needs a final aesthetics pass focused on typography rhythm, motion consistency, and spacing cohesion. This should make the interface feel calmer and more intentional without adding complexity.

## In Scope

- Add shared typography and motion primitives.
- Apply those primitives to key Score/Play styles and controls.
- Keep interaction behavior unchanged.

## Out of Scope

- New user flows or gameplay behavior.
- Theming variants (dark mode/seasonal themes).

## Expected Outcomes

1. Typography hierarchy is more consistent and readable.
2. Motion durations/easings are coherent across controls and cards.
3. Spacing and panel rhythm feel cleaner on mobile and desktop.

## Acceptance Criteria

- [x] Typography scale and motion tokens are defined in shared UI primitives.
- [x] Unit tests enforce monotonic typography scale and sane motion duration ordering.
- [x] Score/Play/components use shared motion/typography variables for key UI elements.
- [x] Playwright screenshots show improved visual consistency across main screens.

## Data and Rules

- Rule/data inputs:
  - UI primitive token maps (`design-primitives.ts`)
  - Global CSS vars (`app.css`)
- Key invariants:
  - typography scale must be increasing.
  - motion durations must remain ordered fast < normal < slow.

## Test Plan (Red -> Green)

### Unit Tests (expected to fail first)

- [x] `typography_scale_is_monotonic`
- [x] `motion_tokens_have_ordered_durations`

### Integration/Behavior Tests (expected to fail first)

- [x] Existing app tests remain green.

## Implementation Notes

- Planned files:
  - `src/lib/ui/design-primitives.ts`
  - `src/lib/ui/design-primitives.test.ts`
  - `src/app.css`
  - `src/routes/+page.svelte`
  - `src/routes/play/+page.svelte`
- Constraints:
  - Preserve touch target sizing and existing tests/selectors.

## Rollback Plan

- Revert typography/motion token additions and local style adjustments.
