import type { McpToolCallContext, McpGenerateRulesetArgs } from '../types';

export interface RulesetExtractorSkillInput {
	source: McpGenerateRulesetArgs['source'];
	name?: string;
	notes?: string;
}

export interface RulesetExtractorSkillResult {
	rulesetId: string;
	rulesetName: string;
	usedModelSource: 'session' | 'server';
	validationPass: boolean;
}

export async function runRulesetExtractorSkill(
	context: McpToolCallContext,
	input: RulesetExtractorSkillInput
): Promise<RulesetExtractorSkillResult> {
	const sessionAttempt = (await context.callTool('generate_ruleset', {
		source: input.source,
		...(input.name ? { name: input.name } : {}),
		...(input.notes ? { notes: input.notes } : {}),
		model_source: 'session'
	})) as {
		ruleset: { id: string; name: string };
		generation?: { usedModelSource?: 'session' | 'server' };
	};

	const sessionValidation = (await context.callTool('validate_ruleset', {
		ruleset_id: sessionAttempt.ruleset.id
	})) as { pass: boolean; report?: {status:string} };
	if (sessionValidation.pass || sessionValidation.report?.status === 'needs_review') {
		return {
			rulesetId: sessionAttempt.ruleset.id,
			rulesetName: sessionAttempt.ruleset.name,
			usedModelSource: sessionAttempt.generation?.usedModelSource ?? 'session',
			validationPass: sessionValidation.pass
		};
	}

	const serverAttempt = (await context.callTool('generate_ruleset', {
		source: input.source,
		...(input.name ? { name: input.name } : {}),
		...(input.notes ? { notes: input.notes } : {}),
		model_source: 'server'
	})) as {
		ruleset: { id: string; name: string };
		generation?: { usedModelSource?: 'session' | 'server' };
	};
	const serverValidation = (await context.callTool('validate_ruleset', {
		ruleset_id: serverAttempt.ruleset.id
	})) as { pass: boolean; report?: {status:string} };

	return {
		rulesetId: serverAttempt.ruleset.id,
		rulesetName: serverAttempt.ruleset.name,
		usedModelSource: serverAttempt.generation?.usedModelSource ?? 'server',
		validationPass: serverValidation.pass === true
	};
}
