import type { CardInput } from '$lib/scorekeeper/engine';

export type GameplayPhase = string;

export interface GameActionContext {
	activePlayer?: string;
	tags?: string[];
}

export type GameplayRuleCapability =
	| 'phases:state-machine'
	| 'turns:fixed-order'
	| 'zones:player-owned'
	| 'zones:table-shared'
	| 'undo:replay';

export interface GameplayZoneMovePolicy {
	allowedPhases: GameplayPhase[];
	actorMustBeCurrentPlayer: boolean;
	sourceMustBelongToActor: boolean;
	sourceZoneAllowlist: string[];
	targetZoneAllowlist: string[];
	minCards: number;
	maxCards?: number;
}

export interface GameplayRoundPolicy {
	enabled: boolean;
	rotateDealerBetweenRounds: boolean;
	clearTableZonesOnRoundStart: string[];
}

export interface GameplayRulePack {
	schemaVersion: 'gameplay/v0';
	capabilities: GameplayRuleCapability[];
	phases: GameplayPhase[];
	startingPhase: GameplayPhase;
	startingTurnIndex: number;
	handZoneName: string;
	phaseTransitions: Record<GameplayPhase, GameplayPhase[]>;
	phaseAfterRoundStart: GameplayPhase;
	phaseAfterRoundEnd: GameplayPhase;
	turnPolicy: {
		direction: 1 | -1;
	};
	zoneMovePolicy: GameplayZoneMovePolicy;
	roundPolicy: GameplayRoundPolicy;
}

export interface GameplayValidationIssue {
	code: string;
	message: string;
}

export interface GameTraceEntry {
	eventIndex: number;
	stage: 'validate' | 'move' | 'turn' | 'phase' | 'round';
	message: string;
	data?: Record<string, unknown>;
}

export interface PlayerZoneState {
	[zoneName: string]: CardInput[];
}

export interface GameplayState {
	phase: GameplayPhase;
	players: string[];
	turnOrder: string[];
	currentTurnIndex: number;
	dealerIndex: number;
	roundNumber: number;
	playerZones: Record<string, PlayerZoneState>;
	tableZones: Record<string, CardInput[]>;
	validationIssues?: GameplayValidationIssue[];
	trace?: GameTraceEntry[];
}

export interface CardLocationPlayer {
	kind: 'player';
	playerId: string;
	zone: string;
}

export interface CardLocationTable {
	kind: 'table';
	zone: string;
}

export type CardLocation = CardLocationPlayer | CardLocationTable;

export interface CreateGameplayRulePackOptions {
	phases?: GameplayPhase[];
	startingPhase?: GameplayPhase;
	capabilities?: GameplayRuleCapability[];
	handZoneName?: string;
	startingTurnIndex?: number;
	phaseTransitions?: Partial<Record<GameplayPhase, GameplayPhase[]>>;
	phaseAfterRoundStart?: GameplayPhase;
	phaseAfterRoundEnd?: GameplayPhase;
	turnDirection?: 1 | -1;
	zoneMovePolicy?: Partial<GameplayZoneMovePolicy>;
	roundPolicy?: Partial<GameplayRoundPolicy>;
}

export type GameEvent =
	| {
			type: 'init_game';
			players: string[];
			turnOrder?: string[];
			dealerIndex?: number;
	  }
	| {
			type: 'start_round';
			roundIndex?: number;
	  }
	| {
			type: 'set_phase';
			phase: GameplayPhase;
	  }
	| {
			type: 'deal_cards';
			playerId: string;
			cards: CardInput[];
			zone?: string;
	  }
	| {
			type: 'zone_move';
			actorId: string;
			from: CardLocation;
			to: CardLocation;
			cards: CardInput[];
	  }
	| {
			type: 'advance_turn';
	  }
	| {
			type: 'end_round';
	  }
	| {
			type: 'undo';
	  }
	| {
			type: 'redo';
	  };

export interface DeriveGameplayStateOptions {
	trace?: boolean;
	strictValidation?: boolean;
	context?: GameActionContext;
}

const DEFAULT_PHASES: GameplayPhase[] = ['pregame', 'deal', 'play', 'scoring', 'round_end'];

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function defaultCapabilities(): GameplayRuleCapability[] {
	return ['phases:state-machine', 'turns:fixed-order', 'zones:player-owned', 'zones:table-shared', 'undo:replay'];
}

function defaultTransitions(phases: GameplayPhase[]): Record<GameplayPhase, GameplayPhase[]> {
	const transitions: Record<GameplayPhase, GameplayPhase[]> = {} as Record<GameplayPhase, GameplayPhase[]>;
	for (let i = 0; i < phases.length; i++) {
		const phase = phases[i];
		transitions[phase] = [
			...(i + 1 < phases.length ? [phases[i + 1]] : []),
			...(i > 0 ? [phases[i - 1]] : [])
		];
	}

	return transitions;
}

export function createGameplayRulePack(options: CreateGameplayRulePackOptions = {}): GameplayRulePack {
	const phases = options.phases ?? DEFAULT_PHASES;
	const phaseTransitions: Record<GameplayPhase, GameplayPhase[]> = defaultTransitions(phases);

	for (const [phase, next] of Object.entries(options.phaseTransitions ?? {}) as Array<[GameplayPhase, GameplayPhase[]]>) {
		phaseTransitions[phase] = next;
	}

	const zoneMovePolicy: GameplayZoneMovePolicy = {
		allowedPhases: ['play'],
		actorMustBeCurrentPlayer: true,
		sourceMustBelongToActor: true,
		sourceZoneAllowlist: [options.handZoneName ?? 'hand'],
		targetZoneAllowlist: ['table', 'discard', 'meld', options.handZoneName ?? 'hand'],
		minCards: 1,
		maxCards: undefined,
		...(options.zoneMovePolicy ?? {})
	};

	return {
		schemaVersion: 'gameplay/v0',
		capabilities: options.capabilities ?? defaultCapabilities(),
		phases,
		startingPhase: options.startingPhase ?? phases[0],
		startingTurnIndex: options.startingTurnIndex ?? 0,
		handZoneName: options.handZoneName ?? 'hand',
		phaseTransitions,
		phaseAfterRoundStart: options.phaseAfterRoundStart ?? 'deal',
		phaseAfterRoundEnd: options.phaseAfterRoundEnd ?? 'round_end',
		turnPolicy: {
			direction: options.turnDirection ?? 1
		},
		zoneMovePolicy,
		roundPolicy: {
			enabled: true,
			rotateDealerBetweenRounds: true,
			clearTableZonesOnRoundStart: ['table', 'discard', 'meld'],
			...(options.roundPolicy ?? {})
		}
	};
}

function cloneCards(cards: CardInput[]): CardInput[] {
	return cards.map((card) => ({ ...card, tags: card.tags ? [...card.tags] : undefined }));
}

function deepCardEqual(left: unknown, right: unknown): boolean {
	if (left === right) {
		return true;
	}
	if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
		return false;
	}

	const leftCard = left as Record<string, unknown>;
	const rightCard = right as Record<string, unknown>;

	if (leftCard.rank !== rightCard.rank || leftCard.suit !== rightCard.suit) {
		return false;
	}

	const leftTags = (leftCard.tags as string[] | undefined) ?? [];
	const rightTags = (rightCard.tags as string[] | undefined) ?? [];
	if (leftTags.length !== rightTags.length) {
		return false;
	}

	for (let i = 0; i < leftTags.length; i++) {
		if (leftTags[i] !== rightTags[i]) {
			return false;
		}
	}

	return true;
}

function emitTrace(
	trace: GameTraceEntry[] | undefined,
	eventIndex: number,
	stage: GameTraceEntry['stage'],
	message: string,
	data?: Record<string, unknown>
): void {
	if (!trace) {
		return;
	}
	trace.push({ eventIndex, stage, message, ...(data ? { data } : {}) } as GameTraceEntry);
}

function validateGameplayRulePack(rulePack: unknown): GameplayValidationIssue[] {
	const issues: GameplayValidationIssue[] = [];
	const typedRulePack = rulePack as Record<string, unknown>;
	if (!isObject(rulePack)) {
		issues.push({ code: 'schema_not_object', message: 'Rule pack must be an object' });
		return issues;
	}
	if (rulePack.schemaVersion !== 'gameplay/v0') {
		issues.push({
			code: 'schema_version_mismatch',
			message: `Expected schemaVersion "gameplay/v0" but received "${String((rulePack as { schemaVersion?: unknown }).schemaVersion ?? 'undefined')}"`
		});
	}
	if (!Array.isArray(rulePack.phases) || rulePack.phases.length === 0) {
		issues.push({ code: 'missing_phases', message: 'phases must be a non-empty array' });
	}
	if (rulePack.startingPhase === undefined) {
		issues.push({ code: 'missing_starting_phase', message: 'startingPhase is required' });
	}
	if (rulePack.handZoneName === undefined) {
		issues.push({ code: 'missing_hand_zone', message: 'handZoneName is required' });
	}
	if (
		typedRulePack.startingTurnIndex !== undefined &&
		(typeof typedRulePack.startingTurnIndex !== 'number' ||
			!Number.isInteger(typedRulePack.startingTurnIndex) ||
			typedRulePack.startingTurnIndex < 0)
	) {
		issues.push({ code: 'invalid_starting_turn_index', message: 'startingTurnIndex must be a non-negative integer' });
	}
	if (!typedRulePack.roundPolicy || !isObject(typedRulePack.roundPolicy)) {
		issues.push({ code: 'missing_round_policy', message: 'roundPolicy is required' });
	} else {
		const roundPolicy = typedRulePack.roundPolicy as Record<string, unknown>;
		if (roundPolicy.enabled !== undefined && typeof roundPolicy.enabled !== 'boolean') {
			issues.push({ code: 'invalid_round_policy_enabled', message: 'roundPolicy.enabled must be boolean' });
		}
	}
	if (!typedRulePack.turnPolicy || !isObject(typedRulePack.turnPolicy)) {
		issues.push({ code: 'missing_turn_policy', message: 'turnPolicy is required' });
	} else if ((typedRulePack.turnPolicy as Record<string, unknown>).direction !== 1 && (typedRulePack.turnPolicy as Record<string, unknown>).direction !== -1) {
		issues.push({ code: 'invalid_turn_direction', message: 'turnPolicy.direction must be 1 or -1' });
	}
	if (!typedRulePack.zoneMovePolicy || !isObject(typedRulePack.zoneMovePolicy)) {
		issues.push({ code: 'missing_zone_move_policy', message: 'zoneMovePolicy is required' });
	} else if (!Array.isArray((typedRulePack.zoneMovePolicy as Record<string, unknown>).allowedPhases)) {
		issues.push({ code: 'invalid_zone_move_policy', message: 'zoneMovePolicy.allowedPhases must be an array of phases' });
	}
	return issues;
}

function initializePlayerZones(playerIds: string[], handZoneName: string): Record<string, PlayerZoneState> {
	const playerZones: Record<string, PlayerZoneState> = {};
	for (const playerId of playerIds) {
		playerZones[playerId] = { [handZoneName]: [] };
	}
	return playerZones;
}

function getZoneCards(state: GameplayState, location: CardLocation): CardInput[] | undefined {
	if (location.kind === 'player') {
		const playerZones = state.playerZones[location.playerId];
		return playerZones?.[location.zone];
	}
	return state.tableZones[location.zone];
}

function setZoneCards(state: GameplayState, location: CardLocation, cards: CardInput[]): void {
	if (location.kind === 'player') {
		const playerZones = state.playerZones[location.playerId] ?? (state.playerZones[location.playerId] = {});
		playerZones[location.zone] = cards;
		return;
	}
	state.tableZones[location.zone] = cards;
}

function ensureZone(state: GameplayState, location: CardLocation): void {
	if (location.kind === 'player') {
		const playerZones = state.playerZones[location.playerId] ?? (state.playerZones[location.playerId] = {});
		if (!playerZones[location.zone]) {
			playerZones[location.zone] = [];
		}
	} else if (!state.tableZones[location.zone]) {
		state.tableZones[location.zone] = [];
	}
}

function canPlayerMove(state: GameplayState, actorId: string): boolean {
	if (state.turnOrder.length === 0) {
		return false;
	}
	if (state.currentTurnIndex < 0 || state.currentTurnIndex >= state.turnOrder.length) {
		return false;
	}
	return state.turnOrder[state.currentTurnIndex] === actorId;
}

function removeCardsFromZone(cards: CardInput[], requested: CardInput[]): { removed: CardInput[]; remaining: CardInput[] } {
	const remaining = [...cards];
	const removed: CardInput[] = [];
	for (const requestedCard of requested) {
		const index = remaining.findIndex((candidate) => deepCardEqual(candidate, requestedCard));
		if (index === -1) {
			return { removed: [], remaining: cards };
		}
		removed.push(remaining[index]);
		remaining.splice(index, 1);
	}
	return { removed, remaining };
}

function validateGameEvent(
	event: Exclude<GameEvent, { type: 'undo' | 'redo' }>,
	rulePack: GameplayRulePack,
	state: GameplayState
): GameplayValidationIssue[] {
	const issues: GameplayValidationIssue[] = [];

	if (event.type === 'init_game') {
		if (!Array.isArray(event.players) || event.players.length === 0) {
			issues.push({ code: 'init_game_no_players', message: 'init_game requires at least one player' });
		}
		if (state.players.length > 0) {
			issues.push({ code: 'init_game_duplicate', message: 'init_game can only be called once' });
		}
		if (event.turnOrder && event.turnOrder.some((playerId) => !event.players.includes(playerId))) {
			issues.push({ code: 'turn_order_unknown_player', message: 'turnOrder contains player not in players list' });
		}
		return issues;
	}

	if (state.players.length === 0) {
		issues.push({ code: 'no_game_initialized', message: `Event \"${event.type}\" requires game initialization` });
		return issues;
	}

	if (event.type === 'start_round') {
		if (!rulePack.roundPolicy.enabled) {
			issues.push({ code: 'rounds_disabled', message: 'start_round is disabled by rule pack' });
		}
		if (state.turnOrder.length < 2) {
			issues.push({ code: 'invalid_player_count', message: 'Need at least two players to rotate turns' });
		}
		return issues;
	}

	if (event.type === 'set_phase') {
		if (!rulePack.phases.includes(event.phase)) {
			issues.push({ code: 'invalid_phase', message: `Phase \"${event.phase}\" is not recognized` });
		} else {
			const allowed = rulePack.phaseTransitions[state.phase] ?? [];
			if (!allowed.includes(event.phase) && state.phase !== event.phase) {
				issues.push({ code: 'illegal_phase_transition', message: `Cannot transition phase ${state.phase} -> ${event.phase}` });
			}
		}
		return issues;
	}

	if (event.type === 'deal_cards') {
		if (!state.players.includes(event.playerId)) {
			issues.push({ code: 'unknown_player', message: `Player \"${event.playerId}\" is not in the game` });
		}
		if (!Array.isArray(event.cards) || event.cards.length === 0) {
			issues.push({ code: 'empty_deal', message: 'deal_cards requires at least one card' });
		}
		return issues;
	}

	if (event.type === 'zone_move') {
		const policy = rulePack.zoneMovePolicy;
		if (!policy.allowedPhases.includes(state.phase)) {
			issues.push({ code: 'illegal_zone_move_phase', message: `zone_move is not allowed in phase \"${state.phase}\"` });
		}
		if (policy.actorMustBeCurrentPlayer && !canPlayerMove(state, event.actorId)) {
			issues.push({ code: 'not_current_player', message: `Player \"${event.actorId}\" is not the current player` });
		}
		if (event.from.kind === 'player' && policy.sourceMustBelongToActor && event.from.playerId !== event.actorId) {
			issues.push({ code: 'zone_not_owned', message: `Cards can only be moved from current actor's player zones` });
		}
		if (event.from.kind === 'player' && !state.playerZones[event.from.playerId]) {
			issues.push({ code: 'unknown_player', message: `Unknown player zone for \"${event.from.playerId}\"` });
		}
		if (!policy.sourceZoneAllowlist.includes(event.from.zone)) {
			issues.push({ code: 'illegal_source_zone', message: `source zone \"${event.from.zone}\" is not allowed` });
		}
		if (!policy.targetZoneAllowlist.includes(event.to.zone)) {
			issues.push({ code: 'illegal_target_zone', message: `target zone \"${event.to.zone}\" is not allowed` });
		}
		if (event.cards.length < policy.minCards) {
			issues.push({ code: 'too_few_cards', message: `zone_move requires at least ${policy.minCards} cards` });
		}
		if (typeof policy.maxCards === 'number' && event.cards.length > policy.maxCards) {
			issues.push({ code: 'too_many_cards', message: `zone_move allows at most ${policy.maxCards} cards` });
		}

		const sourceCards = getZoneCards(state, event.from);
		if (!sourceCards) {
			issues.push({ code: 'missing_source_zone', message: `Source zone ${event.from.kind === 'player' ? `${event.from.playerId}:${event.from.zone}` : `table:${event.from.zone}`} does not exist` });
		} else {
			const { remaining } = removeCardsFromZone(sourceCards, event.cards);
			if (remaining.length === sourceCards.length) {
				issues.push({ code: 'source_card_missing', message: 'Requested card(s) are not in source zone' });
			}
		}

		return issues;
	}

	if (event.type === 'advance_turn') {
		if (state.turnOrder.length === 0) {
			issues.push({ code: 'no_turn_order', message: 'turnOrder is empty' });
		}
		return issues;
	}

	if (event.type === 'end_round') {
		return issues;
	}

	return issues;
}

function applyGameEvent(
	state: GameplayState,
	event: Exclude<GameEvent, { type: 'undo' | 'redo' }>,
	rulePack: GameplayRulePack,
	trace: GameTraceEntry[] | undefined,
	eventIndex: number
): void {
	if (event.type === 'init_game') {
		state.players = [...new Set(event.players)];
		state.turnOrder = event.turnOrder && event.turnOrder.length > 0 ? [...event.turnOrder] : [...state.players];
		state.dealerIndex = event.dealerIndex ?? rulePack.startingTurnIndex;
		if (state.dealerIndex < 0 || state.dealerIndex >= state.turnOrder.length) {
			state.dealerIndex = 0;
		}
		state.currentTurnIndex = state.dealerIndex;
		state.roundNumber = 0;
		state.phase = rulePack.startingPhase;
		state.playerZones = initializePlayerZones(state.players, rulePack.handZoneName);
		state.tableZones = { table: [], discard: [], meld: [] };
		emitTrace(trace, eventIndex, 'turn', 'game initialized', { players: state.players.length });
		return;
	}

	if (event.type === 'start_round') {
		if (!rulePack.roundPolicy.enabled) {
			return;
		}

		state.roundNumber = event.roundIndex ?? state.roundNumber + 1;
		if (rulePack.roundPolicy.rotateDealerBetweenRounds && state.turnOrder.length > 0) {
			state.dealerIndex = (state.dealerIndex + 1) % state.turnOrder.length;
		}
		if (state.turnOrder.length > 0) {
			state.currentTurnIndex = (state.dealerIndex + 1) % state.turnOrder.length;
		}
		state.phase = rulePack.phaseAfterRoundStart;
		for (const zone of rulePack.roundPolicy.clearTableZonesOnRoundStart) {
			state.tableZones[zone] = [];
		}
		emitTrace(trace, eventIndex, 'round', 'round started', { roundNumber: state.roundNumber, dealerIndex: state.dealerIndex });
		return;
	}

	if (event.type === 'set_phase') {
		state.phase = event.phase;
		emitTrace(trace, eventIndex, 'phase', 'phase set', { phase: event.phase });
		return;
	}

	if (event.type === 'deal_cards') {
		const zoneName = event.zone ?? rulePack.handZoneName;
		const playerZones = state.playerZones[event.playerId] ?? (state.playerZones[event.playerId] = { [rulePack.handZoneName]: [] });
		if (!playerZones[zoneName]) {
			playerZones[zoneName] = [];
		}
		playerZones[zoneName] = [...playerZones[zoneName], ...cloneCards(event.cards)];
		emitTrace(trace, eventIndex, 'move', 'cards dealt', { playerId: event.playerId, zone: zoneName });
		return;
	}

	if (event.type === 'zone_move') {
		const sourceCards = getZoneCards(state, event.from);
		if (!sourceCards) {
			return;
		}
		const removeResult = removeCardsFromZone(sourceCards, event.cards);
		if (removeResult.removed.length !== event.cards.length) {
			return;
		}
		setZoneCards(state, event.from, removeResult.remaining);
		ensureZone(state, event.to);
		const targetCards = getZoneCards(state, event.to) ?? [];
		setZoneCards(state, event.to, [...targetCards, ...cloneCards(removeResult.removed)]);
		emitTrace(trace, eventIndex, 'move', 'zone move applied', {
			actorId: event.actorId,
			from: event.from,
			to: event.to,
			count: removeResult.removed.length
		});
		return;
	}

	if (event.type === 'advance_turn') {
		state.currentTurnIndex = (state.currentTurnIndex + rulePack.turnPolicy.direction + state.turnOrder.length) % state.turnOrder.length;
		emitTrace(trace, eventIndex, 'turn', 'turn advanced');
		return;
	}

	if (event.type === 'end_round') {
		state.phase = rulePack.phaseAfterRoundEnd;
		emitTrace(trace, eventIndex, 'round', 'round ended');
		return;
	}
}

export function deriveGameState(
	events: GameEvent[],
	rulePack: unknown = createGameplayRulePack(),
	options: DeriveGameplayStateOptions = {}
): GameplayState {
	const validationIssues = validateGameplayRulePack(rulePack);
	const trace = options.trace ? [] : undefined;

	if (validationIssues.length > 0 && options.strictValidation) {
		throw new Error(`Gameplay rule pack validation failed: ${validationIssues.map((issue) => issue.code).join(', ')}`);
	}

	const state: GameplayState = {
		phase: DEFAULT_PHASES[0],
		players: [],
		turnOrder: [],
		currentTurnIndex: -1,
		dealerIndex: -1,
		roundNumber: 0,
		playerZones: {},
		tableZones: {}
	};

	if (validationIssues.length > 0) {
		if (trace) {
			state.trace = validationIssues.map((issue) => ({ eventIndex: -1, stage: 'validate', message: issue.message, data: { code: issue.code } }));
		}
		return { ...state, validationIssues };
	}

	const resolvedRulePack = rulePack as GameplayRulePack;
	const applied: Array<Exclude<GameEvent, { type: 'undo' | 'redo' }>> = [];
	const undone: Array<Exclude<GameEvent, { type: 'undo' | 'redo' }>> = [];

	events.forEach((event) => {
		if (event.type === 'undo') {
			const popped = applied.pop();
			if (popped) {
				undone.push(popped);
			}
			return;
		}

		if (event.type === 'redo') {
			const restorable = undone.pop();
			if (restorable) {
				applied.push(restorable);
			}
			return;
		}

		applied.push(event);
		undone.length = 0;
	});

	applied.forEach((event, eventIndex) => {
		const issues = validateGameEvent(event, resolvedRulePack, state);
		if (issues.length > 0) {
			for (const issue of issues) {
				validationIssues.push(issue);
				if (trace) {
					emitTrace(trace, eventIndex, 'validate', issue.message, { code: issue.code, eventType: event.type });
				}
			}
			return;
		}

		applyGameEvent(state, event, resolvedRulePack, trace, eventIndex);
	});

	if (trace) {
		state.trace = trace;
	}

	if (validationIssues.length > 0) {
		state.validationIssues = validationIssues;
	}

	return state;
}

export const GAMEPLAY_V0_DEFAULT_RULES = createGameplayRulePack();
