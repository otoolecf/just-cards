import type { CreateRulesetDraftInput } from './service';

export interface StarterRulesetDraft extends Omit<CreateRulesetDraftInput, 'bundle'> {
	bundle: {
		bundleVersion: 'runtime-bundle/v1';
		gameId: string;
		displayName: string;
		runtimeRulePack: {
			scoringTriggers: [];
		};
	};
}

function nowStamp(): string {
	return new Date().toISOString().replace(/[:.]/g, '-');
}

export function createStarterRulesetDraft(): StarterRulesetDraft {
	const stamp = nowStamp();
	const compact = Date.now().toString(36);

	return {
		name: `Starter Ruleset ${stamp}`,
		origin: 'manual',
		notes: 'Starter ruleset generated from score page.',
		bundle: {
			bundleVersion: 'runtime-bundle/v1',
			gameId: `starter-${compact}`,
			displayName: 'Starter Table',
			runtimeRulePack: {
				scoringTriggers: []
			}
		}
	};
}
