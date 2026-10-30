<span class="jc-wordmark">
	<span class="jc-wordmark-cards" aria-hidden="true">
		<span class="card-back"></span>
		<span class="card-front">♣</span>
	</span>
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
		position: relative;
		display: inline-block;
		width: 1.15em;
		height: 1.35em;
		flex: none;
	}
	.card-back,
	.card-front {
		position: absolute;
		width: 0.82em;
		height: 1.08em;
		border-radius: 0.13em;
		border: 1px solid var(--jc-line);
	}
	.card-back {
		left: 0.03em;
		top: 0.16em;
		background: var(--jc-brand-soft);
		transform: rotate(-14deg);
	}
	.card-front {
		left: 0.25em;
		top: 0.1em;
		display: grid;
		place-items: center;
		background: var(--jc-surface);
		color: var(--jc-brand-strong);
		transform: rotate(9deg);
		font-family: Georgia, 'Times New Roman', serif;
		font-weight: 400;
		letter-spacing: 0;
	}
</style>
