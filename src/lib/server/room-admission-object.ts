import { DurableObject } from 'cloudflare:workers';
import {
	admitRoom,
	releaseRoom,
	emptyAdmission,
	capacityPolicy,
	type AdmissionInput,
	type AdmissionState,
} from './room-admission';
/** Only admission/renewal touches this object; room reads and pings stay per-room. */
export class RoomAdmission extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		ctx.storage.sql.exec(
			'CREATE TABLE IF NOT EXISTS admission (id INTEGER PRIMARY KEY, payload TEXT NOT NULL, salt TEXT NOT NULL)',
		);
		ctx.storage.sql.exec(
			'INSERT OR IGNORE INTO admission VALUES (1,?,?)',
			JSON.stringify(emptyAdmission()),
			crypto.randomUUID(),
		);
	}
	private row() {
		return this.ctx.storage.sql
			.exec<{
				payload: string;
				salt: string;
			}>('SELECT payload,salt FROM admission WHERE id=1')
			.toArray()[0];
	}
	async reserve(input: AdmissionInput) {
		const salt = this.row().salt;
		const digest = await crypto.subtle.digest(
			'SHA-256',
			new TextEncoder().encode(`${salt}:${input.client}`),
		);
		const client = Array.from(new Uint8Array(digest), (b) =>
			b.toString(16).padStart(2, '0'),
		).join('');
		return this.ctx.storage.transactionSync(() => {
			const state = JSON.parse(this.row().payload) as AdmissionState;
			const result = admitRoom(
				state,
				{ ...input, client },
				Date.now(),
				capacityPolicy(this.env),
			);
			this.ctx.storage.sql.exec(
				'UPDATE admission SET payload=? WHERE id=1',
				JSON.stringify(state),
			);
			return result;
		});
	}
	async release(code: string, lease: string) {
		this.ctx.storage.transactionSync(() => {
			const state = JSON.parse(this.row().payload) as AdmissionState;
			releaseRoom(state, code, lease);
			this.ctx.storage.sql.exec(
				'UPDATE admission SET payload=? WHERE id=1',
				JSON.stringify(state),
			);
		});
	}
}
