import { createGameplayRulePack, type GameplayRulePack } from '$lib/gameplay/engine';
import type { RuntimeRulePack } from '$lib/runtime/game-runtime';

export type UiPrimaryActionKind = 'advance_turn' | 'undo' | 'redo' | 'set_phase';

export interface UiQuickPlayTarget {
	zoneId: string;
	visible?: boolean;
}

export interface UiHandProfile {
	zoneId: string;
	label: string;
	hint: string;
	quickPlayTargets: UiQuickPlayTarget[];
}

export interface UiTableZoneProfile {
	id: string;
	label: string;
	hint: string;
	visible?: boolean;
	allowDrawFromTop?: boolean;
}

export type UiPrimaryAction =
	| {
			id: string;
			kind: 'advance_turn' | 'undo' | 'redo';
			label: string;
	  }
	| {
			id: string;
			kind: 'set_phase';
			phase: string;
			label: string;
	  };

export interface UiProfileV0 {
	schemaVersion: 'ui-profile/v0';
	hand: UiHandProfile;
	table: {
		zones: UiTableZoneProfile[];
	};
	actions: {
		primary: UiPrimaryAction[];
	};
	log: {
		label: string;
		emptyText: string;
	};
}

export interface UiProfileValidationIssue {
	code: string;
	message: string;
}

export interface CreateUiProfileInput {
	hand?: Partial<UiHandProfile>;
	table?: {
		zones?: UiTableZoneProfile[];
	};
	actions?: {
		primary?: UiPrimaryAction[];
	};
	log?: {
		label?: string;
		emptyText?: string;
	};
}

export interface GenerateUiProfileOptions {
	handLabel?: string;
	handHint?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toLabel(zoneId: string): string {
	return zoneId
		.split(/[_-]/)
		.map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
		.join(' ');
}

function defaultZoneHint(zoneId: string): string {
	switch (zoneId) {
		case 'board':
		case 'community':
		case 'table':
			return 'Shared cards everyone can read.';
		case 'discard':
			return 'Face-up throw-away stack.';
		case 'meld':
			return 'Scoring combinations laid down.';
		case 'pot':
			return 'Shared pool before settlement.';
		case 'house':
			return 'Neutral table-owned cards.';
		case 'crib':
		case 'kitty':
			return 'Shared side pile for later settlement.';
		default:
			return 'Shared table zone.';
	}
}

function defaultZoneLabel(zoneId: string): string {
	if (zoneId === 'board') {
		return 'Community';
	}
	if (zoneId === 'discard') {
		return 'Discard Pile';
	}
	if (zoneId === 'meld') {
		return 'Melds';
	}
	return toLabel(zoneId);
}

function runtimeGameplayRulePack(runtimeRulePack: RuntimeRulePack): GameplayRulePack {
	return runtimeRulePack.gameplayRulePack ?? createGameplayRulePack();
}

function orderedTableZoneIds(runtimeRulePack: RuntimeRulePack): string[] {
	const gameplay = runtimeGameplayRulePack(runtimeRulePack);
	const handZone = gameplay.handZoneName;
	const zoneIds: string[] = [];

	const push = (zoneId: string) => {
		if (!zoneId || zoneId === handZone || zoneIds.includes(zoneId)) {
			return;
		}
		zoneIds.push(zoneId);
	};

	for (const zoneId of gameplay.zoneMovePolicy.targetZoneAllowlist) {
		push(zoneId);
	}
	for (const zoneId of gameplay.zoneMovePolicy.sourceZoneAllowlist) {
		push(zoneId);
	}
	const movePolicyZones = new Set([
		...gameplay.zoneMovePolicy.sourceZoneAllowlist,
		...gameplay.zoneMovePolicy.targetZoneAllowlist
	]);
	for (const zoneId of gameplay.roundPolicy.clearTableZonesOnRoundStart) {
		if (!movePolicyZones.has(zoneId)) {
			continue;
		}
		push(zoneId);
	}
	for (const trigger of runtimeRulePack.scoringTriggers ?? []) {
		for (const zoneId of trigger.when.fromZones ?? []) {
			push(zoneId);
		}
		for (const zoneId of trigger.when.toZones ?? []) {
			push(zoneId);
		}
		if (trigger.source.kind === 'player_zone') {
			push(trigger.source.zone);
		}
	}

	if (zoneIds.length === 0) {
		zoneIds.push('table', 'discard', 'meld');
	}

	return zoneIds;
}

function uniqueZoneTargets(targets: UiQuickPlayTarget[]): UiQuickPlayTarget[] {
	const seen = new Set<string>();
	const unique: UiQuickPlayTarget[] = [];
	for (const target of targets) {
		if (seen.has(target.zoneId)) {
			continue;
		}
		seen.add(target.zoneId);
		unique.push({ ...target });
	}
	return unique;
}

export function createUiProfile(input: CreateUiProfileInput = {}): UiProfileV0 {
	const zones = input.table?.zones ? input.table.zones.map((zone) => ({ ...zone })) : [];
	const quickPlayTargets = uniqueZoneTargets(input.hand?.quickPlayTargets ? input.hand.quickPlayTargets.map((target) => ({ ...target })) : []);
	const primaryActions: UiPrimaryAction[] = input.actions?.primary
		? [...input.actions.primary]
		: [
				{ id: 'advance-turn', kind: 'advance_turn', label: 'Advance turn' },
				{ id: 'undo', kind: 'undo', label: 'Undo' },
				{ id: 'redo', kind: 'redo', label: 'Redo' }
		  ];

	return {
		schemaVersion: 'ui-profile/v0',
		hand: {
			zoneId: input.hand?.zoneId ?? 'hand',
			label: input.hand?.label ?? 'Your Hand',
			hint: input.hand?.hint ?? 'Select a card to reveal quick play targets.',
			quickPlayTargets
		},
		table: {
			zones
		},
		actions: {
			primary: primaryActions
		},
		log: {
			label: input.log?.label ?? 'Log',
			emptyText: input.log?.emptyText ?? 'No events yet.'
		}
	};
}

function validatePrimaryAction(action: unknown, actionIndex: number): UiProfileValidationIssue[] {
	const issues: UiProfileValidationIssue[] = [];
	if (!isObject(action)) {
		issues.push({
			code: 'invalid_action',
			message: `actions.primary[${actionIndex}] must be an object`
		});
		return issues;
	}
	const kind = action.kind;
	if (kind !== 'advance_turn' && kind !== 'undo' && kind !== 'redo' && kind !== 'set_phase') {
		issues.push({
			code: 'unknown_action_kind',
			message: `actions.primary[${actionIndex}].kind must be one of advance_turn|undo|redo|set_phase`
		});
	}
	if (typeof action.id !== 'string' || action.id.trim().length === 0) {
		issues.push({
			code: 'invalid_action_id',
			message: `actions.primary[${actionIndex}].id must be a non-empty string`
		});
	}
	if (typeof action.label !== 'string' || action.label.trim().length === 0) {
		issues.push({
			code: 'invalid_action_label',
			message: `actions.primary[${actionIndex}].label must be a non-empty string`
		});
	}
	if (kind === 'set_phase' && (typeof action.phase !== 'string' || action.phase.trim().length === 0)) {
		issues.push({
			code: 'missing_action_phase',
			message: `actions.primary[${actionIndex}].phase is required for set_phase`
		});
	}

	return issues;
}

export function validateUiProfile(profile: unknown, runtimeRulePack?: RuntimeRulePack): UiProfileValidationIssue[] {
	const issues: UiProfileValidationIssue[] = [];
	if (!isObject(profile)) {
		issues.push({ code: 'schema_not_object', message: 'uiProfile must be an object' });
		return issues;
	}
	if (profile.schemaVersion !== 'ui-profile/v0') {
		issues.push({
			code: 'schema_version_mismatch',
			message: 'uiProfile.schemaVersion must be "ui-profile/v0"'
		});
	}

	if (!isObject(profile.hand)) {
		issues.push({ code: 'missing_hand', message: 'uiProfile.hand must be an object' });
	}
	if (!isObject(profile.table)) {
		issues.push({ code: 'missing_table', message: 'uiProfile.table must be an object' });
	}
	if (!isObject(profile.actions)) {
		issues.push({ code: 'missing_actions', message: 'uiProfile.actions must be an object' });
	}
	if (!isObject(profile.log)) {
		issues.push({ code: 'missing_log', message: 'uiProfile.log must be an object' });
	}

	const tableZones = isObject(profile.table) && Array.isArray(profile.table.zones) ? profile.table.zones : [];
	if (!Array.isArray((profile.table as { zones?: unknown } | undefined)?.zones)) {
		issues.push({ code: 'invalid_table_zones', message: 'uiProfile.table.zones must be an array' });
	}

	const zoneIds = new Set<string>();
	for (let zoneIndex = 0; zoneIndex < tableZones.length; zoneIndex += 1) {
		const zone = tableZones[zoneIndex];
		if (!isObject(zone)) {
			issues.push({
				code: 'invalid_zone',
				message: `uiProfile.table.zones[${zoneIndex}] must be an object`
			});
			continue;
		}
		if (typeof zone.id !== 'string' || zone.id.trim().length === 0) {
			issues.push({
				code: 'invalid_zone_id',
				message: `uiProfile.table.zones[${zoneIndex}].id must be a non-empty string`
			});
			continue;
		}
		if (zoneIds.has(zone.id)) {
			issues.push({ code: 'duplicate_zone_id', message: `Duplicate zone id "${zone.id}"` });
		}
		zoneIds.add(zone.id);
		if (typeof zone.label !== 'string' || zone.label.trim().length === 0) {
			issues.push({ code: 'invalid_zone_label', message: `uiProfile.table.zones[${zoneIndex}].label must be a non-empty string` });
		}
		if (typeof zone.hint !== 'string' || zone.hint.trim().length === 0) {
			issues.push({ code: 'invalid_zone_hint', message: `uiProfile.table.zones[${zoneIndex}].hint must be a non-empty string` });
		}
	}

	if (isObject(profile.hand)) {
		if (typeof profile.hand.zoneId !== 'string' || profile.hand.zoneId.trim().length === 0) {
			issues.push({ code: 'invalid_hand_zone_id', message: 'uiProfile.hand.zoneId must be a non-empty string' });
		}
		if (typeof profile.hand.label !== 'string' || profile.hand.label.trim().length === 0) {
			issues.push({ code: 'invalid_hand_label', message: 'uiProfile.hand.label must be a non-empty string' });
		}
		if (typeof profile.hand.hint !== 'string' || profile.hand.hint.trim().length === 0) {
			issues.push({ code: 'invalid_hand_hint', message: 'uiProfile.hand.hint must be a non-empty string' });
		}
		if (!Array.isArray(profile.hand.quickPlayTargets)) {
			issues.push({ code: 'invalid_quick_play_targets', message: 'uiProfile.hand.quickPlayTargets must be an array' });
		} else {
			for (let targetIndex = 0; targetIndex < profile.hand.quickPlayTargets.length; targetIndex += 1) {
				const target = profile.hand.quickPlayTargets[targetIndex];
				if (!isObject(target) || typeof target.zoneId !== 'string' || target.zoneId.trim().length === 0) {
					issues.push({
						code: 'invalid_quick_target',
						message: `uiProfile.hand.quickPlayTargets[${targetIndex}] must include non-empty zoneId`
					});
					continue;
				}
				if (!zoneIds.has(target.zoneId)) {
					issues.push({
						code: 'unknown_quick_target_zone',
						message: `uiProfile.hand.quickPlayTargets[${targetIndex}].zoneId "${target.zoneId}" not found in table zones`
					});
				}
			}
		}
	}

	if (isObject(profile.actions)) {
		if (!Array.isArray(profile.actions.primary)) {
			issues.push({ code: 'invalid_primary_actions', message: 'uiProfile.actions.primary must be an array' });
		} else {
			const actionIds = new Set<string>();
			for (let actionIndex = 0; actionIndex < profile.actions.primary.length; actionIndex += 1) {
				const action = profile.actions.primary[actionIndex];
				for (const issue of validatePrimaryAction(action, actionIndex)) {
					issues.push(issue);
				}
				if (isObject(action) && typeof action.id === 'string') {
					if (actionIds.has(action.id)) {
						issues.push({ code: 'duplicate_action_id', message: `Duplicate action id "${action.id}"` });
					}
					actionIds.add(action.id);
				}
			}
		}
	}

	if (runtimeRulePack) {
		const gameplay = runtimeGameplayRulePack(runtimeRulePack);
		const hand = isObject(profile.hand) ? (profile.hand as Record<string, unknown>) : undefined;
		if (hand && hand.zoneId !== gameplay.handZoneName) {
			issues.push({
				code: 'hand_zone_mismatch',
				message: `uiProfile.hand.zoneId "${String(hand.zoneId)}" does not match gameplay handZoneName "${gameplay.handZoneName}"`
			});
		}

		const legalQuickTargets = new Set(
			gameplay.zoneMovePolicy.targetZoneAllowlist.filter((zoneId) => zoneId !== gameplay.handZoneName)
		);

		if (hand && Array.isArray(hand.quickPlayTargets)) {
			for (let index = 0; index < hand.quickPlayTargets.length; index += 1) {
				const target = hand.quickPlayTargets[index];
				if (!isObject(target) || typeof target.zoneId !== 'string') {
					continue;
				}
				if (!legalQuickTargets.has(target.zoneId)) {
					issues.push({
						code: 'quick_target_zone_not_playable',
						message: `uiProfile.hand.quickPlayTargets[${index}].zoneId "${target.zoneId}" is not allowed by gameplay targetZoneAllowlist`
					});
				}
			}
		}

		const phases = new Set(gameplay.phases);
		if (isObject(profile.actions) && Array.isArray(profile.actions.primary)) {
			for (let index = 0; index < profile.actions.primary.length; index += 1) {
				const action = profile.actions.primary[index];
				if (!isObject(action) || action.kind !== 'set_phase') {
					continue;
				}
				if (typeof action.phase !== 'string' || !phases.has(action.phase)) {
					issues.push({
						code: 'unknown_action_phase',
						message: `uiProfile.actions.primary[${index}].phase must be one of gameplay phases`
					});
				}
			}
		}
	}

	return issues;
}

export function generateUiProfileFromRuntime(
	runtimeRulePack: RuntimeRulePack,
	options: GenerateUiProfileOptions = {}
): UiProfileV0 {
	const gameplay = runtimeGameplayRulePack(runtimeRulePack);
	const sourceZones = new Set(gameplay.zoneMovePolicy.sourceZoneAllowlist);
	const targetZones = new Set(gameplay.zoneMovePolicy.targetZoneAllowlist);
	const tableZoneIds = orderedTableZoneIds(runtimeRulePack);
	const quickPlayTargets = tableZoneIds
		.filter((zoneId) => targetZones.has(zoneId) && zoneId !== gameplay.handZoneName)
		.map((zoneId) => ({ zoneId }));

	const profile = createUiProfile({
		hand: {
			zoneId: gameplay.handZoneName,
			label: options.handLabel ?? 'Your Hand',
			hint: options.handHint ?? 'Select a card to reveal quick play targets.',
			quickPlayTargets
		},
		table: {
			zones: tableZoneIds.map((zoneId) => ({
				id: zoneId,
				label: defaultZoneLabel(zoneId),
				hint: defaultZoneHint(zoneId),
				visible: true,
				allowDrawFromTop: sourceZones.has(zoneId)
			}))
		}
	});

	const issues = validateUiProfile(profile, runtimeRulePack);
	if (issues.length > 0) {
		throw new Error(`Invalid generated uiProfile: ${issues.map((issue) => issue.code).join(', ')}`);
	}

	return profile;
}

export function resolveUiProfile(
	uiProfile: unknown,
	runtimeRulePack: RuntimeRulePack,
	options: GenerateUiProfileOptions = {}
): UiProfileV0 {
	const resolved = uiProfile === undefined ? generateUiProfileFromRuntime(runtimeRulePack, options) : (uiProfile as UiProfileV0);
	const issues = validateUiProfile(resolved, runtimeRulePack);
	if (issues.length > 0) {
		throw new Error(`Invalid uiProfile: ${issues.map((issue) => issue.code).join(', ')}`);
	}
	return resolved;
}
