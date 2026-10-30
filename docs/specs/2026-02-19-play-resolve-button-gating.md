# TDD Spec: play-resolve-button-gating

## Intent

Keep resolve UX aligned with engine turn-action constraints by disabling hand quick-target buttons when:
1. selected card does not satisfy required discard-pickup anchor, or
2. selected target zone is outside required resolve target zone allowlist.

## In Scope

- Update `isResolveBlocked` logic in play table to incorporate anchor and required target zones.
- Add source contract test to prevent regressions.

## Out of Scope

- New gameplay engine policies.
- Additional copy/content redesign.

## Expected Outcomes

1. After discard pickup requiring immediate anchor resolve, invalid quick targets are disabled.
2. When resolve target is constrained (for example `meld` only), other quick targets are disabled.
3. UI disabled state mirrors current engine enforcement.

## Acceptance Criteria

- [x] `isResolveBlocked` returns true for target zones outside `requiredResolveTargetZonesForSelf`.
- [x] `isResolveBlocked` returns true when selected card does not match required anchor card.
- [x] Style/source contract test asserts these gating hooks exist.

## Test Plan (Red -> Green)

- [x] Add failing contract test in `play-table-style-contract.test.ts` for required target/anchor gating in resolve blocker.
- [x] Implement resolve blocker updates in `play-table.svelte`.
- [x] Run focused tests, then `npm run check` and `npm run build`.

## Planned Files

- `src/lib/components/play-table-style-contract.test.ts`
- `src/lib/components/play-table.svelte`
- `docs/specs/2026-02-19-play-resolve-button-gating.md`
- `docs/README.md`
