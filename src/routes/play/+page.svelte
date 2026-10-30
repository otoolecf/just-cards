<script lang="ts">
	import SiteMetadata from '$lib/components/site-metadata.svelte';
	import { playTitle, playDescription } from '$lib/site/metadata';
	import FamilyLobby from '$lib/components/family-lobby.svelte';
	import type { PageData } from './$types';
	export let data: PageData;
</script>
<SiteMetadata title={playTitle} description={playDescription} />
<FamilyLobby rulesets={data.rulesets} />
