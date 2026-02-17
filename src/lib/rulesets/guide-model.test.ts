import { describe, expect, it } from 'vitest';
import { createGameplayRulePack } from '$lib/gameplay/engine';
import { generateUiProfileFromRuntime } from '$lib/ui/ui-profile';

import { buildRulesetGuideModel } from './guide-model';
import type { RuntimeRulesetBundle } from './types';

function makeBundle(overrides: Partial<RuntimeRulesetBundle> = {}): RuntimeRulesetBundle {
	const runtimeRulePack = { gameplayRulePack: createGameplayRulePack() };
	const uiProfile = generateUiProfileFromRuntime(runtimeRulePack);
	return {
		bundleVersion: 'runtime-bundle/v1',
		gameId: 'test-game',
		displayName: 'Test Game',
		runtimeRulePack,
		uiProfile,
		...overrides
	};
}

describe('ruleset guide model', () => {
	it('guide_model_uses_bundle_explainability', () => {
		const bundle = makeBundle({
			explain: {
				schemaVersion: 'ruleset-explain/v0',
				goal: 'End with the lowest score.',
				playerRange: { min: 2, max: 4 },
				rounds: 9,
				turnFlow: {
					drawFrom: ['Stock', 'Discard Pile'],
					playTo: ['Discard Pile']
				},
				scoring: {
					lowScoreWins: true,
					aceValue: 1,
					rankOverrides: [
						{ rank: '2', value: -2 },
						{ rank: 'K', value: 0 }
					]
				},
				zones: [
					{ id: 'stock', label: 'Stock', hint: 'Face-down draw pile.' },
					{ id: 'discard', label: 'Discard Pile', hint: 'Face-up throw-away stack.' }
				],
				diagnostics: ['Generated from source text.'],
				source: { type: 'url', url: 'https://example.com/rules' },
				generatedAt: '2026-02-17T00:00:00.000Z'
			}
		});

		const guide = buildRulesetGuideModel(bundle);
		expect(guide.objective).toContain('lowest score');
		expect(guide.quickStart.some((line) => line.toLowerCase().includes('draw'))).toBe(true);
		expect(guide.scoringHighlights.some((line) => line.includes('2'))).toBe(true);
		expect(guide.auditTrail.some((line) => line.includes('example.com'))).toBe(true);
		expect(guide.diagnostics).toEqual(['Generated from source text.']);
	});

	it('guide_model_falls_back_without_explainability', () => {
		const guide = buildRulesetGuideModel(makeBundle());
		expect(guide.objective.length).toBeGreaterThan(0);
		expect(guide.quickStart.length).toBeGreaterThan(0);
		expect(guide.scoringHighlights.length).toBeGreaterThan(0);
	});
});
