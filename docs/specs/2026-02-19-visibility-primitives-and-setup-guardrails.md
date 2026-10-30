# TDD Spec: visibility-primitives-and-setup-guardrails

## Intent

Harden generated playability by making card visibility explicit in UI primitives and preventing false hidden-hand setup in games like 500 Rum.

## In Scope

1. Add viewer-visibility primitives to `ui-profile/v0`:
- `public`
- `owner_only`
- `hidden`
2. Apply visibility modes in play-surface rendering for hand, table zones, and seat-public cards.
3. Tighten setup extraction/normalization guardrails so 500 Rum-like rules do not incorrectly seed player hands mostly face-down.
4. Add deterministic tests for 500 Rum and Six Card Golf setup/visibility expectations.

## Out of Scope

1. Multiplayer identity/auth visibility enforcement beyond current local play surface.
2. New game-specific custom scripts.
3. MCP server implementation (covered by later phases).

## Expected Outcomes

1. UI profile can declare card visibility policy per hand/table/seat cards.
2. Rendering respects visibility policy in addition to face-up/face-down card state tags.
3. 500 Rum generation no longer defaults to hidden hand cards due discard wording.
4. Six Card Golf generation continues to produce partial face-up 2-of-6 behavior with hidden remainder.

## Acceptance Criteria

- [x] `ui-profile/v0` validates `cardVisibility` for hand/table/seat cards as `public|owner_only|hidden`.
- [x] play surface view masks/unmasks cards according to card visibility mode and viewer context.
- [x] deterministic generation path keeps 500 Rum hands fully visible for self at round start.
- [x] deterministic generation path keeps Six Card Golf hidden-card setup intact.
- [x] tests cover draw semantics + visibility expectations for Rum/Golf.

## Test Plan (Red -> Green)

1. [x] Add failing unit tests for `ui-profile` visibility validation.
2. [x] Add failing play-surface model tests for owner/public/hidden render behavior.
3. [x] Add failing generator tests for 500 Rum setup guardrail + Six Card Golf hidden setup persistence.
4. [x] Implement minimal changes.
5. [x] Run targeted tests, then full `npm test`, `npm run check`, and `npm run build`.

## Planned Files

- `src/lib/ui/ui-profile.ts`
- `src/lib/ui/ui-profile.test.ts`
- `src/lib/gameplay/play-surface-profiles.ts`
- `src/lib/gameplay/play-surface-model.ts`
- `src/lib/gameplay/play-surface-model.test.ts`
- `src/lib/rulesets/generator.ts`
- `src/lib/rulesets/generator.test.ts`
- `src/lib/rulesets/llm-agent.ts`
- `src/lib/rulesets/llm-agent.test.ts`
- `docs/ui-profile-v0.md`
- `docs/primitives-kb-v0.md`
- `docs/specs/2026-02-19-visibility-primitives-and-setup-guardrails.md`
