import { buildPlaySurfaceView } from '$lib/gameplay/play-surface-model';
import {
	playSurfaceProfileFromUiProfile,
	quickPlayZoneIdsFromUiProfile,
	visibleZones,
	zoneLabelMap
} from '$lib/gameplay/play-surface-profiles';
import { deriveGameState } from '$lib/gameplay/engine';
import { deriveGameRuntimeState, type RuntimeEvent } from '$lib/runtime/game-runtime';
import type { CardInput } from '$lib/scorekeeper/engine';
import { validateUiProfile } from '$lib/ui/ui-profile';
import { createGameplayRulePack } from '$lib/gameplay/engine';
import type { RuntimeRulesetBundle } from './types';

export interface RulesetConfidenceCheck {
	id: string;
	pass: boolean;
	details: string;
}

export interface RulesetConfidenceResult {
	pass: boolean;
	checks: RulesetConfidenceCheck[];
	runtimeEvents: RuntimeEvent[];
}

function pushCheck(checks: RulesetConfidenceCheck[], id: string, pass: boolean, details: string): void {
	checks.push({ id, pass, details });
}

function sampleCard(rank: CardInput['rank'], suit: NonNullable<CardInput['suit']>, id: string): CardInput {
	return { rank, suit, tags: [`cid:${id}`] };
}

function buildSmokeRuntimeEvents(bundle: RuntimeRulesetBundle): RuntimeEvent[] {
	const gameplayRulePack = bundle.runtimeRulePack.gameplayRulePack ?? createGameplayRulePack();
	const handZone = gameplayRulePack.handZoneName;
	const players = ['You', 'Riv', 'Mina'];

	const events: RuntimeEvent[] = [
		{
			type: 'gameplay',
			event: { type: 'init_game', players, dealerIndex: 0 }
		}
	];

	if (gameplayRulePack.roundPolicy.enabled) {
		events.push({ type: 'gameplay', event: { type: 'start_round' } });
	}

	const stateBeforeMoves = deriveGameState(
		events
			.filter((entry): entry is Extract<RuntimeEvent, { type: 'gameplay' }> => entry.type === 'gameplay')
			.map((entry) => entry.event),
		gameplayRulePack,
		{ strictValidation: true }
	);

	const actorId = stateBeforeMoves.turnOrder[stateBeforeMoves.currentTurnIndex] ?? players[0];

	const cardsByPlayer: Record<string, CardInput[]> = {
		You: [sampleCard('2', 'spades', 'smoke-you-2'), sampleCard('4', 'clubs', 'smoke-you-4')],
		Riv: [sampleCard('5', 'hearts', 'smoke-riv-5'), sampleCard('K', 'spades', 'smoke-riv-k')],
		Mina: [sampleCard('7', 'diamonds', 'smoke-mina-7'), sampleCard('9', 'hearts', 'smoke-mina-9')]
	};

	for (const playerId of players) {
		events.push({
			type: 'gameplay',
			event: {
				type: 'deal_cards',
				playerId,
				zone: handZone,
				cards: cardsByPlayer[playerId]
			}
		});
	}

	const quickTargetZoneIds = quickPlayZoneIdsFromUiProfile(bundle.uiProfile);
	const legalTargetZoneIds = gameplayRulePack.zoneMovePolicy.targetZoneAllowlist.filter(
		(zoneId) => zoneId !== handZone
	);
	const targetZone = quickTargetZoneIds.find((zoneId) => legalTargetZoneIds.includes(zoneId));
	const phaseAllowsMoves = gameplayRulePack.zoneMovePolicy.allowedPhases.includes(stateBeforeMoves.phase);
	const sourceAllowsHand = gameplayRulePack.zoneMovePolicy.sourceZoneAllowlist.includes(handZone);

	if (targetZone && phaseAllowsMoves && sourceAllowsHand) {
		events.push({
			type: 'gameplay',
			event: {
				type: 'zone_move',
				actorId,
				from: { kind: 'player', playerId: actorId, zone: handZone },
				to: { kind: 'table', zone: targetZone },
				cards: [cardsByPlayer[actorId]?.[0]].filter((card): card is CardInput => Boolean(card))
			}
		});
	}

	events.push({ type: 'gameplay', event: { type: 'end_round' } });

	return events;
}

export function evaluateRulesetBundleConfidence(bundle: RuntimeRulesetBundle): RulesetConfidenceResult {
	const checks: RulesetConfidenceCheck[] = [];

	pushCheck(
		checks,
		'bundle-contract-v1',
		bundle.bundleVersion === 'runtime-bundle/v1',
		`bundleVersion=${bundle.bundleVersion}`
	);

	const uiIssues = validateUiProfile(bundle.uiProfile, bundle.runtimeRulePack);
	pushCheck(
		checks,
		'ui-profile-valid',
		uiIssues.length === 0,
		uiIssues.length === 0
			? 'uiProfile validates against runtime rule pack'
			: `issues=${uiIssues.map((issue) => issue.code).join(', ')}`
	);

	const playProfile = playSurfaceProfileFromUiProfile(bundle.uiProfile);
	const visiblePlayZones = visibleZones(playProfile).map((zone) => zone.id);
	pushCheck(
		checks,
		'ui-visible-zones-non-empty',
		visiblePlayZones.length > 0,
		`visibleZones=${visiblePlayZones.join(', ') || 'none'}`
	);

	const quickTargets = quickPlayZoneIdsFromUiProfile(bundle.uiProfile);
	const quickTargetsInVisibleZones = quickTargets.every((zoneId) => visiblePlayZones.includes(zoneId));
	pushCheck(
		checks,
		'ui-quick-targets-visible-zones',
		quickTargetsInVisibleZones,
		`quickTargets=${quickTargets.join(', ') || 'none'} visibleZones=${visiblePlayZones.join(', ') || 'none'}`
	);

	const runtimeEvents = buildSmokeRuntimeEvents(bundle);
	const runtimeState = deriveGameRuntimeState(runtimeEvents, bundle.runtimeRulePack);
	const gameplayIssues = runtimeState.gameplay.validationIssues ?? [];
	const scoreIssues = runtimeState.score.validationIssues ?? [];

	pushCheck(
		checks,
		'runtime-smoke-no-gameplay-validation-issues',
		gameplayIssues.length === 0,
		gameplayIssues.length === 0
			? 'no gameplay validation issues from smoke simulation'
			: `issues=${gameplayIssues.map((issue) => issue.code).join(', ')}`
	);

	pushCheck(
		checks,
		'runtime-smoke-no-score-validation-issues',
		scoreIssues.length === 0,
		scoreIssues.length === 0
			? 'no score validation issues from smoke simulation'
			: `issues=${scoreIssues.map((issue) => issue.code).join(', ')}`
	);

	try {
		const labelOverrides = zoneLabelMap(playProfile);
		const playView = buildPlaySurfaceView(runtimeState.gameplay, {
			selfPlayerId: 'You',
			handZoneName: bundle.uiProfile.hand.zoneId,
			tableZoneOrder: visiblePlayZones,
			includeDiscoveredTableZones: false,
			zoneLabels: labelOverrides
		});
		const validHandLabel = playView.hand.label.trim().length > 0;
		const validTableLabels = playView.tableZones.every((zone) => zone.label.trim().length > 0);
		pushCheck(
			checks,
			'play-surface-view-builds',
			validHandLabel && validTableLabels,
			`handCards=${playView.hand.cards.length} tableZones=${playView.tableZones.length}`
		);
	} catch (error) {
		pushCheck(
			checks,
			'play-surface-view-builds',
			false,
			error instanceof Error ? error.message : 'unknown error building play surface view'
		);
	}

	const hasEndRoundTrigger = (bundle.runtimeRulePack.scoringTriggers ?? []).some(
		(trigger) => trigger.when.eventType === 'end_round'
	);
	if (hasEndRoundTrigger) {
		pushCheck(
			checks,
			'runtime-end-round-trigger-fires',
			runtimeState.generatedScoreEvents.length > 0,
			`generatedScoreEvents=${runtimeState.generatedScoreEvents.length}`
		);
	}

	return {
		pass: checks.every((check) => check.pass),
		checks,
		runtimeEvents
	};
}
