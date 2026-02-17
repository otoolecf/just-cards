import { describe, expect, it } from 'vitest';
import { createStarterRulesetDraft } from './picker';

describe('ruleset picker helpers', () => {
	it('starter_ruleset_draft_payload_is_runtime_bundle_v1', () => {
		const draft = createStarterRulesetDraft();

		expect(draft.origin).toBe('manual');
		expect(draft.bundle.bundleVersion).toBe('runtime-bundle/v1');
		expect(typeof draft.bundle.gameId).toBe('string');
		expect(draft.bundle.gameId.length).toBeGreaterThan(0);
		expect(typeof draft.bundle.displayName).toBe('string');
		expect(draft.bundle.displayName.length).toBeGreaterThan(0);
		expect(draft.bundle.runtimeRulePack.scoringTriggers).toEqual([]);
	});
});
