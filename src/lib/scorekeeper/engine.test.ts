import { describe, expect, it } from 'vitest';

import { cardValue, createRulePack, deriveState, type ScoreEvent, validateRulePack } from './engine';
import { createPatternDetectorRulePack } from '$lib/gameplay/pattern-detector';

const baseValidSchema = {
	baseAceValue: 1,
	capabilities: [
		'value:base-ranks',
		'value:modifier-set',
		'value:op-algebra',
		'routing:target-kinds',
		'settlement:pool-transfer',
		'trace:explain'
	],
	rankValues: {
		2: 2,
		3: 3,
		4: 4,
		5: 5,
		6: 6,
		7: 7,
		8: 8,
		9: 9,
		10: 10,
		J: 11,
		Q: 12,
		K: 13
	},
	modifiers: [],
	modifierResolution: 'last_match_wins' as const,
	schemaVersion: 'rulepack/v0'
};

describe('scorekeeper engine', () => {
	it('card_value_uses_default_rank_values_when_no_modifiers_match', () => {
		const rules = createRulePack();

		expect(cardValue({ rank: 'A' }, rules)).toBe(1);
		expect(cardValue({ rank: 'J' }, rules)).toBe(11);
		expect(cardValue({ rank: 'Q' }, rules)).toBe(12);
		expect(cardValue({ rank: 'K' }, rules)).toBe(13);
	});

	it('card_value_modifier_can_set_non_face_cards_to_5', () => {
		const rules = createRulePack({
			modifiers: [{ id: 'non-face-5', when: { kind: 'is_face', value: false }, value: 5 }]
		});

		expect(cardValue({ rank: '2' }, rules)).toBe(5);
		expect(cardValue({ rank: '9' }, rules)).toBe(5);
		expect(cardValue({ rank: 'J' }, rules)).toBe(11);
	});

	it('card_value_supports_operation_algebra_add_and_multiply', () => {
		const rules = createRulePack({
			modifiers: [
				{ id: 'add-3', when: { kind: 'rank_is', rank: '2' }, operation: { kind: 'add', value: 3 } },
				{
					id: 'double',
					when: { kind: 'rank_is', rank: '2' },
					operation: { kind: 'multiply', value: 2 }
				}
			]
		});

		expect(cardValue({ rank: '2' }, rules)).toBe(10);
	});

	it('card_value_supports_operation_algebra_clamps', () => {
		const rules = createRulePack({
			modifiers: [
				{
					id: 'cap-face-at-10',
					when: { kind: 'is_face', value: true },
					operation: { kind: 'clamp_max', value: 10 }
				},
				{
					id: 'min-two-at-0',
					when: { kind: 'rank_is', rank: '2' },
					operation: { kind: 'clamp_min', value: 0 }
				}
			]
		});

		expect(cardValue({ rank: 'K' }, rules)).toBe(10);
		expect(cardValue({ rank: '2' }, rules)).toBe(2);
	});

	it('card_value_context_tag_predicate_applies_modifiers', () => {
		const rules = createRulePack({
			modifiers: [
				{
					id: 'double-during-bonus',
					when: { kind: 'context_has_tag', tag: 'bonus_phase' },
					operation: { kind: 'multiply', value: 2 }
				}
			]
		});

		expect(cardValue({ rank: '5' }, rules, { tags: ['bonus_phase'] })).toBe(10);
		expect(cardValue({ rank: '5' }, rules)).toBe(5);
	});

	it('card_value_first_match_resolution_stops_on_first_match', () => {
		const rules = createRulePack({
			modifierResolution: 'first_match_wins',
			modifiers: [
				{ id: 'set-five', when: { kind: 'rank_is', rank: '2' }, operation: { kind: 'set', value: 5 } },
				{
					id: 'set-nine',
					when: { kind: 'rank_is', rank: '2' },
					operation: { kind: 'set', value: 9 }
				}
			]
		});

		expect(cardValue({ rank: '2' }, rules)).toBe(5);
	});

	it('validate_rulepack_detects_missing_capability_for_operation_algebra', () => {
		const rules = createRulePack({
			capabilities: ['value:base-ranks', 'value:modifier-set'],
			modifiers: [
				{
					id: 'add-one',
					when: { kind: 'rank_is', rank: '2' },
					operation: { kind: 'add', value: 1 }
				}
			]
		});

		const issues = validateRulePack(rules);
		expect(issues.some((issue) => issue.code === 'missing_capability_value_op_algebra')).toBe(true);
	});

	it('validate_rulepack_detects_non_object_input', () => {
		const issues = validateRulePack('not-an-object');

		expect(issues.length).toBeGreaterThan(0);
		expect(issues.some((issue) => issue.code === 'schema:type_mismatch')).toBe(true);
	});

	it('validate_rulepack_detects_invalid_schema_version', () => {
		const invalidSchema = {
			...baseValidSchema,
			schemaVersion: 'rulepack/v1'
		};
		const issues = validateRulePack(invalidSchema);

		expect(issues.some((issue) => issue.code === 'schema:const_mismatch')).toBe(true);
	});

	it('validate_rulepack_detects_malformed_modifier_predicate', () => {
		const invalidSchema = {
			...baseValidSchema,
			modifiers: [{ id: 'bad-predicate', when: { kind: 'rank_is' }, operation: { kind: 'set', value: 2 } }]
		};
		const issues = validateRulePack(invalidSchema);

		expect(issues.some((issue) => issue.code === 'schema:one_of_no_match')).toBe(true);
	});

	it('derive_state_returns_empty_totals_for_schema_failures', () => {
		const invalidSchema = {
			schemaVersion: 'rulepack/v1',
			capabilities: ['value:base-ranks'],
			baseAceValue: 1,
			rankValues: { 2: 2 },
			modifiers: [],
			modifierResolution: 'last_match_wins'
		};

		const state = deriveState([], invalidSchema);

		expect(state.totalsByTarget).toEqual({});
		expect(state.totalsByPlayer).toEqual({});
		expect(state.validationIssues?.length).toBeGreaterThan(0);
	});

	it('derive_state_throws_with_strict_validation_for_schema_failures', () => {
		const invalidSchema = {
			schemaVersion: 'rulepack/v1',
			capabilities: ['value:base-ranks'],
			baseAceValue: 1,
			rankValues: { 2: 2 },
			modifiers: [],
			modifierResolution: 'last_match_wins'
		};

		expect(() => deriveState([], invalidSchema, { strictValidation: true })).toThrow('schema:');
	});

	it('card_value_modifier_can_set_face_cards_to_10', () => {
		const rules = createRulePack({
			modifiers: [{ id: 'face-10', when: { kind: 'is_face', value: true }, value: 10 }]
		});

		expect(cardValue({ rank: 'J' }, rules)).toBe(10);
		expect(cardValue({ rank: 'Q' }, rules)).toBe(10);
		expect(cardValue({ rank: 'K' }, rules)).toBe(10);
	});

	it('card_value_modifier_allows_specific_override_after_general_override', () => {
		const rules = createRulePack({
			modifiers: [
				{ id: 'non-face-5', when: { kind: 'is_face', value: false }, value: 5 },
				{ id: 'twos-minus-2', when: { kind: 'rank_is', rank: '2' }, value: -2 }
			]
		});

		expect(cardValue({ rank: '7' }, rules)).toBe(5);
		expect(cardValue({ rank: '2' }, rules)).toBe(-2);
	});

	it('card_value_modifier_allows_designator_tags', () => {
		const rules = createRulePack({
			modifiers: [{ id: 'ace-high-tag', when: { kind: 'has_tag', tag: 'ace_high' }, value: 14 }]
		});

		expect(cardValue({ rank: 'A' }, rules)).toBe(1);
		expect(cardValue({ rank: 'A', tags: ['ace_high'] }, rules)).toBe(14);
	});

	it('add_round_updates_player_totals', () => {
		const rules = createRulePack({
			modifiers: [{ id: 'face-10', when: { kind: 'is_face', value: true }, value: 10 }]
		});
		const events: ScoreEvent[] = [
			{
				type: 'add_round',
				playerCards: {
					alice: [{ rank: '2' }, { rank: 'J' }],
					bob: [{ rank: '5' }, { rank: '10' }]
				}
			}
		];

		const state = deriveState(events, rules);

		expect(state.totalsByPlayer.alice).toBe(12);
		expect(state.totalsByPlayer.bob).toBe(15);
	});

	it('undo_reverts_last_round_effect', () => {
		const rules = createRulePack({
			modifiers: [{ id: 'face-10', when: { kind: 'is_face', value: true }, value: 10 }]
		});
		const events: ScoreEvent[] = [
			{
				type: 'add_round',
				playerCards: {
					alice: [{ rank: '2' }, { rank: 'J' }],
					bob: [{ rank: '5' }, { rank: '10' }]
				}
			},
			{
				type: 'undo'
			}
		];

		const state = deriveState(events, rules);

		expect(state.totalsByPlayer).toEqual({});
	});

	it('redo_reapplies_last_undone_round', () => {
		const rules = createRulePack({
			modifiers: [{ id: 'face-10', when: { kind: 'is_face', value: true }, value: 10 }]
		});
		const events: ScoreEvent[] = [
			{
				type: 'add_round',
				playerCards: {
					alice: [{ rank: '2' }, { rank: 'J' }],
					bob: [{ rank: '5' }, { rank: '10' }]
				}
			},
			{
				type: 'undo'
			},
			{
				type: 'redo'
			}
		];

		const state = deriveState(events, rules);

		expect(state.totalsByPlayer.alice).toBe(12);
		expect(state.totalsByPlayer.bob).toBe(15);
	});

	it('derive_standings_from_event_log', () => {
		const rules = createRulePack({
			modifiers: [{ id: 'face-10', when: { kind: 'is_face', value: true }, value: 10 }]
		});
		const events: ScoreEvent[] = [
			{
				type: 'add_round',
				playerCards: {
					alice: [{ rank: '2' }, { rank: 'J' }],
					bob: [{ rank: '5' }, { rank: '10' }]
				}
			},
			{
				type: 'add_round',
				playerCards: {
					alice: [{ rank: '3' }, { rank: '4' }],
					bob: [{ rank: 'Q' }]
				}
			}
		];

		const state = deriveState(events, rules);

		expect(state.totalsByPlayer.alice).toBe(19);
		expect(state.totalsByPlayer.bob).toBe(25);
	});

	it('derive_standings_with_alternate_modifiers', () => {
		const rules = createRulePack({
			modifiers: [{ id: 'non-face-5', when: { kind: 'is_face', value: false }, value: 5 }]
		});
		const events: ScoreEvent[] = [
			{
				type: 'add_round',
				playerCards: {
					alice: [{ rank: 'A' }, { rank: 'J' }],
					bob: [{ rank: 'Q' }, { rank: 'K' }]
				}
			}
		];

		const state = deriveState(events, rules);

		expect(state.totalsByPlayer.alice).toBe(16);
		expect(state.totalsByPlayer.bob).toBe(25);
	});

	it('derive_standings_with_per_card_designator_tags', () => {
		const rules = createRulePack({
			modifiers: [
				{ id: 'non-face-5', when: { kind: 'is_face', value: false }, value: 5 },
				{ id: 'aces-default-1', when: { kind: 'is_ace', value: true }, value: 1 },
				{ id: 'ace-high-tag', when: { kind: 'has_tag', tag: 'ace_high' }, value: 14 }
			]
		});
		const events: ScoreEvent[] = [
			{
				type: 'add_round',
				playerCards: {
					alice: [{ rank: 'A' }, { rank: 'A', tags: ['ace_high'] }],
					bob: [{ rank: '9' }, { rank: 'K' }]
				}
			}
		];

		const state = deriveState(events, rules);

		expect(state.totalsByPlayer.alice).toBe(15);
		expect(state.totalsByPlayer.bob).toBe(18);
	});

	it('add_round_supports_team_scoring_targets', () => {
		const rules = createRulePack();
		const events: ScoreEvent[] = [
			{
				type: 'add_round',
				entries: [
					{
						target: { kind: 'team', id: 'north_south' },
						cards: [{ rank: '10' }, { rank: 'K' }]
					},
					{
						target: { kind: 'team', id: 'east_west' },
						cards: [{ rank: '7' }, { rank: '8' }]
					}
				]
			}
		];

		const state = deriveState(events, rules);

		expect(state.totalsByTarget['team:north_south']).toBe(23);
		expect(state.totalsByTarget['team:east_west']).toBe(15);
		expect(state.totalsByPlayer).toEqual({});
	});

	it('settle_pool_transfers_points_to_dealer_target', () => {
		const rules = createRulePack();
		const events: ScoreEvent[] = [
			{
				type: 'add_round',
				entries: [
					{
						target: { kind: 'pool', id: 'crib' },
						cards: [{ rank: 'Q' }, { rank: 'K' }]
					}
				]
			},
			{
				type: 'settle_pool',
				fromPoolId: 'crib',
				toTarget: { kind: 'player', id: 'dealer' }
			}
		];

		const state = deriveState(events, rules);

		expect(state.totalsByTarget['pool:crib']).toBe(0);
		expect(state.totalsByTarget['player:dealer']).toBe(25);
		expect(state.totalsByPlayer.dealer).toBe(25);
	});

	it('undo_redo_handles_pool_settlement_events', () => {
		const rules = createRulePack();
		const events: ScoreEvent[] = [
			{
				type: 'add_round',
				entries: [
					{
						target: { kind: 'pool', id: 'kitty' },
						cards: [{ rank: '9' }, { rank: 'A' }]
					}
				]
			},
			{
				type: 'settle_pool',
				fromPoolId: 'kitty',
				toTarget: { kind: 'team', id: 'north_south' }
			},
			{
				type: 'undo'
			},
			{
				type: 'redo'
			}
		];

		const state = deriveState(events, rules);

		expect(state.totalsByTarget['pool:kitty']).toBe(0);
		expect(state.totalsByTarget['team:north_south']).toBe(10);
	});

	it('derive_state_emits_trace_entries_when_enabled', () => {
		const rules = createRulePack({
			modifiers: [{ id: 'face-10', when: { kind: 'is_face', value: true }, value: 10 }]
		});
		const events: ScoreEvent[] = [
			{
				type: 'add_round',
				playerCards: {
					alice: [{ rank: 'J' }]
				}
			}
		];

		const state = deriveState(events, rules, { trace: true });

		expect(state.trace).toBeDefined();
		expect(state.trace?.some((entry) => entry.stage === 'detect')).toBe(true);
		expect(state.trace?.some((entry) => entry.stage === 'score')).toBe(true);
		expect(state.trace?.some((entry) => entry.stage === 'route')).toBe(true);
	});

	it('add_pattern_round_scores_matched_patterns_by_rule_id', () => {
		const patternPack = createPatternDetectorRulePack({
			patterns: [
				{
					id: 'pair',
					match: { kind: 'all_same_rank', minCards: 2, maxCards: 2 },
					maxMatches: 1
				},
				{
					id: 'run',
					match: { kind: 'run', minCards: 3, maxCards: 3 },
					maxMatches: 1
				}
			]
		});

		const state = deriveState(
			[
				{
					type: 'add_pattern_round',
					patternPack,
					patternScoring: [
						{ patternId: 'pair', points: 10 },
						{ patternId: 'run', points: 5 }
					],
					entries: [
						{
							target: { kind: 'player', id: 'alice' },
							cards: [{ rank: '2' }, { rank: '2' }, { rank: '4' }, { rank: '5' }, { rank: '6' }]
						}
					]
				}
			],
			createRulePack()
		);

		expect(state.totalsByPlayer.alice).toBe(15);
	});

	it('add_pattern_round_reports_unmapped_pattern_as_validation_issue', () => {
		const patternPack = createPatternDetectorRulePack({
			patterns: [
				{
					id: 'pair',
					match: { kind: 'all_same_rank', minCards: 2, maxCards: 2 },
					maxMatches: 1
				}
			]
		});

		const state = deriveState(
			[
				{
					type: 'add_pattern_round',
					patternPack,
					patternScoring: [{ patternId: 'run', points: 4 }],
					entries: [
						{
							target: { kind: 'player', id: 'alice' },
							cards: [{ rank: '7' }, { rank: '7' }, { rank: '8' }]
						}
					]
				}
			],
			createRulePack()
		);

		expect(state.totalsByPlayer.alice).toBe(0);
		expect(state.validationIssues?.some((issue) => issue.code === 'pattern:unmapped_pattern')).toBe(true);
	});

	it('derive_state_emits_pattern_trace_when_enabled', () => {
		const patternPack = createPatternDetectorRulePack({
			patterns: [
				{
					id: 'pair',
					match: { kind: 'all_same_rank', minCards: 2, maxCards: 2 },
					maxMatches: 1
				}
			]
		});

		const state = deriveState(
			[
				{
					type: 'add_pattern_round',
					patternPack,
					patternScoring: [{ patternId: 'pair', points: 3 }],
					entries: [
						{
							target: { kind: 'player', id: 'alice' },
							cards: [{ rank: '9' }, { rank: '9' }]
						}
					]
				}
			],
			createRulePack(),
			{ trace: true }
		);

		expect(state.trace).toBeDefined();
		expect(state.trace?.some((entry) => entry.stage === 'detect')).toBe(true);
		expect(state.trace?.some((entry) => entry.stage === 'score')).toBe(true);
		expect(state.trace?.some((entry) => entry.stage === 'route')).toBe(true);
	});
});
