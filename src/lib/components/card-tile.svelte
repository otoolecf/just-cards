<script lang="ts">
	import type { VisibleCard } from '$lib/gameplay/table-engine';
	export let card: VisibleCard;
	export let label = '';
	export let selected = false;
	export let disabled = true;
	export let draggable = false;
	export let onDragStart: (() => void) | undefined = undefined;
	export let onDropCard: (() => void) | undefined = undefined;
	export let onPress: (() => void) | undefined = undefined;
	const suits = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' };
	$: text = card.rank ? `${card.rank}${card.suit ? suits[card.suit] : ''}` : '?';
</script>

<button
	type="button"
	data-card-id={card.id}
	class="jc-card"
	class:jc-card-back={!card.rank}
	class:jc-card-red={card.suit === 'hearts' || card.suit === 'diamonds'}
	class:jc-card-selected={selected}
	{disabled}
	{draggable}
	aria-label={label || text}
	aria-pressed={onPress ? selected : undefined}
	on:dragstart={(event) => {
		if (!draggable) return;
		event.dataTransfer?.setData('text/plain', card.id);
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
		onDragStart?.();
	}}
	on:dragover={(event) => {
		if (draggable) event.preventDefault();
	}}
	on:drop={(event) => {
		if (draggable) {
			event.preventDefault();
			onDropCard?.();
		}
	}}
	on:click={onPress}>{text}</button
>
