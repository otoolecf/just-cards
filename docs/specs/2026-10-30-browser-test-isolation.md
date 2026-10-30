# Browser test isolation and current interaction contracts

## Intent
Make the ordinary browser suite repeatable without using developer databases,
secrets or an already running application. Preserve production UX and guards.

## Expected outcomes
- Every managed run starts from a fresh temporary app/data directory and a random
  test-only owner key. Local test room quotas accommodate the suite.
- Only management tests authenticate, including their separate API contexts;
  anonymous security tests remain anonymous.
- Guided scoring tests select the guided tab and expand disclosures when needed.
- Browser flows pass on consecutive runs; runtime-specific checks remain explicitly
  selectable against an isolated Worker. No paid AI or production calls by default.

## Validation
Use the existing failing browser scenarios as regressions (previous walkthrough
logs record failures). Run the full browser suite, type checks, unit tests and build.
Document any intentionally environment-specific skips rather than counting them
as passes. No application behavior changes are intended.

## Implementation and evidence

The default Playwright server copies the application into a fresh temporary
folder, uses the local SQLite adapters, and supplies a random owner key without
loading developer secret files. Its temporary adapter disables the Cloudflare
platform proxy because Vite cannot host this application's Durable Object classes.
Production config and application code are unchanged. Owner-only scenarios log
in their browser and any separate API context explicitly.

Guided card/result tabs are selected before entry and again after reload when
appropriate. Multiplayer tests wait for committed setup/draw state; assertions
allow the HTTP fallback's maximum 30-second polling interval. The shared-catalog
suite runs serially. The four existing Worker-specific skips remain unchanged.

Earlier runs reproduced anonymous management failures, stale tab assumptions and
polling timeouts. The first complete green run passed 38 browser tests with four
explicit runtime-specific skips. Unit tests passed all 438 tests; type checks and
production build passed. No deployment or production requests were made for this
change.

A second consecutive fresh-data run also passed all 38 default browser tests
with the same four explicit Worker-only skips (zero failures in both runs).
Logs: `/tmp/jc-e2e-fix-run4.log` and `/tmp/jc-e2e-fix-repeat.log`.
Documentation checks and `git diff --check` pass.
