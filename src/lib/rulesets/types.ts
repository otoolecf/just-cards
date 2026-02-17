import type { RuntimeRulePack } from '$lib/runtime/game-runtime';
import type { UiProfileV0 } from '$lib/ui/ui-profile';

export type RulesetOrigin = 'manual' | 'llm' | 'import';

export interface RuntimeRulesetBundle {
	bundleVersion: 'runtime-bundle/v1';
	gameId: string;
	displayName: string;
	runtimeRulePack: RuntimeRulePack;
	uiProfile: UiProfileV0;
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
