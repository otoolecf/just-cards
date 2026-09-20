import { describe, expect, it } from 'vitest';
import { createRoom, updateRoom, viewRoom } from './room-service';
import { familyRulesets } from '../rulesets/family-presets';

function startedRoom() {
	let room = createRoom('ABCD1234', 'Host', 'host', familyRulesets()[0].bundle);
	room = updateRoom(room, { type: 'join', name: 'Guest' }, 'guest');
	return updateRoom(room, { type: 'start', revision: room.revision, requestId: 'start' }, 'host');
}

describe('closing shared rooms', () => {
	it('requires the host and current revision without mutating the game', () => {
		const room = startedRoom();
		const before = structuredClone(room);
		const input = { type: 'end_game' as const, revision: room.revision, requestId: 'end' };
		expect(() => updateRoom(room, input, 'guest')).toThrow(/host/i);
		expect(() => updateRoom(room, { ...input, revision: 0 }, 'host')).toThrow(/changed/i);
		expect(room).toEqual(before);
	});

	it('persists closure idempotently without scoring unfinished hands or revealing them', () => {
		const room = startedRoom();
		const before = viewRoom(room, 'host');
		const input = { type: 'end_game' as const, revision: room.revision, requestId: 'end' };
		const closed = updateRoom(room, input, 'host');
		expect(updateRoom(closed, input, 'host')).toEqual(closed);
		const view = viewRoom(JSON.parse(JSON.stringify(closed)), 'host');
		expect(view.closed).toBe(true);
		expect(view.table).toEqual(before.table);
		expect(view.revision).toBe(before.revision + 1);
		expect(viewRoom(closed, 'outsider').table).toBeNull();
		for (const type of ['start', 'next_round', 'new_game', 'leave'] as const) {
			expect(() =>
				updateRoom(closed, { type, revision: closed.revision, requestId: `after-${type}` }, 'host')
			).toThrow(/ended/i);
		}
		expect(() => updateRoom(closed, { type: 'join', name: 'New' }, 'new')).toThrow(/ended/i);
		expect(() =>
			updateRoom(
				closed,
				{
					type: 'command',
					command: { type: 'reveal', slot: 0 },
					revision: closed.revision,
					requestId: 'reveal'
				},
				'guest'
			)
		).toThrow(/ended/i);
	});

	it('can close a single-seat lobby without dealing', () => {
		const room = createRoom('ABCD1234', 'Host', 'host', familyRulesets()[0].bundle);
		const closed = updateRoom(room, { type: 'end_game', revision: 0, requestId: 'end' }, 'host');
		expect(viewRoom(closed, 'host')).toMatchObject({ closed: true, started: false, table: null });
	});
});
