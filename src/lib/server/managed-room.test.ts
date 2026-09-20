import { describe, it, expect } from 'vitest';
import { ManagedRoom } from './managed-room';
import { familyRulesets } from '../rulesets/family-presets';
import {
	capacityPolicy,
	admitRoom,
	releaseRoom,
	emptyAdmission,
	type AdmissionClient,
} from './room-admission';
import type { RoomRecord, RoomView } from './room-service';
const token = 'a'.repeat(32),
	bundle = familyRulesets()[0].bundle;
function fixture(maxRooms = 1) {
	let now = 1000;
	const records = new Map<string, RoomRecord>(),
		ledger = emptyAdmission();
	const policy = { ...capacityPolicy(), maxRooms, lobbyMs: 100, idleMs: 200 };
	const admission: AdmissionClient = {
		async reserve(input) {
			return admitRoom(ledger, input, now, policy);
		},
		async release(code, lease) {
			releaseRoom(ledger, code, lease);
		},
	};
	const storage = {
		read: (code: string) => records.get(code),
		write: (code: string, fn: (old: RoomRecord | undefined) => RoomRecord) => {
			const r = fn(records.get(code));
			records.set(code, r);
			return r;
		},
	};
	const manager = new ManagedRoom(storage, admission, policy, () => now);
	const call = (code: string, body?: unknown, create = false) =>
		manager.request(
			new Request('https://test/api/rooms/' + code, {
				method: body ? 'POST' : 'GET',
				headers: { authorization: 'Bearer ' + token },
				...(body ? { body: JSON.stringify(body) } : {}),
			}),
			code,
			'client',
			create ? bundle : undefined,
		);
	return { call, records, ledger, setNow: (n: number) => (now = n) };
}
const action = (v: RoomView, type: string) => ({
	type,
	revision: v.revision,
	requestId: crypto.randomUUID(),
});
describe('managed room lifecycle', () => {
	it('rejects over-capacity creates atomically, and end immediately frees a slot', async () => {
		const f = fixture();
		const results = await Promise.all(
			['A', 'B', 'C'].map((c) => f.call(c, { name: 'Host' }, true)),
		);
		expect(results.map((r) => r.status)).toEqual([200, 503, 503]);
		expect(f.records.size).toBe(1);
		const view = (await results[0].json()) as RoomView;
		expect((await f.call('A', action(view, 'end_game'))).ok).toBe(true);
		expect((await f.call('B', { name: 'Host' }, true)).ok).toBe(true);
	});
	it('expires without renewal by GET, preserves state, and capacity-blocked resume stays paused', async () => {
		const f = fixture();
		await f.call('A', { name: 'Host' }, true);
		f.setNow(1099);
		await f.call('A');
		expect(f.ledger.leases.A.expiresAt).toBe(1100);
		f.setNow(1101);
		let view = (await (await f.call('A')).json()) as RoomView;
		expect(view.sleeping).toBe(true);
		expect(view.paused).toBe(true);
		expect(Object.keys(f.ledger.leases)).toHaveLength(0);
		await f.call('B', { name: 'Other' }, true);
		const before = structuredClone(f.records.get('A'));
		expect((await f.call('A', action(view, 'resume'))).status).toBe(503);
		expect(f.records.get('A')).toEqual(before);
		let other = (await (await f.call('B')).json()) as RoomView;
		await f.call('B', action(other, 'end_game'));
		expect((await f.call('A', action(view, 'resume'))).ok).toBe(true);
		view = (await (await f.call('A')).json()) as RoomView;
		expect(view.sleeping).toBe(false);
		expect(view.paused).toBe(false);
	});
	it('invalid and replayed actions do not extend idle time; failed creation does not leak slots', async () => {
		const f = fixture();
		expect((await f.call('A', { name: '' }, true)).status).toBe(400);
		expect(Object.keys(f.ledger.leases)).toHaveLength(0);
		let v = (await (
			await f.call('A', { name: 'Host' }, true)
		).json()) as RoomView;
		f.setNow(1020);
		const pause = action(v, 'pause');
		await f.call('A', pause);
		const expiry = f.ledger.leases.A.expiresAt;
		f.setNow(1040);
		expect((await f.call('A', pause)).ok).toBe(true);
		expect(f.ledger.leases.A.expiresAt).toBe(expiry);
		expect(
			(
				await f.call('A', {
					...pause,
					requestId: crypto.randomUUID(),
					type: 'start',
				})
			).ok,
		).toBe(false);
		expect(f.ledger.leases.A.expiresAt).toBe(expiry);
	});
});
