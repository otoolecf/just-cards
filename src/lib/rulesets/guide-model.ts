import { quickPlayZoneIdsFromUiProfile } from '$lib/gameplay/play-surface-profiles';
import type { RuntimeRulesetBundle } from './types';

export interface RulesetGuideModel {
	title: string;
	objective: string;
	quickStart: string[];
	scoringHighlights: string[];
	zoneGuide: string[];
	auditTrail: string[];
	diagnostics: string[];
}

function formatPlayerRange(min: number, max: number): string {
	return min === max ? `${min} players` : `${min}-${max} players`;
}

function scoringHighlightsFromBundle(bundle: RuntimeRulesetBundle): string[] {
	if (bundle.explain) {
		const highlights: string[] = [];
		highlights.push(
			bundle.explain.scoring.lowScoreWins
				? 'Lowest total score wins.'
				: 'Highest total score wins unless stated otherwise.'
		);
		highlights.push(`Ace value: ${bundle.explain.scoring.aceValue}.`);
		if (bundle.explain.scoring.rankOverrides.length > 0) {
			highlights.push(
				`Special ranks: ${bundle.explain.scoring.rankOverrides
					.map((entry) => `${entry.rank}=${entry.value}`)
					.join(', ')}.`
			);
		}
		return highlights;
	}

	return ['Use card values and scoring triggers configured by the active ruleset.'];
}

function quickStartFromBundle(bundle: RuntimeRulesetBundle): string[] {
	if (bundle.explain) {
		const steps: string[] = [];
		steps.push(`Setup for ${formatPlayerRange(bundle.explain.playerRange.min, bundle.explain.playerRange.max)}.`);
		if (bundle.explain.rounds) {
			steps.push(`Play ${bundle.explain.rounds} rounds/deals unless your table agrees otherwise.`);
		}
		if (bundle.explain.turnFlow.drawFrom.length > 0) {
			steps.push(`On your turn, draw from: ${bundle.explain.turnFlow.drawFrom.join(', ')}.`);
		}
		if (bundle.explain.turnFlow.playTo.length > 0) {
			steps.push(`Then play/discard to: ${bundle.explain.turnFlow.playTo.join(', ')}.`);
		}
		steps.push('Use Actions for turn/phase controls and Log for table history.');
		return steps;
	}

	const quickTargets = quickPlayZoneIdsFromUiProfile(bundle.uiProfile);
	const quickTargetLabels = quickTargets
		.map((zoneId) => bundle.uiProfile.table.zones.find((zone) => zone.id === zoneId)?.label)
		.filter((label): label is string => Boolean(label));

	const fallback: string[] = [
		'Select a card from your hand to reveal quick play targets.',
		'Move cards through the table zones and follow the current phase/turn indicators.'
	];
	if (quickTargetLabels.length > 0) {
		fallback.push(`Quick targets: ${quickTargetLabels.join(', ')}.`);
	}
	return fallback;
}

function zoneGuideFromBundle(bundle: RuntimeRulesetBundle): string[] {
	if (bundle.explain && bundle.explain.zones.length > 0) {
		return bundle.explain.zones.map((zone) => `${zone.label}: ${zone.hint}`);
	}
	return bundle.uiProfile.table.zones
		.filter((zone) => zone.visible !== false)
		.map((zone) => `${zone.label}: ${zone.hint}`);
}

function auditTrailFromBundle(bundle: RuntimeRulesetBundle): string[] {
	if (!bundle.explain) {
		return ['Audit data unavailable for this ruleset bundle.'];
	}

	const lines: string[] = [];
	lines.push(`Source type: ${bundle.explain.source.type}.`);
	if (bundle.explain.source.url) {
		lines.push(`Source URL: ${bundle.explain.source.url}`);
	}
	lines.push(`Generated: ${bundle.explain.generatedAt}`);
	lines.push(`Bundle ID: ${bundle.gameId}`);
	return lines;
}

export function buildRulesetGuideModel(bundle: RuntimeRulesetBundle): RulesetGuideModel {
	return {
		title: bundle.displayName,
		objective:
			bundle.explain?.goal ??
			'Follow turn order, move cards through legal zones, and resolve scoring according to the active ruleset.',
		quickStart: quickStartFromBundle(bundle),
		scoringHighlights: scoringHighlightsFromBundle(bundle),
		zoneGuide: zoneGuideFromBundle(bundle),
		auditTrail: auditTrailFromBundle(bundle),
		diagnostics: bundle.explain?.diagnostics ?? []
	};
}
