export type ServerLogLevel = 'info' | 'warn' | 'error';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type LogContext = Record<string, unknown>;

const SENSITIVE_KEY_PATTERN = /(key|token|secret|password|authorization)/i;

function sanitizeValue(value: unknown, depth = 0): JsonValue {
	if (depth > 4) {
		return '[depth-truncated]';
	}
	if (value === null || value === undefined) {
		return null;
	}
	if (typeof value === 'string') {
		return value.length > 500 ? `${value.slice(0, 497)}...` : value;
	}
	if (typeof value === 'number' || typeof value === 'boolean') {
		return value;
	}
	if (Array.isArray(value)) {
		return value.slice(0, 32).map((entry) => sanitizeValue(entry, depth + 1));
	}
	if (typeof value === 'object') {
		const record = value as Record<string, unknown>;
		const output: Record<string, JsonValue> = {};
		for (const [key, entry] of Object.entries(record)) {
			if (SENSITIVE_KEY_PATTERN.test(key)) {
				output[key] = '[redacted]';
				continue;
			}
			output[key] = sanitizeValue(entry, depth + 1);
		}
		return output;
	}
	return String(value);
}

function sanitizeContext(context: LogContext): Record<string, JsonValue> {
	const sanitized = sanitizeValue(context);
	if (sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)) {
		return sanitized as Record<string, JsonValue>;
	}
	return {};
}

export function logServerEvent(event: string, context: LogContext = {}, level: ServerLogLevel = 'info'): void {
	const payload = {
		ts: new Date().toISOString(),
		app: 'just-cards',
		event,
		...sanitizeContext(context)
	};
	const line = `[just-cards] ${JSON.stringify(payload)}`;
	if (level === 'error') {
		console.error(line);
		return;
	}
	if (level === 'warn') {
		console.warn(line);
		return;
	}
	console.info(line);
}
