# TDD Spec: Sitemap database admission

## Intent
Prevent sitemap requests from bypassing the shared API/database read limiter.
Reject exhausted or unavailable production admission before reading the catalog.

## In Scope
Include the resolved `/sitemap.xml` route in the existing edge admission guard.
Cover GET, HEAD, encoded URLs and query strings using the actual sitemap handler.
Update the operational description of protected database reads.

## Out of Scope
Sitemap pagination, caching changes, new rate-limit budgets and unrelated fixes.

## Expected Outcomes and Acceptance Criteria
- Denied sitemap requests return 429 with Retry-After: 60 and no D1 queries.
- Missing limiter binding returns 503 without resolving or querying the catalog.
- Admitted requests still render XML and use the same address budget as APIs/pages.
- Static assets and robots.txt remain outside database admission.

## Data and Rules
Use the resolved SvelteKit route ID so encoded URLs cannot bypass admission.
Reuse API_RATE_LIMIT and existing error responses; no storage migration is needed.

## Test Plan (Red -> Green)
Extend hook admission tests with actual sitemap GET resolution. Assert zero resolve
and database calls for denied/missing-binding requests, shared budget exhaustion,
and normal XML results for admitted GET and HEAD requests. Run the regressions
before implementation, then with the fix and full unit suite.

## Required checks
npm test; npm run check; npm run build; focused SEO browser tests; deployment dry run.

## Rollback Plan
Restore the prior Worker version if deployment causes unexpected failures. Keep
sitemap database reads protected when diagnosing rate-limit configuration.
