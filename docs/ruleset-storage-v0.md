# Ruleset Storage v0 (Local-First)

This document defines how runtime rulesets are stored today and how that will migrate to Cloudflare storage later.

## Current State (Implemented)

- Storage is accessed through a backend abstraction: `RulesetStore`.
- Local development/testing default uses SQLite via Node `node:sqlite`.
- Rulesets are stored as validated `runtime-bundle/v0` payloads.
- API endpoints:
  - `POST /api/rulesets`
  - `GET /api/rulesets`
  - `GET /api/rulesets/{rulesetId}`

Implementation references:

- Store abstraction and adapters:
  - `/Users/ConnorO/git_repos/just-cards/src/lib/rulesets/store.ts`
- Validation/service layer:
  - `/Users/ConnorO/git_repos/just-cards/src/lib/rulesets/service.ts`
- Default singleton service:
  - `/Users/ConnorO/git_repos/just-cards/src/lib/rulesets/default-service.ts`
- API handlers:
  - `/Users/ConnorO/git_repos/just-cards/src/routes/api/rulesets/+server.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/routes/api/rulesets/[rulesetId]/+server.ts`

## Driver Selection

`RulesetStore` currently supports:

- `sqlite`
- `memory`

Driver resolution:

1. If `RULESET_STORE_DRIVER` is set to `sqlite` or `memory`, that value is used.
2. Otherwise, in `NODE_ENV=development|test`, `sqlite` is used.
3. Otherwise, `memory` is used.

SQLite file path:

- `RULESET_SQLITE_PATH` if provided.
- default: `.local/rulesets.sqlite`

## Why This Exists

This gives us an immediate local persistence path for generated rulesets and keeps Cloudflare storage concerns behind a replaceable interface.

## Cloudflare Migration Plan

When Cloudflare persistence is wired:

1. Add a D1-backed `RulesetStore` adapter.
2. Keep the same `RulesetService` contract.
3. Keep the same API payload shape.
4. Switch default driver in deployed environments from local SQLite/memory to D1.

No gameplay/score engine rule-generation code should depend directly on SQLite, D1, or Durable Objects.
