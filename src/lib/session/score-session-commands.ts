import {
	createPatternDetectorRulePack,
	type PatternRulePack
} from '$lib/gameplay/pattern-detector';
import type { RuntimeRulesetBundle } from '$lib/rulesets/types';
import {
	cardValue,
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

const FIVE_HUNDRED_RUMMY_RULE_PACK = createRulePack({
	baseAceValue: 15,
	rankOverrides: {
		J: 10,
		Q: 10,
		K: 10
	},
	modifiers: []
});

const SIX_CARD_GOLF_RULE_PACK = createRulePack({
	baseAceValue: 1,
	rankOverrides: {
		2: -2,
		J: 10,
		Q: 10,
		K: 0
	},
	modifiers: []
});

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

function scoreCards(cards: CardInput[], rules = createRulePack()): number {
	return cards.reduce((sum, card) => sum + cardValue(card, rules), 0);
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

export interface PlayerDeltaInput {
	playerId: string;
	delta: number;
}

export interface Rummy500NetRoundInput {
	tableCards: CardInput[];
	handCards: CardInput[];
}

export interface NamedRummy500NetRoundInput extends Rummy500NetRoundInput {
	playerId: string;
}

export interface Rummy500NetRoundScore {
	tablePoints: number;
	handPoints: number;
	delta: number;
}

export interface SixCardGolfHoleInput {
	cardsInRowMajorOrder: CardInput[];
}

export interface NamedSixCardGolfHoleInput extends SixCardGolfHoleInput {
	playerId: string;
}

export interface SixCardGolfColumnScore {
	columnIndex: number;
	value: number;
	zeroedByPair: boolean;
}

export interface SixCardGolfHoleScore {
	columns: SixCardGolfColumnScore[];
	total: number;
}

export type ScoreWinDirection = 'high_wins' | 'low_wins';
export type ScoreInputMode = 'guided' | 'raw';
export type GuidedScoreZoneRole = 'add' | 'subtract' | 'exclude';

export interface GuidedScoreZoneProfile {
	zoneId: string;
	label: string;
	hint?: string;
	role: GuidedScoreZoneRole;
	layout?: {
		kind: 'row' | 'grid';
		rows?: number;
		columns?: number;
	};
}

export interface GuidedScoreSpecialRuleColumnPairZero {
	kind: 'column_pair_zero';
	zoneId: string;
	rows: number;
	columns: number;
}

export type GuidedScoreSpecialRule = GuidedScoreSpecialRuleColumnPairZero;

export interface GuidedScoreProfile {
	rulesetId: string;
	winDirection: ScoreWinDirection;
	scoreRulePack: ReturnType<typeof createRulePack>;
	zones: GuidedScoreZoneProfile[];
	specialRules: GuidedScoreSpecialRule[];
}

export interface BuildGuidedRoundDeltaEntriesInput {
	players: string[];
	profile: GuidedScoreProfile;
	cardsByPlayerZone: Record<string, Record<string, CardInput[]>>;
}

export interface ScoreModeOption {
	id: string;
	name: string;
	description: string;
	winDirection: ScoreWinDirection;
	createRulePack: () => ReturnType<typeof createRulePack>;
}

export const SCORE_MODE_OPTIONS: ScoreModeOption[] = [
	{
		id: 'standard',
		name: 'Standard',
		description: 'A=1, 2-10 normal, J/Q/K face values',
		winDirection: 'high_wins',
		createRulePack: () =>
			createRulePack({
				modifiers: []
			})
	},
	{
		id: 'rummy',
		name: '500 Rummy',
		description: 'A=15, 2-10 face value, J/Q/K=10 (use with net table-minus-hand rounds)',
		winDirection: 'high_wins',
		createRulePack: () => createFiveHundredRummyRulePack()
	},
	{
		id: 'six-card-golf',
		name: 'Six Card Golf',
		description: 'A=1, 2=-2, 3-10 face value, J/Q=10, K=0 (column pairs score 0)',
		winDirection: 'low_wins',
		createRulePack: () => createSixCardGolfRulePack()
	},
	{
		id: 'cribbage',
		name: 'Cribbage',
		description: 'Face cards set to 10; good base point handling for quick scoring',
		winDirection: 'high_wins',
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

export function createFiveHundredRummyRulePack(): ReturnType<typeof createRulePack> {
	return structuredClone(FIVE_HUNDRED_RUMMY_RULE_PACK);
}

export function createSixCardGolfRulePack(): ReturnType<typeof createRulePack> {
	return structuredClone(SIX_CARD_GOLF_RULE_PACK);
}

export function getPatternPreset(id: string): PatternModePreset | undefined {
	return PATTERN_PRESETS.find((preset) => preset.id === id);
}

export function getModePreset(id: string): ScoreModeOption | undefined {
	return SCORE_MODE_OPTIONS.find((mode) => mode.id === id);
}

export function getModeWinDirection(modeId?: string): ScoreWinDirection {
	return getModePreset(modeId ?? '')?.winDirection ?? 'high_wins';
}

export function sortStandingsByDirection(
	totalsByPlayer: Record<string, number>,
	winDirection: ScoreWinDirection = 'high_wins'
): Array<[string, number]> {
	return Object.entries(totalsByPlayer).sort((left, right) => {
		if (left[1] !== right[1]) {
			return winDirection === 'low_wins' ? left[1] - right[1] : right[1] - left[1];
		}
		return left[0].localeCompare(right[0]);
	});
}

export function sortStandingsByMode(
	totalsByPlayer: Record<string, number>,
	modeId?: string
): Array<[string, number]> {
	const winDirection = getModeWinDirection(modeId);
	return sortStandingsByDirection(totalsByPlayer, winDirection);
}

function normalizeScoreRulePack(input: unknown): ReturnType<typeof createRulePack> {
	if (!input || typeof input !== 'object' || Array.isArray(input)) {
		return createRulePack();
	}
	return structuredClone(input as ReturnType<typeof createRulePack>);
}

function zoneRoleFromContext(
	zoneId: string,
	handZoneId: string,
	hasLikelyPositiveNonHandZone: boolean
): GuidedScoreZoneRole {
	const normalized = zoneId.trim().toLowerCase();
	if (!normalized) {
		return 'exclude';
	}
	if (normalized === handZoneId.toLowerCase()) {
		return hasLikelyPositiveNonHandZone ? 'subtract' : 'add';
	}
	if (/(discard|stock|draw|talon|waste)/.test(normalized)) {
		return 'exclude';
	}
	if (/(meld|table|board|crib|kitty|pot|house|pool|won|capture)/.test(normalized)) {
		return 'add';
	}
	return 'add';
}

function hasGolfLikeRankOverrides(
	scoreRulePack: ReturnType<typeof createRulePack>,
	lowScoreWins: boolean
): boolean {
	if (!lowScoreWins || scoreRulePack.baseAceValue !== 1) {
		return false;
	}
	const rankValues = scoreRulePack.rankValues ?? {};
	return rankValues['2'] === -2 && rankValues.J === 10 && rankValues.Q === 10 && rankValues.K === 0;
}

function scoreColumnPairZero(
	cards: CardInput[],
	rulePack: ReturnType<typeof createRulePack>,
	rows: number,
	columns: number
): number {
	if (rows !== 2) {
		throw new Error('column_pair_zero currently requires a 2-row grid.');
	}
	if (cards.length !== rows * columns) {
		throw new Error(`column_pair_zero requires exactly ${rows * columns} cards.`);
	}

	let total = 0;
	for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
		const topCard = cards[columnIndex];
		const bottomCard = cards[columnIndex + columns];
		const columnValue =
			topCard.rank === bottomCard.rank
				? 0
				: cardValue(topCard, rulePack) + cardValue(bottomCard, rulePack);
		total += columnValue;
	}
	return total;
}

function zoneScore(
	cards: CardInput[],
	zoneId: string,
	profile: GuidedScoreProfile
): number {
	const specialRule = profile.specialRules.find((rule) => rule.zoneId === zoneId);
	if (!specialRule) {
		return scoreCards(cards, profile.scoreRulePack);
	}
	if (specialRule.kind === 'column_pair_zero') {
		return scoreColumnPairZero(cards, profile.scoreRulePack, specialRule.rows, specialRule.columns);
	}
	return scoreCards(cards, profile.scoreRulePack);
}

export function deriveGuidedScoreProfileFromBundle(
	bundle: RuntimeRulesetBundle,
	rulesetId: string
): GuidedScoreProfile {
	const handZoneId = bundle.uiProfile.hand.zoneId;
	const explainZones = bundle.explain?.zones ?? [];
	const tableZones = bundle.uiProfile.table.zones;
	const zoneCandidates = new Map<string, { label: string; hint?: string }>();
	zoneCandidates.set(handZoneId, {
		label: bundle.uiProfile.hand.label,
		hint: bundle.uiProfile.hand.hint
	});
	for (const zone of explainZones) {
		zoneCandidates.set(zone.id, { label: zone.label, hint: zone.hint });
	}
	for (const zone of tableZones) {
		zoneCandidates.set(zone.id, { label: zone.label, hint: zone.hint });
	}

	const nonHandZoneIds = [...zoneCandidates.keys()].filter((zoneId) => zoneId !== handZoneId);
	const hasLikelyPositiveNonHandZone = nonHandZoneIds.some((zoneId) =>
		/(meld|table|board|crib|kitty|pot|house|pool|won|capture)/.test(zoneId.toLowerCase())
	);

	const zones: GuidedScoreZoneProfile[] = [...zoneCandidates.entries()].map(([zoneId, details]) => {
		const role = zoneRoleFromContext(zoneId, handZoneId, hasLikelyPositiveNonHandZone);
		const layout =
			zoneId === handZoneId && bundle.uiProfile.hand.layout
				? {
						kind: bundle.uiProfile.hand.layout.kind,
						rows: bundle.uiProfile.hand.layout.rows,
						columns: bundle.uiProfile.hand.layout.columns
					}
				: undefined;
		return {
			zoneId,
			label: details.label,
			hint: details.hint,
			role,
			...(layout ? { layout } : {})
		};
	});

	const lowScoreWins = bundle.explain?.scoring.lowScoreWins === true;
	const scoreRulePack = normalizeScoreRulePack(bundle.runtimeRulePack.scoreRulePack);
	const specialRules: GuidedScoreSpecialRule[] = [];
	const playerLayout = bundle.explain?.setup?.playerLayout;
	if (
		playerLayout?.kind === 'grid' &&
		typeof playerLayout.rows === 'number' &&
		typeof playerLayout.columns === 'number' &&
		playerLayout.rows > 0 &&
		playerLayout.columns > 0 &&
		hasGolfLikeRankOverrides(scoreRulePack, lowScoreWins)
	) {
		specialRules.push({
			kind: 'column_pair_zero',
			zoneId: handZoneId,
			rows: playerLayout.rows,
			columns: playerLayout.columns
		});
	}

	return {
		rulesetId,
		winDirection: lowScoreWins ? 'low_wins' : 'high_wins',
		scoreRulePack,
		zones,
		specialRules
	};
}

export function buildGuidedRoundDeltaEntries(input: BuildGuidedRoundDeltaEntriesInput): PlayerDeltaInput[] {
	const zoneRoleById = new Map(input.profile.zones.map((zone) => [zone.zoneId, zone.role] as const));
	const entries: PlayerDeltaInput[] = [];

	for (const playerId of input.players) {
		const cardsByZone = input.cardsByPlayerZone[playerId] ?? {};
		let delta = 0;
		let hasAnyEntry = false;

		for (const [zoneId, cards] of Object.entries(cardsByZone)) {
			const role = zoneRoleById.get(zoneId) ?? 'exclude';
			if (role === 'exclude' || cards.length === 0) {
				continue;
			}

			hasAnyEntry = true;
			const value = zoneScore(cards, zoneId, input.profile);
			delta += role === 'subtract' ? -value : value;
		}

		if (hasAnyEntry) {
			entries.push({ playerId, delta });
		}
	}

	return entries;
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

	const lines = input
		.split(/[\n;]/)
		.map((line) => line.trim())
		.filter(Boolean);

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

export function buildAddDeltaEvent(entries: PlayerDeltaInput[]): ScoreEvent {
	return {
		type: 'add_delta',
		entries: entries.map((entry) => ({
			target: { kind: 'player', id: entry.playerId },
			delta: entry.delta
		}))
	};
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

export function calculateRummy500NetRoundScore(input: Rummy500NetRoundInput): Rummy500NetRoundScore {
	const tablePoints = scoreCards(input.tableCards, FIVE_HUNDRED_RUMMY_RULE_PACK);
	const handPoints = scoreCards(input.handCards, FIVE_HUNDRED_RUMMY_RULE_PACK);
	return {
		tablePoints,
		handPoints,
		delta: tablePoints - handPoints
	};
}

export function buildRummy500NetDeltaEntries(entries: NamedRummy500NetRoundInput[]): PlayerDeltaInput[] {
	return entries.map((entry) => ({
		playerId: entry.playerId,
		delta: calculateRummy500NetRoundScore(entry).delta
	}));
}

export function calculateSixCardGolfHoleScore(input: SixCardGolfHoleInput): SixCardGolfHoleScore {
	if (input.cardsInRowMajorOrder.length !== 6) {
		throw new Error('Six Card Golf hole scoring requires exactly 6 cards in row-major 2x3 order.');
	}

	const columns: SixCardGolfColumnScore[] = [];
	for (let columnIndex = 0; columnIndex < 3; columnIndex += 1) {
		const topCard = input.cardsInRowMajorOrder[columnIndex];
		const bottomCard = input.cardsInRowMajorOrder[columnIndex + 3];
		const zeroedByPair = topCard.rank === bottomCard.rank;
		const value = zeroedByPair
			? 0
			: cardValue(topCard, SIX_CARD_GOLF_RULE_PACK) + cardValue(bottomCard, SIX_CARD_GOLF_RULE_PACK);

		columns.push({
			columnIndex,
			value,
			zeroedByPair
		});
	}

	return {
		columns,
		total: columns.reduce((sum, column) => sum + column.value, 0)
	};
}

export function buildSixCardGolfHoleDeltaEntries(entries: NamedSixCardGolfHoleInput[]): PlayerDeltaInput[] {
	return entries.map((entry) => ({
		playerId: entry.playerId,
		delta: calculateSixCardGolfHoleScore(entry).total
	}));
}
