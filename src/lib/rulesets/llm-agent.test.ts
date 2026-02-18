import { describe, expect, it } from 'vitest';

import { generateRulesetDraftWithAgent } from './llm-agent';

function createUrlSourceFetch(sourceUrl: string, sourceDocument: string): typeof fetch {
	let openAiCalls = 0;

	const fetchImpl: typeof fetch = async (input, init) => {
		const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
		if (url === sourceUrl) {
			return new Response(sourceDocument, {
				status: 200,
				headers: {
					'content-type': 'text/html; charset=utf-8'
				}
			});
		}

		if (url === 'https://api.openai.com/v1/chat/completions') {
			openAiCalls += 1;
			const payload = JSON.parse(String(init?.body ?? '{}')) as { model?: string };
			if (payload.model === 'gpt-5-nano') {
				return new Response(
					JSON.stringify({
						choices: [
							{
								message: {
									content: JSON.stringify({
										gameName: 'Six Card Golf',
										players: { min: 2, max: 6 },
										rounds: 9,
										handZoneName: 'hand',
										zones: ['stock', 'discard', 'board'],
										turn: {
											drawSources: ['stock', 'discard'],
											playTargets: ['board', 'discard']
										},
										scoring: {
											lowScoreWins: true,
											aceValue: 1,
											rankOverrides: {
												K: 0,
												Q: 10,
												J: 10
											}
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

			if (payload.model === 'gpt-5-mini') {
				return new Response(
					JSON.stringify({
						choices: [
							{
								message: {
									content: JSON.stringify({
										gameName: '500 Rum',
										players: { min: 2, max: 8 },
										handZoneName: 'hand',
										zones: ['stock', 'discard', 'meld'],
										turn: {
											drawSources: ['stock', 'discard'],
											playTargets: ['meld', 'discard']
										},
										scoring: {
											lowScoreWins: false,
											aceValue: 15,
											rankOverrides: {
												J: 10,
												Q: 10,
												K: 10
											}
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
		}

		return new Response('not found', { status: 404 });
	};

	Object.defineProperty(fetchImpl, 'openAiCalls', {
		value: () => openAiCalls
	});

	return fetchImpl;
}

describe('llm ruleset generation agent', () => {
	it('llm_agent_uses_primary_model_when_output_is_valid', async () => {
		const sourceUrl = 'https://bicyclecards.com/how-to-play/six-card-golf';
		const sourceHtml = `<html><body><h1>Six Card Golf</h1><p>2 to 6 players. The goal is the lowest score after 9 rounds.</p><p>Draw from stock or discard and play on table layout.</p></body></html>`;
		const fetchImpl = createUrlSourceFetch(sourceUrl, sourceHtml);

		const generated = await generateRulesetDraftWithAgent(
			{
				source: { type: 'url', url: sourceUrl }
			},
			{
				apiKey: 'test-key',
				fetchImpl,
				primaryModel: 'gpt-5-nano',
				fallbackModel: 'gpt-5-mini'
			}
		);

		expect(generated.facts.gameName).toBe('Six Card Golf');
		expect(generated.pipeline.strategy).toBe('llm');
		expect(generated.pipeline.model).toBe('gpt-5-nano');
		expect(generated.pipeline.attempts.some((attempt) => attempt.model === 'gpt-5-nano')).toBe(true);
	});

	it('llm_agent_escalates_to_fallback_model_when_primary_output_is_unusable', async () => {
		const sourceUrl = 'https://bicyclecards.com/how-to-play/500-rum';
		const sourceHtml = `<html><body><h1>500 Rum</h1><p>2 to 8 players. Draw from stock or discard and lay down melds.</p><p>First to 500 points wins.</p></body></html>`;

		let callCount = 0;
		const fetchImpl: typeof fetch = async (input, init) => {
			const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
			if (url === sourceUrl) {
				return new Response(sourceHtml, {
					status: 200,
					headers: { 'content-type': 'text/html; charset=utf-8' }
				});
			}

			if (url === 'https://api.openai.com/v1/chat/completions') {
				callCount += 1;
				const payload = JSON.parse(String(init?.body ?? '{}')) as { model?: string };
				if (payload.model === 'gpt-5-nano') {
					return new Response(
						JSON.stringify({
							choices: [
								{
									message: {
										content: 'I cannot provide JSON right now.'
									}
								}
							]
						}),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}
				if (payload.model === 'gpt-5-mini') {
					return new Response(
						JSON.stringify({
							choices: [
								{
									message: {
										content: JSON.stringify({
											gameName: '500 Rum',
											players: { min: 2, max: 8 },
											handZoneName: 'hand',
											zones: ['stock', 'discard', 'meld'],
											turn: {
												drawSources: ['stock', 'discard'],
												playTargets: ['meld', 'discard']
											},
											scoring: {
												lowScoreWins: false,
												aceValue: 15,
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
			}

			return new Response('not found', { status: 404 });
		};

		const generated = await generateRulesetDraftWithAgent(
			{
				source: { type: 'url', url: sourceUrl }
			},
			{
				apiKey: 'test-key',
				fetchImpl,
				primaryModel: 'gpt-5-nano',
				fallbackModel: 'gpt-5-mini'
			}
		);

		expect(callCount).toBeGreaterThanOrEqual(2);
		expect(generated.facts.gameName).toBe('500 Rum');
		expect(generated.pipeline.strategy).toBe('llm');
		expect(generated.pipeline.model).toBe('gpt-5-mini');
		expect(generated.pipeline.attempts.some((attempt) => attempt.model === 'gpt-5-mini')).toBe(true);
	});

	it('llm_agent_falls_back_to_deterministic_when_no_api_key', async () => {
		const sourceUrl = 'https://bicyclecards.com/how-to-play/500-rum';
		const sourceHtml = `<html><body><h1>500 Rum</h1><p>2 to 8 players. Draw from stock or discard and lay down melds.</p><p>First to 500 points wins.</p></body></html>`;

		let openAiCalls = 0;
		const fetchImpl: typeof fetch = async (input) => {
			const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
			if (url === sourceUrl) {
				return new Response(sourceHtml, {
					status: 200,
					headers: { 'content-type': 'text/html; charset=utf-8' }
				});
			}
			if (url === 'https://api.openai.com/v1/chat/completions') {
				openAiCalls += 1;
			}
			return new Response('not found', { status: 404 });
		};

		const generated = await generateRulesetDraftWithAgent(
			{
				source: { type: 'url', url: sourceUrl }
			},
			{
				fetchImpl
			}
		);

		expect(generated.facts.gameName).toBe('500 Rum');
		expect(generated.pipeline.strategy).toBe('deterministic');
		expect(openAiCalls).toBe(0);
		expect(generated.diagnostics.some((line) => line.toLowerCase().includes('deterministic'))).toBe(true);
	});
});
