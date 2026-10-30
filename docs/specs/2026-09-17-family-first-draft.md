# TDD Spec: Complete family play workflows

## Intent

Support complete family play and physical-score workflows.

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
- [x] Docs describe the implementation and its actual supported game families.

## Scope

A fully featured implementation of the requested family card workflows, not arbitrary
natural-language game execution. Existing MCP prototype gameplay remains compatible;
its ruleset access uses the same durable catalog. No production publication is needed
to implement and verify this draft. Accounts, monetization and unrelated game families
are outside the requested experience.
