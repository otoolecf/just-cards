import type { CardLocation, GameEvent, GameplayState } from '$lib/gameplay/engine';
import type { CardInput } from '$lib/scorekeeper/engine';
import type { RuntimeRulesetBundle } from '$lib/rulesets/types';
import type { UiCardLayout } from '$lib/ui/ui-profile';

const SUIT_SYMBOL: Record<NonNullable<CardInput['suit']>, string> = {
	clubs: '♣',
	diamonds: '♦',
	hearts: '♥',
	spades: '♠'
};

const RED_SUITS = new Set<NonNullable<CardInput['suit']>>(['hearts', 'diamonds']);
const FACE_DOWN_TAG = 'face:down';
const FACE_UP_TAG = 'face:up';
const SLOT_TAG_PREFIX = 'slot:r';

export interface PlayCardView {
	key: string;
	rank: CardInput['rank'];
	suit?: CardInput['suit'];
	tags?: string[];
	label: string;
	suitTone: 'dark' | 'red';
	isFaceDown: boolean;
	slot?: {
		row: number;
		col: number;
		order: number;
	};
}

export interface PlaySeatPublicZoneView {
	zoneId: string;
	label: string;
	cards: PlayCardView[];
	layout?: UiCardLayout;
}

export interface PlaySeatView {
	playerId: string;
	handCount: number;
	isSelf: boolean;
	isDealer: boolean;
	isCurrentTurn: boolean;
	publicZone?: PlaySeatPublicZoneView;
}

export interface PlayZoneView {
	zoneId: string;
	label: string;
	cards: PlayCardView[];
	layout?: UiCardLayout;
}

export interface PlaySurfaceView {
	phase: string;
	roundNumber: number;
	seats: PlaySeatView[];
	hand: PlayZoneView;
	tableZones: PlayZoneView[];
}

export interface BuildPlaySurfaceViewOptions {
	selfPlayerId: string;
	handZoneName: string;
	tableZoneOrder?: string[];
	includeDiscoveredTableZones?: boolean;
	zoneLabels?: Record<string, string>;
	handLayout?: UiCardLayout;
	seatPublicCards?: {
		zoneId: string;
		label?: string;
		includeSelf?: boolean;
		layout?: UiCardLayout;
	};
}

export interface HandMoveInput {
	actorId: string;
	from: CardLocation;
	to: CardLocation;
	card: CardInput;
}

export interface DemoPlayEventOptions {
	handZoneName?: string;
	initialPhase?: string;
	tableZones?: string[];
	cardsPerPlayer?: number;
}

const NUMBER_WORD_TO_VALUE: Record<string, number> = {
	one: 1,
	two: 2,
	three: 3,
	four: 4,
	five: 5,
	six: 6,
	seven: 7,
	eight: 8,
	nine: 9,
	ten: 10,
	eleven: 11,
	twelve: 12,
	thirteen: 13
};

function toLabel(zoneId: string): string {
	return zoneId
		.split(/[_-]/)
		.map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
		.join(' ');
}

function toCardLabel(card: CardInput): string {
	if (!card.suit) {
		return card.rank;
	}
	return `${card.rank}${SUIT_SYMBOL[card.suit]}`;
}

function uniqueTags(tags: string[]): string[] {
	const unique: string[] = [];
	for (const tag of tags) {
		const normalized = tag.trim();
		if (!normalized || unique.includes(normalized)) {
			continue;
		}
		unique.push(normalized);
	}
	return unique;
}

export function cardIsFaceDown(card: CardInput): boolean {
	const tags = card.tags ?? [];
	const hasFaceDown = tags.includes(FACE_DOWN_TAG);
	const hasFaceUp = tags.includes(FACE_UP_TAG);
	return hasFaceDown && !hasFaceUp;
}

export function setCardFaceDown(card: CardInput, faceDown: boolean): CardInput {
	const tags = (card.tags ?? []).filter((tag) => tag !== FACE_DOWN_TAG && tag !== FACE_UP_TAG);
	if (faceDown) {
		tags.push(FACE_DOWN_TAG);
	} else {
		tags.push(FACE_UP_TAG);
	}
	return {
		...card,
		tags: uniqueTags(tags)
	};
}

function cardSlotFromTags(card: CardInput): { row: number; col: number; order: number } | undefined {
	for (const tag of card.tags ?? []) {
		const match = tag.match(/^slot:r(\d{1,2})c(\d{1,2})$/i);
		if (!match) {
			continue;
		}
		const row = Number.parseInt(match[1], 10);
		const col = Number.parseInt(match[2], 10);
		if (!Number.isFinite(row) || !Number.isFinite(col) || row < 1 || col < 1) {
			continue;
		}
		return {
			row,
			col,
			order: row * 100 + col
		};
	}
	return undefined;
}

function compareCardSlots(left: CardInput, right: CardInput): number {
	const leftSlot = cardSlotFromTags(left);
	const rightSlot = cardSlotFromTags(right);
	if (leftSlot && rightSlot) {
		return leftSlot.order - rightSlot.order;
	}
	if (leftSlot) {
		return -1;
	}
	if (rightSlot) {
		return 1;
	}
	return 0;
}

export function setCardSlot(card: CardInput, row: number, col: number): CardInput {
	const tags = (card.tags ?? []).filter((tag) => !tag.startsWith(SLOT_TAG_PREFIX));
	tags.push(`slot:r${row}c${col}`);
	return {
		...card,
		tags: uniqueTags(tags)
	};
}

function toCardView(card: CardInput, fallbackKey: string): PlayCardView {
	const isFaceDown = cardIsFaceDown(card);
	const suitTone: PlayCardView['suitTone'] = card.suit && RED_SUITS.has(card.suit) ? 'red' : 'dark';
	const slot = cardSlotFromTags(card);
	return {
		key: cardViewKey(card, fallbackKey),
		rank: card.rank,
		suit: card.suit,
		tags: card.tags ? [...card.tags] : undefined,
		label: isFaceDown ? '??' : toCardLabel(card),
		suitTone: isFaceDown ? 'dark' : suitTone,
		isFaceDown,
		...(slot ? { slot } : {})
	};
}

function zoneCardsToView(zoneCards: CardInput[], zoneId: string): PlayCardView[] {
	const ordered = [...zoneCards].sort(compareCardSlots);
	return ordered.map((card, index) => toCardView(card, `${zoneId}-${index}`));
}

export function cardViewKey(card: CardInput, fallbackKey: string): string {
	for (const tag of card.tags ?? []) {
		if (tag.startsWith('cid:')) {
			const raw = tag.slice(4).trim();
			if (raw.length > 0) {
				return raw;
			}
		}
	}
	return fallbackKey;
}

export function buildPlaySurfaceView(state: GameplayState, options: BuildPlaySurfaceViewOptions): PlaySurfaceView {
	const seatOrder = state.turnOrder.length > 0 ? state.turnOrder : state.players;
	const seatPublicCards = options.seatPublicCards;
	const seats: PlaySeatView[] = seatOrder.map((playerId, index) => {
		const handCards = state.playerZones[playerId]?.[options.handZoneName] ?? [];
		const shouldShowPublicCards =
			seatPublicCards && (seatPublicCards.includeSelf === true || playerId !== options.selfPlayerId);
		const publicZoneCards = shouldShowPublicCards
			? state.playerZones[playerId]?.[seatPublicCards.zoneId] ?? []
			: [];
		return {
			playerId,
			handCount: handCards.length,
			isSelf: playerId === options.selfPlayerId,
			isDealer: index === state.dealerIndex,
			isCurrentTurn: index === state.currentTurnIndex,
			...(shouldShowPublicCards
				? {
						publicZone: {
							zoneId: seatPublicCards.zoneId,
							label:
								seatPublicCards.label ??
								options.zoneLabels?.[seatPublicCards.zoneId] ??
								toLabel(seatPublicCards.zoneId),
							cards: zoneCardsToView(publicZoneCards, `${playerId}-${seatPublicCards.zoneId}`),
							...(seatPublicCards.layout ? { layout: seatPublicCards.layout } : {})
						}
					}
				: {})
		};
	});

	const selfHandCards = state.playerZones[options.selfPlayerId]?.[options.handZoneName] ?? [];
	const hand: PlayZoneView = {
		zoneId: options.handZoneName,
		label: options.zoneLabels?.[options.handZoneName] ?? toLabel(options.handZoneName),
		cards: zoneCardsToView(selfHandCards, options.handZoneName),
		...(options.handLayout ? { layout: options.handLayout } : {})
	};

	const orderedZoneIds: string[] = [];
	for (const zoneId of options.tableZoneOrder ?? []) {
		if (!orderedZoneIds.includes(zoneId)) {
			orderedZoneIds.push(zoneId);
		}
	}
	if (options.includeDiscoveredTableZones !== false) {
		for (const zoneId of Object.keys(state.tableZones)) {
			if (!orderedZoneIds.includes(zoneId)) {
				orderedZoneIds.push(zoneId);
			}
		}
	}

	const tableZones: PlayZoneView[] = orderedZoneIds.map((zoneId) => {
		const cards = state.tableZones[zoneId] ?? [];
		return {
			zoneId,
			label: options.zoneLabels?.[zoneId] ?? toLabel(zoneId),
			cards: zoneCardsToView(cards, zoneId)
		};
	});

	return {
		phase: state.phase,
		roundNumber: state.roundNumber,
		seats,
		hand,
		tableZones
	};
}

export function createHandMoveEvent(input: HandMoveInput): GameEvent {
	return {
		type: 'zone_move',
		actorId: input.actorId,
		from: input.from,
		to: input.to,
		cards: [input.card]
	};
}

const DEMO_RANKS: CardInput['rank'][] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const DEMO_SUITS: NonNullable<CardInput['suit']>[] = ['spades', 'hearts', 'diamonds', 'clubs'];

function makeDemoDeck(size: number): CardInput[] {
	const deck: CardInput[] = [];
	for (let index = 0; index < size; index += 1) {
		const rank = DEMO_RANKS[index % DEMO_RANKS.length];
		const suit = DEMO_SUITS[Math.floor(index / DEMO_RANKS.length) % DEMO_SUITS.length];
		deck.push({ rank, suit, tags: [`cid:demo-${index}`] });
	}
	return deck;
}

function uniqueStrings(values: string[]): string[] {
	const unique: string[] = [];
	for (const value of values) {
		if (!value || unique.includes(value)) {
			continue;
		}
		unique.push(value);
	}
	return unique;
}

function preferredPlayPhase(bundle: RuntimeRulesetBundle): string {
	const gameplayRulePack = bundle.runtimeRulePack.gameplayRulePack;
	if (!gameplayRulePack) {
		return 'play';
	}
	if (gameplayRulePack.zoneMovePolicy.allowedPhases.includes('play')) {
		return 'play';
	}
	if (gameplayRulePack.zoneMovePolicy.allowedPhases.length > 0) {
		return gameplayRulePack.zoneMovePolicy.allowedPhases[0];
	}
	return gameplayRulePack.phaseAfterRoundStart;
}

function setupPhaseForSeeding(bundle: RuntimeRulesetBundle): string {
	const gameplayRulePack = bundle.runtimeRulePack.gameplayRulePack;
	if (!gameplayRulePack) {
		return 'play';
	}
	if (gameplayRulePack.zoneMovePolicy.allowedPhases.includes('deal') && gameplayRulePack.phases.includes('deal')) {
		return 'deal';
	}
	const firstAllowedKnownPhase = gameplayRulePack.zoneMovePolicy.allowedPhases.find((phase) =>
		gameplayRulePack.phases.includes(phase)
	);
	if (firstAllowedKnownPhase) {
		return firstAllowedKnownPhase;
	}
	return preferredPlayPhase(bundle);
}

function parseNumericToken(token: string): number | undefined {
	const normalized = token.trim().toLowerCase();
	if (!normalized) {
		return undefined;
	}
	const numeric = Number.parseInt(normalized, 10);
	if (Number.isFinite(numeric)) {
		return numeric;
	}
	return NUMBER_WORD_TO_VALUE[normalized];
}

function cardsPerPlayerFromBundle(bundle: RuntimeRulesetBundle): number {
	const setupCards = bundle.explain?.setup?.cardsPerPlayer;
	if (typeof setupCards === 'number' && Number.isFinite(setupCards) && setupCards >= 2 && setupCards <= 20) {
		return Math.trunc(setupCards);
	}

	const handLayout = bundle.uiProfile.hand.layout;
	if (handLayout?.kind === 'grid') {
		const rows = handLayout.rows ?? 0;
		const columns = handLayout.columns ?? 0;
		if (rows > 0 && columns > 0) {
			const total = rows * columns;
			if (total >= 2 && total <= 20) {
				return total;
			}
		}
	}

	const diagnostics = bundle.explain?.diagnostics ?? [];
	const candidates: string[] = [...diagnostics, bundle.displayName, bundle.gameId];
	if (bundle.explain?.goal) {
		candidates.push(bundle.explain.goal);
	}

	const patterns = [
		/(?:initial hand(?: is|:)?|deal(?:s|t)?|hand size(?: is|:)?)\s*(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen)(?:\s+[a-z-]+){0,4}\s*cards?/i,
		/(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen)(?:\s+[a-z-]+){0,4}\s*cards?\s*(?:to|for)\s*each/i,
		/(?:player(?:s|'s)?|layout|hand)[^.\n]{0,48}(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen)(?:\s+[a-z-]+){0,4}\s*cards?/i
	];

	for (const line of candidates) {
		for (const pattern of patterns) {
			const match = line.match(pattern);
			if (!match) {
				continue;
			}
			const parsed = parseNumericToken(match[1]);
			if (parsed && parsed >= 2 && parsed <= 13) {
				return parsed;
			}
		}
	}

	return 5;
}

function initialFaceUpCountFromBundle(bundle: RuntimeRulesetBundle, cardsPerPlayer: number): number {
	const setupInitialFaceUp = bundle.explain?.setup?.initialFaceUpCards;
	if (
		typeof setupInitialFaceUp === 'number' &&
		Number.isFinite(setupInitialFaceUp) &&
		setupInitialFaceUp >= 0
	) {
		return Math.max(0, Math.min(Math.trunc(setupInitialFaceUp), cardsPerPlayer));
	}

	const diagnostics = bundle.explain?.diagnostics ?? [];
	const candidates: string[] = [...diagnostics];
	if (bundle.explain?.goal) {
		candidates.push(bundle.explain.goal);
	}

	const faceUpPatterns = [
		/(?:turn(?:ed)?|flip(?:ped)?|reveal(?:ed)?)\s*(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen)\s*cards?\s*face up/i,
		/(?:turn(?:ed)?|flip(?:ped)?|reveal(?:ed)?)\s*(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen)(?:\s+of\s+(?:these|their))?\s*cards?\s*face up/i,
		/(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen)\s*cards?\s*(?:are|is|remain|stays?|start)\s*face up/i
	];

	const hasFaceDownHint = candidates.some((line) => /\bface down\b/i.test(line));
	for (const line of candidates) {
		for (const pattern of faceUpPatterns) {
			const match = line.match(pattern);
			if (!match) {
				continue;
			}
			const parsed = parseNumericToken(match[1]);
			if (!parsed) {
				continue;
			}
			return Math.max(0, Math.min(parsed, cardsPerPlayer));
		}
	}

	if (hasFaceDownHint) {
		return 0;
	}
	return cardsPerPlayer;
}

function handLayoutFromBundle(
	bundle: RuntimeRulesetBundle,
	cardsPerPlayer: number
): { rows: number; columns: number } | undefined {
	const explainLayout = bundle.explain?.setup?.playerLayout;
	if (
		explainLayout?.kind === 'grid' &&
		typeof explainLayout.rows === 'number' &&
		typeof explainLayout.columns === 'number' &&
		explainLayout.rows > 0 &&
		explainLayout.columns > 0 &&
		explainLayout.rows * explainLayout.columns === cardsPerPlayer
	) {
		return { rows: explainLayout.rows, columns: explainLayout.columns };
	}

	const handLayout = bundle.uiProfile.hand.layout;
	if (
		handLayout?.kind === 'grid' &&
		typeof handLayout.rows === 'number' &&
		typeof handLayout.columns === 'number' &&
		handLayout.rows > 0 &&
		handLayout.columns > 0 &&
		handLayout.rows * handLayout.columns === cardsPerPlayer
	) {
		return { rows: handLayout.rows, columns: handLayout.columns };
	}

	const diagnostics = bundle.explain?.diagnostics ?? [];
	const patterns = [
		/(\d{1,2})\s*[x×]\s*(\d{1,2})/i,
		/(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s*rows?\s*of\s*(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)/i
	];
	for (const line of diagnostics) {
		for (const pattern of patterns) {
			const match = line.match(pattern);
			if (!match) {
				continue;
			}
			const rows = parseNumericToken(match[1]);
			const columns = parseNumericToken(match[2]);
			if (!rows || !columns) {
				continue;
			}
			if (rows * columns === cardsPerPlayer) {
				return { rows, columns };
			}
		}
	}

	return undefined;
}

function tableZonesFromBundle(bundle: RuntimeRulesetBundle): string[] {
	const zones = bundle.uiProfile.table.zones
		.filter((zone) => zone.visible !== false)
		.map((zone) => zone.id);
	return uniqueStrings(zones);
}

function seedZoneEventsFromPlayerCards(
	actorId: string,
	handZoneName: string,
	cards: CardInput[],
	targetZone: string
): GameEvent[] {
	const events: GameEvent[] = [];
	for (const card of cards) {
		events.push({
			type: 'zone_move',
			actorId,
			from: { kind: 'player', playerId: actorId, zone: handZoneName },
			to: { kind: 'table', zone: targetZone },
			cards: [card]
		});
	}
	return events;
}

export function buildRulesetPlayEvents(
	players: string[],
	bundle: RuntimeRulesetBundle,
	options: { cardsPerPlayer?: number } = {}
): GameEvent[] {
	if (players.length < 2) {
		throw new Error('Ruleset play requires at least two players');
	}

	const handZoneName = bundle.runtimeRulePack.gameplayRulePack?.handZoneName ?? bundle.uiProfile.hand.zoneId ?? 'hand';
	const initialPhase = preferredPlayPhase(bundle);
	const setupPhase = setupPhaseForSeeding(bundle);
	const cardsPerPlayer = Math.max(2, options.cardsPerPlayer ?? cardsPerPlayerFromBundle(bundle));
	const initialFaceUpCount = initialFaceUpCountFromBundle(bundle, cardsPerPlayer);
	const handLayout = handLayoutFromBundle(bundle, cardsPerPlayer);
	const tableZones = tableZonesFromBundle(bundle);
	const stockZone = tableZones.includes('stock') ? 'stock' : undefined;
	const discardZone = tableZones.includes('discard') ? 'discard' : undefined;

	const minimumDeck = players.length * cardsPerPlayer + 24;
	const deck = makeDemoDeck(Math.max(52, minimumDeck));
	let cursor = 0;
	const dealtByPlayer: Record<string, CardInput[]> = {};

	const events: GameEvent[] = [
		{ type: 'init_game', players, dealerIndex: 0 },
		{ type: 'start_round' },
		{ type: 'set_phase', phase: setupPhase }
	];

	for (const playerId of players) {
		const cards = deck.slice(cursor, cursor + cardsPerPlayer).map((card, index) => {
			const withFace = setCardFaceDown(card, index >= initialFaceUpCount);
			if (!handLayout) {
				return withFace;
			}
			const row = Math.floor(index / handLayout.columns) + 1;
			const col = (index % handLayout.columns) + 1;
			return setCardSlot(withFace, row, col);
		});
		cursor += cardsPerPlayer;
		dealtByPlayer[playerId] = cards;
		events.push({ type: 'deal_cards', playerId, cards, zone: handZoneName });
	}

	const seedPlayer = players[0];
	const extraSeedCount = Math.max(0, deck.length - cursor);
	if (stockZone && extraSeedCount > 0) {
		const extraCards = deck
			.slice(cursor, cursor + extraSeedCount)
			.map((card, index) => setCardFaceDown(card, discardZone ? index !== 0 : true));
		events.push({ type: 'deal_cards', playerId: seedPlayer, cards: extraCards, zone: handZoneName });
		if (discardZone && extraCards.length > 0) {
			const discardCard = extraCards[0];
			events.push(
				...seedZoneEventsFromPlayerCards(seedPlayer, handZoneName, [discardCard], discardZone)
			);
		}
		const stockCards = discardZone ? extraCards.slice(1) : extraCards;
		events.push(...seedZoneEventsFromPlayerCards(seedPlayer, handZoneName, stockCards, stockZone));
		if (initialPhase !== setupPhase) {
			events.push({ type: 'set_phase', phase: initialPhase });
		}
		return events;
	}

	const firstZone = tableZones[0];
	const secondZone = tableZones[1];
	if (firstZone) {
		const firstCard = dealtByPlayer[players[0]]?.[0];
		if (firstCard) {
			events.push(
				...seedZoneEventsFromPlayerCards(players[0], handZoneName, [firstCard], firstZone)
			);
		}
	}
	if (secondZone) {
		const secondCard = dealtByPlayer[players[1]]?.[0];
		if (secondCard) {
			events.push(
				...seedZoneEventsFromPlayerCards(players[1], handZoneName, [secondCard], secondZone)
			);
		}
	}

	if (initialPhase !== setupPhase) {
		events.push({ type: 'set_phase', phase: initialPhase });
	}
	return events;
}

export function buildDemoPlayEvents(players: string[], options: DemoPlayEventOptions = {}): GameEvent[] {
	if (players.length < 2) {
		throw new Error('Demo play requires at least two players');
	}

	const handZoneName = options.handZoneName ?? 'hand';
	const initialPhase = options.initialPhase ?? 'play';
	const cardsPerPlayer = Math.max(2, options.cardsPerPlayer ?? 5);
	const tableZones = options.tableZones && options.tableZones.length > 0 ? options.tableZones : ['board', 'discard'];

	const deck = makeDemoDeck(players.length * (cardsPerPlayer + 1));
	const events: GameEvent[] = [
		{ type: 'init_game', players, dealerIndex: 0 },
		{ type: 'start_round' },
		{ type: 'set_phase', phase: initialPhase }
	];

	const dealtByPlayer: Record<string, CardInput[]> = {};
	let cursor = 0;
	for (const playerId of players) {
		const cards = deck.slice(cursor, cursor + cardsPerPlayer);
		cursor += cardsPerPlayer;
		dealtByPlayer[playerId] = cards;
		events.push({ type: 'deal_cards', playerId, cards, zone: handZoneName });
	}

	const firstZone = tableZones[0];
	const secondZone = tableZones[1];

	if (firstZone) {
		const boardSourcePlayer = players[0];
		const boardCard = dealtByPlayer[boardSourcePlayer]?.[0];
		if (boardCard) {
			events.push({
				type: 'zone_move',
				actorId: boardSourcePlayer,
				from: { kind: 'player', playerId: boardSourcePlayer, zone: handZoneName },
				to: { kind: 'table', zone: firstZone },
				cards: [boardCard]
			});
		}
	}

	if (secondZone) {
		const discardSourcePlayer = players[1];
		const discardCard = dealtByPlayer[discardSourcePlayer]?.[0];
		if (discardCard) {
			events.push({
				type: 'zone_move',
				actorId: discardSourcePlayer,
				from: { kind: 'player', playerId: discardSourcePlayer, zone: handZoneName },
				to: { kind: 'table', zone: secondZone },
				cards: [discardCard]
			});
		}
	}

	return events;
}
