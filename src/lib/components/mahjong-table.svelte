<script lang="ts">
  import type { RoomView } from "$lib/server/room-service";
  import type { TableCommand } from "$lib/gameplay/table-engine";
  import { tileName, WIND_NAMES } from "$lib/gameplay/mahjong";
  import MahjongTile from "./mahjong-tile.svelte";
  import ScoreButton from "./score-button.svelte";
  export let room: RoomView;
  export let busy = false;
  export let guided = false;
  export let onCommand: (command: TableCommand) => void;
  let labels = true,
    selected = "",
    sort = true;
  $: t = room.table!;
  $: m = t.mahjong!;
  $: self = room.selfId!;
  $: blocked =
    busy || room.paused || !!room.seats.find((s) => s.id === self)?.away;
  $: mine = [...(m.hands[self] ?? [])].sort((a, b) =>
    sort ? (a.face ?? 0) - (b.face ?? 0) : 0,
  );
  $: if (!mine.some((c) => c.id === selected)) selected = "";
  $: actions = m.options.filter((o) => o.command.type !== "tile_discard");
  $: discard = m.options.find(
    (o) => o.command.type === "tile_discard" && o.command.tileId === selected,
  );
  $: claim = m.claim;
  const name = (id: string) => room.seats.find((s) => s.id === id)?.name ?? id;
  $: guidance =
    m.phase === "ended"
      ? "Hand finished. Review the tiles and scoring below."
      : room.paused
        ? "The table is paused. The host can resume using Table controls."
        : claim
          ? claim.from === self
            ? "Everyone gets a chance to claim your tile. Wait for their responses."
            : claim.responded
              ? "Response saved. Waiting for the other players."
              : "Choose whether to claim this tile, or pass. You cannot draw until everyone responds."
          : t.players[t.turn] !== self
            ? `${name(t.players[t.turn])} is playing. Watch the discards and look for groups in your hand.`
            : m.phase === "draw"
              ? "Draw one tile from the wall. Then decide what to keep."
              : "Tap a tile in your hand, then discard it. Keep matching tiles and neighboring numbers of the same suit.";
</script>

<section class="jc-panel board" aria-label="Mahjong table">
  <div class="settings">
    <label><input type="checkbox" bind:checked={labels} />Tile labels</label
    ><label><input type="checkbox" bind:checked={sort} />Sort by suit</label>
  </div>
  <p>
    <strong>{WIND_NAMES[Math.floor(m.rotations / 4)]} round</strong> · Your
    seat: {WIND_NAMES[(t.players.indexOf(self) - t.dealer + 4) % 4]} ·
    <span data-testid="wall-count">{m.wallCount} tiles in the wall</span>
  </p>
  {#if guided}<p class="guide" role="status">{guidance}</p>{/if}
  {#if claim}<section class="claim">
      <h3>
        {claim.kind === "discard"
          ? `${name(claim.from)} discarded`
          : `${name(claim.from)} is declaring a quad`}
      </h3>
      <MahjongTile face={claim.tile.face} {labels} />
      <p>
        {claim.waiting} response{claim.waiting === 1 ? "" : "s"} remaining. Wins
        come first, then matching groups, then sequences.
      </p>
    </section>{/if}
  <div class="actions">
    {#each actions as action}<div>
        <ScoreButton
          variant={action.command.type === "tile_win" ? "primary" : "default"}
          disabled={blocked}
          onPress={() => onCommand(action.command)}>{action.label}</ScoreButton
        >{#if guided}<p class="jc-subtle">{action.explanation}</p>{/if}
      </div>{/each}
  </div>
  <h3>Your tiles ({mine.length})</h3>
  <div class="rack" data-testid="tile-hand">
    {#each mine as tile (tile.id)}<MahjongTile
        id={tile.id}
            face={tile.face}
        {labels}
        selected={selected === tile.id}
        disabled={blocked || m.phase === "ended"}
        label={`Your tile: ${tile.face === undefined ? "Hidden" : tileName(tile.face)}${m.lastDraw === tile.id ? " (just drawn)" : ""}`}
        onPress={() => (selected = selected === tile.id ? "" : tile.id)}
      />{/each}
  </div>
  {#if m.phase === "discard" && t.players[t.turn] === self}<ScoreButton
      variant="primary"
      disabled={blocked || !discard}
      onPress={() => discard && onCommand(discard.command)}
      >{selected
        ? `Discard ${tileName(mine.find((t) => t.id === selected)?.face ?? 0)}`
        : "Select a tile to discard"}</ScoreButton
    >{#if selected && !discard}<p>
        You cannot immediately discard a tile that would exchange the group you
        just claimed.
      </p>{/if}{/if}
  {#if guided && m.winReason && m.phase !== "ended"}<p class="jc-subtle">
      {m.winReason}
    </p>{/if}
  {#if m.result}<section class="guide" aria-label="Hand result">
      <h3>
        {m.result.winner ? `${name(m.result.winner)} wins` : "Drawn hand"}
      </h3>
      <p>{m.result.description}</p>
      {#if m.result.score}<ul>
          {#each m.result.score.items as item}<li>
              {item.label}: {item.fan} faan
            </li>{/each}
        </ul>
        <p>
          Total capped at {room.rules.tileMahjong!.maxFan} faan. Payments are shown
          in Round scores.
        </p>
        <h4>Winning groups</h4>
        <div class="groups">
          {#each m.result.score.groups as group}<div class="group">
              {#each group as face}<MahjongTile {face} {labels} />{/each}
            </div>{/each}
        </div>{/if}
    </section>{/if}
  <div class="players">
    {#each t.players as id}<section class="player">
        <h3>
          {name(id)} · {WIND_NAMES[(t.players.indexOf(id) - t.dealer + 4) % 4]}
        </h3>
        <p>{m.hands[id].length} tiles in hand</p>
        {#if m.phase === "ended" && id !== self}<div class="rack">
            {#each m.hands[id] as tile}<MahjongTile
                id={tile.id}
            face={tile.face}
                {labels}
              />{/each}
          </div>{/if}
        <h4>Groups on the table</h4>
        {#if !m.groups[id].length}<p class="jc-subtle">
            No groups exposed yet.
          </p>{/if}
        <div class="groups">
          {#each m.groups[id] as group}<div>
              <p>
                {group.kind === "chow"
                  ? "Sequence"
                  : group.kind === "pung"
                    ? "Three of a kind"
                    : "Four of a kind"}{group.concealed
                  ? " · declared concealed"
                  : ""}
              </p>
              <div class="group">
                {#each group.tiles as tile}<MahjongTile
                    id={tile.id}
            face={tile.face}
                    {labels}
                  />{/each}
              </div>
            </div>{/each}
        </div>
        <h4>Discards · oldest first</h4>
        <div class="rack">
          {#each m.discards[id] as tile}<MahjongTile
              id={tile.id}
            face={tile.face}
              {labels}
            />{/each}
        </div>
        {#if !m.discards[id].length}<p class="jc-subtle">
            No unclaimed discards.
          </p>{/if}
      </section>{/each}
  </div>
  {#if guided}<details>
      <summary>Learn the tiles and your first hand</summary>
      <p>
        Build four groups and one pair. A sequence is three consecutive numbers
        in the same suit. Winds and dragons only form matching groups.
      </p>
      <div class="group">
        {#each [9, 10, 11] as face}<MahjongTile {face} />{/each}
      </div>
      <p>
        Example: 1, 2, 3 Bamboo form a sequence. A pair is two identical tiles.
      </p>
      <div class="group">
        {#each [31, 31] as face}<MahjongTile {face} />{/each}
      </div>
      <p>
        Your usual turn is draw, then discard. Claiming a discard puts a group
        on the table permanently. Only claim a sequence from the player
        immediately before you. Three or four matching tiles can be claimed from
        anyone.
      </p>
      <p>
        Shape alone is not enough: this table requires {room.rules.tileMahjong!
          .minFan} faan. Dragon groups, your seat/round wind, all triplets, or one-suit
        hands can help. The app checks your hand before offering a win.
      </p>
      <p>
        Hints use only your tiles and public information. No opponent hands or
        future draws are revealed.
      </p>
    </details>{/if}
</section>

<style>
  .board {
    padding: 16px;
    min-width: 0;
  }
  .settings,
  .rack,
  .groups,
  .group,
  .actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .rack {
    padding: 6px 3px;
    margin: 12px 0;
  }
  .group {
    gap: 3px;
  }
  .groups {
    gap: 16px;
  }
  .settings label {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
  }
  .guide,
  .claim {
    background: var(--jc-brand-soft);
    padding: 14px;
    border-radius: 12px;
    margin: 12px 0;
  }
  .actions > div {
    max-width: 340px;
  }
  .actions p {
    font-size: var(--jc-type-sm);
  }
  .players {
    display: grid;
    gap: 16px;
    margin-top: 24px;
  }
  .player {
    padding-top: 8px;
    border-top: 1px solid var(--jc-line);
    min-width: 0;
  }
  summary {
    min-height: 44px;
    cursor: pointer;
    display: list-item;
    padding: 12px 0;
  }
  h3,
  h4 {
    margin: 12px 0 8px;
  }
  @media (min-width: 750px) {
    .players {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
