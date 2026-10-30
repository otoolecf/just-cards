# Admission gap fixes

## Intent and outcomes
Fix the four follow-up audit findings without deleting saved games.
Use resolved routes for all API guards. Rate-limit traffic before coordinator RPC.
Store registry and counter rows separately; denied requests must not update rows.
Separate discovery limits from existing-resource traffic. Reserve new resource IDs
with a unique expiring token; commit only after persistence succeeds, release on
failure, and reject stale completions. Preserve previously registered legacy IDs.

## Tests (red, green, regression)
Encoded API routes must obey the pause switch and body cap. Exercise coordinator
SQL with SQLite: denied requests perform zero writes, unknown lookup exhaustion
does not block registered resources, failed/crashed reservations free capacity,
stale completions cannot commit a newer lease, and duplicate creation is serialized.
Test dispatch orchestration and verify local Worker smoke behavior. Run full tests,
check and build. No production deployment or destructive migration.

## Verified behavior

The original hook tests failed with 200 for both encoded-path checks before the
fix. Local Worker smoke checks now return 503 for encoded writes while paused and
413 for encoded oversized bodies. An invalid creation returns 400, its ID remains
404, and a corrected retry with the same ID returns 200. After discovery returns
429, an existing session still returns 200. SQLite-backed tests verify zero writes
on denial, reservation expiry and stale-token rejection, separate global lookup
budgets, and one-time legacy migration. Dispatch tests verify commit on success,
release on response/exception failure, and no operation on denied reservation.

The platform limiter is per Cloudflare location and is not a total billing cap.
Existing registered IDs are retained; ambiguous old entries are not automatically
deleted. No production deployment was performed.

Final checks: 395 tests passed across 75 files; `npm run check` reported zero
errors/warnings; `npm run build` passed; `git diff --check` passed.
