import type {
	SessionRepository,
	SessionRecord
} from '../session/session-store';

let storage: Promise<SessionRepository> | undefined;
export function localScoreStorage(): Promise<SessionRepository> {
	return (storage ??= (async () => {
		const { mkdirSync } = await import('node:fs');
		const { DatabaseSync } = await import('node:sqlite');
		mkdirSync('.local', { recursive: true });
		const db = new DatabaseSync('.local/scores.sqlite');
		db.exec(
			'PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY,payload TEXT NOT NULL)'
		);
		return {
			has: (id: string) =>
				Boolean(db.prepare('SELECT id FROM sessions WHERE id=?').get(id)),
			get: (id: string) => {
				const row = db
					.prepare('SELECT payload FROM sessions WHERE id=?')
					.get(id);
				return row
					? (JSON.parse(row.payload as string) as SessionRecord)
					: undefined;
			},
			set: (id: string, record: SessionRecord) => {
				db.prepare(
					'INSERT INTO sessions(id,payload) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload'
				).run(id, JSON.stringify(record));
			}
		};
	})());
}
