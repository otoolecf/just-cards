import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDefaultRulesetService } from '$lib/rulesets/default-service';
import {
	createHouseRules,
	type HouseRuleSettings,
} from '$lib/rulesets/house-rules';
import { policySnapshot } from '$lib/rulesets/generation-report';
export const POST: RequestHandler = async ({ request, params, platform }) => {
	try {
		const input = (await request.json()) as {
			name: string;
			settings: HouseRuleSettings;
			policySnapshot: string;
		};
		const service = await getDefaultRulesetService(platform),
			parent = await service.getById(params.rulesetId);
		if (!parent) return json({ error: 'Ruleset not found' }, { status: 404 });
		if (input.policySnapshot !== policySnapshot(parent.bundle))
			return json(
				{ error: 'The base rules changed. Reload before saving.' },
				{ status: 409 },
			);
		const bundle = createHouseRules(parent, input.name, input.settings);
		const ruleset = await service.createDraft({
			name: bundle.displayName,
			origin: 'manual',
			notes: `Family variant of ${parent.name} (${parent.id}).`,
			bundle,
		});
		return json({ ruleset });
	} catch (error) {
		return json(
			{
				error:
					error instanceof Error ? error.message : 'Unable to save house rules',
			},
			{ status: 400 },
		);
	}
};
