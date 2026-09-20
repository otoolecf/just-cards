import { describe, it, expect } from 'vitest';
import {
	admitRoom,
	releaseRoom,
	emptyAdmission,
	capacityPolicy,
} from './room-admission';
const policy = { ...capacityPolicy(), maxRooms: 2, creationsPerHour: 2 };
const input = (code: string, client = 'family') => ({
	code,
	lease: code + '-lease',
	expiresAt: 5000,
	client,
	creating: true,
});
describe('room admission ledger', () => {
	it('admits exactly the limit; renewal and retry do not consume another slot or rate allowance', () => {
		const s = emptyAdmission();
		expect(admitRoom(s, input('a'), 100, policy).ok).toBe(true);
		expect(admitRoom(s, input('b'), 100, policy).ok).toBe(true);
		expect(admitRoom(s, input('b'), 100, policy).ok).toBe(true);
		expect(
			admitRoom(
				s,
				{ ...input('a'), creating: false, expiresAt: 6000 },
				200,
				policy,
			).ok,
		).toBe(true);
		expect(admitRoom(s, input('c', 'other'), 200, policy)).toMatchObject({
			ok: false,
			status: 503,
		});
		expect(Object.keys(s.leases)).toHaveLength(2);
	});
	it('reclaims expired reservations and ignores a stale release after reacquisition', () => {
		const s = emptyAdmission();
		admitRoom(s, input('a'), 100, policy);
		expect(
			admitRoom(
				s,
				{ ...input('a'), lease: 'new', expiresAt: 9000, creating: false },
				5000,
				policy,
			).ok,
		).toBe(true);
		releaseRoom(s, 'a', 'a-lease');
		expect(s.leases.a.lease).toBe('new');
		releaseRoom(s, 'a', 'new');
		expect(s.leases.a).toBeUndefined();
	});
	it('keeps creation limits after release, expires them, and does not rate-limit resume', () => {
		const s = emptyAdmission();
		for (const code of ['a', 'b']) {
			admitRoom(s, input(code), 100, policy);
			releaseRoom(s, code, code + '-lease');
		}
		expect(admitRoom(s, input('c'), 101, policy)).toMatchObject({
			ok: false,
			status: 429,
		});
		expect(
			admitRoom(s, { ...input('a'), creating: false }, 101, policy).ok,
		).toBe(true);
		expect(
			admitRoom(s, { ...input('c'), expiresAt: 4000000 }, 3600101, policy).ok,
		).toBe(true);
	});
	it('rejects conflicting generations without renewing another room', () => {
		const s = emptyAdmission();
		admitRoom(s, input('a'), 100, policy);
		expect(
			admitRoom(
				s,
				{ ...input('a'), lease: 'imposter', expiresAt: 9000 },
				101,
				policy,
			).ok,
		).toBe(false);
		expect(s.leases.a.expiresAt).toBe(5000);
	});
});
