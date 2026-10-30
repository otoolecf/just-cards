<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';

	let { children } = $props();


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


<footer class="jc-site-footer">
	<details class="jc-project-about">
		<summary>About this project</summary>
		<p>Just Cards is a personal side project built to make spontaneous, in-person card games easier. Keeping score in a notes app can be cumbersome, pen and paper aren’t always handy, and sometimes you don’t even have a deck. Just Cards helps fill those gaps so you can spend more time playing while learning unfamiliar games more easily. Substantial portions of the code and documentation were developed with AI assistance. Expect rough edges; bug reports and contributions are welcome.</p>
	</details>
	<a
		class="jc-mode-link"
		href="https://github.com/otoolecf/just-cards"
		target="_blank"
		rel="noopener noreferrer"
	>Source on GitHub</a>
</footer>

<style>
	.jc-site-footer {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 1rem;
		font-size: var(--jc-type-sm);
		color: var(--jc-text-muted);
	}
	.jc-project-about {
		width: 100%;
		max-width: 40rem;
	}

	.jc-project-about summary {
		min-height: 44px;
		padding: 12px;
		text-align: center;
		cursor: pointer;
	}

	.jc-project-about p {
		margin: 0;
		padding: 0 12px 1rem;
		text-align: left;
		line-height: 1.6;
	}
</style>
