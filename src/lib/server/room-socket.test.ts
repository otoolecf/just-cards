import { expect, it } from 'vitest';
import { parseRoomSocketRequest } from './room-socket';
it('authenticates socket upgrades through a subprotocol and rejects foreign origins', () => {
	const headers = {
		upgrade: 'websocket',
		origin: 'https://cards.example',
		'sec-websocket-protocol': 'jc-room-v1, seat.12345678-1234-1234-1234-123456789abc'
	};
	const req = (overrides = {}) =>
		new Request('https://cards.example/api/rooms/AB12CD34/socket', {
			headers: { ...headers, ...overrides }
		});
	expect(parseRoomSocketRequest(req())).toEqual({
		code: 'AB12CD34',
		token: '12345678-1234-1234-1234-123456789abc'
	});
	expect(() => parseRoomSocketRequest(req({ origin: 'https://stranger.example' }))).toThrow(
		/origin/i
	);
	expect(() => parseRoomSocketRequest(req({ 'sec-websocket-protocol': 'jc-room-v1' }))).toThrow(
		/credential/i
	);
	expect(() => parseRoomSocketRequest(req({ upgrade: '' }))).toThrow(/upgrade/i);
});

it('normalizes reserved disconnect statuses before sending a close frame', async () => {
	const { socketCloseCode } = await import('./room-socket');
	for (const code of [1005, 1006, 1015, 0, 2000]) expect(socketCloseCode(code)).toBe(1000);
	for (const code of [1000, 1001, 1008, 1011, 4000]) expect(socketCloseCode(code)).toBe(code);
});
