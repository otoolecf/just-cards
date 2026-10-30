# Documentation

Inline file references are relative to the repository root; Markdown links are
relative to their document.

## Getting started

- [Local setup](../README.md#clone-and-run-locally): Run built-in games without credentials.
- [Deploy your own installation](./deployment.md): Account selection, D1, secrets and live checks.
- [Engine, storage and hosting boundaries](./code-boundaries.md): Code responsibilities and portability.
- [Publication checklist](./publication-review.md): Secrets, personal data, dependencies and fixtures.
- [Project purpose](./inspiration.md): The in-person play and scoring problems this project addresses.

## Play and scoring

- [Shared tables](./shared-table-v1.md): Rooms, supported policies, privacy and reconnect.
- [Scorekeeper rules](./scorekeeper-rules.md): Event-derived scores and scoring capabilities.
- [Hong Kong mahjong](./mahjong.md): Tile play, physical scoring and supported conventions.
- [Public rooms and owner access](./public-rooms.md): Capacity, idle games and owner-only features.

## Architecture and contracts

- [Architecture and roadmap](./architecture.md)
- [RulePack schema](./rulepack-v0.md) and [JSON Schema](../src/lib/scorekeeper/rulepack-schema.json)
- [Gameplay primitives](./gameplay-v0.md)
- [Primitive authoring reference](./primitives-kb-v0.md)
- [UI profile contract](./ui-profile-v0.md)
- [UI design primitives and accessibility](./ui-primitives-v0.md)
- [Ruleset storage](./ruleset-storage-v0.md)

## Ruleset generation

- [Generation pipeline](./ruleset-generation-v0.md)
- [Explainability and audit data](./ruleset-explainability-v0.md)
- [Golden evaluation fixtures](./ruleset-golden-evals-v0.md)
- [Runtime and UI confidence checks](./ruleset-confidence-v0.md)

## MCP integration

- [Integration architecture](./chatgpt-mcp-roadmap-v0.md)
- [MCP Apps surfaces](./mcp-apps-v0.md)
- [Authentication setup](./mcp-oauth-setup.md)

## Contributing

[TODO](../TODO.md) is the prioritized backlog, including photo-assisted scoring.

[Feature specifications](./specs/README.md) describe acceptance criteria and test
plans. Use the [spec template](./templates/tdd-spec-template.md) and follow
[repository instructions](../AGENTS.md) when making changes. Update the relevant
contract documentation when behavior or architecture changes.

## Building documentation

Set `PUBLIC_APP_URL` to your deployment URL in `.env.local` (see `.env.example`),
or pass it in the environment, then run `npm run docs:build` from the repository
root. Rendered Markdown is written to ignored `.output/docs/`; the hosted-app link
is filled from that setting. Source documents stay unchanged.
