# TDD Spec: play-ruleset-route-loader

_Status: Complete_
_Owner: Codex_
_Date: 2026-02-17_

## 1) Intent

The project now validates and stores rulesets with first-class UI profiles, but `/play` still uses local demo-generated runtime/profile state. This feature connects stored rulesets to actual play rendering by adding `/play/[rulesetId]` and wiring the play surface to consume `runtimeRulePack + uiProfile` directly. This is a critical MVP bridge from ruleset authoring/storage to real gameplay presentation.

## 2) In Scope

- Add `/play/[rulesetId]` route server loader using `RulesetService`.
- Render play surface from loaded ruleset bundle when provided.
- Keep `/play` working as demo fallback mode.
- Keep play labels/zones/actions/hints driven by `uiProfile` data.

## 3) Out of Scope

- Multiplayer room networking and server-authoritative move application.
- LLM URL ingestion / parsing / generation.
- Full game-complete logic for betting/pot settlement beyond existing primitives.

## 4) Expected Outcomes

1. Visiting `/play/<existingRulesetId>` renders a playable surface using that ruleset’s profile and rule pack.
2. Unknown ruleset IDs return a clear 404 route error.
3. `/play` still works as standalone demo for local UX iteration.

## 5) Acceptance Criteria

- [x] `/play/[rulesetId]` `+page.server.ts` loads and returns ruleset data from `RulesetService`.
- [x] Missing ruleset ID or unknown ID returns 404.
- [x] Shared play-table UI component can run in two modes:
  - demo mode (no ruleset)
  - ruleset mode (loaded bundle)
- [x] Demo event seeding can adapt to hand zone and table zones from runtime/profile inputs.

## 6) Data and Rules

- Rule/data inputs:
  - `RulesetRecord.bundle.runtimeRulePack`
  - `RulesetRecord.bundle.uiProfile`
- Key invariants:
  - Rendering labels/zones/actions must come from `uiProfile` and fallback primitives, not game-name branches.
  - Demo event seeding must not assume fixed zone IDs like `board`/`discard` when a ruleset profile provides different IDs.

## 7) Test Plan (Red -> Green)

List tests before implementation.

### Unit Tests (expected to fail first)

- [x] `build_demo_play_events_supports_dynamic_zone_ids_and_phase`: demo seed function uses supplied hand/zone/phase options.
- [x] `play_surface_profile_from_ui_profile_maps_labels_hints_and_targets`: existing guard to keep profile mapping stable.

### Integration/Behavior Tests (expected to fail first)

- [x] `play_ruleset_loader_returns_ruleset_record_for_existing_id`: server route load returns created ruleset.
- [x] `play_ruleset_loader_throws_404_for_unknown_ruleset`: unknown IDs produce 404.

## 8) Implementation Notes

- Planned files:
  - `/Users/ConnorO/git_repos/just-cards/src/routes/play/[rulesetId]/+page.server.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/routes/play/[rulesetId]/+page.svelte`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/components/play-table.svelte`
  - `/Users/ConnorO/git_repos/just-cards/src/routes/play/+page.svelte`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/gameplay/play-surface-model.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/gameplay/play-surface-model.test.ts`
- Constraints:
  - Reuse existing play-surface primitives and keep mobile-first UX intact.
  - Keep route loading server-side to avoid redundant API roundtrips.

## 9) Verification Checklist

- [x] Tests written before implementation
- [x] Tests fail first (red)
- [x] Implementation added (green)
- [x] Refactor performed without changing behavior
- [x] `npm run check` passes
- [x] `npm run build` passes

## 10) Rollback Plan

- If route loading is unstable, keep `/play` demo route as primary and temporarily disable link(s) to `/play/[rulesetId]`.
- Revert dynamic seed behavior to fixed-zone demo events while preserving `uiProfile` storage contract.
