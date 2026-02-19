import { createGameplayRulePack, type GameplayRulePack } from '$lib/gameplay/engine';
import type { RuntimeRulePack } from '$lib/runtime/game-runtime';
import { createRulePack } from '$lib/scorekeeper/engine';
import { createUiProfile, generateUiProfileFromRuntime, type UiProfileV0 } from '$lib/ui/ui-profile';
import type { CreateRulesetDraftInput } from './service';
import type { RuntimeRulesetBundle, RuntimeRulesetExplainV0 } from './types';

type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
type NonAceRank = Exclude<Rank, 'A'>;

const DEFAULT_GAME_NAME = 'Generated Card Game';
const DEFAULT_HAND_ZONE = 'hand';

const COMMON_ZONE_HINTS: Record<string, string> = {
	board: 'Shared cards everyone can read.',
	stock: 'Face-down draw pile.',
	discard: 'Face-up throw-away stack.',
	meld: 'Scoring combinations laid down.',
	pot: 'Shared pool before settlement.',
	house: 'Neutral table-owned cards.',
	crib: 'Dealer scoring side pile.',
	kitty: 'Shared side pile for settlement.'
};

const COMMON_ZONE_LABELS: Record<string, string> = {
	board: 'Community',
	stock: 'Stock',
	discard: 'Discard Pile',
	meld: 'Melds',
	pot: 'Pot',
	house: 'House',
	crib: 'Crib',
	kitty: 'Kitty'
};

const RANK_WORD_TO_SYMBOL: Record<string, Rank> = {
	ace: 'A',
	two: '2',
	three: '3',
	four: '4',
	five: '5',
	six: '6',
	seven: '7',
	eight: '8',
	nine: '9',
	ten: '10',
	jack: 'J',
	queen: 'Q',
	king: 'K'
};

const RANK_ALIAS_TO_SYMBOL: Record<string, Rank> = {
	ace: 'A',
	aces: 'A',
	two: '2',
	twos: '2',
	'2': '2',
	three: '3',
	threes: '3',
	'3': '3',
	four: '4',
	fours: '4',
	'4': '4',
	five: '5',
	fives: '5',
	'5': '5',
	six: '6',
	sixes: '6',
	'6': '6',
	seven: '7',
	sevens: '7',
	'7': '7',
	eight: '8',
	eights: '8',
	'8': '8',
	nine: '9',
	nines: '9',
	'9': '9',
	ten: '10',
	tens: '10',
	'10': '10',
	jack: 'J',
	jacks: 'J',
	queen: 'Q',
	queens: 'Q',
	king: 'K',
	kings: 'K'
};

const NUMBER_WORD_TO_VALUE: Record<string, number> = {
	zero: 0,
	one: 1,
	two: 2,
	three: 3,
	four: 4,
	five: 5,
	six: 6,
	seven: 7,
	eight: 8,
	nine: 9,
	ten: 10,
	eleven: 11,
	twelve: 12,
	thirteen: 13
};

export interface RuleFactsV0 {
	schemaVersion: 'rule-facts/v0';
	gameName: string;
	gameSlug: string;
	players: {
		min: number;
		max: number;
	};
	rounds?: number;
	handZoneName: string;
	zones: string[];
	turn: {
		drawSources: string[];
		playTargets: string[];
		drawThenResolve?: boolean;
		sourceDrawRules?: Array<{
			zoneId: string;
			pickMode: 'top' | 'any_visible';
			requireTakeAbove?: boolean;
			requireResolveIncludesPicked?: boolean;
		}>;
	};
	scoring: {
		lowScoreWins: boolean;
		aceValue: number;
		rankOverrides: Partial<Record<Rank, number>>;
	};
	setup?: {
		cardsPerPlayer?: number;
		initialFaceUpCards?: number;
		playerLayout?: {
			kind: 'grid';
			rows: number;
			columns: number;
		};
		drawVisibility?: Partial<Record<string, 'reveal' | 'preserve'>>;
	};
	diagnostics: string[];
	source: {
		type: 'url' | 'text';
		url?: string;
	};
}

export type GeneratorSourceInput =
	| {
			type: 'url';
			url: string;
	  }
	| {
			type: 'text';
			text: string;
	  };

export interface GenerateRulesetInput {
	source: GeneratorSourceInput;
	name?: string;
	notes?: string;
}

export interface GenerateRulesetOptions {
	fetchImpl?: typeof fetch;
}

export interface GeneratedRulesetDraft {
	draft: Omit<CreateRulesetDraftInput, 'bundle'> & { bundle: RuntimeRulesetBundle };
	facts: RuleFactsV0;
	diagnostics: string[];
}

interface ExtractRuleFactsInput {
	sourceText: string;
	sourceUrl?: string;
	sourceType?: 'url' | 'text';
}

export interface IngestedSource {
	text: string;
	type: 'url' | 'text';
	url?: string;
}

function normalizeWhitespace(value: string): string {
	return value
		.replace(/\r/g, '\n')
		.replace(/\u00a0/g, ' ')
		.replace(/[\t ]+/g, ' ')
		.replace(/\n[ \t]+/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

function slugify(value: string): string {
	const slug = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48);
	return slug.length > 0 ? slug : `generated-${Date.now().toString(36)}`;
}

function titleCaseWords(value: string): string {
	return value
		.split(/[_\-\s]+/)
		.filter((part) => part.length > 0)
		.map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase())
		.join(' ');
}

function uniqueStrings(values: string[]): string[] {
	const unique: string[] = [];
	for (const value of values) {
		const normalized = value.trim();
		if (!normalized || unique.includes(normalized)) {
			continue;
		}
		unique.push(normalized);
	}
	return unique;
}

function parseNumericToken(raw: string): number | undefined {
	const normalized = raw.trim().toLowerCase();
	if (!normalized) {
		return undefined;
	}
	if (/^-?\d+$/.test(normalized)) {
		const parsed = Number.parseInt(normalized, 10);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return NUMBER_WORD_TO_VALUE[normalized];
}

function decodeHtmlEntities(value: string): string {
	return value
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/g, "'")
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>');
}

function htmlToText(html: string): string {
	const withoutScripts = html
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
	const withBreaks = withoutScripts
		.replace(/<\s*br\s*\/?\s*>/gi, '\n')
		.replace(/<\s*\/p\s*>/gi, '\n')
		.replace(/<\s*\/h[1-6]\s*>/gi, '\n')
		.replace(/<\s*\/li\s*>/gi, '\n');
	const noTags = withBreaks.replace(/<[^>]+>/g, ' ');
	return normalizeWhitespace(decodeHtmlEntities(noTags));
}

function gameNameFromSourceUrl(sourceUrl?: string): string | undefined {
	if (!sourceUrl) {
		return undefined;
	}

	let pathname: string;
	try {
		pathname = new URL(sourceUrl).pathname;
	} catch {
		return undefined;
	}

	const segments = pathname
		.split('/')
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0);
	if (segments.length === 0) {
		return undefined;
	}

	const lastSegment = segments.at(-1)?.replace(/\.(html?|php)$/i, '') ?? '';
	if (!lastSegment || ['index', 'rules', 'how-to-play'].includes(lastSegment.toLowerCase())) {
		return undefined;
	}

	return titleCaseWords(lastSegment);
}

function detectGameName(text: string, sourceUrl?: string): string {
	const lower = text.toLowerCase();
	if (lower.includes('six card golf') || sourceUrl?.toLowerCase().includes('six-card-golf')) {
		return 'Six Card Golf';
	}

	const fromUrl = gameNameFromSourceUrl(sourceUrl);
	if (fromUrl) {
		return fromUrl;
	}

	const lines = text
		.split(/\n+/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.slice(0, 8);

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		if (/^how to play$/i.test(line) && lines[index + 1]) {
			return titleCaseWords(lines[index + 1]);
		}
		if (/^[a-z0-9][a-z0-9 '\-]{2,60}$/i.test(line) && !/players?:/i.test(line)) {
			return titleCaseWords(line);
		}
	}

	return DEFAULT_GAME_NAME;
}

function detectPlayers(text: string): { min: number; max: number } {
	const rangeMatch = text.match(/(\d{1,2})\s*(?:to|\-|–)\s*(\d{1,2})\s*players?/i);
	if (rangeMatch) {
		const min = Number.parseInt(rangeMatch[1], 10);
		const max = Number.parseInt(rangeMatch[2], 10);
		if (Number.isFinite(min) && Number.isFinite(max)) {
			return {
				min: Math.max(2, Math.min(min, max)),
				max: Math.max(2, Math.max(min, max))
			};
		}
	}

	const informalRangeMatch = text.match(/(\d{1,2})\s*(?:or|\/)\s*(\d{1,2})\s*(?:people|players?)/i);
	if (informalRangeMatch) {
		const left = Number.parseInt(informalRangeMatch[1], 10);
		const right = Number.parseInt(informalRangeMatch[2], 10);
		if (Number.isFinite(left) && Number.isFinite(right)) {
			return {
				min: Math.max(2, Math.min(left, right)),
				max: Math.max(2, Math.max(left, right))
			};
		}
	}

	const singleMatch = text.match(/(\d{1,2})\s*players?/i);
	if (singleMatch) {
		const count = Number.parseInt(singleMatch[1], 10);
		if (Number.isFinite(count) && count >= 2) {
			return { min: count, max: count };
		}
	}

	return { min: 2, max: 4 };
}

function detectRounds(text: string): number | undefined {
	const roundsMatch = text.match(/(\d{1,2})\s*(?:rounds|deals?)\b/i);
	if (roundsMatch) {
		const rounds = Number.parseInt(roundsMatch[1], 10);
		if (Number.isFinite(rounds) && rounds > 0) {
			return rounds;
		}
	}

	const wordRoundMatch = text.match(
		/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:rounds|deals?)\b/i
	);
	if (!wordRoundMatch) {
		return undefined;
	}

	const wordToNumber: Record<string, number> = {
		one: 1,
		two: 2,
		three: 3,
		four: 4,
		five: 5,
		six: 6,
		seven: 7,
		eight: 8,
		nine: 9,
		ten: 10,
		eleven: 11,
		twelve: 12
	};
	return wordToNumber[wordRoundMatch[1].toLowerCase()];
}

function detectCardsPerPlayer(text: string): number | undefined {
	const patterns = [
		/(?:deal(?:s|t)?|dealt|hand size(?: is|:)?)\s*(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen)\s*cards?(?:\s+[a-z-]+){0,4}\s*(?:to|for)\s*each/i,
		/each player(?: is)?\s*(?:dealt|gets?|has)\s*(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen)\s*cards?/i,
		/(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen)\s*cards?(?:\s+[a-z-]+){0,4}\s*(?:to|for)\s*each/i
	];
	for (const pattern of patterns) {
		const match = text.match(pattern);
		if (!match) {
			continue;
		}
		const parsed = parseNumericToken(match[1]);
		if (parsed !== undefined && parsed >= 2 && parsed <= 20) {
			return parsed;
		}
	}
	return undefined;
}

function detectInitialFaceUpCards(text: string, cardsPerPlayer?: number): number | undefined {
	const patterns = [
		/turn(?:ed)?\s*(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen)\s*(?:of\s+(?:these|their)\s*)?cards?\s*face up/i,
		/reveal(?:ed)?\s*(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen)\s*cards?\s*face up/i,
		/(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen)\s*cards?\s*(?:are|is|start|remain)\s*face up/i
	];
	for (const pattern of patterns) {
		const match = text.match(pattern);
		if (!match) {
			continue;
		}
		const parsed = parseNumericToken(match[1]);
		if (parsed === undefined || parsed < 0) {
			continue;
		}
		if (cardsPerPlayer !== undefined) {
			return Math.max(0, Math.min(parsed, cardsPerPlayer));
		}
		return parsed;
	}
	return undefined;
}

function detectPlayerGridLayout(
	text: string,
	cardsPerPlayer?: number
): { kind: 'grid'; rows: number; columns: number } | undefined {
	const compactPattern =
		/(\d{1,2})\s*[x×]\s*(\d{1,2})\s*(?:layout|grid|tableau|arrangement|cards?)/i;
	const compactMatch = text.match(compactPattern);
	if (compactMatch) {
		const rows = Number.parseInt(compactMatch[1], 10);
		const columns = Number.parseInt(compactMatch[2], 10);
		if (Number.isFinite(rows) && Number.isFinite(columns) && rows > 0 && columns > 0) {
			if (!cardsPerPlayer || rows * columns === cardsPerPlayer) {
				return { kind: 'grid', rows, columns };
			}
		}
	}

	const rowsPattern =
		/(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s*rows?\s*of\s*(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:cards?|in front|layout|tableau)/i;
	const rowsMatch = text.match(rowsPattern);
	if (rowsMatch) {
		const rows = parseNumericToken(rowsMatch[1]);
		const columns = parseNumericToken(rowsMatch[2]);
		if (rows !== undefined && columns !== undefined && rows > 0 && columns > 0) {
			if (!cardsPerPlayer || rows * columns === cardsPerPlayer) {
				return { kind: 'grid', rows, columns };
			}
		}
	}

	return undefined;
}

function detectDrawVisibility(
	text: string,
	zones: string[]
): Partial<Record<string, 'reveal' | 'preserve'>> | undefined {
	if (!zones.includes('stock')) {
		return undefined;
	}
	const lower = text.toLowerCase();
	if (
		/\bcannot be looked at\b/.test(lower) ||
		/\bwithout looking\b/.test(lower) ||
		/\bblind draw\b/.test(lower) ||
		/\bstay face down until revealed\b/.test(lower) ||
		/\bremain face down until revealed\b/.test(lower)
	) {
		return { stock: 'preserve' };
	}
	return undefined;
}

function detectZones(text: string): string[] {
	const lower = text.toLowerCase();
	const zones: string[] = [];
	if (/\bdiscard\b/.test(lower)) {
		zones.push('discard');
	}
	if (/\bstock\b|\bdraw pile\b|\bdeck\b/.test(lower)) {
		zones.push('stock');
	}
	if (/\bmeld\b|\blay down\b|\blaid down\b/.test(lower)) {
		zones.push('meld');
	}
	if (/\bcommunity\b|\bboard\b|\bpeg board\b|\bshared cards?\b|\bcenter piles?\b/.test(lower)) {
		zones.push('board');
	}
	if (/\bpot\b/.test(lower)) {
		zones.push('pot');
	}
	if (/\bhouse\b/.test(lower)) {
		zones.push('house');
	}
	if (/\bcrib\b/.test(lower)) {
		zones.push('crib');
	}
	if (/\bkitty\b/.test(lower)) {
		zones.push('kitty');
	}

	if (zones.length === 0) {
		zones.push('discard', 'stock', 'board');
	}

	return uniqueStrings(zones);
}

function detectDrawSources(text: string, zones: string[]): string[] {
	const lower = text.toLowerCase();
	const sources: string[] = [];
	const drawsFromStockPattern =
		/\bdraw(?:ing|s)?\b[\s\S]{0,60}\b(?:stock|draw pile|deck)\b|\b(?:stock|draw pile|deck)\b[\s\S]{0,60}\bdraw(?:ing|s)?\b/;
	if (zones.includes('stock') && drawsFromStockPattern.test(lower)) {
		sources.push('stock');
	}
	const drawsFromDiscardPattern =
		/\bdraw(?:ing|s)?\b[\s\S]{0,80}\bdiscard\b|\bdiscard\b[\s\S]{0,80}\bdraw(?:ing|s)?\b|\bstock\b[\s\S]{0,20}\bor\b[\s\S]{0,20}\bdiscard\b|\bdiscard\b[\s\S]{0,20}\bor\b[\s\S]{0,20}\bstock\b/;
	if (zones.includes('discard') && drawsFromDiscardPattern.test(lower)) {
		sources.push('discard');
	}
	if (sources.length === 0 && zones.includes('stock')) {
		sources.push('stock');
	}
	if (sources.length === 0 && zones.includes('discard')) {
		sources.push('discard');
	}
	return uniqueStrings(sources);
}

function detectPlayTargets(text: string, zones: string[]): string[] {
	const lower = text.toLowerCase();
	const targets: string[] = [];
	if (zones.includes('meld') && /\bmeld\b|\blay down\b|\blaid down\b/.test(lower)) {
		targets.push('meld');
	}
	if (zones.includes('board') && /\breplace\b|\blayout\b|\btable\b|\bboard\b|\bcommunity\b/.test(lower)) {
		targets.push('board');
	}
	if (zones.includes('discard') && /\bdiscard\b/.test(lower)) {
		targets.push('discard');
	}
	if (targets.length === 0) {
		if (zones.includes('board')) {
			targets.push('board');
		} else if (zones.includes('discard')) {
			targets.push('discard');
		}
	}
	return uniqueStrings(targets);
}

function detectDrawThenResolveTurnFlow(text: string, drawSources: string[], playTargets: string[]): boolean {
	if (drawSources.length === 0 || playTargets.length === 0) {
		return false;
	}

	const lower = text.toLowerCase();
	const sequentialPatterns = [
		/\bon your turn\b[\s\S]{0,160}\bdraw\b[\s\S]{0,200}\b(?:then|before discarding|before you discard|and)\b[\s\S]{0,160}\b(?:discard|play|lay|replace|swap)\b/,
		/\bafter drawing\b[\s\S]{0,140}\b(?:discard|play|lay|replace|swap)\b/,
		/\bdraw(?:ing)?\b[\s\S]{0,140}\b(?:from|top of)\b[\s\S]{0,80}\b(?:stock|draw pile|discard)\b[\s\S]{0,200}\b(?:discard|replace|swap)\b/
	];
	for (const pattern of sequentialPatterns) {
		if (pattern.test(lower)) {
			return true;
		}
	}

	return false;
}

function detectSourceDrawRules(
	text: string,
	drawSources: string[]
): RuleFactsV0['turn']['sourceDrawRules'] {
	const rules: NonNullable<RuleFactsV0['turn']['sourceDrawRules']> = [];
	const lower = text.toLowerCase();

	if (!drawSources.includes('discard')) {
		return undefined;
	}

	const discardAnyCardPattern =
		/\bany\s+card\s+(?:from|in)\s+(?:the\s+)?discard(?:\s+pile)?\b|\bfrom\s+(?:the\s+)?discard(?:\s+pile)?\b[\s\S]{0,40}\bany\s+card\b/i;
	const takeAbovePattern =
		/\b(?:must|has to|need to)\s+take\s+all\s+(?:the\s+)?cards?\s+above\b|\btake\s+all\s+(?:the\s+)?cards?\s+above\b/i;
	const immediateUsePattern =
		/\b(?:must|has to|need to)\s+(?:immediately\s+be\s+used|be\s+used\s+immediately)\b|\bselected\s+card\b[\s\S]{0,40}\bimmediately\b[\s\S]{0,40}\b(?:lay|meld|play)\b/i;

	if (discardAnyCardPattern.test(lower)) {
		rules.push({
			zoneId: 'discard',
			pickMode: 'any_visible',
			...(takeAbovePattern.test(lower) ? { requireTakeAbove: true } : {}),
			...(immediateUsePattern.test(lower) ? { requireResolveIncludesPicked: true } : {})
		});
	}

	return rules.length > 0 ? rules : undefined;
}

function detectLowScoreWins(text: string): boolean {
	return /low score wins|lower is better|fewest points|least points|lowest(?:\s+\w+){0,3}\s+score/i.test(text);
}

function parseRankNameGroup(names: string): Rank[] {
	const parts = names
		.toLowerCase()
		.split(/,|and/)
		.map((part) => part.trim())
		.filter((part) => part.length > 0);

	const ranks: Rank[] = [];
	for (const part of parts) {
		const symbol = RANK_WORD_TO_SYMBOL[part];
		if (!symbol || ranks.includes(symbol)) {
			continue;
		}
		ranks.push(symbol);
	}
	return ranks;
}

function parseNumericPhrase(value: string): number | undefined {
	const normalized = value
		.toLowerCase()
		.replace(/[.,;:()]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (!normalized) {
		return undefined;
	}

	if (/^-?\d+$/.test(normalized)) {
		const parsed = Number.parseInt(normalized, 10);
		return Number.isFinite(parsed) ? parsed : undefined;
	}

	const negativeMatch = normalized.match(/^(?:minus|negative)\s+([a-z0-9-]+)$/);
	if (negativeMatch) {
		const inner = parseNumericPhrase(negativeMatch[1]);
		return inner === undefined ? undefined : -Math.abs(inner);
	}

	const singular = normalized.replace(/s$/, '');
	if (singular in NUMBER_WORD_TO_VALUE) {
		return NUMBER_WORD_TO_VALUE[singular];
	}

	return undefined;
}

function extractScoreValue(valuePhrase: string): number | undefined {
	const normalized = valuePhrase.toLowerCase();
	if (/\bface value\b|\bpip value\b/.test(normalized)) {
		return undefined;
	}

	const valueTokenMatch = normalized.match(
		/(?:minus|negative)\s+(?:\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen)|-?\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen/i
	);
	if (!valueTokenMatch) {
		return undefined;
	}

	return parseNumericPhrase(valueTokenMatch[0]);
}

function ranksFromPhrase(phrase: string): Rank[] {
	const lower = phrase.toLowerCase();
	const ranks: Rank[] = [];

	if (/\bface cards?\b/.test(lower)) {
		ranks.push('J', 'Q', 'K');
	}

	const tokens = lower
		.replace(/[()]/g, ' ')
		.replace(/[^a-z0-9\s]/g, ' ')
		.split(/\s+/)
		.filter((token) => token.length > 0);

	for (const token of tokens) {
		const rank = RANK_ALIAS_TO_SYMBOL[token];
		if (!rank || ranks.includes(rank)) {
			continue;
		}
		ranks.push(rank);
	}

	return ranks;
}

function applyNaturalLanguageScoringOverrides(
	text: string,
	overrides: Partial<Record<Rank, number>>
): void {
	const scoringLines = text
		.split(/\n|[.;]/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	for (const line of scoringLines) {
		const lower = line.toLowerCase();
		const separatorMatch = lower.match(/\b(count(?:s)?(?:\s+as)?|score(?:s)?|is|are|worth)\b/);
		if (!separatorMatch || separatorMatch.index === undefined) {
			continue;
		}

		const rankPhrase = lower
			.slice(0, separatorMatch.index)
			.replace(/^each\s+/, '')
			.trim();
		const valuePhrase = lower.slice(separatorMatch.index + separatorMatch[0].length).trim();
		if (!rankPhrase || !valuePhrase) {
			continue;
		}

		const value = extractScoreValue(valuePhrase);
		if (value === undefined) {
			continue;
		}

		for (const rank of ranksFromPhrase(rankPhrase)) {
			overrides[rank] = value;
		}
	}
}

function detectScoringOverrides(text: string): { aceValue: number; rankOverrides: Partial<Record<Rank, number>> } {
	const overrides: Partial<Record<Rank, number>> = {};
	const assignmentPattern =
		/(ace|two|three|four|five|six|seven|eight|nine|ten|jack|queen|king)(?:\s*(?:,|and)\s*(ace|two|three|four|five|six|seven|eight|nine|ten|jack|queen|king))*\s*=\s*(-?\d+)/gi;

	for (const match of text.matchAll(assignmentPattern)) {
		const full = match[0];
		const value = Number.parseInt(match[match.length - 1] ?? '', 10);
		if (!Number.isFinite(value)) {
			continue;
		}
		const leftSide = full.split('=')[0] ?? '';
		for (const rank of parseRankNameGroup(leftSide)) {
			overrides[rank] = value;
		}
	}

	applyNaturalLanguageScoringOverrides(text, overrides);

	const faceCardsMatch = text.match(/face cards?\s*=\s*(-?\d+)/i);
	if (faceCardsMatch) {
		const value = Number.parseInt(faceCardsMatch[1], 10);
		if (Number.isFinite(value)) {
			overrides.J = value;
			overrides.Q = value;
			overrides.K = value;
		}
	}

	return {
		aceValue: overrides.A ?? 1,
		rankOverrides: overrides
	};
}

function detectDiagnostics(
	text: string,
	zones: string[],
	setup?: RuleFactsV0['setup'],
	sourceDrawRules?: RuleFactsV0['turn']['sourceDrawRules']
): string[] {
	const diagnostics: string[] = [];
	const lower = text.toLowerCase();

	const faceUpPatterns = [
		/turn(?:ed)?\s+([a-z0-9-]+)\s+cards?\s+face up/i,
		/turn(?:ed)?\s+([a-z0-9-]+)(?:\s+of\s+(?:these|their))?\s+cards?\s+face up/i,
		/([a-z0-9-]+)\s+cards?\s+(?:are|is|remain|stay|start)\s+face up/i
	];
	let faceUpCount: number | undefined;
	for (const pattern of faceUpPatterns) {
		const match = text.match(pattern);
		if (!match) {
			continue;
		}
		const parsed = parseNumericPhrase(match[1]);
		if (parsed !== undefined && parsed >= 0) {
			faceUpCount = parsed;
			break;
		}
	}

	if (faceUpCount !== undefined) {
		diagnostics.push(`Setup hint: ${faceUpCount} cards start face up.`);
	}
	if (/\bface down\b/i.test(text)) {
		diagnostics.push('Setup hint: some cards start face down and should remain hidden until revealed by play.');
	}
	if (setup?.cardsPerPlayer) {
		diagnostics.push(`Setup hint: each player starts with ${setup.cardsPerPlayer} cards.`);
	}
	if (setup?.playerLayout?.kind === 'grid') {
		diagnostics.push(
			`Setup hint: player cards are arranged in ${setup.playerLayout.rows} rows of ${setup.playerLayout.columns}.`
		);
	}
	if (setup?.drawVisibility?.stock === 'preserve') {
		diagnostics.push('Visibility hint: stock draws should stay hidden until explicitly revealed.');
	}
	if (sourceDrawRules?.some((rule) => rule.pickMode === 'any_visible')) {
		diagnostics.push('Turn hint: some draw zones allow selecting a visible card and taking cards above it.');
	}
	if (sourceDrawRules?.some((rule) => rule.requireResolveIncludesPicked === true)) {
		diagnostics.push('Turn hint: selected discard pickup card must be included in immediate resolve.');
	}

	if (/\bside pot\b|\bbetting round\b|\ball-in\b/.test(lower)) {
		diagnostics.push('Detected betting/side-pot language that may require future settlement primitives.');
	}
	if (/\bpartnership\b|\bteam\b/.test(lower)) {
		diagnostics.push('Detected team language; generated bundle currently targets per-player scoring defaults.');
	}
	if (!zones.includes('discard') && !zones.includes('board') && !zones.includes('meld')) {
		diagnostics.push('No clear play target zone detected; fallback table zones were applied.');
	}
	return diagnostics;
}

export function extractRuleFacts(input: ExtractRuleFactsInput): RuleFactsV0 {
	const normalizedText = normalizeWhitespace(input.sourceText);
	if (!normalizedText) {
		throw new Error('source text is required');
	}

	const gameName = detectGameName(normalizedText, input.sourceUrl);
	const players = detectPlayers(normalizedText);
	const rounds = detectRounds(normalizedText);
	const zones = detectZones(normalizedText);
	const drawSources = detectDrawSources(normalizedText, zones);
	const playTargets = detectPlayTargets(normalizedText, zones);
	const drawThenResolve = detectDrawThenResolveTurnFlow(normalizedText, drawSources, playTargets);
	const sourceDrawRules = detectSourceDrawRules(normalizedText, drawSources);
	const scoringOverrides = detectScoringOverrides(normalizedText);
	const cardsPerPlayer = detectCardsPerPlayer(normalizedText);
	const initialFaceUpCards = detectInitialFaceUpCards(normalizedText, cardsPerPlayer);
	const playerLayout = detectPlayerGridLayout(normalizedText, cardsPerPlayer);
	const drawVisibility = detectDrawVisibility(normalizedText, zones);
	const setup: RuleFactsV0['setup'] =
		cardsPerPlayer || initialFaceUpCards !== undefined || playerLayout || drawVisibility
			? {
					...(cardsPerPlayer ? { cardsPerPlayer } : {}),
					...(initialFaceUpCards !== undefined ? { initialFaceUpCards } : {}),
					...(playerLayout ? { playerLayout } : {}),
					...(drawVisibility ? { drawVisibility } : {})
				}
			: undefined;
	const diagnostics = detectDiagnostics(normalizedText, zones, setup, sourceDrawRules);

	return {
		schemaVersion: 'rule-facts/v0',
		gameName,
		gameSlug: slugify(gameName),
		players,
		...(rounds ? { rounds } : {}),
		handZoneName: DEFAULT_HAND_ZONE,
		zones,
		turn: {
			drawSources,
			playTargets,
			...(drawThenResolve ? { drawThenResolve: true } : {}),
			...(sourceDrawRules ? { sourceDrawRules } : {})
		},
		scoring: {
			lowScoreWins: detectLowScoreWins(normalizedText),
			aceValue: scoringOverrides.aceValue,
			rankOverrides: scoringOverrides.rankOverrides
		},
		...(setup ? { setup } : {}),
		diagnostics,
		source: {
			type: input.sourceType ?? (input.sourceUrl ? 'url' : 'text'),
			...(input.sourceUrl ? { url: input.sourceUrl } : {})
		}
	};
}

function toNonAceRankOverrides(overrides: Partial<Record<Rank, number>>): Partial<Record<NonAceRank, number>> {
	const nonAce: Partial<Record<NonAceRank, number>> = {};
	const ranks: NonAceRank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
	for (const rank of ranks) {
		const value = overrides[rank];
		if (value === undefined) {
			continue;
		}
		nonAce[rank] = value;
	}
	return nonAce;
}

function ensureTableZones(facts: RuleFactsV0): string[] {
	const fromFacts = facts.zones.filter((zone) => zone !== facts.handZoneName);
	if (fromFacts.length > 0) {
		return fromFacts;
	}
	return ['board', 'discard', 'stock'];
}

function gameplayRulePackFromFacts(facts: RuleFactsV0): GameplayRulePack {
	const tableZones = ensureTableZones(facts);
	const sourceZoneAllowlist = uniqueStrings([facts.handZoneName, ...facts.turn.drawSources, ...facts.turn.playTargets]);
	const targetZoneAllowlist = uniqueStrings([
		facts.handZoneName,
		...facts.turn.playTargets,
		...facts.turn.drawSources
	]);
	const drawFromZones = uniqueStrings(facts.turn.drawSources);
	const resolveToZones = uniqueStrings(facts.turn.playTargets);
	const sourceDrawRules = facts.turn.sourceDrawRules ?? [];
	const nonDiscardResolveTargets = resolveToZones.filter((zoneId) => zoneId !== 'discard');
	const drawSourcePolicies = sourceDrawRules.map((rule) => ({
		zoneId: rule.zoneId,
		minCards: 1,
		...(rule.pickMode === 'top' ? { maxCards: 1 } : {}),
		...(rule.pickMode === 'any_visible' && rule.requireTakeAbove === true
			? { requireContiguousFromTop: true }
			: {}),
		...(rule.requireResolveIncludesPicked === true
			? {
					requireResolveIncludesAnchor: true,
					requiredResolveTargetZoneAllowlist:
						nonDiscardResolveTargets.length > 0 ? nonDiscardResolveTargets : resolveToZones
				}
			: {})
	}));
	const hasAnyVisiblePickupRule = sourceDrawRules.some((rule) => rule.pickMode === 'any_visible');
	const requiresImmediateResolve =
		facts.turn.drawThenResolve === true ||
		sourceDrawRules.some((rule) => rule.requireResolveIncludesPicked === true);
	const shouldEnableTurnActionPolicy =
		(requiresImmediateResolve || drawSourcePolicies.length > 0) &&
		drawFromZones.length > 0 &&
		resolveToZones.length > 0;

	return createGameplayRulePack({
		handZoneName: facts.handZoneName,
		startingPhase: 'pregame',
		phaseAfterRoundStart: 'play',
		zoneMovePolicy: {
			allowedPhases: ['play', 'deal', 'scoring', 'round_end'],
			actorMustBeCurrentPlayer: false,
			sourceMustBelongToActor: false,
			sourceZoneAllowlist,
			targetZoneAllowlist,
			minCards: 1,
			...(hasAnyVisiblePickupRule ? {} : { maxCards: 1 })
		},
		...(shouldEnableTurnActionPolicy
			? {
					turnActionPolicy: {
						enabled: true,
						allowedPhases: ['play'],
						drawFromZoneAllowlist: drawFromZones,
						resolveToZoneAllowlist: resolveToZones,
						requireDrawBeforeResolve: requiresImmediateResolve,
						requireResolveAfterDraw: requiresImmediateResolve,
						drawSourcePolicies
					}
				}
			: {}),
		roundPolicy: {
			enabled: true,
			rotateDealerBetweenRounds: true,
			clearTableZonesOnRoundStart: tableZones
		}
	});
}

function scoreRulePackFromFacts(facts: RuleFactsV0) {
	return createRulePack({
		baseAceValue: facts.scoring.aceValue,
		rankOverrides: toNonAceRankOverrides(facts.scoring.rankOverrides)
	});
}

function scoringTriggersFromFacts(facts: RuleFactsV0) {
	return [
		{
			id: 'end-round-hand-score',
			when: { eventType: 'end_round' as const },
			source: { kind: 'player_zone' as const, zone: facts.handZoneName, players: 'all' as const },
			scorer: { kind: 'card_values' as const },
			target: { kind: 'source_player' as const }
		}
	];
}

function patchedUiProfile(
	profile: UiProfileV0,
	quickTargetZoneIds: string[],
	setup?: RuleFactsV0['setup'],
	sourceDrawRules?: RuleFactsV0['turn']['sourceDrawRules']
): UiProfileV0 {
	const allowedQuickTargets = new Set(quickTargetZoneIds);
	const filteredQuickTargets = profile.hand.quickPlayTargets.filter((target) =>
		allowedQuickTargets.has(target.zoneId)
	);
	const drawRuleByZone = new Map<string, NonNullable<RuleFactsV0['turn']['sourceDrawRules']>[number]>();
	for (const rule of sourceDrawRules ?? []) {
		drawRuleByZone.set(rule.zoneId, rule);
	}

	return createUiProfile({
		hand: {
			zoneId: profile.hand.zoneId,
			label: profile.hand.label,
			hint: profile.hand.hint,
			quickPlayTargets: filteredQuickTargets.length > 0 ? filteredQuickTargets : profile.hand.quickPlayTargets,
			...(setup?.playerLayout ? { layout: setup.playerLayout } : {})
		},
		table: {
			zones: profile.table.zones.map((zone) => ({
				...zone,
				label: COMMON_ZONE_LABELS[zone.id] ?? zone.label,
				hint: COMMON_ZONE_HINTS[zone.id] ?? zone.hint,
				...(setup?.drawVisibility?.[zone.id]
					? { drawVisibility: setup.drawVisibility[zone.id] }
					: {}),
				...(drawRuleByZone.get(zone.id)
					? { drawPickMode: drawRuleByZone.get(zone.id)?.pickMode }
					: {})
			}))
		},
		actions: {
			primary: profile.actions.primary
		},
		log: profile.log,
		...(setup?.playerLayout
			? {
					seats: {
						cards: {
							zoneId: profile.hand.zoneId,
							label: 'Player Layouts',
							includeSelf: false,
							layout: setup.playerLayout
						}
					}
				}
			: {})
	});
}

function zoneLabel(zoneId: string): string {
	return COMMON_ZONE_LABELS[zoneId] ?? titleCaseWords(zoneId);
}

function objectiveFromFacts(facts: RuleFactsV0): string {
	if (facts.scoring.lowScoreWins) {
		return 'End with the lowest score.';
	}
	return 'Score points based on card values and round events.';
}

function explainFromFacts(facts: RuleFactsV0, uiProfile: UiProfileV0): RuntimeRulesetExplainV0 {
	const rankOrder: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
	const rankOverrides = rankOrder
		.filter((rank) => facts.scoring.rankOverrides[rank] !== undefined)
		.map((rank) => ({ rank, value: facts.scoring.rankOverrides[rank] as number }));

	return {
		schemaVersion: 'ruleset-explain/v0',
		goal: objectiveFromFacts(facts),
		playerRange: {
			min: facts.players.min,
			max: facts.players.max
		},
		...(facts.rounds ? { rounds: facts.rounds } : {}),
		turnFlow: {
			drawFrom: facts.turn.drawSources.map(zoneLabel),
			playTo: facts.turn.playTargets.map(zoneLabel)
		},
		scoring: {
			lowScoreWins: facts.scoring.lowScoreWins,
			aceValue: facts.scoring.aceValue,
			rankOverrides
		},
		...(facts.setup ? { setup: facts.setup } : {}),
		zones: uiProfile.table.zones
			.filter((zone) => zone.visible !== false)
			.map((zone) => ({
				id: zone.id,
				label: zone.label,
				hint: zone.hint
			})),
		diagnostics: [...facts.diagnostics],
		source: {
			type: facts.source.type,
			...(facts.source.url ? { url: facts.source.url } : {})
		},
		generatedAt: new Date().toISOString()
	};
}

export function compileRuleFactsToBundle(facts: RuleFactsV0): RuntimeRulesetBundle {
	const gameplayRulePack = gameplayRulePackFromFacts(facts);
	const scoreRulePack = scoreRulePackFromFacts(facts);
	const runtimeRulePack: RuntimeRulePack = {
		gameplayRulePack,
		scoreRulePack,
		scoringTriggers: scoringTriggersFromFacts(facts)
	};
	const uiProfile = patchedUiProfile(
		generateUiProfileFromRuntime(runtimeRulePack, {
			handLabel: 'Your Hand',
			handHint: 'Select a card to reveal quick play targets.'
		}),
		facts.turn.playTargets,
		facts.setup,
		facts.turn.sourceDrawRules
	);
	const explain = explainFromFacts(facts, uiProfile);

	return {
		bundleVersion: 'runtime-bundle/v1',
		gameId: facts.gameSlug,
		displayName: facts.gameName,
		runtimeRulePack,
		uiProfile,
		explain
	};
}

export async function ingestSource(
	input: GeneratorSourceInput,
	options: GenerateRulesetOptions = {}
): Promise<IngestedSource> {
	if (input.type === 'text') {
		const text = normalizeWhitespace(input.text ?? '');
		if (!text) {
			throw new Error('text source requires non-empty text');
		}
		return { text, type: 'text' };
	}

	const url = (input.url ?? '').trim();
	if (!url) {
		throw new Error('url source requires a non-empty url');
	}
	if (!/^https?:\/\//i.test(url)) {
		throw new Error('url source must use http or https');
	}

	const fetchImpl = options.fetchImpl ?? globalThis.fetch;
	if (!fetchImpl) {
		throw new Error('fetch implementation is not available');
	}

	const response = await fetchImpl(url, {
		headers: {
			accept: 'text/html, text/plain;q=0.9, */*;q=0.8'
		}
	});
	if (!response.ok) {
		throw new Error(`unable to fetch source url (${response.status})`);
	}

	const raw = await response.text();
	const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
	const text = contentType.includes('html') || /<html|<body|<main/i.test(raw) ? htmlToText(raw) : normalizeWhitespace(raw);
	if (!text) {
		throw new Error('source url returned empty content');
	}

	return {
		text,
		type: 'url',
		url
	};
}

export async function generateRulesetDraftFromInput(
	input: GenerateRulesetInput,
	options: GenerateRulesetOptions = {}
): Promise<GeneratedRulesetDraft> {
	if (!input.source || (input.source.type !== 'url' && input.source.type !== 'text')) {
		throw new Error('source.type must be "url" or "text"');
	}

	const source = await ingestSource(input.source, options);
	const facts = extractRuleFacts({
		sourceText: source.text,
		sourceUrl: source.url,
		sourceType: source.type
	});
	const bundle = compileRuleFactsToBundle(facts);

	const name = input.name?.trim() || facts.gameName;
	const notes = [
		...(input.notes ? [input.notes.trim()] : []),
		...(facts.rounds ? [`Detected rounds: ${facts.rounds}`] : []),
		...(facts.scoring.lowScoreWins ? ['Detected low-score-wins scoring.'] : [])
	]
		.filter((line) => line.length > 0)
		.join(' ');

	return {
		draft: {
			name,
			origin: 'llm',
			...(source.url ? { sourceUrl: source.url } : {}),
			...(notes ? { notes } : {}),
			bundle
		},
		facts,
		diagnostics: [...facts.diagnostics]
	};
}
