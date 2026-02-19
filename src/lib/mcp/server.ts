import type { CardInput } from '$lib/scorekeeper/engine';
import {
	deriveGameState,
	createGameplayRulePack,
	type GameEvent,
	type GameplayRulePack,
	type GameplayState
} from '$lib/gameplay/engine';
import { buildRulesetPlayEvents } from '$lib/gameplay/play-surface-model';
import {
	compileRuleFactsToBundle,
	extractRuleFacts,
	generateRulesetDraftFromInput,
	ingestSource,
	type GenerateRulesetInput,
	type RuleFactsV0
} from '$lib/rulesets/generator';
import {
	generateRulesetDraftWithAgent,
	type GenerateRulesetWithAgentOptions
} from '$lib/rulesets/llm-agent';
import { evaluateRulesetBundleConfidence } from '$lib/rulesets/confidence';
import type { RulesetService } from '$lib/rulesets/service';
import type { RulesetRecord, RuntimeRulesetBundle } from '$lib/rulesets/types';
import rulePackSchema from '$lib/scorekeeper/rulepack-schema.json';
import { InMemoryMcpGameStore, type McpGameStore } from './game-store';
import type {
	McpGenerateRulesetArgs,
	McpGenerateRulesetResult,
	McpGetGameStateArgs,
	McpGetGameStateResult,
	McpModelSource,
	McpResourceDefinition,
	McpResourceReadResult,
	McpSessionSampler,
	McpStartGameArgs,
	McpStartGameResult,
	McpSubmitMoveArgs,
	McpSubmitMoveResult,
	McpSuggestMoveArgs,
	McpSuggestMoveResult,
	McpToolDefinition,
	McpToolName,
	McpValidateRulesetArgs,
	McpValidateRulesetResult
} from './types';

const TOOLS: McpToolDefinition[] = [
	{ name: 'generate_ruleset', description: 'Generate and persist a ruleset from URL or text input.' },
	{ name: 'validate_ruleset', description: 'Validate a stored ruleset or provided runtime bundle.' },
	{ name: 'list_rulesets', description: 'List persisted rulesets.' },
	{ name: 'get_ruleset', description: 'Get one persisted ruleset by id.' },
	{ name: 'start_game', description: 'Create a game snapshot from a ruleset.' },
	{ name: 'get_game_state', description: 'Read one game snapshot and derived gameplay state.' },
	{ name: 'submit_move', description: 'Append a gameplay event when valid for the game snapshot.' },
	{ name: 'suggest_move', description: 'Return a legal candidate move with explanation.' }
];

const STATIC_RESOURCES: McpResourceDefinition[] = [
	{
		uri: 'just-cards://docs/primitives-kb-v0',
		name: 'Primitives KB',
		description: 'Canonical primitive reference for rules generation and runtime behavior.',
		mimeType: 'text/markdown'
	},
	{
		uri: 'just-cards://docs/ui-profile-v0',
		name: 'UI Profile v0',
		description: 'Ruleset-driven play UI profile contract and validation semantics.',
		mimeType: 'text/markdown'
	},
	{
		uri: 'just-cards://schemas/rulepack-v0',
		name: 'RulePack JSON Schema',
		description: 'JSON schema for score rule pack validation.',
		mimeType: 'application/json'
	},
	{
		uri: 'just-cards://examples/ruleset/six-card-golf',
		name: 'Example Bundle: Six Card Golf',
		description: 'Sample runtime bundle generated from six-card-golf-style rules text.',
		mimeType: 'application/json'
	},
	{
		uri: 'just-cards://examples/ruleset/500-rum',
		name: 'Example Bundle: 500 Rum',
		description: 'Sample runtime bundle generated from 500-rum-style rules text.',
		mimeType: 'application/json'
	}
];

const PRIMITIVES_KB_SNAPSHOT = `# Primitives KB v0

Canonical runtime primitive catalog for:
1. gameplay transitions and zone moves,
2. scoring/event-log derivation,
3. ruleset generation output contracts.

Use this alongside gameplay-v0, ui-profile-v0, and rulepack-v0 schema resources when generating or repairing bundles.`;

const UI_PROFILE_SNAPSHOT = `# UI Profile v0

Ruleset-driven play UI contract for:
1. hand/table/seat card visibility,
2. quick targets and action controls,
3. draw visibility + draw pick mode behaviors.

Schema target: ui-profile/v0`;

const SIX_CARD_GOLF_EXAMPLE_TEXT = `
Six Card Golf
Players: 2 to 4
Deal six cards to each player in a 2x3 layout.
Two cards are face up and the rest are face down.
Draw from stock or discard pile and replace one layout card.
Lowest score wins after nine rounds.
`;

const RUMMY_500_EXAMPLE_TEXT = `
500 Rum
Players: 2 to 8
Deal seven cards to each player.
Stock is face down and top card starts discard pile face up.
Draw from stock or discard. Meld or discard after drawing.
First player to 500 points wins.
`;

function uniquePlayers(players: string[] | undefined): string[] {
	const normalized = (players ?? [])
		.map((player) => player.trim())
		.filter((player) => player.length > 0);
	const unique: string[] = [];
	for (const player of normalized) {
		if (!unique.includes(player)) {
			unique.push(player);
		}
	}
	return unique;
}

function preferredStartPhase(rulePack: GameplayRulePack): string {
	if (rulePack.phases.includes(rulePack.phaseAfterRoundStart)) {
		return rulePack.phaseAfterRoundStart;
	}
	return rulePack.startingPhase;
}

function actorIdForState(state: GameplayState): string | undefined {
	if (state.currentTurnIndex < 0 || state.currentTurnIndex >= state.turnOrder.length) {
		return undefined;
	}
	return state.turnOrder[state.currentTurnIndex];
}

function firstCardFromHand(state: GameplayState, playerId: string, handZone: string): CardInput | undefined {
	return state.playerZones[playerId]?.[handZone]?.[0];
}

function findCardById(cards: CardInput[], cardId: string): CardInput | undefined {
	for (const card of cards) {
		if ((card.tags ?? []).some((tag) => tag === `cid:${cardId}`)) {
			return card;
		}
	}
	return undefined;
}

function topCard(zoneCards: CardInput[]): CardInput | undefined {
	if (zoneCards.length === 0) {
		return undefined;
	}
	return zoneCards[zoneCards.length - 1];
}

function cloneRuntimeBundle(bundle: RuntimeRulesetBundle): RuntimeRulesetBundle {
	return structuredClone(bundle);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fallbackSessionFacts(
candidate: RuleFactsV0 | undefined,
baseline: RuleFactsV0
): RuleFactsV0 {
	if (!candidate || candidate.schemaVersion !== 'rule-facts/v0') {
		return baseline;
	}
	return candidate;
}

function summarizeValidationIssues(issues: string[]): string {
	return issues.length === 0 ? 'none' : issues.join(', ');
}

export interface CreateJustCardsMcpServerOptions {
	rulesetService: RulesetService;
	gameStore?: McpGameStore;
	sessionSampler?: McpSessionSampler;
	fetchImpl?: typeof fetch;
	serverAgent?: Pick<
		GenerateRulesetWithAgentOptions,
		'apiKey' | 'primaryModel' | 'fallbackModel'
	>;
}

export class JustCardsMcpServer {
	private readonly rulesetService: RulesetService;
	private readonly gameStore: McpGameStore;
	private readonly sessionSampler?: McpSessionSampler;
	private readonly fetchImpl?: typeof fetch;
	private readonly serverAgent: Pick<
		GenerateRulesetWithAgentOptions,
		'apiKey' | 'primaryModel' | 'fallbackModel'
	>;

	constructor(options: CreateJustCardsMcpServerOptions) {
		this.rulesetService = options.rulesetService;
		this.gameStore = options.gameStore ?? new InMemoryMcpGameStore();
		this.sessionSampler = options.sessionSampler;
		this.fetchImpl = options.fetchImpl;
		this.serverAgent = options.serverAgent ?? {};
	}

	listTools(): McpToolDefinition[] {
		return [...TOOLS];
	}

	async listResources(): Promise<McpResourceDefinition[]> {
		const resources: McpResourceDefinition[] = [...STATIC_RESOURCES];
		const rulesets = await this.rulesetService.list();
		for (const ruleset of rulesets) {
			resources.push({
				uri: `just-cards://rulesets/${ruleset.id}`,
				name: `Ruleset Snapshot: ${ruleset.name}`,
				description: `Stored runtime bundle snapshot for ruleset ${ruleset.id}.`,
				mimeType: 'application/json'
			});
		}

		const games = await this.gameStore.list();
		for (const game of games) {
			resources.push({
				uri: `just-cards://games/${game.gameId}`,
				name: `Game Snapshot: ${game.gameId}`,
				description: `Live game snapshot with events for ${game.gameId}.`,
				mimeType: 'application/json'
			});
		}

		return resources;
	}

	async readResource(uri: string): Promise<McpResourceReadResult> {
		if (uri === 'just-cards://docs/primitives-kb-v0') {
			return { uri, mimeType: 'text/markdown', text: PRIMITIVES_KB_SNAPSHOT };
		}
		if (uri === 'just-cards://docs/ui-profile-v0') {
			return { uri, mimeType: 'text/markdown', text: UI_PROFILE_SNAPSHOT };
		}
		if (uri === 'just-cards://schemas/rulepack-v0') {
			return { uri, mimeType: 'application/json', json: rulePackSchema };
		}
		if (uri === 'just-cards://examples/ruleset/six-card-golf') {
			return {
				uri,
				mimeType: 'application/json',
				json: cloneRuntimeBundle(
					compileRuleFactsToBundle(
						extractRuleFacts({
							sourceText: SIX_CARD_GOLF_EXAMPLE_TEXT
						})
					)
				)
			};
		}
		if (uri === 'just-cards://examples/ruleset/500-rum') {
			return {
				uri,
				mimeType: 'application/json',
				json: cloneRuntimeBundle(
					compileRuleFactsToBundle(
						extractRuleFacts({
							sourceText: RUMMY_500_EXAMPLE_TEXT
						})
					)
				)
			};
		}
		if (uri.startsWith('just-cards://rulesets/')) {
			const rulesetId = uri.slice('just-cards://rulesets/'.length).trim();
			const ruleset = await this.rulesetService.getById(rulesetId);
			if (!ruleset) {
				throw new Error(`Ruleset "${rulesetId}" not found`);
			}
			return { uri, mimeType: 'application/json', json: ruleset };
		}
		if (uri.startsWith('just-cards://games/')) {
			const gameId = uri.slice('just-cards://games/'.length).trim();
			const game = await this.gameStore.getById(gameId);
			if (!game) {
				throw new Error(`Game "${gameId}" not found`);
			}
			return { uri, mimeType: 'application/json', json: game };
		}

		throw new Error(`Unknown resource "${uri}"`);
	}

	async callTool(name: McpToolName, args: Record<string, unknown> = {}): Promise<unknown> {
		switch (name) {
			case 'generate_ruleset':
				return this.generateRuleset(args as unknown as McpGenerateRulesetArgs);
			case 'validate_ruleset':
				return this.validateRuleset(args as unknown as McpValidateRulesetArgs);
			case 'list_rulesets':
				return this.listRulesets();
			case 'get_ruleset':
				return this.getRuleset(args);
			case 'start_game':
				return this.startGame(args as unknown as McpStartGameArgs);
			case 'get_game_state':
				return this.getGameState(args as unknown as McpGetGameStateArgs);
			case 'submit_move':
				return this.submitMove(args as unknown as McpSubmitMoveArgs);
			case 'suggest_move':
				return this.suggestMove(args as unknown as McpSuggestMoveArgs);
			default:
				throw new Error(`Unknown tool "${name}"`);
		}
	}

	private async generateRuleset(args: McpGenerateRulesetArgs): Promise<McpGenerateRulesetResult> {
		const requestedModelSource: McpModelSource = args.model_source ?? 'session';
		const baseInput: GenerateRulesetInput = {
			source: args.source,
			...(args.name ? { name: args.name } : {}),
			...(args.notes ? { notes: args.notes } : {})
		};

		let fallbackReason: string | undefined;
		if (requestedModelSource === 'session') {
			try {
				const generated = await this.generateWithSessionSampler(baseInput);
				const ruleset = await this.rulesetService.createDraft(generated.draft);
				return {
					ruleset,
					facts: generated.facts,
					diagnostics: generated.diagnostics,
					generation: {
						requestedModelSource,
						usedModelSource: 'session',
						deterministicFallback: false
					}
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : 'session sampler failed';
				fallbackReason = `session:${message}`;
			}
		}

		try {
			const generated = await generateRulesetDraftWithAgent(baseInput, {
				fetchImpl: this.fetchImpl,
				...this.serverAgent
			});
			const ruleset = await this.rulesetService.createDraft(generated.draft);
			return {
				ruleset,
				facts: generated.facts,
				diagnostics: generated.diagnostics,
				generation: {
					requestedModelSource,
					usedModelSource: 'server',
					deterministicFallback: generated.pipeline.strategy === 'deterministic',
					...(fallbackReason ? { fallbackReason } : {}),
					pipeline: generated.pipeline
				}
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'server model generation failed';
			const deterministic = await generateRulesetDraftFromInput(baseInput, {
				fetchImpl: this.fetchImpl
			});
			const ruleset = await this.rulesetService.createDraft(deterministic.draft);
			return {
				ruleset,
				facts: deterministic.facts,
				diagnostics: deterministic.diagnostics,
				generation: {
					requestedModelSource,
					usedModelSource: 'server',
					deterministicFallback: true,
					fallbackReason: fallbackReason
						? `${fallbackReason}; server:${message}`
						: `server:${message}`
				}
			};
		}
	}

	private async generateWithSessionSampler(baseInput: GenerateRulesetInput) {
		if (!this.sessionSampler) {
			throw new Error('session sampler is not configured');
		}
		const source = await ingestSource(baseInput.source, { fetchImpl: this.fetchImpl });
		const baselineFacts = extractRuleFacts({
			sourceText: source.text,
			sourceType: source.type,
			sourceUrl: source.url
		});
		const sampledFacts = await this.sessionSampler({
			sourceText: source.text,
			sourceType: source.type,
			sourceUrl: source.url,
			baselineFacts
		});
		const facts = fallbackSessionFacts(sampledFacts, baselineFacts);
		const bundle = compileRuleFactsToBundle(facts);
		const notes = [
			...(baseInput.notes?.trim() ? [baseInput.notes.trim()] : []),
			'Generation strategy: session sampling.'
		].join(' ');
		return {
			facts,
			diagnostics: [...facts.diagnostics],
			draft: {
				name: baseInput.name?.trim() || facts.gameName,
				origin: 'llm' as const,
				...(source.url ? { sourceUrl: source.url } : {}),
				...(notes.trim().length > 0 ? { notes: notes.trim() } : {}),
				bundle
			}
		};
	}

	private async validateRuleset(args: McpValidateRulesetArgs): Promise<McpValidateRulesetResult> {
		let bundle: RuntimeRulesetBundle | undefined = args.bundle;
		if (!bundle && args.ruleset_id) {
			const ruleset = await this.rulesetService.getById(args.ruleset_id);
			if (!ruleset) {
				throw new Error(`Ruleset "${args.ruleset_id}" not found`);
			}
			bundle = ruleset.bundle;
		}
		if (!bundle) {
			throw new Error('validate_ruleset requires ruleset_id or bundle');
		}

		const confidence = evaluateRulesetBundleConfidence(bundle);
		const issues = confidence.checks
			.filter((check) => !check.pass)
			.map((check) => `${check.id}: ${check.details}`);
		return {
			pass: confidence.pass,
			checks: confidence.checks,
			issues
		};
	}

	private async listRulesets(): Promise<{ rulesets: RulesetRecord[] }> {
		return {
			rulesets: await this.rulesetService.list()
		};
	}

	private async getRuleset(args: Record<string, unknown>): Promise<{ ruleset: RulesetRecord }> {
		const rulesetId = typeof args.ruleset_id === 'string' ? args.ruleset_id.trim() : '';
		if (!rulesetId) {
			throw new Error('get_ruleset requires ruleset_id');
		}
		const ruleset = await this.rulesetService.getById(rulesetId);
		if (!ruleset) {
			throw new Error(`Ruleset "${rulesetId}" not found`);
		}
		return { ruleset };
	}

	private async startGame(args: McpStartGameArgs): Promise<McpStartGameResult> {
		const rulesetId = args.ruleset_id?.trim();
		if (!rulesetId) {
			throw new Error('start_game requires ruleset_id');
		}
		const ruleset = await this.rulesetService.getById(rulesetId);
		if (!ruleset) {
			throw new Error(`Ruleset "${rulesetId}" not found`);
		}

		const players = uniquePlayers(args.players);
		const resolvedPlayers = players.length >= 2 ? players : ['You', 'Riv', 'Mina'];
		const events = buildRulesetPlayEvents(resolvedPlayers, ruleset.bundle);
		const rulePack = ruleset.bundle.runtimeRulePack.gameplayRulePack ?? createGameplayRulePack();
		const state = deriveGameState(events, rulePack, { strictValidation: true });
		if ((state.validationIssues?.length ?? 0) > 0) {
			throw new Error(`Unable to start game: ${summarizeValidationIssues(state.validationIssues?.map((issue) => issue.code) ?? [])}`);
		}
		const snapshot = await this.gameStore.create({
			gameId: args.game_id,
			rulesetId: ruleset.id,
			players: resolvedPlayers,
			events
		});

		return {
			gameId: snapshot.gameId,
			rulesetId: ruleset.id,
			players: resolvedPlayers,
			eventCount: events.length,
			phase: state.phase,
			currentTurnPlayer: actorIdForState(state)
		};
	}

	private async getGameState(args: McpGetGameStateArgs): Promise<McpGetGameStateResult> {
		const gameId = args.game_id?.trim();
		if (!gameId) {
			throw new Error('get_game_state requires game_id');
		}
		const snapshot = await this.gameStore.getById(gameId);
		if (!snapshot) {
			throw new Error(`Game "${gameId}" not found`);
		}
		const ruleset = await this.rulesetService.getById(snapshot.rulesetId);
		if (!ruleset) {
			throw new Error(`Ruleset "${snapshot.rulesetId}" not found`);
		}
		const rulePack = ruleset.bundle.runtimeRulePack.gameplayRulePack ?? createGameplayRulePack();
		const state = deriveGameState(snapshot.events, rulePack, { strictValidation: true });

		return {
			gameId: snapshot.gameId,
			rulesetId: snapshot.rulesetId,
			players: [...snapshot.players],
			events: structuredClone(snapshot.events),
			state
		};
	}

	private async submitMove(args: McpSubmitMoveArgs): Promise<McpSubmitMoveResult> {
		const gameId = args.game_id?.trim();
		if (!gameId) {
			throw new Error('submit_move requires game_id');
		}
		if (!isRecord(args.event) || typeof args.event.type !== 'string') {
			throw new Error('submit_move requires a valid gameplay event object');
		}
		const snapshot = await this.gameStore.getById(gameId);
		if (!snapshot) {
			throw new Error(`Game "${gameId}" not found`);
		}
		const ruleset = await this.rulesetService.getById(snapshot.rulesetId);
		if (!ruleset) {
			throw new Error(`Ruleset "${snapshot.rulesetId}" not found`);
		}

		const candidateEvents = [...snapshot.events, args.event as GameEvent];
		const rulePack = ruleset.bundle.runtimeRulePack.gameplayRulePack ?? createGameplayRulePack();
		const candidateState = deriveGameState(candidateEvents, rulePack, { strictValidation: true });
		if ((candidateState.validationIssues?.length ?? 0) > 0) {
			throw new Error(
				`submit_move rejected: ${summarizeValidationIssues(
					candidateState.validationIssues?.map((issue) => issue.code) ?? []
				)}`
			);
		}
		const updated = await this.gameStore.setEvents(gameId, candidateEvents);
		return {
			accepted: true,
			gameId: updated.gameId,
			eventCount: updated.events.length,
			phase: candidateState.phase
		};
	}

	private async suggestMove(args: McpSuggestMoveArgs): Promise<McpSuggestMoveResult> {
		const gameId = args.game_id?.trim();
		if (!gameId) {
			throw new Error('suggest_move requires game_id');
		}
		const snapshot = await this.gameStore.getById(gameId);
		if (!snapshot) {
			throw new Error(`Game "${gameId}" not found`);
		}
		const ruleset = await this.rulesetService.getById(snapshot.rulesetId);
		if (!ruleset) {
			throw new Error(`Ruleset "${snapshot.rulesetId}" not found`);
		}

		const rulePack = ruleset.bundle.runtimeRulePack.gameplayRulePack ?? createGameplayRulePack();
		const state = deriveGameState(snapshot.events, rulePack, { strictValidation: true });
		if ((state.validationIssues?.length ?? 0) > 0) {
			throw new Error(
				`Cannot suggest move for invalid state: ${summarizeValidationIssues(
					state.validationIssues?.map((issue) => issue.code) ?? []
				)}`
			);
		}

		const actorId = actorIdForState(state);
		if (!actorId) {
			return {
				gameId,
				event: { type: 'advance_turn' },
				reason: 'No active player found; advance turn as a safe fallback.'
			};
		}

		const handZone = rulePack.handZoneName;
		const policy =
			rulePack.turnActionPolicy?.enabled &&
			rulePack.turnActionPolicy.allowedPhases.includes(state.phase)
				? rulePack.turnActionPolicy
				: undefined;
		const pendingDraw = state.turnActionState?.pendingDrawByPlayer?.[actorId] === true;

		if (policy && !pendingDraw) {
			for (const zoneId of policy.drawFromZoneAllowlist) {
				const card = topCard(state.tableZones[zoneId] ?? []);
				if (!card) {
					continue;
				}
				return {
					gameId,
					event: {
						type: 'zone_move',
						actorId,
						from: { kind: 'table', zone: zoneId },
						to: { kind: 'player', playerId: actorId, zone: handZone },
						cards: [card]
					},
					reason: `Draw from ${zoneId} to start the turn flow.`
				};
			}
		}

		if (policy && pendingDraw) {
			const handCards = state.playerZones[actorId]?.[handZone] ?? [];
			let card = firstCardFromHand(state, actorId, handZone);
			const requiredCardId = state.turnActionState?.requiredResolveCardIdByPlayer?.[actorId];
			if (requiredCardId) {
				card = findCardById(handCards, requiredCardId) ?? card;
			}
			const requiredTargets = state.turnActionState?.requiredResolveTargetZonesByPlayer?.[actorId] ?? [];
			const targetZone =
				requiredTargets.find((zoneId) => policy.resolveToZoneAllowlist.includes(zoneId)) ??
				policy.resolveToZoneAllowlist[0];
			if (card && targetZone) {
				return {
					gameId,
					event: {
						type: 'zone_move',
						actorId,
						from: { kind: 'player', playerId: actorId, zone: handZone },
						to: { kind: 'table', zone: targetZone },
						cards: [card]
					},
					reason: `Resolve pending draw by moving a hand card to ${targetZone}.`
				};
			}
		}

		const fallbackCard = firstCardFromHand(state, actorId, handZone);
		const fallbackTarget = rulePack.zoneMovePolicy.targetZoneAllowlist.find(
			(zoneId) => zoneId !== handZone
		);
		if (fallbackCard && fallbackTarget) {
			return {
				gameId,
				event: {
					type: 'zone_move',
					actorId,
					from: { kind: 'player', playerId: actorId, zone: handZone },
					to: { kind: 'table', zone: fallbackTarget },
					cards: [fallbackCard]
				},
				reason: `Play a fallback legal move to ${fallbackTarget}.`
			};
		}

		return {
			gameId,
			event: { type: 'advance_turn' },
			reason: 'No legal draw/resolve move found; advance turn.'
		};
	}
}

export function createJustCardsMcpServer(options: CreateJustCardsMcpServerOptions): JustCardsMcpServer {
	return new JustCardsMcpServer(options);
}
