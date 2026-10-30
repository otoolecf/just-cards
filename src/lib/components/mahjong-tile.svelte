<script lang="ts">
  import { tileName } from "$lib/gameplay/mahjong";
  export let id = "";
  export let face: number | undefined = undefined;
  export let selected = false;
  export let disabled = false;
  export let labels = true;
  export let label = "";
  export let onPress: (() => void) | undefined = undefined;
  $: name = face === undefined ? "Hidden tile" : tileName(face);
  $: n = face === undefined ? 0 : (face % 9) + 1;
  $: suit = face === undefined ? -1 : Math.floor(face / 9);
  const numerals = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const honors = ["東", "南", "西", "北", "中", "發", "白"];
  const points = (count: number) =>
    Array.from({ length: count }, (_, i) => {
      const cols = count <= 3 ? 1 : count <= 6 ? 2 : 3;
      const rows = Math.ceil(count / cols);
      return {
        x: 30 + ((i % cols) - (cols - 1) / 2) * 16,
        y: 32 + (Math.floor(i / cols) - (rows - 1) / 2) * 17,
      };
    });
</script>

{#snippet artwork()}
  <svg viewBox="0 0 60 66" aria-hidden="true">
    {#if face === undefined}<rect
        x="9"
        y="7"
        width="42"
        height="52"
        rx="5"
        fill="var(--jc-brand)"
      /><path
        d="M16 15L44 51M44 15L16 51M16 33H44"
        stroke="var(--jc-text-on-brand)"
        fill="none"
      />
    {:else if suit === 0}{#each points(n) as p, i}<circle
          cx={p.x}
          cy={p.y}
          r={n === 1 ? 17 : 6}
          fill="none"
          stroke={i % 3 === 0
            ? "var(--jc-error)"
            : i % 3 === 1
              ? "var(--jc-brand)"
              : "var(--jc-text)"}
          stroke-width="3"
        /><circle cx={p.x} cy={p.y} r="2" fill="var(--jc-text)" />{/each}
    {:else if suit === 1}{#each points(n) as p}<path
          d={`M${p.x} ${p.y - 6}v12m-4-9h8m-8 6h8`}
          stroke="var(--jc-brand)"
          stroke-width="3"
          stroke-linecap="round"
        />{/each}
    {:else if suit === 2}<text
        x="30"
        y="28"
        text-anchor="middle"
        font-size="26"
        fill="var(--jc-text)">{numerals[n - 1]}</text
      ><text
        x="30"
        y="57"
        text-anchor="middle"
        font-size="28"
        fill="var(--jc-error)">萬</text
      >
    {:else if face === 33}<rect
        x="13"
        y="10"
        width="34"
        height="45"
        rx="2"
        fill="none"
        stroke="var(--jc-text)"
        stroke-width="3"
      /><rect
        x="18"
        y="15"
        width="24"
        height="35"
        fill="none"
        stroke="var(--jc-brand)"
      />
    {:else}<text
        x="30"
        y="47"
        text-anchor="middle"
        font-size="40"
        fill={face === 31
          ? "var(--jc-error)"
          : face === 32
            ? "var(--jc-brand)"
            : "var(--jc-text)"}>{honors[face - 27]}</text
      >{/if}
  </svg>
  {#if labels}<span class="tile-label">{name}</span>{/if}
{/snippet}
{#if onPress}<button
    type="button"
    class="tile"
    data-tile-id={id}
    class:selected
    {disabled}
    aria-label={label || name}
    aria-pressed={selected}
    onclick={onPress}>{@render artwork()}</button
  >
{:else}<span class="tile" class:selected role="img" aria-label={label || name}
    >{@render artwork()}</span
  >{/if}

<style>
  .tile {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    vertical-align: top;
    width: 54px;
    min-width: 52px;
    min-height: 82px;
    padding: 3px;
    box-sizing: border-box;
    border: 1px solid var(--jc-line);
    border-bottom: 5px solid var(--jc-brand);
    border-radius: 8px;
    background: var(--jc-surface);
    color: var(--jc-text);
    flex-shrink: 0;
    font: inherit;
  }
  svg {
    width: 48px;
    height: 58px;
  }
  .tile-label {
    font-size: 10px;
    line-height: 1.2;
    text-align: center;
    max-width: 56px;
    min-height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .selected {
    outline: 3px solid var(--jc-brand);
    background: var(--jc-brand-soft);
  }
  button {
    cursor: pointer;
  }
  button:focus-visible {
    outline: 3px solid var(--jc-text);
    outline-offset: 2px;
  }
  button:disabled {
    opacity: 0.65;
    cursor: default;
  }
</style>
