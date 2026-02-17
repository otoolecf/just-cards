import { describe, expect, it } from 'vitest';

import {
	buildAddRoundEvent,
	buildPatternRoundEvent,
	getModePreset,
	parseCardsFromText,
	parseNamedRoundText,
	parsePatternScoringText
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
});
