import { describe, expect, it } from 'vitest';

import { createGameplayRulePack, deriveGameState, type GameEvent } from './engine';

describe('gameplay engine', () => {
	it('init_game_sets_players_turn_and_zones', () => {
		const events: GameEvent[] = [
			{
				type: 'init_game',
				players: ['alice', 'bob'],
				turnOrder: ['bob', 'alice'],
				dealerIndex: 1
			}
		];

		const state = deriveGameState(events);

		expect(state.players).toEqual(['alice', 'bob']);
		expect(state.turnOrder).toEqual(['bob', 'alice']);
		expect(state.dealerIndex).toBe(1);
		expect(state.currentTurnIndex).toBe(1);
		expect(state.roundNumber).toBe(0);
		expect(state.phase).toBe('pregame');
		expect(state.playerZones.bob).toBeDefined();
		expect(state.playerZones.bob.hand).toEqual([]);
		expect(state.playerZones.alice.hand).toEqual([]);
	});

	it('deal_cards_appends_to_player_hand', () => {
		const events: GameEvent[] = [
			{ type: 'init_game', players: ['alice', 'bob'] },
			{
				type: 'deal_cards',
				playerId: 'alice',
				cards: [{ rank: 'A' }, { rank: 'K' }]
			},
			{
				type: 'deal_cards',
				playerId: 'bob',
				cards: [{ rank: '5' }]
			}
		];

		const state = deriveGameState(events);

		expect(state.playerZones.alice.hand).toEqual([{ rank: 'A' }, { rank: 'K' }]);
		expect(state.playerZones.bob.hand).toEqual([{ rank: '5' }]);
	});

	it('zone_move_rejects_cards_not_in_source_zone', () => {
		const events: GameEvent[] = [
			{ type: 'init_game', players: ['alice', 'bob'] },
			{ type: 'set_phase', phase: 'play' },
			{
				type: 'deal_cards',
				playerId: 'alice',
				cards: [{ rank: 'K' }]
			},
			{
				type: 'zone_move',
				actorId: 'alice',
				from: { kind: 'player', playerId: 'alice', zone: 'hand' },
				to: { kind: 'table', zone: 'table' },
				cards: [{ rank: 'Q' }]
			}
		];

		const state = deriveGameState(events);

		expect(state.validationIssues?.map((issue) => issue.code)).toContain('source_card_missing');
		expect(state.playerZones.alice.hand).toEqual([{ rank: 'K' }]);
		expect(state.tableZones.table).toEqual([]);
	});

	it('zone_move_requires_current_player', () => {
		const events: GameEvent[] = [
			{
				type: 'init_game',
				players: ['alice', 'bob'],
				turnOrder: ['alice', 'bob'],
				dealerIndex: 0
			},
			{ type: 'set_phase', phase: 'play' },
			{
				type: 'deal_cards',
				playerId: 'bob',
				cards: [{ rank: '7' }]
			},
			{
				type: 'zone_move',
				actorId: 'bob',
				from: { kind: 'player', playerId: 'bob', zone: 'hand' },
				to: { kind: 'table', zone: 'table' },
				cards: [{ rank: '7' }]
			}
		];

		const state = deriveGameState(events);

		expect(state.validationIssues?.map((issue) => issue.code)).toContain('not_current_player');
		expect(state.playerZones.bob.hand).toEqual([{ rank: '7' }]);
		expect(state.tableZones.table).toEqual([]);
	});

	it('advance_turn_cycles_round_robin', () => {
		const events: GameEvent[] = [
			{
				type: 'init_game',
				players: ['alice', 'bob', 'cara'],
				dealerIndex: 0
			},
			{ type: 'advance_turn' },
			{ type: 'advance_turn' },
			{ type: 'advance_turn' }
		];

		const state = deriveGameState(events);

		expect(state.currentTurnIndex).toBe(0);
	});

	it('start_round_rotates_dealer_and_starts_new_round', () => {
		const events: GameEvent[] = [
			{ type: 'init_game', players: ['alice', 'bob', 'cara'], dealerIndex: 0 },
			{
				type: 'start_round',
				roundIndex: 7
			},
			{
				type: 'zone_move',
				actorId: 'alice',
				from: { kind: 'table', zone: 'table' },
				to: { kind: 'table', zone: 'discard' },
				cards: [{ rank: 'A' }]
			}
		];

		const state = deriveGameState(events);

		expect(state.roundNumber).toBe(7);
		expect(state.dealerIndex).toBe(1);
		expect(state.currentTurnIndex).toBe(2);
		expect(state.phase).toBe('deal');
		expect(state.validationIssues?.some((issue) => issue.code === 'source_card_missing')).toBe(true);
		expect(state.tableZones.table).toEqual([]);
	});

	it('start_round_requires_rounds_enabled_when_disabled', () => {
		const rules = createGameplayRulePack({ roundPolicy: { enabled: false } });
		const state = deriveGameState([{ type: 'init_game', players: ['alice', 'bob'] }, { type: 'start_round' }], rules);

		expect(state.validationIssues?.some((issue) => issue.code === 'rounds_disabled')).toBe(true);
	});

	it('zone_move_moves_cards_and_tracks_turn', () => {
		const events: GameEvent[] = [
			{ type: 'init_game', players: ['alice', 'bob'], dealerIndex: 0 },
			{
				type: 'deal_cards',
				playerId: 'alice',
				cards: [{ rank: 'A' }]
			},
			{
				type: 'zone_move',
				actorId: 'alice',
				from: { kind: 'player', playerId: 'alice', zone: 'hand' },
				to: { kind: 'table', zone: 'table' },
				cards: [{ rank: 'A' }]
			}
		];

		const state = deriveGameState(events, createGameplayRulePack({ startingPhase: 'play' }));

		expect(state.playerZones.alice.hand).toEqual([]);
		expect(state.tableZones.table).toEqual([{ rank: 'A' }]);
		expect(state.validationIssues).toBeUndefined();
	});

	it('undo_and_redo_replay_mutating_events', () => {
		const events: GameEvent[] = [
			{ type: 'init_game', players: ['alice', 'bob'] },
			{ type: 'set_phase', phase: 'play' },
			{
				type: 'deal_cards',
				playerId: 'alice',
				cards: [{ rank: 'Q' }]
			},
			{
				type: 'zone_move',
				actorId: 'alice',
				from: { kind: 'player', playerId: 'alice', zone: 'hand' },
				to: { kind: 'table', zone: 'table' },
				cards: [{ rank: 'Q' }]
			},
			{ type: 'undo' },
			{ type: 'redo' }
		];

		const state = deriveGameState(events, createGameplayRulePack({ startingPhase: 'play' }));

		expect(state.playerZones.alice.hand).toEqual([]);
		expect(state.tableZones.table).toEqual([{ rank: 'Q' }]);
	});

	it('strict_validation_fails_invalid_rule_pack', () => {
		expect(() =>
			deriveGameState([], { schemaVersion: 'gameplay/v999' }, { strictValidation: true })
		).toThrow('schema_version_mismatch');
	});

	it('non_strict_mode_records_rule_pack_issues', () => {
		const state = deriveGameState([], { schemaVersion: 'gameplay/v999' });

		expect(state.validationIssues?.some((issue) => issue.code === 'schema_version_mismatch')).toBe(true);
	});

	it('derive_game_state_trace_includes_validation_events', () => {
		const events: GameEvent[] = [
			{
				type: 'zone_move',
				actorId: 'alice',
				from: { kind: 'player', playerId: 'alice', zone: 'hand' },
				to: { kind: 'table', zone: 'table' },
				cards: [{ rank: '2' }]
			}
		];
		const state = deriveGameState(events, createGameplayRulePack(), { trace: true });

		expect(state.trace?.some((entry) => entry.stage === 'validate')).toBe(true);
		expect(state.validationIssues?.map((issue) => issue.code)).toContain('no_game_initialized');
	});
});
