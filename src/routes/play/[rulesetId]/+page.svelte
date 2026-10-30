<script lang="ts">
	import PlayTable from '$lib/components/play-table.svelte';
	import RulesetReview from '$lib/components/ruleset-review.svelte';
	import { canPlayRuleset } from '$lib/rulesets/generation-report';
	import { goto } from '$app/navigation';
	import FamilyLobby from '$lib/components/family-lobby.svelte';
	import type { PageData } from './$types';

	export let data: PageData;
</script>

<svelte:head>
	<title>Just Cards · {data.ruleset.bundle.displayName}</title>
</svelte:head>

{#if data.ruleset.bundle.generationReport}
	<main class="jc-panel" style="max-width: 900px; margin: 20px auto; padding: 20px;">
		<a class="jc-mode-link" href="/play">Back to games</a>
		<h1>{data.ruleset.name}</h1>
		<RulesetReview record={data.ruleset} onReviewed={(record) => goto(`/play/${record.id}`)} />
	</main>
{/if}
{#if canPlayRuleset(data.ruleset.bundle)}
	<FamilyLobby rulesets={[data.ruleset]} selectedRulesetId={data.ruleset.id} />
{:else if !data.ruleset.bundle.generationReport}
	<p class="jc-subtle">Preview only: this ruleset does not yet describe a complete shared game.</p>
	<PlayTable rulesetBundle={data.ruleset.bundle} rulesetName={data.ruleset.name} />
{/if}
