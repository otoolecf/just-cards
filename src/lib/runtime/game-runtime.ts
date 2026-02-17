import {
	createGameplayRulePack,
	deriveGameState,
	type GameEvent,
	type GameplayRulePack,
	type GameplayState
} from '$lib/gameplay/engine';
import type { PatternMatchOptions, PatternRulePack } from '$lib/gameplay/pattern-detector';
import type { ValidatorRulePack } from '$lib/gameplay/validator';
import {
	createRulePack,
	deriveState,
	type CardInput,
	type DeltaEntry,
	type PatternScoringRule,
	type ScoreEvent,
	type ScoreState,
	type ScoringTarget
} from '$lib/scorekeeper/engine';

type GameplayMutationEvent = Exclude<GameEvent, { type: 'undo' | 'redo' }>;

export type RuntimeEvent =
	| {
			type: 'gameplay';
			event: GameEvent;
	  }
	| {
			type: 'score';
			event: ScoreEvent;
	  }
	| {
			type: 'manual_score';
			entries: DeltaEntry[];
	  };

export interface RuntimeScoringTrigger {
	id: string;
	when: {
		eventType: GameplayMutationEvent['type'];
		phases?: string[];
		fromZones?: string[];
		toZones?: string[];
	};
	source:
		| {
				kind: 'event_cards';
		  }
		| {
				kind: 'player_zone';
				zone: string;
				players: 'all' | 'actor' | 'current_player' | string[];
		  };
	scorer:
		| {
				kind: 'card_values';
		  }
		| {
				kind: 'pattern';
				patternPack: PatternRulePack;
				patternScoring: PatternScoringRule[];
				matchOptions?: PatternMatchOptions;
		  }
		| {
				kind: 'fixed';
				points: number;
		  };
	target:
		| {
				kind: 'actor';
		  }
		| {
				kind: 'source_player';
		  }
		| {
				kind: 'static';
				target: ScoringTarget;
		  };
}

export interface RuntimeRulePack {
	gameplayRulePack?: GameplayRulePack;
	validatorRulePack?: ValidatorRulePack;
	validatorZoneMoveActionType?: string;
	scoreRulePack?: unknown;
	scoringTriggers?: RuntimeScoringTrigger[];
}

export interface RuntimeDeriveOptions {
	trace?: boolean;
	strictValidation?: boolean;
}

export interface GameRuntimeState {
	gameplay: GameplayState;
	score: ScoreState;
	scoreFromGameplay: ScoreState;
	scoreDirect: ScoreState;
	generatedScoreEvents: ScoreEvent[];
	directScoreEvents: ScoreEvent[];
}

interface TriggerCardSample {
	cards: CardInput[];
	sourcePlayerId?: string;
}

function toRuntimeGameplayOptions(rulePack: RuntimeRulePack) {
	if (!rulePack.validatorRulePack) {
		return {};
	}

	return {
		playValidation: {
			rulePack: rulePack.validatorRulePack,
			zoneMoveActionType: rulePack.validatorZoneMoveActionType
		}
	};
}

function mutationEventsFromGameplayTimeline(gameplayEvents: GameEvent[]): GameplayMutationEvent[] {
	const applied: GameplayMutationEvent[] = [];
	const undone: GameplayMutationEvent[] = [];

	for (const event of gameplayEvents) {
		if (event.type === 'undo') {
			const popped = applied.pop();
			if (popped) {
				undone.push(popped);
			}
			continue;
		}
		if (event.type === 'redo') {
			const restored = undone.pop();
			if (restored) {
				applied.push(restored);
			}
			continue;
		}
		applied.push(event);
		undone.length = 0;
	}

	return applied;
}

function eventHasValidationTrace(state: GameplayState, eventIndex: number): boolean {
	return state.trace?.some((entry) => entry.stage === 'validate' && entry.eventIndex === eventIndex) ?? false;
}

function currentPlayerId(state: GameplayState): string | undefined {
	if (state.currentTurnIndex < 0 || state.currentTurnIndex >= state.turnOrder.length) {
		return undefined;
	}
	return state.turnOrder[state.currentTurnIndex];
}

function matchesTriggerEvent(event: GameplayMutationEvent, stateAfter: GameplayState, trigger: RuntimeScoringTrigger): boolean {
	if (event.type !== trigger.when.eventType) {
		return false;
	}
	if (trigger.when.phases && trigger.when.phases.length > 0 && !trigger.when.phases.includes(stateAfter.phase)) {
		return false;
	}
	if ((trigger.when.fromZones?.length ?? 0) > 0 || (trigger.when.toZones?.length ?? 0) > 0) {
		if (event.type !== 'zone_move') {
			return false;
		}
		if (trigger.when.fromZones && !trigger.when.fromZones.includes(event.from.zone)) {
			return false;
		}
		if (trigger.when.toZones && !trigger.when.toZones.includes(event.to.zone)) {
			return false;
		}
	}
	return true;
}

function collectTriggerCardSamples(
	event: GameplayMutationEvent,
	stateAfter: GameplayState,
	trigger: RuntimeScoringTrigger
): TriggerCardSample[] {
	if (trigger.source.kind === 'event_cards') {
		if (event.type !== 'zone_move' && event.type !== 'deal_cards') {
			return [];
		}
		if (event.type === 'deal_cards') {
			return [{ cards: event.cards, sourcePlayerId: event.playerId }];
		}
		return [
			{
				cards: event.cards,
				sourcePlayerId: event.from.kind === 'player' ? event.from.playerId : event.actorId
			}
		];
	}

	const sourceZone = trigger.source.zone;
	let playerIds: string[] = [];
	if (trigger.source.players === 'all') {
		playerIds = [...stateAfter.players];
	} else if (trigger.source.players === 'actor') {
		if ('actorId' in event && typeof event.actorId === 'string') {
			playerIds = [event.actorId];
		}
	} else if (trigger.source.players === 'current_player') {
		const active = currentPlayerId(stateAfter);
		if (active) {
			playerIds = [active];
		}
	} else {
		playerIds = [...trigger.source.players];
	}

	return playerIds.map((playerId) => ({
		cards: stateAfter.playerZones[playerId]?.[sourceZone] ?? [],
		sourcePlayerId: playerId
	}));
}

function resolveTriggerTarget(
	event: GameplayMutationEvent,
	sample: TriggerCardSample,
	trigger: RuntimeScoringTrigger
): ScoringTarget | null {
	if (trigger.target.kind === 'static') {
		return trigger.target.target;
	}
	if (trigger.target.kind === 'actor') {
		if (!('actorId' in event) || typeof event.actorId !== 'string') {
			return null;
		}
		return { kind: 'player', id: event.actorId };
	}
	if (!sample.sourcePlayerId) {
		return null;
	}
	return { kind: 'player', id: sample.sourcePlayerId };
}

function scoreEventsFromTrigger(
	event: GameplayMutationEvent,
	stateAfter: GameplayState,
	trigger: RuntimeScoringTrigger
): ScoreEvent[] {
	const samples = collectTriggerCardSamples(event, stateAfter, trigger);
	if (samples.length === 0) {
		return [];
	}

	if (trigger.scorer.kind === 'card_values') {
		const entries = samples
			.map((sample) => {
				const target = resolveTriggerTarget(event, sample, trigger);
				if (!target || sample.cards.length === 0) {
					return null;
				}
				return { target, cards: sample.cards };
			})
			.filter((entry): entry is { target: ScoringTarget; cards: CardInput[] } => entry !== null);
		if (entries.length === 0) {
			return [];
		}
		return [{ type: 'add_round', entries }];
	}

	if (trigger.scorer.kind === 'pattern') {
		const entries = samples
			.map((sample) => {
				const target = resolveTriggerTarget(event, sample, trigger);
				if (!target || sample.cards.length === 0) {
					return null;
				}
				return { target, cards: sample.cards };
			})
			.filter((entry): entry is { target: ScoringTarget; cards: CardInput[] } => entry !== null);
		if (entries.length === 0) {
			return [];
		}
		return [
			{
				type: 'add_pattern_round',
				patternPack: trigger.scorer.patternPack,
				patternScoring: trigger.scorer.patternScoring,
				entries,
				matchOptions: trigger.scorer.matchOptions
			}
		];
	}

	const points = trigger.scorer.points;
	const entries = samples
		.map((sample) => {
			const target = resolveTriggerTarget(event, sample, trigger);
			if (!target) {
				return null;
			}
			return { target, delta: points };
		})
		.filter((entry): entry is { target: ScoringTarget; delta: number } => entry !== null);
	if (entries.length === 0) {
		return [];
	}
	return [{ type: 'add_delta', entries }];
}

function totalsByPlayerFromTargets(totalsByTarget: Record<string, number>): Record<string, number> {
	const totalsByPlayer: Record<string, number> = {};
	for (const [key, total] of Object.entries(totalsByTarget)) {
		if (!key.startsWith('player:')) {
			continue;
		}
		totalsByPlayer[key.slice('player:'.length)] = total;
	}
	return totalsByPlayer;
}

function mergeScoreStates(left: ScoreState, right: ScoreState): ScoreState {
	const totalsByTarget: Record<string, number> = {};
	for (const [key, value] of Object.entries(left.totalsByTarget)) {
		totalsByTarget[key] = (totalsByTarget[key] ?? 0) + value;
	}
	for (const [key, value] of Object.entries(right.totalsByTarget)) {
		totalsByTarget[key] = (totalsByTarget[key] ?? 0) + value;
	}

	const merged: ScoreState = {
		totalsByTarget,
		totalsByPlayer: totalsByPlayerFromTargets(totalsByTarget)
	};

	const validationIssues = [...(left.validationIssues ?? []), ...(right.validationIssues ?? [])];
	if (validationIssues.length > 0) {
		merged.validationIssues = validationIssues;
	}

	const trace = [...(left.trace ?? []), ...(right.trace ?? [])];
	if (trace.length > 0) {
		merged.trace = trace;
	}

	return merged;
}

export function deriveGameRuntimeState(
	events: RuntimeEvent[],
	rulePack: RuntimeRulePack = {},
	options: RuntimeDeriveOptions = {}
): GameRuntimeState {
	const gameplayEvents: GameEvent[] = [];
	const directScoreEvents: ScoreEvent[] = [];

	for (const event of events) {
		if (event.type === 'gameplay') {
			gameplayEvents.push(event.event);
			continue;
		}
		if (event.type === 'score') {
			directScoreEvents.push(event.event);
			continue;
		}
		directScoreEvents.push({ type: 'add_delta', entries: event.entries });
	}

	const gameplayRulePack = rulePack.gameplayRulePack ?? createGameplayRulePack();
	const gameplayOptions = toRuntimeGameplayOptions(rulePack);
	const gameplayState = deriveGameState(gameplayEvents, gameplayRulePack, gameplayOptions);

	const appliedGameplayMutations = mutationEventsFromGameplayTimeline(gameplayEvents);
	const generatedScoreEvents: ScoreEvent[] = [];
	const triggers = rulePack.scoringTriggers ?? [];
	for (let i = 0; i < appliedGameplayMutations.length; i++) {
		const prefix = appliedGameplayMutations.slice(0, i + 1);
		const prefixState = deriveGameState(prefix, gameplayRulePack, {
			...gameplayOptions,
			trace: true
		});
		if (eventHasValidationTrace(prefixState, i)) {
			continue;
		}

		const event = appliedGameplayMutations[i];
		for (const trigger of triggers) {
			if (!matchesTriggerEvent(event, prefixState, trigger)) {
				continue;
			}
			generatedScoreEvents.push(...scoreEventsFromTrigger(event, prefixState, trigger));
		}
	}

	const scoreRulePack = rulePack.scoreRulePack ?? createRulePack();
	const scoreDirect = deriveState(directScoreEvents, scoreRulePack, options);
	const scoreFromGameplay = deriveState(generatedScoreEvents, scoreRulePack, options);
	const score = mergeScoreStates(scoreDirect, scoreFromGameplay);

	return {
		gameplay: gameplayState,
		score,
		scoreFromGameplay,
		scoreDirect,
		generatedScoreEvents,
		directScoreEvents
	};
}
