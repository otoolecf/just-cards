# TDD Spec: ui-primitives-wcag-pass

_Status: Complete_
_Owner: Codex_
_Date: 2026-02-17_

## 1) Intent

UI styling currently duplicates token definitions across pages, making consistency and accessibility checks harder as game surfaces expand. We need explicit UI design primitives (tokens + interaction states) with measurable WCAG contrast guarantees. This makes visual behavior as composable and auditable as gameplay primitives.

## 2) In Scope

- Define shared UI color/contrast primitives with reusable token names.
- Add automated contrast tests for primary text/status/button pairs.
- Apply shared primitives across score/play/components for consistent look and interaction states.
- Add documentation for UI primitives to support LLM/SLM and human contributors.

## 3) Out of Scope

- Complete visual redesign of all flows.
- Dark mode.

## 4) Expected Outcomes

1. Core visual tokens are centralized and reused.
2. Key text/background combinations meet WCAG AA contrast.
3. Score and Play surfaces share a consistent visual system.

## 5) Acceptance Criteria

- [x] Shared design primitive module exists with color token source of truth.
- [x] Contrast tests verify key pairs meet AA thresholds.
- [x] Global stylesheet applies shared token aliases consumed by score/play/components.
- [x] UI primitive docs are added to docs index.

## 6) Data and Rules

- Rule/data inputs:
  - Color tokens and semantic pair definitions
  - Contrast function using relative luminance
- Key invariants:
  - Normal text pairs must be >= 4.5:1
  - Large/active badge pairs must be >= 3.0:1 (if used)

## 7) Test Plan (Red -> Green)

### Unit Tests (expected to fail first)

- [x] `contrast_ratio_is_symmetric`
- [x] `ui_text_pairs_meet_wcag_aa`
- [x] `ui_accent_pairs_meet_minimum_threshold`

### Integration/Behavior Tests (expected to fail first)

- [x] existing app tests remain green.

## 8) Implementation Notes

- Planned files:
  - `/Users/ConnorO/git_repos/just-cards/src/lib/ui/design-primitives.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/ui/design-primitives.test.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/app.css`
  - `/Users/ConnorO/git_repos/just-cards/docs/ui-primitives-v0.md`
- Constraints:
  - Preserve existing behavior and selectors used by tests.
  - Keep mobile-first readability and touch target sizes.

## 9) Verification Checklist

- [x] Tests written before implementation
- [x] Tests fail first (red)
- [x] Implementation added (green)
- [x] `npm run check` passes
- [x] `npm run build` passes

## 10) Rollback Plan

- Remove global token file import and restore page-local tokens.
- Revert UI primitive module and docs in one commit.
