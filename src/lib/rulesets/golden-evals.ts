import { generateRulesetDraftFromInput, type GeneratedRulesetDraft } from './generator';
import {
	evaluateRulesetBundleConfidence,
	type RulesetConfidenceResult
} from './confidence';

type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface RulesetGoldenCaseDefinition {
	id: string;
	sourceUrl: string;
	sourceDocument: string;
	sourceContentType?: string;
	expected: {
		gameNameIncludes?: string[];
		players?: {
			minAtLeast?: number;
			minAtMost?: number;
			maxAtLeast?: number;
			maxAtMost?: number;
		};
		rounds?: {
			equals?: number;
			minAtLeast?: number;
			maxAtMost?: number;
		};
		zonesInclude?: string[];
		drawSourcesInclude?: string[];
		playTargetsInclude?: string[];
		scoring?: {
			lowScoreWins?: boolean;
			rankOverrides?: Partial<Record<Rank, number>>;
		};
	};
}

export interface RulesetGoldenCheckResult {
	id: string;
	pass: boolean;
	details: string;
}

export interface RulesetGoldenCaseResult {
	caseId: string;
	pass: boolean;
	checks: RulesetGoldenCheckResult[];
	generated: GeneratedRulesetDraft;
	confidence: RulesetConfidenceResult;
}

export interface RulesetGoldenSuiteResult {
	results: RulesetGoldenCaseResult[];
	summary: {
		totalCases: number;
		passedCases: number;
		failedCases: number;
		totalChecks: number;
		passedChecks: number;
		failedChecks: number;
	};
}

function pushCheck(
	checks: RulesetGoldenCheckResult[],
	id: string,
	pass: boolean,
	details: string
): void {
	checks.push({ id, pass, details });
}

function includesAll(expected: string[], actual: string[]): boolean {
	for (const item of expected) {
		if (!actual.includes(item)) {
			return false;
		}
	}
	return true;
}

function createFixtureFetch(definition: RulesetGoldenCaseDefinition): typeof fetch {
	return async (input) => {
		const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
		if (url !== definition.sourceUrl) {
			return new Response('', { status: 404 });
		}
		return new Response(definition.sourceDocument, {
			status: 200,
			headers: {
				'content-type': definition.sourceContentType ?? 'text/html; charset=utf-8'
			}
		});
	};
}

export async function evaluateRulesetGoldenCase(
	definition: RulesetGoldenCaseDefinition
): Promise<RulesetGoldenCaseResult> {
	const generated = await generateRulesetDraftFromInput(
		{
			source: {
				type: 'url',
				url: definition.sourceUrl
			}
		},
		{
			fetchImpl: createFixtureFetch(definition)
		}
	);

	const checks: RulesetGoldenCheckResult[] = [];
	const facts = generated.facts;
	const confidence = evaluateRulesetBundleConfidence(generated.draft.bundle);
	const explain = generated.draft.bundle.explain;

	pushCheck(
		checks,
		'bundle-version',
		generated.draft.bundle.bundleVersion === 'runtime-bundle/v1',
		`bundleVersion=${generated.draft.bundle.bundleVersion}`
	);
	pushCheck(
		checks,
		'ui-profile-version',
		generated.draft.bundle.uiProfile.schemaVersion === 'ui-profile/v0',
		`uiProfile=${generated.draft.bundle.uiProfile.schemaVersion}`
	);
	pushCheck(
		checks,
		'explain-version',
		explain?.schemaVersion === 'ruleset-explain/v0',
		`explain=${explain?.schemaVersion ?? 'missing'}`
	);
	pushCheck(
		checks,
		'explain-goal-non-empty',
		(explain?.goal.trim().length ?? 0) > 0,
		`goal=${explain?.goal ?? 'missing'}`
	);
	pushCheck(
		checks,
		'explain-source-type',
		explain?.source.type === facts.source.type,
		`explainSource=${explain?.source.type ?? 'missing'} factsSource=${facts.source.type}`
	);

	const expectedNameTokens = definition.expected.gameNameIncludes ?? [];
	for (const token of expectedNameTokens) {
		const pass = facts.gameName.toLowerCase().includes(token.toLowerCase());
		pushCheck(checks, `game-name-includes:${token}`, pass, `gameName=${facts.gameName}`);
	}

	const playerExpectation = definition.expected.players;
	if (playerExpectation) {
		if (playerExpectation.minAtLeast !== undefined) {
			pushCheck(
				checks,
				'players-min-at-least',
				facts.players.min >= playerExpectation.minAtLeast,
				`min=${facts.players.min} expected>=${playerExpectation.minAtLeast}`
			);
		}
		if (playerExpectation.minAtMost !== undefined) {
			pushCheck(
				checks,
				'players-min-at-most',
				facts.players.min <= playerExpectation.minAtMost,
				`min=${facts.players.min} expected<=${playerExpectation.minAtMost}`
			);
		}
		if (playerExpectation.maxAtLeast !== undefined) {
			pushCheck(
				checks,
				'players-max-at-least',
				facts.players.max >= playerExpectation.maxAtLeast,
				`max=${facts.players.max} expected>=${playerExpectation.maxAtLeast}`
			);
		}
		if (playerExpectation.maxAtMost !== undefined) {
			pushCheck(
				checks,
				'players-max-at-most',
				facts.players.max <= playerExpectation.maxAtMost,
				`max=${facts.players.max} expected<=${playerExpectation.maxAtMost}`
			);
		}
	}

	const roundsExpectation = definition.expected.rounds;
	if (roundsExpectation) {
		if (roundsExpectation.equals !== undefined) {
			pushCheck(
				checks,
				'rounds-equals',
				facts.rounds === roundsExpectation.equals,
				`rounds=${facts.rounds ?? 'undefined'} expected=${roundsExpectation.equals}`
			);
		}
		if (roundsExpectation.minAtLeast !== undefined) {
			pushCheck(
				checks,
				'rounds-min-at-least',
				(facts.rounds ?? 0) >= roundsExpectation.minAtLeast,
				`rounds=${facts.rounds ?? 'undefined'} expected>=${roundsExpectation.minAtLeast}`
			);
		}
		if (roundsExpectation.maxAtMost !== undefined) {
			pushCheck(
				checks,
				'rounds-max-at-most',
				(facts.rounds ?? Number.MAX_SAFE_INTEGER) <= roundsExpectation.maxAtMost,
				`rounds=${facts.rounds ?? 'undefined'} expected<=${roundsExpectation.maxAtMost}`
			);
		}
	}

	const expectedZones = definition.expected.zonesInclude ?? [];
	if (expectedZones.length > 0) {
		pushCheck(
			checks,
			'zones-include',
			includesAll(expectedZones, facts.zones),
			`zones=${facts.zones.join(', ')} expected include=${expectedZones.join(', ')}`
		);
	}

	const expectedDrawSources = definition.expected.drawSourcesInclude ?? [];
	if (expectedDrawSources.length > 0) {
		pushCheck(
			checks,
			'draw-sources-include',
			includesAll(expectedDrawSources, facts.turn.drawSources),
			`drawSources=${facts.turn.drawSources.join(', ')} expected include=${expectedDrawSources.join(', ')}`
		);
	}

	const expectedPlayTargets = definition.expected.playTargetsInclude ?? [];
	if (expectedPlayTargets.length > 0) {
		pushCheck(
			checks,
			'play-targets-include',
			includesAll(expectedPlayTargets, facts.turn.playTargets),
			`playTargets=${facts.turn.playTargets.join(', ')} expected include=${expectedPlayTargets.join(', ')}`
		);
	}

	const scoringExpectation = definition.expected.scoring;
	if (scoringExpectation?.lowScoreWins !== undefined) {
		pushCheck(
			checks,
			'scoring-low-score-wins',
			facts.scoring.lowScoreWins === scoringExpectation.lowScoreWins,
			`lowScoreWins=${facts.scoring.lowScoreWins} expected=${scoringExpectation.lowScoreWins}`
		);
	}
	if (scoringExpectation?.rankOverrides) {
		for (const [rank, expectedValue] of Object.entries(scoringExpectation.rankOverrides)) {
			pushCheck(
				checks,
				`scoring-rank-override:${rank}`,
				facts.scoring.rankOverrides[rank as Rank] === expectedValue,
				`${rank}=${facts.scoring.rankOverrides[rank as Rank]} expected=${expectedValue}`
			);
		}
	}

	for (const check of confidence.checks) {
		pushCheck(checks, `confidence:${check.id}`, check.pass, check.details);
	}

	return {
		caseId: definition.id,
		pass: checks.every((check) => check.pass),
		checks,
		generated,
		confidence
	};
}

export async function evaluateRulesetGoldenSuite(
	cases: RulesetGoldenCaseDefinition[]
): Promise<RulesetGoldenSuiteResult> {
	const results: RulesetGoldenCaseResult[] = [];
	for (const definition of cases) {
		results.push(await evaluateRulesetGoldenCase(definition));
	}

	const totalCases = results.length;
	const passedCases = results.filter((result) => result.pass).length;
	const totalChecks = results.reduce((total, result) => total + result.checks.length, 0);
	const passedChecks = results.reduce(
		(total, result) => total + result.checks.filter((check) => check.pass).length,
		0
	);

	return {
		results,
		summary: {
			totalCases,
			passedCases,
			failedCases: totalCases - passedCases,
			totalChecks,
			passedChecks,
			failedChecks: totalChecks - passedChecks
		}
	};
}
