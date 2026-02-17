import { describe, expect, test } from 'vitest';
import {
	DEFAULT_PLAY_SURFACE_PROFILE,
	visibleZones,
	zoneHintMap,
	zoneLabelMap
} from '$lib/gameplay/play-surface-profiles';

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
});
