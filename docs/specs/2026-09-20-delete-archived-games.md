# TDD Spec: Permanently delete archived games

_Status: Complete_
_Date: 2026-09-20_

## Intent and expected outcomes
Allow explicit permanent deletion of archived custom rulesets from Manage games.
A named inline confirmation explains that the library entry cannot be restored;
existing room/score snapshots remain intact. No existing user records are deleted
as part of implementation. Names are mutable labels; record IDs are the keys.
Built-ins remain protected and can be duplicated with a custom name.

## Contracts
RulesetStore and RulesetService expose deleteArchived(id, expectedUpdatedAt).
Memory, SQLite and D1 must atomically require an archived record and matching
revision; active, restored or concurrently renamed records cannot be deleted.
DELETE /api/rulesets/:id accepts expectedUpdatedAt and returns success only after
deletion. UI removes the entry and local favorite/cache references on success.
Successful online catalog loads replace stale browser catalogs so deleted games
cannot reappear from cached data. Offline catalog availability remains supported.

## Test plan
Write failing adapter/API tests for actual removal, active/builtin protection,
stale revisions and survival of snapshots. Test authoritative catalog reconciliation.
Browser verification covers cancel, confirm, rename stable ID and reload absence,
using isolated QA storage. npm run check and npm run build must pass.

## Rollback / limits
Revert UI/API to disable new deletions. Deleted catalog bundles have no restore;
room/score snapshots and independent copies are not deleted. Offline devices retain
previously downloaded catalogs until a successful online load.

## Verification
- Red: four adapter/cache tests failed before implementing deletion/reconciliation.
- Green: 294 unit/integration tests across 56 files pass, including memory/SQLite/D1
  deletion, revision/archive/builtin guards and endpoint removal.
- Seven scoped browser tests pass against isolated Worker storage: named confirmation,
  cancel, deletion/reload, stable-ID rename, retained room/score configuration, stale
  cache reconciliation, discovery, offline scores and house-rule regressions.
- The snapshot browser test explicitly verifies a real score session associated with
  the deleted ruleset, and passes on repeat with that assertion.
- 390px mobile confirmation inspected: no overflow or browser errors, 44px controls.
- npm run check: zero errors/warnings; npm run build passes.
- Local Worker restarted on 8787; all nine existing library entries (seven archived)
  remain present. Permanent deletion was exercised only on isolated QA records.
