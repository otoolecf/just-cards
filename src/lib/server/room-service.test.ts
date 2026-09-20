import { describe, expect, it } from 'vitest';
import { createRoom, updateRoom, viewRoom } from './room-service';
import { familyRulesets } from '../rulesets/family-presets';

describe('authoritative shared rooms', () => {
	it('joins idempotently, binds commands to seats and rejects stale writes', () => {
		let room = createRoom(
			'ABCDEF',
			'Parent',
			'hash-parent',
			familyRulesets()[0].bundle
		);
		room = updateRoom(room, { type: 'join', name: 'Child' }, 'hash-child');
		expect(
			updateRoom(room, { type: 'join', name: 'Child' }, 'hash-child').revision
		).toBe(room.revision);
		expect(() =>
			updateRoom(
				room,
				{ type: 'start', revision: room.revision, requestId: 'start' },
				'hash-child'
			)
		).toThrow(/host/i);
		room = updateRoom(
			room,
			{ type: 'start', revision: room.revision, requestId: 'start' },
			'hash-parent'
		);
		const before = room.revision;
		room = updateRoom(
			room,
			{
				type: 'command',
				command: { type: 'reveal', slot: 0 },
				revision: before,
				requestId: 'reveal'
			},
			'hash-child'
		);
		expect(
			updateRoom(
				room,
				{
					type: 'command',
					command: { type: 'reveal', slot: 0 },
					revision: before,
					requestId: 'reveal'
				},
				'hash-child'
			).revision
		).toBe(room.revision);
		expect(() =>
			updateRoom(
				room,
				{
					type: 'command',
					command: { type: 'reveal', slot: 1 },
					revision: before,
					requestId: 'stale'
				},
				'hash-child'
			)
		).toThrow(/changed/i);
		expect(() =>
			updateRoom(
				room,
				{
					type: 'command',
					command: { type: 'reveal', slot: 1 },
					revision: room.revision,
					requestId: 'fake'
				},
				'fake'
			)
		).toThrow(/join/i);
		const view = viewRoom(room, 'hash-parent');
		expect(JSON.stringify(view)).not.toMatch(
			/hash-parent|hash-child|tokenHash|"deck"|"events"|"stock":/
		);
		expect(view.table?.hands[view.selfId!].every((c) => !c.rank)).toBe(true);
		expect(viewRoom(room, 'outsider').table).toBeNull();
		expect(viewRoom(JSON.parse(JSON.stringify(room)), 'hash-parent')).toEqual(
			view
		);
	});
	it('deals every built-in through the shared room contract', () => {
		for (const ruleset of familyRulesets()) {
			let room = createRoom('ROOM12', 'One', 'first', ruleset.bundle);
			for(let i=1;i<ruleset.bundle.runtimeRulePack.tableRules!.players.min;i++)room = updateRoom(room, { type: 'join', name: `Player ${i+1}` }, `seat-${i}`);
			room = updateRoom(
				room,
				{ type: 'start', revision: room.revision, requestId: 'start' },
				'first'
			);
			expect(viewRoom(room, 'first').table?.players).toHaveLength(ruleset.bundle.runtimeRulePack.tableRules!.players.min);
 expect(viewRoom(room,'first').table?.stockCount).toBeGreaterThanOrEqual(0);
		}
	});
});

it('lets a lobby host remove a seat and transfers hosting when the host leaves', () => {
	let room = createRoom('ABCD1234', 'One', 'one', familyRulesets()[0].bundle);
	room = updateRoom(room, { type: 'join', name: 'Two' }, 'two');
	room = updateRoom(room, { type: 'join', name: 'Three' }, 'three');
	const secondId = room.seats[1].id;
	expect(() => updateRoom(room, { type: 'remove_seat', seatId: secondId, revision: room.revision, requestId: 'remove' }, 'three')).toThrow(/host/i);
	room = updateRoom(room, { type: 'remove_seat', seatId: secondId, revision: room.revision, requestId: 'remove' }, 'one');
	expect(viewRoom(room, 'two').selfId).toBeNull();
	room = updateRoom(room, { type: 'leave', revision: room.revision, requestId: 'leave' }, 'one');
	expect(viewRoom(room, 'three').hostId).toBe(viewRoom(room, 'three').selfId);
});

it('starts a fresh rematch only after the complete game and keeps seats', () => {
	const bundle = familyRulesets()[0].bundle;
	bundle.runtimeRulePack.tableRules!.scoring.rounds = 1;
	let room = createRoom('ABCD1234', 'One', 'one', bundle);
	room = updateRoom(room, { type: 'join', name: 'Two' }, 'two');
	const action = (token: string, command: import('../gameplay/table-engine').TableCommand) => {
		room = updateRoom(room, { type: 'command', command, revision: room.revision, requestId: crypto.randomUUID() }, token);
	};
	room = updateRoom(room, { type: 'start', revision: room.revision, requestId: 'deal' }, 'one');
	expect(updateRoom(room, { type: 'leave', revision: room.revision, requestId: 'leave' }, 'two').paused).toBe(true);
	expect(() => updateRoom(room, { type: 'new_game', revision: room.revision, requestId: 'premature' }, 'one')).toThrow(/complete/i);
	for (const token of ['one', 'two']) for (const slot of [0, 1]) action(token, { type: 'reveal', slot });
	for (let slot = 2; slot < 6; slot++) {
		action('two', { type: 'draw', source: 'stock' }); action('two', { type: 'swap', slot });
		if (slot < 5) { action('one', { type: 'draw', source: 'stock' }); action('one', { type: 'discard' }); }
	}
	expect(viewRoom(room, 'one').table?.stage).toBe('game_end');
	const closed = updateRoom(room, { type: 'end_game', revision: room.revision, requestId: 'end-complete' }, 'one');
	expect(viewRoom(closed, 'one').table).toEqual(viewRoom(room, 'one').table);
	expect(viewRoom(closed, 'one').closed).toBe(true);
	room = updateRoom(room, { type: 'new_game', revision: room.revision, requestId: 'rematch' }, 'one');
	const view = viewRoom(room, 'one');
	expect(view.table?.round).toBe(1);
	expect(view.table?.scores).toEqual([]);
	expect(view.seats).toHaveLength(2);
});
