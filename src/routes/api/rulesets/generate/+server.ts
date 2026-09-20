import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDefaultRulesetService } from '$lib/rulesets/default-service';
import { env } from '$env/dynamic/private';
import { generateRulesetDraftWithAgent } from '$lib/rulesets/llm-agent';
import { logServerEvent } from '$lib/server/log';

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

export const POST: RequestHandler = async ({ request, fetch, platform }) => {
	const payload = (await request.json().catch(() => ({}))) as GenerateRulesetPayload;
	const traceId = `gen-${Math.random().toString(36).slice(2, 8)}`;
	logServerEvent('ruleset_generate_start', {
		traceId,
		sourceType: payload.source?.type,
		sourceUrl: payload.source && 'url' in payload.source ? payload.source.url : undefined,
		name: payload.name
	});

	try {
		const generated = await generateRulesetDraftWithAgent(
			{
				source: payload.source as Parameters<typeof generateRulesetDraftWithAgent>[0]['source'],
				name: payload.name,
				notes: payload.notes
			},
			{
				fetchImpl: fetch,
				apiKey: platform?.env?.OPENAI_API_KEY ?? env.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY,
				primaryModel: env.RULESET_LLM_PRIMARY_MODEL ?? process.env.RULESET_LLM_PRIMARY_MODEL,
				fallbackModel: env.RULESET_LLM_FALLBACK_MODEL ?? process.env.RULESET_LLM_FALLBACK_MODEL
			}
		);

		const service = await getDefaultRulesetService(platform);
		const ruleset = await service.createDraft(generated.draft);
		logServerEvent('ruleset_generate_success', {
			traceId,
			rulesetId: ruleset.id,
			rulesetName: ruleset.name,
			pipeline: {
				strategy: generated.pipeline.strategy,
				model: generated.pipeline.model,
				reason: generated.pipeline.reason,
				attemptCount: generated.pipeline.attempts.length
			},
			diagnosticsCount: generated.diagnostics.length
		});

		return json({
			ruleset,
			diagnostics: generated.diagnostics,
			facts: generated.facts,
			pipeline: generated.pipeline
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unable to generate ruleset';
		logServerEvent(
			'ruleset_generate_error',
			{
				traceId,
				error: message
			},
			'error'
		);
		return json({ error: message }, { status: 400 });
	}
};
