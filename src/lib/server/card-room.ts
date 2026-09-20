import { socketCloseCode } from './room-socket';
import { DurableObject } from 'cloudflare:workers';
import { sqlRoomStorage, type RoomStorage } from './room-storage';
import {
	credentialHash,
	viewRoom,
	activeSeats,
	pauseForDisconnected,
} from './room-service';
import { parseRoomSocketRequest } from './room-socket';
import { ManagedRoom, roomFinished } from './managed-room';
import { capacityPolicy } from './room-admission';
import type { RuntimeRulesetBundle } from '../rulesets/types';
import { handleScoreRequest, type ScoreRequest } from './score-api';
import type {
	SessionRepository,
	SessionRecord,
} from '../session/session-store';

export class CardRoom extends DurableObject<Env> {
	private store: RoomStorage;
	private manager: ManagedRoom;
	private scoreStore: SessionRepository;
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		ctx.setWebSocketAutoResponse(
			new WebSocketRequestResponsePair('ping', 'pong'),
		);
		ctx.storage.sql.exec(
			'CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, payload TEXT NOT NULL)',
		);
		ctx.storage.sql.exec(
			'CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, payload TEXT NOT NULL)',
		);
		this.scoreStore = {
			has: (id) =>
				ctx.storage.sql.exec('SELECT id FROM sessions WHERE id=?', id).toArray()
					.length > 0,
			get: (id) => {
				const row = ctx.storage.sql
					.exec<{
						payload: string;
					}>('SELECT payload FROM sessions WHERE id=?', id)
					.toArray()[0];
				return row ? (JSON.parse(row.payload) as SessionRecord) : undefined;
			},
			set: (id, record) => {
				ctx.storage.sql.exec(
					'INSERT INTO sessions(id,payload) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
					id,
					JSON.stringify(record),
				);
			},
		};
		ctx.storage.sql.exec(
			'CREATE TABLE IF NOT EXISTS room_presence (hash TEXT PRIMARY KEY, seen INTEGER NOT NULL)',
		);
		this.store = sqlRoomStorage({
			get: (code) =>
				ctx.storage.sql
					.exec<{
						payload: string;
					}>('SELECT payload FROM rooms WHERE code=?', code)
					.toArray()[0]?.payload,
			put: (code, payload) => {
				ctx.storage.sql.exec(
					'INSERT INTO rooms(code,payload) VALUES (?,?) ON CONFLICT(code) DO UPDATE SET payload=excluded.payload',
					code,
					payload,
				);
			},
			transaction: (fn) => ctx.storage.transactionSync(fn),
		});
		this.manager = new ManagedRoom(
			this.store,
			this.env.ROOM_ADMISSION.getByName('global'),
			capacityPolicy(this.env),
		);
	}
	async handleRoom(
		code: string,
		input: {
			method: string;
			authorization: string;
			body?: string;
			client?: string;
		},
		bundle?: RuntimeRulesetBundle,
	): Promise<Response> {
		const request = new Request('https://room.internal/', {
			method: input.method,
			headers: { authorization: input.authorization },
			...(input.body ? { body: input.body } : {}),
		});
		const response = await this.manager.request(
			request,
			code,
			input.client ?? 'unknown',
			bundle,
		);
		if (!response.ok) return response;
		const hash = await credentialHash(
			input.authorization.replace(/^Bearer /, ''),
		);
		const room = this.store.read(code);
		if (!room) return response;
		if (
			!room.activity?.suspended &&
			!roomFinished(room) &&
			activeSeats(room).some((s) => s.tokenHash === hash)
		) {
			this.touch(hash);
			await this.armPresenceCheck();
		}
		if (input.method === 'POST') this.broadcast(code);
		this.closeInactive(code);
		await this.armPresenceCheck();
		return Response.json(viewRoom(room, hash, this.onlineSeats(code)), {
			headers: response.headers,
		});
	}
	async fetch(request: Request): Promise<Response> {
		try {
			const { code, token } = parseRoomSocketRequest(request);
			const hash = await credentialHash(token);
			const room = await this.manager.run(() => this.manager.expire(code));
			if (room && (room.activity?.suspended || roomFinished(room)))
				return new Response(
					'This table is saved. Resume it before connecting.',
					{ status: 409 },
				);
			if (!room || !activeSeats(room).some((seat) => seat.tokenHash === hash))
				return new Response('Join this room first', { status: 403 });
			if (this.ctx.getWebSockets().length >= 64)
				return new Response('Too many connections', { status: 429 });
			const [client, server] = Object.values(new WebSocketPair());
			this.ctx.acceptWebSocket(server);
			server.serializeAttachment({ code, hash, openedAt: Date.now() });
			this.touch(hash);
			await this.armPresenceCheck();
			this.broadcast(code);
			return new Response(null, {
				status: 101,
				webSocket: client,
				headers: { 'sec-websocket-protocol': 'jc-room-v1' },
			});
		} catch {
			return new Response('Invalid room connection', { status: 400 });
		}
	}
	private broadcast(code: string): void {
		const room = this.store.read(code);
		if (!room) return;
		for (const socket of this.ctx.getWebSockets()) {
			const attachment = socket.deserializeAttachment() as {
				code: string;
				hash: string;
			} | null;
			if (attachment?.code !== code) continue;
			try {
				if (
					!activeSeats(room).some((seat) => seat.tokenHash === attachment.hash)
				) {
					socket.close(1008, 'Seat removed');
					continue;
				}
				socket.send(
					JSON.stringify({
						type: 'view',
						room: viewRoom(room, attachment.hash, this.onlineSeats(code)),
					}),
				);
			} catch {
				socket.close(1011, 'Reconnect to table');
			}
		}
	}
	webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
		// Commands go through the revision-checked HTTP API. Sockets only stream views.
		if (message !== 'ping') socket.close(1008, 'Unsupported message');
	}
	async webSocketClose(
		socket: WebSocket,
		code: number,
		reason: string,
	): Promise<void> {
		socket.close(socketCloseCode(code), reason);
		const a = socket.deserializeAttachment() as {
			code: string;
			hash: string;
		} | null;
		if (a) {
			this.touch(a.hash);
			await this.armPresenceCheck(15000);
			this.broadcast(a.code);
		}
	}
	async webSocketError(socket: WebSocket): Promise<void> {
		await this.webSocketClose(socket, 1011, 'Reconnect to table');
	}

	private touch(hash: string): void {
		this.ctx.storage.sql.exec(
			'INSERT INTO room_presence(hash,seen) VALUES(?,?) ON CONFLICT(hash) DO UPDATE SET seen=excluded.seen',
			hash,
			Date.now(),
		);
	}
	private onlineSeats(code: string): string[] {
		const room = this.store.read(code);
		if (!room) return [];
		const recent = new Set(
			this.ctx.storage.sql
				.exec<{ hash: string }>(
					'SELECT hash FROM room_presence WHERE seen>?',
					Date.now() - 15000,
				)
				.toArray()
				.map((r) => r.hash),
		);
		for (const ws of this.ctx.getWebSockets()) {
			const a = ws.deserializeAttachment() as {
				code: string;
				hash: string;
				openedAt?: number;
			} | null;
			if (
				a?.code === code &&
				ws.readyState === WebSocket.OPEN &&
				Date.now() -
					(this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ??
						a.openedAt ??
						Date.now()) <
					45000
			)
				recent.add(a.hash);
		}
		return activeSeats(room)
			.filter((s) => recent.has(s.tokenHash))
			.map((s) => s.id);
	}
	private closeInactive(code: string): void {
		const room = this.store.read(code);
		if (!room || (!room.activity?.suspended && !roomFinished(room))) return;
		for (const ws of this.ctx.getWebSockets()) {
			const a = ws.deserializeAttachment() as { code: string } | null;
			if (a?.code === code) ws.close(1000, 'Table saved');
		}
	}
	private async armPresenceCheck(delay = 60000): Promise<void> {
		const rows = this.ctx.storage.sql
			.exec<{ code: string }>('SELECT code FROM rooms')
			.toArray();
		const deadlines = rows.flatMap(({ code }) => {
			const room = this.store.read(code);
			return room?.activity && !room.activity.suspended && !roomFinished(room)
				? [room.activity.expiresAt]
				: [];
		});
		if (!deadlines.length) {
			await this.ctx.storage.deleteAlarm();
			return;
		}
		const next = Math.max(
			Date.now() + 1,
			Math.min(Date.now() + delay, ...deadlines),
		);
		const previous = await this.ctx.storage.getAlarm();
		if (previous === null || next < previous)
			await this.ctx.storage.setAlarm(next);
	}
	async alarm(): Promise<void> {
		await this.manager.run(async () => {
			for (const { code } of this.ctx.storage.sql
				.exec<{ code: string }>('SELECT code FROM rooms')
				.toArray()) {
				const before = this.store.read(code);
				const room = await this.manager.expire(code);
				if (!room) continue;
				let changed = before?.revision !== room.revision;
				if (!room.activity?.suspended && !roomFinished(room)) {
					const next = pauseForDisconnected(room, this.onlineSeats(code));
					if (next.revision !== room.revision) {
						this.store.write(code, () => next);
						changed = true;
					}
				}
				if (changed) this.broadcast(code);
				this.closeInactive(code);
			}
			await this.armPresenceCheck();
		});
	}

	handleScore(id: string, input: ScoreRequest): Response {
		return this.ctx.storage.transactionSync(() =>
			handleScoreRequest(id, input, this.scoreStore),
		);
	}
}
