# TDD Spec: Make game-list cleanup easy to find

## Intent and scope
The rename/archive controls exist but are hidden below setup. Add a direct
“Rename or remove games” button beside both game pickers. It opens, scrolls to,
and focuses the shared library. Call the archive action “Remove from list” and
explain how to restore it. Built-ins remain protected and existing games retain
snapshots. No schema change or permanent deletion.

Clean up the current local catalog by archiving the seven test imports/variants:
Custom pattern bonus (two entries), Family Golf with generated numeric suffixes
(three entries), and Live URL proof entries (two). Use the existing revision-checked
metadata API; keep the two built-ins. All cleanup remains reversible.

## Expected outcomes / tests
- Browser test fails before implementation: a visible picker shortcut opens the
  management panel and moves keyboard focus to its summary on Play and Score.
- Rename remains available for saved entries; Remove from list uses existing
  archive semantics; Show archived games and Restore remain available.
- Verify catalog cleanup via API, scoped browser test, npm run check/build.

## Rollback
Restore archived records through Manage games. UI change can be reverted without
changing storage or existing games.
