const SSE_HEADERS: Record<string, string> = {
	'content-type': 'text/event-stream; charset=utf-8',
	'cache-control': 'no-cache, no-transform',
	connection: 'keep-alive',
	'x-accel-buffering': 'no'
};

interface McpSseSession {
	sessionId: string;
	enqueue: (event: string, payload: unknown) => void;
	close: () => void;
}

const sessions = new Map<string, McpSseSession>();

function randomSessionId(): string {
	return `mcp-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function serializeSseEvent(event: string, payload: unknown): Uint8Array {
	const encoder = new TextEncoder();
	const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
	return encoder.encode(`event: ${event}\ndata: ${data}\n\n`);
}

export function openMcpSseSession(messagesEndpointBase: string): {
	sessionId: string;
	response: Response;
} {
	const sessionId = randomSessionId();
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const enqueue = (event: string, payload: unknown): void => {
				controller.enqueue(serializeSseEvent(event, payload));
			};
			const close = (): void => {
				sessions.delete(sessionId);
				controller.close();
			};

			sessions.set(sessionId, {
				sessionId,
				enqueue,
				close
			});

			enqueue('endpoint', `${messagesEndpointBase}?sessionId=${sessionId}`);
		},
		cancel() {
			sessions.delete(sessionId);
		}
	});

	return {
		sessionId,
		response: new Response(stream, {
			headers: SSE_HEADERS
		})
	};
}

export function sendMcpSseMessage(sessionId: string, payload: unknown): boolean {
	const session = sessions.get(sessionId);
	if (!session) {
		return false;
	}
	session.enqueue('message', payload);
	return true;
}

export function closeMcpSseSession(sessionId: string): void {
	const session = sessions.get(sessionId);
	if (!session) {
		return;
	}
	session.close();
}

export function hasMcpSseSession(sessionId: string): boolean {
	return sessions.has(sessionId);
}

export function resetMcpSseSessionsForTests(): void {
	for (const [sessionId, session] of sessions.entries()) {
		session.close();
		sessions.delete(sessionId);
	}
}
