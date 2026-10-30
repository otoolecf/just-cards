# AGENTS.md

This file defines how coding agents should operate in this repository.

All file paths in these instructions are relative to the repository root.

## Read Order

Before making code changes, read in this order:

1. `docs/README.md`
2. `docs/inspiration.md`
3. `docs/architecture.md`
4. `docs/ui-profile-v0.md` (required for ruleset-driven play UI work)
5. `docs/ui-primitives-v0.md` (required for UI/style work)
6. `AGENTS.md`

## Project Mission and Scope

`just-cards` exists to reduce friction for casual, in-person card games when people do not have all physical materials.

Current product scope:

1. Virtual play mode for shared table-state card play.
2. Scorekeeper mode for physical card play without pen/paper.
3. Rules-as-data foundation so games can be added without hardcoded one-off logic.

Scorekeeping, shared virtual tables and ruleset import are implemented. See
`TODO.md` for prioritized remaining work and `docs/architecture.md` for current boundaries.

## Tech Stack and Deployment Target

- Frontend: `SvelteKit` + TypeScript
- Runtime: Cloudflare Workers (`@sveltejs/adapter-cloudflare`)
- Real-time state: Durable Objects + WebSockets
- Ruleset catalog: D1 through `RulesetStore`
- Room and score-session persistence: Durable Object SQLite
- Queues and Workers AI are not required by the current deployment
- Hosting/deploy: Cloudflare via Wrangler

Default assumption: Cloudflare-first and JavaScript/TypeScript-first unless architecture docs explicitly change.

## Architecture Guardrails

1. Rules are data-driven (`RulePack` concept), not per-game hardcoded UI/business logic.
2. Scorekeeping uses an event-log model and derived totals, not mutable totals as source of truth.
3. Server-side authoritative state for multiplayer game rooms.
4. Mobile-first UX decisions are required for all user-facing features.
5. Keep the system lightweight; avoid unnecessary services and dependencies.

## UI Primitive Contract (Required)

1. Use shared UI primitives from:
   `docs/ui-primitives-v0.md`
2. Use semantic token variables/classes (`--jc-*`, `jc-*`) instead of introducing one-off hex colors or ad-hoc control styles.
3. If a new semantic color/typography/motion token is needed, add it in:
   `src/lib/ui/design-primitives.ts`
   and update tests in:
   `src/lib/ui/design-primitives.test.ts`
4. Preserve accessibility guarantees:
   - maintain WCAG contrast test pass state
   - keep touch targets at least `44px` for interactive controls
5. For any UI styling changes, update `docs/ui-primitives-v0.md` when the design contract changes.

## Persistence Contracts

1. Use `RulesetStore` for ruleset persistence; do not bind game logic to SQLite/D1 APIs.
2. Local development/testing uses Node SQLite (`node:sqlite`) by default.
3. Deployed rulesets use the D1 adapter behind the same interface. Missing production bindings must fail explicitly.
4. Shared rooms and score sessions persist in Durable Object SQLite; D1 is not the room event store.
5. Keep storage adapters behind existing service/API contracts. Local SQLite remains supported for development.
6. Treat `runtime-bundle/v1` (`runtimeRulePack` + `uiProfile`) as the canonical stored payload.

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

Use `docs/templates/tdd-spec-template.md` as the default spec format.

## What Not To Do

1. Do not bypass rules/data contracts with one-off game logic hacks.
2. Do not make client state the authoritative source for multiplayer game truth.
3. Do not commit secrets, generated credentials, or local env files.
4. Do not introduce heavyweight infrastructure without documented need.
5. Do not make broad, unrelated refactors while delivering a scoped feature.
6. Do not skip the spec-first TDD flow.
