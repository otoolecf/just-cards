# TDD Spec: Developer onboarding and safe deployment

## Intent
Help a new developer see the product, contribute a small change and deploy their
own installation without relying on maintainer configuration or stale guidance.

## In Scope
README demo link, real product screenshot and built-in game list; a concise human
contribution guide; current storage/runtime instructions in AGENTS.md; an explicit
config deployment command that migrates D1 before serving new code.

## Out of Scope
Runtime UI changes, production deployments, GitHub visibility and history rewrites.

## Expected Outcomes and Acceptance Criteria
- README links to the live app and a checked-in screenshot before installation.
- Built-in games and contributions are discoverable; guidance links resolve.
- Agent instructions describe implemented RulesetStore adapters and room storage.
- cf:deploy requires an existing explicit config, rejecting the source template.
- Deployment builds, validates, migrates D1, then deploys with the same config.
- A failed stage stops the sequence. --dry-run never migrates or publishes.

## Test Plan (Red -> Green)
Before implementation, add runner tests with a fake command executor covering
missing/template config, command ordering, dry runs and every failure boundary.
Extend doc checks to CONTRIBUTING and demo/screenshot/current architecture guidance.
Do not call Cloudflare or mutate production while testing deployment orchestration.

## Implementation Notes
Use Node child-process argument arrays without shell interpolation. Keep private
configs ignored and use the existing build and Wrangler installation. Keep TDD,
security and behavioral contracts intact while updating architecture descriptions.

## Required checks
Focused deployment/docs tests; full unit suite; npm run build; npm run check.

## Rollback Plan
Restore the explicit commands from the deployment guide if the helper fails.
Never deploy a new build after a failed migration.
