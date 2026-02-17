<script lang="ts">
	import PlayTable from '$lib/components/play-table.svelte';
	import type { PageData } from './$types';

	export let data: PageData;
</script>

<svelte:head>
	<title>{data.ruleset.bundle.displayName} | Play Table</title>
</svelte:head>

<PlayTable rulesetBundle={data.ruleset.bundle} rulesetName={data.ruleset.name} />
