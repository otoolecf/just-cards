import {
	compileRuleFactsToBundle,
	extractRuleFacts,
	ingestSource,
	type GenerateRulesetInput,
	type GenerateRulesetOptions,
	type GeneratedRulesetDraft,
	type RuleFactsV0
} from './generator';
import {
	extractionFromBundle,
	extractionInstructions,
	extractionSchema,
	factsFromExtraction,
	parseExtraction,
	parseReview,
	reviewInstructions,
	reviewSchema,
	type RuleExtraction,
	type SourceReview
} from './extraction-contract';
import { buildGenerationReport } from './generation-report';
import type { JsonSchema } from '../gameplay/policy-schema';
import type { RuntimeRulesetBundle } from './types';
export interface ModelRequest {
	stage: 'extract' | 'repair' | 'review';
	instructions: string;
	schema: JsonSchema;
	sourceText: string;
	candidate?: unknown;
	issues?: string[];
}
export type RulesetModel = (request: ModelRequest) => Promise<unknown>;
interface LlmAttempt {
	model: string;
	stage: ModelRequest['stage'];
	accepted: boolean;
	note: string;
}
export interface RulesetGenerationPipelineReport {
	strategy: 'llm' | 'deterministic';
	model?: string;
	reason: string;
	attempts: LlmAttempt[];
}
export interface GeneratedRulesetDraftWithPipeline extends GeneratedRulesetDraft {
	pipeline: RulesetGenerationPipelineReport;
}
export interface GenerateRulesetWithAgentOptions extends GenerateRulesetOptions {
	apiKey?: string;
	primaryModel?: string;
	fallbackModel?: string;
	maxSourceChars?: number;
	/** Session sampling / test transport; same contracts, validation and review as HTTP model calls. */
	model?: RulesetModel;
}
function httpModel(options: GenerateRulesetWithAgentOptions, model: string): RulesetModel {
	return async (request) => {
		const response = await (options.fetchImpl ?? globalThis.fetch)(
			'https://api.openai.com/v1/chat/completions',
			{
				method: 'POST',
				headers: { 'content-type': 'application/json', authorization: `Bearer ${options.apiKey}` },
				signal: AbortSignal.timeout(45000),
				body: JSON.stringify({
					model,
					...(/^gpt-5-(?:nano|mini)(?:-|$)/.test(model) ? { reasoning_effort: 'low' } : {}),
					max_completion_tokens: request.stage === 'review' ? 4000 : 12000,
					response_format: {
						type: 'json_schema',
						json_schema: {
							name: request.stage === 'review' ? 'rules_source_review' : 'rule_extraction',
							strict: true,
							schema: request.schema
						}
					},
					messages: [
						{ role: 'system', content: request.instructions },
						{
							role: 'user',
							content: JSON.stringify({
								sourceText: request.sourceText,
								...(request.candidate ? { candidate: request.candidate } : {}),
								...(request.issues ? { issues: request.issues } : {}),
								...(request.stage === 'review' ? { primitiveSchema: extractionSchema } : {})
							})
						}
					]
				})
			}
		);
		// Never echo provider response bodies (they may include credentials or source text).
		if (!response.ok) throw new Error(`Model request failed (HTTP ${response.status})`);
		const payload = (await response.json()) as {
			choices?: { finish_reason?: string; message?: { refusal?: string; content?: string } }[];
		};
		const choice = payload.choices?.[0];
		if (choice?.message?.refusal) throw new Error('Model declined this extraction');
		if (choice?.finish_reason && choice.finish_reason !== 'stop')
			throw new Error('Model response was incomplete');
		const content = choice?.message?.content;
		if (typeof content !== 'string' || content.length > 100000)
			throw new Error('Model returned no valid JSON content');
		try {
			return JSON.parse(content);
		} catch {
			throw new Error('Model returned invalid JSON');
		}
	};
}
function output(
	input: GenerateRulesetInput,
	facts: RuleFactsV0,
	bundle: RuntimeRulesetBundle,
	pipeline: RulesetGenerationPipelineReport
): GeneratedRulesetDraftWithPipeline {
	const diagnostics = [
		...facts.diagnostics,
		`Generation strategy: ${pipeline.strategy}.`,
		...(bundle.generationReport?.blockers ?? [])
	];
	if (bundle.explain) bundle.explain.diagnostics = diagnostics;
	return {
		facts,
		diagnostics,
		pipeline,
		draft: {
			name: input.name?.trim() || facts.gameName,
			origin: pipeline.strategy === 'llm' ? 'llm' : 'import',
			...(facts.source.url ? { sourceUrl: facts.source.url } : {}),
			...(input.notes ? { notes: input.notes } : {}),
			bundle
		}
	};
}
export async function generateRulesetDraftWithAgent(
	input: GenerateRulesetInput,
	options: GenerateRulesetWithAgentOptions = {}
): Promise<GeneratedRulesetDraftWithPipeline> {
	if (!input.source || !['url', 'text'].includes(input.source.type))
		throw new Error('source.type must be "url" or "text"');
	const source = await ingestSource(input.source, options);
	const factsSource: RuleFactsV0['source'] = {
		type: source.type,
		...(source.url ? { url: source.url } : {})
	};
	const attempts: LlmAttempt[] = [];
	const configured = !!options.model || !!options.apiKey?.trim();
	const models = options.model
		? ['session']
		: Array.from(
				new Set([
					options.primaryModel?.trim() || 'gpt-5-mini',
					options.fallbackModel?.trim() || 'gpt-5-mini'
				])
			);
	// A failed/unsupported extracted candidate is retained for inspection, never silently replaced by a family guess.
	let last: GeneratedRulesetDraftWithPipeline | undefined;
	if (configured)
		for (const model of models) {
			const call = options.model ?? httpModel(options, model);
			let candidate: unknown,
				issues: string[] = [];
			for (let pass = 0; pass < 2; pass++) {
				const stage = pass === 0 ? 'extract' : 'repair';
				let extracted: RuleExtraction;
				try {
					candidate = await call({
						stage,
						instructions: extractionInstructions,
						schema: extractionSchema,
						sourceText: source.text,
						...(pass ? { candidate, issues } : {})
					});
					extracted = parseExtraction(candidate);
					attempts.push({
						model,
						stage,
						accepted: true,
						note: 'Executable extraction contract passed.'
					});
				} catch (e) {
					issues = [e instanceof Error ? e.message : 'Extraction failed'];
					attempts.push({ model, stage, accepted: false, note: issues[0] });
					continue;
				}
				let review: SourceReview;
				try {
					review = parseReview(
						await call({
							stage: 'review',
							instructions: reviewInstructions,
							schema: reviewSchema,
							sourceText: source.text,
							candidate
						})
					);
					attempts.push({
						model,
						stage: 'review',
						accepted: review.verdict === 'consistent',
						note: review.summary
					});
				} catch {
					review = {
						verdict: 'unavailable',
						issues: ['The separate source review could not be completed.'],
						summary: 'Review the extracted behavior against your source before accepting.'
					};
					attempts.push({
						model,
						stage: 'review',
						accepted: false,
						note: 'Source review unavailable.'
					});
				}
				const facts = factsFromExtraction(extracted, factsSource);
				facts.diagnostics.push(...(source.diagnostics ?? []));
				const bundle = compileRuleFactsToBundle(facts);
				bundle.generationReport = buildGenerationReport(
					bundle,
					extracted,
					source.text,
					review,
					'llm',
					model
				);
				last = output(input, facts, bundle, {
					strategy: 'llm',
					model,
					reason: 'llm-success',
					attempts: [...attempts]
				});
				if (bundle.generationReport.status !== 'blocked') return last;
				issues = bundle.generationReport.blockers;
			}
			if (last) return last;
		}
	const baseline = extractRuleFacts({
		sourceText: source.text,
		sourceType: source.type,
		sourceUrl: source.url
	});
	baseline.diagnostics.push(
		...(source.diagnostics ?? []),
		configured
			? 'Model extraction failed; this is an unreviewed heuristic draft.'
			: 'No model is configured; this is an unreviewed heuristic draft.'
	);
	const bundle = compileRuleFactsToBundle(baseline);
	const e = extractionFromBundle(bundle);
	// Normalize null optional fields using the same schema as model output.
	const normalized = parseExtraction(e);
	bundle.generationReport = buildGenerationReport(
		bundle,
		normalized,
		source.text,
		{
			verdict: 'unavailable',
			issues: [],
			summary: 'No AI source review was completed. Check every proposed rule against the source.'
		},
		'deterministic'
	);
	return output(input, baseline, bundle, {
		strategy: 'deterministic',
		reason: configured ? 'llm-fallback' : 'missing-api-key',
		attempts
	});
}
