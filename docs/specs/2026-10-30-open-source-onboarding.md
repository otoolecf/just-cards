# TDD Spec: Open-source onboarding and publication review

## Intent

Give a new contributor a reproducible local start and a deployment procedure for
their own Cloudflare account. Explain the existing portability boundaries and
provide repeatable checks for secrets and personal information before publication.

## In Scope

- Replace outdated README onboarding with a tested fresh-checkout workflow.
- Declare Node 22 type definitions needed by the clean type-check workflow.
- Document explicit D1 provisioning and migration before deployment using ignored config.
- Add a concise engine/storage/hosting guide and a publication review.

## Out of Scope

New infrastructure, account provisioning, history rewriting,
license changes, publishing the repository, and gameplay changes.

## Expected Outcomes

A contributor can run the built-in games without credentials, understand the
Cloudflare-specific services, and deploy using their own resources. The owner can
review publication risks and follow the same checks for future releases.

## Acceptance Criteria

- [x] New guide links resolve and documented npm scripts exist.
- [x] Fresh-directory install, check, build, and local smoke succeed without copied secrets.
- [x] Review covers tracked content, local-ref history, author metadata and ignored artifacts.
- [x] Deployment steps use one config and apply D1 migrations before serving traffic.

## Data and Rules

No credentials or account/database IDs enter tracked docs. No live resources are
created or modified by the documentation workflow.

## Test Plan (Red -> Green)

First add a guide link/command validation test and observe missing-guide failures.
Exercise the documented local workflow in
an isolated directory with a fresh dependency install and no environment files.

## Implementation Notes

README links to `docs/deployment.md`, `docs/code-boundaries.md`, and
`docs/publication-review.md`. Keep the detailed planning architecture for historical context.
Use explicit Cloudflare resource creation instead of the convenience deploy script.

## Rollback Plan

Revert these documentation and guide-validation changes; application behavior is unchanged.
