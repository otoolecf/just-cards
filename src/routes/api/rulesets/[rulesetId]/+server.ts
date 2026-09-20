import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDefaultRulesetService } from '$lib/rulesets/default-service';

export const GET: RequestHandler = async ({ params, platform }) => {
	const rulesetId = params.rulesetId;
	if (!rulesetId) {
		return json({ error: 'rulesetId is required' }, { status: 400 });
	}

	try {
		const service = await getDefaultRulesetService(platform);
		const ruleset = await service.getById(rulesetId);
		if (!ruleset) {
			return json(
				{ error: `Ruleset "${rulesetId}" not found` },
				{ status: 404 },
			);
		}
		return json(ruleset);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Unable to load ruleset';
		return json({ error: message }, { status: 500 });
	}
};

export const PATCH: RequestHandler = async ({ params, request, platform }) => {
	try {
		const service = await getDefaultRulesetService(platform);
		const input =
			(await request.json()) as import('$lib/rulesets/store').RulesetMetadataUpdate;
		return json(await service.updateMetadata(params.rulesetId, input));
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Unable to update ruleset';
		return json(
			{ error: message },
			{ status: /changed/.test(message) ? 409 : 400 },
		);
	}
};
export const POST: RequestHandler = async ({ params, request, platform }) => {
	try {
		const { name } = (await request.json()) as { name: string };
		if (typeof name !== 'string' || !name.trim() || name.trim().length > 80)
			throw new Error('Enter a name from 1 to 80 characters.');
		const service = await getDefaultRulesetService(platform),
			original = await service.getById(params.rulesetId);
		if (!original) return json({ error: 'Ruleset not found' }, { status: 404 });
		const bundle = structuredClone(original.bundle);
		bundle.displayName = name.trim();
		const copy = await service.createDraft({
			name: name.trim(),
			origin: original.origin,
			sourceUrl: original.sourceUrl,
			notes: `Copy of ${original.name} (${original.id}). ${original.notes ?? ''}`,
			bundle,
		});
		return json(copy);
	} catch (e) {
		return json(
			{ error: e instanceof Error ? e.message : 'Unable to duplicate ruleset' },
			{ status: 400 },
		);
	}
};

export const DELETE: RequestHandler = async ({ params, request, platform }) => {
	try {
		const { expectedUpdatedAt } = (await request.json()) as {
			expectedUpdatedAt: string;
		};
		const service = await getDefaultRulesetService(platform);
		await service.deleteArchived(params.rulesetId, expectedUpdatedAt);
		return json({ deleted: true });
	} catch (e) {
		const error = e instanceof Error ? e.message : 'Unable to delete game';
		return json({ error }, { status: /unchanged/.test(error) ? 409 : 400 });
	}
};
