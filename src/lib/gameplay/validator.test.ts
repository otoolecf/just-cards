import { describe, expect, it } from 'vitest';

import { createValidatorRulePack, type PlayRule, validateCanPlay } from './validator';

describe('gameplay validator', () => {
	it('permits play when no rules are defined and rules are optional', () => {
		const result = validateCanPlay({ cards: [{ rank: 'A' }] }, createValidatorRulePack());

		expect(result.isValid).toBe(true);
		expect(result.issues).toEqual([]);
	});

	it('validates same-rank sets with min/max counts', () => {
		const pack = createValidatorRulePack({
			canPlay: [
				{
					id: 'set-of-3',
					match: {
						kind: 'all_same_rank',
						minCards: 3,
						maxCards: 4
					},
					failureCode: 'invalid_set'
				} as PlayRule
			]
		});

		expect(
			validateCanPlay(
				{
					actionType: 'meld',
					cards: [{ rank: 'K' }, { rank: 'K' }, { rank: 'K' }]
				},
				pack
			).isValid
		).toBe(true);

		expect(
			validateCanPlay(
				{
					actionType: 'meld',
					cards: [{ rank: 'K' }, { rank: 'K' }]
				},
				pack
			).isValid
		).toBe(false);
	});

	it('validates runs using rank order and default ace-low behavior', () => {
		const pack = createValidatorRulePack({
			canPlay: [
				{
					id: 'default-run',
					match: {
						kind: 'run',
						minCards: 3
					}
				}
			]
		});

		expect(
			validateCanPlay(
				{
					cards: [{ rank: 'A' }, { rank: '2' }, { rank: '3' }]
				},
				pack
			).isValid
		).toBe(true);

		expect(
			validateCanPlay(
				{
					cards: [{ rank: 'Q' }, { rank: 'K' }, { rank: 'A' }]
				},
				pack
			).isValid
		).toBe(false);
	});

	it('supports custom ace-high run order', () => {
		const pack = createValidatorRulePack({
			rankOrder: ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'],
			canPlay: [
				{
					id: 'ace-high-run',
					match: {
						kind: 'run',
						minCards: 3
					}
				}
			]
		});

		expect(
			validateCanPlay(
				{
					cards: [{ rank: 'Q' }, { rank: 'K' }, { rank: 'A' }]
				},
				pack
			).isValid
		).toBe(true);

		expect(
			validateCanPlay(
				{
					cards: [{ rank: 'A' }, { rank: '2' }, { rank: '3' }]
				},
				pack
			).isValid
		).toBe(false);
	});

	it('supports suit-restricted runs', () => {
		const pack = createValidatorRulePack({
			canPlay: [
				{
					id: 'same-suit-run',
					match: {
						kind: 'run',
						minCards: 3,
						requireSameSuit: true
					}
				}
			]
		});

		expect(
			validateCanPlay(
				{
					cards: [
						{ rank: '2', suit: 'hearts' },
						{ rank: '3', suit: 'hearts' },
						{ rank: '4', suit: 'hearts' }
					]
				},
				pack
			).isValid
		).toBe(true);

		expect(
			validateCanPlay(
				{
					cards: [
						{ rank: '2', suit: 'hearts' },
						{ rank: '3', suit: 'hearts' },
						{ rank: '4', suit: 'spades' }
					]
				},
				pack
			).isValid
		).toBe(false);
	});

	it('supports any-composition for alternatives such as set OR run', () => {
		const pack = createValidatorRulePack({
			canPlay: [
				{
					id: 'set-or-run',
					match: {
						kind: 'any',
						matches: [
							{ kind: 'all_same_rank', minCards: 3 },
							{ kind: 'run', minCards: 3 }
						]
					},
					failureCode: 'not-a-set-or-run'
				}
			]
		});

		const runResult = validateCanPlay(
			{
				cards: [{ rank: '5' }, { rank: '6' }, { rank: '7' }]
			},
			pack
		);
		const setResult = validateCanPlay(
			{
				cards: [{ rank: 'Q' }, { rank: 'Q' }, { rank: 'Q' }]
			},
			pack
		);

		expect(runResult.isValid).toBe(true);
		expect(runResult.matchedRuleId).toBe('set-or-run');
		expect(setResult.isValid).toBe(true);
		expect(setResult.matchedRuleId).toBe('set-or-run');
	});

	it('uses phase predicates to gate rule application', () => {
		const pack = createValidatorRulePack({
			canPlay: [
				{
					id: 'meld-only',
					predicate: {
						phase: ['meld']
					},
					match: {
						kind: 'all_same_rank',
						minCards: 2
					}
				}
			]
		});

		expect(
			validateCanPlay(
				{
					phase: 'draw',
					actionType: 'play',
					cards: [{ rank: 'K' }, { rank: 'K' }]
				},
				pack
			).issues[0]?.code
		).toBe('no_applicable_rule');
	});

	it('filters by action type predicate', () => {
		const pack = createValidatorRulePack({
			canPlay: [
				{
					id: 'only-meld',
					predicate: {
						actionTypes: ['meld']
					},
					match: {
						kind: 'all_same_rank',
						minCards: 2
					}
				}
			]
		});

		expect(
			validateCanPlay(
				{
					actionType: 'draw',
					cards: [{ rank: 'Q' }, { rank: 'Q' }]
				},
				pack
			).issues[0]?.code
		).toBe('no_applicable_rule');

		expect(
			validateCanPlay(
				{
					actionType: 'meld',
					cards: [{ rank: 'Q' }, { rank: 'Q' }]
				},
				pack
			).isValid
		).toBe(true);
	});

	it('forces strict mode to throw on schema mismatch', () => {
		expect(() =>
			validateCanPlay({ cards: [{ rank: 'A' }] }, { schemaVersion: 'validator/v9', capabilities: [], canPlay: [] }, {}, { strictValidation: true })
		).toThrow('schema_version_mismatch');
	});

	it('returns schema issues without throwing by default', () => {
		const result = validateCanPlay(
			{ cards: [{ rank: 'A' }] },
			{ schemaVersion: 'validator/v9', capabilities: [], canPlay: [] },
			{},
			{}
		);

		expect(result.isValid).toBe(false);
		expect(result.issues.some((issue) => issue.code === 'schema_version_mismatch')).toBe(true);
	});

	it('returns an issue when capabilities are missing for used matches', () => {
		const pack = createValidatorRulePack({
			capabilities: ['pattern:count', 'pattern:all_same_rank', 'composition:all', 'composition:any'],
			canPlay: [
				{
					id: 'run-not-supported',
					match: {
						kind: 'run',
						minCards: 3
					}
				}
			]
		});

		const result = validateCanPlay(
			{
				cards: [{ rank: '4' }, { rank: '5' }, { rank: '6' }]
			},
			pack
		);

		expect(result.isValid).toBe(false);
		expect(result.issues.some((issue) => issue.code === 'missing_capability')).toBe(true);
	});

	it('supports actor-gated rules via context', () => {
		const pack = createValidatorRulePack({
			canPlay: [
				{
					id: 'active-player-only',
					predicate: {
						actorMustBeCurrentPlayer: true
					},
					match: {
						kind: 'all_same_rank',
						minCards: 1
					}
				}
			]
		});

		expect(
			validateCanPlay(
				{
					actorId: 'alice',
					cards: [{ rank: 'Q' }]
				},
				pack,
				{ currentPlayerId: 'bob' }
			).issues[0]?.code
		).toBe('no_applicable_rule');
		expect(
			validateCanPlay(
				{
					actorId: 'alice',
					cards: [{ rank: 'Q' }]
				},
				pack,
				{ currentPlayerId: 'alice' }
			).isValid
		).toBe(true);
	});

	it('emits trace entries when trace option is enabled', () => {
		const result = validateCanPlay(
			{
				actionType: 'meld',
				cards: [{ rank: '2' }, { rank: '2' }, { rank: '2' }]
			},
			createValidatorRulePack({
				canPlay: [
					{
						id: 'set',
						match: {
							kind: 'all_same_rank',
							minCards: 3
						}
					}
				]
			}),
			{},
			{ trace: true }
		);

		expect(result.trace).toBeDefined();
		expect(result.trace?.some((entry) => entry.stage === 'rulepack')).toBe(true);
		expect(result.trace?.some((entry) => entry.stage === 'match')).toBe(true);
		expect(result.trace?.some((entry) => entry.stage === 'rule')).toBe(true);
	});
});
