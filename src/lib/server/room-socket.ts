export function parseRoomSocketRequest(request: Request): { code: string; token: string } {
	const url = new URL(request.url);
	if (request.method !== 'GET' || request.headers.get('upgrade')?.toLowerCase() !== 'websocket')
		throw new Error('WebSocket upgrade required');
	if (request.headers.get('origin') !== url.origin) throw new Error('Invalid socket origin');
	const code = url.pathname.match(/^\/api\/rooms\/([A-F0-9]{8})\/socket$/)?.[1];
	if (!code) throw new Error('Invalid room code');
	const protocols = (request.headers.get('sec-websocket-protocol') ?? '')
		.split(',')
		.map((p) => p.trim());
	const token = protocols.find((p) => p.startsWith('seat.'))?.slice(5) ?? '';
	if (!protocols.includes('jc-room-v1') || !/^[a-zA-Z0-9-]{30,100}$/.test(token))
		throw new Error('Missing seat credential');
	return { code, token };
}

/** Event-only statuses (notably 1005/1006) cannot be sent in a close frame. */
export function socketCloseCode(code: number): number {
	return [1000, 1001, 1002, 1003, 1007, 1008, 1009, 1010, 1011, 1012, 1013, 1014].includes(code) ||
		(Number.isInteger(code) && code >= 3000 && code <= 4999)
		? code
		: 1000;
}
