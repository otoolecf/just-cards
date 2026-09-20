import { env } from '$env/dynamic/private';
import { getDefaultRulesetService } from '$lib/rulesets/default-service';
import { createJustCardsMcpServer, type JustCardsMcpServer } from './server';
import { InMemoryMcpGameStore } from './game-store';
import { InMemoryMcpAuditLog } from './audit-log';
import type { McpGenerationBudget } from './types';

const sharedGameStore = new InMemoryMcpGameStore();
const sharedAuditLog = new InMemoryMcpAuditLog();

function parsePositiveInt(value: string | undefined): number | undefined {
	if (!value) {
		return undefined;
	}
	const number = Number(value);
	if (!Number.isFinite(number) || number < 0) {
		return undefined;
	}
	return Math.trunc(number);
}

function readGenerationBudgetFromEnv(): McpGenerationBudget {
	return {
		maxSourceChars:
			parsePositiveInt(env.JUST_CARDS_MCP_MAX_SOURCE_CHARS ?? process.env.JUST_CARDS_MCP_MAX_SOURCE_CHARS) ?? 24000,
		maxServerRetries:
			parsePositiveInt(env.JUST_CARDS_MCP_MAX_SERVER_RETRIES ?? process.env.JUST_CARDS_MCP_MAX_SERVER_RETRIES) ?? 1,
		maxToolCallsPerTrace:
			parsePositiveInt(env.JUST_CARDS_MCP_MAX_TOOL_CALLS_PER_TRACE ?? process.env.JUST_CARDS_MCP_MAX_TOOL_CALLS_PER_TRACE) ??
			32
	};
}

export interface GetDefaultMcpServerOptions {
	fetchImpl?: typeof fetch;
	platform?: App.Platform;
}

export async function getDefaultMcpServer(
	options: GetDefaultMcpServerOptions = {}
): Promise<JustCardsMcpServer> {
	const rulesetService = await getDefaultRulesetService(options.platform);
	return createJustCardsMcpServer({
		...(options.fetchImpl ? { scoreSessionReader: async (id: string) => {
			const response = await options.fetchImpl!(`/api/sessions/${encodeURIComponent(id)}`);
			if (!response.ok) throw new Error('Score session not found');
			return await response.json() as import('$lib/session/session-store').SessionStateView;
		} } : {}),
		rulesetService,
		gameStore: sharedGameStore,
		auditLog: sharedAuditLog,
		fetchImpl: options.fetchImpl,
		generationBudget: readGenerationBudgetFromEnv(),
		serverAgent: {
			apiKey: options.platform?.env?.OPENAI_API_KEY ?? env.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY,
			primaryModel: env.RULESET_LLM_PRIMARY_MODEL ?? process.env.RULESET_LLM_PRIMARY_MODEL,
			fallbackModel: env.RULESET_LLM_FALLBACK_MODEL ?? process.env.RULESET_LLM_FALLBACK_MODEL
		}
	});
}

export function getDefaultMcpAuditLog(): InMemoryMcpAuditLog {
	return sharedAuditLog;
}

export function resetDefaultMcpServerStateForTests(): void {
	sharedAuditLog.clear();
}
