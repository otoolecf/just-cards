<script lang="ts">
	import { onMount } from 'svelte';
	let owner = false;
	onMount(() => {
		void fetch('/api/owner/session')
			.then((r) => r.json())
			.then((r) => (owner = (r as { owner: boolean }).owner))
			.catch(() => {});
	});
</script>

{#if owner}<slot />{:else}<p class="jc-subtle">
		AI rule imports are available to the owner. <a
			class="jc-mode-link"
			href="/owner">Owner sign in</a
		>
	</p>{/if}
