import { describe, expect, it } from 'vitest';
import { createRulesetStore } from '$lib/rulesets/store';
import { createRulesetService } from '$lib/rulesets/service';
import { createJustCardsMcpServer, type CreateJustCardsMcpServerOptions } from './server';
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
				'suggest_move'
			])
		);
		expect(resources.map((resource) => resource.uri)).toEqual(
			expect.arrayContaining([
				'just-cards://docs/primitives-kb-v0',
				'just-cards://docs/ui-profile-v0',
				'just-cards://schemas/rulepack-v0',
				'just-cards://examples/ruleset/six-card-golf',
				'just-cards://examples/ruleset/500-rum'
			])
		);
	});

	it('mcp_generate_ruleset_prefers_session_sampling_by_default_and_falls_back_to_server', async () => {
		const sessionPreferredServer = await createServer({
			sessionSampler: async ({ baselineFacts }) => ({
				...baselineFacts,
				gameName: 'Session Sampler Game',
				gameSlug: 'session-sampler-game'
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
