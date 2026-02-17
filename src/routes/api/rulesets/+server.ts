import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDefaultRulesetService } from '$lib/rulesets/default-service';

interface CreateRulesetPayload {
	name?: string;
	origin?: 'manual' | 'llm' | 'import';
	sourceUrl?: string;
	notes?: string;
	bundle?: unknown;
}

export const GET: RequestHandler = async () => {
	try {
		const service = await getDefaultRulesetService();
		const rulesets = await service.list();
		return json({ rulesets });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unable to list rulesets';
		return json({ error: message }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request }) => {
	const payload = (await request.json().catch(() => ({}))) as CreateRulesetPayload;

	try {
		const service = await getDefaultRulesetService();
		const created = await service.createDraft({
			name: payload.name ?? '',
			origin: payload.origin ?? 'manual',
			sourceUrl: payload.sourceUrl,
			notes: payload.notes,
			bundle: payload.bundle
		});
		return json(created);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unable to create ruleset';
		return json({ error: message }, { status: 400 });
	}
};
