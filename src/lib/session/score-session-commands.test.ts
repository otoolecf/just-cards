import { describe, expect, it } from 'vitest';
import { cardValue } from '$lib/scorekeeper/engine';

import {
	buildAddRoundEvent,
	buildAddDeltaEvent,
	buildPatternRoundEvent,
	calculateRummy500NetRoundScore,
	calculateSixCardGolfHoleScore,
	getModePreset,
	parseCardsFromText,
	parseNamedRoundText,
	parsePatternScoringText,
	sortStandingsByMode
} from './score-session-commands';
import { getPatternPreset } from './score-session-commands';

describe('score session command helpers', () => {
	it('parses mixed card input with spacing and symbol suits', () => {
		const parsed = parseCardsFromText('A H, 10c, kd  Q♣, 9');

		expect(parsed.errors).toEqual([]);
		expect(parsed.cards).toEqual([
			{ rank: 'A', suit: 'hearts' },
			{ rank: '10', suit: 'clubs' },
			{ rank: 'K', suit: 'diamonds' },
			{ rank: 'Q', suit: 'clubs' },
			{ rank: '9' }
		]);
	});

	it('captures errors for invalid card tokens', () => {
		const parsed = parseCardsFromText('A, X, 11, B4');

		expect(parsed.errors.length).toBe(3);
		expect(parsed.cards).toEqual([{ rank: 'A' }]);
	});

	it('parses free-text player round syntax', () => {
		const parsed = parseNamedRoundText('Alice: A H 10s\nBob: kd, QH; Cara: 9\n');

		expect(parsed.errors).toEqual([]);
		expect(parsed.entries).toEqual([
			{ playerId: 'Alice', cards: [{ rank: 'A', suit: 'hearts' }, { rank: '10', suit: 'spades' }] },
			{ playerId: 'Bob', cards: [{ rank: 'K', suit: 'diamonds' }, { rank: 'Q', suit: 'hearts' }] },
			{ playerId: 'Cara', cards: [{ rank: '9' }] }
		]);
	});

	it('parses pattern scoring text entries', () => {
		const parsed = parsePatternScoringText('pair: 10\nrun: -5, flush: 20');

		expect(parsed.errors).toEqual([]);
		expect(parsed.scoring).toEqual([
			{ patternId: 'pair', points: 10 },
			{ patternId: 'run', points: -5 },
			{ patternId: 'flush', points: 20 }
		]);
	});

	it('builds add_round events with player card entries', () => {
		const command = buildAddRoundEvent([
			{ playerId: 'Alice', cards: [{ rank: 'A' }] },
			{ playerId: 'Bob', cards: [{ rank: 'K' }, { rank: 'Q' }] }
		]);

		expect(command).toEqual({
			type: 'add_round',
			playerCards: {
				Alice: [{ rank: 'A' }],
				Bob: [{ rank: 'K' }, { rank: 'Q' }]
			}
		});
	});

	it('builds add_pattern_round with selected preset and scoring mapping', () => {
		const preset = getPatternPreset('pair-only');
		expect(preset).toBeDefined();

		if (!preset) {
			return;
		}
		const scoring = parsePatternScoringText(preset.defaultPatternScoring);
		const command = buildPatternRoundEvent({
			targetId: 'Alice',
			cards: [{ rank: 'K' }, { rank: 'K' }],
			patternPack: preset.patternPack,
			patternScoring: scoring.scoring
		});

		expect(command.type).toBe('add_pattern_round');
		if (command.type === 'add_pattern_round') {
			expect(command.patternScoring).toEqual([{ patternId: 'pair', points: 10 }]);
		}
	});

	it('reads mode presets', () => {
		const mode = getModePreset('standard');
		expect(mode).toBeDefined();
		expect(mode?.createRulePack().schemaVersion).toBe('rulepack/v0');
	});

	it('rummy_mode_preset_matches_500_rummy_value_rules', () => {
		const mode = getModePreset('rummy');
		expect(mode).toBeDefined();
		const rules = mode?.createRulePack();
		expect(rules).toBeDefined();
		if (!rules) {
			return;
		}

		expect(cardValue({ rank: 'A' }, rules)).toBe(15);
		expect(cardValue({ rank: '2' }, rules)).toBe(2);
		expect(cardValue({ rank: '9' }, rules)).toBe(9);
		expect(cardValue({ rank: '10' }, rules)).toBe(10);
		expect(cardValue({ rank: 'J' }, rules)).toBe(10);
		expect(cardValue({ rank: 'Q' }, rules)).toBe(10);
		expect(cardValue({ rank: 'K' }, rules)).toBe(10);
	});

	it('build_add_delta_event_posts_player_targets', () => {
		const command = buildAddDeltaEvent([
			{ playerId: 'Alice', delta: 14 },
			{ playerId: 'Bob', delta: -3 }
		]);

		expect(command).toEqual({
			type: 'add_delta',
			entries: [
				{ target: { kind: 'player', id: 'Alice' }, delta: 14 },
				{ target: { kind: 'player', id: 'Bob' }, delta: -3 }
			]
		});
	});

	it('calculate_rummy_500_net_round_delta_from_table_minus_hand', () => {
		const result = calculateRummy500NetRoundScore({
			tableCards: [
				{ rank: '7', suit: 'clubs' },
				{ rank: '7', suit: 'diamonds' },
				{ rank: '7', suit: 'spades' },
				{ rank: '3', suit: 'diamonds' },
				{ rank: '4', suit: 'diamonds' },
				{ rank: '5', suit: 'diamonds' }
			],
			handCards: [
				{ rank: 'K', suit: 'hearts' },
				{ rank: '9', suit: 'clubs' }
			]
		});

		expect(result.tablePoints).toBe(33);
		expect(result.handPoints).toBe(19);
		expect(result.delta).toBe(14);
	});

	it('calculate_six_card_golf_hole_scores_column_pair_zero', () => {
		const result = calculateSixCardGolfHoleScore({
			cardsInRowMajorOrder: [
				{ rank: '2', suit: 'clubs' },
				{ rank: '5', suit: 'spades' },
				{ rank: 'K', suit: 'diamonds' },
				{ rank: '2', suit: 'hearts' },
				{ rank: '9', suit: 'clubs' },
				{ rank: 'Q', suit: 'clubs' }
			]
		});

		expect(result.columns).toEqual([
			{ columnIndex: 0, value: 0, zeroedByPair: true },
			{ columnIndex: 1, value: 14, zeroedByPair: false },
			{ columnIndex: 2, value: 10, zeroedByPair: false }
		]);
		expect(result.total).toBe(24);
	});

	it('calculate_six_card_golf_hole_requires_exactly_six_cards', () => {
		expect(() =>
			calculateSixCardGolfHoleScore({
				cardsInRowMajorOrder: [
					{ rank: 'A' },
					{ rank: '2' },
					{ rank: '3' },
					{ rank: '4' },
					{ rank: '5' }
				]
			})
		).toThrow('exactly 6 cards');
	});

	it('score_mode_presets_include_win_direction', () => {
		expect(getModePreset('standard')?.winDirection).toBe('high_wins');
		expect(getModePreset('rummy')?.winDirection).toBe('high_wins');
		expect(getModePreset('cribbage')?.winDirection).toBe('high_wins');
		expect(getModePreset('six-card-golf')?.winDirection).toBe('low_wins');
	});

	it('sort_standings_by_mode_orders_high_wins', () => {
		const sorted = sortStandingsByMode(
			{
				Bob: 14,
				Alice: 20,
				Cara: 20
			},
			'standard'
		);

		expect(sorted).toEqual([
			['Alice', 20],
			['Cara', 20],
			['Bob', 14]
		]);
	});

	it('sort_standings_by_mode_orders_low_wins', () => {
		const sorted = sortStandingsByMode(
			{
				Bob: -2,
				Alice: 7,
				Cara: 7
			},
			'six-card-golf'
		);

		expect(sorted).toEqual([
			['Bob', -2],
			['Alice', 7],
			['Cara', 7]
		]);
	});

	it('sort_standings_by_mode_unknown_mode_defaults_high_wins', () => {
		const sorted = sortStandingsByMode(
			{
				Alice: 1,
				Bob: 9
			},
			'missing-mode'
		);

		expect(sorted).toEqual([
			['Bob', 9],
			['Alice', 1]
		]);
	});
});
