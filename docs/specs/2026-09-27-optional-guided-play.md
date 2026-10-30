# TDD Spec: Optional guided play

_Status: Complete_
_Date: 2026-09-27_

## Intent
Games should open in normal play. Learning assistance is a personal display preference, not a distinct game or ruleset.

## Scope and expected outcomes
- Rename the built-in to Hong Kong Mahjong. Display the obsolete built-in title without its guided suffix in existing rooms; preserve room snapshots and custom names.
- One consistent Guided mode checkbox across shared games and draft previews, off by default. Remember the choice on this browser across games and reloads; other players keep their own choice.
- Guided mode reveals teaching text and contextual explanations. Normal mode preserves actionable status, errors, selections, all moves, scoring, and an accessible How to play disclosure.
- Mahjong tile labels remain independently selectable. Physical score-entry methods are unchanged.
- No gameplay, room protocol, player-count, or deployment changes.

## Data and rules
Use a versioned browser preference key. Missing, malformed or inaccessible storage defaults to normal mode. Storage failures must not prevent toggling in memory. Do not persist this preference in room events or rulesets.

## Test plan (red → green)
- Tests first: preference default, explicit opt-in/out, unavailable storage, canonical/legacy display names.
- Browser: all supported board families expose a single unchecked toggle by default; educational text changes on toggle while controls remain; reload/cross-game persistence and separate-viewer independence; 390px layout and no browser errors.
- Full unit suite, npm run check, npm run build.

## Rollback
Revert presentation and preference changes; no room or scoring migrations are required.

## Verification
- Preference tests first failed on the missing module, then passed after implementation.
- All 358 tests across 64 files pass. `npm run check` reports zero errors/warnings; `npm run build` passes.
- `tests/browser/guided_mode_smoke.py`: seven built-in presets verified on a local Wrangler preview at 390px. Normal defaults, visible guidance on opt-in, unchanged controls, reload/opt-out/cross-game persistence, separate-viewer independence, and a Solitaire stock draw passed. No page overflow or browser errors.
- Local preview rebuilt and restarted with its existing saved room data. No production deployment.
