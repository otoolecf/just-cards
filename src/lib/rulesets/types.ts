import type { RuntimeRulePack } from '$lib/runtime/game-runtime';
import type { UiProfileV0 } from '$lib/ui/ui-profile';

export type RulesetOrigin = 'manual' | 'llm' | 'import';

export interface RuntimeRulesetExplainV0 {
	schemaVersion: 'ruleset-explain/v0';
	goal: string;
	playerRange: {
		min: number;
		max: number;
	};
	rounds?: number;
	turnFlow: {
		drawFrom: string[];
		playTo: string[];
	};
	scoring: {
		lowScoreWins: boolean;
		aceValue: number;
		rankOverrides: Array<{ rank: string; value: number }>;
	};
	zones: Array<{ id: string; label: string; hint: string }>;
	diagnostics: string[];
	source: {
		type: 'url' | 'text';
		url?: string;
	};
	generatedAt: string;
}

export interface RuntimeRulesetBundle {
	bundleVersion: 'runtime-bundle/v1';
	gameId: string;
	displayName: string;
	runtimeRulePack: RuntimeRulePack;
	uiProfile: UiProfileV0;
	explain?: RuntimeRulesetExplainV0;
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
