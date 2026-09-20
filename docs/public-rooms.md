# Public rooms, capacity, and owner access

Anyone can create an unlisted shared table and send its invite URL to family. Room
and seat credentials remain independent of owner access. No account is required
for playing, using saved rules, changing house rules, or physical scorekeeping.

## Capacity and saved games

The defaults in `wrangler.jsonc` are:

| Setting | Default | Meaning |
| --- | --- | --- |
| `ROOM_MAX_ACTIVE` | 20 | Global number of active shared rooms |
| `ROOM_CREATIONS_PER_HOUR` | 5 | Successful creations per network address per hour |
| `ROOM_LOBBY_IDLE_SECONDS` | 900 | Save an idle lobby after 15 minutes |
| `ROOM_GAME_IDLE_SECONDS` | 1800 | Save a dealt game after 30 minutes |

Accepted player changes renew the idle deadline. Merely keeping a browser open,
reading the table, reconnecting, heartbeats, invalid actions, and replayed requests
do not renew it. A manual pause keeps its slot until that deadline. Explicitly
ending a game, or reaching its final score, releases the slot immediately.

At the deadline, the game pauses, its sockets close, and its slot is released. The
event log, hands, and scores remain stored. This is **Table saved** in the UI. The
host can **Resume game** when a slot is available. Other players can use **Check
table**, or return to the tab, to discover the resumed game. Away seats must return
or be replaced before the host resumes. Old rooms without activity metadata are
saved on first access and need an explicit resume.

At capacity, creation/resume returns HTTP 503 with `Retry-After: 30` and a friendly
“All tables are currently occupied” message. Failed resume leaves the game saved.
Creation limits return 429 with the remaining window in `Retry-After`. Resuming
does not use a creation allowance. Shared Wi-Fi shares that allowance. There are no
automatic creation/resume retries. Active rooms can continue at full capacity.

## Durable coordination

Each room remains a `CardRoom` Durable Object. One SQLite-backed `RoomAdmission`
object named `global` serializes capacity reservations in storage transactions.
Reservations contain a generation token and expiry; late release of an old token
cannot remove a newer reservation. Room requests validate and stage state first,
reserve capacity, then persist. Per-room serialization covers asynchronous RPCs.
A failed/crashed creation can temporarily hold a reservation until its deadline;
it cannot leak a slot forever. Coordinator expiry is authoritative even if a room
alarm runs late. Reads cannot revive an expired room.

Room alarms check presence at most once per minute (15 seconds after a clean
socket close), or earlier at the idle deadline. Unchanged checks do not rewrite or
broadcast the room. Saved/finished rooms stop scheduling alarms. WebSocket ping/pong
uses hibernation auto-responses. Fallback polling backs off from 2 to 30 seconds
and stops while hidden or saved. Expired coordinator entries are pruned on admission;
there is no perpetual coordinator cleanup alarm.

The coordinator retains salted hashes of network addresses for rate windows, not
raw addresses. Local Vite development uses `.local/admission.sqlite` behind the
same interface; production uses the `ROOM_ADMISSION` binding and
`v2-room-admission` migration. Preserve previous Durable Object migrations when
deploying. Physical score sessions are outside the shared-room cap.

This bounds active rooms, **not total Cloudflare spend**. HTTP traffic, stored game
history, physical scoring, and public ruleset creation can still incur costs. Room
codes are unlisted invitations, not an account-level access policy. Additional
edge rate limiting/Turnstile can be added before a broad public launch.

## Owner-only AI

Set `OWNER_ACCESS_KEY` to a random secret of at least 32 characters. Keep it in
`.dev.vars` for local Wrangler or use `wrangler secret put OWNER_ACCESS_KEY` for
deployment. Vite can use its private environment. Generate a random key with a
password manager; do not put it in `wrangler.jsonc`, client code, or room URLs.
`OPENAI_API_KEY` remains server-only. AI fails closed if owner access is unset.

Open `/owner` and enter the key. This sets an eight-hour signed, HttpOnly,
SameSite=Strict cookie (Secure on HTTPS). **Sign out** clears this browser's cookie.
Rotate `OWNER_ACCESS_KEY` to invalidate all existing owner sessions and API clients.
There is no public signup or user administration. The browser does not store the
owner key. Only the owner sees AI import forms and controls to rename, archive, restore, or
delete shared games. Public users can read the catalog, favorite games locally,
make immutable copies, and create house-rule variants. PATCH/DELETE to individual
rulesets are also protected by the server hook.

The server hook gates `/api/rulesets/generate`, all `/api/mcp` transports, and
`/api/chat/actions` before any source fetch, tool execution, or model request. It
uses the resolved route ID, so encoded route paths cannot bypass authorization.
Existing MCP credentials alone do not grant owner access. Non-browser clients send
`x-just-cards-owner-key` alongside existing MCP authorization. Cross-origin browser
requests are rejected. Non-AI MCP tools currently share this owner-only boundary;
public family gameplay uses the regular room and score APIs.

## Verification

Spec: [public room capacity](./specs/2026-09-21-public-room-capacity.md).
Unit tests cover admission transactions' pure mutation, managed lifecycle, owner
cookies, expiration, stale generations, and request retries. The dedicated browser
test exercises the compiled Worker, independent room objects, phone UI, and auth.

For the browser test, use a **fresh temporary persistence directory**, apply D1
migrations with `--local --persist-to <directory>`, and run a separate Wrangler dev
server on port 8788 with that same directory. Override `ROOM_MAX_ACTIVE:2`,
`ROOM_CREATIONS_PER_HOUR:4`, both idle settings to `6`, `OPENAI_API_KEY:` (empty),
and `OWNER_ACCESS_KEY:capacity-test-owner-key-not-a-production-secret`. Then run:

```sh
ROOM_CAPACITY_E2E=1 CF_INTEGRATION=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:8788 npm run test:e2e -- tests/e2e/room-capacity.spec.ts --workers=1
```

Use separate persistence and generous room/creation limits for the wider game
regression suite. Never run the short-timeout capacity test against a family table
or production deployment.

The existing `import-resume.spec.ts` browser tests require
`E2E_OWNER_ACCESS_KEY` matching their isolated test Worker's owner key. They log in
through the same owner endpoint as the UI. Keep provider keys empty for tests that
should use the deterministic extraction fallback.

## First production deployment

Live site: https://just-cards.otoolecf.workers.dev

The production Worker, D1 schema, room classes, and admission coordinator are
provisioned. OWNER_ACCESS_KEY and OPENAI_API_KEY are Wrangler-managed secrets.
The owner key is also in the ignored local `.dev.vars` file for the owner's use.
The temporary bulk-secret upload file was removed after upload.

The resolved production binding IDs and absolute local build paths are in ignored
`.wrangler/production.json`. Keep resource/account identifiers out of Git. This
file is a deployment snapshot: regenerate it from `wrangler.jsonc` when settings or
bindings change, preserving the production database ID and resolving paths for the
current checkout. For the current checkout, rebuild and deploy with
`npx wrangler deploy --config .wrangler/production.json`. Apply future remote D1
migrations with the same config before code that requires those schema changes.
Do not point a development test at the production database.

Local room history and custom rules were not copied to production. Built-in games
are supplied by the deployed app. First-launch verification completed a real Golf
round with two isolated mobile browser contexts, checked scores and reconnect,
verified HTTPS owner cookies and anonymous write denial, then ended its test room
and deleted its temporary ruleset. No paid AI generation was needed for verification.
