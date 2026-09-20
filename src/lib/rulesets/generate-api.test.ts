import { extractionFromBundle } from './extraction-contract';
import { familyRulesets } from './family-presets';
import { beforeEach, describe, expect, it } from 'vitest';

import { resetDefaultRulesetServiceForTests } from './default-service';
import { POST as generateRuleset } from '../../routes/api/rulesets/generate/+server';

function eventForPost(
	body: unknown,
	fetchImpl?: typeof fetch
): Parameters<typeof generateRuleset>[0] {
	return {
		params: {},
		request: new Request('http://localhost/api/rulesets/generate', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}),
		...(fetchImpl ? { fetch: fetchImpl } : {})
	} as Parameters<typeof generateRuleset>[0];
}

describe('rulesets generate api', () => {
	beforeEach(() => {
		resetDefaultRulesetServiceForTests();
		process.env.RULESET_STORE_DRIVER = 'memory';
		Reflect.deleteProperty(process.env, 'OPENAI_API_KEY');
	});

	it('ruleset_generate_api_creates_ruleset_from_text_input', async () => {
		const fetchImpl: typeof fetch = async (input, init) => {
			const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
			if (url === 'https://api.openai.com/v1/chat/completions') {
				const payload = JSON.parse(String(init?.body ?? '{}')) as { model?: string };
				expect(payload.model).toBe('gpt-5-mini');
				return new Response(
					JSON.stringify({
						choices: [
							{
								message: {
									content: JSON.stringify({
										gameName: 'Generated from prose',
										players: { min: 2, max: 4 },
										handZoneName: 'hand',
										zones: ['stock', 'discard', 'meld'],
										turn: {
											drawSources: ['stock', 'discard'],
											playTargets: ['meld', 'discard']
										},
										scoring: {
											lowScoreWins: false,
											aceValue: 1,
											rankOverrides: { J: 10, Q: 10, K: 10 }
										},
										diagnostics: []
									})
								}
							}
						]
					}),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				);
			}
			return new Response('not found', { status: 404 });
		};

		const response = await generateRuleset(
			eventForPost(
				{
					source: {
						type: 'text',
						text: 'We play with 2 to 4 players, draw from stock or discard, then place one card to meld.'
					},
					name: 'Generated from prose'
				},
				fetchImpl
			)
		);

		expect(response.status).toBe(200);
		const payload = (await response.json()) as {
			ruleset: {
				id: string;
				name: string;
				bundle: { bundleVersion: string; uiProfile: { schemaVersion: string } };
			};
			diagnostics: string[];
		};

		expect(payload.ruleset.name).toBe('Generated from prose');
		expect(payload.ruleset.bundle.bundleVersion).toBe('runtime-bundle/v1');
		expect(payload.ruleset.bundle.uiProfile.schemaVersion).toBe('ui-profile/v0');
		expect(Array.isArray(payload.diagnostics)).toBe(true);
	});

	it('ruleset_generate_api_rejects_invalid_payload', async () => {
		const response = await generateRuleset(eventForPost({ source: { type: 'text', text: '' } }));
		expect(response.status).toBe(400);
		const payload = (await response.json()) as { error: string };
		expect(payload.error.toLowerCase()).toContain('text');
	});

	it('ruleset_generate_api_prefers_llm_agent_when_api_key_present', async () => {
		process.env.OPENAI_API_KEY = 'test-openai-key';

		const sourceUrl = 'https://bicyclecards.com/how-to-play/500-rum';
		const sourceDocument = `<html><body><h1>500 Rum</h1><p>2 to 8 players.</p><p>Draw from stock or discard, lay down melds, first to 500 wins.</p></body></html>`;

		const fetchImpl: typeof fetch = async (input, init) => {
			const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
			if (url === sourceUrl) {
				return new Response(sourceDocument, {
					status: 200,
					headers: { 'content-type': 'text/html; charset=utf-8' }
				});
			}

			if (url === 'https://api.openai.com/v1/chat/completions') {
				const payload = JSON.parse(String(init?.body ?? '{}'));
				expect(payload.model).toBe('gpt-5-mini');
				return Response.json({
					choices: [
						{
							message: {
								content: JSON.stringify(
									payload.response_format.json_schema.name === 'rules_source_review'
										? { verdict: 'consistent', issues: [], summary: 'Reviewed.' }
										: extractionFromBundle(familyRulesets()[1].bundle)
								)
							}
						}
					]
				});
			}

			return new Response('not found', { status: 404 });
		};

		const response = await generateRuleset(
			eventForPost(
				{
					source: {
						type: 'url',
						url: sourceUrl
					}
				},
				fetchImpl
			)
		);

		expect(response.status).toBe(200);
		const payload = (await response.json()) as {
			ruleset: { bundle: { displayName: string } };
			pipeline: { strategy: string; model?: string };
		};
		expect(payload.ruleset.bundle.displayName).toBe('500 Rum');
		expect(payload.pipeline.strategy).toBe('llm');
		expect(payload.pipeline.model).toBe('gpt-5-mini');
	});
});
