<script lang="ts">
	import { playDescription } from '$lib/site/metadata';
 import OwnerGate from './owner-gate.svelte';
 import { safeSourceUrl } from '$lib/rulesets/source-url';
	import BrandWordmark from '$lib/components/brand-wordmark.svelte';
	import { onMount } from 'svelte';
	import PlayGuide from './play-guide.svelte';
	import { cardValue, createRulePack, type CardRank, type RulePack } from '$lib/scorekeeper/engine';
	import RulesetLibrary from './ruleset-library.svelte';
 import { catalogSelection, readFavorites } from '$lib/rulesets/catalog';
 import HouseRulesEditor from './house-rules-editor.svelte';
	import RulesetImport from './ruleset-import.svelte';
	import { canPlayRuleset } from '$lib/rulesets/generation-report';
	import { recentRooms, forgetRoom, type RecentRoom } from '$lib/gameplay/recent-rooms';
	import { goto } from '$app/navigation';
	import { familyRulesets } from '$lib/rulesets/family-presets';
	import type { RulesetRecord } from '$lib/rulesets/types';
	import ScoreButton from './score-button.svelte';
	export let rulesets: RulesetRecord[] = familyRulesets();
	export let selectedRulesetId = rulesets[0]?.id ?? '';
	let nextCatalogOffset: number | null = rulesets.length >= 100 ? 100 : null;
 async function moreGames() {
  if(nextCatalogOffset===null)return;
  try {
   const response=await fetch(`/api/rulesets?offset=${nextCatalogOffset}`);
   if(!response.ok)throw new Error('Could not load more games');
   const page=await response.json() as {rulesets:RulesetRecord[];nextOffset:number|null};
   rulesets=[...rulesets,...page.rulesets.filter(r=>!rulesets.some(old=>old.id===r.id))];
   nextCatalogOffset=page.nextOffset;
  } catch(e){error=e instanceof Error?e.message:'Could not load more games';}
 }
 let recent: RecentRoom[] = [];
	let savedFamily='';
 let library: RulesetLibrary;
 let favorites:string[]=[];
 $: available=catalogSelection(rulesets,favorites).filter(r=>canPlayRuleset(r.bundle));
 $: if(!available.some(r=>r.id===selectedRulesetId)) selectedRulesetId=available[0]?.id ?? '';
 function updateLibrary(record:RulesetRecord) {rulesets=[record,...rulesets.filter(r=>r.id!==record.id)];}
	onMount(() => {
		recent = recentRooms(localStorage);
  favorites=readFavorites(localStorage);
	});
	let name = '',
		code = '',
		busy = false,
		error = '';
	async function create() {
		busy = true;
		error = '';
		try {
			const token = crypto.randomUUID();
			const response = await fetch('/api/rooms', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					authorization: `Bearer ${token}`
				},
				body: JSON.stringify({ name, rulesetId: selectedRulesetId })
			});
			const result = (await response.json()) as {
				code: string;
				error?: string;
			};
			if (!response.ok) throw new Error(result.error);
			localStorage.setItem(`jc-seat-${result.code}`, token);
			await goto(`/play/room/${result.code}`);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not create room';
		} finally {
			busy = false;
		}
	}
</script>

<main class="lobby">
	<nav class="jc-mode-links" aria-label="Mode links">
		<a class="jc-mode-link" href="/">Score</a><a
			class="jc-mode-link"
			href="/play"
			aria-current="page">Play</a
		>
	</nav>
	<h1><BrandWordmark /></h1>
	<p>
		{playDescription}
	</p>
	{#if recent.length}<section aria-label="Recent tables" class="recent-tables">
			<h2>Your recent tables</h2>
			{#each recent as saved}<div class="recent-room jc-panel">
					<a class="jc-mode-link" href={`/play/room/${saved.code}`}
						>Resume {saved.name} · {saved.player} <span class="jc-subtle">{saved.code}</span></a
					>
					<ScoreButton
						onPress={() => {
							forgetRoom(localStorage, saved.code);
							recent = recentRooms(localStorage);
						}}>Hide</ScoreButton
					>
				</div>{/each}
		</section>{/if}
	<div class="choices">
		<form class="jc-panel" on:submit|preventDefault={create}>
			<h2>Start a table</h2>
			<label for="family-game">Game</label>
			<select class="jc-control" id="family-game" bind:value={selectedRulesetId}>
				{#each available as ruleset}<option
						value={ruleset.id}>{ruleset.name}</option
					>{/each}
			</select>
			<ScoreButton onPress={() => library.reveal()}>Rename or remove games</ScoreButton>
			<label for="family-name">Your name</label><input
				class="jc-control"
				id="family-name"
				bind:value={name}
				required
				maxlength="30"
				autocomplete="given-name"
			/>
			<ScoreButton
				type="submit"
				variant="primary"
				disabled={busy ||
					!name.trim() ||
					!rulesets.some((r) => r.id === selectedRulesetId && !r.archived && canPlayRuleset(r.bundle))}
				>{busy ? 'Creating…' : 'Create room'}</ScoreButton
			>
		</form>
		<form
			class="jc-panel"
			on:submit|preventDefault={() => goto(`/play/room/${code.trim().toUpperCase()}`)}
		>
			<h2>Join your family</h2>
			<p class="jc-subtle">Enter the code from your host, or open their invite link.</p>
			<label for="room-code">Room code</label><input
				class="jc-control"
				id="room-code"
				bind:value={code}
				required
				minlength="8"
				maxlength="8"
				autocapitalize="characters"
				spellcheck="false"
			/>
			<ScoreButton type="submit" disabled={code.trim().length !== 8}>Find room</ScoreButton>
		</form>
	</div>
	{#if error}<p role="alert" class="jc-status-error">{error}</p>{/if}
	<p class="jc-subtle">
		Have physical cards? <a href={`/?ruleset=${encodeURIComponent(selectedRulesetId)}`} data-sveltekit-reload>Keep score with guided entry.</a>
	</p>
	{#each rulesets.filter(r=>r.id===selectedRulesetId && canPlayRuleset(r.bundle) && (r.bundle.runtimeRulePack.tableRules?.layout || r.bundle.runtimeRulePack.tableRules?.meld || r.bundle.runtimeRulePack.tableRules?.shedding)) as original (original.id)}
		<OwnerGate><HouseRulesEditor {original} onSaved={(record)=>{rulesets=[record,...rulesets]; selectedRulesetId=record.id; savedFamily=`Saved ${record.name}. It is selected for your next room.`;}} /></OwnerGate>
	{/each}
	{#if savedFamily}<p role="status" class="jc-status-success">{savedFamily}</p>{/if}
	{#if nextCatalogOffset !== null}<ScoreButton onPress={moreGames}>Load more games</ScoreButton>{/if}
 <RulesetLibrary bind:this={library} {rulesets} {favorites} onDeleted={(id)=>rulesets=rulesets.filter(r=>r.id!==id)} onChanged={updateLibrary} onFavorites={(ids)=>favorites=ids} />
	<RulesetImport
		onImported={(record) => {
			rulesets = [record, ...rulesets.filter((r) => r.id !== record.id)];
			if (canPlayRuleset(record.bundle)) selectedRulesetId = record.id;
		}}
	/>
	{#if rulesets.some((r) => !r.archived && r.bundle.generationReport && !canPlayRuleset(r.bundle))}
		<details>
			<summary>Imported drafts to review</summary>
			{#each rulesets.filter((r) => !r.archived && r.bundle.generationReport && !canPlayRuleset(r.bundle)) as draft}<p
				>
					<a class="jc-mode-link" href={`/play/${draft.id}`}>{draft.name} — review rules</a>
				</p>{/each}
		</details>
	{/if}
	<details>
		<summary>Rules and scoring defaults</summary>
        {#each rulesets.filter(r => r.id === selectedRulesetId && canPlayRuleset(r.bundle)) as selected}
            {#if selected.bundle.runtimeRulePack.tableRules}
                <h2>{selected.name}</h2>
                <PlayGuide rules={selected.bundle.runtimeRulePack.tableRules} cardValues={Object.fromEntries(
                    (['A','2','3','4','5','6','7','8','9','10','J','Q','K'] as CardRank[]).map(rank => [rank,
                        cardValue({rank}, (selected.bundle.runtimeRulePack.scoreRulePack ?? createRulePack()) as RulePack)])
                )} />
                {#if selected.sourceUrl}<a href={safeSourceUrl(selected.sourceUrl)}>Read source rules</a>{/if}
            {/if}
        {/each}
	</details>
</main>

<style>
	.recent-room {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 8px;
		margin-top: 8px;
	}
	.recent-room a {
		border-radius: 8px;
	}
	.lobby {
		max-width: 960px;
		margin: auto;
		padding: 24px 16px 48px;
	}
	h1 {
		font-size: var(--jc-type-xl);
		line-height: 1.12;
		max-width: 650px;
	}
	h2 {
		margin: 0 0 8px;
	}
	.choices {
		display: grid;
		gap: 20px;
		margin: 28px 0;
	}
	.choices form {
		padding: 22px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	label {
		font-weight: 700;
	}
	summary {
		min-height: 44px;
		cursor: pointer;
		padding: 10px 0;
	}
	p {
		max-width: 700px;
	}
	@media (min-width: 650px) {
		.choices {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
