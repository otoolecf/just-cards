export interface RecentRoom {
	code: string;
	name: string;
	player: string;
	updatedAt: number;
}
const KEY = 'jc-recent-rooms';
export function recentRooms(storage: Pick<Storage, 'getItem'>): RecentRoom[] {
	try {
		const items: unknown = JSON.parse(storage.getItem(KEY) ?? '[]');
		return Array.isArray(items)
			? items
					.filter(
						(r): r is RecentRoom =>
							r &&
							/^[A-F0-9]{8}$/.test(r.code) &&
							typeof r.name === 'string' &&
							typeof r.player === 'string'
					)
					.slice(0, 8)
			: [];
	} catch {
		return [];
	}
}
export function rememberRoom(
	storage: Pick<Storage, 'getItem' | 'setItem'>,
	room: RecentRoom
): void {
	storage.setItem(
		KEY,
		JSON.stringify([room, ...recentRooms(storage).filter((r) => r.code !== room.code)].slice(0, 8))
	);
}
export function forgetRoom(storage: Pick<Storage, 'getItem' | 'setItem'>, code: string): void {
	storage.setItem(KEY, JSON.stringify(recentRooms(storage).filter((r) => r.code !== code)));
}
