import { describe, expect, test } from 'vitest';
import { createGameplayRulePack } from '$lib/gameplay/engine';
import type { RuntimeRulePack } from '$lib/runtime/game-runtime';
import {
	createUiProfile,
	generateUiProfileFromRuntime,
	validateUiProfile
} from '$lib/ui/ui-profile';

describe('ui-profile', () => {
	test('ui_profile_validation_accepts_layout_and_draw_visibility', () => {
		const runtimeRulePack: RuntimeRulePack = {
			gameplayRulePack: createGameplayRulePack({
				handZoneName: 'hand',
				zoneMovePolicy: {
					sourceZoneAllowlist: ['hand', 'stock', 'discard'],
					targetZoneAllowlist: ['hand', 'discard']
				}
			})
		};

		const profile = createUiProfile({
			hand: {
				zoneId: 'hand',
				label: 'Your Layout',
				hint: 'Play hidden info carefully.',
				quickPlayTargets: [{ zoneId: 'discard' }],
				layout: { kind: 'grid', rows: 2, columns: 3 }
			},
			table: {
				zones: [
					{
						id: 'stock',
						label: 'Stock',
						hint: 'Face-down draw pile',
						allowDrawFromTop: true,
						drawVisibility: 'preserve'
					},
					{
						id: 'discard',
						label: 'Discard',
						hint: 'Face-up discard',
						allowDrawFromTop: true,
						drawVisibility: 'reveal',
						drawPickMode: 'any_visible'
					}
				]
			},
			seats: {
				cards: {
					zoneId: 'hand',
					label: 'Layouts',
					includeSelf: true,
					layout: { kind: 'grid', rows: 2, columns: 3 }
				}
			}
		});

		const issues = validateUiProfile(profile, runtimeRulePack);
		expect(issues).toEqual([]);
		expect(profile.hand.layout?.kind).toBe('grid');
		expect(profile.table.zones.find((zone) => zone.id === 'stock')?.drawVisibility).toBe('preserve');
		expect(profile.table.zones.find((zone) => zone.id === 'discard')?.drawPickMode).toBe('any_visible');
		expect(profile.seats?.cards?.zoneId).toBe('hand');
	});

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

	test('ui_profile_validation_rejects_invalid_draw_pick_mode', () => {
		const profile = createUiProfile({
			table: {
				zones: [
					{
						id: 'discard',
						label: 'Discard',
						hint: 'Face-up discard',
						drawPickMode: 'middle' as 'top'
					}
				]
			}
		});

		const issues = validateUiProfile(profile);
		expect(issues.some((issue) => issue.code === 'invalid_zone_draw_pick_mode')).toBe(true);
	});

	test('ui_profile_validation_rejects_invalid_card_visibility_modes', () => {
		const profile = {
			schemaVersion: 'ui-profile/v0',
			hand: {
				zoneId: 'hand',
				label: 'Your Hand',
				hint: 'Choose a card',
				cardVisibility: 'friends_only',
				quickPlayTargets: [{ zoneId: 'discard' }]
			},
			table: {
				zones: [
					{
						id: 'discard',
						label: 'Discard',
						hint: 'Face-up discard',
						cardVisibility: 'secret'
					}
				]
			},
			actions: {
				primary: [{ id: 'advance', kind: 'advance_turn', label: 'Next' }]
			},
			log: {
				label: 'Log',
				emptyText: 'No events yet.'
			},
			seats: {
				cards: {
					zoneId: 'hand',
					label: 'Player Cards',
					cardVisibility: 'friends_only'
				}
			}
		};

		const issues = validateUiProfile(profile);
		expect(issues.some((issue) => issue.code === 'invalid_hand_card_visibility')).toBe(true);
		expect(issues.some((issue) => issue.code === 'invalid_zone_card_visibility')).toBe(true);
		expect(issues.some((issue) => issue.code === 'invalid_seat_cards_card_visibility')).toBe(true);
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
