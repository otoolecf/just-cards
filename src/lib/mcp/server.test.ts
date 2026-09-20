import { extractionFromBundle } from '$lib/rulesets/extraction-contract';
import { familyRulesets } from '$lib/rulesets/family-presets';
import { describe, expect, it } from 'vitest';
import { createRulesetStore } from '$lib/rulesets/store';
import { createRulesetService } from '$lib/rulesets/service';
import { appendSessionEvent, createSession, resetInMemorySessionsForTests } from '$lib/session/session-store';
import { createRulePack } from '$lib/scorekeeper/engine';
import { createJustCardsMcpServer, type CreateJustCardsMcpServerOptions } from './server';
import { InMemoryMcpAuditLog } from './audit-log';
import type {
	McpGenerateRulesetResult,
	McpGetGameStateResult,
	McpStartGameResult,
	McpSubmitMoveResult,
	McpSuggestMoveResult
} from './types';

const RUMMY_TEXT = `
500 Rum
Players: 2 to 8
Deal seven cards to each player.
Place undealt cards face down in the center of the table as stock.
Turn the top card up to start discard pile.
On your turn, draw from stock or discard, then meld or discard.
First to 500 points wins.
`;

async function createServer(
	options: Omit<CreateJustCardsMcpServerOptions, 'rulesetService'> = {}
) {
	const store = await createRulesetStore({ driver: 'memory' });
	const rulesetService = createRulesetService(store);
	return createJustCardsMcpServer({
		...options,
		rulesetService
	});
}

describe('mcp server scaffold', () => {
	it('mcp_server_lists_required_tools_and_static_resources', async () => {
		resetInMemorySessionsForTests();
		const server = await createServer();
		const tools = server.listTools().map((tool) => tool.name);
		const resources = await server.listResources();

		expect(tools).toEqual(
			expect.arrayContaining([
				'generate_ruleset',
				'validate_ruleset',
				'list_rulesets',
				'get_ruleset',
				'start_game',
				'get_game_state',
				'submit_move',
				'suggest_move',
				'render_game_table',
				'render_score_leaderboard'
			])
		);
		expect(resources.map((resource) => resource.uri)).toEqual(
			expect.arrayContaining([
				'just-cards://docs/primitives-kb-v0',
				'just-cards://docs/ui-profile-v0',
				'just-cards://schemas/rulepack-v0',
				'just-cards://examples/ruleset/six-card-golf',
				'just-cards://examples/ruleset/500-rum',
				'ui://just-cards/apps/play-table/v1',
				'ui://just-cards/apps/score-leaderboard/v1'
			])
		);
	});

	it('mcp_render_game_table_returns_ruleset_driven_surface_payload', async () => {
		resetInMemorySessionsForTests();
		const server = await createServer();
		const generated = (await server.callTool('generate_ruleset', {
			source: { type: 'text', text: RUMMY_TEXT },
			model_source: 'server'
		})) as McpGenerateRulesetResult;
		const started = (await server.callTool('start_game', {
			ruleset_id: generated.ruleset.id,
			players: ['You', 'Riv', 'Mina']
		})) as McpStartGameResult;

		const rendered = (await server.callTool('render_game_table', {
			game_id: started.gameId,
			viewer_player_id: 'You'
		})) as {
			viewType: string;
			gameId: string;
			viewerPlayerId: string;
			surface: {
				hand: { cards: Array<{ label: string }> };
				tableZones: Array<{ zoneId: string; cards: Array<{ label: string }> }>;
				seats: Array<{ playerId: string }>;
			};
		};

		expect(rendered.viewType).toBe('play_table/v1');
		expect(rendered.gameId).toBe(started.gameId);
		expect(rendered.viewerPlayerId).toBe('You');
		expect(rendered.surface.hand.cards.length).toBeGreaterThan(0);
		expect(rendered.surface.tableZones.length).toBeGreaterThan(0);
		expect(rendered.surface.seats.map((seat) => seat.playerId)).toEqual(
			expect.arrayContaining(['You', 'Riv', 'Mina'])
		);
	});

	it('mcp_render_score_leaderboard_sorts_by_win_direction', async () => {
		resetInMemorySessionsForTests();
		const server = await createServer();
		const lowWins = createSession({
			sessionId: 'sess-low',
			config: {
				scoreWinDirection: 'low_wins',
				scoreRulePack: createRulePack()
			}
		});
		appendSessionEvent(lowWins.id, {
			source: 'scorekeeper',
			scoreEvent: {
				type: 'add_delta',
				entries: [
					{ target: { kind: 'player', id: 'You' }, delta: 12 },
					{ target: { kind: 'player', id: 'Riv' }, delta: 8 },
					{ target: { kind: 'player', id: 'Mina' }, delta: 14 }
				]
			}
		});

		const rendered = (await server.callTool('render_score_leaderboard', {
			session_id: lowWins.id
		})) as {
			viewType: string;
			winDirection: string;
			standings: Array<{ playerId: string; total: number; rank: number }>;
		};

		expect(rendered.viewType).toBe('score_leaderboard/v1');
		expect(rendered.winDirection).toBe('low_wins');
		expect(rendered.standings[0]).toMatchObject({ playerId: 'Riv', total: 8, rank: 1 });
		expect(rendered.standings[2]).toMatchObject({ playerId: 'Mina', total: 14 });
	});

	it('mcp_generate_ruleset_prefers_session_sampling_by_default_and_falls_back_to_server', async () => {
		const sessionPreferredServer = await createServer({
			sessionSampler: async ({ stage }) => stage==='review' ? {verdict:'consistent',issues:[],summary:'Reviewed source.'} : ({
    ...extractionFromBundle(familyRulesets()[1].bundle),gameName:'Session Sampler Game'
   })
		});
		const sessionResult = await sessionPreferredServer.callTool('generate_ruleset', {
			source: { type: 'text', text: RUMMY_TEXT }
		}) as McpGenerateRulesetResult;

		expect(sessionResult.ruleset.name).toBe('Session Sampler Game');
		expect(sessionResult.generation.requestedModelSource).toBe('session');
		expect(sessionResult.generation.usedModelSource).toBe('session');
		expect(sessionResult.generation.deterministicFallback).toBe(false);

		const fallbackServer = await createServer({
			sessionSampler: async () => {
				throw new Error('session sampler unavailable');
			}
		});
		const fallbackResult = await fallbackServer.callTool('generate_ruleset', {
			source: { type: 'text', text: RUMMY_TEXT }
		}) as McpGenerateRulesetResult;

		expect(fallbackResult.generation.requestedModelSource).toBe('session');
		expect(fallbackResult.generation.usedModelSource).toBe('server');
		expect(fallbackResult.generation.deterministicFallback).toBe(true);
		expect(fallbackResult.generation.fallbackReason).toContain('session');
	});

	it('mcp_game_tools_support_start_state_move_and_suggestion_loop', async () => {
		const server = await createServer();
		const generated = await server.callTool('generate_ruleset', {
			source: { type: 'text', text: RUMMY_TEXT },
			model_source: 'server'
		}) as McpGenerateRulesetResult;

		const started = await server.callTool('start_game', {
			ruleset_id: generated.ruleset.id,
			players: ['You', 'Riv', 'Mina']
		}) as McpStartGameResult;
		const before = (await server.callTool('get_game_state', {
			game_id: started.gameId
		})) as McpGetGameStateResult;
		const suggestion = (await server.callTool('suggest_move', {
			game_id: started.gameId
		})) as McpSuggestMoveResult;
		expect(suggestion.event).toBeDefined();
		expect(typeof suggestion.reason).toBe('string');

		const submitted = await server.callTool('submit_move', {
			game_id: started.gameId,
			event: suggestion.event
		}) as McpSubmitMoveResult;
		const after = (await server.callTool('get_game_state', {
			game_id: started.gameId
		})) as McpGetGameStateResult;

		expect(before.gameId).toBe(started.gameId);
		expect(submitted.accepted).toBe(true);
		expect(after.events.length).toBe(before.events.length + 1);
	});

	it('mcp_server_start_game_persists_ai_seats_and_get_game_state_returns_them', async () => {
		const server = await createServer();
		const generated = (await server.callTool('generate_ruleset', {
			source: { type: 'text', text: RUMMY_TEXT },
			model_source: 'server'
		})) as McpGenerateRulesetResult;

		const started = (await server.callTool('start_game', {
			ruleset_id: generated.ruleset.id,
			players: ['You', 'Riv', 'Mina'],
			ai_seats: [{ playerId: 'Riv', mode: 'opponent' }]
		})) as McpStartGameResult & { aiSeats?: Array<{ playerId: string; mode: string }> };

		const state = (await server.callTool('get_game_state', {
			game_id: started.gameId
		})) as McpGetGameStateResult & { aiSeats?: Array<{ playerId: string; mode: string }> };

		expect(started.aiSeats).toEqual([{ playerId: 'Riv', mode: 'opponent' }]);
		expect(state.aiSeats).toEqual([{ playerId: 'Riv', mode: 'opponent' }]);
	});

	it('mcp_suggest_move_returns_legal_event_for_requested_mode', async () => {
		const server = await createServer();
		const generated = (await server.callTool('generate_ruleset', {
			source: { type: 'text', text: RUMMY_TEXT },
			model_source: 'server'
		})) as McpGenerateRulesetResult;
		const started = (await server.callTool('start_game', {
			ruleset_id: generated.ruleset.id,
			players: ['You', 'Riv', 'Mina'],
			ai_seats: [{ playerId: 'Riv', mode: 'opponent' }]
		})) as McpStartGameResult;

		const suggestion = (await server.callTool('suggest_move', {
			game_id: started.gameId,
			mode: 'dealer_narrator'
		})) as McpSuggestMoveResult & { mode?: string; actorId?: string };
		expect(suggestion.mode).toBe('dealer_narrator');
		expect(typeof suggestion.actorId).toBe('string');

		const submitted = (await server.callTool('submit_move', {
			game_id: started.gameId,
			event: suggestion.event
		})) as McpSubmitMoveResult;
		expect(submitted.accepted).toBe(true);
	});

	it('mcp_generate_ruleset_enforces_source_budget_and_retries_then_fallback', async () => {
		const openAiCalls: string[] = [];
		const fetchImpl: typeof fetch = async (input, init) => {
			const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
			if (url === 'https://api.openai.com/v1/chat/completions') {
				openAiCalls.push(String(init?.body ?? ''));
				return new Response('upstream error', { status: 500 });
			}
			return new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } });
		};

		const budgetServer = await createServer({
			generationBudget: {
				maxSourceChars: 64
			}
		});
		await expect(
			budgetServer.callTool('generate_ruleset', {
				source: {
					type: 'text',
					text: 'x'.repeat(128)
				}
			})
		).rejects.toThrow(/maxSourceChars/i);

		const retryServer = await createServer({
			fetchImpl,
			serverAgent: {
				apiKey: 'test-openai-key',
				primaryModel: 'gpt-5-nano',
				fallbackModel: 'gpt-5-nano'
			},
			generationBudget: {
				maxServerRetries: 1
			}
		});
		const generated = (await retryServer.callTool('generate_ruleset', {
			source: { type: 'text', text: RUMMY_TEXT },
			model_source: 'server'
		})) as McpGenerateRulesetResult;

		expect(openAiCalls.length).toBeGreaterThanOrEqual(2);
		expect(generated.generation.usedModelSource).toBe('server');
		expect(generated.generation.deterministicFallback).toBe(true);
	});

	it('mcp_audit_log_records_tool_calls_with_trace_id', async () => {
		const auditLog = new InMemoryMcpAuditLog({ maxEntries: 20 });
		const server = await createServer({ auditLog });
		await server.callTool('list_rulesets', {}, { traceId: 'trace-audit-1' });
		await server.callTool(
			'generate_ruleset',
			{
				source: { type: 'text', text: RUMMY_TEXT },
				model_source: 'server'
			},
			{ traceId: 'trace-audit-2' }
		);

		const entries = auditLog.list();
		expect(entries.length).toBeGreaterThanOrEqual(2);
		expect(entries.some((entry) => entry.traceId === 'trace-audit-1' && entry.tool === 'list_rulesets')).toBe(true);
		expect(entries.some((entry) => entry.traceId === 'trace-audit-2' && entry.status === 'ok')).toBe(true);
	});

	it('mcp_resources_include_live_ruleset_and_game_snapshots', async () => {
		const server = await createServer();
		const generated = await server.callTool('generate_ruleset', {
			source: { type: 'text', text: RUMMY_TEXT },
			model_source: 'server'
		}) as McpGenerateRulesetResult;
		const started = await server.callTool('start_game', {
			ruleset_id: generated.ruleset.id
		}) as McpStartGameResult;

		const resources = await server.listResources();
		expect(resources.map((resource) => resource.uri)).toEqual(
			expect.arrayContaining([
				`just-cards://rulesets/${generated.ruleset.id}`,
				`just-cards://games/${started.gameId}`
			])
		);

		const primitiveDoc = await server.readResource('just-cards://docs/primitives-kb-v0');
		const schemaDoc = await server.readResource('just-cards://schemas/rulepack-v0');
		const exampleBundle = await server.readResource('just-cards://examples/ruleset/500-rum');
		const liveRuleset = await server.readResource(`just-cards://rulesets/${generated.ruleset.id}`);
		const liveGame = await server.readResource(`just-cards://games/${started.gameId}`);

		expect(primitiveDoc.text).toContain('Primitives KB v0');
		expect((schemaDoc.json as { schemaVersion?: string } | undefined)?.schemaVersion).toBeUndefined();
		expect((schemaDoc.json as { $schema?: string }).$schema).toContain('json-schema.org');
		expect((exampleBundle.json as { bundleVersion?: string }).bundleVersion).toBe('runtime-bundle/v1');
		expect((liveRuleset.json as { id?: string }).id).toBe(generated.ruleset.id);
		expect((liveGame.json as { gameId?: string }).gameId).toBe(started.gameId);
	});
});
