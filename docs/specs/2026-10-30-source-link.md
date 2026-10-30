# TDD Spec: Source link in the shared footer

## Intent

Let users find the project source without distracting from scoring or play.

## In Scope

Add one shared footer link labelled “Source on GitHub”, pointing to
`https://github.com/otoolecf/just-cards`. Open a separate tab so an active table
stays open. Use existing semantic tokens and a minimum 44px touch target.

## Out of Scope

Repository visibility changes, game behavior changes, and deployment.

## Expected Outcomes

Score and Play show the same accessible source link, without horizontal overflow
on a narrow mobile screen. Keyboard users can focus the link.

## Acceptance Criteria

- [x] Mobile Score and Play footers expose the exact repository URL.
- [x] The link opens a separate tab with `noopener noreferrer`.
- [x] Touch height is at least 44px; mobile width stays bounded.

## Data and Rules

The repository URL is public source metadata and contains no credentials. No new
visual tokens or runtime settings are needed.

## Test Plan (Red -> Green)

Add a browser test for both routes. Run it before implementation to observe the
missing-link failure, then rerun with the shared layout footer added.

## Implementation Notes

Use the root layout so every route shares the footer. Reuse `jc-mode-link` for
touch sizing and existing muted-text and typography tokens for presentation.

## Rollback Plan

Remove the footer from the root layout; game state is unaffected.
