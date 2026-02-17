import { describe, expect, test } from 'vitest';
import { deriveGameState, createGameplayRulePack, type CardLocation, type GameEvent } from '$lib/gameplay/engine';
import type { CardInput } from '$lib/scorekeeper/engine';
import {
	buildDemoPlayEvents,
	buildPlaySurfaceView,
	cardViewKey,
	createHandMoveEvent
} from '$lib/gameplay/play-surface-model';

function makeCard(rank: CardInput['rank'], suit: NonNullable<CardInput['suit']>, id: string): CardInput {
	return { rank, suit, tags: [`cid:${id}`] };
}

describe('play-surface-model', () => {
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
});
