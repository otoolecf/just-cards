import { EdgeFastMCP } from 'fastmcp/edge';
import { getDefaultMcpServer } from './default-server';
import type { McpToolName } from './types';

const MCP_NAME = 'just-cards-mcp';
const MCP_VERSION = '0.2.0';
const MCP_DESCRIPTION = 'Ruleset and gameplay MCP server for Just Cards.';
const MCP_PATH = '/api/mcp';

function randomTraceId(): string {
	return `trace-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toJsonText(value: unknown): string {
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

function toolNameAsMcpToolName(name: string): McpToolName {
	if (
		name === 'generate_ruleset' ||
		name === 'validate_ruleset' ||
		name === 'list_rulesets' ||
		name === 'get_ruleset' ||
		name === 'start_game' ||
		name === 'get_game_state' ||
		name === 'submit_move' ||
		name === 'suggest_move'
	) {
		return name;
	}
	throw new Error(`unsupported MCP tool name: ${name}`);
}

export interface CreateFastMcpEdgeServerOptions {
	fetchImpl?: typeof fetch;
}

export async function createFastMcpEdgeServer(
	options: CreateFastMcpEdgeServerOptions = {}
): Promise<EdgeFastMCP> {
	const domainServer = await getDefaultMcpServer({ fetchImpl: options.fetchImpl });
	const edgeServer = new EdgeFastMCP({
		name: MCP_NAME,
		version: MCP_VERSION,
		description: MCP_DESCRIPTION,
		mcpPath: MCP_PATH
	});

	for (const tool of domainServer.listTools()) {
		edgeServer.addTool({
			name: tool.name,
			description: tool.description,
			execute: async (params) => {
				const args = isRecord(params) ? params : {};
				const result = await domainServer.callTool(toolNameAsMcpToolName(tool.name), args, {
					traceId: randomTraceId()
				});
				return {
					content: [
						{
							type: 'text',
							text: toJsonText(result)
						}
					]
				};
			}
		});
	}

	const resources = await domainServer.listResources();
	for (const resource of resources) {
		edgeServer.addResource({
			name: resource.name,
			description: resource.description,
			uri: resource.uri,
			mimeType: resource.mimeType,
			load: async () => {
				const read = await domainServer.readResource(resource.uri);
				if (typeof read.text === 'string') {
					return {
						text: read.text,
						mimeType: read.mimeType
					};
				}
				return {
					text: toJsonText(read.json ?? null),
					mimeType: read.mimeType
				};
			}
		});
	}

	return edgeServer;
}
