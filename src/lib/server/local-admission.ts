import {
	admitRoom,
	releaseRoom,
	emptyAdmission,
	capacityPolicy,
	type AdmissionClient,
	type AdmissionState,
} from './room-admission';
let adapter: Promise<AdmissionClient> | undefined;
export function localAdmission(): Promise<AdmissionClient> {
	return (adapter ??= (async () => {
		const { mkdirSync } = await import('node:fs');
		const { DatabaseSync } = await import('node:sqlite');
		mkdirSync('.local', { recursive: true });
		const db = new DatabaseSync('.local/admission.sqlite');
		db.exec(
			'PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS admission (id INTEGER PRIMARY KEY,payload TEXT NOT NULL,salt TEXT NOT NULL)',
		);
		db.prepare('INSERT OR IGNORE INTO admission VALUES(1,?,?)').run(
			JSON.stringify(emptyAdmission()),
			crypto.randomUUID(),
		);
		function change<T>(fn: (state: AdmissionState) => T): T {
			db.exec('BEGIN IMMEDIATE');
			try {
				const state = JSON.parse(
					String(
						db.prepare('SELECT payload FROM admission WHERE id=1').get()!
							.payload,
					),
				) as AdmissionState;
				const result = fn(state);
				db.prepare('UPDATE admission SET payload=? WHERE id=1').run(
					JSON.stringify(state),
				);
				db.exec('COMMIT');
				return result;
			} catch (e) {
				db.exec('ROLLBACK');
				throw e;
			}
		}
		return {
			async reserve(input) {
				const salt = db.prepare('SELECT salt FROM admission WHERE id=1').get()!
					.salt;
				const digest = await crypto.subtle.digest(
					'SHA-256',
					new TextEncoder().encode(`${salt}:${input.client}`),
				);
				const client = Array.from(new Uint8Array(digest), (b) =>
					b.toString(16).padStart(2, '0'),
				).join('');
				return change((s) =>
					admitRoom(
						s,
						{ ...input, client },
						Date.now(),
						capacityPolicy(process.env),
					),
				);
			},
			async release(code, lease) {
				change((s) => releaseRoom(s, code, lease));
			},
		};
	})());
}
