<script lang="ts">
	import FamilyLobby from '$lib/components/family-lobby.svelte';
	import type { PageData } from './$types';
	export let data: PageData;
</script>
<svelte:head><title>Just Cards · Play</title></svelte:head>
<FamilyLobby rulesets={data.rulesets} />
