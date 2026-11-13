type ShareTarget = { canShare?: (data: ShareData) => boolean; share?: (data: ShareData) => Promise<void> };

export function supportsImageShare(file: File, target: ShareTarget = navigator): boolean {
	try { return Boolean(target.share && target.canShare?.({ files: [file] })); }
	catch { return false; }
}

export async function shareImageFile(file: File, target: ShareTarget = navigator): Promise<'shared' | 'unsupported' | 'cancelled'> {
	if (!supportsImageShare(file, target)) return 'unsupported';
	try { await target.share!({ files: [file], title: 'Just Cards results' }); return 'shared'; }
	catch (error) {
		if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
		throw error;
	}
}
