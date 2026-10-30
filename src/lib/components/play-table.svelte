<script lang="ts">
	import { Tabs } from 'bits-ui';
	import GuidedModeToggle from './guided-mode-toggle.svelte';
	let guided = false;
	import { crossfade, fade } from 'svelte/transition';
	import {
		createGameplayRulePack,
		deriveGameState,
		type CardLocation,
		type GameEvent,
		type GameplayRulePack
	} from '$lib/gameplay/engine';
	import {
		buildDemoPlayEvents,
		buildRulesetPlayEvents,
		buildPlaySurfaceView,
		setCardFaceDown,
		createHandMoveEvent,
		type PlayCardView
	} from '$lib/gameplay/play-surface-model';
	import {
		drawPickModeByZoneFromUiProfile,
		drawVisibilityModeByZoneFromUiProfile,
		drawTopAllowedZoneIdsFromUiProfile,
		playSurfaceActionLabelsFromUiProfile,
		playSurfaceProfileFromUiProfile,
		quickPlayZoneIdsFromUiProfile,
		seatCardsProfileFromUiProfile,
		visibleZones,
		zoneHintMap,
		zoneLabelMap
	} from '$lib/gameplay/play-surface-profiles';
	import type { RuntimeRulesetBundle } from '$lib/rulesets/types';
	import { buildRulesetGuideModel } from '$lib/rulesets/guide-model';
	import { generateUiProfileFromRuntime, type UiPrimaryAction } from '$lib/ui/ui-profile';
	import ScoreButton from '$lib/components/score-button.svelte';
	import { cardLabelForAction } from '$lib/components/play-table-copy';

	export let rulesetBundle: RuntimeRulesetBundle | undefined = undefined;
	export let rulesetName: string | undefined = undefined;

	const PLAYERS = ['You', 'Riv', 'Mina'];
	const SELF_PLAYER_ID = PLAYERS[0];
	const DEFAULT_TABLE_ZONE_IDS = ['board', 'discard', 'meld', 'pot', 'house'];

	function defaultGameplayRulePack(): GameplayRulePack {
		return createGameplayRulePack({
			handZoneName: 'hand',
			zoneMovePolicy: {
				allowedPhases: ['play', 'deal', 'pregame', 'scoring', 'round_end'],
				actorMustBeCurrentPlayer: false,
				sourceMustBelongToActor: false,
				sourceZoneAllowlist: ['hand', ...DEFAULT_TABLE_ZONE_IDS],
				targetZoneAllowlist: ['hand', ...DEFAULT_TABLE_ZONE_IDS],
				minCards: 1,
				maxCards: 1
			}
		});
	}

	const FALLBACK_GAMEPLAY_RULE_PACK = defaultGameplayRulePack();
	const ACTIVE_GAMEPLAY_RULE_PACK = rulesetBundle?.runtimeRulePack.gameplayRulePack ?? FALLBACK_GAMEPLAY_RULE_PACK;
	const ACTIVE_UI_PROFILE =
		rulesetBundle?.uiProfile ??
		generateUiProfileFromRuntime({ gameplayRulePack: ACTIVE_GAMEPLAY_RULE_PACK });
	const ACTIVE_RUNTIME_BUNDLE: RuntimeRulesetBundle = rulesetBundle ?? {
		bundleVersion: 'runtime-bundle/v1',
		gameId: 'demo-open-table',
		displayName: 'Demo Open Table',
		runtimeRulePack: {
			gameplayRulePack: ACTIVE_GAMEPLAY_RULE_PACK
		},
		uiProfile: ACTIVE_UI_PROFILE
	};
	const ACTIVE_SURFACE_PROFILE = playSurfaceProfileFromUiProfile(ACTIVE_UI_PROFILE);
	const GUIDE_MODEL = buildRulesetGuideModel(ACTIVE_RUNTIME_BUNDLE);
	const TABLE_ZONES = visibleZones(ACTIVE_SURFACE_PROFILE);
	const TABLE_ZONE_IDS = TABLE_ZONES.map((zone) => zone.id);
	const TABLE_ZONE_LABELS = zoneLabelMap(ACTIVE_SURFACE_PROFILE);
	const TABLE_ZONE_HINTS = zoneHintMap(ACTIVE_SURFACE_PROFILE);
	const HAND_QUICK_TARGET_ZONE_IDS = quickPlayZoneIdsFromUiProfile(ACTIVE_UI_PROFILE);
	const HAND_QUICK_TARGETS = HAND_QUICK_TARGET_ZONE_IDS
		.map((zoneId) => TABLE_ZONES.find((zone) => zone.id === zoneId))
		.filter((zone): zone is (typeof TABLE_ZONES)[number] => zone !== undefined);
	const DRAW_TOP_ALLOWED_ZONE_IDS = drawTopAllowedZoneIdsFromUiProfile(ACTIVE_UI_PROFILE);
	const DRAW_PICK_MODES = drawPickModeByZoneFromUiProfile(ACTIVE_UI_PROFILE);
	const DRAW_VISIBILITY_MODES = drawVisibilityModeByZoneFromUiProfile(ACTIVE_UI_PROFILE);
	const HAND_CARD_VISIBILITY = ACTIVE_UI_PROFILE.hand.cardVisibility ?? 'owner_only';
	const TABLE_CARD_VISIBILITY_BY_ZONE = Object.fromEntries(
		ACTIVE_UI_PROFILE.table.zones.map((zone) => [zone.id, zone.cardVisibility ?? 'public'])
	);
	const ACTION_LABELS = playSurfaceActionLabelsFromUiProfile(ACTIVE_UI_PROFILE);
	const SEAT_CARDS_PROFILE = seatCardsProfileFromUiProfile(ACTIVE_UI_PROFILE);
	const HAND_ZONE = ACTIVE_GAMEPLAY_RULE_PACK.handZoneName;
	const TURN_ACTION_POLICY = ACTIVE_GAMEPLAY_RULE_PACK.turnActionPolicy;

	function preferredPlayPhase(rulePack: GameplayRulePack): string {
		if (rulePack.zoneMovePolicy.allowedPhases.includes('play')) {
			return 'play';
		}
		if (rulePack.zoneMovePolicy.allowedPhases.length > 0) {
			return rulePack.zoneMovePolicy.allowedPhases[0];
		}
		if (rulePack.phases.includes(rulePack.phaseAfterRoundStart)) {
			return rulePack.phaseAfterRoundStart;
		}
		return rulePack.startingPhase;
	}

	const [send, receive] = crossfade({
		duration: (distance) => Math.min(360, 120 + Math.sqrt(distance * 220)),
		fallback: (node) => fade(node, { duration: 120 })
	});

	let surfaceTab = 'table';
	let playEvents: GameEvent[] = rulesetBundle
		? buildRulesetPlayEvents(PLAYERS, ACTIVE_RUNTIME_BUNDLE)
		: buildDemoPlayEvents(PLAYERS, {
				handZoneName: HAND_ZONE,
				initialPhase: preferredPlayPhase(ACTIVE_GAMEPLAY_RULE_PACK),
				tableZones: TABLE_ZONE_IDS
			});
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

	$: gameplayState = deriveGameState(playEvents, ACTIVE_GAMEPLAY_RULE_PACK);
	$: surface = buildPlaySurfaceView(gameplayState, {
		selfPlayerId: SELF_PLAYER_ID,
		handZoneName: HAND_ZONE,
		tableZoneOrder: TABLE_ZONE_IDS,
		includeDiscoveredTableZones: false,
		zoneLabels: TABLE_ZONE_LABELS,
		handCardVisibility: HAND_CARD_VISIBILITY,
		tableCardVisibilityByZone: TABLE_CARD_VISIBILITY_BY_ZONE,
		handLayout: ACTIVE_UI_PROFILE.hand.layout,
		...(SEAT_CARDS_PROFILE
			? {
					seatPublicCards: {
						zoneId: SEAT_CARDS_PROFILE.zoneId,
						label: SEAT_CARDS_PROFILE.label,
						includeSelf: SEAT_CARDS_PROFILE.includeSelf,
						cardVisibility: SEAT_CARDS_PROFILE.cardVisibility ?? 'public',
						...(SEAT_CARDS_PROFILE.layout ? { layout: SEAT_CARDS_PROFILE.layout } : {})
					}
				}
			: {})
	});
	$: selectedCard = surface.hand.cards.find((card) => card.key === selectedCardKey) ?? null;
	$: if (selectedCardKey && !surface.hand.cards.some((card) => card.key === selectedCardKey)) {
		selectedCardKey = '';
	}
	$: pendingDrawForSelf = gameplayState.turnActionState?.pendingDrawByPlayer?.[SELF_PLAYER_ID] === true;
	$: requiredResolveCardIdForSelf =
		gameplayState.turnActionState?.requiredResolveCardIdByPlayer?.[SELF_PLAYER_ID];
	$: requiredResolveTargetZonesForSelf =
		gameplayState.turnActionState?.requiredResolveTargetZonesByPlayer?.[SELF_PLAYER_ID];
	$: activeSeat = surface.seats.find((seat) => seat.isCurrentTurn);
	$: quickStartPreview = GUIDE_MODEL.quickStart.slice(0, 2);

	function addEvent(event: GameEvent): void {
		playEvents = [...playEvents, event];
	}

	function toggleCard(card: PlayCardView): void {
		selectedCardKey = selectedCardKey === card.key ? '' : card.key;
	}

	function turnActionPolicyApplies(): boolean {
		if (!TURN_ACTION_POLICY?.enabled) {
			return false;
		}
		return TURN_ACTION_POLICY.allowedPhases.includes(surface.phase);
	}

	function cardIdFromTags(tags: string[] | undefined): string | undefined {
		for (const tag of tags ?? []) {
			if (!tag.startsWith('cid:')) {
				continue;
			}
			const value = tag.slice(4).trim();
			if (value.length > 0) {
				return value;
			}
		}
		return undefined;
	}

	function selectedCardMatchesRequiredResolveAnchor(): boolean {
		if (!requiredResolveCardIdForSelf) {
			return true;
		}
		if (!selectedCard) {
			return false;
		}
		return cardIdFromTags(selectedCard.tags) === requiredResolveCardIdForSelf;
	}

	function isDrawBlocked(zone: string): boolean {
		if (!turnActionPolicyApplies()) {
			return false;
		}
		if (!TURN_ACTION_POLICY?.drawFromZoneAllowlist.includes(zone)) {
			return false;
		}
		return TURN_ACTION_POLICY.requireResolveAfterDraw && pendingDrawForSelf;
	}

	function isResolveBlocked(zone: string): boolean {
		if (!turnActionPolicyApplies()) {
			return false;
		}
		if (!TURN_ACTION_POLICY?.resolveToZoneAllowlist.includes(zone)) {
			return true;
		}
		if (TURN_ACTION_POLICY.requireDrawBeforeResolve && !pendingDrawForSelf) {
			return true;
		}
		if (
			requiredResolveTargetZonesForSelf &&
			requiredResolveTargetZonesForSelf.length > 0 &&
			!requiredResolveTargetZonesForSelf.includes(zone)
		) {
			return true;
		}
		if (requiredResolveCardIdForSelf && !selectedCardMatchesRequiredResolveAnchor()) {
			return true;
		}
		return false;
	}

	function handHintText(): string {
		if (requiredResolveTargetZonesForSelf && requiredResolveTargetZonesForSelf.length > 0) {
			const zoneLabels = requiredResolveTargetZonesForSelf.map(
				(zoneId) => TABLE_ZONE_LABELS[zoneId] ?? zoneId
			);
			return `Resolve picked discard card to: ${zoneLabels.join(', ')}.`;
		}
		if (requiredResolveCardIdForSelf) {
			return 'Resolve turn by playing the picked discard card first.';
		}
		if (turnActionPolicyApplies() && TURN_ACTION_POLICY?.requireResolveAfterDraw && pendingDrawForSelf) {
			return 'Draw resolved pending: select one hand card and play/discard it before drawing again.';
		}
		if (turnActionPolicyApplies() && TURN_ACTION_POLICY?.requireDrawBeforeResolve && !pendingDrawForSelf) {
			return 'Start turn by drawing from an allowed pile, then resolve one card to a play target.';
		}
		return ACTIVE_UI_PROFILE.hand.hint;
	}

	function moveSelectedCardTo(zone: string): void {
		if (!selectedCard) {
			feedback = 'Select a card from your hand first.';
			return;
		}
		if (isResolveBlocked(zone)) {
			feedback = `Draw first, then resolve to ${TABLE_ZONE_LABELS[zone] ?? zone}.`;
			return;
		}
		if (!selectedCardMatchesRequiredResolveAnchor()) {
			feedback = 'Resolve must include the picked discard card first.';
			return;
		}
		if (
			requiredResolveTargetZonesForSelf &&
			requiredResolveTargetZonesForSelf.length > 0 &&
			!requiredResolveTargetZonesForSelf.includes(zone)
		) {
			const labels = requiredResolveTargetZonesForSelf
				.map((zoneId) => TABLE_ZONE_LABELS[zoneId] ?? zoneId)
				.join(', ');
			feedback = `Resolve picked discard card to: ${labels}.`;
			return;
		}

		const from: CardLocation = { kind: 'player', playerId: SELF_PLAYER_ID, zone: HAND_ZONE };
		const to: CardLocation = { kind: 'table', zone };
		const card = zone === 'stock' ? setCardFaceDown(selectedCard, true) : setCardFaceDown(selectedCard, false);
		addEvent(createHandMoveEvent({ actorId: SELF_PLAYER_ID, from, to, card }));
		feedback = `Moved ${cardLabelForAction(selectedCard)} to ${TABLE_ZONE_LABELS[zone] ?? zone}.`;
		selectedCardKey = '';
	}

	function drawPickModeForZone(zone: string): 'top' | 'any_visible' {
		return DRAW_PICK_MODES.get(zone) ?? 'top';
	}

	function canDrawAnyVisibleCard(zone: string, card: PlayCardView): boolean {
		return (
			canDrawFromZone(zone) &&
			drawPickModeForZone(zone) === 'any_visible' &&
			!isDrawBlocked(zone) &&
			!card.isFaceDown
		);
	}

	function drawLabel(card: PlayCardView): string {
		return card.isFaceDown ? 'hidden card' : cardLabelForAction(card);
	}

	function drawFromTable(zone: string, fromCardKey?: string): void {
		if (isDrawBlocked(zone)) {
			feedback = 'Resolve your current draw before drawing again.';
			return;
		}
		const cards = gameplayState.tableZones[zone] ?? [];
		const zoneView = surface.tableZones.find((entry) => entry.zoneId === zone);
		const topCard = cards[cards.length - 1];
		if (!topCard || !zoneView) {
			feedback = `No cards in ${TABLE_ZONE_LABELS[zone] ?? zone}.`;
			return;
		}
		const pickMode = drawPickModeForZone(zone);
		let drawnCards = [topCard];
		if (pickMode === 'any_visible' && fromCardKey) {
			const selectedIndex = zoneView.cards.findIndex((card) => card.key === fromCardKey);
			if (selectedIndex >= 0 && selectedIndex < cards.length) {
				drawnCards = cards.slice(selectedIndex);
			}
		}
		const drawVisibility = DRAW_VISIBILITY_MODES.get(zone) ?? 'reveal';
		const renderedDrawnCards = drawnCards.map((card) =>
			drawVisibility === 'preserve' ? card : setCardFaceDown(card, false)
		);
		const pickedCardView = zoneView.cards.find((card) => card.key === fromCardKey) ?? zoneView.cards.at(-1);
		const pickedLabel = pickedCardView ? drawLabel(pickedCardView) : 'card';

		addEvent({
			type: 'zone_move',
			actorId: SELF_PLAYER_ID,
			from: { kind: 'table', zone },
			to: { kind: 'player', playerId: SELF_PLAYER_ID, zone: HAND_ZONE },
			cards: renderedDrawnCards
		});
		if (renderedDrawnCards.length > 1) {
			feedback = `Drew ${renderedDrawnCards.length} cards from ${TABLE_ZONE_LABELS[zone] ?? zone} (picked ${pickedLabel}).`;
		} else {
			feedback = `Drew ${pickedLabel} from ${TABLE_ZONE_LABELS[zone] ?? zone}.`;
		}
	}

	function resetDemo(): void {
		playEvents = rulesetBundle
			? buildRulesetPlayEvents(PLAYERS, ACTIVE_RUNTIME_BUNDLE)
			: buildDemoPlayEvents(PLAYERS, {
					handZoneName: HAND_ZONE,
					initialPhase: preferredPlayPhase(ACTIVE_GAMEPLAY_RULE_PACK),
					tableZones: TABLE_ZONE_IDS
				});
		selectedCardKey = '';
		feedback = rulesetBundle ? 'Reset to ruleset starting setup.' : 'Started a fresh demo round.';
	}

	function zoneHint(zoneId: string): string {
		return TABLE_ZONE_HINTS[zoneId] ?? '';
	}

	function canDrawFromZone(zoneId: string): boolean {
		return DRAW_TOP_ALLOWED_ZONE_IDS.has(zoneId);
	}

	function latestEvents(): GameEvent[] {
		return [...playEvents].slice(-6).reverse();
	}

	function eventLabel(event: GameEvent): string {
		switch (event.type) {
			case 'zone_move':
				return `${event.actorId} moved ${event.cards.length} card to ${TABLE_ZONE_LABELS[event.to.zone] ?? event.to.zone}`;
			case 'deal_cards':
				return `Deal ${event.cards.length} to ${event.playerId}`;
			case 'advance_turn':
				return ACTION_LABELS.advance_turn ?? 'Advance turn';
			default:
				return event.type;
		}
	}

	function runPrimaryAction(action: UiPrimaryAction): void {
		switch (action.kind) {
			case 'advance_turn':
				addEvent({ type: 'advance_turn' });
				feedback = `${action.label}.`;
				return;
			case 'undo':
				addEvent({ type: 'undo' });
				feedback = `${action.label}.`;
				return;
			case 'redo':
				addEvent({ type: 'redo' });
				feedback = `${action.label}.`;
				return;
			case 'set_phase':
				addEvent({ type: 'set_phase', phase: action.phase });
				feedback = `${action.label}.`;
				return;
		}
	}
</script>

<main class="play-page" style={`--hand-dock-height: ${Math.max(handDockHeight, 160)}px;`}>
	<header class="topbar">
		<div>
			<p class="eyebrow">Just Cards</p>
			<h1>{rulesetBundle ? ACTIVE_RUNTIME_BUNDLE.displayName : 'Play Table'}</h1>
			<p class="subtitle">
				{rulesetBundle
					? 'Ruleset-driven play surface with generated setup and actions.'
					: 'Mobile-first hand + board surface from gameplay primitives.'}
			</p>
			{#if rulesetName}
				<p class="ruleset-name">Ruleset: {rulesetName}</p>
			{/if}
		</div>
		<nav class="jc-mode-links" aria-label="Mode links">
			<a href="/" class="jc-mode-link">Score</a>
			<a href="/play" class="jc-mode-link" aria-current="page">Play</a>
		</nav>
	</header>
	<GuidedModeToggle bind:guided />

	<section class="meta-strip">
		<p><strong>Phase:</strong> {surface.phase}</p>
		<p><strong>Round:</strong> {surface.roundNumber}</p>
		<p><strong>Turn:</strong> {activeSeat?.playerId ?? 'n/a'}</p>
		<p><strong>Dealer:</strong> {surface.seats.find((seat) => seat.isDealer)?.playerId ?? 'n/a'}</p>
	</section>
	{#if guided && rulesetBundle && quickStartPreview.length > 0}
		<section class="meta-strip setup-strip" aria-label="Ruleset setup hints">
			{#each quickStartPreview as line}
				<p>{line}</p>
			{/each}
		</section>
	{/if}

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
	{#if SEAT_CARDS_PROFILE}
		<section class="seat-layout-strip" aria-label={SEAT_CARDS_PROFILE.label}>
			{#each surface.seats as seat (seat.playerId)}
				{#if seat.publicZone}
					<article class="seat-layout-panel">
						<header>
							<p class="seat-layout-title">{seat.playerId}</p>
							<p>{seat.publicZone.cards.length} cards</p>
						</header>
						<div
							class={`seat-layout-cards ${seat.publicZone.layout?.kind === 'grid' ? 'seat-layout-grid' : ''}`.trim()}
							style={seat.publicZone.layout?.kind === 'grid' && seat.publicZone.layout.columns
								? `--seat-layout-columns: ${seat.publicZone.layout.columns};`
								: undefined}
						>
							{#each seat.publicZone.cards as card (card.key)}
								<button
									type="button"
									class={`play-card play-card-sm ${card.suitTone === 'red' ? 'play-card-red' : ''} ${card.isFaceDown ? 'play-card-face-down' : ''}`.trim()}
									disabled
									aria-label={`${seat.playerId} ${card.label}`}
								>
									{card.label}
								</button>
							{/each}
						</div>
					</article>
				{/if}
			{/each}
		</section>
	{/if}

	<div class="play-workspace">
		<section class="surface-panel">
			<Tabs.Root bind:value={surfaceTab} class="surface-tabs">
				<Tabs.List class="surface-tab-list">
					<Tabs.Trigger value="table" class={`surface-tab ${surfaceTab === 'table' ? 'surface-tab-active' : ''}`.trim()}>Table</Tabs.Trigger>
					<Tabs.Trigger value="actions" class={`surface-tab ${surfaceTab === 'actions' ? 'surface-tab-active' : ''}`.trim()}>Actions</Tabs.Trigger>
					<Tabs.Trigger value="log" class={`surface-tab ${surfaceTab === 'log' ? 'surface-tab-active' : ''}`.trim()}>Log</Tabs.Trigger>
					<Tabs.Trigger value="guide" class={`surface-tab ${surfaceTab === 'guide' ? 'surface-tab-active' : ''}`.trim()}>Guide</Tabs.Trigger>
				</Tabs.List>

				<Tabs.Content value="table" class="surface-content">
					<div class="zone-grid">
						{#each surface.tableZones as zone (zone.zoneId)}
							<section class="zone-panel">
								<header>
									<div>
										<h2>{zone.label}</h2>
										{#if guided}<p class="zone-hint">{zoneHint(zone.zoneId)}</p>{/if}
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
												class={`play-card play-card-sm ${card.suitTone === 'red' ? 'play-card-red' : ''} ${card.isFaceDown ? 'play-card-face-down' : ''}`.trim()}
												disabled={!canDrawAnyVisibleCard(zone.zoneId, card)}
												onclick={() => drawFromTable(zone.zoneId, card.key)}
												in:receive={{ key: card.key }}
												out:send={{ key: card.key }}
											>
												{card.label}
											</button>
										{/each}
									{/if}
								</div>
								{#if canDrawFromZone(zone.zoneId)}
									<ScoreButton
										className="zone-action"
										disabled={isDrawBlocked(zone.zoneId)}
										onPress={() => drawFromTable(zone.zoneId)}
									>
										Draw top
									</ScoreButton>
								{/if}
							</section>
						{/each}
					</div>
				</Tabs.Content>

				<Tabs.Content value="actions" class="surface-content action-panel">
					<div class="action-buttons">
						{#each ACTIVE_UI_PROFILE.actions.primary as action (action.id)}
							<ScoreButton onPress={() => runPrimaryAction(action)}>{action.label}</ScoreButton>
						{/each}
						<ScoreButton onPress={resetDemo}>{rulesetBundle ? 'Reset round' : 'New demo round'}</ScoreButton>
					</div>
				</Tabs.Content>

				<Tabs.Content value="log" class="surface-content">
					<ul class="event-log">
						{#each latestEvents() as event, index (`${event.type}-${index}`)}
							<li>{eventLabel(event)}</li>
						{/each}
					</ul>
				</Tabs.Content>

				<Tabs.Content value="guide" class="surface-content guide-panel">
					<section class="guide-card">
						<h2>Objective</h2>
						<p>{GUIDE_MODEL.objective}</p>
					</section>
					<section class="guide-card">
						<h2>Quick Start</h2>
						<ul>
							{#each GUIDE_MODEL.quickStart as line}
								<li>{line}</li>
							{/each}
						</ul>
					</section>
					<section class="guide-card">
						<h2>Scoring</h2>
						<ul>
							{#each GUIDE_MODEL.scoringHighlights as line}
								<li>{line}</li>
							{/each}
						</ul>
					</section>
					<section class="guide-card">
						<h2>Zone Guide</h2>
						<ul>
							{#each GUIDE_MODEL.zoneGuide as line}
								<li>{line}</li>
							{/each}
						</ul>
					</section>
					<section class="guide-card">
						<h2>Audit Trail</h2>
						<ul>
							{#each GUIDE_MODEL.auditTrail as line}
								<li>{line}</li>
							{/each}
						</ul>
						{#if GUIDE_MODEL.diagnostics.length > 0}
							<p class="guide-subhead">Diagnostics</p>
							<ul>
								{#each GUIDE_MODEL.diagnostics as line}
									<li>{line}</li>
								{/each}
							</ul>
						{/if}
					</section>
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
					<p class="hand-action-label">Play {cardLabelForAction(selectedCard)} to:</p>
					<div class="hand-targets">
						{#each HAND_QUICK_TARGETS as zone (zone.id)}
							<ScoreButton
								className="hand-target-button"
								disabled={isResolveBlocked(zone.id)}
								onPress={() => moveSelectedCardTo(zone.id)}
							>
								{zone.label}
							</ScoreButton>
						{/each}
					</div>
				{:else if guided}
					<p class="hand-action-label hand-action-hint">{handHintText()}</p>
				{/if}
			</div>
			<div
				class={`hand-scroll ${surface.hand.layout?.kind === 'grid' ? 'hand-grid' : ''}`.trim()}
				style={surface.hand.layout?.kind === 'grid' && surface.hand.layout.columns
					? `--hand-columns: ${surface.hand.layout.columns};`
					: undefined}
			>
				{#if surface.hand.cards.length === 0}
					<p class="zone-empty">No cards in hand.</p>
				{:else}
					{#each surface.hand.cards as card (card.key)}
						<button
							type="button"
							class={`play-card ${card.suitTone === 'red' ? 'play-card-red' : ''} ${card.isFaceDown ? 'play-card-face-down' : ''} ${selectedCardKey === card.key ? 'play-card-selected' : ''}`.trim()}
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

	.ruleset-name {
		margin: 8px 0 0;
		font-size: var(--jc-type-sm);
		font-weight: 600;
		color: var(--play-accent);
	}

	.meta-strip {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 6px 12px;
		padding: 10px 12px;
		border-radius: 12px;
		border: 1px solid var(--play-line);
		background: var(--jc-surface-elevated);
		box-shadow: inset 0 1px 0 #fff;
	}

	.meta-strip p {
		margin: 0;
		font-size: var(--jc-type-md);
	}

	.setup-strip {
		grid-template-columns: 1fr;
		background: color-mix(in srgb, var(--jc-surface-elevated) 86%, var(--play-brand-soft));
	}

	.seat-strip {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		scrollbar-width: none;
	}

	.seat-strip::-webkit-scrollbar {
		display: none;
	}

	.seat-layout-strip {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		scrollbar-width: none;
		padding-bottom: 2px;
	}

	.seat-layout-strip::-webkit-scrollbar {
		display: none;
	}

	.seat-layout-panel {
		min-width: 132px;
		border: 1px solid var(--play-line);
		border-radius: 12px;
		background: var(--jc-surface-elevated);
		padding: 8px;
		display: grid;
		gap: 6px;
	}

	.seat-layout-panel header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 8px;
	}

	.seat-layout-title {
		margin: 0;
		font-size: var(--jc-type-sm);
		font-weight: 700;
	}

	.seat-layout-panel header p {
		margin: 0;
		font-size: var(--jc-type-xs);
		color: var(--play-muted);
	}

	.seat-layout-cards {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}

	.seat-layout-grid {
		display: grid;
		grid-template-columns: repeat(var(--seat-layout-columns, 3), minmax(0, max-content));
		align-content: start;
	}

	.seat-chip {
		min-width: 94px;
		padding: 9px 10px;
		border-radius: 12px;
		border: 1px solid var(--play-line);
		background: var(--jc-surface-elevated);
		box-shadow: inset 0 1px 0 #fff;
		display: grid;
		gap: 4px;
	}

	.seat-chip-turn {
		border-color: color-mix(in srgb, var(--play-brand) 60%, #9db0c5);
		box-shadow:
			inset 0 1px 0 #fff,
			0 0 0 2px color-mix(in srgb, var(--play-brand-soft) 35%, transparent);
	}

	.seat-chip-self {
		background: color-mix(in srgb, var(--jc-surface-elevated) 85%, var(--play-brand-soft));
	}

	.seat-name {
		margin: 0;
		font-size: 0.8rem;
		font-weight: 700;
	}

	.seat-count {
		margin: 0;
		font-size: 0.72rem;
		color: var(--play-muted);
	}

	.seat-tags {
		display: flex;
		gap: 6px;
	}

	.tag {
		font-size: 0.68rem;
		font-weight: 600;
		padding: 2px 8px;
		border-radius: 999px;
		background: var(--jc-surface-muted);
		color: color-mix(in srgb, var(--play-fg) 72%, #4b5f79);
	}

	.tag-turn {
		background: color-mix(in srgb, var(--play-brand-soft) 78%, #fff);
		color: color-mix(in srgb, var(--play-fg) 72%, #35516d);
	}

	.surface-panel {
		border: 1px solid var(--play-line);
		border-radius: 14px;
		background: var(--jc-surface-elevated);
		box-shadow: var(--play-shadow);
		padding: 8px;
	}

	:global(.surface-tab-list) {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 6px;
		margin-bottom: 8px;
	}

	:global(.surface-tab) {
		min-height: 42px;
		border-radius: 10px;
		font-weight: 600;
		color: color-mix(in srgb, var(--play-fg) 70%, #556b85);
		background: var(--jc-surface-muted);
		border: 1px solid var(--play-line);
	}

	:global(.surface-tab-active) {
		background: color-mix(in srgb, var(--play-brand-soft) 72%, #fff);
		border-color: color-mix(in srgb, var(--play-brand) 60%, #96adcb);
		color: color-mix(in srgb, var(--play-fg) 82%, #16304a);
	}

	:global(.surface-content) {
		display: grid;
		gap: 8px;
	}

	:global(.surface-content[hidden]) {
		display: none;
	}

	.zone-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}

	.zone-panel {
		border: 1px solid var(--play-line);
		border-radius: 11px;
		padding: 8px;
		display: grid;
		gap: 8px;
		background: var(--jc-surface);
	}

	.zone-panel header {
		display: flex;
		justify-content: space-between;
		gap: 8px;
	}

	.zone-panel h2 {
		margin: 0;
		font-size: 0.95rem;
	}

	.zone-panel header p {
		margin: 0;
		font-size: 0.75rem;
		color: var(--play-muted);
	}

	.zone-hint {
		margin-top: 4px !important;
		font-size: 0.74rem !important;
		line-height: 1.25;
	}

	.zone-cards {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		align-items: flex-start;
	}

	.zone-empty {
		margin: 0;
		font-size: 0.85rem;
		color: var(--play-muted);
	}

	.zone-action {
		min-height: 40px;
		font-size: 0.9rem;
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
		gap: 6px;
	}

	.event-log li {
		padding: 10px 11px;
		border-radius: 10px;
		border: 1px solid var(--play-line);
		background: var(--jc-surface);
		font-size: 0.9rem;
	}

	:global(.guide-panel) {
		gap: 10px;
	}

	.guide-card {
		border: 1px solid var(--play-line);
		border-radius: 11px;
		padding: 10px;
		background: var(--jc-surface);
	}

	.guide-card h2 {
		margin: 0;
		font-size: 0.94rem;
	}

	.guide-card p {
		margin: 6px 0 0;
		font-size: 0.9rem;
		color: color-mix(in srgb, var(--play-fg) 82%, #2c4968);
	}

	.guide-card ul {
		margin: 8px 0 0;
		padding-left: 16px;
		display: grid;
		gap: 4px;
	}

	.guide-card li {
		font-size: 0.84rem;
		line-height: 1.3;
		color: color-mix(in srgb, var(--play-fg) 82%, #2d4a69);
	}

	.guide-subhead {
		margin-top: 10px !important;
		font-size: 0.78rem !important;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--play-accent) !important;
	}

	.hand-dock {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 30;
		padding: 10px 10px calc(12px + env(safe-area-inset-bottom));
		border-top: 1px solid var(--play-line);
		background: color-mix(in srgb, var(--jc-surface-elevated) 95%, #fff);
		box-shadow: 0 -6px 20px rgba(18, 33, 52, 0.08);
		display: grid;
		gap: 8px;
	}

	.hand-dock header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}

	.hand-dock h2 {
		margin: 0;
		font-size: 1.5rem;
		line-height: 1;
	}

	.hand-dock header p {
		margin: 0;
		font-size: 0.82rem;
		color: var(--play-muted);
	}

	.hand-action-label {
		margin: 0;
		font-size: 0.9rem;
		font-weight: 700;
		color: color-mix(in srgb, var(--play-fg) 76%, #375169);
	}

	.hand-action-hint {
		font-weight: 600;
	}

	.hand-targets {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 6px;
	}

	.hand-target-button {
		min-height: 34px;
		padding: 4px 10px;
		font-size: 0.8rem;
		border-radius: 999px;
	}

	.hand-scroll {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		padding-bottom: 2px;
		scrollbar-width: none;
	}

	.hand-grid {
		display: grid;
		grid-template-columns: repeat(var(--hand-columns, 3), minmax(0, max-content));
		overflow-x: visible;
	}

	.hand-scroll::-webkit-scrollbar {
		display: none;
	}

	.play-card {
		width: 48px;
		height: 70px;
		border-radius: 10px;
		border: 1px solid var(--play-line);
		background: var(--play-card);
		color: #212121;
		font-weight: 700;
		font-size: 1.45rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		box-shadow:
			0 3px 9px rgba(14, 28, 46, 0.06),
			inset 0 1px 0 #fff;
		transition:
			transform var(--jc-motion-fast) var(--jc-ease-standard),
			box-shadow var(--jc-motion-fast) var(--jc-ease-standard),
			border-color var(--jc-motion-fast) var(--jc-ease-standard);
	}

	.play-card-sm {
		width: 40px;
		height: 58px;
		font-size: 1rem;
	}

	.play-card-red {
		color: #c62828;
	}

	.play-card-face-down {
		background:
			repeating-linear-gradient(
				135deg,
				color-mix(in srgb, var(--play-brand-soft) 42%, #fff) 0px,
				color-mix(in srgb, var(--play-brand-soft) 42%, #fff) 6px,
				color-mix(in srgb, var(--jc-surface-muted) 72%, #fff) 6px,
				color-mix(in srgb, var(--jc-surface-muted) 72%, #fff) 12px
			);
		color: color-mix(in srgb, var(--play-fg) 64%, #314d6a);
		font-size: 1rem;
	}

	.play-card-selected {
		transform: translateY(-2px);
		border-color: color-mix(in srgb, var(--play-brand) 70%, #7f9fbe);
		box-shadow:
			0 5px 14px rgba(18, 44, 70, 0.16),
			inset 0 1px 0 #fff,
			0 0 0 2px color-mix(in srgb, var(--play-brand-soft) 38%, transparent);
	}

	.feedback {
		margin: 0;
		font-size: 0.85rem;
		font-weight: 600;
		color: color-mix(in srgb, var(--play-fg) 76%, #2e4f73);
	}

	@media (min-width: 860px) {
		.play-page {
			max-width: 980px;
			padding: 18px 24px 24px;
		}

		.topbar {
			grid-template-columns: 1fr auto;
			align-items: start;
		}

		.play-workspace {
			grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
			align-items: start;
		}

		.hand-dock {
			position: sticky;
			top: 14px;
			left: auto;
			right: auto;
			bottom: auto;
			z-index: 1;
			border: 1px solid var(--play-line);
			border-radius: 14px;
			padding: 12px;
			box-shadow: var(--play-shadow);
		}
	}

	:global(.action-panel) {
		display: grid;
		gap: 8px;
	}

	@media (max-width: 680px) {
		.zone-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
