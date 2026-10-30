import { safeSourceUrl } from './source-url';
import { validateGenerationReport } from './generation-report';
import { createGameplayRulePack, deriveGameState } from '$lib/gameplay/engine';
import { createRulePack, deriveState } from '$lib/scorekeeper/engine';
import type { RuntimeRulePack } from '$lib/runtime/game-runtime';
import { resolveUiProfile } from '$lib/ui/ui-profile';
import type {
	CreateRulesetInput,
	RulesetRecord,
	RuntimeRulesetBundle,
} from './types';
import type { RulesetStore, RulesetMetadataUpdate } from './store';
import { validateTableRules } from '$lib/gameplay/table-rules';

export type { RuntimeRulesetBundle } from './types';

export interface CreateRulesetDraftInput {
	name: string;
	origin: CreateRulesetInput['origin'];
	sourceUrl?: string;
	notes?: string;
	bundle: unknown;
}

export interface RulesetService {
	deleteArchived(id: string, expectedUpdatedAt: string): Promise<void>;
	updateMetadata(
		id: string,
		input: RulesetMetadataUpdate,
	): Promise<RulesetRecord>;
	createDraft(input: CreateRulesetDraftInput): Promise<RulesetRecord>;
	list(limit?: number, offset?: number): Promise<RulesetRecord[]>;
	getById(id: string): Promise<RulesetRecord | undefined>;
}

interface RuntimeBundleDraft {
	houseRules?: RuntimeRulesetBundle['houseRules'];
	generationReport?: unknown;
	bundleVersion: 'runtime-bundle/v0' | 'runtime-bundle/v1';
	gameId: string;
	displayName: string;
	runtimeRulePack: RuntimeRulePack;
	uiProfile?: unknown;
	explain?: unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateBundleShape(bundle: unknown): string[] {
	const issues: string[] = [];
	if (!isObject(bundle)) {
		issues.push('bundle must be an object');
		return issues;
	}
	if (
		bundle.bundleVersion !== 'runtime-bundle/v0' &&
		bundle.bundleVersion !== 'runtime-bundle/v1'
	) {
		issues.push(
			'bundleVersion must be "runtime-bundle/v0" or "runtime-bundle/v1"',
		);
	}
	if (typeof bundle.gameId !== 'string' || bundle.gameId.trim().length === 0) {
		issues.push('gameId must be a non-empty string');
	}
	if (
		typeof bundle.displayName !== 'string' ||
		bundle.displayName.trim().length === 0
	) {
		issues.push('displayName must be a non-empty string');
	}
	if (!isObject(bundle.runtimeRulePack)) {
		issues.push('runtimeRulePack must be an object');
	}

	if (isObject(bundle.runtimeRulePack)) {
		const runtimeRulePack = bundle.runtimeRulePack as Record<string, unknown>;
		if (
			runtimeRulePack.scoringTriggers !== undefined &&
			!Array.isArray(runtimeRulePack.scoringTriggers)
		) {
			issues.push(
				'runtimeRulePack.scoringTriggers must be an array when provided',
			);
		}
	}

	if (
		bundle.bundleVersion === 'runtime-bundle/v1' &&
		bundle.uiProfile !== undefined &&
		!isObject(bundle.uiProfile)
	) {
		issues.push('uiProfile must be an object when provided');
	}
	if (
		bundle.bundleVersion === 'runtime-bundle/v1' &&
		bundle.explain !== undefined
	) {
		if (!isObject(bundle.explain)) {
			issues.push('explain must be an object when provided');
		} else if (bundle.explain.schemaVersion !== 'ruleset-explain/v0') {
			issues.push(
				'explain.schemaVersion must be "ruleset-explain/v0" when explain is provided',
			);
		}
	}

	return issues;
}

function validateBundleRuntime(runtimeRulePack: RuntimeRulePack): string[] {
	const issues: string[] = [];
	if (runtimeRulePack.tableRules !== undefined) {
		try {
			validateTableRules(runtimeRulePack.tableRules);
		} catch (error) {
			issues.push(
				error instanceof Error ? error.message : 'Invalid table rules',
			);
		}
	}

	const gameplayState = deriveGameState(
		[],
		runtimeRulePack.gameplayRulePack ?? createGameplayRulePack(),
	);
	for (const issue of gameplayState.validationIssues ?? []) {
		issues.push(`gameplay:${issue.code}`);
	}

	const scoreState = deriveState(
		[],
		runtimeRulePack.scoreRulePack ?? createRulePack(),
	);
	for (const issue of scoreState.validationIssues ?? []) {
		issues.push(`score:${issue.code}`);
	}

	return issues;
}

function assertValidBundle(bundle: unknown): RuntimeRulesetBundle {
	const shapeIssues = validateBundleShape(bundle);
	if (shapeIssues.length > 0) {
		throw new Error(`Invalid runtime bundle: ${shapeIssues.join('; ')}`);
	}

	const typedBundle = bundle as RuntimeBundleDraft;
	const runtimeIssues = validateBundleRuntime(typedBundle.runtimeRulePack);
	if (runtimeIssues.length > 0) {
		throw new Error(`Invalid runtime bundle: ${runtimeIssues.join('; ')}`);
	}

	const uiProfileInput =
		typedBundle.bundleVersion === 'runtime-bundle/v1'
			? typedBundle.uiProfile
			: undefined;
	let uiProfile;
	try {
		uiProfile = resolveUiProfile(uiProfileInput, typedBundle.runtimeRulePack);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'ui profile validation failed';
		throw new Error(`Invalid runtime bundle: ${message}`);
	}

	const result: RuntimeRulesetBundle = {
		bundleVersion: 'runtime-bundle/v1',
		gameId: typedBundle.gameId.trim(),
		displayName: typedBundle.displayName.trim(),
		runtimeRulePack: typedBundle.runtimeRulePack,
		uiProfile,
		...(typedBundle.explain
			? { explain: typedBundle.explain as RuntimeRulesetBundle['explain'] }
			: {}),
	};
	if (typedBundle.houseRules !== undefined) {
		const h = typedBundle.houseRules;
		if (
			!h ||
			h.version !== 'house-rules/v1' ||
			typeof h.parentId !== 'string' ||
			!h.parentId ||
			typeof h.parentName !== 'string' ||
			typeof h.createdAt !== 'string'
		)
			throw new Error('Invalid house-rule provenance');
		result.houseRules = {
			version: h.version,
			parentId: h.parentId,
			parentName: h.parentName,
			createdAt: h.createdAt,
		};
	}
	if (typedBundle.generationReport !== undefined) {
		validateGenerationReport(typedBundle.generationReport, result);
		result.generationReport = typedBundle.generationReport;
	}
	return result;
}

class DefaultRulesetService implements RulesetService {
	constructor(private readonly store: RulesetStore) {}

	async createDraft(input: CreateRulesetDraftInput): Promise<RulesetRecord> {
		if (typeof input.name !== 'string' || input.name.length > 80) throw new Error('Invalid ruleset name');
		if (input.sourceUrl !== undefined && !safeSourceUrl(input.sourceUrl)) throw new Error('Source URL must use HTTP or HTTPS without credentials');
		if (JSON.stringify(input).length > 65536) throw new Error('Ruleset is too large');
		const name = input.name.trim();
		if (!name) {
			throw new Error('name is required');
		}

		const bundle = assertValidBundle(input.bundle);
		return this.store.create({
			name,
			origin: input.origin,
			sourceUrl: input.sourceUrl,
			notes: input.notes,
			bundle,
		});
	}

	async deleteArchived(id: string, expectedUpdatedAt: string): Promise<void> {
		if (id.startsWith('builtin-'))
			throw new Error(
				'Built-in games are protected. Duplicate this game to customize it.',
			);
		if (
			typeof expectedUpdatedAt !== 'string' ||
			!Number.isFinite(Date.parse(expectedUpdatedAt))
		)
			throw new Error('A valid catalog revision is required.');
		await this.store.deleteArchived(id, expectedUpdatedAt);
	}
	async updateMetadata(
		id: string,
		input: RulesetMetadataUpdate,
	): Promise<RulesetRecord> {
		if (id.startsWith('builtin-'))
			throw new Error(
				'Built-in games are protected. Duplicate this game to customize it.',
			);
		if (
			typeof input.name !== 'string' ||
			!input.name.trim() ||
			input.name.trim().length > 80 ||
			typeof input.archived !== 'boolean' ||
			typeof input.expectedUpdatedAt !== 'string' ||
			!Number.isFinite(Date.parse(input.expectedUpdatedAt))
		)
			throw new Error(
				'Enter a name from 1 to 80 characters and valid catalog settings.',
			);
		return this.store.updateMetadata(id, { ...input, name: input.name.trim() });
	}
	async list(limit = 100, offset = 0): Promise<RulesetRecord[]> {
		return this.store.list(limit, offset);
	}

	async getById(id: string): Promise<RulesetRecord | undefined> {
		return this.store.getById(id);
	}
}

export function createRulesetService(store: RulesetStore): RulesetService {
	return new DefaultRulesetService(store);
}
