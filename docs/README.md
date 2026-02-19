# Documentation Index

This folder holds project planning and architecture docs.

## Documents

- [`inspiration.md`](./inspiration.md): Problem statement, user scenarios, and product intent.
- [`architecture.md`](./architecture.md): Technical architecture plan, stack decisions, and phased roadmap.
- [`rulepack-v0.md`](./rulepack-v0.md): Canonical Rule IR schema, pipeline stages, capabilities, and boundaries.
- [`primitives-kb-v0.md`](./primitives-kb-v0.md): Canonical LLM/SLM primitive catalog for runtime bundle generation.
- [`ui-profile-v0.md`](./ui-profile-v0.md): Canonical ruleset-driven UI profile primitive contract.
- [`ui-primitives-v0.md`](./ui-primitives-v0.md): Canonical UI token and accessibility primitive catalog.
- [`chatgpt-mcp-roadmap-v0.md`](./chatgpt-mcp-roadmap-v0.md): Roadmap for ChatGPT app integration, MCP tools/resources, and skill-guided MCP sampling.
- [`mcp-oauth-setup.md`](./mcp-oauth-setup.md): Practical setup guide for shared-token mode and OAuth JWT mode (issuer/JWKS/audience/scope) for MCP endpoints.
- [`ruleset-generation-v0.md`](./ruleset-generation-v0.md): End-to-end generation scaffold (`url|text` -> `RuleFacts` -> `runtime-bundle/v1`).
- [`ruleset-explainability-v0.md`](./ruleset-explainability-v0.md): Human-readable/auditable rules payload contract for layman guide UX.
- [`ruleset-golden-evals-v0.md`](./ruleset-golden-evals-v0.md): Offline confidence suite for source-link extraction and compile quality gates.
- [`ruleset-confidence-v0.md`](./ruleset-confidence-v0.md): Bundle-level runtime/UI confidence checks and smoke simulation gate.
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
- [`specs/2026-02-17-mobile-pwa-play-surface.md`](./specs/2026-02-17-mobile-pwa-play-surface.md): TDD spec for mobile-first play surface UX driven by gameplay primitives.
- [`specs/2026-02-17-play-hand-actions-and-zone-labels.md`](./specs/2026-02-17-play-hand-actions-and-zone-labels.md): TDD spec for hand-first play actions and configurable zone labels.
- [`specs/2026-02-17-play-mobile-layout-and-zone-profiles.md`](./specs/2026-02-17-play-mobile-layout-and-zone-profiles.md): TDD spec for mobile hand panel layout and profile-driven zone visibility/labels.
- [`specs/2026-02-17-ui-primitives-wcag-pass.md`](./specs/2026-02-17-ui-primitives-wcag-pass.md): TDD spec for shared UI primitives and WCAG contrast enforcement.
- [`specs/2026-02-17-ui-polish-pass-2.md`](./specs/2026-02-17-ui-polish-pass-2.md): TDD spec for typography/motion/spacing polish pass.
- [`specs/2026-02-17-ruleset-driven-ui-profile-generation.md`](./specs/2026-02-17-ruleset-driven-ui-profile-generation.md): TDD spec for `ui-profile/v0` + `runtime-bundle/v1`.
- [`specs/2026-02-17-play-ruleset-route-loader.md`](./specs/2026-02-17-play-ruleset-route-loader.md): TDD spec for `/play/[rulesetId]` server loading and ruleset-driven play rendering.
- [`specs/2026-02-17-score-ruleset-picker-and-open-flow.md`](./specs/2026-02-17-score-ruleset-picker-and-open-flow.md): TDD spec for score-page ruleset picker and `Open in Play` flow.
- [`specs/2026-02-17-ruleset-generation-v0.md`](./specs/2026-02-17-ruleset-generation-v0.md): TDD spec for URL/prose input generation pipeline.
- [`specs/2026-02-17-ruleset-golden-evals-v0.md`](./specs/2026-02-17-ruleset-golden-evals-v0.md): TDD spec for golden fixture eval gating before LLM spend.
- [`specs/2026-02-17-ruleset-confidence-suite-v0.md`](./specs/2026-02-17-ruleset-confidence-suite-v0.md): TDD spec for runtime/UI bundle confidence checks.
- [`specs/2026-02-17-ruleset-serviceability-hardening.md`](./specs/2026-02-17-ruleset-serviceability-hardening.md): TDD spec for natural-language scoring extraction hardening in golden cases.
- [`specs/2026-02-17-layman-guide-and-audit-v0.md`](./specs/2026-02-17-layman-guide-and-audit-v0.md): TDD spec for play-surface guide tab and explainable/auditable rules.
- [`specs/2026-02-18-llm-ruleset-agent-v0.md`](./specs/2026-02-18-llm-ruleset-agent-v0.md): TDD spec for multi-step LLM extraction/repair with nano-to-mini escalation and deterministic fallback.
- [`specs/2026-02-18-ruleset-play-serviceability-and-logging.md`](./specs/2026-02-18-ruleset-play-serviceability-and-logging.md): TDD spec for ruleset-aware play initialization, reduced generic-zone drift, and backend structured logs.
- [`specs/2026-02-18-hidden-info-and-layout-primitives.md`](./specs/2026-02-18-hidden-info-and-layout-primitives.md): TDD spec for hidden-information visibility controls and layout primitives (seat/public card arrangement).
- [`specs/2026-02-18-scorekeeper-real-game-usability-and-variant-scoring.md`](./specs/2026-02-18-scorekeeper-real-game-usability-and-variant-scoring.md): TDD spec for score-page flow simplification and deterministic 500 Rummy/Six Card Golf scoring assists.
- [`specs/2026-02-18-scorekeeper-mode-driven-standings-order.md`](./specs/2026-02-18-scorekeeper-mode-driven-standings-order.md): TDD spec for score mode win-direction metadata and leaderboard ordering by mode.
- [`specs/2026-02-19-gameplay-draw-resolve-policy.md`](./specs/2026-02-19-gameplay-draw-resolve-policy.md): TDD spec for generalized draw-then-resolve turn policy and `cid`-based zone-move identity matching.
- [`specs/2026-02-19-discard-pickup-and-immediate-use-primitives.md`](./specs/2026-02-19-discard-pickup-and-immediate-use-primitives.md): TDD spec for generalized any-visible discard pickup, contiguous take-above draw batches, and immediate-use anchor resolve rules.
- [`specs/2026-02-19-play-resolve-button-gating.md`](./specs/2026-02-19-play-resolve-button-gating.md): TDD spec for resolve quick-target disabled-state alignment with anchor/target constraints.
- [`specs/2026-02-19-visibility-primitives-and-setup-guardrails.md`](./specs/2026-02-19-visibility-primitives-and-setup-guardrails.md): TDD spec for explicit viewer-visibility primitives and 500 Rum/Six Card Golf setup guardrails.
- [`specs/2026-02-19-mcp-server-scaffold-and-skill-orchestration.md`](./specs/2026-02-19-mcp-server-scaffold-and-skill-orchestration.md): TDD spec for MCP tool/resource scaffold, model-source routing, and skill orchestration modules.
- [`specs/2026-02-19-mcp-sse-oauth-resource-server.md`](./specs/2026-02-19-mcp-sse-oauth-resource-server.md): TDD spec for standards-aligned MCP SSE transport and OAuth bearer-token resource-server auth.
- [`specs/2026-02-19-scorekeeper-guided-raw-ruleset-scoring.md`](./specs/2026-02-19-scorekeeper-guided-raw-ruleset-scoring.md): TDD spec for guided-vs-raw score setup, ruleset-driven zone scoring inputs, and win-direction session metadata.
- [`templates/tdd-spec-template.md`](./templates/tdd-spec-template.md): Default spec-first template for TDD work.
- [`specs/README.md`](./specs/README.md): Feature spec workflow and naming conventions for TDD.

## Update Guidance

- Update `inspiration.md` when core user needs or constraints change.
- Update `architecture.md` when technology choices, hosting strategy, or major system design changes.
- Update `ui-profile-v0.md` whenever the generated play-surface profile contract changes.
- Update `ui-primitives-v0.md` whenever UI token contracts, accessibility guarantees, or styling workflow rules change.
- Keep docs lightweight and decision-focused; avoid implementation detail that belongs in code comments or ADRs.
