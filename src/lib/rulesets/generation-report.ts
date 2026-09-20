import { evaluateTableBehavior, type BehaviorReport } from './behavioral-validation';
import { executableLeaves, type RuleExtraction, type SourceReview } from './extraction-contract';
import type { RuntimeRulesetBundle } from './types';
export interface GenerationReport {
	version: 'rule-validation/v1';
	status: 'ready' | 'needs_review' | 'blocked';
	strategy: 'llm' | 'deterministic';
	model?: string;
	policySnapshot: string;
	behavior: BehaviorReport;
	sourceReview: SourceReview;
	evidence: RuleExtraction['evidence'];
	assumptions: RuleExtraction['assumptions'];
	ambiguities: string[];
	unsupported: string[];
	blockers: string[];
	acceptedAt?: string;
}
export function policySnapshot(b: RuntimeRulesetBundle): string {
	return JSON.stringify({
		rules: b.runtimeRulePack.tableRules,
		scoring: b.runtimeRulePack.scoreRulePack
	});
}
const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
export function buildGenerationReport(
	b: RuntimeRulesetBundle,
	e: RuleExtraction,
	source: string,
	review: SourceReview,
	strategy: GenerationReport['strategy'],
	model?: string
): GenerationReport {
	const behavior = evaluateTableBehavior(b),
		blockers: string[] = [],
		assumptions = [...e.assumptions];
	const paths = executableLeaves({ tableRules: e.tableRules, cardValues: e.cardValues });
	for (const entry of e.evidence) {
		if (!paths.includes(entry.path))
			blockers.push(`Evidence refers to unknown field: ${entry.path}`);
		if (!normalize(entry.quote) || !normalize(source).includes(normalize(entry.quote)))
			blockers.push(`Source quotation could not be verified: ${entry.path}`);
	}
	for (const a of e.assumptions)
		if (!paths.includes(a.path)) blockers.push(`Assumption refers to unknown field: ${a.path}`);
	for (const path of paths)
		if (!e.evidence.some((v) => v.path === path) && !assumptions.some((v) => v.path === path))
			assumptions.push({
				path,
				reason: 'No source evidence supplied for this value. Confirm it matches your rules.'
			});
	if (!behavior.pass)
		blockers.push(...behavior.checks.filter((c) => !c.pass).map((c) => `${c.id}: ${c.details}`));
	if (e.unsupported.length) blockers.push(...e.unsupported.map((s) => `Unsupported: ${s}`));
	if (e.ambiguities.length) blockers.push(...e.ambiguities.map((s) => `Unresolved: ${s}`));
	if (review.verdict === 'contradiction')
		blockers.push(
			...(review.issues.length ? review.issues : ['Source review found a contradiction.'])
		);
	const status = blockers.length
		? 'blocked'
		: assumptions.length ||
			  review.verdict !== 'consistent' ||
			  review.issues.length ||
			  strategy === 'deterministic'
			? 'needs_review'
			: 'ready';
	return {
		version: 'rule-validation/v1',
		status,
		strategy,
		...(model ? { model } : {}),
		policySnapshot: policySnapshot(b),
		behavior,
		sourceReview: review,
		evidence: e.evidence,
		assumptions,
		ambiguities: e.ambiguities,
		unsupported: e.unsupported,
		blockers
	};
}
export function canPlayRuleset(b: RuntimeRulesetBundle): boolean {
	const r = b.generationReport;
	// Legacy stored bundles predate import review; room snapshots remain immutable.
	return (
		!!b.runtimeRulePack.tableRules &&
		(!r ||
			(r.version === 'rule-validation/v1' &&
				r.status === 'ready' &&
				r.policySnapshot === policySnapshot(b) &&
				r.behavior.pass &&
				r.blockers.length === 0 &&
				r.unsupported.length === 0 &&
				r.ambiguities.length === 0 &&
				r.sourceReview.verdict !== 'contradiction'))
	);
}
export function acceptRulesetReview(b: RuntimeRulesetBundle): RuntimeRulesetBundle {
	const r = b.generationReport;
	if (!r || r.version !== 'rule-validation/v1' || r.policySnapshot !== policySnapshot(b))
		throw new Error('Rules changed since validation. Import and review them again.');
	if (
		r.status === 'blocked' ||
		r.blockers.length ||
		r.unsupported.length ||
		r.ambiguities.length ||
		r.sourceReview.verdict === 'contradiction'
	)
		throw new Error('Resolve unsupported rules or validation failures before playing.');
	const behavior = evaluateTableBehavior(b);
	if (!behavior.pass)
		throw new Error('Behavioral validation failed. This ruleset remains a draft.');
	const result = structuredClone(b);
	result.generationReport = {
		...r,
		behavior,
		status: 'ready',
		acceptedAt: new Date().toISOString()
	};
	return result;
}

/** Reject malformed or stale metadata at the persistence boundary. */
export function validateGenerationReport(
	value: unknown,
	b: RuntimeRulesetBundle
): asserts value is GenerationReport {
	const r = value as GenerationReport;
	const strings = (v: unknown) => Array.isArray(v) && v.every((s) => typeof s === 'string');
	if (
		!r ||
		r.version !== 'rule-validation/v1' ||
		!['ready', 'needs_review', 'blocked'].includes(r.status) ||
		!['llm', 'deterministic'].includes(r.strategy) ||
		r.policySnapshot !== policySnapshot(b) ||
		!strings(r.blockers) ||
		!strings(r.unsupported) ||
		!strings(r.ambiguities) ||
		!Array.isArray(r.assumptions) ||
		!r.assumptions.every((a) => typeof a?.path === 'string' && typeof a?.reason === 'string') ||
		!Array.isArray(r.evidence) ||
		!r.evidence.every((e) => typeof e?.path === 'string' && typeof e?.quote === 'string') ||
		!r.sourceReview ||
		!['consistent', 'uncertain', 'contradiction', 'unavailable'].includes(r.sourceReview.verdict) ||
		!strings(r.sourceReview.issues) ||
		typeof r.sourceReview.summary !== 'string' ||
		r.behavior?.version !== 'table-behavior/v1' ||
		typeof r.behavior.pass !== 'boolean' ||
		!Array.isArray(r.behavior.checks) ||
		!r.behavior.checks.length ||
		!r.behavior.checks.every(
			(c) =>
				typeof c?.id === 'string' && typeof c.pass === 'boolean' && typeof c.details === 'string'
		) ||
		!Array.isArray(r.behavior.simulations) ||
		!r.behavior.simulations.every(
			(s) =>
				Number.isInteger(s?.seed) &&
				Number.isInteger(s.players) &&
				Number.isInteger(s.commands) &&
				typeof s.completed === 'boolean'
		)
	)
		throw new Error('Invalid or stale generation report');
	if (
		r.status === 'ready' &&
		(!r.behavior.pass ||
			!r.behavior.checks.every((c) => c.pass) ||
			r.blockers.length ||
			r.unsupported.length ||
			r.ambiguities.length ||
			r.sourceReview.verdict === 'contradiction' ||
			((r.assumptions.length ||
				r.sourceReview.verdict !== 'consistent' ||
				r.sourceReview.issues.length ||
				r.strategy === 'deterministic') &&
				!r.acceptedAt))
	)
		throw new Error('Generation report cannot claim this ruleset is ready');
}
