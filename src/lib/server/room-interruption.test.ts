import { expect, it } from 'vitest';
import {
	createRoom,
	updateRoom,
	viewRoom,
	replayRoom,
	type RoomMutation,
	type RoomRecord,
} from './room-service';
import { familyRulesets } from '../rulesets/family-presets';
function fixture() {
	let room = createRoom('ROOM1234', 'Host', 'host', familyRulesets()[0].bundle);
	room = updateRoom(room, { type: 'join', name: 'Guest' }, 'guest');
	const act = (input: object, token = 'host') => {
		room = updateRoom(
			room,
			{
				...input,
				revision: room.revision,
				requestId: crypto.randomUUID(),
			} as RoomMutation,
			token,
		);
		return room;
	};
	act({ type: 'start' });
	return {
		act,
		get room() {
			return room;
		},
	};
}
it('pauses, retains hands when leaving, transfers host and resumes only when seats return', () => {
	const f = fixture(),
		before = replayRoom(f.room);
	f.act({ type: 'leave' }, 'host');
	expect(viewRoom(f.room, 'guest').paused).toBe(true);
	expect(viewRoom(f.room, 'guest').hostId).toBe(f.room.seats[1].id);
	expect(replayRoom(f.room)).toEqual(before);
	expect(() =>
		f.act({ type: 'command', command: { type: 'reveal', slot: 0 } }, 'guest'),
	).toThrow(/paused/i);
	expect(() => f.act({ type: 'resume' }, 'guest')).toThrow(
		/away|return|replace/i,
	);
	f.act({ type: 'return' }, 'host');
	f.act({ type: 'resume' }, 'guest');
	expect(viewRoom(f.room, 'host').paused).toBe(false);
	expect(() =>
		f.act({ type: 'transfer_host', seatId: f.room.seats[0].id }, 'host'),
	).toThrow(/host/i);
});
it('retracts the last play through replay, restoring scores and rejecting non-host undo', () => {
	const f = fixture(),
		before = replayRoom(f.room);
	f.act({ type: 'command', command: { type: 'reveal', slot: 0 } }, 'guest');
	expect(() => f.act({ type: 'undo' }, 'guest')).toThrow(/host/i);
	f.act({ type: 'undo' });
	expect(replayRoom(f.room)).toEqual(before);
	expect(() => f.act({ type: 'undo' })).toThrow(/nothing|latest/i);
	expect(f.room.events.some((e) => e.type === 'undo')).toBe(true);
});
it('consumes recovery hashes, revokes old seats, preserves cards, and retries claims idempotently', () => {
	const f = fixture(),
		before = replayRoom(f.room),
		guestId = f.room.seats[1].id;
	expect(() =>
		f.act({
			type: 'issue_recovery',
			seatId: guestId,
			recoveryHash: 'a'.repeat(64),
		}),
	).toThrow(/pause/i);
	f.act({ type: 'pause' });
	f.act({
		type: 'issue_recovery',
		seatId: guestId,
		recoveryHash: 'a'.repeat(64),
	});
	const claim = {
		type: 'recover',
		recoveryHash: 'a'.repeat(64),
		requestId: 'claim-id',
		name: 'Replacement',
	} as RoomMutation;
	const claimed = updateRoom(f.room, claim, 'new-device');
	expect(viewRoom(claimed, 'new-device').selfId).toBe(guestId);
	expect(viewRoom(claimed, 'guest').selfId).toBeNull();
	expect(replayRoom(claimed)).toEqual(before);
	expect(updateRoom(claimed, claim, 'new-device')).toEqual(claimed);
	expect(() => updateRoom(claimed, claim, 'thief')).toThrow(/invalid|used/i);
	expect(JSON.stringify(viewRoom(claimed, 'host'))).not.toContain(
		'recoveryHash',
	);
});
it('admits players between rounds without rewriting earlier deals or scores, including legacy rooms', () => {
	const f = fixture();
	expect(() => f.act({ type: 'join', name: 'New' }, 'new')).toThrow(
		/between|round/i,
	);
	for (const token of ['host', 'guest'])
		for (const slot of [0, 1])
			f.act({ type: 'command', command: { type: 'reveal', slot } }, token);
	for (let slot = 2; slot < 6; slot++) {
		f.act(
			{ type: 'command', command: { type: 'draw', source: 'stock' } },
			'guest',
		);
		f.act({ type: 'command', command: { type: 'swap', slot } }, 'guest');
		if (slot < 5) {
			f.act(
				{ type: 'command', command: { type: 'draw', source: 'stock' } },
				'host',
			);
			f.act({ type: 'command', command: { type: 'discard' } }, 'host');
		}
	}
	const prior = replayRoom(f.room)!;
	expect(prior.stage).toBe('round_end');
	const undone = updateRoom(
		f.room,
		{ type: 'undo', revision: f.room.revision, requestId: 'undo-score' },
		'host',
	);
	expect(replayRoom(undone)?.stage).toBe('play');
	expect(replayRoom(undone)?.scores).toHaveLength(0);
	const rescored = updateRoom(
		undone,
		{
			type: 'command',
			command: { type: 'swap', slot: 5 },
			revision: undone.revision,
			requestId: 'rescore',
		},
		'guest',
	);
	expect(replayRoom(rescored)).toEqual(prior);
	// Old rooms did not record the deal roster.
	const legacy = structuredClone(f.room);
	for (const e of legacy.events) if (e.type === 'deal') delete e.players;
	const joined = updateRoom(legacy, { type: 'join', name: 'New' }, 'new');
	expect(replayRoom(joined)).toEqual(prior);
	const next = updateRoom(
		joined,
		{ type: 'next_round', revision: joined.revision, requestId: 'next' },
		'host',
	);
	const removed = updateRoom(
		joined,
		{
			type: 'remove_seat',
			seatId: joined.seats[0].id,
			revision: joined.revision,
			requestId: 'remove-host',
		},
		'host',
	);
	const afterRemoval = updateRoom(
		removed,
		{
			type: 'next_round',
			revision: removed.revision,
			requestId: 'deal-after-removal',
		},
		'guest',
	);
	expect(
		replayRoom(afterRemoval)?.players[replayRoom(afterRemoval)!.dealer],
	).toBe(joined.seats[1].id);
	expect(viewRoom(afterRemoval, 'guest').pastSeats).toContainEqual({
		id: joined.seats[0].id,
		name: 'Host',
	});
	expect(viewRoom(afterRemoval, 'guest').table?.scores).toEqual(prior.scores);
	expect(replayRoom(next)?.players).toHaveLength(3);
	expect(replayRoom(next)?.scores).toEqual(prior.scores);
	expect(
		viewRoom(next, 'new').table?.totals[viewRoom(next, 'new').selfId!],
	).toBe(0);
	expect(() =>
		updateRoom(
			joined,
			{ type: 'undo', revision: joined.revision, requestId: 'undo' },
			'host',
		),
	).toThrow(/roster|latest|nothing/i);
	expect(replayRoom(JSON.parse(JSON.stringify(next)) as RoomRecord)).toEqual(
		replayRoom(next),
	);
});
it('pauses after a disconnect grace check, permits host takeover and requires returning seats', async () => {
	const { pauseForDisconnected } = await import('./room-service');
	const f = fixture();
	const guest = f.room.seats[1].id;
	const paused = pauseForDisconnected(f.room, [guest]);
	expect(paused.paused).toBe(true);
	expect(viewRoom(paused, 'guest').hostAbsent).toBe(true);
	const taken = updateRoom(
		paused,
		{ type: 'claim_host', revision: paused.revision, requestId: 'takeover' },
		'guest',
	);
	expect(viewRoom(taken, 'guest').hostId).toBe(guest);
	expect(pauseForDisconnected(taken, [guest])).toEqual(taken);
});

it('deals two decks for Palace and preserves partnership seats between Bridge hands',()=>{
 const preset=(id:string)=>familyRulesets().find(r=>r.id===id)!;
 let palace=createRoom('PALACE12','Host','host',preset('builtin-palace-family').bundle);
 for(const id of ['two','three'])palace=updateRoom(palace,{type:'join',name:id},id);
 palace=updateRoom(palace,{type:'start',revision:palace.revision,requestId:'start'},'host');expect(replayRoom(palace)!.stock).toHaveLength(77);
 let room=createRoom('BRIDGE12','North','n',preset('builtin-bridge').bundle);for(const id of ['e','s','w'])room=updateRoom(room,{type:'join',name:id},id);
 room=updateRoom(room,{type:'start',revision:room.revision,requestId:'start'},'n');
 for(const token of ['n','e','s','w'])room=updateRoom(room,{type:'command',command:{type:'contract_call',call:'pass'},revision:room.revision,requestId:crypto.randomUUID()},token);
 expect(replayRoom(room)!.stage).toBe('round_end');room=updateRoom(room,{type:'leave',revision:room.revision,requestId:'leave'},'e');
 expect(room.seats[1].active).not.toBe(false);expect(viewRoom(room,'e').paused).toBe(true);expect(viewRoom(room,'e').selfId).toBe(room.seats[1].id);
 expect(()=>updateRoom(room,{type:'join',name:'Replacement'},'new')).toThrow(/recovery/);
 room=updateRoom(room,{type:'return',revision:room.revision,requestId:'return'},'e');room=updateRoom(room,{type:'resume',revision:room.revision,requestId:'resume'},'n');
 room=updateRoom(room,{type:'next_round',revision:room.revision,requestId:'next'},'n');expect(replayRoom(room)!.turn).toBe(1);
});
