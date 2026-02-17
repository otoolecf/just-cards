<script lang="ts">
	import { onMount } from 'svelte';
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';

	let { children } = $props();

	onMount(() => {
		if ('serviceWorker' in navigator) {
			void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
		}
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="manifest" href="/manifest.webmanifest" />
	<meta name="theme-color" content="#111827" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-title" content="Just Cards" />
	<link rel="apple-touch-icon" href="/favicon.svg" />
</svelte:head>

{@render children()}
