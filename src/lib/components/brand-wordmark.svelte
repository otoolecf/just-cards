<script lang="ts">
	import cardIcon from '$lib/assets/favicon.svg';
</script>

<span class="jc-wordmark">
	<img class="jc-wordmark-cards" src={cardIcon} alt="" aria-hidden="true" width="64" height="64" />
	<span class="wordmark-text">Just <span class="wordmark-cards">Cards</span></span>
</span>

<style>
	.jc-wordmark {
		display: inline-flex;
		align-items: center;
		gap: 0.3em;
		color: var(--jc-text);
		font-weight: 800;
		letter-spacing: -0.035em;
		line-height: 1.25;
		white-space: nowrap;
	}
	.wordmark-cards {
		font-family: Georgia, 'Times New Roman', serif;
		font-style: italic;
		font-weight: 700;
		color: var(--jc-brand-strong);
	}
	.jc-wordmark-cards {
		display: block;
		width: 1.35em;
		height: 1.35em;
		flex: none;
	}
</style>
