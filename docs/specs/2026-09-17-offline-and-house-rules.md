# TDD Spec: Offline physical scoring and easy house rules

_Status: Complete_
_Date: 2026-09-17_

## Intent
Keep scoring physical games through lost connectivity, including reloads and new
sessions after the app has been loaded once. Let families save named variants of
supported games without editing JSON or involving AI.

## Plan and expected outcomes
1. Persist a local score-event outbox and server snapshot, replaying both with the
   existing score engine. Save before acknowledging input; preserve undo/redo.
2. Add idempotent session creation and event append IDs with expected event counts.
   Retry lost responses safely. Concurrent remote edits pause sync instead of
   applying undo to another person's round. Offer an explicit separate-session copy.
3. Cache the built scorekeeper shell/assets for offline reload. Never cache private
   room or API responses in the service worker. Display device/server sync status.
4. Add a capability-driven house-rule form for card values, deal counts, player
   range, round/score limits, opening reveals, pair cancellation and ace ordering.
   Save immutable manual variants through RulesetStore after schema and actual-engine
   validation. Preserve parent provenance and regenerate matching guidance/UI.
5. Browser checks cover offline creation, entry, undo/redo, reload, reconnect and
   custom Golf/Rummy variants. Run tests, check and build.

## Boundaries
Offline multiplayer, arbitrary new mechanics and editing games already in progress
are outside scope. First installation and fetching uncached rules require a connection.
Offline data belongs to this browser; clearing its storage removes unsynced work.
House-rule saving requires a connection. Unsupported imported drafts cannot bypass review.

## Invariants
Totals always derive from events. Synced event prefixes never change. An event ID
cannot represent two payloads. Retries cannot duplicate an event. Conflicts retain
both versions. Local storage failure must not be reported as a saved score.
House rules apply identically to new shared rooms and guided scoring sessions;
changing the name or values never changes the source ruleset or current sessions.

## Red -> green tests
- Lost append/create responses, reload and duplicate sync produce exactly one score.
- Changed server prefixes pause sync; a separate copy preserves offline undo semantics.
- Local totals match server replay for guided deltas, raw ranks, undo and redo.
- Storage/network/server failures retain pending work and have distinguishable status.
- House variants change deal/scoring/end conditions, preserve parent, reject invalid
  deck capacity and blocked sources, and pass existing persistence/report validation.

## Verification
- Red-first unit tests captured before implementation; 279 tests in 51 files pass.
- `npm run check`: zero errors and warnings; `npm run build` passes.
- Built Worker browser suite: 19 checks pass using deterministic imports, including
  offline create/entry/undo/redo/reload/reconnect, conflict-copy recovery, ten-card
  Rummy dealing, custom Golf guided scoring, and existing shared multiplayer flows.
- Full Rummy regression exercised 11 melds, 9 layoffs, 9 discard pickups and 152
  private socket views. Mobile checks at 390px show no overflow or page errors.
- A separate live-model regression returned a blocked Golf draft with assumptions
  referring to absent meld fields. The readiness gate correctly prevented acceptance;
  its existing happy-path browser test failed. This is an AI extraction variability
  finding, not covered up by the deterministic regression run, and remains follow-up
  work outside these two features.
- User-facing local Worker restarted on port 8787; existing persistence retained.
  Test rooms and variants were created only in isolated QA storage.

## Implementation notes
- Device storage uses one versioned record per score session, protected by Web Locks
  across tabs. Stable IDs and expected event counts support safe retries and explicit
  conflict recovery. API fields are optional for existing integrations.
- The production service worker precaches build assets plus the score shell and
  deliberately excludes API responses and private room documents.
- Manual variants store parent provenance and a fresh accepted deterministic report;
  supported form settings recompile the runtime, score profile and guidance together.
- Browser tests use isolated local Worker/D1/DO persistence to avoid adding QA games
  to the user's main catalog. Mobile layouts checked at 390px.
