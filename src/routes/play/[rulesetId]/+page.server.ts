import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDefaultRulesetService } from '$lib/rulesets/default-service';
import { logServerEvent } from '$lib/server/log';

export const load: PageServerLoad = async ({ params }) => {
	const rulesetId = params.rulesetId?.trim();
	logServerEvent('play_ruleset_load_start', { rulesetId });
	if (!rulesetId) {
		logServerEvent('play_ruleset_load_missing_id', {}, 'warn');
		throw error(404, 'Ruleset not found');
	}

	const service = await getDefaultRulesetService();
	const ruleset = await service.getById(rulesetId);
	if (!ruleset) {
		logServerEvent('play_ruleset_load_not_found', { rulesetId }, 'warn');
		throw error(404, `Ruleset "${rulesetId}" not found`);
	}
	logServerEvent('play_ruleset_load_success', {
		rulesetId,
		name: ruleset.name,
		gameId: ruleset.bundle.gameId
	});

	return {
		ruleset
	};
};
