# TDD Spec: discard-pickup-and-immediate-use-primitives

_Status: Completed_
_Owner: Connor + agents_
_Date: 2026-02-19_

## 1) Intent

Support games like 500 Rum without hardcoded game logic by adding generalized primitives for:
1. drawing from a non-top visible card in a table zone (usually discard),
2. taking the selected card plus all cards above it,
3. requiring that selected card to be immediately used in the resolve play.

This must remain ruleset-driven and reusable for other variants with similar discard-pickup mechanics.

## 2) In Scope

- Extend `gameplay/v0` with source-specific draw constraints under turn-action policy.
- Track pending draw anchor card identity for immediate-use enforcement.
- Extend `ui-profile/v0` with per-zone draw pick mode (`top` vs `any_visible`).
- Update ruleset extraction/compile pipeline to detect and emit discard pickup semantics from prose.
- Update play table UI to allow selecting visible discard cards for draw when configured.

## 3) Out of Scope

- Full custom scripting for arbitrary conditional actions.
- Enforcing “must immediately meld” against complex meld validator semantics in this pass.
- Multiplayer server authority changes.

## 4) Expected Outcomes

1. Rulesets can express draw-source rules per zone (single-top draw or visible-card pickup run).
2. Engine rejects illegal non-contiguous discard pickups.
3. Engine can require resolve move to include the picked anchor card from discard pickup.
4. UI allows tapping visible discard cards to draw selected+above run when profile says `any_visible`.
5. 500 Rum generated ruleset includes these primitives and behaves serviceably in play UI.

## 5) Acceptance Criteria

- [x] `GameplayRulePack.turnActionPolicy` supports per-source draw rules.
- [x] `GameplayState.turnActionState` tracks required resolve anchor card when configured.
- [x] Gameplay validation rejects non-contiguous top-run pickups and wrong-card resolve after pickup.
- [x] `UiTableZoneProfile` supports `drawPickMode`.
- [x] Play UI can initiate discard pickup from selected visible discard card.
- [x] Ruleset generator emits source draw rules for 500-Rum-like wording.

## 6) Data and Rules

- New/extended primitives:
  - `gameplay/v0`:
    - `turnActionPolicy.drawSourcePolicies[]`:
      - `zoneId`
      - `minCards`
      - `maxCards?`
      - `requireContiguousFromTop?`
      - `requireResolveIncludesAnchor?`
  - `ui-profile/v0`:
    - `table.zones[*].drawPickMode?: 'top' | 'any_visible'`
  - rule facts:
    - `turn.sourceDrawRules[]`:
      - `zoneId`
      - `pickMode`
      - `requireTakeAbove?`
      - `requireResolveIncludesPicked?`

## 7) Test Plan (Red -> Green)

### Unit Tests

- [x] engine: reject non-contiguous discard pickup run.
- [x] engine: require resolve includes picked anchor card when configured.
- [x] ui-profile: accepts/validates `drawPickMode`.
- [x] play-surface-profiles: exposes draw pick mode map.
- [x] generator: detects 500-rum discard pickup rule hints and compiles policies + ui pick mode.

### UI Behavior Contracts

- [x] play table source includes any-visible draw interaction hooks.

## 8) Planned Files

- `/Users/ConnorO/git_repos/just-cards/src/lib/gameplay/engine.ts`
- `/Users/ConnorO/git_repos/just-cards/src/lib/gameplay/engine.test.ts`
- `/Users/ConnorO/git_repos/just-cards/src/lib/ui/ui-profile.ts`
- `/Users/ConnorO/git_repos/just-cards/src/lib/ui/ui-profile.test.ts`
- `/Users/ConnorO/git_repos/just-cards/src/lib/gameplay/play-surface-profiles.ts`
- `/Users/ConnorO/git_repos/just-cards/src/lib/gameplay/play-surface-profiles.test.ts`
- `/Users/ConnorO/git_repos/just-cards/src/lib/components/play-table.svelte`
- `/Users/ConnorO/git_repos/just-cards/src/lib/components/play-table-style-contract.test.ts`
- `/Users/ConnorO/git_repos/just-cards/src/lib/rulesets/generator.ts`
- `/Users/ConnorO/git_repos/just-cards/src/lib/rulesets/generator.test.ts`
- `/Users/ConnorO/git_repos/just-cards/src/lib/rulesets/llm-agent.ts`
- `/Users/ConnorO/git_repos/just-cards/docs/gameplay-v0.md`
- `/Users/ConnorO/git_repos/just-cards/docs/ui-profile-v0.md`
- `/Users/ConnorO/git_repos/just-cards/docs/primitives-kb-v0.md`

## 9) Verification Checklist

- [x] Tests written before implementation
- [x] Tests fail first (red)
- [x] Implementation added (green)
- [x] Refactor performed with tests still passing
- [x] `npm run check` passes
- [x] `npm run build` passes
