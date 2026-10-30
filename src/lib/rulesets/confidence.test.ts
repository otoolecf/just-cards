import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { generateRulesetDraftFromInput } from './generator';
import { evaluateRulesetBundleConfidence } from './confidence';

const SIX_CARD_GOLF_URL = 'https://bicyclecards.com/how-to-play/six-card-golf';
const SIX_CARD_GOLF_HTML = readFileSync(
	new URL('./evals/fixtures/six-card-golf.synthetic.html', import.meta.url),
	'utf8'
);

describe('ruleset bundle confidence', () => {
	it('bundle_confidence_passes_for_generated_fixture_bundle', async () => {
		const generated = await generateRulesetDraftFromInput(
			{
				source: { type: 'url', url: SIX_CARD_GOLF_URL }
			},
			{
				fetchImpl: async () =>
					new Response(SIX_CARD_GOLF_HTML, {
						status: 200,
						headers: { 'content-type': 'text/html; charset=utf-8' }
					})
			}
		);

		const confidence = evaluateRulesetBundleConfidence(generated.draft.bundle);
		expect(confidence.pass).toBe(true);
		expect(confidence.checks.length).toBeGreaterThan(0);
		expect(confidence.checks.every((check) => check.pass)).toBe(true);
		expect(confidence.checks.find((check) => check.id === 'explainability-present')?.pass).toBe(true);
	});

	it('bundle_confidence_flags_invalid_ui_profile', async () => {
		const generated = await generateRulesetDraftFromInput(
			{
				source: { type: 'url', url: SIX_CARD_GOLF_URL }
			},
			{
				fetchImpl: async () =>
					new Response(SIX_CARD_GOLF_HTML, {
						status: 200,
						headers: { 'content-type': 'text/html; charset=utf-8' }
					})
			}
		);

		const broken = {
			...generated.draft.bundle,
			uiProfile: {
				...generated.draft.bundle.uiProfile,
				hand: {
					...generated.draft.bundle.uiProfile.hand,
					quickPlayTargets: [{ zoneId: 'unknown-zone' }]
				}
			}
		};

		const confidence = evaluateRulesetBundleConfidence(broken);
		expect(confidence.pass).toBe(false);
		expect(confidence.checks.some((check) => check.id === 'ui-profile-valid' && !check.pass)).toBe(true);
	});
});
