<script lang="ts">
	import FamilyLobby from '$lib/components/family-lobby.svelte';
	import type { PageData } from './$types';
	export let data: PageData;
</script>
<FamilyLobby rulesets={data.rulesets} />
