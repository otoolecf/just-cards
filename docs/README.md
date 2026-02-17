# Documentation Index

This folder holds project planning and architecture docs.

## Documents

- [`inspiration.md`](./inspiration.md): Problem statement, user scenarios, and product intent.
- [`architecture.md`](./architecture.md): Technical architecture plan, stack decisions, and phased roadmap.
- [`rulepack-v0.md`](./rulepack-v0.md): Canonical Rule IR schema, pipeline stages, capabilities, and boundaries.
- [`primitives-kb-v0.md`](./primitives-kb-v0.md): Canonical LLM/SLM primitive catalog for runtime bundle generation.
- [`ruleset-storage-v0.md`](./ruleset-storage-v0.md): Local-first ruleset storage abstraction and Cloudflare migration boundary.
- [`rulepack-schema.json`](./../src/lib/scorekeeper/rulepack-schema.json): JSON Schema artifact used by runtime validation.
- [`scorekeeper-rules.md`](./scorekeeper-rules.md): Score engine abstraction, modifier model, and customization examples.
- [`gameplay-v0.md`](./gameplay-v0.md): Gameplay-state primitive for turns, phases, rounds, and card zones.
- [`specs/2026-02-16-gameplay-v0-pattern-detector.md`](./specs/2026-02-16-gameplay-v0-pattern-detector.md): Pattern-detection primitive spec and acceptance criteria.
- [`specs/2026-02-16-rulepack-runtime-schema-validation.md`](./specs/2026-02-16-rulepack-runtime-schema-validation.md): TDD spec for runtime schema validation.
- [`specs/2026-02-16-session-event-log.md`](./specs/2026-02-16-session-event-log.md): Session event log + API wiring spec.
- [`specs/2026-02-16-gameplay-v0-hand-state.md`](./specs/2026-02-16-gameplay-v0-hand-state.md): Gameplay hand-state spec and acceptance criteria.
- [`specs/2026-02-16-gameplay-v0-validator.md`](./specs/2026-02-16-gameplay-v0-validator.md): Gameplay action validation spec and composition primitives.
- [`specs/2026-02-17-scorekeeper-scoring-page.md`](./specs/2026-02-17-scorekeeper-scoring-page.md): Scorekeeper UI spec and acceptance criteria.
- [`specs/2026-02-17-scorekeeper-mode-persistence.md`](./specs/2026-02-17-scorekeeper-mode-persistence.md): Session-backed score mode persistence and join hydration.
- [`specs/2026-02-17-scorekeeper-score-priority-ui.md`](./specs/2026-02-17-scorekeeper-score-priority-ui.md): Score-first active-session layout and visibility checks.
- [`specs/2026-02-17-game-rules-runtime-v0.md`](./specs/2026-02-17-game-rules-runtime-v0.md): Runtime orchestration spec for gameplay validation + scoring triggers + manual scoring.
- [`specs/2026-02-17-primitives-kb-docs.md`](./specs/2026-02-17-primitives-kb-docs.md): TDD spec for canonical primitive knowledge-base docs.
- [`specs/2026-02-17-local-ruleset-store-abstraction.md`](./specs/2026-02-17-local-ruleset-store-abstraction.md): TDD spec for local SQLite ruleset storage abstraction.
- [`templates/tdd-spec-template.md`](./templates/tdd-spec-template.md): Default spec-first template for TDD work.
- [`specs/README.md`](./specs/README.md): Feature spec workflow and naming conventions for TDD.

## Update Guidance

- Update `inspiration.md` when core user needs or constraints change.
- Update `architecture.md` when technology choices, hosting strategy, or major system design changes.
- Keep docs lightweight and decision-focused; avoid implementation detail that belongs in code comments or ADRs.
