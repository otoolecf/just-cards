# TDD Spec: About this project disclosure

## Intent

Explain the project's purpose, AI assistance and side-project status in the README
and on the site without interrupting scoring or play.

## In Scope

Use the approved paragraph with “while” joining the playing/learning sentence.
Place it near the top of the README and in a collapsed native details element in
the shared footer alongside the existing GitHub link.

## Out of Scope

Deployment, gameplay changes, new design tokens and repository visibility changes.

## Expected Outcomes

Score and Play expose the same About text on demand. The GitHub link remains
available with the disclosure closed. The summary works with keyboard and touch.

## Acceptance Criteria

- [x] Approved text appears near the top of the README.
- [x] About text starts collapsed and can be opened and closed by keyboard.
- [x] Summary target is at least 44px high and mobile width stays bounded.

## Data and Rules

No application state or game data changes. Reuse semantic text, background and
small typography tokens and the shared focus treatment.

## Test Plan (Red -> Green)

Add browser cases for Score and Play. Observe missing disclosure failure before
implementation, then check closed/open behavior, disclosure text, touch size and
mobile overflow with it open. Keep existing GitHub link regression tests passing.

## Implementation Notes

Use native details/summary in the root layout footer. No client-side state is needed.

## Rollback Plan

Remove the disclosure and README paragraph; preserve the existing source link.
