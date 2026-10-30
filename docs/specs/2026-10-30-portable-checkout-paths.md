# TDD Spec: Portable checkout paths

## Intent

Contributors should be able to use repository instructions and the mobile audit
script from their own checkout without depending on the original author's home directory.

## In Scope

- Replace absolute checkout paths in tracked documentation with repository-root-relative paths.
- Save mobile audit screenshots under the current checkout's `test-results/` directory.
- Render the hosted-app documentation link from `PUBLIC_APP_URL` into ignored build output.

## Out of Scope

- Git history rewriting, hosting changes, and application runtime URL configuration.

## Expected Outcomes

1. Tracked docs and scripts contain no paths into a particular user's home directory.
2. Existing screenshot names and application behavior remain unchanged.
3. Contributors understand that documentation paths are relative to the repository root.

## Acceptance Criteria

- [x] Repository portability guard passes.
- [x] Agent instructions define how relative file references resolve.
- [x] Check and build pass.

## Data and Rules

No game data, rules, or deployment bindings change. The public deployment link is
informational and is not consumed by application code. Docs builds require an explicit
HTTP(S) URL without embedded credentials; missing/invalid URLs fail before writing output.

## Test Plan (Red -> Green)

- Add a regression guard for user-home paths in tracked documentation and scripts.
- Run against the existing checkout to demonstrate failure, then repeat after cleanup.
- Build docs in a temporary directory with two different deployment URLs.
- Reject missing URLs, unsafe schemes and embedded credentials before generating docs.

## Implementation Notes

Strip the checkout prefix from existing references; keep documentation references
relative to the repository root. Screenshot output paths follow the script's
existing convention of running from the repository root.

## Rollback Plan

Revert the path cleanup commit if the audit workflow regresses.
