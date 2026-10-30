# Feature Specs (TDD)

This folder retains behavior, contract and design specifications written before
tests and implementation. Completed cosmetic/setup task notes and release reports
may be removed from the current tree once their lasting guidance is in maintained
docs. Previous versions remain available in Git history.

The active backlog lives in [TODO](../../TODO.md). These specifications describe
feature contracts and test plans; unchecked boxes alone do not indicate outstanding work.

## Workflow

For each feature:

1. Create a new spec file in this folder.
2. Base it on [`../templates/tdd-spec-template.md`](../templates/tdd-spec-template.md).
3. Write failing tests that match the spec outcomes.
4. Implement code until tests pass.
5. Refactor while keeping tests green.

## Naming Convention

Use dated, kebab-case filenames:

- `YYYY-MM-DD-<feature-name>.md`

Example:

- `2026-02-16-scorekeeper-round-entry.md`
- `2026-02-16-rulepack-runtime-schema-validation.md`

## Minimum Spec Quality Bar

A spec should clearly define:

- User intent/problem
- In-scope and out-of-scope behavior
- Acceptance criteria
- Tests planned before implementation
- Rollback/safety notes
