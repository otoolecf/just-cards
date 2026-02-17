import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDefaultRulesetService } from '$lib/rulesets/default-service';

export const load: PageServerLoad = async ({ params }) => {
	const rulesetId = params.rulesetId?.trim();
	if (!rulesetId) {
		throw error(404, 'Ruleset not found');
	}

	const service = await getDefaultRulesetService();
	const ruleset = await service.getById(rulesetId);
	if (!ruleset) {
		throw error(404, `Ruleset "${rulesetId}" not found`);
	}

	return {
		ruleset
	};
};
