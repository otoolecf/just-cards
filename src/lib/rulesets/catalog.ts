import type { RulesetRecord } from './types';
export const favoritesKey = 'jc-ruleset-favorites-v1';
export function toggleFavorite(ids: string[], id: string): string[] {
	return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
}
export function readFavorites(storage: Pick<Storage, 'getItem'>): string[] {
	try {
		const ids = JSON.parse(storage.getItem(favoritesKey) ?? '[]');
		return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [];
	} catch {
		return [];
	}
}
export function catalogSelection(
	records: RulesetRecord[],
	favorites: string[],
): RulesetRecord[] {
	return records
		.filter((r) => !r.archived)
		.sort(
			(a, b) =>
				Number(favorites.includes(b.id)) - Number(favorites.includes(a.id)),
		);
}

/** A successful online list is complete; missing cached entries were deleted. */
export function reconcileCatalog(
	server: RulesetRecord[],
	cached: RulesetRecord[],
	authoritative: boolean,
): RulesetRecord[] {
	return authoritative
		? server
		: [
				...server,
				...cached.filter(
					(r) => r?.id && r.bundle && !server.some((s) => s.id === r.id),
				),
			];
}
