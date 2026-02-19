import type { McpToolCallContext } from '../types';

export interface GameplayAgentSkillInput {
	gameId: string;
	apply?: boolean;
}

export interface GameplayAgentSkillResult {
	gameId: string;
	suggestedEvent: unknown;
	reason: string;
	applied: boolean;
}

export async function runGameplayAgentSkill(
	context: McpToolCallContext,
	input: GameplayAgentSkillInput
): Promise<GameplayAgentSkillResult> {
	const suggestion = (await context.callTool('suggest_move', {
		game_id: input.gameId
	})) as { event: unknown; reason: string };

	if (!input.apply) {
		return {
			gameId: input.gameId,
			suggestedEvent: suggestion.event,
			reason: suggestion.reason,
			applied: false
		};
	}

	const submission = (await context.callTool('submit_move', {
		game_id: input.gameId,
		event: suggestion.event
	})) as { accepted: boolean };

	return {
		gameId: input.gameId,
		suggestedEvent: suggestion.event,
		reason: suggestion.reason,
		applied: submission.accepted === true
	};
}
