import { beforeEach, describe, expect, it } from 'vitest';

import { resetDefaultRulesetServiceForTests } from './default-service';
import { POST as generateRuleset } from '../../routes/api/rulesets/generate/+server';

function eventForPost(body: unknown): Parameters<typeof generateRuleset>[0] {
	return {
		params: {},
		request: new Request('http://localhost/api/rulesets/generate', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		})
	} as Parameters<typeof generateRuleset>[0];
}

describe('rulesets generate api', () => {
	beforeEach(() => {
		resetDefaultRulesetServiceForTests();
		process.env.RULESET_STORE_DRIVER = 'memory';
	});

	it('ruleset_generate_api_creates_ruleset_from_text_input', async () => {
		const response = await generateRuleset(
			eventForPost({
				source: {
					type: 'text',
					text: 'We play with 2 to 4 players, draw from stock or discard, then place one card to meld.'
				},
				name: 'Generated from prose'
			})
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
});
