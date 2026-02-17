<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { PageData } from './$types';
	import { Select, Tabs } from 'bits-ui';
	import {
		PATTERN_PRESETS,
		SCORE_MODE_OPTIONS,
		buildAddRoundEvent,
		buildPatternRoundEvent,
		getPatternPreset,
		getModePreset,
		parseCardsFromText,
		parseNamedRoundText,
		parsePatternScoringText,
		type PatternModePreset
	} from '$lib/session/score-session-commands';
	import ScoreInput from '$lib/components/score-input.svelte';
	import ScoreButton from '$lib/components/score-button.svelte';
	import CardTapInput from '$lib/components/card-tap-input.svelte';
	import { type CardInput } from '$lib/scorekeeper/engine';
	import { createStarterRulesetDraft } from '$lib/rulesets/picker';
	import type { RulesetRecord } from '$lib/rulesets/types';
	import {
		createSession,
		getSessionState,
		postSessionEvent,
		type SessionStateView
	} from '$lib/session/score-session-api';

	export let data: PageData;

	type FeedbackKind = 'idle' | 'error' | 'loading' | 'success';
	type AddRoundMode = 'rows' | 'text';
	type SelectOption = {
		value: string;
		label: string;
	};

	const POLL_INTERVAL_MS = 3000;

	const gameModeItems = SCORE_MODE_OPTIONS.map((mode): SelectOption => ({ value: mode.id, label: mode.name }));
	const patternPackItems = PATTERN_PRESETS.map((pack): SelectOption => ({ value: pack.id, label: pack.name }));

	type Feedback = {
		kind: FeedbackKind;
		message: string;
	};

	let activeSessionId = '';
	let joinSessionId = '';
	let sessionState: SessionStateView | null = null;
	let lastSynced = '';
	let isPolling = false;
	let isBusy = false;
	let isPosting = false;
	let feedback: Feedback = { kind: 'idle', message: '' };

	let setupPlayers = ['Player 1', 'Player 2'];
	let sessionRoster: string[] = [];
	let setupPlayerCount = 2;
	let selectedModeId = SCORE_MODE_OPTIONS[0]?.id ?? '';
	let selectedPatternPackId = PATTERN_PRESETS[0]?.id ?? '';
	let modePatternPack: PatternModePreset | undefined = PATTERN_PRESETS[0];

	let addRoundMode: AddRoundMode = 'rows';
	let quickRoundText = '';
	let playerCardsById: Record<string, string> = {};

	let patternCardsText = '';
	let patternTargetId = '';
	let patternScoringText = PATTERN_PRESETS[0]?.defaultPatternScoring ?? '';
	let patternTargetItems: SelectOption[] = [];
	let rulesets: RulesetRecord[] = data.rulesets ?? [];
	let isRulesetBusy = false;
	let rulesetFeedback: Feedback =
		data.rulesetLoadError && data.rulesetLoadError.length > 0
			? { kind: 'error', message: data.rulesetLoadError }
			: { kind: 'idle', message: '' };
	let rulesetGenerateMode: 'url' | 'text' = 'url';
	let rulesetSourceUrl = '';
	let rulesetSourceText = '';
	let rulesetGenerateName = '';
	let rulesetGenerateNotes = '';

	let pollTimer: ReturnType<typeof setInterval> | null = null;

	function setFeedback(kind: FeedbackKind, message: string): void {
		feedback = { kind, message };
	}

	function setRulesetFeedback(kind: FeedbackKind, message: string): void {
		rulesetFeedback = { kind, message };
	}

	function dedupePlayers(values: string[]): string[] {
		const result: string[] = [];
		const seen = new Set<string>();
		for (const value of values) {
			const normalized = value.trim();
			if (!normalized) {
				continue;
			}
			if (seen.has(normalized)) {
				continue;
			}
			seen.add(normalized);
			result.push(normalized);
		}
		return result;
	}

	function getModeName(): string {
		const mode = getModePreset(selectedModeId);
		return mode?.name ?? SCORE_MODE_OPTIONS[0]?.name ?? '';
	}

	function syncSetupPlayers(): void {
		const target = Math.max(2, setupPlayerCount);
		setupPlayerCount = target;

		if (setupPlayers.length < target) {
			const next = [...setupPlayers];
			for (let index = setupPlayers.length; index < target; index++) {
				next.push(`Player ${index + 1}`);
			}
			setupPlayers = next;
		}
		if (setupPlayers.length > target) {
			setupPlayers = setupPlayers.slice(0, target);
		}
	}

	function syncPlayerInputsForRoster(players: string[]): void {
		const next: Record<string, string> = {};
		for (const player of players) {
			next[player] = playerCardsById[player] ?? '';
		}
		playerCardsById = next;
	}

	function getSelectLabel(options: SelectOption[], value: string): string {
		return options.find((option) => option.value === value)?.label ?? value;
	}

	function getActivePlayers(): string[] {
		const preferredRoster = activeSessionId ? sessionRoster : setupPlayers;
		if (!sessionState) {
			return dedupePlayers(preferredRoster.length > 0 ? preferredRoster : setupPlayers);
		}
		const active = dedupePlayers([
			...dedupePlayers(preferredRoster.length > 0 ? preferredRoster : setupPlayers),
			...Object.keys(sessionState.state.totalsByPlayer)
		]);
		return active;
	}

	$: activePlayers = getActivePlayers();
	$: if (data.rulesets) {
		rulesets = data.rulesets;
	}
	$: {
		modePatternPack = getPatternPreset(selectedPatternPackId) ?? PATTERN_PRESETS[0];
	}
	$: patternTargetItems = activePlayers.map((player) => ({ value: player, label: player }));
	$: if (!selectedPatternPackId && PATTERN_PRESETS[0]) {
		selectedPatternPackId = PATTERN_PRESETS[0].id;
		patternScoringText = PATTERN_PRESETS[0].defaultPatternScoring;
	}
	$: if (sessionState && sessionState.state.totalsByPlayer && !patternTargetId && activePlayers.length > 0) {
		patternTargetId = activePlayers[0];
	}

	$: if (activeSessionId) {
		clearIntervalIfNeeded();
		startPolling();
	}

	const recentEvents = (): SessionStateView['events'] => {
		if (!sessionState) {
			return [];
		}
		return [...sessionState.events].slice(-5).reverse();
	};

	const sortedStandings = (): Array<[string, number]> => {
		if (!sessionState) {
			return [];
		}
		return Object.entries(sessionState.state.totalsByPlayer).sort((left, right) => {
			if (right[1] !== left[1]) {
				return right[1] - left[1];
			}
			return left[0].localeCompare(right[0]);
		});
	};

	function clearIntervalIfNeeded(): void {
		if (pollTimer) {
			clearInterval(pollTimer);
			pollTimer = null;
		}
		isPolling = false;
	}

	async function loadSession(force = false): Promise<void> {
		if (!activeSessionId || isBusy) {
			return;
		}
		if (!force) {
			isBusy = true;
		}
		try {
			const state = await getSessionState(activeSessionId);
			sessionState = state;
			const persistedModeId = state.config?.scoreModeId;
			if (persistedModeId && getModePreset(persistedModeId)) {
				selectedModeId = persistedModeId;
			}
			if (sessionRoster.length === 0) {
				const knownPlayers = dedupePlayers(Object.keys(state.state.totalsByPlayer));
				if (knownPlayers.length > 0) {
					sessionRoster = knownPlayers;
				}
			}
			lastSynced = new Date().toLocaleTimeString();
			const roster = getActivePlayers();
			syncPlayerInputsForRoster(roster);
			if (activeSessionId && patternTargetId === '' && activePlayers.length > 0) {
				patternTargetId = activePlayers[0];
			}
			if (!sessionState.state.validationIssues || sessionState.state.validationIssues.length === 0) {
				setFeedback('success', 'Session synced.');
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unable to sync session.';
			setFeedback('error', message);
		} finally {
			if (!force) {
				isBusy = false;
			}
		}
	}

	function startPolling(): void {
		if (pollTimer || isPolling) {
			return;
		}
		isPolling = true;
		pollTimer = setInterval(() => {
			void loadSession();
		}, POLL_INTERVAL_MS);
	}

	async function createSessionAndStart(): Promise<void> {
		if (isPosting || isBusy) {
			return;
		}
		const modePreset = getModePreset(selectedModeId);
		const config = modePreset?.createRulePack() ?? null;
		if (!config) {
			setFeedback('error', 'No game mode selected.');
			return;
		}
		const names = dedupePlayers(setupPlayers);
		if (names.length < 2) {
			setFeedback('error', 'At least two players are required.');
			return;
		}

		isPosting = true;
		setFeedback('loading', `Creating ${getModeName()} session...`);
		try {
			const created = await createSession({ scoreModeId: selectedModeId, scoreRulePack: config, trace: false });
			activeSessionId = created.sessionId;
			joinSessionId = created.sessionId;
			sessionState = null;
			sessionRoster = names;
			setupPlayers = names;
			syncSetupPlayers();
			syncPlayerInputsForRoster(names);
			await loadSession(true);
			setFeedback('success', `Session ${created.sessionId} created.`);
			startPolling();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unable to create session.';
			setFeedback('error', message);
		} finally {
			isPosting = false;
		}
	}

	async function joinSession(): Promise<void> {
		if (isPosting || isBusy) {
			return;
		}
		const sessionId = joinSessionId.trim();
		if (!sessionId) {
			setFeedback('error', 'Session id is required.');
			return;
		}

		activeSessionId = sessionId;
		isPosting = true;
		setFeedback('loading', 'Loading session...');
		try {
			await loadSession(true);
			const knownPlayers = dedupePlayers(Object.keys(sessionState?.state.totalsByPlayer ?? {}));
			sessionRoster = knownPlayers.length > 0 ? knownPlayers : dedupePlayers(setupPlayers);
			setupPlayers = [...sessionRoster];
			if (setupPlayers.length === 0) {
				setupPlayers = ['Player 1', 'Player 2'];
				sessionRoster = [...setupPlayers];
			}
			syncPlayerInputsForRoster(getActivePlayers());
			setFeedback('success', `Joined session ${sessionId}.`);
			startPolling();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unable to load session.';
			setFeedback('error', message);
		} finally {
			isPosting = false;
		}
	}

	function clearInputsAfterSubmit(): void {
		if (addRoundMode === 'rows') {
			const cleared: Record<string, string> = {};
			for (const player of activePlayers) {
				cleared[player] = '';
			}
			playerCardsById = cleared;
		} else {
			quickRoundText = '';
		}
		patternCardsText = '';
	}

	function submitAddRound(): void {
		if (!activeSessionId || isPosting) {
			return;
		}
		isPosting = true;
		setFeedback('loading', 'Submitting round...');

		const errors: string[] = [];
		let parsedEntries: { playerId: string; cards: CardInput[] }[] = [];

		if (addRoundMode === 'rows') {
			for (const player of activePlayers) {
				const rawCards = playerCardsById[player] ?? '';
				const parsed = parseCardsFromText(rawCards);
				if (parsed.errors.length > 0) {
					errors.push(`${player}: ${parsed.errors.join(' ')}`);
					continue;
				}
				if (parsed.cards.length > 0) {
					parsedEntries.push({ playerId: player, cards: parsed.cards });
				}
			}
		} else {
			const named = parseNamedRoundText(quickRoundText);
			if (named.errors.length > 0) {
				errors.push(...named.errors);
			}
			parsedEntries = named.entries;
		}

		if (errors.length > 0) {
			setFeedback('error', errors.join(' '));
			isPosting = false;
			return;
		}
		if (parsedEntries.length === 0) {
			setFeedback('error', 'Add at least one player score entry.');
			isPosting = false;
			return;
		}

			postSessionEvent(activeSessionId, buildAddRoundEvent(parsedEntries))
				.then((state) => {
					sessionState = state;
					clearInputsAfterSubmit();
					lastSynced = new Date().toLocaleTimeString();
					setFeedback('success', 'Round added.');
			})
			.catch((error) => {
				setFeedback('error', error instanceof Error ? error.message : 'Unable to add round.');
			})
			.finally(() => {
				isPosting = false;
			});
	}

	async function submitPatternRound(): Promise<void> {
		if (!activeSessionId || isPosting) {
			return;
		}
		if (!patternTargetId || !patternTargetId.trim()) {
			setFeedback('error', 'Pattern target is required.');
			return;
		}
		const preset = getPatternPreset(selectedPatternPackId);
		if (!preset) {
			setFeedback('error', 'Select a pattern pack.');
			return;
		}
		const parsedCards = parseCardsFromText(patternCardsText);
		if (parsedCards.errors.length > 0) {
			setFeedback('error', parsedCards.errors.join(' '));
			return;
		}
		if (parsedCards.cards.length === 0) {
			setFeedback('error', 'Pattern entries require at least one card.');
			return;
		}
		const scoring = parsePatternScoringText(patternScoringText);
		if (scoring.errors.length > 0) {
			setFeedback('error', scoring.errors.join(' '));
			return;
		}

		isPosting = true;
		setFeedback('loading', 'Submitting pattern round...');
		try {
			const state = await postSessionEvent(
				activeSessionId,
				buildPatternRoundEvent({
					targetId: patternTargetId,
					cards: parsedCards.cards,
					patternPack: preset.patternPack,
					patternScoring: scoring.scoring
				})
			);
			sessionState = state;
			patternCardsText = '';
			lastSynced = new Date().toLocaleTimeString();
			setFeedback('success', 'Pattern round submitted.');
		} catch (error) {
			setFeedback('error', error instanceof Error ? error.message : 'Unable to submit pattern round.');
		} finally {
			isPosting = false;
		}
	}

	async function submitUndo(): Promise<void> {
		if (!activeSessionId || isPosting) {
			return;
		}
		isPosting = true;
		setFeedback('loading', 'Undoing...');
		try {
			sessionState = await postSessionEvent(activeSessionId, { type: 'undo' });
			lastSynced = new Date().toLocaleTimeString();
			setFeedback('success', 'Undo applied.');
		} catch (error) {
			setFeedback('error', error instanceof Error ? error.message : 'Unable to undo.');
		} finally {
			isPosting = false;
		}
	}

	async function submitRedo(): Promise<void> {
		if (!activeSessionId || isPosting) {
			return;
		}
		isPosting = true;
		setFeedback('loading', 'Redoing...');
		try {
			sessionState = await postSessionEvent(activeSessionId, { type: 'redo' });
			lastSynced = new Date().toLocaleTimeString();
			setFeedback('success', 'Redo applied.');
		} catch (error) {
			setFeedback('error', error instanceof Error ? error.message : 'Unable to redo.');
		} finally {
			isPosting = false;
		}
	}

	function updatePlayerName(index: number, value: string): void {
		const next = [...setupPlayers];
		next[index] = value;
		setupPlayers = next;
	}

	function changePatternPack(nextPatternPackId: string): void {
		const nextPreset = getPatternPreset(nextPatternPackId);
		if (!nextPreset) {
			return;
		}
		selectedPatternPackId = nextPreset.id;
		patternScoringText = nextPreset.defaultPatternScoring;
	}

	function resetSession(): void {
		activeSessionId = '';
		joinSessionId = '';
		sessionState = null;
		sessionRoster = [];
		quickRoundText = '';
		patternCardsText = '';
		lastSynced = '';
		clearIntervalIfNeeded();
		setFeedback('idle', '');
	}

	function describeEventType(event: SessionStateView['events'][number]): string {
		const scoreEvent = event.scoreEvent;
		if (scoreEvent.type === 'add_round') {
			if ('playerCards' in scoreEvent && scoreEvent.playerCards) {
				return `add_round (players: ${Object.keys(scoreEvent.playerCards).length})`;
			}
			if ('entries' in scoreEvent) {
				return `add_round (entries: ${scoreEvent.entries.length})`;
			}
			return 'add_round';
		}
		if (scoreEvent.type === 'add_pattern_round') {
			return `add_pattern_round (player targets: ${scoreEvent.entries.length})`;
		}
		if (scoreEvent.type === 'undo') {
			return 'undo';
		}
		if (scoreEvent.type === 'redo') {
			return 'redo';
		}
		return scoreEvent.type;
	}

	function rulesetPlayHref(rulesetId: string): string {
		return `/play/${encodeURIComponent(rulesetId)}`;
	}

	async function refreshRulesets(): Promise<void> {
		if (isRulesetBusy) {
			return;
		}
		isRulesetBusy = true;
		setRulesetFeedback('loading', 'Refreshing rulesets...');
		try {
			const response = await fetch('/api/rulesets', { method: 'GET' });
			const payload = (await response.json()) as { rulesets?: RulesetRecord[]; error?: string };
			if (!response.ok) {
				throw new Error(payload.error ?? 'Unable to load rulesets');
			}
			rulesets = payload.rulesets ?? [];
			setRulesetFeedback('success', `Loaded ${rulesets.length} ruleset${rulesets.length === 1 ? '' : 's'}.`);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unable to load rulesets.';
			setRulesetFeedback('error', message);
		} finally {
			isRulesetBusy = false;
		}
	}

	async function createStarterRuleset(): Promise<void> {
		if (isRulesetBusy) {
			return;
		}
		isRulesetBusy = true;
		setRulesetFeedback('loading', 'Creating starter ruleset...');
		try {
			const draft = createStarterRulesetDraft();
			const response = await fetch('/api/rulesets', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(draft)
			});
			const payload = (await response.json()) as RulesetRecord | { error?: string };
			if (!response.ok) {
				const message = 'error' in payload ? payload.error ?? 'Unable to create starter ruleset' : 'Unable to create starter ruleset';
				throw new Error(message);
			}
			const created = payload as RulesetRecord;
			rulesets = [created, ...rulesets.filter((ruleset) => ruleset.id !== created.id)];
			setRulesetFeedback('success', `Created ruleset ${created.name}.`);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unable to create starter ruleset.';
			setRulesetFeedback('error', message);
		} finally {
			isRulesetBusy = false;
		}
	}

	async function generateRulesetFromInput(): Promise<void> {
		if (isRulesetBusy) {
			return;
		}

		const source =
			rulesetGenerateMode === 'url'
				? {
						type: 'url' as const,
						url: rulesetSourceUrl.trim()
					}
				: {
						type: 'text' as const,
						text: rulesetSourceText.trim()
					};

		if (source.type === 'url' && source.url.length === 0) {
			setRulesetFeedback('error', 'Rules URL is required.');
			return;
		}
		if (source.type === 'text' && source.text.length === 0) {
			setRulesetFeedback('error', 'Rules text is required.');
			return;
		}

		isRulesetBusy = true;
		setRulesetFeedback('loading', 'Generating ruleset from source...');
		try {
			const response = await fetch('/api/rulesets/generate', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					source,
					...(rulesetGenerateName.trim() ? { name: rulesetGenerateName.trim() } : {}),
					...(rulesetGenerateNotes.trim() ? { notes: rulesetGenerateNotes.trim() } : {})
				})
			});
			const payload = (await response.json()) as {
				ruleset?: RulesetRecord;
				diagnostics?: string[];
				error?: string;
			};
			if (!response.ok || !payload.ruleset) {
				throw new Error(payload.error ?? 'Unable to generate ruleset.');
			}

			rulesets = [payload.ruleset, ...rulesets.filter((ruleset) => ruleset.id !== payload.ruleset?.id)];
			const diagnosticPreview = (payload.diagnostics ?? []).slice(0, 2).join(' ');
			setRulesetFeedback(
				'success',
				`Generated ruleset ${payload.ruleset.name}.${diagnosticPreview ? ` ${diagnosticPreview}` : ''}`
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unable to generate ruleset.';
			setRulesetFeedback('error', message);
		} finally {
			isRulesetBusy = false;
		}
	}

	onDestroy(() => {
		clearIntervalIfNeeded();
	});
</script>

<svelte:head>
	<title>Scorekeeper</title>
</svelte:head>

<main class="score-page">
	<header class="top">
		<div>
			<h1>Scorekeeper</h1>
			<p class="subtitle">Fast one-device scoring for live card games.</p>
		</div>
		<nav class="jc-mode-links" aria-label="Mode links">
			<a href="/" class="jc-mode-link" aria-current="page">Score</a>
			<a href="/play" class="jc-mode-link">Play</a>
		</nav>
	</header>

	<section class="panel">
		<div class="status">
			{#if feedback.kind === 'loading'}
				<p class="status-loading">{feedback.message}</p>
			{:else if feedback.kind === 'error'}
				<p class="status-error">{feedback.message}</p>
			{:else if feedback.kind === 'success'}
				<p class="status-success">{feedback.message}</p>
			{/if}
		</div>
		<div class="session-summary">
			<p><strong>Session:</strong> {activeSessionId || 'Not started'}</p>
			<p><strong>Game mode:</strong> {getModeName()}</p>
			{#if sessionState}
				<p><strong>Events:</strong> {sessionState.eventCount}</p>
			{/if}
			<p><strong>Last synced:</strong> {lastSynced || 'never'}</p>
		</div>
	</section>

	<section class="panel">
		<h2>Rulesets</h2>
		<p class="hint">Generate from URL/prose, create starter drafts, and open in Play mode.</p>
		<div class="status">
			{#if rulesetFeedback.kind === 'loading'}
				<p class="status-loading">{rulesetFeedback.message}</p>
			{:else if rulesetFeedback.kind === 'error'}
				<p class="status-error">{rulesetFeedback.message}</p>
			{:else if rulesetFeedback.kind === 'success'}
				<p class="status-success">{rulesetFeedback.message}</p>
			{/if}
		</div>
		<div class="ruleset-generator">
			<div class="ruleset-source-toggle" role="tablist" aria-label="Rules source type">
				<button
					type="button"
					class={`ruleset-source-button ${rulesetGenerateMode === 'url' ? 'active' : ''}`.trim()}
					aria-pressed={rulesetGenerateMode === 'url'}
					onclick={() => (rulesetGenerateMode = 'url')}
				>
					URL
				</button>
				<button
					type="button"
					class={`ruleset-source-button ${rulesetGenerateMode === 'text' ? 'active' : ''}`.trim()}
					aria-pressed={rulesetGenerateMode === 'text'}
					onclick={() => (rulesetGenerateMode = 'text')}
				>
					Prose
				</button>
			</div>
			<div class="field-group">
				<label for="ruleset-name">Ruleset name (optional)</label>
				<ScoreInput
					id="ruleset-name"
					type="text"
					placeholder="Generated ruleset name"
					value={rulesetGenerateName}
					onValueChange={(value) => (rulesetGenerateName = value)}
				/>
			</div>
			{#if rulesetGenerateMode === 'url'}
				<div class="field-group">
					<label for="ruleset-source-url">Rules URL</label>
					<ScoreInput
						id="ruleset-source-url"
						type="text"
						placeholder="https://example.com/how-to-play/..."
						value={rulesetSourceUrl}
						onValueChange={(value) => (rulesetSourceUrl = value)}
					/>
				</div>
			{:else}
				<div class="field-group">
					<label for="ruleset-source-text">Rules text</label>
					<ScoreInput
						as="textarea"
						id="ruleset-source-text"
						rows={5}
						placeholder="We play with 3 players. Everyone draws from stock or discard..."
						value={rulesetSourceText}
						onValueChange={(value) => (rulesetSourceText = value)}
					/>
				</div>
			{/if}
			<div class="field-group">
				<label for="ruleset-source-notes">Notes (optional)</label>
				<ScoreInput
					as="textarea"
					id="ruleset-source-notes"
					rows={2}
					placeholder="Any constraints or intended variant details"
					value={rulesetGenerateNotes}
					onValueChange={(value) => (rulesetGenerateNotes = value)}
				/>
			</div>
			<ScoreButton variant="primary" type="button" onPress={() => void generateRulesetFromInput()} disabled={isRulesetBusy}>
				Generate ruleset from input
			</ScoreButton>
		</div>
		<div class="button-row">
			<ScoreButton variant="primary" type="button" onPress={() => void createStarterRuleset()} disabled={isRulesetBusy}>
				Create starter ruleset
			</ScoreButton>
			<ScoreButton type="button" onPress={() => void refreshRulesets()} disabled={isRulesetBusy}>
				Refresh rulesets
			</ScoreButton>
		</div>
		{#if rulesets.length > 0}
			<ul class="ruleset-list">
				{#each rulesets as ruleset (ruleset.id)}
					<li class="ruleset-item">
						<div>
							<p class="ruleset-title">{ruleset.name}</p>
							<p class="small">id: {ruleset.id}</p>
							<p class="small">game: {ruleset.bundle.displayName}</p>
						</div>
						<a class="ruleset-open-link" href={rulesetPlayHref(ruleset.id)}>Open in Play</a>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="empty">No rulesets yet.</p>
		{/if}
	</section>

		{#if !activeSessionId}
		<section class="panel">
			<h2>Start a score session</h2>
			<div class="field-group">
				<label for="game-mode">Game mode</label>
				<Select.Root
					type="single"
					items={gameModeItems}
					bind:value={selectedModeId}
					onValueChange={(nextValue) => (selectedModeId = nextValue)}
				>
					<Select.Trigger id="game-mode" class="jc-control control select-trigger">
						<span>{getSelectLabel(gameModeItems, selectedModeId)}</span>
						<span aria-hidden="true">▾</span>
					</Select.Trigger>
					<Select.Portal>
						<Select.Content class="select-content" sideOffset={6}>
							<Select.Viewport class="select-viewport">
								{#each gameModeItems as mode (mode.value)}
									<Select.Item value={mode.value} class="select-item">
										{mode.label}
									</Select.Item>
								{/each}
							</Select.Viewport>
						</Select.Content>
					</Select.Portal>
				</Select.Root>
				<p class="hint">{getModeName()}</p>
			</div>

			<div class="grid-two">
				<div class="field-group">
					<label for="player-count">Players</label>
					<ScoreInput
						id="player-count"
						type="number"
						min="2"
						value={`${setupPlayerCount}`}
						onValueChange={(nextValue) => {
							const value = Number.parseInt(nextValue || '2', 10);
							setupPlayerCount = Number.isNaN(value) ? 2 : Math.max(2, value);
							syncSetupPlayers();
						}}
					/>
				</div>
				<div class="field-group">
					<label for="player-name-0">Players names</label>
					{#each setupPlayers as name, index}
						<ScoreInput
							id={`player-name-${index}`}
							type="text"
							placeholder={`Player ${index + 1}`}
							value={name}
							onValueChange={(value) => updatePlayerName(index, value)}
						/>
					{/each}
				</div>
			</div>
			<ScoreButton variant="primary" type="button" onPress={() => void createSessionAndStart()} disabled={isPosting}>
				Create session
			</ScoreButton>
		</section>

		<section class="panel">
			<h2>Join existing session</h2>
			<label for="join-session-id">Session ID</label>
			<div class="join-row">
				<ScoreInput
					id="join-session-id"
					type="text"
					placeholder="sess-abc12345"
					value={joinSessionId}
					onValueChange={(value) => (joinSessionId = value)}
				/>
			<ScoreButton type="button" onPress={() => void joinSession()} disabled={isPosting}>
				Join
			</ScoreButton>
			</div>
		</section>
	{:else}
		<div class="actions">
			<ScoreButton onPress={() => void loadSession()} disabled={isBusy || isPosting}>Refresh</ScoreButton>
			<ScoreButton onPress={() => void resetSession()} disabled={isPosting}>Close session</ScoreButton>
		</div>

		<section class="panel score-spotlight">
			<h2>Current score</h2>
			{#if sortedStandings().length > 0}
				<ol class="score-leaderboard">
					{#each sortedStandings() as [player, total], index}
						<li class={`score-row ${index === 0 ? 'leader' : ''}`.trim()}>
							<div class="score-player">{player}</div>
							<div class="score-total">{total}</div>
						</li>
					{/each}
				</ol>
			{:else}
				<p class="empty">No totals yet. Add a round to start.</p>
			{/if}
		</section>

		<section class="panel">
			<h2>Validation</h2>
			{#if sessionState?.state.validationIssues && sessionState.state.validationIssues.length > 0}
				<ul>
					{#each sessionState.state.validationIssues as issue}
						<li class="error">{issue.code}: {issue.message}</li>
					{/each}
				</ul>
			{:else}
				<p class="empty">No validation issues.</p>
			{/if}
		</section>

		<section class="panel">
			<h2>Add round</h2>
			<Tabs.Root bind:value={addRoundMode} class="segmented">
				<Tabs.List>
					<Tabs.Trigger
						value="rows"
						class={`mode-trigger ${addRoundMode === 'rows' ? 'active' : ''}`.trim()}
					>
						Player card rows
					</Tabs.Trigger>
					<Tabs.Trigger
						value="text"
						class={`mode-trigger ${addRoundMode === 'text' ? 'active' : ''}`.trim()}
					>
						Quick text
					</Tabs.Trigger>
				</Tabs.List>
					<Tabs.Content value="rows">
						{#each activePlayers as player}
							<div class="field-group">
								<p class="input-label">{player}</p>
								<CardTapInput
									labelPrefix={player}
									value={playerCardsById[player] ?? ''}
									valueChanged={(value) => {
										const next = {
											...playerCardsById,
											[player]: value
										};
										playerCardsById = next;
									}}
								/>
							</div>
						{/each}
					</Tabs.Content>
					<Tabs.Content value="text">
						<label for="quick-round">Quick round text</label>
						<ScoreInput
							as="textarea"
							id="quick-round"
							rows={4}
							placeholder="Alice: A H 10S
Bob: 2D 3D 4D"
							value={quickRoundText}
							onValueChange={(value) => (quickRoundText = value)}
						/>
					</Tabs.Content>
				</Tabs.Root>

				<div class="button-row">
				<ScoreButton variant="primary" type="button" onPress={() => void submitAddRound()} disabled={isPosting}>
					Add round
				</ScoreButton>
				<ScoreButton type="button" onPress={() => void submitUndo()} disabled={isPosting}>Undo</ScoreButton>
				<ScoreButton type="button" onPress={() => void submitRedo()} disabled={isPosting}>Redo</ScoreButton>
			</div>
		</section>

		<section class="panel">
			<h2>Pattern round (optional)</h2>
			<div class="field-group">
				<label for="pattern-player">Target player</label>
				<Select.Root type="single" items={patternTargetItems} bind:value={patternTargetId}>
					<Select.Trigger id="pattern-player" class="jc-control control select-trigger">
						<span>{getSelectLabel(patternTargetItems, patternTargetId) || 'Select player'}</span>
						<span aria-hidden="true">▾</span>
					</Select.Trigger>
					<Select.Portal>
						<Select.Content class="select-content" sideOffset={6}>
							<Select.Viewport class="select-viewport">
								{#each patternTargetItems as player (player.value)}
									<Select.Item value={player.value} class="select-item">
										{player.label}
									</Select.Item>
								{/each}
							</Select.Viewport>
						</Select.Content>
					</Select.Portal>
				</Select.Root>
			</div>
			<div class="field-group">
				<label for="pattern-pack">Pattern pack</label>
				<Select.Root
					type="single"
					items={patternPackItems}
					bind:value={selectedPatternPackId}
					onValueChange={changePatternPack}
				>
					<Select.Trigger id="pattern-pack" class="jc-control control select-trigger">
						<span>{getSelectLabel(patternPackItems, selectedPatternPackId)}</span>
						<span aria-hidden="true">▾</span>
					</Select.Trigger>
					<Select.Portal>
						<Select.Content class="select-content" sideOffset={6}>
							<Select.Viewport class="select-viewport">
								{#each patternPackItems as pack (pack.value)}
									<Select.Item value={pack.value} class="select-item">
										{pack.label}
									</Select.Item>
								{/each}
							</Select.Viewport>
						</Select.Content>
					</Select.Portal>
				</Select.Root>
				<p class="hint">{modePatternPack?.description}</p>
			</div>
			<div class="field-group">
				<p class="input-label">Cards</p>
				<CardTapInput
					labelPrefix="pattern"
					value={patternCardsText}
					valueChanged={(value) => (patternCardsText = value)}
				/>
			</div>
			<div class="field-group">
				<label for="pattern-scoring">Pattern scoring (patternId: points)</label>
				<ScoreInput
					as="textarea"
					id="pattern-scoring"
					rows={3}
					placeholder="pair: 10
run: 5"
					value={patternScoringText}
					onValueChange={(value) => (patternScoringText = value)}
				/>
			</div>
			<div class="button-row">
				<ScoreButton type="button" onPress={() => void submitPatternRound()} disabled={isPosting}>
					Add pattern round
				</ScoreButton>
			</div>
		</section>

		<section class="panel">
			<h2>Recent events ({sessionState?.eventCount ?? 0})</h2>
			{#if sessionState && sessionState.events.length > 0}
				<ul>
					{#each recentEvents() as event}
						<li>
							<div>{describeEventType(event)}</div>
							<div class="small">source: {event.source} @ {event.createdAt}</div>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="empty">No events yet.</p>
			{/if}
		</section>
	{/if}
</main>

<style>
	.score-page {
		max-width: 760px;
		margin: 0 auto;
		padding: 20px 16px 28px;
		display: grid;
		gap: 12px;
	}

	.top h1 {
		margin: 0;
		font-size: clamp(2rem, 6vw, 2.5rem);
		letter-spacing: -0.02em;
		line-height: 0.96;
	}

	.top {
		display: grid;
		gap: 10px;
	}

	.subtitle {
		margin: 6px 0 0;
		color: var(--muted);
		font-size: var(--jc-type-lg);
		line-height: 1.2;
	}

	.panel {
		border: 1px solid var(--line);
		padding: 15px;
		border-radius: 16px;
		display: grid;
		gap: 12px;
		background: var(--surface);
		box-shadow: var(--shadow-sm);
	}

	h2 {
		margin: 0;
		font-size: 1.03rem;
		letter-spacing: -0.01em;
	}

	.status-loading {
		color: var(--muted);
		font-size: 0.9rem;
	}

	.status-error {
		color: var(--error);
		font-weight: 600;
	}

	.status-success {
		color: var(--success);
		font-weight: 600;
	}

	.session-summary {
		display: grid;
		gap: 5px;
		font-size: var(--jc-type-sm);
	}

	.field-group {
		display: grid;
		gap: 4px;
	}

	.field-group label {
		font-size: var(--jc-type-sm);
		font-weight: 600;
	}

	.input-label {
		margin: 0;
		font-size: var(--jc-type-sm);
		font-weight: 600;
	}

	.hint {
		color: var(--muted);
		font-size: var(--jc-type-xs);
		margin: 0;
	}

	:global(.control-textarea) {
		resize: vertical;
	}

	.actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}

	.score-spotlight {
		background:
			linear-gradient(160deg, color-mix(in srgb, var(--brand-soft) 58%, #ffffff) 0%, #ffffff 72%),
			var(--surface);
	}

	.score-leaderboard {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 8px;
	}

	.score-row {
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: baseline;
		gap: 8px;
		padding: 11px 12px;
		border-radius: 12px;
		border: 1px solid var(--line);
		background: var(--surface);
	}

	.score-row.leader {
		border-color: color-mix(in srgb, var(--brand) 40%, var(--line));
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--brand) 18%, transparent);
	}

	.score-player {
		font-weight: 700;
		font-size: 1rem;
	}

	.score-total {
		font-weight: 800;
		font-size: 1.5rem;
		line-height: 1;
		letter-spacing: -0.02em;
	}

	.join-row,
	.button-row,
	:global(.segmented) {
		display: grid;
		gap: 10px;
	}

	.ruleset-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 8px;
	}

	.ruleset-generator {
		display: grid;
		gap: 10px;
		padding: 10px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface-2);
	}

	.ruleset-source-toggle {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}

	.ruleset-source-button {
		min-height: 40px;
		padding: 8px 12px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--surface);
		color: var(--foreground);
		font-weight: 600;
	}

	.ruleset-source-button.active {
		background: var(--brand-soft);
		border-color: var(--brand);
	}

	.ruleset-item {
		display: grid;
		gap: 8px;
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
	}

	.ruleset-title {
		margin: 0;
		font-size: var(--jc-type-md);
		font-weight: 700;
	}

	.ruleset-open-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 40px;
		padding: 8px 12px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--surface-2);
		color: var(--foreground);
		text-decoration: none;
		font-weight: 600;
		transition: background-color var(--jc-motion-fast) var(--jc-ease-standard), border-color var(--jc-motion-fast) var(--jc-ease-standard);
	}

	.ruleset-open-link:hover,
	.ruleset-open-link:focus-visible {
		background: var(--brand-soft);
		border-color: var(--brand);
	}

	@media (min-width: 700px) {
		.top {
			grid-template-columns: 1fr auto;
			align-items: end;
		}

		.join-row,
		.button-row,
		:global(.segmented) {
			grid-template-columns: auto auto;
		}

		.ruleset-item {
			grid-template-columns: 1fr auto;
			align-items: center;
		}
	}

	:global(.segmented .mode-trigger) {
		width: 100%;
		padding: 10px 14px;
		border-radius: 12px;
		border: 1px solid var(--line);
		background: var(--surface-2);
		color: var(--foreground);
		min-height: 44px;
		transition: background-color var(--jc-motion-fast) var(--jc-ease-standard), border-color var(--jc-motion-fast) var(--jc-ease-standard);
	}

	:global(.segmented .mode-trigger.active) {
		background: var(--brand-soft);
		border-color: var(--brand);
		color: #0f172a;
		font-weight: 700;
	}

	:global(.select-trigger) {
		display: inline-flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
	}

	:global(.select-content) {
		min-width: 240px;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 12px;
		box-shadow: var(--shadow-md);
		overflow: hidden;
		font-size: var(--jc-type-sm);
		z-index: 50;
	}

	:global(.select-viewport) {
		max-height: 240px;
		padding: 6px;
	}

	:global(.select-item) {
		padding: 10px 12px;
		border-radius: 10px;
		cursor: pointer;
		line-height: 1.2;
		transition: background-color var(--jc-motion-fast) var(--jc-ease-standard);
	}

	:global(.select-item[data-highlighted]),
	:global(.select-item[data-selected]) {
		background: var(--brand-soft);
	}

	.grid-two {
		display: grid;
		gap: 10px;
	}

	@media (min-width: 700px) {
		.grid-two {
			grid-template-columns: 1fr 1fr;
		}
	}

	.empty {
		color: var(--muted);
		font-size: var(--jc-type-sm);
	}

	.small {
		font-size: var(--jc-type-xs);
		color: var(--muted);
	}

	.error {
		color: var(--error);
	}
</style>
