import { describe, expect, test } from 'vitest';
import {
	DEFAULT_PLAY_SURFACE_PROFILE,
	drawVisibilityModeByZoneFromUiProfile,
	playSurfaceActionLabelsFromUiProfile,
	playSurfaceProfileFromUiProfile,
	quickPlayZoneIdsFromUiProfile,
	visibleZones,
	zoneHintMap,
	zoneLabelMap
} from '$lib/gameplay/play-surface-profiles';
import { createUiProfile } from '$lib/ui/ui-profile';

describe('play-surface-profiles', () => {
	test('visible_zones_exclude_hidden_entries', () => {
		const visible = visibleZones({
			...DEFAULT_PLAY_SURFACE_PROFILE,
			zones: [
				{ id: 'community', label: 'Community', hint: 'shared cards', visible: true },
				{ id: 'kitty', label: 'Kitty', hint: 'hidden example', visible: false }
			]
		});

		expect(visible.map((zone) => zone.id)).toEqual(['community']);
	});

	test('zone_label_and_hint_maps_are_derived_from_profile', () => {
		const profile = {
			...DEFAULT_PLAY_SURFACE_PROFILE,
			handLabel: 'Your Cards',
			zones: [
				{ id: 'community', label: 'Community Cards', hint: 'Face-up shared cards' },
				{ id: 'discard', label: 'Discard Pile', hint: 'Top card is drawable' }
			]
		};

		expect(zoneLabelMap(profile)).toEqual({
			hand: 'Your Cards',
			community: 'Community Cards',
			discard: 'Discard Pile'
		});
		expect(zoneHintMap(profile)).toEqual({
			community: 'Face-up shared cards',
			discard: 'Top card is drawable'
		});
	});

	test('play_surface_profile_from_ui_profile_maps_labels_hints_and_targets', () => {
		const uiProfile = createUiProfile({
			hand: {
				label: 'My Cards',
				hint: 'Choose one to play',
				quickPlayTargets: [{ zoneId: 'community' }, { zoneId: 'pot' }]
			},
			table: {
				zones: [
					{ id: 'community', label: 'Community', hint: 'Shared cards', visible: true },
					{ id: 'pot', label: 'Pot', hint: 'Shared pool', visible: true },
					{ id: 'house', label: 'House', hint: 'Hidden', visible: false }
				]
			},
			actions: {
				primary: [
					{ id: 'advance', kind: 'advance_turn', label: 'Next turn' },
					{ id: 'undo', kind: 'undo', label: 'Back' },
					{ id: 'redo', kind: 'redo', label: 'Forward' }
				]
			}
		});

		const playProfile = playSurfaceProfileFromUiProfile(uiProfile);
		expect(playProfile.handLabel).toBe('My Cards');
		expect(playProfile.zones.map((zone) => zone.id)).toEqual(['community', 'pot']);
		expect(quickPlayZoneIdsFromUiProfile(uiProfile)).toEqual(['community', 'pot']);
		expect(playSurfaceActionLabelsFromUiProfile(uiProfile)).toEqual({
			advance_turn: 'Next turn',
			undo: 'Back',
			redo: 'Forward'
		});
	});

	test('draw_visibility_mode_by_zone_uses_profile_overrides', () => {
		const uiProfile = createUiProfile({
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
						drawVisibility: 'reveal'
					}
				]
			}
		});

		const modes = drawVisibilityModeByZoneFromUiProfile(uiProfile);
		expect(modes.get('stock')).toBe('preserve');
		expect(modes.get('discard')).toBe('reveal');
	});
});
