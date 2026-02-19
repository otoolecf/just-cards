import type {
	UiCardLayout,
	UiCardVisibilityMode,
	UiDrawPickMode,
	UiDrawVisibilityMode,
	UiPrimaryActionKind,
	UiProfileV0
} from '$lib/ui/ui-profile';

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

export interface PlaySurfaceSeatCardsProfile {
	zoneId: string;
	label: string;
	includeSelf: boolean;
	cardVisibility?: UiCardVisibilityMode;
	layout?: UiCardLayout;
}

export type PlaySurfaceActionLabelMap = Partial<Record<UiPrimaryActionKind, string>>;

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

export function playSurfaceProfileFromUiProfile(uiProfile: UiProfileV0): PlaySurfaceProfile {
	return {
		id: 'ruleset-ui-profile',
		displayName: 'Ruleset Surface',
		handLabel: uiProfile.hand.label,
		zones: uiProfile.table.zones
			.filter((zone) => zone.visible !== false)
			.map((zone) => ({
				id: zone.id,
				label: zone.label,
				hint: zone.hint,
				visible: true
			}))
	};
}

export function quickPlayZoneIdsFromUiProfile(uiProfile: UiProfileV0): string[] {
	const visibleZoneIds = new Set(
		uiProfile.table.zones.filter((zone) => zone.visible !== false).map((zone) => zone.id)
	);
	const zoneIds: string[] = [];
	for (const target of uiProfile.hand.quickPlayTargets) {
		if (target.visible === false || !visibleZoneIds.has(target.zoneId) || zoneIds.includes(target.zoneId)) {
			continue;
		}
		zoneIds.push(target.zoneId);
	}
	if (zoneIds.length > 0) {
		return zoneIds;
	}
	return uiProfile.table.zones.filter((zone) => zone.visible !== false).map((zone) => zone.id);
}

export function playSurfaceActionLabelsFromUiProfile(uiProfile: UiProfileV0): PlaySurfaceActionLabelMap {
	const labels: PlaySurfaceActionLabelMap = {};
	for (const action of uiProfile.actions.primary) {
		if (!labels[action.kind]) {
			labels[action.kind] = action.label;
		}
	}
	return labels;
}

export function drawTopAllowedZoneIdsFromUiProfile(uiProfile: UiProfileV0): Set<string> {
	const allowed = new Set<string>();
	for (const zone of uiProfile.table.zones) {
		if (zone.allowDrawFromTop === false) {
			continue;
		}
		allowed.add(zone.id);
	}
	return allowed;
}

export function drawVisibilityModeByZoneFromUiProfile(uiProfile: UiProfileV0): Map<string, UiDrawVisibilityMode> {
	const modes = new Map<string, UiDrawVisibilityMode>();
	for (const zone of uiProfile.table.zones) {
		modes.set(zone.id, zone.drawVisibility ?? 'reveal');
	}
	return modes;
}

export function drawPickModeByZoneFromUiProfile(uiProfile: UiProfileV0): Map<string, UiDrawPickMode> {
	const modes = new Map<string, UiDrawPickMode>();
	for (const zone of uiProfile.table.zones) {
		modes.set(zone.id, zone.drawPickMode ?? 'top');
	}
	return modes;
}

export function seatCardsProfileFromUiProfile(
	uiProfile: UiProfileV0
): PlaySurfaceSeatCardsProfile | undefined {
	const seatCards = uiProfile.seats?.cards;
	if (!seatCards || seatCards.visible === false) {
		return undefined;
	}
	return {
		zoneId: seatCards.zoneId,
		label: seatCards.label,
		includeSelf: seatCards.includeSelf === true,
		...(seatCards.cardVisibility ? { cardVisibility: seatCards.cardVisibility } : {}),
		...(seatCards.layout ? { layout: { ...seatCards.layout } } : {})
	};
}
