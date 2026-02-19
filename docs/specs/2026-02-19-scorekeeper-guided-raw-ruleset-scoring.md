# TDD Spec: scorekeeper-guided-raw-ruleset-scoring

_Status: Complete_
_Owner: Connor + agents_
_Date: 2026-02-19_

## 1) Intent

Scorekeeper setup still depends on hardcoded game modes and hardcoded variant tabs, which blocks ruleset-driven scoring UX and creates drift between generated game rules and score entry behavior. We need a generic scoring setup where users choose either guided (ruleset-aware) or raw (calculator) input, and standings ordering follows explicit win-direction metadata rather than mode IDs. Guided mode should use ruleset primitives to render per-zone card entry and compute deltas without adding one-off game UI tabs.

## 2) In Scope

- Add score session setup modes: `guided` and `raw`.
- Remove hardcoded game mode options/tabs from score page (`standard/rummy/golf/cribbage`, `500 Rummy net`, `Six Card Golf hole`).
- Add ruleset-driven guided score profile derivation from runtime bundle primitives.
- Add guided round delta calculation from per-player zone card inputs plus optional finite special rules.
- Persist scoring mode metadata in session config/view (`scoreInputMode`, `scoreWinDirection`, `scoreRulesetId`, guided profile).
- Sort standings from explicit win direction metadata.

## 3) Out of Scope

- Reworking gameplay runtime primitives.
- Full automatic score extraction from live gameplay events.
- New LLM extraction logic for scoring semantics.

## 4) Expected Outcomes

1. Session creation supports `guided` (requires selected ruleset) and `raw` (calculator-first) without mode hardcoding.
2. Guided add-round UI renders from ruleset-driven zone profile and posts computed `add_delta` events.
3. Raw mode remains quick/manual via card rows, quick text, and direct deltas.
4. Leaderboard ordering uses persisted win direction (`high_wins` or `low_wins`) independent of mode IDs.

## 5) Acceptance Criteria

- [x] Score page setup includes scoring mode selector and no hardcoded game-mode selector.
- [x] Guided mode requires a ruleset and builds score session config from ruleset bundle primitives.
- [x] Guided scoring supports zone-role math and finite special rule primitives (e.g., column pair zero for 2x3 layouts) without game-name branching.
- [x] Raw mode supports quick/manual scoring without ruleset dependency.
- [x] Session API/store round-trips score config metadata needed to rehydrate guided/raw flows after join/reload.
- [x] Standings sort uses `scoreWinDirection` and no longer depends on `scoreModeId`.

## 6) Data and Rules

- Rule/data inputs:
  - `runtime-bundle/v1` (`runtimeRulePack`, `uiProfile`, optional `explain`)
  - score session event log (`add_round`, `add_delta`, `undo`, `redo`)
  - score rule pack card values from selected ruleset
- Key invariants:
  - Score totals remain derived from event log server-side.
  - Guided profile and win direction are explicit session config, not transient UI-only state.
  - Finite special scoring behavior is encoded as declarative primitive kinds, not game-name checks.

## 7) Test Plan (Red -> Green)

### Unit Tests (expected to fail first)

- [x] `derive_guided_profile_prefers_ruleset_explain_and_profile_zones`: guided profile derives labels/zones/win direction from bundle data.
- [x] `guided_round_delta_supports_zone_add_subtract_roles`: table-minus-hand style net scoring works from zone roles.
- [x] `guided_round_delta_supports_column_pair_zero_special_rule`: 2x3 column-pair zero rule works via special-rule primitive.
- [x] `sort_standings_by_win_direction_orders_high_and_low`: sort helper uses explicit win direction and tie-breaks alphabetically.
- [x] `session_store_persists_guided_raw_score_config`: session view includes new config metadata.

### Integration/Behavior Tests (expected to fail first)

- [x] `score_page_contract_uses_guided_raw_setup_and_no_variant_tabs`: score page source reflects guided/raw setup and removes hardcoded variant tabs.

## 8) Implementation Notes

- Planned files:
  - `/Users/ConnorO/git_repos/just-cards/src/lib/session/score-session-commands.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/session/score-session-commands.test.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/session/session-store.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/session/session-store.test.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/lib/session/score-session-api.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/routes/api/sessions/+server.ts`
  - `/Users/ConnorO/git_repos/just-cards/src/routes/+page.svelte`
  - `/Users/ConnorO/git_repos/just-cards/src/routes/score-page-contract.test.ts`
- Constraints:
  - Use existing design tokens/classes and preserve 44px touch targets.
  - Keep rules data-driven and avoid game-name hardcoding in scoring logic.

## 9) Verification Checklist

- [x] Tests written before implementation
- [x] Tests fail first (red)
- [x] Implementation added (green)
- [x] Refactor performed without changing behavior
- [x] `npm run check` passes
- [x] `npm run build` passes

## 10) Rollback Plan

- Revert score page to current mode-based setup and disable guided profile scoring path.
- Keep persisted sessions readable by treating unknown config keys as optional/no-op.
