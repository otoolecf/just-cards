# TDD Spec: Ruleset-controlled pattern round entry

_Status: Complete_

## Intent

Hide unrelated pattern scoring in Golf and other guided games. Represent the need
for a separate pattern-round input in the stored UI schema rather than game-name checks.

## Contract and outcomes

- Optional `uiProfile.scorekeeper: { patternRound: boolean }` controls separate
  pattern-round entry. Missing metadata defaults to false for backward compatibility.
- UI profile generation enables it only for configured pattern scoring triggers,
  not for meld validation or column cancellation. Golf and Rummy generate false.
- The derived, persisted `GuidedScoreProfile.patternRound` retains this capability.
  Existing saved profiles without the field hide the panel without migration.
- Guided scoring renders the panel only on explicit true. Raw calculator mode keeps
  the generic editor in collapsed Advanced/custom scoring.
- Existing Golf scoring and saved totals are unaffected.

## Red → green checks

Test schema validation, preset generation, explicit opt-in, legacy default and JSON
round-trip. Browser-test Golf absence after creation/reload and explicit custom
opt-in presence. Update the raw scoring browser flow for its advanced disclosure.
Run unit tests, check, build and browser tests against the built Worker.

## Verification

Four capability tests failed before implementation and now pass. All 247 unit tests
pass; check reports zero errors/warnings and build passes. Seven scoring browser
tests pass on both Vite/SQLite and the Worker, covering Golf/Rummy, legacy saved
sessions, custom opt-in, raw advanced entry and reload. The local Worker runs the
updated build; existing score sessions require no migration.
