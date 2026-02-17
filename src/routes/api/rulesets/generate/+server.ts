import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDefaultRulesetService } from '$lib/rulesets/default-service';
import { generateRulesetDraftFromInput } from '$lib/rulesets/generator';

interface GenerateRulesetPayload {
	source?:
		| {
				type?: 'url';
				url?: string;
		  }
		| {
				type?: 'text';
				text?: string;
		  };
	name?: string;
	notes?: string;
}

export const POST: RequestHandler = async ({ request, fetch }) => {
	const payload = (await request.json().catch(() => ({}))) as GenerateRulesetPayload;

	try {
		const generated = await generateRulesetDraftFromInput(
			{
				source: payload.source as Parameters<typeof generateRulesetDraftFromInput>[0]['source'],
				name: payload.name,
				notes: payload.notes
			},
			{ fetchImpl: fetch }
		);

		const service = await getDefaultRulesetService();
		const ruleset = await service.createDraft(generated.draft);

		return json({
			ruleset,
			diagnostics: generated.diagnostics,
			facts: generated.facts
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unable to generate ruleset';
		return json({ error: message }, { status: 400 });
	}
};
