import type { RoomRecord } from './room-service';

/** Transaction callbacks are synchronous: revision check and append must be indivisible. */
export interface RoomStorage {
	read(code: string): RoomRecord | undefined;
	write(
		code: string,
		update: (previous: RoomRecord | undefined) => RoomRecord
	): RoomRecord;
}
export interface RoomSql {
	get(code: string): string | undefined;
	put(code: string, json: string): void;
	transaction<T>(fn: () => T): T;
}
export function sqlRoomStorage(sql: RoomSql): RoomStorage {
	return {
		read(code) {
			const value = sql.get(code);
			return value ? JSON.parse(value) : undefined;
		},
		write(code, update) {
			return sql.transaction(() => {
				const value = sql.get(code);
				const record = update(value ? JSON.parse(value) : undefined);
				sql.put(code, JSON.stringify(record));
				return record;
			});
		}
	};
}
