import { describe, expect, it } from 'vitest';

import { createGameplayRulePack, deriveGameState, type GameEvent } from './engine';
import { createValidatorRulePack } from './validator';

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

	it('zone_move_draw_policy_blocks_second_draw_before_resolve', () => {
		const rules = createGameplayRulePack({
			handZoneName: 'hand',
			startingPhase: 'play',
			zoneMovePolicy: {
				allowedPhases: ['deal', 'play'],
				actorMustBeCurrentPlayer: false,
				sourceMustBelongToActor: false,
				sourceZoneAllowlist: ['hand', 'stock', 'discard'],
				targetZoneAllowlist: ['hand', 'stock', 'discard'],
				minCards: 1,
				maxCards: 1
			},
			turnActionPolicy: {
				enabled: true,
				allowedPhases: ['play'],
				drawFromZoneAllowlist: ['stock', 'discard'],
				resolveToZoneAllowlist: ['discard'],
				requireDrawBeforeResolve: true,
				requireResolveAfterDraw: true
			}
		});

		const events: GameEvent[] = [
			{ type: 'init_game', players: ['alice', 'bob'], dealerIndex: 0 },
			{ type: 'set_phase', phase: 'deal' },
			{ type: 'deal_cards', playerId: 'alice', cards: [{ rank: 'A' }, { rank: '2' }, { rank: '3' }] },
			{
				type: 'zone_move',
				actorId: 'alice',
				from: { kind: 'player', playerId: 'alice', zone: 'hand' },
				to: { kind: 'table', zone: 'stock' },
				cards: [{ rank: '2' }]
			},
			{
				type: 'zone_move',
				actorId: 'alice',
				from: { kind: 'player', playerId: 'alice', zone: 'hand' },
				to: { kind: 'table', zone: 'stock' },
				cards: [{ rank: '3' }]
			},
			{ type: 'set_phase', phase: 'play' },
			{
				type: 'zone_move',
				actorId: 'alice',
				from: { kind: 'table', zone: 'stock' },
				to: { kind: 'player', playerId: 'alice', zone: 'hand' },
				cards: [{ rank: '2' }]
			},
			{
				type: 'zone_move',
				actorId: 'alice',
				from: { kind: 'table', zone: 'stock' },
				to: { kind: 'player', playerId: 'alice', zone: 'hand' },
				cards: [{ rank: '3' }]
			}
		];

		const state = deriveGameState(events, rules);

		expect(state.validationIssues?.map((issue) => issue.code)).toContain('draw_requires_resolution');
		expect(state.playerZones.alice.hand).toEqual([{ rank: 'A' }, { rank: '2' }]);
	});

	it('zone_move_draw_policy_blocks_resolve_before_draw', () => {
		const rules = createGameplayRulePack({
			handZoneName: 'hand',
			startingPhase: 'play',
			zoneMovePolicy: {
				allowedPhases: ['deal', 'play'],
				actorMustBeCurrentPlayer: false,
				sourceMustBelongToActor: false,
				sourceZoneAllowlist: ['hand', 'stock', 'discard'],
				targetZoneAllowlist: ['hand', 'stock', 'discard'],
				minCards: 1,
				maxCards: 1
			},
			turnActionPolicy: {
				enabled: true,
				allowedPhases: ['play'],
				drawFromZoneAllowlist: ['stock', 'discard'],
				resolveToZoneAllowlist: ['discard'],
				requireDrawBeforeResolve: true,
				requireResolveAfterDraw: true
			}
		});

		const events: GameEvent[] = [
			{ type: 'init_game', players: ['alice', 'bob'], dealerIndex: 0 },
			{ type: 'deal_cards', playerId: 'alice', cards: [{ rank: 'A' }] },
			{
				type: 'zone_move',
				actorId: 'alice',
				from: { kind: 'player', playerId: 'alice', zone: 'hand' },
				to: { kind: 'table', zone: 'discard' },
				cards: [{ rank: 'A' }]
			}
		];

		const state = deriveGameState(events, rules);

		expect(state.validationIssues?.map((issue) => issue.code)).toContain('resolve_requires_draw');
		expect(state.playerZones.alice.hand).toEqual([{ rank: 'A' }]);
		expect(state.tableZones.discard ?? []).toEqual([]);
	});

	it('zone_move_matches_by_cid_when_tags_change', () => {
		const rules = createGameplayRulePack({
			handZoneName: 'hand',
			startingPhase: 'play',
			zoneMovePolicy: {
				allowedPhases: ['play'],
				actorMustBeCurrentPlayer: false,
				sourceMustBelongToActor: false,
				sourceZoneAllowlist: ['hand', 'discard'],
				targetZoneAllowlist: ['hand', 'discard'],
				minCards: 1,
				maxCards: 1
			}
		});

		const events: GameEvent[] = [
			{ type: 'init_game', players: ['alice', 'bob'], dealerIndex: 0 },
			{
				type: 'deal_cards',
				playerId: 'alice',
				cards: [{ rank: 'A', suit: 'spades', tags: ['cid:a1', 'face:down'] }]
			},
			{
				type: 'zone_move',
				actorId: 'alice',
				from: { kind: 'player', playerId: 'alice', zone: 'hand' },
				to: { kind: 'table', zone: 'discard' },
				cards: [{ rank: 'A', suit: 'spades', tags: ['cid:a1', 'face:up'] }]
			}
		];

		const state = deriveGameState(events, rules);

		expect(state.validationIssues).toBeUndefined();
		expect(state.playerZones.alice.hand).toEqual([]);
		expect(state.tableZones.discard).toEqual([{ rank: 'A', suit: 'spades', tags: ['cid:a1', 'face:up'] }]);
	});

	it('zone_move_draw_policy_rejects_non_contiguous_top_run_pickup', () => {
		const rules = createGameplayRulePack({
			handZoneName: 'hand',
			startingPhase: 'play',
			zoneMovePolicy: {
				allowedPhases: ['deal', 'play'],
				actorMustBeCurrentPlayer: false,
				sourceMustBelongToActor: false,
				sourceZoneAllowlist: ['hand', 'stock', 'discard'],
				targetZoneAllowlist: ['hand', 'stock', 'discard', 'meld'],
				minCards: 1
			},
			turnActionPolicy: {
				enabled: true,
				allowedPhases: ['play'],
				drawFromZoneAllowlist: ['stock', 'discard'],
				resolveToZoneAllowlist: ['discard', 'meld'],
				requireDrawBeforeResolve: true,
				requireResolveAfterDraw: true,
				drawSourcePolicies: [
					{ zoneId: 'stock', minCards: 1, maxCards: 1 },
					{
						zoneId: 'discard',
						minCards: 1,
						requireContiguousFromTop: true,
						requireResolveIncludesAnchor: true
					}
				]
			}
		});

		const events: GameEvent[] = [
			{ type: 'init_game', players: ['alice', 'bob'], dealerIndex: 0 },
			{ type: 'set_phase', phase: 'deal' },
			{
				type: 'deal_cards',
				playerId: 'alice',
				cards: [
					{ rank: 'A', suit: 'spades', tags: ['cid:a'] },
					{ rank: '2', suit: 'spades', tags: ['cid:b'] },
					{ rank: '3', suit: 'spades', tags: ['cid:c'] },
					{ rank: '4', suit: 'spades', tags: ['cid:d'] }
				]
			},
			{
				type: 'zone_move',
				actorId: 'alice',
				from: { kind: 'player', playerId: 'alice', zone: 'hand' },
				to: { kind: 'table', zone: 'discard' },
				cards: [{ rank: 'A', suit: 'spades', tags: ['cid:a'] }]
			},
			{
				type: 'zone_move',
				actorId: 'alice',
				from: { kind: 'player', playerId: 'alice', zone: 'hand' },
				to: { kind: 'table', zone: 'discard' },
				cards: [{ rank: '2', suit: 'spades', tags: ['cid:b'] }]
			},
			{
				type: 'zone_move',
				actorId: 'alice',
				from: { kind: 'player', playerId: 'alice', zone: 'hand' },
				to: { kind: 'table', zone: 'discard' },
				cards: [{ rank: '3', suit: 'spades', tags: ['cid:c'] }]
			},
			{ type: 'set_phase', phase: 'play' },
			{
				type: 'zone_move',
				actorId: 'alice',
				from: { kind: 'table', zone: 'discard' },
				to: { kind: 'player', playerId: 'alice', zone: 'hand' },
				cards: [
					{ rank: 'A', suit: 'spades', tags: ['cid:a'] },
					{ rank: '3', suit: 'spades', tags: ['cid:c'] }
				]
			}
		];

		const state = deriveGameState(events, rules);

		expect(state.validationIssues?.map((issue) => issue.code)).toContain('draw_batch_not_contiguous_top_run');
		expect(state.tableZones.discard).toEqual([
			{ rank: 'A', suit: 'spades', tags: ['cid:a'] },
			{ rank: '2', suit: 'spades', tags: ['cid:b'] },
			{ rank: '3', suit: 'spades', tags: ['cid:c'] }
		]);
	});

	it('zone_move_draw_policy_requires_resolve_to_include_discard_pick_anchor', () => {
		const rules = createGameplayRulePack({
			handZoneName: 'hand',
			startingPhase: 'play',
			zoneMovePolicy: {
				allowedPhases: ['deal', 'play'],
				actorMustBeCurrentPlayer: false,
				sourceMustBelongToActor: false,
				sourceZoneAllowlist: ['hand', 'stock', 'discard'],
				targetZoneAllowlist: ['hand', 'stock', 'discard', 'meld'],
				minCards: 1
			},
			turnActionPolicy: {
				enabled: true,
				allowedPhases: ['play'],
				drawFromZoneAllowlist: ['stock', 'discard'],
				resolveToZoneAllowlist: ['discard', 'meld'],
				requireDrawBeforeResolve: true,
				requireResolveAfterDraw: true,
				drawSourcePolicies: [
					{ zoneId: 'stock', minCards: 1, maxCards: 1 },
					{
						zoneId: 'discard',
						minCards: 1,
						requireContiguousFromTop: true,
						requireResolveIncludesAnchor: true
					}
				]
			}
		});

		const events: GameEvent[] = [
			{ type: 'init_game', players: ['alice', 'bob'], dealerIndex: 0 },
			{ type: 'set_phase', phase: 'deal' },
			{
				type: 'deal_cards',
				playerId: 'alice',
				cards: [
					{ rank: 'A', suit: 'spades', tags: ['cid:a'] },
					{ rank: '2', suit: 'spades', tags: ['cid:b'] },
					{ rank: '3', suit: 'spades', tags: ['cid:c'] },
					{ rank: '4', suit: 'spades', tags: ['cid:d'] },
					{ rank: '5', suit: 'spades', tags: ['cid:e'] }
				]
			},
			{
				type: 'zone_move',
				actorId: 'alice',
				from: { kind: 'player', playerId: 'alice', zone: 'hand' },
				to: { kind: 'table', zone: 'discard' },
				cards: [{ rank: 'A', suit: 'spades', tags: ['cid:a'] }]
			},
			{
				type: 'zone_move',
				actorId: 'alice',
				from: { kind: 'player', playerId: 'alice', zone: 'hand' },
				to: { kind: 'table', zone: 'discard' },
				cards: [{ rank: '2', suit: 'spades', tags: ['cid:b'] }]
			},
			{
				type: 'zone_move',
				actorId: 'alice',
				from: { kind: 'player', playerId: 'alice', zone: 'hand' },
				to: { kind: 'table', zone: 'discard' },
				cards: [{ rank: '3', suit: 'spades', tags: ['cid:c'] }]
			},
			{ type: 'set_phase', phase: 'play' },
			{
				type: 'zone_move',
				actorId: 'alice',
				from: { kind: 'table', zone: 'discard' },
				to: { kind: 'player', playerId: 'alice', zone: 'hand' },
				cards: [
					{ rank: '2', suit: 'spades', tags: ['cid:b'] },
					{ rank: '3', suit: 'spades', tags: ['cid:c'] }
				]
			},
			{
				type: 'zone_move',
				actorId: 'alice',
				from: { kind: 'player', playerId: 'alice', zone: 'hand' },
				to: { kind: 'table', zone: 'meld' },
				cards: [{ rank: '4', suit: 'spades', tags: ['cid:d'] }]
			},
			{
				type: 'zone_move',
				actorId: 'alice',
				from: { kind: 'player', playerId: 'alice', zone: 'hand' },
				to: { kind: 'table', zone: 'meld' },
				cards: [{ rank: '2', suit: 'spades', tags: ['cid:b'] }]
			}
		];

		const state = deriveGameState(events, rules);

		expect(state.validationIssues?.map((issue) => issue.code)).toContain('resolve_missing_draw_anchor');
		expect(state.tableZones.meld).toEqual([{ rank: '2', suit: 'spades', tags: ['cid:b'] }]);
		expect(state.turnActionState?.pendingDrawByPlayer?.alice).toBe(false);
	});

	it('zone_move_draw_policy_can_require_anchor_resolve_target_zones', () => {
		const rules = createGameplayRulePack({
			handZoneName: 'hand',
			startingPhase: 'play',
			zoneMovePolicy: {
				allowedPhases: ['deal', 'play'],
				actorMustBeCurrentPlayer: false,
				sourceMustBelongToActor: false,
				sourceZoneAllowlist: ['hand', 'stock', 'discard'],
				targetZoneAllowlist: ['hand', 'stock', 'discard', 'meld'],
				minCards: 1
			},
			turnActionPolicy: {
				enabled: true,
				allowedPhases: ['play'],
				drawFromZoneAllowlist: ['stock', 'discard'],
				resolveToZoneAllowlist: ['discard', 'meld'],
				requireDrawBeforeResolve: true,
				requireResolveAfterDraw: true,
				drawSourcePolicies: [
					{
						zoneId: 'discard',
						minCards: 1,
						requireContiguousFromTop: true,
						requireResolveIncludesAnchor: true,
						requiredResolveTargetZoneAllowlist: ['meld']
					}
				]
			}
		});

		const events: GameEvent[] = [
			{ type: 'init_game', players: ['alice', 'bob'], dealerIndex: 0 },
			{ type: 'set_phase', phase: 'deal' },
			{
				type: 'deal_cards',
				playerId: 'alice',
				cards: [
					{ rank: 'A', suit: 'spades', tags: ['cid:a'] },
					{ rank: '2', suit: 'spades', tags: ['cid:b'] },
					{ rank: '3', suit: 'spades', tags: ['cid:c'] },
					{ rank: '4', suit: 'spades', tags: ['cid:d'] }
				]
			},
			{
				type: 'zone_move',
				actorId: 'alice',
				from: { kind: 'player', playerId: 'alice', zone: 'hand' },
				to: { kind: 'table', zone: 'discard' },
				cards: [{ rank: 'A', suit: 'spades', tags: ['cid:a'] }]
			},
			{
				type: 'zone_move',
				actorId: 'alice',
				from: { kind: 'player', playerId: 'alice', zone: 'hand' },
				to: { kind: 'table', zone: 'discard' },
				cards: [{ rank: '2', suit: 'spades', tags: ['cid:b'] }]
			},
			{
				type: 'zone_move',
				actorId: 'alice',
				from: { kind: 'player', playerId: 'alice', zone: 'hand' },
				to: { kind: 'table', zone: 'discard' },
				cards: [{ rank: '3', suit: 'spades', tags: ['cid:c'] }]
			},
			{ type: 'set_phase', phase: 'play' },
			{
				type: 'zone_move',
				actorId: 'alice',
				from: { kind: 'table', zone: 'discard' },
				to: { kind: 'player', playerId: 'alice', zone: 'hand' },
				cards: [
					{ rank: '2', suit: 'spades', tags: ['cid:b'] },
					{ rank: '3', suit: 'spades', tags: ['cid:c'] }
				]
			},
			{
				type: 'zone_move',
				actorId: 'alice',
				from: { kind: 'player', playerId: 'alice', zone: 'hand' },
				to: { kind: 'table', zone: 'discard' },
				cards: [{ rank: '2', suit: 'spades', tags: ['cid:b'] }]
			},
			{
				type: 'zone_move',
				actorId: 'alice',
				from: { kind: 'player', playerId: 'alice', zone: 'hand' },
				to: { kind: 'table', zone: 'meld' },
				cards: [{ rank: '2', suit: 'spades', tags: ['cid:b'] }]
			}
		];

		const state = deriveGameState(events, rules);

		expect(state.validationIssues?.map((issue) => issue.code)).toContain('resolve_anchor_requires_target_zone');
		expect(state.tableZones.meld).toEqual([{ rank: '2', suit: 'spades', tags: ['cid:b'] }]);
		expect(state.turnActionState?.pendingDrawByPlayer?.alice).toBe(false);
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

	it('zone_move_can_enforce_validator_pack', () => {
		const events: GameEvent[] = [
			{ type: 'init_game', players: ['alice', 'bob'], dealerIndex: 0 },
			{ type: 'set_phase', phase: 'play' },
			{
				type: 'deal_cards',
				playerId: 'alice',
				cards: [{ rank: '9' }]
			},
			{
				type: 'zone_move',
				actorId: 'alice',
				from: { kind: 'player', playerId: 'alice', zone: 'hand' },
				to: { kind: 'table', zone: 'meld' },
				cards: [{ rank: '9' }]
			}
		];

		const validatorPack = createValidatorRulePack({
			canPlay: [
				{
					id: 'meld-must-be-set',
					predicate: { actionTypes: ['meld'] },
					match: { kind: 'all_same_rank', minCards: 2 },
					failureCode: 'invalid_meld'
				}
			],
			requireRules: true
		});

		const state = deriveGameState(events, createGameplayRulePack({ startingPhase: 'play' }), {
			playValidation: {
				rulePack: validatorPack,
				zoneMoveActionType: 'meld'
			}
		});

		expect(state.validationIssues?.some((issue) => issue.code === 'play_validation_failed')).toBe(true);
		expect(state.playerZones.alice.hand).toEqual([{ rank: '9' }]);
		expect(state.tableZones.meld).toEqual([]);
	});
});
