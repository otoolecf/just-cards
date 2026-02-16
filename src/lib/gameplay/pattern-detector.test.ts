import { describe, expect, it } from 'vitest';

import {
	createPatternDetectorRulePack,
	detectPatterns,
	type PatternRule
} from './pattern-detector';

describe('pattern detector', () => {
	it('detects_same_rank_pairs_from_duplicate_cards', () => {
		const pack = createPatternDetectorRulePack({
			patterns: [
				{
					id: 'pair',
					match: {
						kind: 'all_same_rank',
						minCards: 2,
						maxCards: 2
					}
				} as PatternRule
			]
		});

		const result = detectPatterns(
			[
				{ rank: 'K' },
				{ rank: 'K' },
				{ rank: 'K' },
				{ rank: 'Q' },
				{ rank: 'Q' }
			],
			pack
		);

		expect(result.isValid).toBe(true);
		expect(result.matches).toHaveLength(4); // C(3,2)=3 for K + 1 for Q
	});

	it('respects_max_matches_per_pattern_rule', () => {
		const pack = createPatternDetectorRulePack({
			patterns: [
				{
					id: 'pair',
					match: {
						kind: 'all_same_rank',
						minCards: 2,
						maxCards: 2
					},
					maxMatches: 1
				} as PatternRule
			]
		});
		const result = detectPatterns(
			[
				{ rank: 'K' },
				{ rank: 'K' },
				{ rank: 'K' },
				{ rank: 'Q' },
				{ rank: 'Q' }
			],
			pack
		);

		expect(result.matches).toHaveLength(1);
	});

	it('detects_runs_with_default_and_custom_rank_order', () => {
		const defaultPack = createPatternDetectorRulePack({
			patterns: [
				{
					id: 'run-default',
					match: { kind: 'run', minCards: 3 }
				} as PatternRule
			]
		});
		const customPack = createPatternDetectorRulePack({
			rankOrder: ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'],
			patterns: [
				{
					id: 'run-ace-high',
					match: { kind: 'run', minCards: 3 }
				} as PatternRule
			]
		});

		const defaultResult = detectPatterns([{ rank: 'A' }, { rank: '2' }, { rank: '3' }], defaultPack);
		const customResult = detectPatterns([{ rank: 'Q' }, { rank: 'K' }, { rank: 'A' }], customPack);
		const defaultRejectedResult = detectPatterns(
			[{ rank: 'Q' }, { rank: 'K' }, { rank: 'A' }],
			defaultPack
		);

		expect(defaultResult.matches).toHaveLength(1);
		expect(customResult.matches).toHaveLength(1);
		expect(defaultRejectedResult.matches).toHaveLength(0);
	});

	it('supports_suit_restricted_runs', () => {
		const pack = createPatternDetectorRulePack({
			patterns: [
				{
					id: 'same-suit-run',
					match: {
						kind: 'run',
						requireSameSuit: true,
						minCards: 3
					}
				} as PatternRule
			]
		});

		const result = detectPatterns(
			[
				{ rank: '2', suit: 'hearts' },
				{ rank: '3', suit: 'hearts' },
				{ rank: '4', suit: 'hearts' },
				{ rank: '4', suit: 'spades' },
				{ rank: '5', suit: 'clubs' }
			],
			pack
		);

		expect(result.matches).toHaveLength(1);
	});

	it('supports_any_composition_of_pattern_types', () => {
		const pack = createPatternDetectorRulePack({
			patterns: [
				{
					id: 'trip-or-run',
					match: {
						kind: 'any',
						matches: [
							{ kind: 'all_same_rank', minCards: 3 },
							{ kind: 'run', minCards: 3 }
						]
					}
				} as PatternRule
			]
		});

		const result = detectPatterns(
			[
				{ rank: 'A' },
				{ rank: '2' },
				{ rank: '3' },
				{ rank: '8' },
				{ rank: '8' }
			],
			pack
		);

		expect(result.matches).toHaveLength(1);
	});

	it('supports_all_composition_when_children_are_disjoint', () => {
		const pack = createPatternDetectorRulePack({
			patterns: [
				{
					id: 'run-and-pair',
					match: {
						kind: 'all',
						matches: [
							{
								kind: 'run',
								requireSameSuit: true,
								minCards: 3
							},
							{
								kind: 'all_same_rank',
								minCards: 2,
								maxCards: 2
							}
						]
					}
				} as PatternRule
			]
		});

		const result = detectPatterns(
			[
				{ rank: 'A', suit: 'hearts' },
				{ rank: '2', suit: 'hearts' },
				{ rank: '3', suit: 'hearts' },
				{ rank: '7', suit: 'clubs' },
				{ rank: '7', suit: 'clubs' }
			],
			pack
		);

		expect(result.matches).toHaveLength(1);
	});

	it('returns_a_missing_capability_issue_when_unsupported', () => {
		const pack = createPatternDetectorRulePack({
			capabilities: ['pattern:count', 'pattern:all_same_rank', 'composition:any', 'composition:all'],
			patterns: [
				{
					id: 'run-not-allowed',
					match: { kind: 'run', minCards: 3 }
				} as PatternRule
			]
		});

		const result = detectPatterns(
			[{ rank: '2' }, { rank: '3' }, { rank: '4' }],
			pack
		);

		expect(result.matches).toHaveLength(0);
		expect(result.issues.some((issue) => issue.code === 'missing_capability')).toBe(true);
	});

	it('strict_validation_throws_on_schema_mismatch', () => {
		expect(() => detectPatterns([{ rank: 'A' }], { schemaVersion: 'pattern/v9', capabilities: [], patterns: [] }, { strictValidation: true })).toThrow(
			'schema_version_mismatch'
		);
	});

	it('returns_schema_issues_without_throwing_when_not_strict', () => {
		const result = detectPatterns(
			[{ rank: 'A' }],
			{ schemaVersion: 'pattern/v9', capabilities: [], patterns: [] },
			{}
		);

		expect(result.isValid).toBe(false);
		expect(result.issues.some((issue) => issue.code === 'schema_version_mismatch')).toBe(true);
	});

	it('detects_multiple_patterns_from_single_hand', () => {
		const pack = createPatternDetectorRulePack({
			patterns: [
				{
					id: 'pair',
					match: {
						kind: 'all_same_rank',
						minCards: 2,
						maxCards: 2
					}
				} as PatternRule,
				{
					id: 'run',
					match: {
						kind: 'run',
						minCards: 3
					}
				} as PatternRule
			]
		});

		const result = detectPatterns(
			[
				{ rank: 'A' },
				{ rank: '2' },
				{ rank: '3' },
				{ rank: '4' },
				{ rank: '4' }
			],
			pack
		);

		expect(result.matches.length).toBeGreaterThan(1);
		expect(result.matches[0].ruleId).toBe('pair');
		expect(result.matches.some((match) => match.ruleId === 'run')).toBe(true);
	});

	it('emits_trace_for_pattern_matching', () => {
		const pack = createPatternDetectorRulePack({
			patterns: [
				{
					id: 'run',
					match: {
						kind: 'run',
						minCards: 3
					}
				} as PatternRule
			]
		});

		const result = detectPatterns([{ rank: 'A' }, { rank: '2' }, { rank: '3' }], pack, { trace: true });

		expect(result.trace).toBeDefined();
		expect(result.trace?.some((entry) => entry.stage === 'rulepack')).toBe(true);
		expect(result.trace?.some((entry) => entry.stage === 'rule')).toBe(true);
		expect(result.trace?.some((entry) => entry.stage === 'match')).toBe(true);
	});
});
