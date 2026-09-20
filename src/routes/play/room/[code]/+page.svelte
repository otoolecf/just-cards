<script lang="ts">
	import { page } from '$app/stores';
	import SharedTable from '$lib/components/shared-table.svelte';
</script>

<svelte:head
	><title>Family table · Just Cards</title><meta
		name="robots"
		content="noindex"
	/></svelte:head
>
{#key $page.params.code}<SharedTable
		code={($page.params.code ?? '').toUpperCase()}
	/>{/key}
