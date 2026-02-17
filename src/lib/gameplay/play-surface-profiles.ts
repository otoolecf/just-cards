export interface PlaySurfaceZoneProfile {
	id: string;
	label: string;
	hint: string;
	visible?: boolean;
}

export interface PlaySurfaceProfile {
	id: string;
	displayName: string;
	handLabel: string;
	zones: PlaySurfaceZoneProfile[];
}

export const DEFAULT_PLAY_SURFACE_PROFILE: PlaySurfaceProfile = {
	id: 'default-open-table',
	displayName: 'Open Table',
	handLabel: 'Your Hand',
	zones: [
		{ id: 'board', label: 'Community', hint: 'Shared cards everyone can read.', visible: true },
		{ id: 'discard', label: 'Discard Pile', hint: 'Face-up throw-away stack.', visible: true },
		{ id: 'meld', label: 'Melds', hint: 'Scoring combinations laid down.', visible: true },
		{ id: 'pot', label: 'Pot', hint: 'Shared pool before settlement.', visible: true },
		{ id: 'house', label: 'House', hint: 'Neutral table-owned cards.', visible: true }
	]
};

export function visibleZones(profile: PlaySurfaceProfile): PlaySurfaceZoneProfile[] {
	return profile.zones.filter((zone) => zone.visible !== false);
}

export function zoneLabelMap(profile: PlaySurfaceProfile): Record<string, string> {
	const labels: Record<string, string> = {
		hand: profile.handLabel
	};
	for (const zone of visibleZones(profile)) {
		labels[zone.id] = zone.label;
	}
	return labels;
}

export function zoneHintMap(profile: PlaySurfaceProfile): Record<string, string> {
	const hints: Record<string, string> = {};
	for (const zone of visibleZones(profile)) {
		hints[zone.id] = zone.hint;
	}
	return hints;
}
