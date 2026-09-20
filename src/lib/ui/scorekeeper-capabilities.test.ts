import { describe, expect, it } from 'vitest';
import { createUiProfile, generateUiProfileFromRuntime, validateUiProfile } from './ui-profile';
import { familyRulesets } from '../rulesets/family-presets';
import { deriveGuidedScoreProfileFromBundle, PATTERN_PRESETS } from '../session/score-session-commands';

describe('ruleset pattern-round capability', () => {
	it('validates the optional schema field and preserves explicit opt-in', () => {
		const profile = createUiProfile({ scorekeeper: { patternRound: true } });
		expect(profile.scorekeeper?.patternRound).toBe(true);
		expect(validateUiProfile(profile)).toEqual([]);
		for (const scorekeeper of [null, [], true, {}, { patternRound: 'false' }]) {
			expect(validateUiProfile({ ...profile, scorekeeper }).some(i => i.code === 'invalid_scorekeeper')).toBe(true);
		}
	});
	it('generates disabled metadata for Golf and Rummy and copies it into score sessions', () => {
		for (const ruleset of familyRulesets()) {
			expect(ruleset.bundle.uiProfile.scorekeeper?.patternRound).toBe(false);
			expect(deriveGuidedScoreProfileFromBundle(ruleset.bundle, ruleset.id).patternRound).toBe(false);
		}
	});
	it('defaults legacy bundles to hidden and preserves custom opt-in through serialization', () => {
		const { bundle, id } = familyRulesets()[0];
		delete bundle.uiProfile.scorekeeper;
		expect(deriveGuidedScoreProfileFromBundle(bundle, id).patternRound).toBe(false);
		bundle.uiProfile.scorekeeper = { patternRound: true };
		const persisted = JSON.parse(JSON.stringify(deriveGuidedScoreProfileFromBundle(bundle, id)));
		expect(persisted.patternRound).toBe(true);
	});
	it('enables generated entry when the runtime actually scores patterns', () => {
		const profile = generateUiProfileFromRuntime({ scoringTriggers: [{
			id: 'pattern-bonus', when: { eventType: 'end_round' }, source: { kind: 'event_cards' },
			scorer: { kind: 'pattern', patternPack: PATTERN_PRESETS[0].patternPack, patternScoring: [{ patternId: 'pair', points: 10 }] },
			target: { kind: 'actor' }
		}] });
		expect(profile.scorekeeper?.patternRound).toBe(true);
	});
});
