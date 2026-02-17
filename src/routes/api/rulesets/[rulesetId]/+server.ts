import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDefaultRulesetService } from '$lib/rulesets/default-service';

export const GET: RequestHandler = async ({ params }) => {
	const rulesetId = params.rulesetId;
	if (!rulesetId) {
		return json({ error: 'rulesetId is required' }, { status: 400 });
	}

	try {
		const service = await getDefaultRulesetService();
		const ruleset = await service.getById(rulesetId);
		if (!ruleset) {
			return json({ error: `Ruleset "${rulesetId}" not found` }, { status: 404 });
		}
		return json(ruleset);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unable to load ruleset';
		return json({ error: message }, { status: 500 });
	}
};
