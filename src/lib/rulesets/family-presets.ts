import { mahjongRuleset } from './mahjong-preset';
import { additionalRulesets } from './additional-presets';
import { compileRuleFactsToBundle, extractRuleFacts } from './generator';
import type { RulesetRecord } from './types';

import { reviewedSources } from './reviewed-sources';

export function familyRulesets(): RulesetRecord[] {
	return reviewedSources.map<RulesetRecord>((source) => {
		const sourceUrl = `https://bicyclecards.com/how-to-play/${source.id}`;
		const facts = extractRuleFacts({ sourceText: source.text, sourceUrl });
		const bundle = compileRuleFactsToBundle(facts);
		if (bundle.explain) bundle.explain.generatedAt = '2026-09-17T00:00:00.000Z';
		return {
			id: `builtin-${source.id}`,
			name: source.name,
			origin: 'import' as const,
			sourceUrl,
			bundle,
			createdAt: '2026-09-17T00:00:00.000Z',
			updatedAt: '2026-09-17T00:00:00.000Z'
		};
	}).concat(additionalRulesets(), [mahjongRuleset()]);
}
