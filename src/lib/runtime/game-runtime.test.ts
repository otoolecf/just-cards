import { describe, expect, it } from 'vitest';

import { createGameplayRulePack, type GameEvent } from '$lib/gameplay/engine';
import { createPatternDetectorRulePack } from '$lib/gameplay/pattern-detector';
import { createValidatorRulePack } from '$lib/gameplay/validator';
import { createRulePack, type ScoreEvent } from '$lib/scorekeeper/engine';
import { deriveGameRuntimeState, type RuntimeEvent } from './game-runtime';

describe('game runtime', () => {
	it('runtime_zone_move_trigger_scores_event_cards_to_actor', () => {
		const events: RuntimeEvent[] = [
			{ type: 'gameplay', event: { type: 'init_game', players: ['alice', 'bob'], dealerIndex: 0 } },
			{ type: 'gameplay', event: { type: 'set_phase', phase: 'play' } },
			{
				type: 'gameplay',
				event: { type: 'deal_cards', playerId: 'alice', cards: [{ rank: 'K' }] }
			},
			{
				type: 'gameplay',
				event: {
					type: 'zone_move',
					actorId: 'alice',
					from: { kind: 'player', playerId: 'alice', zone: 'hand' },
					to: { kind: 'table', zone: 'meld' },
					cards: [{ rank: 'K' }]
				}
			}
		];

		const state = deriveGameRuntimeState(
			events,
			{
				gameplayRulePack: createGameplayRulePack({ startingPhase: 'play' }),
				scoreRulePack: createRulePack(),
				scoringTriggers: [
					{
						id: 'meld-cards-to-actor',
						when: { eventType: 'zone_move', toZones: ['meld'] },
						source: { kind: 'event_cards' },
						scorer: { kind: 'card_values' },
						target: { kind: 'actor' }
					}
				]
			}
		);

		expect(state.score.totalsByPlayer.alice).toBe(13);
		expect(state.generatedScoreEvents).toHaveLength(1);
	});

	it('runtime_end_round_trigger_scores_all_player_hand_zones', () => {
		const events: RuntimeEvent[] = [
			{ type: 'gameplay', event: { type: 'init_game', players: ['alice', 'bob'], dealerIndex: 0 } },
			{
				type: 'gameplay',
				event: { type: 'deal_cards', playerId: 'alice', cards: [{ rank: '2' }, { rank: '3' }] }
			},
			{
				type: 'gameplay',
				event: { type: 'deal_cards', playerId: 'bob', cards: [{ rank: 'K' }] }
			},
			{ type: 'gameplay', event: { type: 'end_round' } }
		];

		const state = deriveGameRuntimeState(events, {
			gameplayRulePack: createGameplayRulePack(),
			scoreRulePack: createRulePack(),
			scoringTriggers: [
				{
					id: 'round-score-hands',
					when: { eventType: 'end_round' },
					source: { kind: 'player_zone', zone: 'hand', players: 'all' },
					scorer: { kind: 'card_values' },
					target: { kind: 'source_player' }
				}
			]
		});

		expect(state.score.totalsByPlayer.alice).toBe(5);
		expect(state.score.totalsByPlayer.bob).toBe(13);
	});

	it('runtime_pattern_trigger_scores_detected_matches', () => {
		const pairPatternPack = createPatternDetectorRulePack({
			patterns: [{ id: 'pair', match: { kind: 'all_same_rank', minCards: 2, maxCards: 2 } }]
		});

		const events: RuntimeEvent[] = [
			{ type: 'gameplay', event: { type: 'init_game', players: ['alice', 'bob'], dealerIndex: 0 } },
			{ type: 'gameplay', event: { type: 'set_phase', phase: 'play' } },
			{
				type: 'gameplay',
				event: { type: 'deal_cards', playerId: 'alice', cards: [{ rank: '7' }, { rank: '7' }] }
			},
			{
				type: 'gameplay',
				event: {
					type: 'zone_move',
					actorId: 'alice',
					from: { kind: 'player', playerId: 'alice', zone: 'hand' },
					to: { kind: 'table', zone: 'meld' },
					cards: [{ rank: '7' }, { rank: '7' }]
				}
			}
		];

		const state = deriveGameRuntimeState(events, {
			gameplayRulePack: createGameplayRulePack({ startingPhase: 'play' }),
			scoreRulePack: createRulePack(),
			scoringTriggers: [
				{
					id: 'pair-score',
					when: { eventType: 'zone_move', toZones: ['meld'] },
					source: { kind: 'event_cards' },
					scorer: {
						kind: 'pattern',
						patternPack: pairPatternPack,
						patternScoring: [{ patternId: 'pair', points: 10 }]
					},
					target: { kind: 'actor' }
				}
			]
		});

		expect(state.score.totalsByPlayer.alice).toBe(10);
	});

	it('runtime_manual_scoring_works_without_gameplay_events', () => {
		const state = deriveGameRuntimeState(
			[
				{
					type: 'manual_score',
					entries: [
						{ target: { kind: 'player', id: 'alice' }, delta: 7 },
						{ target: { kind: 'team', id: 'north_south' }, delta: 4 }
					]
				}
			],
			{
				scoreRulePack: createRulePack()
			}
		);

		expect(state.gameplay.players).toEqual([]);
		expect(state.score.totalsByPlayer.alice).toBe(7);
		expect(state.score.totalsByTarget['team:north_south']).toBe(4);
	});

	it('runtime_supports_rummy_style_set_or_run_play_validation', () => {
		const rummyValidator = createValidatorRulePack({
			canPlay: [
				{
					id: 'set-or-run',
					predicate: { actionTypes: ['meld'] },
					match: {
						kind: 'any',
						matches: [
							{ kind: 'all_same_rank', minCards: 3 },
							{ kind: 'run', minCards: 3 }
						]
					},
					failureCode: 'invalid_meld'
				}
			],
			requireRules: true
		});

		const gameplayEvents: GameEvent[] = [
			{ type: 'init_game', players: ['alice', 'bob'], dealerIndex: 0 },
			{ type: 'set_phase', phase: 'play' },
			{ type: 'deal_cards', playerId: 'alice', cards: [{ rank: '2' }, { rank: '3' }, { rank: '7' }] },
			{
				type: 'zone_move',
				actorId: 'alice',
				from: { kind: 'player', playerId: 'alice', zone: 'hand' },
				to: { kind: 'table', zone: 'meld' },
				cards: [{ rank: '2' }, { rank: '3' }, { rank: '7' }]
			}
		];

		const state = deriveGameRuntimeState(
			gameplayEvents.map((event) => ({ type: 'gameplay', event })),
			{
				gameplayRulePack: createGameplayRulePack({ startingPhase: 'play' }),
				validatorRulePack: rummyValidator,
				validatorZoneMoveActionType: 'meld',
				scoreRulePack: createRulePack(),
				scoringTriggers: [
					{
						id: 'score-meld-cards',
						when: { eventType: 'zone_move', toZones: ['meld'] },
						source: { kind: 'event_cards' },
						scorer: { kind: 'card_values' },
						target: { kind: 'actor' }
					}
				]
			}
		);

		expect(state.gameplay.validationIssues?.some((issue) => issue.code === 'play_validation_failed')).toBe(true);
		expect(state.gameplay.playerZones.alice.hand).toEqual([{ rank: '2' }, { rank: '3' }, { rank: '7' }]);
		expect(state.score.totalsByPlayer.alice ?? 0).toBe(0);
	});

	it('runtime_supports_direct_score_events_in_stream', () => {
		const events: RuntimeEvent[] = [
			{
				type: 'score',
				event: {
					type: 'add_round',
					playerCards: { alice: [{ rank: 'Q' }] }
				} as ScoreEvent
			}
		];

		const state = deriveGameRuntimeState(events, {
			scoreRulePack: createRulePack()
		});

		expect(state.score.totalsByPlayer.alice).toBe(12);
	});
});
