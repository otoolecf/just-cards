# TDD Spec: score-ruleset-picker-and-open-flow

_Status: Complete_
_Owner: Codex_
_Date: 2026-02-17_

## 1) Intent

Rulesets can now be stored and loaded into `/play/[rulesetId]`, but users still need manual API/curl steps to discover IDs and open them. This feature adds a score-page ruleset picker panel so users can create a starter ruleset, browse available rulesets, and open any ruleset in play mode directly from UI. It makes the end-to-end MVP path visible without LLM ingestion.

## 2) In Scope

- Add root-page server load that returns persisted rulesets.
- Add a score-page rulesets panel with:
  - starter ruleset creation button
  - ruleset list
  - per-ruleset `Open in Play` link (`/play/{rulesetId}`)
- Keep existing score session workflow unchanged.

## 3) Out of Scope

- LLM/SLM ingestion or generation pipeline.
- Ruleset editing UI.
- Play session persistence/multiplayer sync.

## 4) Expected Outcomes

1. Score page displays available rulesets with names, IDs, and open links.
2. Users can create a starter ruleset from score page without calling API manually.
3. Newly created rulesets are immediately visible and link to `/play/{id}`.

## 5) Acceptance Criteria

- [x] `+page.server.ts` returns ruleset list for score page.
- [x] Starter draft payload helper emits valid `runtime-bundle/v1` structure.
- [x] Score page shows ruleset list and `Open in Play` links.
- [x] Score page can create starter ruleset and refresh list.

## 6) Data and Rules

- Rule/data inputs:
  - `RulesetService.list()` from backend abstraction
  - `POST /api/rulesets` using `runtime-bundle/v1`
- Key invariants:
  - Starter draft payload must remain schema-compatible with `RulesetService` validation.
  - Play links must use stable `ruleset.id` and route shape `/play/{id}`.

## 7) Test Plan (Red -> Green)

### Unit Tests (expected to fail first)

- [x] `starter_ruleset_draft_payload_is_runtime_bundle_v1`: helper returns valid starter draft shape.

### Integration/Behavior Tests (expected to fail first)

- [x] `score_page_loader_returns_existing_rulesets`: root page server load includes ruleset records.

## 8) Implementation Notes

- Planned files:
  - `/Users/ConnorO/git_repos/just-cards/src/routes/+page.server.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/routes/page-server.test.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/rulesets/picker.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/rulesets/picker.test.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/routes/+page.svelte`
- Constraints:
  - Keep mobile-first panel sizing and touch targets.
  - Avoid coupling UI directly to storage internals.

## 9) Verification Checklist

- [x] Tests written before implementation
- [x] Tests fail first (red)
- [x] Implementation added (green)
- [x] Refactor performed without changing behavior
- [x] `npm run check` passes
- [x] `npm run build` passes

## 10) Rollback Plan

- Hide rulesets panel from score page and keep existing score/play links.
- Keep API/route contracts untouched so backend behavior remains available.
