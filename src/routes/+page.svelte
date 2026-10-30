<script lang="ts">
	import SiteMetadata from '$lib/components/site-metadata.svelte';
	import { scoreTitle, scoreDescription } from '$lib/site/metadata';
	import BrandWordmark from '$lib/components/brand-wordmark.svelte';
	import { rosterStandings } from '$lib/session/roster-standings';
 import OwnerGate from '$lib/components/owner-gate.svelte';
	import { onDestroy, onMount } from 'svelte';
	import type { PageData } from './$types';
	import { Select, Tabs } from 'bits-ui';
	import {
		PATTERN_PRESETS,
		buildAddDeltaEvent,
		buildAddRoundEvent,
		buildGuidedRoundDeltaEntries,
		buildPatternRoundEvent,
		deriveGuidedScoreProfileFromBundle,
		getPatternPreset,
		parseCardsFromText,
		parseNamedRoundText,
		parsePatternScoringText,

		type GuidedScoreProfile,
		type GuidedScoreZoneProfile,
		type PatternModePreset,
		type ScoreInputMode,
		type ScoreWinDirection
	} from '$lib/session/score-session-commands';
	import ScoreInput from '$lib/components/score-input.svelte';
	import ScoreButton from '$lib/components/score-button.svelte';
	import RulesetLibrary from '$lib/components/ruleset-library.svelte';
 import { catalogSelection, readFavorites, reconcileCatalog } from '$lib/rulesets/catalog';
 import HouseRulesEditor from '$lib/components/house-rules-editor.svelte';
 import MahjongScoreInput from '$lib/components/mahjong-score-input.svelte';
 import CapabilityScoreInput from '$lib/components/capability-score-input.svelte';
	import { canPlayRuleset } from '$lib/rulesets/generation-report';
	import CardTapInput from '$lib/components/card-tap-input.svelte';
	import { createRulePack, type CardInput, type ScoreEvent } from '$lib/scorekeeper/engine';
	import { createStarterRulesetDraft } from '$lib/rulesets/picker';
	import type { RulesetRecord } from '$lib/rulesets/types';
	import {
		createSession,
		savedDeviceSessions,
		forkOfflineSession,
		getSessionState,
		postSessionEvent,
		type SessionStateView
	} from '$lib/session/score-session-api';

	export let data: PageData;

	type FeedbackKind = 'idle' | 'error' | 'loading' | 'success';
	type AddRoundMode = 'guided' | 'rows' | 'text' | 'delta';
	type SelectOption = {
		value: string;
		label: string;
	};

	const POLL_INTERVAL_MS = 3000;
	const scoringModeItems: SelectOption[] = [
		{ value: 'guided', label: 'Guided (ruleset)' },
		{ value: 'raw', label: 'Raw (calculator)' }
	];
	const winDirectionItems: SelectOption[] = [
		{ value: 'high_wins', label: 'High score wins' },
		{ value: 'low_wins', label: 'Low score wins' }
	];
	const patternPackItems = PATTERN_PRESETS.map((pack): SelectOption => ({ value: pack.id, label: pack.name }));

	type Feedback = {
		kind: FeedbackKind;
		message: string;
	};

	let offlineReady=false;
	let deviceSessions: SessionStateView[] = [];
	let activeSessionId = '';
	function refreshDeviceSessions() { try { deviceSessions=savedDeviceSessions(); } catch(e) { setFeedback('error',e instanceof Error?e.message:'Unable to read saved sessions'); } }
	async function keepOfflineCopy() {
		if(isPosting) return; isPosting=true;
		try { const copy=await forkOfflineSession(activeSessionId); activeSessionId=copy.sessionId; localStorage.setItem('jc-score-session',activeSessionId); sessionState=copy; refreshDeviceSessions(); }
		catch(e) {setFeedback('error',e instanceof Error?e.message:'Unable to save copy');}
		finally {isPosting=false;}
	}
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
 let scoringPresetId='';
 $: if(!activeSessionId && selectedScoreInputMode==='guided' && selectedRulesetRecord && scoringPresetId!==selectedRulesetRecord.id){scoringPresetId=selectedRulesetRecord.id;const r=selectedRulesetRecord.bundle.runtimeRulePack.tableRules;if(r?.patience)setupPlayerCount=1;else if(r?.contract||r?.tileMahjong)setupPlayerCount=4;else if(setupPlayerCount<2)setupPlayerCount=2;syncSetupPlayers();}
	let selectedScoreInputMode: ScoreInputMode = 'guided';
	let selectedRawWinDirection: ScoreWinDirection = 'high_wins';
	let selectedRulesetId = '';
	let selectedRulesetRecord: RulesetRecord | undefined;
	let setupGuidedProfile: GuidedScoreProfile | null = null;
	let activeGuidedProfile: GuidedScoreProfile | null = null;
	let guidedEntryZones: GuidedScoreZoneProfile[] = [];

	let selectedPatternPackId = PATTERN_PRESETS[0]?.id ?? '';
	let modePatternPack: PatternModePreset | undefined = PATTERN_PRESETS[0];
	let addRoundMode: AddRoundMode = 'delta';
	let quickRoundText = '';
	let playerCardsById: Record<string, string> = {};
	let manualDeltaById: Record<string, string> = {};
	let guidedCardsByPlayerZone: Record<string, Record<string, string>> = {};

	let patternCardsText = '';
	let patternTargetId = '';
	let patternScoringText = PATTERN_PRESETS[0]?.defaultPatternScoring ?? '';
	let patternTargetItems: SelectOption[] = [];

	let rulesets: RulesetRecord[] = data.rulesets ?? [];
	let library: RulesetLibrary;
 let favorites:string[]=[];
 let rulesetItems: SelectOption[] = [];
 function updateLibrary(record:RulesetRecord) {
 rulesets=[record,...rulesets.filter(r=>r.id!==record.id)];
 if(record.archived && selectedRulesetId===record.id) selectedRulesetId=catalogSelection(rulesets,favorites)[0]?.id ?? '';
 try {localStorage.setItem('jc-score-rulesets-v1',JSON.stringify(rulesets));}catch {setFeedback('error','Library updated online; this device could not cache it.');}
 }
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
			if (!normalized || seen.has(normalized)) {
				continue;
			}
			seen.add(normalized);
			result.push(normalized);
		}
		return result;
	}

	function formatWinDirection(winDirection: ScoreWinDirection): string {
		return winDirection === 'low_wins' ? 'Low score wins' : 'High score wins';
	}

	function getSelectLabel(options: SelectOption[], value: string): string {
		return options.find((option) => option.value === value)?.label ?? value;
	}

	function playerFieldId(prefix: string, player: string): string {
		return `${prefix}-${player.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
	}

	function syncSetupPlayers(): void {
		const target = Math.max(1, setupPlayerCount);
		setupPlayerCount = target;
		if (setupPlayers.length < target) {
			const next = [...setupPlayers];
			for (let index = setupPlayers.length; index < target; index += 1) {
				next.push(`Player ${index + 1}`);
			}
			setupPlayers = next;
		}
		if (setupPlayers.length > target) {
			setupPlayers = setupPlayers.slice(0, target);
		}
	}

	function getActivePlayers(roster = sessionRoster, state = sessionState, setup = setupPlayers, sessionId = activeSessionId): string[] {
		const preferredRoster = sessionId ? roster : setup;
		if (!state) {
			return dedupePlayers(preferredRoster.length > 0 ? preferredRoster : setup);
		}
		return dedupePlayers([
			...dedupePlayers(preferredRoster.length > 0 ? preferredRoster : setup),
			...Object.keys(state.state.totalsByPlayer)
		]);
	}

	function activeScoreInputMode(): ScoreInputMode {
		const mode = sessionState?.config?.scoreInputMode;
		return mode === 'guided' || mode === 'raw' ? mode : selectedScoreInputMode;
	}

	function activeWinDirection(): ScoreWinDirection {
		if (sessionState?.config?.scoreWinDirection) {
			return sessionState.config.scoreWinDirection;
		}
		if (activeScoreInputMode() === 'guided' && activeGuidedProfile) {
			return activeGuidedProfile.winDirection;
		}
		return selectedRawWinDirection;
	}

	function activeRulesetName(): string {
		const rulesetId = sessionState?.config?.scoreRulesetId;
		if (!rulesetId) {
			return selectedRulesetRecord?.name ?? '';
		}
		return rulesets.find((ruleset) => ruleset.id === rulesetId)?.name ?? rulesetId;
	}

	function activeModeSummary(): string {
		const mode = activeScoreInputMode();
		if (mode === 'guided') {
			const name = activeRulesetName();
			return name ? `Guided (${name})` : 'Guided (ruleset)';
		}
		return 'Raw (calculator)';
	}

	function resolveActiveGuidedProfile(state = sessionState, mode = selectedScoreInputMode, record = selectedRulesetRecord): GuidedScoreProfile | null {
		const persisted = state?.config?.scoreGuidedProfile;
		if (persisted) {
			return persisted;
		}
		if (mode !== 'guided' || !record) {
			return null;
		}
		try {
			return deriveGuidedScoreProfileFromBundle(record.bundle, record.id);
		} catch {
			return null;
		}
	}

	function scoreEntryZones(profile: GuidedScoreProfile | null): GuidedScoreZoneProfile[] {
		return (profile?.zones ?? []).filter((zone) => zone.role !== 'exclude');
	}

	function allowedAddRoundModes(mode: ScoreInputMode, guidedOnly: boolean): AddRoundMode[] {
		if (guidedOnly) return ['guided'];
		return mode === 'guided' ? ['delta', 'guided'] : ['delta', 'rows', 'text'];
	}

	function syncGuidedInputsForRoster(players: string[], zones: GuidedScoreZoneProfile[]): void {
		const next: Record<string, Record<string, string>> = {};
		for (const player of players) {
			const byZone = guidedCardsByPlayerZone[player] ?? {};
			const zoneValues: Record<string, string> = {};
			for (const zone of zones) {
				zoneValues[zone.zoneId] = byZone[zone.zoneId] ?? '';
			}
			next[player] = zoneValues;
		}
		if (JSON.stringify(next) !== JSON.stringify(guidedCardsByPlayerZone)) {
			guidedCardsByPlayerZone = next;
		}
	}

	function syncPlayerInputsForRoster(players: string[]): void {
		function syncMapByPlayers(existing: Record<string, string>): Record<string, string> {
			const next: Record<string, string> = {};
			for (const player of players) {
				next[player] = existing[player] ?? '';
			}
			return next;
		}

		playerCardsById = syncMapByPlayers(playerCardsById);
		manualDeltaById = syncMapByPlayers(manualDeltaById);
		syncGuidedInputsForRoster(players, guidedEntryZones);
	}

	$: activePlayers = getActivePlayers(sessionRoster, sessionState, setupPlayers, activeSessionId);
	$: if (data.rulesets) {
		rulesets = data.rulesets;
	}
	$: rulesetItems = catalogSelection(rulesets,favorites).map((ruleset) => ({ value: ruleset.id, label: ruleset.name }));
	$: if (rulesets.length > 0 && !selectedRulesetId) {
		selectedRulesetId = catalogSelection(rulesets,favorites)[0]?.id ?? '';
	}
	$: selectedRulesetRecord = rulesets.find((ruleset) => ruleset.id === selectedRulesetId);
 $: summaryInputMode=sessionState?.config.scoreInputMode??selectedScoreInputMode;
 $: summaryName=rulesets.find(r=>r.id===(sessionState?.config.scoreRulesetId??selectedRulesetId))?.name??sessionState?.config.scoreRulesetId??'';
 $: summaryWin=sessionState?.config.scoreWinDirection??(summaryInputMode==='guided'?activeGuidedProfile?.winDirection:selectedRawWinDirection)??'high_wins';
 $: summaryMode=summaryInputMode==='guided'?`Guided (${summaryName})`:'Raw (calculator)';
	$: {
		try {
			setupGuidedProfile = selectedRulesetRecord
				? deriveGuidedScoreProfileFromBundle(selectedRulesetRecord.bundle, selectedRulesetRecord.id)
				: null;
		} catch {
			setupGuidedProfile = null;
		}
	}
	$: activeGuidedProfile = resolveActiveGuidedProfile(sessionState, selectedScoreInputMode, selectedRulesetRecord);
	$: guidedEntryZones = scoreEntryZones(activeGuidedProfile);
	$: rawScoring = (sessionState?.config.scoreInputMode ?? selectedScoreInputMode) === 'raw';
	$: showPatternRound = rawScoring || activeGuidedProfile?.patternRound === true;
	$: {
		const mode = sessionState?.config.scoreInputMode ?? selectedScoreInputMode;
		const guidedOnly = mode === 'guided' && ['contract', 'mahjong'].includes(activeGuidedProfile?.roundScoring ?? '');
		const allowed = allowedAddRoundModes(mode, guidedOnly);
		if (!allowed.includes(addRoundMode)) {
			addRoundMode = allowed[0];
		}
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
	$: syncGuidedInputsForRoster(activePlayers, guidedEntryZones);

	$: if (activeSessionId) {
		clearIntervalIfNeeded();
		startPolling();
	}

	$: displayedEvents = sessionState ? [...sessionState.events].slice(-5).reverse() : [];
	$: standings = rosterStandings(
		activePlayers,
		sessionState?.state.totalsByPlayer ?? {},
		sessionState?.config.scoreWinDirection ?? activeGuidedProfile?.winDirection ?? selectedRawWinDirection
	);

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
			const requestedId=activeSessionId;
			const state = await getSessionState(requestedId);
			if (requestedId !== activeSessionId) return;
			sessionState = state;
			if (state.config.players?.length) sessionRoster = state.config.players;
			if (state.config.scoreInputMode) {
				selectedScoreInputMode = state.config.scoreInputMode;
			}
			if (state.config.scoreWinDirection) {
				selectedRawWinDirection = state.config.scoreWinDirection;
			}
			if (state.config.scoreRulesetId) {
				selectedRulesetId = state.config.scoreRulesetId;
			}
			if (state.config.scoreGuidedProfile?.rulesetId) {
				selectedRulesetId = state.config.scoreGuidedProfile.rulesetId;
			}
			if (sessionRoster.length === 0) {
				const knownPlayers = dedupePlayers(Object.keys(state.state.totalsByPlayer));
				if (knownPlayers.length > 0) {
					sessionRoster = knownPlayers;
				}
			}
			lastSynced = new Date().toLocaleTimeString();
			syncPlayerInputsForRoster(getActivePlayers());
			if (activeSessionId && patternTargetId === '' && activePlayers.length > 0) {
				patternTargetId = activePlayers[0];
			}
			if (!sessionState.state.validationIssues || sessionState.state.validationIssues.length === 0) {
				setFeedback('success', state.sync?.status === 'synced' ? 'Session synced.' : 'Scores saved on this device.');
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
		addRoundMode = 'delta';
		if (isPosting || isBusy) {
			return;
		}
		const names = dedupePlayers(setupPlayers);
		if (names.length < 1 || (selectedScoreInputMode==='guided' && ['contract','mahjong'].includes(setupGuidedProfile?.roundScoring??'') && names.length!==4) || (selectedScoreInputMode==='guided' && setupGuidedProfile?.roundScoring==='solo_outcome' && names.length!==1)) {
			setFeedback('error', 'Enter one player for Solitaire, exactly four for Bridge or Mahjong, and at least one for other score sheets.');
			return;
		}

		const scoreInputMode = selectedScoreInputMode;
		let scoreRulePack: unknown = createRulePack();
		let scoreWinDirection: ScoreWinDirection = selectedRawWinDirection;
		let scoreRulesetId: string | undefined;
		let scoreGuidedProfile: GuidedScoreProfile | undefined;
		let summaryLabel = scoreInputMode === 'guided' ? 'guided' : 'raw';

		if (scoreInputMode === 'guided') {
			if (!selectedRulesetRecord || !setupGuidedProfile) {
				setFeedback('error', 'Select a valid ruleset for Guided mode.');
				return;
			}
			scoreRulePack = setupGuidedProfile.scoreRulePack;
			scoreWinDirection = setupGuidedProfile.winDirection;
			scoreRulesetId = selectedRulesetRecord.id;
			scoreGuidedProfile = setupGuidedProfile;
			summaryLabel = `${selectedRulesetRecord.name} (guided)`;
		}

		isPosting = true;
		setFeedback('loading', `Creating ${summaryLabel} session...`);
		try {
			const created = await createSession({
				players: names,
				scoreRulePack,
				scoreInputMode,
				scoreWinDirection,
				...(scoreRulesetId ? { scoreRulesetId } : {}),
				...(scoreGuidedProfile ? { scoreGuidedProfile } : {}),
				trace: false
			});
			activeSessionId = created.sessionId;
			localStorage.setItem('jc-score-session', activeSessionId);
 const url=new URL(location.href);url.searchParams.delete('ruleset');history.replaceState(history.state,'',url.pathname+url.search+url.hash);
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
		localStorage.setItem('jc-score-session', activeSessionId);
		isPosting = true;
		setFeedback('loading', 'Loading session...');
		try {
			await loadSession(true);
			const knownPlayers = dedupePlayers(Object.keys(sessionState?.state.totalsByPlayer ?? {}));
			sessionRoster = sessionState?.config.players?.length ? sessionState.config.players : knownPlayers.length > 0 ? knownPlayers : dedupePlayers(setupPlayers);
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
		syncPlayerInputsForRoster(activePlayers);
		const cleared: Record<string, string> = {};
		for (const player of activePlayers) {
			cleared[player] = '';
		}
		playerCardsById = cleared;
		manualDeltaById = cleared;
		const clearedGuided: Record<string, Record<string, string>> = {};
		for (const player of activePlayers) {
			const byZone = guidedCardsByPlayerZone[player] ?? {};
			clearedGuided[player] = {};
			for (const zoneId of Object.keys(byZone)) {
				clearedGuided[player][zoneId] = '';
			}
		}
		guidedCardsByPlayerZone = clearedGuided;
		quickRoundText = '';
		patternCardsText = '';
	}

 async function submitCapabilityScore(event:ScoreEvent):Promise<void> {
  if(!activeSessionId||isPosting)return;isPosting=true;
  try{sessionState=await postSessionEvent(activeSessionId,event);setFeedback('success','Result saved.');}catch(e){setFeedback('error',e instanceof Error?e.message:'Unable to save result');}finally{isPosting=false;}
 }
	async function submitAddRound(): Promise<void> {
		if (!activeSessionId || isPosting) {
			return;
		}
		isPosting = true;
		setFeedback('loading', 'Submitting round...');

		try {
			const errors: string[] = [];
			let event: ScoreEvent | null = null;
			let successMessage = 'Round added.';

			if (addRoundMode === 'guided') {
				if (!activeGuidedProfile || guidedEntryZones.length === 0) {
					setFeedback('error', 'Guided scoring is not configured for this session.');
					return;
				}
				const cardsByPlayerZone: Record<string, Record<string, CardInput[]>> = {};
				for (const player of activePlayers) {
					const byZone: Record<string, CardInput[]> = {};
					for (const zone of guidedEntryZones) {
						const rawCards = guidedCardsByPlayerZone[player]?.[zone.zoneId] ?? '';
						const parsed = parseCardsFromText(rawCards);
						if (parsed.errors.length > 0) {
							errors.push(`${player} ${zone.label}: ${parsed.errors.join(' ')}`);
							continue;
						}
						if (parsed.cards.length > 0) {
							byZone[zone.zoneId] = parsed.cards;
						}
					}
					cardsByPlayerZone[player] = byZone;
				}
				let deltas: Array<{ playerId: string; delta: number }> = [];
				if (errors.length === 0) {
					try {
						deltas = buildGuidedRoundDeltaEntries({
							players: activePlayers,
							profile: activeGuidedProfile,
							cardsByPlayerZone
						});
					} catch (error) {
						errors.push(error instanceof Error ? error.message : 'Unable to score guided round.');
					}
				}
				if (deltas.length === 0) {
					errors.push('Add at least one guided card entry.');
				}
				event = buildAddDeltaEvent(deltas);
				successMessage = 'Guided round added.';
			} else if (addRoundMode === 'rows' || addRoundMode === 'text') {
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

				if (parsedEntries.length === 0) {
					errors.push('Add at least one player score entry.');
				}
				event = buildAddRoundEvent(parsedEntries);
			} else {
				const deltaEntries = activePlayers
					.map((player) => ({ playerId: player, raw: (manualDeltaById[player] ?? '').trim() }))
					.filter((entry) => entry.raw.length > 0)
					.map((entry) => ({ playerId: entry.playerId, delta: Number(entry.raw) }));

				if (deltaEntries.some((entry) => Number.isNaN(entry.delta))) {
					errors.push('Manual points must be valid numbers.');
				}
				if (deltaEntries.length === 0) {
					errors.push('Enter at least one player delta.');
				}
				event = buildAddDeltaEvent(deltaEntries);
				successMessage = 'Manual points added.';
			}

			if (errors.length > 0) {
				setFeedback('error', errors.join(' '));
				return;
			}
			if (!event) {
				setFeedback('error', 'Unable to build round event.');
				return;
			}

			sessionState = await postSessionEvent(activeSessionId, event);
			clearInputsAfterSubmit();
			lastSynced = new Date().toLocaleTimeString();
			setFeedback('success', successMessage);
		} catch (error) {
			setFeedback('error', error instanceof Error ? error.message : 'Unable to add round.');
		} finally {
			isPosting = false;
		}
	}

	async function submitPatternRound(): Promise<void> {
		if (!activeSessionId || isPosting || !showPatternRound) {
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
			if (state.config.players?.length) sessionRoster = state.config.players;
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
		refreshDeviceSessions();
		activeSessionId = '';
		localStorage.removeItem('jc-score-session');
		joinSessionId = '';
		sessionState = null;
		sessionRoster = [];
		quickRoundText = '';
		manualDeltaById = {};
		playerCardsById = {};
		guidedCardsByPlayerZone = {};
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
		if(scoreEvent.type==='add_mahjong')return scoreEvent.result.draw?'Mahjong: drawn hand':`Mahjong: ${scoreEvent.result.winner} wins${scoreEvent.result.fan!==undefined?` (${scoreEvent.result.fan} faan)`:''}`;
		if(scoreEvent.type==='add_contract')return `Contract: ${scoreEvent.result.level} ${scoreEvent.result.strain}, ${scoreEvent.result.tricks} tricks`;
		if (scoreEvent.type === 'add_delta') {
			return `add_delta (entries: ${scoreEvent.entries.length})`;
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
				pipeline?: { strategy?: string; model?: string };
				error?: string;
			};
			if (!response.ok || !payload.ruleset) {
				throw new Error(payload.error ?? 'Unable to generate ruleset.');
			}

			rulesets = [payload.ruleset, ...rulesets.filter((ruleset) => ruleset.id !== payload.ruleset?.id)];
			const diagnosticPreview = (payload.diagnostics ?? []).slice(0, 2).join(' ');
			const pipelineLabel = payload.pipeline?.strategy
				? ` Path: ${payload.pipeline.strategy}${payload.pipeline.model ? ` (${payload.pipeline.model})` : ''}.`
				: '';
			setRulesetFeedback(
				'success',
				`Generated ruleset ${payload.ruleset.name}.${pipelineLabel}${diagnosticPreview ? ` ${diagnosticPreview}` : ''}`
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unable to generate ruleset.';
			setRulesetFeedback('error', message);
		} finally {
			isRulesetBusy = false;
		}
	}

	onMount(() => {
  favorites=readFavorites(localStorage);
		try {
			const cached=JSON.parse(localStorage.getItem('jc-score-rulesets-v1') ?? '[]') as RulesetRecord[];
			if(Array.isArray(cached)) rulesets=reconcileCatalog(rulesets,cached,navigator.onLine && !data.rulesetLoadError);
			localStorage.setItem('jc-score-rulesets-v1',JSON.stringify(rulesets));
		} catch { setFeedback('error','Unable to cache rules on this device.'); }
		const checkOfflineReady=()=>{offlineReady=!!navigator.serviceWorker?.controller?.scriptURL.endsWith('/service-worker.js');};
		if ('serviceWorker' in navigator) {
			checkOfflineReady();
			navigator.serviceWorker.addEventListener('controllerchange',checkOfflineReady);
			void navigator.serviceWorker.ready.then(checkOfflineReady);
		}
		refreshDeviceSessions();
		const reconnect=()=>{ void loadSession(); };
		window.addEventListener('online',reconnect);
		window.addEventListener('offline',reconnect);
		window.addEventListener('storage',reconnect);
		const cleanup=()=>{navigator.serviceWorker?.removeEventListener('controllerchange',checkOfflineReady);window.removeEventListener('online',reconnect);window.removeEventListener('offline',reconnect);window.removeEventListener('storage',reconnect);};
		const requested = new URL(location.href).searchParams.get('ruleset');
		if (requested && rulesets.some(r => r.id === requested && !r.archived)) {
			selectedRulesetId = requested; selectedScoreInputMode = 'guided'; return cleanup;
		}
		const saved = localStorage.getItem('jc-score-session');
		if (saved) { joinSessionId = saved; void joinSession(); }
		return cleanup;
	});

	onDestroy(() => {
		clearIntervalIfNeeded();
	});
</script>

<SiteMetadata title={scoreTitle} description={scoreDescription} />

<main class="score-page">
	<header class="top">
		<div>
			<h1><BrandWordmark /></h1>
			<p class="subtitle">{scoreDescription}</p>
			{#if offlineReady}<p class="jc-subtle">Available offline on this device</p>{/if}
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
		{#if sessionState?.sync}
			<div class="jc-panel" role="status" aria-label="Score sync status" style="padding: 12px; margin-bottom: 12px">
				{#if sessionState.sync.status === 'synced'}<strong>Saved and synced</strong>
				{:else if sessionState.sync.status === 'conflict'}<strong>Another device changed this session</strong><p>Your offline scores are safe here. Save them as a separate session to keep both versions.</p>
				{:else if sessionState.sync.status === 'error'}<strong>Sync needs attention</strong><p>{sessionState.sync.message}</p>
				{:else}<strong>Saved on this device · offline</strong>{/if}
				{#if sessionState.sync.pending}<p>{sessionState.sync.pending} score changes waiting to sync.</p>{/if}
				{#if sessionState.sync.status === 'conflict' || sessionState.sync.status === 'error'}<ScoreButton onPress={()=>void keepOfflineCopy()} disabled={isPosting}>Save my scores as a separate session</ScoreButton>{/if}
				{#if sessionState.sync.status !== 'synced'}<p class="jc-subtle">Keep this browser’s data until scores are synced. Reconnection retries automatically while this page is open.</p>{/if}
			</div>
		{/if}
		<div class="session-summary">
			<p><strong>Session:</strong> {activeSessionId || 'Not started'}</p>
			<p><strong>Scoring mode:</strong> {summaryMode}</p>
			<p><strong>Leaderboard:</strong> {formatWinDirection(summaryWin)}</p>
			{#if summaryInputMode === 'guided' && summaryName}
				<p><strong>Ruleset:</strong> {summaryName}</p>
			{/if}
			{#if sessionState}
				<p><strong>Events:</strong> {sessionState.eventCount}</p>
			{/if}
			<p><strong>Last updated:</strong> {lastSynced || 'never'}</p>
		</div>
	</section>

		<details class="panel panel-optional">
			<summary>Ruleset tools (optional)</summary>
			<div class="panel-optional-body">
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
				<OwnerGate><div class="ruleset-generator">
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
</OwnerGate>
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
			</div>
		</details>

		{#if !activeSessionId}
		<section class="panel">
			<h2>Start a score session</h2>
			<p class="jc-subtle">Once this app is available offline, you can create sessions and enter scores without a connection. They sync when you reconnect.</p>
			{#if deviceSessions.length}<details><summary>Saved on this device</summary>
				{#each deviceSessions as saved}<p><ScoreButton onPress={()=>{joinSessionId=saved.sessionId;void joinSession();}}>{saved.config.players?.join(', ') || 'Score session'} · {new Date(saved.createdAt).toLocaleDateString()} · {saved.eventCount} events{saved.sync?.pending ? ` · ${saved.sync.pending} pending` : ''}</ScoreButton></p>{/each}
			</details>{/if}
			<div class="field-group">
				<label for="score-input-mode">Scoring mode</label>
				<Select.Root
					type="single"
					items={scoringModeItems}
					bind:value={selectedScoreInputMode}
					onValueChange={(nextValue) => {
						selectedScoreInputMode = nextValue as ScoreInputMode;
					}}
				>
					<Select.Trigger id="score-input-mode" class="jc-control control select-trigger">
						<span>{getSelectLabel(scoringModeItems, selectedScoreInputMode)}</span>
						<span aria-hidden="true">▾</span>
					</Select.Trigger>
					<Select.Portal>
						<Select.Content class="select-content" sideOffset={6}>
							<Select.Viewport class="select-viewport">
								{#each scoringModeItems as mode (mode.value)}
									<Select.Item value={mode.value} class="select-item">
										{mode.label}
									</Select.Item>
								{/each}
							</Select.Viewport>
						</Select.Content>
					</Select.Portal>
				</Select.Root>
				<p class="hint">
					{selectedScoreInputMode === 'guided'
						? 'Guided mode uses a ruleset to render scoring zones and calculate deltas.'
						: 'Raw mode acts as a quick score calculator with optional card rows.'}
				</p>
			</div>

			<RulesetLibrary bind:this={library} {rulesets} {favorites} onDeleted={(id)=>{rulesets=rulesets.filter(r=>r.id!==id);if(selectedRulesetId===id) selectedRulesetId=catalogSelection(rulesets,favorites)[0]?.id ?? '';}} onChanged={updateLibrary} onFavorites={(ids)=>favorites=ids} />
			{#if selectedScoreInputMode === 'guided'}
				<div class="field-group">
					<label for="guided-ruleset">Ruleset (guided)</label>
					<Select.Root type="single" items={rulesetItems} bind:value={selectedRulesetId}>
						<Select.Trigger id="guided-ruleset" class="jc-control control select-trigger">
							<span>{getSelectLabel(rulesetItems, selectedRulesetId) || 'Select ruleset'}</span>
							<span aria-hidden="true">▾</span>
						</Select.Trigger>
						<Select.Portal>
							<Select.Content class="select-content" sideOffset={6}>
								<Select.Viewport class="select-viewport">
									{#each rulesetItems as option (option.value)}
										<Select.Item value={option.value} class="select-item">
											{option.label}
										</Select.Item>
									{/each}
								</Select.Viewport>
							</Select.Content>
						</Select.Portal>
					</Select.Root>
					<ScoreButton onPress={() => library.reveal()}>Rename or remove games</ScoreButton>
					{#each rulesets.filter(r=>r.id===selectedRulesetId && canPlayRuleset(r.bundle) && (r.bundle.runtimeRulePack.tableRules?.layout || r.bundle.runtimeRulePack.tableRules?.meld || r.bundle.runtimeRulePack.tableRules?.shedding)) as original (original.id)}
						<HouseRulesEditor {original} onSaved={(record)=>{rulesets=[record,...rulesets];selectedRulesetId=record.id;setFeedback('success',`Saved ${record.name} for your next session.`);try { localStorage.setItem('jc-score-rulesets-v1',JSON.stringify(rulesets)); } catch { setFeedback('error','Family rules saved online; device storage could not cache them.'); }}} />
					{/each}
					{#if setupGuidedProfile}
						<p class="hint">
							{#if setupGuidedProfile.roundScoring==='mahjong'}Four-player Hong Kong mahjong: enter tiles or faan. The app calculates payments and tracks the dealer and winds.
 {:else if setupGuidedProfile.roundScoring==='contract'}Rubber Bridge: enter the contract and tricks; partners are players 1 &amp; 3 and 2 &amp; 4.
 {:else if setupGuidedProfile.roundScoring}Record completed deals or the first player out. One point per win.
 {:else}Win direction: {formatWinDirection(setupGuidedProfile.winDirection)}.
							Zones: {guidedEntryZones.map((zone) => zone.label).join(', ') || 'None'}.{/if}
						</p>
					{:else}
						<p class="hint">Generate or create a ruleset first in optional ruleset tools.</p>
					{/if}
				</div>
			{:else}
				<div class="field-group">
					<label for="raw-win-direction">Leaderboard direction</label>
					<Select.Root type="single" items={winDirectionItems} bind:value={selectedRawWinDirection}>
						<Select.Trigger id="raw-win-direction" class="jc-control control select-trigger">
							<span>{getSelectLabel(winDirectionItems, selectedRawWinDirection)}</span>
							<span aria-hidden="true">▾</span>
						</Select.Trigger>
						<Select.Portal>
							<Select.Content class="select-content" sideOffset={6}>
								<Select.Viewport class="select-viewport">
									{#each winDirectionItems as option (option.value)}
										<Select.Item value={option.value} class="select-item">
											{option.label}
										</Select.Item>
									{/each}
								</Select.Viewport>
							</Select.Content>
						</Select.Portal>
					</Select.Root>
				</div>
			{/if}

			<div class="grid-two">
				<div class="field-group">
					<label for="player-count">Players</label>
					<ScoreInput
						id="player-count"
						type="number"
						min="1"
						value={`${setupPlayerCount}`}
						onValueChange={(nextValue) => {
							const value = Number.parseInt(nextValue || '2', 10);
							setupPlayerCount = Number.isNaN(value) ? 2 : Math.max(1, value);
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
			{#if standings.length > 0}
				<ul class="score-leaderboard">
					{#each standings as { player, total, rank, rankLabel } (player)}
						<li class={`score-row ${rank === 1 ? 'leader' : ''}`.trim()}>
							<div class="score-player">{player} <span class="jc-subtle score-rank">{rankLabel}</span></div>
							<div class="score-total">{total}</div>
						</li>
					{/each}
				</ul>
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
						{#if activeScoreInputMode() === 'guided'}
							<Tabs.Trigger
								value="guided"
								class={`mode-trigger ${addRoundMode === 'guided' ? 'active' : ''}`.trim()}
							>
								{activeGuidedProfile?.roundScoring?'Guided result':'Guided cards'}
							</Tabs.Trigger>
						{/if}
						{#if activeScoreInputMode() === 'raw'}
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
						{/if}
						{#if !['contract','mahjong'].includes(activeGuidedProfile?.roundScoring??'')}<Tabs.Trigger
							value="delta"
							class={`mode-trigger ${addRoundMode === 'delta' ? 'active' : ''}`.trim()}
						>
							Manual points
						</Tabs.Trigger>{/if}
					</Tabs.List>

					<Tabs.Content value="guided">
						{#if activeGuidedProfile?.roundScoring==='mahjong'&&activeGuidedProfile.tileMahjong}<MahjongScoreInput players={activePlayers} policy={activeGuidedProfile.tileMahjong} progress={sessionState?.state.mahjong} busy={isPosting} onSubmit={submitCapabilityScore}/>{:else if activeGuidedProfile?.roundScoring&&activeGuidedProfile.roundScoring!=='mahjong'}<CapabilityScoreInput kind={activeGuidedProfile.roundScoring} players={activePlayers} rubber={sessionState?.state.rubber} busy={isPosting} onSubmit={submitCapabilityScore}/>{:else if guidedEntryZones.length === 0}
							<p class="hint">No guided scoring zones configured for this ruleset.</p>
						{:else}
							<p class="hint">Tap cards by zone. Guided mode applies ruleset card values and zone roles.</p>
							{#each activePlayers as player}
								<div class="field-group assist-group">
									<p class="input-label">{player}</p>
									{#each guidedEntryZones as zone (zone.zoneId)}
										<div class="field-group">
											<p class="input-label">{zone.label}</p>
											{#if zone.hint}
												<p class="hint">{zone.hint}</p>
											{/if}
											<CardTapInput
												suitsRequired={false}
												layout={zone.layout}
												columnPairs={activeGuidedProfile?.specialRules.some(rule=>rule.kind==='column_pair_zero' && rule.zoneId===zone.zoneId) ?? false}
												labelPrefix={`${player}-${zone.label}`}
												value={guidedCardsByPlayerZone[player]?.[zone.zoneId] ?? ''}
												valueChanged={(value) => {
													guidedCardsByPlayerZone = {
														...guidedCardsByPlayerZone,
														[player]: {
															...(guidedCardsByPlayerZone[player] ?? {}),
															[zone.zoneId]: value
														}
													};
												}}
											/>
										</div>
									{/each}
								</div>
							{/each}
						{/if}
					</Tabs.Content>

					<Tabs.Content value="rows">
						{#each activePlayers as player}
							<div class="field-group">
								<p class="input-label">{player}</p>
								<CardTapInput
									labelPrefix={player}
									value={playerCardsById[player] ?? ''}
									valueChanged={(value) => {
										playerCardsById = {
											...playerCardsById,
											[player]: value
										};
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

					<Tabs.Content value="delta">
						<p class="hint">Enter signed point changes directly (positive or negative).</p>
						{#each activePlayers as player}
							<div class="field-group">
								<label for={playerFieldId('delta', player)}>{player}</label>
								<ScoreInput
									id={playerFieldId('delta', player)}
									type="number"
									placeholder="0"
									value={manualDeltaById[player] ?? ''}
									onValueChange={(value) => {
										manualDeltaById = {
											...manualDeltaById,
											[player]: value
										};
									}}
								/>
							</div>
						{/each}
					</Tabs.Content>
				</Tabs.Root>

				<div class="button-row">
					{#if !(addRoundMode==='guided' && activeGuidedProfile?.roundScoring)}<ScoreButton variant="primary" type="button" onPress={() => void submitAddRound()} disabled={isPosting}>
						Add round
					</ScoreButton>{/if}
					<ScoreButton type="button" onPress={() => void submitUndo()} disabled={isPosting}>Undo</ScoreButton>
					<ScoreButton type="button" onPress={() => void submitRedo()} disabled={isPosting}>Redo</ScoreButton>
				</div>
			</section>

		{#if showPatternRound}
		<details class="panel pattern-panel" open={!rawScoring}>
			<summary>{rawScoring ? 'Advanced/custom scoring' : 'Pattern scoring'}</summary>
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
		</details>
		{/if}

		<section class="panel event-panel">
			<details>
				<summary><h2>Recent events ({sessionState?.eventCount ?? 0})</h2></summary>
				<div class="event-content">
					{#if sessionState && sessionState.events.length > 0}
						<ul>
							{#each displayedEvents as event}
								<li>
									<div>{describeEventType(event)}</div>
									<div class="small">source: {event.source} @ {event.createdAt}</div>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="empty">No events yet.</p>
					{/if}
				</div>
			</details>
		</section>
	{/if}
</main>

<style>
	.event-panel summary {
		min-height: 44px;
		padding: 10px 0;
		cursor: pointer;
	}
	.event-panel summary h2 {
		display: inline;
	}
	.event-content {
		overflow-wrap: anywhere;
	}

	.score-rank { font-size: var(--jc-type-sm); font-weight: 400; margin-inline-start: 8px; }
	.pattern-panel summary {
		min-height: 44px;
		padding: 12px 0;
		cursor: pointer;
		font-weight: 700;
	}
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

	.panel-optional {
		padding: 0;
		overflow: clip;
	}

	.panel-optional > summary {
		min-height: 44px;
		padding: 12px 15px;
		display: flex;
		align-items: center;
		font-weight: 700;
		cursor: pointer;
		list-style: none;
	}

	.panel-optional > summary::-webkit-details-marker {
		display: none;
	}

	.panel-optional[open] > summary {
		background: var(--surface-2);
		border-bottom: 1px solid var(--line);
	}

	.panel-optional-body {
		padding: 12px 15px 15px;
		display: grid;
		gap: 12px;
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
	.button-row {
		display: grid;
		gap: 10px;
	}

	:global(.segmented) {
		display: grid;
		gap: 10px;
	}

	:global(.segmented [role='tablist']) {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
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
		min-height: 44px;
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
		min-height: 44px;
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
		.button-row {
			grid-template-columns: auto auto;
		}

		:global(.segmented [role='tablist']) {
			grid-template-columns: repeat(5, minmax(0, 1fr));
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

	.assist-group {
		padding: 10px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface-2);
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
