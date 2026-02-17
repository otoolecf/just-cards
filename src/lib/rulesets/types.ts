import type { RuntimeRulePack } from '$lib/runtime/game-runtime';

export type RulesetOrigin = 'manual' | 'llm' | 'import';

export interface RuntimeRulesetBundle {
	bundleVersion: 'runtime-bundle/v0';
	gameId: string;
	displayName: string;
	runtimeRulePack: RuntimeRulePack;
}

export interface CreateRulesetInput {
	id?: string;
	name: string;
	origin: RulesetOrigin;
	sourceUrl?: string;
	notes?: string;
	bundle: RuntimeRulesetBundle;
}

export interface RulesetRecord {
	id: string;
	name: string;
	origin: RulesetOrigin;
	sourceUrl?: string;
	notes?: string;
	bundle: RuntimeRulesetBundle;
	createdAt: string;
	updatedAt: string;
}
