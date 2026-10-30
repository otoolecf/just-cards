# TDD Spec: Runtime scoring work budget

## Intent

Anonymous score events can make the pattern detector do much more work than its
preflight estimate predicts. Bound actual enumeration and replay work without
requiring accounts or changing scores for ordinary games.

## In Scope

- A deterministic, request-local counter shared by nested patterns and entries.
- At most 10,000 runtime work units per pattern scoring event/detection, and
  100,000 across a complete score replay. Units count enumeration branches,
  candidate processing and combination attempts, including discarded matches.
- Sequential `all` evaluation stops at the first empty child.
- Exhaustion throws a controlled validation error, never partial totals; append
  validates the complete replay before persisting.
- Existing saved events receive the same protection during reads and replay.

## Out of Scope

- Owner MCP/AI budgets, authentication changes, production deployment.
- Automatic deletion or rewriting of existing score history.

## Expected Outcomes and Acceptance Criteria

- [x] The reported empty-first-child pattern skips expensive later children.
- [x] Runtime work is bounded even when estimates or output caps miss work.
- [x] Entries and replay events cannot each reset their enclosing budget.
- [x] Rejected appends leave repository contents unchanged.
- [x] Legacy expensive history returns a controlled error, never partial scores.
- [x] Ordinary patterns and undo/redo keep their scores.

## Data and Rules

Budgets are internal execution state, never accepted from JSON match options.
Counters are created per operation, not at module scope. Preflight card/node/depth
and candidate estimates remain fast guards. Work exhaustion is deterministic,
not based on wall-clock timing. Limits are not a monetary billing cap.

## Test Plan (Red -> Green)

- Reproduce the 13-card, 30-child exploit and inspect skipped evaluation via trace.
- Exercise expensive generation with maxMatches=1 and discarded combinations.
- Share work across nested patterns and multiple score entries.
- Reject cumulative replay work, including persisted legacy data.
- Verify append atomicity and controlled API errors.
- Run existing scoring/game regressions, full tests, check and build.

## Implementation Notes

Extend pattern-budget.ts, thread counters through pattern-detector.ts and
scorekeeper/engine.ts, and use the session service's pre-save replay validation.
Document limits and recovery behavior in security and scoring docs.

## Required checks

`npm test`, `npm run check`, `npm run build`, `git diff --check`.

## Rollback Plan

Keep the protection enabled for public traffic. If a legitimate rule exceeds the
budget, simplify its pattern or start a new session; investigate with fixtures
before adjusting limits. Preserve existing histories for recovery.

## Verification results

- Red: four of the first five regressions failed on the original implementation
  (empty-child short circuit, actual enumeration, shared entry work, replay work).
- Green: all 11 dedicated regressions pass, covering nested composition, output
  caps, multiple rules, rejected append atomicity, replay, JSON override attempts,
  and undo/redo recovery.
- Full suite: 405 tests across 76 files passed before the final recovery test was
  added; the updated 11-test regression file also passes.
- Type checking: zero errors and warnings. Production build and diff checks pass.
- No deployment or live load testing performed.
