import { env } from '$env/dynamic/private';
export function ownerKey(platform?: App.Platform): string | undefined {
	return (
		(platform?.env as unknown as Record<string, string> | undefined)
			?.OWNER_ACCESS_KEY ??
		env.OWNER_ACCESS_KEY ??
		process.env.OWNER_ACCESS_KEY
	);
}
