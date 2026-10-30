# TDD Spec: Organizing rulesets and interrupted games

## Intent and agreed behavior
Make the family library manageable and let a table survive people leaving or
switching phones. Users approved private recovery links without accounts, pausing
and replacing a seat mid-round, new players joining between rounds, host transfer,
and host-controlled undo of the latest play.

## Plan
1. Add catalog metadata updates behind RulesetStore (memory, SQLite, D1), with
   optimistic concurrency. Rename/archive/restore custom entries; duplicate any
   entry without changing its validation status. Protect builtins. Favorites stay
   on this browser, with favorite-first filtering in both game pickers.
2. Preserve each deal's player list in the room event log, migrating old records
   on mutation. Retain departed seat identities/names for score history. New players
   begin at zero and join only in the lobby or between completed rounds.
3. Add pause/resume, step away/return, host transfer and host undo. Pausing rejects
   gameplay/deals. Undo appends a retraction of the latest command and replays state;
   never cross a new deal or changed roster. Revealed information cannot be unseen.
4. Generate private single-use recovery links in URL fragments. Only hashes reach
   durable storage; claiming rotates the seat credential and revokes old sockets.
   Self may create a recovery link; host can create a replacement link while paused.
   Replacement inherits cards and score. Lost-response retries remain idempotent.
5. Show connection status; allow a grace period for reconnect before automatically
   pausing an active game with a missing player. Preserve durable room authority.
6. Verify pure/API/storage tests first, then built Worker multi-browser flows,
   mobile rendering, full tests, check and build. Use isolated QA persistence.

## Boundaries and invariants
No accounts or public deployment. Archive is reversible; no permanent delete.
Names/archive flags are catalog metadata, never mutations to ongoing games' bundles.
Favorites are device preferences, not shared user identity. Existing APIs have no
catalog accounts: rename/archive affect this installation's shared custom library.
No private links in regular invites, server logs, public projections or referrers.
Recovery is explicit and consumes the link. Late joining starts at zero, without
retroactive scores. Historical rounds retain the players who actually played.
All room mutations retain atomic revision and idempotency checks.

## Red -> green acceptance
- Metadata persists on all adapters; stale writes fail; builtins protected; archive
  excluded from new room/score pickers while existing rooms/sessions remain usable.
- Duplicate retains blocked/ready state and source lineage; favorites survive reload.
- Pause rejects play; only host resumes/transfers/undoes. Leaving pauses and keeps
  the hand. Round-boundary roster edits preserve replay, scores and dealer rotation.
- Claim link on a fresh browser preserves seat/hand, consumes hash, revokes old token,
  cannot steal another seat by guessing IDs; idempotent retry and secret redaction.
- Disconnect/reconnect grace, presence updates, replacement and host transfer work
  across real browser contexts and stored room restart.
