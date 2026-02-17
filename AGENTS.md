# AGENTS.md

This file defines how coding agents should operate in this repository.

## Read Order

Before making code changes, read in this order:

1. `/Users/ConnorO/git_repos/just-cards/docs/README.md`
2. `/Users/ConnorO/git_repos/just-cards/docs/inspiration.md`
3. `/Users/ConnorO/git_repos/just-cards/docs/architecture.md`
4. `/Users/ConnorO/git_repos/just-cards/AGENTS.md`

## Project Mission and Scope

`just-cards` exists to reduce friction for casual, in-person card games when people do not have all physical materials.

Current product scope:

1. Virtual play mode for shared table-state card play.
2. Scorekeeper mode for physical card play without pen/paper.
3. Rules-as-data foundation so games can be added without hardcoded one-off logic.

Delivery priority:

1. Scorekeeper MVP.
2. Virtual play MVP.
3. Rule ingestion/generation workflow.

## Tech Stack and Deployment Target

- Frontend: `SvelteKit` + TypeScript
- Runtime: Cloudflare Workers (`@sveltejs/adapter-cloudflare`)
- Real-time state: Durable Objects + WebSockets
- Persistence: D1
- Async jobs: Queues
- Hosting/deploy: Cloudflare via Wrangler

Default assumption: Cloudflare-first and JavaScript/TypeScript-first unless architecture docs explicitly change.

## Architecture Guardrails

1. Rules are data-driven (`RulePack` concept), not per-game hardcoded UI/business logic.
2. Scorekeeping uses an event-log model and derived totals, not mutable totals as source of truth.
3. Server-side authoritative state for multiplayer game rooms.
4. Mobile-first UX decisions are required for all user-facing features.
5. Keep the system lightweight; avoid unnecessary services and dependencies.

## Ruleset Persistence (Pre-Cloudflare)

1. Use `RulesetStore` abstraction for ruleset persistence; do not bind game logic directly to SQLite/D1 APIs.
2. Local development/testing should use the SQLite adapter by default (`node:sqlite`) unless explicitly overridden.
3. Treat local SQLite as the temporary persistence layer until Cloudflare storage adapters are wired.
4. Cloudflare migration work should swap adapters behind the same interface, not rewrite service/API contracts.

## Security and Secrets Policy

1. Never commit secrets, API keys, tokens, or account identifiers.
2. Use local `.dev.vars` for local secret values.
3. Keep only non-secret templates in git (`.dev.vars.example`).
4. Use Wrangler-managed secrets for deployed environments.
5. Treat logs and analytics payloads as potentially sensitive; avoid storing unnecessary personal data.

## TDD Workflow (Required)

Every feature/change should follow this order:

1. Write a Markdown spec first (intent + expected outcomes).
2. Write tests that fail against current behavior (red).
3. Implement only enough code to pass tests (green).
4. Refactor with tests still passing (refactor).
5. Update docs when architecture/behavior expectations change.

Definition of done for a TDD task:

1. Spec exists and is linked from the PR/commit context.
2. Tests demonstrate the behavior change and pass.
3. No unrelated refactors are mixed in.
4. `npm run check` and `npm run build` pass locally.

Use `/Users/ConnorO/git_repos/just-cards/docs/templates/tdd-spec-template.md` as the default spec format.

## What Not To Do

1. Do not bypass rules/data contracts with one-off game logic hacks.
2. Do not make client state the authoritative source for multiplayer game truth.
3. Do not commit secrets, generated credentials, or local env files.
4. Do not introduce heavyweight infrastructure without documented need.
5. Do not make broad, unrelated refactors while delivering a scoped feature.
6. Do not skip the spec-first TDD flow.
