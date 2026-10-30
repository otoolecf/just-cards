<script lang="ts">
	import SiteMetadata from '$lib/components/site-metadata.svelte';
	import { page } from '$app/stores';
	import SharedTable from '$lib/components/shared-table.svelte';
</script>

<SiteMetadata title="Just Cards · Family table" description="Join a shared card table in Just Cards." noindex />
{#key $page.params.code}<SharedTable
		code={($page.params.code ?? '').toUpperCase()}
	/>{/key}
