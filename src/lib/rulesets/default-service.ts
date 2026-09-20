import { dev } from '$app/environment';
import { createRulesetService, type RulesetService } from './service';
import { createRulesetStore } from './store';
import { createD1RulesetStore } from './d1-store';
import { familyRulesets } from './family-presets';

let localService: Promise<RulesetService> | undefined;
function withPresets(service: RulesetService): RulesetService {
	return {
		createDraft: service.createDraft.bind(service),
		deleteArchived: service.deleteArchived.bind(service),
		updateMetadata: service.updateMetadata.bind(service),
		list: async () => [...familyRulesets(), ...(await service.list())],
		getById: async (id) =>
			familyRulesets().find((r) => r.id === id) ?? (await service.getById(id)),
	};
}
export async function getDefaultRulesetService(
	platform?: App.Platform,
): Promise<RulesetService> {
	// Bindings belong to this request/environment; never cache a deployed D1 handle globally.
	if (platform && !dev) {
		if (!platform.env.RULESETS_DB)
			throw new Error('RULESETS_DB binding is required');
		return withPresets(
			createRulesetService(createD1RulesetStore(platform.env.RULESETS_DB)),
		);
	}
	if (!dev && process.env.NODE_ENV !== 'test')
		throw new Error('Ruleset storage binding is required');
	return (localService ??= createRulesetStore().then((store) =>
		withPresets(createRulesetService(store)),
	));
}
export function resetDefaultRulesetServiceForTests(): void {
	localService = undefined;
}
