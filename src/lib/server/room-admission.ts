export interface CapacityPolicy {
	maxRooms: number;
	creationsPerHour: number;
	lobbyMs: number;
	idleMs: number;
}
export function capacityPolicy(env: object = {}): CapacityPolicy {
	const integer = (key: string, fallback: number, max: number) => {
		const value = Number((env as Record<string, unknown>)[key] ?? fallback);
		return Number.isInteger(value) && value > 0 && value <= max
			? value
			: fallback;
	};
	return {
		maxRooms: integer('ROOM_MAX_ACTIVE', 20, 10000),
		creationsPerHour: integer('ROOM_CREATIONS_PER_HOUR', 5, 10000),
		lobbyMs: integer('ROOM_LOBBY_IDLE_SECONDS', 900, 86400) * 1000,
		idleMs: integer('ROOM_GAME_IDLE_SECONDS', 1800, 86400) * 1000,
	};
}
export const FULL_MESSAGE =
	'All tables are currently occupied. Your saved games are safe. Please try again shortly.';
export interface AdmissionState {
	leases: Record<string, { lease: string; expiresAt: number }>;
	rates: Record<string, { count: number; until: number }>;
}
export interface AdmissionInput {
	code: string;
	lease: string;
	expiresAt: number;
	client: string;
	creating: boolean;
}
export type AdmissionResult =
	| { ok: true }
	| { ok: false; status: number; error: string; retryAfter: number };
export interface AdmissionClient {
	reserve(input: AdmissionInput): Promise<AdmissionResult>;
	release(code: string, lease: string): Promise<void>;
}
export const emptyAdmission = (): AdmissionState => ({ leases: {}, rates: {} });
/** Caller runs this synchronous mutation inside a durable storage transaction. */
export function admitRoom(
	s: AdmissionState,
	input: AdmissionInput,
	now: number,
	policy: CapacityPolicy,
): AdmissionResult {
	for (const [key, value] of Object.entries(s.leases))
		if (value.expiresAt <= now) delete s.leases[key];
	for (const [key, value] of Object.entries(s.rates))
		if (value.until <= now) delete s.rates[key];
	const fail = (
		status: number,
		error: string,
		retryAfter = 30,
	): AdmissionResult => ({ ok: false, status, error, retryAfter });
	if (
		!input.code ||
		!input.lease ||
		!Number.isFinite(input.expiresAt) ||
		input.expiresAt <= now
	)
		return fail(409, 'This reservation expired. Please try again.');
	const existing = s.leases[input.code];
	if (existing) {
		if (existing.lease !== input.lease)
			return fail(409, 'This table reservation changed. Please try again.');
		existing.expiresAt = Math.max(existing.expiresAt, input.expiresAt);
		return { ok: true };
	}
	const rate = s.rates[input.client];
	if (input.creating && rate && rate.count >= policy.creationsPerHour)
		return fail(
			429,
			'This network has created several rooms recently. Please use an existing room or try again later.',
			Math.max(1, Math.ceil((rate.until - now) / 1000)),
		);
	if (Object.keys(s.leases).length >= policy.maxRooms)
		return fail(503, FULL_MESSAGE);
	s.leases[input.code] = { lease: input.lease, expiresAt: input.expiresAt };
	if (input.creating)
		s.rates[input.client] = {
			count: (rate?.count ?? 0) + 1,
			until: rate?.until ?? now + 3600000,
		};
	return { ok: true };
}
export function releaseRoom(
	s: AdmissionState,
	code: string,
	lease: string,
): void {
	if (s.leases[code]?.lease === lease) delete s.leases[code];
}
export function admissionResponse(
	result: Exclude<AdmissionResult, { ok: true }>,
): Response {
	return Response.json(
		{
			error: result.error,
			code:
				result.status === 503 ? 'ROOM_CAPACITY_FULL' : 'ROOM_ADMISSION_DENIED',
		},
		{
			status: result.status,
			headers: {
				'cache-control': 'no-store',
				'retry-after': String(result.retryAfter),
			},
		},
	);
}
