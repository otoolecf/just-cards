import { describe, expect, it } from 'vitest';
import { generateRulesetDraftWithAgent } from './llm-agent';
import { extractionFromBundle } from './extraction-contract';
import { familyRulesets } from './family-presets';
import { canPlayRuleset } from './generation-report';
const sourceUrl = 'https://bicyclecards.com/how-to-play/500-rum';
const sourceHtml =
	'<html><body><h1>500 Rum</h1><p>Draw from stock or discard and play melds.</p></body></html>';
const candidate = () => extractionFromBundle(familyRulesets()[1].bundle);
const consistent = {
	verdict: 'consistent',
	issues: [],
	summary: 'No additional contradictions detected.'
};
describe('structured extraction transport', () => {
	it('uses strict output and performs a separate source review', async () => {
		const calls: string[] = [];
		const result = await generateRulesetDraftWithAgent(
			{ source: { type: 'url', url: sourceUrl } },
			{
				apiKey: 'test-key',
				fetchImpl: async (input, init) => {
					if (String(input) === sourceUrl)
						return new Response(sourceHtml, { headers: { 'content-type': 'text/html' } });
					const payload = JSON.parse(String(init?.body));
					calls.push(payload.response_format.json_schema.name);
					expect(payload.response_format.json_schema.strict).toBe(true);
					expect(payload.reasoning_effort).toBe('low');
					expect(payload.max_completion_tokens).toBeGreaterThan(0);
					expect(init?.signal).toBeDefined();
					return Response.json({
						choices: [
							{
								finish_reason: 'stop',
								message: { content: JSON.stringify(calls.length === 1 ? candidate() : consistent) }
							}
						]
					});
				}
			}
		);
		expect(calls).toEqual(['rule_extraction', 'rules_source_review']);
		expect(result.pipeline.strategy).toBe('llm');
		expect(result.pipeline.model).toBe('gpt-5-mini');
		expect(result.facts.setup?.initialFaceUpCards).toBeUndefined();
		expect(result.facts.tableRules?.meld).toBeDefined();
	});
	it('escalates malformed extraction to fallback model with bounded attempts', async () => {
		const models: string[] = [];
		const result = await generateRulesetDraftWithAgent(
			{ source: { type: 'text', text: 'Play a private-hand melding game.' } },
			{
				apiKey: 'test',
				primaryModel: 'gpt-5-nano',
				fallbackModel: 'gpt-5-mini',
				fetchImpl: async (_input, init) => {
					const p = JSON.parse(String(init?.body));
					models.push(p.model);
					return Response.json({
						choices: [
							{
								message: {
									content:
										p.model === 'gpt-5-nano'
											? 'not JSON'
											: JSON.stringify(
													p.response_format.json_schema.name === 'rules_source_review'
														? consistent
														: candidate()
												)
								}
							}
						]
					});
				}
			}
		);
		expect(models).toEqual(['gpt-5-nano', 'gpt-5-nano', 'gpt-5-mini', 'gpt-5-mini']);
		expect(result.pipeline.model).toBe('gpt-5-mini');
	});
	it('makes refusal and truncation unreviewed fallbacks without exposing provider content', async () => {
		for (const message of [
			{ refusal: 'sensitive provider text' },
			{ content: JSON.stringify(candidate()) }
		]) {
			const result = await generateRulesetDraftWithAgent(
				{ source: { type: 'text', text: 'Unknown game.' } },
				{
					apiKey: 'test',
					primaryModel: 'single',
					fallbackModel: 'single',
					fetchImpl: async () => Response.json({ choices: [{ finish_reason: 'length', message }] })
				}
			);
			expect(result.pipeline.strategy).toBe('deterministic');
			expect(result.pipeline.attempts.length).toBe(2);
			expect(JSON.stringify(result)).not.toContain('sensitive provider text');
			expect(
				canPlayRuleset(result.draft.bundle as ReturnType<typeof familyRulesets>[0]['bundle'])
			).toBe(false);
		}
	});
	it('does not call a model without credentials', async () => {
		const result = await generateRulesetDraftWithAgent(
			{ source: { type: 'url', url: sourceUrl } },
			{
				fetchImpl: async (input) => {
					expect(String(input)).toBe(sourceUrl);
					return new Response(sourceHtml, { headers: { 'content-type': 'text/html' } });
				}
			}
		);
		expect(result.pipeline.strategy).toBe('deterministic');
		expect(result.pipeline.attempts).toEqual([]);
		expect(result.diagnostics.join(' ')).toContain('unreviewed heuristic draft');
	});
	it('repairs a source contradiction then reviews the new candidate separately', async () => {
		const stages: string[] = [];
		const result = await generateRulesetDraftWithAgent(
			{ source: { type: 'text', text: 'A family melding game.' } },
			{
				model: async (request) => {
					stages.push(request.stage);
					if (request.stage === 'review')
						return stages.length === 2
							? {
									verdict: 'contradiction',
									issues: ['Deal should be ten cards.'],
									summary: 'Wrong deal.'
								}
							: consistent;
					const e = candidate();
					if (request.stage === 'repair') {
						e.tableRules!.deal.cardsPerPlayer = 10;
						e.tableRules!.players.max = 4;
						e.tableRules!.deal.byPlayerCount = {};
					}
					return request.stage === 'repair'
						? {
								...e,
								tableRules: {
									...e.tableRules,
									deal: { ...e.tableRules!.deal, byPlayerCount: null }
								}
							}
						: e;
				}
			}
		);
		expect(stages).toEqual(['extract', 'review', 'repair', 'review']);
		expect(result.facts.tableRules?.deal.cardsPerPlayer).toBe(10);
	});
});
