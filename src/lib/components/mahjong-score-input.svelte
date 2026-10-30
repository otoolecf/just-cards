<script lang="ts">
  import {
    evaluateMahjong,
    settleMahjong,
    resultFan,
    tileName,
    WIND_NAMES,
    MAHJONG_PAYMENTS,
    type Tile,
    type TileGroup,
    type MahjongPolicy,
    type MahjongProgress,
    type MahjongResult,
    type MahjongContext,
  } from "$lib/gameplay/mahjong";
  import type { ScoreEvent } from "$lib/scorekeeper/engine";
  import MahjongTile from "./mahjong-tile.svelte";
  import ScoreButton from "./score-button.svelte";
  export let players: string[];
  export let policy: MahjongPolicy;
  export let progress: MahjongProgress | undefined = undefined;
  export let busy = false;
  export let onSubmit: (event: ScoreEvent) => Promise<void>;
  let mode = "tiles",
    winner = "",
    payer = "",
    selfDraw = true,
    fan = 3,
    liability = "",
    target = "hand";
  let concealed: Tile[] = [],
    groups: TileGroup[] = [],
    draft: Tile[] = [];
  let groupKind: "chow" | "pung" | "kong" = "pung",
    concealedKong = false,
    winningFace = 0;
  let afterKong = false,
    robbingKong = false,
    lastWall = false,
    consecutiveKongs = false,
    initial: "" | "heaven" | "earth" = "";
  let entryError = "",
    previousHands = -1;
  $: if (!players.includes(winner)) winner = players[0] ?? "";
  $: if (!players.includes(payer) || payer === winner)
    payer = players.find((id) => id !== winner) ?? "";
  $: seatWind = (players.indexOf(winner) - (progress?.dealer ?? 0) + 4) % 4;
  $: roundWind = Math.floor((progress?.rotations ?? 0) / 4);
  let context: MahjongContext;
  $: context = {
    seatWind,
    roundWind,
    selfDraw,
    winningFace,
    ...(afterKong ? { afterKong: true } : {}),
    ...(robbingKong ? { robbingKong: true } : {}),
    ...(lastWall ? { lastWall: true } : {}),
    ...(consecutiveKongs ? { consecutiveKongs: true } : {}),
    ...(initial ? { initial } : {}),
  };
  $: evaluation = evaluateMahjong(concealed, groups, context, policy);
  let result: MahjongResult;
  $: result = {
    winner,
    ...(!selfDraw ? { payer } : {}),
    ...(selfDraw && liability ? { liability } : {}),
    ...(mode === "tiles"
      ? { hand: { tiles: concealed, groups, context } }
      : { fan }),
  };
  $: preview = (() => {
    try {
      return {
        delta: settleMahjong(players, result, policy),
        fan: resultFan(result, policy),
        error: "",
      };
    } catch (e) {
      return {
        delta: undefined,
        fan: 0,
        error: e instanceof Error ? e.message : "Check the hand",
      };
    }
  })();
  $: if (previousHands !== (progress?.hands ?? 0)) {
    previousHands = progress?.hands ?? 0;
    concealed = [];
    groups = [];
    draft = [];
    entryError = "";
    afterKong = false;
    robbingKong = false;
    lastWall = false;
    consecutiveKongs = false;
    initial = "";
    liability = "";
  }
  function add(face: number) {
    const all = [...concealed, ...groups.flatMap((g) => g.tiles), ...draft];
    if (all.filter((t) => t.face === face).length >= 4) {
      entryError = "There are only four copies of that tile.";
      return;
    }
    const tile = { id: crypto.randomUUID(), face };
    if (target === "hand") {
      concealed = [...concealed, tile];
      winningFace = face;
    } else draft = [...draft, tile];
    entryError = "";
  }
  function saveGroup() {
    const g: TileGroup = {
      kind: groupKind,
      tiles: draft,
      concealed: groupKind === "kong" && concealedKong,
    };
    if (!valid(g)) {
      entryError =
        "Choose three consecutive tiles in one suit, three identical tiles, or four identical tiles.";
      return;
    }
    groups = [...groups, g];
    draft = [];
    entryError = "";
  }
  import { validTileGroup as valid } from "$lib/gameplay/mahjong";
  $: counts = Array.from(
    { length: 34 },
    (_, face) =>
      [...concealed, ...groups.flatMap((g) => g.tiles), ...draft].filter(
        (t) => t.face === face,
      ).length,
  );
</script>

<h3>Score a mahjong hand</h3>
<p>
  {WIND_NAMES[roundWind] ?? "Final"} round · Dealer: {players[
    progress?.dealer ?? 0
  ]}. Seat order follows the order you entered the players. Four wind rounds
  make a match; the dealer stays after winning.
</p>
{#if progress?.finished}<p role="status">
    Match complete. Start a new score session to play again.
  </p>{:else}
  <div class="fields">
    <label
      >Winner<select class="jc-control" bind:value={winner}
        >{#each players as p}<option value={p}>{p}</option>{/each}</select
      ></label
    >
    <label
      >How did they win?<select class="jc-control" bind:value={selfDraw}
        ><option value={true}>Drew the winning tile</option><option
          value={false}>Another player discarded it</option
        ></select
      ></label
    >
    {#if !selfDraw}<label
        >Who discarded the winning tile?<select
          class="jc-control"
          bind:value={payer}
          >{#each players.filter((p) => p !== winner) as p}<option value={p}
              >{p}</option
            >{/each}</select
        ></label
      >{:else if policy.liability}<label
        >Liability payer<select class="jc-control" bind:value={liability}
          ><option value="">None — everyone pays</option
          >{#each players.filter((p) => p !== winner) as p}<option value={p}
              >{p}</option
            >{/each}</select
        ></label
      >{/if}
    <label
      >Entry method<select class="jc-control" bind:value={mode}
        ><option value="tiles">Enter tiles — calculate faan for me</option
        ><option value="quick">Quick entry — I know the faan</option></select
      ></label
    >
  </div>
  {#if mode === "quick"}<label
      >Hand value (faan)<select class="jc-control" bind:value={fan}
        >{#each MAHJONG_PAYMENTS.map((_, i) => i).filter((n) => n >= policy.minFan) as n}<option
            value={n}>{n} faan</option
          >{/each}</select
      ></label
    >
    <p>
      Use the final value, including bonuses. Quick entry trusts your hand
      value; the app calculates payments.
    </p>
  {:else}
    <p>
      Enter the winner's remaining hand <strong
        >including the winning tile</strong
      >. Add each group already on the table separately. Tap an entered tile to
      remove it.
    </p>
    <div class="fields">
      <label
        >Add tiles to<select class="jc-control" bind:value={target}
          ><option value="hand">Concealed hand</option><option value="group"
            >A group already on the table</option
          ></select
        ></label
      >{#if target === "group"}<label
          >Group type<select class="jc-control" bind:value={groupKind}
            ><option value="chow">Sequence (chow)</option><option value="pung"
              >Three identical (pung)</option
            ><option value="kong">Four identical (kong)</option></select
          ></label
        >{#if groupKind === "kong"}<label class="check"
            ><input type="checkbox" bind:checked={concealedKong} />Declared from
            four tiles in hand</label
          >{/if}{/if}
    </div>
    {#if target === "group"}<div class="rack">
        {#each draft as tile}<MahjongTile
            face={tile.face}
            label={`Remove group tile ${tileName(tile.face)}`}
            onPress={() => (draft = draft.filter((t) => t.id !== tile.id))}
          />{/each}
      </div>
      <ScoreButton
        disabled={busy ||
          groups.length >= 4 ||
          !valid({
            kind: groupKind,
            tiles: draft,
            concealed: groupKind === "kong" && concealedKong,
          })}
        onPress={saveGroup}>Add declared group</ScoreButton
      >{/if}
    <details open>
      <summary>Tile picker</summary
      >{#each ["Dots", "Bamboo", "Characters", "Winds and dragons"] as suit, i}<h4
        >
          {suit}
        </h4>
        <div class="rack">
          {#each Array.from({ length: i === 3 ? 7 : 9 }, (_, n) => i * 9 + n) as face}<MahjongTile
              {face}
              disabled={busy ||
                counts[face] >= 4 ||
                (target === "hand"
                  ? concealed.length >= 14
                  : draft.length >= 4)}
              label={`Add ${tileName(face)}`}
              onPress={() => add(face)}
            />{/each}
        </div>{/each}
    </details>
    <h4>Concealed hand ({concealed.length})</h4>
    <div class="rack">
      {#each concealed as tile}<MahjongTile
          face={tile.face}
          label={`Remove hand tile ${tileName(tile.face)}`}
          onPress={() =>
            (concealed = concealed.filter((t) => t.id !== tile.id))}
        />{/each}
    </div>
    {#each groups as group, i}<div class="declared">
        <p>{group.kind}{group.concealed ? " · concealed" : ""}</p>
        <div class="rack">
          {#each group.tiles as tile}<MahjongTile face={tile.face} />{/each}
        </div>
        <ScoreButton onPress={() => (groups = groups.filter((_, j) => j !== i))}
          >Remove group {i + 1}</ScoreButton
        >
      </div>{/each}
    <label
      >Which tile completed the hand?<select
        class="jc-control"
        bind:value={winningFace}
        >{#each [...new Set(concealed.map((t) => t.face))].sort((a, b) => a - b) as face}<option
            value={face}>{tileName(face)}</option
          >{/each}</select
      ></label
    >
    <p>
      Winner's seat: {WIND_NAMES[seatWind]}. Round wind: {WIND_NAMES[
        roundWind
      ]}.
    </p>
    <details>
      <summary>Special winning circumstances</summary>
      <div class="checks">
        <label
          ><input type="checkbox" bind:checked={afterKong} />Won on a quad's
          replacement draw</label
        ><label
          ><input type="checkbox" bind:checked={consecutiveKongs} />That
          followed consecutive quad replacement draws</label
        ><label
          ><input type="checkbox" bind:checked={robbingKong} />Won by taking a
          tile used to extend a quad</label
        ><label
          ><input type="checkbox" bind:checked={lastWall} />Drew the final tile
          in the wall</label
        ><label
          >Initial hand win<select class="jc-control" bind:value={initial}
            ><option value="">Neither</option><option value="heaven"
              >Dealer's untouched initial hand</option
            ><option value="earth"
              >Dealer's very first discard, before any quads</option
            ></select
          ></label
        >
      </div>
    </details>
    {#if evaluation.shape}<ul>
        {#each evaluation.items as item}<li>
            {item.label}: {item.fan} faan
          </li>{/each}
      </ul>
      <p>{evaluation.fan} faan after the {policy.maxFan}-faan cap.</p>{/if}
  {/if}
  {#if entryError}<p role="alert" class="jc-status-error">{entryError}</p>{/if}
  {#if preview.delta}<div class="preview" aria-live="polite">
      <strong>{preview.fan} faan · payments</strong>{#each players as p}<p>
          {p}: {preview.delta[p] > 0 ? "+" : ""}{preview.delta[p]} points
        </p>{/each}
    </div>{:else}<p role="status">{preview.error}</p>{/if}
  <ScoreButton
    variant="primary"
    disabled={busy || !preview.delta || draft.length > 0}
    onPress={() => onSubmit({ type: "add_mahjong", players, policy, result })}
    >Save mahjong result</ScoreButton
  >
  <details>
    <summary>Nobody won?</summary>
    <p>
      Record a drawn hand when the wall ran out. No points change and the dealer
      moves to the next seat.
    </p>
    <ScoreButton
      disabled={busy}
      onPress={() =>
        onSubmit({
          type: "add_mahjong",
          players,
          policy,
          result: { draw: true },
        })}>Save drawn hand</ScoreButton
    >
  </details>
{/if}

<style>
  .fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 12px;
    margin: 16px 0;
  }
  label {
    display: grid;
    gap: 6px;
  }
  .rack {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 12px 0;
    padding: 3px;
  }
  .checks label,
  .check {
    min-height: 44px;
    align-items: center;
    display: flex;
    gap: 8px;
  }
  .checks {
    display: grid;
    gap: 8px;
  }
  .preview {
    background: var(--jc-brand-soft);
    border-radius: 12px;
    padding: 12px;
    margin: 16px 0;
  }
  .preview p {
    margin: 6px 0;
  }
  summary {
    min-height: 44px;
    padding: 12px 0;
    cursor: pointer;
  }
  .declared {
    border-bottom: 1px solid var(--jc-line);
    padding: 12px 0;
  }
</style>
