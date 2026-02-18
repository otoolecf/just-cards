import { describe, expect, test } from 'vitest';
import { deriveGameState, createGameplayRulePack, type CardLocation, type GameEvent } from '$lib/gameplay/engine';
import type { CardInput } from '$lib/scorekeeper/engine';
import {
	buildDemoPlayEvents,
	buildRulesetPlayEvents,
	buildPlaySurfaceView,
	cardIsFaceDown,
	cardViewKey,
	createHandMoveEvent
} from '$lib/gameplay/play-surface-model';
import { createUiProfile } from '$lib/ui/ui-profile';
import type { RuntimeRulesetBundle } from '$lib/rulesets/types';

function makeCard(rank: CardInput['rank'], suit: NonNullable<CardInput['suit']>, id: string): CardInput {
	return { rank, suit, tags: [`cid:${id}`] };
}

describe('play-surface-model', () => {
	function makeBundle(overrides?: Partial<RuntimeRulesetBundle>): RuntimeRulesetBundle {
		const gameplayRulePack = createGameplayRulePack({
			handZoneName: 'hand',
			zoneMovePolicy: {
				allowedPhases: ['play', 'deal', 'pregame'],
				actorMustBeCurrentPlayer: false,
				sourceMustBelongToActor: false,
				sourceZoneAllowlist: ['hand', 'stock', 'discard'],
				targetZoneAllowlist: ['hand', 'stock', 'discard']
			}
		});
		return {
			bundleVersion: 'runtime-bundle/v1',
			gameId: 'test-game',
			displayName: 'Test Game',
			runtimeRulePack: {
				gameplayRulePack
			},
			uiProfile: createUiProfile({
				hand: {
					zoneId: 'hand',
					quickPlayTargets: [{ zoneId: 'discard' }]
				},
				table: {
					zones: [
						{ id: 'stock', label: 'Stock', hint: 'Draw pile', allowDrawFromTop: true },
						{ id: 'discard', label: 'Discard', hint: 'Top discard', allowDrawFromTop: true }
					]
				}
			}),
			...(overrides ?? {})
		};
	}

	test('build_play_surface_view_marks_seats_and_zones', () => {
		const events: GameEvent[] = [
			{ type: 'init_game', players: ['Ada', 'Bea', 'Cam'], dealerIndex: 0 },
			{ type: 'set_phase', phase: 'deal' },
			{ type: 'deal_cards', playerId: 'Ada', cards: [makeCard('A', 'spades', 'a1')] },
			{ type: 'deal_cards', playerId: 'Bea', cards: [makeCard('2', 'hearts', 'b1')] },
			{ type: 'zone_move', actorId: 'Ada', from: { kind: 'player', playerId: 'Ada', zone: 'hand' }, to: { kind: 'table', zone: 'board' }, cards: [makeCard('A', 'spades', 'a1')] }
		];

		const state = deriveGameState(
			events,
			createGameplayRulePack({
				handZoneName: 'hand',
				zoneMovePolicy: {
					allowedPhases: ['deal', 'play'],
					actorMustBeCurrentPlayer: false
				}
			})
		);
		const view = buildPlaySurfaceView(state, {
			selfPlayerId: 'Ada',
			handZoneName: 'hand',
			tableZoneOrder: ['board', 'discard']
		});

		expect(view.seats).toHaveLength(3);
		expect(view.seats.find((seat) => seat.playerId === 'Ada')?.isDealer).toBe(true);
		expect(view.seats.find((seat) => seat.playerId === 'Ada')?.isCurrentTurn).toBe(true);
		expect(view.hand.zoneId).toBe('hand');
		expect(view.hand.cards).toHaveLength(1);
		expect(view.tableZones[0]?.zoneId).toBe('board');
		expect(view.tableZones[0]?.cards).toHaveLength(0);
		expect(view.tableZones[1]?.zoneId).toBe('discard');
	});

	test('create_hand_move_event_uses_selected_card_and_zone', () => {
		const card = makeCard('K', 'clubs', 'k1');
		const from: CardLocation = { kind: 'player', playerId: 'Ada', zone: 'hand' };
		const to: CardLocation = { kind: 'table', zone: 'discard' };
		const event = createHandMoveEvent({ actorId: 'Ada', from, to, card });

		expect(event.type).toBe('zone_move');
		if (event.type !== 'zone_move') {
			throw new Error('Expected zone_move event');
		}
		expect(event.actorId).toBe('Ada');
		expect(event.cards).toEqual([card]);
		expect(event.to).toEqual(to);
	});

	test('card_view_key_prefers_card_id_tag', () => {
		const keyed = cardViewKey({ rank: 'Q', suit: 'diamonds', tags: ['cid:q9'] }, 'fallback-1');
		const fallback = cardViewKey({ rank: 'Q', suit: 'diamonds' }, 'fallback-1');

		expect(keyed).toBe('q9');
		expect(fallback).toBe('fallback-1');
	});

	test('play_surface_demo_round_flow', () => {
		const events = buildDemoPlayEvents(['You', 'Riv', 'Mina']);
		const state = deriveGameState(events, createGameplayRulePack({ handZoneName: 'hand', phaseAfterRoundStart: 'play' }));
		const view = buildPlaySurfaceView(state, {
			selfPlayerId: 'You',
			handZoneName: 'hand',
			tableZoneOrder: ['board', 'discard']
		});

		expect(view.hand.cards.length).toBeGreaterThan(0);
		expect(view.seats).toHaveLength(3);
		expect(view.tableZones.some((zone) => zone.zoneId === 'board')).toBe(true);
	});

	test('play_surface_can_hide_discovered_table_zones', () => {
		const events = buildDemoPlayEvents(['You', 'Riv', 'Mina']);
		const state = deriveGameState(events, createGameplayRulePack({ handZoneName: 'hand', phaseAfterRoundStart: 'play' }));
		const view = buildPlaySurfaceView(state, {
			selfPlayerId: 'You',
			handZoneName: 'hand',
			tableZoneOrder: ['board', 'discard'],
			includeDiscoveredTableZones: false
		});

		expect(view.tableZones.map((zone) => zone.zoneId)).toEqual(['board', 'discard']);
	});

	test('build_play_surface_view_applies_zone_label_overrides', () => {
		const events = buildDemoPlayEvents(['You', 'Riv', 'Mina']);
		const state = deriveGameState(events, createGameplayRulePack({ handZoneName: 'hand', phaseAfterRoundStart: 'play' }));
		const view = buildPlaySurfaceView(state, {
			selfPlayerId: 'You',
			handZoneName: 'hand',
			tableZoneOrder: ['board', 'discard'],
			includeDiscoveredTableZones: false,
			zoneLabels: {
				hand: 'Your Cards',
				board: 'Community Lane',
				discard: 'Burn Pile'
			}
		});

		expect(view.hand.label).toBe('Your Cards');
		expect(view.tableZones.find((zone) => zone.zoneId === 'board')?.label).toBe('Community Lane');
		expect(view.tableZones.find((zone) => zone.zoneId === 'discard')?.label).toBe('Burn Pile');
	});

	test('build_play_surface_view_masks_face_down_cards', () => {
		const events: GameEvent[] = [
			{ type: 'init_game', players: ['You', 'Riv'], dealerIndex: 0 },
			{
				type: 'deal_cards',
				playerId: 'You',
				zone: 'hand',
				cards: [{ rank: 'K', suit: 'spades', tags: ['cid:hidden-k', 'face:down'] }]
			}
		];

		const state = deriveGameState(events, createGameplayRulePack({ handZoneName: 'hand' }));
		const view = buildPlaySurfaceView(state, {
			selfPlayerId: 'You',
			handZoneName: 'hand',
			tableZoneOrder: ['discard']
		});
		const card = view.hand.cards[0];
		expect(card.label).toBe('??');
		expect(card.isFaceDown).toBe(true);
	});

	test('build_demo_play_events_supports_dynamic_zone_ids_and_phase', () => {
		const events = buildDemoPlayEvents(['You', 'Riv', 'Mina'], {
			handZoneName: 'cards',
			initialPhase: 'main',
			tableZones: ['community', 'burn']
		});
		const dealEvents = events.filter((event): event is Extract<GameEvent, { type: 'deal_cards' }> => event.type === 'deal_cards');
		const moveEvents = events.filter((event): event is Extract<GameEvent, { type: 'zone_move' }> => event.type === 'zone_move');
		const phaseEvent = events.find((event): event is Extract<GameEvent, { type: 'set_phase' }> => event.type === 'set_phase');

		expect(phaseEvent?.phase).toBe('main');
		expect(dealEvents.every((event) => event.zone === 'cards')).toBe(true);
		expect(moveEvents.map((event) => event.to.zone)).toEqual(['community', 'burn']);
		expect(moveEvents.every((event) => event.from.zone === 'cards')).toBe(true);
	});

	test('build_ruleset_play_events_uses_explain_hand_size_and_seeds_stock_discard', () => {
		const bundle = makeBundle({
			explain: {
				schemaVersion: 'ruleset-explain/v0',
				goal: 'Lowest score wins.',
				playerRange: { min: 2, max: 4 },
				turnFlow: { drawFrom: ['Stock'], playTo: ['Discard'] },
				scoring: { lowScoreWins: true, aceValue: 1, rankOverrides: [] },
				zones: [
					{ id: 'stock', label: 'Stock', hint: 'Draw pile' },
					{ id: 'discard', label: 'Discard', hint: 'Throw-away pile' }
				],
				diagnostics: [
					'setup: each player has 6 cards in front.',
					'setup: turn 2 cards face up; keep the rest face down.'
				],
				source: { type: 'url', url: 'https://example.com/six-card-golf' },
				generatedAt: '2026-02-18T00:00:00.000Z'
			}
		});
		const events = buildRulesetPlayEvents(['You', 'Riv', 'Mina'], bundle);
		const state = deriveGameState(events, bundle.runtimeRulePack.gameplayRulePack);

		const handCounts = state.turnOrder.map((playerId) => state.playerZones[playerId]?.hand?.length ?? 0);
		expect(handCounts).toEqual([6, 6, 6]);
		const youCards = state.playerZones['You']?.hand ?? [];
		expect(youCards.filter((card) => cardIsFaceDown(card)).length).toBe(4);
		expect((state.tableZones.stock ?? []).length).toBeGreaterThan(10);
		expect((state.tableZones.discard ?? []).length).toBe(1);
	});

	test('build_ruleset_play_events_falls_back_to_demo_defaults_without_explain', () => {
		const bundle = makeBundle();
		const events = buildRulesetPlayEvents(['You', 'Riv', 'Mina'], bundle);
		const state = deriveGameState(events, bundle.runtimeRulePack.gameplayRulePack);

		const handCounts = state.turnOrder.map((playerId) => state.playerZones[playerId]?.hand?.length ?? 0);
		expect(handCounts).toEqual([5, 5, 5]);
		const youCards = state.playerZones['You']?.hand ?? [];
		expect(youCards.some((card) => cardIsFaceDown(card))).toBe(false);
		expect((state.tableZones.discard ?? []).length).toBe(1);
	});

	test('build_play_surface_view_exposes_seat_public_cards_with_layout', () => {
		const bundle = makeBundle({
			explain: {
				schemaVersion: 'ruleset-explain/v0',
				goal: 'Lowest score wins.',
				playerRange: { min: 2, max: 4 },
				turnFlow: { drawFrom: ['Stock'], playTo: ['Discard'] },
				scoring: { lowScoreWins: true, aceValue: 1, rankOverrides: [] },
				zones: [
					{ id: 'stock', label: 'Stock', hint: 'Draw pile' },
					{ id: 'discard', label: 'Discard', hint: 'Throw-away pile' }
				],
				diagnostics: [
					'setup: each player has 6 cards in front.',
					'setup: turn 2 cards face up; keep the rest face down.'
				],
				source: { type: 'url', url: 'https://example.com/six-card-golf' },
				generatedAt: '2026-02-18T00:00:00.000Z'
			},
			uiProfile: createUiProfile({
				hand: {
					zoneId: 'hand',
					label: 'Your Layout',
					hint: 'Pick a card',
					quickPlayTargets: [{ zoneId: 'discard' }],
					layout: { kind: 'grid', rows: 2, columns: 3 }
				},
				table: {
					zones: [
						{ id: 'stock', label: 'Stock', hint: 'Draw pile', allowDrawFromTop: true },
						{ id: 'discard', label: 'Discard', hint: 'Top discard', allowDrawFromTop: true }
					]
				},
				seats: {
					cards: {
						zoneId: 'hand',
						label: 'Layouts',
						includeSelf: false,
						layout: { kind: 'grid', rows: 2, columns: 3 }
					}
				}
			})
		});
		const events = buildRulesetPlayEvents(['You', 'Riv', 'Mina'], bundle);
		const state = deriveGameState(events, bundle.runtimeRulePack.gameplayRulePack);
		const view = buildPlaySurfaceView(state, {
			selfPlayerId: 'You',
			handZoneName: 'hand',
			tableZoneOrder: ['stock', 'discard'],
			seatPublicCards: {
				zoneId: 'hand',
				label: 'Layouts',
				includeSelf: false,
				layout: { kind: 'grid', rows: 2, columns: 3 }
			}
		});

		expect(view.seats.find((seat) => seat.playerId === 'You')?.publicZone).toBeUndefined();
		const rivPublic = view.seats.find((seat) => seat.playerId === 'Riv')?.publicZone;
		expect(rivPublic?.layout).toEqual({ kind: 'grid', rows: 2, columns: 3 });
		expect(rivPublic?.cards.length).toBe(6);
		expect(rivPublic?.cards.some((card) => card.isFaceDown)).toBe(true);
	});

	test('build_ruleset_play_events_assigns_layout_slots_for_grid_hands', () => {
		const bundle = makeBundle({
			explain: {
				schemaVersion: 'ruleset-explain/v0',
				goal: 'Lowest score wins.',
				playerRange: { min: 2, max: 4 },
				turnFlow: { drawFrom: ['Stock'], playTo: ['Discard'] },
				scoring: { lowScoreWins: true, aceValue: 1, rankOverrides: [] },
				zones: [
					{ id: 'stock', label: 'Stock', hint: 'Draw pile' },
					{ id: 'discard', label: 'Discard', hint: 'Throw-away pile' }
				],
				diagnostics: [
					'setup: each player has 6 cards in front arranged in 2 rows of 3.',
					'setup: turn 2 cards face up; keep the rest face down.'
				],
				source: { type: 'url', url: 'https://example.com/six-card-golf' },
				generatedAt: '2026-02-18T00:00:00.000Z'
			},
			uiProfile: createUiProfile({
				hand: {
					zoneId: 'hand',
					quickPlayTargets: [{ zoneId: 'discard' }],
					layout: { kind: 'grid', rows: 2, columns: 3 }
				},
				table: {
					zones: [
						{ id: 'stock', label: 'Stock', hint: 'Draw pile', allowDrawFromTop: true },
						{ id: 'discard', label: 'Discard', hint: 'Top discard', allowDrawFromTop: true }
					]
				}
			})
		});
		const events = buildRulesetPlayEvents(['You', 'Riv', 'Mina'], bundle);
		const state = deriveGameState(events, bundle.runtimeRulePack.gameplayRulePack);
		const handCards = state.playerZones['You']?.hand ?? [];
		const slotTags = handCards.map((card) => (card.tags ?? []).find((tag) => tag.startsWith('slot:r')) ?? '');

		expect(slotTags).toContain('slot:r1c1');
		expect(slotTags).toContain('slot:r1c3');
		expect(slotTags).toContain('slot:r2c1');
		expect(slotTags).toContain('slot:r2c3');
	});
});
