# TDD Spec: <feature-name>

_Status: Draft | In Progress | Complete_
_Owner: <name>_
_Date: <YYYY-MM-DD>_

## 1) Intent

Describe the user problem this feature solves in 2-5 sentences.

## 2) In Scope

- <behavior 1>
- <behavior 2>
- <behavior 3>

## 3) Out of Scope

- <explicit non-goal 1>
- <explicit non-goal 2>

## 4) Expected Outcomes

1. <observable outcome 1>
2. <observable outcome 2>
3. <observable outcome 3>

## 5) Acceptance Criteria

- [ ] <criterion 1; user-visible or domain-visible>
- [ ] <criterion 2>
- [ ] <criterion 3>

## 6) Data and Rules

- Rule/data inputs:
  - <input A>
  - <input B>
- Key invariants:
  - <invariant 1>
  - <invariant 2>

## 7) Test Plan (Red -> Green)

List tests before implementation.

### Unit Tests (expected to fail first)

- [ ] <test name>: <what it verifies>
- [ ] <test name>: <what it verifies>

### Integration/Behavior Tests (expected to fail first)

- [ ] <test name>: <what it verifies>

## 8) Implementation Notes

Keep short and concrete. Include touched files/modules and why.

- Planned files:
  - `<path>`
  - `<path>`
- Constraints:
  - <constraint 1>
  - <constraint 2>

## 9) Verification Checklist

- [ ] Tests written before implementation
- [ ] Tests fail first (red)
- [ ] Implementation added (green)
- [ ] Refactor performed without changing behavior
- [ ] `npm run check` passes
- [ ] `npm run build` passes

## 10) Rollback Plan

If behavior fails in real usage, how to disable/revert safely?

- <rollback step 1>
- <rollback step 2>

