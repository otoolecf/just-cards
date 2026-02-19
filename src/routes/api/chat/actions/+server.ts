import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDefaultMcpServer } from '$lib/mcp/default-server';
import { getMcpAuthToken, isAuthorizedMcpRequest } from '$lib/mcp/auth';
import type {
	McpAiMode,
	McpGenerateRulesetResult,
	McpStartGameResult,
	McpSuggestMoveResult,
	McpSubmitMoveResult,
	McpValidateRulesetResult
} from '$lib/mcp/types';
import type { RulesetRecord, RuntimeRulesetExplainV0 } from '$lib/rulesets/types';

type ChatAction = 'create_from_url' | 'explain_rules' | 'open_playable_table' | 'ask_next_move';

interface ChatActionPayload {
	action?: ChatAction;
	input?: Record<string, unknown>;
	trace_id?: string;
}

function randomTraceId(): string {
	return `trace-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

function readMode(value: unknown): McpAiMode {
	return value === 'opponent' || value === 'dealer_narrator' || value === 'coach' ? value : 'coach';
}

function explainSummary(ruleset: RulesetRecord): string {
	const explain = ruleset.bundle.explain as RuntimeRulesetExplainV0 | undefined;
	if (explain && explain.schemaVersion === 'ruleset-explain/v0') {
		const lines = [
			explain.goal,
			`Players: ${explain.playerRange.min}-${explain.playerRange.max}.`,
			`Turn: draw from ${explain.turnFlow.drawFrom.join(', ') || 'draw sources'}, then play to ${explain.turnFlow.playTo.join(', ') || 'play targets'}.`,
			explain.scoring.lowScoreWins ? 'Lowest total score wins.' : 'Highest total score wins.'
		];
		return lines.join(' ');
	}

	const zones = ruleset.bundle.uiProfile.table.zones.map((zone) => zone.label).slice(0, 4).join(', ');
	return `${ruleset.bundle.displayName}: ruleset loaded. Table zones include ${zones || 'configured zones'}.`;
}

function asString(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

export const POST: RequestHandler = async ({ request, fetch }) => {
	const token = getMcpAuthToken();
	if (!isAuthorizedMcpRequest(request, token)) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const payload = (await request.json().catch(() => ({}))) as ChatActionPayload;
	const action = payload.action;
	const input = payload.input ?? {};
	const traceId = payload.trace_id?.trim() || randomTraceId();
	const server = await getDefaultMcpServer({ fetchImpl: fetch });

	if (!action) {
		return json({ traceId, error: 'action is required' }, { status: 400 });
	}

	try {
		if (action === 'create_from_url') {
			const url = asString(input.url);
			if (!url) {
				return json({ traceId, error: 'input.url is required' }, { status: 400 });
			}

			const generated = (await server.callTool(
				'generate_ruleset',
				{
					source: { type: 'url', url },
					...(asString(input.name) ? { name: asString(input.name) } : {}),
					...(asString(input.notes) ? { notes: asString(input.notes) } : {}),
					...(asString(input.model_source) ? { model_source: asString(input.model_source) } : {})
				},
				{ traceId }
			)) as McpGenerateRulesetResult;
			const validation = (await server.callTool(
				'validate_ruleset',
				{ ruleset_id: generated.ruleset.id },
				{ traceId }
			)) as McpValidateRulesetResult;
			return json({
				traceId,
				result: {
					rulesetId: generated.ruleset.id,
					name: generated.ruleset.name,
					playUrl: `/play/${generated.ruleset.id}`,
					validation,
					generation: generated.generation
				}
			});
		}

		if (action === 'explain_rules') {
			const rulesetId = asString(input.ruleset_id);
			if (!rulesetId) {
				return json({ traceId, error: 'input.ruleset_id is required' }, { status: 400 });
			}
			const result = (await server.callTool(
				'get_ruleset',
				{ ruleset_id: rulesetId },
				{ traceId }
			)) as { ruleset: RulesetRecord };

			return json({
				traceId,
				result: {
					rulesetId,
					summary: explainSummary(result.ruleset),
					explain: result.ruleset.bundle.explain ?? null
				}
			});
		}

		if (action === 'open_playable_table') {
			const rulesetId = asString(input.ruleset_id);
			if (!rulesetId) {
				return json({ traceId, error: 'input.ruleset_id is required' }, { status: 400 });
			}
			await server.callTool('get_ruleset', { ruleset_id: rulesetId }, { traceId });
			return json({
				traceId,
				result: {
					rulesetId,
					playUrl: `/play/${rulesetId}`
				}
			});
		}

		if (action === 'ask_next_move') {
			let gameId = asString(input.game_id);
			const mode = readMode(input.mode);
			if (!gameId) {
				const rulesetId = asString(input.ruleset_id);
				if (!rulesetId) {
					return json(
						{ traceId, error: 'input.ruleset_id is required when input.game_id is missing' },
						{ status: 400 }
					);
				}
				const players = Array.isArray(input.players)
					? input.players.filter((entry): entry is string => typeof entry === 'string')
					: undefined;
				const started = (await server.callTool(
					'start_game',
					{
						ruleset_id: rulesetId,
						...(players ? { players } : {})
					},
					{ traceId }
				)) as McpStartGameResult;
				gameId = started.gameId;
			}

			const suggestion = (await server.callTool(
				'suggest_move',
				{
					game_id: gameId,
					mode,
					...(asString(input.actor_id) ? { actor_id: asString(input.actor_id) } : {})
				},
				{ traceId }
			)) as McpSuggestMoveResult;
			let applied = false;
			if (input.apply === true) {
				const submission = (await server.callTool(
					'submit_move',
					{
						game_id: gameId,
						event: suggestion.event
					},
					{ traceId }
				)) as McpSubmitMoveResult;
				applied = submission.accepted;
			}

			return json({
				traceId,
				result: {
					gameId,
					mode: suggestion.mode,
					move: suggestion.event,
					reason: suggestion.reason,
					applied
				}
			});
		}

		return json({ traceId, error: `unsupported action "${action}"` }, { status: 400 });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'action failed';
		return json({ traceId, error: message }, { status: 400 });
	}
};
