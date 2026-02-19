import type { GameEvent, GameplayState } from '$lib/gameplay/engine';
import type { RuleFactsV0, GenerateRulesetInput } from '$lib/rulesets/generator';
import type { RulesetGenerationPipelineReport } from '$lib/rulesets/llm-agent';
import type { RulesetRecord, RuntimeRulesetBundle } from '$lib/rulesets/types';

export type McpToolName =
	| 'generate_ruleset'
	| 'validate_ruleset'
	| 'list_rulesets'
	| 'get_ruleset'
	| 'start_game'
	| 'get_game_state'
	| 'submit_move'
	| 'suggest_move';

export interface McpToolDefinition {
	name: McpToolName;
	description: string;
}

export interface McpResourceDefinition {
	uri: string;
	name: string;
	description: string;
	mimeType: string;
}

export interface McpResourceReadResult {
	uri: string;
	mimeType: string;
	text?: string;
	json?: unknown;
}

export type McpModelSource = 'session' | 'server';

export interface McpGenerationSummary {
	requestedModelSource: McpModelSource;
	usedModelSource: McpModelSource;
	deterministicFallback: boolean;
	fallbackReason?: string;
	pipeline?: RulesetGenerationPipelineReport;
}

export interface McpGenerateRulesetArgs {
	source: GenerateRulesetInput['source'];
	name?: string;
	notes?: string;
	model_source?: McpModelSource;
}

export interface McpGenerateRulesetResult {
	ruleset: RulesetRecord;
	facts: RuleFactsV0;
	diagnostics: string[];
	generation: McpGenerationSummary;
}

export interface McpValidateRulesetArgs {
	ruleset_id?: string;
	bundle?: RuntimeRulesetBundle;
}

export interface McpValidateRulesetResult {
	pass: boolean;
	checks: Array<{ id: string; pass: boolean; details: string }>;
	issues: string[];
}

export interface McpStartGameArgs {
	ruleset_id: string;
	players?: string[];
	game_id?: string;
}

export interface McpStartGameResult {
	gameId: string;
	rulesetId: string;
	players: string[];
	eventCount: number;
	phase: string;
	currentTurnPlayer?: string;
}

export interface McpGetGameStateArgs {
	game_id: string;
}

export interface McpGetGameStateResult {
	gameId: string;
	rulesetId: string;
	players: string[];
	events: GameEvent[];
	state: GameplayState;
}

export interface McpSubmitMoveArgs {
	game_id: string;
	event: GameEvent;
}

export interface McpSubmitMoveResult {
	accepted: boolean;
	gameId: string;
	eventCount: number;
	phase: string;
}

export interface McpSuggestMoveArgs {
	game_id: string;
}

export interface McpSuggestMoveResult {
	gameId: string;
	event: GameEvent;
	reason: string;
}

export interface McpGameSessionSnapshot {
	gameId: string;
	rulesetId: string;
	players: string[];
	events: GameEvent[];
	createdAt: string;
	updatedAt: string;
}

export interface McpSessionSamplerInput {
	sourceText: string;
	sourceType: 'url' | 'text';
	sourceUrl?: string;
	baselineFacts: RuleFactsV0;
}

export type McpSessionSampler = (
	input: McpSessionSamplerInput
) => Promise<RuleFactsV0 | undefined>;

export interface McpToolCallContext {
	callTool: (name: McpToolName, args: Record<string, unknown>) => Promise<unknown>;
}
