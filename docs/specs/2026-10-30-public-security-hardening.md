# Public deployment security hardening

## Intent
Close the audited script-execution and computational abuse paths, constrain public persistence, and prepare repeatable security checks without requiring player accounts.

## Expected outcomes
- Stored source links accept only HTTP(S); legacy unsafe links cannot execute.
- Scoring enforces server-owned input, composition, candidate and history budgets before expensive work.
- Global catalog writes require owner authorization.
- API bodies are bounded while streaming before parsing or RPC forwarding.
- Durable admission rejects unknown object IDs and bounds public creations before object dispatch.
- Dependency upgrades and CI checks reduce known vulnerabilities; deployment guidance states remaining operator actions.

## Validation
Regression tests first for malicious URLs, oversized/chunked bodies, owner write boundaries and expensive score inputs. Test admission and persistence limits, existing gameplay regression tests, npm run check and npm run build. No production load tests or automatic deletion of existing games.

## Compatibility
Keep existing local branding edits. Keep family gameplay anonymous. Retain existing game records; migration of legacy object lookup needs explicit compatibility handling. Do not claim live edge/billing settings are applied from repository changes alone.

## Implementation verification

- 386 unit/integration tests passed across 73 files after dependency updates.
- Local Chromium: anonymous catalog write 403, owner sign-in 200, executable URL
  rejected with 400, valid HTTP(S) source saved and rendered.
- Isolated Wrangler: unknown score ID 404; five creates 200, sixth 429; existing
  session GET 200; anonymous catalog POST 403; oversized body 413.
- Type checking passed with zero errors/warnings; two browser regression tests passed.
- Build passed; dependency audit reduced from 38 findings to nine low advisories,
  with no moderate/high/critical findings. Source-only Gitleaks scan found no leaks.
- Rollout prerequisites and explicit remaining improvements are recorded in
  ../security-deployment.md. No live deployment or dashboard changes were made.
