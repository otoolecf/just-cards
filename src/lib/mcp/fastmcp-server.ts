import { EdgeFastMCP } from 'fastmcp/edge';
import { getDefaultMcpServer } from './default-server';
import type { McpToolDefinition, McpToolName } from './types';

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
		name === 'suggest_move' ||
		name === 'render_game_table' ||
		name === 'render_score_leaderboard'
	) {
		return name;
	}
	throw new Error(`unsupported MCP tool name: ${name}`);
}

function buildAppMeta(tool: McpToolDefinition): Record<string, unknown> | undefined {
	if (!tool.appUi) {
		return undefined;
	}
	return {
		ui: {
			resourceUri: tool.appUi.resourceUri
		},
		'openai/outputTemplate': tool.appUi.outputTemplate ?? tool.appUi.resourceUri,
		'openai/toolInvocation/invoking': tool.appUi.invokingText ?? 'Rendering...',
		'openai/toolInvocation/invoked': tool.appUi.invokedText ?? 'Rendered.'
	};
}

async function jsonRpcMethodFromRequest(request: Request): Promise<string | undefined> {
	if (request.method !== 'POST') {
		return undefined;
	}
	const contentType = request.headers.get('content-type') ?? '';
	if (!contentType.includes('application/json')) {
		return undefined;
	}
	try {
		const payload = await request.clone().json();
		if (!isRecord(payload) || typeof payload.method !== 'string') {
			return undefined;
		}
		return payload.method;
	} catch {
		return undefined;
	}
}

async function injectToolsListAppMetadata(
	request: Request,
	response: Response,
	toolMapByName: Map<string, McpToolDefinition>
): Promise<Response> {
	const method = await jsonRpcMethodFromRequest(request);
	const headers = new Headers(response.headers);
	const bodyText = await response.text();
	let payload: unknown;
	try {
		payload = JSON.parse(bodyText);
	} catch {
		return new Response(bodyText, { status: response.status, headers });
	}
	if (!isRecord(payload) || !isRecord(payload.result) || !Array.isArray(payload.result.tools)) {
		return new Response(bodyText, { status: response.status, headers });
	}
	if (method && method !== 'tools/list') {
		return new Response(bodyText, { status: response.status, headers });
	}
	const tools = payload.result.tools.map((entry) => {
		if (!isRecord(entry) || typeof entry.name !== 'string') {
			return entry;
		}
		const mapped = toolMapByName.get(entry.name);
		const appMeta = mapped ? buildAppMeta(mapped) : undefined;
		if (!appMeta) {
			return entry;
		}
		const existingMeta = isRecord(entry._meta) ? entry._meta : {};
		return {
			...entry,
			_meta: {
				...existingMeta,
				...appMeta
			}
		};
	});
	const patched = {
		...payload,
		result: {
			...payload.result,
			tools
		}
	};
	return new Response(JSON.stringify(patched), {
		status: response.status,
		headers
	});
}

export interface CreateFastMcpEdgeServerOptions {
	fetchImpl?: typeof fetch;
}

export async function createFastMcpEdgeServer(
	options: CreateFastMcpEdgeServerOptions = {}
): Promise<EdgeFastMCP> {
	const domainServer = await getDefaultMcpServer({ fetchImpl: options.fetchImpl });
	const domainTools = domainServer.listTools();
	const toolMapByName = new Map(domainTools.map((tool) => [tool.name, tool]));
	const edgeServer = new EdgeFastMCP({
		name: MCP_NAME,
		version: MCP_VERSION,
		description: MCP_DESCRIPTION,
		mcpPath: MCP_PATH
	});

	for (const tool of domainTools) {
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

	const baseFetch = edgeServer.fetch.bind(edgeServer);
	(edgeServer as unknown as { fetch: (request: Request) => Promise<Response> }).fetch = async (
		request: Request
	): Promise<Response> => {
		const response = await baseFetch(request);
		return injectToolsListAppMetadata(request, response, toolMapByName);
	};

	return edgeServer;
}
