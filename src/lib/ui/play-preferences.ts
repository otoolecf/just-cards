/** Personal display preferences never become part of a room's rules or events. */
const GUIDED_PLAY_KEY = 'jc-guided-play-v1';

export function readGuidedPlay(storage?: Pick<Storage, 'getItem'>): boolean {
	try { return storage?.getItem(GUIDED_PLAY_KEY) === 'true'; }
	catch { return false; }
}

export function saveGuidedPlay(storage: Pick<Storage, 'setItem'> | undefined, guided: boolean): void {
	try { storage?.setItem(GUIDED_PLAY_KEY, String(guided)); }
	catch { /* The preference still works in memory when storage is blocked. */ }
}

/** Old rooms retain their immutable name snapshot; only this obsolete title is aliased. */
export function displayGameName(name: string): string {
	return name === 'Hong Kong Mahjong (guided)' ? 'Hong Kong Mahjong' : name;
}
