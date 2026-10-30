# Shared table v1

## Playing and keeping score

Open `/play`, choose a built-in or saved game, enter a name, and create a room.
Share the invite link or eight-character room code. Everyone joins in their own
browser before the host deals. Reopening the link in that browser restores the seat.
Recent tables appear on `/play` for quick resume. The browser retains a random seat
credential; clearing browser storage requires a saved recovery link or host-issued replacement link. Before dealing, the host can remove a
seat and anyone can leave the lobby; leaving transfers hosting to the next seat.
The host can also choose **End game** in the room header at any time and confirm.
This permanently closes that room for everyone, preserving completed scores without
scoring an unfinished round. The closed screen offers **Leave room** and **Create
new room**. Closed rooms disappear from recent-room shortcuts; their history remains
stored. End-game requests have the same revision and idempotency checks as play actions.

Golf offers six fixed positions, two opening reveals, stock/top-discard draws,
replacement or discard, public opponent layouts, and automatic column scoring.
One fully revealed layout ends the round; the lowest total after nine rounds wins.
500 Rum deals 13 cards with two players and seven otherwise. It supports repeated
melds, contributor-owned layoffs, and selecting a discard plus a legal immediate
meld/layoff in one atomic action. All newer discards are also picked up. Emptying a
hand ends the round; table values minus remaining hand values determine the score.
Highest total wins when anyone reaches 500. The host deals subsequent rounds or
starts a rematch after the game ends. Round history remains visible within a game.
Rummy hands can be sorted by rank or suit; meld suggestions and legal-action gating
use the same pure meld predicate as server validation.
**Arrange hand** also supports tapping a card then its destination, left/right
controls and desktop dragging. It works while waiting for another player. **Done
arranging** returns to selecting cards for play. Manual order stays in that browser
after reload; new cards append and played cards are removed without reordering the
rest. Arranging does not submit a game command or change fixed Golf positions.

Table melds are already-played public cards. On your turn, draw, select hand cards
and use **Add to this meld** to extend a valid meld. Added cards retain your
scoring ownership. Each button explains missing prerequisites or an invalid
selection; selecting public meld cards is not required.

Hand/meld games explain the configured starting count beside the hand. **Play new
meld** creates a public group; **Add to this meld** extends a group already played.
The arrange-mode turn banner prompts players to finish arranging before play.

At `/play`, import a specific game URL or pasted rules and inspect the result.
If Bicycle blocks automated fetching, its two reference URLs use a dated reviewed
snapshot with a visible disclosure. Other blocked pages can be supplied as pasted text.
Supported policies become selectable shared games; incomplete descriptions remain
clearly labelled drafts. Complete policies compile directly without a model request.

At `/`, Guided mode offers rank-only entry: Golf uses editable positions; 500 Rum
uses table and remaining-hand collections. Raw mode retains quick value entry.
Sessions persist player names and event logs, support undo/redo, and resume on reload.

Rules are based on the reviewed [Bicycle Golf article](https://bicyclecards.com/how-to-play/six-card-golf)
and [Bicycle 500 Rum article](https://bicyclecards.com/how-to-play/500-rum).
Bicycle's 500 Rum article does not specify numeric card values. The visible app
default is A=15, faces=10, numerals=face value. Exhausting stock ends either game's
round after the current turn. These conventions appear in the UI and diagnostics.

## Executable policy

`runtime-bundle/v1` optionally contains `runtimeRulePack.tableRules` with
`schemaVersion: 'table-rules/v1'`. The contract is in
`src/lib/gameplay/table-rules.ts`; it is validated when saving a bundle or creating
and replaying a room. It contains:

- Player range and cards per player, with optional player-count overrides.
- Optional rows/columns and opening reveal count for fixed layouts.
- Discard pickup (`top` or `suffix`) and immediate-use requirement.
- Optional set/run bounds and ace ordering for hand/meld play.
- Round ending (`all_revealed` or `empty_hand`) and exhausted-stock behavior.
- Signed hand/meld scoring, optional matching-column cancellation, win direction,
  round limit, and target total.

This describes game families without branching on a game name. A fixed layout
cannot combine with suffix pickup or meld play. Grid/meld deals must fit one standard deck; shedding can use two decks (see below).
`scoreCardCollection` provides shared rank and column scoring for the runtime,
shared table, and guided scoring. Round scores are derived from persisted commands;
scorekeeper totals are derived from score events.

Supported table commands are `reveal`, `draw`, `swap`, `meld`, `layoff`, and
`discard`. Swap preserves position and discards the replaced card atomically.
Pickup validates the selected anchor's immediate use before applying any change.
Melding keeps the turn open; discarding finishes it. Empty hands finish immediately.
Invalid commands leave state unchanged. Round ending scores once and reveals hands.

## Authority and persistence

`POST /api/rooms` creates a room from a stored supported ruleset. `GET` and `POST
/api/rooms/{code}` read a viewer projection and submit mutations. Seat identity comes
only from a bearer credential (stored as a hash on the server). Starting/dealing is
host-only. Mutations carry expected revision and request ID; retries of the same
request are idempotent and stale changes are rejected. The UI may rebase one
unapplied opening reveal against another seat's reveal in the same setup.

Room projections allowlist public data. They exclude deck contents, private event
history, credentials, hidden card faces and hidden card identities. A Golf player
cannot see their own unrevealed cards. Private Rummy cards are visible only to their
owner until round end. Melds retain a public contributor ID for scoring attribution.

Development uses `.local/rooms.sqlite` and `.local/scores.sqlite` behind storage
interfaces. The Worker binds `ROOMS` to SQLite-backed `CardRoom` Durable Objects,
one per room or score session. Mutations are synchronous transactions after request
parsing. The entire bundle is copied into the room, so later ruleset edits do not
change a game in progress. Persisted shuffled deals and validated commands replay
identically after restart. Score sessions persist config/roster and events through
`SessionRepository`; the in-memory default remains available to pure unit tests.

WebSocket upgrades at `/api/rooms/{code}/socket` are routed before SvelteKit.
Same-origin requests authenticate a seat through a WebSocket subprotocol; credentials
never enter URLs. Each hibernating connection stores only its room and credential
hash as an attachment. Committed mutations broadcast a separate allowlisted view to
each seat. Removed lobby seats lose their connection. Automatic ping/pong handling
and client reconnect restore current state without replaying client commands.
HTTP commands retain revision and idempotency checks. Vite and temporary socket
failures use polling; connected Worker clients receive live updates.

Custom rule imports persist in D1 through RulesetStore. See
[Ruleset storage](./ruleset-storage-v0.md) for schema migrations and binding selection.

`npm run build` wraps the adapter-generated Worker and exports `CardRoom`. The wrapper
handles socket upgrades first; generated server code is excluded from static assets.
`npm run check` generates Worker bindings/runtime types. `npm run cf:dev` exercises
the Worker locally; `npm run cf:deploy` builds and deploys the Worker and its binding.
Use HTTPS when sharing with phones (seat generation and clipboard use secure browser
APIs). Build/dry-run verification does not deploy anything.

## Current limits and follow-up work

- Game families outside the explicit executable policy remain draft previews.
  The directory URL is not a rule article; ingestion asks for a specific game URL.
- MCP gameplay still uses its existing prototype game store. It is not the shared-room
  command API. MCP score leaderboards read the persisted score-session API.
- No accounts, room expiration, spectator mode, or offline multiplayer. These are separate work from this playable family slice.

## Family house rules

**Customize house rules** is available for the selected supported game in Play and
in guided score setup. It edits player limits, private-hand deal counts (including
2-player overrides), rank values, round limits and target score. Grid games expose
opening reveal count and, for two rows, column cancellation. Meld games expose ace
ordering. The fixed grid shape and other mechanics retain their existing policy.
Ten-card Rummy requires at most five players to fit the single deck.

Saving requires connectivity and creates a named manual copy, preserving
`houseRules: {version:'house-rules/v1', parentId, parentName, createdAt}` in the
canonical runtime bundle. `POST /api/rulesets/:id/house-rules` checks the base policy
snapshot, rejects unreviewed/blocked parents, compiles matching runtime/UI/guidance,
and reruns actual-engine behavioral validation. It does not claim that customized
rules match the original article. Existing rooms/sessions retain original rules.

Family variants appear in both game pickers. New score sessions use the same card
values and column cancellation; round/target limits currently end virtual games,
while physical score sessions remain running scoreboards. Unsupported new mechanics
still require engine extensions. See [offline physical scoring](./scorekeeper-rules.md).

## Interrupted games

**Table controls** offers pause, step away, private recovery and (for the host) host
transfer and undo. Any seated player may pause; only the host resumes. Step away
keeps a mid-round seat, cards and score, pauses the room, and transfers hosting if
needed. The returning player taps **I'm back**, then the host resumes. Leaving or
removing a player between rounds frees the seat while retaining completed history.
New players join only in the lobby or between rounds, start at zero, and receive
cards with the next deal. Every deal snapshots its player list; old deal records
are upgraded before the first roster mutation. Dealer rotation selects the next
surviving player from the previous roster. Undo appends a retraction and recalculates
state/scores. It cannot cross a deal or roster change and cannot erase what players
already saw.

**Create my private recovery link** issues a single-use capability for switching
phones. While paused, the host can also issue a replacement link for another seat.
Claiming it optionally renames the player, inherits the same seat/cards/score,
rotates the credential, and revokes old browser/socket access. Making another link
invalidates the previous one. Links contain a random secret in the URL fragment;
the client removes the fragment immediately and sends the secret only in the claim
body. Only SHA-256 hashes enter room storage. A pending claim is retained in that
tab's session storage for lost-response retries and cleared on success or dismissal.
Normal **Copy invite** links never contain recovery secrets. Possession of a private
link grants access to that seat, so it must only be shared with the intended player.

Worker connections heartbeat every 15 seconds. A Durable Object alarm checks
presence at most once per minute while the room is active (15 seconds after a clean socket close), or earlier at its idle deadline. HTTP activity/clean disconnects
get a 15-second grace period; silent sockets expire after 45 seconds without a
heartbeat. Missing players become Away and pause the table; a present player may
**Take over as host** when the host is away. Reconnection does not silently resume
play: return/replace the away seats, then resume explicitly. Browser polling in Vite
still supports manual pause/recovery; automatic disconnect detection is a Worker
feature. All room changes remain durable, authoritative and revision-checked.

## Patience, shedding, and contract capabilities

The catalog also includes **Solitaire (draw-one Klondike)**, **Bridge (rubber)**,
**Palace (Bicycle)**, and **Palace (family rules)**. These are curated, executable
policies, not AI extractions or game-name branches. See the
[implementation spec](./specs/2026-09-20-more-built-in-games.md).

`table-rules/v1` now supports exactly one of `layout`, `meld`, `patience`,
`shedding`, or `contract`. The new capabilities use empty `scoring.zones` and no
card-value target/round limit. Their rules are described in the shared policy schema.

- `patience`: one player, seven triangular columns, alternating descending colors,
  King-only empty columns, suited Ace-to-King foundations. Draw one, unlimited waste
  recycling, movable face-up sequences and foundation-to-tableau moves. Completion
  awards one win; conceding awards zero and enables another deal. Hidden tableau
  cards and stock never reach the client. Tap a visible card, then its destination.
- `shedding`: 2–5 players, one deck for two and two decks for 3–5. Three blind cards,
  six initial hand cards, choose three face up; refill to three until stock ends.
  Play hand, then face-up, then one blind card. Equal-rank multiples are permitted;
  legal plays are compulsory; unable players pick up. A failed blind card joins the
  picked-up pile. First out wins one point. Policy switches control wild 2/reset,
  wild 10/burn/repeat, 3/force-next-pickup-and-skip, 7/next-play-at-most-seven, and
  four-equal/burn/pass. Three obeys the rank comparison; 2 and 10 bypass it when
  enabled. The family preset enables all five switches; Bicycle leaves 3 and 7
  ordinary. The house-rule editor can save these switches in named copies.
- `contract`: four fixed seats, partners opposite, dealer-led auction with higher
  bids, passes, doubles and redoubles. First partner to bid the final strain declares.
  Opening leader sits left of declarer. Dummy is private until the opening lead;
  declarer then controls dummy. Follow suit if possible; highest trump or highest
  led-suit card wins. After 13 tricks, rubber scoring tallies contract points,
  over/undertricks, doubling/redoubling, slams and single-hand honors. A game requires
  100 below-line points; both partial-game counts reset, and that side becomes
  vulnerable. Two games finish the rubber and award its bonus. Highest total wins.
  Seat identity/order remains fixed between deals; private recovery replaces a
  departing player. There are no computer players or duplicate tournament scoring.
  Closing an unfinished room does not add unfinished-rubber settlement bonuses.

Commands: `patience_draw`, `patience_move`, `patience_concede`, `shedding_setup`,
`shedding_play`, `shedding_blind`, `shedding_pickup`, `contract_call`, `trick_play`.
They share authoritative room revision checks, command replay, persistence, pause,
recovery, and host undo. Multi-deck cards retain unique opaque IDs. Private projection
also masks blind IDs, hidden tableau IDs, and honors until a Bridge hand ends.

Sources: [Bicycle Solitaire](https://bicyclecards.com/how-to-play/solitaire),
[Bicycle Bridge](https://bicyclecards.com/how-to-play/bridge),
[Bicycle Palace](https://bicyclecards.com/how-to-play/palace),
[Pagat Shithead variants](https://www.pagat.com/beating/shithead.html), and
[Pagat Bridge scoring](https://www.pagat.com/auctionwhist/bridge.html).
The Solitaire overview leaves color/recycling variations unspecified; the catalog
explicitly states conventional alternating colors, draw-one and unlimited recycling.
Palace is also known by regional names including Shithead/Scheissekopf; these
presets state their rules rather than treating all those variants as identical.

Curated presets have regression coverage for these mechanics. Automatic behavioral
approval of AI-imported `patience`, `shedding`, and `contract` policies remains
blocked: the import-time simulator currently covers grid/meld policies only. This
prevents a new capability from incorrectly inheriting Golf/Rummy readiness checks.

Active rooms have bounded capacity and idle lifetimes; saved games survive suspension. See [public rooms](./public-rooms.md) for resume behavior and owner-only AI access.
