# TDD Spec: <feature-name>

## Intent

Describe the user problem this feature solves in 2-5 sentences.

## In Scope

- <behavior 1>
- <behavior 2>
- <behavior 3>

## Out of Scope

- <explicit non-goal 1>
- <explicit non-goal 2>

## Expected Outcomes

1. <observable outcome 1>
2. <observable outcome 2>
3. <observable outcome 3>

## Acceptance Criteria

- [ ] <criterion 1; user-visible or domain-visible>
- [ ] <criterion 2>
- [ ] <criterion 3>

## Data and Rules

- Rule/data inputs:
  - <input A>
  - <input B>
- Key invariants:
  - <invariant 1>
  - <invariant 2>

## Test Plan (Red -> Green)

List tests before implementation.

### Unit Tests (expected to fail first)

- [ ] <test name>: <what it verifies>
- [ ] <test name>: <what it verifies>

### Integration/Behavior Tests (expected to fail first)

- [ ] <test name>: <what it verifies>

## Implementation Notes

Keep short and concrete. Include touched files/modules and why.

- Planned files:
  - `<path>`
  - `<path>`
- Constraints:
  - <constraint 1>
  - <constraint 2>

## Required checks

- Confirm the new behavior has regression coverage.
- Run `npm run check` and `npm run build`.

## Rollback Plan

If behavior fails in real usage, how to disable/revert safely?

- <rollback step 1>
- <rollback step 2>
