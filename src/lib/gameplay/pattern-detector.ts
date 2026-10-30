import { addIssues, validRuleId } from '$lib/scorekeeper/diagnostics';
import { assertPatternBudget, PatternWorkBudget } from './pattern-budget';
import type { CardInput, CardRank, CardSuit } from '$lib/scorekeeper/engine';

export type PatternDetectorSchema = 'pattern/v0';

export type PatternDetectorCapability =
	| 'pattern:count'
	| 'pattern:all_same_rank'
	| 'pattern:run'
	| 'pattern:all_same_suit'
	| 'pattern:contains'
	| 'composition:any'
	| 'composition:all'
	| 'trace:explain';

export interface PatternRulePack {
	schemaVersion: PatternDetectorSchema;
	capabilities: PatternDetectorCapability[];
	rankOrder: string[];
	patterns: PatternRule[];
	requirePatterns?: boolean;
}

export interface PatternDetectionContext {
	actorRole?: string;
	phase?: string;
}

export interface PatternMatchOptions {
	trace?: boolean;
	strictValidation?: boolean;
	maxMatchesPerRule?: number;
	disallowOverlap?: boolean;
}

export type PatternMatchKind =
	| {
			kind: 'card_count';
			min?: number;
			max?: number;
	  }
	| {
			kind: 'all_same_rank';
			minCards?: number;
			maxCards?: number;
	  }
	| {
			kind: 'all_same_suit';
			minCards?: number;
			maxCards?: number;
	  }
	| {
			kind: 'run';
			minCards?: number;
			maxCards?: number;
			requireSameSuit?: boolean;
	  }
	| {
			kind: 'contains';
			rank?: CardRank | CardRank[];
			suit?: CardSuit | CardSuit[];
			min?: number;
	  }
	| {
			kind: 'all';
			matches: PatternMatchKind[];
	  }
	| {
			kind: 'any';
			matches: PatternMatchKind[];
	  };

export interface PatternRule {
	id: string;
	match: PatternMatchKind;
	maxMatches?: number;
	allowOverlappingMatches?: boolean;
}

export interface PatternDetectorRuleIssue {
	code: string;
	message: string;
	ruleId?: string;
}

export interface PatternDetectorTraceEntry {
	eventIndex: number;
	stage: 'rulepack' | 'rule' | 'match' | 'compose';
	message: string;
	data?: Record<string, unknown>;
}

export interface PatternMatchResult {
	ruleId: string;
	cards: CardInput[];
	indices: number[];
}

export interface PatternDetectionResult {
	isValid: boolean;
	matches: PatternMatchResult[];
	issues: PatternDetectorRuleIssue[];
	trace?: PatternDetectorTraceEntry[];
}

export interface PatternCandidates {
	indices: number[];
}

interface CreatePatternRulePackOptions {
	capabilities?: PatternDetectorCapability[];
	rankOrder?: string[];
	patterns?: PatternRule[];
	requirePatterns?: boolean;
}

const DEFAULT_RANK_ORDER = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function cloneCards(cards: CardInput[]): CardInput[] {
	return cards.map((card) => ({ ...card, tags: card.tags ? [...card.tags] : undefined }));
}

function emitTrace(
	trace: PatternDetectorTraceEntry[] | undefined,
	eventIndex: number,
	stage: PatternDetectorTraceEntry['stage'],
	message: string,
	data?: Record<string, unknown>
): void {
	if (!trace) {
		return;
	}
	trace.push({ eventIndex, stage, message, ...(data ? { data } : {}) } as PatternDetectorTraceEntry);
}

function isValidRange(value: unknown): value is number {
	return (
		typeof value === 'number' &&
		Number.isInteger(value) &&
		value >= 0
	);
}

function normalizeValues<T extends string>(value: T | T[] | undefined): T[] {
	if (!value) {
		return [];
	}
	return Array.isArray(value) ? [...value] : [value];
}

function toCardMapByKey<T>(cards: CardInput[], indices: number[], keyOf: (card: CardInput) => T | undefined): Map<T, number[]> {
	const map = new Map<T, number[]>();
	for (const index of indices) {
		const value = keyOf(cards[index]);
		if (value === undefined) {
			continue;
		}
		const list = map.get(value) ?? [];
		list.push(index);
		map.set(value, list);
	}

	return map;
}

function defaultCapabilities(): PatternDetectorCapability[] {
	return [
		'pattern:count',
		'pattern:all_same_rank',
		'pattern:run',
		'pattern:all_same_suit',
		'pattern:contains',
		'composition:any',
		'composition:all',
		'trace:explain'
	];
}

export function createPatternDetectorRulePack(options: CreatePatternRulePackOptions = {}): PatternRulePack {
	return {
		schemaVersion: 'pattern/v0',
		capabilities: options.capabilities ?? defaultCapabilities(),
		rankOrder: options.rankOrder ?? DEFAULT_RANK_ORDER,
		patterns: options.patterns ?? [],
		requirePatterns: options.requirePatterns ?? false
	};
}

function isValidPatternMatch(value: unknown): value is PatternMatchKind {
	if (!isObject(value)) {
		return false;
	}
	const candidate = value as { kind?: unknown; matches?: unknown };
	if (
		candidate.kind !== 'card_count' &&
		candidate.kind !== 'all_same_rank' &&
		candidate.kind !== 'all_same_suit' &&
		candidate.kind !== 'run' &&
		candidate.kind !== 'contains' &&
		candidate.kind !== 'all' &&
		candidate.kind !== 'any'
	) {
		return false;
	}
	if (candidate.kind === 'all' || candidate.kind === 'any') {
		return Array.isArray(candidate.matches) && candidate.matches.every(isValidPatternMatch);
	}

	if (
		candidate.kind === 'card_count' ||
		candidate.kind === 'all_same_rank' ||
		candidate.kind === 'all_same_suit' ||
		candidate.kind === 'run'
	) {
		if ('min' in (value as Record<string, unknown>)) {
			const minValue = (value as { min?: unknown }).min;
			if (minValue !== undefined && !isValidRange(minValue)) {
				return false;
			}
		}
		if ('max' in (value as Record<string, unknown>)) {
			const maxValue = (value as { max?: unknown }).max;
			if (maxValue !== undefined && !isValidRange(maxValue)) {
				return false;
			}
		}
		if ('minCards' in (value as Record<string, unknown>)) {
			const minCardsValue = (value as { minCards?: unknown }).minCards;
			if (minCardsValue !== undefined && !isValidRange(minCardsValue)) {
				return false;
			}
		}
		if ('maxCards' in (value as Record<string, unknown>)) {
			const maxCardsValue = (value as { maxCards?: unknown }).maxCards;
			if (maxCardsValue !== undefined && !isValidRange(maxCardsValue)) {
				return false;
			}
		}
		return true;
	}

	const contains = value as { min?: unknown; rank?: unknown; suit?: unknown; requireSameSuit?: unknown };
	if ('requireSameSuit' in contains && contains.requireSameSuit !== undefined && typeof contains.requireSameSuit !== 'boolean') {
		return false;
	}
	if ('min' in contains && contains.min !== undefined && !isValidRange(contains.min)) {
		return false;
	}
	if ('rank' in contains && contains.rank !== undefined) {
		const normalized = Array.isArray(contains.rank) ? contains.rank : [contains.rank];
		if (!normalized.every((item) => typeof item === 'string')) {
			return false;
		}
	}
	if ('suit' in contains && contains.suit !== undefined) {
		const normalized = Array.isArray(contains.suit) ? contains.suit : [contains.suit];
		if (!normalized.every((item) => typeof item === 'string')) {
			return false;
		}
	}

	return true;
}

export function validatePatternRulePack(rulePack: unknown): PatternDetectorRuleIssue[] {
	const issues: PatternDetectorRuleIssue[] = [];

	if (!isObject(rulePack)) {
		addIssues(issues, { code: 'schema_not_object', message: 'Pattern rule pack must be an object' });
		return issues;
	}
	if ((rulePack as { schemaVersion?: unknown }).schemaVersion !== 'pattern/v0') {
		addIssues(issues, {
			code: 'schema_version_mismatch',
			message: 'Expected schemaVersion pattern/v0'
		});
	}
	if (!Array.isArray(rulePack.rankOrder) || rulePack.rankOrder.length === 0) {
		addIssues(issues, { code: 'invalid_rank_order', message: 'rankOrder must be a non-empty array of ranks' });
	}
	if (!Array.isArray(rulePack.patterns)) {
		addIssues(issues, { code: 'missing_patterns', message: 'patterns is required and must be an array' });
		return issues;
	}

	const ids = new Set<string>();
	for (let i = 0; i < (rulePack.patterns as unknown[]).length; i++) {
		const pattern = (rulePack.patterns as unknown[])[i] as Record<string, unknown>;
		if (!isObject(pattern)) {
			addIssues(issues, { code: 'invalid_pattern_shape', message: `patterns[${i}] must be an object`, });
			continue;
		}
		if (!validRuleId(pattern.id)) {
			addIssues(issues, { code: 'invalid_pattern_id', message: `patterns[${i}] requires an ID from 1 to 96 characters` });
		}
		if (typeof pattern.id === 'string') {
			if (ids.has(pattern.id)) addIssues(issues, { code: 'duplicate_pattern_id', message: 'Pattern IDs must be unique.' });
			ids.add(pattern.id);
		}
		if (!isObject(pattern.match) || !isValidPatternMatch(pattern.match)) {
			addIssues(issues, { code: 'invalid_pattern_match', message: `patterns[${i}] has invalid match definition` });
		}
	}
	if (rulePack.requirePatterns && (rulePack.patterns as unknown[]).length === 0) {
		addIssues(issues, { code: 'patterns_required', message: 'requirePatterns is true but patterns is empty' });
	}

	return issues;
}

function getRankIndex(rankOrder: string[]): Record<string, number> {
	const rankIndex: Record<string, number> = {};
	rankOrder.forEach((rank, index) => {
		rankIndex[rank] = index;
	});
	return rankIndex;
}

function isInRange(value: number, min: number | undefined, max: number | undefined): boolean {
	if (min !== undefined && value < min) {
		return false;
	}
	if (max !== undefined && value > max) {
		return false;
	}
	return true;
}

function dedupeByIndices(candidates: PatternCandidates[], work: PatternWorkBudget): PatternCandidates[] {
	const seen = new Map<string, PatternCandidates>();
	for (const candidate of candidates) {
		work.consume();
		const key = candidate.indices.join(',');
		if (!seen.has(key)) {
			seen.set(key, candidate);
		}
	}
	return [...seen.values()];
}

function hasOverlap(left: number[], right: number[]): boolean {
	const rightSet = new Set(right);
	for (const value of left) {
		if (rightSet.has(value)) {
			return true;
		}
	}
	return false;
}

function combineCandidateLists(
	children: PatternCandidates[][],
	index: number,
	working: number[],
	emit: (combined: number[]) => void,
	disallowOverlap: boolean,
	work: PatternWorkBudget
): void {
	if (index >= children.length) {
		emit(working);
		return;
	}
	for (const candidate of children[index] || []) {
		work.consume();
		const combined = [...working, ...candidate.indices];
		if (disallowOverlap && hasOverlap(working, candidate.indices)) {
			continue;
		}
		combined.sort((a, b) => a - b);
		combineCandidateLists(
			children,
			index + 1,
			combined,
			emit,
			disallowOverlap,
			work
		);
	}
}

function generateCombinations(items: number[], size: number, work: PatternWorkBudget, start = 0, prefix: number[] = [], out: number[][] = []): number[][] {
	work.consume();
	if (size === 0) {
		out.push([...prefix]);
		return out;
	}
	if (start >= items.length) {
		return out;
	}
	const remaining = items.length - start;
	if (remaining < size) {
		return out;
	}
	for (let i = start; i <= items.length - size; i++) {
		prefix.push(items[i]);
		generateCombinations(items, size - 1, work, i + 1, prefix, out);
		prefix.pop();
	}
	return out;
}

function cartesianProduct(options: number[][], work: PatternWorkBudget, out: number[][] = [], prefix: number[] = []): number[][] {
	work.consume();
	if (options.length === 0) {
		out.push([...prefix]);
		return out;
	}
	const [head, ...tail] = options;
	for (const headValue of head) {
		prefix.push(headValue);
		cartesianProduct(tail, work, out, prefix);
		prefix.pop();
	}
	return out;
}

function combinationsByRank(
	cardsByRank: Map<string, number[]>,
	cardCountRange: { minCards?: number; maxCards?: number },
	rankOrder: string[],
	work: PatternWorkBudget
): PatternCandidates[] {
	const candidates: PatternCandidates[] = [];
	for (const [rank, indices] of cardsByRank.entries()) {
		const minCards = cardCountRange.minCards ?? 1;
		const maxCards = cardCountRange.maxCards ?? indices.length;
		if (indices.length < minCards) {
			continue;
		}
		const max = Math.min(indices.length, maxCards);
		for (let size = minCards; size <= max; size++) {
			const cardCombinations = generateCombinations(indices, size, work);
			for (const combo of cardCombinations) {
				candidates.push({ indices: combo });
			}
		}
	}

	return rankOrder.length > 0 ? dedupeByIndices(candidates, work) : candidates;
}

function buildConsecutiveRuns(
	rankOrder: string[],
	rankIndex: Record<string, number>,
	cardsByRank: Map<string, number[]>,
	rankLimit: { minCards?: number; maxCards?: number },
	work: PatternWorkBudget
): PatternCandidates[] {
	const availableRanks = rankOrder.filter((rank) => {
		work.consume();
		return cardsByRank.has(rank);
	});
	const candidates: PatternCandidates[] = [];
	const minCards = rankLimit.minCards ?? 3;
	const maxCards = rankLimit.maxCards;
	if (availableRanks.length < minCards) {
		return candidates;
	}

	for (let start = 0; start < availableRanks.length; start++) {
		let end = start;
		while (end + 1 < availableRanks.length) {
			work.consume();
			const rankA = availableRanks[end];
			const rankB = availableRanks[end + 1];
			if (rankIndex[rankB] === rankIndex[rankA] + 1) {
				end++;
			} else {
				break;
			}
		}

		const segmentLength = end - start + 1;
		const segmentMax = maxCards !== undefined ? Math.min(segmentLength, maxCards) : segmentLength;
		if (segmentLength < minCards) {
			continue;
		}
		for (let windowSize = minCards; windowSize <= segmentMax; windowSize++) {
			for (let offset = 0; offset <= segmentLength - windowSize; offset++) {
				work.consume();
				const windowRanks = availableRanks.slice(start + offset, start + offset + windowSize);
				const rankOptions = windowRanks.map((rank) => cardsByRank.get(rank) ?? []);
				const combos = cartesianProduct(rankOptions, work);
				for (const combo of combos) {
					candidates.push({ indices: combo.sort((a, b) => a - b) });
				}
			}
		}
	}

	return dedupeByIndices(candidates, work);
}

function runCandidates(cards: CardInput[], availableIndices: number[], rankIndex: Record<string, number>, rankOrder: string[], match: PatternMatchKind & { kind: 'run' }, work: PatternWorkBudget): PatternCandidates[] {
	const candidates: PatternCandidates[] = [];
	if (!match.requireSameSuit) {
		const byRank = toCardMapByKey(cards, availableIndices, (card) => card.rank);
		candidates.push(...buildConsecutiveRuns(rankOrder, rankIndex, byRank, { minCards: match.minCards, maxCards: match.maxCards }, work));
		return candidates;
	}
	const bySuit = toCardMapByKey(cards, availableIndices, (card) => card.suit);
	for (const suitIndices of bySuit.values()) {
		const byRank = toCardMapByKey(cards, suitIndices, (card) => card.rank);
		const suitCandidates = buildConsecutiveRuns(rankOrder, rankIndex, byRank, { minCards: match.minCards, maxCards: match.maxCards }, work);
		candidates.push(...suitCandidates);
	}

	return candidates;
}

function containsCandidates(
	cards: CardInput[],
	availableIndices: number[],
	match: PatternMatchKind & { kind: 'contains' }
): PatternCandidates[] {
	const targetRanks = normalizeValues(match.rank);
	const targetSuits = normalizeValues(match.suit);
	const minCards = match.min ?? 1;
	const indices: number[] = [];

	for (const index of availableIndices) {
		const card = cards[index];
		const rankMatch = targetRanks.length === 0 || targetRanks.includes(card.rank);
		const suitMatch = targetSuits.length === 0 || (card.suit !== undefined && targetSuits.includes(card.suit));
		if (rankMatch && suitMatch) {
			indices.push(index);
		}
	}

	if (indices.length < minCards) {
		return [];
	}

	return [{ indices }];
}

function cardCountCandidates(availableIndices: number[], match: PatternMatchKind & { kind: 'card_count' }): PatternCandidates[] {
	const minCards = match.min ?? 1;
	const maxCards = match.max;
	if (!isInRange(availableIndices.length, minCards, maxCards)) {
		return [];
	}
	return [{ indices: [...availableIndices] }];
}

function findMatchesForPattern(
	match: PatternMatchKind,
	cards: CardInput[],
	availableIndices: number[],
	rankIndex: Record<string, number>,
	rankOrder: string[],
	trace: PatternDetectorTraceEntry[] | undefined,
	eventIndex: number,
	options: PatternMatchOptions,
	work: PatternWorkBudget
): PatternCandidates[] {
	work.consume(1 + availableIndices.length);
	let matchCandidates: PatternCandidates[] = [];

	switch (match.kind) {
		case 'card_count':
			matchCandidates = cardCountCandidates(availableIndices, match);
			break;
		case 'all_same_rank': {
			const byRank = toCardMapByKey(cards, availableIndices, (card) => card.rank);
			matchCandidates = combinationsByRank(byRank, match, rankOrder, work);
			break;
		}
		case 'all_same_suit': {
			const bySuit = toCardMapByKey(cards, availableIndices, (card) => card.suit);
			matchCandidates = combinationsByRank(bySuit, match, rankOrder, work);
			break;
		}
		case 'run':
			matchCandidates = runCandidates(cards, availableIndices, rankIndex, rankOrder, match, work);
			break;
		case 'contains':
			matchCandidates = containsCandidates(cards, availableIndices, match);
			break;
		case 'any': {
			for (const child of match.matches) {
				matchCandidates.push(...findMatchesForPattern(child, cards, availableIndices, rankIndex, rankOrder, trace, eventIndex, options, work));
			}
			matchCandidates = dedupeByIndices(matchCandidates, work);
			break;
		}
		case 'all': {
			const childMatchLists: PatternCandidates[][] = [];
			for (const child of match.matches) {
				const childMatches = findMatchesForPattern(child, cards, availableIndices, rankIndex, rankOrder, trace, eventIndex, options, work);
				childMatchLists.push(childMatches);
				if (childMatches.length === 0) break;
			}
			if (childMatchLists.some((childMatches) => childMatches.length === 0)) break;
			const disallowOverlap = options.disallowOverlap ?? true;
			const allCandidates: PatternCandidates[] = [];
			combineCandidateLists(childMatchLists, 0, [], (combined) => {
				allCandidates.push({ indices: [...combined].sort((a, b) => a - b) });
			}, disallowOverlap, work);
			matchCandidates = dedupeByIndices(allCandidates, work);
			break;
		}
		default:
			matchCandidates = [];
			break;
	}

	emitTrace(trace, eventIndex, 'match', `evaluated match ${match.kind}`, {
		kind: match.kind,
		count: matchCandidates.length
	});

	return dedupeByIndices(matchCandidates, work);
}

function checkCapability(pack: PatternRulePack, match: PatternMatchKind): PatternDetectorRuleIssue[] {
	const issues: PatternDetectorRuleIssue[] = [];
	if (match.kind === 'card_count' && !pack.capabilities.includes('pattern:count')) {
		addIssues(issues, { code: 'missing_capability', message: 'pattern:count is not enabled' });
	}
	if (match.kind === 'all_same_rank' && !pack.capabilities.includes('pattern:all_same_rank')) {
		addIssues(issues, { code: 'missing_capability', message: 'pattern:all_same_rank is not enabled' });
	}
	if (match.kind === 'run' && !pack.capabilities.includes('pattern:run')) {
		addIssues(issues, { code: 'missing_capability', message: 'pattern:run is not enabled' });
	}
	if (match.kind === 'all_same_suit' && !pack.capabilities.includes('pattern:all_same_suit')) {
		addIssues(issues, { code: 'missing_capability', message: 'pattern:all_same_suit is not enabled' });
	}
	if (match.kind === 'contains' && !pack.capabilities.includes('pattern:contains')) {
		addIssues(issues, { code: 'missing_capability', message: 'pattern:contains is not enabled' });
	}
	if ((match.kind === 'all' || match.kind === 'any') && !pack.capabilities.includes(`composition:${match.kind}` as 'composition:all' | 'composition:any')) {
		addIssues(issues, { code: 'missing_capability', message: `${match.kind} composition is not enabled` });
	}
	if (match.kind === 'all' || match.kind === 'any') {
		for (const child of match.matches) {
			addIssues(issues, ...checkCapability(pack, child));
		}
	}
	return issues;
}

export function detectPatterns(
	cards: CardInput[],
	rulePack: unknown = createPatternDetectorRulePack(),
	options: PatternMatchOptions = {},
	parentWork?: PatternWorkBudget
): PatternDetectionResult {
	const work = new PatternWorkBudget(undefined, parentWork);
	work.consume();
	assertPatternBudget(cards, rulePack, work);
	const issues = validatePatternRulePack(rulePack);
	const trace = options.trace ? [] : undefined;
	if (issues.length > 0 && options.strictValidation) {
		throw new Error(`Pattern pack validation failed: ${issues.map((issue) => issue.code).join(', ')}`);
	}
	if (issues.length > 0) {
		emitTrace(trace, -1, 'rulepack', 'pattern pack validation issues', { count: issues.length });
		return { isValid: false, matches: [], issues, trace };
	}

	const resolved = rulePack as PatternRulePack;
	work.consume(cards.length + resolved.rankOrder.length);
	const sortedCards = cloneCards(cards);
	const rankIndex = getRankIndex(resolved.rankOrder);

	if (resolved.patterns.length === 0) {
		if (resolved.requirePatterns) {
			const patternIssue = { code: 'no_patterns', message: 'No patterns are configured' };
			emitTrace(trace, -1, 'rule', 'pattern configuration missing', { code: patternIssue.code });
			return { isValid: false, matches: [], issues: [patternIssue], trace };
		}
		emitTrace(trace, -1, 'rulepack', 'pattern pack has no patterns');
		return { isValid: true, matches: [], issues: [] };
	}

	emitTrace(trace, -1, 'rulepack', 'pattern pack is valid');
	const result: PatternMatchResult[] = [];

	const allIssues = [...issues];
	for (let i = 0; i < resolved.patterns.length; i++) {
		const pattern = resolved.patterns[i];
		if (!pattern.id) {
			continue;
		}
		emitTrace(trace, i, 'rule', `evaluating pattern ${pattern.id}`);
		const validationIssues = checkCapability(resolved, pattern.match);
		if (validationIssues.length > 0) {
			const issue = validationIssues.map((item) => item.code).join(',');
			addIssues(allIssues, ...validationIssues.map((validationIssue) => ({
				...validationIssue,
				ruleId: pattern.id
			})));
			emitTrace(trace, i, 'rule', `pattern ${pattern.id} uses missing capabilities`, { issue });
			continue;
		}

		const candidates = findMatchesForPattern(
			pattern.match,
			sortedCards,
			sortedCards.map((_, index) => index),
			rankIndex,
			resolved.rankOrder,
			trace,
			i,
			options,
			work
		);

		if (candidates.length === 0) {
			emitTrace(trace, i, 'rule', `pattern ${pattern.id} had no candidates`);
			continue;
		}
		const maxFromRule = pattern.maxMatches ?? options.maxMatchesPerRule ?? candidates.length;
		const cap = Math.max(0, Math.min(candidates.length, maxFromRule));
		// Charge sorting up front so accounting does not depend on the JS engine's sort algorithm.
		work.consume(candidates.length * Math.ceil(Math.log2(Math.max(1, candidates.length))));
		const selectedCandidates = candidates
			.slice()
			.sort((left, right) => left.indices.join(',').localeCompare(right.indices.join(',')))
			.slice(0, cap);
		for (const candidate of selectedCandidates) {
			work.consume();
			result.push({
				ruleId: pattern.id,
				indices: candidate.indices,
				cards: candidate.indices.map((index) => sortedCards[index])
			});
		}
		emitTrace(trace, i, 'rule', `pattern ${pattern.id} matched`, { count: selectedCandidates.length });
	}

	if (allIssues.length > 0) {
		return { isValid: false, matches: result, issues: allIssues, trace };
	}

	return { isValid: true, matches: result, issues: [], trace };
}
