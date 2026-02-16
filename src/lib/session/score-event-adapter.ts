import type { CardInput, PatternScoringRule, ScoringTarget, ScoreEvent } from '$lib/scorekeeper/engine';
import type { PatternRulePack } from '$lib/gameplay/pattern-detector';

interface ScoreRoundEntry {
	target: ScoringTarget;
	cards: CardInput[];
}

export type GameplayScoringCommand =
	| {
			type: 'score_cards';
			playerCards: Record<string, CardInput[]>;
	  }
	| {
			type: 'score_round';
			entries: ScoreRoundEntry[];
	  }
	| {
			type: 'score_patterns';
			entries: ScoreRoundEntry[];
			patternPack: PatternRulePack;
			patternScoring: PatternScoringRule[];
	  };

export interface GameplayScoringEnvelope {
	command: GameplayScoringCommand;
}

export function adaptGameplayScoringToScoreEvent(command: GameplayScoringCommand): ScoreEvent {
	if (command.type === 'score_cards') {
		return {
			type: 'add_round',
			playerCards: command.playerCards
		};
	}

	if (command.type === 'score_round') {
		return {
			type: 'add_round',
			entries: command.entries
		};
	}

	return {
		type: 'add_pattern_round',
		patternPack: command.patternPack,
		patternScoring: command.patternScoring,
		entries: command.entries
	};
}
