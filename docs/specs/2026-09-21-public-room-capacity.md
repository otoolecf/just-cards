# TDD Spec: Public rooms with bounded active capacity

## Intent
Anyone can create an unlisted room without an account. Bound simultaneous active rooms and repeated creation while preserving saved games. AI generation remains owner-only.

## Expected outcomes
- Default global capacity: 20 active rooms, configurable per deployment.
- Default creation limit: 5 rooms per network address per hour; shared family networks can still create several games. Limits are configurable.
- Idle lobbies release capacity after 15 minutes; dealt games after 30 minutes without accepted player activity. Reads, socket opens and heartbeats do not extend activity.
- Suspended games preserve the event log/cards/scores and require a host-initiated resume with available capacity. Finished/closed games release immediately. Existing games continue when capacity is full.
- At capacity return a friendly 503 with Retry-After; creation rate limit returns 429. No rapid automatic creation/resume retries.
- Coordinator admission is atomic, expiring, idempotent and generation-aware. Stale releases cannot remove a newer reservation. Failed creation cannot permanently leak capacity.
- No-op presence checks do not rewrite/broadcast the full room. Suspended/closed connections stop; fallback polling backs off and stops when hidden or suspended.
- AI HTTP and MCP entry points fail closed without owner authorization. A configured owner secret provides a simple local/production owner sign-in; no public signup. Keep secrets out of client bundles/logs.

## Tests (red → green)
- Atomic admission at boundary, expiry/reacquisition, stale releases, idempotency, rate limit window and existing-room renewals at capacity.
- Managed-room lifecycle with injected clock/storage/coordinator: GET does not renew, idle snapshot preserved, resume/full/release, failed requests and retries.
- Owner authorization: anonymous/seat/MCP credentials cannot generate; valid expiring owner session or explicit owner credential succeeds; CSRF protections and logout.
- Worker integration: concurrent create requests, full UI message, end releases, idle client stops requests, resume denial preserves cards, owner-only generation rejects before AI.
- Existing room/game regressions; npm run check and npm run build.

## Implementation and boundaries
Use a small RoomAdmission Durable Object for capacity coordination, separate from per-room CardRoom objects. SQLite local adapters preserve development parity. Admission is not a hard spend cap and physical-score storage is not included in the active shared-room count. Public room discovery and account administration are outside scope.

## Rollback
Revert feature code/config together, retain persisted room event logs. Do not delete room storage to recover capacity.
