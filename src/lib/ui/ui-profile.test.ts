import { describe, expect, test } from 'vitest';
import { createGameplayRulePack } from '$lib/gameplay/engine';
import type { RuntimeRulePack } from '$lib/runtime/game-runtime';
import {
	createUiProfile,
	generateUiProfileFromRuntime,
	validateUiProfile
} from '$lib/ui/ui-profile';

describe('ui-profile', () => {
	test('ui_profile_validation_rejects_unknown_quick_target_zone', () => {
		const runtimeRulePack: RuntimeRulePack = {
			gameplayRulePack: createGameplayRulePack()
		};
		const profile = createUiProfile({
			hand: {
				label: 'Your Hand',
				hint: 'Pick a card to play',
				quickPlayTargets: [{ zoneId: 'unknown-zone' }]
			},
			table: {
				zones: [{ id: 'discard', label: 'Discard', hint: 'Face-up discard pile' }]
			}
		});

		const issues = validateUiProfile(profile, runtimeRulePack);
		expect(issues.some((issue) => issue.code === 'unknown_quick_target_zone')).toBe(true);
	});

	test('ui_profile_generator_derives_visible_zones_and_labels_from_runtime_pack', () => {
		const runtimeRulePack: RuntimeRulePack = {
			gameplayRulePack: createGameplayRulePack({
				handZoneName: 'hand',
				zoneMovePolicy: {
					sourceZoneAllowlist: ['hand', 'discard'],
					targetZoneAllowlist: ['community', 'discard', 'meld', 'hand']
				}
			})
		};

		const profile = generateUiProfileFromRuntime(runtimeRulePack, {
			handLabel: 'Cards in Hand'
		});

		expect(profile.schemaVersion).toBe('ui-profile/v0');
		expect(profile.hand.label).toBe('Cards in Hand');
		expect(profile.table.zones.map((zone) => zone.id)).toEqual(['community', 'discard', 'meld']);
		expect(profile.hand.quickPlayTargets.map((target) => target.zoneId)).toEqual(['community', 'discard', 'meld']);
		expect(profile.actions.primary.map((action) => action.kind)).toEqual(['advance_turn', 'undo', 'redo']);
	});
});
