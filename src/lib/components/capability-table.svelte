<script lang="ts">
	import type { RoomView } from '$lib/server/room-service';
	import type { TableCommand, VisibleCard } from '$lib/gameplay/table-engine';
	import type { PileRef } from '$lib/gameplay/additional-table';
	import { canShed } from '$lib/gameplay/additional-table';
	import type { Strain } from '$lib/gameplay/contract-scoring';
	import { sortHand } from '$lib/gameplay/table-presentation';
	import CardTile from './card-tile.svelte';
	import ScoreButton from './score-button.svelte';
	export let room: RoomView;
	export let busy = false;
	export let onCommand: (c: TableCommand) => void | Promise<void>;
	let seenRevision = -1;
	let selected: string[] = [];
	let source: { from: PileRef; cardId: string } | null = null;
	let level = 1;
	let strain: Strain = 'clubs';
	let order: 'rank' | 'suit' = room.rules.contract ? 'suit' : 'rank';
	$: table = room.table!;
	$: self = room.selfId ?? '';
	$: ended = ['round_end', 'game_end'].includes(table.stage);
	$: blocked =
		busy ||
		room.paused ||
		ended ||
		!self ||
		room.seats.find((s) => s.id === self)?.away === true;
	$: myTurn = table.players[table.turn] === self;
	$: p = table.patience;
	$: sh = table.shedding;
	$: bridge = table.contract;
	$: higherBid =
		!bridge?.bid ||
		level > bridge.bid.level ||
		(level === bridge.bid.level &&
			Object.keys(suits).indexOf(strain) >
				Object.keys(suits).indexOf(bridge.bid.strain));
	$: active = table.hands[self]?.length
		? table.hands[self]
		: (sh?.up[self] ?? []);
	$: selectedCards = active.filter((c) => selected.includes(c.id));
	$: legal = Boolean(
		sh &&
			room.rules.shedding &&
			selectedCards.length &&
			selectedCards.every((c) => c.rank === selectedCards[0].rank) &&
			canShed(
				selectedCards[0] as { rank: NonNullable<VisibleCard['rank']> },
				table.discard.at(-1),
				room.rules.shedding,
			),
	);
	$: canPickup = Boolean(
		sh &&
			active.length &&
			room.rules.shedding &&
			active.every(
				(c) =>
					!canShed(
						c as { rank: NonNullable<VisibleCard['rank']> },
						table.discard.at(-1),
						room.rules.shedding!,
					),
			),
	);
	$: if (room.revision !== seenRevision) {
		seenRevision = room.revision;
		selected = [];
		source = null;
	}
	const name = (id: string) => room.seats.find((s) => s.id === id)?.name ?? id;
	const toggle = (id: string) =>
		(selected = selected.includes(id)
			? selected.filter((v) => v !== id)
			: [...selected, id]);
	async function move(to: PileRef) {
		if (source) await onCommand({ type: 'patience_move', ...source, to });
	}
	const choose = (from: PileRef, cardId: string) =>
		(source = source?.cardId === cardId ? null : { from, cardId });
	const suits = {
		clubs: '♣',
		diamonds: '♦',
		hearts: '♥',
		spades: '♠',
		notrump: 'NT',
	};
</script>

{#if p}
	<section class="jc-panel cap-panel" aria-label="Solitaire table">
		<h2>Solitaire</h2>
		<p>
			Select a face-up card or sequence, then a destination. Build down in
			alternating colors; empty columns need a King.
		</p>
		<div class="cap-row">
			<ScoreButton
				disabled={blocked || (!table.stockCount && !table.discard.length)}
				onPress={() => onCommand({ type: 'patience_draw' })}
				>{table.stockCount
					? `Draw one (${table.stockCount})`
					: 'Recycle waste'}</ScoreButton
			>
			<div>
				<h3>Waste ({table.discard.length})</h3>
				{#each table.discard.slice(-1) as card (card.id)}<CardTile
						{card}
						disabled={blocked}
						selected={source?.cardId === card.id}
						onPress={() => choose({ zone: 'waste', index: 0 }, card.id)}
					/>{:else}<p>Empty</p>{/each}
			</div>
		</div>
		<h3>
			Foundations · {p.foundations.reduce((n, pile) => n + pile.length, 0)} / 52
		</h3>
		<div class="cap-row foundations">
			{#each p.foundations as pile, i}<div class="cap-pile">
					{#if pile.at(-1)}<CardTile
							card={pile.at(-1)!}
							disabled={blocked}
							selected={source?.cardId === pile.at(-1)!.id}
							onPress={() =>
								choose({ zone: 'foundation', index: i }, pile.at(-1)!.id)}
						/>{/if}
					<ScoreButton
						disabled={blocked || !source}
						onPress={() => move({ zone: 'foundation', index: i })}
						>Foundation {i + 1}{pile.length
							? ` (${pile.length})`
							: ' · Ace'}</ScoreButton
					>
				</div>{/each}
		</div>
		<p class="jc-subtle scroll-hint">
			Scroll the columns sideways to see all seven.
		</p>
		<div class="tableau" aria-label="Tableau columns">
			{#each p.tableau as pile, i}<section class="column">
					<h3>{i + 1}</h3>
					{#each pile as card, j}<div class:overlap={j < pile.length - 1}>
							<CardTile
								{card}
								label={card.rank
									? `Column ${i + 1}: ${card.rank} ${card.suit}`
									: `Column ${i + 1}: hidden card`}
								disabled={blocked || !card.rank}
								selected={source?.cardId === card.id}
								onPress={() => choose({ zone: 'tableau', index: i }, card.id)}
							/>
						</div>{/each}
					<ScoreButton
						disabled={blocked || !source}
						onPress={() => move({ zone: 'tableau', index: i })}
						>To {i + 1}</ScoreButton
					>
				</section>{/each}
		</div>
		{#if source}<p role="status">
				Card selected. Choose a foundation or “To” column. Tap the selected card
				to cancel.
			</p>{/if}
		<details>
			<summary>Stuck?</summary>
			<p>
				Use Undo in Table controls to reverse a move. If no moves remain,
				concede this deal and play again.
			</p>
			<ScoreButton
				disabled={blocked}
				onPress={() => onCommand({ type: 'patience_concede' })}
				>Concede deal</ScoreButton
			>
		</details>
	</section>
{:else if sh}
	<section class="jc-panel cap-panel" aria-label="Palace table">
		<h2>Palace</h2>
		<p role="status">{sh.message}</p>
		<p>Stock: {table.stockCount} · Cleared cards: {sh.burned.length}</p>
		<h3>Play pile ({table.discard.length})</h3>
		<div class="cap-row">
			{#each table.discard.slice(-4) as card}<CardTile {card} />{:else}<p>
					{table.stage === 'setup'
						? 'The starting card appears when everyone is ready.'
						: 'Empty — play any card.'}
				</p>{/each}
		</div>
		{#if table.stage === 'setup'}
			<h3>Your hand — select three face-up cards</h3>
			<div class="cap-row">
				{#each sortHand(table.hands[self] ?? [], order) as card}<CardTile
						{card}
						disabled={blocked || sh.ready.includes(self)}
						selected={selected.includes(card.id)}
						onPress={() => toggle(card.id)}
					/>{/each}
			</div>
			<ScoreButton
				disabled={blocked || selected.length !== 3 || sh.ready.includes(self)}
				onPress={() => onCommand({ type: 'shedding_setup', cardIds: selected })}
				>{sh.ready.includes(self)
					? 'Ready — waiting for others'
					: 'Place three face up'}</ScoreButton
			>
		{:else}
			<h3>
				Your {table.hands[self]?.length
					? 'hand'
					: sh.up[self]?.length
						? 'face-up cards'
						: 'blind cards'}
			</h3>
			<label
				>Sort cards <select class="jc-control" bind:value={order}
					><option value="rank">By rank</option><option value="suit"
						>By suit</option
					></select
				></label
			>
			<div class="cap-row">
				{#each sortHand(active, order) as card}<CardTile
						{card}
						disabled={blocked || !myTurn}
						selected={selected.includes(card.id)}
						onPress={() => toggle(card.id)}
					/>{/each}
			</div>
			{#if !active.length}<div class="cap-row">
					{#each sh.down[self] ?? [] as card, i}<CardTile
							{card}
							label={`Reveal blind card ${i + 1}`}
							disabled={blocked || !myTurn}
							onPress={() => onCommand({ type: 'shedding_blind', slot: i })}
						/>{/each}
				</div>
			{:else}<div class="cap-row">
					<ScoreButton
						variant="primary"
						disabled={blocked || !myTurn || !legal}
						onPress={() =>
							onCommand({ type: 'shedding_play', cardIds: selected })}
						>Play selected ({selected.length})</ScoreButton
					><ScoreButton
						disabled={blocked || !myTurn || !canPickup}
						onPress={() => onCommand({ type: 'shedding_pickup' })}
						>Pick up pile</ScoreButton
					>
				</div>{/if}
			<p class="jc-subtle">
				Select one or more of the same rank. Pickup is available only when none
				of your active cards can be played. Blind cards must be tried one at a
				time.
			</p>
		{/if}
		{#each table.players as id}<section class="cap-seat">
				<h3>{name(id)} {id === table.players[table.turn] ? '· turn' : ''}</h3>
				<p>{table.hands[id].length} in hand · {sh.down[id].length} blind</p>
				<div class="cap-row">
					{#each sh.up[id] as card}<CardTile {card} />{:else}<span
							>No face-up cards</span
						>{/each}
				</div>
			</section>{/each}
	</section>
{:else if bridge}
	<section class="jc-panel cap-panel" aria-label="Bridge table">
		<h2>Rubber Bridge</h2>
		<p>
			Partners: {name(table.players[0])} &amp; {name(table.players[2])} · {name(
				table.players[1],
			)} &amp; {name(table.players[3])}
		</p>
		<div class="cap-row">
			{#each [0, 1] as team}<div class="jc-panel cap-team">
					<h3>{team === 0 ? 'Seats 1 & 3' : 'Seats 2 & 4'}</h3>
					<p>
						{bridge.rubber.totals[team]} points · {bridge.rubber.games[team]} games
						· {bridge.rubber.below[team]} below line
					</p>
					<p>
						{bridge.rubber.games[team] ? 'Vulnerable' : 'Not vulnerable'} · {bridge
							.tricks[team]} tricks this deal
					</p>
				</div>{/each}
		</div>
		{#if bridge.phase === 'auction'}
			<h3>Auction · {name(table.players[table.turn])} to call</h3>
			{#if bridge.bid}<p>
					<strong
						>Current bid: {bridge.bid.level}{suits[bridge.bid.strain]}{bridge
							.bid.doubling === 2
							? ' doubled'
							: bridge.bid.doubling === 4
								? ' redoubled'
								: ''}</strong
					>
					by {name(bridge.bid.player)}
				</p>{/if}
			<p>Bid for level + 6 tricks. Strains rise ♣ ♦ ♥ ♠ NT.</p>
			<div class="cap-row">
				<label
					>Level <select class="jc-control" bind:value={level}
						>{#each [1, 2, 3, 4, 5, 6, 7] as n}<option value={n}>{n}</option
							>{/each}</select
					></label
				><label
					>Strain <select class="jc-control" bind:value={strain}
						>{#each Object.entries(suits) as [key, label]}<option value={key}
								>{label}</option
							>{/each}</select
					></label
				>
			</div>
			<div class="cap-row">
				<ScoreButton
					disabled={blocked || !myTurn || !higherBid}
					onPress={() =>
						onCommand({ type: 'contract_call', call: 'bid', level, strain })}
					>Bid {level}{suits[strain]}</ScoreButton
				><ScoreButton
					disabled={blocked || !myTurn}
					onPress={() => onCommand({ type: 'contract_call', call: 'pass' })}
					>Pass</ScoreButton
				>
				<ScoreButton
					disabled={blocked ||
						!myTurn ||
						!bridge.bid ||
						bridge.bid.doubling !== 1 ||
						table.players.indexOf(bridge.bid.player) % 2 ===
							table.players.indexOf(self) % 2}
					onPress={() => onCommand({ type: 'contract_call', call: 'double' })}
					>Double</ScoreButton
				><ScoreButton
					disabled={blocked ||
						!myTurn ||
						!bridge.bid ||
						bridge.bid.doubling !== 2 ||
						table.players.indexOf(bridge.bid.player) % 2 !==
							table.players.indexOf(self) % 2}
					onPress={() => onCommand({ type: 'contract_call', call: 'redouble' })}
					>Redouble</ScoreButton
				>
			</div>
		{:else if bridge.bid}
			<h3>
				{bridge.bid.level}{suits[bridge.bid.strain]}{bridge.bid.doubling === 2
					? ' X'
					: bridge.bid.doubling === 4
						? ' XX'
						: ''} · Declarer: {name(bridge.declarer!)}
			</h3>
			<p>
				{bridge.result ??
					`${name(table.players[table.turn])} to play${table.players[table.turn] === bridge.dummy ? ' (declarer controls dummy)' : ''}. Follow suit when possible.`}
			</p>
		{/if}
		{#if bridge.trick.length || bridge.lastTrick.length}<h3>
				{bridge.trick.length ? 'Current trick' : 'Previous trick'}
			</h3>
			<div class="cap-row">
				{#each bridge.trick.length ? bridge.trick : bridge.lastTrick as play}<div
					>
						<p>{name(play.player)}</p>
						<CardTile card={play.card} />
					</div>{/each}
			</div>{/if}
		<label
			>Sort hand <select class="jc-control" bind:value={order}
				><option value="suit">By suit</option><option value="rank"
					>By rank</option
				></select
			></label
		>
		{#each table.players as id}
			{@const control =
				table.players[table.turn] === id &&
				(id === bridge.dummy ? self === bridge.declarer : self === id)}
			{@const hand = table.hands[id]}
			<section class="cap-seat">
				<h3>
					{name(id)}
					{id === self ? '(you)' : ''}
					{id === bridge.dummy ? '· dummy' : ''} · {hand.length} cards
				</h3>
				{#if id === self || (id === bridge.dummy && bridge.dummyVisible) || ended}<div
						class="cap-row"
					>
						{#each sortHand(hand, order) as card}<CardTile
								{card}
								disabled={blocked ||
									bridge.phase !== 'tricks' ||
									!control ||
									Boolean(
										bridge.trick[0] &&
											card.suit !== bridge.trick[0].card.suit &&
											hand.some((c) => c.suit === bridge.trick[0].card.suit),
									)}
								onPress={() =>
									onCommand({ type: 'trick_play', cardId: card.id })}
							/>{/each}
					</div>{:else}<p>Private hand</p>{/if}
			</section>
		{/each}
		<details>
			<summary>Auction history</summary>
			<ol>
				{#each bridge.calls as call}<li>
						{name(call.player)}: {call.call === 'bid'
							? `${call.level}${suits[call.strain!]}`
							: call.call}
					</li>{/each}
			</ol>
		</details>
	</section>
{/if}

<style>
	.foundations {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		align-items: end;
	}
	.foundations .cap-pile {
		min-width: 0;
	}
	.foundations :global(.score-button) {
		padding-inline: 8px;
	}
	.cap-team {
		padding: 12px;
		flex: 1 1 220px;
	}
	@media (min-width: 700px) {
		.foundations {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
		.scroll-hint {
			display: none;
		}
	}
	.cap-panel {
		margin-block: 16px;
		padding: 16px;
	}
	.cap-row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: flex-start;
		margin-block: 12px;
	}
	.cap-pile {
		display: grid;
		gap: 8px;
	}
	.tableau {
		display: grid;
		grid-template-columns: repeat(7, minmax(52px, 1fr));
		gap: 8px;
		overflow-x: auto;
		padding-block: 12px;
	}
	.column {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
	}
	.column h3 {
		margin-block: 4px;
	}
	.overlap {
		margin-bottom: -22px;
	}
	.column :global(.score-button) {
		padding-inline: 6px;
		min-width: 44px;
	}
	.cap-seat {
		border-top: 1px solid var(--jc-line);
		padding-block: 12px;
	}
	select {
		min-height: 44px;
	}
	details {
		margin-block: 16px;
	}
</style>
