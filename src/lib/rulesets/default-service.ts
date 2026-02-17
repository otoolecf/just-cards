import { createRulesetService, type RulesetService } from './service';
import { createRulesetStore } from './store';

let defaultRulesetServicePromise: Promise<RulesetService> | undefined;

export function getDefaultRulesetService(): Promise<RulesetService> {
	if (!defaultRulesetServicePromise) {
		defaultRulesetServicePromise = (async () => {
			const store = await createRulesetStore();
			return createRulesetService(store);
		})();
	}
	return defaultRulesetServicePromise;
}

export function resetDefaultRulesetServiceForTests(): void {
	defaultRulesetServicePromise = undefined;
}
