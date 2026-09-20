import { extractionResource } from '$lib/rulesets/extraction-contract';
import { evaluateTableBehavior } from '$lib/rulesets/behavioral-validation';
import { canPlayRuleset } from '$lib/rulesets/generation-report';
import type { CardInput } from '$lib/scorekeeper/engine';
import {
	deriveGameState,
	createGameplayRulePack,
	type GameEvent,
	type GameplayRulePack,
	type GameplayState
} from '$lib/gameplay/engine';
import {
	buildPlaySurfaceView,
	buildRulesetPlayEvents
} from '$lib/gameplay/play-surface-model';
import {
	drawTopAllowedZoneIdsFromUiProfile,
	playSurfaceProfileFromUiProfile,
	quickPlayZoneIdsFromUiProfile,
	seatCardsProfileFromUiProfile,
	visibleZones,
	zoneHintMap,
	zoneLabelMap
} from '$lib/gameplay/play-surface-profiles';
import {
	compileRuleFactsToBundle,
	extractRuleFacts,
	type GenerateRulesetInput
} from '$lib/rulesets/generator';
import {
	generateRulesetDraftWithAgent,
	type GenerateRulesetWithAgentOptions
} from '$lib/rulesets/llm-agent';
import { evaluateRulesetBundleConfidence } from '$lib/rulesets/confidence';
import type { RulesetService } from '$lib/rulesets/service';
import type { RulesetRecord, RuntimeRulesetBundle } from '$lib/rulesets/types';
import rulePackSchema from '$lib/scorekeeper/rulepack-schema.json';
import { buildSessionStateView } from '$lib/session/session-store';
import {
	getModeWinDirection,
	sortStandingsByDirection
} from '$lib/session/score-session-commands';
import { logServerEvent } from '$lib/server/log';
import { InMemoryMcpAuditLog, type McpAuditLog } from './audit-log';
import { InMemoryMcpGameStore, type McpGameStore } from './game-store';
import type {
	McpAiMode,
	McpAiSeatConfig,
	McpGenerationBudget,
	McpGenerateRulesetArgs,
	McpGenerateRulesetResult,
	McpGetGameStateArgs,
	McpGetGameStateResult,
	McpModelSource,
	McpResourceDefinition,
	McpResourceReadResult,
	McpRenderGameTableArgs,
	McpRenderGameTableResult,
	McpRenderScoreLeaderboardArgs,
	McpRenderScoreLeaderboardResult,
	McpSessionSampler,
	ScoreWinDirection,
	McpStartGameArgs,
	McpStartGameResult,
	McpSubmitMoveArgs,
	McpSubmitMoveResult,
	McpSuggestMoveArgs,
	McpSuggestMoveResult,
	McpToolDefinition,
	McpToolCallMeta,
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
	{ name: 'suggest_move', description: 'Return a legal candidate move with explanation.' },
	{
		name: 'render_game_table',
		description: 'Render cards/hands/table snapshot payload for MCP Apps clients.',
		appUi: {
			resourceUri: 'ui://just-cards/apps/play-table/v1',
			outputTemplate: 'ui://just-cards/apps/play-table/v1',
			invokingText: 'Rendering play table...',
			invokedText: 'Play table ready.'
		}
	},
	{
		name: 'render_score_leaderboard',
		description: 'Render ranked standings payload for MCP Apps clients.',
		appUi: {
			resourceUri: 'ui://just-cards/apps/score-leaderboard/v1',
			outputTemplate: 'ui://just-cards/apps/score-leaderboard/v1',
			invokingText: 'Rendering leaderboard...',
			invokedText: 'Leaderboard ready.'
		}
	}
];

const STATIC_RESOURCES: McpResourceDefinition[] = [
	{uri:'just-cards://schemas/rule-extraction-v1', name:'Executable rule extraction v1', description:'Shared strict schema and primitive descriptions used by website, MCP and runtime validation.',mimeType:'application/json'},
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
	},
	{
		uri: 'just-cards://audit/recent',
		name: 'Recent MCP Audit Events',
		description: 'Recent MCP tool-call audit entries (sanitized).',
		mimeType: 'application/json'
	},
	{
		uri: 'ui://just-cards/apps/play-table/v1',
		name: 'MCP App: Play Table',
		description: 'Embedded chat UI template for play-table cards/hands/table rendering.',
		mimeType: 'text/html'
	},
	{
		uri: 'ui://just-cards/apps/score-leaderboard/v1',
		name: 'MCP App: Score Leaderboard',
		description: 'Embedded chat UI template for score standings rendering.',
		mimeType: 'text/html'
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

const PLAY_TABLE_APP_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Just Cards Play Table</title>
  <style>
    :root { color-scheme: light; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
    body { margin: 0; padding: 12px; background: #f4faf9; color: #1e293b; }
    .wrap { border: 1px solid #c9d7e8; border-radius: 12px; background: #fff; padding: 12px; box-shadow: 0 8px 20px rgba(20, 45, 84, .08); }
    h1 { margin: 0 0 8px; font-size: 18px; line-height: 1.2; }
    h2 { margin: 12px 0 8px; font-size: 14px; }
    .section-title { margin: 12px 0 6px; font-size: 13px; font-weight: 700; }
    .meta { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 6px; font-size: 13px; }
    .zone, .seat { border: 1px solid #dbe6f3; border-radius: 10px; padding: 8px; margin: 8px 0; }
    .cards { display: flex; gap: 6px; flex-wrap: wrap; }
    .card { border: 1px solid #cfdceb; border-radius: 8px; padding: 6px 8px; min-width: 32px; min-height: 44px; text-align: center; background: #f8fbff; font-weight: 700; }
    .card-button { cursor: pointer; }
    .card-button.active { border-color: #2e8b87; box-shadow: inset 0 0 0 1px #2e8b87; background: #ebfbf8; }
    .actions { display: flex; gap: 6px; flex-wrap: wrap; margin: 6px 0; }
    .action { border: 1px solid #c9d7e8; border-radius: 999px; min-height: 44px; padding: 8px 12px; background: #f8fbff; color: #213247; font-weight: 600; cursor: pointer; }
    .action:disabled { opacity: .55; cursor: default; }
    .muted { color: #5b6b82; font-size: 12px; }
    .empty { color: #66748a; font-size: 13px; }
    .status { margin-top: 8px; font-size: 13px; color: #334a67; }
  </style>
</head>
<body>
  <div class="wrap" id="just-cards-mcp-app-play-table">
    <h1>Play Table</h1>
    <div class="empty">Waiting for render_game_table payload...</div>
  </div>
  <script>
    const TOOL_RENDER = 'render_game_table';
    const TOOL_SUBMIT = 'submit_move';
    const state = {
      payload: null,
      selectedCardKey: '',
      status: '',
      pollId: null,
      busy: false
    };

    function parseMaybeJson(value) {
      if (typeof value !== 'string') return null;
      try { return JSON.parse(value); } catch { return null; }
    }
    function payloadFromContentArray(content, viewType) {
      if (!Array.isArray(content)) return null;
      for (const entry of content) {
        if (entry && entry.type === 'text') {
          const parsed = parseMaybeJson(entry.text);
          if (parsed && parsed.viewType === viewType) return parsed;
        }
      }
      return null;
    }

    function payloadFromToolResult(result, viewType) {
      if (!result) return null;
      if (result.viewType === viewType) return result;
      if (result.structuredContent && result.structuredContent.viewType === viewType) {
        return result.structuredContent;
      }
      const fromDirectContent = payloadFromContentArray(result.content, viewType);
      if (fromDirectContent) return fromDirectContent;
      const fromWrappedContent = payloadFromContentArray(result.result && result.result.content, viewType);
      if (fromWrappedContent) return fromWrappedContent;
      return null;
    }

    function extractPayload() {
      const globalAny = window;
      const candidates = [
        globalAny.__MCP_TOOL_RESULT__,
        globalAny.openai?.toolResult,
        globalAny.openai?.toolOutput,
        globalAny.mcp?.toolResult
      ];
      for (const candidate of candidates) {
        const payload = payloadFromToolResult(candidate, 'play_table/v1');
        if (payload) return payload;
      }
      return null;
    }

    function zoneLabel(zoneId) {
      const payload = state.payload;
      if (!payload) return zoneId;
      if (payload.zoneLabels && payload.zoneLabels[zoneId]) return payload.zoneLabels[zoneId];
      const tableZones = Array.isArray(payload.surface && payload.surface.tableZones) ? payload.surface.tableZones : [];
      const zone = tableZones.find((entry) => entry.zoneId === zoneId);
      return zone && zone.label ? zone.label : zoneId;
    }

    function cardFromCidOrCard(card) {
      const tags = Array.isArray(card && card.tags) ? card.tags : [];
      const cidTag = tags.find((tag) => typeof tag === 'string' && tag.startsWith('cid:'));
      if (cidTag) {
        return { tags: [cidTag] };
      }
      const moveCard = {};
      if (card && typeof card.rank === 'string') moveCard.rank = card.rank;
      if (card && typeof card.suit === 'string') moveCard.suit = card.suit;
      if (tags.length > 0) moveCard.tags = tags.slice();
      return moveCard;
    }

    function handCardsMarkup(payload) {
      const cards = Array.isArray(payload.surface && payload.surface.hand && payload.surface.hand.cards) ? payload.surface.hand.cards : [];
      if (cards.length === 0) return '<div class="empty">No cards</div>';
      return '<div class="cards">' + cards.map((card) => {
        const key = String(card.key || '');
        const active = state.selectedCardKey === key ? ' active' : '';
        const label = String(card.label || '??');
        return '<button class="card card-button' + active + '" data-hand-key="' + key + '">' + label + '</button>';
      }).join('') + '</div>';
    }

    function quickTargetsMarkup(payload) {
      const targets = Array.isArray(payload.quickPlayTargets) ? payload.quickPlayTargets : [];
      if (targets.length === 0) return '';
      return '<div class="section-title">Play selected card to:</div><div class="actions">' + targets.map((zoneId) => {
        return '<button class="action" data-target-zone="' + zoneId + '"' + (state.busy ? ' disabled' : '') + '>' + zoneLabel(zoneId) + '</button>';
      }).join('') + '</div>';
    }

    function drawActionsMarkup(payload) {
      const zones = Array.isArray(payload.drawTopZones) ? payload.drawTopZones : [];
      if (zones.length === 0) return '';
      return '<div class="section-title">Draw top from:</div><div class="actions">' + zones.map((zoneId) => {
        return '<button class="action" data-draw-zone="' + zoneId + '"' + (state.busy ? ' disabled' : '') + '>' + zoneLabel(zoneId) + '</button>';
      }).join('') + '</div>';
    }

    function cardsMarkup(cards) {
      if (!Array.isArray(cards) || cards.length === 0) return '<div class="empty">No cards</div>';
      return '<div class="cards">' + cards.map((card) => '<div class="card">' + String(card.label || '??') + '</div>').join('') + '</div>';
    }

    async function callTool(name, args) {
      if (!window.openai || typeof window.openai.callTool !== 'function') {
        return null;
      }
      return window.openai.callTool(name, args);
    }

    async function refreshFromServer(silent) {
      const payload = state.payload;
      if (!payload) return;
      const result = await callTool(TOOL_RENDER, {
        game_id: payload.gameId,
        viewer_player_id: payload.viewerPlayerId
      });
      const nextPayload = payloadFromToolResult(result, 'play_table/v1');
      if (nextPayload) {
        state.payload = nextPayload;
        if (!silent) state.status = 'Updated.';
        renderCurrent();
      }
    }

    function selectedHandCard() {
      const payload = state.payload;
      if (!payload) return null;
      const cards = Array.isArray(payload.surface && payload.surface.hand && payload.surface.hand.cards) ? payload.surface.hand.cards : [];
      return cards.find((entry) => String(entry.key || '') === state.selectedCardKey) || null;
    }

    async function submitZoneMove(event) {
      const payload = state.payload;
      if (!payload) return;
      state.busy = true;
      state.status = 'Submitting move...';
      renderCurrent();
      await callTool(TOOL_SUBMIT, {
        game_id: payload.gameId,
        event: event
      });
      state.busy = false;
      await refreshFromServer(true);
    }

    async function onTargetPlay(zoneId) {
      const payload = state.payload;
      if (!payload) return;
      const selected = selectedHandCard();
      if (!selected) {
        state.status = 'Select a hand card first.';
        renderCurrent();
        return;
      }
      const handZoneId = String(payload.surface && payload.surface.hand && payload.surface.hand.zoneId || 'hand');
      const moveCard = cardFromCidOrCard(selected);
      await submitZoneMove({
        type: 'zone_move',
        actorId: payload.viewerPlayerId,
        from: { kind: 'player', playerId: payload.viewerPlayerId, zone: handZoneId },
        to: { kind: 'table', zone: zoneId },
        cards: [moveCard]
      });
      state.selectedCardKey = '';
      state.status = 'Moved card to ' + zoneLabel(zoneId) + '.';
      renderCurrent();
    }

    async function onDrawTop(zoneId) {
      const payload = state.payload;
      if (!payload) return;
      const tableZones = Array.isArray(payload.surface && payload.surface.tableZones) ? payload.surface.tableZones : [];
      const zone = tableZones.find((entry) => entry.zoneId === zoneId);
      const cards = Array.isArray(zone && zone.cards) ? zone.cards : [];
      const topCard = cards.length > 0 ? cards[cards.length - 1] : null;
      if (!topCard) {
        state.status = 'No cards in ' + zoneLabel(zoneId) + '.';
        renderCurrent();
        return;
      }
      const handZoneId = String(payload.surface && payload.surface.hand && payload.surface.hand.zoneId || 'hand');
      await submitZoneMove({
        type: 'zone_move',
        actorId: payload.viewerPlayerId,
        from: { kind: 'table', zone: zoneId },
        to: { kind: 'player', playerId: payload.viewerPlayerId, zone: handZoneId },
        cards: [cardFromCidOrCard(topCard)]
      });
      state.status = 'Drew from ' + zoneLabel(zoneId) + '.';
      renderCurrent();
    }

    function wireInteractions(host) {
      const handButtons = host.querySelectorAll('[data-hand-key]');
      for (const button of handButtons) {
        button.addEventListener('click', function () {
          const key = this.getAttribute('data-hand-key') || '';
          state.selectedCardKey = state.selectedCardKey === key ? '' : key;
          renderCurrent();
        });
      }
      const targetButtons = host.querySelectorAll('[data-target-zone]');
      for (const button of targetButtons) {
        button.addEventListener('click', function () {
          const zoneId = this.getAttribute('data-target-zone') || '';
          if (!zoneId || state.busy) return;
          onTargetPlay(zoneId).catch(function (error) {
            state.busy = false;
            state.status = error instanceof Error ? error.message : 'Move failed.';
            renderCurrent();
          });
        });
      }
      const drawButtons = host.querySelectorAll('[data-draw-zone]');
      for (const button of drawButtons) {
        button.addEventListener('click', function () {
          const zoneId = this.getAttribute('data-draw-zone') || '';
          if (!zoneId || state.busy) return;
          onDrawTop(zoneId).catch(function (error) {
            state.busy = false;
            state.status = error instanceof Error ? error.message : 'Draw failed.';
            renderCurrent();
          });
        });
      }
    }

    function render(payload) {
      const host = document.getElementById('just-cards-mcp-app-play-table');
      if (!host || !payload) return;
      const zones = Array.isArray(payload.surface?.tableZones) ? payload.surface.tableZones : [];
      const seats = Array.isArray(payload.surface?.seats) ? payload.surface.seats : [];
      host.innerHTML = [
        '<h1>' + (payload.rulesetName || 'Play Table') + '</h1>',
        '<div class="meta">',
          '<div><strong>Phase:</strong> ' + (payload.surface?.phase || 'play') + '</div>',
          '<div><strong>Round:</strong> ' + String(payload.surface?.roundNumber ?? 1) + '</div>',
          '<div><strong>Viewer:</strong> ' + (payload.viewerPlayerId || 'You') + '</div>',
          '<div><strong>Players:</strong> ' + seats.length + '</div>',
        '</div>',
        '<h2>Your Hand</h2>',
        handCardsMarkup(payload),
        quickTargetsMarkup(payload),
        drawActionsMarkup(payload),
        '<div class="status">' + (state.status || 'Tap card + target to play, or draw from table zones.') + '</div>',
        '<h2>Seats</h2>',
        seats.length === 0 ? '<div class="empty">No seats</div>' : seats.map((seat) => '<div class="seat"><strong>' + seat.playerId + '</strong><div class="muted">' + seat.handCount + ' cards' + (seat.isCurrentTurn ? ' · turn' : '') + (seat.isDealer ? ' · dealer' : '') + '</div></div>').join(''),
        '<h2>Table Zones</h2>',
        zones.length === 0 ? '<div class="empty">No zones</div>' : zones.map((zone) => '<div class="zone"><strong>' + (zone.label || zone.zoneId) + '</strong><div class="muted">' + (zone.zoneId || '') + '</div>' + cardsMarkup(zone.cards) + '</div>').join('')
      ].join('');
      wireInteractions(host);
    }

    function renderCurrent() {
      if (state.payload) {
        render(state.payload);
      }
    }

    state.payload = extractPayload();
    renderCurrent();
    if (state.payload && state.pollId === null) {
      state.pollId = setInterval(function () {
        refreshFromServer(true).catch(function () {
          return;
        });
      }, 2500);
    }
  </script>
</body>
</html>`;

const SCORE_LEADERBOARD_APP_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Just Cards Leaderboard</title>
  <style>
    :root { color-scheme: light; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
    body { margin: 0; padding: 12px; background: #f4faf9; color: #1e293b; }
    .wrap { border: 1px solid #c9d7e8; border-radius: 12px; background: #fff; padding: 12px; box-shadow: 0 8px 20px rgba(20,45,84,.08); }
    h1 { margin: 0 0 8px; font-size: 18px; }
    .muted { color: #5b6b82; font-size: 12px; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { border-top: 1px solid #dbe6f3; padding: 8px 6px; text-align: left; }
    th:last-child, td:last-child { text-align: right; }
  </style>
</head>
<body>
  <div class="wrap" id="just-cards-mcp-app-score-leaderboard">
    <h1>Leaderboard</h1>
    <div class="muted">Waiting for render_score_leaderboard payload...</div>
  </div>
  <script>
    const TOOL_RENDER_SCORE = 'render_score_leaderboard';
    const state = { payload: null, pollId: null };

    function parseMaybeJson(value) {
      if (typeof value !== 'string') return null;
      try { return JSON.parse(value); } catch { return null; }
    }
    function payloadFromContentArray(content, viewType) {
      if (!Array.isArray(content)) return null;
      for (const entry of content) {
        if (entry && entry.type === 'text') {
          const parsed = parseMaybeJson(entry.text);
          if (parsed && parsed.viewType === viewType) return parsed;
        }
      }
      return null;
    }

    function payloadFromToolResult(result, viewType) {
      if (!result) return null;
      if (result.viewType === viewType) return result;
      if (result.structuredContent && result.structuredContent.viewType === viewType) return result.structuredContent;
      const fromContent = payloadFromContentArray(result.content, viewType);
      if (fromContent) return fromContent;
      return payloadFromContentArray(result.result && result.result.content, viewType);
    }

    function extractPayload() {
      const globalAny = window;
      const candidates = [
        globalAny.__MCP_TOOL_RESULT__,
        globalAny.openai?.toolResult,
        globalAny.openai?.toolOutput,
        globalAny.mcp?.toolResult
      ];
      for (const candidate of candidates) {
        const payload = payloadFromToolResult(candidate, 'score_leaderboard/v1');
        if (payload) return payload;
      }
      return null;
    }

    async function refreshFromServer() {
      if (!state.payload || !window.openai || typeof window.openai.callTool !== 'function') return;
      const result = await window.openai.callTool(TOOL_RENDER_SCORE, {
        session_id: state.payload.sessionId
      });
      const payload = payloadFromToolResult(result, 'score_leaderboard/v1');
      if (payload) {
        state.payload = payload;
        render(payload);
      }
    }

    function render(payload) {
      const host = document.getElementById('just-cards-mcp-app-score-leaderboard');
      if (!host || !payload) return;
      const standings = Array.isArray(payload.standings) ? payload.standings : [];
      host.innerHTML = [
        '<h1>' + (payload.leaderboardLabel || 'Leaderboard') + '</h1>',
        '<div class="muted">Direction: ' + (payload.winDirection === 'low_wins' ? 'Low score wins' : 'High score wins') + '</div>',
        '<table><thead><tr><th>Rank</th><th>Player</th><th>Total</th></tr></thead><tbody>',
        standings.map((entry) => '<tr><td>' + String(entry.rank ?? '-') + '</td><td>' + (entry.playerId || '-') + '</td><td>' + String(entry.total ?? 0) + '</td></tr>').join(''),
        '</tbody></table>'
      ].join('');
    }
    state.payload = extractPayload();
    if (state.payload) {
      render(state.payload);
      if (state.pollId === null) {
        state.pollId = setInterval(function () {
          refreshFromServer().catch(function () {
            return;
          });
        }, 3000);
      }
    }
  </script>
</body>
</html>`;

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


function summarizeValidationIssues(issues: string[]): string {
	return issues.length === 0 ? 'none' : issues.join(', ');
}

function randomTraceId(): string {
	return `trace-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

function sanitizeMode(mode: unknown): McpAiMode {
	if (mode === 'coach' || mode === 'opponent' || mode === 'dealer_narrator') {
		return mode;
	}
	return 'coach';
}

function normalizeAiSeats(players: string[], aiSeats: McpStartGameArgs['ai_seats']): McpAiSeatConfig[] {
	const normalized: McpAiSeatConfig[] = [];
	for (const entry of aiSeats ?? []) {
		const playerId = typeof entry.playerId === 'string' ? entry.playerId.trim() : '';
		if (!playerId || !players.includes(playerId) || normalized.some((seat) => seat.playerId === playerId)) {
			continue;
		}
		normalized.push({
			playerId,
			mode: sanitizeMode(entry.mode)
		});
	}
	return normalized;
}

function legalSuggestionReason(mode: McpAiMode, baseReason: string): string {
	switch (mode) {
		case 'dealer_narrator':
			return `Dealer: ${baseReason}`;
		case 'opponent':
			return `Opponent: ${baseReason}`;
		case 'coach':
		default:
			return `Coach: ${baseReason}`;
	}
}

function summarizeToolArgs(name: McpToolName, args: Record<string, unknown>): string {
	if (name === 'generate_ruleset') {
		const source = isRecord(args.source) ? args.source : undefined;
		const sourceType = typeof source?.type === 'string' ? source.type : 'unknown';
		return `sourceType=${sourceType}`;
	}
	if (name === 'start_game') {
		const playerCount = Array.isArray(args.players) ? args.players.length : 0;
		const aiSeatCount = Array.isArray(args.ai_seats) ? args.ai_seats.length : 0;
		return `players=${playerCount},aiSeats=${aiSeatCount}`;
	}
	if (name === 'submit_move') {
		const event = isRecord(args.event) ? args.event : undefined;
		const eventType = typeof event?.type === 'string' ? event.type : 'unknown';
		return `eventType=${eventType}`;
	}
	if (name === 'render_game_table') {
		const gameId = typeof args.game_id === 'string' ? args.game_id.trim() : '';
		return `gameId=${gameId || 'unknown'}`;
	}
	if (name === 'render_score_leaderboard') {
		const sessionId = typeof args.session_id === 'string' ? args.session_id.trim() : '';
		return `sessionId=${sessionId || 'unknown'}`;
	}
	return 'ok';
}

function normalizeViewerPlayerId(players: string[], viewerPlayerId: unknown): string {
	const requested = typeof viewerPlayerId === 'string' ? viewerPlayerId.trim() : '';
	if (requested && players.includes(requested)) {
		return requested;
	}
	return players[0] ?? 'You';
}

function rankedStandings(
	totalsByPlayer: Record<string, number>,
	winDirection: ScoreWinDirection
): Array<{ rank: number; playerId: string; total: number }> {
	const sorted = sortStandingsByDirection(totalsByPlayer, winDirection);
	return sorted.map(([playerId, total], index) => ({
		rank: index + 1,
		playerId,
		total
	}));
}

export interface CreateJustCardsMcpServerOptions {
	scoreSessionReader?: (id: string) => Promise<ReturnType<typeof buildSessionStateView>>;
	rulesetService: RulesetService;
	gameStore?: McpGameStore;
	auditLog?: McpAuditLog;
	generationBudget?: McpGenerationBudget;
	sessionSampler?: McpSessionSampler;
	fetchImpl?: typeof fetch;
	serverAgent?: Pick<
		GenerateRulesetWithAgentOptions,
		'apiKey' | 'primaryModel' | 'fallbackModel'
	>;
}

export class JustCardsMcpServer {
	private readonly scoreSessionReader: (id: string) => Promise<ReturnType<typeof buildSessionStateView>>;
	private readonly rulesetService: RulesetService;
	private readonly gameStore: McpGameStore;
	private readonly auditLog: McpAuditLog;
	private readonly generationBudget: McpGenerationBudget;
	private readonly sessionSampler?: McpSessionSampler;
	private readonly fetchImpl?: typeof fetch;
	private readonly serverAgent: Pick<
		GenerateRulesetWithAgentOptions,
		'apiKey' | 'primaryModel' | 'fallbackModel'
	>;
	private readonly traceToolCounts = new Map<string, number>();

	constructor(options: CreateJustCardsMcpServerOptions) {
		this.scoreSessionReader = options.scoreSessionReader ?? (async id => buildSessionStateView(id));
		this.rulesetService = options.rulesetService;
		this.gameStore = options.gameStore ?? new InMemoryMcpGameStore();
		this.auditLog = options.auditLog ?? new InMemoryMcpAuditLog();
		this.generationBudget = options.generationBudget ?? {};
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
		if(uri==='just-cards://schemas/rule-extraction-v1') return {uri,mimeType:'application/json',json:extractionResource()};
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
		if (uri === 'just-cards://audit/recent') {
			return {
				uri,
				mimeType: 'application/json',
				json: {
					entries: this.auditLog.list(100)
				}
			};
		}
		if (uri === 'ui://just-cards/apps/play-table/v1') {
			return {
				uri,
				mimeType: 'text/html',
				text: PLAY_TABLE_APP_HTML
			};
		}
		if (uri === 'ui://just-cards/apps/score-leaderboard/v1') {
			return {
				uri,
				mimeType: 'text/html',
				text: SCORE_LEADERBOARD_APP_HTML
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

	async callTool(
		name: McpToolName,
		args: Record<string, unknown> = {},
		meta: McpToolCallMeta = {}
	): Promise<unknown> {
		const traceId = meta.traceId?.trim() || randomTraceId();
		const startedAt = Date.now();
		const maxToolCallsPerTrace = this.generationBudget.maxToolCallsPerTrace;
		if (typeof maxToolCallsPerTrace === 'number' && maxToolCallsPerTrace > 0) {
			const current = this.traceToolCounts.get(traceId) ?? 0;
			const next = current + 1;
			this.traceToolCounts.set(traceId, next);
			if (next > maxToolCallsPerTrace) {
				throw new Error(`tool call budget exceeded for trace ${traceId}`);
			}
		}

		logServerEvent('mcp_tool_call_start', {
			traceId,
			tool: name,
			args: summarizeToolArgs(name, args)
		});

		try {
			let result: unknown;
			switch (name) {
				case 'generate_ruleset':
					result = await this.generateRuleset(args as unknown as McpGenerateRulesetArgs);
					break;
				case 'validate_ruleset':
					result = await this.validateRuleset(args as unknown as McpValidateRulesetArgs);
					break;
				case 'list_rulesets':
					result = await this.listRulesets();
					break;
				case 'get_ruleset':
					result = await this.getRuleset(args);
					break;
				case 'start_game':
					result = await this.startGame(args as unknown as McpStartGameArgs);
					break;
				case 'get_game_state':
					result = await this.getGameState(args as unknown as McpGetGameStateArgs);
					break;
				case 'submit_move':
					result = await this.submitMove(args as unknown as McpSubmitMoveArgs);
					break;
				case 'suggest_move':
					result = await this.suggestMove(args as unknown as McpSuggestMoveArgs);
					break;
				case 'render_game_table':
					result = await this.renderGameTable(args as unknown as McpRenderGameTableArgs);
					break;
				case 'render_score_leaderboard':
					result = await this.renderScoreLeaderboard(args as unknown as McpRenderScoreLeaderboardArgs);
					break;
				default:
					throw new Error(`Unknown tool "${name}"`);
			}

			const durationMs = Date.now() - startedAt;
			this.auditLog.append({
				traceId,
				tool: name,
				status: 'ok',
				durationMs,
				details: summarizeToolArgs(name, args)
			});
			logServerEvent('mcp_tool_call_success', { traceId, tool: name, durationMs });
			return result;
		} catch (error) {
			const durationMs = Date.now() - startedAt;
			const message = error instanceof Error ? error.message : 'tool call failed';
			this.auditLog.append({
				traceId,
				tool: name,
				status: 'error',
				durationMs,
				details: message
			});
			logServerEvent('mcp_tool_call_error', { traceId, tool: name, durationMs, error: message }, 'error');
			throw error;
		}
	}

	private async generateRuleset(args: McpGenerateRulesetArgs): Promise<McpGenerateRulesetResult> {
  const requestedModelSource: McpModelSource=args.model_source ?? 'session';
  const baseInput:GenerateRulesetInput={source:args.source,name:args.name,notes:args.notes};
  this.assertGenerateSourceBudget(baseInput.source);
  const useSession=requestedModelSource==='session' && !!this.sessionSampler;
  let generated=await generateRulesetDraftWithAgent(baseInput,{
   fetchImpl:this.fetchImpl,maxSourceChars:this.generationBudget.maxSourceChars,
   ...this.serverAgent,...(useSession?{model:this.sessionSampler}:{})
  });
  let fallbackReason=requestedModelSource==='session'&&!useSession?'Session sampler is not configured; used the shared server pipeline.':undefined;
  if(useSession && generated.pipeline.strategy==='deterministic') {
   fallbackReason='session extraction failed; used the shared server pipeline.';
   generated=await generateRulesetDraftWithAgent(baseInput,{fetchImpl:this.fetchImpl,maxSourceChars:this.generationBudget.maxSourceChars,...this.serverAgent});
  }
  const ruleset=await this.rulesetService.createDraft(generated.draft);
  return {ruleset,facts:generated.facts,diagnostics:generated.diagnostics,generation:{
   requestedModelSource,usedModelSource:useSession&&!fallbackReason?'session':'server',
   deterministicFallback:generated.pipeline.strategy==='deterministic',pipeline:generated.pipeline,
   ...(fallbackReason?{fallbackReason}:{})
  }};
 }

	private assertGenerateSourceBudget(source: GenerateRulesetInput['source']): void {
		const maxSourceChars = this.generationBudget.maxSourceChars;
		if (typeof maxSourceChars !== 'number' || maxSourceChars <= 0) {
			return;
		}
		if (source.type !== 'text') {
			return;
		}
		const length = source.text.trim().length;
		if (length > maxSourceChars) {
			throw new Error(`maxSourceChars budget exceeded (${length} > ${maxSourceChars})`);
		}
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

  if (bundle.runtimeRulePack.tableRules || bundle.generationReport) {
   const behavior=evaluateTableBehavior(bundle), playable=canPlayRuleset(bundle);
   return {pass:behavior.pass && playable,checks:[...behavior.checks,{id:'play-review',pass:playable,details:playable?'Rules ready for play':'Rules need review or corrections before play'}],issues:[...behavior.checks.filter(c=>!c.pass).map(c=>`${c.id}: ${c.details}`),...(!playable?['Rules need review or corrections before play']:[])],behavior,playable,report:bundle.generationReport};
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
		const aiSeats = normalizeAiSeats(resolvedPlayers, args.ai_seats);
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
			events,
			aiSeats
		});

		return {
			gameId: snapshot.gameId,
			rulesetId: ruleset.id,
			players: resolvedPlayers,
			eventCount: events.length,
			phase: state.phase,
			currentTurnPlayer: actorIdForState(state),
			aiSeats: structuredClone(aiSeats)
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
			state,
			aiSeats: structuredClone(snapshot.aiSeats)
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

	private async renderGameTable(args: McpRenderGameTableArgs): Promise<McpRenderGameTableResult> {
		const gameId = args.game_id?.trim();
		if (!gameId) {
			throw new Error('render_game_table requires game_id');
		}
		const snapshot = await this.gameStore.getById(gameId);
		if (!snapshot) {
			throw new Error(`Game "${gameId}" not found`);
		}
		const ruleset = await this.rulesetService.getById(snapshot.rulesetId);
		if (!ruleset) {
			throw new Error(`Ruleset "${snapshot.rulesetId}" not found`);
		}

		const gameplayRulePack = ruleset.bundle.runtimeRulePack.gameplayRulePack ?? createGameplayRulePack();
		const state = deriveGameState(snapshot.events, gameplayRulePack, { strictValidation: true });
		if ((state.validationIssues?.length ?? 0) > 0) {
			throw new Error(
				`render_game_table rejected invalid state: ${summarizeValidationIssues(
					state.validationIssues?.map((issue) => issue.code) ?? []
				)}`
			);
		}

		const uiProfile = ruleset.bundle.uiProfile;
		const surfaceProfile = playSurfaceProfileFromUiProfile(uiProfile);
		const viewerPlayerId = normalizeViewerPlayerId(snapshot.players, args.viewer_player_id);
		const tableZoneOrder = visibleZones(surfaceProfile).map((zone) => zone.id);
		const labelsByZone = zoneLabelMap(surfaceProfile);
		const hintsByZone = zoneHintMap(surfaceProfile);
		const seatCards = seatCardsProfileFromUiProfile(uiProfile);
		const tableCardVisibilityByZone = Object.fromEntries(
			uiProfile.table.zones.map((zone) => [zone.id, zone.cardVisibility ?? 'public'])
		);

		const surface = buildPlaySurfaceView(state, {
			selfPlayerId: viewerPlayerId,
			handZoneName: gameplayRulePack.handZoneName,
			tableZoneOrder,
			includeDiscoveredTableZones: false,
			zoneLabels: labelsByZone,
			handCardVisibility: uiProfile.hand.cardVisibility ?? 'owner_only',
			tableCardVisibilityByZone,
			...(uiProfile.hand.layout ? { handLayout: uiProfile.hand.layout } : {}),
			...(seatCards
				? {
						seatPublicCards: {
							zoneId: seatCards.zoneId,
							label: seatCards.label,
							includeSelf: seatCards.includeSelf,
							cardVisibility: seatCards.cardVisibility ?? 'public',
							...(seatCards.layout ? { layout: seatCards.layout } : {})
						}
					}
				: {})
		});

		return {
			viewType: 'play_table/v1',
			gameId: snapshot.gameId,
			rulesetId: snapshot.rulesetId,
			rulesetName: ruleset.name,
			viewerPlayerId,
			surface: structuredClone(surface),
			zoneLabels: labelsByZone,
			zoneHints: hintsByZone,
			quickPlayTargets: quickPlayZoneIdsFromUiProfile(uiProfile),
			drawTopZones: Array.from(drawTopAllowedZoneIdsFromUiProfile(uiProfile))
		};
	}

	private async renderScoreLeaderboard(
		args: McpRenderScoreLeaderboardArgs
	): Promise<McpRenderScoreLeaderboardResult> {
		const sessionId = args.session_id?.trim();
		if (!sessionId) {
			throw new Error('render_score_leaderboard requires session_id');
		}
		const sessionView = await this.scoreSessionReader(sessionId);
		const winDirection = sessionView.config.scoreWinDirection ?? getModeWinDirection(sessionView.config.scoreModeId);
		return {
			viewType: 'score_leaderboard/v1',
			sessionId: sessionView.sessionId,
			winDirection,
			leaderboardLabel: winDirection === 'low_wins' ? 'Low score wins' : 'High score wins',
			standings: rankedStandings(sessionView.state.totalsByPlayer, winDirection),
			eventCount: sessionView.eventCount,
			updatedAt: sessionView.updatedAt
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

		const mode = sanitizeMode(args.mode);
		const actorId =
			(typeof args.actor_id === 'string' && args.actor_id.trim().length > 0
				? args.actor_id.trim()
				: actorIdForState(state)) ?? '';
		if (!actorId || !snapshot.players.includes(actorId)) {
			return {
				gameId,
				event: { type: 'advance_turn' },
				reason: legalSuggestionReason(mode, 'No active player found; advance turn as a safe fallback.'),
				mode
			};
		}

		const isLegal = (event: GameEvent): boolean => {
			const candidate = deriveGameState([...snapshot.events, event], rulePack, {
				strictValidation: true
			});
			return (candidate.validationIssues?.length ?? 0) === 0;
		};

		const legalCandidate = (
			candidates: Array<{ event: GameEvent; reason: string }>
		): { event: GameEvent; reason: string } | undefined => {
			for (const candidate of candidates) {
				if (isLegal(candidate.event)) {
					return candidate;
				}
			}
			return undefined;
		};

		const handZone = rulePack.handZoneName;
		const policy =
			rulePack.turnActionPolicy?.enabled &&
			rulePack.turnActionPolicy.allowedPhases.includes(state.phase)
				? rulePack.turnActionPolicy
				: undefined;
		const pendingDraw = state.turnActionState?.pendingDrawByPlayer?.[actorId] === true;

		if (policy && !pendingDraw) {
			const candidates: Array<{ event: GameEvent; reason: string }> = [];
			for (const zoneId of policy.drawFromZoneAllowlist) {
				const card = topCard(state.tableZones[zoneId] ?? []);
				if (!card) {
					continue;
				}
				candidates.push({
					event: {
						type: 'zone_move',
						actorId,
						from: { kind: 'table', zone: zoneId },
						to: { kind: 'player', playerId: actorId, zone: handZone },
						cards: [card]
					},
					reason: `Draw from ${zoneId} to start the turn flow.`
				});
			}
			const selected = legalCandidate(candidates);
			if (selected) {
				return {
					gameId,
					event: selected.event,
					reason: legalSuggestionReason(mode, selected.reason),
					mode,
					actorId
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
				const event: GameEvent = {
						type: 'zone_move',
						actorId,
						from: { kind: 'player', playerId: actorId, zone: handZone },
						to: { kind: 'table', zone: targetZone },
						cards: [card]
					};
				if (isLegal(event)) {
					return {
						gameId,
						event,
						reason: legalSuggestionReason(
							mode,
							`Resolve pending draw by moving a hand card to ${targetZone}.`
						),
						mode,
						actorId
					};
				}
			}
		}

		const fallbackCard = firstCardFromHand(state, actorId, handZone);
		const fallbackTarget = rulePack.zoneMovePolicy.targetZoneAllowlist.find(
			(zoneId) => zoneId !== handZone
		);
		if (fallbackCard && fallbackTarget) {
			const event: GameEvent = {
					type: 'zone_move',
					actorId,
					from: { kind: 'player', playerId: actorId, zone: handZone },
					to: { kind: 'table', zone: fallbackTarget },
					cards: [fallbackCard]
				};
			if (isLegal(event)) {
				return {
					gameId,
					event,
					reason: legalSuggestionReason(mode, `Play a fallback legal move to ${fallbackTarget}.`),
					mode,
					actorId
				};
			}
		}

		const advanceTurn: GameEvent = { type: 'advance_turn' };
		if (isLegal(advanceTurn)) {
			return {
				gameId,
				event: advanceTurn,
				reason: legalSuggestionReason(mode, 'No legal draw/resolve move found; advance turn.'),
				mode,
				actorId
			};
		}

		throw new Error('No legal move suggestion available for current state');
	}
}

export function createJustCardsMcpServer(options: CreateJustCardsMcpServerOptions): JustCardsMcpServer {
	return new JustCardsMcpServer(options);
}
