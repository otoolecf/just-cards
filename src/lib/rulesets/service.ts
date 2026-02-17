import { createGameplayRulePack, deriveGameState } from '$lib/gameplay/engine';
import { createRulePack, deriveState } from '$lib/scorekeeper/engine';
import type { CreateRulesetInput, RulesetRecord, RuntimeRulesetBundle } from './types';
import type { RulesetStore } from './store';

export type { RuntimeRulesetBundle } from './types';

export interface CreateRulesetDraftInput {
	name: string;
	origin: CreateRulesetInput['origin'];
	sourceUrl?: string;
	notes?: string;
	bundle: unknown;
}

export interface RulesetService {
	createDraft(input: CreateRulesetDraftInput): Promise<RulesetRecord>;
	list(): Promise<RulesetRecord[]>;
	getById(id: string): Promise<RulesetRecord | undefined>;
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
	if (bundle.bundleVersion !== 'runtime-bundle/v0') {
		issues.push('bundleVersion must be "runtime-bundle/v0"');
	}
	if (typeof bundle.gameId !== 'string' || bundle.gameId.trim().length === 0) {
		issues.push('gameId must be a non-empty string');
	}
	if (typeof bundle.displayName !== 'string' || bundle.displayName.trim().length === 0) {
		issues.push('displayName must be a non-empty string');
	}
	if (!isObject(bundle.runtimeRulePack)) {
		issues.push('runtimeRulePack must be an object');
	}

	if (isObject(bundle.runtimeRulePack)) {
		const runtimeRulePack = bundle.runtimeRulePack as Record<string, unknown>;
		if (runtimeRulePack.scoringTriggers !== undefined && !Array.isArray(runtimeRulePack.scoringTriggers)) {
			issues.push('runtimeRulePack.scoringTriggers must be an array when provided');
		}
	}

	return issues;
}

function validateBundleRuntime(bundle: RuntimeRulesetBundle): string[] {
	const issues: string[] = [];

	const gameplayState = deriveGameState(
		[],
		bundle.runtimeRulePack.gameplayRulePack ?? createGameplayRulePack()
	);
	for (const issue of gameplayState.validationIssues ?? []) {
		issues.push(`gameplay:${issue.code}`);
	}

	const scoreState = deriveState(
		[],
		bundle.runtimeRulePack.scoreRulePack ?? createRulePack()
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

	const typedBundle = bundle as RuntimeRulesetBundle;
	const runtimeIssues = validateBundleRuntime(typedBundle);
	if (runtimeIssues.length > 0) {
		throw new Error(`Invalid runtime bundle: ${runtimeIssues.join('; ')}`);
	}
	return typedBundle;
}

class DefaultRulesetService implements RulesetService {
	constructor(private readonly store: RulesetStore) {}

	async createDraft(input: CreateRulesetDraftInput): Promise<RulesetRecord> {
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
			bundle
		});
	}

	async list(): Promise<RulesetRecord[]> {
		return this.store.list();
	}

	async getById(id: string): Promise<RulesetRecord | undefined> {
		return this.store.getById(id);
	}
}

export function createRulesetService(store: RulesetStore): RulesetService {
	return new DefaultRulesetService(store);
}
