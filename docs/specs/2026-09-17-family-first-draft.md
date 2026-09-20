# TDD Spec: Complete family first draft

_Status: Complete_

## Intent

Finish the family play and physical-score workflows without an intermediate feedback
checkpoint. Preserve the current branch and pre-existing lockfile changes.

## Expected outcomes

1. Deployed rulesets use a D1 adapter behind RulesetStore, including imports made by
   API, browser and MCP. Local Vite development keeps SQLite. No deployed memory fallback.
2. Shared rooms stream authenticated, per-seat projections via hibernating WebSockets.
   Reconnect restores the latest revision; HTTP mutations remain authoritative and
   idempotent. Credentials stay out of URLs and public messages. Polling is a fallback.
3. Play lists stored games and can import a specific URL or pasted rules, inspect the
   supported behavior/defaults, then create a shared room. Incomplete games stay drafts.
4. Source availability: disclosed dated snapshots for blocked reviewed Bicycle URLs;
   pasted-rule guidance for other blocked sources; bounded downloads and parsing.
5. Family usability: recent-room resume, lobby seat removal/leave and host transfer,
   hand sorting, valid meld/layoff feedback, round history, readable rules and rematch.
6. Complete Rummy rounds (pickup, repeated melds, layoffs, discard, automatic net
   score) and nine-deal Golf games are tested. Scorekeeping retains quick rank/value
   entry, corrections, event replay and persistent sessions.

## Red / green plan

Write failing D1 contract tests, room lifecycle tests and presentation/pickup tests.
Implement the adapters and lifecycle behind existing contracts. Add browser import,
resume and score flows. Run the built Worker locally to test actual D1 persistence,
WebSocket privacy, prompt updates, reconnection, and a complete Rummy round. Do not
claim multiplayer correctness solely from client-side tests or mocked sockets.

## Completion checks

- [x] Focused tests demonstrate each new behavior.
- [x] All unit/integration tests, type check, build and browser tests pass.
- [x] Local Worker integration verifies D1 and WebSocket behavior across restart.
- [x] Deployment configuration includes real bindings and repeatable schema migration.
- [x] Docs describe the first draft and its actual supported game families.

## Verification evidence

- `npm test`: 240 tests in 44 files pass, including the shared scoring, command,
  persistence, ingestion, presentation, socket authentication and contrast contracts.
- `npm run check`: zero errors and warnings. `npm run build` passes.
- `npm run test:e2e`: nine tests pass against Vite/SQLite; the Worker-only test skips.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:8787 CF_INTEGRATION=1 npm run test:e2e`:
  all ten tests pass against the built Worker, D1 and Durable Objects. The complete
  Rummy round exercised ten melds, nine layoffs, seven discard pickups and 138 private
  WebSocket projections, with independent final net-score verification.
- Both live Bicycle URLs import executable policies without model calls. Their HTTP
  403 responses correctly produce visible, dated snapshot disclosures and `import`
  provenance. The resulting complete records survived a Worker process restart.
- A browser held open during that restart reconnected its socket automatically,
  without reloading, and restored an identical room revision, cards and round scores.
  The previously saved physical score session also remained available.
- `wrangler deploy --dry-run` validates `ROOMS`, `RULESETS_DB` and static assets.
  Generated Worker, wrapper and type declaration URLs return 404 as static assets.
- Mobile lobby, completed Golf round and dealt Rummy hand inspected at 390px.
  No horizontal page overflow. No remote resources were provisioned or deployed.

Implementation and remaining scope boundaries are documented in
[Shared table v1](../shared-table-v1.md) and [Ruleset storage](../ruleset-storage-v0.md).

## Scope

A fully featured first draft of the requested family card workflows, not arbitrary
natural-language game execution. Existing MCP prototype gameplay remains compatible;
its ruleset access uses the same durable catalog. No production publication is needed
to implement and verify this draft. Accounts, monetization and unrelated game families
are outside the requested experience.
