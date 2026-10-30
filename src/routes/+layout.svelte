<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';

	let { children } = $props();


</script>

<svelte:head>
	<title>Just Cards</title>
	<link rel="icon" href={favicon} />
	<link rel="manifest" href="/manifest.webmanifest" />
	<meta name="theme-color" content="#111827" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-title" content="Just Cards" />
	<link rel="apple-touch-icon" href="/favicon.svg" />
</svelte:head>

{@render children()}


<footer class="jc-site-footer">
	<details class="jc-project-about jc-panel">
		<summary>
			<span>About this project</span>
			<span class="jc-about-toggle" aria-hidden="true">+</span>
		</summary>
		<div class="jc-about-copy">
			<p class="jc-about-lead">Just Cards is a personal side project built to make spontaneous, in-person card games easier.</p>
			<p>Keeping score in a notes app can be cumbersome, pen and paper aren’t always handy, and sometimes you don’t even have a deck. Just Cards helps fill those gaps so you can spend more time playing while learning unfamiliar games more easily.</p>
			<p class="jc-about-disclosure">Substantial portions of the code and documentation were developed with AI assistance. Expect rough edges; bug reports and contributions are welcome.</p>
		</div>
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
		gap: 8px;
		font-size: var(--jc-type-sm);
		color: var(--jc-text-muted);
	}
	.jc-project-about {
		width: 100%;
		max-width: 40rem;
	}

	.jc-project-about summary {
		min-height: 44px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 16px 20px;
		color: var(--jc-text);
		font-size: var(--jc-type-md);
		font-weight: 700;
		cursor: pointer;
		list-style: none;
	}
	.jc-project-about summary::-webkit-details-marker {
		display: none;
	}
	.jc-about-toggle {
		font-size: var(--jc-type-lg);
		font-weight: 400;
		line-height: 1;
		color: var(--jc-brand-strong);
	}
	.jc-project-about[open] .jc-about-toggle {
		transform: rotate(45deg);
	}
	.jc-about-copy {
		display: grid;
		gap: 16px;
		padding: 0 20px 20px;
		font-size: var(--jc-type-md);
		line-height: 1.65;
	}
	.jc-about-copy p {
		margin: 0;
	}
	.jc-about-lead {
		color: var(--jc-text);
		font-weight: 600;
	}
	.jc-about-disclosure {
		padding: 14px;
		border-radius: 10px;
		background: var(--jc-surface-muted);
		font-size: var(--jc-type-sm);
	}
</style>
