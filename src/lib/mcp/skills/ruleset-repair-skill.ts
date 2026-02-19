import type { McpToolCallContext } from '../types';

export interface RulesetRepairSkillInput {
	rulesetId: string;
}

export interface RulesetRepairSkillResult {
	repaired: boolean;
	rulesetId: string;
	validationPass: boolean;
}

export async function runRulesetRepairSkill(
	context: McpToolCallContext,
	input: RulesetRepairSkillInput
): Promise<RulesetRepairSkillResult> {
	const existing = (await context.callTool('get_ruleset', {
		ruleset_id: input.rulesetId
	})) as {
		ruleset: {
			id: string;
			name: string;
			sourceUrl?: string;
			notes?: string;
		};
	};

	const validation = (await context.callTool('validate_ruleset', {
		ruleset_id: existing.ruleset.id
	})) as { pass: boolean };
	if (validation.pass) {
		return {
			repaired: false,
			rulesetId: existing.ruleset.id,
			validationPass: true
		};
	}

	if (!existing.ruleset.sourceUrl) {
		return {
			repaired: false,
			rulesetId: existing.ruleset.id,
			validationPass: false
		};
	}

	const regenerated = (await context.callTool('generate_ruleset', {
		source: { type: 'url', url: existing.ruleset.sourceUrl },
		name: existing.ruleset.name,
		...(existing.ruleset.notes ? { notes: existing.ruleset.notes } : {}),
		model_source: 'server'
	})) as { ruleset: { id: string } };
	const regeneratedValidation = (await context.callTool('validate_ruleset', {
		ruleset_id: regenerated.ruleset.id
	})) as { pass: boolean };

	return {
		repaired: true,
		rulesetId: regenerated.ruleset.id,
		validationPass: regeneratedValidation.pass
	};
}
