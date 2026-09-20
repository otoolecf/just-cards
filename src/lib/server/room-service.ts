import { deckCountFor } from '../gameplay/table-rules';
import { canPlayRuleset } from '../rulesets/generation-report';
import type { RuntimeRulesetBundle } from '../rulesets/types';
import {
	applyTableCommand,
	createTable,
	projectTable,
	shuffledDeck,
	type TableCard,
	type TableCommand,
	type TableState,
	type TableView,
} from '../gameplay/table-engine';
import {
	cardValue,
	createRulePack,
	type CardRank,
	type RulePack,
} from '../scorekeeper/engine';
import { validateTableRules } from '../gameplay/table-rules';
interface RoomSeat {
	id: string;
	name: string;
	tokenHash: string;
	active?: boolean;
	away?: boolean;
	recoveryHash?: string;
}
type RoomEvent = { actor: string; requestId: string; input: string } & (
	| { type: 'deal'; deck: TableCard[]; players?: string[]; reset?: boolean }
	| { type: 'command'; command: TableCommand }
	| { type: 'undo'; targetIndex: number }
	| { type: 'control'; action: string }
	| { type: 'end_game' }
);
export interface RoomRecord {
	code: string;
	bundle: RuntimeRulesetBundle;
	seats: RoomSeat[];
	hostId?: string;
	paused?: boolean;
	pauseReason?: string;
	revision: number;
	events: RoomEvent[];
}
export type RoomMutation =
	| { type: 'join'; name: string }
	| {
			type: 'recover';
			recoveryToken?: string;
			recoveryHash?: string;
			requestId: string;
			name?: string;
	  }
	| ({ revision: number; requestId: string } & (
			| {
					type:
						| 'start'
						| 'next_round'
						| 'new_game'
						| 'end_game'
						| 'leave'
						| 'pause'
						| 'resume'
						| 'return'
						| 'undo'
						| 'claim_host';
			  }
			| { type: 'remove_seat' | 'transfer_host'; seatId: string }
			| {
					type: 'issue_recovery';
					seatId?: string;
					recoveryToken?: string;
					recoveryHash?: string;
			  }
			| { type: 'command'; command: TableCommand }
	  ));
export interface RoomView {
	code: string;
	name: string;
	revision: number;
	selfId: string | null;
	hostId: string;
	seats: {
		id: string;
		name: string;
		away: boolean;
		connection: 'online' | 'offline' | 'unknown';
	}[];
	pastSeats: { id: string; name: string }[];
	rules: NonNullable<RuntimeRulesetBundle['runtimeRulePack']['tableRules']>;
	table: TableView | null;
	started: boolean;
	closed: boolean;
	paused: boolean;
	pauseReason: string;
	canJoin: boolean;
	canUndo: boolean;
	hostAbsent: boolean;
	diagnostics: string[];
	cardValues: Record<string, number>;
}
export const activeSeats = (room: RoomRecord) =>
	room.seats.filter((s) => s.active !== false);
const host = (room: RoomRecord) =>
	room.hostId ?? activeSeats(room)[0]?.id ?? '';
const closed = (room: RoomRecord) =>
	room.events.some((e) => e.type === 'end_game');
const between = (state: TableState | null) =>
	!state || state.stage === 'round_end' || state.stage === 'game_end';
function nameValue(name: string): string {
	if (typeof name !== 'string' || !name.trim() || name.trim().length > 30)
		throw new Error('Enter a name from 1 to 30 characters');
	return name.trim();
}
function uniqueName(room: RoomRecord, name: string, except?: string): string {
	const value = nameValue(name);
	if (
		activeSeats(room).some(
			(s) => s.id !== except && s.name.toLowerCase() === value.toLowerCase(),
		)
	)
		throw new Error('That name is taken');
	return value;
}
export function createRoom(
	code: string,
	name: string,
	tokenHash: string,
	bundle: RuntimeRulesetBundle,
): RoomRecord {
	validateTableRules(bundle.runtimeRulePack.tableRules);
	if (!canPlayRuleset(bundle))
		throw new Error('Review this imported ruleset before creating a room.');
	return {
		code,
		bundle: structuredClone(bundle),
		seats: [{ id: crypto.randomUUID(), name: nameValue(name), tokenHash }],
		revision: 0,
		events: [],
	};
}
function freezeLegacyDeals(room: RoomRecord) {
	for (const e of room.events)
		if (e.type === 'deal' && !e.players)
			e.players = activeSeats(room).map((s) => s.id);
}
export function replayRoom(room: RoomRecord): TableState | null {
	let state: TableState | null = null;
	const undone = new Set(
		room.events.filter((e) => e.type === 'undo').map((e) => e.targetIndex),
	);
	for (const [index, e] of room.events.entries()) {
		if (e.type === 'deal')
			state = createTable(
				e.players ?? activeSeats(room).map((s) => s.id),
				room.bundle,
				e.deck,
				e.reset ? undefined : (state ?? undefined),
			);
		else if (e.type === 'command' && !undone.has(index)) {
			if (!state) throw new Error('Missing deal');
			state = applyTableCommand(state, e.actor, e.command, room.bundle);
		}
	}
	return state;
}
function undoIndex(room: RoomRecord): number {
	const undone = new Set(
		room.events.filter((e) => e.type === 'undo').map((e) => e.targetIndex),
	);
	for (let i = room.events.length - 1; i >= 0; i--) {
		const e = room.events[i];
		if (
			e.type === 'deal' ||
			e.type === 'end_game' ||
			(e.type === 'control' && e.action === 'roster')
		)
			return -1;
		if (e.type === 'command' && !undone.has(i)) return i;
	}
	return -1;
}
export function updateRoom(
	record: RoomRecord,
	input: RoomMutation,
	tokenHash: string,
): RoomRecord {
	const room = structuredClone(record);
	freezeLegacyDeals(room);
	const seat = activeSeats(room).find((s) => s.tokenHash === tokenHash);
	const state = replayRoom(room);
	if (input.type === 'join') {
		if (closed(room))
			throw new Error('This game has ended. Create a new room.');
		if (seat) return room;
		if (!between(state) || (state?.contract && !state.contract.rubber.finished))
			throw new Error(
				'New players can join between rounds. Use a private recovery link to replace a seat.',
			);
		if (
			activeSeats(room).length >=
			room.bundle.runtimeRulePack.tableRules!.players.max
		)
			throw new Error('Room is full');
		const added = {
			id: crypto.randomUUID(),
			name: uniqueName(room, input.name),
			tokenHash,
		};
		room.seats.push(added);
		room.events.push({
			type: 'control',
			action: 'roster',
			actor: added.id,
			requestId: crypto.randomUUID(),
			input: JSON.stringify(input),
		});
		room.revision++;
		return room;
	}
	if (
		typeof input.requestId !== 'string' ||
		!input.requestId ||
		input.requestId.length > 100
	)
		throw new Error('Missing request identifier');
	if (seat) {
		const previous = room.events.find(
			(e) => e.actor === seat.id && e.requestId === input.requestId,
		);
		if (previous) {
			if (previous.input !== JSON.stringify(input))
				throw new Error('Request identifier already used');
			return room;
		}
	}
	if (closed(room)) throw new Error('This game has ended. Create a new room.');
	if (input.type === 'recover') {
		if (seat)
			throw new Error(
				'This browser already has a seat. Use a different browser to replace another player.',
			);
		if (!input.recoveryHash || !/^[a-f0-9]{64}$/.test(input.recoveryHash))
			throw new Error('Invalid or already used private link');
		const target = activeSeats(room).find(
			(s) => s.recoveryHash === input.recoveryHash,
		);
		if (!target) throw new Error('Invalid or already used private link');
		if (input.name) target.name = uniqueName(room, input.name, target.id);
		target.tokenHash = tokenHash;
		target.away = false;
		delete target.recoveryHash;
		room.events.push({
			type: 'control',
			action: 'recover',
			actor: target.id,
			requestId: input.requestId,
			input: JSON.stringify(input),
		});
		room.revision++;
		return room;
	}
	if (!seat) throw new Error('Join this room first');
	if (input.revision !== room.revision)
		throw new Error('The table changed. Refresh and try again.');
	const requireHost = () => {
		if (seat.id !== host(room)) throw new Error('Only the host can do that');
	};
	const meta = {
		actor: seat.id,
		requestId: input.requestId,
		input: JSON.stringify(input),
	};
	let event: RoomEvent = { ...meta, type: 'control', action: input.type };
	switch (input.type) {
		case 'pause':
			room.paused = true;
			room.pauseReason = `Paused by ${seat.name}.`;
			break;
		case 'resume':
			requireHost();
			if (activeSeats(room).some((s) => s.away))
				throw new Error(
					'Wait for away players to return or replace their seats.',
				);
			room.paused = false;
			delete room.pauseReason;
			break;
		case 'return':
			seat.away = false;
			break;
		case 'transfer_host': {
			requireHost();
			const target = activeSeats(room).find(
				(s) => s.id === input.seatId && !s.away,
			);
			if (!target) throw new Error('Choose a player who is present');
			room.hostId = target.id;
			break;
		}
		case 'claim_host':
			if (
				!room.paused ||
				!activeSeats(room).find((s) => s.id === host(room))?.away
			)
				throw new Error('The host is still present');
			if (seat.away) throw new Error('Return to the table first');
			room.hostId = seat.id;
			break;
		case 'issue_recovery': {
			const target = activeSeats(room).find(
				(s) => s.id === (input.seatId ?? seat.id),
			);
			if (!target) throw new Error('Seat not found');
			if (target.id !== seat.id) {
				requireHost();
				if (!room.paused && !between(state))
					throw new Error('Pause the game before replacing a player');
			}
			if (!input.recoveryHash || !/^[a-f0-9]{64}$/.test(input.recoveryHash))
				throw new Error('Invalid private link');
			target.recoveryHash = input.recoveryHash;
			break;
		}
		case 'leave':
		case 'remove_seat': {
			if (input.type === 'remove_seat') requireHost();
			const targetId = input.type === 'remove_seat' ? input.seatId : seat.id;
			const target = activeSeats(room).find((s) => s.id === targetId);
			if (!target) throw new Error('Seat not found');
			if (!between(state) || (state?.contract && !state.contract.rubber.finished)) {
				target.away = true;
				room.paused = true;
				room.pauseReason = `${target.name} stepped away. Return or replace this seat to continue.`;
			} else {
				if (activeSeats(room).length === 1)
					throw new Error('Use Back to tables to keep this room for later.');
				target.active = false;
				target.tokenHash = '';
				delete target.recoveryHash;
				event = { ...meta, type: 'control', action: 'roster' };
			}
			if (target.id === host(room))
				room.hostId =
					activeSeats(room).find((s) => s.id !== target.id && !s.away)?.id ??
					target.id;
			break;
		}
		case 'undo': {
			requireHost();
			const index = undoIndex(room);
			if (index < 0)
				throw new Error(
					'Nothing to undo since the latest deal or roster change.',
				);
			event = { ...meta, type: 'undo', targetIndex: index };
			break;
		}
		case 'end_game':
			requireHost();
			event = { ...meta, type: 'end_game' };
			break;
		case 'start':
		case 'next_round':
		case 'new_game': {
			requireHost();
			if (room.paused) throw new Error('The game is paused');
			if (activeSeats(room).some((s) => s.away))
				throw new Error('Wait for players to return');
			if (input.type === 'start' && state) throw new Error('Already started');
			if (input.type === 'next_round' && state?.stage !== 'round_end')
				throw new Error('Finish this round first');
			if (input.type === 'new_game' && state?.stage !== 'game_end')
				throw new Error('Complete the game before a rematch');
			const players = activeSeats(room).map((s) => s.id),
 deck = shuffledDeck(deckCountFor(room.bundle.runtimeRulePack.tableRules!,players.length));
			createTable(
				players,
				room.bundle,
				deck,
				input.type === 'new_game' ? undefined : (state ?? undefined),
			);
			event = {
				...meta,
				type: 'deal',
				deck,
				players,
				...(input.type === 'new_game' ? { reset: true } : {}),
			};
			break;
		}
		case 'command':
			if (room.paused) throw new Error('The game is paused');
			if (seat.away) throw new Error('Return to the table first');
			if (!state) throw new Error('Wait for the host to deal');
			if (!input.command || typeof input.command !== 'object')
				throw new Error('Invalid command');
			applyTableCommand(state, seat.id, input.command, room.bundle);
			event = {
				...meta,
				type: 'command',
				command: structuredClone(input.command),
			};
			break;
		default:
			throw new Error('Unknown room action');
	}
	room.events.push(event);
	room.revision++;
	return room;
}
/** Invoked after a reconnect grace period by the room's presence alarm. */
export function pauseForDisconnected(
	record: RoomRecord,
	onlineIds: string[],
): RoomRecord {
	if (closed(record)) return record;
	const missing = activeSeats(record).filter(
		(s) => !s.away && !onlineIds.includes(s.id),
	);
	if (!missing.length) return record;
	const room = structuredClone(record);
	room.paused = true;
	room.pauseReason = `Waiting for ${missing.map((s) => s.name).join(', ')} to reconnect. Return to the table, then the host can resume.`;
	for (const s of room.seats)
		if (missing.some((m) => m.id === s.id)) s.away = true;
	room.events.push({
		type: 'control',
		action: 'disconnect_pause',
		actor: 'system',
		requestId: crypto.randomUUID(),
		input: '{}',
	});
	room.revision++;
	return room;
}
export function viewRoom(
	room: RoomRecord,
	tokenHash: string,
	onlineIds?: string[],
): RoomView {
	const self = activeSeats(room).find((s) => s.tokenHash === tokenHash),
		state = replayRoom(room);
	const visible = self && state ? projectTable(state, self.id) : null;
	// Keep departed players' totals visible in history without making them active players.
	if (visible)
		for (const s of room.seats)
			visible.totals[s.id] = state!.scores.reduce(
				(sum, round) => sum + (round[s.id] ?? 0),
				0,
			);
	return {
		code: room.code,
		name: room.bundle.displayName,
		revision: room.revision,
		selfId: self?.id ?? null,
		hostId: host(room),
		seats: activeSeats(room).map((s) => ({
			id: s.id,
			name: s.name,
			away: !!s.away,
			connection: onlineIds
				? onlineIds.includes(s.id)
					? 'online'
					: 'offline'
				: 'unknown',
		})),
		pastSeats: room.seats
			.filter((s) => s.active === false)
			.map((s) => ({ id: s.id, name: s.name })),
		rules: structuredClone(room.bundle.runtimeRulePack.tableRules!),
		table: visible,
		started: room.events.some((e) => e.type === 'deal'),
		closed: closed(room),
		paused: !!room.paused,
		pauseReason: room.pauseReason ?? '',
		canJoin:
			!closed(room) &&
			between(state) &&
 !(state?.contract && !state.contract.rubber.finished) &&
			activeSeats(room).length <
				room.bundle.runtimeRulePack.tableRules!.players.max,
		canUndo:
			!!self && self.id === host(room) && !closed(room) && undoIndex(room) >= 0,
		hostAbsent: !!activeSeats(room).find((s) => s.id === host(room))?.away,
		cardValues: Object.fromEntries(
			(
				[
					'A',
					'2',
					'3',
					'4',
					'5',
					'6',
					'7',
					'8',
					'9',
					'10',
					'J',
					'Q',
					'K',
				] as CardRank[]
			).map((rank) => [
				rank,
				cardValue(
					{ rank },
					(room.bundle.runtimeRulePack.scoreRulePack ??
						createRulePack()) as RulePack,
				),
			]),
		),
		diagnostics:
			room.bundle.explain?.diagnostics.filter((d) => room.bundle.runtimeRulePack.tableRules?.patience || room.bundle.runtimeRulePack.tableRules?.shedding || room.bundle.runtimeRulePack.tableRules?.contract || /default|convention|snapshot/i.test(d)) ?? [],
	};
}
export async function credentialHash(token: string): Promise<string> {
	if (!/^[a-zA-Z0-9-]{30,100}$/.test(token))
		throw new Error('Missing seat credential');
	return Array.from(
		new Uint8Array(
			await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)),
		),
		(b) => b.toString(16).padStart(2, '0'),
	).join('');
}
