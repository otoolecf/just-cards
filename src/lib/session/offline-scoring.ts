import {
	createRulePack,
	deriveState,
	type ScoreEvent,
} from '$lib/scorekeeper/engine';
import type {
	SessionConfigPayload,
	SessionStateView,
	SessionEventRecord,
} from './score-session-api';

type Storage = Pick<
	globalThis.Storage,
	'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'
>;
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
interface Pending {
	id: string;
	event: ScoreEvent;
	createdAt: string;
}
interface CachedScore {
	version: 1;
	base: SessionStateView;
	config: SessionConfigPayload;
	createdOnServer: boolean;
	pending: Pending[];
	status: NonNullable<SessionStateView['sync']>['status'];
	message?: string;
}
const prefix = 'jc-offline-score-v1:';
class HttpError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}

/** Device snapshots and an append-only outbox. Never merge an undo across a changed prefix. */
export function createOfflineScoreClient(
	storage: Storage,
	request: Fetch = fetch,
) {
	const read = (id: string): CachedScore | undefined => {
		const raw = storage.getItem(prefix + id);
		if (!raw) return;
		const record = JSON.parse(raw) as CachedScore;
		if (record.version !== 1 || record.base.sessionId !== id)
			throw new Error('Unsupported saved score data');
		return record;
	};
	const save = (c: CachedScore) => {
		try {
			storage.setItem(prefix + c.base.sessionId, JSON.stringify(c));
		} catch {
			throw new Error(
				'Device storage is full or unavailable. Your score was not saved.',
			);
		}
	};
	const view = (c: CachedScore): SessionStateView => {
		const events: SessionEventRecord[] = [
			...c.base.events,
			...c.pending.map((p) => ({
				id: p.id,
				requestId: p.id,
				source: 'scorekeeper' as const,
				createdAt: p.createdAt,
				sourcePayload: p.event,
				scoreEvent: p.event,
			})),
		];
		const state = deriveState(
			events.map((e) => e.scoreEvent),
			c.config.scoreRulePack ?? createRulePack(),
			{ trace: c.config.trace === true },
		);
		if (state.validationIssues?.length)
			throw new Error(state.validationIssues.map((i) => i.message).join(' '));
		if (Object.values(state.totalsByTarget).some((n) => !Number.isFinite(n)))
			throw new Error('Score totals must be finite numbers');
		return {
			...c.base,
			config: c.config,
			events,
			eventCount: events.length,
			state,
			sync: { status: c.status, pending: c.pending.length, message: c.message },
		};
	};
	const json = async <T>(url: string, body?: unknown): Promise<T> => {
		const response = await request(url, {
			method: body === undefined ? 'GET' : 'POST',
			cache: 'no-store',
			signal: AbortSignal.timeout(8000),
			...(body === undefined
				? {}
				: {
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify(body),
					}),
		});
		const data = await response.json();
		if (!response.ok)
			throw new HttpError(
				response.status,
				(data as { error?: string })?.error ?? 'Unable to sync scores',
			);
		return data as T;
	};
	const sync = async (c: CachedScore): Promise<SessionStateView> => {
		// Persist each acknowledgement before sending the next event; retries retain IDs.
		try {
			if (!c.createdOnServer) {
				await json('/api/sessions', {
					sessionId: c.base.sessionId,
					config: c.config,
				});
				c.createdOnServer = true;
				save(c);
			}
			if (c.pending.length) {
				// The server checks the expected count atomically, including on lost-response retries.
				// Do not absorb remote events into the local prefix until the whole outbox is sent.
				while (c.pending.length) {
					const p = c.pending[0];
					const last = await json<SessionStateView>(
						`/api/sessions/${encodeURIComponent(c.base.sessionId)}`,
						{
							scoreEvent: p.event,
							requestId: p.id,
							expectedEventCount: c.base.eventCount,
						},
					);
					const acknowledged = last.events[c.base.eventCount];
					if (acknowledged?.requestId !== p.id)
						throw new HttpError(
							409,
							'Scores changed on another device. Your offline scores are safe on this device.',
						);
					c.base = {
						...last,
						events: last.events.slice(0, c.base.eventCount + 1),
						eventCount: c.base.eventCount + 1,
					};
					c.pending.shift();
					save(c);
				}
			}
			c.base = await json<SessionStateView>(
				`/api/sessions/${encodeURIComponent(c.base.sessionId)}`,
			);
			c.config = { ...c.config, ...c.base.config };
			c.status = 'synced';
			delete c.message;
		} catch (e) {
			// Persistence errors must reach the caller; never claim that an unsaved edit succeeded.
			if (e instanceof Error && e.message.startsWith('Device storage')) throw e;
			if (e instanceof HttpError) {
				c.status = e.status === 409 ? 'conflict' : 'error';
				c.message = e.message;
			} else {
				c.status = 'offline';
				c.message = 'Saved on this device. Scores will sync when connected.';
			}
		}
		save(c);
		return view(c);
	};
	const make = (
		config: SessionConfigPayload,
		events: ScoreEvent[] = [],
	): CachedScore => {
		const now = new Date().toISOString(),
			id = `sess-${crypto.randomUUID()}`;
		return {
			version: 1,
			base: {
				sessionId: id,
				createdAt: now,
				updatedAt: now,
				eventCount: 0,
				config,
				state: { totalsByPlayer: {}, totalsByTarget: {} },
				events: [],
			},
			config,
			createdOnServer: false,
			pending: events.map((event) => ({
				id: crypto.randomUUID(),
				event,
				createdAt: now,
			})),
			status: 'offline',
		};
	};
	return {
		async create(config: SessionConfigPayload = {}) {
			const c = make(config);
			view(c);
			save(c);
			return sync(c);
		},
		async get(id: string) {
			const c = read(id);
			if (c) return sync(c);
			const base = await json<SessionStateView>(
				`/api/sessions/${encodeURIComponent(id)}`,
			);
			const added: CachedScore = {
				version: 1,
				base,
				config: base.config,
				createdOnServer: true,
				pending: [],
				status: 'synced',
			};
			save(added);
			return view(added);
		},
		async post(id: string, event: ScoreEvent) {
			const c = read(id);
			if (!c)
				throw new Error(
					'Open this score session online before using it offline.',
				);
			if (
				![
					'add_mahjong',
					'add_contract',
					'add_round',
					'add_pattern_round',
					'add_delta',
					'settle_pool',
					'undo',
					'redo',
				].includes(event.type)
			)
				throw new Error('Invalid score event');
			c.pending.push({
				id: crypto.randomUUID(),
				event: structuredClone(event),
				createdAt: new Date().toISOString(),
			});
			view(c);
			save(c);
			return sync(c);
		},
		async fork(id: string) {
			const original = read(id);
			if (!original) throw new Error('No saved session');
			const c = make(
				original.config,
				view(original).events.map((e) => e.scoreEvent),
			);
			view(c);
			save(c);
			// Keep the old conflict intact: neither branch is discarded as a side effect.
			return sync(c);
		},
		list() {
			const items: SessionStateView[] = [];
			for (let i = 0; i < storage.length; i++) {
				const key = storage.key(i);
				if (key?.startsWith(prefix)) {
					const c = read(key.slice(prefix.length));
					if (c) items.push(view(c));
				}
			}
			return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
		},
	};
}
