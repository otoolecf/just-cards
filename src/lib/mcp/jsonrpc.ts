import type { JustCardsMcpServer } from './server';
import type { McpToolName } from './types';

const JSON_RPC_VERSION = '2.0';
const SERVER_INFO = {
	name: 'just-cards-mcp',
	version: '0.1.0'
};

interface JsonRpcRequest {
	jsonrpc?: unknown;
	id?: unknown;
	method?: unknown;
	params?: unknown;
}

interface JsonRpcResponse {
	jsonrpc: '2.0';
	id: unknown;
	result?: unknown;
	error?: {
		code: number;
		message: string;
		data?: unknown;
	};
}

interface JsonRpcContext {
	traceId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
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
		name === 'suggest_move'
	);
}

function jsonRpcError(id: unknown, code: number, message: string, data?: unknown): JsonRpcResponse {
	return {
		jsonrpc: JSON_RPC_VERSION,
		id,
		error: {
			code,
			message,
			...(data !== undefined ? { data } : {})
		}
	};
}

function jsonRpcResult(id: unknown, result: unknown): JsonRpcResponse {
	return {
		jsonrpc: JSON_RPC_VERSION,
		id,
		result
	};
}

function parseRequest(body: unknown): JsonRpcRequest | undefined {
	if (!isRecord(body)) {
		return undefined;
	}
	return body as JsonRpcRequest;
}

function missingIdResponse(method: string): JsonRpcResponse {
	return jsonRpcError(null, -32600, `method "${method}" requires an id`);
}

export async function handleMcpJsonRpc(
	server: JustCardsMcpServer,
	body: unknown,
	context: JsonRpcContext
): Promise<JsonRpcResponse | undefined> {
	const request = parseRequest(body);
	if (!request || request.jsonrpc !== JSON_RPC_VERSION || typeof request.method !== 'string') {
		return jsonRpcError(isRecord(body) ? body.id ?? null : null, -32600, 'invalid JSON-RPC request');
	}

	const method = request.method;
	const id = request.id ?? null;

	if (method === 'initialize') {
		return jsonRpcResult(id, {
			protocolVersion: '2025-03-26',
			capabilities: {
				tools: {
					listChanged: false
				},
				resources: {
					listChanged: false,
					subscribe: false
				}
			},
			serverInfo: SERVER_INFO
		});
	}

	if (method === 'ping') {
		return jsonRpcResult(id, {});
	}

	if (method === 'notifications/initialized') {
		return undefined;
	}

	if (id === null || id === undefined) {
		return missingIdResponse(method);
	}

	try {
		if (method === 'tools/list') {
			const tools = server.listTools().map((tool) => ({
				name: tool.name,
				description: tool.description,
				inputSchema: {
					type: 'object',
					additionalProperties: true
				}
			}));
			return jsonRpcResult(id, { tools });
		}

		if (method === 'resources/list') {
			const resources = await server.listResources();
			return jsonRpcResult(id, { resources });
		}

		if (method === 'resources/read') {
			const params = isRecord(request.params) ? request.params : {};
			const uri = asString(params.uri);
			if (!uri) {
				return jsonRpcError(id, -32602, 'resources/read requires params.uri');
			}
			const resource = await server.readResource(uri);
			const text = resource.text ?? (resource.json !== undefined ? JSON.stringify(resource.json, null, 2) : '');
			return jsonRpcResult(id, {
				contents: [
					{
						uri: resource.uri,
						mimeType: resource.mimeType,
						text
					}
				]
			});
		}

		if (method === 'tools/call') {
			const params = isRecord(request.params) ? request.params : {};
			const toolName = asString(params.name);
			if (!toolName || !isMcpToolName(toolName)) {
				return jsonRpcError(id, -32602, 'tools/call requires params.name with a valid tool name');
			}
			const args = isRecord(params.arguments) ? params.arguments : {};
			const result = await server.callTool(toolName, args, { traceId: context.traceId });
			return jsonRpcResult(id, {
				structuredContent: result,
				content: [
					{
						type: 'text',
						text: JSON.stringify(result)
					}
				]
			});
		}

		return jsonRpcError(id, -32601, `unsupported MCP method "${method}"`);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'method execution failed';
		return jsonRpcError(id, -32000, message);
	}
}
