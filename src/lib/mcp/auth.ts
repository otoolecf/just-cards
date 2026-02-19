import { env } from '$env/dynamic/private';

function bearerTokenFromAuthorizationHeader(value: string | null): string | undefined {
	if (!value) {
		return undefined;
	}
	const match = value.match(/^Bearer\s+(.+)$/i);
	return match?.[1]?.trim();
}

export function getMcpAuthToken(): string {
	const token = (
		env.JUST_CARDS_MCP_AUTH_TOKEN ??
		process.env.JUST_CARDS_MCP_AUTH_TOKEN ??
		''
	).trim();
	return token;
}

export function isAuthorizedMcpRequest(request: Request, expectedToken: string): boolean {
	if (!expectedToken) {
		return true;
	}
	const headerToken =
		bearerTokenFromAuthorizationHeader(request.headers.get('authorization')) ??
		request.headers.get('x-just-cards-auth')?.trim() ??
		'';
	return headerToken === expectedToken;
}
