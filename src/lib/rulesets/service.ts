import { createGameplayRulePack, deriveGameState } from '$lib/gameplay/engine';
import { createRulePack, deriveState } from '$lib/scorekeeper/engine';
import type { RuntimeRulePack } from '$lib/runtime/game-runtime';
import { resolveUiProfile } from '$lib/ui/ui-profile';
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

interface RuntimeBundleDraft {
	bundleVersion: 'runtime-bundle/v0' | 'runtime-bundle/v1';
	gameId: string;
	displayName: string;
	runtimeRulePack: RuntimeRulePack;
	uiProfile?: unknown;
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
	if (bundle.bundleVersion !== 'runtime-bundle/v0' && bundle.bundleVersion !== 'runtime-bundle/v1') {
		issues.push('bundleVersion must be "runtime-bundle/v0" or "runtime-bundle/v1"');
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

	if (bundle.bundleVersion === 'runtime-bundle/v1' && bundle.uiProfile !== undefined && !isObject(bundle.uiProfile)) {
		issues.push('uiProfile must be an object when provided');
	}
	if (bundle.bundleVersion === 'runtime-bundle/v1' && bundle.explain !== undefined) {
		if (!isObject(bundle.explain)) {
			issues.push('explain must be an object when provided');
		} else if (bundle.explain.schemaVersion !== 'ruleset-explain/v0') {
			issues.push('explain.schemaVersion must be "ruleset-explain/v0" when explain is provided');
		}
	}

	return issues;
}

function validateBundleRuntime(runtimeRulePack: RuntimeRulePack): string[] {
	const issues: string[] = [];

	const gameplayState = deriveGameState([], runtimeRulePack.gameplayRulePack ?? createGameplayRulePack());
	for (const issue of gameplayState.validationIssues ?? []) {
		issues.push(`gameplay:${issue.code}`);
	}

	const scoreState = deriveState([], runtimeRulePack.scoreRulePack ?? createRulePack());
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

	const uiProfileInput = typedBundle.bundleVersion === 'runtime-bundle/v1' ? typedBundle.uiProfile : undefined;
	let uiProfile;
	try {
		uiProfile = resolveUiProfile(uiProfileInput, typedBundle.runtimeRulePack);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'ui profile validation failed';
		throw new Error(`Invalid runtime bundle: ${message}`);
	}

	return {
		bundleVersion: 'runtime-bundle/v1',
		gameId: typedBundle.gameId.trim(),
		displayName: typedBundle.displayName.trim(),
		runtimeRulePack: typedBundle.runtimeRulePack,
		uiProfile
	};
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
