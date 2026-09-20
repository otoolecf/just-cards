import { expect, it } from 'vitest';
import { generateRulesetDraftWithAgent } from './llm-agent';
import { extractionFromBundle } from './extraction-contract';
import { familyRulesets } from './family-presets';
it('uses the configured model even when heuristic extraction recognizes the source', async () => {
	let calls = 0;
	const result = await generateRulesetDraftWithAgent(
		{
			source: {
				type: 'text',
				text: `Six Card Golf. 2 to 4 players. Each player is dealt 6 cards face down in 2 rows of 3 in front of them. Turn 2 cards face up. Draw from stock or discard, then swap a layout card or discard. Equal cards in the same column score zero points. Play nine deals; lowest total wins.`
			}
		},
		{
			model: async (request) => {
				calls++;
				return request.stage === 'review'
					? { verdict: 'consistent', issues: [], summary: 'Reviewed.' }
					: extractionFromBundle(familyRulesets()[0].bundle);
			}
		}
	);
	expect(result.facts.tableRules).toBeDefined();
	expect(result.pipeline.strategy).toBe('llm');
	expect(result.draft.origin).toBe('llm');
	expect(calls).toBe(2);
});
