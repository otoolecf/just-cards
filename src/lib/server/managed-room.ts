import { roomRequest, roomError, roomHeaders } from './room-api';
import {
	credentialHash,
	viewRoom,
	replayRoom,
	type RoomRecord,
} from './room-service';
import type { RoomStorage } from './room-storage';
import type { RuntimeRulesetBundle } from '../rulesets/types';
import {
	admissionResponse,
	type AdmissionClient,
	type CapacityPolicy,
} from './room-admission';
export const roomFinished = (r: RoomRecord) =>
	r.events.some((e) => e.type === 'end_game') ||
	replayRoom(r)?.stage === 'game_end';
/** Serializes a room's await-spanning admission/commit sequence, not its source-of-truth state. */
export class ManagedRoom {
	private tail: Promise<unknown> = Promise.resolve();
	constructor(
		private storage: RoomStorage,
		private admission: AdmissionClient,
		private policy: CapacityPolicy,
		private now = Date.now,
	) {}
	run<T>(fn: () => Promise<T>): Promise<T> {
		const next = this.tail.then(fn, fn);
		this.tail = next.catch(() => {});
		return next;
	}
	async expire(code: string): Promise<RoomRecord | undefined> {
		const previous = this.storage.read(code);
		if (!previous || roomFinished(previous) || previous.activity?.suspended)
			return previous;
		if (previous.activity && previous.activity.expiresAt > this.now())
			return previous;
		const room = structuredClone(previous);
		room.paused = true;
		room.pauseReason =
			'This table was saved after inactivity. The host can resume when a table is available. Your cards and scores are safe.';
		room.activity = {
			lease: previous.activity?.lease ?? '',
			expiresAt: 0,
			lastActionAt: previous.activity?.lastActionAt ?? 0,
			suspended: true,
		};
		room.revision++;
		this.storage.write(code, () => room);
		if (previous.activity?.lease)
			await this.admission.release(code, previous.activity.lease);
		return room;
	}
	request(
		request: Request,
		code: string,
		client: string,
		bundle?: RuntimeRulesetBundle,
	): Promise<Response> {
		return this.run(async () => {
			try {
				const hash = await credentialHash(
					request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '',
				);
				const old = await this.expire(code);
				// Validation runs before admission; stage its result without persisting it yet.
				let candidate: RoomRecord | undefined;
				const staged: RoomStorage = {
					read: () => old,
					write: (_code, fn) => (candidate = fn(old)),
				};
				const response = await roomRequest(request, code, staged, bundle);
				if (!response.ok || !candidate) return response;
 if (candidate.events.length > 2000 || JSON.stringify(candidate).length > 524288) throw new Error('Table history limit reached; start a new table');
				if (old && candidate.revision === old.revision) return response;
				const finished = roomFinished(candidate);
				const activating =
					!finished &&
					!candidate.paused &&
					(old?.activity?.suspended || !old || roomFinished(old));
				const keepingActive =
					!finished &&
					old?.activity &&
					!old.activity.suspended &&
					!!old.activity.lease &&
					old.activity.expiresAt > this.now() &&
					!roomFinished(old);
				const needsSlot = activating || keepingActive;
				let lease: string | undefined;
				if (needsSlot) {
					lease = keepingActive ? old!.activity!.lease : crypto.randomUUID();
					const now = this.now(),
						ttl = candidate.events.some((e) => e.type === 'deal')
							? this.policy.idleMs
							: this.policy.lobbyMs;
					const expiresAt = now + ttl;
					const result = await this.admission.reserve({
						code,
						lease,
						expiresAt,
						client,
						creating: !old,
					});
					if (!result.ok) return admissionResponse(result);
					// Never commit after the reservation deadline (e.g. a delayed RPC response).
					if (this.now() >= expiresAt) {
						await this.admission.release(code, lease);
						return roomError(
							new Error('The table reservation expired. Please try again.'),
						);
					}
					candidate.activity = {
						lease,
						expiresAt,
						lastActionAt: now,
						suspended: false,
					};
				} else if (finished)
					candidate.activity = {
						lease: '',
						expiresAt: 0,
						lastActionAt: this.now(),
						suspended: false,
					};
				try {
					this.storage.write(code, () => candidate!);
				} catch (error) {
					// A new reservation can be rolled back. Existing ones retain their previous safe deadline.
					if (lease && !keepingActive)
						await this.admission.release(code, lease);
					throw error;
				}
				if (finished && old?.activity?.lease)
					await this.admission.release(code, old.activity.lease);
				return Response.json(viewRoom(candidate, hash), {
					headers: roomHeaders,
				});
			} catch (error) {
				return roomError(error);
			}
		});
	}
}
