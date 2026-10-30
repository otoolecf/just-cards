export const MAX_RULE_ID_LENGTH = 96;
export const MAX_DIAGNOSTICS = 32;
export interface Diagnostic {
	code: string;
	message: string;
	ruleId?: string;
}

export function validRuleId(id: unknown): id is string {
	return (
		typeof id === 'string' && id.length > 0 && id.length <= MAX_RULE_ID_LENGTH
	);
}

/** Bound and deduplicate at collection time, including nested validation results. */
export function addIssues(target: Diagnostic[], ...issues: Diagnostic[]): void {
	for (const issue of issues) {
		const bounded: Diagnostic = {
			code: issue.code.slice(0, 64),
			message: issue.message.slice(0, 256),
			...(issue.ruleId
				? { ruleId: issue.ruleId.slice(0, MAX_RULE_ID_LENGTH) }
				: {})
		};
		if (
			target.some(
				(previous) =>
					previous.code === bounded.code &&
					previous.message === bounded.message &&
					previous.ruleId === bounded.ruleId
			)
		)
			continue;
		if (target.length < MAX_DIAGNOSTICS) target.push(bounded);
		else {
			target[MAX_DIAGNOSTICS - 1] = {
				code: 'diagnostics_truncated',
				message: 'Additional validation issues omitted.'
			};
			return;
		}
	}
}

/** Only the bounded code is echoed to callers; never concatenate a full issue list. */
export function invalidScoreRules(issue: Diagnostic): Error {
	return new Error(`Invalid score rules: ${issue.code.slice(0, 64)}`);
}
