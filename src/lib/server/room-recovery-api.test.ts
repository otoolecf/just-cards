import { expect, it } from 'vitest';
import { roomRequest } from './room-api';
import { sqlRoomStorage } from './room-storage';
import { familyRulesets } from '../rulesets/family-presets';
it('hashes recovery secrets before persistence, rotates links, and retries a lost claim response safely', async () => {
	const records = new Map<string, string>();
	const store = sqlRoomStorage({
		get: (k) => records.get(k),
		put: (k, v) => {
			records.set(k, v);
		},
		transaction: (fn) => fn(),
	});
	const host = crypto.randomUUID(),
		guest = crypto.randomUUID(),
		next = crypto.randomUUID(),
		oldSecret = crypto.randomUUID(),
		secret = crypto.randomUUID();
	async function send(
		token: string,
		input: object,
		bundle?: typeof familyRulesets extends () => Array<infer R>
			? R extends { bundle: infer B }
				? B
				: never
			: never,
	) {
		return roomRequest(
			new Request('https://test/', {
				method: 'POST',
				headers: { authorization: `Bearer ${token}` },
				body: JSON.stringify(input),
			}),
			'ROOM1234',
			store,
			bundle,
		);
	}
	const act = async (token: string, input: object) =>
		send(token, {
			...input,
			revision: store.read('ROOM1234')!.revision,
			requestId: crypto.randomUUID(),
		});
	await send(host, { name: 'Host' }, familyRulesets()[1].bundle);
	await send(guest, { type: 'join', name: 'Guest' });
	await act(host, { type: 'start' });
	await act(guest, { type: 'issue_recovery', recoveryToken: oldSecret });
	await act(guest, { type: 'issue_recovery', recoveryToken: secret });
	expect(records.get('ROOM1234')).not.toContain(secret);
	expect(records.get('ROOM1234')).not.toContain(oldSecret);
	expect(
		(
			await send(next, {
				type: 'recover',
				recoveryToken: oldSecret,
				requestId: 'old',
			})
		).ok,
	).toBe(false);
	const hash = store.read('ROOM1234')!.seats[1].recoveryHash;
	expect(
		(
			await send(next, {
				type: 'recover',
				recoveryHash: hash,
				requestId: 'bypass',
			})
		).ok,
	).toBe(false);
	const input = {
		type: 'recover',
		recoveryToken: secret,
		requestId: 'same-claim',
	};
	const first = await send(next, input);
	expect(first.ok).toBe(true);
	const result = await first.json();
	expect(await (await send(next, input)).json()).toEqual(result);
	const revoked = await roomRequest(
		new Request('https://test/', {
			headers: { authorization: `Bearer ${guest}` },
		}),
		'ROOM1234',
		store,
	);
	expect(await revoked.json()).toMatchObject({ selfId: null, table: null });
	expect(records.get('ROOM1234')).not.toContain(secret);
});
