import type { CardInput, CardRank, CardSuit } from '$lib/scorekeeper/engine';

export type ValidatorPhase = string;

export type ValidatorCapability =
	| 'pattern:count'
	| 'pattern:all_same_rank'
	| 'pattern:run'
	| 'pattern:same_suit'
	| 'pattern:contains'
	| 'composition:all'
	| 'composition:any'
	| 'trace:explain';

export interface ValidatorRulePack {
	schemaVersion: 'validator/v0';
	capabilities: ValidatorCapability[];
	rankOrder: string[];
	canPlay: PlayRule[];
	requireRules?: boolean;
}

export interface PlayAction {
	actorId?: string;
	actionType?: string;
	phase?: ValidatorPhase;
	cards: CardInput[];
}

export interface ValidationContext {
	currentPlayerId?: string;
	phase?: ValidatorPhase;
}

export interface PlayValidationRulePredicate {
	phase?: ValidatorPhase[];
	actorMustBeCurrentPlayer?: boolean;
	actionTypes?: string[];
}

export type PlayMatch =
	| {
			kind: 'all';
			matches: PlayMatch[];
	  }
	| {
			kind: 'any';
			matches: PlayMatch[];
	  }
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
	  };

export interface PlayRule {
	id: string;
	predicate?: PlayValidationRulePredicate;
	match: PlayMatch;
	failureCode?: string;
	failureMessage?: string;
}

export interface PlayValidationIssue {
	code: string;
	message: string;
	ruleId?: string;
}

export interface PlayValidationTraceEntry {
	eventIndex: number;
	stage: 'match' | 'rule' | 'rulepack';
	message: string;
	data?: Record<string, unknown>;
}

export interface DerivePlayValidationOptions {
	trace?: boolean;
	strictValidation?: boolean;
}

export interface PlayValidationResult {
	isValid: boolean;
	issues: PlayValidationIssue[];
	matchedRuleId?: string;
	trace?: PlayValidationTraceEntry[];
}

export interface CreateValidatorRulePackOptions {
	capabilities?: ValidatorCapability[];
	rankOrder?: string[];
	canPlay?: PlayRule[];
	requireRules?: boolean;
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
	trace: PlayValidationTraceEntry[] | undefined,
	eventIndex: number,
	stage: PlayValidationTraceEntry['stage'],
	message: string,
	data?: Record<string, unknown>
): void {
	if (!trace) {
		return;
	}
	trace.push({ eventIndex, stage, message, ...(data ? { data } : {}) } as PlayValidationTraceEntry);
}

function defaultCapabilities(): ValidatorCapability[] {
	return ['pattern:count', 'pattern:all_same_rank', 'pattern:run', 'pattern:same_suit', 'pattern:contains', 'composition:any', 'composition:all', 'trace:explain'];
}

export function createValidatorRulePack(options: CreateValidatorRulePackOptions = {}): ValidatorRulePack {
	return {
		schemaVersion: 'validator/v0',
		capabilities: options.capabilities ?? defaultCapabilities(),
		rankOrder: options.rankOrder ?? DEFAULT_RANK_ORDER,
		canPlay: options.canPlay ?? [],
		requireRules: options.requireRules ?? false
	};
}

function isValidPlayMatch(value: unknown): value is PlayMatch {
	if (!isObject(value)) {
		return false;
	}
	const candidate = value as { kind?: unknown };
	if (candidate.kind !== 'all' && candidate.kind !== 'any' && candidate.kind !== 'card_count' && candidate.kind !== 'all_same_rank' && candidate.kind !== 'all_same_suit' && candidate.kind !== 'run' && candidate.kind !== 'contains') {
		return false;
	}
	if (candidate.kind === 'all' || candidate.kind === 'any') {
		const candidateMatches = (value as { matches?: unknown[] }).matches;
		return Array.isArray(candidateMatches) && candidateMatches.every(isValidPlayMatch);
	}
	if (candidate.kind === 'card_count' || candidate.kind === 'all_same_rank' || candidate.kind === 'all_same_suit' || candidate.kind === 'run') {
		if ('min' in (value as Record<string, unknown>)) {
			const minValue = (value as { min?: unknown }).min;
			if (minValue !== undefined && (typeof minValue !== 'number' || !Number.isInteger(minValue) || minValue < 0)) {
				return false;
			}
		}
		if ('max' in (value as Record<string, unknown>)) {
			const maxValue = (value as { max?: unknown }).max;
			if (maxValue !== undefined && (typeof maxValue !== 'number' || !Number.isInteger(maxValue) || maxValue < 0)) {
				return false;
			}
		}
		return true;
	}

	const contains = value as { min?: unknown; rank?: unknown; suit?: unknown };
	if ('min' in contains && contains.min !== undefined && (typeof contains.min !== 'number' || !Number.isInteger(contains.min) || contains.min < 0)) {
		return false;
	}
	if ('rank' in contains && contains.rank !== undefined) {
		const rankValues = Array.isArray(contains.rank) ? contains.rank : [contains.rank];
		if (!rankValues.every((candidate) => typeof candidate === 'string')) {
			return false;
		}
	}
	if ('suit' in contains && contains.suit !== undefined) {
		const suitValues = Array.isArray(contains.suit) ? contains.suit : [contains.suit];
		if (!suitValues.every((candidate) => typeof candidate === 'string')) {
			return false;
		}
	}
	return true;
}

function validateValidatorRulePack(rulePack: unknown): PlayValidationIssue[] {
	const issues: PlayValidationIssue[] = [];
	if (!isObject(rulePack)) {
		issues.push({ code: 'schema_not_object', message: 'Rule pack must be an object' });
		return issues;
	}
	if ((rulePack as { schemaVersion?: unknown }).schemaVersion !== 'validator/v0') {
		issues.push({
			code: 'schema_version_mismatch',
			message: `Expected schemaVersion "validator/v0" but received "${String((rulePack as { schemaVersion?: unknown }).schemaVersion ?? 'undefined')}"`
		});
	}
	if (!Array.isArray(rulePack.rankOrder) || rulePack.rankOrder.length === 0) {
		issues.push({ code: 'invalid_rank_order', message: 'rankOrder must be a non-empty array of ranks' });
	}
	if (!Array.isArray(rulePack.canPlay)) {
		issues.push({ code: 'missing_can_play', message: 'canPlay is required and must be an array' });
		return issues;
	}
	for (let i = 0; i < (rulePack.canPlay as unknown[]).length; i++) {
		const rule = (rulePack.canPlay as unknown[])[i] as Record<string, unknown>;
		if (!isObject(rule)) {
			issues.push({ code: 'invalid_rule_shape', message: `canPlay[${i}] must be an object` });
			continue;
		}
		if (typeof rule.id !== 'string' || !rule.id) {
			issues.push({ code: 'invalid_rule_id', message: `canPlay[${i}] is missing a valid id` });
		}
		if (!isObject(rule.match) || !isValidPlayMatch(rule.match)) {
			issues.push({ code: 'invalid_rule_match', message: `canPlay[${i}] has invalid match definition` });
		}
	}
	if (rulePack.requireRules && (rulePack.canPlay as unknown[]).length === 0) {
		issues.push({ code: 'rules_required', message: 'requireRules is true but canPlay is empty' });
	}
	return issues;
}

function normalizeValues(value: string | string[] | undefined): string[] {
	if (!value) {
		return [];
	}
	return Array.isArray(value) ? value : [value];
}

function countByPredicate(cards: CardInput[], predicate: (card: CardInput) => boolean): number {
	let count = 0;
	for (const card of cards) {
		if (predicate(card)) {
			count++;
		}
	}
	return count;
}

function inRuleMatchRange(count: number, min: number | undefined, max: number | undefined): boolean {
	if (min !== undefined && count < min) {
		return false;
	}
	if (max !== undefined && count > max) {
		return false;
	}
	return true;
}

function firstRankIndex(rankOrder: Record<string, number>, card: CardInput): number {
	return rankOrder[card.rank] ?? -1;
}

function runMatcher(match: Extract<PlayMatch, { kind: 'run' }>, cards: CardInput[], rankOrder: Record<string, number>): boolean {
	if (!inRuleMatchRange(cards.length, match.minCards ?? 3, match.maxCards)) {
		return false;
	}
	if (match.requireSameSuit && cards.some((card) => !card.suit)) {
		return false;
	}
	const suit = cards[0]?.suit;
	if (match.requireSameSuit && !suit) {
		return false;
	}
	const unique = new Set<string>();
	for (const card of cards) {
		if (!card.rank || typeof card.rank !== 'string' || firstRankIndex(rankOrder, card) < 0) {
			return false;
		}
		if (match.requireSameSuit && card.suit !== suit) {
			return false;
		}
		unique.add(card.rank);
	}
	if (unique.size !== cards.length) {
		return false;
	}

	const indices = cards.map((card) => firstRankIndex(rankOrder, card)).sort((left, right) => left - right);
	for (let i = 1; i < indices.length; i++) {
		if (indices[i - 1] + 1 !== indices[i]) {
			return false;
		}
	}
	return true;
}

function countMatcher(match: Extract<PlayMatch, { kind: 'card_count' }>, cards: CardInput[]): boolean {
	return inRuleMatchRange(cards.length, match.min, match.max);
}

function sameRankMatcher(match: Extract<PlayMatch, { kind: 'all_same_rank' }>, cards: CardInput[]): boolean {
	if (!inRuleMatchRange(cards.length, match.minCards ?? 1, match.maxCards)) {
		return false;
	}
	if (cards.length === 0) {
		return false;
	}
	const firstRank = cards[0].rank;
	for (let i = 1; i < cards.length; i++) {
		if (cards[i].rank !== firstRank) {
			return false;
		}
	}
	return true;
}

function sameSuitMatcher(match: Extract<PlayMatch, { kind: 'all_same_suit' }>, cards: CardInput[]): boolean {
	if (!inRuleMatchRange(cards.length, match.minCards ?? 1, match.maxCards)) {
		return false;
	}
	if (cards.length === 0 || !cards[0].suit) {
		return false;
	}
	const firstSuit = cards[0].suit;
	for (let i = 1; i < cards.length; i++) {
		if (!cards[i].suit || cards[i].suit !== firstSuit) {
			return false;
		}
	}
	return true;
}

function containsMatcher(match: Extract<PlayMatch, { kind: 'contains' }>, cards: CardInput[]): boolean {
	const targetRanks = normalizeValues(match.rank as CardRank | CardRank[] | undefined);
	const targetSuits = normalizeValues(match.suit as CardSuit | CardSuit[] | undefined);
	const totalMatches = countByPredicate(cards, (card) => {
		const rankMatch = targetRanks.length === 0 || targetRanks.includes(card.rank);
		const suitMatch = targetSuits.length === 0 || (typeof card.suit === 'string' && targetSuits.includes(card.suit));
		return rankMatch && suitMatch;
	});
	return totalMatches >= (match.min ?? 1);
}

function matchPredicate(match: PlayMatch, cards: CardInput[], rankIndex: Record<string, number>): boolean {
	switch (match.kind) {
		case 'all':
			for (const child of match.matches) {
				if (!matchPredicate(child, cards, rankIndex)) {
					return false;
				}
			}
			return true;
		case 'any':
			for (const child of match.matches) {
				if (matchPredicate(child, cards, rankIndex)) {
					return true;
				}
			}
			return false;
		case 'card_count':
			return countMatcher(match, cards);
		case 'all_same_rank':
			return sameRankMatcher(match, cards);
		case 'all_same_suit':
			return sameSuitMatcher(match, cards);
		case 'run':
			return runMatcher(match, cards, rankIndex);
		case 'contains':
			return containsMatcher(match, cards);
		default:
			return false;
	}
}

function canRuleApply(rule: PlayRule, action: PlayAction, context: ValidationContext = {}): boolean {
	if (!rule.predicate) {
		return true;
	}
	if (rule.predicate.actionTypes && rule.predicate.actionTypes.length > 0 && action.actionType) {
		if (!rule.predicate.actionTypes.includes(action.actionType)) {
			return false;
		}
	} else if (rule.predicate.actionTypes && rule.predicate.actionTypes.length > 0) {
		return false;
	}
	if (rule.predicate.phase && rule.predicate.phase.length > 0) {
		const phase = action.phase ?? context.phase;
		if (!phase || !rule.predicate.phase.includes(phase)) {
			return false;
		}
	}
	if (rule.predicate.actorMustBeCurrentPlayer && context.currentPlayerId !== undefined && action.actorId !== context.currentPlayerId) {
		return false;
	}
	return true;
}

function checkCapability(pack: ValidatorRulePack, rule: PlayMatch): boolean {
	if ((rule as { kind: string }).kind === 'card_count' && !pack.capabilities.includes('pattern:count')) {
		return false;
	}
	if ((rule as { kind: string }).kind === 'all_same_rank' && !pack.capabilities.includes('pattern:all_same_rank')) {
		return false;
	}
	if ((rule as { kind: string }).kind === 'all_same_suit' && !pack.capabilities.includes('pattern:same_suit')) {
		return false;
	}
	if ((rule as { kind: string }).kind === 'run' && !pack.capabilities.includes('pattern:run')) {
		return false;
	}
	if ((rule as { kind: string }).kind === 'contains' && !pack.capabilities.includes('pattern:contains')) {
		return false;
	}
	if ((rule as { kind: string }).kind === 'all' && !pack.capabilities.includes('composition:all')) {
		return false;
	}
	if ((rule as { kind: string }).kind === 'any' && !pack.capabilities.includes('composition:any')) {
		return false;
	}
	if ((rule as { kind: string }).kind === 'all' || (rule as { kind: string }).kind === 'any') {
		return (rule as { matches: PlayMatch[] }).matches.every((child) => checkCapability(pack, child));
	}
	return true;
}

export function validateCanPlay(
	action: PlayAction,
	rulePack: unknown = createValidatorRulePack(),
	context: ValidationContext = {},
	options: DerivePlayValidationOptions = {}
): PlayValidationResult {
	const issues = validateValidatorRulePack(rulePack);
	const trace = options.trace ? [] : undefined;

	if (issues.length > 0 && options.strictValidation) {
		throw new Error(`Validator rule pack validation failed: ${issues.map((issue) => issue.code).join(', ')}`);
	}

	if (issues.length > 0) {
		if (trace) {
			emitTrace(trace, -1, 'rulepack', 'validator rule pack issues', { count: issues.length });
		}
		return { isValid: false, issues };
	}

	const resolved = rulePack as ValidatorRulePack;
	const rankIndex: Record<string, number> = {};
	resolved.rankOrder.forEach((rank, index) => {
		rankIndex[rank] = index;
	});
	const actionCards = cloneCards(action.cards);

	emitTrace(trace, -1, 'rulepack', 'validator rule pack is valid');

	if (resolved.canPlay.length === 0) {
		if (resolved.requireRules) {
			const ruleIssue = { code: 'no_play_rules', message: 'No play rules are configured' };
			if (trace) {
				emitTrace(trace, -1, 'rule', 'play rules missing', { code: ruleIssue.code });
			}
			return { isValid: false, issues: [ruleIssue] };
		}
		return { isValid: true, issues: [] };
	}

	let anyApplied = false;
	for (let index = 0; index < resolved.canPlay.length; index++) {
		const rule = resolved.canPlay[index];
		if (!canRuleApply(rule, action, context)) {
			emitTrace(trace, index, 'rule', `rule ${rule.id} not applicable`);
			continue;
		}
		anyApplied = true;
		if (!checkCapability(resolved, rule.match)) {
			const capabilityIssue = { code: 'missing_capability', message: `Rule ${rule.id} uses unsupported validation primitive` };
			emitTrace(trace, index, 'rule', capabilityIssue.message, { ruleId: rule.id, code: capabilityIssue.code });
			return { isValid: false, issues: [capabilityIssue], trace: trace ? [...trace] : undefined };
		}
		const matched = matchPredicate(rule.match, actionCards, rankIndex);
		emitTrace(trace, index, 'match', `rule ${rule.id} evaluated`, { ruleId: rule.id, matched });
		if (matched) {
			if (trace) {
				emitTrace(trace, index, 'rule', `rule ${rule.id} matched`);
			}
			return { isValid: true, issues: [], matchedRuleId: rule.id, trace };
		}
		const issue = {
			code: rule.failureCode ?? 'action_not_allowed',
			message: rule.failureMessage ?? `Action does not satisfy rule ${rule.id}`,
			ruleId: rule.id
		};
		issues.push(issue);
	}

	if (!anyApplied) {
		return {
			isValid: false,
			issues: [{ code: 'no_applicable_rule', message: 'No play rule was applicable for this action context' }],
			trace
		};
	}

	if (issues.length > 0) {
		return { isValid: false, issues, trace };
	}

	return { isValid: true, issues: [], trace };
}
