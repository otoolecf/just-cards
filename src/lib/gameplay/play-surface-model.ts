import type { CardLocation, GameEvent, GameplayState } from '$lib/gameplay/engine';
import type { CardInput } from '$lib/scorekeeper/engine';

const SUIT_SYMBOL: Record<NonNullable<CardInput['suit']>, string> = {
	clubs: '♣',
	diamonds: '♦',
	hearts: '♥',
	spades: '♠'
};

const RED_SUITS = new Set<NonNullable<CardInput['suit']>>(['hearts', 'diamonds']);

export interface PlayCardView {
	key: string;
	rank: CardInput['rank'];
	suit?: CardInput['suit'];
	tags?: string[];
	label: string;
	suitTone: 'dark' | 'red';
}

export interface PlaySeatView {
	playerId: string;
	handCount: number;
	isSelf: boolean;
	isDealer: boolean;
	isCurrentTurn: boolean;
}

export interface PlayZoneView {
	zoneId: string;
	label: string;
	cards: PlayCardView[];
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

function toCardView(card: CardInput, fallbackKey: string): PlayCardView {
	const suitTone: PlayCardView['suitTone'] = card.suit && RED_SUITS.has(card.suit) ? 'red' : 'dark';
	return {
		key: cardViewKey(card, fallbackKey),
		rank: card.rank,
		suit: card.suit,
		tags: card.tags ? [...card.tags] : undefined,
		label: toCardLabel(card),
		suitTone
	};
}

function zoneCardsToView(zoneCards: CardInput[], zoneId: string): PlayCardView[] {
	return zoneCards.map((card, index) => toCardView(card, `${zoneId}-${index}`));
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
	const seats: PlaySeatView[] = seatOrder.map((playerId, index) => {
		const handCards = state.playerZones[playerId]?.[options.handZoneName] ?? [];
		return {
			playerId,
			handCount: handCards.length,
			isSelf: playerId === options.selfPlayerId,
			isDealer: index === state.dealerIndex,
			isCurrentTurn: index === state.currentTurnIndex
		};
	});

	const selfHandCards = state.playerZones[options.selfPlayerId]?.[options.handZoneName] ?? [];
	const hand: PlayZoneView = {
		zoneId: options.handZoneName,
		label: options.zoneLabels?.[options.handZoneName] ?? toLabel(options.handZoneName),
		cards: zoneCardsToView(selfHandCards, options.handZoneName)
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
