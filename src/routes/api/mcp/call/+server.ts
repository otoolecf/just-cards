import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDefaultMcpServer } from '$lib/mcp/default-server';
import { authorizeMcpRequest } from '$lib/mcp/auth';
import type { McpToolName } from '$lib/mcp/types';

interface McpCallPayload {
	tool?: string;
	args?: Record<string, unknown>;
	trace_id?: string;
}

function randomTraceId(): string {
	return `trace-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

function isMcpToolName(name: string): name is McpToolName {
	return (
		name === 'generate_ruleset' ||
		name === 'validate_ruleset' ||
		name === 'list_rulesets' ||
		name === 'get_ruleset' ||
		name === 'start_game' ||
		name === 'get_game_state' ||
		name === 'submit_move' ||
		name === 'suggest_move' ||
		name === 'render_game_table' ||
		name === 'render_score_leaderboard'
	);
}

export const POST: RequestHandler = async ({ request, fetch }) => {
	const auth = await authorizeMcpRequest(request, { fetchImpl: fetch });
	if (!auth.ok) {
		return json(
			{
				error: auth.error,
				error_description: auth.errorDescription
			},
			{ status: auth.status, headers: auth.headers }
		);
	}

	const payload = (await request.json().catch(() => ({}))) as McpCallPayload;
	const traceId = payload.trace_id?.trim() || randomTraceId();
	const tool = payload.tool?.trim() ?? '';
	if (!isMcpToolName(tool)) {
		return json({ traceId, error: 'tool must be a valid MCP tool name' }, { status: 400 });
	}

	try {
		const server = await getDefaultMcpServer({ fetchImpl: fetch });
		const result = await server.callTool(tool, payload.args ?? {}, { traceId });
		return json({ traceId, result });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'tool call failed';
		return json({ traceId, error: message }, { status: 400 });
	}
};
