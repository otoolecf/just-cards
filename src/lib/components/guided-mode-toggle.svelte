<script lang="ts">
	import { onMount } from 'svelte';
	import { readGuidedPlay, saveGuidedPlay } from '$lib/ui/play-preferences';
	export let guided = false;
	onMount(() => {
		try { guided = readGuidedPlay(window.localStorage); }
		catch { guided = false; }
	});
	function change(event: Event) {
		guided = (event.currentTarget as HTMLInputElement).checked;
		try { saveGuidedPlay(window.localStorage, guided); }
		catch { /* Accessing localStorage itself can be blocked. */ }
	}
</script>

<label class="guided-toggle">
	<input type="checkbox" checked={guided} on:change={change} />
	<span>Guided mode <small class="jc-subtle">Extra tips while you play</small></span>
</label>

<style>
	.guided-toggle { display: flex; align-items: center; gap: 10px; min-height: 44px; padding-block: 8px; cursor: pointer; }
	small { display: block; font-size: var(--jc-type-sm); }
</style>
