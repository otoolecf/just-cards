<script lang="ts">
	import { buildPlayGuide } from '$lib/gameplay/play-guide';
	import type { TableRules } from '$lib/gameplay/table-rules';
	export let rules: TableRules;
	export let cardValues: Record<string, number> = {};
</script>

{#each buildPlayGuide(rules, cardValues) as section}
	<h3>{section.title}</h3>
	<ul>
		{#each section.steps as step}<li>{step}</li>{/each}
	</ul>
{/each}

<style>
	li + li {
		margin-top: 0.75rem;
	}
</style>
