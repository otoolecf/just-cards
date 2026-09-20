import { sqlRoomStorage, type RoomStorage } from './room-storage';

let storage: Promise<RoomStorage> | undefined;
export function localRoomStorage(): Promise<RoomStorage> {
	return (storage ??= (async () => {
		const { mkdirSync } = await import('node:fs');
		const { DatabaseSync } = await import('node:sqlite');
		mkdirSync('.local', { recursive: true });
		const db = new DatabaseSync('.local/rooms.sqlite');
		db.exec(
			'PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, payload TEXT NOT NULL)'
		);
		return sqlRoomStorage({
			get(code) {
				return db.prepare('SELECT payload FROM rooms WHERE code=?').get(code)
					?.payload as string | undefined;
			},
			put(code, payload) {
				db.prepare(
					'INSERT INTO rooms(code,payload) VALUES (?,?) ON CONFLICT(code) DO UPDATE SET payload=excluded.payload'
				).run(code, payload);
			},
			transaction(fn) {
				db.exec('BEGIN IMMEDIATE');
				try {
					const result = fn();
					db.exec('COMMIT');
					return result;
				} catch (error) {
					db.exec('ROLLBACK');
					throw error;
				}
			}
		});
	})());
}
