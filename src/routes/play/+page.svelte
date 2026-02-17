<script lang="ts">
	import { Tabs } from 'bits-ui';
	import { crossfade, fade } from 'svelte/transition';
	import {
		createGameplayRulePack,
		deriveGameState,
		type CardLocation,
		type GameEvent
	} from '$lib/gameplay/engine';
	import {
		buildDemoPlayEvents,
		buildPlaySurfaceView,
		createHandMoveEvent,
		type PlayCardView
	} from '$lib/gameplay/play-surface-model';
	import {
		DEFAULT_PLAY_SURFACE_PROFILE,
		visibleZones,
		zoneHintMap,
		zoneLabelMap
	} from '$lib/gameplay/play-surface-profiles';
	import ScoreButton from '$lib/components/score-button.svelte';

	const PLAYERS = ['You', 'Riv', 'Mina'];
	const SELF_PLAYER_ID = PLAYERS[0];
	const HAND_ZONE = 'hand';
	const ACTIVE_SURFACE_PROFILE = DEFAULT_PLAY_SURFACE_PROFILE;
	const TABLE_ZONES = visibleZones(ACTIVE_SURFACE_PROFILE);
	const TABLE_ZONE_IDS = TABLE_ZONES.map((zone) => zone.id);
	const TABLE_ZONE_LABELS = zoneLabelMap(ACTIVE_SURFACE_PROFILE);
	const TABLE_ZONE_HINTS = zoneHintMap(ACTIVE_SURFACE_PROFILE);

	const playRulePack = createGameplayRulePack({
		handZoneName: HAND_ZONE,
		zoneMovePolicy: {
			allowedPhases: ['play', 'deal', 'pregame', 'scoring', 'round_end'],
			actorMustBeCurrentPlayer: false,
			sourceMustBelongToActor: false,
			sourceZoneAllowlist: [HAND_ZONE, ...TABLE_ZONE_IDS],
			targetZoneAllowlist: [HAND_ZONE, ...TABLE_ZONE_IDS],
			minCards: 1,
			maxCards: 1
		}
	});

	const [send, receive] = crossfade({
		duration: (distance) => Math.min(360, 120 + Math.sqrt(distance * 220)),
		fallback: (node) => fade(node, { duration: 120 })
	});

	let surfaceTab = 'table';
	let playEvents: GameEvent[] = buildDemoPlayEvents(PLAYERS);
	let selectedCardKey = '';
	let feedback = '';
	let handDockHeight = 0;

	function measureHandDock(node: HTMLElement) {
		const update = () => {
			handDockHeight = Math.ceil(node.getBoundingClientRect().height);
		};
		update();
		if (typeof ResizeObserver === 'undefined') {
			return { destroy: () => undefined };
		}
		const observer = new ResizeObserver(() => update());
		observer.observe(node);
		return {
			destroy() {
				observer.disconnect();
			}
		};
	}

	$: gameplayState = deriveGameState(playEvents, playRulePack);
	$: surface = buildPlaySurfaceView(gameplayState, {
		selfPlayerId: SELF_PLAYER_ID,
		handZoneName: HAND_ZONE,
		tableZoneOrder: TABLE_ZONE_IDS,
		includeDiscoveredTableZones: false,
		zoneLabels: TABLE_ZONE_LABELS
	});
	$: selectedCard = surface.hand.cards.find((card) => card.key === selectedCardKey) ?? null;
	$: if (selectedCardKey && !surface.hand.cards.some((card) => card.key === selectedCardKey)) {
		selectedCardKey = '';
	}
	$: activeSeat = surface.seats.find((seat) => seat.isCurrentTurn);

	function addEvent(event: GameEvent): void {
		playEvents = [...playEvents, event];
	}

	function toggleCard(card: PlayCardView): void {
		selectedCardKey = selectedCardKey === card.key ? '' : card.key;
	}

	function moveSelectedCardTo(zone: string): void {
		if (!selectedCard) {
			feedback = 'Select a card from your hand first.';
			return;
		}

		const from: CardLocation = { kind: 'player', playerId: SELF_PLAYER_ID, zone: HAND_ZONE };
		const to: CardLocation = { kind: 'table', zone };
		addEvent(createHandMoveEvent({ actorId: SELF_PLAYER_ID, from, to, card: selectedCard }));
		feedback = `Moved ${selectedCard.label} to ${TABLE_ZONE_LABELS[zone] ?? zone}.`;
		selectedCardKey = '';
	}

	function drawFromTable(zone: string): void {
		const cards = gameplayState.tableZones[zone] ?? [];
		const topCard = cards[cards.length - 1];
		if (!topCard) {
			feedback = `No cards in ${TABLE_ZONE_LABELS[zone] ?? zone}.`;
			return;
		}

		addEvent({
			type: 'zone_move',
			actorId: SELF_PLAYER_ID,
			from: { kind: 'table', zone },
			to: { kind: 'player', playerId: SELF_PLAYER_ID, zone: HAND_ZONE },
			cards: [topCard]
		});
		feedback = `Drew ${topCard.rank}${topCard.suit ? topCard.suit.slice(0, 1).toUpperCase() : ''} from ${TABLE_ZONE_LABELS[zone] ?? zone}.`;
	}

	function resetDemo(): void {
		playEvents = buildDemoPlayEvents(PLAYERS);
		selectedCardKey = '';
		feedback = 'Started a fresh demo round.';
	}

	function zoneHint(zoneId: string): string {
		return TABLE_ZONE_HINTS[zoneId] ?? '';
	}

	function latestEvents(): GameEvent[] {
		return [...playEvents].slice(-6).reverse();
	}

	function eventLabel(event: GameEvent): string {
		switch (event.type) {
			case 'zone_move':
				return `${event.actorId} moved ${event.cards.length} card to ${event.to.zone}`;
			case 'deal_cards':
				return `Deal ${event.cards.length} to ${event.playerId}`;
			case 'advance_turn':
				return 'Advance turn';
			default:
				return event.type;
		}
	}
</script>

<svelte:head>
	<title>Play Table</title>
</svelte:head>

<main class="play-page" style={`--hand-dock-height: ${Math.max(handDockHeight, 160)}px;`}>
	<header class="topbar">
		<div>
			<p class="eyebrow">Just Cards</p>
			<h1>Play Table</h1>
			<p class="subtitle">Mobile-first hand + board surface from gameplay primitives.</p>
		</div>
		<nav class="jc-mode-links" aria-label="Mode links">
			<a href="/" class="jc-mode-link">Score</a>
			<a href="/play" class="jc-mode-link" aria-current="page">Play</a>
		</nav>
	</header>

	<section class="meta-strip">
		<p><strong>Phase:</strong> {surface.phase}</p>
		<p><strong>Round:</strong> {surface.roundNumber}</p>
		<p><strong>Turn:</strong> {activeSeat?.playerId ?? 'n/a'}</p>
		<p><strong>Dealer:</strong> {surface.seats.find((seat) => seat.isDealer)?.playerId ?? 'n/a'}</p>
	</section>

	<section class="seat-strip" aria-label="Players">
		{#each surface.seats as seat}
			<article class={`seat-chip ${seat.isCurrentTurn ? 'seat-chip-turn' : ''} ${seat.isSelf ? 'seat-chip-self' : ''}`.trim()}>
				<p class="seat-name">{seat.playerId}</p>
				<p class="seat-count">{seat.handCount} cards</p>
				<div class="seat-tags">
					{#if seat.isDealer}
						<span class="tag">Dealer</span>
					{/if}
					{#if seat.isCurrentTurn}
						<span class="tag tag-turn">Turn</span>
					{/if}
				</div>
			</article>
		{/each}
	</section>

	<div class="play-workspace">
		<section class="surface-panel">
			<Tabs.Root bind:value={surfaceTab} class="surface-tabs">
				<Tabs.List class="surface-tab-list">
					<Tabs.Trigger value="table" class={`surface-tab ${surfaceTab === 'table' ? 'surface-tab-active' : ''}`.trim()}>Table</Tabs.Trigger>
					<Tabs.Trigger value="actions" class={`surface-tab ${surfaceTab === 'actions' ? 'surface-tab-active' : ''}`.trim()}>Actions</Tabs.Trigger>
					<Tabs.Trigger value="log" class={`surface-tab ${surfaceTab === 'log' ? 'surface-tab-active' : ''}`.trim()}>Log</Tabs.Trigger>
				</Tabs.List>

				<Tabs.Content value="table" class="surface-content">
					<div class="zone-grid">
						{#each surface.tableZones as zone (zone.zoneId)}
							<section class="zone-panel">
								<header>
									<div>
										<h2>{zone.label}</h2>
										<p class="zone-hint">{zoneHint(zone.zoneId)}</p>
									</div>
									<p>{zone.cards.length} cards</p>
								</header>
								<div class="zone-cards" aria-label={`${zone.zoneId} cards`}>
									{#if zone.cards.length === 0}
										<p class="zone-empty">No cards</p>
									{:else}
										{#each zone.cards as card (card.key)}
											<button
												type="button"
												class={`play-card play-card-sm ${card.suitTone === 'red' ? 'play-card-red' : ''}`.trim()}
												in:receive={{ key: card.key }}
												out:send={{ key: card.key }}
											>
												{card.label}
											</button>
										{/each}
									{/if}
								</div>
								<ScoreButton className="zone-action" onPress={() => drawFromTable(zone.zoneId)}>Draw top</ScoreButton>
							</section>
						{/each}
					</div>
				</Tabs.Content>

				<Tabs.Content value="actions" class="surface-content action-panel">
					<div class="action-buttons">
						<ScoreButton onPress={() => addEvent({ type: 'advance_turn' })}>Advance turn</ScoreButton>
						<ScoreButton onPress={() => addEvent({ type: 'undo' })}>Undo</ScoreButton>
						<ScoreButton onPress={() => addEvent({ type: 'redo' })}>Redo</ScoreButton>
						<ScoreButton onPress={resetDemo}>New demo round</ScoreButton>
					</div>
				</Tabs.Content>

				<Tabs.Content value="log" class="surface-content">
					<ul class="event-log">
						{#each latestEvents() as event, index (`${event.type}-${index}`)}
							<li>{eventLabel(event)}</li>
						{/each}
					</ul>
				</Tabs.Content>
			</Tabs.Root>
		</section>

		<section class="hand-dock" aria-label="Your hand" use:measureHandDock>
			<header>
				<h2>{surface.hand.label}</h2>
				<p>{surface.hand.cards.length} cards</p>
			</header>
			<div class="hand-quick-actions">
				{#if selectedCard}
					<p class="hand-action-label">Play {selectedCard.label} to:</p>
					<div class="hand-targets">
						{#each TABLE_ZONES as zone (zone.id)}
							<ScoreButton className="hand-target-button" onPress={() => moveSelectedCardTo(zone.id)}>
								{zone.label}
							</ScoreButton>
						{/each}
					</div>
				{:else}
					<p class="hand-action-label hand-action-hint">Select a card to reveal quick play targets.</p>
				{/if}
			</div>
			<div class="hand-scroll">
				{#if surface.hand.cards.length === 0}
					<p class="zone-empty">No cards in hand.</p>
				{:else}
					{#each surface.hand.cards as card (card.key)}
						<button
							type="button"
							class={`play-card ${card.suitTone === 'red' ? 'play-card-red' : ''} ${selectedCardKey === card.key ? 'play-card-selected' : ''}`.trim()}
							aria-pressed={selectedCardKey === card.key}
							onclick={() => toggleCard(card)}
							in:receive={{ key: card.key }}
							out:send={{ key: card.key }}
						>
							{card.label}
						</button>
					{/each}
				{/if}
			</div>
			{#if feedback}
				<p class="feedback">{feedback}</p>
			{/if}
		</section>
	</div>
</main>

<style>
	:global(body) {
		background:
			radial-gradient(circle at 5% 0%, color-mix(in srgb, var(--jc-brand-soft) 62%, #ffffff) 0%, transparent 45%),
			linear-gradient(155deg, var(--jc-bg) 0%, #f7fbff 46%, color-mix(in srgb, var(--jc-brand-soft) 50%, #ffffff) 100%);
	}

	.play-page {
		--play-line: var(--jc-line);
		--play-fg: var(--jc-text);
		--play-muted: var(--jc-text-muted);
		--play-brand: var(--jc-brand);
		--play-brand-soft: var(--jc-brand-soft);
		--play-accent: var(--jc-info);
		--play-card: var(--jc-surface);
		--play-shadow: var(--jc-shadow-md);

		max-width: 860px;
		margin: 0 auto;
		padding: 18px 14px calc(var(--hand-dock-height, 160px) + 16px + env(safe-area-inset-bottom));
		display: grid;
		gap: 12px;
	}

	.play-workspace {
		display: grid;
		gap: 12px;
	}

	.topbar {
		display: grid;
		gap: 12px;
	}

	.eyebrow {
		margin: 0;
		font-size: var(--jc-type-xs);
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--play-accent);
	}

	h1 {
		margin: 0;
		font-size: var(--jc-type-xl);
		line-height: 0.95;
		letter-spacing: -0.02em;
	}

	.subtitle {
		margin: 6px 0 0;
		color: var(--play-muted);
		max-width: 50ch;
		font-size: var(--jc-type-lg);
		line-height: 1.22;
	}

	.meta-strip {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
		padding: 10px;
		border-radius: 14px;
		border: 1px solid var(--play-line);
		background: rgba(255, 255, 255, 0.72);
		backdrop-filter: blur(8px);
	}

	.meta-strip p {
		margin: 0;
		font-size: var(--jc-type-sm);
	}

	.seat-strip {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		padding-bottom: 2px;
		scroll-snap-type: x proximity;
	}

	.seat-chip {
		min-width: 116px;
		padding: 10px;
		border-radius: 12px;
		border: 1px solid var(--play-line);
		background: #ffffff;
		display: grid;
		gap: 5px;
		scroll-snap-align: start;
		transition: box-shadow var(--jc-motion-fast) var(--jc-ease-standard), border-color var(--jc-motion-fast) var(--jc-ease-standard);
	}

	.seat-chip-self {
		border-color: color-mix(in srgb, var(--play-brand) 45%, var(--play-line));
	}

	.seat-chip-turn {
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--play-brand) 22%, transparent);
	}

	.seat-name {
		margin: 0;
		font-weight: 700;
		font-size: var(--jc-type-md);
	}

	.seat-count {
		margin: 0;
		font-size: var(--jc-type-xs);
		color: var(--play-muted);
	}

	.seat-tags {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}

	.tag {
		padding: 2px 8px;
		border-radius: 999px;
		font-size: var(--jc-type-xs);
		font-weight: 700;
		background: #eef2ff;
	}

	.tag-turn {
		background: var(--play-brand-soft);
	}

	.surface-panel {
		border: 1px solid var(--play-line);
		border-radius: 16px;
		padding: 10px;
		background: rgba(255, 255, 255, 0.82);
		box-shadow: var(--play-shadow);
	}

	:global(.surface-tab-list) {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
	}

	:global(.surface-tab) {
		min-height: 42px;
		border-radius: 10px;
		border: 1px solid var(--play-line);
		background: #f6f9ff;
		font: inherit;
		font-size: var(--jc-type-sm);
		transition: background-color var(--jc-motion-fast) var(--jc-ease-standard), border-color var(--jc-motion-fast) var(--jc-ease-standard);
	}

	:global(.surface-tab-active) {
		background: var(--play-brand-soft);
		border-color: var(--play-brand);
		font-weight: 700;
	}

	:global(.surface-content) {
		margin-top: 10px;
	}

	.zone-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 10px;
	}

	.zone-panel {
		border: 1px solid var(--play-line);
		border-radius: 12px;
		padding: 10px;
		background: #ffffff;
		display: grid;
		gap: 11px;
	}

	.zone-panel header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 8px;
	}

	.zone-panel h2 {
		margin: 0;
		font-size: var(--jc-type-md);
		letter-spacing: -0.01em;
	}

	.zone-hint {
		margin: 2px 0 0;
		font-size: var(--jc-type-xs);
		color: var(--play-muted);
	}

	.zone-panel header p {
		margin: 0;
		font-size: var(--jc-type-xs);
		color: var(--play-muted);
	}

	.zone-cards {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		min-height: 46px;
	}

	.zone-empty {
		margin: 0;
		font-size: var(--jc-type-sm);
		color: var(--play-muted);
	}

	:global(.zone-action) {
		min-height: 38px;
		font-size: var(--jc-type-sm);
	}

	.action-panel {
		display: grid;
		gap: 10px;
	}

	.action-buttons {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}

	.event-log {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 8px;
	}

	.event-log li {
		padding: 10px;
		border: 1px solid var(--play-line);
		border-radius: 10px;
		background: #ffffff;
		font-size: var(--jc-type-sm);
	}

	.hand-dock {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		padding: 10px 12px calc(12px + env(safe-area-inset-bottom));
		background: #f8fbff;
		backdrop-filter: blur(16px);
		border-top: 1px solid var(--play-line);
		box-shadow: 0 -8px 24px rgba(15, 23, 42, 0.08);
		display: grid;
		gap: 10px;
		z-index: 20;
	}

	.hand-dock header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 8px;
	}

	.hand-dock h2 {
		margin: 0;
		font-size: var(--jc-type-lg);
		letter-spacing: -0.01em;
	}

	.hand-dock header p {
		margin: 0;
		font-size: var(--jc-type-xs);
		color: var(--play-muted);
	}

	.hand-scroll {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		padding-bottom: 2px;
	}

	.hand-quick-actions {
		display: grid;
		gap: 8px;
	}

	.hand-action-label {
		margin: 0;
		font-size: var(--jc-type-sm);
		font-weight: 700;
		color: var(--play-accent);
	}

	.hand-action-hint {
		font-weight: 500;
		color: var(--play-muted);
	}

	.hand-targets {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		padding-bottom: 2px;
	}

	:global(.hand-target-button) {
		min-height: 36px;
		font-size: var(--jc-type-xs);
		padding: 8px 10px;
		white-space: nowrap;
	}

	.play-card {
		min-width: 56px;
		min-height: 78px;
		padding: 8px;
		border-radius: 12px;
		border: 1px solid color-mix(in srgb, var(--play-line) 70%, #ffffff);
		background: var(--play-card);
		font: inherit;
		font-weight: 800;
		font-size: var(--jc-type-md);
		line-height: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 7px 18px rgba(15, 23, 42, 0.08);
		transition:
			transform var(--jc-motion-fast) var(--jc-ease-emphasized),
			border-color var(--jc-motion-fast) var(--jc-ease-standard),
			box-shadow var(--jc-motion-normal) var(--jc-ease-standard);
	}

	.play-card-sm {
		min-width: 48px;
		min-height: 64px;
		font-size: var(--jc-type-sm);
		box-shadow: 0 5px 12px rgba(15, 23, 42, 0.06);
	}

	.play-card-red {
		color: #b91c1c;
	}

	.play-card-selected {
		transform: translateY(-8px);
		border-color: var(--play-brand);
		box-shadow: 0 12px 24px rgba(15, 118, 110, 0.24);
	}

	.feedback {
		margin: 0;
		font-size: var(--jc-type-sm);
		color: var(--play-accent);
	}

	@media (min-width: 760px) {
		.zone-grid {
			grid-template-columns: 1fr 1fr;
		}

		.action-buttons {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}

		.jc-mode-links {
			justify-self: end;
		}

		.topbar {
			grid-template-columns: 1fr auto;
			align-items: end;
		}
	}

	@media (min-width: 980px) {
		.play-page {
			max-width: 1160px;
			padding-bottom: 24px;
		}

		.play-workspace {
			grid-template-columns: minmax(0, 1fr) 360px;
			align-items: start;
		}

		.hand-dock {
			position: sticky;
			top: 14px;
			left: auto;
			right: auto;
			bottom: auto;
			padding: 12px;
			border: 1px solid var(--play-line);
			border-radius: 16px;
			background: rgba(255, 255, 255, 0.88);
			backdrop-filter: blur(10px);
			box-shadow: var(--play-shadow);
			max-height: calc(100vh - 28px);
			overflow-y: auto;
		}

		.hand-targets,
		.hand-scroll {
			flex-wrap: wrap;
			overflow-x: visible;
		}
	}
</style>
