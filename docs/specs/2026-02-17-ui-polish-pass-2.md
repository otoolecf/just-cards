# TDD Spec: ui-polish-pass-2

_Status: Complete_
_Owner: Codex_
_Date: 2026-02-17_

## 1) Intent

After introducing shared color primitives, the UI still needs a final aesthetics pass focused on typography rhythm, motion consistency, and spacing cohesion. This should make the interface feel calmer and more intentional without adding complexity.

## 2) In Scope

- Add shared typography and motion primitives.
- Apply those primitives to key Score/Play styles and controls.
- Keep interaction behavior unchanged.

## 3) Out of Scope

- New user flows or gameplay behavior.
- Theming variants (dark mode/seasonal themes).

## 4) Expected Outcomes

1. Typography hierarchy is more consistent and readable.
2. Motion durations/easings are coherent across controls and cards.
3. Spacing and panel rhythm feel cleaner on mobile and desktop.

## 5) Acceptance Criteria

- [x] Typography scale and motion tokens are defined in shared UI primitives.
- [x] Unit tests enforce monotonic typography scale and sane motion duration ordering.
- [x] Score/Play/components use shared motion/typography variables for key UI elements.
- [x] Playwright screenshots show improved visual consistency across main screens.

## 6) Data and Rules

- Rule/data inputs:
  - UI primitive token maps (`design-primitives.ts`)
  - Global CSS vars (`app.css`)
- Key invariants:
  - typography scale must be increasing.
  - motion durations must remain ordered fast < normal < slow.

## 7) Test Plan (Red -> Green)

### Unit Tests (expected to fail first)

- [x] `typography_scale_is_monotonic`
- [x] `motion_tokens_have_ordered_durations`

### Integration/Behavior Tests (expected to fail first)

- [x] Existing app tests remain green.

## 8) Implementation Notes

- Planned files:
  - `/Users/ConnorO/git_repos/just-cards/src/lib/ui/design-primitives.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/ui/design-primitives.test.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/app.css`
  - `/Users/ConnorO/git_repos/just-cards/src/routes/+page.svelte`
  - `/Users/ConnorO/git_repos/just-cards/src/routes/play/+page.svelte`
- Constraints:
  - Preserve touch target sizing and existing tests/selectors.

## 9) Verification Checklist

- [x] Tests written before implementation
- [x] Tests fail first (red)
- [x] Implementation added (green)
- [x] `npm run check` passes
- [x] `npm run build` passes

## 10) Rollback Plan

- Revert typography/motion token additions and local style adjustments.
