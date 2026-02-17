import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
	evaluateRulesetGoldenCase,
	evaluateRulesetGoldenSuite,
	type RulesetGoldenCaseDefinition
} from './golden-evals';

const SIX_CARD_GOLF_URL = 'https://bicyclecards.com/how-to-play/six-card-golf';
const CRIBBAGE_URL = 'https://bicyclecards.com/how-to-play/cribbage';
const SHITHEAD_URL = 'https://www.pagat.com/beating/shithead.html';

const SIX_CARD_GOLF_HTML = readFileSync(
	new URL('./evals/fixtures/six-card-golf.bicyclecards.html', import.meta.url),
	'utf8'
);
const CRIBBAGE_HTML = readFileSync(
	new URL('./evals/fixtures/cribbage.bicyclecards.html', import.meta.url),
	'utf8'
);
const SHITHEAD_HTML = readFileSync(new URL('./evals/fixtures/shithead.pagat.html', import.meta.url), 'utf8');

const GOLDEN_CASES: RulesetGoldenCaseDefinition[] = [
	{
		id: 'six-card-golf-bicyclecards',
		sourceUrl: SIX_CARD_GOLF_URL,
		sourceContentType: 'text/html; charset=utf-8',
		sourceDocument: SIX_CARD_GOLF_HTML,
		expected: {
			gameNameIncludes: ['six', 'golf'],
			players: {
				minAtMost: 2,
				maxAtLeast: 4
			},
			rounds: {
				equals: 9
			},
			zonesInclude: ['stock', 'discard'],
			drawSourcesInclude: ['stock', 'discard'],
			playTargetsInclude: ['discard'],
			scoring: {
				lowScoreWins: true,
				rankOverrides: {
					A: 1,
					'2': -2,
					J: 10,
					Q: 10,
					K: 0
				}
			}
		}
	},
	{
		id: 'cribbage-bicyclecards',
		sourceUrl: CRIBBAGE_URL,
		sourceContentType: 'text/html; charset=utf-8',
		sourceDocument: CRIBBAGE_HTML,
		expected: {
			gameNameIncludes: ['cribbage'],
			players: {
				minAtMost: 2,
				maxAtLeast: 2
			},
			zonesInclude: ['crib', 'board'],
			drawSourcesInclude: ['stock']
		}
	},
	{
		id: 'shithead-pagat',
		sourceUrl: SHITHEAD_URL,
		sourceContentType: 'text/html; charset=utf-8',
		sourceDocument: SHITHEAD_HTML,
		expected: {
			gameNameIncludes: ['shithead'],
			players: {
				minAtMost: 2,
				maxAtLeast: 3
			},
			zonesInclude: ['stock', 'discard'],
			drawSourcesInclude: ['stock'],
			playTargetsInclude: ['discard']
		}
	}
];

function summarizeFailures(caseId: string, checks: { id: string; pass: boolean; details: string }[]): string {
	const failures = checks.filter((check) => !check.pass).map((check) => `- ${check.id}: ${check.details}`);
	if (failures.length === 0) {
		return `${caseId}: no failures`;
	}
	return `${caseId}\n${failures.join('\n')}`;
}

describe('ruleset golden evals', () => {
	it('golden_suite_includes_requested_sources', () => {
		expect(GOLDEN_CASES.map((entry) => entry.sourceUrl)).toEqual(
			expect.arrayContaining([SIX_CARD_GOLF_URL, CRIBBAGE_URL, SHITHEAD_URL])
		);
	});

	it('golden_case_compiles_runtime_bundle_v1', async () => {
		const result = await evaluateRulesetGoldenCase(GOLDEN_CASES[0]);
		expect(result.generated.draft.bundle.bundleVersion).toBe('runtime-bundle/v1');
		expect(result.generated.draft.bundle.uiProfile.schemaVersion).toBe('ui-profile/v0');
		expect(result.generated.draft.bundle.explain?.schemaVersion).toBe('ruleset-explain/v0');
	});

	it('golden_suite_passes_required_checks_for_all_cases', async () => {
		const suite = await evaluateRulesetGoldenSuite(GOLDEN_CASES);
		for (const result of suite.results) {
			expect(result.pass, summarizeFailures(result.caseId, result.checks)).toBe(true);
		}
		expect(suite.summary.passedCases).toBe(suite.summary.totalCases);
	});

	it('golden_suite_includes_bundle_confidence_checks', async () => {
		const suite = await evaluateRulesetGoldenSuite(GOLDEN_CASES);
		for (const result of suite.results) {
			expect(result.checks.some((check) => check.id.startsWith('confidence:'))).toBe(true);
			expect(result.confidence.checks.length).toBeGreaterThan(0);
		}
	});
});
