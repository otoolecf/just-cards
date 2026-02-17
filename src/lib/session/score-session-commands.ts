import {
	createPatternDetectorRulePack,
	type PatternRulePack
} from '$lib/gameplay/pattern-detector';
import {
	type CardInput,
	type PatternScoringRule,
	type ScoringTarget,
	type ScoreEvent,
	createRulePack
} from '$lib/scorekeeper/engine';

const CARD_RANKS = new Set(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']);

const SUIT_BY_TOKEN: Record<string, NonNullable<CardInput['suit']>> = {
	C: 'clubs',
	D: 'diamonds',
	H: 'hearts',
	S: 'spades'
};

function normalizeCardText(value: string): string {
	return value
		.toUpperCase()
		.replace(/♣/g, 'C')
		.replace(/♦/g, 'D')
		.replace(/♥/g, 'H')
		.replace(/♠/g, 'S')
		.replace(/\bCLUBS?\b/g, 'C')
		.replace(/\bDIAMONDS?\b/g, 'D')
		.replace(/\bHEARTS?\b/g, 'H')
		.replace(/\bSPADES?\b/g, 'S');
}

function normalizePlayerId(value: string): string {
	return value.trim();
}

function isRankOnlyToken(value: string): boolean {
	return /^([2-9]|10|[AJQK])$/.test(value);
}

function isSuitOnlyToken(value: string): boolean {
	return /^[CDHS]$/.test(value);
}

function parseCardToken(raw: string): CardInput | null {
	const token = raw.trim().toUpperCase();
	if (!/^[0-9AJQKCDHS]+$/.test(token)) {
		return null;
	}
	const match = token.match(/^([0-9]{1,2}|[AJQK])([CDHS])?$/);
	if (!match) {
		return null;
	}

	const rank = match[1];
	const suit = match[2];
	if (!CARD_RANKS.has(rank)) {
		return null;
	}

	if (suit) {
		return { rank: rank as CardInput['rank'], suit: SUIT_BY_TOKEN[suit] };
	}

	return { rank: rank as CardInput['rank'] };
}

export interface ParsedCardsResult {
	cards: CardInput[];
	errors: string[];
}

export interface ParsedNamedRoundEntry {
	playerId: string;
	cards: CardInput[];
}

export interface ParsedNamedRoundResult {
	entries: ParsedNamedRoundEntry[];
	errors: string[];
}

export interface PatternScoringParseResult {
	scoring: PatternScoringRule[];
	errors: string[];
}

export interface PatternRoundInput {
	targetId: string;
	cards: CardInput[];
	patternPack: PatternRulePack;
	patternScoring: PatternScoringRule[];
}

export interface ScoreModeOption {
	id: string;
	name: string;
	description: string;
	createRulePack: () => ReturnType<typeof createRulePack>;
}

export const SCORE_MODE_OPTIONS: ScoreModeOption[] = [
	{
		id: 'standard',
		name: 'Standard',
		description: 'A=1, 2-10 normal, J/Q/K face values',
		createRulePack: () =>
			createRulePack({
				modifiers: []
			})
	},
	{
		id: 'rummy',
		name: 'Rummy',
		description: 'Non-face cards set to 5, then twos to -2',
		createRulePack: () =>
			createRulePack({
				modifiers: [
					{ id: 'non-face-five', when: { kind: 'is_face', value: false }, value: 5 },
					{ id: 'twos-minus-2', when: { kind: 'rank_is', rank: '2' }, value: -2 }
				]
			})
	},
	{
		id: 'cribbage',
		name: 'Cribbage',
		description: 'Face cards set to 10; good base point handling for quick scoring',
		createRulePack: () =>
			createRulePack({
				modifiers: [{ id: 'faces-are-10', when: { kind: 'is_face', value: true }, value: 10 }]
			})
	}
];

export interface PatternModePreset {
	id: string;
	name: string;
	description: string;
	patternPack: PatternRulePack;
	defaultPatternScoring: string;
}

export const PATTERN_PRESETS: PatternModePreset[] = [
	{
		id: 'pair-only',
		name: 'Pair pack',
		description: 'Detect 2-of-a-kind matches',
		patternPack: createPatternDetectorRulePack({
		patterns: [
			{
				id: 'pair',
				match: { kind: 'all_same_rank', minCards: 2, maxCards: 2 },
				maxMatches: 1
			}
		]
	}),
		defaultPatternScoring: 'pair: 10'
	},
	{
		id: 'run3',
		name: 'Three-card run pack',
		description: 'Detect straight runs of 3 cards',
		patternPack: createPatternDetectorRulePack({
			patterns: [
				{
					id: 'run-3',
					match: { kind: 'run', minCards: 3, maxCards: 3 },
					maxMatches: 1
				}
			]
		}),
		defaultPatternScoring: 'run-3: 15'
	}
];

export function getPatternPreset(id: string): PatternModePreset | undefined {
	return PATTERN_PRESETS.find((preset) => preset.id === id);
}

export function getModePreset(id: string): ScoreModeOption | undefined {
	return SCORE_MODE_OPTIONS.find((mode) => mode.id === id);
}

export function parseCardsFromText(input: string): ParsedCardsResult {
	const normalized = normalizeCardText(input);
	const tokens = normalized
		.split(/[\s,;\n]+/)
		.map((token) => token.trim())
		.filter(Boolean);

	const cards: CardInput[] = [];
	const errors: string[] = [];

	for (let i = 0; i < tokens.length; i += 1) {
		let token = tokens[i];
		const nextToken = tokens[i + 1];

		if (isRankOnlyToken(token) && isSuitOnlyToken(nextToken)) {
			token = `${token}${nextToken}`;
			i += 1;
		}

		const parsedCard = parseCardToken(token);
		if (parsedCard) {
			cards.push(parsedCard);
		} else {
			errors.push(`Unable to parse card value "${token}".`);
		}
	}

	return { cards, errors };
}

export function parseNamedRoundText(input: string): ParsedNamedRoundResult {
	const entries: ParsedNamedRoundEntry[] = [];
	const errors: string[] = [];

	const lines = input.split(/[\n;]/).map((line) => line.trim()).filter(Boolean);

	for (const line of lines) {
		const separatorIndex = line.indexOf(':');
		if (separatorIndex < 0) {
			errors.push(`Missing ":" in "${line}". Expected "name: card card ..."`);
			continue;
		}

		const playerId = normalizePlayerId(line.slice(0, separatorIndex));
		const cardsInput = line.slice(separatorIndex + 1).trim();
		if (!playerId) {
			errors.push('Player name is required before ":"');
			continue;
		}
		if (!cardsInput) {
			errors.push(`No cards were provided for "${playerId}".`);
			continue;
		}

		const parsedCards = parseCardsFromText(cardsInput);
		if (parsedCards.errors.length > 0) {
			errors.push(...parsedCards.errors.map((error) => `${playerId}: ${error}`));
			continue;
		}
		if (parsedCards.cards.length === 0) {
			errors.push(`No valid cards found for "${playerId}".`);
			continue;
		}

		entries.push({ playerId, cards: parsedCards.cards });
	}

	return { entries, errors };
}

export function parsePatternScoringText(input: string): PatternScoringParseResult {
	const scoring: PatternScoringRule[] = [];
	const errors: string[] = [];

	const rawItems = input
		.split(/[\n,;]+/)
		.map((item) => item.trim())
		.filter(Boolean);

	for (const item of rawItems) {
		const match = item.match(/^([A-Za-z0-9_-]+)\s*:\s*(-?\d+)$/);
		if (!match) {
			errors.push(`Unable to parse scoring entry "${item}". Use "patternId: points".`);
			continue;
		}

		const patternId = match[1].trim();
		const points = Number(match[2]);
		if (Number.isNaN(points)) {
			errors.push(`Pattern points must be a number in "${item}".`);
			continue;
		}
		scoring.push({ patternId, points });
	}

	return { scoring, errors };
}

export function buildAddRoundEvent(entries: ParsedNamedRoundEntry[]): ScoreEvent {
	const playerCards: Record<string, CardInput[]> = {};
	for (const entry of entries) {
		playerCards[entry.playerId] = entry.cards;
	}

	return { type: 'add_round', playerCards };
}

export function buildPatternRoundEvent(input: PatternRoundInput): ScoreEvent {
	const target: ScoringTarget = { kind: 'player', id: input.targetId };
	return {
		type: 'add_pattern_round',
		patternPack: input.patternPack,
		patternScoring: input.patternScoring,
		entries: [{ target, cards: input.cards }]
	};
}
