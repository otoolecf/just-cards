# TDD Spec: local-ruleset-store-abstraction

_Status: Implemented_
_Owner: Connor + agents_
_Date: 2026-02-17_

## 1) Intent

Provide a local-first ruleset persistence path so generated runtime bundles can be created, validated, and stored during development before Cloudflare D1/R1/Durable Objects are wired.
The persistence path must use an abstraction boundary so storage backend can be swapped later without changing ruleset generation flow.

## 2) In Scope

- Add a `RulesetStore` abstraction for CRUD-style ruleset persistence.
- Add local SQLite-backed adapter for development/testing.
- Add memory fallback adapter for unsupported/runtime-constrained environments.
- Add ruleset bundle validation/generation service for storing runtime bundles.
- Add API routes for create/list/get rulesets.
- Document that local SQLite is the default pre-Cloudflare persistence path.

## 3) Out of Scope

- Cloudflare D1 adapter implementation.
- R1 object storage integration.
- Durable Object orchestration.
- LLM provider integration for automatic rule extraction from URLs.

## 4) Expected Outcomes

1. Local dev can create and read persisted rulesets from SQLite.
2. Rulesets are stored as runtime bundles and validated before write.
3. App code depends on `RulesetStore` interface, not direct SQLite code.
4. Docs and agent guidance explicitly state this is temporary until Cloudflare storage is connected.

## 5) Acceptance Criteria

- [x] `RulesetStore` interface exists with create/list/get operations.
- [x] SQLite adapter persists records across store instances when same DB path is used.
- [x] Service rejects malformed runtime bundles with deterministic validation messages.
- [x] API supports:
  - `POST /api/rulesets`
  - `GET /api/rulesets`
  - `GET /api/rulesets/{rulesetId}`
- [x] `AGENTS.md` and docs clearly describe local SQLite abstraction and planned Cloudflare swap.

## 6) Data and Rules

- Rule/data inputs:
  - `RuntimeRulePack` bundle (`runtime-bundle/v0`)
  - metadata (`name`, `origin`, optional `sourceUrl`, optional notes)
- Key invariants:
  - persisted payload is JSON-serializable and replayable
  - same bundle validation outcome is deterministic
  - storage backend is replaceable through interface

## 7) Test Plan (Red -> Green)

### Unit Tests (expected to fail first)

- [x] `sqlite_ruleset_store_persists_records_across_instances`
- [x] `ruleset_service_rejects_invalid_bundle_shape`
- [x] `ruleset_service_accepts_valid_runtime_bundle_and_stores_record`

### Integration/Behavior Tests (expected to fail first)

- [x] `rulesets_api_create_and_list_roundtrip`
- [x] `rulesets_api_get_returns_404_for_unknown_id`

## 8) Implementation Notes

- Planned files:
  - `/Users/ConnorO/git_repos/just-cards/src/lib/rulesets/store.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/rulesets/service.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/rulesets/store.test.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/routes/api/rulesets/+server.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/routes/api/rulesets/[rulesetId]/+server.ts`
  - `/Users/ConnorO/git_repos/just-cards/docs/architecture.md`
  - `/Users/ConnorO/git_repos/just-cards/docs/README.md`
  - `/Users/ConnorO/git_repos/just-cards/AGENTS.md`

## 9) Verification Checklist

- [x] Tests written before implementation
- [x] Tests fail first (red)
- [x] Implementation added (green)
- [x] `npm run check` passes
- [x] `npm run build` passes

## 10) Rollback Plan

- Switch ruleset API/store wiring back to in-memory adapter only.
- Leave interface in place so Cloudflare adapter can still land later.
