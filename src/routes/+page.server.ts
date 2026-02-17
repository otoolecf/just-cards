import type { PageServerLoad } from './$types';
import { getDefaultRulesetService } from '$lib/rulesets/default-service';

export const load: PageServerLoad = async () => {
	try {
		const service = await getDefaultRulesetService();
		const rulesets = await service.list();
		return { rulesets };
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unable to load rulesets';
		return {
			rulesets: [],
			rulesetLoadError: message
		};
	}
};
