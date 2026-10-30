# TDD Spec: ruleset-driven-ui-profile-generation

## Intent

`just-cards` needs ruleset-driven UI metadata as a first-class runtime artifact so generated games can render with correct zones, actions, and guidance text without per-game UI branches. The current play surface supports profile-driven labels/hints, but profile construction is static and not tied to the persisted ruleset bundle contract. This feature introduces a canonical `ui-profile/v0` primitive, validates it, and persists it as part of a new ruleset bundle version.

## In Scope

- Define `ui-profile/v0` primitives for zone presentation, action catalog, and hand/table labels/hints.
- Add deterministic generation helper(s) that derive a usable UI profile from runtime primitives when explicit profile data is absent.
- Promote ruleset bundle contract from `runtime-bundle/v0` to `runtime-bundle/v1` with `uiProfile` as first-class output.
- Validate profile semantics against runtime primitives (zone IDs/action IDs).
- Wire play-surface profile resolution to consume `uiProfile` data through ruleset-aware adapters.

## Out of Scope

- LLM/SLM integration for ingesting remote rules pages.
- Cloudflare D1/Durable Objects migration work.
- Full multiplayer room synchronization.

## Expected Outcomes

1. A ruleset draft can be created with `runtime-bundle/v1` containing both `runtimeRulePack` and `uiProfile`.
2. A ruleset draft can also omit `uiProfile`, and the backend can generate a valid default profile from runtime primitives.
3. Play-surface profile data (visible zones, labels, hints, hand targets, action labels) can be resolved from `uiProfile` with safe defaults.
4. Invalid profile/runtime mismatches are rejected with explicit validation errors.

## Acceptance Criteria

- [x] `ui-profile/v0` TypeScript primitives exist with explicit finite enums for layout/action affordance kinds.
- [x] Ruleset service accepts `runtime-bundle/v1` and rejects invalid `uiProfile` shape or semantic mismatches.
- [x] Ruleset service can auto-generate `uiProfile` when omitted in bundle input.
- [x] Play-surface profile resolution can be built from `uiProfile` without hardcoded game branches.
- [x] Existing runtime/scoring behavior remains unchanged for gameplay/score derivation.

## Data and Rules

- Rule/data inputs:
  - `RuntimeRulePack` (`gameplayRulePack`, `validatorRulePack`, `scoringTriggers`)
  - optional `UIProfileV0` author input
- Key invariants:
  - Every visible table zone in `uiProfile` must be legal for gameplay movement when declared as playable from hand.
  - `uiProfile` IDs are stable primitive IDs (`hand`, `board`, `discard`, etc.), display strings are configurable labels.
  - Bundle persistence remains backend-abstraction-driven (`RulesetStore`).

## Test Plan (Red -> Green)

List tests before implementation.

### Unit Tests (expected to fail first)

- [x] `ui_profile_validation_rejects_unknown_action_target_zone`: action target zone IDs must map to known profile zones.
- [x] `ui_profile_generator_derives_visible_zones_and_labels_from_runtime_pack`: generator uses runtime primitives to produce usable defaults.
- [x] `play_surface_profile_from_ui_profile_maps_labels_hints_and_targets`: play-surface adapter maps canonical profile data into existing UI model.

### Integration/Behavior Tests (expected to fail first)

- [x] `ruleset_service_accepts_runtime_bundle_v1_with_ui_profile`: draft create/list works with v1 bundle.
- [x] `ruleset_service_generates_ui_profile_when_missing`: service stores generated profile when omitted.
- [x] `rulesets_api_create_and_list_roundtrip_uses_v1_bundle`: API flow succeeds with v1 payload.

## Implementation Notes

Keep short and concrete. Include touched files/modules and why.

- Planned files:
  - `src/lib/ui/ui-profile.ts`
  - `src/lib/ui/ui-profile.test.ts`
  - `src/lib/rulesets/types.ts`
  - `src/lib/rulesets/service.ts`
  - `src/lib/rulesets/store.test.ts`
  - `src/lib/rulesets/api.test.ts`
  - `src/lib/gameplay/play-surface-profiles.ts`
- Constraints:
  - Preserve finite primitive enums to avoid open-ended hardcoded behavior in runtime.
  - Keep current `/play` route functional with fallback profile when no persisted ruleset is loaded.

## Rollback Plan

If behavior fails in real usage, how to disable/revert safely?

- Revert ruleset service to `runtime-bundle/v0` validation path.
- Keep play surface pinned to `DEFAULT_PLAY_SURFACE_PROFILE` while `uiProfile` contract is corrected.
