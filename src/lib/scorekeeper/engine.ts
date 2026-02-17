import rulePackSchema from './rulepack-schema.json';
import { detectPatterns, type PatternMatchOptions, type PatternRulePack } from '$lib/gameplay/pattern-detector';

export type CardRank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
export type CardSuit = 'clubs' | 'diamonds' | 'hearts' | 'spades';

export interface CardInput {
	rank: CardRank;
	suit?: CardSuit;
	tags?: string[];
}

type NonAceRank = Exclude<CardRank, 'A'>;

export interface RuleEvalContext {
	phase?: string;
	actorRole?: string;
	tags?: string[];
}

export type CardPredicate =
	| {
			kind: 'rank_is';
			rank: CardRank;
	  }
	| {
			kind: 'is_face';
			value: boolean;
	  }
	| {
			kind: 'is_ace';
			value: boolean;
	  }
	| {
			kind: 'has_tag';
			tag: string;
	  }
	| {
			kind: 'context_has_tag';
			tag: string;
	  };

export type ValueOperation =
	| {
			kind: 'set';
			value: number;
	  }
	| {
			kind: 'add';
			value: number;
	  }
	| {
			kind: 'multiply';
			value: number;
	  }
	| {
			kind: 'clamp_min';
			value: number;
	  }
	| {
			kind: 'clamp_max';
			value: number;
	  };

export interface ValueModifier {
	id: string;
	when: CardPredicate;
	operation: ValueOperation;
}

interface ValueModifierInput {
	id: string;
	when: CardPredicate;
	operation?: ValueOperation;
	value?: number;
}

export type RuleCapability =
	| 'value:base-ranks'
	| 'value:modifier-set'
	| 'value:op-algebra'
	| 'routing:target-kinds'
	| 'settlement:pool-transfer'
	| 'trace:explain'
	| 'resolution:first-match';

export interface RulePack {
	schemaVersion: 'rulepack/v0';
	capabilities: RuleCapability[];
	baseAceValue: number;
	rankValues: Record<NonAceRank, number>;
	modifiers: ValueModifier[];
	modifierResolution: 'last_match_wins' | 'first_match_wins';
}

export interface RulePackValidationIssue {
	code: string;
	message: string;
}

export type ScoringTargetKind = 'player' | 'team' | 'pool';

export interface ScoringTarget {
	kind: ScoringTargetKind;
	id: string;
}

interface RoundEntry {
	target: ScoringTarget;
	cards: CardInput[];
}

export interface DeltaEntry {
	target: ScoringTarget;
	delta: number;
}

export interface PatternScoringRule {
	patternId: string;
	points: number;
}

interface PatternRoundEntry extends RoundEntry {}

export type ScoreEvent =
	| {
			type: 'add_round';
			playerCards: Record<string, CardInput[]>;
	  }
	| {
			type: 'add_round';
			entries: RoundEntry[];
	  }
	| {
			type: 'add_pattern_round';
			patternPack: PatternRulePack;
			patternScoring: PatternScoringRule[];
			entries: PatternRoundEntry[];
			matchOptions?: PatternMatchOptions;
	  }
	| {
			type: 'add_delta';
			entries: DeltaEntry[];
	  }
	| {
			type: 'settle_pool';
			fromPoolId: string;
			toTarget: ScoringTarget;
			amount?: number;
	  }
	| {
			type: 'undo';
	  }
	| {
			type: 'redo';
	  };

export interface ScoreTraceEntry {
	eventIndex: number;
	stage: 'validate' | 'detect' | 'score' | 'route' | 'settle';
	message: string;
	data?: Record<string, unknown>;
}

export interface ScoreState {
	totalsByTarget: Record<string, number>;
	totalsByPlayer: Record<string, number>;
	validationIssues?: RulePackValidationIssue[];
	trace?: ScoreTraceEntry[];
}

interface CreateRulePackOptions {
	baseAceValue?: number;
	rankOverrides?: Partial<Record<NonAceRank, number>>;
	modifiers?: ValueModifierInput[];
	modifierResolution?: RulePack['modifierResolution'];
	capabilities?: RuleCapability[];
}

interface DeriveStateOptions {
	trace?: boolean;
	strictValidation?: boolean;
	context?: RuleEvalContext;
}

interface ValueEvalResult {
	finalValue: number;
	matchedModifierIds: string[];
}

interface JsonSchema {
	type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null' | 'any';
	enum?: unknown[];
	const?: unknown;
	required?: string[];
	properties?: Record<string, JsonSchema>;
	items?: JsonSchema;
	additionalProperties?: boolean | JsonSchema;
	anyOf?: JsonSchema[];
	oneOf?: JsonSchema[];
}

const rulePackV0Schema = rulePackSchema as unknown as JsonSchema;

function isSchemaIssue(issue: RulePackValidationIssue): boolean {
	return issue.code.startsWith('schema:');
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function deepEqual(left: unknown, right: unknown): boolean {
	if (left === right) {
		return true;
	}

	if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
		return false;
	}

	if (Array.isArray(left) !== Array.isArray(right)) {
		return false;
	}

	if (Array.isArray(left) && Array.isArray(right)) {
		if (left.length !== right.length) {
			return false;
		}

		for (let i = 0; i < left.length; i++) {
			if (!deepEqual(left[i], right[i])) {
				return false;
			}
		}

		return true;
	}

	const leftMap = left as Record<string, unknown>;
	const rightMap = right as Record<string, unknown>;
	const leftKeys = Object.keys(leftMap);
	const rightKeys = Object.keys(rightMap);

	if (leftKeys.length !== rightKeys.length) {
		return false;
	}

	for (const key of leftKeys) {
		if (!(key in rightMap) || !deepEqual(leftMap[key], rightMap[key])) {
			return false;
		}
	}

	return true;
}

function recordSchemaIssue(path: string, code: string, message: string, issues: RulePackValidationIssue[]): void {
	issues.push({ code: `schema:${code}`, message: `${path}: ${message}` });
}

function validateAgainstSchema(value: unknown, schema: JsonSchema, path: string): RulePackValidationIssue[] {
	const issues: RulePackValidationIssue[] = [];

	if (!schema || Object.keys(schema).length === 0) {
		return issues;
	}

	if (schema.type === 'any') {
		return issues;
	}

	if (schema.const !== undefined && !deepEqual(value, schema.const)) {
		recordSchemaIssue(path, 'const_mismatch', `expected value ${JSON.stringify(schema.const)}`, issues);
		return issues;
	}

	if (schema.enum && !schema.enum.some((candidate) => deepEqual(value, candidate))) {
		recordSchemaIssue(
			path,
			'enum_mismatch',
			`value ${JSON.stringify(value)} does not match allowed values ${schema.enum.map((candidate) => JSON.stringify(candidate)).join(', ')}`,
			issues
		);
		return issues;
	}

	if (schema.oneOf && schema.oneOf.length > 0) {
		const matching = schema.oneOf.filter((branch) => validateAgainstSchema(value, branch, path).length === 0);
		if (matching.length === 0) {
			recordSchemaIssue(path, 'one_of_no_match', 'value does not satisfy any oneOf schema variant', issues);
		}
		if (matching.length > 1) {
			recordSchemaIssue(path, 'one_of_multiple_match', 'value satisfies more than one oneOf schema variant', issues);
		}
		return issues;
	}

	if (schema.anyOf && schema.anyOf.length > 0) {
		const matching = schema.anyOf.some((branch) => validateAgainstSchema(value, branch, path).length === 0);
		if (!matching) {
			recordSchemaIssue(path, 'any_of_no_match', 'value does not satisfy any anyOf schema variant', issues);
		}
		return issues;
	}

	if (schema.type) {
		if (schema.type === 'object') {
			if (!isObject(value)) {
				recordSchemaIssue(path, 'type_mismatch', `expected object`, issues);
				return issues;
			}
		} else if (schema.type === 'array') {
			if (!Array.isArray(value)) {
				recordSchemaIssue(path, 'type_mismatch', `expected array`, issues);
				return issues;
			}
		} else if (schema.type === 'string') {
			if (typeof value !== 'string') {
				recordSchemaIssue(path, 'type_mismatch', `expected string`, issues);
				return issues;
			}
		} else if (schema.type === 'number') {
			if (!isNumber(value)) {
				recordSchemaIssue(path, 'type_mismatch', 'expected finite number', issues);
				return issues;
			}
		} else if (schema.type === 'integer') {
			if (!isNumber(value) || !Number.isInteger(value)) {
				recordSchemaIssue(path, 'type_mismatch', 'expected integer', issues);
				return issues;
			}
		} else if (schema.type === 'boolean') {
			if (typeof value !== 'boolean') {
				recordSchemaIssue(path, 'type_mismatch', 'expected boolean', issues);
				return issues;
			}
		} else if (schema.type === 'null') {
			if (value !== null) {
				recordSchemaIssue(path, 'type_mismatch', `expected null`, issues);
				return issues;
			}
		}
	}

	if (schema.required && isObject(value)) {
		for (const required of schema.required) {
			if (!(required in value)) {
				recordSchemaIssue(path, 'required_property', `required property "${required}" is missing`, issues);
			}
		}
	}

	if (schema.items && Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			issues.push(...validateAgainstSchema(value[i], schema.items, `${path}[${i}]`));
		}
	}

	if (schema.properties && isObject(value)) {
		for (const [property, propertySchema] of Object.entries(schema.properties)) {
			if (property in value) {
				issues.push(...validateAgainstSchema(value[property], propertySchema, `${path}.${property}`));
			}
		}

		if (schema.additionalProperties === false) {
			const allowed = new Set(Object.keys(schema.properties));
			for (const property of Object.keys(value)) {
				if (!allowed.has(property)) {
					recordSchemaIssue(path, 'additional_property', `property "${property}" is not allowed`, issues);
				}
			}
		}
	}

	if (schema.additionalProperties && typeof schema.additionalProperties === 'object' && isObject(value)) {
		const allowed = schema.properties ? new Set(Object.keys(schema.properties)) : new Set<string>();
		for (const [property, entry] of Object.entries(value)) {
			if (!allowed.has(property)) {
				issues.push(...validateAgainstSchema(entry, schema.additionalProperties as JsonSchema, `${path}.${property}`));
			}
		}
	}

	return issues;
}

function validateRulePackSchema(rulePack: unknown): RulePackValidationIssue[] {
	return validateAgainstSchema(rulePack, rulePackV0Schema, '$');
}

function numericRankValues(): Record<'2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10', number> {
	return {
		'2': 2,
		'3': 3,
		'4': 4,
		'5': 5,
		'6': 6,
		'7': 7,
		'8': 8,
		'9': 9,
		'10': 10
	};
}

function normalizeModifier(input: ValueModifierInput): ValueModifier {
	if (input.operation) {
		return {
			id: input.id,
			when: input.when,
			operation: input.operation
		};
	}

	if (typeof input.value === 'number') {
		return {
			id: input.id,
			when: input.when,
			operation: {
				kind: 'set',
				value: input.value
			}
		};
	}

	return {
		id: input.id,
		when: input.when,
		operation: {
			kind: 'set',
			value: 0
		}
	};
}

function defaultCapabilities(resolution: RulePack['modifierResolution']): RuleCapability[] {
	const capabilities: RuleCapability[] = [
		'value:base-ranks',
		'value:modifier-set',
		'value:op-algebra',
		'routing:target-kinds',
		'settlement:pool-transfer',
		'trace:explain'
	];

	if (resolution === 'first_match_wins') {
		capabilities.push('resolution:first-match');
	}

	return capabilities;
}

export function createRulePack(options: CreateRulePackOptions = {}): RulePack {
	const modifierResolution = options.modifierResolution ?? 'last_match_wins';
	const capabilities = options.capabilities ?? defaultCapabilities(modifierResolution);

	return {
		schemaVersion: 'rulepack/v0',
		capabilities,
		baseAceValue: options.baseAceValue ?? 1,
		rankValues: {
			...numericRankValues(),
			J: 11,
			Q: 12,
			K: 13,
			...(options.rankOverrides ?? {})
		},
		modifiers: (options.modifiers ?? []).map(normalizeModifier),
		modifierResolution
	};
}

export function validateRulePack(rulePack: unknown): RulePackValidationIssue[] {
	const issues = validateRulePackSchema(rulePack);
	if (issues.some(isSchemaIssue)) {
		return issues;
	}

	const resolvedRulePack = rulePack as RulePack;

	const seenModifierIds = new Set<string>();
	for (const modifier of resolvedRulePack.modifiers) {
		if (seenModifierIds.has(modifier.id)) {
			issues.push({
				code: 'duplicate_modifier_id',
				message: `Modifier id "${modifier.id}" is duplicated`
			});
		}
		seenModifierIds.add(modifier.id);

		const op = modifier.operation.kind;
		if ((op === 'add' || op === 'multiply' || op === 'clamp_min' || op === 'clamp_max') && !resolvedRulePack.capabilities.includes('value:op-algebra')) {
			issues.push({
				code: 'missing_capability_value_op_algebra',
				message: `Modifier "${modifier.id}" uses operation "${op}" but capability "value:op-algebra" is missing`
			});
		}
	}

	if (resolvedRulePack.modifierResolution === 'first_match_wins' && !resolvedRulePack.capabilities.includes('resolution:first-match')) {
		issues.push({
			code: 'missing_capability_first_match',
			message: 'modifierResolution is "first_match_wins" but capability "resolution:first-match" is missing'
		});
	}

	return issues;
}

function matchesPredicate(card: CardInput, predicate: CardPredicate, context?: RuleEvalContext): boolean {
	if (predicate.kind === 'rank_is') {
		return card.rank === predicate.rank;
	}

	if (predicate.kind === 'is_face') {
		const isFace = card.rank === 'J' || card.rank === 'Q' || card.rank === 'K';
		return isFace === predicate.value;
	}

	if (predicate.kind === 'is_ace') {
		const isAce = card.rank === 'A';
		return isAce === predicate.value;
	}

	if (predicate.kind === 'has_tag') {
		return (card.tags ?? []).includes(predicate.tag);
	}

	return (context?.tags ?? []).includes(predicate.tag);
}

function applyOperation(current: number, operation: ValueOperation): number {
	if (operation.kind === 'set') {
		return operation.value;
	}

	if (operation.kind === 'add') {
		return current + operation.value;
	}

	if (operation.kind === 'multiply') {
		return current * operation.value;
	}

	if (operation.kind === 'clamp_min') {
		return Math.max(current, operation.value);
	}

	return Math.min(current, operation.value);
}

function evaluateCardValue(card: CardInput, rulePack: RulePack, context?: RuleEvalContext): ValueEvalResult {
	let value = card.rank === 'A' ? rulePack.baseAceValue : rulePack.rankValues[card.rank];
	const matchedModifierIds: string[] = [];

	for (const modifier of rulePack.modifiers) {
		if (!matchesPredicate(card, modifier.when, context)) {
			continue;
		}

		matchedModifierIds.push(modifier.id);
		value = applyOperation(value, modifier.operation);

		if (rulePack.modifierResolution === 'first_match_wins') {
			break;
		}
	}

	return {
		finalValue: value,
		matchedModifierIds
	};
}

export function cardValue(card: CardInput, rulePack: RulePack, context?: RuleEvalContext): number {
	return evaluateCardValue(card, rulePack, context).finalValue;
}

function targetKey(target: ScoringTarget): string {
	return `${target.kind}:${target.id}`;
}

function normalizeAddRoundEntries(event: Extract<ScoreEvent, { type: 'add_round' }>): RoundEntry[] {
	if ('entries' in event) {
		return event.entries;
	}

	return Object.entries(event.playerCards).map(([playerId, cards]) => ({
		target: { kind: 'player', id: playerId },
		cards
	}));
}

function getPatternScoreMap(scoring: PatternScoringRule[]): Map<string, number> {
	const scoringMap = new Map<string, number>();
	for (const rule of scoring) {
		scoringMap.set(rule.patternId, rule.points);
	}

	return scoringMap;
}

function normalizePatternRoundEntries(event: Extract<ScoreEvent, { type: 'add_pattern_round' }>): PatternRoundEntry[] {
	return event.entries;
}

function applyRoundTotals(
	totalsByTarget: Record<string, number>,
	entries: RoundEntry[],
	rulePack: RulePack,
	trace: ScoreTraceEntry[] | undefined,
	eventIndex: number,
	context?: RuleEvalContext
): void {
	for (const entry of entries) {
		const key = targetKey(entry.target);
		let roundTotal = 0;

		for (const card of entry.cards) {
			const valueResult = evaluateCardValue(card, rulePack, context);
			roundTotal += valueResult.finalValue;

			if (trace) {
				trace.push({
					eventIndex,
					stage: 'detect',
					message: 'Card modifier matching complete',
					data: {
						rank: card.rank,
						matchedModifierIds: valueResult.matchedModifierIds
					}
				});
				trace.push({
					eventIndex,
					stage: 'score',
					message: 'Card value scored',
					data: {
						rank: card.rank,
						value: valueResult.finalValue
					}
				});
			}
		}

		totalsByTarget[key] = (totalsByTarget[key] ?? 0) + roundTotal;
		if (trace) {
			trace.push({
				eventIndex,
				stage: 'route',
				message: 'Round total routed to scoring target',
				data: {
					target: key,
					roundTotal
				}
			});
		}
	}
}

function applyPatternRoundTotals(
	totalsByTarget: Record<string, number>,
	entries: PatternRoundEntry[],
	patternPack: PatternRulePack,
	patternScoring: PatternScoringRule[],
	trace: ScoreTraceEntry[] | undefined,
	eventIndex: number,
	strictValidation?: boolean,
	matchOptions: PatternMatchOptions = {}
): RulePackValidationIssue[] {
	const validationIssues: RulePackValidationIssue[] = [];
	const scoringByRule = getPatternScoreMap(patternScoring);

	for (const entry of entries) {
		const key = targetKey(entry.target);
		let roundTotal = 0;
		const detection = detectPatterns(entry.cards, patternPack, {
			...matchOptions,
			trace: trace !== undefined || matchOptions.trace,
			strictValidation
		});

		validationIssues.push(...detection.issues.map((issue) => ({
			...issue,
			code: `pattern:${issue.code}`
		})));

		for (const match of detection.matches) {
			const points = scoringByRule.get(match.ruleId);
			if (points === undefined) {
				validationIssues.push({
					code: 'pattern:unmapped_pattern',
					message: `No pattern scoring rule found for "${match.ruleId}"`
				});
				continue;
			}

			roundTotal += points;
			if (trace) {
				trace.push({
					eventIndex,
					stage: 'detect',
					message: `Pattern detected for rule ${match.ruleId}`,
					data: {
						ruleId: match.ruleId,
						cardCount: match.indices.length,
						cards: match.cards.map((card) => card.rank),
						indices: match.indices
					}
				});
				trace.push({
					eventIndex,
					stage: 'score',
					message: 'Pattern scored',
					data: {
						ruleId: match.ruleId,
						points
					}
				});
			}
		}

		totalsByTarget[key] = (totalsByTarget[key] ?? 0) + roundTotal;
		if (trace) {
			trace.push({
				eventIndex,
				stage: 'route',
				message: 'Pattern round total routed to scoring target',
				data: {
					target: key,
					roundTotal
				}
			});
		}
	}

	return validationIssues;
}

function applyDeltaTotals(
	totalsByTarget: Record<string, number>,
	entries: DeltaEntry[],
	trace: ScoreTraceEntry[] | undefined,
	eventIndex: number
): void {
	for (const entry of entries) {
		const key = targetKey(entry.target);
		totalsByTarget[key] = (totalsByTarget[key] ?? 0) + entry.delta;
		if (trace) {
			trace.push({
				eventIndex,
				stage: 'score',
				message: 'Manual score delta applied',
				data: {
					target: key,
					delta: entry.delta
				}
			});
			trace.push({
				eventIndex,
				stage: 'route',
				message: 'Manual score delta routed to scoring target',
				data: {
					target: key,
					delta: entry.delta
				}
			});
		}
	}
}

function applyPoolSettlement(
	totalsByTarget: Record<string, number>,
	event: Extract<ScoreEvent, { type: 'settle_pool' }>,
	trace: ScoreTraceEntry[] | undefined,
	eventIndex: number
): void {
	const poolKey = targetKey({ kind: 'pool', id: event.fromPoolId });
	const toKey = targetKey(event.toTarget);
	const available = totalsByTarget[poolKey] ?? 0;
	if (available <= 0) {
		if (trace) {
			trace.push({
				eventIndex,
				stage: 'settle',
				message: 'Pool settlement skipped due to empty pool',
				data: { poolKey }
			});
		}
		return;
	}

	const requested = event.amount ?? available;
	if (requested <= 0) {
		if (trace) {
			trace.push({
				eventIndex,
				stage: 'settle',
				message: 'Pool settlement skipped due to non-positive requested amount',
				data: { poolKey, requested }
			});
		}
		return;
	}

	const transferAmount = Math.min(requested, available);
	totalsByTarget[poolKey] = available - transferAmount;
	totalsByTarget[toKey] = (totalsByTarget[toKey] ?? 0) + transferAmount;

	if (trace) {
		trace.push({
			eventIndex,
			stage: 'settle',
			message: 'Pool settled to target',
			data: {
				from: poolKey,
				to: toKey,
				amount: transferAmount
			}
		});
	}
}

function totalsByPlayerFromTargets(totalsByTarget: Record<string, number>): Record<string, number> {
	const totalsByPlayer: Record<string, number> = {};
	for (const [key, total] of Object.entries(totalsByTarget)) {
		if (!key.startsWith('player:')) {
			continue;
		}

		const playerId = key.slice('player:'.length);
		totalsByPlayer[playerId] = total;
	}

	return totalsByPlayer;
}

export function deriveState(events: ScoreEvent[], rulePack: unknown, options: DeriveStateOptions = {}): ScoreState {
	const validationIssues = validateRulePack(rulePack);
	const hasSchemaIssue = validationIssues.some(isSchemaIssue);
	const trace: ScoreTraceEntry[] | undefined = options.trace ? [] : undefined;

	if (options.strictValidation && validationIssues.length > 0) {
		throw new Error(`Rule pack validation failed: ${validationIssues.map((issue) => issue.code).join(', ')}`);
	}

	if (hasSchemaIssue) {
		if (trace) {
			for (const issue of validationIssues) {
				trace.push({
					eventIndex: -1,
					stage: 'validate',
					message: issue.message,
					data: { code: issue.code }
				});
			}
		}
		return {
			totalsByTarget: {},
			totalsByPlayer: {},
			validationIssues,
			trace
		};
	}

	const validatedRulePack = rulePack as RulePack;
	const allIssues = [...validationIssues];

	if (trace && validationIssues.length > 0) {
		for (const issue of validationIssues) {
			trace.push({
				eventIndex: -1,
				stage: 'validate',
				message: issue.message,
				data: { code: issue.code }
			});
		}
	}

	const appliedMutations: Array<Extract<ScoreEvent, { type: 'add_round' | 'add_pattern_round' | 'add_delta' | 'settle_pool' }>> = [];
	const undoneMutations: Array<Extract<ScoreEvent, { type: 'add_round' | 'add_pattern_round' | 'add_delta' | 'settle_pool' }>> = [];

	events.forEach((event) => {
		if (event.type === 'add_round' || event.type === 'add_pattern_round' || event.type === 'add_delta' || event.type === 'settle_pool') {
			appliedMutations.push(event);
			undoneMutations.length = 0;
			return;
		}

		if (event.type === 'undo') {
			const lastMutation = appliedMutations.pop();
			if (lastMutation) {
				undoneMutations.push(lastMutation);
			}
			return;
		}

		const lastUndoneMutation = undoneMutations.pop();
		if (lastUndoneMutation) {
			appliedMutations.push(lastUndoneMutation);
		}
	});

	const totalsByTarget: Record<string, number> = {};
	appliedMutations.forEach((mutation, eventIndex) => {
		if (mutation.type === 'add_round') {
			applyRoundTotals(totalsByTarget, normalizeAddRoundEntries(mutation), validatedRulePack, trace, eventIndex, options.context);
			return;
		}
		if (mutation.type === 'add_pattern_round') {
			allIssues.push(
				...applyPatternRoundTotals(
					totalsByTarget,
					normalizePatternRoundEntries(mutation),
					mutation.patternPack,
					mutation.patternScoring,
					trace,
					eventIndex,
					options.strictValidation,
					mutation.matchOptions
				)
			);
			return;
		}
		if (mutation.type === 'add_delta') {
			applyDeltaTotals(totalsByTarget, mutation.entries, trace, eventIndex);
			return;
		}

		applyPoolSettlement(totalsByTarget, mutation, trace, eventIndex);
	});

	const state: ScoreState = {
		totalsByTarget,
		totalsByPlayer: totalsByPlayerFromTargets(totalsByTarget)
	};

	if (allIssues.length > 0) {
		state.validationIssues = allIssues;
	}

	if (trace) {
		state.trace = trace;
	}

	return state;
}

export const RULEPACK_V0_SCHEMA = rulePackV0Schema;
