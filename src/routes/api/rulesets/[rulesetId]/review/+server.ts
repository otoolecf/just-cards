import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDefaultRulesetService } from '$lib/rulesets/default-service';
import { acceptRulesetReview } from '$lib/rulesets/generation-report';
export const POST: RequestHandler = async ({ request, params, platform }) => {
	try {
		const input = (await request.json()) as { accept?: boolean; policySnapshot?: string };
		if (input.accept !== true)
			return json({ error: 'Explicit acceptance is required.' }, { status: 400 });
		const service = await getDefaultRulesetService(platform),
			original = await service.getById(params.rulesetId);
		if (!original) return json({ error: 'Ruleset not found' }, { status: 404 });
		if (input.policySnapshot !== original.bundle.generationReport?.policySnapshot)
			return json({ error: 'Rules changed. Reload the review.' }, { status: 409 });
		const bundle = acceptRulesetReview(original.bundle);
		const ruleset = await service.createDraft({
			name: original.name,
			origin: original.origin,
			sourceUrl: original.sourceUrl,
			notes: original.notes,
			bundle
		});
		return json({ ruleset });
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : 'Unable to accept rules' },
			{ status: 400 }
		);
	}
};
