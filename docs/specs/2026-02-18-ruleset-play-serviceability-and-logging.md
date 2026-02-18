# TDD Spec: ruleset-play-serviceability-and-logging

_Status: Complete_
_Owner: Codex_
_Date: 2026-02-18_

## 1) Intent

Generated rulesets currently route correctly to `/play/[rulesetId]`, but the initialized gameplay state still resembles a generic demo table and does not feel game-specific enough for users (example: Six Card Golf). Also, backend observability is too weak for diagnosing generation/load issues.

This feature improves serviceability by:

1. Initializing play state from ruleset metadata instead of only generic demo defaults.
2. Tightening heuristic zone detection to reduce false generic board zones for games like golf/rummy.
3. Adding structured server logs for generation and play ruleset loading.

## 2) In Scope

- Add ruleset-aware play event builder for initial table setup.
- Parse cards-per-player hints from explainability diagnostics when available.
- Seed stock/discard zones in generated game starts when those zones exist.
- Reduce zone false positives from generic `table/layout` wording.
- Add structured server logs for:
  - ruleset generation start/success/failure
  - play ruleset load start/hit/miss

## 3) Out of Scope

- Full game-specific turn engines for every variant.
- Multiplayer authoritative runtime overhaul.
- Rich analytics pipelines/external log providers.

## 4) Expected Outcomes

1. Opening a generated Six Card Golf ruleset starts with a golf-like setup (6 cards/player and stock/discard seeded).
2. Generated zone sets for layout-heavy rules no longer force a generic `board` unless explicitly signaled.
3. Server logs include meaningful structured entries for key generation/load lifecycle points.

## 5) Acceptance Criteria

- [x] New ruleset-specific play start builder exists and is used by play table when `rulesetBundle` is provided.
- [x] `extractRuleFacts` no longer infers `board` solely from `layout/table` phrasing.
- [x] Structured log helper exists and is called by relevant server routes.
- [x] Tests cover setup behavior and zone detection changes.

## 6) Test Plan (Red -> Green)

### Unit Tests

- [x] `extract_rule_facts_layout_only_language_does_not_force_board_zone`
- [x] `build_ruleset_play_events_uses_explain_hand_size_and_seeds_stock_discard`
- [x] `build_ruleset_play_events_falls_back_to_demo_defaults_without_explain`

### Route/Behavior Tests

- [x] existing generate/play route tests remain green

## 7) Verification Checklist

- [x] Tests fail first
- [x] Tests pass after implementation
- [x] `npm run test` passes
- [x] `npm run check` passes
- [x] `npm run build` passes
