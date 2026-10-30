# TDD Spec: Public score responses and page read admission

## Intent

Prevent public score debug output from amplifying small stored histories into
large responses. Apply the existing request limiter before database-backed page
loads, including SvelteKit data requests, so page reads cannot bypass API limits.

## In Scope

- Session replay and public views never enable detailed scoring or pattern traces.
- Old trace-enabled records remain readable with unchanged totals and history;
  returned session configuration reports trace disabled.
- The existing platform limiter covers `/`, `/play`, `/play/[rulesetId]` and
  their data requests using resolved route IDs, before loaders/database calls.
- Missing limiter bindings fail closed for these pages, as they do for APIs.

## Out of Scope

- MCP widget rendering (explicitly deferred by the user), AI batching, deployment.
- New debug endpoints, new limits, catalog caching, and unrelated UI changes.

## Expected Outcomes and Acceptance Criteria

- [x] The audit's 40-modifier, three-round fixture returns correct totals without
  trace amplification, even with `config.trace: true`.
- [x] Stored legacy config and events are preserved; public views report trace false.
- [x] Event-level pattern match options cannot enable tracing during session replay.
- [x] Denied page HTML/data/HEAD requests return 429 and perform no database work.
- [x] Missing bindings return 503; allowed pages still load normally.
- [x] Page/API requests share the same client budget; static assets are unaffected.

## Data and Rules

Trace flags in legacy input are accepted for compatibility but are not execution
authority. Internal engine diagnostics remain available to direct callers. No
storage migration is needed. Page admission uses the framework's resolved route
ID so encoded paths and data requests receive the same policy.

## Test Plan (Red -> Green)

Use the real score API handler with an isolated repository for trace tests.
Use the real server hook and page loaders with isolated D1/limiter bindings for
page admission tests. Cover the reported reproductions, legacy replay, nested
trace options, allowed traffic, missing bindings, and shared-budget semantics.

## Implementation Notes

Change session-store replay/view projection and the server hook's admission route
selection. Preserve owner checks, write/body limits and existing rate thresholds.

## Required checks

Run focused regressions, the full test suite, `npm run check`, `npm run build`, and
`git diff --check`. Document the updated security behavior.

## Rollback Plan

Keep public traces disabled. If page admission causes an operational issue,
correct the binding or adjust the shared threshold after measuring normal traffic;
do not reopen an unprotected database path. Existing histories remain intact.

## Verification results

- Red: 16 of 17 new tests failed before implementation.
- Green: all 17 new regressions pass; full suite passes 423 tests in 78 files.
- Type checking: zero errors/warnings. Production build and diff checks pass.
- Replayed the exact three-event audit fixture: response shrank from 3,144,328
  bytes to 22,723 bytes; stored session remains 22,621 bytes and the total is 300.
- Confirmed installed SvelteKit strips data suffixes before resolving the route ID.
- No production deployment or MCP widget changes.
